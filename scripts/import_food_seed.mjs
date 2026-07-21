/* import_food_seed.mjs — deterministic Food seed importer (WAR MODE).
 *
 * Loads data/food-seed/food-seed.v1.1.json into the live Supabase Food tables
 * (food_items / food_meals), de-duplicating by normalized name with a curated
 * old->new alias map so richer new names still land on the existing rows the
 * user already logged against. Replace-on-match preserves id / useCount /
 * createdAt; never overwrites a trust:"verified" row; deletes known test rows.
 *
 * Pure and re-runnable: NO macro arithmetic — per100 is copied verbatim; the
 * app computes per100 * amount / 100 at render time. Idempotent.
 *
 *   node scripts/import_food_seed.mjs           # DRY RUN (no cloud writes)
 *   node scripts/import_food_seed.mjs --commit  # write to Supabase
 *
 * Requires Node >= 18 (global fetch). No external dependencies.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED_PATH = join(ROOT, 'data', 'food-seed', 'food-seed.v1.1.json');
const COMMIT = process.argv.includes('--commit');
const TS = new Date().toISOString().replace(/[:.]/g, '-');
const now = () => new Date().toISOString();

/* ---- credentials (read straight from the app's config, single source) ---- */
const cfg = readFileSync(join(ROOT, 'js', 'config.js'), 'utf8');
const SUPA_URL = (cfg.match(/SUPA_URL\s*=\s*'([^']+)'/) || [])[1];
const SUPA_KEY = (cfg.match(/SUPA_KEY\s*=\s*'([^']+)'/) || [])[1];
if (!SUPA_URL || !SUPA_KEY) { console.error('Could not read SUPA_URL/SUPA_KEY from js/config.js'); process.exit(1); }
const REST = SUPA_URL.replace(/\/$/, '') + '/rest/v1';
const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

/* ---- exact normalization required by the import spec ---- */
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/* ---- curated old-name -> new-seed-name alias map (approved) -------------- */
const ALIAS = [
  ['Roti / Chapati',            'Roti / Chapati (plain, no oil)'],
  ['Oats (dry)',                'Oats (dry, rolled)'],
  ['Curd / Dahi',               'Curd / Dahi (full fat)'],
  ['Toor Dal (cooked)',         'Toor/Arhar Dal (cooked, plain)'],
  ['Roasted Chana',             'Roasted Chana (bhuna)'],
  ['Aloo Gobi',                 'Aloo Gobi (dry)'],
  ['Bread slice (white)',       'Bread (white slice)'],
  ['Bread slice (brown)',       'Bread (brown/whole wheat slice)'],
  ['Buttermilk (chaas)',        'Buttermilk / Chaas'],
  ['Chana Masala',              'Chole / Chana Masala'],
  ['Cooking Oil',               'Cooking Oil (generic)'],
  ['Dosa (plain)',              'Plain Dosa'],
  ['Mixed Veg',                 'Mixed Veg Curry'],
  ['Moong Dal (cooked)',        'Moong Dal (cooked, plain)'],
  ['Moong Sprouts',             'Sprouts (moong, boiled/steamed)'],
  ['Palak (sabzi)',             'Palak / Saag (plain)'],
  ['Paneer Tikka',              'Paneer Tikka (dry, grilled)'],
  ['Paratha (plain)',           'Paratha (plain, pan, moderate oil)'],
  ['Rajma',                     'Rajma (cooked curry)'],
  // medium-confidence (user-approved):
  ['Bhindi (okra)',             'Bhindi Masala (dry)'],
  ['Milk (full cream)',         'Milk (toned, cow)'],
];
// newNorm -> oldNorm (the inverse we consult while walking seed items)
const NEW_TO_OLD = new Map(ALIAS.map(([o, n]) => [norm(n), norm(o)]));

/* curated search aliases (from the app's original _SEED_ALIASES), keyed by the
 * legacy seed id the merged/kept item still carries. The new seed JSON ships no
 * aliases and the old cloud rows had none, so we re-apply these so searching
 * "chapati"/"chole"/"dahi"/"badam"/… keeps finding the right item. Additive. */
const SEED_ALIASES = {
  seed_roti:['chapati','chapatti','phulka','fulka','rotli'], seed_paratha:['parantha'], seed_naan:['nan'],
  seed_rice:['chawal','bhaat','steamed rice'], seed_jeerarice:['cumin rice'], seed_poha:['pohe','flattened rice'],
  seed_curd:['dahi','yogurt','yoghurt'], seed_curdreg:['dahi','yogurt'], seed_buttermilk:['chaas','chhachh','mattha'],
  seed_milk:['doodh'], seed_paneer:['cottage cheese'], seed_toordal:['arhar dal','tur dal','tuvar dal','pigeon pea'],
  seed_moongdal:['moong dal','yellow dal','mung dal'], seed_chana:['chole','chhole','chickpea','chickpeas'],
  seed_rajma:['kidney beans'], seed_sprouts:['ankurit','sprouted moong'], seed_roastedchana:['bhuna chana','roasted gram'],
  seed_banana:['kela'], seed_apple:['seb'], seed_almonds:['badam'], seed_peanuts:['moongphali','groundnut','groundnuts'],
  seed_peanutbutter:['pb'], seed_oats:['oatmeal'], seed_ghee:['clarified butter','desi ghee'],
  seed_oil:['refined oil','sunflower oil'], seed_dhokla:['khaman'], seed_daliceberg:['salad'], seed_palak:['spinach'],
  seed_bhindi:['okra','lady finger','ladyfinger'], seed_baingan:['brinjal','eggplant','aubergine'],
  seed_aloogobi:['aloo gobhi','potato cauliflower'], seed_wholetruthwhey:['whey','protein powder','wpi','isolate'],
  seed_sidsfarm:['sids milk','high protein milk'],
};

/* test artifacts to delete (explicit predicate, not a blind sweep) */
const isTestName = (name) => /^zz test/i.test(name || '') || norm(name) === 'test smoothie';

/* ---- nutrition fields refreshed on a replace-on-match ---- */
const NUTRI = ['per100', 'basis', 'servings', 'defaultServingIndex', 'tags', 'notes', 'trust', 'source', 'isHomeCooked', 'brand'];

/* ---- REST helpers ---- */
async function getAll(table, cols) {
  const r = await fetch(`${REST}/${table}?select=${cols}&limit=2000`, { headers: H });
  if (!r.ok) throw new Error(`GET ${table} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function upsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`UPSERT ${table} -> ${r.status} ${await r.text()}`);
}
async function del(table, ids) {
  for (const id of ids) {
    const r = await fetch(`${REST}/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });
    if (!r.ok) throw new Error(`DELETE ${table} ${id} -> ${r.status} ${await r.text()}`);
  }
}

/* ===================================================================== */
async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`Seed: ${seed.items.length} items, ${seed.meals.length} meals  (${seed.meta?.revision || ''})`);

  // Step 1 — load existing + backup
  const exItems = await getAll('food_items', 'id,name,data,updated_at');
  const exMeals = await getAll('food_meals', 'id,name,data,updated_at');
  const exLog   = await getAll('food_log',   'date,data,updated_at');
  const backup = join(ROOT, 'data', 'food-seed', 'backups', `food-${TS}.json`);
  writeFileSync(backup, JSON.stringify({ ts: now(), food_items: exItems, food_meals: exMeals, food_log: exLog }, null, 2));
  console.log(`Backup written: ${backup}  (${exItems.length} items, ${exMeals.length} meals, ${exLog.length} log days)`);

  // Step 2 — index existing by normalized name (skip reserved rows like __suggestions__)
  const exByNorm = new Map();
  for (const r of exItems) exByNorm.set(norm(r.name), r);

  // Step 3 — merge items
  const finalItems = new Map();                 // id -> full item record (final cloud state)
  for (const r of exItems) finalItems.set(r.id, { ...(r.data || {}), id: r.id, name: r.name }); // start from current
  const consumed = new Set();
  const report = { inserted: [], replaced: [], aliasReplaced: [], verifiedSkipped: [], deletedItems: [], deletedMeals: [], unresolved: [], keptDistinct: [] };

  for (const s of seed.items) {
    const sn = norm(s.name);
    const oldNorm = NEW_TO_OLD.get(sn);
    let target = exByNorm.get(sn) || (oldNorm ? exByNorm.get(oldNorm) : null);
    if (target && consumed.has(target.id)) target = null; // never map two seeds onto one row

    if (target) {
      const td = target.data || {};
      if (td.trust === 'verified') { report.verifiedSkipped.push(target.name); continue; }
      const merged = { ...td, id: target.id, name: s.name };   // adopt the richer new name
      for (const k of NUTRI) merged[k] = s[k];
      merged.useCount  = td.useCount || 0;                     // preserve usage history
      merged.createdAt = td.createdAt || s.createdAt || now(); // preserve origin
      merged.updatedAt = now();
      const aliases = new Set([...(td.aliases || [])]);
      if (norm(target.name) !== sn) aliases.add(target.name);  // keep old name searchable
      merged.aliases = [...aliases];
      finalItems.set(target.id, merged);
      consumed.add(target.id);
      (oldNorm && !exByNorm.get(sn) ? report.aliasReplaced : report.replaced).push(`${target.name}  ->  ${s.name}`);
    } else {
      const ins = JSON.parse(JSON.stringify(s));
      ins.useCount = ins.useCount || 0;
      ins.createdAt = ins.createdAt || now();
      ins.updatedAt = now();
      finalItems.set(ins.id, ins);
      report.inserted.push(s.name);
    }
  }

  // Step 5a — mark test items for deletion; note kept-distinct survivors
  const deleteItemIds = [];
  for (const r of exItems) {
    if (isTestName(r.name)) { deleteItemIds.push(r.id); finalItems.delete(r.id); report.deletedItems.push(r.name); }
  }
  // kept distinct = existing rows neither consumed by a merge nor deleted as test
  report.keptDistinct = exItems
    .filter(r => !consumed.has(r.id) && !isTestName(r.name))
    .map(r => r.name + ((r.data || {}).trust === 'verified' ? '  [verified]' : ''));

  // Step 3b — re-apply curated search aliases (additive; non-nutritional, so safe on verified)
  for (const [id, al] of Object.entries(SEED_ALIASES)) {
    const it = finalItems.get(id);
    if (!it) continue;
    const set = new Set([...(it.aliases || []), ...al]);
    it.aliases = [...set];
    it.updatedAt = now();
  }

  // Step 4 — resolve + build meals (name -> id from the FINAL merged items)
  const nameToId = new Map();
  for (const it of finalItems.values()) nameToId.set(norm(it.name), it.id);
  // also let old names resolve (via aliases) so seed meal itemNames using old labels still map
  for (const it of finalItems.values()) for (const a of (it.aliases || [])) if (!nameToId.has(norm(a))) nameToId.set(norm(a), it.id);

  const finalMeals = [];
  for (const m of seed.meals) {
    const comps = [];
    for (const c of (m.components || [])) {
      const id = nameToId.get(norm(c.itemName));
      if (!id) { report.unresolved.push(`${m.name}: "${c.itemName}"`); continue; }
      comps.push({ itemId: id, amount: c.amount });
    }
    finalMeals.push({ id: m.id, name: m.name, data: { id: m.id, name: m.name, components: comps, addedOil: m.addedOil ?? null, notes: m.notes || '', createdAt: m.createdAt || now(), updatedAt: now() } });
  }

  // Step 5b — test meals to delete
  const deleteMealIds = [];
  for (const r of exMeals) { if (r.id.startsWith('__')) continue; if (isTestName(r.name)) { deleteMealIds.push(r.id); report.deletedMeals.push(r.name); } }

  // ---- report ----
  const line = (t, a) => console.log(`\n${t} (${a.length})${a.length ? ':\n  ' + a.join('\n  ') : ''}`);
  console.log('\n================= MERGE REPORT =================');
  console.log(`items inserted : ${report.inserted.length}`);
  console.log(`items replaced (exact name) : ${report.replaced.length}`);
  console.log(`items replaced (alias)      : ${report.aliasReplaced.length}`);
  console.log(`verified skipped            : ${report.verifiedSkipped.length}`);
  console.log(`items deleted (test)        : ${report.deletedItems.length}`);
  console.log(`meals inserted              : ${finalMeals.length}`);
  console.log(`meals deleted (test)        : ${report.deletedMeals.length}`);
  console.log(`unresolved meal components  : ${report.unresolved.length}`);
  console.log(`FINAL items -> ${finalItems.size} | FINAL meals -> ${finalMeals.length}`);
  line('alias replaced', report.aliasReplaced);
  line('exact replaced', report.replaced);
  line('verified skipped', report.verifiedSkipped);
  line('deleted (test)', [...report.deletedItems, ...report.deletedMeals]);
  line('kept distinct (unmatched, untouched)', report.keptDistinct);
  line('UNRESOLVED components', report.unresolved);

  // persist report + final item set (used to regenerate js/food/seed.js)
  const reportPath = join(ROOT, 'data', 'food-seed', 'reports', `import-${TS}.json`);
  writeFileSync(reportPath, JSON.stringify({ ts: now(), commit: COMMIT, report, finalItems: [...finalItems.values()], finalMeals: finalMeals.map(m => m.data) }, null, 2));
  console.log(`\nReport written: ${reportPath}`);

  if (!COMMIT) { console.log('\n*** DRY RUN — no cloud writes. Re-run with --commit to apply. ***'); return; }

  // Step 6 — write
  const itemRows = [...finalItems.values()].map(it => ({ id: it.id, name: it.name || '', use_count: it.useCount || 0, data: it, updated_at: it.updatedAt || now() }));
  console.log('\nWriting to Supabase…');
  await upsert('food_items', itemRows);
  await upsert('food_meals', finalMeals.map(m => ({ id: m.id, name: m.name, data: m.data, updated_at: m.data.updatedAt })));
  await del('food_items', deleteItemIds);
  await del('food_meals', deleteMealIds);
  console.log('Write complete.');

  // Step 7 — Regenerate js/food/seed.js
  const seedJsPath = join(ROOT, 'js', 'food', 'seed.js');
  const seedJsContent = `/* seed.js — GENERATED. Do not hand-edit.
 * Source: data/food-seed/food-seed.v1.1.json
 * Regenerate: run scripts/import_food_seed.mjs --commit
 */

const FOOD_SEED = [
${[...finalItems.values()].map(it => '  ' + JSON.stringify(it)).join(',\n')}
];
`;
  writeFileSync(seedJsPath, seedJsContent, 'utf8');
  console.log(`Rebuilt js/food/seed.js (${finalItems.size} items)`);
}

main().catch(e => { console.error('\nIMPORT FAILED:', e.message); process.exit(1); });
