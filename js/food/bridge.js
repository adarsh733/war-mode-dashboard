/* bridge.js — the integration between Food and the existing Tracker (spec §7).
 * After any change to a day's food log, write the deterministic day total into
 * the tracker's calories/proteinAmt for that date, re-tick the auto habits
 * (under2k/protein) and persist — so his compliance scoring & charts update
 * from what he actually ate.
 *
 * Overwrite rule (spec §7, confirmed): food totals overwrite calories/protein
 * ONLY on dates that have food entries; days with no food entries keep their
 * manually-typed values untouched.
 */
function syncFoodToTracker(date){
  if(typeof DB === 'undefined') return;
  const day = logForDate(date);
  if(!day || !day.entries || !day.entries.length) return;   // no food entries → don't touch manual values

  const t = fmtMacros(dayTotals(day, FOOD_ITEMS, FOOD_MEALS));
  if(!DB[date]) DB[date] = {};
  DB[date].calories   = t.kcal;
  DB[date].proteinAmt = t.protein;

  if(typeof applyAuto === 'function') applyAuto(DB[date], date);   // re-tick under2k / protein habits
  if(typeof persist === 'function')  persist(date);               // local + cloud

  // refresh the tracker view if it's the one on screen
  const active = document.querySelector('.page.active');
  if(active){
    if(active.id === 't-log'     && typeof renderWeek    === 'function') renderWeek();
    if(active.id === 't-history' && typeof renderHistory === 'function') renderHistory();
  }
}
