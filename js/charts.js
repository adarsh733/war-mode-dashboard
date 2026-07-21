/* charts.js — Chart.js helpers + buildCharts + monthly aggregations */
/* ── charts ── */
const cssv=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
if(window.Chart){Chart.defaults.font.family="'Plus Jakarta Sans',sans-serif";Chart.defaults.font.size=11;}
const gridc='rgba(0,0,0,0.05)';
function axes(extra={}){return{x:{grid:{color:gridc},ticks:{color:cssv('--muted')}},y:Object.assign({grid:{color:gridc},ticks:{color:cssv('--muted')}},extra)};}
function line(id,labels,series,opt={}){
  if(!window.Chart)return;
  const el=document.getElementById(id);if(!el)return;if(charts[id])charts[id].destroy();
  charts[id]=new Chart(el,{type:'line',data:{labels,datasets:series.map(s=>({label:s.l,data:s.d,borderColor:s.c,backgroundColor:s.c+'1e',borderWidth:2.6,tension:.34,fill:s.fill!==false,pointRadius:3.5,pointBackgroundColor:s.c,spanGaps:true}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:series.length>1,position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:14,color:cssv('--ink2')}},tooltip:{backgroundColor:cssv('--ink'),padding:9,cornerRadius:7}},scales:axes(opt.y||{})}});
}
function bars(id,labels,series,opt={}){
  if(!window.Chart)return;
  const el=document.getElementById(id);if(!el)return;if(charts[id])charts[id].destroy();
  charts[id]=new Chart(el,{type:'bar',data:{labels,datasets:series.map(s=>({label:s.l,data:s.d,backgroundColor:s.c,borderRadius:5,maxBarThickness:opt.thick||40}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:series.length>1,position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',padding:14,color:cssv('--ink2')}},tooltip:{backgroundColor:cssv('--ink'),padding:9,cornerRadius:7,callbacks:opt.pct?{label:c=>c.dataset.label+': '+c.parsed.y+'%'}:{}}},scales:axes(opt.y||{})}});
}
/* ── live monthly aggregation from DB ── */
function monthsInDB(){
  // ordered list of YYYY-MM present in DB (excludes special keys)
  const set=new Set();
  Object.keys(DB).forEach(dt=>{if(/^\d{4}-\d{2}-\d{2}$/.test(dt))set.add(dt.slice(0,7));});
  return [...set].sort();
}
function monthLabel(mk){const[y,m]=mk.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]+" '"+y.slice(2);}
// average of a numeric metric per month (null months => null so the line spans gaps)
function monthlyAvg(metric){
  const mks=monthsInDB();
  return mks.map(mk=>{
    let sum=0,n=0;
    Object.keys(DB).forEach(dt=>{
      if(dt.slice(0,7)!==mk)return;
      const v=DB[dt][metric];
      if(v!=null&&v!==''&&!Number.isNaN(parseFloat(v))){sum+=parseFloat(v);n++;}
    });
    return n?+(sum/n).toFixed(1):null;
  });
}
// last (most recent) logged value of a metric per month — for measurements logged sparsely
function monthlyLast(metric){
  const mks=monthsInDB();
  return mks.map(mk=>{
    const days=Object.keys(DB).filter(dt=>dt.slice(0,7)===mk&&DB[dt][metric]!=null&&DB[dt][metric]!=='').sort();
    return days.length?+parseFloat(DB[days[days.length-1]][metric]).toFixed(1):null;
  });
}
// monthly % compliance for a habit (excludes rest-day-skipped habits from the denominator)
function monthlyCompliance(habitKey,skipOnRest){
  const mks=monthsInDB();
  return mks.map(mk=>{
    let hit=0,tot=0;
    Object.keys(DB).forEach(dt=>{
      if(dt.slice(0,7)!==mk)return;const d=DB[dt];
      if(skipOnRest&&d.rest)return;
      tot++;if(d[habitKey])hit++;
    });
    return tot?Math.round(hit/tot*100):0;
  });
}
// latest logged value of a metric across all DB, and value on/after a start date
function latestVal(metric){
  const days=Object.keys(DB).filter(dt=>/^\d{4}-\d{2}-\d{2}$/.test(dt)&&DB[dt][metric]!=null&&DB[dt][metric]!=='').sort();
  return days.length?parseFloat(DB[days[days.length-1]][metric]):null;
}
function valFromDate(metric,fromDate){
  const days=Object.keys(DB).filter(dt=>/^\d{4}-\d{2}-\d{2}$/.test(dt)&&dt>=fromDate&&DB[dt][metric]!=null&&DB[dt][metric]!=='').sort();
  return days.length?parseFloat(DB[days[0]][metric]):null;
}
// paint the "now vs start" measurement stat cards live
function paintProgressStats(){
  const defs=[['waist','statWaist','green',true],['tummy','statTummy','green',true],['chest','statChest','blue',false],['bicep','statBicep','amber',false]];
  defs.forEach(([k,id,col,lowerGood])=>{
    const card=document.getElementById(id);if(!card)return;
    const now=latestVal(k), start=valFromDate(k,START_DATE);
    const vEl=card.querySelector('.v'), dEl=card.querySelector('.d');
    if(now==null){if(vEl)vEl.innerHTML='—';if(dEl){dEl.textContent='no data';dEl.className='d flat';}return;}
    if(vEl)vEl.innerHTML=now+'<small>″</small>';
    if(start==null||dEl==null){if(dEl){dEl.textContent='—';dEl.className='d flat';}return;}
    const diff=+(now-start).toFixed(1);
    if(diff===0){dEl.textContent='≈ holding from '+start;dEl.className='d flat';}
    else{
      const good=lowerGood?diff<0:diff>0;
      const arrow=diff<0?'▼':'▲';
      dEl.textContent=`${arrow} ${diff>0?'+':''}${diff} from ${start}`;
      dEl.className='d '+(good?'up':'down');
    }
  });
}
function buildCharts(id){
  if(id==='fit-progress'){
    paintProgressStats();
    const mLabels=monthsInDB().map(monthLabel);
    line('cWaist',mLabels,[{l:'Waist',d:monthlyLast('waist'),c:cssv('--green')},{l:'Tummy',d:monthlyLast('tummy'),c:cssv('--violet')}]);
    line('cChest',mLabels,[{l:'Chest',d:monthlyLast('chest'),c:cssv('--blue')},{l:'Bicep',d:monthlyLast('bicep'),c:cssv('--amber')}],{y:{min:13,max:43}});
    line('cWeight',mLabels,[{l:'Weight',d:monthlyAvg('weight'),c:cssv('--blue')}],{y:{min:80,max:88}});
    bars('cProt',mLabels,[{l:'Protein',d:monthlyAvg('proteinAmt'),c:cssv('--accent')}]);
    line('cPuff',mLabels,[{l:'Puffiness',d:monthlyAvg('puffiness'),c:cssv('--amber')}],{y:{min:3,max:10,reverse:true}});
  }
  if(id==='fit-compliance'){
    const mLabels=monthsInDB().map(monthLabel);
    const g=curGoal();
    bars('cComp',mLabels,[
      {l:'Gym',d:monthlyCompliance('gym',true),c:cssv('--green')},
      {l:'Protein '+g.protein+'g',d:monthlyCompliance('protein',false),c:cssv('--violet')},
      {l:'Steps '+(g.steps/1000)+'k',d:monthlyCompliance('steps10k',false),c:cssv('--blue')},
      {l:'Sleep '+g.sleep+'h',d:monthlyCompliance('sleep8',false),c:cssv('--amber')}
    ],{pct:true,thick:22,y:{min:0,max:100,ticks:{callback:v=>v+'%',color:cssv('--muted')}}});
  }
  if(id==='h-thyroid'){
    line('cTSH',['Nov 23','Feb 25','Aug 25','Sep 25','Oct 25','Mar 26','May 26'],[{l:'TSH',d:[9.91,4.32,29.6,28.4,7.81,7.57,4.3],c:cssv('--accent')}],{y:{min:0,max:31}});
    line('cFT4',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'FT4',d:[0.92,1.06,1.21,1.36],c:cssv('--blue')}],{y:{min:0.8,max:1.7}});
    line('cFT3',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'FT3',d:[2.82,2.76,2.89,2.8],c:cssv('--green')}],{y:{min:2,max:4.4}});
  }
  if(id==='h-lipids'){
    line('cHL',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'HDL',d:[31,28,26,29],c:cssv('--green')},{l:'LDL',d:[133,108,136,152],c:cssv('--red')}]);
    bars('cTG',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'Triglycerides',d:[147,119,181,73],c:cssv('--accent')}]);
    line('cTCHDL',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'TC/HDL',d:[5.9,5.4,7.3,6.3],c:cssv('--amber')}],{y:{min:3,max:8}});
  }
  if(id==='h-vitamins'){
    line('cVitD',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'Vitamin D',d:[30.7,52.4,31.3,27.2],c:cssv('--amber')}],{y:{min:20,max:55}});
    line('cB12',['Sep 25','Oct 25','Mar 26','May 26'],[{l:'B12',d:[198,483,319,509],c:cssv('--blue')}]);
  }
}


/* ══════════ TRACKER ENGINE (week grid) ══════════ */
