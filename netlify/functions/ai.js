/* netlify/functions/ai.js — the ONLY place the Anthropic API key exists.
 *
 * Why this file has to exist: the dashboard is a public static site, so any key
 * shipped in js/ would be readable by every visitor (and auto-revoked by leak
 * scanners). The browser calls this function; this function calls Anthropic.
 * Supersedes ADR-0011's "test a direct browser call" framing — a direct call is
 * not viable regardless of CORS.
 *
 * Guards, in order:
 *   1. POST only
 *   2. Shared PIN (x-warmode-pin === WARMODE_AI_PIN) — stops strangers who find
 *      the URL from spending the user's credits
 *   3. Daily call cap — a soft cost fuse (see note below)
 *   4. Task whitelist — the request body is a task NAME + payload; the prompt and
 *      schema are built here, server-side. The endpoint can never be used as a
 *      general-purpose Anthropic relay.
 *
 * Accuracy contract (docs/decisions.md): every task returns STRUCTURED JSON via
 * output_config.format, and the model is instructed never to do arithmetic on
 * user quantities. All macro math stays in js/food/foodMath.js.
 *
 * Env vars (set in the Netlify UI, both marked "secret"):
 *   ANTHROPIC_API_KEY   — required
 *   WARMODE_AI_PIN      — required
 *   WARMODE_AI_DAILY_CAP— optional, defaults to 60
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';
const DAILY_CAP = parseInt(process.env.WARMODE_AI_DAILY_CAP || '60', 10);

/* Daily cap counter.
 * NOTE — this is a BEST-EFFORT fuse. Netlify may run several warm instances, so
 * the true ceiling is (cap x instances). The hard money guard is the monthly
 * spend limit set in the Anthropic console; this just stops a runaway loop. */
let _capDay = '';
let _capCount = 0;

/* `lookup` costs TWO upstream calls (research + structure), so it must consume
 * two units of the budget — otherwise the advertised cap understates spend. */
const TASK_COST = { lookup: 2 };

function bumpCap(task) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _capDay) { _capDay = today; _capCount = 0; }
  _capCount += (TASK_COST[task] || 1);
  return _capCount;
}

/* ---------- shared prompt language ---------- */

const HOUSE_RULES = [
  'You support a single vegetarian user in Bengaluru who tracks calories and protein precisely.',
  'NEVER propose meat, fish, or egg. If the input clearly shows a non-vegetarian food, say so in warnings and set confidence low rather than inventing a vegetarian substitute.',
  'You NEVER do arithmetic on the user\'s quantities. You report values as they are printed or as standard reference values per 100g/100ml. Application code does every multiplication and sum.',
  'Prefer admitting uncertainty over guessing. A low confidence score with an honest warning is far more useful than a confident wrong number.',
  'Indian foods: use the user\'s vocabulary (roti, katori, sabzi, dal, paneer, chaas).'
].join(' ');

/* ---------- JSON schemas (structured outputs) ----------
 * Structured outputs require additionalProperties:false and every property
 * listed in `required`. Optional values are expressed as nullable types. */

const MACROS_SCHEMA = {
  type: 'object',
  properties: {
    kcal:    { type: 'number' },
    protein: { type: 'number' },
    carbs:   { type: 'number' },
    fat:     { type: 'number' },
    fiber:   { type: ['number', 'null'] }
  },
  required: ['kcal', 'protein', 'carbs', 'fat', 'fiber'],
  additionalProperties: false
};

const SERVINGS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { label: { type: 'string' }, amount: { type: 'number' } },
    required: ['label', 'amount'],
    additionalProperties: false
  }
};

const SCHEMAS = {
  ping: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
    required: ['ok', 'message'],
    additionalProperties: false
  },

  /* Label scan — the model reports ONLY what is printed on the panel.
   * per-serving -> per-100 conversion happens in JS (aiLabel.js). */
  label: {
    type: 'object',
    properties: {
      found:   { type: 'boolean' },
      name:    { type: 'string' },
      brand:   { type: 'string' },
      basis:   { type: 'string', enum: ['g', 'ml'] },
      printedPer:      { type: 'string', enum: ['100g', '100ml', 'serving'] },
      printedServingSize:  { type: ['number', 'null'] },
      printedServingLabel: { type: ['string', 'null'] },
      printed: MACROS_SCHEMA,
      servings: SERVINGS_SCHEMA,
      isVegetarian: { type: 'boolean' },
      confidence:   { type: 'number' },
      warnings:     { type: 'array', items: { type: 'string' } }
    },
    required: ['found', 'name', 'brand', 'basis', 'printedPer', 'printedServingSize',
               'printedServingLabel', 'printed', 'servings', 'isVegetarian', 'confidence', 'warnings'],
    additionalProperties: false
  },

  /* Natural-language logging — map a sentence onto the user's own pantry. */
  nl: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rawText:    { type: 'string' },
            matchType:  { type: 'string', enum: ['item', 'meal', 'unknown'] },
            id:         { type: ['string', 'null'] },
            altIds:     { type: 'array', items: { type: 'string' } },
            name:       { type: 'string' },
            qty:        { type: 'number' },
            unit:       { type: 'string' },
            slot:       { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
            confidence: { type: 'number' }
          },
          required: ['rawText', 'matchType', 'id', 'altIds', 'name', 'qty', 'unit', 'slot', 'confidence'],
          additionalProperties: false
        }
      },
      warnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['items', 'warnings'],
    additionalProperties: false
  },

  mealname: {
    type: 'object',
    properties: { names: { type: 'array', items: { type: 'string' } } },
    required: ['names'],
    additionalProperties: false
  },

  /* Web lookup — model proposes reference per-100 values plus its sources. */
  lookup: {
    type: 'object',
    properties: {
      found:  { type: 'boolean' },
      name:   { type: 'string' },
      brand:  { type: 'string' },
      basis:  { type: 'string', enum: ['g', 'ml'] },
      per100: MACROS_SCHEMA,
      servings: SERVINGS_SCHEMA,
      isVegetarian: { type: 'boolean' },
      confidence:   { type: 'number' },
      sources:      { type: 'array', items: { type: 'string' } },
      warnings:     { type: 'array', items: { type: 'string' } }
    },
    required: ['found', 'name', 'brand', 'basis', 'per100', 'servings',
               'isVegetarian', 'confidence', 'sources', 'warnings'],
    additionalProperties: false
  },

  /* Plate photo — DRAFT ONLY. Portions from a 2D photo are unreliable and oil is
   * invisible; the UI forces per-dish confirmation before anything is logged. */
  plate: {
    type: 'object',
    properties: {
      dishes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            matchedItemId:  { type: ['string', 'null'] },
            proposedGrams:  { type: 'number' },
            per100:         { anyOf: [MACROS_SCHEMA, { type: 'null' }] },
            likelyOilGrams: { type: 'number' },
            confidence:     { type: 'number' }
          },
          required: ['name', 'matchedItemId', 'proposedGrams', 'per100', 'likelyOilGrams', 'confidence'],
          additionalProperties: false
        }
      },
      warnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['dishes', 'warnings'],
    additionalProperties: false
  }
};

/* ---------- content builders ---------- */

/* Every caller-supplied string that lands in a system prompt is length-capped,
 * so the boundary is uniform and one oversized payload can't dominate a call. */
function cap(s, n) { return String(s == null ? '' : s).slice(0, n); }

function imageBlock(payload) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: payload.mediaType || 'image/jpeg', data: payload.imageB64 }
  };
}

const TASKS = {
  ping: () => ({
    max_tokens: 128,
    system: 'You are a connectivity probe. Reply with ok=true and a five-word confirmation.',
    messages: [{ role: 'user', content: 'Confirm the connection is working.' }]
  }),

  label: (p) => ({
    max_tokens: 1500,
    system: HOUSE_RULES + ' ' + [
      'You are reading a packaged-food NUTRITION PANEL from a photo.',
      'Transcribe ONLY what is printed. Do not convert between per-serving and per-100 — report the panel\'s own basis in printedPer and, when it is per-serving, the serving size in grams or ml in printedServingSize.',
      'If the panel prints per 100g AND per serving, prefer the per-100 column and set printedPer to "100g".',
      'basis is "ml" only for liquids sold by volume; otherwise "g".',
      'servings: household measures the label itself states (e.g. "1 scoop" 30). Empty array if none are printed.',
      'If the panel is unreadable, blurry, or absent, set found=false and explain in warnings.',
      p.correction ? ('The user says your previous reading was wrong: "' + cap(p.correction, 400) + '". Re-read the panel with that in mind.') : ''
    ].join(' '),
    messages: [{ role: 'user', content: [imageBlock(p), { type: 'text', text: 'Read this nutrition label.' }] }]
  }),

  nl: (p) => ({
    max_tokens: 2000,
    system: HOUSE_RULES + ' ' + [
      'You map a sentence about what the user ate onto THEIR OWN pantry.',
      'Always prefer an existing pantry id over inventing a new food. Only use matchType "unknown" when nothing in the pantry plausibly matches.',
      'When several pantry entries plausibly match (e.g. "dal"), pick the most likely as id and put the other candidate ids in altIds so the user can switch.',
      'unit must be either one of that item\'s serving labels, or "g"/"ml".',
      'If the user did not say which meal, infer the slot from the food and the current time of day.',
      'Their pantry (id | name | aliases):\n' + cap(p.pantry, 24000)
    ].join(' '),
    messages: [{ role: 'user', content: 'Local time: ' + cap(p.localTime || 'unknown', 60) + '\nThey said: "' + cap(p.text, 1000) + '"' }]
  }),

  mealname: (p) => ({
    max_tokens: 400,
    system: HOUSE_RULES + ' Suggest exactly 3 short, natural names for a saved meal the user can re-log. Use their everyday Indian food vocabulary. No numbers, no calorie counts, max 4 words each.',
    messages: [{ role: 'user', content: 'Components:\n' + cap(p.components, 4000) }]
  }),

  /* Step 2 of the lookup pair — structure the researched text. */
  lookup_structure: (p) => ({
    max_tokens: 1200,
    system: HOUSE_RULES + ' Convert the research notes below into the schema. Use per-100g (or per-100ml for liquids) reference values. Copy the source URLs verbatim into sources. If the notes do not support a confident answer, set found=false.',
    messages: [{ role: 'user', content: 'Food: ' + cap(p.query, 200) + '\n\nResearch notes:\n' + cap(p.notes, 20000) }]
  }),

  plate: (p) => ({
    max_tokens: 2500,
    system: HOUSE_RULES + ' ' + [
      'You are drafting a food log from a photo of a PLATE OF FOOD. This is a draft the user will correct — never present it as a measurement.',
      'Identify each distinct dish. Estimate portion mass in grams, but be honest: a 2D photo cannot measure mass, so keep confidence modest and say so in warnings when the angle or scale is ambiguous.',
      'likelyOilGrams: cooking oil/ghee is INVISIBLE in a photo. Give your best estimate for how the dish is normally cooked (0 for raw/steamed/boiled, higher for fried or restaurant gravies). The user will confirm it.',
      'If a dish clearly matches one of the user\'s pantry items, set matchedItemId and leave per100 null — the app already has better numbers than you do. Only supply per100 for dishes with no match.',
      'Their pantry (id | name):\n' + cap(p.pantry, 24000)
    ].join(' '),
    messages: [{ role: 'user', content: [imageBlock(p), { type: 'text', text: 'Draft a food log from this plate.' }] }]
  })
};

/* The tasks a browser may ask for. Kept explicit rather than derived from
 * TASKS, because `lookup` is served by a two-call branch below and has no TASKS
 * entry, while `lookup_structure` IS in TASKS but is internal-only. Deriving the
 * whitelist from TASKS got both of those wrong. */
const PUBLIC_TASKS = ['ping', 'label', 'nl', 'mealname', 'lookup', 'plate'];

/* ---------- Anthropic call ---------- */

async function callAnthropic(body) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION
    },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* non-JSON error body */ }

  if (!r.ok) {
    const err = new Error((json && json.error && json.error.message) || text.slice(0, 300) || ('HTTP ' + r.status));
    err.status = r.status;
    err.retryAfter = r.headers.get('retry-after');
    throw err;
  }
  return json;
}

/* Pull the first text block out of a Messages response, after checking the
 * model did not decline. Structured outputs guarantee it parses as JSON. */
function readStructured(resp) {
  if (resp.stop_reason === 'refusal') {
    const e = new Error('The model declined this request.');
    e.status = 422; e.code = 'refusal';
    throw e;
  }
  if (resp.stop_reason === 'max_tokens') {
    const e = new Error('The response was cut off before it finished.');
    e.status = 502; e.code = 'truncated';
    throw e;
  }
  const block = (resp.content || []).find(b => b.type === 'text');
  if (!block) {
    const e = new Error('The model returned no readable content.');
    e.status = 502; e.code = 'empty';
    throw e;
  }
  return JSON.parse(block.text);
}

function readPlainText(resp) {
  if (resp.stop_reason === 'refusal') {
    const e = new Error('The model declined this request.');
    e.status = 422; e.code = 'refusal';
    throw e;
  }
  return (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

function reply(status, obj) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}

/* ---------- handler ---------- */

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'POST only' });

  if (!process.env.ANTHROPIC_API_KEY || !process.env.WARMODE_AI_PIN) {
    return reply(500, { ok: false, code: 'not_configured',
      error: 'Server is missing ANTHROPIC_API_KEY or WARMODE_AI_PIN.' });
  }

  const hdrs = event.headers || {};
  const pin = hdrs['x-warmode-pin'] || hdrs['X-Warmode-Pin'];
  if (pin !== process.env.WARMODE_AI_PIN) {
    return reply(401, { ok: false, code: 'bad_pin', error: 'Wrong or missing PIN.' });
  }

  let req;
  try { req = JSON.parse(event.body || '{}'); }
  catch (_) { return reply(400, { ok: false, error: 'Body must be JSON.' }); }

  const task = req.task;
  const payload = req.payload || {};
  if (!task || PUBLIC_TASKS.indexOf(task) === -1) {
    return reply(400, { ok: false, code: 'bad_task', error: 'Unknown task: ' + task });
  }

  const used = bumpCap(task);
  if (used > DAILY_CAP) {
    return reply(429, { ok: false, code: 'daily_cap',
      error: 'Daily AI limit reached (' + DAILY_CAP + '). Resets at UTC midnight.' });
  }

  try {
    let data, usage;

    if (task === 'lookup') {
      /* Two calls on purpose. Structured outputs and the server-side web-search
       * tool are not guaranteed to compose, so we research first (plain text,
       * with citations) and structure the notes in a second, tool-free call.
       * Cost is ~2c on a path that runs only for genuinely unknown foods. */
      const research = await callAnthropic({
        model: MODEL,
        max_tokens: 2000,
        system: HOUSE_RULES + ' Research the food below and report typical per-100g (or per-100ml) calories, protein, carbs, fat and fiber. Prefer manufacturer labels, IFCT/NIN, or USDA. State the numbers plainly and list the URLs you used.',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: 'Food: ' + cap(payload.query, 200) }]
      });
      const notes = readPlainText(research);

      const spec = TASKS.lookup_structure({ query: payload.query, notes });
      const structured = await callAnthropic({
        model: MODEL,
        max_tokens: spec.max_tokens,
        system: spec.system,
        messages: spec.messages,
        output_config: { format: { type: 'json_schema', schema: SCHEMAS.lookup } }
      });
      data = readStructured(structured);
      usage = { research: research.usage, structure: structured.usage };

    } else {
      const spec = TASKS[task](payload);
      const resp = await callAnthropic({
        model: MODEL,
        max_tokens: spec.max_tokens,
        system: spec.system,
        messages: spec.messages,
        output_config: { format: { type: 'json_schema', schema: SCHEMAS[task] } }
      });
      data = readStructured(resp);
      usage = resp.usage;
    }

    return reply(200, { ok: true, task, data, usage, callsToday: used, dailyCap: DAILY_CAP });

  } catch (e) {
    const status = e.status || 500;
    const body = { ok: false, code: e.code || 'upstream', error: e.message || 'AI call failed.' };
    if (e.retryAfter) body.retryAfter = e.retryAfter;
    if (status === 429) body.error = 'Anthropic rate limit hit. Try again shortly.';
    if (status === 529) body.error = 'Anthropic is overloaded. Try again shortly.';
    return reply(status, body);
  }
};
