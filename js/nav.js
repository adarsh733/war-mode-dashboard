/* nav.js — routing, section nav, drawer, global nav bindings

   Nav model (ADR-0022): three TOP-LEVEL TABS — tracker | food | more — but five SECTIONS.
   Fitness and Health are sections without a tab of their own; they live behind the "More"
   landing and light the More tab via SEC_TAB. Keep "section" and "tab" distinct below. */
/* Every key MUST have a matching <section id>. The search below walks these ids and
   calls getElementById(id).textContent — a stale key throws and kills the search. */
const PAGES={
  'fit-home':'fitness','fit-progress':'fitness','fit-compliance':'fitness','fit-plan':'fitness','fit-sleep':'fitness',
  'h-home':'health','h-thyroid':'health','h-lipids':'health','h-vitamins':'health','h-bloodwork':'health',
  't-log':'tracker','t-history':'tracker','t-checkin':'tracker',
  'food-today':'food','food-pantry':'food','food-meals':'food','food-add':'food',
  /* LAST on purpose: search is a first-match-wins walk over these keys, and the More landing
     merely lists the words "Fitness"/"Health" — leading with it would hijack those searches. */
  'more-home':'more'
};
const HOME={more:'more-home',fitness:'fit-home',health:'h-home',tracker:'t-log',food:'food-today'};
/* Tracker & Food are the daily surfaces and get their own tab. Fitness/Health are reference
   material reached through "More", so they light the More tab rather than none. */
const SEC_TAB={more:'more',fitness:'more',health:'more',tracker:'tracker',food:'food'};
let curSec='tracker';
let _lastScrollY=0;        // last scroll position — drives the auto-hiding top bar
const charts={};

/* light the top tab (via SEC_TAB) and show that section's subnav chips */
function paintNav(sec){
  const tab=SEC_TAB[sec]||sec;
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.sec===tab));
  let any=false;
  document.querySelectorAll('.chip-group').forEach(g=>{
    const on=g.dataset.for===sec; g.classList.toggle('show',on); if(on)any=true;
  });
  /* the More landing has no chips — collapse the rail so it isn't a bare 1px seam */
  document.querySelector('.subnav')?.classList.toggle('empty',!any);
}
function setSec(sec){
  curSec=sec;
  paintNav(sec);
  go(HOME[sec]);
}
function go(id){
  const sec=PAGES[id];
  if(sec!==curSec){curSec=sec;}
  paintNav(sec);
  document.body.classList.toggle('food-active', sec==='food');
  /* always reveal the bar on navigation. Seed _lastScrollY with the CURRENT position, not 0:
     the smooth scrollTo below emits events from the old offset, and a 0 baseline would read
     those as "scrolling down" and flash the bar hidden for a frame. */
  document.body.classList.remove('nav-hidden'); _lastScrollY=window.scrollY||0;
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

/* auto-hide the top bar on scroll-down — ALL sections, to free vertical space */
window.addEventListener('scroll', ()=>{
  const y=window.scrollY||document.documentElement.scrollTop||0;
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

