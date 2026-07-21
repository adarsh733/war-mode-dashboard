/* foodSuggest.js — per-meal-slot suggestions ("what he usually eats").
 * Each slot holds a list of {type:'item'|'meal', id}. Clicking a suggestion's
 * + logs it straight into that slot. He can teach/edit these himself.
 * Stored in localStorage + a reserved food_meals row '__suggestions__' (no new table).
 */

const FOOD_SUGGEST_KEY = 'warmode_food_suggest_v1';
let FOOD_SUGGESTIONS = { breakfast:[], lunch:[], dinner:[], snack:[] };

/* sensible vegetarian defaults — he refines these via the manager */
const _SUGGEST_DEFAULTS = {
  breakfast: ['seed_oats','seed_sidsfarm','seed_wholetruthwhey','seed_banana','seed_curd'],
  lunch:     ['seed_roti','seed_toordal','seed_rice','seed_curd','seed_daliceberg'],
  dinner:    ['seed_roti','seed_mixedveg','seed_moongdal','seed_paneer'],
  snack:     ['seed_roastedchana','seed_almonds','seed_apple','seed_buttermilk']
};

function loadSuggestionsLocal(){
  let saved = null;
  try{ const r = localStorage.getItem(FOOD_SUGGEST_KEY); saved = r ? JSON.parse(r) : null; }catch(e){}
  if(saved && (saved.breakfast||saved.lunch||saved.dinner||saved.snack)){ FOOD_SUGGESTIONS = normalizeSuggest(saved); return; }
  // first run: build defaults from whatever seed items exist
  const out = { breakfast:[], lunch:[], dinner:[], snack:[] };
  Object.keys(_SUGGEST_DEFAULTS).forEach(slot => {
    _SUGGEST_DEFAULTS[slot].forEach(id => { if(typeof FOOD_ITEMS!=='undefined' && FOOD_ITEMS[id]) out[slot].push({ type:'item', id }); });
  });
  FOOD_SUGGESTIONS = out; saveSuggestionsLocal();
}
function normalizeSuggest(s){
  const out = { breakfast:[], lunch:[], dinner:[], snack:[] };
  ['breakfast','lunch','dinner','snack'].forEach(k => { out[k] = Array.isArray(s[k]) ? s[k].filter(x=>x&&x.id&&x.type) : []; });
  return out;
}
function saveSuggestionsLocal(){ try{ localStorage.setItem(FOOD_SUGGEST_KEY, JSON.stringify(FOOD_SUGGESTIONS)); }catch(e){} }
function applyCloudSuggestions(data){ if(data && (data.breakfast||data.lunch||data.dinner||data.snack)){ FOOD_SUGGESTIONS = normalizeSuggest(data); saveSuggestionsLocal(); } }
function saveSuggestions(){
  saveSuggestionsLocal();
  if(typeof foodCloudOK!=='undefined' && foodCloudOK && typeof supa!=='undefined' && supa){
    supa.from('food_meals').upsert({ id:'__suggestions__', name:'(suggestions)', data:FOOD_SUGGESTIONS, updated_at:new Date().toISOString() })
      .then(({error})=>{ if(typeof foodSync==='function') foodSync(error?'off':'ok'); });
  }
}

/* resolve a suggestion to a display object; returns null if the referenced item/meal is gone */
function resolveSuggestion(s){
  if(s.type==='item'){ const it=FOOD_ITEMS[s.id]; if(!it) return null;
    const d=defaultServingMacros(it); return { type:'item', id:s.id, name:it.name, kcal:d.m.kcal, protein:d.m.protein, trust:it.trust }; }
  const m=FOOD_MEALS[s.id]; if(!m) return null;
  const t=fmtMacros(mealTotals(m,FOOD_ITEMS)); return { type:'meal', id:s.id, name:m.name, kcal:t.kcal, protein:t.protein };
}
/* usage hook (kept for call sites); the real history lives in FOOD_LOG so no store needed */
function logSlotUse(){}

/* recency-weighted frequency of what he actually logs in this slot */
function learnedScores(slot){
  const scores={}; const today=(typeof todayStr==='function')?todayStr():foodDate;
  Object.keys(FOOD_LOG||{}).forEach(date=>{
    const day=FOOD_LOG[date]; if(!day||!day.entries) return;
    let daysAgo=0; try{ daysAgo=Math.max(0,Math.round((new Date(today)-new Date(date))/86400000)); }catch(e){}
    const w=Math.pow(0.93, daysAgo);                 // recent days weigh more
    day.entries.forEach(e=>{
      if((e.meal||'')!==slot && !(slot==='snack'&&(e.meal||'')==='')) return;
      const key=e.kind==='item'?('item:'+e.itemId):e.kind==='meal'?('meal:'+e.mealId):null;
      if(key) scores[key]=(scores[key]||0)+w;
    });
  });
  return scores;
}
/* smart suggestions: taught ones first, then most-eaten-recently for this slot */
function suggestionsFor(slot){
  const out=[]; const seen={};
  (FOOD_SUGGESTIONS[slot]||[]).forEach(s=>{ const r=resolveSuggestion(s); if(r){ out.push(r); seen[r.type+':'+r.id]=1; } });
  const scores=learnedScores(slot);
  Object.keys(scores).sort((a,b)=>scores[b]-scores[a]).forEach(key=>{
    if(out.length>=8 || seen[key]) return;
    const [type,id]=key.split(':'); const r=resolveSuggestion({type,id}); if(r){ out.push(r); seen[key]=1; }
  });
  return out.slice(0,8);
}

function addSuggestion(slot, type, id){
  if(!FOOD_SUGGESTIONS[slot]) FOOD_SUGGESTIONS[slot]=[];
  if(FOOD_SUGGESTIONS[slot].some(s=>s.type===type && s.id===id)) return;   // no dupes
  FOOD_SUGGESTIONS[slot].push({ type, id }); saveSuggestions();
}
function removeSuggestion(slot, type, id){
  FOOD_SUGGESTIONS[slot] = (FOOD_SUGGESTIONS[slot]||[]).filter(s=>!(s.type===type && s.id===id));
  saveSuggestions();
}

/* quick-log a suggestion straight into its slot (default serving / 1 meal-serving) */
function quickLogSuggestion(slot, type, id){
  const day = ensureLogDay(foodDate);
  if(type==='item'){
    const it=FOOD_ITEMS[id]; if(!it) return;
    const di=(it.defaultServingIndex!=null&&it.defaultServingIndex>=0)?it.defaultServingIndex:-1;
    const base = di>=0 ? toBaseAmount(it,1,di) : 100;
    const entry={ kind:'item', itemId:id, amount:base, meal:slot,
      disp:{ qty:1, unit: di>=0?it.servings[di].label:baseUnit(it) } };
    day.entries.push(entry); bumpUseCount(id);
  } else {
    const m=FOOD_MEALS[id]; if(!m) return;
    day.entries.push({ kind:'meal', mealId:id, servings:1, meal:slot });
  }
  markDayDirty(); saveLogDay(foodDate); renderToday();
}

/* ---- suggestions manager (teach me) — opens in the bottom sheet ---- */
let _suggestSlot = 'breakfast';
function openSuggestManager(slot){
  _suggestSlot = slot || 'breakfast';
  renderSuggestManager();
}
function suggestManagerSlot(s){ _suggestSlot=s; renderSuggestManager(); }
function renderSuggestManager(){
  const slot=_suggestSlot;
  const chips = SLOTS.map(([k,l])=>`<button type="button" class="fchip ${k===slot?'on':''}" onclick="suggestManagerSlot('${k}')">${l}</button>`).join('');
  const cur = (FOOD_SUGGESTIONS[slot]||[]).map(s=>{
    const r=resolveSuggestion(s); if(!r) return '';
    return `<div class="frow"><span class="fbadge ${r.type}">${r.type==='meal'?'🍲 Meal':'🥗 Item'}</span>
      <div class="fmain"><div class="fname">${htmlSafe(r.name)}</div><div class="fsub">${r.kcal} kcal · ${r.protein}g P</div></div>
      <button class="btn-sm danger" onclick="removeSuggestion('${slot}','${r.type}','${r.id}');renderSuggestManager()">✕</button></div>`;
  }).join('') || `<div class="fempty">No suggestions for this slot yet — add your usuals below.</div>`;
  fsheetOpen(`
    <div class="fsheet-grab"></div>
    <div class="fsheet-title"><span class="favatar" style="background:var(--amber-bg);color:var(--amber)">✎</span><div><div class="fname">Meal suggestions</div><div class="fsub">Tell me what you usually eat, per slot</div></div></div>
    <div class="fslot-chips">${chips}</div>
    <div class="sec-label">Current — ${slot}</div>
    <div class="flist">${cur}</div>
    <div class="sec-label">Add to ${slot}</div>
    <input class="fsearch-input" id="suggPick" placeholder="Search items &amp; meals to add…" autocomplete="off" oninput="renderSuggestPicker(this.value)">
    <div id="suggPickResults" class="flist"></div>
    <button class="btn-primary" style="margin-top:14px" onclick="fsheetClose();renderToday()">Done</button>
  `);
  setTimeout(()=>{ const el=document.getElementById('suggPick'); if(el) el.focus(); }, 40);
}
function renderSuggestPicker(q){
  const box=document.getElementById('suggPickResults'); if(!box) return;
  q=(q||'').trim().toLowerCase(); if(q.length<1){ box.innerHTML=''; return; }
  const meals=(typeof foodSearchMeals==='function')?foodSearchMeals(q,4):[];
  const items=(typeof foodSearchItems==='function')?foodSearchItems(q,8)
    :Object.values(FOOD_ITEMS).filter(it=>itemMatchesQuery(it,q)).slice(0,8);
  let html='';
  meals.forEach(m=>{ html+=`<div class="frow" onclick="addSuggestion('${_suggestSlot}','meal','${m.id}');renderSuggestManager()"><span class="fbadge meal">🍲 Meal</span><div class="fmain"><div class="fname">${htmlSafe(m.name)}</div></div><div class="fkcal">+</div></div>`; });
  items.forEach(it=>{ html+=`<div class="frow" onclick="addSuggestion('${_suggestSlot}','item','${it.id}');renderSuggestManager()"><span class="fbadge item">🥗 Item</span><div class="fmain"><div class="fname">${htmlSafe(it.name)}</div></div><div class="fkcal">+</div></div>`; });
  box.innerHTML = html || `<div class="fempty">No match.</div>`;
}
