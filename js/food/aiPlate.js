/* aiPlate.js — draft a log from a photo of a plate.
 *
 * DELIBERATELY THE WEAKEST FEATURE, and the UI says so. A 2D photo cannot
 * measure mass, and cooking oil is invisible in it — which is the exact error
 * this app exists to capture. So the model only DRAFTS: it names the dishes and
 * proposes portions, and every row must be confirmed before anything is logged.
 *
 * Three things this screen gets right that the first version didn't:
 *
 * 1. PORTIONS ARE IN THE UNIT THE FOOD COMES IN. Asking for the gram weight of
 *    a photographed coconut is a question nobody can answer. The model proposes
 *    a unit — 1 coconut, 3 roti, 1 katori — and foodMath.js multiplies. Grams
 *    stay visible and editable underneath for anything he does weigh.
 * 2. THE CALORIES ARE EDITABLE, and where the correction lands depends on what
 *    the row is: a brand-new dish edits the item being created (right forever),
 *    a dish matched to his pantry writes a one-off macroOverride on that log
 *    entry (leaves his calibrated item alone).
 * 3. NUMBERS FIRST. kcal and protein sit at the top of each row where he looks;
 *    warnings, confidence and the model's notes sit at the bottom.
 *
 * Dishes that match the pantry use OUR per-100 values, not the model's — the
 * app already holds better numbers than a photo can produce.
 */

let _aiPlate = null;   // { img, rows:[], warnings:[], saveMeal, mealName }

const AI_OIL_CHIPS = [['None', 0], ['1 tsp', 5], ['1 tbsp', 14]];

/* Units offered per row. "count" rows keep the model's own piece name (roti,
 * idli, coconut) as the first option, because that is the word he thinks in. */
const AI_PLATE_HOUSEHOLD = ['katori', 'bowl', 'plate', 'glass', 'cup', 'tbsp', 'tsp'];

async function aiScanPlate() {
  const img = await aiPickImage(true);
  if (!img.ok) { if (img.error) alert(img.error); return; }

  _aiPlate = { img, rows: [], warnings: [], saveMeal: false, mealName: '' };
  aiPlateShell(aiBusyHtml('Looking at the plate…'));

  const r = await aiCall('plate', { imageB64: img.imageB64, mediaType: img.mediaType, pantry: aiPlatePantryIndex() });
  if (!r.ok) { aiPlateSetBody(aiErrorHtml(r.error, 'aiScanPlate()'), ''); return; }

  const dishes = r.data.dishes || [];
  if (!dishes.length) {
    aiPlateSetBody(aiErrorHtml('No recognisable dishes in that photo.', 'aiScanPlate()'), '');
    return;
  }

  _aiPlate.rows = dishes.map(d => aiPlateMakeRow(d));
  _aiPlate.warnings = r.data.warnings || [];
  aiPlateRender();
}

/* Bare ids — the 'i:' prefix this used to emit came straight back on
 * matchedItemId, missed FOOD_ITEMS, and made every dish look like a new item
 * even when the pantry already had better numbers for it. */
function aiPlatePantryIndex() {
  return Object.values(FOOD_ITEMS).map(it => it.id + ' | ' + it.name).join('\n');
}

/* A dish the model didn't link is not necessarily a new food — it called a
 * chapati "Roti", which matches nothing by exact name and would have quietly
 * created a fourth roti in the pantry. So when the model returns no match, the
 * deterministic matcher gets a second look at a deliberately high bar. It is
 * shown as an auto-match with "check it" rather than applied silently, and
 * "change match" unlinks it. */
const AI_PLATE_AUTOMATCH_MIN = 0.72;

function aiPlateMakeRow(d) {
  let matched = aiResolveItem(d.matchedItemId);   // tolerates a decorated id
  let autoMatched = false;
  if (!matched && typeof fuzzyBestItem === 'function') {
    const guess = fuzzyBestItem(d.name, AI_PLATE_AUTOMATCH_MIN);
    if (guess) { matched = guess; autoMatched = true; }
  }
  const per100 = matched ? null : (d.per100 || null);
  const vet = matched ? { level: 'ok', issues: [] }
    : aiVetProposal({ name: d.name, per100, confidence: d.confidence });

  const kind = ['count', 'household', 'weight'].indexOf(d.unitKind) >= 0 ? d.unitKind : 'weight';
  let label = (d.unitLabel || '').trim();
  let gpu = Number(d.gramsPerUnit);
  let qty = Number(d.qty);

  if (kind === 'weight') { label = matched ? baseUnit(matched) : 'g'; gpu = 1; }
  if (!(gpu > 0)) gpu = (kind === 'household' ? (householdGrams(label) || 150) : 50);
  if (!(qty > 0)) qty = 1;
  if (!label) label = 'g';

  return {
    name: matched && autoMatched ? matched.name : (d.name || 'Unknown dish'),
    itemId: matched ? matched.id : null,
    autoMatched,
    per100, vet,
    unitKind: kind, unitLabel: label, qty: qty, gpu: gpu,
    oil: aiPlateNearestChip(Number(d.likelyOilGrams) || 0),
    slot: defaultSlot(),
    conf: d.confidence,
    macroOverride: null,            // set only if he corrects the numbers
    include: vet.level !== 'fail'
  };
}

function aiPlateNearestChip(g) {
  if (!(g > 0)) return 0;
  let best = 0, d = 1e9;
  AI_OIL_CHIPS.forEach(([, v]) => { const dd = Math.abs(v - g); if (dd < d) { d = dd; best = v; } });
  return best;
}

/* ---------- math (always here, never from the model) ---------- */

function aiPlateGrams(row) { return unitsToBaseAmount(row.qty, row.gpu); }

/* Macros for a row. An override wins; otherwise per-100 x grams, then oil. */
function aiPlateRowMacros(row) {
  let m;
  if (row.macroOverride) {
    const o = row.macroOverride;
    m = { kcal: +o.kcal || 0, protein: +o.protein || 0, carbs: +o.carbs || 0, fat: +o.fat || 0,
          fiber: (o.fiber != null ? +o.fiber : 0), hasFiber: o.fiber != null };
  } else {
    const src = row.itemId ? FOOD_ITEMS[row.itemId] : { per100: row.per100 || {}, basis: 'g', servings: [] };
    m = macrosForAmount(src, aiPlateGrams(row));
  }
  if (row.oil > 0) m = addInto(Object.assign(zeroMacros(), m), oilMacros(row.oil));
  return fmtMacros(m);
}

/* ---------- render ---------- */

function aiPlateRender() {
  const st = _aiPlate; if (!st) return;
  let totK = 0, totP = 0;

  const rows = st.rows.map((row, i) => {
    const f = aiPlateRowMacros(row);
    if (row.include) { totK += parseFloat(f.kcal) || 0; totP += parseFloat(f.protein) || 0; }
    const badge = row.itemId
      ? (row.autoMatched ? '<span class="ai-badge edited">auto-matched</span>'
                         : '<span class="ai-badge ok">in pantry</span>')
      : '<span class="ai-badge new">new item</span>';
    const low = (row.conf != null && row.conf < 0.6) ? '<span class="ai-lowconf">?</span>' : '';
    const grams = Math.round(aiPlateGrams(row));

    if (!row.include) {
      return `<div class="ai-row off">
        <div class="ai-rowtop"><div class="ai-rowname">${htmlSafe(row.name)}</div>
          <button class="fd-x2" onclick="aiPlateToggle(${i})">↺</button></div>
        <div class="subtle" style="padding:4px 0">Excluded.</div></div>`;
    }

    return `<div class="ai-row">

      <!-- 1 · the numbers, where he actually looks -->
      <div class="ai-rowmac big" id="plmac${i}">
        <span class="ai-mac-kcal">${f.kcal}<small>kcal</small></span>
        <span class="ai-mac-p">${f.protein}g protein</span>
        <button class="fd-chip tiny" onclick="aiPlateEditMacros(${i})">✎ fix</button>
        ${row.macroOverride ? '<span class="ai-badge edited">edited</span>' : ''}
      </div>

      <!-- 2 · what it is -->
      <div class="ai-rowtop">
        <input class="fd-inp ai-rowname-inp" value="${htmlSafe(row.name)}" oninput="aiPlateSet(${i},'name',this.value)">
        ${badge}${low}
        <button class="fd-x2" onclick="aiPlateToggle(${i})" title="Exclude">✕</button>
      </div>
      <div class="ai-rowsub">
        <button class="fd-chip tiny" onclick="aiPlateRematch(${i})">${row.itemId ? '↔ change match' : '🔎 match to pantry'}</button>
      </div>

      <!-- 3 · how much, in the unit the food comes in -->
      <div class="ai-rowctl">
        <input class="fd-inp ai-qty" type="number" inputmode="decimal" step="any" value="${row.qty}" oninput="aiPlateSet(${i},'qty',this.value)">
        <select class="fd-inp ai-unit" onchange="aiPlateSet(${i},'unitLabel',this.value)">${aiPlateUnitOptions(row)}</select>
        <select class="fd-inp ai-slot" onchange="aiPlateSet(${i},'slot',this.value)">
          ${['breakfast', 'lunch', 'dinner', 'snack'].map(s => `<option value="${s}" ${row.slot === s ? 'selected' : ''}>${slotLabel(s)}</option>`).join('')}
        </select>
      </div>
      ${row.unitKind === 'weight' ? '' : `<div class="ai-convert" id="plconv${i}">
        ${row.qty} × 1 ${htmlSafe(row.unitLabel)} =
        <input class="fd-inp ai-gpu" type="number" inputmode="decimal" step="any" value="${row.gpu}" oninput="aiPlateSet(${i},'gpu',this.value)"> g each
        <b>→ ${grams} g</b></div>`}

      <!-- 4 · the thing a photo cannot see -->
      <div class="ai-oilrow">
        <span class="fd-mini">🍳 oil / ghee — invisible in a photo, set it yourself</span>
        <div class="fd-chips">
          ${AI_OIL_CHIPS.map(([l, g]) => `<button type="button" class="fd-chip ${row.oil == g ? 'on' : ''}" onclick="aiPlateSet(${i},'oil',${g})">${l}</button>`).join('')}
          <button type="button" class="fd-chip" onclick="aiPlateOilCustom(${i})">custom</button>
        </div>
      </div>

      <!-- 5 · caveats last -->
      ${!row.itemId && row.vet.issues.length ? aiIssuesHtml(row.vet) : ''}
      ${row.autoMatched ? '<div class="ai-rownote subtle">Matched to this pantry item by name — check it\'s the right one.</div>' : ''}
      ${row.itemId ? '' : '<div class="ai-rownote subtle">New dish — numbers are an AI estimate until you weigh it.</div>'}
    </div>`;
  }).join('');

  const warn = st.warnings.length
    ? `<div class="ai-flag warn"><b>The model noted</b><ul>${st.warnings.map(w => '<li>' + htmlSafe(w) + '</li>').join('')}</ul></div>` : '';

  const n = st.rows.filter(r => r.include).length;

  aiPlateSetBody(`
    <div class="ai-flag info"><b>This is a draft, not a measurement.</b>
      <div>A photo can't weigh food and can't see oil. Check the portions — that's where the calories actually come from.</div></div>
    ${rows}${warn}
    <div class="ai-total" id="plTotal">Total to log: <b>${Math.round(totK)}</b> kcal · <b>${Math.round(totP)}</b>g protein</div>

    <div class="ai-savemeal">
      <label class="ai-toggle"><input type="checkbox" ${st.saveMeal ? 'checked' : ''} onchange="aiPlateSetSaveMeal(this.checked)">
        <span>Also save this plate to my Meals</span></label>
      <div id="plMealName" class="${st.saveMeal ? '' : 'hide'}">
        <div class="fnamerow" style="margin-top:8px">
          <input class="fd-inp wide" id="pl_mealname" placeholder="e.g. Thali plate" value="${htmlSafe(st.mealName)}" oninput="_aiPlate.mealName=this.value">
          <button type="button" class="fd-chip" onclick="aiPlateSuggestName()">✨ Suggest</button>
        </div>
        <div id="plNameSuggest"></div>
      </div>
    </div>
    ${aiUsageNote()}
  `, n ? `<button class="fd-btn primary" onclick="aiPlateCommit()">Add ${n} dish${n > 1 ? 'es' : ''}</button>
          <button class="fd-btn" onclick="aiScanPlate()">Retake photo</button>` : '');
}

/* Unit choices: the model's own piece name first for countables, then the
 * household measures, then raw weight. */
function aiPlateUnitOptions(row) {
  const opts = [];
  const seen = {};
  const add = (v, text) => { const k = v.toLowerCase(); if (seen[k]) return; seen[k] = 1;
    opts.push(`<option value="${htmlSafe(v)}" ${row.unitLabel.toLowerCase() === k ? 'selected' : ''}>${htmlSafe(text)}</option>`); };

  if (row.unitKind === 'count' && row.unitLabel) add(row.unitLabel, row.unitLabel);
  AI_PLATE_HOUSEHOLD.forEach(u => add(u, u));
  add('piece', 'piece');
  add('g', 'grams');
  return opts.join('');
}

/* ---------- edits ---------- */

function aiPlateSet(i, field, v) {
  const st = _aiPlate; if (!st || !st.rows[i]) return;
  const row = st.rows[i];

  /* qty and grams-per-unit are the two numbers he retypes — patch in place so
   * the caret survives, exactly as the NL confirm list does. */
  if (field === 'qty' || field === 'gpu') {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return;
    row[field] = n;
    row.macroOverride = null;      // portion changed → a stale override would lie
    aiPlatePatchNumbers(i);
    return;
  }

  if (field === 'name') { row.name = v; return; }   // don't re-render mid-typing

  if (field === 'unitLabel') {
    row.unitLabel = v;
    if (v === 'g' || v === 'ml') { row.unitKind = 'weight'; row.gpu = 1; }
    else {
      const hg = householdGrams(v);
      row.unitKind = hg != null ? 'household' : 'count';
      if (hg != null) row.gpu = hg;
      else if (!(row.gpu > 1)) row.gpu = 50;
    }
    row.macroOverride = null;
  }
  else if (field === 'oil') row.oil = Number(v) || 0;
  else row[field] = v;

  aiPlateRender();
}

function aiPlatePatchNumbers(i) {
  const st = _aiPlate; if (!st) return;
  const row = st.rows[i];

  const cell = document.getElementById('plmac' + i);
  if (cell) {
    const f = aiPlateRowMacros(row);
    cell.innerHTML = `<span class="ai-mac-kcal">${f.kcal}<small>kcal</small></span>`
      + `<span class="ai-mac-p">${f.protein}g protein</span>`
      + `<button class="fd-chip tiny" onclick="aiPlateEditMacros(${i})">✎ fix</button>`
      + (row.macroOverride ? '<span class="ai-badge edited">edited</span>' : '');
  }
  const conv = document.getElementById('plconv' + i);
  if (conv) {
    const b = conv.querySelector('b');
    if (b) b.textContent = '→ ' + Math.round(aiPlateGrams(row)) + ' g';
  }
  aiPlatePatchTotal();
}
function aiPlatePatchTotal() {
  const st = _aiPlate; if (!st) return;
  const tot = document.getElementById('plTotal'); if (!tot) return;
  let k = 0, p = 0;
  st.rows.filter(r => r.include).forEach(r => { const f = aiPlateRowMacros(r); k += parseFloat(f.kcal) || 0; p += parseFloat(f.protein) || 0; });
  tot.innerHTML = 'Total to log: <b>' + Math.round(k) + '</b> kcal · <b>' + Math.round(p) + '</b>g protein';
}

function aiPlateToggle(i) { const st = _aiPlate; if (!st) return; st.rows[i].include = !st.rows[i].include; aiPlateRender(); }
function aiPlateOilCustom(i) {
  const v = prompt('Oil / ghee in grams (1 tsp ≈ 5g, 1 tbsp ≈ 14g):', _aiPlate.rows[i].oil || '');
  if (v != null) aiPlateSet(i, 'oil', parseFloat(v) || 0);
}

/* ---------- correcting the numbers ---------- */
/* Where the correction lands depends on the row, which is the whole point:
 *  - new dish  → edit the item being created, so it's right from then on
 *  - matched   → a one-off override on this entry, so a ⭐ verified item he
 *                calibrated by weighing is never overwritten by a photo guess */
function aiPlateEditMacros(i) {
  const st = _aiPlate; if (!st || !st.rows[i]) return;
  const row = st.rows[i];
  const cur = aiPlateRowMacros(row);
  const oil = row.oil > 0 ? oilMacros(row.oil) : null;

  const ask = (what, now) => {
    const v = prompt('This whole portion — ' + what + ':', now);
    return v == null ? null : (parseFloat(v) || 0);
  };
  const kcal = ask('calories', cur.kcal);
  if (kcal == null) return;
  const protein = ask('protein in grams', cur.protein);
  if (protein == null) return;

  /* The oil chip is a separate statement about the same row, so strip it back
   * out — otherwise confirming the shown total would double-count it. */
  const base = {
    kcal: Math.max(0, kcal - (oil ? oil.kcal : 0)),
    protein: Math.max(0, protein),
    carbs: cur.carbs, fat: Math.max(0, cur.fat - (oil ? oil.fat : 0)),
    fiber: cur.fiber
  };

  if (!row.itemId) {
    /* new dish — fold the correction into the per-100 the item will be saved
     * with, so photographing it again next week starts from the right number */
    const g = aiPlateGrams(row);
    if (g > 0) {
      const f = 100 / g;
      row.per100 = { kcal: base.kcal * f, protein: base.protein * f, carbs: base.carbs * f, fat: base.fat * f };
      if (base.fiber != null) row.per100.fiber = base.fiber * f;
      row.vet = aiVetProposal({ name: row.name, per100: row.per100, confidence: row.conf });
      row.macroOverride = null;
    }
  } else {
    row.macroOverride = base;
  }
  aiPlateRender();
}

/* ---------- re-matching a dish to the pantry ---------- */
function aiPlateRematch(i) {
  const st = _aiPlate; if (!st || !st.rows[i]) return;
  const row = st.rows[i];
  const hits = (typeof fuzzyFindItems === 'function') ? fuzzyFindItems(row.name, { limit: 6 }) : [];

  fsheetOpen(`
    <div class="fsheet-grab"></div>
    <div class="fsheet-title"><span class="favatar" style="background:var(--fviolet-bg);color:var(--fviolet)">↔</span>
      <div><div class="fname">Match “${htmlSafe(row.name)}”</div><div class="fsub">pick the pantry item this really is</div></div></div>
    <div class="flist" id="plMatchResults">${aiPlateMatchRows(i, hits.map(h => h.item))}</div>
    <input class="fsearch-input" id="plMatchSearch" placeholder="🔍 Search your pantry…" style="margin-top:10px"
      oninput="aiPlateRematchSearch(${i},this.value)">
    ${row.itemId ? `<button class="btn-sm" style="margin-top:12px" onclick="aiPlateSetMatch(${i},'')">Unlink — treat as a new dish</button>` : ''}
  `);
}
function aiPlateMatchRows(i, items) {
  if (!items.length) return '<div class="fempty">No match — search below.</div>';
  return items.map(it => {
    const d = defaultServingMacros(it);
    return `<div class="frow" onclick="aiPlateSetMatch(${i},${aiJsAttr(it.id)})">${avatarFor(it.name)}
      <div class="fmain"><div class="fname">${htmlSafe(it.name)} <span class="ftrust">${TRUST_DOT[it.trust] || ''}</span></div>
      <div class="fsub">${htmlSafe(d.label)} · ${d.m.kcal} kcal</div></div><div class="fkcal">＋</div></div>`;
  }).join('');
}
function aiPlateRematchSearch(i, q) {
  const box = document.getElementById('plMatchResults'); if (!box) return;
  q = (q || '').trim().toLowerCase();
  box.innerHTML = aiPlateMatchRows(i, q.length < 1 ? [] : (typeof foodSearchItems === 'function' ? foodSearchItems(q, 8) : []));
}
function aiPlateSetMatch(i, itemId) {
  const st = _aiPlate; if (!st || !st.rows[i]) return;
  const row = st.rows[i];
  const it = itemId ? aiResolveItem(itemId) : null;
  if (it) {
    row.itemId = it.id; row.name = it.name; row.per100 = null;
    row.vet = { level: 'ok', issues: [] };
    row.macroOverride = null;
    row.autoMatched = false;        // he chose it, so stop asking him to check
  } else {
    row.itemId = null; row.autoMatched = false;
    if (!row.per100) row.per100 = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    row.vet = aiVetProposal({ name: row.name, per100: row.per100, confidence: row.conf });
  }
  fsheetClose();
  aiPlateRender();
}

/* ---------- save-as-meal ---------- */
function aiPlateSetSaveMeal(on) {
  const st = _aiPlate; if (!st) return;
  st.saveMeal = !!on;
  const box = document.getElementById('plMealName');
  if (box) box.classList.toggle('hide', !on);
  if (on && !st.mealName) {
    const names = st.rows.filter(r => r.include).map(r => r.name);
    st.mealName = names.slice(0, 3).join(' + ');
    const inp = document.getElementById('pl_mealname'); if (inp) inp.value = st.mealName;
  }
}
async function aiPlateSuggestName() {
  const st = _aiPlate; if (!st) return;
  const box = document.getElementById('plNameSuggest'); if (box) box.innerHTML = aiBusyHtml('Thinking of names…');
  const comps = st.rows.filter(r => r.include)
    .map(r => r.name + ' — ' + Math.round(aiPlateGrams(r)) + 'g').join('\n');
  const r = await aiCall('mealname', { components: comps });
  if (!box) return;
  if (!r.ok) { box.innerHTML = '<div class="subtle">' + htmlSafe(r.error) + '</div>'; return; }
  box.innerHTML = '<div class="fd-chips" style="margin-top:8px">'
    + (r.data.names || []).map(n => '<button class="fd-chip" onclick="aiPlatePickName(' + aiJsAttr(n) + ')">' + htmlSafe(n) + '</button>').join('')
    + '</div>';
}
function aiPlatePickName(n) {
  const st = _aiPlate; if (!st) return;
  st.mealName = n;
  const inp = document.getElementById('pl_mealname'); if (inp) inp.value = n;
}

/* ---------- commit — the only write ---------- */
function aiPlateCommit() {
  const st = _aiPlate; if (!st) return;
  const use = st.rows.filter(r => r.include);
  if (!use.length) return;

  const day = ensureLogDay(foodDate);
  const forMeal = [];

  use.forEach(row => {
    let itemId = row.itemId;
    const grams = aiPlateGrams(row);
    if (!(grams > 0)) return;

    /* unmatched dish → learn it once so it's never re-processed */
    if (!itemId) {
      if (!row.per100 || row.vet.level === 'fail') return;

      /* dedup first (ADR-0012) — photographing the same dish twice must not
       * create two items. An existing entry's numbers win: they're either his
       * own calibration or an earlier estimate he's already seen. */
      const dup = (typeof findItemByNameBrand === 'function') ? findItemByNameBrand(row.name, '') : null;
      if (dup) {
        itemId = dup.id;
      } else {
        const servings = (row.unitKind === 'weight') ? []
          : [{ label: '1 ' + row.unitLabel, amount: row.gpu }];
        const item = saveItem({
          name: (row.name || 'Dish').trim(),
          brand: '', basis: 'g',
          per100: row.per100,
          servings: servings,
          defaultServingIndex: servings.length ? 0 : -1,
          isHomeCooked: true,
          trust: 'ai',
          source: 'plate-photo',
          aiMeta: { source: 'plate-photo', model: 'claude-opus-4-8', at: new Date().toISOString(), confidence: row.conf }
        });
        itemId = item.id;
      }
    }

    const entry = { kind: 'item', itemId, amount: grams, meal: row.slot,
      disp: { qty: row.qty, unit: row.unitKind === 'weight' ? 'g' : row.unitLabel } };
    if (row.oil > 0) entry.oil = { grams: row.oil, type: 'oil' };
    if (row.macroOverride) entry.macroOverride = row.macroOverride;
    day.entries.push(entry);
    bumpUseCount(itemId);
    logSlotUse(row.slot, 'item', itemId);
    forMeal.push({ itemId, amount: grams });
  });

  /* optional: keep the whole plate as a reusable meal */
  if (st.saveMeal && forMeal.length) {
    const name = (st.mealName || '').trim();
    if (!name) alert('The meal needs a name — logged the dishes, skipped saving the meal.');
    else {
      const oilTotal = use.reduce((a, r) => a + (r.oil || 0), 0);
      saveMeal({ name, components: forMeal, addedOil: oilTotal > 0 ? { grams: oilTotal, type: 'oil' } : null });
    }
  }

  markDayDirty();
  saveLogDay(foodDate);
  _aiPlate = null;
  fdClose();
  if (typeof renderToday === 'function') renderToday();
  if (typeof renderPantry === 'function') renderPantry();
  if (typeof renderMeals === 'function') renderMeals();
}

/* ---------- shell ---------- */
function aiPlateShell(body, foot) {
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--fviolet-bg),var(--fcard))">
      <button class="fd-x" onclick="aiPlateClose()">✕</button>
      <div class="fd-hero-name">🍽 Draft from a plate photo</div>
      <div class="fd-hero-sub">A starting point, not a measurement</div>
    </div>
    <div class="fd-body" id="aiPlateBody">${body || ''}</div>
    <div class="fd-foot" id="aiPlateFoot">${foot || ''}</div>
  `);
}
function aiPlateSetBody(body, foot) {
  const b = document.getElementById('aiPlateBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiPlateFoot'); if (f) f.innerHTML = foot || '';
}
function aiPlateClose() { _aiPlate = null; fdClose(); }
