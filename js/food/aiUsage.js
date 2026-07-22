/* aiUsage.js — the AI spend ledger (ADR-0037).
 *
 * Every call through aiClient.aiCall() is recorded here with its task tag, its
 * token counts and a cost computed from published per-token pricing. That makes
 * "what is costing what" answerable per feature rather than as one opaque number
 * on a monthly invoice.
 *
 * WHY THE NUMBERS ARE OURS, NOT ANTHROPIC'S
 * There is no public endpoint that reports an account's credit balance, and the
 * org-level cost report needs an ADMIN key — a strictly broader credential than
 * the one the proxy holds, on a public static site. So: spend is DERIVED from the
 * `usage` block every call already returns, and the balance is a number he types
 * in. Both are stated as such in the UI. This ledger therefore counts what THIS
 * app spends; anything spent elsewhere on the same account is invisible to it.
 *
 * STORAGE (ADR-0004's reasoning, applied honestly)
 * A reserved `food_meals` row rather than a new table, so there is no SQL for him
 * to run. That means one JSON blob rewritten per call, which is exactly what
 * ADR-0004 warns about for unbounded data — so the blob is BOUNDED: full detail
 * for the most recent LEDGER_MAX calls, plus per-month rollups kept forever. The
 * "this month" view reads detail; "overall" reads rollups, so all-time totals stay
 * correct long after the individual rows have aged out.
 */

const AI_USAGE_KEY   = 'warmode_ai_usage_v1';
const AI_USAGE_ROW   = '__aiusage__';
const AI_LEDGER_MAX  = 400;

/* USD per 1M tokens, Claude Opus 4.8 (the only model the proxy will call).
 * Cache reads bill at ~0.1x input, cache writes at 1.25x. Nothing sets
 * cache_control today so those are 0, but they are recorded for the day it does. */
const AI_PRICE = {
  'claude-opus-4-8': { input:5.00, output:25.00, cacheRead:0.50, cacheWrite:6.25 }
};
const AI_PRICE_FALLBACK = AI_PRICE['claude-opus-4-8'];

/* task -> how he thinks about it. The tag is the whole point of the tab: it maps
 * a line of spend back to the thing he actually did. */
const AI_TASK_TAG = {
  label:    { icon:'📸', name:'Photo import',    hint:'reading a label, panel or screenshot' },
  nl:       { icon:'🗣',  name:'Log by typing',   hint:'a sentence mapped onto your pantry' },
  plate:    { icon:'🍽',  name:'Plate photo',     hint:'drafting a log from a photo of a plate' },
  lookup:   { icon:'🔎', name:'Food lookup',     hint:'reference values for an unknown food' },
  mealname: { icon:'✨', name:'Meal naming',     hint:'name suggestions in the meal builder' },
  ping:     { icon:'⚡', name:'Connection test', hint:'proving the proxy is alive' }
};
function aiTag(task){ return AI_TASK_TAG[task] || { icon:'•', name:task||'unknown', hint:'' }; }

/* { entries:[…], months:{'2026-07':{cost,calls,byTask:{}}}, balance:{amount,at,currency} } */
let AI_USAGE = { entries:[], months:{}, balance:null };

function aiUsageLoadLocal(){
  try{
    const raw = localStorage.getItem(AI_USAGE_KEY);
    if(raw){ const p = JSON.parse(raw); if(p && typeof p==='object') AI_USAGE = aiUsageNormalize(p); }
  }catch(e){}
}
aiUsageLoadLocal();
function aiUsageNormalize(p){
  return {
    entries: Array.isArray(p.entries) ? p.entries : [],
    months:  (p.months && typeof p.months==='object') ? p.months : {},
    balance: (p.balance && typeof p.balance==='object') ? p.balance : null
  };
}
function aiUsageSaveLocal(){ try{ localStorage.setItem(AI_USAGE_KEY, JSON.stringify(AI_USAGE)); }catch(e){} }
function aiUsageSave(){
  aiUsageSaveLocal();
  if(typeof foodCloudOK!=='undefined' && foodCloudOK && typeof supa!=='undefined' && supa){
    supa.from('food_meals').upsert({ id:AI_USAGE_ROW, name:'(ai usage)', data:AI_USAGE, updated_at:new Date().toISOString() })
      .then(({error})=>{ if(typeof foodSync==='function') foodSync(error?'off':'ok'); });
  }
}
/* last-write-wins on call count, same shape as the suggestions row */
function applyCloudAiUsage(data){
  if(!data || typeof data!=='object') return;
  const cloud = aiUsageNormalize(data);
  const cloudCalls = aiUsageTotals(cloud, null).calls;
  const localCalls = aiUsageTotals(AI_USAGE, null).calls;
  if(cloudCalls >= localCalls){ AI_USAGE = cloud; aiUsageSaveLocal(); }
}

/* ---------- cost ---------- */
/* usage is Anthropic's block verbatim; absent fields are simply zero. */
function aiCostOf(usage, model){
  const p = AI_PRICE[model] || AI_PRICE_FALLBACK;
  const u = usage || {};
  const inTok    = +u.input_tokens || 0;
  const outTok   = +u.output_tokens || 0;
  const cRead    = +u.cache_read_input_tokens || 0;
  const cWrite   = +u.cache_creation_input_tokens || 0;
  return ((inTok*p.input) + (outTok*p.output) + (cRead*p.cacheRead) + (cWrite*p.cacheWrite)) / 1e6;
}
function aiMonthKey(iso){ return String(iso||'').slice(0,7); }
function aiFmtUSD(n){
  const v = Math.abs(+n||0);
  if(v === 0)    return '$0.00';
  if(v < 0.01)   return '<$0.01';
  /* a single AI action costs ~$0.03, so cents alone would round most of a day's
     spend to the same number — keep the third decimal only where it carries info */
  if(v < 0.1)    return '$' + v.toFixed(3);
  return '$' + v.toFixed(2);
}

/* ---------- recording ---------- */
/* Called for EVERY attempt, including failures. A failed call usually costs
 * nothing (the guard rejected it before the model ran), but recording it is what
 * makes "lookup failed 6 times today" visible instead of silently free. */
function aiUsageRecord(task, res){
  const ok    = !!(res && res.ok);
  const usage = ok ? res.usage : null;
  const model = (res && res.model) || 'claude-opus-4-8';
  const cost  = ok ? aiCostOf(usage, model) : 0;
  const at    = new Date().toISOString();
  const u     = usage || {};
  const e = {
    at, task, model, ok, cost,
    inTok:  +u.input_tokens || 0,
    outTok: +u.output_tokens || 0,
    cRead:  +u.cache_read_input_tokens || 0,
    cWrite: +u.cache_creation_input_tokens || 0
  };
  if(!ok) e.err = (res && res.code) || 'error';

  AI_USAGE.entries.unshift(e);
  /* Roll the month up BEFORE trimming, so all-time totals survive the trim. */
  const mk = aiMonthKey(at);
  const m = AI_USAGE.months[mk] || (AI_USAGE.months[mk] = { cost:0, calls:0, failed:0, byTask:{} });
  m.cost += cost; m.calls += 1; if(!ok) m.failed += 1;
  const bt = m.byTask[task] || (m.byTask[task] = { cost:0, calls:0 });
  bt.cost += cost; bt.calls += 1;

  if(AI_USAGE.entries.length > AI_LEDGER_MAX) AI_USAGE.entries.length = AI_LEDGER_MAX;
  aiUsageSave();
  if(document.getElementById('food-ai') && document.getElementById('food-ai').classList.contains('active')) renderAiUsage();
}

/* ---------- aggregation ---------- */
/* scope: 'month' = the current calendar month, null/'all' = everything.
 * Month reads the detail rows (accurate and itemised); all-time reads the
 * rollups (correct even after old rows have been trimmed). */
function aiUsageTotals(store, scope){
  const S = store || AI_USAGE;
  const out = { cost:0, calls:0, failed:0, byTask:{} };
  if(scope === 'month'){
    const mk = aiMonthKey(new Date().toISOString());
    const m = S.months[mk];
    if(m){ out.cost=m.cost; out.calls=m.calls; out.failed=m.failed||0;
           Object.keys(m.byTask||{}).forEach(k=>out.byTask[k]={cost:m.byTask[k].cost,calls:m.byTask[k].calls}); }
    return out;
  }
  Object.values(S.months||{}).forEach(m=>{
    out.cost += m.cost||0; out.calls += m.calls||0; out.failed += m.failed||0;
    Object.keys(m.byTask||{}).forEach(k=>{
      const t = out.byTask[k] || (out.byTask[k]={cost:0,calls:0});
      t.cost += m.byTask[k].cost||0; t.calls += m.byTask[k].calls||0;
    });
  });
  return out;
}
/* Spend since the balance was entered — the only spend that can be subtracted
 * from it. Anything before that moment is already reflected in the number he
 * typed, so counting it again would double-charge him. */
function aiSpendSince(iso){
  if(!iso) return 0;
  let sum = 0;
  (AI_USAGE.entries||[]).forEach(e=>{ if(e.at >= iso) sum += (e.cost||0); });
  return sum;
}

/* ---------- balance ---------- */
function aiSetBalance(){
  const cur = AI_USAGE.balance;
  const v = prompt('Credit balance showing in your Anthropic console, in USD.\n\n'
    + 'There is no API that reports this, so it has to be typed in. From here on the tab\n'
    + 'subtracts what this app spends. Re-enter it whenever you top up or want to re-sync.',
    cur ? String(cur.amount) : '');
  if(v == null) return;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g,''));
  if(isNaN(n)){ alert('That is not a number.'); return; }
  AI_USAGE.balance = { amount:n, at:new Date().toISOString() };
  aiUsageSave(); renderAiUsage();
}

/* ---------- rendering ---------- */
let _aiScope = 'month';
function aiSetScope(s){ _aiScope = s; renderAiUsage(); }

function renderAiUsage(){
  const box = document.getElementById('aiUsageBody'); if(!box) return;
  const scope = _aiScope;
  const t = aiUsageTotals(AI_USAGE, scope==='month' ? 'month' : null);
  const all = aiUsageTotals(AI_USAGE, null);
  const bal = AI_USAGE.balance;
  const spentSince = bal ? aiSpendSince(bal.at) : 0;
  const left = bal ? (bal.amount - spentSince) : null;
  const avg  = t.calls ? t.cost / t.calls : 0;

  const tasks = Object.keys(t.byTask).map(k=>({ k, ...t.byTask[k] }))
    .sort((a,b)=> b.cost - a.cost || b.calls - a.calls);
  const maxCost = tasks.length ? Math.max(...tasks.map(x=>x.cost)) : 0;

  const monthName = new Date().toLocaleString(undefined,{month:'long'});

  box.innerHTML = `
  <div class="fseg aiscope">
    <button class="${scope==='month'?'on':''}" onclick="aiSetScope('month')">${monthName}</button>
    <button class="${scope==='all'?'on':''}" onclick="aiSetScope('all')">All time</button>
  </div>

  <div class="ai-stats">
    <div class="ai-stat"><div class="k">Spent ${scope==='month'?'this month':'in total'}</div>
      <div class="v">${aiFmtUSD(t.cost)}</div>
      <div class="d">${t.calls} call${t.calls===1?'':'s'}${t.failed?` · ${t.failed} failed`:''}</div></div>
    <div class="ai-stat"><div class="k">Average per call</div>
      <div class="v">${aiFmtUSD(avg)}</div>
      <div class="d">${scope==='month'?'this month':'all time'}</div></div>
    <div class="ai-stat ${left!=null&&left<2?'low':''}"><div class="k">Credit left</div>
      <div class="v">${left!=null?aiFmtUSD(left):'—'}</div>
      <div class="d">${bal ? `${aiFmtUSD(bal.amount)} entered ${fmtDate(bal.at.slice(0,10))} · ${aiFmtUSD(spentSince)} since`
                           : 'not set'}</div></div>
    <div class="ai-stat"><div class="k">Calls today</div>
      <div class="v">${AI_LAST_USAGE?AI_LAST_USAGE.callsToday:'—'}</div>
      <div class="d">${AI_LAST_USAGE?`cap ${AI_LAST_USAGE.dailyCap}`:'no call yet this session'}</div></div>
  </div>

  <button class="btn-sm" onclick="aiSetBalance()">${bal?'✎ Update credit balance':'＋ Set credit balance'}</button>
  <div class="ai-note">Costs are computed from the tokens each call reports, at Opus 4.8 list price
    ($5 / $25 per million in / out). Anthropic publishes no balance endpoint, so the credit figure is
    the number you enter minus what this app has spent since — spending elsewhere on the same account
    won't show here.</div>

  <div class="sec-label">What it went on</div>
  ${tasks.length ? `<div class="ai-bars">${tasks.map(x=>{
      const tag = aiTag(x.k);
      const pct = maxCost ? Math.max(3, Math.round(x.cost/maxCost*100)) : 3;
      return `<div class="ai-bar">
        <div class="ai-bar-head"><span class="ai-bar-name">${tag.icon} ${htmlSafe(tag.name)}</span>
          <span class="ai-bar-cost">${aiFmtUSD(x.cost)}</span></div>
        <div class="ai-bar-track"><i class="t-${htmlSafe(x.k)}" style="width:${pct}%"></i></div>
        <div class="ai-bar-sub">${x.calls} call${x.calls===1?'':'s'} · ${aiFmtUSD(x.calls?x.cost/x.calls:0)} each · ${htmlSafe(tag.hint)}</div>
      </div>`;
    }).join('')}</div>`
    : `<div class="fempty">Nothing yet${scope==='month'?' this month':''}. Every AI action you take gets tagged and priced here.</div>`}

  <div class="sec-label">Recent calls</div>
  ${aiUsageRowsHtml(scope)}
  ${all.calls > (AI_USAGE.entries||[]).length
    ? `<div class="ai-note">Showing the last ${AI_USAGE.entries.length} calls in detail. Older ones are
       folded into the monthly totals above, which stay complete.</div>` : ''}`;
}

function aiUsageRowsHtml(scope){
  const mk = aiMonthKey(new Date().toISOString());
  const rows = (AI_USAGE.entries||[]).filter(e=> scope!=='month' || aiMonthKey(e.at)===mk);
  if(!rows.length) return `<div class="fempty">No calls recorded${scope==='month'?' this month':''}.</div>`;
  return `<div class="ai-list">` + rows.slice(0,60).map(e=>{
    const tag = aiTag(e.task);
    const when = new Date(e.at);
    const time = when.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    return `<div class="ai-row ${e.ok?'':'failed'}">
      <span class="ai-row-ic t-${htmlSafe(e.task)}">${tag.icon}</span>
      <div class="fmain">
        <div class="fname">${htmlSafe(tag.name)}${e.ok?'':` <span class="ai-fail">${htmlSafe(e.err||'failed')}</span>`}</div>
        <div class="fsub">${fmtDate(e.at.slice(0,10))} ${time}${e.ok?` · ${e.inTok.toLocaleString()} in · ${e.outTok.toLocaleString()} out`:''}</div>
      </div>
      <div class="ai-row-cost">${e.ok?aiFmtUSD(e.cost):'—'}</div>
    </div>`;
  }).join('') + `</div>`;
}
