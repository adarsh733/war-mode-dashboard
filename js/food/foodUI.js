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
/* Logged rows use the glyph alone. The words "Item"/"Meal" cost ~60px of row
 * width and told him nothing the name didn't — the colour and the glyph carry
 * the same distinction in a quarter of the space. (The full `.fbadge` pill is
 * still used where a row's kind isn't obvious from context: suggestions and the
 * Meals tab.) */
const KIND_ICON = { item:'🥗', meal:'🍲', adhoc:'✎' };
const KIND_NAME = { item:'Item', meal:'Meal', adhoc:'Ad-hoc' };

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
  if(dl) dl.innerHTML = foodDateLabelHtml(foodDate);

  wrap.innerHTML = heroHtml(totals) + slotsHtml(entries) + doneHtml(day, entries);

  // draw rings after DOM exists
  const over = totals.kcal > FOOD_TARGETS.kcal;
  foodRing('ringKcal', totals.kcal, FOOD_TARGETS.kcal, over ? '--fred' : '--fgreen');
  foodRing('ringProt', totals.protein, FOOD_TARGETS.protein, totals.protein>=FOOD_TARGETS.protein ? '--fgreen' : (totals.protein<FOOD_TARGETS.proteinRed ? '--fred':'--famber'));
}

/* "Tue · 22 Jul '26", tagged when it's today or yesterday so the strip answers
 * "which day am I looking at" without arithmetic. */
function foodDateLabelHtml(d){
  const pretty = (typeof fmtDate==='function') ? fmtDate(d) : d;
  const dow    = (typeof dowName==='function') ? dowName(d) : '';
  const today  = (typeof todayStr==='function') ? todayStr() : null;
  const tag = d===today ? '<b class="fdate-tag">Today</b>'
            : (today && typeof addDays==='function' && d===addDays(today,-1)) ? '<b class="fdate-tag">Yesterday</b>' : '';
  return `<span class="fdate-dow">${dow}</span><span class="fdate-d">${pretty}</span>${tag}`;
}

function heroHtml(t){
  const kcalLeft = FOOD_TARGETS.kcal - t.kcal;
  const protLeft = Math.max(0, FOOD_TARGETS.protein - t.protein);
  return `
  <div class="fcard fhero">
    <div class="fhero-rings">
      <div class="fring-col">
        <div class="fring-wrap">
          <canvas id="ringKcal" width="104" height="104"></canvas>
          <div class="fring-center"><span class="fring-val">${t.kcal.toLocaleString()}</span><span class="fring-lbl">/ ${FOOD_TARGETS.kcal.toLocaleString()}</span></div>
        </div>
        <div class="fhero-cap">${kcalLeft>=0?`<b>${kcalLeft.toLocaleString()}</b> kcal left`:`<b class="over">${(-kcalLeft).toLocaleString()}</b> over`}</div>
      </div>
      <div class="fring-col">
        <div class="fring-wrap">
          <canvas id="ringProt" width="104" height="104"></canvas>
          <div class="fring-center"><span class="fring-val">${t.protein}<small>g</small></span><span class="fring-lbl">/ ${FOOD_TARGETS.protein}g</span></div>
        </div>
        <div class="fhero-cap">${protLeft>0?`<b>${protLeft}g</b> protein to go`:`<b class="good">goal hit ✓</b>`}</div>
      </div>
    </div>
    <div class="fhero-buf">${FOOD_TARGETS.kcal.toLocaleString()} kcal target · ${FOOD_TARGETS.buffer} kcal snack buffer</div>
  </div>
  <div class="fquick">
    <input class="fsearch-input" id="quickSearch" placeholder="🔍 Search a food or meal…" autocomplete="off" oninput="renderQuickResults&&renderQuickResults(this.value)">
    <div id="quickResults" class="flist fsearch-results"></div>
    <!-- Two families, deliberately different weights: the AI capture routes are the
         primary pair; repeat/new-item are secondary shortcuts. "Meals" is gone —
         it is already a subtab at the top of this page. -->
    <div class="fquick-ai">
      <button class="fact" onclick="aiLogText&&aiLogText()"><span class="fact-ic">🗣</span>Log by typing</button>
      <button class="fact" onclick="aiScanPlate&&aiScanPlate()"><span class="fact-ic">🍽</span>Plate photo</button>
    </div>
    <div class="fquick-more">
      <button class="flink" onclick="repeatYesterday&&repeatYesterday()">↻ Repeat yesterday</button>
      <button class="flink" onclick="go('food-add')">＋ New item</button>
    </div>
  </div>`;
}

/* ---- suggestions: collapsed by default, and BELOW what he actually ate ----
 * They used to sit above the entries, expanded, in every slot — four rows of
 * chips pushing the real log off the screen. Collapsed state is per slot and
 * remembered; toggling flips a class rather than calling renderToday(), because
 * a full re-render destroys and redraws the Chart.js rings. */
const FOOD_SUGG_OPEN_KEY = 'warmode_food_sugg_open_v1';
let FOOD_SUGG_OPEN = (function(){
  try{ return JSON.parse(localStorage.getItem(FOOD_SUGG_OPEN_KEY)||'{}') || {}; }catch(e){ return {}; }
})();
function toggleSuggestions(slot){
  FOOD_SUGG_OPEN[slot] = !FOOD_SUGG_OPEN[slot];
  try{ localStorage.setItem(FOOD_SUGG_OPEN_KEY, JSON.stringify(FOOD_SUGG_OPEN)); }catch(e){}
  const el = document.getElementById('sugg_'+slot);
  if(el) el.classList.toggle('open', !!FOOD_SUGG_OPEN[slot]);
}

function slotsHtml(entries){
  let html = '';
  TODAY_SLOTS.forEach(([k,label,emoji])=>{
    const idxs = entries.map((e,i)=>({e,i})).filter(x=>(x.e.meal||'')===k || (k==='snack' && (x.e.meal||'')===''));
    const st = fmtMacros(idxs.reduce((acc,x)=>addInto(acc, entryMacros(x.e,FOOD_ITEMS,FOOD_MEALS)), zeroMacros()));
    const sugg = (typeof suggestionsFor==='function') ? suggestionsFor(k) : [];
    const open = !!FOOD_SUGG_OPEN[k];
    const toggleText = sugg.length
      ? `${sugg.length} usual ${label.toLowerCase()} food${sugg.length>1?'s':''}`
      : `Add your usual ${label.toLowerCase()} foods`;
    html += `
    <section class="fslot" data-slot="${k}">
      <div class="fslot-head">
        <div class="fslot-title">${emoji} ${label}</div>
        <div class="fslot-right"><span class="fslot-sub">${st.kcal} kcal · ${st.protein}g P</span><button class="fslot-add" onclick="openSlotAdd('${k}')" title="Add to ${label}">＋</button></div>
      </div>
      <div class="fslot-entries">
        ${idxs.length ? idxs.map(x=>entryRowHtml(x.e,x.i,k)).join('') : '<div class="fslot-empty">— nothing yet —</div>'}
      </div>
      <div class="fsugg-wrap ${open?'open':''}" id="sugg_${k}">
        <button type="button" class="fsugg-toggle" onclick="toggleSuggestions('${k}')"><span class="fsugg-caret">›</span>${toggleText}</button>
        <div class="fsugg-row">
          ${sugg.map(s=>`<button class="fsugg-chip ${s.type}" onclick="quickLogSuggestion('${k}','${s.type}','${s.id}')" title="${s.kcal} kcal · ${s.protein}g P">${s.type==='meal'?'🍲':'🥗'} ${htmlSafe(s.name)} <b>＋</b></button>`).join('')}
          <button class="fsugg-edit" onclick="openSuggestManager('${k}')" title="Edit suggestions">✎ edit</button>
        </div>
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
  return `<div class="logrow" data-idx="${i}">
      <span class="fdrag" title="Drag to reorder" aria-label="Drag to reorder">⠿</span>
      <span class="fkind ${e.kind}" title="${KIND_NAME[e.kind]||''}">${KIND_ICON[e.kind]||''}</span>
      <div class="fmain" onclick="openEntryDetail(${i})"><div class="fname">${htmlSafe(entryName(e))}</div><div class="fsub">${sub}</div></div>
      <div class="fkcal">${m.kcal}<small>kcal</small></div>
      <button class="fx" onclick="event.stopPropagation();removeEntry(${i})" title="Remove" aria-label="Remove">✕</button>
    </div>`;
}

function removeEntry(i){ const day=logForDate(foodDate); if(!day) return; day.entries.splice(i,1); markDayDirty(); saveLogDay(foodDate); renderToday(); }
function foodShiftDate(n){ foodDate = addDays(foodDate, n); renderToday(); }

/* ══════════ drag to reorder (ADR-0036) ══════════
 * Replaces HTML5 drag-and-drop, which never worked here at all: `draggable` +
 * dragstart/drop fire on mouse only, so on the phone — the only place this app
 * is actually used — the handle did nothing. Pointer Events cover mouse, touch
 * and stylus through one code path.
 *
 * Design:
 * - The drag starts from the ⠿ handle, not a long-press on the row. A long-press
 *   would race the row's own tap-to-open-detail, and every list that gets this
 *   right on mobile (Reminders, Todoist) uses an explicit handle.
 * - The lifted row follows the finger with a transform. Nothing in the DOM moves
 *   until the drop, so no layout is thrashed mid-gesture and the rects measured
 *   at pickup stay valid.
 * - The drop target is shown as an insertion line rather than by animating rows
 *   apart. Rows here have variable height (a name that wraps is 65px, one that
 *   doesn't is 48px), so shifting neighbours by "one row height" would lie; the
 *   line is unambiguous and costs no per-frame layout.
 * - Dropping into another slot's section reassigns the meal, which is how an
 *   entry moves between Breakfast and Lunch (ADR-0014 removed the slot chips). */

let _drag = null;                    // active gesture, or null

/* Insertion points, computed once at pickup. Each is a place the row could land:
 * a y coordinate to compare the finger against, the slot it belongs to, and the
 * index in day.entries to splice at. */
function foodBuildDropTargets(){
  const pts = [];
  document.querySelectorAll('#todayBody .fslot[data-slot]').forEach(sec=>{
    const slot = sec.dataset.slot;
    const rows = [...sec.querySelectorAll('.logrow')];
    if(!rows.length){
      const box = sec.querySelector('.fslot-entries') || sec;
      const r = box.getBoundingClientRect();
      pts.push({ slot, arrayTarget: null, y: r.top + r.height/2, el: box, edge:'empty' });
      return;
    }
    rows.forEach(row=>{
      const r = row.getBoundingClientRect();
      pts.push({ slot, arrayTarget: +row.dataset.idx, y: r.top, el: row, edge:'before' });
    });
    const last = rows[rows.length-1];
    const lr = last.getBoundingClientRect();
    pts.push({ slot, arrayTarget: +last.dataset.idx + 1, y: lr.bottom, el: last, edge:'after' });
  });
  return pts;
}

function foodDragPickup(ev, row){
  const day = logForDate(foodDate); if(!day) return;
  const rect = row.getBoundingClientRect();
  _drag = {
    row, fromIdx: +row.dataset.idx,
    /* anchor in PAGE coords, not client coords: auto-scroll moves the row with
       the document while the finger stays put, so a client-space delta would let
       the lifted row drift out from under the finger. */
    startPageY: ev.clientY + window.scrollY, dy: 0,
    lastY: ev.clientY,
    targets: null, pick: null,
    pointerId: ev.pointerId, moved: false,
    raf: 0, autoScroll: 0
  };
  row.classList.add('dragging');
  document.body.classList.add('freordering');
  /* measure AFTER the class lands, so the lift transform is already accounted for */
  _drag.targets = foodBuildDropTargets();
  foodDragPaint();
}

/* nearest insertion point to the finger */
function foodDragResolve(clientY){
  const t = _drag.targets; if(!t || !t.length) return null;
  let best = t[0], bestD = Infinity;
  for(const p of t){ const d = Math.abs(p.y - clientY); if(d < bestD){ bestD = d; best = p; } }
  return best;
}

function foodDragPaint(){
  const d = _drag; if(!d) return;
  d.row.style.transform = 'translateY(' + d.dy + 'px)';
  const line = foodDragLine();
  if(d.pick){
    line.style.display = 'block';
    const r = d.pick.el.getBoundingClientRect();
    const y = d.pick.edge === 'after' ? r.bottom : d.pick.edge === 'empty' ? r.top + r.height/2 : r.top;
    line.style.top   = (y + window.scrollY) + 'px';
    line.style.left  = (r.left + window.scrollX) + 'px';
    line.style.width = r.width + 'px';
  } else line.style.display = 'none';
}
function foodDragLine(){
  let el = document.getElementById('fdropline');
  if(!el){ el = document.createElement('div'); el.id = 'fdropline'; el.className = 'fdropline'; document.body.appendChild(el); }
  return el;
}

/* Nudge the page when the finger nears an edge, so a row can travel to a slot
 * that is off screen without letting go. */
function foodDragAutoScroll(clientY){
  const M = 72, SPEED = 12;
  let v = 0;
  if(clientY < M) v = -SPEED * (1 - clientY / M);
  else if(clientY > innerHeight - M) v = SPEED * (1 - (innerHeight - clientY) / M);
  _drag.autoScroll = v;
  if(v && !_drag.raf){
    const step = () => {
      if(!_drag || !_drag.autoScroll){ if(_drag) _drag.raf = 0; return; }
      window.scrollBy(0, _drag.autoScroll);
      /* the page moved under a stationary finger: re-measure the targets, and
         re-derive dy from the page anchor so the row stays under the finger */
      _drag.targets = foodBuildDropTargets();
      _drag.dy = (_drag.lastY + window.scrollY) - _drag.startPageY;
      _drag.pick = foodDragResolve(_drag.lastY);
      foodDragPaint();
      _drag.raf = requestAnimationFrame(step);
    };
    _drag.raf = requestAnimationFrame(step);
  }
}

function foodDragMove(ev){
  const d = _drag; if(!d || ev.pointerId !== d.pointerId) return;
  d.dy = (ev.clientY + window.scrollY) - d.startPageY;
  d.lastY = ev.clientY;
  if(!d.moved && Math.abs(d.dy) > 3) d.moved = true;
  d.pick = foodDragResolve(ev.clientY);
  foodDragAutoScroll(ev.clientY);
  foodDragPaint();
}

function foodDragEnd(commit){
  const d = _drag; if(!d) return;
  _drag = null;
  if(d.raf) cancelAnimationFrame(d.raf);
  d.row.classList.remove('dragging');
  d.row.style.transform = '';
  document.body.classList.remove('freordering');
  const line = document.getElementById('fdropline'); if(line) line.style.display = 'none';

  if(!commit || !d.moved || !d.pick){ return; }

  const day = logForDate(foodDate); if(!day) return;
  const arr = day.entries;
  const from = d.fromIdx;
  let to = (d.pick.arrayTarget == null) ? arr.length : d.pick.arrayTarget;
  const slot = d.pick.slot;

  const [moved] = arr.splice(from, 1);
  if(from < to) to--;                       // the splice shifted everything after it
  to = Math.max(0, Math.min(to, arr.length));
  moved.meal = slot;
  arr.splice(to, 0, moved);

  markDayDirty(); saveLogDay(foodDate); renderToday();
}

/* Delegated once, on the container that survives every re-render. */
(function initFoodDrag(){
  const root = document.body;
  root.addEventListener('pointerdown', ev=>{
    const handle = ev.target.closest && ev.target.closest('.fdrag');
    if(!handle) return;
    const row = handle.closest('.logrow');
    if(!row || !row.closest('#todayBody')) return;
    if(ev.button != null && ev.button !== 0) return;
    ev.preventDefault();                    // no text selection, no scroll-start
    try{ handle.setPointerCapture(ev.pointerId); }catch(e){}
    foodDragPickup(ev, row);
  });
  root.addEventListener('pointermove', ev=>{ if(_drag) { ev.preventDefault(); foodDragMove(ev); } });
  root.addEventListener('pointerup',     ()=>foodDragEnd(true));
  root.addEventListener('pointercancel', ()=>foodDragEnd(false));
  /* the OS can steal the gesture; Escape is the desktop escape hatch */
  window.addEventListener('keydown', e=>{ if(e.key==='Escape' && _drag) foodDragEnd(false); });
})();

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

/* The rings are canvas, and canvas cannot parse a CSS gradient string — so the
 * gradient has to be built as a real CanvasGradient against the ring's own box
 * (ADR-0038). Falls back to the flat colour if anything about the context is
 * unavailable, which keeps the ring drawn rather than blank. */
function foodRingGradient(ctx, size, colorVar){
  const flat=(typeof cssv==='function'&&cssv(colorVar))||'#2f7652';
  const brightVar={ '--fgreen':'--accent2', '--green':'--green2', '--famber':'--amber2', '--amber':'--amber2', '--fred':'--red2', '--red':'--red2', '--fblue':'--blue2', '--blue':'--blue2', '--violet':'--violet2' }[colorVar];
  const bright=(brightVar && typeof cssv==='function' && cssv(brightVar)) || null;
  if(!bright || !ctx || !ctx.createLinearGradient) return flat;
  try{
    /* 135deg, matching --grad and every gradient surface around it */
    const g=ctx.createLinearGradient(0,0,size,size);
    g.addColorStop(0,bright); g.addColorStop(1,flat);
    return g;
  }catch(e){ return flat; }
}

function foodRing(canvasId, value, target, colorVar){
  const el=document.getElementById(canvasId); if(!el || typeof Chart==='undefined') return;
  if(foodCharts[canvasId]) foodCharts[canvasId].destroy();
  const filled=Math.max(0, Math.min(value, target));
  const remain=Math.max(0.0001, target-value);
  const ctx=el.getContext&&el.getContext('2d');
  const col=foodRingGradient(ctx, el.width||104, colorVar);
  const track=(typeof cssv==='function'&&cssv('--paper2'))||'#ece8df';
  foodCharts[canvasId]=new Chart(el,{ type:'doughnut',
    data:{ datasets:[{ data:[filled, remain], backgroundColor:[col, track], borderWidth:0 }] },
    options:{ cutout:'76%', responsive:false, plugins:{legend:{display:false},tooltip:{enabled:false}}, animation:{duration:450} } });
}

/* ══════════ MEALS ══════════ */
function renderMeals(){
  const box=document.getElementById('mealsList'); if(!box) return;
  /* only meals he built — the 30 seeded starter combos stay out of this tab but
   * remain searchable and loggable from Today (see FOOD_STARTER_MEAL_IDS) */
  const meals=(typeof ownMeals==='function')?ownMeals():Object.values(FOOD_MEALS).filter(m=>!String(m.id).startsWith('__'));
  const starterNote=`<div class="fempty subtle" style="margin-top:12px;padding:10px">Starter combos like “Rajma Chawal” aren’t listed here any more — search for them on Today and they’ll still come up.</div>`;
  if(!meals.length){ box.innerHTML=`<div class="fempty">No meals of your own yet. Build reusable bundles like “Blueberry Yeast Protein Smoothie”. <button class="chip" onclick="createMeal&&createMeal()">+ Create a meal</button></div>`+starterNote; return; }
  box.innerHTML = meals.sort((a,b)=>a.name.localeCompare(b.name)).map(meal=>{
    const t=fmtMacros(mealTotals(meal,FOOD_ITEMS));
    return `<div class="frow">
      ${avatarFor(meal.name)}
      <div class="fmain" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')"><div class="fname">${htmlSafe(meal.name)} <span class="fbadge meal">🍲 Meal</span></div><div class="fsub">${(meal.components||[]).length} items · ${t.kcal} kcal · ${t.protein}g P</div></div>
      <button class="btn-sm" onclick="openMealLogSheet&&openMealLogSheet('${meal.id}')">＋ log</button>
      <button class="btn-sm" onclick="editMealById&&editMealById('${meal.id}')">✎</button>
      <button class="btn-sm danger" onclick="confirmDeleteMeal('${meal.id}')">🗑</button>
    </div>`;
  }).join('') + starterNote;
}

/* ══════════ ADD ITEM — form lives in foodForm.js ══════════ */
