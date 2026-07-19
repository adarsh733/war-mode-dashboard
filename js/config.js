/* config.js — constants: dates, periods, tags, habits, metrics, measures, storage keys, Supabase creds, DB/supa globals, goal helpers */
const START_DATE='2026-01-08';   // War Mode day 1
// Time-versioned goals: each period applies FROM its date until the next period starts.
// A day is always judged by the period active ON that day — changing a goal never alters the past.
const DEFAULT_PERIODS=[{from:'2026-01-08',phase:'Boss 1 & 2A — The Cut',protein:180,cal:2000,sleep:8,steps:10000,water:4}];
let PERIODS=JSON.parse(JSON.stringify(DEFAULT_PERIODS));

// Context tags — purely informational, never affect score. Stored per-day as d.tag (key).
const TAGS=[
  {k:'home',  label:'🏠 Home',  color:'#3d7a4c'},
  {k:'travel',label:'✈️ Travel',color:'#2d597f'},
  {k:'event', label:'🎉 Event/Social',color:'#a3331d'},
  {k:'sick',  label:'🤒 Sick',  color:'#b07914'},
  {k:'vacation',label:'🌴 Vacation',color:'#1f7a6f'},
  {k:'other', label:'📍 Other', color:'#5c564b'}
];
function tagDef(k){return TAGS.find(t=>t.k===k);}

// resolve which goal applied on a given date
function goalOn(dt){
  let g=PERIODS[0];
  for(const p of PERIODS){ if(p.from<=dt) g=p; else break; }
  return g;
}
// the goal in effect TODAY (used for labels in the editor / current week display)
function curGoal(){ return goalOn(todayStr()); }

// HABITS: thresholds & labels are resolved per-day via goalOn(dt)
const HABITS=[
  {k:'thyroid', lbl:g=>'💊 Thyroid', auto:null},
  {k:'water',   lbl:g=>'💧 Water '+g.water+'L', auto:null},
  {k:'protein', lbl:g=>'🥩 Protein '+g.protein+'g', auto:{metric:'proteinAmt',test:(v,g)=>v>=g.protein}},
  {k:'sleep8',  lbl:g=>'😴 Sleep '+g.sleep+'h', auto:{metric:'sleepHrs',test:(v,g)=>v>=g.sleep}},
  {k:'gym',     lbl:g=>'🏋️ Gym', auto:null},
  {k:'cardio',  lbl:g=>'🏃 Cardio 15m', auto:null},
  {k:'steps10k',lbl:g=>'👣 Steps '+(g.steps/1000)+'k', auto:{metric:'steps',test:(v,g)=>v>=g.steps}},
  {k:'omega3',  lbl:g=>'Ω Omega 3', auto:null},
  {k:'under2k', lbl:g=>'🔥 Under '+g.cal, auto:{metric:'calories',test:(v,g)=>v>0&&v<g.cal}}
];
const METRICS=[
  {k:'weight',label:'⚖️ Weight kg',step:'0.1'},
  {k:'proteinAmt',label:'🥩 Protein g',step:'1'},
  {k:'calories',label:'🔥 Calories',step:'1'},
  {k:'sleepHrs',label:'😴 Sleep hrs',step:'0.1'},
  {k:'steps',label:'👣 Steps',step:'1'},
  {k:'puffiness',label:'😶 Puffiness',step:'1'}
];
const MEASURES=[
  {k:'waist',label:'Waist ″',step:'0.1'},
  {k:'tummy',label:'Tummy ″',step:'0.1'},
  {k:'chest',label:'Chest ″',step:'0.1'},
  {k:'bicep',label:'Bicep ″',step:'0.1'}
];
const STORE_KEY='warmode_tracker_v1';
let DB={};

/* ═══════════ DATA ACCESS LAYER — Supabase cloud + offline fallback ═══════════ */
const SUPA_URL='https://sfilvcffrcdcsrimcatz.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmaWx2Y2ZmcmNkY3NyaW1jYXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzg5MjAsImV4cCI6MjA5NTgxNDkyMH0.Zrsa3cpSW_6kRUhjtQgdARfXzuC8eijjhXZzn8z8eK8';
const SEED_VERSION=3;
let supa=null, cloudOK=false;
