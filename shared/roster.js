/* Roster domain rules shared by browser and Deploy. No I/O. */
var GSISRoster=(()=>{
 const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 function date(s){if(typeof s!=='string'||!/^20\d\d-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Enter a valid date.');return s;}
 function metadata(x){const name=typeof x.name==='string'?x.name.trim():'';if(!name||name.length>160)throw Error('Enter a timetable name of 1 to 160 characters.');const from=date(x.from),to=date(x.to);if(to<from)throw Error('The end date must not precede the start date.');return {name,from,to};}
 // Defaults apply only to a new import, never to a saved timetable without definitions.
 function defaultRecesses(){return Array.from({length:6},(_,i)=>({level:i+1,period:i+3}));}
 function validate(x){
  if(!x||!['single-week','odd-even'].includes(x.layoutMode))throw Error('Unsupported timetable layout.');
  if(Object.prototype.hasOwnProperty.call(x,'importClashes'))throw Error('Resolve imported lesson clashes before saving the timetable.');
  const keys=x.layoutMode==='single-week'?['single']:['odd','even'];let names=null,periods=null;
  const out={layoutMode:x.layoutMode,sourceMode:String(x.sourceMode||'').slice(0,40)};
  for(const key of keys){const w=x[key];if(!w||!Number.isInteger(w.perDay)||w.perDay<1||w.perDay>40||w.maxPeriod!==w.perDay-1||JSON.stringify(w.days)!==JSON.stringify(DAYS)||!Array.isArray(w.blocks)||!w.blocks.length||w.blocks.length>400)throw Error('Check weekdays, period count and teacher rows.');
   const blocks=w.blocks.map(b=>{if(typeof b.name!=='string'||!b.name.trim()||b.name.length>160||!Array.isArray(b.cells)||b.cells.length!==5*w.perDay)throw Error('Incomplete teacher timetable.');return {name:b.name.trim(),cells:b.cells.map(c=>{if(!Array.isArray(c)||c.length!==4||c.some(v=>typeof v!=='string'||v.length>500))throw Error('Each period must contain Subject, Class, Venue and Group.');return c.slice();})};});
   const ns=blocks.map(b=>b.name);if(new Set(ns.map(n=>n.toLowerCase())).size!==ns.length)throw Error('Duplicate teacher names. Correct the source before uploading.');
   if(names&&(JSON.stringify(ns)!==JSON.stringify(names)||periods!==w.perDay))throw Error('Odd and Even weeks must contain matching teachers and periods.');names=ns;periods=w.perDay;out[key]={days:DAYS.slice(),blocks,maxPeriod:w.maxPeriod,perDay:w.perDay};
  }
  const timing={...x.timing,normalLastPeriod:x.timing?.normalLastPeriod??periods-1};if(!Number.isInteger(timing.startMinutes)||timing.startMinutes<0||!Number.isInteger(timing.periodMinutes)||timing.periodMinutes<5||timing.periodMinutes>120||timing.startMinutes+periods*timing.periodMinutes>1440||!Number.isInteger(timing.normalLastPeriod)||timing.normalLastPeriod<0||timing.normalLastPeriod>=periods)throw Error('Enter valid period timing within one day.');
  if(timing.endOfDayMinutes!==undefined&&(!Number.isInteger(timing.endOfDayMinutes)||timing.endOfDayMinutes<=timing.startMinutes||timing.endOfDayMinutes>1440))throw Error('End of day must be after Period 0 starts and within the same day.');
  const recesses=x.recesses===undefined?[]:x.recesses;
  if(!Array.isArray(recesses)||recesses.length>6||recesses.some(r=>!r||!Number.isInteger(r.level)||r.level<1||r.level>6||!Number.isInteger(r.period)||r.period<0||r.period>=periods)||new Set(recesses.map(r=>r.level)).size!==recesses.length)throw Error('Set one valid recess period per level.');
  return {...out,timing:{startMinutes:timing.startMinutes,periodMinutes:timing.periodMinutes,normalLastPeriod:timing.normalLastPeriod,...(timing.endOfDayMinutes!==undefined?{endOfDayMinutes:timing.endOfDayMinutes}:{})},recesses:recesses.map(r=>({level:r.level,period:r.period})).sort((a,b)=>a.level-b.level),teacherCount:names.length,maxPeriod:periods-1};
 }
 // Newest validity start wins; explicit activation changes start to today's date.
 function active(entries,day){date(day);return entries.filter(e=>!e.pruned&&e.from<=day&&e.to>=day).sort((a,b)=>b.from.localeCompare(a.from)||b.priority-a.priority)[0]||null;}
 function currentOrNext(entries,day){const current=active(entries,day);if(current)return {entry:current,selection:'current'};const next=entries.filter(e=>!e.pruned&&e.from>day&&e.to>=e.from).sort((a,b)=>a.from.localeCompare(b.from)||(b.priority||0)-(a.priority||0))[0]||null;return {entry:next,selection:next?'upcoming':null};}
 function weeks(model){return model.layoutMode==='single-week'?[['School week',model.single]]:[['Odd week',model.odd],['Even week',model.even]];}
 function available(week,names,day){if(!names.length||day<0||day>4)return [];const blocks=names.map(n=>week.blocks.find(b=>b.name===n));if(blocks.some(b=>!b))throw Error('Select teachers from this timetable.');return Array.from({length:week.perDay},(_,p)=>p).filter(p=>blocks.every(b=>b.cells[day*week.perDay+p].every(v=>!v.trim())));}
 return {date,metadata,validate,defaultRecesses,active,currentOrNext,weeks,available};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRoster;
