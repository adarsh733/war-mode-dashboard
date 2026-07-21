/* foodMath.js — DETERMINISTIC macro math for the Food tracker.
 *
 * CORE RULE (spec §3.1 / §5.4): every item stores macros per 100g (solids) or
 * per 100ml (liquids). Any amount's macros = per100[x] * (baseAmount / 100).
 * All arithmetic here is plain JS — the AI layer (Phase 2) never does math,
 * it only proposes numbers a human confirms. Pure functions, no DOM, no state,
 * so this file is unit-testable in isolation.
 */

/* Oil / ghee constants (spec §6): ~9 kcal per gram, ~1g fat per gram. */
const OIL_KCAL_PER_G = 9;
const OIL_FAT_PER_G  = 1;

/* Household oil measures → grams (spec §6). */
const OIL_UNIT_GRAMS = { tsp: 5, tbsp: 14, g: 1 };

/* Household measures → grams/ml. The plate-photo flow proposes a UNIT rather
 * than a raw gram estimate ("1 katori", "3 roti", "1 coconut") because that is
 * how food is actually served and counted — being asked for the gram weight of
 * a photographed coconut is a question nobody can answer. The model picks the
 * unit; this table does the arithmetic, so the conversion stays deterministic
 * and reviewable. Kept in sync with HOUSEHOLD_HINT in netlify/functions/ai.js. */
const HOUSEHOLD_G = {
  katori: 150, bowl: 200, plate: 300, glass: 250, cup: 200,
  tbsp: 15, tsp: 5, scoop: 30, slice: 28, piece: 50
};

/* grams for a household measure, or null when it isn't one we know. */
function householdGrams(label){
  if(!label) return null;
  const k = String(label).toLowerCase().replace(/[^a-z]/g,'');
  return HOUSEHOLD_G[k] != null ? HOUSEHOLD_G[k] : null;
}

/* qty x per-unit weight → base amount. The one place plate-photo portions are
 * turned into grams. */
function unitsToBaseAmount(qty, gramsPerUnit){
  const q = Number(qty) || 0;
  const g = Number(gramsPerUnit);
  return q * (isNaN(g) ? 0 : g);
}

/* ---- rounding: round ONLY for display (spec §5.1) ---- */
function roundKcal(n){ return Math.round(n || 0); }
function round1(n){ return Math.round((n || 0) * 10) / 10; }

/* base unit label for an item ("g" for solids, "ml" for liquids). */
function baseUnit(item){ return (item && item.basis === 'ml') ? 'ml' : 'g'; }

/* "Net wt: 80 g" vs "Net vol: 250 ml" label (matches HealthifyMe screenshots). */
function netLabel(item, baseAmount){
  const u = baseUnit(item);
  return (u === 'ml' ? 'Net vol: ' : 'Net wt: ') + round1(baseAmount) + ' ' + u;
}

/* Resolve a logged quantity + chosen measure to an amount in BASE units (g/ml).
 *   servingIndex == null / -1  → the base measure (grams or ml): amount = quantity
 *   servingIndex is an index   → quantity * servings[index].amount   (amount is in base units)
 * e.g. 1 "Can" where Can.amount=250 → 250 (ml); 80 "Grams" → 80 (g); 2 cans → 500.
 */
function toBaseAmount(item, quantity, servingIndex){
  const q = Number(quantity) || 0;
  if (servingIndex == null || servingIndex < 0) return q;            // base unit chosen
  const s = item && item.servings && item.servings[servingIndex];
  return s ? q * (Number(s.amount) || 0) : q;
}

/* Empty macro accumulator. fiber tracked separately; undefined until some item has it. */
function zeroMacros(){ return { kcal:0, protein:0, carbs:0, fat:0, fiber:0, hasFiber:false }; }

/* macros for an item at a given amount in base units. */
function macrosForAmount(item, baseAmount){
  const p = (item && item.per100) || {};
  const f = (Number(baseAmount) || 0) / 100;
  const m = {
    kcal:    (p.kcal    || 0) * f,
    protein: (p.protein || 0) * f,
    carbs:   (p.carbs   || 0) * f,
    fat:     (p.fat     || 0) * f,
    fiber:   (p.fiber != null ? p.fiber * f : 0),
    hasFiber: p.fiber != null
  };
  return m;
}

/* Convenience: macros for a logged quantity + measure (resolves to base first). */
function macrosForQty(item, quantity, servingIndex){
  return macrosForAmount(item, toBaseAmount(item, quantity, servingIndex));
}

/* oil/ghee grams → macros. */
function oilMacros(grams){
  const g = Number(grams) || 0;
  return { kcal: OIL_KCAL_PER_G * g, protein:0, carbs:0, fat: OIL_FAT_PER_G * g, fiber:0, hasFiber:false };
}
/* oil helper: {unit:'tsp'|'tbsp'|'g', qty} → grams */
function oilToGrams(unit, qty){ return (OIL_UNIT_GRAMS[unit] || 1) * (Number(qty) || 0); }

/* sum b into a (mutates+returns a). */
function addInto(a, b){
  a.kcal += b.kcal; a.protein += b.protein; a.carbs += b.carbs; a.fat += b.fat;
  a.fiber += (b.fiber || 0); a.hasFiber = a.hasFiber || !!b.hasFiber;
  return a;
}

/* Totals for a saved meal (one serving): sum component items + any added oil.
 * Optional per-day tweaks: overrides {itemId:amount} and removed [itemId]
 * let a LOGGED meal be adjusted for that day without editing the template. */
function mealTotals(meal, itemsById, overrides, removed){
  const t = zeroMacros();
  ((meal && meal.components) || []).forEach(c => {
    if (removed && removed.indexOf(c.itemId) !== -1) return;
    const amt = (overrides && overrides[c.itemId] != null) ? overrides[c.itemId] : c.amount;
    const it = itemsById[c.itemId];
    if (it) addInto(t, macrosForAmount(it, amt));
  });
  if (meal && meal.addedOil && meal.addedOil.grams) addInto(t, oilMacros(meal.addedOil.grams));
  return t;
}

/* Macros for a single log entry (item | meal | adhoc), including its own oil.
 *
 * macroOverride: a one-off correction on THIS entry, used when he fixes the
 * calories on a plate-photo row that matched an existing pantry item. It
 * replaces the computed macros for this entry only — the item's own per100 is
 * left alone, so correcting a bad photo estimate can never overwrite a ⭐
 * verified item he calibrated by weighing. Oil is still added on top, because
 * the oil chip is a separate statement about the same entry. */
function entryMacros(entry, itemsById, mealsById){
  let m = zeroMacros();
  if (!entry) return m;
  if (entry.macroOverride){
    const o = entry.macroOverride;
    m = { kcal:+o.kcal||0, protein:+o.protein||0, carbs:+o.carbs||0, fat:+o.fat||0,
          fiber:(o.fiber!=null?+o.fiber:0), hasFiber:o.fiber!=null };
    if (entry.oil && entry.oil.grams) m = addInto(Object.assign(zeroMacros(), m), oilMacros(entry.oil.grams));
    return m;
  }
  if (entry.kind === 'item'){
    const it = itemsById[entry.itemId];
    if (it) m = macrosForAmount(it, entry.amount);              // amount stored in base units
  } else if (entry.kind === 'meal'){
    const meal = mealsById[entry.mealId];
    if (meal){ const mt = mealTotals(meal, itemsById, entry.overrides, entry.removed); const n = Number(entry.servings) || 1;
      m = { kcal:mt.kcal*n, protein:mt.protein*n, carbs:mt.carbs*n, fat:mt.fat*n, fiber:mt.fiber*n, hasFiber:mt.hasFiber }; }
  } else if (entry.kind === 'adhoc'){
    m = { kcal:+entry.kcal||0, protein:+entry.protein||0, carbs:+entry.carbs||0, fat:+entry.fat||0,
          fiber:(entry.fiber!=null?+entry.fiber:0), hasFiber:entry.fiber!=null };
  }
  // per-entry oil (home-cooked items / meals prompt for oil at log time, spec §6)
  if (entry.oil && entry.oil.grams) m = addInto(Object.assign(zeroMacros(), m), oilMacros(entry.oil.grams));
  return m;
}

/* Deterministic day total (spec §5.4): sum all entries + optional day-level oil.
 * This total is what writes into the existing tracker's calories/proteinAmt (§7). */
function dayTotals(logDay, itemsById, mealsById){
  const t = zeroMacros();
  const entries = (logDay && logDay.entries) || [];
  entries.forEach(e => addInto(t, entryMacros(e, itemsById, mealsById)));
  if (logDay && logDay.addedOilTotal && logDay.addedOilTotal.grams) addInto(t, oilMacros(logDay.addedOilTotal.grams));
  return t;
}

/* Format a macro bundle for display (kcal integer, macros 1 decimal). */
function fmtMacros(m){
  return {
    kcal: roundKcal(m.kcal), protein: round1(m.protein), carbs: round1(m.carbs),
    fat: round1(m.fat), fiber: m.hasFiber ? round1(m.fiber) : null
  };
}
