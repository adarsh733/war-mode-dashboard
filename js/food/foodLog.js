/* foodLog.js — Today logging + Meals builder (Phase 1, no AI).
 * Quick-add search → log sheet (quantity + measure + oil chip) → entry.
 * Every add shows a live math preview before committing (spec §8.1).
 * Meals builder: bundle items, save, log in one tap.
 */

/* ---------- bottom sheet ---------- */
function fsheetOpen(inner){
  let ov = document.getElementById('fsheetOverlay');
  if(!ov){
    ov = document.createElement('div'); ov.id='fsheetOverlay'; ov.className='fsheet-overlay';
    ov.addEventListener('click', e=>{ if(e.target===ov) fsheetClose(); });
    const sh = document.createElement('div'); sh.id='fsheet'; sh.className='fsheet'; ov.appendChild(sh);
    document.body.appendChild(ov);
  }
  document.getElementById('fsheet').innerHTML = inner;
  ov.classList.add('show');
}
function fsheetClose(){ const ov=document.getElementById('fsheetOverlay'); if(ov) ov.classList.remove('show'); }

/* ---------- default meal slot by time (today only) ---------- */
function defaultSlot(){
  if(foodDate !== (typeof todayStr==='function'?todayStr():foodDate)) return 'breakfast';
  const h = new Date().getHours();
  return h<11?'breakfast':h<16?'lunch':h<21?'dinner':'snack';
}
const SLOTS = [['breakfast','🌅 Breakfast'],['lunch','☀️ Lunch'],['dinner','🌙 Dinner'],['snack','🍎 Snack']];
function slotChips(sel){ return `<div class="fslot-chips">${SLOTS.map(([k,l])=>`<button type="button" class="fchip ${k===sel?'on':''}" onclick="logSetSlot('${k}')">${l}</button>`).join('')}</div>`; }
const OIL_CHIPS = [['none','None',0],['tsp','1 tsp',5],['tbsp','1 tbsp',14]];
function oilChips(sel){ return `<div class="fslot-chips">${OIL_CHIPS.map(([k,l,g])=>`<button type="button" class="fchip ${sel===g?'on':''}" onclick="logSetOil(${g})">${l}</button>`).join('')}<button type="button" class="fchip" onclick="logSetOilCustom()">custom…</button></div>`; }

/* ---------- quick add (search on Today) ---------- */
/* Search that survives a typo. `itemMatchesQuery` is a plain substring test, so
 * "panner" or "paneer lababdar sabzi" used to return nothing at all — the same
 * failure the AI logger had. foodMatch.js is the shared fix; substring results
 * still come first since an exact hit should never be reordered. */
function foodSearchItems(q, limit){
  const exact = Object.values(FOOD_ITEMS).filter(it => itemMatchesQuery(it, q))
      .sort((a,b)=>(b.useCount||0)-(a.useCount||0));
  if(exact.length >= (limit||10) || typeof fuzzyFindItems !== 'function') return exact.slice(0, limit||10);
  const seen = {}; exact.forEach(it => seen[it.id] = 1);
  const fuzzy = fuzzyFindItems(q, { limit: limit||10 }).map(h=>h.item).filter(it => !seen[it.id]);
  return exact.concat(fuzzy).slice(0, limit||10);
}
function foodSearchMeals(q, limit){
  const exact = Object.values(FOOD_MEALS).filter(m => !String(m.id).startsWith('__') && m.name.toLowerCase().includes(q));
  if(exact.length >= (limit||4) || typeof fuzzyFindMeals !== 'function') return exact.slice(0, limit||4);
  const seen = {}; exact.forEach(m => seen[m.id] = 1);
  const fuzzy = fuzzyFindMeals(q, { limit: limit||4 }).map(h=>h.meal).filter(m => !seen[m.id]);
  return exact.concat(fuzzy).slice(0, limit||4);
}

function renderQuickResults(q){
  const box = document.getElementById('quickResults'); if(!box) return;
  q = (q||'').trim().toLowerCase();
  if(q.length < 1){ box.innerHTML=''; return; }
  const meals = foodSearchMeals(q, 4);
  const items = foodSearchItems(q, 10);
  let html = '';
  meals.forEach(m=>{ const t=fmtMacros(mealTotals(m,FOOD_ITEMS));
    html += `<div class="frow" onclick="openMealLogSheet('${m.id}')">${avatarFor(m.name)}<div class="fmain"><div class="fname">${htmlSafe(m.name)} <span class="fkind meal" title="Meal">🍲</span></div><div class="fsub">${t.kcal} kcal · ${t.protein}g P</div></div><div class="fkcal">＋</div></div>`; });
  items.forEach(it=>{ const d=defaultServingMacros(it);
    html += `<div class="frow" onclick="openItemLogSheet('${it.id}')">${avatarFor(it.name)}<div class="fmain"><div class="fname">${htmlSafe(it.name)} <span class="ftrust">${TRUST_DOT[it.trust]||''}</span></div><div class="fsub">${htmlSafe(d.label)} · ${d.m.kcal} kcal · ${d.m.protein}g P</div></div><div class="fkcal">＋</div></div>`; });
  box.innerHTML = html || `<div class="fempty">No match. ${typeof aiNoMatchChips==='function'?aiNoMatchChips(q,''):''}
    <button class="chip" onclick="go('food-add')">✎ Add “${htmlSafe(q)}”</button></div>`;
}

/* ---------- per-slot add (the ＋ on a meal header) ---------- */
let _slotAddSlot='breakfast';
function openSlotAdd(slot){
  _slotAddSlot=slot;
  fsheetOpen(`<div class="fsheet-grab"></div>
    <div class="fsheet-title"><span class="favatar" style="background:var(--fgreen-bg);color:var(--fgreen)">＋</span><div><div class="fname">Add to ${slotLabel(slot)}</div><div class="fsub">search your foods &amp; meals</div></div></div>
    <input class="fsearch-input" id="slotAddSearch" placeholder="🔍 Search a food or meal…" autocomplete="off" oninput="renderSlotAddResults(this.value)">
    <div id="slotAddResults" class="flist fsearch-results" style="margin-top:10px"></div>`);
  setTimeout(()=>{ const el=document.getElementById('slotAddSearch'); if(el) el.focus(); }, 60);
}
function renderSlotAddResults(q){
  const box=document.getElementById('slotAddResults'); if(!box) return;
  q=(q||'').trim().toLowerCase(); if(q.length<1){ box.innerHTML=''; return; }
  const meals=foodSearchMeals(q,4);
  const items=foodSearchItems(q,10);
  let html='';
  meals.forEach(m=>{ const t=fmtMacros(mealTotals(m,FOOD_ITEMS)); html+=`<div class="frow" onclick="fsheetClose();openMealDetail('${m.id}',{slot:'${_slotAddSlot}'})">${avatarFor(m.name)}<div class="fmain"><div class="fname">${htmlSafe(m.name)} <span class="fkind meal" title="Meal">🍲</span></div><div class="fsub">${t.kcal} kcal · ${t.protein}g P</div></div><div class="fkcal">＋</div></div>`; });
  items.forEach(it=>{ const d=defaultServingMacros(it); html+=`<div class="frow" onclick="fsheetClose();openItemDetail('${it.id}',{slot:'${_slotAddSlot}'})">${avatarFor(it.name)}<div class="fmain"><div class="fname">${htmlSafe(it.name)} <span class="ftrust">${TRUST_DOT[it.trust]||''}</span></div><div class="fsub">${htmlSafe(d.label)} · ${d.m.kcal} kcal · ${d.m.protein}g P</div></div><div class="fkcal">＋</div></div>`; });
  box.innerHTML = html || `<div class="fempty">No match. ${typeof aiNoMatchChips==='function'?aiNoMatchChips(q,'fsheetClose();'):''}
    <button class="chip" onclick="fsheetClose();go('food-add')">✎ New item</button></div>`;
}

/* ---------- item log sheet (legacy — superseded by foodDetail.js) ---------- */
let _logDraft = null;
function openItemLogSheet(itemId){
  const it = FOOD_ITEMS[itemId]; if(!it) return;
  const di = (it.defaultServingIndex!=null && it.defaultServingIndex>=0) ? it.defaultServingIndex : -1;
  _logDraft = { kind:'item', itemId, slot:defaultSlot(), servingIndex:di, qty:1, oilGrams:0 };
  if(di<0) _logDraft.qty = 100;   // base unit default
  renderLogSheet();
}
function openMealLogSheet(mealId){
  const m = FOOD_MEALS[mealId]; if(!m) return;
  _logDraft = { kind:'meal', mealId, slot:defaultSlot(), servings:1, oilGrams:0 };
  renderLogSheet();
}
function logSetSlot(s){ _logDraft.slot=s; renderLogSheet(); }
function logSetOil(g){ _logDraft.oilGrams=g; renderLogSheet(); }
function logSetOilCustom(){ const v=prompt('Oil/ghee in grams (1 tsp≈5g, 1 tbsp≈14g):', _logDraft.oilGrams||''); if(v!=null){ const g=parseFloat(v); _logDraft.oilGrams=isNaN(g)?0:g; renderLogSheet(); } }
function logSetServingIndex(i){ _logDraft.servingIndex=parseInt(i); renderLogSheet(); }
function logSetQty(v){ _logDraft.qty=parseFloat(v)||0; renderLogPreview(); }
function logSetMealServings(v){ _logDraft.servings=parseFloat(v)||0; renderLogPreview(); }

function renderLogSheet(){
  const d=_logDraft; if(!d) return;
  if(d.kind==='item'){
    const it=FOOD_ITEMS[d.itemId]; const u=baseUnit(it);
    const opts = (it.servings||[]).map((s,i)=>`<option value="${i}" ${i===d.servingIndex?'selected':''}>${htmlSafe(s.label)}</option>`).join('')
      + `<option value="-1" ${d.servingIndex<0?'selected':''}>${u==='ml'?'millilitres':'grams'} (${u})</option>`;
    fsheetOpen(`
      <div class="fsheet-grab"></div>
      <div class="fsheet-title">${avatarFor(it.name)}<div><div class="fname">${htmlSafe(it.name)}</div><div class="fsub">${TRUST_DOT[it.trust]||''} per 100${u}: ${it.per100.kcal} kcal</div></div></div>
      ${slotChips(d.slot)}
      <div class="frow2 flogqty">
        <div><label class="flabel">Quantity</label><input class="finput" type="number" inputmode="decimal" value="${d.qty}" oninput="logSetQty(this.value)"></div>
        <div><label class="flabel">Measure</label><select class="finput" onchange="logSetServingIndex(this.value)">${opts}</select></div>
      </div>
      ${it.isHomeCooked?`<label class="flabel">🍳 Oil / ghee added</label>${oilChips(d.oilGrams)}`:''}
      <div id="logPreview" class="flog-preview"></div>
      <button class="btn-primary" onclick="commitItemLog()">Add to log</button>
    `);
  } else {
    const m=FOOD_MEALS[d.mealId];
    fsheetOpen(`
      <div class="fsheet-grab"></div>
      <div class="fsheet-title">${avatarFor(m.name)}<div><div class="fname">${htmlSafe(m.name)}</div><div class="fsub">${(m.components||[]).length} items</div></div></div>
      ${slotChips(d.slot)}
      <div class="frow2 flogqty"><div><label class="flabel">Servings</label><input class="finput" type="number" inputmode="decimal" value="${d.servings}" oninput="logSetMealServings(this.value)"></div></div>
      <label class="flabel">🍳 Oil / ghee added</label>${oilChips(d.oilGrams)}
      <div id="logPreview" class="flog-preview"></div>
      <button class="btn-primary" onclick="commitMealLog()">Add to log</button>
    `);
  }
  renderLogPreview();
}
function renderLogPreview(){
  const el=document.getElementById('logPreview'); const d=_logDraft; if(!el||!d) return;
  let m, net='';
  if(d.kind==='item'){
    const it=FOOD_ITEMS[d.itemId];
    const base=toBaseAmount(it,d.qty,d.servingIndex);
    m=macrosForAmount(it,base); net=netLabel(it,base);
  } else {
    const meal=FOOD_MEALS[d.mealId]; const t=mealTotals(meal,FOOD_ITEMS); const n=d.servings||0;
    m={kcal:t.kcal*n,protein:t.protein*n,carbs:t.carbs*n,fat:t.fat*n,fiber:t.fiber*n,hasFiber:t.hasFiber};
  }
  if(d.oilGrams>0) m=addInto(Object.assign(zeroMacros(),m), oilMacros(d.oilGrams));
  const f=fmtMacros(m);
  el.innerHTML = `<div class="flog-macros"><span class="flog-kcal">${f.kcal}<small>kcal</small></span><span>${f.protein}g P</span><span>${f.carbs}g C</span><span>${f.fat}g F</span>${f.fiber!=null?`<span>${f.fiber}g fib</span>`:''}</div>${net?`<div class="subtle">${net}${d.oilGrams>0?` · +${d.oilGrams}g oil`:''}</div>`:(d.oilGrams>0?`<div class="subtle">+${d.oilGrams}g oil</div>`:'')}`;
}
function commitItemLog(){
  const d=_logDraft; const it=FOOD_ITEMS[d.itemId];
  const base=toBaseAmount(it,d.qty,d.servingIndex);
  const entry={ kind:'item', itemId:d.itemId, amount:base, meal:d.slot,
    disp:{ qty:d.qty, unit:d.servingIndex>=0?it.servings[d.servingIndex].label:baseUnit(it) } };
  if(d.oilGrams>0) entry.oil={ grams:d.oilGrams, type:'oil' };
  const day=ensureLogDay(foodDate); day.entries.push(entry);
  markDayDirty(); saveLogDay(foodDate); bumpUseCount(d.itemId);
  fsheetClose(); renderToday();
}
function commitMealLog(){
  const d=_logDraft;
  const entry={ kind:'meal', mealId:d.mealId, servings:d.servings, meal:d.slot };
  if(d.oilGrams>0) entry.oil={ grams:d.oilGrams, type:'oil' };
  const day=ensureLogDay(foodDate); day.entries.push(entry);
  markDayDirty(); saveLogDay(foodDate);
  fsheetClose(); renderToday();
}

/* ---------- repeat yesterday ---------- */
function repeatYesterday(){
  const y=addDays(foodDate,-1); const yd=logForDate(y);
  if(!yd || !(yd.entries||[]).length){ alert('Nothing was logged on '+fmtDate(y)+'.'); return; }
  const day=ensureLogDay(foodDate);
  yd.entries.forEach(e=> day.entries.push(JSON.parse(JSON.stringify(e))));
  markDayDirty(); saveLogDay(foodDate); renderToday();
}

/* ══════════ MEALS BUILDER ══════════ */
let _mealDraft = null;
function createMeal(){ _mealDraft={ name:'', components:[], addedOil:null }; _mealDraft._id=null; renderMealEditor(); }
function editMealById(id){ const m=FOOD_MEALS[id]; if(!m) return; _mealDraft=JSON.parse(JSON.stringify(m)); _mealDraft._id=id; renderMealEditor(); }

function renderMealEditor(){
  const d=_mealDraft; if(!d) return;
  const rows = d.components.map((c,i)=>{
    const it=FOOD_ITEMS[c.itemId]; if(!it) return '';
    const m=fmtMacros(macrosForAmount(it,c.amount)); const u=baseUnit(it);
    const ui=mealUnitIndex(c,it);
    const qty=mealFmtQty(qtyInServing(it,c.amount,ui));
    const opts=(it.servings||[]).map((s,j)=>`<option value="${j}" ${j===ui?'selected':''}>${htmlSafe(s.label)}</option>`).join('')
      + `<option value="-1" ${ui<0?'selected':''}>${u}</option>`;
    return `<div class="fserv-row"><div class="fmain"><div class="fname">${htmlSafe(it.name)}</div><div class="fsub">${m.kcal} kcal · ${m.protein}g P${ui>=0?` · ${round1(c.amount)}${u}`:''}</div></div>
      <input class="finput fserv-amt" type="number" inputmode="decimal" step="any" value="${qty}" oninput="mealSetQty(${i},this.value)">
      <select class="finput fserv-unit" onchange="mealSetUnit(${i},this.value)">${opts}</select>
      <button type="button" class="btn-sm danger" onclick="mealRemove(${i})">✕</button></div>`;
  }).join('') || `<div class="fempty">No ingredients yet.</div>`;
  const t=fmtMacros(mealTotals(mealDraftAsMeal(),FOOD_ITEMS));
  fsheetOpen(`
    <div class="fsheet-grab"></div>
    <div class="fsheet-title"><span class="favatar" style="background:var(--blue-bg);color:var(--blue)">🍽</span><div><div class="fname">${d._id?'Edit meal':'New meal'}</div><div class="fsub">${t.kcal} kcal · ${t.protein}g protein</div></div></div>
    <label class="flabel">Meal name</label>
    <div class="fnamerow">
      <input class="finput" id="meal_name" placeholder="e.g. Oats Whey Smoothie" value="${htmlSafe(d.name)}" oninput="_mealDraft.name=this.value">
      <button type="button" class="fchip" id="mealNameAi" onclick="aiSuggestMealName&&aiSuggestMealName()">✨ Suggest</button>
    </div>
    <div id="mealNameSuggest"></div>
    <div class="sec-label">Ingredients</div>
    <div id="meal_components">${rows}</div>
    <input class="fsearch-input" id="mealPick" placeholder="🔍 Add ingredient — search pantry…" oninput="renderMealPicker(this.value)" style="margin-top:8px">
    <div id="mealPickResults" class="flist"></div>
    <div class="fdet-actions" style="margin-top:16px">
      <button class="btn-primary" onclick="saveMealDraft()">Save meal</button>
      <button class="btn-sm" onclick="fsheetClose()">Cancel</button>
    </div>
  `);
}
function mealDraftAsMeal(){ return { name:_mealDraft.name, components:_mealDraft.components, addedOil:_mealDraft.addedOil }; }
function renderMealPicker(q){
  const box=document.getElementById('mealPickResults'); if(!box) return;
  q=(q||'').trim().toLowerCase(); if(q.length<1){ box.innerHTML=''; return; }
  const items=foodSearchItems(q,8);
  box.innerHTML=items.map(it=>`<div class="frow" onclick="mealAdd('${it.id}')">${avatarFor(it.name)}<div class="fmain"><div class="fname">${htmlSafe(it.name)}</div><div class="fsub">per 100${baseUnit(it)}: ${it.per100.kcal} kcal</div></div><div class="fkcal">+</div></div>`).join('')||`<div class="fempty">No match.</div>`;
}
/* Which unit to SHOW a component in.
 * `unitIndex` is stored once the user picks one. Components saved before this
 * existed have only a gram amount, so infer: use the item's primary unit when
 * the amount is a clean multiple of it (28g bread -> "1 slice"), otherwise stay
 * in grams — "0.43 katori" of rice is less useful than "65 g". */
function mealUnitIndex(c, it){
  if(c.unitIndex != null) return c.unitIndex;
  const p = primaryServingIndex(it);
  if(p < 0) return -1;
  const per = (it.servings[p] || {}).amount || 0;
  if(!per) return -1;
  const q = c.amount / per;
  const clean = Math.abs(q - Math.round(q * 4) / 4) < 0.01;   // whole, half or quarter
  return (clean && q > 0) ? p : -1;
}
/* trim float noise: 1, 1.5, 0.75 — never "1.0000000002" */
function mealFmtQty(q){ return String(Math.round((Number(q)||0) * 1000) / 1000); }

function mealAdd(itemId){
  const it=FOOD_ITEMS[itemId]; if(!it) return;
  /* seed one of whatever the item is normally counted in */
  const p=primaryServingIndex(it);
  const amount = p>=0 ? (Number(it.servings[p].amount)||0) : 100;
  _mealDraft.components.push({ itemId, amount, unitIndex:p });
  document.getElementById('mealPick').value=''; renderMealEditor();
}
/* Quantity is entered in the CHOSEN unit; `amount` stays in base units so
 * mealTotals() and every downstream macro calc are untouched (ADR-0005). */
function mealSetQty(i,v){
  const c=_mealDraft.components[i]; if(!c) return;
  const it=FOOD_ITEMS[c.itemId]; if(!it) return;
  const ui=mealUnitIndex(c,it);
  c.unitIndex=ui;
  c.amount=toBaseAmount(it, parseFloat(v)||0, ui);
  mealPaintTotals();
}
/* Switching units preserves the MASS and restates the quantity — picking
 * "slice" on 56g of bread should read 2 slices, not 56 slices. */
function mealSetUnit(i,v){
  const c=_mealDraft.components[i]; if(!c) return;
  c.unitIndex=parseInt(v,10);
  renderMealEditor();
}
/* Update the header total without rebuilding the sheet — a re-render on every
 * keystroke would steal focus from the input being typed into. */
function mealPaintTotals(){
  const el=document.querySelector('.fsheet-title .fsub'); if(!el) return;
  const t=fmtMacros(mealTotals(mealDraftAsMeal(),FOOD_ITEMS));
  el.textContent=`${t.kcal} kcal · ${t.protein}g protein`;
  _mealDraft.components.forEach((c,i)=>{
    const row=document.querySelectorAll('#meal_components .fserv-row')[i];
    const it=FOOD_ITEMS[c.itemId]; if(!row||!it) return;
    const m=fmtMacros(macrosForAmount(it,c.amount)); const u=baseUnit(it);
    const sub=row.querySelector('.fsub');
    if(sub) sub.textContent=`${m.kcal} kcal · ${m.protein}g P${c.unitIndex>=0?` · ${round1(c.amount)}${u}`:''}`;
  });
}
function mealRemove(i){ _mealDraft.components.splice(i,1); renderMealEditor(); }
function saveMealDraft(){
  if(!_mealDraft.name.trim()){ alert('Name the meal.'); return; }
  if(!_mealDraft.components.length){ alert('Add at least one ingredient.'); return; }
  const meal = _mealDraft._id ? Object.assign(FOOD_MEALS[_mealDraft._id], mealDraftAsMeal()) : mealDraftAsMeal();
  if(_mealDraft._id) meal.id=_mealDraft._id;
  saveMeal(meal); fsheetClose(); renderMeals();
}
