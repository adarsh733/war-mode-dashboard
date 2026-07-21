/* aiMealName.js — suggest a name for the meal being built.
 *
 * The only AI feature with no numbers in it, so nothing to validate: it reads
 * the component list and offers three names. Always a suggestion — the field
 * stays free text and the user can ignore or edit any of them.
 */

async function aiSuggestMealName() {
  if (typeof _mealDraft === 'undefined' || !_mealDraft) return;

  const comps = (_mealDraft.components || [])
    .map(c => { const it = FOOD_ITEMS[c.itemId]; return it ? ('- ' + it.name + ' (' + c.amount + baseUnit(it) + ')') : null; })
    .filter(Boolean);

  if (!comps.length) { alert('Add some ingredients first — then I can name it.'); return; }

  const btn = document.getElementById('mealNameAi');
  const restore = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '…thinking'; }

  const r = await aiCall('mealname', { components: comps.join('\n') });

  if (btn) { btn.disabled = false; btn.innerHTML = restore; }

  if (!r.ok) { aiMealNameShow(null, r.error); return; }
  aiMealNameShow((r.data.names || []).filter(Boolean).slice(0, 3), null);
}

function aiMealNameShow(names, err) {
  const box = document.getElementById('mealNameSuggest'); if (!box) return;
  if (err) { box.innerHTML = '<div class="ai-inline-err">' + htmlSafe(err) + '</div>'; return; }
  if (!names || !names.length) { box.innerHTML = '<div class="ai-inline-err">No suggestions came back.</div>'; return; }
  box.innerHTML = '<div class="ai-namerow"><span class="subtle">Pick one, then edit freely:</span>'
    + names.map(n => '<button type="button" class="fchip" onclick="aiMealNameUse(' + JSON.stringify(n).replace(/"/g, '&quot;') + ')">'
      + htmlSafe(n) + '</button>').join('') + '</div>';
}

function aiMealNameUse(name) {
  if (typeof _mealDraft === 'undefined' || !_mealDraft) return;
  _mealDraft.name = name;
  const inp = document.getElementById('meal_name');
  if (inp) { inp.value = name; inp.focus(); }
  const box = document.getElementById('mealNameSuggest'); if (box) box.innerHTML = '';
}
