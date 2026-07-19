/* app.js — bootstrap: runs LAST after all modules; loads data then renders active page */
paintDayCount();
loadDB().then(async ()=>{
  await loadGoals();
  await loadCheckins();
  await loadFood();                 // Food data layer (local-first, cloud reconcile)
  paintDayCount();
  updateCheckinBadge();
  const active=document.querySelector('.page.active');
  if(active&&active.id==='t-log')renderWeek();
  if(active&&active.id==='t-history')renderHistory();
  if(active&&active.id==='t-checkin')renderCheckin();
  if(active&&active.id&&active.id.startsWith('food-'))go(active.id);
});
