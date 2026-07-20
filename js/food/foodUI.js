/* foodUI.js — rendering for the 🍽️ Food section (Phase 1, no AI).
 * Pantry, Today (hero rings + meal-slot sections + suggestions + logged
 * entries with inline edit/drag), Meals. All macro numbers come from
 * foodMath.js (deterministic); this file only formats and paints.
 */

/* his nutrition targets (spec §1) */
const FOOD_TARGETS = { kcal:1950, kcalMin:1900, protein:180, proteinRed:140, carbs:165, fat:55 };

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
  foodRing('ringKcal', totals.kcal, FOOD_TARGETS.kcal, over ? '--red' : '--green');
  foodRing('ringProt', totals.protein, FOOD_TARGETS.protein, totals.protein>=FOOD_TARGETS.protein ? '--green' : (totals.protein<FOOD_TARGETS.proteinRed ? '--red':'--amber'));
}

function heroHtml(t){
  const kcalPct = Math.round(t.kcal/FOOD_TARGETS.kcal*100);
  const protPct = Math.round(t.protein/FOOD_TARGETS.protein*100);
  const P=t.protein*4, C=t.carbs*4, F=t.fat*9, tot=P+C+F||1;
  const w=v=>Math.max(0,Math.min(100,Math.round(v)));
  return `
  <div class="card fhero">
    <div class="fhero-rings">
      <div class="fring-wrap">
        <canvas id="ringKcal" width="132" height="132"></canvas>
        <div class="fring-center"><span class="fring-val">${t.kcal.toLocaleString()}</span><span class="fring-lbl">kcal</span><span class="fring-goal">${kcalPct}% of ${FOOD_TARGETS.kcalMin.toLocaleString()}</span></div>
      </div>
      <div class="fring-wrap">
        <canvas id="ringProt" width="132" height="132"></canvas>
        <div class="fring-center"><span class="fring-val">${t.protein}<small>g</small></span><span class="fring-lbl">protein</span><span class="fring-goal">${protPct}% of ${FOOD_TARGETS.protein}g</span></div>
      </div>
    </div>
    <div class="fhero-macros">
      <div class="fmac"><span class="fmac-k">Carbs</span><span class="fmac-v">${t.carbs}g</span></div>
      <div class="fmac"><span class="fmac-k">Fat</span><span class="fmac-v">${t.fat}g</span></div>
      ${t.fiber!=null?`<div class="fmac"><span class="fmac-k">Fiber</span><span class="fmac-v">${t.fiber}g</span></div>`:''}
    </div>
    <div class="macrobar">
      <div style="width:${w(P/tot*100)}%;background:var(--green)" title="Protein"></div>
      <div style="width:${w(C/tot*100)}%;background:var(--amber)" title="Carbs"></div>
      <div style="width:${w(F/tot*100)}%;background:var(--accent)" title="Fat"></div>
    </div>
    <div class="macrolegend"><span><i style="background:var(--green)"></i>Protein</span><span><i style="background:var(--amber)"></i>Carbs</span><span><i style="background:var(--accent)"></i>Fat</span></div>
  </div>
  <div class="fquick">
    <input class="fsearch-input" id="quickSearch" placeholder="🔍 Search a food or meal to log…" autocomplete="off" oninput="renderQuickResults&&renderQuickResults(this.value)">
    <div id="quickResults" class="flist fsearch-results"></div>
    <div class="fquick-actions">
      <button class="chip" onclick="repeatYesterday&&repeatYesterday()">↻ Repeat yesterday</button>
      <button class="chip" onclick="go('food-meals')">🍲 Meals</button>
      <button class="chip" onclick="go('food-add')">＋ New item</button>
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
        <div class="fslot-sub">${st.kcal} kcal · ${st.protein}g P</div>
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
      <div class="fmain" onclick="toggleEntryEdit(${i})"><div class="fname">${htmlSafe(entryName(e))}</div><div class="fsub">${sub}</div></div>
      <div class="fkcal">${m.kcal}<small>kcal</small></div>
      <button class="btn-sm" onclick="toggleEntryEdit(${i})" title="Edit">✎</button>
      <button class="btn-sm danger" onclick="removeEntry(${i})" title="Remove">✕</button>
    </div>
    <div class="enteditor" id="enteditor_${i}" style="display:none"></div>`;
}

/* ---------- inline entry editor ---------- */
function toggleEntryEdit(i){
  const el=document.getElementById('enteditor_'+i); if(!el) return;
  if(el.style.display!=='none'){ el.style.display='none'; el.innerHTML=''; return; }
  document.querySelectorAll('.enteditor').forEach(d=>{ d.style.display='none'; d.innerHTML=''; });
  const day=logForDate(foodDate); const e=day.entries[i]; if(!e) return;
  const slotChipsHtml = TODAY_SLOTS.map(([k,l,em])=>`<button type="button" class="fchip ${((e.meal||'')===k)?'on':''}" onclick="entrySetSlot(${i},'${k}')">${em} ${l}</button>`).join('');

  if(e.kind==='item'){
    const it=FOOD_ITEMS[e.itemId]; const u=baseUnit(it);
    // current qty/unit from disp or amount
    const opts=(it.servings||[]).map((s,si)=>`<option value="${si}">${htmlSafe(s.label)}</option>`).join('')+`<option value="-1">${u} (base)</option>`;
    el.innerHTML=`<div class="ented-inner">
      <div class="fslot-chips">${slotChipsHtml}</div>
      <div class="frow2"><div><label class="flabel">Quantity</label><input class="finput" type="number" inputmode="decimal" id="ented_qty_${i}" value="${e.disp?e.disp.qty:e.amount}" oninput="entryEditPreview(${i})"></div>
      <div><label class="flabel">Measure</label><select class="finput" id="ented_unit_${i}" onchange="entryEditPreview(${i})">${opts}</select></div></div>
      ${it.isHomeCooked?`<label class="flabel">🍳 Oil / ghee</label><div class="fslot-chips" id="ented_oil_${i}">${[['0','None',0],['5','1 tsp',5],['14','1 tbsp',14]].map(([v,l,g])=>`<button type="button" class="fchip ${((e.oil&&e.oil.grams)||0)==g?'on':''}" onclick="entrySetOil(${i},${g})">${l}</button>`).join('')}</div>`:''}
      <div class="flog-preview" id="ented_prev_${i}"></div>
      <button class="btn-primary" onclick="saveEntryEdit(${i})">Save</button>
    </div>`;
    // preselect unit
    const sel=document.getElementById('ented_unit_'+i);
    sel.value = (e.disp && e.disp.unit && it.servings.findIndex(s=>s.label===e.disp.unit)>=0) ? it.servings.findIndex(s=>s.label===e.disp.unit) : -1;
    el.style.display='block'; entryEditPreview(i);
  } else if(e.kind==='meal'){
    const meal=FOOD_MEALS[e.mealId];
    const comps=(meal.components||[]).map(c=>{
      const it=FOOD_ITEMS[c.itemId]; if(!it) return '';
      const removed=e.removed&&e.removed.includes(c.itemId);
      const amt=(e.overrides&&e.overrides[c.itemId]!=null)?e.overrides[c.itemId]:c.amount;
      const cm=fmtMacros(macrosForAmount(it,removed?0:amt));
      return `<div class="fserv-row ${removed?'removed':''}">
        <div class="fmain"><div class="fname">${htmlSafe(it.name)}</div><div class="fsub">${cm.kcal} kcal · ${cm.protein}g P</div></div>
        <input class="finput fserv-amt" type="number" inputmode="decimal" value="${amt}" ${removed?'disabled':''} oninput="mealEntrySetAmount(${i},'${c.itemId}',this.value)"><span class="funit">${baseUnit(it)}</span>
        <button type="button" class="btn-sm ${removed?'':'danger'}" onclick="mealEntryToggleRemove(${i},'${c.itemId}')">${removed?'undo':'✕'}</button></div>`;
    }).join('');
    el.innerHTML=`<div class="ented-inner">
      <div class="fslot-chips">${slotChipsHtml}</div>
      <div class="frow2"><div><label class="flabel">Servings</label><input class="finput" type="number" inputmode="decimal" id="ented_qty_${i}" value="${e.servings||1}" oninput="entryEditPreview(${i})"></div></div>
      <div class="sec-label" style="margin-top:10px">Ingredients — just for today</div>
      ${comps}
      <div class="flog-preview" id="ented_prev_${i}"></div>
      <button class="btn-primary" onclick="saveEntryEdit(${i})">Save</button>
    </div>`;
    el.style.display='block'; entryEditPreview(i);
  }
}
function entrySetSlot(i,k){ const day=logForDate(foodDate); if(day.entries[i]){ day.entries[i].meal=k; } document.querySelectorAll(`#enteditor_${i} .fslot-chips .fchip`).forEach(b=>b.classList.toggle('on', b.textContent.trim().toLowerCase().includes(k))); }
function entrySetOil(i,g){ const day=logForDate(foodDate); const e=day.entries[i]; e.oil = g>0?{grams:g,type:'oil'}:null; document.querySelectorAll(`#ented_oil_${i} .fchip`).forEach(b=>b.classList.remove('on')); event.target.classList.add('on'); entryEditPreview(i); }
function mealEntrySetAmount(i,itemId,v){ const day=logForDate(foodDate); const e=day.entries[i]; e.overrides=e.overrides||{}; e.overrides[itemId]=parseFloat(v)||0; entryEditPreview(i); }
function mealEntryToggleRemove(i,itemId){ const day=logForDate(foodDate); const e=day.entries[i]; e.removed=e.removed||[]; const p=e.removed.indexOf(itemId); if(p>=0)e.removed.splice(p,1); else e.removed.push(itemId); toggleEntryEdit(i); toggleEntryEdit(i); }
function entryEditPreview(i){
  const day=logForDate(foodDate); const e=day.entries[i]; if(!e) return;
  // reflect current inputs into a temp copy for preview
  const tmp=JSON.parse(JSON.stringify(e));
  const qEl=document.getElementById('ented_qty_'+i);
  if(e.kind==='item'){
    const it=FOOD_ITEMS[e.itemId]; const unitEl=document.getElementById('ented_unit_'+i);
    const qty=parseFloat(qEl.value)||0; const si=parseInt(unitEl.value);
    tmp.amount=toBaseAmount(it,qty,si);
  } else { tmp.servings=parseFloat(qEl.value)||0; }
  const m=fmtMacros(entryMacros(tmp,FOOD_ITEMS,FOOD_MEALS));
  const el=document.getElementById('ented_prev_'+i);
  if(el) el.innerHTML=`<div class="flog-macros"><span class="flog-kcal">${m.kcal}<small>kcal</small></span><span>${m.protein}g P</span><span>${m.carbs}g C</span><span>${m.fat}g F</span></div>`;
}
function saveEntryEdit(i){
  const day=logForDate(foodDate); const e=day.entries[i]; if(!e) return;
  const qEl=document.getElementById('ented_qty_'+i);
  if(e.kind==='item'){
    const it=FOOD_ITEMS[e.itemId]; const si=parseInt(document.getElementById('ented_unit_'+i).value);
    const qty=parseFloat(qEl.value)||0; e.amount=toBaseAmount(it,qty,si);
    e.disp={ qty, unit: si>=0?it.servings[si].label:baseUnit(it) };
  } else { e.servings=parseFloat(qEl.value)||1; }
  markDayDirty(); saveLogDay(foodDate); renderToday();
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
