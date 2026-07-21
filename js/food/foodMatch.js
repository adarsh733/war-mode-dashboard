/* foodMatch.js — DETERMINISTIC fuzzy matching for pantry search.
 *
 * Why this exists: "paneer lababdar sabzi" matched nothing, even though
 * Paneer Lababdar is in the pantry. The old search was a plain substring test
 * (`hay.includes(q)`), so one extra word, one transposed letter or one missing
 * space dropped the food entirely — in manual search AND in the natural-language
 * logger's fallback.
 *
 * No AI here on purpose. This runs offline, costs nothing, and is the safety net
 * *under* the model: when the model says "unknown", this is what offers
 * "did you mean…". Pure functions, no DOM, no state — unit-testable in isolation
 * like foodMath.js and aiValidate.js.
 *
 * Scoring is a blend of three cheap signals, each of which catches a failure the
 * others miss:
 *   token overlap — survives extra/reordered words ("paneer lababdar SABZI")
 *   prefix/substring — the fast path for what people actually type
 *   trigram Dice — survives misspellings ("panner", "lababdaar", "chappati")
 * useCount only ever breaks ties, so a popular item can't outrank a better match.
 */

/* Words people bolt onto a food name that may or may not be part of it.
 *
 * These are NOT stripped. Half of them appear in real pantry names — "Masala
 * Dosa", "Cabbage Sabzi", "Mixed Veg Curry", "Veg Manchurian (gravy)" — so
 * deleting them from the query breaks those foods instead of helping. The rule
 * is asymmetric and that asymmetry is the whole trick:
 *
 *   a weak word that MATCHES  → counts as evidence for  ("masala dosa")
 *   a weak word that DOESN'T  → excused, not evidence against  ("…lababdar SABZI")
 *
 * That single rule is what makes "paneer lababdar sabzi" and "masala dosa" both
 * land on the right item. */
const FM_FILLER = [
  'sabzi', 'sabji', 'curry', 'gravy', 'masala', 'dish', 'plate', 'plateful',
  'bowl', 'katori', 'glass', 'cup', 'piece', 'pieces', 'pc', 'pcs', 'serving',
  'some', 'a', 'an', 'the', 'of', 'my', 'ka', 'ki', 'ke', 'wala', 'wali',
  'homemade', 'home', 'made', 'fresh', 'hot', 'cold', 'plain'
];

function fmNorm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* A token that must not count against a candidate when it fails to match:
 * filler words, bare quantities ("2" in "2 roti"), and single letters. */
function fmIsWeak(t) {
  return FM_FILLER.indexOf(t) !== -1 || /^[0-9]+$/.test(t) || t.length < 2;
}

function fmTokens(s) {
  return fmNorm(s).split(' ').filter(Boolean);
}

function fmTrigrams(s) {
  const p = '  ' + fmNorm(s).replace(/ /g, ' ') + ' ';
  const out = [];
  for (let i = 0; i < p.length - 2; i++) out.push(p.slice(i, i + 3));
  return out;
}

/* Dice coefficient over trigrams → 0..1. Robust to typos and letter swaps. */
function fmDice(a, b) {
  const A = fmTrigrams(a), B = fmTrigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = Object.create(null);
  A.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
  let hits = 0;
  B.forEach(g => { if (counts[g] > 0) { counts[g]--; hits++; } });
  return (2 * hits) / (A.length + B.length);
}

/* How well does one query token match one name token? Exact, then prefix, then
 * a near-miss allowance so "panner"/"paneer" and "nan"/"naan" still connect. */
function fmTokenScore(qt, nt) {
  if (qt === nt) return 1;
  if (nt.indexOf(qt) === 0 || qt.indexOf(nt) === 0) return 0.85;
  if (qt.length >= 4 && nt.length >= 4) {
    const d = fmDice(qt, nt);
    if (d >= 0.5) return 0.55 + (d - 0.5);      // 0.55 .. 1.05, capped below
  }
  return 0;
}

/* Score one candidate string against the query tokens. → 0..1 */
function fmScoreName(qTokens, qJoined, name) {
  const nNorm = fmNorm(name);
  if (!nNorm) return 0;
  const nTokens = nNorm.split(' ').filter(Boolean);

  /* Every query token finds its best home in the name. A weak token that finds
   * none is dropped from the denominator rather than scored zero — see FM_FILLER. */
  let sum = 0, denom = 0;
  qTokens.forEach(qt => {
    let best = 0;
    nTokens.forEach(nt => { const s = fmTokenScore(qt, nt); if (s > best) best = s; });
    best = Math.min(1, best);
    if (best === 0 && fmIsWeak(qt)) return;
    sum += best; denom += 1;
  });
  const overlap = denom ? (sum / denom) : 0;

  /* whole-string signals */
  const contains = nNorm.indexOf(qJoined) >= 0 ? 1 : 0;
  const startsWith = nNorm.indexOf(qJoined) === 0 ? 1 : 0;
  const dice = fmDice(qJoined, nNorm);

  /* Overlap leads because it is the one that survives extra words, which is the
   * exact case that was failing. Dice rescues misspellings. */
  let score = (overlap * 0.60) + (dice * 0.25) + (contains * 0.10) + (startsWith * 0.05);

  /* A short query fully contained in a long name ("dal" in "Dal Makhani") is a
   * real hit, but shouldn't beat the item actually called "Dal". */
  if (contains && nTokens.length > qTokens.length) score -= 0.04;

  /* Typing a food's exact name must win outright, whatever else is close.
   * Without this, "Masala Dosa" lost to "Plain Dosa" on an alias technicality. */
  if (nNorm === qJoined) score += 0.35;

  return Math.max(0, Math.min(1, score));
}

/* Best score for an item across its name, brand+name, and every alias/tag. */
function fmScoreItem(item, qTokens, qJoined) {
  if (!item) return 0;
  let best = fmScoreName(qTokens, qJoined, item.name);
  if (item.brand) {
    const s = fmScoreName(qTokens, qJoined, item.brand + ' ' + item.name);
    if (s > best) best = s;
  }
  (item.aliases || []).forEach(a => { const s = fmScoreName(qTokens, qJoined, a); if (s > best) best = s; });
  (item.tags || []).forEach(t => { const s = fmScoreName(qTokens, qJoined, t); if (s > best) best = s; });
  return best;
}

/* Below this a "match" is noise. Tuned against the real 158-item seed so that
 * genuine typos pass and unrelated foods don't. */
const FM_MIN_SCORE = 0.34;

/* ---------- public API ---------- */

/* Rank pantry items against a free-text query.
 * → [{ item, score }] best first, above threshold only.
 * opts: { limit, min, pool } — pool defaults to every item in FOOD_ITEMS. */
function fuzzyFindItems(query, opts) {
  const o = opts || {};
  const qTokens = fmTokens(query);
  const qJoined = qTokens.join(' ');
  if (!qJoined) return [];

  const pool = o.pool || Object.values(typeof FOOD_ITEMS !== 'undefined' ? FOOD_ITEMS : {});
  const min = o.min != null ? o.min : FM_MIN_SCORE;

  const scored = [];
  pool.forEach(it => {
    const s = fmScoreItem(it, qTokens, qJoined);
    if (s >= min) scored.push({ item: it, score: s });
  });

  scored.sort((a, b) =>
    (b.score - a.score) ||
    ((b.item.useCount || 0) - (a.item.useCount || 0)) ||
    a.item.name.localeCompare(b.item.name));

  return scored.slice(0, o.limit || 8);
}

/* Same, for saved meals. Reserved '__' rows are never candidates. */
function fuzzyFindMeals(query, opts) {
  const o = opts || {};
  const qTokens = fmTokens(query);
  const qJoined = qTokens.join(' ');
  if (!qJoined) return [];

  const pool = o.pool || Object.values(typeof FOOD_MEALS !== 'undefined' ? FOOD_MEALS : {})
    .filter(m => !String(m.id).startsWith('__'));
  const min = o.min != null ? o.min : FM_MIN_SCORE;

  const scored = [];
  pool.forEach(m => {
    const s = fmScoreName(qTokens, qJoined, m.name);
    if (s >= min) scored.push({ meal: m, score: s });
  });

  scored.sort((a, b) => (b.score - a.score) || a.meal.name.localeCompare(b.meal.name));
  return scored.slice(0, o.limit || 4);
}

/* Convenience for the AI paths: the single best item, or null. */
function fuzzyBestItem(query, min) {
  const hits = fuzzyFindItems(query, { limit: 1, min: min });
  return hits.length ? hits[0].item : null;
}

/* Node unit tests load this file with require(); the browser ignores it. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fmNorm, fmTokens, fmIsWeak, fmDice, fmScoreName, fmScoreItem,
    fuzzyFindItems, fuzzyFindMeals, fuzzyBestItem, FM_MIN_SCORE, FM_FILLER };
}
