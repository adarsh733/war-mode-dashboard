/* foodData.js — Food data layer: local-first cache + Supabase (food_items,
 * food_meals, food_log). Mirrors the tracker's pattern in data.js: read
 * localStorage instantly for a snappy UI, then reconcile with the cloud.
 * Reuses the existing `supa` client created in loadDB(). If the Food tables
 * don't exist yet (SQL not run), it degrades to local-only and flags it —
 * the app never depends on the cloud (spec §3.6).
 */

const FOOD_ITEMS_KEY = 'warmode_food_items_v1';
const FOOD_MEALS_KEY = 'warmode_food_meals_v1';
const FOOD_LOG_KEY   = 'warmode_food_log_v1';
const FOOD_SEED_FLAG = 'warmode_food_seeded_v1';

let FOOD_ITEMS = {};   // { itemId: item }
let FOOD_MEALS = {};   // { mealId: meal }
let FOOD_LOG   = {};   // { "YYYY-MM-DD": {entries:[...], addedOilTotal?} }
let foodCloudOK = false;

function foodSync(state, msg){
  const el = document.getElementById('foodSyncBadge'); if(!el) return;
  const map = { ok:['p-green','☁ Synced'], off:['p-amber','⚠ Local only'], sync:['p-blue','⟳ Syncing…'] };
  const [cls, txt] = map[state] || map.off; el.className = 'pill ' + cls; el.textContent = msg || txt;
}

function readJSON(key, fallback){ try{ const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }catch(e){ return fallback; } }
function writeJSON(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }

function foodLocalSaveItems(){ writeJSON(FOOD_ITEMS_KEY, FOOD_ITEMS); }
function foodLocalSaveMeals(){ writeJSON(FOOD_MEALS_KEY, FOOD_MEALS); }
function foodLocalSaveLog(){   writeJSON(FOOD_LOG_KEY,   FOOD_LOG);   }

/* ---- load: local first, seed on first run, then cloud reconcile ---- */
async function loadFood(){
  FOOD_ITEMS = readJSON(FOOD_ITEMS_KEY, {}) || {};
  FOOD_MEALS = readJSON(FOOD_MEALS_KEY, {}) || {};
  FOOD_LOG   = readJSON(FOOD_LOG_KEY,   {}) || {};

  // first-run seed (spec §11): only if never seeded and pantry empty
  const seeded = localStorage.getItem(FOOD_SEED_FLAG);
  if(!seeded && Object.keys(FOOD_ITEMS).length === 0 && typeof FOOD_SEED !== 'undefined'){
    FOOD_SEED.forEach(it => { FOOD_ITEMS[it.id] = JSON.parse(JSON.stringify(it)); });
    try{ localStorage.setItem(FOOD_SEED_FLAG, '1'); }catch(e){}
    foodLocalSaveItems();
  }

  await foodCloudReconcile();
}

async function foodCloudReconcile(){
  if(typeof supa === 'undefined' || !supa){ foodCloudOK = false; foodSync('off'); return; }
  try{
    foodSync('sync');
    const [ri, rm, rl] = await Promise.all([
      supa.from('food_items').select('id,data,updated_at'),
      supa.from('food_meals').select('id,data,updated_at'),
      supa.from('food_log').select('date,data,updated_at')
    ]);
    if(ri.error) throw ri.error; if(rm.error) throw rm.error; if(rl.error) throw rl.error;
    foodCloudOK = true;

    mergeCloud(FOOD_ITEMS, ri.data, r => [r.id, r.data]);
    mergeCloud(FOOD_MEALS, rm.data, r => [r.id, r.data]);
    mergeCloud(FOOD_LOG,   rl.data, r => [r.date, r.data]);

    foodLocalSaveItems(); foodLocalSaveMeals(); foodLocalSaveLog();

    // push anything that exists only locally (e.g. seed on first cloud run)
    await pushLocalOnly();
    foodSync('ok');
  }catch(e){
    // relation-does-not-exist (tables not created yet) or offline → local only
    foodCloudOK = false;
    console.warn('Food cloud unavailable, using local only:', e.message || e);
    foodSync('off');
  }
}

/* last-write-wins merge of cloud rows into a local map, keyed via keyFn. */
function mergeCloud(localMap, rows, keyFn){
  (rows || []).forEach(r => {
    const [k, obj] = keyFn(r); if(!obj) return;
    const local = localMap[k];
    const cloudT = new Date(r.updated_at || 0).getTime();
    const localT = local ? new Date(local.updatedAt || 0).getTime() : -1;
    if(!local || cloudT >= localT) localMap[k] = obj;
  });
}

async function pushLocalOnly(){
  if(!foodCloudOK || !supa) return;
  // upsert everything local; cheap for a personal-scale pantry, keeps cloud complete
  const itemRows = Object.values(FOOD_ITEMS).map(it => ({ id:it.id, name:it.name||'', use_count:it.useCount||0, data:it, updated_at:it.updatedAt||new Date().toISOString() }));
  const mealRows = Object.values(FOOD_MEALS).map(m => ({ id:m.id, name:m.name||'', data:m, updated_at:m.updatedAt||new Date().toISOString() }));
  const logRows  = Object.keys(FOOD_LOG).map(dt => ({ date:dt, data:FOOD_LOG[dt], updated_at:FOOD_LOG[dt].updatedAt||new Date().toISOString() }));
  if(itemRows.length) await supa.from('food_items').upsert(itemRows);
  if(mealRows.length) await supa.from('food_meals').upsert(mealRows);
  if(logRows.length)  await supa.from('food_log').upsert(logRows);
}

/* ---- ids ---- */
function newItemId(){ return 'itm_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function newMealId(){ return 'meal_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ---- ITEM CRUD ---- */
function saveItem(item){
  const now = new Date().toISOString();
  if(!item.id) item.id = newItemId();
  if(!item.createdAt) item.createdAt = now;
  item.updatedAt = now;
  if(item.useCount == null) item.useCount = 0;
  FOOD_ITEMS[item.id] = item;
  foodLocalSaveItems();
  if(foodCloudOK && supa){ foodSync('sync');
    supa.from('food_items').upsert({ id:item.id, name:item.name||'', use_count:item.useCount||0, data:item, updated_at:now })
      .then(({error}) => foodSync(error?'off':'ok')); }
  return item;
}
function deleteItem(id){
  delete FOOD_ITEMS[id]; foodLocalSaveItems();
  if(foodCloudOK && supa) supa.from('food_items').delete().eq('id', id).then(({error}) => foodSync(error?'off':'ok'));
}
function bumpUseCount(id){
  const it = FOOD_ITEMS[id]; if(!it) return;
  it.useCount = (it.useCount || 0) + 1; saveItem(it);
}

/* ---- MEAL CRUD ---- */
function saveMeal(meal){
  const now = new Date().toISOString();
  if(!meal.id) meal.id = newMealId();
  if(!meal.createdAt) meal.createdAt = now;
  meal.updatedAt = now;
  FOOD_MEALS[meal.id] = meal;
  foodLocalSaveMeals();
  if(foodCloudOK && supa){ foodSync('sync');
    supa.from('food_meals').upsert({ id:meal.id, name:meal.name||'', data:meal, updated_at:now })
      .then(({error}) => foodSync(error?'off':'ok')); }
  return meal;
}
function deleteMeal(id){
  delete FOOD_MEALS[id]; foodLocalSaveMeals();
  if(foodCloudOK && supa) supa.from('food_meals').delete().eq('id', id).then(({error}) => foodSync(error?'off':'ok'));
}

/* ---- LOG persistence (one date) ---- */
function saveLogDay(date){
  const day = FOOD_LOG[date];
  if(day) day.updatedAt = new Date().toISOString();
  foodLocalSaveLog();
  if(foodCloudOK && supa){ foodSync('sync');
    if(day) supa.from('food_log').upsert({ date, data:day, updated_at:day.updatedAt }).then(({error}) => foodSync(error?'off':'ok'));
    else    supa.from('food_log').delete().eq('date', date).then(({error}) => foodSync(error?'off':'ok'));
  }
}

/* ---- helpers used by UI ---- */
function itemsById(){ return FOOD_ITEMS; }
function mealsById(){ return FOOD_MEALS; }
function logForDate(date){ return FOOD_LOG[date] || null; }
function ensureLogDay(date){ if(!FOOD_LOG[date]) FOOD_LOG[date] = { entries: [] }; return FOOD_LOG[date]; }
