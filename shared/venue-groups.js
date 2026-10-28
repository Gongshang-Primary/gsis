/* Shared class/venue grouping. Empty venues are never a shared identity. */
var GSISVenueGroups=(()=>{
 const subjectRules=()=>typeof GSISWorkload!=='undefined'?GSISWorkload:require('./workload.js');
 // Levels describe the pupils. Weekly periods describe one teaching assignment.
 const levels=g=>[...new Set((Array.isArray(g.levels)?g.levels:[g.level]).map(String))].sort((a,b)=>Number(a)-Number(b));
 const levelLabel=g=>levels(g).map(l=>'P'+l).join(', ');
 const validPeriods=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100&&Number.isInteger(n*2);
 function periods(d,g){
  if(g.weeklyPeriods!==undefined&&g.weeklyPeriods!==null)return validPeriods(g.weeklyPeriods)?g.weeklyPeriods:null;
  if(levels(g).length!==1)return null;
  const n=d.loads?.[levels(g)[0]]?.[g.subject];return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 }
 function workloadFields(d,x,g){
  const selected=x.levels===undefined?levels(g||x):x.levels;
  if(!Array.isArray(selected)||!selected.length||selected.some(l=>typeof l!=='string'||!Object.prototype.hasOwnProperty.call(d.loads||{},l))||new Set(selected).size!==selected.length)throw Error('Choose existing primary levels for this TG.');
  const ls=levels({levels:selected}),weekly=x.weeklyPeriods===undefined?(g?.weeklyPeriods??null):x.weeklyPeriods;
  if(weekly!==null&&!validPeriods(weekly)||ls.length>1&&weekly===null)throw Error('Enter this TG’s actual weekly periods, from 0 to 100 in half-period increments.');
  if(typeof x.subject!=='string'||['FT','TTT','PD','Assembly','FTGP','FTT'].includes(x.subject)||!ls.some(l=>Object.prototype.hasOwnProperty.call(d.loads[l],x.subject)))throw Error('Choose a valid teaching subject.');
  if(x.subject!==g?.subject&&!subjectRules().isGroupSubject(d,x.subject))throw Error('This subject is Class only. Choose a subject that permits teaching groups.');
  return {level:ls[0],levels:ls,weeklyPeriods:weekly};
 }
 const key=c=>String(c.level)+(String(c.shortName).startsWith(String(c.level))?String(c.shortName).slice(String(c.level).length):c.shortName);
 const forms=r=>Array.isArray(r?.forms)?[...new Set(r.forms.filter(Boolean))]:r?.form?[r.form]:[];
 function setForms(r,list){const next=[...new Set(list.filter(Boolean))];if(next.length>1||Array.isArray(r.forms))r.forms=next;r.form=next[0]||'';}
 const room=(d,f)=>d.venues.find(r=>forms(r).includes(f));
 const anchor=(d,g)=>g.levelWide?null:d.classes.find(c=>c.ref===g.anchorRef)||(!g.anchorRef&&g.associationSchema!==1?d.classes.find(c=>key(c)===g.form):null);
 const attached=(d,f)=>d.groups.filter(g=>!g.venue&&anchor(d,g)&&key(anchor(d,g))===f);
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
 // Include blank rows, so a newly added link cannot be silently cleared. Use
 // assignment identity fields: a staged assignment gets its server ID on save.
 function clearState(d){
  for(const k of ['venues','groups','assignments'])if(!Array.isArray(d[k])||d[k].some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Reload this version before clearing venue assignments.');
  const sorted=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {rooms:sorted(d.venues.map(r=>({roomId:r.id,form:r.form||'',forms:Array.isArray(r.forms)?r.forms.slice().sort():null}))),groups:sorted(d.groups.map(g=>({groupId:g.id,venue:g.venue||''}))),assignments:sorted(d.assignments.map(a=>({teacherId:a.teacher,target:a.target,subject:a.subject,venue:a.venue||''})))};
 }
 function clearCounts(d){return {roomLinks:d.venues.reduce((n,r)=>n+new Set([r.form,...(Array.isArray(r.forms)?r.forms:[])].filter(Boolean)).size,0),teachingGroups:d.groups.filter(g=>g.venue).length,teacherAssignments:d.assignments.filter(a=>a.venue).length};}
 function clearVenues(d){
  clearState(d);const counts=clearCounts(d);
  for(const r of d.venues)if(r.form||Array.isArray(r.forms)&&r.forms.length){r.form='';if(Array.isArray(r.forms))r.forms=[];}
  for(const rows of [d.groups,d.assignments])for(const row of rows)if(row.venue)row.venue='';
  return counts;
 }
 const removeState=(d,id)=>canonical({group:d.groups.find(g=>g.id===id)||null,assignments:d.assignments.filter(a=>a.target===id).map(({id,pending,...a})=>a).sort((a,b)=>(a.teacher+'|'+a.subject).localeCompare(b.teacher+'|'+b.subject))});
 const state=(d,x)=>x.operation==='updateTG'&&x.anchorRef?canonical({...removeState(d,x.groupId),attachment:attachment(d,x.anchorRef)}):['updateTG','removeTG'].includes(x.operation)?removeState(d,x.groupId):x.operation==='moveClassBlock'?{venue:room(d,x.form)?.id||'',groups:attached(d,x.form).map(g=>g.id).sort()}:{forms:forms(d.venues.find(r=>r.id===x.from)),groups:d.groups.filter(g=>g.venue===x.from&&!g.levelWide).map(g=>g.id).sort()};
 function attachment(d,ref){const c=d.classes.find(c=>c.ref===ref);return c?{ref:c.ref,level:String(c.level),form:key(c),venue:room(d,key(c))?.id||''}:null;}
 // Class associations use version-owned stable refs. Legacy labels remain visible
 // until an editor explicitly resolves them; reading never drops old evidence.
 function scope(d,g){
  const refs=[],unresolved=[],classes=d.classes||[],level=String(g.level),ls=levels(g),add=c=>{if(c&&ls.includes(String(c.level))&&c.ref){if(!refs.includes(c.ref))refs.push(c.ref);return true;}return false;};
  if(Array.isArray(g.classRefs)){
   for(const ref of g.classRefs)if(!add(classes.find(c=>c.ref===ref)))unresolved.push('Class reference: '+String(ref));
  }else{
   if(g.classRefs!==undefined)unresolved.push('Invalid saved class references');
   const labels=[...new Set([...(Array.isArray(g.sources)?g.sources:g.sources?[g.sources]:[]),...(g.form&&g.form!=='P'+level?[g.form]:[])])];
   if(g.anchorRef&&!add(classes.find(c=>c.ref===g.anchorRef)))unresolved.push('Class reference: '+String(g.anchorRef));
   for(const label of labels){const matches=classes.filter(c=>key(c)===label&&ls.includes(String(c.level)));if(matches.length!==1||!add(matches[0]))unresolved.push('Source class: '+String(label));}
  }
  const levelWide=g.levelWide===true||(!g.levelWide&&!g.anchorRef&&!refs.length&&!unresolved.length&&g.form==='P'+level);
  if(levelWide&&refs.length)unresolved.push('Whole-level scope also contains saved class associations: '+refs.map(ref=>key(classes.find(c=>c.ref===ref))).join(', '));
  return {levelWide,classRefs:refs,unresolved:[...new Set(unresolved)]};
 }
 function scopeFields(d,x,g){
  const ls=levels(x.levels===undefined?(g||x):x),level=ls[0];
  if(typeof x.levelWide!=='boolean'||!Array.isArray(x.classRefs)||x.classRefs.some(ref=>typeof ref!=='string'||!ref)||new Set(x.classRefs).size!==x.classRefs.length)throw Error('Choose a TG scope and valid class selections.');
  if(x.levelWide&&x.classRefs.length||!x.levelWide&&!x.classRefs.length)throw Error('Choose whole level or at least one class, not both.');
  if(x.subject==='CCE EL'&&!x.levelWide)throw Error('CCE EL uses all classes at the selected levels.');
  const classes=x.classRefs.map(ref=>d.classes.find(c=>c.ref===ref));
  if(classes.some(c=>!c||!ls.includes(String(c.level))))throw Error('Choose existing classes at this TG’s selected levels.');
  if(!x.levelWide&&ls.some(l=>!classes.some(c=>String(c.level)===l)))throw Error('Select at least one class at each selected level, or remove that level.');
  if(g&&scope(d,g).unresolved.length&&x.resolveLegacy!==true)throw Error('Review and explicitly replace the unresolved saved class references before saving.');
  const venue=x.venue===undefined?(g?.venue||''):x.venue;
  if(typeof venue!=='string'||venue&&!d.venues.some(r=>r.id===venue))throw Error('Choose a valid venue.');
  const sources=classes.map(key),fields={classRefs:classes.map(c=>c.ref),sources,levelWide:x.levelWide,form:classes.length===1?sources[0]:'P'+level,venue,associationSchema:1};
  // Preserve an existing explicit placement anchor only. New associations never
  // choose a physical anchor or venue on the user's behalf.
  fields.anchorRef=classes.length===1&&g?.anchorRef===classes[0].ref?g.anchorRef:'';
  return fields;
 }
 function context(d,g){const s=scope(d,g),names=s.classRefs.map(ref=>key(d.classes.find(c=>c.ref===ref)));return (s.levelWide?'Whole level · '+levelLabel(g):names.join(', ')||levelLabel(g))+(g.weeklyPeriods!=null?' · '+g.weeklyPeriods+' periods/week':'')+(s.unresolved.length?' · Review saved class references':'');}
 function move(d,x){
  const dest=x.venue?d.venues.find(r=>r.id===x.venue):null;
  if(x.venue&&!dest)throw Error('Choose a valid venue.');
  let fs,gs,old;
  if(x.operation==='moveVenueGroup'){
   old=d.venues.find(r=>r.id===x.from);if(!old)throw Error('Venue no longer exists.');if(old===dest)return;
   fs=forms(old);gs=d.groups.filter(g=>g.venue===old.id&&!g.levelWide);
  }else{
   if(!d.classes.some(c=>key(c)===x.form))throw Error('Class no longer exists.');
   fs=[x.form];old=room(d,x.form);gs=x.operation==='moveClassBlock'?attached(d,x.form):[];
   if(x.operation==='moveClassBlock'&&old)throw Error('This class has moved. Refresh and move its venue group.');
  }
  if(old)setForms(old,forms(old).filter(f=>!fs.includes(f)));
  if(dest)setForms(dest,[...forms(dest),...fs]);
  for(const g of gs){if(!g.anchorRef){const c=d.classes.find(c=>fs.includes(key(c))&&key(c)===g.form)||d.classes.find(c=>key(c)===fs[0]);if(c)g.anchorRef=c.ref;}g.venue=x.venue||'';}
  const targets=[...fs,...gs.map(g=>g.id)];d.assignments.filter(a=>targets.includes(a.target)).forEach(a=>a.venue=x.venue||'');
 }
 function remove(d,id){if(!d.groups.some(g=>g.id===id))throw Error('Teaching group no longer exists.');d.groups=d.groups.filter(g=>g.id!==id);d.assignments=d.assignments.filter(a=>a.target!==id);}
 function update(d,x){
  const g=d.groups.find(g=>g.id===x.groupId);if(!g)throw Error('Teaching group no longer exists.');
  if(typeof x.name!=='string'||!x.name.trim()||x.name.trim().length>60)throw Error('Use a TG name of 1–60 characters.');
  const workload=workloadFields(d,x,g);
  if(typeof x.levelWide!=='boolean')throw Error('Choose a TG scope.');
  if((g.classRefs!==undefined||x.levels!==undefined||x.weeklyPeriods!==undefined)&&x.classRefs===undefined)throw Error('Reload the current frontend before editing this TG’s class selections.');
  const selected=x.classRefs!==undefined?scopeFields(d,x,g):null;
  const link=!x.levelWide&&x.anchorRef?attachment(d,x.anchorRef):null;
  if(!selected&&!x.levelWide&&(g.levelWide||x.anchorRef)&&(!link||link.level!==String(g.level)))throw Error('Choose an existing form class at this TG’s level.');
  if(g.subject!==x.subject&&!['retain','clear'].includes(x.assignments))throw Error('Choose whether to retain or clear this TG’s teaching assignments.');
  if(!(g.subject!==x.subject&&x.assignments==='clear')&&d.assignments.some(a=>a.target===g.id)&&periods(d,{...g,...workload,subject:x.subject})===null)throw Error('This subject is not offered at this level. Enter actual weekly periods, clear assignments or choose another subject.');
  if(g.subject!==x.subject&&x.assignments==='clear')d.assignments=d.assignments.filter(a=>a.target!==g.id);
  const detach=x.levelWide&&!g.levelWide;g.name=x.name.trim();g.subject=x.subject;Object.assign(g,workload);
  if(selected){Object.assign(g,selected);if(!g.anchorRef)delete g.anchorRef;d.assignments.filter(a=>a.target===g.id).forEach(a=>{a.subject=g.subject;a.venue=g.venue;a.level=g.level;});return;}
  if(detach){g.levelWide=true;g.form='P'+g.level;delete g.anchorRef;g.sources=[];g.venue='';}
  if(link){g.levelWide=false;g.anchorRef=link.ref;g.form=link.form;g.sources=[link.form];g.venue=link.venue;}
  d.assignments.filter(a=>a.target===g.id).forEach(a=>{a.subject=g.subject;if(detach||link)a.venue=g.venue;});
 }
 return {key,forms,setForms,room,anchor,attached,state,move,remove,update,scope,scopeFields,context,levels,levelLabel,periods,workloadFields,clearState,clearCounts,clearVenues};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISVenueGroups;
