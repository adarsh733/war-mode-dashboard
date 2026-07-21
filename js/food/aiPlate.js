/* aiPlate.js — draft a log from a photo of a plate.
 *
 * DELIBERATELY THE WEAKEST FEATURE, and the UI says so. A 2D photo cannot
 * measure mass, and cooking oil is invisible in it — which is the exact error
 * this app exists to capture. So the model only DRAFTS: it names the dishes and
 * proposes portions, and every row must be confirmed (grams + oil) before
 * anything is logged. Nothing here is ever trusted as a measurement.
 *
 * Dishes that match the pantry use OUR per-100 values, not the model's — the
 * app already holds better numbers than a photo can produce.
 */

let _aiPlate = null;   // { img, rows:[], warnings:[] }

const AI_OIL_CHIPS = [['None', 0], ['1 tsp', 5], ['1 tbsp', 14]];

async function aiScanPlate() {
  const img = await aiPickImage(true);
  if (!img.ok) { if (img.error) alert(img.error); return; }

  _aiPlate = { img, rows: [], warnings: [] };
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--fviolet-bg),var(--fcard))">
      <button class="fd-x" onclick="aiPlateClose()">✕</button>
      <div class="fd-hero-name">🍽 Draft from a plate photo</div>
      <div class="fd-hero-sub">A starting point, not a measurement</div>
    </div>
    <div class="fd-body" id="aiPlateBody">${aiBusyHtml('Looking at the plate…')}</div>
    <div class="fd-foot" id="aiPlateFoot"></div>
  `);

  const r = await aiCall('plate', { imageB64: img.imageB64, mediaType: img.mediaType, pantry: aiPlatePantryIndex() });
  if (!r.ok) { aiPlateSetBody(aiErrorHtml(r.error, 'aiScanPlate()'), ''); return; }

  const dishes = r.data.dishes || [];
  if (!dishes.length) {
    aiPlateSetBody(aiErrorHtml('No recognisable dishes in that photo.', 'aiScanPlate()'), '');
    return;
  }

  _aiPlate.rows = dishes.map(d => {
    const matched = d.matchedItemId && FOOD_ITEMS[d.matchedItemId] ? d.matchedItemId : null;
    const per100 = matched ? null : (d.per100 || null);
    const vet = matched ? { level: 'ok', issues: [] }
      : aiVetProposal({ name: d.name, per100, confidence: d.confidence });
    return {
      name: d.name || 'Unknown dish',
      itemId: matched,
      per100,
      vet,
      grams: Math.max(1, Math.round(Number(d.proposedGrams) || 100)),
      oil: aiPlateNearestChip(Number(d.likelyOilGrams) || 0),
      slot: defaultSlot(),
      conf: d.confidence,
      include: vet.level !== 'fail'
    };
  });
  _aiPlate.warnings = r.data.warnings || [];
  aiPlateRender();
}

function aiPlatePantryIndex() {
  return Object.values(FOOD_ITEMS).map(it => 'i:' + it.id + ' | ' + it.name).join('\n');
}
function aiPlateNearestChip(g) {
  if (!(g > 0)) return 0;
  let best = 0, d = 1e9;
  AI_OIL_CHIPS.forEach(([, v]) => { const dd = Math.abs(v - g); if (dd < d) { d = dd; best = v; } });
  return best;
}

/* macros for a row — always computed here, never taken from the model */
function aiPlateRowMacros(row) {
  const fake = row.itemId ? FOOD_ITEMS[row.itemId] : { per100: row.per100 || {}, basis: 'g', servings: [] };
  let m = macrosForAmount(fake, row.grams);
  if (row.oil > 0) m = addInto(Object.assign(zeroMacros(), m), oilMacros(row.oil));
  return fmtMacros(m);
}

function aiPlateRender() {
  const st = _aiPlate; if (!st) return;
  let totK = 0, totP = 0;

  const rows = st.rows.map((row, i) => {
    const f = aiPlateRowMacros(row);
    if (row.include) { totK += parseFloat(f.kcal) || 0; totP += parseFloat(f.protein) || 0; }
    const badge = row.itemId
      ? '<span class="ai-badge ok">in pantry</span>'
      : '<span class="ai-badge new">new item</span>';
    const low = (row.conf != null && row.conf < 0.6) ? '<span class="ai-lowconf">?</span>' : '';

    return `<div class="ai-row ${row.include ? '' : 'off'}">
      <div class="ai-rowtop">
        <input class="fd-inp ai-rowname-inp" value="${htmlSafe(row.name)}" oninput="aiPlateSet(${i},'name',this.value)">
        ${badge}${low}
        <button class="fd-x2" onclick="aiPlateToggle(${i})">${row.include ? '✕' : '↺'}</button>
      </div>

      ${row.include ? `
      <div class="ai-rowctl">
        <label class="ai-gramlbl">grams
          <input class="fd-inp ai-qty" type="number" inputmode="decimal" value="${row.grams}" oninput="aiPlateSet(${i},'grams',this.value)">
        </label>
        <select class="fd-inp ai-slot" onchange="aiPlateSet(${i},'slot',this.value)">
          ${['breakfast', 'lunch', 'dinner', 'snack'].map(s => `<option value="${s}" ${row.slot === s ? 'selected' : ''}>${slotLabel(s)}</option>`).join('')}
        </select>
      </div>

      <div class="ai-oilrow">
        <span class="fd-mini">🍳 oil / ghee — invisible in a photo, set it yourself</span>
        <div class="fd-chips">
          ${AI_OIL_CHIPS.map(([l, g]) => `<button type="button" class="fd-chip ${row.oil == g ? 'on' : ''}" onclick="aiPlateSet(${i},'oil',${g})">${l}</button>`).join('')}
          <button type="button" class="fd-chip" onclick="aiPlateOilCustom(${i})">custom</button>
        </div>
      </div>

      ${!row.itemId && row.vet.issues.length ? aiIssuesHtml(row.vet) : ''}
      <div class="ai-rowmac" id="plmac${i}">${f.kcal} kcal · ${f.protein}g protein${row.itemId ? '' : ' <span class="subtle">(from AI estimate)</span>'}</div>
      ` : '<div class="subtle" style="padding:6px 0">Excluded.</div>'}
    </div>`;
  }).join('');

  const warn = st.warnings.length
    ? `<div class="ai-flag warn"><b>The model noted</b><ul>${st.warnings.map(w => '<li>' + htmlSafe(w) + '</li>').join('')}</ul></div>` : '';

  const n = st.rows.filter(r => r.include).length;

  aiPlateSetBody(`
    <div class="ai-flag info"><b>This is a draft, not a measurement.</b>
      <div>A photo can't weigh food and can't see oil. Check the grams on every row — that's where the calories actually come from.</div></div>
    ${rows}${warn}
    <div class="ai-total" id="plTotal">Total to log: <b>${Math.round(totK)}</b> kcal · <b>${Math.round(totP)}</b>g protein</div>
    ${aiUsageNote()}
  `, n ? `<button class="fd-btn primary" onclick="aiPlateCommit()">Add ${n} dish${n > 1 ? 'es' : ''}</button>
          <button class="fd-btn" onclick="aiScanPlate()">Retake photo</button>` : '');
}

function aiPlateSet(i, field, v) {
  const st = _aiPlate; if (!st || !st.rows[i]) return;
  const row = st.rows[i];

  /* grams is the number that matters most on this screen and the one the user
   * will actually retype — patch it in place so the caret survives. */
  if (field === 'grams') {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return;
    row.grams = n;
    aiPlatePatchNumbers(i);
    return;
  }

  if (field === 'oil') row.oil = Number(v) || 0;
  else if (field === 'name') { row.name = v; return; }   // don't re-render mid-typing
  else row[field] = v;
  aiPlateRender();
}

function aiPlatePatchNumbers(i) {
  const st = _aiPlate; if (!st) return;
  const row = st.rows[i];
  const cell = document.getElementById('plmac' + i);
  if (cell) {
    const f = aiPlateRowMacros(row);
    cell.innerHTML = f.kcal + ' kcal · ' + f.protein + 'g protein'
      + (row.itemId ? '' : ' <span class="subtle">(from AI estimate)</span>');
  }
  const tot = document.getElementById('plTotal');
  if (tot) {
    let k = 0, p = 0;
    st.rows.filter(r => r.include).forEach(r => { const f = aiPlateRowMacros(r); k += parseFloat(f.kcal) || 0; p += parseFloat(f.protein) || 0; });
    tot.innerHTML = 'Total to log: <b>' + Math.round(k) + '</b> kcal · <b>' + Math.round(p) + '</b>g protein';
  }
}
function aiPlateToggle(i) { const st = _aiPlate; if (!st) return; st.rows[i].include = !st.rows[i].include; aiPlateRender(); }
function aiPlateOilCustom(i) {
  const v = prompt('Oil / ghee in grams (1 tsp ≈ 5g, 1 tbsp ≈ 14g):', _aiPlate.rows[i].oil || '');
  if (v != null) aiPlateSet(i, 'oil', parseFloat(v) || 0);
}

function aiPlateCommit() {
  const st = _aiPlate; if (!st) return;
  const use = st.rows.filter(r => r.include);
  if (!use.length) return;

  const day = ensureLogDay(foodDate);

  use.forEach(row => {
    let itemId = row.itemId;

    /* unmatched dish → learn it once so it's never re-processed */
    if (!itemId) {
      if (!row.per100 || row.vet.level === 'fail') return;

      /* dedup first (ADR-0012) — photographing the same dish twice must not
       * create two items. An existing entry's numbers win: they're either his
       * own calibration or an earlier estimate he's already seen. */
      const dup = (typeof findItemByNameBrand === 'function') ? findItemByNameBrand(row.name, '') : null;
      if (dup) {
        day.entries.push(Object.assign(
          { kind: 'item', itemId: dup.id, amount: row.grams, meal: row.slot, disp: { qty: row.grams, unit: 'g' } },
          row.oil > 0 ? { oil: { grams: row.oil, type: 'oil' } } : {}
        ));
        bumpUseCount(dup.id); logSlotUse(row.slot, 'item', dup.id);
        return;
      }

      const item = saveItem({
        name: (row.name || 'Dish').trim(),
        brand: '',
        basis: 'g',
        per100: row.per100,
        servings: [],
        defaultServingIndex: -1,
        isHomeCooked: true,
        trust: 'ai',
        source: 'plate-photo',
        aiMeta: { source: 'plate-photo', model: 'claude-opus-4-8', at: new Date().toISOString(), confidence: row.conf }
      });
      itemId = item.id;
    }

    const entry = { kind: 'item', itemId, amount: row.grams, meal: row.slot,
      disp: { qty: row.grams, unit: 'g' } };
    if (row.oil > 0) entry.oil = { grams: row.oil, type: 'oil' };
    day.entries.push(entry);
    bumpUseCount(itemId);
    logSlotUse(row.slot, 'item', itemId);
  });

  markDayDirty();
  saveLogDay(foodDate);
  _aiPlate = null;
  fdClose();
  if (typeof renderToday === 'function') renderToday();
  if (typeof renderPantry === 'function') renderPantry();
}

function aiPlateSetBody(body, foot) {
  const b = document.getElementById('aiPlateBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiPlateFoot'); if (f) f.innerHTML = foot || '';
}
function aiPlateClose() { _aiPlate = null; fdClose(); }
