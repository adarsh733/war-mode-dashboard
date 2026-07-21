/* aiValidate.js — deterministic guards on anything an AI proposes.
 *
 * Pure functions, no DOM, no state — the same shape as foodMath.js so they can
 * be unit-checked. Nothing an AI returns reaches saveItem() without passing
 * through here first (docs/decisions.md, Phase 2 accuracy contract).
 *
 * The important one is the Atwater cross-check: calories must roughly equal
 * 4*protein + 4*net-carbs + 2*fiber + 9*fat. A label misread of "2.5g protein"
 * as "25g" fails this instantly, which is exactly the class of silent 200-300
 * kcal error the whole app exists to prevent.
 */

/* Real foods deviate from Atwater (sugar alcohols, rounding, fortification), so
 * the band is deliberately loose: flag only what is clearly wrong, not merely
 * imperfect. Verified against the seed set — roti, paneer, almonds, oats, ghee,
 * curd and whey all land inside it. */
const AI_ATWATER_TOL_PCT = 0.20;   // 20%
const AI_ATWATER_TOL_ABS = 25;     // ...or 25 kcal, whichever is larger

const AI_MAX_KCAL_PER_100 = 900;   // pure fat is ~900; nothing edible exceeds it

/* Non-vegetarian words. Word-boundary matched, with an exception list so
 * "eggplant" and "egg-free" don't trip the guard. */
const AI_NONVEG_WORDS = [
  'chicken','mutton','lamb','goat','beef','pork','bacon','ham','turkey','duck',
  'fish','tuna','salmon','anchovy','sardine','prawn','shrimp','crab','lobster','squid',
  'egg','eggs','meat','keema','kheema','gosht','murgh','chicken tikka','gelatin','gelatine','lard'
];
const AI_NONVEG_EXCEPTIONS = ['eggplant','egg plant','egg-free','eggless','egg free','meatless','meat-free'];

function aiRound(n, d) { const p = Math.pow(10, d == null ? 1 : d); return Math.round((Number(n) || 0) * p) / p; }

/* Expected calories from macros. Fiber is counted at 2 kcal/g and removed from
 * the carb figure, which is how food labels actually behave. */
function aiExpectedKcal(m) {
  const p = Number(m.protein) || 0;
  const c = Number(m.carbs) || 0;
  const f = Number(m.fat) || 0;
  const fib = (m.fiber != null && !isNaN(m.fiber)) ? Number(m.fiber) : null;
  if (fib != null && fib > 0 && fib <= c) return 4 * p + 4 * (c - fib) + 2 * fib + 9 * f;
  return 4 * p + 4 * c + 9 * f;
}

/* Validate a per-100 macro block.
 * → { level: 'ok' | 'warn' | 'fail', issues: [string], expectedKcal, deltaPct } */
function aiCheckMacros(per100) {
  const issues = [];
  let level = 'ok';
  const fail = (msg) => { issues.push(msg); level = 'fail'; };
  const warn = (msg) => { issues.push(msg); if (level !== 'fail') level = 'warn'; };

  if (!per100 || typeof per100 !== 'object') {
    return { level: 'fail', issues: ['No nutrition values were returned.'], expectedKcal: 0, deltaPct: 0 };
  }

  const nums = { kcal: per100.kcal, protein: per100.protein, carbs: per100.carbs, fat: per100.fat };
  for (const k in nums) {
    const v = nums[k];
    if (v == null || isNaN(v)) fail('Missing or non-numeric ' + k + '.');
    else if (v < 0) fail(k + ' is negative (' + v + ').');
  }
  if (per100.fiber != null && !isNaN(per100.fiber) && per100.fiber < 0) fail('Fiber is negative.');
  if (level === 'fail') return { level, issues, expectedKcal: 0, deltaPct: 0 };

  const kcal = Number(per100.kcal);
  if (kcal > AI_MAX_KCAL_PER_100) fail('Calories per 100 (' + aiRound(kcal) + ') exceed what any food can contain.');

  ['protein', 'carbs', 'fat'].forEach(k => {
    const v = Number(per100[k]);
    if (v > 100) fail(k + ' is ' + aiRound(v) + 'g per 100 — impossible.');
  });

  const massSum = Number(per100.protein) + Number(per100.carbs) + Number(per100.fat);
  if (massSum > 102) fail('Protein + carbs + fat come to ' + aiRound(massSum) + 'g per 100 — impossible.');

  if (per100.fiber != null && !isNaN(per100.fiber) && Number(per100.fiber) > Number(per100.carbs) + 0.5) {
    warn('Fiber (' + aiRound(per100.fiber) + 'g) is higher than total carbs — check the label.');
  }

  const expected = aiExpectedKcal(per100);
  const diff = Math.abs(expected - kcal);
  const tol = Math.max(AI_ATWATER_TOL_ABS, expected * AI_ATWATER_TOL_PCT);
  const deltaPct = expected > 0 ? (diff / expected) : 0;

  if (kcal === 0 && expected > 20) {
    fail('Calories read as 0 but the macros imply about ' + Math.round(expected) + '.');
  } else if (diff > tol) {
    warn('Calories (' + aiRound(kcal) + ') don\'t match the macros, which imply about '
      + Math.round(expected) + '. One of the numbers was probably misread.');
  }

  return { level, issues, expectedKcal: Math.round(expected), deltaPct: aiRound(deltaPct * 100, 1) };
}

/* Vegetarian guard — the user is vegetarian; never let a non-veg item through
 * silently. → { ok: boolean, hit: string|null } */
function aiCheckVegetarian(name, extra) {
  const hay = ((name || '') + ' ' + (extra || '')).toLowerCase();
  let cleaned = hay;
  AI_NONVEG_EXCEPTIONS.forEach(x => { cleaned = cleaned.split(x).join(' '); });
  for (const w of AI_NONVEG_WORDS) {
    if (new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(cleaned)) {
      return { ok: false, hit: w };
    }
  }
  return { ok: true, hit: null };
}

/* Convert a label reading into canonical per-100. The MODEL never does this —
 * it reports what is printed and this function does the arithmetic, mirroring
 * fmReadPer100() in foodForm.js. */
function aiPer100FromPrinted(reading) {
  const src = reading.printed || {};
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let factor = 1;

  if (reading.printedPer === 'serving') {
    const size = Number(reading.printedServingSize);
    if (!(size > 0)) return { per100: null, error: 'The label is per-serving but no serving size was readable.' };
    factor = 100 / size;
  }

  out.kcal    = (Number(src.kcal)    || 0) * factor;
  out.protein = (Number(src.protein) || 0) * factor;
  out.carbs   = (Number(src.carbs)   || 0) * factor;
  out.fat     = (Number(src.fat)     || 0) * factor;
  if (src.fiber != null && !isNaN(src.fiber)) out.fiber = Number(src.fiber) * factor;

  ['kcal', 'protein', 'carbs', 'fat', 'fiber'].forEach(k => { if (out[k] != null) out[k] = aiRound(out[k], 2); });
  return { per100: out, error: null, factor };
}

/* One call that runs every guard on a proposed item.
 * → { level, issues, per100, expectedKcal } */
function aiVetProposal(opts) {
  const issues = [];
  let level = 'ok';

  const veg = aiCheckVegetarian(opts.name, opts.brand);
  if (!veg.ok) {
    issues.push('This looks non-vegetarian ("' + veg.hit + '"). It will not be saved.');
    return { level: 'fail', issues, per100: null, expectedKcal: 0 };
  }

  const macro = aiCheckMacros(opts.per100);
  issues.push.apply(issues, macro.issues);
  if (macro.level === 'fail') level = 'fail';
  else if (macro.level === 'warn') level = 'warn';

  if (opts.confidence != null && opts.confidence < 0.5) {
    issues.push('The model was unsure about this reading (confidence '
      + Math.round(opts.confidence * 100) + '%). Check every number.');
    if (level === 'ok') level = 'warn';
  }

  return { level, issues, per100: opts.per100, expectedKcal: macro.expectedKcal };
}
