/* nav.js — routing, section nav, drawer, global nav bindings */
const PAGES={
  'fit-home':'fitness','fit-progress':'fitness','fit-compliance':'fitness','fit-plan':'fitness','fit-training':'fitness','fit-nutrition':'fitness','fit-sleep':'fitness',
  'h-home':'health','h-thyroid':'health','h-lipids':'health','h-vitamins':'health','h-bloodwork':'health','h-meds':'health','h-actions':'health',
  't-log':'tracker','t-history':'tracker','t-checkin':'tracker',
  'food-today':'food','food-pantry':'food','food-meals':'food','food-add':'food'
};
const HOME={fitness:'fit-home',health:'h-home',tracker:'t-log',food:'food-today'};
let curSec='tracker';
const charts={};

function setSec(sec){
  curSec=sec;
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.sec===sec));
  document.querySelectorAll('.chip-group').forEach(g=>g.classList.toggle('show',g.dataset.for===sec));
  go(HOME[sec]);
}
function go(id){
  const sec=PAGES[id];
  if(sec!==curSec){curSec=sec;
    document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.sec===sec));
    document.querySelectorAll('.chip-group').forEach(g=>g.classList.toggle('show',g.dataset.for===sec));
  }
  document.body.classList.toggle('food-active', sec==='food');
  if(sec!=='food') document.body.classList.remove('nav-hidden');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.p===id));
  document.querySelectorAll('.dlink').forEach(c=>c.classList.toggle('on',c.dataset.p===id));
  window.scrollTo({top:0,behavior:'smooth'});
  closeDrawer();
  buildCharts(id);
  if(id==='t-log')renderWeek();
  if(id==='t-history')renderHistory();
  if(id==='t-checkin')renderCheckin();
  if(id==='food-today'&&typeof renderToday==='function')renderToday();
  if(id==='food-pantry'&&typeof renderPantry==='function')renderPantry();
  if(id==='food-meals'&&typeof renderMeals==='function')renderMeals();
  if(id==='food-add'&&typeof renderAddItem==='function')renderAddItem();
}
document.querySelectorAll('.chip,.dlink,.navcard').forEach(el=>el.addEventListener('click',()=>go(el.dataset.p)));

/* auto-hide the top bar on scroll-down (Food section only) to free vertical space */
let _lastScrollY=0;
window.addEventListener('scroll', ()=>{
  const y=window.scrollY||document.documentElement.scrollTop||0;
  if(typeof curSec==='undefined' || curSec!=='food'){ document.body.classList.remove('nav-hidden'); _lastScrollY=y; return; }
  if(y>_lastScrollY && y>70) document.body.classList.add('nav-hidden');       // scrolling down → hide
  else if(y<_lastScrollY-4) document.body.classList.remove('nav-hidden');     // scrolling up → show
  _lastScrollY=y;
}, {passive:true});

function openDrawer(){document.getElementById('drawer').classList.add('open');document.getElementById('overlay').classList.add('show');}
function closeDrawer(){document.getElementById('drawer').classList.remove('open');document.getElementById('overlay').classList.remove('show');}

/* search */
document.getElementById('search').addEventListener('input',function(){
  const q=this.value.trim().toLowerCase();
  document.querySelectorAll('.searchhit').forEach(e=>e.classList.remove('searchhit'));
  if(q.length<2)return;
  for(const id in PAGES){
    if(document.getElementById(id).textContent.toLowerCase().includes(q)){
      go(id);
      setTimeout(()=>{
        const w=document.createTreeWalker(document.getElementById(id),NodeFilter.SHOW_TEXT);let n;
        while(n=w.nextNode()){if(n.nodeValue.toLowerCase().includes(q)&&n.parentElement){n.parentElement.classList.add('searchhit');n.parentElement.scrollIntoView({behavior:'smooth',block:'center'});break;}}
      },200);
      break;
    }
  }
});

