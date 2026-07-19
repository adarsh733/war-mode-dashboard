/* app.js — bootstrap: runs LAST after all modules; loads data then renders active page */
paintDayCount();
loadDB().then(async ()=>{
  await loadGoals();
  await loadCheckins();
  paintDayCount();
  updateCheckinBadge();
  const active=document.querySelector('.page.active');
  if(active&&active.id==='t-log')renderWeek();
  if(active&&active.id==='t-history')renderHistory();
  if(active&&active.id==='t-checkin')renderCheckin();
});
