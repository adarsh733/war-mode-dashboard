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
   material reached through "More", so they light the More tab rather than none.
   KEY ORDER IS SIGNIFICANT: buildSwipeOrder() walks these keys to order sections *within* a tab,
   so 'more' before 'fitness' before 'health' is what puts the More landing ahead of the Fitness
   pages in the swipe chain. Reordering this map reorders the chain. */
const SEC_TAB={more:'more',fitness:'more',health:'more',tracker:'tracker',food:'food'};
let curSec='tracker';
let _lastScrollY=0;        // last scroll position — drives the auto-hiding top bar
let _swipeOrder=null;      // swipe chain, built lazily — see swipeChain() below
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
  const fromId=document.querySelector('.page.active')?.id;   // captured BEFORE we swap
  if(sec!==curSec){curSec=sec;}
  paintNav(sec);
  document.body.classList.toggle('food-active', sec==='food');
  /* always reveal the bar on navigation. Seed _lastScrollY with the CURRENT position, not 0:
     the smooth scrollTo below emits events from the old offset, and a 0 baseline would read
     those as "scrolling down" and flash the bar hidden for a frame. */
  document.body.classList.remove('nav-hidden'); _lastScrollY=window.scrollY||0;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  paintDirection(fromId,id);
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

/* ══════════════════ SWIPE NAVIGATION (ADR-0032) ══════════════════
   Swipe left/right anywhere in the content to move between subtabs. At the last subtab of a tab
   the chain continues into the FIRST subtab of the next tab, so the whole app is one linear
   sequence. Stops at both ends (no wrap). */

/* The subnav chips are the source of truth for "what is a subtab", so derive the chain from the
   DOM rather than hardcoding it — add or remove a chip and this stays correct. Walks the top tabs
   in their rendered order, then each section that maps to that tab via SEC_TAB. */
function buildSwipeOrder(){
  const order=[];
  document.querySelectorAll('.seg button[data-sec]').forEach(btn=>{
    Object.keys(SEC_TAB).filter(sec=>SEC_TAB[sec]===btn.dataset.sec).forEach(sec=>{
      const grp=document.querySelector(`.chip-group[data-for="${sec}"]`);
      const chips=grp?[...grp.querySelectorAll('.chip[data-p]')]:[];
      /* fall back to the section's landing page when it has no chips at all — covers both a
         MISSING chip group ('more') and an empty one, which would otherwise be unreachable */
      if(chips.length) chips.forEach(c=>order.push(c.dataset.p));
      else if(HOME[sec]) order.push(HOME[sec]);
    });
  });
  return order;
}
/* Built lazily and cached. Lazy on purpose: go() calls swipeIndexOf(), and a top-level
   `let SWIPE_ORDER = buildSwipeOrder()` further down this file would sit in the temporal dead
   zone until execution reached it — any future top-level bootstrap calling go() above that line
   would throw. Function declarations hoist, so this is safe from anywhere. */
function swipeChain(){ return _swipeOrder||(_swipeOrder=buildSwipeOrder()); }
function swipeIndexOf(id){ return swipeChain().indexOf(id); }

/* Direction-aware page transition. In practice nearly every navigation is directional, because
   all but the hidden Pantry/Add pages are on the chain — so chip taps, drawer links, nav cards
   and search all slide too. Only off-chain pages fall back to the plain fade. */
function paintDirection(fromId,toId){
  const el=document.getElementById(toId); if(!el) return;
  el.classList.remove('nav-fwd','nav-back');
  const a=swipeIndexOf(fromId), b=swipeIndexOf(toId);
  if(fromId&&fromId!==toId&&a>-1&&b>-1){
    void el.offsetWidth;                                   // reflow so the animation replays
    el.classList.add(b>a?'nav-fwd':'nav-back');
  }
}

/* dir: +1 = forward (swipe left), -1 = back (swipe right) */
function swipeTo(dir){
  const cur=document.querySelector('.page.active')?.id;
  const i=swipeIndexOf(cur);
  if(i===-1) return;                                       // not a subtab (e.g. Pantry) — ignore
  const next=swipeChain()[i+dir];                          // [-1] is undefined, so index 0 can't wrap
  if(!next){ edgeNudge(); return; }                        // end of the chain — signal, don't wrap
  go(next);
}
function edgeNudge(){
  const w=document.querySelector('.wrap'); if(!w) return;
  w.classList.remove('edge-nudge'); void w.offsetWidth; w.classList.add('edge-nudge');
  setTimeout(()=>w.classList.remove('edge-nudge'),220);
}

/* Would this touch be better handled by something else? If so, no navigation.
   Evaluated on touchEND rather than touchstart: the ancestor walk below reads getComputedStyle and
   scrollWidth, which force a synchronous layout, and doing that on every tap would put a reflow on
   the tap path. By touchend we already know the gesture was a real horizontal flick. */
function swipeBlocked(target){
  if(document.querySelector('.fsheet-overlay.show,.fd-overlay.show,#lbViewer.show,.lightbox.show,.drawer.open'))
    return true;                                           // a sheet/modal owns the screen
  for(let el=target; el&&el!==document.body; el=el.parentElement){
    const tag=el.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return true;   // drag = text selection
    /* A horizontally scrollable ancestor always wins — the week grid, bloodwork tables and the
       chip rails must scroll, not flip the page. Detected generically so scrollers added later
       are covered without editing a list.
       The 12px slack matters: per CSS Overflow 3, setting overflow-y makes overflow-x compute to
       `auto` too, so a purely VERTICAL scroller reports as horizontal. Real horizontal scrollers
       overrun by hundreds of px (the open suggestion rail is ~1590 vs ~330), while a vertical one
       only ever does so by a sub-pixel or shadow's worth. */
    const ox=getComputedStyle(el).overflowX;
    if((ox==='auto'||ox==='scroll') && el.scrollWidth>el.clientWidth+12) return true;
  }
  return false;
}

/* Listeners stay PASSIVE and never preventDefault, so vertical scrolling is untouched. That is why
   the transition animates on arrival instead of tracking the finger — finger-tracking needs
   non-passive listeners and risks scroll jank on the long Tracker pages. */
(function initSwipe(){
  const surface=document.querySelector('.wrap'); if(!surface) return;
  let x0=0,y0=0,t0=0,armed=false,startTarget=null;
  surface.addEventListener('touchstart',e=>{
    /* touchstart fires again for each extra finger, so a pinch disarms as the second one lands */
    if(e.touches.length!==1){armed=false;return;}
    const t=e.touches[0];
    x0=t.clientX; y0=t.clientY; t0=Date.now(); startTarget=e.target; armed=true;
  },{passive:true});
  surface.addEventListener('touchend',e=>{
    if(!armed) return; armed=false;
    if(e.changedTouches.length!==1) return;                // pinch / multi-finger — not a swipe
    const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0;
    if(Date.now()-t0>600) return;                          // slow drag, not a flick
    if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.5) return;   // must be clearly horizontal
    if(swipeBlocked(startTarget)) return;                  // something else owns this gesture
    swipeTo(dx<0?1:-1);                                    // drag left → go forward
  },{passive:true});
  /* the OS can steal a gesture (call, notification, back-gesture) — don't leave it armed */
  surface.addEventListener('touchcancel',()=>{armed=false;},{passive:true});
})();

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

