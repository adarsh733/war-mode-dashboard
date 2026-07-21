/* foodUI.js — rendering for the 🍽️ Food section (Phase 1, no AI).
 * Pantry, Today (hero rings + meal-slot sections + suggestions + logged
 * entries with inline edit/drag), Meals. All macro numbers come from
 * foodMath.js (deterministic); this file only formats and paints.
 */

/* his nutrition targets (spec §1) */
const FOOD_TARGETS = { kcal:1750, buffer:150, protein:180, proteinRed:140 };

const TRUST_BADGE = {
  verified: '<span class="pill p-green" title="Verified — measured or scanned">⭐ Verified</span>',
  ai:       '<span class="pill p-amber" title="AI estimate — unverified">🤖 AI</span>',
  seed:     '<span class="pill p-blue" title="Generic seed — calibrate to your kitchen">🌱 Seed</span>'
};
const TRUST_DOT = { verified:'⭐', ai:'🤖', seed:'🌱' };
const KIND_BADGE = { item:'<span class="fbadge item">🥗 Item</span>', meal:'<span class="fbadge meal">🍲 Meal</span>', adhoc:'<span class="fbadge adhoc">✎ Ad-hoc</span>' };

const _AVA = ['--green-bg','--amber-bg','--red-bg','--blue-bg','--accent-soft'];
const _AVA_INK = ['--green','--amber','--red','--blue','--accent'];
function avatarFor(name){
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
  const idx=h%_AVA.length; const L=(name.trim()[0]||'?').toUpperCase();
  return `<span class="favatar" style="background:var(${_AVA[idx]});color:var(${_AVA_INK[idx]})">${L}</span>`;
}
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
  const filtered = items.filter(it => itemMatchesQuery(it, q))
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
      ${(it.aliases&&it.aliases.length)?`<div class="fdet-per100 subtle">also: ${it.aliases.map(htmlSafe).join(', ')}</div>`:''}
      <table class="ftable"><thead><tr><th>Serving</th><th>Amount</th><th>kcal</th><th>Protein</th></tr></thead><tbody>${servRows}</tbody></table>
      ${it.notes?`<div class="note" style="margin-top:8px"><div>${htmlSafe(it.notes)}</div></div>`:''}
      <div class="fdet-actions">
        <button class="btn-sm" onclick="event.stopPropagation();openItemLogSheet('${it.id}')">＋ Log</button>
        <button class="btn-sm" onclick="event.stopPropagation();editItem('${it.id}')">✎ Edit</button>
        <button class="btn-sm danger" onclick="event.stopPropagation();confirmDeleteItem('${it.id}')">🗑 Delete</button>
      </div>
    </div>`;
  el.style.display='block';
}
function confirmDeleteItem(id){ const it=FOOD_ITEMS[id]; if(it && confirm(`Delete “${it.name}” from your pantry?`)){ deleteItem(id); renderPantry(); } }
function editItem(id){ go('food-add'); setTimeout(()=>{ if(typeof loadItemIntoForm==='function') loadItemIntoForm(id); }, 30); }
function confirmDeleteMeal(id){ const m=FOOD_MEALS[id]; if(m && confirm(`Delete meal “${m.name}”?`)){ deleteMeal(id); renderMeals(); } }

/* ══════════ TODAY ══════════ */
let foodDate = (typeof todayStr==='function') ? todayStr() : new Date().toISOString().slice(0,10);
const foodCharts = {};
const TODAY_SLOTS = [['breakfast','Breakfast','🌅'],['lunch','Lunch','☀️'],['dinner','Dinner','🌙'],['snack','Snacks','🍎']];

function renderToday(){
  const wrap = document.getElementById('todayBody'); if(!wrap) return;
  const day = logForDate(foodDate);
  const entries = (day && day.entries) || [];
  const totals = fmtMacros(dayTotals(day, FOOD_ITEMS, FOOD_MEALS));

  const dl = document.getElementById('foodDateLabel');
  if(dl) dl.textContent = (typeof fmtDate==='function') ? fmtDate(foodDate) : foodDate;

  wrap.innerHTML = heroHtml(totals) + slotsHtml(entries) + doneHtml(day, entries);

  // draw rings after DOM exists
  const over = totals.kcal > FOOD_TARGETS.kcal;
  foodRing('ringKcal', totals.kcal, FOOD_TARGETS.kcal, over ? '--fred' : '--fgreen');
  foodRing('ringProt', totals.protein, FOOD_TARGETS.protein, totals.protein>=FOOD_TARGETS.protein ? '--fgreen' : (totals.protein<FOOD_TARGETS.proteinRed ? '--fred':'--famber'));
}

function heroHtml(t){
  const kcalLeft = FOOD_TARGETS.kcal - t.kcal;
  const protLeft = Math.max(0, FOOD_TARGETS.protein - t.protein);
  return `
  <div class="fcard fhero">
    <div class="fhero-rings">
      <div class="fring-wrap">
        <canvas id="ringKcal" width="132" height="132"></canvas>
        <div class="fring-center"><span class="fring-val">${t.kcal.toLocaleString()}</span><span class="fring-lbl">/ ${FOOD_TARGETS.kcal.toLocaleString()}</span></div>
      </div>
      <div class="fring-wrap">
        <canvas id="ringProt" width="132" height="132"></canvas>
        <div class="fring-center"><span class="fring-val">${t.protein}<small>g</small></span><span class="fring-lbl">/ ${FOOD_TARGETS.protein}g</span></div>
      </div>
    </div>
    <div class="fhero-caps">
      <div class="fhero-cap">${kcalLeft>=0?`<b>${kcalLeft.toLocaleString()}</b> kcal left`:`<b class="over">${(-kcalLeft).toLocaleString()}</b> over`}</div>
      <div class="fhero-cap">${protLeft>0?`<b>${protLeft}g</b> protein to go`:`<b class="good">goal hit ✓</b>`}</div>
    </div>
    <div class="fhero-buf">Tracking ${FOOD_TARGETS.kcal.toLocaleString()} kcal · ${FOOD_TARGETS.buffer} kcal buffer for untracked snacks</div>
  </div>
  <div class="fquick">
    <input class="fsearch-input" id="quickSearch" placeholder="🔍 Search a food or meal…" autocomplete="off" oninput="renderQuickResults&&renderQuickResults(this.value)">
    <div id="quickResults" class="flist fsearch-results"></div>
    <div class="fquick-actions">
      <button class="fpill-btn ai" onclick="aiLogText&&aiLogText()">🗣 Log by typing</button>
      <button class="fpill-btn ai" onclick="aiScanPlate&&aiScanPlate()">🍽 Plate photo</button>
      <button class="fpill-btn" onclick="repeatYesterday&&repeatYesterday()">↻ Repeat yesterday</button>
      <button class="fpill-btn" onclick="go('food-meals')">🍲 Meals</button>
      <button class="fpill-btn" onclick="go('food-add')">＋ New item</button>
    </div>
  </div>`;
}

function slotsHtml(entries){
  let html = '';
  TODAY_SLOTS.forEach(([k,label,emoji])=>{
    const idxs = entries.map((e,i)=>({e,i})).filter(x=>(x.e.meal||'')===k || (k==='snack' && (x.e.meal||'')===''));
    const st = fmtMacros(idxs.reduce((acc,x)=>addInto(acc, entryMacros(x.e,FOOD_ITEMS,FOOD_MEALS)), zeroMacros()));
    const sugg = (typeof suggestionsFor==='function') ? suggestionsFor(k) : [];
    html += `
    <section class="fslot" ondragover="foodDragOver(event)" ondrop="foodDropSlot(event,'${k}')">
      <div class="fslot-head">
        <div class="fslot-title">${emoji} ${label}</div>
        <div class="fslot-right"><span class="fslot-sub">${st.kcal} kcal · ${st.protein}g P</span><button class="fslot-add" onclick="openSlotAdd('${k}')" title="Add to ${label}">＋</button></div>
      </div>
      ${sugg.length?`<div class="fsugg-row">${sugg.map(s=>`<button class="fsugg-chip ${s.type}" onclick="quickLogSuggestion('${k}','${s.type}','${s.id}')" title="${s.kcal} kcal · ${s.protein}g P">${s.type==='meal'?'🍲':'🥗'} ${htmlSafe(s.name)} <b>＋</b></button>`).join('')}<button class="fsugg-edit" onclick="openSuggestManager('${k}')" title="Edit suggestions">✎</button></div>`
        : `<div class="fsugg-row"><button class="fsugg-edit wide" onclick="openSuggestManager('${k}')">✎ Add your usual ${label.toLowerCase()} foods</button></div>`}
      <div class="fslot-entries">
        ${idxs.length ? idxs.map(x=>entryRowHtml(x.e,x.i,k)).join('') : '<div class="fslot-empty">— nothing yet —</div>'}
      </div>
    </section>`;
  });
  // any legacy 'other' entries with a non-standard slot
  const others = entries.map((e,i)=>({e,i})).filter(x=>x.e.meal && !['breakfast','lunch','dinner','snack'].includes(x.e.meal));
  if(others.length){ html += `<section class="fslot"><div class="fslot-head"><div class="fslot-title">Other</div></div><div class="fslot-entries">${others.map(x=>entryRowHtml(x.e,x.i,'')).join('')}</div></section>`; }
  return html;
}

function entryName(e){
  return e.kind==='item' ? (FOOD_ITEMS[e.itemId]?FOOD_ITEMS[e.itemId].name:'(deleted item)')
       : e.kind==='meal' ? (FOOD_MEALS[e.mealId]?FOOD_MEALS[e.mealId].name:'(deleted meal)')
       : (e.name||'Ad-hoc');
}
function entryRowHtml(e,i,slot){
  const m=fmtMacros(entryMacros(e,FOOD_ITEMS,FOOD_MEALS));
  const sub = e.kind==='item'
      ? `${e.disp?`${e.disp.qty} ${htmlSafe(e.disp.unit)} · `:''}${m.protein}g P${e.oil&&e.oil.grams?` · +${e.oil.grams}g oil`:''}`
      : e.kind==='meal'
      ? `${e.servings||1} serving${(e.servings||1)!=1?'s':''} · ${m.protein}g P${(e.overrides||e.removed)?' · edited':''}${e.oil&&e.oil.grams?` · +${e.oil.grams}g oil`:''}`
      : `${m.protein}g P`;
  return `<div class="logrow" draggable="true" data-idx="${i}" ondragstart="foodDragStart(event,${i})" ondragover="foodDragOver(event)" ondrop="foodDropRow(event,${i},'${slot}')">
      <span class="fdrag" title="Drag to reorder">⠿</span>
      ${KIND_BADGE[e.kind]||''}
      <div class="fmain" onclick="openEntryDetail(${i})"><div class="fname">${htmlSafe(entryName(e))}</div><div class="fsub">${sub}</div></div>
      <div class="fkcal">${m.kcal}<small>kcal</small></div>
      <button class="btn-sm danger" onclick="event.stopPropagation();removeEntry(${i})" title="Remove">✕</button>
    </div>`;
}

function removeEntry(i){ const day=logForDate(foodDate); if(!day) return; day.entries.splice(i,1); markDayDirty(); saveLogDay(foodDate); renderToday(); }
function foodShiftDate(n){ foodDate = addDays(foodDate, n); renderToday(); }

/* ---------- drag reorder ---------- */
let _dragIdx=null;
function foodDragStart(ev,idx){ _dragIdx=idx; ev.dataTransfer.effectAllowed='move'; try{ev.dataTransfer.setData('text','x');}catch(e){} }
function foodDragOver(ev){ ev.preventDefault(); ev.dataTransfer.dropEffect='move'; }
function foodDropRow(ev,targetIdx,slot){ ev.preventDefault(); ev.stopPropagation(); if(_dragIdx==null||_dragIdx===targetIdx){_dragIdx=null;return;}
  const arr=logForDate(foodDate).entries; const [moved]=arr.splice(_dragIdx,1);
  let ti = _dragIdx<targetIdx ? targetIdx-1 : targetIdx; if(slot) moved.meal=slot; arr.splice(ti,0,moved);
  _dragIdx=null; markDayDirty(); saveLogDay(foodDate); renderToday(); }
function foodDropSlot(ev,slot){ ev.preventDefault(); if(_dragIdx==null)return;
  const arr=logForDate(foodDate).entries; const [moved]=arr.splice(_dragIdx,1); moved.meal=slot; arr.push(moved);
  _dragIdx=null; markDayDirty(); saveLogDay(foodDate); renderToday(); }

/* ---------- done-for-the-day bar ---------- */
function doneHtml(day, entries){
  if(!entries.length) return '';
  if(day && day.pushed && !day.dirty){
    return `<div class="fdone-bar done"><span>✓ Sent to Tracker — ${day.pushedTotals?day.pushedTotals.kcal:''} kcal · ${day.pushedTotals?day.pushedTotals.protein:''}g P</span><button class="btn-sm" onclick="finishDay()">re-send</button></div>`;
  }
  const label = (day && day.dirty) ? '↻ Update Tracker (changed since sent)' : '✓ Done for the day — send to Tracker';
  return `<div class="fdone-bar"><button class="btn-primary wide" onclick="finishDay()">${label}</button><div class="subtle" style="margin-top:8px;text-align:center">Calories &amp; protein only move to your Tracker when you press this.</div></div>`;
}

/* ---------- calories/protein ring (Chart.js doughnut) ---------- */
function foodRing(canvasId, value, target, colorVar){
  const el=document.getElementById(canvasId); if(!el || typeof Chart==='undefined') return;
  if(foodCharts[canvasId]) foodCharts[canvasId].destroy();
  const filled=Math.max(0, Math.min(value, target));
  const remain=Math.max(0.0001, target-value);
  const col=(typeof cssv==='function'&&cssv(colorVar))||'#2f7652';
  const track=(typeof cssv==='function'&&cssv('--paper2'))||'#ece8df';
  foodCharts[canvasId]=new Chart(el,{ type:'doughnut',
    data:{ datasets:[{ data:[filled, remain], backgroundColor:[col, track], borderWidth:0 }] },
    options:{ cutout:'76%', responsive:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, animation:{duration:450} } });
}

/* ══════════ MEALS ══════════ */
function renderMeals(){
  const box=document.getElementById('mealsList'); if(!box) return;
  const meals=Object.values(FOOD_MEALS).filter(m=>!String(m.id).startsWith('__'));
  if(!meals.length){ box.innerHTML=`<div class="fempty">No meals yet. Build reusable bundles like “Oats Whey Smoothie”. <button class="chip" onclick="createMeal&&createMeal()">+ Create a meal</button></div>`; return; }
  box.innerHTML = meals.sort((a,b)=>a.name.localeCompare(b.name)).map(meal=>{
    const t=fmtMacros(mealTotals(meal,FOOD_ITEMS));
    return `<div class="frow">
      ${avatarFor(meal.name)}
      <div class="fmain" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')"><div class="fname">${htmlSafe(meal.name)} <span class="fbadge meal">🍲 Meal</span></div><div class="fsub">${(meal.components||[]).length} items · ${t.kcal} kcal · ${t.protein}g P</div></div>
      <button class="btn-sm" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')">＋ log</button>
      <button class="btn-sm" onclick="editMealById&&editMealById('${meal.id}')">✎</button>
      <button class="btn-sm danger" onclick="confirmDeleteMeal('${meal.id}')">🗑</button>
    </div>`;
  }).join('');
}

/* ══════════ ADD ITEM — form lives in foodForm.js ══════════ */
