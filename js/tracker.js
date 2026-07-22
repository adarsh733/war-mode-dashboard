/* tracker.js — tracker log/grid/goals/tags/history/CSV export */
function applyAuto(d,dt){
  const g=goalOn(dt||todayStr());
  HABITS.forEach(h=>{if(h.auto){const v=d[h.auto.metric];if(v!=null&&v!==''){if(h.auto.test(parseFloat(v),g))d[h.k]=1;else delete d[h.k];}}});
}
function scoreFor(d){
  const skip=d.rest?['gym','cardio']:[];let hit=0,total=0;
  HABITS.forEach(h=>{if(skip.includes(h.k))return;total++;if(d[h.k])hit++;});
  return total?{hit,total,pct:Math.round(hit/total*100)}:{hit:0,total:0,pct:0};
}
function scoreColor(p){return p>=78?'p-green':p>=50?'p-amber':'p-red';}
function htmlSafe(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function displayNum(v,unit=''){return typeof v==='number'&&!Number.isNaN(v)?(Number.isInteger(v)?v:v.toFixed(1))+unit:'--';}

/* ---- WEEK GRID ---- */
function renderWeek(){
  if(!weekStart)weekStart=mondayOf(todayStr());
  measureStickyOffsets();          // the subnav can differ per section/wrap
  paintGoalSummary();
  setupTagPanel();
  renderGoalHistory();
  renderTagHistory();
  renderStrip();
  renderGrid();
}
function setupTagPanel(){
  const sel=document.getElementById('tag_sel'); if(sel&&!sel.dataset.built){sel.innerHTML=TAGS.map(t=>`<option value="${t.k}">${t.label}</option>`).join('');sel.dataset.built='1';}
  const tf=document.getElementById('tag_from'),tt=document.getElementById('tag_to');
  if(tf&&!tf.value)tf.value=weekStart||todayStr();
  if(tt&&!tt.value)tt.value=weekStart?addDays(weekStart,6):todayStr();
}
function paintGoalSummary(){
  const g=curGoal();
  const txt=`${g.protein}g · &lt;${g.cal}kcal · ${g.sleep}h · ${(g.steps/1000)}k`;
  const el=document.getElementById('goalSummary'); if(el)el.innerHTML=`<b style="color:var(--ink)">${g.phase}</b> · ${g.protein}g protein · &lt;${g.cal} kcal · ${g.sleep}h sleep · ${(g.steps/1000)}k steps`;
  const mini=document.getElementById('goalSummaryMini'); if(mini)mini.innerHTML='· '+g.phase;
}
function renderGoalHistory(){
  const el=document.getElementById('goalHistory'); if(!el)return;
  sortPeriods();
  el.innerHTML=PERIODS.map((p,i)=>{
    const next=PERIODS[i+1];
    const range=next?`${fmtDate(p.from)} → ${fmtDate(addDays(next.from,-1))}`:`${fmtDate(p.from)} → now`;
    const canDel=PERIODS.length>1;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <span class="pill p-blue" style="flex-shrink:0">📍 ${fmtDate(p.from)}</span>
      <div style="flex:1"><b style="font-size:var(--fs-sm)">${p.phase}</b><div class="subtle" style="font-size:var(--fs-xs)">${range} · ${p.protein}g · &lt;${p.cal}kcal · ${p.sleep}h · ${(p.steps/1000)}k</div></div>
      ${canDel?`<button onclick="deletePeriod(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:var(--fs-sm);font-weight:600">Remove</button>`:''}
    </div>`;
  }).join('');
}
function toggleGoals(){
  const ed=document.getElementById('goalEditor');const open=ed.style.display!=='none';
  if(open){ed.style.display='none';document.getElementById('goalEditBtn').textContent='Change';}
  else{
    const g=curGoal();
    document.getElementById('g_from').value=todayStr();
    document.getElementById('g_phase').value=g.phase;
    document.getElementById('g_protein').value=g.protein;
    document.getElementById('g_cal').value=g.cal;
    document.getElementById('g_sleep').value=g.sleep;
    document.getElementById('g_steps').value=g.steps;
    document.getElementById('g_water').value=g.water;
    ed.style.display='';document.getElementById('goalEditBtn').textContent='Close';
    renderGoalHistory();
  }
}
function saveGoals(){
  const from=document.getElementById('g_from').value||todayStr();
  const period={
    from,
    phase:document.getElementById('g_phase').value||'New phase',
    protein:parseFloat(document.getElementById('g_protein').value)||180,
    cal:parseFloat(document.getElementById('g_cal').value)||2000,
    sleep:parseFloat(document.getElementById('g_sleep').value)||8,
    steps:parseFloat(document.getElementById('g_steps').value)||10000,
    water:parseFloat(document.getElementById('g_water').value)||4
  };
  // replace if a period already starts on that exact date, else add
  const idx=PERIODS.findIndex(p=>p.from===from);
  if(idx>=0)PERIODS[idx]=period; else PERIODS.push(period);
  persistGoals();
  // re-evaluate auto-ticks ONLY for days on/after this date (past periods untouched)
  Object.keys(DB).forEach(dt=>{ if(dt>=from) applyAuto(DB[dt],dt); });
  persist();
  paintGoalSummary();renderGoalHistory();renderGrid();renderStrip();flashSaved();
}
function deletePeriod(i){
  if(PERIODS.length<=1)return;
  if(!confirm('Remove this goal period? Days in its range will fall back to the previous goal.'))return;
  PERIODS.splice(i,1);persistGoals();
  // re-evaluate everything since a boundary moved
  Object.keys(DB).forEach(dt=>applyAuto(DB[dt],dt));
  persist();
  paintGoalSummary();renderGoalHistory();renderGrid();renderStrip();
}

/* ── Context tags (date-range, informational) ── */
function toggleTagPanel(){ /* panel now lives inside an always-open accordion; no-op */ }
function tagSelChange(){
  document.getElementById('tag_custom_wrap').style.display=
    document.getElementById('tag_sel').value==='other'?'':'none';
}
function rangeDates(a,b){ if(a>b){const t=a;a=b;b=t;} const out=[];let d=a;while(d<=b){out.push(d);d=addDays(d,1);}return out; }
function applyTagRange(){
  const from=document.getElementById('tag_from').value, to=document.getElementById('tag_to').value;
  if(!from||!to){alert('Pick both dates.');return;}
  const k=document.getElementById('tag_sel').value;
  const custom=document.getElementById('tag_custom').value.trim();
  rangeDates(from,to).forEach(dt=>{
    const d=ensure(dt); d.tag=k; if(k==='other'&&custom)d.tagName=custom; else delete d.tagName;
    persist(dt);
  });
  renderTagHistory();renderGrid();renderStrip();flashSaved();
}
function clearTagRange(){
  const from=document.getElementById('tag_from').value, to=document.getElementById('tag_to').value;
  if(!from||!to){alert('Pick both dates.');return;}
  rangeDates(from,to).forEach(dt=>{
    if(DB[dt]){delete DB[dt].tag;delete DB[dt].tagName;if(Object.keys(DB[dt]).length===0)delete DB[dt];persist(dt);}
  });
  renderTagHistory();renderGrid();renderStrip();flashSaved();
}
function tagLabelFor(d){ if(!d||!d.tag)return''; const def=tagDef(d.tag); const base=def?def.label:'📍'; return (d.tag==='other'&&d.tagName)?('📍 '+d.tagName):base; }
// group consecutive same-tag days into spans for the history list
function renderTagHistory(){
  const el=document.getElementById('tagHistory'); if(!el)return;
  const dts=Object.keys(DB).filter(dt=>DB[dt].tag).sort();
  if(!dts.length){el.innerHTML='<p class="subtle">No tagged days yet.</p>';return;}
  const spans=[];let cur=null;
  dts.forEach(dt=>{
    const key=DB[dt].tag+(DB[dt].tagName||'');
    if(cur&&cur.key===key&&addDays(cur.to,1)===dt){cur.to=dt;}
    else{cur={key,tag:DB[dt].tag,name:DB[dt].tagName,from:dt,to:dt};spans.push(cur);}
  });
  el.innerHTML=spans.reverse().map((s,i)=>{
    const def=tagDef(s.tag); const c=def?def.color:'#5c564b';
    const lab=(s.tag==='other'&&s.name)?('📍 '+s.name):(def?def.label:'📍');
    const range=s.from===s.to?fmtDate(s.from):`${fmtDate(s.from)} → ${fmtDate(s.to)}`;
    const days=rangeDates(s.from,s.to).length;
    return `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
      <span class="pill" style="background:${c}1f;color:${c};flex-shrink:0">${lab}</span>
      <span style="flex:1;min-width:120px;font-size:var(--fs-sm)">${range}</span>
      <span class="subtle" style="font-size:var(--fs-xs)">${days}d</span>
      <button onclick="editTagSpan('${s.from}','${s.to}','${s.tag}','${(s.name||'').replace(/'/g,"\\'")}')" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:var(--fs-xs);font-weight:600">Edit</button>
      <button onclick="deleteTagSpan('${s.from}','${s.to}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:var(--fs-xs);font-weight:600">Delete</button>
    </div>`;
  }).join('');
}
function editTagSpan(from,to,tag,name){
  // load this span into the editor fields for re-applying / changing
  document.getElementById('tag_from').value=from;
  document.getElementById('tag_to').value=to;
  const sel=document.getElementById('tag_sel'); if(sel)sel.value=tag;
  tagSelChange();
  if(tag==='other')document.getElementById('tag_custom').value=name||'';
  // make sure the accordion is open and scroll the editor into view
  const acc=document.getElementById('tagAcc'); if(acc)acc.open=true;
  document.getElementById('tag_from').scrollIntoView({behavior:'smooth',block:'center'});
}
function deleteTagSpan(from,to){
  if(!confirm('Remove the tag from '+fmtDate(from)+(from===to?'':' → '+fmtDate(to))+'?'))return;
  rangeDates(from,to).forEach(dt=>{
    if(DB[dt]&&DB[dt].tag){
      delete DB[dt].tag;delete DB[dt].tagName;
      const empty=Object.keys(DB[dt]).length===0;
      if(empty)delete DB[dt];
      try{persist(dt);}catch(e){console.warn('persist failed',dt,e);}
    }
  });
  renderTagHistory();renderGrid();renderStrip();flashSaved();
}
function renderStrip(){
  const dates=weekDates();const t=todayStr();
  const periodStarts=new Set(PERIODS.map(p=>p.from));
  document.getElementById('dateStrip').innerHTML=
    `<button class="arw" onclick="shiftWeek(-1)">‹</button><div class="days">`+
    dates.map(dt=>{
      const future=dt>t;const has=!!DB[dt];
      const pip=has?`<span class="pipe" style="background:var(--green)"></span>`:'';
      const flag=periodStarts.has(dt)?`<span class="goalflag" title="Goal changed here">📍</span>`:'';
      const tg=DB[dt]&&DB[dt].tag?tagDef(DB[dt].tag):null;
      const tagbar=tg?`<span class="tagbar" style="background:${tg.color}" title="${tagLabelFor(DB[dt])}"></span>`:'';
      return `<div class="dstrip-day ${dt===t?'today':''} ${future?'future':''}" onclick="jumpDay('${dt}')">${pip}${flag}<div class="dn">${dowName(dt)}</div><div class="dd">${dayNum(dt)}</div><div class="dm">${monName(dt)}</div>${tagbar}</div>`;
    }).join('')+`</div><button class="arw" onclick="shiftWeek(1)">›</button>`;
}
function shiftWeek(n){weekStart=addDays(weekStart,n*7);renderWeek();}
function jumpDay(dt){weekStart=mondayOf(dt);renderWeek();}

function renderGrid(){
  const dates=weekDates();const t=todayStr();
  const head=`<thead><tr><th>Field</th>`+dates.map(dt=>{
    const sun=new Date(dt+'T00:00:00').getDay()===0;
    return `<th class="${dt===t?'today-col':''}" style="${sun?'color:var(--accent)':''}">${dowName(dt)}<br>${dayNum(dt)}</th>`;
  }).join('')+`</tr></thead>`;
  let rows='<tbody>';
  // REST DAY row (top, so it's the first thing you set)
  rows+=`<tr><td class="rowlabel">🌙 Rest day</td>`+dates.map(dt=>{
    const on=DB[dt]&&DB[dt].rest;const sun=new Date(dt+'T00:00:00').getDay()===0;
    return `<td class="daycell ${dt===t?'today-col':''}"><span class="gcheck rest ${on?'on':''}" title="${sun?'Sunday — usually rest':''}" onclick="toggleRest('${dt}')">🌙</span></td>`;
  }).join('')+`</tr>`;
  // CONTEXT TAG row (display only — set via the Tag dates panel)
  rows+=`<tr><td class="rowlabel">📍 Context</td>`+dates.map(dt=>{
    const tg=DB[dt]&&DB[dt].tag?tagDef(DB[dt].tag):null;
    const lab=tg?(DB[dt].tag==='other'&&DB[dt].tagName?'📍':tg.label.split(' ')[0]):'';
    const title=DB[dt]?tagLabelFor(DB[dt]):'';
    return `<td class="daycell ${dt===t?'today-col':''}">${tg?`<span title="${title}" style="font-size:var(--fs-md)">${lab}</span>`:'<span class="subtle" style="opacity:.4">·</span>'}</td>`;
  }).join('')+`</tr>`;
  // metrics group
  rows+=`<tr class="rowgroup-h"><td colspan="8">Numbers — type any field, save independently</td></tr>`;
  METRICS.forEach(m=>{
    rows+=`<tr><td class="rowlabel">${m.label}</td>`+dates.map(dt=>{
      const v=(DB[dt]&&DB[dt][m.k]!=null)?DB[dt][m.k]:'';
      return `<td class="daycell ${dt===t?'today-col':''}"><input class="gnum" type="number" inputmode="decimal" step="${m.step}" value="${v}" onchange="setNum('${dt}','${m.k}',this.value)"></td>`;
    }).join('')+`</tr>`;
  });
  // habits group — labels reflect the goal active at this week's end
  const weekGoal=goalOn(dates[6]);
  rows+=`<tr class="rowgroup-h"><td colspan="8">Habits — ✓ tap to toggle · dashed = auto-ticks from numbers</td></tr>`;
  HABITS.forEach(h=>{
    rows+=`<tr><td class="rowlabel">${h.lbl(weekGoal)}</td>`+dates.map(dt=>{
      const d=DB[dt]||{};const on=d[h.k];const auto=h.auto?'auto':'';
      const excused=d.rest&&['gym','cardio'].includes(h.k);
      if(excused)return `<td class="daycell ${dt===t?'today-col':''}"><span class="gcheck excused" title="Rest day — not counted">–</span></td>`;
      return `<td class="daycell ${dt===t?'today-col':''}"><span class="gcheck ${on?'on':''} ${auto}" onclick="toggleCell('${dt}','${h.k}')">✓</span></td>`;
    }).join('')+`</tr>`;
  });
  // score row
  rows+=`<tr><td class="rowlabel">🏆 Score</td>`+dates.map(dt=>{
    const s=scoreFor(DB[dt]||{});const has=DB[dt];
    return `<td class="daycell ${dt===t?'today-col':''}">${has?`<span class="score-chip ${scoreColor(s.pct)}">${s.pct}%</span>`:'<span class="subtle">—</span>'}</td>`;
  }).join('')+`</tr>`;
  // measurements group (collapsible)
  rows+=`<tr class="rowgroup-h measure-toggle" onclick="toggleMeasures()"><td colspan="8"><span id="measArrow">▸</span> Measurements — only when you measure</td></tr>`;
  MEASURES.forEach(m=>{
    rows+=`<tr class="measrow" style="display:none"><td class="rowlabel">${m.label}</td>`+dates.map(dt=>{
      const v=(DB[dt]&&DB[dt][m.k]!=null)?DB[dt][m.k]:'';
      return `<td class="daycell ${dt===t?'today-col':''}"><input class="gnum" type="number" inputmode="decimal" step="${m.step}" value="${v}" onchange="setNum('${dt}','${m.k}',this.value)"></td>`;
    }).join('')+`</tr>`;
  });
  rows+='</tbody>';
  document.getElementById('weekGrid').innerHTML=head+rows;
  paintGridHead(head);
}

/* ── pinned date row (ADR-0035) ──────────────────────────────────────────────
   The day columns scroll out of reach long before the Habits rows do, leaving
   you editing an unlabelled grid. The real <thead> cannot be pinned: it sits
   inside .tscroll, and `position:sticky` resolves against the nearest scroll
   container rather than the viewport — .tscroll scrolls horizontally only, so a
   sticky thead there has nowhere to travel and never detaches (verified: it
   tracks the page instead of pinning).

   So we pin a CLONE outside the scroller, where the page is the scrollport, and
   keep it horizontally in step with the real grid. Two details that matter:
   - widths are COPIED from the rendered header, not guessed. The table is
     auto-layout, so column widths depend on content (a 5-char habit label vs
     "Calorie ceiling"); anything else drifts out of alignment.
   - the clone scrolls (`scrollLeft`) rather than being transformed. A transform
     would create a containing block and break the `position:sticky;left:0` that
     holds the "Field" corner cell in place. */
function paintGridHead(headHtml){
  const host=document.getElementById('weekGridHead'); if(!host) return;
  host.innerHTML=`<table class="weekgrid ghead-table">${headHtml}</table>`;
  syncGridHead();
}
/* Copy the real column widths onto the clone. Runs after layout, and again on
   resize — a font swap or an orientation change re-flows the columns. */
function syncGridHead(){
  const host=document.getElementById('weekGridHead');
  const real=document.getElementById('weekGrid');
  if(!host||!real) return;
  const src=real.querySelectorAll('thead th');
  const dst=host.querySelectorAll('thead th');
  if(!src.length||src.length!==dst.length) return;
  host.style.marginBottom='';                                  // measure unshifted
  host.querySelector('table').style.width=real.getBoundingClientRect().width+'px';
  src.forEach((th,i)=>{ const w=th.getBoundingClientRect().width; dst[i].style.width=w+'px'; dst[i].style.minWidth=w+'px'; });
  /* pull it back over the real header so it costs nothing in flow */
  host.style.marginBottom=(-Math.round(host.getBoundingClientRect().height))+'px';
  syncGridHeadScroll();
}
/* Shadow only while it is genuinely floating — a drop shadow on a header sitting
   flush on its own table reads as a rendering artefact. */
function markGridHeadPinned(){
  const host=document.getElementById('weekGridHead');
  const wrap=document.querySelector('.gridwrap');
  if(!host||!wrap||!wrap.offsetParent) return;
  host.classList.toggle('pinned', wrap.getBoundingClientRect().top < host.getBoundingClientRect().top - 1);
}
function syncGridHeadScroll(){
  const host=document.getElementById('weekGridHead');
  const sc=document.getElementById('weekScroll');
  if(host&&sc) host.scrollLeft=sc.scrollLeft;
}
/* The pinned row must clear the subnav, whose height isn't fixed (the chip rail
   can wrap). Measure it instead of hardcoding, and expose it to CSS. */
function measureStickyOffsets(){
  const sn=document.querySelector('.subnav');
  const h=sn?Math.round(sn.getBoundingClientRect().height):44;
  document.documentElement.style.setProperty('--subnav-h', h+'px');
}
(function initGridHead(){
  const on=()=>{ measureStickyOffsets(); syncGridHead(); };
  window.addEventListener('resize', on, {passive:true});
  window.addEventListener('orientationchange', on, {passive:true});
  document.addEventListener('DOMContentLoaded', measureStickyOffsets);
  /* Re-measure once the webfont is in. At DOMContentLoaded the subnav is still
     laid out in the fallback face and measures ~1.6px short, which parks the
     pinned row over the subnav's bottom border. */
  window.addEventListener('load', on);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(on);
  /* Capture phase: scroll doesn't bubble, so a delegated listener has to catch it
     on the way down. One listener covers the grid's sideways scroll (sync the
     clone) and the page's vertical scroll (toggle the shadow) without binding to
     elements this file doesn't own. Passive — the auto-hiding topbar shares this
     event and must not be blocked. */
  document.addEventListener('scroll', e=>{
    if(e.target && e.target.id==='weekScroll') syncGridHeadScroll();
    else markGridHeadPinned();
  }, {capture:true, passive:true});
})();
function toggleRest(dt){
  const d=ensure(dt);
  if(d.rest)delete d.rest;else d.rest=1;
  if(Object.keys(d).length===0)delete DB[dt];
  persist(dt);renderGrid();renderStrip();flashSaved();
}
let measOpen=false;
function toggleMeasures(){measOpen=!measOpen;document.querySelectorAll('.measrow').forEach(r=>r.style.display=measOpen?'':'none');document.getElementById('measArrow').textContent=measOpen?'▾':'▸';}

function ensure(dt){if(!DB[dt])DB[dt]={};return DB[dt];}
function setNum(dt,k,val){
  const d=ensure(dt);
  if(val===''||val==null){delete d[k];}else{d[k]=parseFloat(val);}
  applyAuto(d,dt);
  if(Object.keys(d).length===0)delete DB[dt];
  persist(dt);
  renderGrid();renderStrip();flashSaved();
}
function toggleCell(dt,k){
  const d=ensure(dt);
  if(d[k])delete d[k];else d[k]=1;
  if(Object.keys(d).length===0)delete DB[dt];
  persist(dt);renderGrid();renderStrip();flashSaved();
}
function saveWeek(){persist();flashSaved();}
function flashSaved(){const m=document.getElementById('saveMsg');if(!m)return;m.style.opacity='1';clearTimeout(window._sv);window._sv=setTimeout(()=>m.style.opacity='0',1400);}

/* ---- HISTORY & MONTHLY STATS ---- */
function monthsData(){
  const byM={};
  Object.keys(DB).forEach(dt=>{const mk=monthKey(dt);(byM[mk]=byM[mk]||[]).push(DB[dt]);});
  return byM;
}
function avg(arr,k){const v=arr.map(x=>x[k]).filter(x=>typeof x==='number');return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}
function renderHistory(){
  const byM=monthsData();
  const order=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mkeys=Object.keys(byM).sort();
  // populate month filter (once / refresh)
  const sel=document.getElementById('monthFilter');
  const prev=sel.value;
  const optAll='<option value="all">All time</option>';
  sel.innerHTML=optAll+mkeys.slice().reverse().map(mk=>{const[y,m]=mk.split('-');return `<option value="${mk}">${order[+m-1]} 20${y.slice(2)}</option>`;}).join('');
  // default to latest month if nothing chosen
  const chosen=(prev&&[...sel.options].some(o=>o.value===prev))?prev:(mkeys.length?mkeys[mkeys.length-1]:'all');
  sel.value=chosen;

  const focusDates=(chosen==='all'?Object.keys(DB):Object.keys(DB).filter(dt=>monthKey(dt)===chosen)).sort().reverse();
  document.getElementById('histEmpty').style.display=focusDates.length?'none':'block';

  // stat tiles for chosen month (or all)
  const cur=focusDates.map(dt=>DB[dt]);
  const sEl=document.getElementById('histStats');
  if(cur.length){
    const sc=Math.round(cur.map(scoreFor).reduce((a,b)=>a+b.pct,0)/cur.length);
    const w=avg(cur,'weight'),p=avg(cur,'proteinAmt'),sl=avg(cur,'sleepHrs');
    const protDays=cur.filter(x=>typeof x.proteinAmt==='number'&&x.proteinAmt>=180).length;
    const gymDays=cur.filter(x=>x.gym).length;
    const restDays=cur.filter(x=>x.rest).length;
    sEl.innerHTML=`
      <div class="stat"><div class="bar" style="background:var(--green)"></div><div class="k">Days logged</div><div class="v">${cur.length}</div></div>
      <div class="stat"><div class="bar" style="background:var(--accent)"></div><div class="k">Avg score</div><div class="v">${sc}<small>%</small></div></div>
      <div class="stat"><div class="bar" style="background:var(--blue)"></div><div class="k">Avg weight</div><div class="v">${w?w.toFixed(1):'—'}<small>kg</small></div></div>
      <div class="stat"><div class="bar" style="background:var(--amber)"></div><div class="k">Avg protein</div><div class="v">${p?Math.round(p):'—'}<small>g</small></div></div>
      <div class="stat"><div class="bar" style="background:var(--green)"></div><div class="k">Protein ≥180 days</div><div class="v">${protDays}</div></div>
      <div class="stat"><div class="bar" style="background:var(--ink)"></div><div class="k">Gym days</div><div class="v">${gymDays}</div></div>
      <div class="stat"><div class="bar" style="background:var(--blue)"></div><div class="k">Avg sleep</div><div class="v">${sl?sl.toFixed(1):'—'}<small>h</small></div></div>
      <div class="stat"><div class="bar" style="background:var(--muted)"></div><div class="k">Rest days</div><div class="v">${restDays}</div></div>`;
  } else sEl.innerHTML='<p class="subtle">No entries for this period yet.</p>';

  // month-on-month table (always all months)
  document.getElementById('monthBody').innerHTML=mkeys.map(mk=>{
    const arr=byM[mk];const sc=Math.round(arr.map(scoreFor).reduce((a,b)=>a+b.pct,0)/arr.length);
    const w=avg(arr,'weight'),p=avg(arr,'proteinAmt'),sl=avg(arr,'sleepHrs');
    const protDays=arr.filter(x=>typeof x.proteinAmt==='number'&&x.proteinAmt>=180).length;
    const gymDays=arr.filter(x=>x.gym).length;
    const [y,m]=mk.split('-');
    const hl=(mk===chosen)?' style="background:var(--accent-soft)"':'';
    return `<tr${hl}><td class="mk-cell">${order[+m-1]} '${y.slice(2)}</td><td class="tnum">${arr.length}</td><td><span class="score-chip ${scoreColor(sc)}">${sc}%</span></td><td class="tnum">${w?w.toFixed(1):'—'}</td><td class="tnum">${p?Math.round(p):'—'}</td><td class="tnum">${protDays}</td><td class="tnum">${gymDays}</td><td class="tnum">${sl?sl.toFixed(1):'—'}</td></tr>`;
  }).join('');

  // month score chart
  if(window.Chart&&document.getElementById('cMonthScore')){
    const labels=mkeys.map(mk=>{const [y,m]=mk.split('-');return order[+m-1];});
    const data=mkeys.map(mk=>Math.round(byM[mk].map(scoreFor).reduce((a,b)=>a+b.pct,0)/byM[mk].length));
    if(charts['cMonthScore'])charts['cMonthScore'].destroy();
    charts['cMonthScore']=new Chart(document.getElementById('cMonthScore'),{type:'bar',data:{labels,datasets:[{data,backgroundColor:cssv('--green'),borderRadius:6,maxBarThickness:46}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'%'}}},scales:{x:{grid:{display:false},ticks:{color:cssv('--muted')}},y:{min:0,max:100,grid:{color:'rgba(0,0,0,.05)'},ticks:{callback:v=>v+'%',color:cssv('--muted')}}}}});
  }

  // all days table (filtered)
  const cell=(d,k)=>{const exc=d.rest&&['gym','cardio'].includes(k);return `<td style="text-align:center"><span class="dot ${exc?'t':(d[k]?'y':'n')}"></span></td>`;};
  const num=(d,k)=>`<td class="tnum">${d[k]!=null?d[k]:'—'}</td>`;
  document.getElementById('histBody').innerHTML=focusDates.map(dt=>{
    const d=DB[dt];const s=scoreFor(d);
    const tg=d.tag?tagDef(d.tag):null; const tmark=tg?` <span title="${tagLabelFor(d)}">${tg.label.split(' ')[0]}</span>`:'';
    return `<tr style="cursor:pointer" onclick="jumpToDay('${dt}')"><td class="mk-cell" style="white-space:nowrap">${dayNum(dt)} ${monName(dt)}${d.rest?' 🌙':''}${tmark}</td>${cell(d,'thyroid')}${cell(d,'water')}${cell(d,'protein')}${cell(d,'sleep8')}${cell(d,'gym')}${cell(d,'cardio')}${cell(d,'steps10k')}${cell(d,'omega3')}${cell(d,'under2k')}${num(d,'weight')}${num(d,'proteinAmt')}${num(d,'calories')}${num(d,'sleepHrs')}${num(d,'steps')}${num(d,'puffiness')}<td><span class="score-chip ${scoreColor(s.pct)}">${s.pct}%</span></td></tr>`;
  }).join('');

  // ── Performance by context (all-time, ignores month filter) ──
  const byTag={};
  Object.keys(DB).forEach(dt=>{const d=DB[dt];if(!d.tag)return;(byTag[d.tag]=byTag[d.tag]||[]).push(d);});
  const tagKeys=Object.keys(byTag);
  document.getElementById('ctxEmpty').style.display=tagKeys.length?'none':'block';
  // include an "Untagged" baseline for comparison
  const untagged=Object.keys(DB).filter(dt=>!DB[dt].tag).map(dt=>DB[dt]);
  const rowsArr=tagKeys.map(k=>({k,arr:byTag[k],def:tagDef(k)}));
  if(untagged.length)rowsArr.push({k:'__untagged__',arr:untagged,def:{label:'— Untagged',color:'#948c7d'}});
  document.getElementById('ctxBody').innerHTML=rowsArr.map(({k,arr,def})=>{
    const sc=Math.round(arr.map(scoreFor).reduce((a,b)=>a+b.pct,0)/arr.length);
    const w=avg(arr,'weight'),p=avg(arr,'proteinAmt'),sl=avg(arr,'sleepHrs');
    const pHit=arr.filter(x=>typeof x.proteinAmt==='number'&&x.proteinAmt>=goalProteinFor(x)).length;
    const gym=arr.filter(x=>x.gym).length;
    const c=def?def.color:'#948c7d';
    return `<tr><td><span class="pill" style="background:${c}1f;color:${c}">${def?def.label:k}</span></td><td class="tnum">${arr.length}</td><td><span class="score-chip ${scoreColor(sc)}">${sc}%</span></td><td class="tnum">${w?w.toFixed(1):'—'}</td><td class="tnum">${p?Math.round(p):'—'}</td><td class="tnum">${pHit}</td><td class="tnum">${gym}</td><td class="tnum">${sl?sl.toFixed(1):'—'}</td></tr>`;
  }).join('');
}
// protein goal for a given day's record (uses its date's period if we can find it; falls back to current)
function goalProteinFor(d){return curGoal().protein;}
function jumpToDay(dt){go('t-log');setTimeout(()=>jumpDay(dt),60);}
function clearAll(){
  const old=Object.keys(DB);
  DB={};localPersist();
  if(cloudOK&&supa&&old.length){
    setSyncBadge('sync');
    const dates=old.filter(dt=>/^\d{4}-\d{2}-\d{2}$/.test(dt));
    const chunks=[];for(let i=0;i<dates.length;i+=100)chunks.push(dates.slice(i,i+100));
    Promise.all(chunks.map(chunk=>supa.from('tracker_days').delete().in('date',chunk)))
      .then(res=>setSyncBadge(res.some(r=>r.error)?'off':'ok')).catch(()=>setSyncBadge('off'));
  }
  renderHistory();
}

function exportCSV(){
  const dates=Object.keys(DB).sort();
  if(!dates.length){alert('No data to export yet.');return;}
  const esc=s=>{s=(s==null?'':String(s));return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  // header row: Date + each date
  const lines=[];
  lines.push(['Date',...dates].map(esc).join(','));
  // habit rows (True/False like Excel; travel days blank)
  HABITS.forEach(h=>{
    const row=[h.lbl(curGoal())];
    dates.forEach(dt=>{const d=DB[dt]||{};
      if(d.rest&&(h.k==='gym'||h.k==='cardio')){row.push('REST');}
      else row.push(d[h.k]?'TRUE':'FALSE');
    });
    lines.push(row.map(esc).join(','));
  });
  // numeric rows
  const numRows=[['Face Puffiness','puffiness'],['Weight (kg)','weight'],['Protein - Amount','proteinAmt'],['Calories','calories'],['Sleep Hours','sleepHrs'],['Steps Count','steps']];
  numRows.forEach(([label,k])=>{
    lines.push([label,...dates.map(dt=>{const v=(DB[dt]||{})[k];return v==null?'':v;})].map(esc).join(','));
  });
  // metric ticked + score
  lines.push(['Metric Ticked out of 9',...dates.map(dt=>scoreFor(DB[dt]||{}).hit)].map(esc).join(','));
  lines.push(['Score',...dates.map(dt=>{const s=scoreFor(DB[dt]||{});return s.total?(s.hit/s.total).toFixed(4):'';})].map(esc).join(','));
  // measurements
  [['Waist','waist'],['Tummy','tummy'],['Chest','chest'],['Bicep','bicep']].forEach(([label,k])=>{
    lines.push([label,...dates.map(dt=>{const v=(DB[dt]||{})[k];return v==null?'':v;})].map(esc).join(','));
  });
  // comments
  lines.push(['Context Tag',...dates.map(dt=>{const d=DB[dt]||{};return d.tag?(d.tag==='other'&&d.tagName?d.tagName:d.tag):'';})].map(esc).join(','));
  lines.push(['Comments',...dates.map(dt=>(DB[dt]||{}).comments||'')].map(esc).join(','));
  const blob=new Blob([lines.join('\n')],{type:'text/csv'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='WAR_MODE_tracker_export.csv';a.click();
}

