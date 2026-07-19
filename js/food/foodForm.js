/* foodForm.js — Add / Edit Item manual form (spec §8.3, Phase 1).
 * Deterministic conversion to canonical per-100. Manual entry defaults to
 * trust:"verified" (it's his own data). Editing reuses the same form.
 */

let _fmBasis = 'g';       // 'g' | 'ml'
let _fmEditId = null;     // set when editing an existing item

function renderAddItem(){
  const wrap = document.getElementById('addItemBody'); if(!wrap) return;
  _fmBasis = 'g'; _fmEditId = null;
  wrap.innerHTML = addItemFormHtml();
  fmSetBasis('g');
  fmAddServing(); // start with one empty serving row
  fmPreview();
}

function addItemFormHtml(){
  return `
  <div class="card">
    <label class="flabel">Name</label>
    <input id="fi_name" class="finput" placeholder="e.g. Amul Malai Paneer" oninput="fmPreview()" autocomplete="off">

    <label class="flabel">Brand <span class="subtle">(optional)</span></label>
    <input id="fi_brand" class="finput" placeholder="e.g. Amul" autocomplete="off">

    <label class="flabel">Type</label>
    <div class="fseg" id="fi_basis">
      <button type="button" class="on" data-basis="g" onclick="fmSetBasis('g')">Solid · grams</button>
      <button type="button" data-basis="ml" onclick="fmSetBasis('ml')">Liquid · ml</button>
    </div>

    <div class="sec-label">Nutrition</div>
    <label class="flabel">These values are for</label>
    <div class="frow2">
      <select id="fi_mode" class="finput" onchange="fmModeChange();fmPreview()">
        <option value="100">Per 100 <span></span></option>
        <option value="serv">A serving of…</option>
      </select>
      <div id="fi_servwrap" style="display:none">
        <input id="fi_servamount" class="finput" type="number" inputmode="decimal" placeholder="amount" oninput="fmPreview()">
        <span class="funit" id="fi_servunit">g</span>
      </div>
    </div>

    <div class="fmacros">
      <div><label class="flabel">Calories</label><input id="fi_kcal" class="finput" type="number" inputmode="decimal" placeholder="kcal" oninput="fmPreview()"></div>
      <div><label class="flabel">Protein (g)</label><input id="fi_protein" class="finput" type="number" inputmode="decimal" placeholder="g" oninput="fmPreview()"></div>
      <div><label class="flabel">Carbs (g)</label><input id="fi_carbs" class="finput" type="number" inputmode="decimal" placeholder="g" oninput="fmPreview()"></div>
      <div><label class="flabel">Fat (g)</label><input id="fi_fat" class="finput" type="number" inputmode="decimal" placeholder="g" oninput="fmPreview()"></div>
      <div><label class="flabel">Fiber (g) <span class="subtle">opt</span></label><input id="fi_fiber" class="finput" type="number" inputmode="decimal" placeholder="g" oninput="fmPreview()"></div>
    </div>

    <div class="sec-label">Household servings <span class="subtle">(optional — grams/ml always available)</span></div>
    <div id="fi_servings"></div>
    <button type="button" class="btn-sm" onclick="fmAddServing()">+ Add serving</button>

    <label class="fcheck" style="margin-top:16px"><input type="checkbox" id="fi_home"> 🍳 Home-cooked <span class="subtle">— prompt for oil/ghee when logging</span></label>

    <div class="fpreview" id="fi_preview"></div>

    <div class="fdet-actions" style="margin-top:16px">
      <button type="button" class="btn-primary" onclick="saveNewItem()">Save item</button>
      <button type="button" class="btn-sm" onclick="go('food-pantry')">Cancel</button>
      <span id="fi_editnote" class="subtle" style="margin-left:auto;align-self:center"></span>
    </div>
  </div>`;
}

function fmSetBasis(b){
  _fmBasis = b;
  document.querySelectorAll('#fi_basis button').forEach(x=>x.classList.toggle('on', x.dataset.basis===b));
  const u = b==='ml' ? 'ml' : 'g';
  const su = document.getElementById('fi_servunit'); if(su) su.textContent = u;
  document.querySelectorAll('.fserv-unit').forEach(e=>e.textContent = u);
  const opt = document.querySelector('#fi_mode option[value="100"]'); if(opt) opt.textContent = 'Per 100 ' + u;
  fmPreview();
}
function fmModeChange(){
  const serv = document.getElementById('fi_mode').value==='serv';
  document.getElementById('fi_servwrap').style.display = serv ? 'flex' : 'none';
}

function fmAddServing(label, amount, isDefault){
  const box = document.getElementById('fi_servings'); if(!box) return;
  const u = _fmBasis==='ml' ? 'ml' : 'g';
  const row = document.createElement('div');
  row.className = 'fserv-row';
  row.innerHTML = `
    <input class="finput fserv-label" placeholder="label e.g. 1 katori" value="${label?htmlSafe(label):''}" oninput="fmPreview()">
    <input class="finput fserv-amt" type="number" inputmode="decimal" placeholder="amt" value="${amount!=null?amount:''}" oninput="fmPreview()">
    <span class="funit fserv-unit">${u}</span>
    <label class="fserv-def"><input type="radio" name="fi_default" ${isDefault?'checked':''}> def</label>
    <button type="button" class="btn-sm danger" onclick="this.parentElement.remove();fmPreview()">✕</button>`;
  box.appendChild(row);
}

/* read the macros the user typed, normalized to per-100 (deterministic) */
function fmReadPer100(){
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v)?0:v; };
  const raw = { kcal:num('fi_kcal'), protein:num('fi_protein'), carbs:num('fi_carbs'), fat:num('fi_fat') };
  const fiberRaw = document.getElementById('fi_fiber').value;
  const hasFiber = fiberRaw!=='' && !isNaN(parseFloat(fiberRaw));
  if(hasFiber) raw.fiber = parseFloat(fiberRaw);
  const mode = document.getElementById('fi_mode').value;
  let factor = 1;
  if(mode==='serv'){
    const amt = parseFloat(document.getElementById('fi_servamount').value);
    factor = (amt>0) ? 100/amt : 0;   // convert serving values → per 100
  }
  const per100 = { kcal:raw.kcal*factor, protein:raw.protein*factor, carbs:raw.carbs*factor, fat:raw.fat*factor };
  if(hasFiber) per100.fiber = raw.fiber*factor;
  return per100;
}
function fmReadServings(){
  const rows = [...document.querySelectorAll('#fi_servings .fserv-row')];
  const servings = []; let def = -1;
  rows.forEach(r=>{
    const label = r.querySelector('.fserv-label').value.trim();
    const amt = parseFloat(r.querySelector('.fserv-amt').value);
    if(label && amt>0){
      if(r.querySelector('.fserv-def input').checked) def = servings.length;
      servings.push({ label, amount:amt });
    }
  });
  return { servings, def: def>=0 ? def : (servings.length?0:-1) };
}

function fmPreview(){
  const el = document.getElementById('fi_preview'); if(!el) return;
  const p = fmReadPer100(); const u = _fmBasis==='ml'?'ml':'g';
  const f = fmtMacros({ kcal:p.kcal, protein:p.protein, carbs:p.carbs, fat:p.fat, fiber:p.fiber||0, hasFiber:p.fiber!=null });
  el.innerHTML = `<div class="fpreview-inner">Per 100${u}: <b>${f.kcal}</b> kcal · ${f.protein}g P · ${f.carbs}g C · ${f.fat}g F${f.fiber!=null?` · ${f.fiber}g fiber`:''}</div>`;
}

function saveNewItem(){
  const name = document.getElementById('fi_name').value.trim();
  if(!name){ alert('Give the item a name.'); return; }
  const per100 = fmReadPer100();
  if(!(per100.kcal>0)){ alert('Enter at least the calories.'); return; }
  const { servings, def } = fmReadServings();

  const existing = _fmEditId ? FOOD_ITEMS[_fmEditId] : null;
  const item = Object.assign(existing ? JSON.parse(JSON.stringify(existing)) : {}, {
    id: _fmEditId || undefined,
    name,
    brand: document.getElementById('fi_brand').value.trim(),
    basis: _fmBasis,
    per100,
    servings,
    defaultServingIndex: def,
    isHomeCooked: document.getElementById('fi_home').checked,
    trust: existing ? existing.trust : 'verified',   // manual entry = his own data
    source: existing ? existing.source : 'manual'
  });
  saveItem(item);
  go('food-pantry');
  if(typeof renderPantry==='function') renderPantry();
}

/* prefill the form for editing (called from Pantry → Edit) */
function loadItemIntoForm(id){
  const it = FOOD_ITEMS[id]; if(!it) return;
  renderAddItem();
  _fmEditId = id;
  document.getElementById('fi_name').value = it.name || '';
  document.getElementById('fi_brand').value = it.brand || '';
  fmSetBasis(it.basis || 'g');
  document.getElementById('fi_mode').value = '100'; fmModeChange();
  const p = it.per100 || {};
  document.getElementById('fi_kcal').value = p.kcal ?? '';
  document.getElementById('fi_protein').value = p.protein ?? '';
  document.getElementById('fi_carbs').value = p.carbs ?? '';
  document.getElementById('fi_fat').value = p.fat ?? '';
  document.getElementById('fi_fiber').value = (p.fiber!=null? p.fiber : '');
  document.getElementById('fi_home').checked = !!it.isHomeCooked;
  document.getElementById('fi_servings').innerHTML = '';
  (it.servings||[]).forEach((s,i)=> fmAddServing(s.label, s.amount, i===it.defaultServingIndex));
  if(!(it.servings||[]).length) fmAddServing();
  const note = document.getElementById('fi_editnote'); if(note) note.textContent = 'editing existing item';
  fmPreview();
}
