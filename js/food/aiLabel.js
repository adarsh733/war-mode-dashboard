/* aiLabel.js — any image carrying nutrition info, in; a pantry item, out.
 *
 * This started as a camera-only label scanner, which was too narrow: most of
 * the time the numbers are already on a screen — a Blinkit/Zepto product page,
 * a HealthifyMe entry, a menu — and a screenshot is one tap where re-shooting a
 * packet is not. So the picker offers camera OR gallery/files, and the model is
 * told to expect any of those sources.
 *
 * The accuracy contract is unchanged: the model transcribes ONLY what the image
 * shows (basis + values + serving size), aiPer100FromPrinted() does the
 * per-serving→per-100 arithmetic in JS, and aiVetProposal() checks it before
 * anything is displayed. Nothing is written until Save is pressed.
 *
 * TRUST FOLLOWS THE SOURCE. A printed panel he photographed is the best data
 * this app can hold → 'verified'. A screenshot of someone else's database is
 * still someone else's estimate → 'ai', with one tap to promote it if he trusts
 * it. Conflating the two is how a guess quietly becomes a fact.
 */

let _aiLabel = null;   // { img, reading, per100, editId, saving, trustOverride }

/* Sources we treat as his own reading of a real label. */
const AI_LABEL_VERIFIED_SOURCES = ['label', 'handwritten'];
const AI_SOURCE_LABEL = {
  label: '📄 Nutrition label', app_screenshot: '📱 App screenshot', website: '🛒 Product page',
  menu: '🍽 Menu', recipe: '📖 Recipe', handwritten: '✍️ Handwritten', other: '🖼 Image'
};

/* Entry point. Opens the chooser first so it works from Add Item and from the
 * "no match" state of search without either caller knowing about cameras. */
function aiAddFromImage() {
  aiLabelShell(`
    <div class="ai-flag info"><b>Anything with the numbers on it works.</b>
      <div>A packet's nutrition panel, a Blinkit or Zepto product page, a HealthifyMe entry, a menu, or your own notes.</div></div>
    <div class="fd-chips" style="margin-top:14px">
      <button class="fd-chip on" onclick="aiScanLabel(true)">📷 Take a photo</button>
      <button class="fd-chip on" onclick="aiScanLabel(false)">🖼 Choose an image</button>
    </div>`, '');
}

/* useCamera=false opens the gallery/files picker — that is the screenshot path. */
async function aiScanLabel(useCamera) {
  const img = await aiPickImage(useCamera === true);
  if (!img.ok) { if (img.error) alert(img.error); return; }

  _aiLabel = { img, reading: null, per100: null, editId: null, saving: false, trustOverride: null };
  aiLabelShell(aiBusyHtml('Reading the image…'));
  await aiLabelRun(null);
}

/* run (or re-run with a correction) */
async function aiLabelRun(correction) {
  const st = _aiLabel; if (!st) return;
  aiLabelSetBody(aiBusyHtml(correction ? 'Re-reading with your correction…' : 'Reading the image…'));

  const r = await aiCall('label', {
    imageB64: st.img.imageB64,
    mediaType: st.img.mediaType,
    correction: correction || null
  });

  if (!r.ok) { aiLabelSetBody(aiErrorHtml(r.error, 'aiLabelRun(null)')); return; }

  const reading = r.data;
  if (!reading.found) {
    aiLabelSetBody(aiErrorHtml(
      (reading.warnings && reading.warnings[0]) || 'No nutrition numbers were readable in that image.',
      'aiAddFromImage()'));
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
      <div class="ai-printed-h">${AI_SOURCE_LABEL[rd.sourceKind] || AI_SOURCE_LABEL.other} — what it showed, ${printedLine}</div>
      <div class="ai-printed-v">${rd.printed.kcal} kcal · ${rd.printed.protein}g P · ${rd.printed.carbs}g C · ${rd.printed.fat}g F${rd.printed.fiber != null ? ' · ' + rd.printed.fiber + 'g fib' : ''}</div>
      ${rd.printedPer === 'serving' ? '<div class="ai-printed-n">Converted to per-100 below by the app, not by the model.</div>' : ''}
    </div>

    <div id="al_trust">${aiLabelTrustHtml()}</div>

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

/* Which trust this reading earns, and why — his own label read beats a
 * screenshot of someone else's database, and the card says so out loud. */
function aiLabelTrust() {
  const st = _aiLabel; if (!st) return 'ai';
  if (st.trustOverride) return st.trustOverride;
  return AI_LABEL_VERIFIED_SOURCES.indexOf(st.reading.sourceKind) >= 0 ? 'verified' : 'ai';
}
function aiLabelTrustHtml() {
  const st = _aiLabel; if (!st || !st.reading) return '';
  const t = aiLabelTrust();
  if (t === 'verified') {
    return '<div class="ai-flag ok"><b>⭐ Saves as verified</b><div>You read this off the product itself — that\'s the strongest data this app holds.</div></div>';
  }
  return '<div class="ai-flag info"><b>🤖 Saves as AI-estimated</b>'
    + '<div>These are someone else\'s numbers, not a panel you read, so they stay marked as an estimate.</div>'
    + '<button class="fd-chip" style="margin-top:8px" onclick="aiLabelPromote()">I trust these — mark ⭐ verified</button></div>';
}
function aiLabelPromote() {
  const st = _aiLabel; if (!st) return;
  st.trustOverride = 'verified';
  const box = document.getElementById('al_trust'); if (box) box.innerHTML = aiLabelTrustHtml();
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
    trust: aiLabelTrust(),        // a label he read → verified; a screenshot → ai
    source: 'image-import',
    aiMeta: {
      source: 'image-import',
      sourceKind: st.reading.sourceKind,
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
function aiLabelShell(body, foot) {
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--fgreen-bg),var(--fcard))">
      <button class="fd-x" onclick="aiLabelClose()">✕</button>
      <div class="fd-hero-name">📸 Add from a photo</div>
      <div class="fd-hero-sub">The app does the maths — the model only reads what it can see</div>
    </div>
    <div class="fd-body" id="aiLabelBody">${body}</div>
    <div class="fd-foot" id="aiLabelFoot">${foot || ''}</div>
  `);
}
function aiLabelSetBody(body, foot) {
  const b = document.getElementById('aiLabelBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiLabelFoot'); if (f) f.innerHTML = foot || '';
}
function aiLabelClose() { _aiLabel = null; fdClose(); }
