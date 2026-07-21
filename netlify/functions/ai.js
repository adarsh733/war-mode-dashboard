/* netlify/functions/ai.js — the ONLY place the Anthropic API key exists.
 *
 * Why this file has to exist: the dashboard is a public static site, so any key
 * shipped in js/ would be readable by every visitor (and auto-revoked by leak
 * scanners). The browser calls this function; this function calls Anthropic.
 * Supersedes ADR-0011's "test a direct browser call" framing — a direct call is
 * not viable regardless of CORS.
 *
 * ── The 10-second budget (ADR-0026) ────────────────────────────────────────
 * Netlify's synchronous function timeout is 10s, and it is the binding
 * constraint on every design choice here:
 *
 *   1. ONE upstream call per task. Never two. The original `lookup` ran a
 *      web-search research pass AND a structuring pass and therefore failed
 *      with a 504 one hundred percent of the time.
 *   2. `thinking` is deliberately OMITTED. On Opus 4.8 an absent thinking field
 *      means the model runs without thinking — which is why label and plate
 *      already finish comfortably inside the window. Depth is tuned with
 *      output_config.effort instead. Do not "improve" this by switching on
 *      adaptive thinking; that is the change most likely to bring the timeout
 *      back.
 *   3. An 8s AbortController on the upstream fetch, so a slow Anthropic returns
 *      OUR readable error rather than Netlify's opaque gateway 504.
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
 * Accuracy contract (docs/decisions.md ADR-0024): every task returns STRUCTURED
 * JSON via output_config.format, and the model is instructed never to do
 * arithmetic on user quantities. All macro math stays in js/food/foodMath.js.
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

/* Leaves ~2s of the 10s Netlify budget for JSON handling and the round trip. */
const UPSTREAM_TIMEOUT_MS = 8000;

/* Thinking depth per task. Cheap//fast tasks stay at low; the ones where a
 * misread costs calories get medium. Nothing is set to high — that is where the
 * latency budget runs out. */
const EFFORT = {
  ping: 'low', mealname: 'low', lookup: 'low',
  nl: 'medium', label: 'medium', plate: 'medium'
};

/* Daily cap counter.
 * NOTE — this is a BEST-EFFORT fuse. Netlify may run several warm instances, so
 * the true ceiling is (cap x instances). The hard money guard is the monthly
 * spend limit set in the Anthropic console; this just stops a runaway loop. */
let _capDay = '';
let _capCount = 0;

function bumpCap() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _capDay) { _capDay = today; _capCount = 0; }
  _capCount += 1;                 // every task is exactly one upstream call now
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

/* The household measures the app knows how to convert. Keep in sync with
 * HOUSEHOLD_G in js/food/foodMath.js — the model proposes one of these labels
 * and the app does the gram arithmetic. */
const HOUSEHOLD_HINT = [
  'Standard household measures and their gram/ml weights, which you should reuse rather than invent:',
  '1 katori = 150 g, 1 bowl = 200 g, 1 plate = 300 g, 1 glass = 250 ml, 1 cup = 200 ml,',
  '1 tbsp = 15 g, 1 tsp = 5 g, 1 scoop = 30 g.',
  'Typical single pieces: 1 roti/chapati 40 g, 1 paratha 80 g, 1 naan 90 g, 1 idli 40 g,',
  '1 dosa 90 g, 1 slice of bread 28 g, 1 samosa 60 g, 1 banana 120 g, 1 apple 180 g.'
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

  /* Image import — the model reports ONLY what the image shows.
   * per-serving -> per-100 conversion happens in JS (aiValidate.js). */
  label: {
    type: 'object',
    properties: {
      found:   { type: 'boolean' },
      sourceKind: { type: 'string', enum: ['label', 'app_screenshot', 'website', 'menu', 'recipe', 'handwritten', 'other'] },
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
    required: ['found', 'sourceKind', 'name', 'brand', 'basis', 'printedPer', 'printedServingSize',
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

  /* Web-free lookup — reference per-100 values from the model's own knowledge,
   * with the assumptions it made stated plainly so a wrong number is traceable
   * months later. See ADR-0026 for why web search is not used here. */
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
      assumptions:  { type: 'array', items: { type: 'string' } },
      warnings:     { type: 'array', items: { type: 'string' } }
    },
    required: ['found', 'name', 'brand', 'basis', 'per100', 'servings',
               'isVegetarian', 'confidence', 'assumptions', 'warnings'],
    additionalProperties: false
  },

  /* Plate photo — DRAFT ONLY. Portions from a 2D photo are unreliable and oil is
   * invisible; the UI forces per-dish confirmation before anything is logged.
   * The model proposes a UNIT and a per-unit weight; the app multiplies. */
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
            unitKind:       { type: 'string', enum: ['count', 'household', 'weight'] },
            unitLabel:      { type: 'string' },
            qty:            { type: 'number' },
            gramsPerUnit:   { type: 'number' },
            per100:         { anyOf: [MACROS_SCHEMA, { type: 'null' }] },
            likelyOilGrams: { type: 'number' },
            confidence:     { type: 'number' }
          },
          required: ['name', 'matchedItemId', 'unitKind', 'unitLabel', 'qty',
                     'gramsPerUnit', 'per100', 'likelyOilGrams', 'confidence'],
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

  /* Any image that carries nutrition information — not just a printed panel.
   * The user photographs packets, but also screenshots product pages, fitness
   * apps and menus, so the reader has to cope with all of them. */
  label: (p) => ({
    max_tokens: 1800,
    system: HOUSE_RULES + ' ' + [
      'You are reading NUTRITION INFORMATION out of an image. The image may be any of:',
      'a printed nutrition panel on a packet; a screenshot of an e-commerce product page (Blinkit, Zepto, Amazon, BigBasket);',
      'a screenshot of a nutrition app such as HealthifyMe or MyFitnessPal; a restaurant menu; a recipe card; or handwritten notes.',
      'Set sourceKind to whichever it is. Read the numbers as they appear; do not convert between per-serving and per-100 —',
      'report the basis in printedPer and, when it is per-serving, the serving size in grams or ml in printedServingSize.',
      'If the image shows per 100g AND per serving, prefer the per-100 column and set printedPer to "100g".',
      'basis is "ml" only for liquids sold by volume; otherwise "g".',
      'servings: any household measure the image itself states, e.g. a HealthifyMe row reading "1 katori (150 g)" gives label "1 katori" amount 150.',
      'Never invent a serving the image does not state.',
      'If no nutrition numbers are readable anywhere in the image, set found=false and say what you did see in warnings.',
      HOUSEHOLD_HINT,
      p.correction ? ('The user says your previous reading was wrong: "' + cap(p.correction, 400) + '". Re-read the image with that in mind.') : ''
    ].join(' '),
    messages: [{ role: 'user', content: [imageBlock(p), { type: 'text', text: 'Read the nutrition information in this image.' }] }]
  }),

  nl: (p) => ({
    max_tokens: 2000,
    system: HOUSE_RULES + ' ' + [
      'You map a sentence about what the user ate onto THEIR OWN pantry.',
      'The pantry is listed below, one entry per line, as:  id | name | aliases: ... | units: ...',
      'Use the id EXACTLY as written in the first column. Do not add a prefix, a quote, or any decoration to it.',
      'Always prefer an existing pantry entry over inventing a new food. Only use matchType "unknown" when nothing in the pantry plausibly matches.',
      'Match generously. The user types quickly and phonetically, so tolerate: misspellings ("panner", "lababdaar"),',
      'spacing and transliteration variants ("labab dar", "chappati", "dahl"), plurals, and filler words that are not part of the pantry name',
      '("sabzi", "curry", "gravy", "masala", "ki", "wala", "plate of", "some"). Match on the core dish name.',
      'When several pantry entries plausibly match (e.g. "dal"), pick the most likely as id and put the other candidate ids in altIds so the user can switch.',
      'unit MUST be either one of the unit labels listed for that entry in its "units:" column, or "g"/"ml". Never invent a unit label.',
      'If the user gives a household measure the item does not list (e.g. "1 glass" for an item with no glass unit), pick the closest listed unit and lower confidence.',
      'If the user did not say which meal, infer the slot from the food and the current time of day.',
      HOUSEHOLD_HINT,
      '\n--- THEIR PANTRY ---\n' + cap(p.pantry, 30000)
    ].join(' '),
    messages: [{ role: 'user', content: 'Local time: ' + cap(p.localTime || 'unknown', 60) + '\nThey said: "' + cap(p.text, 1000) + '"' }]
  }),

  mealname: (p) => ({
    max_tokens: 400,
    system: HOUSE_RULES + ' Suggest exactly 3 short, natural names for a saved meal the user can re-log. Use their everyday Indian food vocabulary. No numbers, no calorie counts, max 4 words each.',
    messages: [{ role: 'user', content: 'Components:\n' + cap(p.components, 4000) }]
  }),

  /* Unknown food -> reference numbers, from model knowledge only.
   * One call, no tools: this has to finish inside Netlify's 10s. */
  lookup: (p) => ({
    max_tokens: 1200,
    system: HOUSE_RULES + ' ' + [
      'The user has eaten something that is not in their pantry yet. Give your best reference nutrition values for it',
      'so they can log it and calibrate later.',
      'Report per 100 g (or per 100 ml for drinks) using well-established reference data you already know —',
      'IFCT/NIN for Indian foods, USDA otherwise, and the manufacturer\'s own panel for a named packaged brand.',
      'Also propose the household units this food is actually eaten in, with realistic weights, so the user can log',
      '"1 katori" or "2 roti" rather than guessing grams.',
      'State every assumption you made in `assumptions` — preparation method, whether oil/ghee is included, restaurant vs home style,',
      'brand substitutions. This is what makes a wrong number traceable later, so be specific rather than generic.',
      'If the food name is too vague or you genuinely do not know it, set found=false and explain in warnings. Do not guess wildly.',
      HOUSEHOLD_HINT
    ].join(' '),
    messages: [{ role: 'user', content: 'Food: ' + cap(p.query, 200) + (p.hint ? ('\nExtra context from the user: ' + cap(p.hint, 400)) : '') }]
  }),

  plate: (p) => ({
    max_tokens: 2500,
    system: HOUSE_RULES + ' ' + [
      'You are drafting a food log from a photo of a PLATE OF FOOD. This is a draft the user will correct — never present it as a measurement.',
      'Identify each distinct dish and describe its portion the way a person would COUNT OR MEASURE it, not only in grams:',
      '- unitKind "count" for things that come in whole pieces — roti, idli, dosa, samosa, banana, a coconut, a slice.',
      '  unitLabel is the singular piece name ("roti", "idli", "coconut"), qty is how many you can see, gramsPerUnit is one piece\'s weight.',
      '- unitKind "household" for served portions — dal, sabzi, curd, rice, lassi. unitLabel is "katori"/"bowl"/"plate"/"glass"/"cup",',
      '  qty is how many of them, gramsPerUnit is that measure\'s weight.',
      '- unitKind "weight" only when neither fits. unitLabel is "g" (or "ml"), qty is the gram estimate, gramsPerUnit is 1.',
      'Never use grams for something countable: a photographed coconut is 1 coconut, not 200 g, and three rotis are 3 roti, not 120 g.',
      'The app multiplies qty by gramsPerUnit itself — do not do that arithmetic and do not report a total.',
      'Be honest about portions: a 2D photo cannot measure mass, so keep confidence modest and say so in warnings when angle or scale is ambiguous.',
      'likelyOilGrams: cooking oil/ghee is INVISIBLE in a photo. Give your best estimate for how the dish is normally cooked (0 for raw/steamed/boiled, higher for fried or restaurant gravies). The user will confirm it.',
      'The pantry below is listed as:  id | name. If a dish clearly matches one of these, set matchedItemId to that id EXACTLY as written',
      '(no prefix, no decoration) and leave per100 null — the app already has better numbers than you do.',
      'Only supply per100 for dishes with no pantry match.',
      HOUSEHOLD_HINT,
      '\n--- THEIR PANTRY ---\n' + cap(p.pantry, 24000)
    ].join(' '),
    messages: [{ role: 'user', content: [imageBlock(p), { type: 'text', text: 'Draft a food log from this plate.' }] }]
  })
};

/* The tasks a browser may ask for. Kept explicit rather than derived from
 * TASKS so the two can be cross-checked in tests — an earlier version derived
 * it and silently dropped `lookup`, which 400'd every call. */
const PUBLIC_TASKS = ['ping', 'label', 'nl', 'mealname', 'lookup', 'plate'];

/* ---------- Anthropic call ---------- */

async function callAnthropic(body) {
  /* Abort before Netlify's 10s gateway does, so the user gets a sentence they
   * can act on instead of an unexplained 504. */
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);

  let r;
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
  } catch (e) {
    const err = new Error(ctl.signal.aborted
      ? 'That took longer than the server allows. Try again — it usually works on the second go.'
      : 'Couldn\'t reach Anthropic.');
    err.status = 504; err.code = ctl.signal.aborted ? 'upstream_timeout' : 'upstream_unreachable';
    throw err;
  } finally {
    clearTimeout(timer);
  }

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
  if (!task || PUBLIC_TASKS.indexOf(task) === -1 || !TASKS[task]) {
    return reply(400, { ok: false, code: 'bad_task', error: 'Unknown task: ' + task });
  }

  const used = bumpCap();
  if (used > DAILY_CAP) {
    return reply(429, { ok: false, code: 'daily_cap',
      error: 'Daily AI limit reached (' + DAILY_CAP + '). Resets at UTC midnight.' });
  }

  try {
    const spec = TASKS[task](payload);
    const resp = await callAnthropic({
      model: MODEL,
      max_tokens: spec.max_tokens,
      system: spec.system,
      messages: spec.messages,
      output_config: {
        effort: EFFORT[task] || 'low',
        format: { type: 'json_schema', schema: SCHEMAS[task] }
      }
    });

    return reply(200, {
      ok: true, task, data: readStructured(resp), usage: resp.usage,
      callsToday: used, dailyCap: DAILY_CAP
    });

  } catch (e) {
    const status = e.status || 500;
    const body = { ok: false, code: e.code || 'upstream', error: e.message || 'AI call failed.' };
    if (e.retryAfter) body.retryAfter = e.retryAfter;
    if (status === 429) body.error = 'Anthropic rate limit hit. Try again shortly.';
    if (status === 529) body.error = 'Anthropic is overloaded. Try again shortly.';
    return reply(status, body);
  }
};
