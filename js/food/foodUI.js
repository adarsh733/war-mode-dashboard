/* foodUI.js — rendering for the 🍽️ Food section (Phase 1, no AI).
 * Pantry (browse/search/detail), Today (targets + running totals), Meals list,
 * Add-Item entry point. Interactive logging/editing flows are layered on next.
 * All macro numbers come from foodMath.js (deterministic); this file only
 * formats and paints, matching the app's existing components/tokens.
 */

/* his nutrition targets (spec §1) */
const FOOD_TARGETS = { kcalMin:1900, kcalMax:1950, protein:180, proteinRed:140, carbs:165, fat:55 };

const TRUST_BADGE = {
  verified: '<span class="pill p-green" title="Verified — measured or scanned">⭐ Verified</span>',
  ai:       '<span class="pill p-amber" title="AI estimate — unverified">🤖 AI</span>',
  seed:     '<span class="pill p-blue" title="Generic seed — calibrate to your kitchen">🌱 Seed</span>'
};
const TRUST_DOT = { verified:'⭐', ai:'🤖', seed:'🌱' };

/* colored letter-avatar (HealthifyMe-style), using the app's soft palette */
const _AVA = ['--green-bg','--amber-bg','--red-bg','--blue-bg','--accent-soft'];
const _AVA_INK = ['--green','--amber','--red','--blue','--accent'];
function avatarFor(name){
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
  const idx=h%_AVA.length;
  const L=(name.trim()[0]||'?').toUpperCase();
  return `<span class="favatar" style="background:var(${_AVA[idx]});color:var(${_AVA_INK[idx]})">${L}</span>`;
}

/* macros for an item at its default serving (for list rows) */
function defaultServingMacros(it){
  const idx = it.defaultServingIndex;
  const base = (idx!=null && idx>=0 && it.servings[idx]) ? it.servings[idx].amount : 100;
  const label = (idx!=null && idx>=0 && it.servings[idx]) ? it.servings[idx].label : ('100 '+baseUnit(it));
  return { m: fmtMacros(macrosForAmount(it, base)), label };
}

/* ══════════ PANTRY ══════════ */
let _pantryQuery = '';
function renderPantry(){
  const box = document.getElementById('pantryList'); if(!box) return;
  const items = Object.values(FOOD_ITEMS);
  const q = _pantryQuery.trim().toLowerCase();
  const filtered = items
    .filter(it => !q || (it.name+' '+(it.brand||'')+' '+(it.tags||[]).join(' ')).toLowerCase().includes(q))
    .sort((a,b) => (b.useCount||0)-(a.useCount||0) || a.name.localeCompare(b.name));

  const cnt = document.getElementById('pantryCount');
  if(cnt) cnt.textContent = items.length + ' items' + (q ? ` · ${filtered.length} match` : '');

  if(!filtered.length){ box.innerHTML = `<div class="fempty">No items${q?' match “'+htmlSafe(q)+'”':''}. <button class="chip" onclick="go('food-add')">+ Add one</button></div>`; return; }

  box.innerHTML = filtered.map(it => {
    const d = defaultServingMacros(it);
    return `<div class="frow" onclick="toggleItemDetail('${it.id}')">
      ${avatarFor(it.name)}
      <div class="fmain">
        <div class="fname">${htmlSafe(it.name)} <span class="ftrust">${TRUST_DOT[it.trust]||''}</span></div>
        <div class="fsub">${htmlSafe(d.label)} · ${d.m.protein}g protein</div>
      </div>
      <div class="fkcal">${d.m.kcal}<small>kcal</small></div>
    </div>
    <div class="fdetail" id="det_${it.id}" style="display:none"></div>`;
  }).join('');
}
function setPantryQuery(v){ _pantryQuery = v; renderPantry(); }

function toggleItemDetail(id){
  const el = document.getElementById('det_'+id); if(!el) return;
  if(el.style.display!=='none'){ el.style.display='none'; el.innerHTML=''; return; }
  document.querySelectorAll('.fdetail').forEach(d=>{ d.style.display='none'; d.innerHTML=''; });
  const it = FOOD_ITEMS[id]; if(!it) return;
  const p = it.per100, u = baseUnit(it);
  const servRows = (it.servings||[]).map(s=>{
    const m = fmtMacros(macrosForAmount(it, s.amount));
    return `<tr><td>${htmlSafe(s.label)}</td><td>${s.amount} ${u}</td><td>${m.kcal}</td><td>${m.protein}g</td></tr>`;
  }).join('') || `<tr><td colspan="4" class="subtle">No household servings — grams/ml only.</td></tr>`;
  el.innerHTML = `
    <div class="fdet-inner">
      <div class="fdet-head">${TRUST_BADGE[it.trust]||''} ${it.brand?`<span class="pill p-ink">${htmlSafe(it.brand)}</span>`:''} ${it.isHomeCooked?'<span class="pill p-amber">🍳 home-cooked</span>':''}</div>
      <div class="fdet-per100">Per 100${u}: <b>${p.kcal}</b> kcal · ${p.protein}g P · ${p.carbs}g C · ${p.fat}g F${p.fiber!=null?` · ${p.fiber}g fiber`:''}</div>
      <table class="ftable"><thead><tr><th>Serving</th><th>Amount</th><th>kcal</th><th>Protein</th></tr></thead><tbody>${servRows}</tbody></table>
      ${it.notes?`<div class="note" style="margin-top:8px"><div>${htmlSafe(it.notes)}</div></div>`:''}
      <div class="fdet-actions">
        <button class="btn-sm" onclick="event.stopPropagation();editItem('${it.id}')">✎ Edit</button>
        <button class="btn-sm danger" onclick="event.stopPropagation();confirmDeleteItem('${it.id}')">🗑 Delete</button>
      </div>
    </div>`;
  el.style.display='block';
}
function confirmDeleteItem(id){
  const it = FOOD_ITEMS[id]; if(!it) return;
  if(confirm(`Delete “${it.name}” from your pantry?`)){ deleteItem(id); renderPantry(); }
}
function editItem(id){ go('food-add'); setTimeout(()=>{ if(typeof loadItemIntoForm==='function') loadItemIntoForm(id); }, 30); }
function confirmDeleteMeal(id){ const m=FOOD_MEALS[id]; if(m && confirm(`Delete meal “${m.name}”?`)){ deleteMeal(id); renderMeals(); } }

/* ══════════ TODAY ══════════ */
let foodDate = (typeof todayStr==='function') ? todayStr() : new Date().toISOString().slice(0,10);
function renderToday(){
  const wrap = document.getElementById('todayBody'); if(!wrap) return;
  const day = logForDate(foodDate);
  const totals = fmtMacros(dayTotals(day, FOOD_ITEMS, FOOD_MEALS));

  // date label
  const dl = document.getElementById('foodDateLabel');
  if(dl) dl.textContent = (typeof fmtDate==='function') ? fmtDate(foodDate) : foodDate;

  const kcalCls = totals.kcal===0 ? 'p-ink' : (totals.kcal<=FOOD_TARGETS.kcalMax ? 'p-green' : 'p-red');
  const protCls = totals.protein>=FOOD_TARGETS.protein ? 'p-green' : (totals.protein<FOOD_TARGETS.proteinRed ? 'p-red' : 'p-amber');
  const barPct = v => Math.min(100, Math.round(v));

  const macroBar = () => {
    const P=totals.protein*4, C=totals.carbs*4, F=totals.fat*9; const tot=P+C+F||1;
    return `<div class="macrobar">
      <div style="width:${barPct(P/tot*100)}%;background:var(--green)"></div>
      <div style="width:${barPct(C/tot*100)}%;background:var(--amber)"></div>
      <div style="width:${barPct(F/tot*100)}%;background:var(--accent)"></div>
    </div>
    <div class="macrolegend"><span>🥩 P ${totals.protein}g</span><span>🍚 C ${totals.carbs}g</span><span>🥑 F ${totals.fat}g</span>${totals.fiber!=null?`<span>🌿 Fib ${totals.fiber}g</span>`:''}</div>`;
  };

  const entries = (day && day.entries) || [];
  const entriesHtml = entries.length ? renderEntryList(entries) :
    `<div class="fempty">Nothing logged yet. Use <b>Quick add</b> below, or <button class="chip" onclick="go('food-pantry')">browse Pantry</button>.</div>`;

  wrap.innerHTML = `
    <div class="card ftoday-totals">
      <div class="ftt-row">
        <div class="ftt-big"><div class="k">Calories</div><div class="v"><span class="pill ${kcalCls}">${totals.kcal}</span> <small>/ ${FOOD_TARGETS.kcalMin}–${FOOD_TARGETS.kcalMax}</small></div></div>
        <div class="ftt-big"><div class="k">Protein</div><div class="v"><span class="pill ${protCls}">${totals.protein}g</span> <small>/ ${FOOD_TARGETS.protein}g</small></div></div>
      </div>
      ${macroBar()}
    </div>
    <div class="sec-label">Quick add</div>
    <div class="fquick">
      <input class="dsearch" id="quickSearch" placeholder="Search items &amp; meals to log…" autocomplete="off" oninput="renderQuickResults&&renderQuickResults(this.value)">
      <div class="fquick-actions">
        <button class="chip" onclick="repeatYesterday&&repeatYesterday()">↻ Repeat yesterday</button>
        <button class="chip" onclick="go('food-meals')">Meals</button>
        <button class="chip" onclick="go('food-add')">+ New item</button>
      </div>
      <div id="quickResults" class="flist"></div>
    </div>
    <div class="sec-label">Logged today</div>
    ${entriesHtml}`;
}
function renderEntryList(entries){
  const slots = { breakfast:[], lunch:[], dinner:[], snack:[], '':[] };
  entries.forEach((e,i)=>{ (slots[e.meal||'']=slots[e.meal||'']||[]).push({e,i}); });
  const order=[['breakfast','🌅 Breakfast'],['lunch','☀️ Lunch'],['dinner','🌙 Dinner'],['snack','🍎 Snack'],['','Other']];
  let html='';
  order.forEach(([k,label])=>{
    const list=slots[k]; if(!list||!list.length) return;
    html+=`<div class="fslot-label">${label}</div>`;
    list.forEach(({e,i})=>{
      const m=fmtMacros(entryMacros(e,FOOD_ITEMS,FOOD_MEALS));
      const name = e.kind==='item' ? (FOOD_ITEMS[e.itemId]?FOOD_ITEMS[e.itemId].name:'(deleted item)')
                 : e.kind==='meal' ? (FOOD_MEALS[e.mealId]?FOOD_MEALS[e.mealId].name:'(deleted meal)')
                 : (e.name||'Ad-hoc');
      html+=`<div class="frow logrow">
        <div class="fmain"><div class="fname">${htmlSafe(name)}</div><div class="fsub">${m.protein}g protein${e.oil&&e.oil.grams?` · +${e.oil.grams}g oil`:''}</div></div>
        <div class="fkcal">${m.kcal}<small>kcal</small></div>
        <button class="btn-sm danger" onclick="removeEntry(${i})">✕</button>
      </div>`;
    });
  });
  return html;
}
function removeEntry(i){
  const day=logForDate(foodDate); if(!day) return;
  day.entries.splice(i,1); saveLogDay(foodDate);
  if(typeof syncFoodToTracker==='function') syncFoodToTracker(foodDate);
  renderToday();
}
function foodShiftDate(n){ foodDate = addDays(foodDate, n); renderToday(); }

/* ══════════ MEALS ══════════ */
function renderMeals(){
  const box=document.getElementById('mealsList'); if(!box) return;
  const meals=Object.values(FOOD_MEALS);
  if(!meals.length){ box.innerHTML=`<div class="fempty">No meals yet. Build reusable bundles like “Oats Whey Smoothie”. <button class="chip" onclick="createMeal&&createMeal()">+ Create a meal</button></div>`; return; }
  box.innerHTML = meals.sort((a,b)=>a.name.localeCompare(b.name)).map(meal=>{
    const t=fmtMacros(mealTotals(meal,FOOD_ITEMS));
    return `<div class="frow">
      ${avatarFor(meal.name)}
      <div class="fmain" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')"><div class="fname">${htmlSafe(meal.name)}</div><div class="fsub">${(meal.components||[]).length} items · ${t.protein}g protein · ${t.kcal} kcal</div></div>
      <button class="btn-sm" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')">＋ log</button>
      <button class="btn-sm" onclick="editMealById&&editMealById('${meal.id}')">✎</button>
      <button class="btn-sm danger" onclick="confirmDeleteMeal('${meal.id}')">🗑</button>
    </div>`;
  }).join('');
}

/* ══════════ ADD ITEM — form lives in foodForm.js (loaded after this file) ══════════ */
