/* checkin.js — check-in photo engine (staging, upload, journey, compare, lightbox) */
/* ══════════ CHECK-IN ENGINE ══════════ */
const CI_ANGLES=[{k:'front',label:'Front'},{k:'back',label:'Back'},{k:'side',label:'Side'},{k:'legs',label:'Legs'}];
const CI_BUCKET='progress-photos';
// CHECKINS stores paths (not URLs): {date:{weight,waist,...,note,photos:{front:'path',back:'path',...}}}
let CHECKINS={};
let ciStaged={};       // pending File objects for the open editor, by angle
let ciSignedCache={};  // {path: {url, expires}} — signed URL cache, 7-day TTL

function ciSync(state,msg){const el=document.getElementById('checkinSync');if(!el)return;const m={ok:['p-green','☁ Synced'],off:['p-amber','⚠ Local only'],sync:['p-blue','⟳ Working…']};const[c,t]=m[state]||m.off;el.className='pill '+c;el.textContent=msg||t;}

async function loadCheckins(){
  try{const raw=localStorage.getItem('warmode_checkins_v1');if(raw)CHECKINS=JSON.parse(raw);}catch(e){}
  try{
    if(supa){
      const {data,error}=await supa.from('tracker_days').select('data').eq('date','__checkins__').maybeSingle();
      if(!error&&data&&data.data)CHECKINS=data.data;
      ciSync('ok');
    } else ciSync('off');
  }catch(e){ciSync('off');}
  try{localStorage.setItem('warmode_checkins_v1',JSON.stringify(CHECKINS));}catch(e){}
}
function persistCheckins(){
  try{localStorage.setItem('warmode_checkins_v1',JSON.stringify(CHECKINS));}catch(e){}
  if(cloudOK&&supa){ciSync('sync');supa.from('tracker_days').upsert({date:'__checkins__',data:CHECKINS}).then(({error})=>ciSync(error?'off':'ok'));}
}

/* ── Signed URL helper (7-day TTL, in-memory cache) ── */
async function signedUrl(path){
  if(!path||!supa)return null;
  const now=Date.now();
  if(ciSignedCache[path]&&ciSignedCache[path].expires>now+60000)return ciSignedCache[path].url;
  const TTL=7*24*3600; // 7 days in seconds
  const {data,error}=await supa.storage.from(CI_BUCKET).createSignedUrl(path,TTL);
  if(error||!data)return null;
  ciSignedCache[path]={url:data.signedUrl,expires:now+(TTL-300)*1000};
  return data.signedUrl;
}
/* resolve a stored value: if it looks like a path (no http) get signed URL, else return as-is (local blob or legacy public URL) */
async function resolvePhotoUrl(val){
  if(!val)return null;
  if(val.startsWith('blob:')||val.startsWith('http'))return val; // local staged or legacy public URL
  return await signedUrl(val);
}

function daysSinceLastCheckin(){
  const ds=Object.keys(CHECKINS).sort();if(!ds.length)return Infinity;
  const last=ds[ds.length-1];
  return Math.floor((new Date(todayStr()+'T00:00:00')-new Date(last+'T00:00:00'))/86400000);
}
function updateCheckinBadge(){
  const b=document.getElementById('checkinBadge');if(!b)return;
  b.style.display=daysSinceLastCheckin()>=7?'inline-block':'none';
}

let ciActiveView='new';
function ciView(v){
  ciActiveView=v;
  document.querySelectorAll('.ci-tab').forEach(t=>t.classList.toggle('on',t.dataset.civ===v));
  document.querySelectorAll('.civ').forEach(c=>c.style.display='none');
  document.getElementById('civ-'+v).style.display='';
  if(v==='journey')renderJourney();
  if(v==='compare')renderCompareSelectors();
}

function renderCheckin(){
  ciSync(cloudOK?'ok':'off');
  const d=document.getElementById('ci_date'); if(!d.value)d.value=todayStr();
  buildCiSlots();
  ciDateChange();
  ciView(ciActiveView);
  updateCheckinBadge();
}
function buildCiSlots(){
  const wrap=document.getElementById('ciSlots');
  wrap.innerHTML=CI_ANGLES.map(a=>`
    <label class="ci-slot" id="slot_${a.k}">
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange="stagePhoto('${a.k}',this)">
      <span class="ci-ic">＋</span>
      <span class="ci-cap">${a.label}</span>
      <button type="button" class="ci-up" onclick="clearStaged(event,'${a.k}')">×</button>
    </label>`).join('');
}
function ciDateChange(){
  const dt=document.getElementById('ci_date').value;
  ciStaged={};
  const ex=CHECKINS[dt];
  const day=DB[dt]||{};
  const g=(k)=>(ex&&ex[k]!=null)?ex[k]:(day[k]!=null?day[k]:'');
  document.getElementById('ci_weight').value=g('weight');
  document.getElementById('ci_waist').value=g('waist');
  document.getElementById('ci_tummy').value=g('tummy');
  document.getElementById('ci_chest').value=g('chest');
  document.getElementById('ci_bicep').value=g('bicep');
  document.getElementById('ci_note').value=ex&&ex.note?ex.note:'';
  const pulled=[];
  if(day.weight!=null&&!(ex&&ex.weight!=null))pulled.push('weight');
  if(day.waist!=null)pulled.push('waist');
  document.getElementById('ci_pulled').textContent=pulled.length?('Auto-filled from your '+fmtDate(dt)+' log: '+pulled.join(', ')+'.'):'';
  // show existing photos — resolve signed URLs async
  CI_ANGLES.forEach(async a=>{
    const slot=document.getElementById('slot_'+a.k);if(!slot)return;
    const val=ex&&ex.photos&&ex.photos[a.k];
    const url=await resolvePhotoUrl(val);
    paintSlot(a.k,url||null);
  });
}
function paintSlot(k,url){
  const slot=document.getElementById('slot_'+k);if(!slot)return;
  const oldImg=slot.querySelector('img');if(oldImg)oldImg.remove();
  if(url){slot.classList.add('filled');const img=document.createElement('img');img.src=url;slot.insertBefore(img,slot.firstChild);}
  else slot.classList.remove('filled');
}
function stagePhoto(k,input){
  const f=input.files&&input.files[0];if(!f)return;
  ciStaged[k]=f;
  paintSlot(k,URL.createObjectURL(f));
}
function clearStaged(e,k){
  e.preventDefault();e.stopPropagation();
  delete ciStaged[k];
  const dt=document.getElementById('ci_date').value;
  const ex=CHECKINS[dt];
  if(ex&&ex.photos&&ex.photos[k]){
    if(confirm('Remove this saved photo?')){
      // delete from storage too
      if(supa&&cloudOK&&!ex.photos[k].startsWith('http')){
        supa.storage.from(CI_BUCKET).remove([ex.photos[k]]);
      }
      delete ex.photos[k];persistCheckins();
    }
  }
  // re-resolve and repaint
  (async()=>{
    const val=CHECKINS[dt]&&CHECKINS[dt].photos&&CHECKINS[dt].photos[k];
    paintSlot(k,val?(await resolvePhotoUrl(val)):null);
  })();
}
async function saveCheckin(){
  const dt=document.getElementById('ci_date').value;if(!dt){alert('Pick a date.');return;}
  const btn=document.getElementById('ciSaveBtn');btn.disabled=true;btn.textContent='Saving…';
  const rec=CHECKINS[dt]||{photos:{}};
  rec.photos=rec.photos||{};
  rec.weight=parseFloat(document.getElementById('ci_weight').value)||null;
  rec.waist=parseFloat(document.getElementById('ci_waist').value)||null;
  rec.tummy=parseFloat(document.getElementById('ci_tummy').value)||null;
  rec.chest=parseFloat(document.getElementById('ci_chest').value)||null;
  rec.bicep=parseFloat(document.getElementById('ci_bicep').value)||null;
  rec.note=document.getElementById('ci_note').value.trim();
  try{
    for(const k of Object.keys(ciStaged)){
      const file=ciStaged[k];
      // store as path: date/angle_timestamp.jpg  e.g. 2026-06-02/front_1717300000000.jpg
      const path=dt+'/'+k+'_'+Date.now()+'.jpg';
      if(supa&&cloudOK){
        const {error}=await supa.storage.from(CI_BUCKET).upload(path,file,{upsert:true,contentType:file.type||'image/jpeg'});
        if(error)throw error;
        rec.photos[k]=path; // store path, not public URL
      } else {
        rec.photos[k]=URL.createObjectURL(file); // offline: local blob (won't persist across devices)
      }
    }
    CHECKINS[dt]=rec;ciStaged={};
    persistCheckins();updateCheckinBadge();
    // ── mirror measurements into the daily tracker (DB) so progress charts update ──
    mirrorCheckinToDB(dt,rec);
    const m=document.getElementById('ciSaveMsg');m.style.opacity='1';setTimeout(()=>m.style.opacity='0',1800);
  }catch(e){
    alert('Photo upload failed: '+e.message+'\n\nMake sure the progress-photos bucket exists and the anon INSERT policy is set.');
    ciSync('off');
  }
  btn.disabled=false;btn.textContent='Save Check-In';
}
/* Copy check-in weight + measurements into that day's DB row so the
   fit-progress charts and stat cards (which read from DB) stay in sync.
   Only writes fields the user actually filled; never wipes existing DB data,
   and never overwrites a value the daily log already has unless the check-in
   provides a (newer) explicit value. Weight is mirrored too. */
function mirrorCheckinToDB(dt,rec){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dt))return;
  const day=DB[dt]||{};
  let changed=false;
  ['weight','waist','tummy','chest','bicep'].forEach(k=>{
    if(rec[k]!=null&&rec[k]!==''){ if(day[k]!==rec[k]){day[k]=rec[k];changed=true;} }
  });
  if(!changed)return;
  DB[dt]=day;
  applyAuto(day,dt);            // re-evaluate auto habits (e.g. weight doesn't gate any, but keeps DB consistent)
  persist(dt);                  // local + cloud single-day upsert
  // if a tracker view is currently showing, refresh it
  const active=document.querySelector('.page.active');
  if(active){
    if(active.id==='t-log')renderWeek();
    if(active.id==='t-history')renderHistory();
    if(active.id==='fit-progress')buildCharts('fit-progress');
  }
}
function deleteCheckin(dt){
  if(!confirm('Delete the entire '+fmtDate(dt)+' check-in (all photos & measurements)?'))return;
  // remove files from storage
  if(supa&&cloudOK&&CHECKINS[dt]&&CHECKINS[dt].photos){
    const paths=Object.values(CHECKINS[dt].photos).filter(v=>v&&!v.startsWith('http')&&!v.startsWith('blob:'));
    if(paths.length)supa.storage.from(CI_BUCKET).remove(paths);
  }
  delete CHECKINS[dt];persistCheckins();
  if(ciActiveView==='journey')renderJourney();
  updateCheckinBadge();
}

/* ══ JOURNEY VIEW — angle toggle + horizontal filmstrip ══ */
let journeyAngle='front';
function renderJourney(){
  const dts=Object.keys(CHECKINS).sort();
  const empty=document.getElementById('journeyEmpty');
  const strip=document.getElementById('journeyStrip');
  if(!dts.length){if(empty)empty.style.display='block';if(strip)strip.innerHTML='';return;}
  if(empty)empty.style.display='none';

  // build angle tabs
  const tabWrap=document.getElementById('journeyAngleTabs');
  if(tabWrap&&!tabWrap.dataset.built){
    tabWrap.innerHTML=CI_ANGLES.map(a=>`<button class="ci-tab${a.k===journeyAngle?' on':''}" data-angle="${a.k}" onclick="setJourneyAngle('${a.k}')">${a.label}</button>`).join('');
    tabWrap.dataset.built='1';
  }
  // render strip for current angle
  renderJourneyStrip(dts);
}
function setJourneyAngle(k){
  journeyAngle=k;
  document.querySelectorAll('#journeyAngleTabs .ci-tab').forEach(b=>b.classList.toggle('on',b.dataset.angle===k));
  renderJourneyStrip(Object.keys(CHECKINS).sort());
}
function renderJourneyStrip(dts){
  const strip=document.getElementById('journeyStrip');if(!strip)return;
  // Each check-in = a card column: photo + date + weight
  const cards=dts.map(dt=>{
    const c=CHECKINS[dt];
    const val=c.photos&&c.photos[journeyAngle];
    const stats=[];
    if(c.weight)stats.push(c.weight+'kg');
    if(c.waist)stats.push('W'+c.waist+'″');
    const statLine=stats.join(' · ');
    const cardId='jcard_'+dt+'_'+journeyAngle;
    return `<div style="flex-shrink:0;width:170px;margin-right:10px">
      <div class="ci-thumb jcard-tall" id="${cardId}" style="width:170px;cursor:${val?'pointer':'default'}" onclick="${val?`jlightbox('${dt}','${journeyAngle}')`:''}">
        <span class="lbl">${fmtDate(dt)}</span>
      </div>
      ${statLine?`<div style="font-size:var(--fs-2xs);color:var(--muted);margin-top:4px;text-align:center">${statLine}</div>`:''}
      <div style="display:flex;gap:4px;margin-top:6px;justify-content:center">
        <button onclick="deleteCheckin('${dt}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:var(--fs-2xs);font-weight:600;padding:2px 6px">Delete</button>
      </div>
    </div>`;
  }).join('');

  strip.innerHTML=`<div style="display:flex;padding:4px 0">${cards}</div>`;

  // async: resolve and inject images
  dts.forEach(async dt=>{
    const c=CHECKINS[dt];
    const val=c.photos&&c.photos[journeyAngle];
    if(!val)return;
    const url=await resolvePhotoUrl(val);
    if(!url)return;
    const el=document.getElementById('jcard_'+dt+'_'+journeyAngle);
    if(!el)return;
    const existing=el.querySelector('img');if(existing)existing.remove();
    const img=document.createElement('img');img.src=url;el.insertBefore(img,el.firstChild);
    el.style.cursor='pointer';
  });
}

/* ══ COMPARE VIEW — side-by-side with measurement overlay ══ */
function renderCompareSelectors(){
  const dts=Object.keys(CHECKINS).sort();
  const opts=dts.map(dt=>`<option value="${dt}">${fmtDate(dt)}</option>`).join('');
  const a=document.getElementById('cmpA'),b=document.getElementById('cmpB');
  a.innerHTML=opts;b.innerHTML=opts;
  if(dts.length>=2){a.value=dts[0];b.value=dts[dts.length-1];}
  renderCompare();
}
function renderCompare(){
  const a=document.getElementById('cmpA').value,b=document.getElementById('cmpB').value;
  const res=document.getElementById('cmpResult');
  if(!a||!b||!CHECKINS[a]||!CHECKINS[b]){res.innerHTML='<p class="subtle">Add at least two check-ins to compare.</p>';return;}
  const A=CHECKINS[a],B=CHECKINS[b];
  const days=Math.abs(Math.floor((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000));

  const deltaVal=(k)=>{if(A[k]==null||B[k]==null)return null;return B[k]-A[k];};
  const deltaHtml=(k,unit,lowerGood=true)=>{
    const d=deltaVal(k);if(d==null)return '<span class="subtle">—</span>';
    const good=lowerGood?d<0:d>0;
    const col=d===0?'var(--muted)':good?'var(--green)':'var(--red)';
    return `<span style="color:${col};font-weight:700">${d>0?'+':''}${d.toFixed(1)}${unit}</span>`;
  };

  // Summary row
  const summaryHtml=`<div class="card" style="margin-bottom:16px">
    <div style="font-family:var(--ffont);font-weight:600;font-size:var(--fs-xs);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:12px">${fmtDate(a)} → ${fmtDate(b)} · ${days} days</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;text-align:center">
      ${[['Weight','weight','kg',true],['Waist','waist','″',true],['Tummy','tummy','″',true],['Chest','chest','″',false],['Bicep','bicep','″',false]].map(([lbl,k,u,lg])=>`
        <div>
          <div style="font-size:var(--fs-2xs);color:var(--muted);font-family:var(--ffont);letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px">${lbl}</div>
          <div style="font-size:var(--fs-lg)">${deltaHtml(k,u,lg)}</div>
          <div style="font-size:var(--fs-2xs);color:var(--muted);margin-top:2px">${A[k]!=null?A[k]+(u):'—'} → ${B[k]!=null?B[k]+(u):'—'}</div>
        </div>`).join('')}
    </div>
  </div>`;

  // Per-angle comparison with measurement overlay
  const angleHtml=CI_ANGLES.map(an=>{
    // measurement relevant to this angle
    const mMap={front:'tummy',side:'waist',back:'waist',legs:null};
    const mk=mMap[an.k];
    const md=mk?deltaVal(mk):null;
    const mLabel=mk?mk.charAt(0).toUpperCase()+mk.slice(1):null;
    const mCol=md==null?'var(--muted)':md<0?'var(--green)':'var(--red)';
    const mBadge=mLabel&&md!=null?`<div style="text-align:center;margin-bottom:8px;font-size:var(--fs-sm)"><span style="font-family:var(--ffont);font-weight:600;color:var(--muted)">${mLabel}: </span><span style="color:${mCol};font-weight:700">${A[mk]}″ → ${B[mk]}″ (${md>0?'+':''}${md.toFixed(1)}″)</span></div>`:'';
    return `<div style="margin-top:18px" id="cmpAngle_${an.k}">
      <div style="font-family:var(--ffont);font-weight:600;font-size:var(--fs-sm);letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);margin-bottom:6px">${an.label}</div>
      ${mBadge}
      <div class="cmp-grid" style="position:relative">
        <div class="ci-thumb" id="cmpA_${an.k}" style="cursor:default">
          <span class="lbl">${fmtDate(a)}</span>
        </div>
        <div class="ci-thumb" id="cmpB_${an.k}" style="cursor:default">
          <span class="lbl">${fmtDate(b)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  res.innerHTML=summaryHtml+`<div class="card">${angleHtml}</div>`;

  // async inject photos
  CI_ANGLES.forEach(async an=>{
    const resolveAndInject=async(rec,dt,elId)=>{
      const val=rec.photos&&rec.photos[an.k];
      if(!val)return;
      const url=await resolvePhotoUrl(val);
      if(!url)return;
      const el=document.getElementById(elId);if(!el)return;
      const old=el.querySelector('img');if(old)old.remove();
      const img=document.createElement('img');img.src=url;el.insertBefore(img,el.firstChild);
      el.style.cursor='pointer';el.onclick=()=>cmpLightbox(a,b,an.k);
    };
    await resolveAndInject(A,a,'cmpA_'+an.k);
    await resolveAndInject(B,b,'cmpB_'+an.k);
  });
}

/* ══ DOWNLOAD — fresh signed URLs at download time ══ */
async function downloadAllPhotos(){
  const dts=Object.keys(CHECKINS).sort();
  let total=0;
  dts.forEach(dt=>{const c=CHECKINS[dt];if(c.photos)CI_ANGLES.forEach(a=>{if(c.photos[a.k])total++;});});
  if(!total){alert('No photos to download yet.');return;}
  const btn=document.getElementById('dlAllBtn');
  const prog=document.getElementById('dlProgress');
  btn.disabled=true;if(prog){prog.style.display='inline';prog.textContent='Preparing '+total+' photos…';}
  let n=0;
  for(const dt of dts){
    const c=CHECKINS[dt];if(!c.photos)continue;
    for(const a of CI_ANGLES){
      const val=c.photos[a.k];if(!val)continue;
      try{
        const url=await resolvePhotoUrl(val); // fresh signed URL
        if(!url)continue;
        const r=await fetch(url);const bl=await r.blob();
        const x=document.createElement('a');x.href=URL.createObjectURL(bl);x.download=dt+'_'+a.k+'.jpg';x.click();
        n++;if(prog)prog.textContent=`Downloaded ${n} / ${total}…`;
        await new Promise(r=>setTimeout(r,350));
      }catch(e){console.warn('Download failed for',dt,a.k,e);}
    }
  }
  btn.disabled=false;
  if(prog){prog.textContent=n+' photos downloaded.';setTimeout(()=>{prog.style.display='none';},3000);}
}

/* ══ RICH PHOTO VIEWER ══ */
/* Two modes:
   journey: swipe horizontally through SAME angle across all dates
   compare: swipe horizontally through angles (front/side/back), each slide = two dates side-by-side */
let lbvMode=null, lbvSlides=[], lbvIndex=0;

function lbvClose(){document.getElementById('lbViewer').classList.remove('show');document.body.style.overflow='';lbvSlides=[];}
function lbvBuildDots(n,active){
  const d=document.getElementById('lbvDots');
  d.innerHTML=Array.from({length:n},(_,i)=>`<i class="${i===active?'on':''}"></i>`).join('');
}
function lbvOnScroll(){
  const stage=document.getElementById('lbvStage');
  const idx=Math.round(stage.scrollLeft/stage.clientWidth);
  if(idx!==lbvIndex){lbvIndex=idx;lbvBuildDots(lbvSlides.length,idx);}
}

/* JOURNEY: open same-angle filmstrip across all dated check-ins */
async function jlightbox(startDt,angle){
  const dts=Object.keys(CHECKINS).sort().filter(dt=>CHECKINS[dt].photos&&CHECKINS[dt].photos[angle]);
  if(!dts.length)return;
  lbvMode='journey';
  lbvSlides=dts.map(dt=>({dt,angle,path:CHECKINS[dt].photos[angle]}));
  const startIdx=Math.max(0,dts.indexOf(startDt));
  const stage=document.getElementById('lbvStage');
  stage.onscroll=lbvOnScroll;
  stage.innerHTML=lbvSlides.map((s,i)=>`
    <div class="lbv-slide" data-i="${i}">
      <div class="lbv-loading" style="color:#666">Loading…</div>
      <div class="lbv-cap">${fmtDate(s.dt)}${CHECKINS[s.dt].weight?' · '+CHECKINS[s.dt].weight+'kg':''} · ${angle}</div>
    </div>`).join('');
  document.getElementById('lbViewer').classList.add('show');
  document.body.style.overflow='hidden';
  lbvIndex=startIdx; lbvBuildDots(lbvSlides.length,startIdx);
  // jump to start slide (after layout)
  requestAnimationFrame(()=>{stage.scrollLeft=startIdx*stage.clientWidth;});
  // resolve images
  lbvSlides.forEach(async(s,i)=>{
    const url=await resolvePhotoUrl(s.path);
    const slide=stage.querySelector(`.lbv-slide[data-i="${i}"]`);if(!slide||!url)return;
    s.url=url;
    const l=slide.querySelector('.lbv-loading');if(l)l.remove();
    const img=document.createElement('img');img.src=url;slide.insertBefore(img,slide.firstChild);
  });
}

/* COMPARE: open angle-swiper, each slide shows dateA vs dateB side-by-side */
async function cmpLightbox(dateA,dateB,startAngle){
  lbvMode='compare';
  const angles=CI_ANGLES.filter(a=>(CHECKINS[dateA]&&CHECKINS[dateA].photos&&CHECKINS[dateA].photos[a.k])||(CHECKINS[dateB]&&CHECKINS[dateB].photos&&CHECKINS[dateB].photos[a.k]));
  if(!angles.length)return;
  lbvSlides=angles.map(a=>({angle:a.k,label:a.label,dateA,dateB,
    pathA:CHECKINS[dateA]&&CHECKINS[dateA].photos&&CHECKINS[dateA].photos[a.k],
    pathB:CHECKINS[dateB]&&CHECKINS[dateB].photos&&CHECKINS[dateB].photos[a.k]}));
  let startIdx=angles.findIndex(a=>a.k===startAngle);if(startIdx<0)startIdx=0;
  const stage=document.getElementById('lbvStage');
  stage.onscroll=lbvOnScroll;
  stage.innerHTML=lbvSlides.map((s,i)=>`
    <div class="lbv-cmp" data-i="${i}">
      <div class="angle">${s.label}</div>
      <div class="pair">
        <div class="half" data-half="A"><div style="color:#666">Loading…</div><div class="hlbl">${fmtDate(s.dateA)}${CHECKINS[s.dateA]&&CHECKINS[s.dateA].weight?' · '+CHECKINS[s.dateA].weight+'kg':''}</div></div>
        <div class="half" data-half="B"><div style="color:#666">Loading…</div><div class="hlbl">${fmtDate(s.dateB)}${CHECKINS[s.dateB]&&CHECKINS[s.dateB].weight?' · '+CHECKINS[s.dateB].weight+'kg':''}</div></div>
      </div>
    </div>`).join('');
  document.getElementById('lbViewer').classList.add('show');
  document.body.style.overflow='hidden';
  lbvIndex=startIdx; lbvBuildDots(lbvSlides.length,startIdx);
  requestAnimationFrame(()=>{stage.scrollLeft=startIdx*stage.clientWidth;});
  lbvSlides.forEach(async(s,i)=>{
    const slide=stage.querySelector(`.lbv-cmp[data-i="${i}"]`);if(!slide)return;
    for(const[half,path,key] of [['A',s.pathA,'urlA'],['B',s.pathB,'urlB']]){
      const cell=slide.querySelector(`.half[data-half="${half}"]`);
      const ph=cell.querySelector('div:not(.hlbl)');
      if(!path){if(ph)ph.textContent='—';continue;}
      const url=await resolvePhotoUrl(path);if(!url){if(ph)ph.textContent='—';continue;}
      s[key]=url;
      if(ph)ph.remove();
      const img=document.createElement('img');img.src=url;cell.insertBefore(img,cell.firstChild);
    }
  });
}

/* download the photo(s) currently in view, at full resolution via fresh signed URL */
async function lbvDownloadCurrent(){
  const s=lbvSlides[lbvIndex];if(!s)return;
  const grab=async(path,name)=>{
    if(!path)return;
    const url=await resolvePhotoUrl(path);if(!url)return;
    try{const r=await fetch(url);const bl=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=name;a.click();}catch(e){console.warn(e);}
  };
  if(lbvMode==='journey'){
    await grab(s.path, s.dt+'_'+s.angle+'.jpg');
  }else{
    await grab(s.pathA, s.dateA+'_'+s.angle+'.jpg');
    await new Promise(r=>setTimeout(r,300));
    await grab(s.pathB, s.dateB+'_'+s.angle+'.jpg');
  }
}

// keyboard: Esc closes, arrows navigate
document.addEventListener('keydown',e=>{
  if(!document.getElementById('lbViewer').classList.contains('show'))return;
  const stage=document.getElementById('lbvStage');
  if(e.key==='Escape')lbvClose();
  else if(e.key==='ArrowRight')stage.scrollBy({left:stage.clientWidth,behavior:'smooth'});
  else if(e.key==='ArrowLeft')stage.scrollBy({left:-stage.clientWidth,behavior:'smooth'});
});

/* legacy simple lightbox — still used by anywhere that calls lightbox(url) directly */
function lightbox(url){const lb=document.getElementById('lightbox');lb.querySelector('img').src=url;lb.classList.add('show');}


