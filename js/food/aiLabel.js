/* aiLabel.js — photograph a nutrition panel, get a pantry item.
 *
 * The model transcribes ONLY what is printed (basis + values + serving size).
 * aiPer100FromPrinted() does the per-serving→per-100 arithmetic in JS, and
 * aiVetProposal() checks it before anything is shown. Every number stays
 * editable in the confirm card, and nothing is written until the user presses
 * Save. Confirming a label scan produces trust:'verified' — a real label read
 * by a human is the best data this app can hold.
 */

let _aiLabel = null;   // { img, reading, per100, editId, saving }

/* entry point — used from Add Item and from the "no match" state of search */
async function aiScanLabel(useCamera) {
  const img = await aiPickImage(useCamera !== false);
  if (!img.ok) { if (img.error) alert(img.error); return; }

  _aiLabel = { img, reading: null, per100: null, editId: null, saving: false };
  aiLabelShell(aiBusyHtml('Reading the label…'));
  await aiLabelRun(null);
}

/* run (or re-run with a correction) */
async function aiLabelRun(correction) {
  const st = _aiLabel; if (!st) return;
  aiLabelSetBody(aiBusyHtml(correction ? 'Re-reading with your correction…' : 'Reading the label…'));

  const r = await aiCall('label', {
    imageB64: st.img.imageB64,
    mediaType: st.img.mediaType,
    correction: correction || null
  });

  if (!r.ok) { aiLabelSetBody(aiErrorHtml(r.error, 'aiLabelRun(null)')); return; }

  const reading = r.data;
  if (!reading.found) {
    aiLabelSetBody(aiErrorHtml(
      (reading.warnings && reading.warnings[0]) || 'No nutrition panel was readable in that photo.',
      'aiScanLabel(true)'));
    return;
  }

  const conv = aiPer100FromPrinted(reading);
  if (!conv.per100) { aiLabelSetBody(aiErrorHtml(conv.error, 'aiLabelCorrect()')); return; }

  st.reading = reading;
  st.per100 = conv.per100;

  /* dedup before anything else (ADR-0012) */
  const dup = (typeof findItemByNameBrand === 'function')
    ? findItemByNameBrand(reading.name, reading.brand) : null;
  st.editId = dup ? dup.id : null;
  st.dupTrust = dup ? dup.trust : null;

  aiLabelRenderConfirm();
}

/* ---------- confirm card ---------- */
function aiLabelRenderConfirm() {
  const st = _aiLabel; if (!st) return;
  const rd = st.reading, p = st.per100;
  const u = rd.basis === 'ml' ? 'ml' : 'g';

  const vet = aiVetProposal({ name: rd.name, brand: rd.brand, per100: p, confidence: rd.confidence });
  st.vet = vet;

  const printedLine = rd.printedPer === 'serving'
    ? ('per serving of ' + rd.printedServingSize + u + (rd.printedServingLabel ? ' (' + htmlSafe(rd.printedServingLabel) + ')' : ''))
    : ('per 100' + u);

  const modelWarn = (rd.warnings || []).filter(Boolean);

  const dupNote = st.editId
    ? '<div class="ai-flag warn"><b>Already in your pantry</b><div>This matches <b>' + htmlSafe(FOOD_ITEMS[st.editId].name)
      + '</b>. Saving will <b>update that item</b> instead of creating a duplicate.'
      + (st.dupTrust === 'verified' ? ' It is currently marked ⭐ verified — you calibrated it, so double-check before overwriting.' : '')
      + '</div></div>'
    : '';

  aiLabelSetBody(`
    <div class="ai-sec">
      <label class="fd-lbl">Name</label>
      <input class="fd-inp wide" id="al_name" value="${htmlSafe(rd.name || '')}" oninput="aiLabelEdit()">
      <label class="fd-lbl">Brand</label>
      <input class="fd-inp wide" id="al_brand" value="${htmlSafe(rd.brand || '')}" oninput="aiLabelEdit()">
    </div>

    <div class="ai-printed">
      <div class="ai-printed-h">📄 What the label printed — ${printedLine}</div>
      <div class="ai-printed-v">${rd.printed.kcal} kcal · ${rd.printed.protein}g P · ${rd.printed.carbs}g C · ${rd.printed.fat}g F${rd.printed.fiber != null ? ' · ' + rd.printed.fiber + 'g fib' : ''}</div>
      ${rd.printedPer === 'serving' ? '<div class="ai-printed-n">Converted to per-100 below by the app, not by the model.</div>' : ''}
    </div>

    <div class="ai-sec">
      <div class="fd-lbl">Saved as — per 100${u} <span class="subtle">(edit anything that looks wrong)</span></div>
      <div class="fd-editgrid">
        <div><span class="fd-mini">kcal</span><input class="fd-inp" id="al_kcal" type="number" value="${p.kcal}" oninput="aiLabelEdit()"></div>
        <div><span class="fd-mini">protein</span><input class="fd-inp" id="al_prot" type="number" value="${p.protein}" oninput="aiLabelEdit()"></div>
        <div><span class="fd-mini">carbs</span><input class="fd-inp" id="al_carb" type="number" value="${p.carbs}" oninput="aiLabelEdit()"></div>
        <div><span class="fd-mini">fat</span><input class="fd-inp" id="al_fat" type="number" value="${p.fat}" oninput="aiLabelEdit()"></div>
        <div><span class="fd-mini">fiber</span><input class="fd-inp" id="al_fib" type="number" value="${p.fiber != null ? p.fiber : ''}" oninput="aiLabelEdit()"></div>
      </div>
    </div>

    <div id="al_flags">${aiIssuesHtml(vet)}${modelWarn.length ? '<div class="ai-flag warn"><b>The model noted</b><ul>' + modelWarn.map(w => '<li>' + htmlSafe(w) + '</li>').join('') + '</ul></div>' : ''}</div>
    ${dupNote}

    ${(rd.servings || []).length ? '<div class="ai-sec"><div class="fd-lbl">Household units from the label</div>'
      + rd.servings.map(s => '<div class="fd-unitrow"><span class="fd-ulabel">' + htmlSafe(s.label) + '</span><span class="fd-uamt">' + s.amount + ' ' + u + '</span></div>').join('')
      + '</div>' : ''}

    <div class="ai-conf subtle">Model confidence ${Math.round((rd.confidence || 0) * 100)}%${aiUsageNote()}</div>
  `, `
    <button class="fd-btn primary" id="al_save" ${vet.level === 'fail' ? 'disabled' : ''} onclick="aiLabelSave()">${st.editId ? 'Update item' : 'Save item'}</button>
    <button class="fd-btn" onclick="aiLabelCorrect()">✎ Correct reading</button>
  `);
}

/* live re-validate as the user edits */
function aiLabelEdit() {
  const st = _aiLabel; if (!st) return;
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : v; };
  const fibRaw = document.getElementById('al_fib').value;
  st.per100 = { kcal: num('al_kcal'), protein: num('al_prot'), carbs: num('al_carb'), fat: num('al_fat') };
  if (fibRaw !== '' && !isNaN(parseFloat(fibRaw))) st.per100.fiber = parseFloat(fibRaw);
  st.reading.name = document.getElementById('al_name').value;
  st.reading.brand = document.getElementById('al_brand').value;

  const vet = aiVetProposal({ name: st.reading.name, brand: st.reading.brand, per100: st.per100, confidence: st.reading.confidence });
  st.vet = vet;
  const box = document.getElementById('al_flags');
  if (box) box.innerHTML = aiIssuesHtml(vet);
  const btn = document.getElementById('al_save');
  if (btn) btn.disabled = (vet.level === 'fail');
}

/* the negotiation step — tell the model what it got wrong and re-read */
function aiLabelCorrect() {
  const c = prompt('What did it get wrong? e.g. "protein is 25g not 2.5g" or "read the per-100 column"');
  if (c && c.trim()) aiLabelRun(c.trim());
}

function aiLabelSave() {
  const st = _aiLabel; if (!st || st.saving) return;
  if (st.vet && st.vet.level === 'fail') { alert('Fix the flagged problems first.'); return; }

  const name = (st.reading.name || '').trim();
  if (!name) { alert('Give the item a name.'); return; }
  if (!(st.per100.kcal > 0)) { alert('Calories are required.'); return; }

  st.saving = true;
  const existing = st.editId ? FOOD_ITEMS[st.editId] : null;

  if (existing && existing.trust === 'verified' &&
      !confirm('"' + existing.name + '" is already marked verified — you calibrated it.\n\nOverwrite it with this label reading?')) {
    st.saving = false; return;
  }

  const item = Object.assign(existing ? JSON.parse(JSON.stringify(existing)) : {}, {
    id: st.editId || undefined,
    name,
    brand: (st.reading.brand || '').trim(),
    basis: st.reading.basis === 'ml' ? 'ml' : 'g',
    per100: st.per100,
    trust: 'verified',            // a real label, read and confirmed by him
    source: 'label-scan',
    aiMeta: {
      source: 'label-scan',
      model: 'claude-opus-4-8',
      at: new Date().toISOString(),
      printedPer: st.reading.printedPer,
      printedServingSize: st.reading.printedServingSize,
      rawPrinted: st.reading.printed,
      confidence: st.reading.confidence
    }
  });

  /* keep whatever units the user already had; add any the label stated */
  const servings = (existing && existing.servings ? existing.servings.slice() : []);
  (st.reading.servings || []).forEach(s => {
    if (s && s.label && s.amount > 0 && !servings.some(x => normName(x.label) === normName(s.label))) {
      servings.push({ label: s.label, amount: s.amount });
    }
  });
  item.servings = servings;
  if (item.defaultServingIndex == null) item.defaultServingIndex = servings.length ? 0 : -1;

  saveItem(item);
  fdClose();
  _aiLabel = null;

  if (typeof renderPantry === 'function') renderPantry();
  if (typeof renderToday === 'function') renderToday();

  /* straight into logging it — that's usually why he scanned it */
  const saved = findItemByNameBrand(item.name, item.brand);
  if (saved && confirm('Saved "' + item.name + '". Log some now?')) openItemDetail(saved.id, {});
}

/* ---------- sheet shell ---------- */
function aiLabelShell(body) {
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--fgreen-bg),var(--fcard))">
      <button class="fd-x" onclick="aiLabelClose()">✕</button>
      <div class="fd-hero-name">📷 Scan a nutrition label</div>
      <div class="fd-hero-sub">The app does the maths — the model only reads what's printed</div>
    </div>
    <div class="fd-body" id="aiLabelBody">${body}</div>
    <div class="fd-foot" id="aiLabelFoot"></div>
  `);
}
function aiLabelSetBody(body, foot) {
  const b = document.getElementById('aiLabelBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiLabelFoot'); if (f) f.innerHTML = foot || '';
}
function aiLabelClose() { _aiLabel = null; fdClose(); }
