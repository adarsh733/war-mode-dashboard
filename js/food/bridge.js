/* bridge.js — Food → Tracker integration (spec §7), now MANUAL.
 *
 * Change per feedback: logging no longer auto-pushes to the tracker (that was
 * prematurely ticking under2k/protein mid-day). Instead the user hits
 * "Done for the day" and finishDay() pushes the finalized totals. Editing a
 * day after it was pushed marks it dirty so the button offers to update.
 *
 * Overwrite rule (spec §7): food totals overwrite calories/protein only on
 * dates with food entries; manual-only days stay untouched.
 */

/* mark that a pushed day has changed since it was sent (button → "Update Tracker") */
function markDayDirty(){
  const day = logForDate(foodDate);
  if(day && day.pushed) day.dirty = true;
}

/* explicit push: finalize the day into the tracker */
function finishDay(){
  const day = logForDate(foodDate);
  if(!day || !(day.entries||[]).length){ alert('Log something first.'); return; }
  syncFoodToTracker(foodDate);
  day.pushed = true; day.dirty = false;
  day.pushedTotals = fmtMacros(dayTotals(day, FOOD_ITEMS, FOOD_MEALS));
  saveLogDay(foodDate);
  if(typeof renderToday === 'function') renderToday();
}

/* write the day's deterministic total into the tracker for that date */
function syncFoodToTracker(date){
  if(typeof DB === 'undefined') return;
  const day = logForDate(date);
  if(!day || !(day.entries||[]).length) return;   // no entries → don't touch manual values

  const t = fmtMacros(dayTotals(day, FOOD_ITEMS, FOOD_MEALS));
  if(!DB[date]) DB[date] = {};
  DB[date].calories   = t.kcal;
  DB[date].proteinAmt = t.protein;

  if(typeof applyAuto === 'function') applyAuto(DB[date], date);   // re-tick under2k / protein
  if(typeof persist === 'function')  persist(date);               // local + cloud

  const active = document.querySelector('.page.active');
  if(active){
    if(active.id === 't-log'     && typeof renderWeek    === 'function') renderWeek();
    if(active.id === 't-history' && typeof renderHistory === 'function') renderHistory();
  }
}
