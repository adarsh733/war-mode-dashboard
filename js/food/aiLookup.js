/* aiLookup.js — a food isn't in the pantry, so go and find it.
 *
 * The proxy runs this as a research call (web search) followed by a structuring
 * call, then the same validator every other AI path uses. Saved as trust:'ai'
 * with its sources kept in notes — these are reference numbers off the internet,
 * not a label he read, so they must never masquerade as verified.
 *
 * Learn-once: the item lands in the pantry, so the same food is never
 * researched twice (product-spec §3.4 — the main Phase 2 cost control).
 */

let _aiLookup = null;   // { query, data, per100, editId, vet }

async function aiLookupFood(query) {
  const q = (query && String(query).trim()) || prompt('What food should I look up?') || '';
  if (!q.trim()) return;

  _aiLookup = { query: q.trim(), data: null, per100: null, editId: null };

  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--famber-bg),var(--fcard))">
      <button class="fd-x" onclick="aiLookupClose()">✕</button>
      <div class="fd-hero-name">🔎 ${htmlSafe(q)}</div>
      <div class="fd-hero-sub">Searching for reference nutrition data</div>
    </div>
    <div class="fd-body" id="aiLookupBody">${aiBusyHtml('Searching — this one takes a few seconds…')}</div>
    <div class="fd-foot" id="aiLookupFoot"></div>
  `);

  const r = await aiCall('lookup', { query: _aiLookup.query });
  if (!r.ok) { aiLookupSet(aiErrorHtml(r.error, 'aiLookupFood(' + aiJsAttr(_aiLookup.query) + ')'), ''); return; }

  const d = r.data;
  if (!d.found) {
    aiLookupSet(aiErrorHtml((d.warnings && d.warnings[0]) || 'Couldn\'t find reliable numbers for that.',
      'aiLookupFood(' + aiJsAttr(_aiLookup.query) + ')')
      + '<button class="fd-chip" onclick="fdClose();go(\'food-add\')">✎ Add it manually instead</button>', '');
    return;
  }

  _aiLookup.data = d;
  _aiLookup.per100 = Object.assign({}, d.per100);
  const dup = (typeof findItemByNameBrand === 'function') ? findItemByNameBrand(d.name, d.brand) : null;
  _aiLookup.editId = dup ? dup.id : null;
  _aiLookup.dupTrust = dup ? dup.trust : null;

  aiLookupRender();
}

function aiLookupRender() {
  const st = _aiLookup; if (!st || !st.data) return;
  const d = st.data, p = st.per100;
  const u = d.basis === 'ml' ? 'ml' : 'g';

  const vet = aiVetProposal({ name: d.name, brand: d.brand, per100: p, confidence: d.confidence });
  st.vet = vet;

  const dupNote = st.editId
    ? '<div class="ai-flag warn"><b>Already in your pantry</b><div>This matches <b>' + htmlSafe(FOOD_ITEMS[st.editId].name)
      + '</b> and will update it rather than duplicating.'
      + (st.dupTrust === 'verified' ? ' That item is ⭐ verified — internet averages are weaker data than your own calibration.' : '')
      + '</div></div>' : '';

  aiLookupSet(`
    <div class="ai-sec">
      <label class="fd-lbl">Name</label>
      <input class="fd-inp wide" id="lk_name" value="${htmlSafe(d.name || '')}" oninput="aiLookupEdit()">
      <label class="fd-lbl">Brand</label>
      <input class="fd-inp wide" id="lk_brand" value="${htmlSafe(d.brand || '')}" oninput="aiLookupEdit()">
    </div>

    <div class="ai-sec">
      <div class="fd-lbl">Per 100${u} <span class="subtle">(reference values — edit to match your kitchen)</span></div>
      <div class="fd-editgrid">
        <div><span class="fd-mini">kcal</span><input class="fd-inp" id="lk_kcal" type="number" value="${p.kcal}" oninput="aiLookupEdit()"></div>
        <div><span class="fd-mini">protein</span><input class="fd-inp" id="lk_prot" type="number" value="${p.protein}" oninput="aiLookupEdit()"></div>
        <div><span class="fd-mini">carbs</span><input class="fd-inp" id="lk_carb" type="number" value="${p.carbs}" oninput="aiLookupEdit()"></div>
        <div><span class="fd-mini">fat</span><input class="fd-inp" id="lk_fat" type="number" value="${p.fat}" oninput="aiLookupEdit()"></div>
        <div><span class="fd-mini">fiber</span><input class="fd-inp" id="lk_fib" type="number" value="${p.fiber != null ? p.fiber : ''}" oninput="aiLookupEdit()"></div>
      </div>
    </div>

    <div id="lk_flags">${aiIssuesHtml(vet)}</div>
    ${dupNote}

    <div class="ai-flag info"><b>🤖 Saved as AI-estimated</b>
      <div>Generic internet data, not your kitchen. Calibrate it once you've weighed it — editing later flips it to ⭐ verified.</div></div>

    ${(d.sources || []).length ? '<div class="ai-sec"><div class="fd-lbl">Sources</div>'
      + d.sources.slice(0, 5).map(s => '<div class="ai-src">' + htmlSafe(s) + '</div>').join('') + '</div>' : ''}

    <div class="ai-conf subtle">Model confidence ${Math.round((d.confidence || 0) * 100)}%${aiUsageNote()}</div>
  `, `<button class="fd-btn primary" id="lk_save" ${vet.level === 'fail' ? 'disabled' : ''} onclick="aiLookupSave()">${st.editId ? 'Update item' : 'Save to pantry'}</button>
      <button class="fd-btn" onclick="aiLookupClose()">Cancel</button>`);
}

function aiLookupEdit() {
  const st = _aiLookup; if (!st) return;
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 0 : v; };
  const fib = document.getElementById('lk_fib').value;
  st.per100 = { kcal: num('lk_kcal'), protein: num('lk_prot'), carbs: num('lk_carb'), fat: num('lk_fat') };
  if (fib !== '' && !isNaN(parseFloat(fib))) st.per100.fiber = parseFloat(fib);
  st.data.name = document.getElementById('lk_name').value;
  st.data.brand = document.getElementById('lk_brand').value;

  const vet = aiVetProposal({ name: st.data.name, brand: st.data.brand, per100: st.per100, confidence: st.data.confidence });
  st.vet = vet;
  const box = document.getElementById('lk_flags'); if (box) box.innerHTML = aiIssuesHtml(vet);
  const btn = document.getElementById('lk_save'); if (btn) btn.disabled = (vet.level === 'fail');
}

function aiLookupSave() {
  const st = _aiLookup; if (!st || st.saving) return;   // guard: a double-tap must not create two items
  if (st.vet && st.vet.level === 'fail') { alert('Fix the flagged problems first.'); return; }
  const name = (st.data.name || '').trim();
  if (!name) { alert('Give it a name.'); return; }

  const existing = st.editId ? FOOD_ITEMS[st.editId] : null;
  if (existing && existing.trust === 'verified' &&
      !confirm('"' + existing.name + '" is ⭐ verified — your own calibration.\n\nReplace it with looked-up averages?')) return;
  st.saving = true;

  const srcNote = (st.data.sources || []).slice(0, 3).join(' · ');
  const item = Object.assign(existing ? JSON.parse(JSON.stringify(existing)) : {}, {
    id: st.editId || undefined,
    name,
    brand: (st.data.brand || '').trim(),
    basis: st.data.basis === 'ml' ? 'ml' : 'g',
    per100: st.per100,
    servings: (existing && existing.servings && existing.servings.length)
      ? existing.servings
      : (st.data.servings || []).filter(s => s && s.label && s.amount > 0),
    trust: 'ai',
    source: 'web-lookup',
    notes: (srcNote ? 'Sources: ' + srcNote : ''),
    aiMeta: { source: 'web-lookup', model: 'claude-opus-4-8', at: new Date().toISOString(),
      query: st.query, confidence: st.data.confidence, sources: st.data.sources || [] }
  });
  if (item.defaultServingIndex == null) item.defaultServingIndex = (item.servings || []).length ? 0 : -1;

  saveItem(item);
  fdClose(); _aiLookup = null;
  if (typeof renderPantry === 'function') renderPantry();

  const saved = findItemByNameBrand(item.name, item.brand);
  if (saved && confirm('Added "' + item.name + '" to your pantry. Log some now?')) openItemDetail(saved.id, {});
}

function aiLookupSet(body, foot) {
  const b = document.getElementById('aiLookupBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiLookupFoot'); if (f) f.innerHTML = foot || '';
}
function aiLookupClose() { _aiLookup = null; fdClose(); }
