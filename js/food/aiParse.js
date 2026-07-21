/* aiParse.js — "3 roti, dal, curd and a scoop of whey" → a reviewed log.
 *
 * The model's only job is MAPPING: turn a sentence into references to items the
 * user already owns, with a quantity and a slot. It never computes macros — the
 * confirm list recomputes every row locally with macrosForAmount(), so what you
 * see is what foodMath says, not what the model said.
 *
 * Nothing is logged until "Add all" is pressed, and every row stays editable.
 */

let _aiParse = null;   // { text, rows:[], unknowns:[] }

/* Compact pantry index — ids, names and aliases only. Deliberately excludes
 * macros: the model doesn't need them and they'd bloat every request. */
function aiPantryIndex() {
  const lines = [];
  Object.values(FOOD_ITEMS).forEach(it => {
    const al = (it.aliases || []).slice(0, 6).join(', ');
    lines.push('i:' + it.id + ' | ' + it.name + (al ? ' | ' + al : ''));
  });
  Object.values(FOOD_MEALS).forEach(m => {
    if (String(m.id).startsWith('__')) return;      // reserved rows
    lines.push('m:' + m.id + ' | ' + m.name);
  });
  return lines.join('\n');
}

/* Map a unit string onto the item's own servings.
 * → { si, guessed }  si = serving index, or -1 for the base unit (g/ml)
 *
 * The dangerous case is an unrecognised unit like "roti" or "katori" on an item
 * whose serving is labelled "1 medium roti". Falling back to grams would log
 * "3 roti" as THREE GRAMS — a silent 300 kcal error. So anything that isn't an
 * explicit g/ml falls back to the item's DEFAULT SERVING and is flagged as a
 * guess, which surfaces the ? marker in the confirm list. */
const AI_BASE_UNIT_WORDS = ['g', 'gram', 'grams', 'gm', 'gms', 'ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'];

function aiResolveUnit(item, unitStr) {
  const u = normName(unitStr || '');
  const list = item.servings || [];

  if (u && AI_BASE_UNIT_WORDS.indexOf(u) >= 0) return { si: -1, guessed: false };

  if (u) {
    let i = list.findIndex(s => normName(s.label) === u);
    if (i >= 0) return { si: i, guessed: false };
    i = list.findIndex(s => normName(s.label).indexOf(u) >= 0 || u.indexOf(normName(s.label)) >= 0);
    if (i >= 0) return { si: i, guessed: false };
  }

  /* unknown or empty unit — prefer a household serving over raw grams */
  if (list.length) {
    const def = (item.defaultServingIndex != null && item.defaultServingIndex >= 0 && item.defaultServingIndex < list.length)
      ? item.defaultServingIndex : 0;
    return { si: def, guessed: true };
  }
  return { si: -1, guessed: false };
}

/* ---------- entry point ---------- */
function aiLogText() {
  _aiParse = null;
  fdOpen(`
    <div class="fd-hero" style="background:linear-gradient(135deg,var(--fblue-bg),var(--fcard))">
      <button class="fd-x" onclick="fdClose()">✕</button>
      <div class="fd-hero-name">🗣 Log by typing</div>
      <div class="fd-hero-sub">Say what you ate — you'll review everything before it's logged</div>
    </div>
    <div class="fd-body" id="aiParseBody">
      <textarea class="fd-inp wide ai-ta" id="ap_text" rows="3" placeholder="e.g. 3 roti, a katori of toor dal, curd and one scoop of whey"></textarea>
      <div class="subtle" style="margin-top:8px">It maps onto your own pantry — it won't invent foods you don't have.</div>
    </div>
    <div class="fd-foot" id="aiParseFoot"><button class="fd-btn primary" onclick="aiParseRun()">Read it</button></div>
  `);
  setTimeout(() => { const t = document.getElementById('ap_text'); if (t) t.focus(); }, 50);
}

async function aiParseRun() {
  const ta = document.getElementById('ap_text');
  const text = ta ? ta.value.trim() : '';
  if (!text) { alert('Type what you ate first.'); return; }

  aiParseSetBody(aiBusyHtml('Matching against your pantry…'), '');

  const r = await aiCall('nl', {
    text,
    pantry: aiPantryIndex(),
    localTime: new Date().toLocaleString()
  });

  if (!r.ok) { aiParseSetBody(aiErrorHtml(r.error, 'aiParseRun()'), ''); return; }

  const rows = [], unknowns = [];
  (r.data.items || []).forEach(x => {
    if (x.matchType === 'item' && x.id && FOOD_ITEMS[x.id]) {
      const u = aiResolveUnit(FOOD_ITEMS[x.id], x.unit);
      rows.push({ kind: 'item', id: x.id, qty: Number(x.qty) > 0 ? Number(x.qty) : 1,
        si: u.si, unitGuessed: u.guessed, saidUnit: x.unit || '',
        slot: x.slot || defaultSlot(),
        conf: x.confidence, raw: x.rawText,
        alts: (x.altIds || []).filter(id => FOOD_ITEMS[id]) });
    } else if (x.matchType === 'meal' && x.id && FOOD_MEALS[x.id]) {
      rows.push({ kind: 'meal', id: x.id, qty: Number(x.qty) > 0 ? Number(x.qty) : 1,
        slot: x.slot || defaultSlot(), conf: x.confidence, raw: x.rawText, alts: [] });
    } else {
      unknowns.push({ name: x.name || x.rawText, raw: x.rawText });
    }
  });

  _aiParse = { text, rows, unknowns, warnings: r.data.warnings || [] };
  aiParseRenderConfirm();
}

/* ---------- confirm list ---------- */
function aiParseRowMacros(row) {
  if (row.kind === 'item') {
    const it = FOOD_ITEMS[row.id];
    return fmtMacros(macrosForAmount(it, toBaseAmount(it, row.qty, row.si)));
  }
  const m = FOOD_MEALS[row.id];
  const t = mealTotals(m, FOOD_ITEMS);
  const n = row.qty || 1;
  return fmtMacros({ kcal: t.kcal * n, protein: t.protein * n, carbs: t.carbs * n, fat: t.fat * n, fiber: t.fiber * n, hasFiber: t.hasFiber });
}

function aiParseRenderConfirm() {
  const st = _aiParse; if (!st) return;

  if (!st.rows.length && !st.unknowns.length) {
    aiParseSetBody('<div class="ai-err"><b>Nothing matched.</b><div>Try naming the foods the way they appear in your pantry.</div></div>'
      + '<button class="fd-chip" onclick="aiLogText()">Try again</button>', '');
    return;
  }

  let totK = 0, totP = 0;
  const rowsHtml = st.rows.map((row, i) => {
    const f = aiParseRowMacros(row);
    totK += parseFloat(f.kcal) || 0; totP += parseFloat(f.protein) || 0;
    const isItem = row.kind === 'item';
    const obj = isItem ? FOOD_ITEMS[row.id] : FOOD_MEALS[row.id];
    const u = isItem ? baseUnit(obj) : 'servings';

    const unitOpts = isItem
      ? (obj.servings || []).map((s, k) => `<option value="${k}" ${k === row.si ? 'selected' : ''}>${htmlSafe(s.label)}</option>`).join('')
        + `<option value="-1" ${row.si < 0 ? 'selected' : ''}>${u}</option>`
      : `<option value="-1" selected>servings</option>`;

    const altSel = (row.alts && row.alts.length)
      ? `<select class="fd-inp ai-alt" onchange="aiParseSwapItem(${i},this.value)">
           <option value="${row.id}">${htmlSafe(obj.name)}</option>
           ${row.alts.map(id => `<option value="${id}">${htmlSafe(FOOD_ITEMS[id].name)}</option>`).join('')}
         </select>`
      : `<div class="ai-rowname">${isItem ? '' : '🍲 '}${htmlSafe(obj.name)}</div>`;

    const low = (row.conf != null && row.conf < 0.6) ? '<span class="ai-lowconf" title="low confidence">?</span>' : '';

    /* an unrecognised unit was replaced by the item's default serving — say so
     * loudly, because getting this wrong is a silent hundreds-of-calories error */
    const unitNote = row.unitGuessed
      ? `<div class="ai-unitnote">Unit ${row.saidUnit ? '“' + htmlSafe(row.saidUnit) + '” ' : ''}wasn't one of this item's measures — using
         <b>${htmlSafe((obj.servings && obj.servings[row.si]) ? obj.servings[row.si].label : u)}</b>. Check it.</div>`
      : '';

    return `<div class="ai-row">
      <div class="ai-rowtop">${altSel}${low}
        <button class="fd-x2" onclick="aiParseDrop(${i})">✕</button></div>
      <div class="ai-rowctl">
        <input class="fd-inp ai-qty" type="number" inputmode="decimal" value="${row.qty}" oninput="aiParseSet(${i},'qty',this.value)">
        <select class="fd-inp ai-unit" onchange="aiParseSet(${i},'si',this.value)" ${isItem ? '' : 'disabled'}>${unitOpts}</select>
        <select class="fd-inp ai-slot" onchange="aiParseSet(${i},'slot',this.value)">
          ${['breakfast', 'lunch', 'dinner', 'snack'].map(s => `<option value="${s}" ${row.slot === s ? 'selected' : ''}>${slotLabel(s)}</option>`).join('')}
        </select>
      </div>
      ${unitNote}
      <div class="ai-rowmac" id="apmac${i}">${f.kcal} kcal · ${f.protein}g protein</div>
    </div>`;
  }).join('');

  const unknownHtml = st.unknowns.length ? `
    <div class="ai-flag warn"><b>Not in your pantry</b>
      <div>These weren't logged. Add them first if you want them counted.</div>
      ${st.unknowns.map(x => `<div class="ai-unknown"><span>${htmlSafe(x.name)}</span>
        <button class="fd-chip" onclick="aiLookupFood(${aiJsAttr(x.name)})">🔎 Look it up</button>
        <button class="fd-chip" onclick="fdClose();go('food-add')">✎ Add manually</button></div>`).join('')}
    </div>` : '';

  const warnHtml = (st.warnings || []).length
    ? `<div class="ai-flag warn"><b>Note</b><ul>${st.warnings.map(w => '<li>' + htmlSafe(w) + '</li>').join('')}</ul></div>` : '';

  aiParseSetBody(
    `<div class="ai-heard subtle">Heard: “${htmlSafe(st.text)}”</div>`
    + rowsHtml + unknownHtml + warnHtml
    + `<div class="ai-total" id="apTotal">Total to log: <b>${Math.round(totK)}</b> kcal · <b>${Math.round(totP)}</b>g protein</div>`
    + aiUsageNote(),
    st.rows.length ? `<button class="fd-btn primary" onclick="aiParseCommit()">Add ${st.rows.length} item${st.rows.length > 1 ? 's' : ''}</button>
                      <button class="fd-btn" onclick="aiLogText()">Start over</button>` : ''
  );
}

function aiParseSet(i, field, v) {
  const st = _aiParse; if (!st || !st.rows[i]) return;

  /* Typing in the quantity box must NOT re-render — that swaps the input node
   * out from under the caret and you lose focus after every digit. Patch the
   * two numbers that actually changed instead. */
  if (field === 'qty') {
    const n = parseFloat(v);
    if (isNaN(n) || n <= 0) return;             // mid-edit ("", "1.") — leave state alone
    st.rows[i].qty = n;
    aiParsePatchNumbers(i);
    return;
  }

  if (field === 'si') { st.rows[i].si = parseInt(v); st.rows[i].unitGuessed = false; }  // user chose it
  else st.rows[i].slot = v;
  aiParseRenderConfirm();
}

/* recompute one row's macros + the footer total, touching nothing else */
function aiParsePatchNumbers(i) {
  const st = _aiParse; if (!st) return;
  const cell = document.getElementById('apmac' + i);
  if (cell) { const f = aiParseRowMacros(st.rows[i]); cell.textContent = f.kcal + ' kcal · ' + f.protein + 'g protein'; }
  const tot = document.getElementById('apTotal');
  if (tot) {
    let k = 0, p = 0;
    st.rows.forEach(r => { const f = aiParseRowMacros(r); k += parseFloat(f.kcal) || 0; p += parseFloat(f.protein) || 0; });
    tot.innerHTML = 'Total to log: <b>' + Math.round(k) + '</b> kcal · <b>' + Math.round(p) + '</b>g protein';
  }
}
function aiParseDrop(i) { const st = _aiParse; if (!st) return; st.rows.splice(i, 1); aiParseRenderConfirm(); }
function aiParseSwapItem(i, id) {
  const st = _aiParse; if (!st || !FOOD_ITEMS[id]) return;
  const u = aiResolveUnit(FOOD_ITEMS[id], st.rows[i].saidUnit);
  st.rows[i].id = id; st.rows[i].si = u.si; st.rows[i].unitGuessed = u.guessed;
  aiParseRenderConfirm();
}

/* the only write — routed through the same entry shape the detail card uses */
function aiParseCommit() {
  const st = _aiParse; if (!st || !st.rows.length) return;
  const day = ensureLogDay(foodDate);

  st.rows.forEach(row => {
    if (row.kind === 'item') {
      const it = FOOD_ITEMS[row.id];
      const base = toBaseAmount(it, row.qty, row.si);
      day.entries.push({
        kind: 'item', itemId: row.id, amount: base, meal: row.slot,
        disp: { qty: row.qty, unit: row.si >= 0 ? it.servings[row.si].label : baseUnit(it) }
      });
      bumpUseCount(row.id);
      logSlotUse(row.slot, 'item', row.id);
    } else {
      day.entries.push({ kind: 'meal', mealId: row.id, servings: row.qty, meal: row.slot });
      logSlotUse(row.slot, 'meal', row.id);
    }
  });

  markDayDirty();
  saveLogDay(foodDate);
  _aiParse = null;
  fdClose();
  if (typeof renderToday === 'function') renderToday();
}

function aiParseSetBody(body, foot) {
  const b = document.getElementById('aiParseBody'); if (b) b.innerHTML = body;
  const f = document.getElementById('aiParseFoot'); if (f) f.innerHTML = foot || '';
}
