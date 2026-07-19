/* dates.js — date helpers + week window */
/* date helpers */
function todayStr(){const d=new Date();return iso(d);}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(s,n){const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return iso(d);}
function dowName(s){return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(s+'T00:00:00').getDay()];}
function dayNum(s){return s.split('-')[2];}
function monName(s){return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(s.split('-')[1])-1];}
function fmtDate(s){const[y,m,d]=s.split('-');return parseInt(d)+' '+monName(s)+" '"+y.slice(2);}
function monthKey(s){return s.slice(0,7);}

/* week anchored to Monday */
let weekStart=null;
function mondayOf(s){const d=new Date(s+'T00:00:00');const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);return iso(d);}
function weekDates(){return Array.from({length:7},(_,i)=>addDays(weekStart,i));}

