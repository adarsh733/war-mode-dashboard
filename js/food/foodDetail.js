/* foodDetail.js — spacious detail card for items & meals (opens as a large
 * bottom-sheet, not an inline expand). Includes the iOS-style quantity wheel,
 * per-item unit management, and inline item editing. Replaces the old small
 * log sheets. Only calories + protein are emphasised (per feedback).
 */

/* preset quantities for the wheel (0.25 … 500) */
function qtyPresets(){
  const a=[0.25,0.5,0.75,1,1.5,2,2.5,3];
  for(let v=4;v<=10;v++)a.push(v);
  for(let v=15;v<=50;v+=5)a.push(v);
  for(let v=60;v<=100;v+=10)a.push(v);
  for(let v=150;v<=500;v+=50)a.push(v);
  return a;
}
const QWHEEL_IH = 46; // item height px (keep in sync with CSS)

let _detail = null;   // { kind, id, entryIndex|null, slot, qty, servingIndex, oilGrams }

/* colour band from a name */
function bandFor(name){ let h=0; for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0;
  const hues=[[ '--fgreen-bg','--fgreen'],['--fblue-bg','--fblue'],['--famber-bg','--famber'],['--fviolet-bg','--fviolet']];
  return hues[h%hues.length]; }

/* ---------- open (new log) ---------- */
function openItemDetail(itemId, ctx){
  const it=FOOD_ITEMS[itemId]; if(!it) return; ctx=ctx||{};
  const di=(it.defaultServingIndex!=null&&it.defaultServingIndex>=0)?it.defaultServingIndex:-1;
  _detail={ kind:'item', id:itemId, entryIndex:(ctx.entryIndex!=null?ctx.entryIndex:null),
    slot:ctx.slot||defaultSlot(), qty:1, servingIndex:di, oilGrams:0, editOpen:false };
  if(di<0) _detail.qty=100;
  if(ctx.entryIndex!=null){ const e=logForDate(foodDate).entries[ctx.entryIndex];
    _detail.slot=e.meal||_detail.slot; _detail.oilGrams=(e.oil&&e.oil.grams)||0;
    if(e.disp){ const si=it.servings.findIndex(s=>s.label===e.disp.unit); _detail.servingIndex=si>=0?si:-1; _detail.qty=e.disp.qty; }
    else { _detail.servingIndex=-1; _detail.qty=e.amount; } }
  renderItemDetail();
}
function openMealDetail(mealId, ctx){
  const m=FOOD_MEALS[mealId]; if(!m) return; ctx=ctx||{};
  _detail={ kind:'meal', id:mealId, entryIndex:(ctx.entryIndex!=null?ctx.entryIndex:null),
    slot:ctx.slot||defaultSlot(), qty:1, oilGrams:0, overrides:{}, removed:[] };
  if(ctx.entryIndex!=null){ const e=logForDate(foodDate).entries[ctx.entryIndex];
    _detail.slot=e.meal||_detail.slot; _detail.qty=e.servings||1; _detail.oilGrams=(e.oil&&e.oil.grams)||0;
    _detail.overrides=Object.assign({}, e.overrides||{}); _detail.removed=(e.removed||[]).slice(); }
  renderMealDetail();
}
/* tap a logged entry → open its detail in edit mode */
function openEntryDetail(i){
  const e=logForDate(foodDate).entries[i]; if(!e) return;
  if(e.kind==='item') openItemDetail(e.itemId,{entryIndex:i});
  else if(e.kind==='meal') openMealDetail(e.mealId,{entryIndex:i});
}
/* aliases used across the app */
function openItemLogSheet(id){ openItemDetail(id,{}); }
function openMealLogSheet(id){ openMealDetail(id,{}); }

/* ---------- item detail render ---------- */
function itemDetailMacros(){
  const it=FOOD_ITEMS[_detail.id];
  const base=toBaseAmount(it,_detail.qty,_detail.servingIndex);
  let m=macrosForAmount(it,base);
  if(_detail.oilGrams>0) m=addInto(Object.assign(zeroMacros(),m), oilMacros(_detail.oilGrams));
  return { f:fmtMacros(m), net:netLabel(it,base) };
}
function renderItemDetail(){
  const it=FOOD_ITEMS[_detail.id]; const u=baseUnit(it);
  const [bg,ink]=bandFor(it.name);
  const opts=(it.servings||[]).map((s,i)=>`<option value="${i}" ${i===_detail.servingIndex?'selected':''}>${htmlSafe(s.label)}</option>`).join('')
    +`<option value="-1" ${_detail.servingIndex<0?'selected':''}>${u==='ml'?'millilitres (ml)':'grams (g)'}</option>`;
  const isNew=_detail.entryIndex==null;
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(${bg}),var(--fcard))">
      <button class="fd-x" onclick="fdClose()">✕</button>
      <div class="fd-hero-name">${htmlSafe(it.name)}</div>
      <div class="fd-hero-sub">${TRUST_DOT[it.trust]||''} ${it.brand?htmlSafe(it.brand)+' · ':''}per 100${u}: ${it.per100.kcal} kcal</div>
    </div>
    <div class="fd-body">
      <div class="fd-qtyrow">
        <div class="fd-qcol"><label class="fd-lbl">Quantity</label>${qwheelHtml(_detail.qty)}</div>
        <div class="fd-qcol"><label class="fd-lbl">Measure</label><select class="fd-select" onchange="detailSetUnit(this.value)">${opts}</select></div>
      </div>
      ${it.isHomeCooked?`<label class="fd-lbl">🍳 Oil / ghee added</label><div class="fd-chips" id="fdOil">${[['None',0],['1 tsp',5],['1 tbsp',14]].map(([l,g])=>`<button type="button" class="fd-chip ${_detail.oilGrams==g?'on':''}" onclick="detailSetOil(${g})">${l}</button>`).join('')}<button type="button" class="fd-chip" onclick="detailOilCustom()">custom</button></div>`:''}
      <div class="fd-macrocard" id="fdMacros"></div>
      <button class="fd-editlink" onclick="detailToggleEdit()">⚙ Edit item &amp; units</button>
      <div id="fdEdit" style="display:none"></div>
    </div>
    <div class="fd-foot">
      ${isNew
        ? `<button class="fd-btn primary" onclick="detailAddItem()">＋ Add to ${slotLabel(_detail.slot)}</button>`
        : `<button class="fd-btn primary" onclick="detailSaveItem()">Save changes</button><button class="fd-btn danger" onclick="detailRemove()">Remove</button>`}
    </div>
  `);
  qwheelInit(); detailPreview();
}
function detailSetUnit(v){ _detail.servingIndex=parseInt(v); detailPreview(); }
function detailSetOil(g){ _detail.oilGrams=g; document.querySelectorAll('#fdOil .fd-chip').forEach(b=>b.classList.remove('on')); if(event&&event.target)event.target.classList.add('on'); detailPreview(); }
function detailOilCustom(){ const v=prompt('Oil/ghee grams:', _detail.oilGrams||''); if(v!=null){ _detail.oilGrams=parseFloat(v)||0; renderItemDetail(); } }
function detailPreview(){
  if(!_detail||_detail.kind!=='item') return;
  const el=document.getElementById('fdMacros'); if(!el) return;
  const {f,net}=itemDetailMacros();
  el.innerHTML=`
    <div class="fd-two"><div class="fd-big"><span class="fd-bigv">${f.kcal}</span><span class="fd-bigk">calories</span></div>
      <div class="fd-big"><span class="fd-bigv">${f.protein}<small>g</small></span><span class="fd-bigk">protein</span></div></div>
    <div class="fd-small">${net} · ${f.carbs}g carbs · ${f.fat}g fat${f.fiber!=null?` · ${f.fiber}g fiber`:''}</div>`;
}

/* ---------- iOS-style quantity wheel ---------- */
function qwheelHtml(cur){
  const items=qtyPresets();
  return `<div class="qwheel"><div class="qwheel-hl"></div>
    <div class="qwheel-list" id="qwheelList" onscroll="qwheelScroll()">
      <div class="qwheel-pad"></div>
      ${items.map(v=>`<div class="qwheel-item" data-v="${v}">${v}</div>`).join('')}
      <div class="qwheel-pad"></div>
    </div></div>
    <button type="button" class="qwheel-type" onclick="qwheelType()">⌨ type</button>`;
}
let _qwheelTO=null;
function qwheelInit(){
  const list=document.getElementById('qwheelList'); if(!list) return;
  const items=qtyPresets();
  let idx=items.indexOf(_detail.qty);
  if(idx<0){ // nearest
    idx=0; let best=1e9; items.forEach((v,i)=>{ const d=Math.abs(v-_detail.qty); if(d<best){best=d;idx=i;} });
  }
  list.scrollTop = idx*QWHEEL_IH;
  qwheelMark(idx);
}
function qwheelScroll(){
  const list=document.getElementById('qwheelList'); if(!list) return;
  const idx=Math.round(list.scrollTop/QWHEEL_IH);
  const items=qtyPresets(); const v=items[Math.max(0,Math.min(items.length-1,idx))];
  if(v!=null){ _detail.qty=v; qwheelMark(idx);
    if(_qwheelTO) clearTimeout(_qwheelTO); _qwheelTO=setTimeout(()=>{ if(_detail.kind==='item')detailPreview(); else detailPreview_meal(); },60); }
}
function qwheelMark(idx){ document.querySelectorAll('.qwheel-item').forEach((el,i)=>el.classList.toggle('on', i===idx)); }
function qwheelType(){
  const v=prompt('Enter quantity:', _detail.qty);
  if(v!=null){ const n=parseFloat(v); if(!isNaN(n)&&n>0){ _detail.qty=n; if(_detail.kind==='item')renderItemDetail(); else renderMealDetail(); } }
}

/* ---------- inline item edit (macros + units) ---------- */
function detailToggleEdit(){
  const el=document.getElementById('fdEdit'); if(!el) return;
  _detail.editOpen=!_detail.editOpen;
  if(!_detail.editOpen){ el.style.display='none'; el.innerHTML=''; return; }
  const it=FOOD_ITEMS[_detail.id]; const p=it.per100||{}; const u=baseUnit(it);
  el.innerHTML=`<div class="fd-edit">
    <div class="fd-lbl">Per 100${u} — calories &amp; protein matter most</div>
    <div class="fd-editgrid">
      <div><span class="fd-mini">kcal</span><input class="fd-inp" id="ed_kcal" type="number" value="${p.kcal??''}"></div>
      <div><span class="fd-mini">protein</span><input class="fd-inp" id="ed_prot" type="number" value="${p.protein??''}"></div>
      <div><span class="fd-mini">carbs</span><input class="fd-inp" id="ed_carb" type="number" value="${p.carbs??''}"></div>
      <div><span class="fd-mini">fat</span><input class="fd-inp" id="ed_fat" type="number" value="${p.fat??''}"></div>
    </div>
    <div class="fd-lbl" style="margin-top:14px">Units for this product</div>
    <div id="ed_units">${(it.servings||[]).map((s,i)=>unitRowHtml(s,i)).join('')}</div>
    <div class="fd-unitadd"><input class="fd-inp" id="ed_ulabel" placeholder="label e.g. 1 katori"><input class="fd-inp" id="ed_uamt" type="number" placeholder="${u}"><button class="fd-chip" onclick="detailAddUnit()">＋ add</button></div>
    <button class="fd-btn primary" style="margin-top:14px" onclick="detailSaveItemEdits()">Save item</button>
  </div>`;
  el.style.display='block';
}
function unitRowHtml(s,i){ const u=baseUnit(FOOD_ITEMS[_detail.id]);
  return `<div class="fd-unitrow" data-i="${i}"><span class="fd-ulabel">${htmlSafe(s.label)}</span><span class="fd-uamt">${s.amount} ${u}</span><button class="fd-x2" onclick="detailRemoveUnit(${i})">✕</button></div>`; }
function detailAddUnit(){
  const it=FOOD_ITEMS[_detail.id]; const label=document.getElementById('ed_ulabel').value.trim(); const amt=parseFloat(document.getElementById('ed_uamt').value);
  if(!label||!(amt>0)){ alert('Enter a unit label and amount.'); return; }
  it.servings=it.servings||[]; it.servings.push({label,amount:amt}); saveItem(it); detailToggleEdit(); detailToggleEdit(); renderItemDetail();
}
function detailRemoveUnit(i){ const it=FOOD_ITEMS[_detail.id]; it.servings.splice(i,1); if(it.defaultServingIndex>=it.servings.length)it.defaultServingIndex=it.servings.length?0:-1; saveItem(it); detailToggleEdit(); detailToggleEdit(); renderItemDetail(); }
function detailSaveItemEdits(){
  const it=FOOD_ITEMS[_detail.id]; const num=id=>{const v=parseFloat(document.getElementById(id).value);return isNaN(v)?0:v;};
  it.per100={ kcal:num('ed_kcal'), protein:num('ed_prot'), carbs:num('ed_carb'), fat:num('ed_fat') };
  if(it.trust==='seed') it.trust='verified'; // he calibrated it
  saveItem(it); renderItemDetail(); if(typeof renderToday==='function')renderToday();
}

/* ---------- commit item ---------- */
function detailAddItem(){
  const it=FOOD_ITEMS[_detail.id]; const base=toBaseAmount(it,_detail.qty,_detail.servingIndex);
  const entry={ kind:'item', itemId:_detail.id, amount:base, meal:_detail.slot,
    disp:{ qty:_detail.qty, unit:_detail.servingIndex>=0?it.servings[_detail.servingIndex].label:baseUnit(it) } };
  if(_detail.oilGrams>0) entry.oil={grams:_detail.oilGrams,type:'oil'};
  ensureLogDay(foodDate).entries.push(entry); bumpUseCount(_detail.id); logSlotUse(_detail.slot,'item',_detail.id);
  markDayDirty(); saveLogDay(foodDate); fdClose(); renderToday();
}
function detailSaveItem(){
  const it=FOOD_ITEMS[_detail.id]; const e=logForDate(foodDate).entries[_detail.entryIndex]; if(!e) return;
  e.amount=toBaseAmount(it,_detail.qty,_detail.servingIndex); e.meal=_detail.slot;
  e.disp={ qty:_detail.qty, unit:_detail.servingIndex>=0?it.servings[_detail.servingIndex].label:baseUnit(it) };
  e.oil=_detail.oilGrams>0?{grams:_detail.oilGrams,type:'oil'}:undefined;
  markDayDirty(); saveLogDay(foodDate); fdClose(); renderToday();
}
function detailRemove(){ const i=_detail.entryIndex; fdClose(); if(typeof removeEntry==='function') removeEntry(i); }

/* ---------- meal detail ---------- */
function mealDetailTotals(){
  const m=FOOD_MEALS[_detail.id];
  const t=mealTotals(m,FOOD_ITEMS,_detail.overrides,_detail.removed); const n=_detail.qty||1;
  let mm={kcal:t.kcal*n,protein:t.protein*n,carbs:t.carbs*n,fat:t.fat*n,fiber:t.fiber*n,hasFiber:t.hasFiber};
  if(_detail.oilGrams>0) mm=addInto(Object.assign(zeroMacros(),mm), oilMacros(_detail.oilGrams));
  return fmtMacros(mm);
}
function renderMealDetail(){
  const m=FOOD_MEALS[_detail.id]; const [bg]=bandFor(m.name); const isNew=_detail.entryIndex==null;
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(${bg}),var(--fcard))">
      <button class="fd-x" onclick="fdClose()">✕</button>
      <div class="fd-hero-name">🍲 ${htmlSafe(m.name)}</div>
      <div class="fd-hero-sub">${(m.components||[]).length} items · customize for log or template</div>
    </div>
    <div class="fd-body">
      <div class="fd-qtyrow"><div class="fd-qcol"><label class="fd-lbl">Servings</label>${qwheelHtml(_detail.qty)}</div>
        <div class="fd-qcol"><div class="fd-macrocard" id="fdMacros"></div></div></div>
      <label class="fd-lbl">🍳 Oil / ghee added</label><div class="fd-chips" id="fdOil">${[['None',0],['1 tsp',5],['1 tbsp',14]].map(([l,g])=>`<button type="button" class="fd-chip ${_detail.oilGrams==g?'on':''}" onclick="detailSetOil(${g})">${l}</button>`).join('')}</div>
      <label class="fd-lbl" style="margin-top:14px">Ingredients</label>
      <div id="fdComps">${mealCompRows()}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="fd-editlink" onclick="mealDetailShowAddPicker()">＋ Add ingredient item</button>
        <button type="button" class="fd-editlink" onclick="saveAsMasterMealTemplate()" style="color:var(--fblue)">💾 Update master meal template</button>
      </div>
      <div id="fdAddCompPicker" style="display:none;margin-top:8px">
        <input class="fd-inp" id="fdAddSearchInp" placeholder="🔍 Search pantry to add item…" oninput="mealDetailFilterAddPicker(this.value)">
        <div id="fdAddCompResults" class="flist fsearch-results" style="max-height:160px;margin-top:6px"></div>
      </div>
    </div>
    <div class="fd-foot">
      ${isNew
        ? `<button class="fd-btn primary" onclick="detailAddMeal()">＋ Add to ${slotLabel(_detail.slot)}</button>`
        : `<button class="fd-btn primary" onclick="detailSaveMeal()">Save changes</button><button class="fd-btn danger" onclick="detailRemove()">Remove</button>`}
    </div>
  `);
  qwheelInit(); detailPreview_meal();
}

function mealDetailShowAddPicker(){
  const p=document.getElementById('fdAddCompPicker'); if(!p) return;
  p.style.display = p.style.display==='none' ? 'block' : 'none';
  if(p.style.display==='block'){
    const inp=document.getElementById('fdAddSearchInp');
    if(inp){ inp.focus(); mealDetailFilterAddPicker(inp.value); }
  }
}
function mealDetailFilterAddPicker(q){
  const box=document.getElementById('fdAddCompResults'); if(!box) return;
  q=(q||'').trim().toLowerCase();
  const items = (typeof foodSearchItems==='function') ? foodSearchItems(q, 6) : Object.values(FOOD_ITEMS).slice(0, 6);
  if(!items.length){ box.innerHTML='<div class="fempty">No item found.</div>'; return; }
  box.innerHTML=items.map(it=>`<div class="frow" onclick="mealDetailAddCompItem('${it.id}')"><div class="fmain"><div class="fname">${htmlSafe(it.name)}</div><div class="fsub">per 100${baseUnit(it)}: ${it.per100.kcal} kcal</div></div><div class="fkcal">＋</div></div>`).join('');
}
function mealDetailAddCompItem(itemId){
  const m=FOOD_MEALS[_detail.id]; if(!m) return;
  const it=FOOD_ITEMS[itemId]; if(!it) return;
  const p=(typeof primaryServingIndex==='function')?primaryServingIndex(it):-1;
  const amount = p>=0 ? (Number(it.servings[p].amount)||0) : 100;
  const exists = (m.components||[]).some(c=>c.itemId===itemId);
  if(!exists){
    m.components=m.components||[];
    m.components.push({ itemId, amount, unitIndex:p });
  } else {
    _detail.overrides[itemId]=amount;
    const remIdx=_detail.removed.indexOf(itemId);
    if(remIdx>=0) _detail.removed.splice(remIdx, 1);
  }
  renderMealDetail();
}
function saveAsMasterMealTemplate(){
  const m=FOOD_MEALS[_detail.id]; if(!m) return;
  if(!confirm(`Save these ingredient changes to the master template for “${m.name}”?`)) return;
  if(typeof saveMeal==='function') saveMeal(m);
  alert(`Master template for “${m.name}” updated!`);
  renderMealDetail();
  if(typeof renderMeals==='function') renderMeals();
}

function mealCompRows(){
  const m=FOOD_MEALS[_detail.id];
  return (m.components||[]).map((c,ci)=>{
    const it=FOOD_ITEMS[c.itemId]; if(!it) return '';
    const removed=_detail.removed.includes(c.itemId);
    const amt=(_detail.overrides[c.itemId]!=null)?_detail.overrides[c.itemId]:c.amount;
    const cm=fmtMacros(macrosForAmount(it,removed?0:amt)); const u=baseUnit(it);
    /* show the unit the ingredient was entered in — "2 slice", not "56 g".
       The override itself stays in base units; only the input is restated. */
    const ui=(typeof mealUnitIndex==='function')?mealUnitIndex(c,it):-1;
    const qty=(typeof mealFmtQty==='function')?mealFmtQty(qtyInServing(it,amt,ui)):amt;
    const unitLbl=ui>=0?htmlSafe(it.servings[ui].label):u;
    return `<div class="fd-comp ${removed?'removed':''}">
      <div class="fd-compmain"><div class="fd-compname">${htmlSafe(it.name)}</div><div class="fd-compsub">${cm.kcal} kcal · ${cm.protein}g P${ui>=0?` · ${round1(amt)}${u}`:''}</div></div>
      <input class="fd-inp fd-compamt" type="number" step="any" value="${qty}" ${removed?'disabled':''} oninput="mealCompAmt('${c.itemId}',this.value,${ci})"><span class="fd-mini">${unitLbl}</span>
      <button class="fd-x2" onclick="mealCompToggle('${c.itemId}')">${removed?'↺':'✕'}</button></div>`;
  }).join('');
}
function detailPreview_meal(){ const el=document.getElementById('fdMacros'); if(!el) return; const f=mealDetailTotals();
  el.innerHTML=`<div class="fd-two"><div class="fd-big"><span class="fd-bigv">${f.kcal}</span><span class="fd-bigk">calories</span></div><div class="fd-big"><span class="fd-bigv">${f.protein}<small>g</small></span><span class="fd-bigk">protein</span></div></div>`; }
function mealCompAmt(itemId,v,ci){
  const m=FOOD_MEALS[_detail.id];
  const list=(m&&m.components)||[];
  const c=(ci!=null&&list[ci])?list[ci]:list.find(x=>x.itemId===itemId);
  const it=FOOD_ITEMS[itemId];
  const ui=(c&&it&&typeof mealUnitIndex==='function')?mealUnitIndex(c,it):-1;
  _detail.overrides[itemId]=it?toBaseAmount(it,parseFloat(v)||0,ui):(parseFloat(v)||0);
  detailPreview_meal();
}
function mealCompToggle(itemId){ const p=_detail.removed.indexOf(itemId); if(p>=0)_detail.removed.splice(p,1); else _detail.removed.push(itemId); document.getElementById('fdComps').innerHTML=mealCompRows(); detailPreview_meal(); }
function detailAddMeal(){
  const entry={ kind:'meal', mealId:_detail.id, servings:_detail.qty, meal:_detail.slot };
  if(Object.keys(_detail.overrides).length) entry.overrides=_detail.overrides;
  if(_detail.removed.length) entry.removed=_detail.removed;
  if(_detail.oilGrams>0) entry.oil={grams:_detail.oilGrams,type:'oil'};
  ensureLogDay(foodDate).entries.push(entry); logSlotUse(_detail.slot,'meal',_detail.id);
  markDayDirty(); saveLogDay(foodDate); fdClose(); renderToday();
}
function detailSaveMeal(){
  const e=logForDate(foodDate).entries[_detail.entryIndex]; if(!e) return;
  e.servings=_detail.qty; e.meal=_detail.slot;
  e.overrides=Object.keys(_detail.overrides).length?_detail.overrides:undefined;
  e.removed=_detail.removed.length?_detail.removed:undefined;
  e.oil=_detail.oilGrams>0?{grams:_detail.oilGrams,type:'oil'}:undefined;
  markDayDirty(); saveLogDay(foodDate); fdClose(); renderToday();
}

/* ---------- big detail sheet shell ---------- */
function fdOpen(inner){
  let ov=document.getElementById('fdOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='fdOverlay'; ov.className='fd-overlay';
    ov.addEventListener('click',e=>{ if(e.target===ov) fdClose(); });
    const c=document.createElement('div'); c.id='fdCard'; c.className='fd-card'; ov.appendChild(c); document.body.appendChild(ov); }
  document.getElementById('fdCard').innerHTML=inner;
  ov.style.display='flex';
  setTimeout(()=> ov.classList.add('show'), 10);
}
function fdClose(){
  const ov=document.getElementById('fdOverlay');
  if(ov){
    ov.classList.remove('show');
    setTimeout(()=>{ if(!ov.classList.contains('show')) ov.style.display='none'; }, 260);
  }
  _detail=null;
}
function slotLabel(k){ return ({breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snack:'Snacks'})[k]||'log'; }
