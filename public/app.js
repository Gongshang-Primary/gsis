/* GSIS_REPORTING_BEGIN */
/* Version-owned staff and reporting relationships. No Contacts writes. */
var GSISReporting=(function(){
 function compact(p){const v=p.profile||{},role=v.Role||p.role||'';return {id:p.id,name:v['Basic Name']||p.basicName||p.name||p.id,role,active:v.Active!=null?v.Active==='Y':p.active===true||p.active==='Y',groups:p.groups||[],mk:!!(p.mk||v['MK Modifier']||(p.groups||[]).includes('MK')||/^MK(?:\b|E)/i.test(role))};}
 function snapshot(d,people){const by=new Map((people||[]).filter(p=>p.id).map(p=>[p.id,compact(p)]));for(const p of d.teachers||[]){const row=compact({...p,profile:{...p.profile,...d.teacherDrafts?.[p.id]}});by.set(p.id,row);}return [...by.values()].filter(p=>p.active&&!p.mk&&!(d.membership||[]).some(r=>r[0]===p.role&&r[11]==='1')).sort((a,b)=>a.id.localeCompare(b.id));}
 function staff(d){const rows=snapshot(d,d.reporting?.staff||[]);return rows.map(p=>{const role=(d.membership||[]).find(r=>r[0]===p.role);return {...p,sl:role?role[2]==='1':p.groups.includes('SL'),oso:p.role==='OSO'};});}
 function value(d,x){return x.operation==='initReporting'?d.reporting||null:d.reporting?.officers?.[x.officer]||'';}
 function assign(d,id,ro){if(!d.reporting)throw Error('Initialize this version’s staff list first.');const people=staff(d),officers=people.filter(p=>!p.sl&&!p.oso),choices=people.filter(p=>!p.oso);if(!officers.some(p=>p.id===id))throw Error('Choose an active officer other than an OSO or SL.');if(typeof ro!=='string'||ro&&!choices.some(p=>p.id===ro))throw Error('Choose an active reporting officer.');if(id===ro)throw Error('An officer cannot report to themselves.');const links={...d.reporting.officers,[id]:ro};let next=ro,seen=new Set([id]);while(next){if(seen.has(next))throw Error('This reporting link would create a cycle.');seen.add(next);next=links[next]||'';}d.reporting.officers=links;}
 return {snapshot,staff,value,assign};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISReporting;

/* GSIS_REPORTING_END */
/* GSIS_TG_SCOPE_BEGIN */
/* CCE EL consolidation is an explicit version edit; published snapshots stay intact. */
var GSISTGScope=(function(){
 const subject='CCE EL';
 const state=d=>({groups:(d.groups||[]).filter(g=>g.subject===subject),assignments:(d.assignments||[]).filter(a=>a.subject===subject),loads:Object.fromEntries(Object.entries(d.loads||{}).map(([l,r])=>[l,r[subject]??null]))});
 function consolidate(d){
  if((d.groups||[]).some(g=>g.subject===subject&&(d.assignments||[]).some(a=>a.target===g.id&&a.subject!==subject)))throw Error('A CCE EL group has another subject assigned. Review that TG before consolidation.');
  // Preserve explicit cross-level TGs and their assignments during legacy consolidation.
  const crossLevel=new Set((d.groups||[]).filter(g=>Array.isArray(g.levels)&&g.levels.length>1).map(g=>g.id));
  const audit=[],removed=new Set(),levels=new Set([...Object.keys(d.loads||{}).filter(l=>d.loads[l][subject]!=null&&!/^n\/a$/i.test(String(d.loads[l][subject]))),...(d.groups||[]).filter(g=>g.subject===subject&&!crossLevel.has(g.id)).map(g=>String(g.level)),...(d.assignments||[]).filter(a=>a.subject===subject&&!crossLevel.has(a.target)).map(a=>String(a.level))]);
  for(const level of levels){const gs=d.groups.filter(g=>g.subject===subject&&!crossLevel.has(g.id)&&String(g.level)===level),chosen=gs.find(g=>g.levelWide)||gs[0];let id=chosen?.id||'cce-el-level-'+level;while(!chosen&&d.groups.some(g=>g.id===id))id+='-new';const target=chosen||{id,name:'P'+level+' CCE EL',subject,level,venue:''};Object.assign(target,{levelWide:true,form:'',anchorRef:'',sources:[],classRefs:[],associationSchema:1});if(!chosen)d.groups.push(target);for(const g of gs)if(g!==chosen)removed.add(g.id);
   const seen=new Set();d.assignments=d.assignments.filter(a=>{if(a.subject!==subject||crossLevel.has(a.target)||String(a.level)!==level)return true;audit.push({...a});if(seen.has(a.teacher))return false;seen.add(a.teacher);a.target=target.id;a.venue=target.venue||'';delete a.targetRef;return true;});
  }
  d.groups=d.groups.filter(g=>!removed.has(g.id));if(!d.cceELScope)d.cceELScope={schema:1,previousAssignments:audit};return d;
 }
 return {state,consolidate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISTGScope;

/* GSIS_TG_SCOPE_END */
/* GSIS_VENUE_GROUPS_BEGIN */
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

/* GSIS_VENUE_GROUPS_END */
/* GSIS_FIELDS_BEGIN */
/* Stable field addresses shared by transport and sheet storage. */
var GSISFields=(function(){
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function flat(value){const out={};function walk(v,path){const key=JSON.stringify(path);if(v===null||typeof v!=='object'){out[key]=JSON.stringify({v:v===undefined?null:v});return;}if(Array.isArray(v)){const used=new Set(),keys=v.map((x,i)=>{let id=x&&typeof x==='object'&&!Array.isArray(x)?x.id||x.ref||x.teacher:x&&Array.isArray(x)&&typeof x[0]==='string'?x[0]:null;if(path[path.length-1]==='venues'&&id==='D1-06B'&&x.name==='Pump Room')id='D1-06B|Pump Room';let k=id?'@'+id:'#'+i;if(used.has(k))throw Error('Duplicate record identity '+JSON.stringify(path)+' '+k);used.add(k);return k;});putOrder(out,path,keys);v.forEach((x,i)=>walk(x,path.concat(keys[i])));}else{const keys=Object.keys(v);if(keys.length>100){out[key]=JSON.stringify({oc:Math.ceil(keys.length/100)});for(let i=0;i<keys.length;i+=100)out[JSON.stringify(path.concat('!keys'+i/100))]=JSON.stringify({v:keys.slice(i,i+100)});}else out[key]=JSON.stringify({o:keys});keys.forEach(k=>walk(v[k],path.concat(k)));}}walk(value,[]);return out;}
 function inflate(fields){function read(path){const key=JSON.stringify(path);if(!own(fields,key))throw Error('Missing field '+key);const n=JSON.parse(fields[key]);if(own(n,'v'))return n.v;if(n.a||n.ac)return order(fields,path,n).map(k=>read(path.concat(k)));const v={};(n.oc?Array.from({length:n.oc},(_,i)=>JSON.parse(fields[JSON.stringify(path.concat('!keys'+i))]).v).flat():n.o||[]).forEach(k=>Object.defineProperty(v,k,{value:read(path.concat(k)),enumerable:true,writable:true,configurable:true}));return v;}return read([]);}
 function order(fields,path,n){n=n||JSON.parse(fields[JSON.stringify(path)]);if(n.a)return n.a;let keys=[];for(let i=0;i<n.ac;i++)keys=keys.concat(JSON.parse(fields[JSON.stringify(path.concat('!order'+i))]).v);return keys;}
 function putOrder(fields,path,keys){if(keys.length<=500){fields[JSON.stringify(path)]=JSON.stringify({a:keys});return;}fields[JSON.stringify(path)]=JSON.stringify({ac:Math.ceil(keys.length/500)});for(let i=0;i<keys.length;i+=500)fields[JSON.stringify(path.concat('!order'+i/500))]=JSON.stringify({v:keys.slice(i,i+500)});}
 function diff(before,after){const a=flat(before),b=flat(after);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]).map(key=>({key,old:own(a,key)?a[key]:null,value:own(b,key)?b[key]:null}));}
 function apply(value,changes){const f=flat(value);changes.forEach(x=>{if(x.value===null)delete f[x.key];else f[x.key]=x.value;});return inflate(f);}
 return {flat,inflate,diff,apply,order,putOrder};
})();

/* GSIS_FIELDS_END */
const CLASS_NAME_PAIRS=[["Perseverance", "P"], ["Thrift", "T"], ["Integrity", "I"], ["Respect", "R"], ["Courage", "C"], ["Harmony", "H"], ["Graciousness", "G"], ["Kindness", "K"], ["Graciousness", "Gc"], ["Gratitude", "Gt"], ["Prudence", "P"], ["Respect", "Rp"], ["Resilience", "Rs"], ["Integrity", "I"], ["Diligence", "D"], ["Empathy", "E"], ["Kindness", "K"]];
/* One teaching-load rule engine, shared by browser and Apps Script. No workload calculation. */
var GSISTeachingRules = (function () {
 'use strict';
 var excludedGroups=['SL','SAT','Support','MK'];
 var nonTeacher=/^(?:SLs?|School Leaders?|AE|AM(?: \(ICT\))?|Counsellor|CSO|DE|Dentist|ICT [AM]|Library|Librarian|Reception(?:ist)?|MK(?:\b.*)?|MKE|OM|OSO|P|VP(?:\b.*)?|Recep|SAT|SC|Sci Lab|SENO|Support(?: Staff)?)$/i;
 function eligible(t){var p=t.profile||{};return p['EO Appt Level']!=='SL'&&!t.mk&&!p['MK Modifier']&&!(t.groups||[]).some(function(g){return excludedGroups.indexOf(g)>=0})&&!nonTeacher.test(String(p.Role||t.role||'').trim())&&!nonTeacher.test(String(p['Employment Modifier']||t.employment||'').trim());}
 // Appointment membership is independent of Acting/Ag and OF. Preserve other catalogue groups.
 function memberships(role,level,groups){
  var result=(groups||[]).slice(),required=/^(SH|Jnr KP)$/.test(String(level||'').trim())&&/^SH(?:\s|$)/i.test(String(role||'').trim())?'SMC':['ST','LT','MTT'].includes(String(level||'').trim())?'TL':null;
  if(required&&!result.includes(required))result.push(required);return result;
 }
 function resolve(t,catalogue,live,draft){
  var out=Object.assign({},t),base={'Basic Name':t.name||'',Role:t.role||'','EO Appt Level':'','Appointment Status':'','Employment Modifier':t.employment||'','Subject Modifier':t.subject||'',Active:t.active?'Y':'N'};
  var legacy={};if(t.role!==undefined)legacy.Role=t.role;if(t.employment!==undefined)legacy['Employment Modifier']=t.employment;if(t.subject!==undefined)legacy['Subject Modifier']=t.subject;if(t.active!==undefined)legacy.Active=t.active===true||t.active==='Y'?'Y':'N';
  var p=Object.assign(base,live&&live.profile||{},legacy,t.profile||{},draft||{}),key=String(p.Role||'').trim().toLowerCase(),rule=(catalogue||[]).find(function(r){return String(r.role||'').trim().toLowerCase()===key});
  // A loaded master catalogue is authoritative, including deliberately blank levels.
  if(Array.isArray(catalogue)){p['EO Appt Level']=rule?String(rule.level||''):'';out.groups=rule?memberships(rule.role,rule.level,rule.groups):[];}
  out.profile=p;out.role=p.Role;out.active=p.Active==='Y';out.mk=t.mk!==undefined?t.mk:live&&live.mk||'';return out;
 }
 function group(role,level){if(level!==undefined&&level!==null){level=String(level).trim();return /^(SH|LH|AYH)$/.test(level)?'Jnr KP':/^(SSD|YH)$/.test(level)?'HOD':level;}role=String(role||'').trim();level='';if(/^(ST|LT|MTT)$/.test(role))return role;if(/^(HOD(?:\b.*)?|SSD|YH)$/.test(role))return 'HOD';if(/^(LH(?:\b.*)?|SH(?:\b.*)?|AYH|Jnr KP)$/.test(role))return 'Jnr KP';return /^(HOD|Jnr KP|ST|LT|MTT)$/.test(level)?level:/^(SH|LH|AYH)$/.test(level)?'Jnr KP':'';}
 function defaults(){return [
 ['HOD','Appointment group','HOD',30,20,'',''],['Jnr KP','Appointment group','Jnr KP',20,0,'',''],
 ['ST','Appointment group','ST',20,0,'',''],['LT','Appointment group','LT',30,'','',''],['MTT','Appointment group','MTT','','','','Rate unknown; configure if appointed.'],
 ['4/5','Employment Modifier','4/5',20,'','',''],['BT','Staff tag','BT',20,'','',''],
 ['UT','Staff tag','UT','','',26,'Weekly cap covers total actual workload, including non-teaching.'],
 ['FAJT','Staff tag','FAJT','','','','No fixed rate.'],['SRE','Staff tag','SRE','','','','No fixed rate.'],
 ['TC','Staff tag','TC',20,'','','it should be 30% but case load in our school is lower']
 ].map(function(a,i){return {id:'rule-'+i,name:a[0],source:a[1],match:a[2],percent:a[3],actingPercent:a[4],periods:a[5],notes:a[6]}});}
 function migrate(old){var cfg=old&&old.schema===2?JSON.parse(JSON.stringify(old)):{schema:2,tags:defaults(),staff:{},baseline:null,legacy:old?JSON.parse(JSON.stringify(old)):null};
  // One-time seed. The marker survives edits and deletion, including an explicit 0%.
  if(!cfg.roleOverrideSchema){if(!cfg.tags.some(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()==='hod sm';}))cfg.tags.push({id:'role-hod-sm',name:'HOD SM',source:'Role',match:'HOD SM',percent:50,actingPercent:'',periods:'',notes:'Replaces the general appointment offload.'});cfg.roleOverrideSchema=1;}return cfg;}
 function tokens(value){return String(value||'').split(/[,;]\s*/).map(function(v){return v.trim()}).filter(Boolean)}
 function calculate(t,catalogue){var cfg=catalogue&&catalogue.schema===2&&catalogue.roleOverrideSchema?catalogue:migrate(catalogue),p=t.profile||{},g=group(p.Role||t.role,p['EO Appt Level']),acting=/^(Ag|Acting)$/i.test(String(p['Appointment Status']||'').trim()),matched=[],pending=[],retained=1,caps=[];
  if(!eligible(t))return {eligible:false,retained:null,offloadPercent:null,cap:null,limit:null,matched:[],pending:[]};
  var explicit=cfg.tags.find(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()===String(p.Role||t.role||'').trim().toLowerCase()&&r.percent!==''&&r.percent!==null&&r.percent!==undefined;});
  cfg.tags.forEach(function(rule){var values=rule.source==='Appointment group'?[g]:rule.source==='Membership'?(t.groups||[]):rule.source==='Staff tag'?[p.Role||t.role,p['EO Appt Level']].concat(tokens(p['Employment Modifier']||t.employment),tokens(p['Subject Modifier']||t.subject),tokens(p['Appointment Status'])):tokens(p[rule.source]||(rule.source==='Role'?t.role:rule.source==='Employment Modifier'?t.employment:rule.source==='Subject Modifier'?t.subject:''));if(rule.source==='Role'?!values.some(function(v){return String(v||'').trim().toLowerCase()===String(rule.match).trim().toLowerCase();}):values.indexOf(rule.match)<0)return;var rate=rule.source==='Appointment group'&&acting?rule.actingPercent:rule.percent;
   if(rule.source==='Appointment group'&&rule.match==='ST'&&acting)rate=0;
   var replaced=rule.source==='Appointment group'&&!!explicit;if(replaced)rate='';
   if(!replaced&&rule.source==='Appointment group'&&acting&&rate==='')pending.push('Acting rate not configured: '+rule.name);
   if(!replaced&&rule.match==='MTT'&&rate==='')pending.push('MTT rate not configured');
   if(rate!==''&&rate!==null&&rate!==undefined)retained*=1-Number(rate)/100;
   if(rule.periods!==''&&rule.periods!==null&&rule.periods!==undefined)caps.push(Number(rule.periods));
   matched.push({id:rule.id,name:rule.name,source:rule.source,match:rule.match,percent:rate,periods:rule.periods,acting:rule.source==='Appointment group'&&acting,replacedBy:replaced?explicit.id:null});
  });
  var cap=caps.length?Math.min.apply(null,caps):null,baseline=cfg.baseline!==''&&cfg.baseline!==null&&cfg.baseline!==undefined?Number(cfg.baseline):null;
  return {eligible:true,retained:retained,offloadPercent:Math.round((1-retained)*1e8)/1e6,cap:cap,capBasis:matched.some(function(r){return r.match==='UT';})?'total':'teaching',limit:pending.length?null:baseline===null?cap:Math.min(baseline*retained,cap===null?Infinity:cap),baselinePending:baseline===null,matched:matched,pending:pending};
 }
 return {memberships:memberships,resolve:resolve,eligible:eligible,group:group,defaults:defaults,migrate:migrate,calculate:calculate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;

const clone=x=>JSON.parse(JSON.stringify(x)), uid=()=>crypto.randomUUID(), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['','#FFFFE0','#FFC0CB','#FCF1AE','#ADD8E6','#90EE90','#D8BFD8'];
let state={versions:[]},current='',tab='IP Deploy',role='',level='',query='',mode='Assignments';
let palEditor=false;
function canEditPAL(){return GSISPAL.canEdit(v(),{roles:role.split('+'),palEditor});}
const v=()=>state.versions.find(x=>x.id===current),kp=()=>role.includes('KP')||role.includes('Admin'),admin=()=>role.includes('Admin');
function loadValue(ver,level,sub){const r=ver.loads[level];if(!r)return null;if(['TTT','PD'].includes(sub))return 0;if(sub==='FT')return ['Assembly','FTGP','FTT'].reduce((n,k)=>n+Number(r[k]||0),0);return r[sub]??null}


function exportFile(name,text,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function button(text,fn,disabled=false){const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=fn;return b}

const options=(items,selected)=>items.map(([id,label])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(label)}</option>`).join('');


function assignmentClass(a){return classList().find(c=>a.targetRef?c.ref===a.targetRef:classKey(c)===a.target);}
function assignmentName(a){const cl=assignmentClass(a);return cl?classLabel(cl):v().groups.find(g=>g.id===a.target)?.name||a.target;}
function orderedAssignments(assignments){
 const pairs=classNameSets().flatMap(set=>set.pairs),classes=classList(),groups=v().groups,byRef=new Map(),byTarget=new Map(),byGroup=new Map(),ranks=new Map();
 classes.forEach((c,i)=>{if(!byRef.has(c.ref))byRef.set(c.ref,c);if(!byTarget.has(classKey(c)))byTarget.set(classKey(c),c);const rank=pairs.findIndex(([name,short])=>classChoiceMatch(c,name,short));ranks.set(c,rank<0?pairs.length+i:rank);});
 groups.forEach((g,i)=>{if(!byGroup.has(g.id))byGroup.set(g.id,{group:g,rank:pairs.length+classes.length+i});});
 return assignments.map(a=>{const cl=a.targetRef?byRef.get(a.targetRef):byTarget.get(a.target),g=byGroup.get(a.target);return {a,level:Number(g?.group.level??cl?.level??a.level),rank:cl?ranks.get(cl):g?.rank??pairs.length+classes.length+groups.length};}).sort((a,b)=>a.level-b.level||a.rank-b.rank).map(row=>row.a);
}
function teachers(root){renderWorkloadSummary(root);}

// Connected service adapter. Explicit class-renaming drafts recover in this browser until saved or discarded.
let unsavedDraft=false;let token='',busy=false,editing=null,leaseTimer=null,pollTimer=null,serverLeases=[];const clientId=crypto.randomUUID();let SEED={layout:[]};
let seenConflictNotices=new Set(),noticeTimer=null;let snapshotCache=null,viewEpoch=0,acceptedSnapshot=null;
const exclusionEdits=new Map();
const exclusionSaving=()=>[...exclusionEdits.values()].some(e=>e.phase==='saving');
let acquiring=false;let sessionEpoch=0,refreshing=false,authWait=null,authInit=false,lastEmail='';
let edgeCommandProtocol=0,edgeCommandClient=null,edgeQueueHealthTimer=null;const edgeAppliedBases=new Map();
let contactsSyncRetry=null; // {versionId,requestId,reason} when a publish left Contacts unsynced.
const el=id=>document.getElementById(id);
function controls(){const signed=!!token,loaded=signed&&!!v();if(!signed){document.getElementById('edge-command-receipts')?.remove?.();document.getElementById('edge-queue-admin-alert')?.remove?.();}if(!(signed&&edgeCommandProtocol===1&&admin())){clearInterval(edgeQueueHealthTimer);edgeQueueHealthTimer=null;}else if(!edgeQueueHealthTimer){const health=()=>{if(token&&admin()&&document.visibilityState!=='hidden')edgeClient()?.checkHealth().catch(()=>{});};health();edgeQueueHealthTimer=setInterval(health,60000);}if(edgeCommandProtocol===1&&signed&&lastEmail)try{const client=edgeClient();client?.update();if(client&&!client.restored){client.restored=true;client.restore().catch(()=>client.update());}}catch(e){el('connection').textContent=e.message;}el('signout').hidden=!signed;el('refresh').hidden=!signed;el('version').hidden=!loaded;el('viewFilters').hidden=!loaded||!['IP Deploy','Ledger','Teachers','Classes','Level Exclusions','Load Settings'].includes(tab);el('nav').hidden=!loaded;el('signin').hidden=signed;}
function expired(){contactCatalogueHash='';readFailures=0;nextReadAt=0;stopLive();token='';sessionEpoch++;clearInterval(pollTimer);clearInterval(leaseTimer);el('status').textContent='Sign-in required';el('connection').textContent='Session expired. Sign in again. Unsaved input is retained; nothing will be resubmitted automatically.';controls();el('retrySignIn').hidden=false;const d=document.querySelector('dialog');if(d.open)d.append(el('signin'),el('retrySignIn'));}
async function requestJSON(url,options={}){const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,options.gsisRead?56000:(!options.method||options.method==='GET'?60000:70000));if(options.signal?.aborted)abort();options.signal?.addEventListener('abort',abort,{once:true});try{const r=await (window.GSISfetch||fetch)(url,{...options,signal:controller.signal,cache:'no-store'});let body;try{body=await r.json()}catch{throw Error(options.gsisRead||!options.method||options.method==='GET'?'Unexpected server response. Use Refresh to retry.':'Unexpected server response. Retry Refresh; do not repeat an uncertain save.')}return {r,body}}catch(e){if(e.name==='AbortError')throw Error(options.gsisRead||!options.method||options.method==='GET'?'Loading timed out. Use Refresh to retry.':'Request timed out. Refresh to check saved state before repeating a save.');throw e}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}}
// User requests show feedback immediately; polling and lease heartbeats stay quiet.
const loadingTargets=new WeakMap();
function beginLoading(target,label,block=true){
 if(!target?.classList||!target?.getBoundingClientRect)return ()=>{};
 const overlay=document.createElement('div');overlay.className='loading-overlay';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 overlay.innerHTML='<span class="loading-label"><span class="spinner" aria-hidden="true"></span>'+esc(label)+'</span>';
 const dialog=document.querySelector('dialog'),host=dialog?.open&&dialog.contains(target)?dialog:document.body;
 const elapsed=document.createElement('span');elapsed.className='loading-elapsed';elapsed.setAttribute('aria-hidden','true');(overlay.querySelector?.('.loading-label')||overlay).append(elapsed);const started=Date.now(),clock=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);elapsed.textContent=seconds>=1?' · '+seconds+'s':''},1000);
 host.append(overlay);let loading=loadingTargets.get(target);if(!loading){loading={count:0,blocks:0,inert:target.inert,busy:target.getAttribute('aria-busy')};loadingTargets.set(target,loading);}loading.count++;if(block)loading.blocks++;target.classList.add('is-loading');target.setAttribute('aria-busy','true');if(loading.blocks)target.inert=true;
 const place=()=>{const r=target.getBoundingClientRect(),left=Math.max(0,r.left),top=Math.max(0,r.top);overlay.style.left=left+'px';overlay.style.top=top+'px';overlay.style.width=Math.max(0,Math.min(innerWidth,r.right)-left)+'px';overlay.style.height=Math.max(32,Math.min(innerHeight,r.bottom)-top)+'px'};
 place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
 let finished=false;return ()=>{if(finished)return;finished=true;clearInterval(clock);overlay.remove();loading.count--;if(block)loading.blocks--;target.inert=loading.blocks?true:loading.inert;if(!loading.count){target.classList.remove('is-loading');if(loading.busy===null)target.removeAttribute('aria-busy');else target.setAttribute('aria-busy',loading.busy);loadingTargets.delete(target);}window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)};
}
let userActionTrace=null;
function beginUserAction(kind){const trace={kind,started:Date.now(),epoch:sessionEpoch,version:current,requests:[],renderMs:0};userActionTrace=trace;return trace;}
function finishUserAction(trace,complete){if(!trace)return;const row={kind:trace.kind,totalMs:Date.now()-trace.started,acknowledgedMs:trace.acknowledgedMs??null,complete:!!complete,requests:trace.requests,renderMs:trace.renderMs};window.gsisPerformance=window.gsisPerformance||[];window.gsisPerformance.push(row);if(window.gsisPerformance.length>30)window.gsisPerformance.shift();console.info('Deploy user action',row);if(userActionTrace===trace)userActionTrace=null;}
async function edgeCommandSend(input){
 const epoch=sessionEpoch,{r,body}=await requestJSON('/api/commands',{method:'POST',headers:{'Content-Type':'application/json',...(token==='session'?{}:{Authorization:'Bearer '+token})},body:JSON.stringify(input)});
 if(epoch!==sessionEpoch)throw Error('Session changed. Sign in before checking the retained command.');if(!r.ok||!body.ok){if(r.status===401)expired();const error=Error(body.error||'Command outcome unavailable. Keep the original request ID.');error.status=body.status||r.status;error.code=body.code;error.queueReceipt=body.data?.queueReceipt;throw error;}return body.data;
}
function edgeClient(){
 if(!window.GSISDeployCommandClient||!lastEmail)return null;
 if(edgeCommandClient?.actor!==lastEmail.toLowerCase())edgeCommandClient=new window.GSISDeployCommandClient.Client({actor:lastEmail,storage:localStorage,send:edgeCommandSend,paint:(rows,client)=>{if(!token||client.actor!==lastEmail.toLowerCase())return;window.GSISDeployCommandClient.panel(document,rows,client,{admin:admin(),refresh:async()=>{if(!unsavedDraft&&!queuedEdits().length&&!busy)await refresh(true);},compare:async receipt=>{const entry=client.rows.find(x=>x.requestId===receipt.requestId),saved=await edgeCommandSend({kind:'projection',versionId:receipt.beforeRevision?.versionId||entry?.payload?.versionId});modal('Review changed version','<p>'+esc(window.GSISDeployCommandClient.asOfLabel(saved))+'</p><p>Review both versions. Your existing draft is retained. A new submission must use a new request ID.</p><h3>Your proposal</h3><pre>'+esc(JSON.stringify(entry?.payload||{},null,2))+'</pre><h3>Current saved version</h3><pre>'+esc(JSON.stringify(saved.data?.current||saved.data,null,2))+'</pre>',()=>{});}});}});
 return edgeCommandClient;
}
async function edgeCommandChange(input){
 const client=edgeClient();if(!client)throw Error('Command recovery is unavailable. Keep this draft.');
 const entry=state.versions.find(x=>x.id===input.versionId),selected=snapshotCache?.id===input.versionId,versionRevision=selected?snapshotCache.revision:entry?.revision,indexRevision=snapshotCache?.globalRevision??acceptedSnapshot?.revision,applied=edgeAppliedBases.get(input.versionId),observed=applied?.versionRevision===versionRevision?applied:entry?.edgeQueueRevision||{versionRevision:entry?.revision,commit:entry?.commit};
 if(!Number.isSafeInteger(indexRevision)||!Number.isSafeInteger(versionRevision)||observed.versionRevision!==versionRevision||typeof observed.commit!=='string')throw Error('Refresh the saved version before submitting this proposal. Your draft is retained.');
 const base={indexRevision,versionId:input.versionId,versionRevision,commit:observed.commit};
 const result=await client.submit({...input,protocol:500,returnDelta:true},base);if(result.queueReceipt?.afterRevision)edgeAppliedBases.set(input.versionId,result.queueReceipt.afterRevision);return result;
}
async function api(action,input={},feedback,signal){
 if(!token)throw Error('Sign in again to continue.');if(edgeCommandProtocol===1&&action==='change'&&window.GSISDeployCommandClient?.actions.includes(input.operation))return edgeCommandChange(input);const requestStarted=Date.now(),epoch=sessionEpoch;
 const show=feedback!==false&&(action==='change'||action==='bootstrap'||action==='publishReview'||action==='lease'&&!input.release&&!editing&&!input.key?.startsWith('load:'));
 const dialog=document.querySelector('dialog'),target=action==='change'&&dialog?.open?dialog.querySelector('form'):el('content');
 const finish=show?beginLoading(target,action==='change'?'Saving…':action==='lease'?'Preparing edit…':'Loading…'):()=>{};
 try{const {r,body}=await requestJSON('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token==='session'?{}:{Authorization:'Bearer '+token})},body:JSON.stringify({...input,...(['sync','bootstrap'].includes(action)?{knownCatalogueHash:contactCatalogueHash}:{}),protocol:500,auditPaged:true,reliefResults:true,returnDelta:action==='change',since:snapshotCache?.revision,authority:role}),signal,gsisRead:['sync','bootstrap','publishReview','auditPage','versionNote','receipt','delta'].includes(action),gsisTotalTimeoutMs:['sync','bootstrap','publishReview'].includes(action)?52000:undefined,gsisTimeoutMs:action==='change'?65000:['sync','bootstrap','publishReview'].includes(action)?50000:28000,gsisOnReadStatus:({attempt})=>{console.debug('Deploy read attempt',{action,attempt});if(attempt>1&&epoch===sessionEpoch&&!v())el('connection').textContent='The school service is taking longer than usual. Retrying the load…';}});
 if(signal?.aborted)throw Error('Request cancelled.');
 if(userActionTrace?.epoch===epoch)userActionTrace.requests.push({action,totalMs:Date.now()-requestStarted,traceId:r.gsisTraceId,responseBytes:typeof Blob==='function'?new Blob([JSON.stringify(body)]).size:JSON.stringify(body).length,backend:body.data?.timing||body.timing,gateway:body.gatewayTiming});
 console.debug('Deploy request trace',{action,traceId:r.gsisTraceId,attempts:r.gsisAttempts||[],gateway:body.gatewayTiming,backend:body.data?.timing||body.timing});if(epoch!==sessionEpoch)throw Error('Session changed. Refresh after signing in.');if(!r.ok||!body.ok){if(body.timing)console.debug('Deploy failed request timing',body.timing);if((body.status||r.status)===403&&['sync','bootstrap','delta','access'].includes(action)){state={versions:[]};current='';snapshotCache=null;el('content').innerHTML='<p>Deploy is available to Admin or KP. <a href="https://gsps-gsis.pages.dev/">Open Contacts</a> to view published deployment.</p>';el('nav').replaceChildren();controls();}if(r.status===401)expired();const e=Error(body.error||'Service unavailable');e.status=body.status||r.status;e.code=body.code;e.diagnosticId=body.diagnosticId||body.gatewayTiming?.diagnosticId;e.diagnostics=(r.gsisDiagnostics||[]).filter(id=>id!==e.diagnosticId);if(e.diagnostics.length)e.message+=' Earlier reference: '+e.diagnostics.join(', ');throw e}if(body.data?.edgeQueueRevision){const q=body.data.edgeQueueRevision,previous=edgeAppliedBases.get(q.versionId);if(!previous||q.versionRevision>=previous.versionRevision)edgeAppliedBases.set(q.versionId,q);} if(body.data?.timing)console.debug('Deploy request timings (ms)',action,body.data.timing);return body.data}
 finally{console.debug('Deploy client request',{action,totalMs:Date.now()-requestStarted});finish()}
}
function acceptSnapshot(data){
 if(!data?.user||!Array.isArray(data.versions))throw Error('Incomplete response; earlier data retained.');
 const responseId=data.currentId||data.current?.id;
 if(acceptedSnapshot?.epoch===sessionEpoch&&acceptedSnapshot.id===responseId&&Number.isFinite(data.revision)&&data.revision<acceptedSnapshot.revision)return false;
 const catalogueProtocol=data.catalogueHash!==undefined||data.catalogueUnchanged!==undefined;
 const catalogueFields=['sysFields','roleCatalogue','staffCatalog'];
 const fullCatalogue=data.sysFields&&typeof data.sysFields==='object'&&!Array.isArray(data.sysFields)&&Object.values(data.sysFields).every(values=>Array.isArray(values)&&values.every(value=>typeof value==='string'))&&Array.isArray(data.roleCatalogue)&&data.roleCatalogue.every(item=>item&&typeof item.role==='string')&&Array.isArray(data.staffCatalog)&&data.staffCatalog.every(item=>item&&typeof item.id==='string'&&item.id);
 const malformedCatalogue=catalogueProtocol&&(!/^[a-f0-9]{64}$/.test(data.catalogueHash||'')||(data.catalogueUnchanged!==undefined&&typeof data.catalogueUnchanged!=='boolean')||(data.catalogueUnchanged?catalogueFields.some(key=>key in data):!fullCatalogue));
 if(malformedCatalogue){contactCatalogueHash='';throw Error('Incomplete staff catalogue; earlier data retained. Use Refresh to load it again.');}
 if(data.catalogueUnchanged&&(!contactCatalogueHash||contactCatalogueHash!==data.catalogueHash||!contactSysFields)){contactCatalogueHash='';throw Error('Staff catalogue is unavailable. Use Refresh to load it again.');}
 if(data.catalogueHash)contactCatalogueHash=data.catalogueHash;
 if(data.sysFields)contactSysFields=data.sysFields;if(data.roleCatalogue)roleCatalogue=data.roleCatalogue;if(data.staffCatalog)staffCatalog=new Map(data.staffCatalog.map(t=>[t.id,t]));const previous=v();let doc=data.current;
 if(data.unchanged){
  if(!previous||!snapshotCache||snapshotCache.id!==data.currentId||snapshotCache.key!==data.cacheKey)throw Error('Cached version unavailable. Refresh to reload.');
  doc=previous;
 }
 if(doc){GSISPlanning.init(doc);if(doc.membership)roleCatalogue=doc.membership.map(r=>({role:r[0],level:r[12],groups:['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'].filter((k,i)=>r[i+2]==='1')}));}if(doc)doc.teachers=(doc.teachers||[]).map(t=>GSISTeachingRules.resolve(t,roleCatalogue.length?roleCatalogue:undefined,staffCatalog.get(t.id),doc.teacherDrafts?.[t.id]));
 const prior=JSON.stringify({version:previous,catalog:state.versions.map(x=>[x.id,x.name,x.status]),leases:serverLeases,role});
 role=data.user.roles.join('+')||'Teacher';palEditor=data.user.palEditor===true;lastEmail=data.user.email;serverLeases=data.leases||[];
 state.versions=data.versions.map(x=>doc&&x.id===doc.id?doc:x);
 snapshotCache=doc&&data.cacheKey?{id:doc.id,key:data.cacheKey,revision:data.versions.find(x=>x.id===doc.id)?.revision,globalRevision:data.revision}:null;
 el('user').textContent=data.user.email.replace(/@gsps\.edu\.sg$/i,'')+' · '+role.split('+').map(r=>r==='KP'?'SMC':r).join('+');
 if(doc){
  current=doc.id;SEED.layout=doc.layout||[];restoreClassDraft();
  const next=JSON.stringify({version:v(),catalog:state.versions.map(x=>[x.id,x.name,x.status]),leases:serverLeases,role});
  if(prior!==next&&!document.activeElement?.matches?.('.load-cell input,.note-editor'))render();
 }else{current='';el('version').innerHTML='';el('nav').innerHTML='';el('tag').textContent='';el('content').innerHTML='<p>No deployment version is available.</p>';if(kp()&&admin())el('content').append(button('Create initial baseline',()=>createVersion(false)))}
 if(Number.isFinite(data.revision))acceptedSnapshot={epoch:sessionEpoch,id:responseId,revision:data.revision};
 lastRefreshedAt=new Date();controls();scheduleSavedNotices();return true;
}
let readFailures=0,nextReadAt=0,lastRefreshedAt=null;
async function refresh(foreground=false,{freshContacts=false}={}){
 if(foreground&&tab==='Audit'&&v()&&!busy&&!cellQueue.length&&!queueFlight){await loadAuditPage(true);return;}
 if(!foreground&&Date.now()<nextReadAt)return;
 if(document.querySelector('.inline-editor')?.open||document.querySelector('.search-select[open]')?.open)return;
 if(noteSaving()||refreshing||queueFlight||cellQueue.length||busy||editing||acquiring||unsavedDraft||exclusionEdits.size||!token)return;
 const actionTrace=foreground&&!userActionTrace?beginUserAction(v()?'refresh':'open'):null;refreshing=true;const finish=foreground===true?beginLoading(el('content'),'Loading…'):()=>{};const epoch=sessionEpoch,view=viewEpoch,requested=current;let applied=false;
 try{
  let data;if(!foreground&&snapshotCache?.id===requested){const delta=await api('delta',{versionId:requested,since:snapshotCache.revision,globalRevision:snapshotCache.globalRevision,authority:role},false);if(epoch!==sessionEpoch||requested!==current||view!==viewEpoch||busy||editing||acquiring||cellQueue.length||unsavedDraft)return;if(!delta.resync){applyFieldDelta(delta);readFailures=0;nextReadAt=0;applied=true;return;}markReliefStale();}data=await api('sync',{versionId:requested,full:!snapshotCache||snapshotCache.id!==requested||!!v()?.reliefResults?.stale,cacheKey:snapshotCache?.id===requested?snapshotCache.key:undefined,freshContacts});
  // A poll started before an edit must never overwrite that edit or its saved result.
  if(epoch!==sessionEpoch||requested!==current||view!==viewEpoch||busy||editing||acquiring)return;
  readFailures=0;nextReadAt=0;applied=acceptSnapshot(data);el('status').textContent='Loaded';el('connection').textContent=connectionText();connectLive();
 }catch(e){if(epoch!==sessionEpoch||view!==viewEpoch)return;readFailures++;nextReadAt=Date.now()+Math.min(60000,8000*2**Math.min(readFailures,3));el('status').textContent=v()?'Refresh failed · last loaded data retained':'Loading failed · use Refresh to retry';el('connection').textContent=e.message+(v()?' Existing data has not been cleared.':' Use Refresh to try again.');controls()}
 finally{finish();refreshing=false;finishUserAction(actionTrace,applied&&!v()?.reliefResults?.stale);if(!applied&&epoch===sessionEpoch&&requested!==current)setTimeout(refresh,0);else if(liveDirty&&!busy&&!editing&&!acquiring&&!unsavedDraft)requestLiveRefresh()}
}
async function acquire(key){
 if(noteSaving()||cellQueue.length||queueFlight||editing||acquiring||busy||exclusionEdits.size)throw Error('Finish the current draft first.');
 viewEpoch++;editing={versionId:current,key,clientId,baseline:JSON.stringify(v()),expectedRevision:snapshotCache?.revision,hash:null};return editing;
}
async function release(){clearInterval(leaseTimer);const old=editing;editing=null;if(old?.token)try{await api('lease',{...old,release:true})}catch{} }
function forgetLease(){clearInterval(leaseTimer);leaseTimer=null;editing=null}
async function change(operation,args={}){
 if(busy)throw Error('A save is already in progress.');
 if(!editing)throw Error('No editing lease. Close the form and try again.');
 const dialog=document.querySelector('dialog'),buttons=dialog.open?[...dialog.querySelectorAll('footer button')].map(b=>[b,b.disabled]):[];buttons.forEach(([b])=>b.disabled=true);
 const beforeRevision=snapshotCache?.revision;busy=true;viewEpoch++;el('status').textContent='Saving…';let result;
 try{
  if(editing.expectedRevision===undefined&&!editing.token)throw Error('Refresh this version before saving.');
  const requested=JSON.stringify({operation,args});if(editing.attempt&&editing.attempt!==requested)throw Error('A prior save is unconfirmed. Retry the same values, or cancel and refresh before making a different edit.');editing.attempt=requested;editing.requestId=args.requestId||editing.requestId||crypto.randomUUID();const {baseline,attempt,...lease}=editing;
  result=await api('change',{...lease,operation,...args,requestId:editing.requestId});
  if(!result?.saved&&!result?.duplicate)throw Error('Save was not confirmed. Refresh before trying again.');
 }catch(e){el('status').textContent='Save not confirmed — draft retained';throw e}
 finally{busy=false;buttons.forEach(([b,disabled])=>b.disabled=disabled)}
 // The backend releases this lease as part of the confirmed commit.
 forgetLease();unsavedDraft=false;viewEpoch++;if(operation==='publish'){const contacts=result.contactsSync;if(!contactsSyncConfirmed(contacts))contactsSyncRetry={versionId:result.versionId,publicationCommit:contacts?.publicationCommit,requestId:crypto.randomUUID(),reason:contacts?.reason||'Contacts sync not confirmed',layoutHandoff:result.layoutHandoff};else contactsSyncRetry=null;el('status').textContent=publishStatusText(result);}else el('status').textContent='Saved';
 if(operation==='purge')auditState=null;
 if(result.snapshot){
  try{acceptSnapshot(result.snapshot);el('connection').textContent=connectionText();connectLive()}
  catch(e){snapshotCache=null;el('status').textContent='Saved · refresh needed';el('connection').textContent=e.message+' Your save was confirmed; use Refresh to reload.'}
 }else{try{if(result.protocol===500&&Number.isInteger(beforeRevision)&&!['delete','publish','acceptContacts','refreshVenueRegistry'].includes(operation)){const delta=result.delta||await api('delta',{versionId:current,since:beforeRevision,authority:role},false);if(delta.resync){markReliefStale();await refresh(true);}else applyFieldDelta(delta);}else await refresh(true)}catch(e){snapshotCache=null;el('status').textContent='Saved · refresh needed';el('connection').textContent='Your save is confirmed. Use Refresh to reload.';}}
 if(operation==='publish')el('status').textContent=publishStatusText(result);
}
function contactsSyncConfirmed(contacts){return ['updated','duplicate','unchanged'].includes(contacts?.status);}
function publishStatusText(result){
 const contacts=result.contactsSync;
 let text=contactsSyncConfirmed(contacts)?'Published; Contacts updated':'Published; Contacts not updated: '+(contacts?.reason||'sync not confirmed');
 if(result.layoutHandoff&&result.layoutHandoff.status!=='complete')text+='; '+(result.layoutHandoff.message||'Layout transfer pending');
 return text;
}
async function retryContactsSync(){
 if(!contactsSyncRetry||!admin()||busy||editing||acquiring||unsavedDraft||exclusionEdits.size||notesUnresolved()||cellQueue.length||queueFlight||versionCreateAttempt||inlineDraftEditor?.open)return;
 const attempt=contactsSyncRetry,epoch=sessionEpoch,email=lastEmail;
 if(!attempt.publicationCommit){el('status').textContent='Refresh and republish to confirm the Contacts sync identity.';return;}
 const valid=()=>epoch===sessionEpoch&&email===lastEmail&&contactsSyncRetry===attempt;
 busy=true;viewEpoch++;el('status').textContent='Retrying Contacts sync…';
 try{
  const result=await api('change',{operation:'retryContactsSync',versionId:attempt.versionId,publicationCommit:attempt.publicationCommit,requestId:attempt.requestId});
  if(!valid())return;
  const contacts=result.contactsSync;
  if(result.versionId!==attempt.versionId||contacts?.publicationCommit!==attempt.publicationCommit||!contactsSyncConfirmed(contacts)){
   attempt.reason=contacts?.reason||'Contacts sync not confirmed for this publication';el('status').textContent=publishStatusText({...result,contactsSync:{status:'failed',reason:attempt.reason},layoutHandoff:result.layoutHandoff||attempt.layoutHandoff});el('connection').textContent='Retry Contacts sync from the version row after reviewing the result.';
  }else{contactsSyncRetry=null;el('status').textContent=publishStatusText({...result,layoutHandoff:result.layoutHandoff||attempt.layoutHandoff});el('connection').textContent=connectionText();}
 }catch(e){if(valid()){attempt.reason=e.message;el('status').textContent=publishStatusText({contactsSync:{status:'failed',reason:e.message},layoutHandoff:attempt.layoutHandoff});el('connection').textContent='Contacts sync is unconfirmed. Retry uses the same publication.';}}
 finally{busy=false;if(epoch===sessionEpoch&&email===lastEmail){controls();if(['IP Deploy','Versions'].includes(tab))render();}}
}

async function action(operation,args={},key='meta'){if(editing||acquiring||busy||exclusionEdits.size){alert('Finish the current edit first.');return}try{await acquire(key);await change(operation,args)}catch(e){alert(e.message);await release();await refresh()}}
function save(){} // All online writes go through change(); class-renaming drafts recover locally.
// In-page selectors use loaded data. The native select holds the validated value only.
let inlineDraftEditor=null,lastEditorAnchor=null;
document.addEventListener('click',e=>{const b=e.target.closest?.('button');if(b&&!b.closest('.inline-editor,.search-select'))lastEditorAnchor=b},true);
const ipCellAnchor=window.GSISIPCellAnchor?.({
 context:()=>current+'|'+tab,
 identify:control=>{
  if(tab!=='IP Deploy')return null;const cell=control.closest('td'),row=cell?.closest('tr'),target=control.dataset.venueTarget||row?.dataset.row;if(!target)return null;
  const group=v().groups.find(g=>g.id===target),c=classInfo(target);return {id:target,ref:c?.ref||'',tg:!!group,column:cell.classList.contains('row-name')?'row-name':cell.dataset.cell?.slice(cell.dataset.cell.lastIndexOf('|')+1)||'venue'};
 },
 locate:key=>{
  if(tab!=='IP Deploy')return null;const target=key.tg?key.id:key.ref?classList().find(c=>c.ref===key.ref):key.id,id=typeof target==='object'?classKey(target):target;if(!id)return null;
  const rows=[...el('content').querySelectorAll('tbody tr[data-row]')],row=rows.find(r=>r.dataset.row===id);if(!row)return null;
  if(key.column==='row-name')return row.querySelector('.row-name');
  if(key.column!=='venue')return [...row.querySelectorAll('[data-cell]')].find(c=>c.dataset.cell===id+'|'+key.column);
  const i=rows.indexOf(row);for(let j=i;j>=0;j--){const venue=rows[j].querySelector('td.venue');if(venue&&j+venue.rowSpan>i)return venue;}return null;
 }
});
function enhanceSelects(root=document){
 root.querySelectorAll('select:not([data-native])').forEach(select=>{
  if(select.dataset.noEnhance==='true')return;
  if(select._searchPicker){select._searchPicker.sync();return}
  const label=select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent?.trim()||'Choose';
  const wrap=document.createElement('details');wrap.className='search-select';
  const summary=document.createElement('summary'),input=document.createElement('input'),list=document.createElement('div'),status=document.createElement('small');
  const id='choices-'+uid();input.type='search';input.placeholder='Type to filter…';input.setAttribute('aria-label','Search '+label);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  list.id=id;list.className='select-choices';list.setAttribute('role','listbox');list.setAttribute('aria-label',label);status.className='select-count';status.setAttribute('role','status');
  const panel=document.createElement('div');panel.className='select-panel';panel.append(input,list,status);wrap.append(summary,panel);select.after(wrap);select.classList.add('select-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  let shown=[],active=-1;
  const highlight=i=>{active=i;[...list.children].forEach((b,j)=>b.classList.toggle('keyboard-choice',j===i));if(i>=0){input.setAttribute('aria-activedescendant',list.children[i].id);list.children[i].scrollIntoView?.({block:'nearest'})}else input.removeAttribute('aria-activedescendant')};
  const draw=()=>{if(typeof document==='undefined'||!select.isConnected)return;
   const words=input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
   shown=[...select.options].filter(o=>!o.disabled&&(!o.parentElement?.disabled)&&words.every(q=>o.textContent.toLocaleLowerCase().includes(q)));list.replaceChildren();
   for(const [i,o] of shown.entries()){
    const b=document.createElement('button');b.type='button';b.id=id+'-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',String(o.selected));b.textContent=o.textContent;
    b.onclick=()=>{if(select.disabled)return;if(select.multiple)o.selected=!o.selected;else select.value=o.value;const ipAnchor=select._ipAnchor||ipCellAnchor?.capture(select);const attrs=[...select.attributes].filter(a=>a.name.startsWith('data-')||a.name==='id'||a.name==='aria-label').map(a=>[a.name,a.value]);select.dispatchEvent(new Event('change',{bubbles:true}));if(ipAnchor)ipCellAnchor.restore(ipAnchor);else requestAnimationFrame(()=>{const next=[...document.querySelectorAll('select')].find(n=>attrs.every(([k,v])=>n.getAttribute(k)===v));const control=next?._searchPicker?.summary||next?.closest('.search-select')?.querySelector('summary')||next;if(control){control.closest('details')?.removeAttribute('open');control.scrollIntoView?.({block:'center',inline:'center'});control.focus({preventScroll:true});}});if(wrap.isConnected){sync();if(!select.multiple){wrap.open=false;summary.focus({preventScroll:true})}}};list.append(b);
   }
   status.textContent=shown.length?shown.length+' choices':'No matches';highlight(-1);
  };
  const sync=()=>{wrap.hidden=select.hidden;summary.textContent=select.dataset.selectedUnit==='true'?(select.value||'Unassigned'):select.multiple?([...select.selectedOptions].map(o=>o.textContent).join(', ')||'Choose tags…'):select.selectedOptions[0]?.textContent||'Choose…';summary.setAttribute('aria-label',label+': '+summary.textContent);summary.setAttribute('aria-disabled',String(select.disabled));summary.tabIndex=select.disabled?-1:0;input.disabled=select.disabled;if(select.disabled)wrap.open=false;draw()};
  select._searchPicker={sync,wrap,input,summary};
  summary.onclick=e=>{if(select.disabled)e.preventDefault();else if(!wrap.open)select._ipAnchor=ipCellAnchor?.capture(select)};
  wrap.addEventListener('toggle',()=>{if(!wrap.isConnected)return;viewEpoch++;input.setAttribute('aria-expanded',String(wrap.open));if(wrap.open){document.querySelectorAll('.search-select[open]').forEach(other=>{if(other!==wrap)other.open=false});input.value='';draw();input.focus()}expandPickerColumn(wrap,wrap.open)});
  input.oninput=draw;input.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(shown.length)highlight((active+(e.key==='ArrowDown'?1:shown.length-1)+shown.length)%shown.length)}else if(e.key==='Enter'){e.preventDefault();if(shown.length)list.children[active<0?0:active].click()}else if(e.key==='Escape'&&wrap.open){e.preventDefault();e.stopPropagation();wrap.open=false;summary.focus()}};
  select.addEventListener('change',sync);new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','selected','label']});sync();
 });
}
function expandPickerColumn(wrap,open){const cell=wrap.closest('td,th'),table=cell?.closest('table');if(!cell||!table)return;window.GSISTableRefresh?.();const index=Number(cell.dataset.gridColumn??cell.cellIndex),col=table.querySelector('colgroup')?.children[index];if(!col)return;
 if(open&&!wrap._columnRestore){const width=parseFloat(col.style.width)||cell.getBoundingClientRect().width,newWidth=Math.max(width,Math.min(340,innerWidth-32)),oldTableWidth=table.style.width,affected=[...table.querySelectorAll('td,th')].filter(c=>Number(c.dataset.gridColumn??c.cellIndex)===index),oldCells=affected.map(c=>[c,c.style.width,c.style.maxWidth]);wrap._columnRestore=()=>{col.style.width=width+'px';table.style.width=oldTableWidth;oldCells.forEach(([c,w,m])=>{c.style.width=w;c.style.maxWidth=m});wrap._columnRestore=null;window.GSISTableRefresh?.()};col.style.width=newWidth+'px';affected.forEach(c=>{c.style.width=newWidth+'px';c.style.maxWidth=newWidth+'px'});table.style.width=(table.getBoundingClientRect().width+newWidth-width)+'px';}
 if(!open)wrap._columnRestore?.();window.GSISTableRefresh?.();}
function selectionEditor(title,body,submit,leaseKey,host){
 if(!token||!(kp()||admin()))throw Error('Planning access is required.');
 if(inlineDraftEditor?.open){inlineDraftEditor.querySelector('input:not(.select-source)')?.focus();throw Error('Apply or cancel the open selection first.')}
 if(teacherInputError())throw Error('Correct the teacher name before opening another edit.');
 if(queueFlight||busy)throw Error('Finish the pending save first.');
 const d=document.createElement('section');d.className='inline-editor';d.setAttribute('aria-label',title);d.open=true;inlineDraftEditor=d;viewEpoch++;unsavedDraft=false;
 d.innerHTML='<form><h3>'+esc(title)+'</h3>'+body+'<p id="formerror" role="alert"></p><footer><button type="button" data-cancel>Cancel</button><button type="submit" id="ok" class="primary">Apply to draft</button></footer></form>';
 let submitting=false;
 const inputs=[...d.querySelectorAll('input,select,textarea')],values=()=>JSON.stringify(inputs.map(i=>i.type==='checkbox'||i.type==='radio'?i.checked:i.value)),initial=values();
 d.isDirty=()=>values()!==initial;const dirty=()=>{unsavedDraft=d.isDirty();};d.addEventListener('input',dirty);d.addEventListener('change',dirty);
 const opener=document.activeElement;
 const anchor=lastEditorAnchor?.isConnected&&el('content').contains(lastEditorAnchor)?lastEditorAnchor:null;
 const cell=anchor?.closest('td');if(host)host.append(d);else if(cell)cell.append(d);else{const toolbar=el('content').querySelector('.tools');if(toolbar)toolbar.after(d);else el('content').prepend(d)}
 d.close=({redraw=true,focus=true}={})=>{if(!d.open)return;d.open=false;inlineDraftEditor=null;unsavedDraft=false;viewEpoch++;d.remove();if(d.returnTab)tab=d.returnTab;if(editing)release().then(()=>{if(typeof document!=='undefined')refresh()});if(redraw)render();if(focus){const target=opener?.isConnected?opener:el('nav').querySelector('[data-tab="'+tab+'"]');target?.focus({preventScroll:true});}if(!queuedEdits().length&&liveDirty)requestLiveRefresh()};
 d.requestLeave=(options={})=>{if(submitting||busy||acquiring||editing)return false;if(d.isDirty()&&!confirm('Discard changes in this form and leave? Choose Cancel to stay.'))return false;d.close({redraw:false,focus:false,...options});return true;};
 d.querySelector('[data-cancel]').onclick=()=>{if(!submitting)d.close()};
 d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(submitting)return;const ok=d.querySelector('#ok');submitting=true;ok.disabled=true;try{await submit(d);d.close()}catch(error){d.querySelector('#formerror').textContent=error.message}finally{submitting=false;ok.disabled=false}};
 d.onkeydown=e=>{if(e.key==='Escape'&&!submitting){e.preventDefault();d.close()}};
 enhanceSelects(d);const picks=[...d.querySelectorAll('select')].filter(select=>select._searchPicker);if(picks.length===1){picks[0]._searchPicker.wrap.open=true;picks[0]._searchPicker.input.focus()}else d.querySelector('input:not(.select-source),select[data-native],summary')?.focus({preventScroll:true});
 if(leaseKey)prepareDialogLease(d,leaseKey);
 return d;
}

function modal(title,body,submit,leaseKey){const d=document.querySelector('dialog');d.innerHTML='<form method="dialog"><h2>'+esc(title)+'</h2>'+body+'<p id="formerror" role="alert"></p><footer><button value="cancel">Cancel</button><button type="button" id="ok" class="primary">Save</button></footer></form>';d.querySelector('#ok').onclick=async()=>{const ok=d.querySelector('#ok');ok.disabled=true;try{await submit(d);d.close()}catch(e){d.querySelector('#formerror').textContent=e.message}finally{ok.disabled=false}};d.oncancel=e=>{if(busy)e.preventDefault()};d.onclose=()=>{if(queuedEdits().length)render();if(editing)release().then(()=>{if(typeof document!=='undefined')refresh()});else if(liveDirty)requestLiveRefresh()};d.showModal();enhanceSelects(d);if(leaseKey)prepareDialogLease(d,leaseKey);else if(/Assign |Add teaching|Move TG|Unassign TG/.test(title))d.querySelector('#ok').textContent='Apply to draft'}
async function prepareDialogLease(d,key){const ok=d.querySelector('#ok');ok.disabled=true;ok.textContent='Preparing…';try{await acquire(key);if(!d.open){await release();await refresh();return}ok.disabled=false;ok.textContent='Save'}catch(e){if(d.open){d.querySelector('#formerror').textContent=e.message;ok.textContent='Save unavailable'}else await refresh()}}
function commit(actionName,before){if(actionName==='Remove assignment')action('removeTeacher',{venue:before.venue,subject:before.subject,assignmentId:before.id},'cell:'+before.target+':'+before.subject)}
let versionCreateAttempt=null;
async function createVersion(duplicate=false){
 if(notesUnresolved()||cellQueue.length||queueFlight||busy||editing||acquiring||unsavedDraft||exclusionEdits.size)return;
 if(!versionCreateAttempt){const name=prompt(duplicate?'Name for duplicate version':'New planning version name',duplicate?v().name+' (copy)':'');if(!name)return;versionCreateAttempt={operation:'create',name,sourceVersionId:current||undefined,duplicate:duplicate===true,requestId:crypto.randomUUID()};}
 busy=true;viewEpoch++;
 try{const data=await api('change',versionCreateAttempt);if(!data.versionId)throw Error('Creation was not confirmed.');current=data.versionId;versionCreateAttempt=null;busy=false;await refresh(true)}
 catch(e){if([400,403,404,409].includes(e.status))versionCreateAttempt=null;alert(e.message+(versionCreateAttempt?' Creation is unconfirmed. Click New planning version or Duplicate again to retry the same request.':''));}
 finally{busy=false}
}

/* GSIS_VERSION_ROWS_BEGIN */
function publicationText(row){return (row.publication||'Unpublished')+(row.publishedRevision!=null?' · '+(row.publication==='Published'?'':'Published ')+'r'+row.publishedRevision+' in force':'');}
/* Row-owned version controls and note drafts, independent of the planning queue. */
const versionNoteDrafts=new Map();
function noteSaving(){return [...versionNoteDrafts.values()].some(d=>d.saving);}
function notesUnresolved(){return [...versionNoteDrafts.values()].some(d=>d.saving||d.attempt||d.value!==d.expected);}
function versionNoteDraft(row){
 let d=versionNoteDrafts.get(row.id);
 if(!d){d={value:row.notes||'',expected:row.notes||'',status:'',saving:false,attempt:null};versionNoteDrafts.set(row.id,d);}
 else if(!d.saving&&!d.attempt&&d.value===d.expected&&d.expected!==(row.notes||'')){d.value=d.expected=row.notes||'';d.status='';}
 return d;
}
function updateVersionNoteControls(id){
 const row=[...document.querySelectorAll('[data-version-row]')].find(r=>r.dataset.versionRow===id),d=versionNoteDrafts.get(id);if(!row||!d)return;
 row.querySelector('[data-note-status]').textContent=d.status;const stored=state.versions.find(x=>x.id===id),status=row.querySelector('[data-publication-status]');if(stored&&status)status.textContent=publicationText(stored);if(stored&&id===current)el('tag').textContent=publicationText(stored);
 row.querySelector('[data-note-input]').readOnly=!(admin()||kp())||d.saving||!!d.attempt;
 const save=row.querySelector('[data-note-save]');save.textContent=d.attempt?'Retry save':'Save note';save.disabled=!(admin()||kp())||d.saving||(!d.attempt&&d.value===d.expected);
 row.querySelector('[data-note-review]').hidden=!d.conflict;
}
async function saveVersionNote(id){
 const row=state.versions.find(x=>x.id===id);if(!row||!(admin()||kp()))return;
 const d=versionNoteDraft(row);if(d.saving||noteSaving())return;
 if(queueFlight||busy||editing||acquiring||refreshing){alert('Wait for the current request or close the open edit first.');return;}
 if(!d.attempt&&d.value===d.expected)return;
 d.attempt=d.attempt||{versionId:id,operation:'saveVersionNote',notes:d.value,expected:d.expected,requestId:crypto.randomUUID(),issuedAt:Date.now(),clientId};
 d.saving=true;d.conflict=false;d.status='Saving…';viewEpoch++;updateVersionNoteControls(id);
 const attempt=d.attempt;
 try{
  const result=await api('change',attempt);if(!result.saved||result.versionId!==id||result.requestId!==attempt.requestId)throw Error('Save confirmation unavailable. Retry to confirm.');
  d.expected=attempt.notes;d.attempt=null;d.status='Saved';
  const entry=state.versions.find(x=>x.id===id);if(entry){entry.notes=attempt.notes;if(result.publication)Object.assign(entry,{publication:result.publication,publishedRevision:result.publishedRevision});}
  if(draftBase?.id===id)draftBase.notes=attempt.notes;
  // Keep the existing delta cursor, so unrelated remote changes are still fetched.
 }catch(e){
  d.status=e.message+' Your note is retained.';
  if(e.status>=400&&e.status<500){d.attempt=null;d.conflict=e.status===409;}
 }finally{d.saving=false;updateVersionNoteControls(id);}
}
async function reviewVersionNote(id){
 const d=versionNoteDrafts.get(id);if(!d||d.saving||d.attempt)return;
 d.saving=true;updateVersionNoteControls(id);
 try{const data=await api('versionNote',{versionId:id});if(data.versionId!==id)throw Error('This version is no longer available.');
  const latest=data.notes||'';
  if(confirm('Latest saved note:\n\n'+(latest||'(blank)')+'\n\nKeep your draft and use this as the comparison for your next Save note?')){d.expected=latest;d.conflict=false;d.status='Latest note reviewed. Your draft is retained.';const entry=state.versions.find(x=>x.id===id);if(entry)entry.notes=latest;if(draftBase?.id===id)draftBase.notes=latest;}
 }catch(e){d.status=e.message+' Your note is retained.';}finally{d.saving=false;updateVersionNoteControls(id);}
}
let versionLoad=null;
async function loadVersionRow(id){
 const restoreSelector=()=>{el('version').value=versionLoad?.id||current;};
 if(inlineDraftEditor?.open&&!inlineDraftEditor.requestLeave({redraw:true})){restoreSelector();return false;}
 if(versionCreateAttempt){restoreSelector();alert('Resolve the pending version creation first. Use New planning version or Duplicate to retry the same request.');return false;}
 if(cellQueue.length||queueFlight||unsavedDraft||editing||acquiring||(busy&&!versionLoad)||exclusionEdits.size||notesUnresolved()){restoreSelector();alert('Save or cancel the current edits, including version notes, first.');return false;}
 // Only reads can supersede another version read; pending writes/drafts stay guarded above.
 versionLoad?.controller.abort();versionLoad?.finish();document.querySelector('.version-load-error')?.remove();
 busy=true;viewEpoch++;stopLive();
 const name=state.versions.find(row=>row.id===id)?.name||id,focus=document.activeElement,finishLoading=beginLoading(el('content'),'Loading version: '+name+'…');
 const blocked=[el('nav'),el('viewFilters'),el('viewActions')].filter(Boolean).map(node=>({node,inert:node.inert}));blocked.forEach(({node})=>{node.inert=true;});
 const request={id,focus,epoch:sessionEpoch,view:viewEpoch,controller:new AbortController(),finish:()=>{finishLoading();blocked.forEach(({node,inert})=>{node.inert=inert;});}};versionLoad=request;el('version').value=id;
 const isCurrent=()=>versionLoad===request&&request.epoch===sessionEpoch&&request.view===viewEpoch;
 try{
  const data=await api('sync',{versionId:id,full:true},false,request.controller.signal);
  if(!isCurrent())return false;
  if(data.current?.id!==id)throw Error('This version is no longer available. Refresh the list.');
  acceptSnapshot(data);return current===id;
 }catch(e){
  if(isCurrent()){
   const error=document.createElement('div');error.className='version-load-error';error.setAttribute('role','alert');
   error.append(document.createTextNode('Could not load '+name+'. '+e.message+(current?' The displayed version is unchanged. ':' ')),button('Retry '+name,()=>loadVersionRow(id)));
   el('content').before(error);
  }
  return false;
 }finally{
  if(versionLoad===request){request.finish();versionLoad=null;busy=false;el('version').value=current;controls();if(request.epoch===sessionEpoch){if(document.activeElement===document.body)(request.focus?.isConnected&&request.focus!==document.body?request.focus:el('version')).focus({preventScroll:true});connectLive();}}
 }
}
async function versionRowAction(id,actionName){
 if(!(await loadVersionRow(id)))return;
 if(actionName==='publish'){await reviewTeacherPublication();return;}
 if(actionName==='delete'){if(admin()&&v().status!=='active'&&confirm('Delete “'+v().name+'” and its audit history?')){await action('delete');if(!state.versions.some(x=>x.id===id))versionNoteDrafts.delete(id);}return;}
 if(actionName==='rename'&&(admin()||kp())){
  const row=v();modal('Version details','<label>Name<input id="name" value="'+esc(row.name)+'"></label><label>From<input type="date" id="from" value="'+esc(row.from||'')+'"></label><label>To<input type="date" id="to" value="'+esc(row.to||'')+'"></label>',d=>{if(current!==id)throw Error('Version selection changed. Reopen this row.');return change('metadata',{name:d.querySelector('#name').value,from:d.querySelector('#from').value,to:d.querySelector('#to').value});},'meta');
 }
}
function versions(root){
 root.innerHTML='<p>New planning versions inherit class/TG venues and settings from the selected version. Duplicate retains its teacher assignments and notes too. Save note saves only that row’s note. Unpublished versions can be edited by Admin or KP. Published identifies the snapshot currently shown in Contacts. Saving edits leaves that snapshot unchanged. Admin Publish updates it.</p>';
 root.append(button('New planning version',()=>createVersion(false),!(kp()||admin())),button('Duplicate',()=>createVersion(true),!(kp()||admin())));
 root.append(button('Refresh venue metadata',()=>action('refreshVenueRegistry'),!(kp()||admin())));
 root.append(button('Review current Contacts',async()=>{if(busy||editing||acquiring||exclusionEdits.size||noteSaving())return;busy=true;try{const data=await api('bootstrap',{versionId:current,reviewContacts:true});busy=false;const changes=data.contactChanges||[];modal('Contacts review','<p>Current Contacts is the authority. Accepting updates the staff snapshot and keeps your Teachers proposals; it does not change Contacts.</p><pre style="white-space:pre-wrap">'+esc(changes.length?changes.join('\n'):'No staff differences.')+'</pre>',async()=>{await acquire('meta');await change('acceptContacts')});}catch(e){alert(e.message);}finally{busy=false;}},!admin()));
 root.insertAdjacentHTML('beforeend',table(['Version','Status','Actions','Notes'],state.versions.map(x=>{
  const d=versionNoteDraft(x);return '<tr data-version-row="'+esc(x.id)+'"><td>'+esc(x.name)+(x.id===current?' <small>Selected</small>':'')+'</td><td data-publication-status>'+esc(publicationText(x))+'</td><td><div class="version-row-actions"><button data-version-action="load" '+(x.id===current?'disabled':'')+'>Load</button><button data-version-action="rename" '+(!(kp()||admin())?'disabled':'')+'>Rename / dates</button><button data-version-action="delete" '+(!admin()||x.status==='active'?'disabled':'')+'>Delete</button><button data-version-action="publish" '+(!admin()?'disabled':'')+'>Publish</button><button data-version-action="retryContacts" '+(admin()&&contactsSyncRetry?.versionId===x.id?'':'hidden')+'>Retry Contacts sync</button></div></td><td><textarea data-note-input class="version-note full-cell-note" rows="3" maxlength="4000" aria-label="Note for '+esc(x.name)+'" '+(!(kp()||admin())||d.saving||d.attempt?'readonly':'')+'>'+esc(d.value)+'</textarea><div class="version-note-controls"><button data-note-save '+(!(kp()||admin())||d.saving||!d.attempt&&d.value===d.expected?'disabled':'')+'>'+(d.attempt?'Retry save':'Save note')+'</button><span data-note-status role="status" aria-live="polite">'+esc(d.status)+'</span><button data-note-review '+(!d.conflict?'hidden':'')+'>Review saved note</button></div></td></tr>';
 })));
 root.querySelectorAll('[data-version-row]').forEach(row=>{const id=row.dataset.versionRow,d=versionNoteDrafts.get(id);row.querySelector('[data-note-input]').oninput=e=>{d.value=e.target.value;d.status=d.value===d.expected?'':'Unsaved note';updateVersionNoteControls(id);};row.querySelector('[data-note-save]').onclick=()=>saveVersionNote(id);row.querySelector('[data-note-review]').onclick=()=>reviewVersionNote(id);row.querySelectorAll('[data-version-action]').forEach(b=>b.onclick=()=>b.dataset.versionAction==='load'?loadVersionRow(id):b.dataset.versionAction==='retryContacts'?retryContactsSync():versionRowAction(id,b.dataset.versionAction));});
}

/* GSIS_VERSION_ROWS_END */
let auditState=null;
const auditSGTFormatter=new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function auditSingaporeTime(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?auditSGTFormatter.format(date):String(value||'Unavailable');}
function audit(root){
 if(!admin()){auditState=null;root.textContent='Audit is available to Admin only.';return;}
 const id=current,entry=auditState?.versionId===id&&auditState.sessionEpoch===sessionEpoch?auditState:null;
 root.append(button('Refresh audit',()=>loadAuditPage(true),!!entry?.loading),button('Purge entire log for this version',()=>{if(admin()&&confirm('Permanently purge this version’s audit log?'))action('purge')}));
 root.insertAdjacentHTML('beforeend','<p role="status">'+esc(entry?.loading?'Loading audit…':entry?.error||entry?.loaded?entry?.error||('Showing '+entry.events.length+' of '+entry.total+' events'):'Loading audit…')+'</p>');
 root.insertAdjacentHTML('beforeend',table(['Time (SGT)','Actor','Action','Details'],(entry?.events||[]).map(a=>'<tr><td data-sort-value="'+esc(a.at)+'"><time datetime="'+esc(a.at)+'">'+esc(auditSingaporeTime(a.at))+'</time></td><td>'+esc(String(a.actor).replace(/@gsps\.edu\.sg$/i,''))+'</td><td>'+esc(a.action)+'</td><td><details data-audit-id="'+esc(a.id)+'"><summary>Before / after</summary><pre>Open to load details</pre></details></td></tr>')));root.querySelector('table').dataset.noSort='true';
 root.querySelectorAll('[data-audit-id]').forEach(node=>node.ontoggle=async()=>{
  if(!node.open||node.dataset.loaded)return;node.dataset.loaded='loading';
  const a=entry.events.find(x=>x.id===node.dataset.auditId),pre=node.querySelector('pre');pre.textContent='Loading…';
  try{
   if(a.detailText===undefined){
    if(!a.detailRequest)a.detailRequest=api('auditPage',{versionId:id,detailId:a.id,row:a.row,epoch:a.epoch},false).then(result=>{a.detailText=JSON.stringify({before:result.event.before,after:result.event.after},null,2);}).finally(()=>{delete a.detailRequest;});
    await a.detailRequest;
   }
   if(id!==current||entry!==auditState||entry.sessionEpoch!==sessionEpoch||!admin())return;
   pre.textContent=a.detailText;node.dataset.loaded='true';
  }catch(e){if(id!==current||entry!==auditState||entry.sessionEpoch!==sessionEpoch||!admin())return;pre.textContent=e.message+' Close and reopen to retry.';delete node.dataset.loaded;}
 });
 if(entry?.cursor)root.append(button('Load older events',()=>loadAuditPage(false),!!entry.loading));
 if(!entry)queueMicrotask(()=>{if(tab==='Audit'&&current===id)loadAuditPage(true)});
}
async function loadAuditPage(reset=false){
 if(!admin()||!token||!current)return;const id=current,epoch=sessionEpoch;
 const prior=auditState?.versionId===id&&auditState.sessionEpoch===epoch?auditState:null;if(prior?.loading)return;
 auditState={versionId:id,sessionEpoch:epoch,events:prior?.events||[],cursor:prior?.cursor||null,loaded:!!prior?.loaded,loading:true,total:prior?.total||0};const state=auditState;
 if(tab==='Audit')render();
 try{const data=await api('auditPage',{versionId:id,cursor:reset?null:state.cursor},false);if(epoch!==sessionEpoch||id!==current||auditState!==state||!admin())return;Object.assign(state,{events:reset?data.events:state.events.concat(data.events),cursor:data.cursor,total:data.total,loaded:true,error:''});}
 catch(e){state.error=e.message+' Use Refresh audit to retry.';}
 finally{state.loading=false;if(epoch===sessionEpoch&&id===current&&auditState===state&&tab==='Audit')render();}
}

document.querySelector('#version').onchange=e=>loadVersionRow(e.target.value);document.querySelector('#levels').onchange=e=>{if(unsavedDraft||exclusionEdits.size)return;level=e.target.value;if(state.versions.length)render()};document.querySelector('#search').oninput=e=>{if(unsavedDraft||exclusionEdits.size)return;query=e.target.value;if(state.versions.length)render()};document.querySelector('#refresh').onclick=()=>{if(inlineDraftEditor?.open&&!inlineDraftEditor.requestLeave({redraw:true}))return;if(cellQueue.length||queueFlight){resolveQueue();return}if(exclusionSaving()||busy||acquiring){alert('Wait for the current request to finish.');return}if((unsavedDraft||exclusionEdits.size)&&!confirm('Discard unconfirmed input and reload saved values?'))return;unsavedDraft=false;exclusionEdits.clear();refresh(true)};el('signout').onclick=async()=>{if(notesUnresolved()||cellQueue.length||queueFlight||versionCreateAttempt){alert('Resolve pending notes, saves or version creation before signing out.');return}if(busy||acquiring||exclusionSaving()){alert('Wait for the current request to finish.');return}if((unsavedDraft||editing||exclusionEdits.size)&&!confirm('Discard unsaved input and sign out?'))return;try{const result=await requestJSON('/api/logout',{method:'POST'});if(!result.r.ok)throw Error('Sign-out failed. Retry.')}catch(e){el('connection').textContent=e.message;return}stopLive();sessionEpoch++;token='';if(inlineDraftEditor){inlineDraftEditor.open=false;inlineDraftEditor=null;}clearInterval(pollTimer);clearInterval(leaseTimer);editing=null;unsavedDraft=false;busy=false;contactsSyncRetry=null;state={versions:[]};snapshotCache=null;acceptedSnapshot=null;contactCatalogueHash='';staffCatalog=new Map();roleCatalogue=[];contactSysFields=null;if(typeof invalidatePendingProjection==='function')invalidatePendingProjection();roleTruthCache=null;roleTruthAttempt=null;versionNoteDrafts.clear();exclusionEdits.clear();viewEpoch++;current='';role='';lastEmail='';el('content').innerHTML='';el('nav').innerHTML='';el('version').innerHTML='';el('tag').textContent='';el('user').textContent='';document.querySelector('dialog').close();el('status').textContent='Signed out';el('connection').textContent='Sign in to load deployment data.';window.google?.accounts?.id.disableAutoSelect();controls();startSignIn()};
function beginDeploySession(email){
 if(typeof email!=='string'||!email)throw Error('The signed-in account could not be confirmed.');
 if(lastEmail&&email!==lastEmail){
  if(notesUnresolved()||queuedEdits().length||unsavedDraft||editing||acquiring||busy||exclusionEdits.size||versionCreateAttempt||inlineDraftEditor?.open)throw Error('Use the same account to recover this draft.');
  edgeCommandClient=null;edgeAppliedBases.clear();document.getElementById('edge-command-receipts')?.remove?.();document.getElementById('edge-queue-admin-alert')?.remove?.();
  stopLive();clearTimeout(noticeTimer);contactsSyncRetry=null;state={versions:[]};current='';role='';snapshotCache=null;acceptedSnapshot=null;serverLeases=[];draftBase=null;invalidatePendingProjection();staffCatalog=new Map();roleCatalogue=[];contactSysFields=null;roleTruthCache=null;roleTruthAttempt=null;versionNoteDrafts.clear();exclusionEdits.clear();seenConflictNotices.clear();readFailures=0;nextReadAt=0;viewEpoch++;
  for(const id of ['content','nav','version','tag','user'])el(id).replaceChildren();document.querySelector('dialog').close();
 }
 token='session';lastEmail=email;contactCatalogueHash='';sessionEpoch++;
}
async function startSignIn(){if(authInit)return;authInit=true;el('retrySignIn').hidden=true;el('signin').hidden=false;try{const [{r,body:config},existing]=await Promise.all([requestJSON('/api/config'),requestJSON('/api/session')]);if(!r.ok||!config.configured||!config.clientId)throw Error('Deploy connection is not configured. Check the Pages environment settings.');edgeCommandProtocol=config.edgeCommandProtocol===1?1:0;liveConfigured=!!config.liveConfigured;if(existing.r.ok&&existing.body.ok){const email=existing.body.data.user.email;if((notesUnresolved()||queuedEdits().length||unsavedDraft)&&lastEmail&&email!==lastEmail)throw Error('Use the same account to recover this draft.');beginDeploySession(email);el('connection').textContent='Restoring your session and loading deployment…';await refresh(true,{freshContacts:false});clearInterval(pollTimer);pollTimer=null;controls();return}await new Promise((resolve,reject)=>{const deadline=Date.now()+12000;authWait=setInterval(()=>{if(window.google?.accounts?.id){clearInterval(authWait);resolve()}else if(Date.now()>deadline){clearInterval(authWait);reject(Error('Google sign-in did not load. Check your connection or browser blocking, then Retry sign-in.'))}},100)});google.accounts.id.initialize({client_id:config.clientId,hd:'gsps.edu.sg',callback:async credential=>{if(!credential?.credential)return;let email='';try{email=JSON.parse(atob(credential.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).email||''}catch{}if((notesUnresolved()||editing||unsavedDraft||exclusionEdits.size||cellQueue.length||queueFlight)&&lastEmail&&email!==lastEmail){el('connection').textContent='Use the same account to recover this draft, or cancel the edit first.';return}let session;try{session=await requestJSON('/api/session',{method:'POST',headers:{Authorization:'Bearer '+credential.credential}});if(!session.r.ok||!session.body.ok)throw Error(session.body.error||'Could not retain sign-in');}catch(e){el('connection').textContent=e.message;return}try{beginDeploySession(session.body.data?.user?.email);}catch(e){el('connection').textContent=e.message;return;}controls();el('retrySignIn').hidden=true;el('status').textContent='Loading…';await refresh(true,{freshContacts:false});clearInterval(pollTimer);pollTimer=null;if(editing||unsavedDraft)el('connection').textContent='Signed in. Draft retained. Close and reopen the edit if its lock has expired.'}});el('signin').replaceChildren();google.accounts.id.renderButton(el('signin'),{theme:'outline',size:'large'});}catch(e){el('status').textContent='Sign-in unavailable';el('connection').textContent=e.message;el('retrySignIn').hidden=false}finally{authInit=false}}
el('retrySignIn').onclick=()=>{if(!window.google?.accounts?.id){const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;document.head.append(script)}startSignIn()};
document.querySelector('dialog').addEventListener('close',()=>{const row=el('identityRow');row.append(el('signin'),el('retrySignIn'));controls()});
window.addEventListener('beforeunload',e=>{if(notesUnresolved()||busy||unsavedDraft||exclusionEdits.size){e.preventDefault();e.returnValue=''}});
window.addEventListener('online',()=>{if(token)el('connection').textContent='Connection available. Use Refresh or retry your pending Save.'});
const subjectOrder=['FT','EL','LSP','FEL','RRP','SDR','Math','LSM','FMA','MTL','CCE','HMTL','MTSP','FMTL','Science','FSC','SS','PHE','Art','Music','PAL','CCE EL'];
const languageFamilies={MTL:['CL','ML','TL'],HMTL:['HCL','HML','HTL'],FMTL:['FCL','FML','FTL']};
const subjectLabel=s=>s==='Sci'?'Science':s==='TTT'?'PD':s;
const family=s=>Object.keys(languageFamilies).find(k=>languageFamilies[k].includes(s))||subjectLabel(s);
function abilityBadge(value){return ['HA','MA','LA'].includes(value)?'<span class="ability-badge '+value+'" title="'+({HA:'High ability',MA:'Mixed ability',LA:'Low ability'}[value])+'">'+value+'</span>':''}
const natural=(a,b)=>String(a??'').localeCompare(String(b??''),undefined,{numeric:true,sensitivity:'base'});
const sorts={};
const settingsSections={'Program Settings':['Classes','Venues','PAL','Load Settings','Subject Type','Fortnight Split','Dept Settings','Committee Settings','CCA Settings','PLT Settings','Events Settings'],'HR Settings':['Span of Control','Teachers','Level Exclusions','Membership','Offload','HR Terms']},lastSettingsPage={};
function navLabel(t){return {'Level Exclusions':'Exclusions','Load Settings':'Subject Load','Dept Settings':'Dept','Committee Settings':'Committee','CCA Settings':'CCA','PLT Settings':'PLT','Events Settings':'Events'}[t]||t;}
const alignedProgramPages=new Set(['Load Settings','Dept Settings','Committee Settings','CCA Settings','PLT Settings','Events Settings']);
function alignProgramCell(cell){
 const input=cell.querySelector('input:not([type="checkbox"]):not([type="radio"]),select,textarea');
 const text=String(input?.tagName==='SELECT'?input.selectedOptions[0]?.textContent||'':input?.value??cell.textContent).replace(/[↕▴▾]/g,'').trim();
 cell.dataset.valueAlign=/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)?'number':'text';
}
function alignProgramCells(root){if(alignedProgramPages.has(tab)){root.querySelectorAll('table th,table td').forEach(alignProgramCell);if(['PLT Settings','Events Settings'].includes(tab))root.querySelectorAll('table').forEach(t=>t.dataset.exportTitle=navLabel(tab));}}
for(const event of ['input','change'])document.addEventListener(event,e=>{const cell=e.target.closest?.('#content th,#content td');if(cell&&alignedProgramPages.has(tab))alignProgramCell(cell);});
let workloadReturnTab='Workload';
function selectDeployTab(next){if(inlineDraftEditor?.open){if(tab===next)return;if(!inlineDraftEditor.requestLeave())return;}if(unsavedDraft||editing||acquiring||busy||exclusionEdits.size){alert('Finish the current edit first.');return;}if(next==='Workload Settings')workloadReturnTab=tab;tab=next;render();}
function renderDeployNavigation(){
 const privileged=kp()||admin(),allowed=t=>t==='Venues'?admin():privileged||!['Span of Control','Teachers','Level Exclusions','Membership','HR Terms','Offload','Dept Settings','Committee Settings','CCA Settings','PLT Settings','Events Settings'].includes(t);
 const parent=Object.keys(settingsSections).find(k=>settingsSections[k].includes(tab));if(parent)lastSettingsPage[parent]=tab;
 const nav=el('nav');nav.replaceChildren();
 const groups=[['IP Deploy','Dept','Committees','CCAs','PLT','Events','Duty'],['Workload','Stats','Ledger','Duty Cards','Classes & TGs','Layout'],['Program Settings',...(privileged?['Relief Settings']:[]),...(privileged?['HR Settings','Workload Settings','Versions']:[])],...(privileged?[['ASC Export']]:[]),...(admin()?[['Audit']]:[])];
 groups.forEach((items,index)=>{const group=document.createElement('span');group.className='nav-group'+(index===2?' nav-settings':'');if(index){const divider=document.createElement('span');divider.className='nav-divider';divider.textContent='|';divider.setAttribute('aria-hidden','true');group.append(divider);}for(const t of items){const section=settingsSections[t],b=button(t,()=>{selectDeployTab(section?(lastSettingsPage[t]||section.find(allowed)):t)});if(section){b.dataset.section=t;b.classList.toggle('selected',parent===t);b.setAttribute('aria-expanded',String(parent===t));b.setAttribute('aria-controls','settingsSubnav');}else if(t==='Workload Settings'){b.dataset.action='workload-settings';b.dataset.tab=t;b.classList.toggle('selected',tab===t);}else{b.dataset.tab=t;b.classList.toggle('selected',tab===t);}group.append(b);}nav.append(group);});
 let sub=el('settingsSubnav');if(!sub){sub=document.createElement('nav');sub.id='settingsSubnav';nav.after(sub);}sub.replaceChildren();sub.hidden=!parent;sub.setAttribute('aria-label',parent||'Settings sub-pages');
 if(parent)for(const t of settingsSections[parent].filter(allowed)){const b=button(navLabel(t),()=>selectDeployTab(t));b.dataset.tab=t;b.classList.toggle('selected',tab===t);if(tab===t)b.setAttribute('aria-current','page');sub.append(b);}
}
function compareClass(a,b){return natural(a,b)}
const isLegacySubject=s=>/^Pull\/(?:F?Sci|FSC)$/i.test(s);
function subjects(){const keys=[...new Set(Object.values(v().loads).flatMap(Object.keys))].filter(s=>!['FT','Assembly','FTGP','FTT','TTT','PD'].includes(s)&&(!isLegacySubject(s)||v().assignments.some(a=>a.subject===s)||v().groups.some(g=>g.subject===s)));return keys.sort((a,b)=>{const ia=subjectOrder.indexOf(family(a)),ib=subjectOrder.indexOf(family(b));return (ia<0?999:ia)-(ib<0?999:ib)||natural(a,b)})}
function matrixSubjects(){return [...subjectOrder,...subjects().map(family).filter(s=>!subjectOrder.includes(s))].filter((s,i,a)=>a.indexOf(s)===i)}
function table(headers,rows){return '<div class="scroll"><table><thead><tr>'+headers.map(x=>'<th scope="col">'+esc(subjectLabel(x))+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'}
function wireSort(root,callback){root.querySelectorAll('table:not([data-no-sort])').forEach(table=>table.querySelectorAll('thead th').forEach((th,index)=>{const label=th.textContent,sort=sorts[tab];th.innerHTML='';const b=button(label+(sort?.index===index?(sort.desc?' ▾':' ▴'):' ↕'),()=>{sorts[tab]={index,desc:sort?.index===index?!sort.desc:false};if(callback)callback();else render()});b.className='sort-button';b.title='Sort by '+label;th.setAttribute('aria-sort',sort?.index===index?(sort.desc?'descending':'ascending'):'none');th.append(b)}))}
function cellSortValue(c){const input=c?.querySelector('input,select,textarea');if(input?.tagName==='SELECT')return input.selectedOptions[0]?.textContent||'';return input?.type==='checkbox'?Number(input.checked):input?.value??c?.dataset.sortValue??c?.textContent??''}
function sortedRows(root){const sort=sorts[tab];if(!sort)return;root.querySelectorAll('table:not([data-no-sort])').forEach(t=>{const body=t.tBodies[0];[...body.rows].sort((a,b)=>{const inactive=tab==='Teachers'?Number(a.classList.contains('inactive'))-Number(b.classList.contains('inactive')):0;if(inactive)return inactive;const av=cellSortValue(a.cells[sort.index]),bv=cellSortValue(b.cells[sort.index]);return natural(av,bv)*(sort.desc?-1:1)}).forEach(r=>body.append(r))})}
const panelScroll=new Map();
function render(patch=false){const renderStarted=Date.now();
 const prior=el('content'),priorView=prior?.dataset.view;if(prior?.dataset.view)panelScroll.set(prior.dataset.view,[...prior.querySelectorAll('.scroll,.unassigned-pane')].map(x=>[x.scrollLeft,x.scrollTop]));
 if(!v()||inlineDraftEditor?.open)return;el('search').placeholder='Search this view';window.setGSISViewport?.('deploy');applyPendingProjection();const ver=v(),scrollX=window.scrollX||0,scrollY=window.scrollY||0;
 const ipView=tab==='IP Deploy'&&priorView===tab?ipCellAnchor?.captureView?.(prior):null;
 if(role==='Teacher'&&ver.status!=='active')return;
 if(!patch)el('version').innerHTML=options(state.versions.filter(x=>role!=='Teacher'||x.status==='active').map(x=>[x.id,x.name+' · '+(x.publication||'Unpublished')]),current);
 el('levels').innerHTML='<option value="">All levels</option>'+options(Object.keys(v().loads).map(x=>[x,'P'+x]),level);
 el('tag').textContent=publicationText(v());if(!patch)el('nav').innerHTML='';
 if(!(kp()||admin())&&['Span of Control','HR Terms','Teachers','Membership','Offload','Level Exclusions','ASC Export','Workload Settings','Dept Settings','Committee Settings','CCA Settings','PLT Settings','Events Settings'].includes(tab))tab='IP Deploy';
 if(['Audit','Venues'].includes(tab)&&!admin())tab='IP Deploy';
 if(!patch)renderDeployNavigation();
 el('manageVersions')?.remove();

 if(['Span of Control','HR Terms','Teachers','Membership','Offload','Level Exclusions'].includes(tab)&&!(kp()||admin()))tab='IP Deploy';
 if(['Audit','Venues'].includes(tab)&&!admin())tab='IP Deploy';
 const root=patch?document.createElement('main'):el('content');root.dataset.view=tab;if(!patch)root.innerHTML='';
 if(tab==='Span of Control')reportingPage(root);if(tab==='IP Deploy')matrix(root);if(tab==='Stats')renderWorkloadStats(root);if(tab==='Ledger')teachers(root);if(tab==='Workload')renderWorkload(root);if(tab==='Workload Settings')workloadSettings(root);if(tab==='Relief Settings')renderReliefSettings(root);if(tab==='PAL')renderPAL(root);if(tab==='HR Terms')masterOptionsPage(root);if(tab==='Membership')membershipPage(root);if(groupTabs[tab])groupPage(root,groupTabs[tab],tab.endsWith('Settings'));if(tab==='Duty')dutyPage(root);if(tab==='Fortnight Split')fortnightPage(root);if(tab==='Duty Cards')dutyCardsPage(root);if(tab==='Teachers')teacherNotesPage(root);if(tab==='Offload')offloadPage(root);if(tab==='Load Settings')settings(root);if(tab==='Subject Type')subjectTypesPage(root);if(tab==='Classes')classesPage(root);if(tab==='Venues')venuesPage(root);if(tab==='Classes & TGs')classesAndGroupsPage(root);if(tab==='Level Exclusions')exclusionPage(root);if(tab==='Versions')versions(root);if(tab==='ASC Export')renderAscExport(root);if(tab==='Audit')audit(root);if(tab==='Layout')layout(root);if(!patch&&priorView!==tab)root.scrollTop=0;
 if(!['IP Deploy','Dept','Committees','CCAs','PLT','Events','Fortnight Split','Duty','Workload Settings'].includes(tab)){sortedRows(root);wireSort(root)}
 el('viewFilters').hidden=!['IP Deploy','Ledger','Teachers','Classes','Level Exclusions','Load Settings'].includes(tab);el('levels').hidden=['Ledger','Level Exclusions','Teachers','Classes'].includes(tab);
 el('nav').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));
 root.querySelectorAll('.load-cell input').forEach(i=>{i.dataset.na=String(parseLoadText(i.value)===null);i.addEventListener('input',()=>i.dataset.na=String(parseLoadText(i.value)===null));});wireTableControls(root);packToolbar(root);enhanceSelects(root);alignProgramCells(root);if(patch)patchContent(el('content'),root);drawQueueStatus();root.inert=!!queueFlight;[...root.querySelectorAll('.scroll,.unassigned-pane')].forEach((x,i)=>{const pos=panelScroll.get(tab)?.[i];if(pos){x.scrollLeft=pos[0];x.scrollTop=pos[1];}});window.scrollTo?.(scrollX,scrollY);if(ipView)ipCellAnchor.restore(ipView);if(userActionTrace)userActionTrace.renderMs+=Date.now()-renderStarted;console.debug('Deploy render',{view:tab,ms:Date.now()-renderStarted});
}
function classesAndGroupsPage(root){
 const classes=classList(),groups=v().groups||[],primary=['1','2','3','4','5','6'],levels=[...primary,...[...new Set([...classes,...groups.map(g=>({...g,level:GSISVenueGroups.levels(g).length>1?'multi':g.level}))].map(r=>String(r.level||'')))].filter(l=>!primary.includes(l)).sort(natural)],rowCount=Math.max(1,...levels.map(l=>classes.filter(c=>String(c.level||'')===l).length+groups.filter(g=>(GSISVenueGroups.levels(g).length>1?'multi':String(g.level||''))===l).length));
 root.innerHTML='<h2>Classes &amp; TGs</h2><p class="muted">All form classes and teaching groups defined in this deployment version.</p><div class="scroll class-groups-scroll" tabindex="0" aria-label="Classes and teaching groups by primary level"><div class="class-group-levels">'+levels.map(l=>{
  const forms=classes.filter(c=>String(c.level||'')===l),tgs=groups.filter(g=>(GSISVenueGroups.levels(g).length>1?'multi':String(g.level||''))===l).slice().sort((a,b)=>natural(a.name||a.id,b.name||b.id));
  return '<section class="class-group-level"><h3>'+esc(l==='multi'?'Multiple levels':l?'P'+l:'No level')+'</h3><table data-plain-table data-no-sort data-export-title="'+esc(l==='multi'?'Multiple levels':l?'P'+l:'No level')+' Classes and TGs"><thead><tr><th scope="col">Type</th><th scope="col">Class / TG</th><th scope="col">Name / Subject</th></tr></thead><tbody>'+forms.map(c=>'<tr><td>Form class</td><td><strong>'+esc(classLabel(c))+'</strong></td><td>'+esc(c.name||'')+'</td></tr>').join('')+tgs.map(g=>'<tr><td>Teaching group</td><td>'+esc(g.name||g.id)+'</td><td>'+esc(subjectLabel(g.subject||''))+'<small class="context">'+esc(GSISVenueGroups.context(v(),g))+'</small></td></tr>').join('')+Array.from({length:rowCount-forms.length-tgs.length},()=>'<tr class="class-group-spacer" data-export-ignore aria-hidden="true"><td></td><td></td><td></td></tr>').join('')+'</tbody></table></section>';
 }).join('')+'</div></div>';
}
function canClearVenueAssignments(){const d=v();return admin()&&d?.status==='planning'&&d.publication!=='Published'&&d.publishedRevision==null;}
function venueClearSummary(counts){return counts.roomLinks+' room/class links, '+counts.teachingGroups+' teaching groups, '+counts.teacherAssignments+' teacher deployment rows';}
function venuesPage(root){
 const counts=GSISVenueGroups.clearCounts(v()),queued=queuedEdits().some(x=>x.operation==='clearVenueAssignments'),eligible=canClearVenueAssignments();
 root.innerHTML='<h2>Venues</h2><p>Selected version: <strong>'+esc(v().name)+'</strong></p><p>'+esc(venueClearSummary(counts))+'.</p><p>Clear the venue assignments in this planning version. Keep the rooms, classes, teaching groups and teacher deployments.</p><p class="hint">'+(!eligible?'Choose an unpublished planning version.':queued?'Clear is in your local draft. Select Save to online to apply it.':'Preview the change, then add it to your local draft. Select Save to online when ready.')+'</p>';
 const b=button('Clear venue assignments',()=>{
  const version=current,expected=GSISVenueGroups.clearState(v()),preview=GSISVenueGroups.clearCounts(v());
  const editor=selectionEditor('Clear venue assignments','<p>Clear '+esc(venueClearSummary(preview))+' in <strong>'+esc(v().name)+'</strong>?</p><p>Your other local changes stay in the draft. This step does not save online or change the published snapshot.</p>',()=>{
   if(current!==version||JSON.stringify(GSISVenueGroups.clearState(v()))!==JSON.stringify(expected))throw Error('The local venue assignments changed. Close this preview and open it again.');
   queueCell({operation:'clearVenueAssignments',expected});
  },undefined,root);
  editor.querySelector('#ok').textContent='Add clear to draft';editor.querySelector('[data-cancel]').focus({preventScroll:true});
 },!eligible||queued||!Object.values(counts).some(Boolean));b.dataset.clearVenues='';root.append(b);
 if(queued&&!queueFlight)root.append(button('Remove clear from draft',()=>{cellQueue=cellQueue.filter(x=>x.operation!=='clearVenueAssignments');queueError='';viewEpoch++;invalidatePendingProjection();applyPendingProjection();render();}));
}
function classList(){return v().classes||v().venues.filter(r=>r.form).map(r=>({shortName:r.form,level:r.form.match(/^\d+/)?.[0],name:''}))}
function classCode(c){return /^\d/.test(c.shortName)&&c.shortName.startsWith(String(c.level))?c.shortName.slice(String(c.level).length):c.shortName}
function classKey(c){return String(c.level)+classCode(c)}
function classLabel(c){return c.undefinedDraft?String(c.level)+'(undefined)':classKey(c)}
function validClass(c){return classNameSets().some(set=>set.pairs.some(([name,short])=>name===c.name&&short===classCode(c)))}
function classInfo(key){return classList().find(c=>classKey(c)===key)}
function matrixRows(){
 const row=c=>({id:classKey(c),name:classLabel(c),level:c.level,form:classKey(c),venue:GSISVenueGroups.room(v(),classKey(c))?.id||''});
 const blocks=v().venues.map(room=>({room,rows:[...classList().filter(c=>GSISVenueGroups.forms(room).includes(classKey(c))).map(row),...v().groups.filter(g=>g.venue===room.id&&!g.levelWide).map(g=>({...g,isTG:true}))]}));
 const used=new Set();
 for(const c of classList().filter(c=>!GSISVenueGroups.room(v(),classKey(c)))){const groups=GSISVenueGroups.attached(v(),classKey(c));groups.forEach(g=>used.add(g.id));blocks.push({room:{id:'',form:classKey(c),anchorRef:c.ref,name:'Unassigned'},rows:[row(c),...groups.map(g=>({...g,isTG:true}))]});}
 for(const g of v().groups.filter(g=>(g.levelWide||!g.venue)&&!used.has(g.id)))blocks.push({room:{id:g.venue||'',form:'',name:g.venue||'Unassigned'},standalone:true,rows:[{...g,isTG:true}]});
 return blocks.map(b=>({...b,rows:b.rows.filter(r=>(!level||(r.isTG?GSISVenueGroups.levels(r).includes(level):r.level===level))&&(!query||[r.name,r.form,r.isTG?r.subject:'',r.isTG?family(r.subject):'',b.room.id,...v().assignments.filter(a=>a.target===r.id).map(a=>v().teachers.find(t=>t.id===a.teacher)?.name)].join(' ').toLowerCase().includes(query.toLowerCase())))})).filter(b=>b.rows.length);
}
function cellSubjects(row,column){if(row.isTG)return family(row.subject)===column&&GSISWorkload.isGroupSubject(v(),row.subject)?[row.subject]:[];if(column==='FT')return ['FT'];return subjects().filter(s=>family(s)===column&&GSISWorkload.isFormSubject(v(),row.level,s));}
function rowAssignments(row,column){return v().assignments.filter(a=>a.target===row.id&&family(a.subject)===column)}
function matrix(root){
 el('search').placeholder='Search name, TG subject or family (e.g. MTL)…';
 const subs=matrixSubjects(),blocks=matrixRows(),sort=sorts[tab],artELTeachers=new Set(v().teachers.filter(t=>GSISTeachingRules.eligible(plannerTeacher(t))&&String(plannerTeacher(t).profile?.['Subject Modifier']||'').split(/[,;]\s*/).includes('Art')&&v().assignments.some(a=>a.teacher===t.id&&a.subject==='EL')).map(t=>t.id));
 function defaultCompare(a,b){const af=a.room.form,bf=b.room.form,classes=classList();const al=af?Number(classInfo(af)?.level||af.match(/^\d+/)?.[0]):Math.min(...a.rows.map(r=>Number(r.level))),bl=bf?Number(classInfo(bf)?.level||bf.match(/^\d+/)?.[0]):Math.min(...b.rows.map(r=>Number(r.level)));return al-bl||(af&&bf?classes.findIndex(c=>classKey(c)===af)-classes.findIndex(c=>classKey(c)===bf):af?-1:bf?1:0)}
 blocks.sort((a,b)=>{if(!sort)return defaultCompare(a,b);let n;if(sort.index===0)n=natural(a.room.id||'Unassigned',b.room.id||'Unassigned');else if(sort.index===1)n=compareClass(a.room.form||a.rows[0].name,b.room.form||b.rows[0].name);else{const value=block=>block.rows.flatMap(r=>rowAssignments(r,subs[sort.index-2])).map(a=>v().teachers.find(t=>t.id===a.teacher)?.name||'').sort(natural).join(', ');n=natural(value(a),value(b))||defaultCompare(a,b)}return n*(sort.desc?-1:1)});
 const rows=[];
 for(const block of blocks){block.rows.forEach((row,i)=>{
 const room=block.room,shade=colors[classInfo(room.form)?.level||row.level]||'#edf3f7';
 rows.push('<tr data-row="'+esc(row.id)+'">'+(i===0?'<td class="venue" rowspan="'+block.rows.length+'" style="background:'+shade+'">'+(kp()?'<select data-selected-unit="true" data-venue-target="'+esc(row.id)+'" data-tg-row="'+(row.isTG?'1':'0')+'" aria-label="Venue for '+esc(row.name)+'"><option value="">Unassigned</option>'+options(v().venues.map(r=>[r.id,r.id+(deployPhysicalRoom(r,v()).name?' · '+deployPhysicalRoom(r,v()).name:'')]),room.id||'')+'</select>':esc(room.id||'Unassigned'))+(kp()&&!block.standalone?'<button class="add-tg" data-tg="'+esc(room.id)+'" data-anchor="'+esc(room.anchorRef||classInfo(room.form)?.ref||'')+'" title="Add teaching group">+ TG</button>':'')+'</td>':'')+'<td class="row-name" title="'+esc(!row.isTG?classInfo(row.id)?.name:'')+'">'+(row.isTG?esc(row.name):'<strong>'+esc(row.name)+'</strong>'+abilityBadge(classInfo(row.id)?.ability))+(!row.isTG&&(kp()||admin())?'<button data-rename-class="'+esc(classInfo(row.id)?.ref||'')+'" aria-label="Rename class '+esc(row.name)+'" title="Rename class and retain its teachers">Rename</button>':'')+(row.isTG?'<small class="context">'+esc(GSISVenueGroups.context(v(),row))+'</small>':'')+(kp()&&row.isTG?'<button data-edit-tg="'+esc(row.id)+'" aria-label="Edit teaching group '+esc(row.name)+'" title="Edit this TG">✎</button>':'')+'</td>'+subs.map(column=>{
 const ss=cellSubjects(row,column),as=rowAssignments(row,column),available=ss.filter(s=>(row.isTG?GSISVenueGroups.periods(v(),row):loadValue(v(),row.level,s))!==null),applicable=available.length||as.length;
 return '<td class="assignment '+(!applicable?'na':'')+'" data-cell="'+esc(row.id)+'|'+esc(column)+'">'+as.map(a=>'<span class="chip">'+esc(v().teachers.find(t=>t.id===a.teacher)?.name||'Unknown teacher')+exclusionBadge(a)+(!plannerTeacher(v().teachers.find(t=>t.id===a.teacher)||{id:a.teacher,active:false}).active?'<small class="workload-warning" title="Inactive teachers should not hold assignments. Remove or reassign this teaching assignment.">Inactive assignment</small>':'')+(artELTeachers.has(a.teacher)?'<small class="workload-warning" title="Allowed exception: full Art capacity is retained; EL periods count toward actual workload.">Art + EL</small>':'')+((a.subject==='PAL'?canEditPAL():kp())&&!a.pending?'<button data-remove="'+esc(a.id)+'" aria-label="Remove assignment">×</button>':'')+'</span>').join('')+(as.some(a=>GSISWorkload.subjectType(v(),a.subject)===(row.isTG?'class':'tg'))?'<small class="workload-warning" title="This existing assignment still counts. Remove or reassign it to match Subject Type.">Review Subject Type</small>':'')+(kp()?available.filter(s=>s!=='PAL'||canEditPAL()).map(s=>{const lease=serverLeases.find(l=>l.key===current+'|cell:'+row.id+':'+s&&l.until>Date.now());return '<button data-target="'+esc(row.id)+'" data-sub="'+esc(s)+'" '+(lease?'disabled title="'+esc(lease.actor)+' is editing"':'')+'>'+(lease?'Editing…':'+ teacher')+'</button>'}).join(''):'')+'</td>';
 }).join('')+'</tr>');
 })}
 root.innerHTML=table(['Venue','Class / TG',...subs],rows);root.querySelector('table').dataset.freezeColumns='2';
 if(!v().cceELScope&&(kp()||admin())){root.prepend(button('Consolidate CCE EL by level',()=>{try{GSISTGScope.consolidate(clone(v()))}catch(e){alert(e.message);return;}queueCell({operation:'consolidateCCEEL',expected:GSISTGScope.state(v())});render();}));root.insertAdjacentHTML('afterbegin','<p class="hint">CCE EL belongs on one TG per level. Consolidate to move existing CCE EL assignments there, counting each teacher once. Save changes to store this version edit.</p>');}
 if(kp())root.prepend(button('+ Teaching group',()=>addTG(null)));root.querySelectorAll('[data-venue-target]').forEach(input=>input.onchange=()=>{const block=blocks.find(b=>b.rows.some(row=>row.id===input.dataset.venueTarget));if(block.standalone)stageChange('moveTG',{groupId:input.dataset.venueTarget,venue:input.value});else if(block.room.id)stageVenueGroup(block.room.id,input.value);else block.room.form?stageChange('moveClassBlock',{form:block.room.form,venue:input.value}):stageChange('moveTG',{groupId:input.dataset.venueTarget,venue:input.value})});
 root.querySelectorAll('[data-landmark]').forEach(b=>b.onclick=()=>openLandmark(b.dataset.landmark));
 root.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>chooseTeacher(b.dataset.target,b.dataset.sub));
 root.querySelectorAll('[data-edit-tg]').forEach(b=>b.onclick=()=>editTG(b.dataset.editTg));
 root.querySelectorAll('[data-rename-class]').forEach(b=>b.onclick=()=>renameClass(b.dataset.renameClass));
 root.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>addTG(v().venues.find(r=>r.id===b.dataset.tg)||{id:'',form:classList().find(c=>c.ref===b.dataset.anchor)?classKey(classList().find(c=>c.ref===b.dataset.anchor)):'',anchorRef:b.dataset.anchor}));
 root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const a=v().assignments.find(a=>a.id===b.dataset.remove);queueCell({operation:'removeTeacher',subject:a.subject,target:a.target,assignmentId:a.id,teacher:a.teacher,expected:true})});
 wireSort(root);
 if(!blocks.length)root.append(document.createTextNode('No classes or teaching groups match.'));
}
async function chooseTeacher(target,sub){
 if(busy||queueFlight||editing||acquiring)return;const anchor=[...el('content').querySelectorAll('[data-target]')].find(b=>b.dataset.target===target&&b.dataset.sub===sub);if(!anchor)return;
 const cell=anchor.closest('td'),group=v().groups.find(g=>g.id===target),ls=group?GSISVenueGroups.levels(group):[classInfo(target)?.level];
 const position=ipCellAnchor?.capture(anchor);const select=document.createElement('select');select._ipAnchor=position;select.setAttribute('aria-label','Teacher for '+target+' '+sub);select.innerHTML='<option value="">Choose teacher…</option>'+options(v().teachers.filter(t=>t.active&&eligibleTeacher(t)&&!v().assignments.some(a=>a.teacher===t.id&&a.target===target&&a.subject===sub)).map(t=>[t.id,t.name+(ls.some(l=>excluded(t.id,l))?' — ⚠ '+ls.filter(l=>excluded(t.id,l)).map(l=>'P'+l).join(', ')+' exclusion':'')]));anchor.hidden=true;cell.append(select);
 select.onchange=()=>{if(select.value)queueCell({operation:'addTeacher',subject:sub,target,teacher:select.value,expected:false})};enhanceSelects(cell);select._searchPicker.wrap.open=true;
 select._searchPicker.wrap.addEventListener('toggle',()=>{if(!select._searchPicker.wrap.open&&select.isConnected){select._searchPicker.wrap.remove();select.remove();anchor.hidden=false;}});
}
function stageVenueGroup(from,to){if(from!==to)stageChange('moveVenueGroup',{from,venue:to})}

function tgLevelMarkup(group){return '<fieldset id="tgLevels"><legend>Primary levels</legend><div class="tg-level-options">'+Object.keys(v().loads).map(l=>'<label class="tg-scope"><input type="checkbox" data-tg-level="'+esc(l)+'" '+(GSISVenueGroups.levels(group).includes(l)?'checked':'')+'><span>P'+esc(l)+'</span></label>').join('')+'</div></fieldset><label>Actual weekly periods<input id="tgWeeklyPeriods" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="'+esc(group.weeklyPeriods??'')+'" aria-describedby="tgPeriodsHint"><span id="tgPeriodsHint" class="hint"></span></label>';}
function bindTGLevels(editor,group,onchange){
 const inputs=[...editor.querySelectorAll('[data-tg-level]')],periods=editor.querySelector('#tgWeeklyPeriods'),hint=editor.querySelector('#tgPeriodsHint');
 const selected=()=>inputs.filter(x=>x.checked).map(x=>x.dataset.tgLevel);
 function describe(){const multiple=selected().length>1;periods.required=multiple;hint.textContent=multiple?'Required. Enter the total for this TG once, across all selected levels.':'Optional. Leave blank to use this level’s Subject Load.';}
 for(const input of inputs)input.onchange=()=>{describe();onchange(selected());};describe();
 return {value(){const ls=selected();if(!ls.length)throw Error('Select at least one primary level.');const text=periods.value.trim();if(periods.validity.badInput)throw Error('Enter a valid weekly period count.');return {level:ls[0],levels:ls,weeklyPeriods:text===''?null:Number(text)};}};
}
function tgClassSelectorMarkup(){return '<fieldset id="tgClassSelector"><legend>Classes</legend><label class="tg-scope"><input type="checkbox" id="tgWhole"><span>All classes at the selected levels <span id="tgScopeLevel"></span></span></label><div id="tgClassChoices"></div><p id="tgSelectedClasses" class="hint"></p><div id="tgLegacyScope" hidden></div></fieldset>';}
function bindTGClassSelector(editor,initialLevel,group){
 const whole=editor.querySelector('#tgWhole'),choices=editor.querySelector('#tgClassChoices'),summary=editor.querySelector('#tgSelectedClasses'),legacy=editor.querySelector('#tgLegacyScope');
 const original=group?GSISVenueGroups.scope(v(),group):{levelWide:true,classRefs:[],unresolved:[]};let ls=GSISVenueGroups.levels(group||{level:initialLevel}),forced=false;
 function describe(){const selected=[...choices.querySelectorAll('input:checked')].map(x=>x.dataset.label);summary.textContent=whole.checked?'All classes at '+ls.map(l=>'P'+l).join(', '):selected.length?'Selected: '+selected.join(', '):'Select at least one class.';choices.querySelectorAll('input').forEach(x=>x.disabled=forced);}
 function show(nextLevels,selected=[],levelWide=true){ls=nextLevels;whole.checked=levelWide;editor.querySelector('#tgScopeLevel').textContent='· '+ls.map(l=>'P'+l).join(', ');choices.innerHTML=classList().filter(c=>ls.includes(String(c.level))).map(c=>'<label class="tg-scope"><input type="checkbox" data-tg-class="'+esc(c.ref)+'" data-label="'+esc(classKey(c))+'" '+(!levelWide&&selected.includes(c.ref)?'checked':'')+'><span>'+esc(classKey(c)+(c.name?' · '+c.name:''))+'</span></label>').join('');choices.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.checked)whole.checked=false;describe();});describe();}
 whole.onchange=()=>{if(whole.checked)choices.querySelectorAll('input').forEach(x=>x.checked=false);describe();};
 if(original.unresolved.length){legacy.hidden=false;legacy.innerHTML='<p>Saved class references need review: '+original.unresolved.map(esc).join('; ')+'.</p><label class="tg-scope"><input type="checkbox" id="tgResolveLegacy"><span>Replace these references with the scope selected above</span></label>';}
 show(ls,original.classRefs,original.levelWide);
 return {levels(next){show(next,[...choices.querySelectorAll('input:checked')].map(x=>x.dataset.tgClass),whole.checked||forced);},subject(subject){forced=subject==='CCE EL';whole.disabled=forced;if(forced){whole.checked=true;choices.querySelectorAll('input').forEach(x=>x.checked=false);}describe();},value(){const classRefs=whole.checked?[]:[...choices.querySelectorAll('input:checked')].map(x=>x.dataset.tgClass);if(!whole.checked&&!classRefs.length)throw Error('Select at least one class or choose all classes.');const resolveLegacy=!!editor.querySelector('#tgResolveLegacy')?.checked;if(original.unresolved.length&&!resolveLegacy)throw Error('Review the saved class references and confirm their replacement.');return {levelWide:whole.checked,classRefs,resolveLegacy};}};
}
// Keep an explicit subject selection when it is available at a selected level.
function bindTGSubject(editor,select,initialLevels,initialSubject,onchange){
 editor.querySelector('form').noValidate=true;
 let ls=Array.isArray(initialLevels)?initialLevels:[String(initialLevels)];
 const allowed=()=>subjects().filter(s=>(s===initialSubject||GSISWorkload.isGroupSubject(v(),s))&&ls.some(l=>Object.prototype.hasOwnProperty.call(v().loads[l]||{},s)));
 function refresh(next,selected=select.value){ls=next;const values=allowed();select.innerHTML='<option value="">Choose subject…</option>'+options(values.map(s=>[s,subjectLabel(s)]),selected);select.value=values.includes(selected)?selected:'';select.required=true;select._searchPicker?.sync();onchange(select.value);}
 select.addEventListener('change',()=>{const selected=select.value;for(const option of select.options)option.defaultSelected=option.value===selected;onchange(selected);});
 select._searchPicker?.wrap.addEventListener('click',e=>{if(e.target.closest('[role="option"]'))e.preventDefault();});
 refresh(ls,initialSubject||'');
 return {levels:refresh,value(){const subject=select.value;if(!subject||!allowed().includes(subject))throw Error('Choose a teaching subject for the selected levels.');return subject;}};
}
async function addTG(venue){if(editing||acquiring||busy||exclusionEdits.size){alert('Finish the current edit first.');return}try{
 const initial=classInfo(venue?.form)?.level||level||Object.keys(v().loads)[0],initialRef=venue?.anchorRef||classInfo(venue?.form)?.ref;let selector,subjectSelector,levelSelector;
 const d=selectionEditor('Add teaching group',`<label>Name<input id="name" placeholder="P1 LSP 1" maxlength="60"></label>${tgLevelMarkup({level:initial})}${tgClassSelectorMarkup()}<label>Subject<select id="sub" required><option value="">Choose subject…</option></select></label><label>Venue<select id="venue"><option value="">Unassigned</option>${options(v().venues.map(r=>[r.id,r.id+' '+(deployPhysicalRoom(r,v()).name||'')]),venue?.id||'')}</select></label><p class="hint">Class selections do not move classes or change the selected venue. Each assigned teacher receives the TG’s weekly periods once, even across several levels.</p>`,d=>{const args={name:d.querySelector('#name').value,subject:subjectSelector.value(),venue:d.querySelector('#venue').value,...levelSelector.value(),...selector.value()};GSISVenueGroups.workloadFields(v(),args);GSISVenueGroups.scopeFields(v(),args);stageChange('addTG',args);});
 d.classList.add('tg-editor');selector=bindTGClassSelector(d,initial,initialRef?{level:initial,classRefs:[initialRef],levelWide:false}:null);subjectSelector=bindTGSubject(d,d.querySelector('#sub'),[String(initial)],'',subject=>selector.subject(subject));levelSelector=bindTGLevels(d,{level:initial},ls=>{selector.levels(ls);subjectSelector.levels(ls);});
 }catch(e){alert(e.message);await release()}}

function classNameSets(){return v().classNameSets||[{id:'new',name:'New set',pairs:CLASS_NAME_PAIRS.slice(8)},{id:'old',name:'Old set',pairs:CLASS_NAME_PAIRS.slice(0,8)}]}
const classSetSelections={};
function selectedClassNameSet(){return classNameSets().find(s=>s.id===(classSetSelections[current]||'new'))||classNameSets()[0]}
function classPairOptions(c){
 const selected=c?c.name+'|'+classCode(c):'';
 const chosen=selectedClassNameSet(),retained=c&&c.name&&!chosen.pairs.some(p=>p[0]===c.name&&p[1]===classCode(c))?'<optgroup label="Current class"><option selected value="'+esc(selected)+'">'+esc(c.name+' ('+classCode(c)+')')+'</option></optgroup>':'';
 return retained+[chosen].map(set=>'<optgroup label="'+esc(set.name)+'">'+options(set.pairs.map(p=>[p.join('|'),p[0]+' ('+p[1]+')']),selected)+'</optgroup>').join('');
}
function manageClassNameSets(){
 modal('Class name sets','<p>These choice lists belong to this deployment version. Editing a set does not rename existing classes. Class order is unrestricted.</p><div id="nameSetList"></div>',()=>{});
 const d=document.querySelector('dialog');d.querySelector('#ok').textContent='Close';const list=d.querySelector('#nameSetList');
 for(const set of classNameSets()){const row=document.createElement('div');row.className='name-set-choice';const name=document.createElement('span');name.textContent=set.name+' · '+set.pairs.length+' names';row.append(name,button('Edit',()=>{d.close();editClassNameSet(set)}),button('×',()=>{if(classNameSets().length===1){alert('Keep at least one name set.');return}if(!confirm('Remove '+set.name+' from the choices? Existing classes will keep their names.'))return;queueCell({operation:'deleteClassNameSet',setId:set.id,expected:clone(set)});d.close();manageClassNameSets()}));row.lastChild.setAttribute('aria-label','Delete '+set.name);list.append(row)}
 list.append(button('Add set',()=>{d.close();editClassNameSet(null)}));list.querySelectorAll('button').forEach(b=>b.type='button');
}
function editClassNameSet(set){
 const draft=set?clone(set):{id:uid(),name:'',pairs:[['','']]};
 modal(set?'Edit name set':'Add name set','<label>Set name<input id="setName" maxlength="80" value="'+esc(draft.name)+'"></label><p>Enter names without a level prefix. For P1, Graciousness + Gc becomes 1-Graciousness / 1Gc.</p><div class="name-set-scroll"><table class="name-set-table"><thead><tr><th>Name</th><th>Short name</th><th></th></tr></thead><tbody id="setPairs"></tbody></table></div><button type="button" id="addSetPair">Add name</button><p>Apply to draft, then use Save changes at the top of Classes.</p>',d=>{
  const name=d.querySelector('#setName').value.trim(),pairs=[...d.querySelectorAll('#setPairs tr')].map(row=>[...row.querySelectorAll('input')].map(x=>x.value.trim()));
  if(!name)throw Error('Enter a set name.');if(classNameSets().some(s=>s.id!==draft.id&&s.name.toLowerCase()===name.toLowerCase()))throw Error('Use a unique set name.');
  if(!pairs.length||pairs.length>100)throw Error('Use 1 to 100 names.');const names=new Set(),shorts=new Set();
  for(const [full,short] of pairs){if(!full||full.length>120||/[|\r\n]/.test(full)||/^\d+[- ]/.test(full)||!(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/).test(short)||/^P[0-9]+$/i.test(short))throw Error('Enter a name without its level and a short name beginning with a letter. P1, P2, etc. are reserved.');if(names.has(full.toLowerCase())||shorts.has(short.toLowerCase()))throw Error('Names and short names must be unique within a set.');names.add(full.toLowerCase());shorts.add(short.toLowerCase())}
  if(!set&&classNameSets().length>=20)throw Error('Use up to 20 name sets.');
  queueCell({operation:'upsertClassNameSet',set:{id:draft.id,name,pairs},expected:set?clone(set):null});classSetSelections[current]=draft.id;
 });
 const d=document.querySelector('dialog');d.classList.add('name-set-dialog');d.addEventListener('close',()=>d.classList.remove('name-set-dialog'),{once:true});d.querySelector('#ok').textContent='Apply to draft';
 const addPair=pair=>{const tr=document.createElement('tr');tr.innerHTML='<td><input aria-label="Name" maxlength="120" value="'+esc(pair[0])+'"></td><td><input aria-label="Short name" maxlength="40" value="'+esc(pair[1])+'"></td><td><button type="button" aria-label="Remove name">×</button></td>';tr.querySelector('button').onclick=()=>tr.remove();d.querySelector('#setPairs').append(tr)};
 draft.pairs.forEach(addPair);d.querySelector('#addSetPair').onclick=()=>addPair(['','']);
}
const classLevelSelections={};
function selectedClassLevel(){const levels=Object.keys(v().loads).sort(natural),preferred=classLevelSelections[current]||level;return levels.includes(preferred)?preferred:levels[0]||''}
function classChoiceMatch(c,name,short){return classCode(c).toLowerCase()===short.toLowerCase()&&c.name===name}
function classesPage(root){
 const can=kp()||admin(),lev=selectedClassLevel(),set=selectedClassNameSet(),formed=classList().filter(c=>String(c.level)===lev);
 root.innerHTML='<p class="hint">Tick the classes to form across P1–P6. Blank means not formed. Add your own options below. Changes stay in this version’s draft until Save changes.</p>';
 const actions=document.createElement('div');actions.className='tools class-checklist-tools';root.append(actions);
 const setLabel=document.createElement('label');setLabel.className='inline-label';setLabel.textContent='Name set: ';const choose=document.createElement('select');choose.id='classNameSetChoice';choose.setAttribute('aria-label','Class name set');choose.innerHTML=options(classNameSets().map(s=>[s.id,s.name]),set.id);choose.onchange=()=>{classSetSelections[current]=choose.value;render()};setLabel.append(choose);actions.append(setLabel);
 if(can)actions.append(button('Edit options',()=>editClassNameSet(set)),button('Name sets',manageClassNameSets));
 const panel=document.createElement('section');panel.className='class-checklist';root.append(panel);
 const levels=['1','2','3','4','5','6'],all=classList();
 const pairs=set.pairs.map(p=>[...p]);for(const c of all)if(!c.undefinedDraft&&!pairs.some(([n,k])=>classChoiceMatch(c,n,k)))pairs.push([c.name,classCode(c)]);
 const selected=levels.map(l=>'P'+l+': '+all.filter(c=>String(c.level)===l).length).join(' | ');
 const count=document.createElement('p');count.className='class-selection-count';count.textContent=selected;panel.append(count);
 for(const c of all.filter(c=>c.undefinedDraft)){const row=document.createElement('p');row.className='warning';row.dataset.undefinedClass=c.ref;row.textContent=classLabel(c)+' · '+v().assignments.filter(a=>a.target===classKey(c)).map(a=>v().teachers.find(t=>t.id===a.teacher)?.name||a.teacher).join(', ');if(can)row.append(button('Choose class name',()=>renameClass(c.ref)));panel.append(row);}
 panel.insertAdjacentHTML('beforeend',table(['Name','Short name',...levels.map(l=>'P'+l)],pairs.filter(([n,k])=>!query||[n,k,...levels.map(l=>l+k)].join(' ').toLowerCase().includes(query.toLowerCase())).map(([name,short])=>'<tr><td>'+esc(name||'Name not selected')+'</td><td>'+esc(short)+'</td>'+levels.map(l=>'<td><input type="checkbox" data-class-choice="true" data-choice-name="'+esc(name)+'" data-choice-short="'+esc(short)+'" data-choice-level="'+l+'" aria-label="'+esc('P'+l+' '+name)+'" '+(all.some(c=>String(c.level)===l&&classChoiceMatch(c,name,short))?'checked ':'')+(!can||!v().loads[l]?'disabled':'')+'></td>').join('')+'</tr>')));
 panel.querySelectorAll('[data-class-choice]').forEach(check=>{const c=all.find(c=>String(c.level)===check.dataset.choiceLevel&&classChoiceMatch(c,check.dataset.choiceName,check.dataset.choiceShort)),select=document.createElement('select');select.className='class-ability';select.dataset.native='true';select.setAttribute('aria-label','Ability for P'+check.dataset.choiceLevel+' '+check.dataset.choiceName);select.innerHTML=options([['',''],['HA','HA'],['MA','MA'],['LA','LA']],c?.ability||'');select.disabled=!c||!can;check.parentElement.classList.add('class-matrix-cell');check.after(select);select.onchange=()=>queueCell({operation:'setClassAbility',ref:c.ref,value:select.value,expected:c.ability||''})});
 panel.querySelectorAll('[data-class-choice]').forEach(check=>check.onchange=()=>{const wanted=check.checked;check.checked=!wanted;toggleClassChoice(check.dataset.choiceLevel,check.dataset.choiceName,check.dataset.choiceShort,wanted)});
 if(can){
  const form=document.createElement('form');form.className='class-option-add';form.innerHTML='<strong>Add option to '+esc(set.name)+'</strong><div class="class-option-fields"><input name="name" aria-label="New class name" placeholder="Class name, e.g. Unity" maxlength="120" required><input name="short" aria-label="New short name" placeholder="Short name, e.g. U" maxlength="40" required><button type="submit">Add option</button></div><p class="hint">Use names without the level prefix. Add the option, then tick it to form the class.</p><p class="option-error" role="alert"></p>';
  form.onsubmit=e=>{e.preventDefault();try{addClassOption(form.elements.name.value.trim(),form.elements.short.value.trim())}catch(error){form.querySelector('.option-error').textContent=error.message}};panel.append(form);
 }
}
function addClassOption(name,shortName){
 const set=selectedClassNameSet();
 if(!name||name.length>120||/[|\r\n]/.test(name)||/^\d+[- ]/.test(name)||!(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/).test(shortName)||/^P[0-9]+$/i.test(shortName))throw Error('Enter a name without its level and a short name beginning with a letter. P1, P2, etc. are reserved.');
 if(set.pairs.length>=100)throw Error('Use up to 100 options in a name set.');
 if(set.pairs.some(p=>p[0].toLowerCase()===name.toLowerCase()||p[1].toLowerCase()===shortName.toLowerCase()))throw Error('This name or short name already exists in this set.');
 queueCell({operation:'upsertClassNameSet',set:{...clone(set),pairs:[...set.pairs,[name,shortName]]},expected:clone(set)});
 query='';el('search').value='';render();[...document.querySelectorAll('[data-class-choice]')].find(x=>x.dataset.choiceName===name&&x.dataset.choiceShort===shortName)?.focus();
}
function toggleClassChoice(lev,name,shortName,checked){
 if(!(kp()||admin())||!token||queueFlight)return;
 let existing=classList().find(c=>String(c.level)===lev&&classCode(c).toLowerCase()===shortName.toLowerCase());
 if(!checked){if(existing)deleteClassVisible(existing,false);return}
 if(existing&&classChoiceMatch(existing,name,shortName))return;
 // Restore an unticked saved class by cancelling its deletion, preserving its venue and identity.
 if(!existing&&draftBase){const baseline=draftBase.classes.find(c=>String(c.level)===lev&&classCode(c).toLowerCase()===shortName.toLowerCase()),deletion=baseline&&cellQueue.find(x=>x.operation==='deleteClass'&&x.ref===baseline.ref);if(deletion){cellQueue=cellQueue.filter(x=>x!==deletion);viewEpoch++;applyPendingProjection();existing=classList().find(c=>c.ref===baseline.ref);if(existing&&classChoiceMatch(existing,name,shortName)){render();return}}}
 stageClass(existing||null,lev,name,shortName);
}
function stageClass(c,lev,name,shortName){
 if(classList().some(other=>other!==c&&classKey(other)===(lev+shortName))){alert('This short name already exists at P'+lev+'. Choose another name.');render();return}
 if(c&&!c.ref)c.ref=uid();
 queueCell({operation:c?'updateClass':'addClass',ref:c?.ref||uid(),previous:c?classKey(c):undefined,level:lev,name,shortName,expected:c?{level:c.level,name:c.name,shortName:classCode(c)}:null});
}
function renameClass(ref){
 const c=classList().find(c=>c.ref===ref);if(!c)return;
 const anchor=[...el('content').querySelectorAll('[data-rename-class]')].find(b=>b.dataset.renameClass===ref),position=anchor?ipCellAnchor?.capture(anchor,{viewport:true}):null;
 const selected=c.name+'|'+classCode(c),choices=classNameSets().map(set=>'<optgroup label="'+esc(set.name)+'">'+options(set.pairs.map(p=>[p.join('|'),p[0]+' ('+p[1]+')']),selected)+'</optgroup>').join(''),retained=classNameSets().some(set=>set.pairs.some(p=>p.join('|')===selected))?'':'<option value="'+esc(selected)+'" selected>'+esc(c.undefinedDraft?classLabel(c)+' · choose a name':c.name+' ('+classCode(c)+')')+'</option>';
 const d=selectionEditor('Rename class '+classLabel(c),'<p>Keep the teachers and deployment for this P'+esc(c.level)+' class.</p><label>Class name<select id="renameClassName">'+retained+choices+'</select></label><p class="hint">An occupied name moves its previous class to (undefined). Complete all class names before Save to online. This draft recovers in this browser.</p>',d=>{
  const value=d.querySelector('#renameClassName').value,pair=classNameSets().flatMap(set=>set.pairs).find(p=>p.join('|')===value);
  if(value===selected)return;
  if(!pair||!pair[0].trim()||!pair[1].trim())throw Error('Choose a class name from this version’s name sets.');
  const [name,shortName]=pair;
  queueClassRename(c,name,shortName);
 });
 const close=d.close;d.close=options=>{close(options);ipCellAnchor?.restore(position);};
}
function editClass(c){const d=selectionEditor('Add class','<label>Level<select id="classLevel">'+options(Object.keys(v().loads).map(l=>[l,'P'+l]),level)+'</select></label><label>Name<select id="className">'+classPairOptions(c)+'</select></label><p>Short name is supplied automatically.</p>',d=>{const [name,code]=d.querySelector('#className').value.split('|');stageClass(c,d.querySelector('#classLevel').value,name,code)});d.querySelector('#ok').textContent='Add to draft'}

function excluded(teacher,lev){return (kp()||admin())&&(v().levelExclusions||[]).some(r=>r.teacher===teacher&&r.levels.includes(String(lev)))}
function assignmentLevels(a){const g=v().groups.find(g=>g.id===a.target);return g?GSISVenueGroups.levels(g):[classInfo(a.target)?.level||a.level];}
function exclusionBadge(a){return assignmentLevels(a).filter(l=>excluded(a.teacher,l)).map(l=>'<span class="warning-badge" title="P'+esc(l)+' level exclusion — advisory only" aria-label="P'+esc(l)+' level exclusion">⚠ P'+esc(l)+'</span>').join('');}
function exclusionMatches(teacher){return v().assignments.filter(a=>a.teacher===teacher&&assignmentLevels(a).some(l=>excluded(teacher,l)))}
function exclusionPage(root){
 if(!(kp()||admin()))return;
 root.innerHTML='<p class="hint">Usually used for teachers with children or relatives in the school. Click a level to mark × for exclusion, then Save changes. Warnings only; assignments remain allowed.</p>';
 el('search').placeholder='Filter teacher names…';
 const levels=Object.keys(v().loads).sort(natural),visibleLevels=levels;
 const active=v().teachers.filter(t=>t.active&&eligibleTeacher(t)),retired=(v().levelExclusions||[]).filter(r=>!active.some(t=>t.id===r.teacher)).map(r=>({id:r.teacher,name:v().teachers.find(t=>t.id===r.teacher)?.name||'Teacher no longer in snapshot',active:false}));
 const people=[...active,...retired].filter(t=>!query||t.name.toLowerCase().includes(query.toLowerCase()));
 const rows=people.map(t=>{
  const edit=exclusionEdits.get(t.id),pending=edit?.phase==='saving',failed=edit?.phase==='failed',matches=exclusionMatches(t.id);
  return '<tr data-exclusion-row="'+esc(t.id)+'" class="'+(pending?'exclusion-pending':'')+'" '+(pending?'aria-busy="true"':'')+'><td><span>'+esc(t.name)+(t.active?'':' (inactive — clear only)')+'</span></td>'+visibleLevels.map(l=>{
   const checked=edit?.level===l?edit.checked:excluded(t.id,l);
   return '<td><label class="exclusion-toggle"><input type="checkbox" data-teacher="'+esc(t.id)+'" data-exclusion-level="'+esc(l)+'" aria-label="'+esc(t.name+' · P'+l+' exclusion')+'" '+(checked?'checked ':'')+((edit||!t.active&&!checked)?'disabled':'')+'><span aria-hidden="true">×</span></label></td>';
  }).join('')+'<td class="exclusion-status" role="status">'+(pending?'<span class="spinner" aria-hidden="true"></span> Saving…':failed?'<span class="warning-text">'+esc(edit.message)+' Use Refresh to check.</span>':matches.length?'⚠ '+matches.length+' assignment(s)':'')+'</td></tr>';
 });
 root.insertAdjacentHTML('beforeend',table(['Teacher',...visibleLevels.map(l=>'P'+l),'Status'],rows));
 root.querySelector('table').classList.add('exclusion-table');root.querySelector('.scroll').classList.add('exclusion-scroll');
 root.querySelectorAll('[data-exclusion-level]').forEach(input=>input.onchange=()=>saveExclusionCell(input.dataset.teacher,input.dataset.exclusionLevel,input.checked));
 if(!people.length)root.append(document.createTextNode('No teachers match this view.'));
}
// Exclusion deltas preserve row nodes, focus, column widths and scroll state.
function updateExclusionRows(ids){
 const started=Date.now();
 if(tab!=='Level Exclusions'||inlineDraftEditor?.open)return false;
 const rows=new Map([...el('content').querySelectorAll('[data-exclusion-row]')].map(r=>[r.dataset.exclusionRow,r]));if(!rows.size)return false;
 const touched=new Set(ids),counts=new Map();for(const a of v().assignments||[])if(touched.has(a.teacher)&&assignmentLevels(a).some(l=>excluded(a.teacher,l)))counts.set(a.teacher,(counts.get(a.teacher)||0)+1);
 for(const id of touched){const row=rows.get(id);if(!row){if(!query)return false;continue;}const active=v().teachers.some(t=>t.id===id&&t.active&&eligibleTeacher(t));
  for(const input of row.querySelectorAll('[data-exclusion-level]')){input.checked=excluded(id,input.dataset.exclusionLevel);input.disabled=!!queueFlight||!active&&!input.checked;input.classList.toggle('pending',queuedEdits().some(x=>x.operation==='setExclusionCell'&&x.teacher===id&&x.level===input.dataset.exclusionLevel));}
  const count=counts.get(id)||0,status=row.querySelector('.exclusion-status'),text=count?'⚠ '+count+' assignment(s)':'';if(status.textContent!==text)status.textContent=text;
 }if(userActionTrace)userActionTrace.renderMs+=Date.now()-started;return true;
}
async function saveExclusionCell(teacher,lev,checked){
 queueCell({operation:'setExclusionCell',teacher,level:lev,checked,expected:excluded(teacher,lev)});
 updateExclusionRows([teacher]);drawQueueStatus();
}

function parseLoadText(text){const value=text.trim();if(!value||/^(?:n\/a|\(n\/a\))$/i.test(value))return null;const n=Number(value);return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)&&Number.isFinite(n)&&n>=0&&n<=100&&n*2%1===0?n:NaN;}
function settings(root){
 root.innerHTML='<p class="hint">FT = Assembly + FTGP + FTT. PD is reference only; PLT membership supplies 2 periods per distinct PD group. Edit locally; use Save changes when ready. Tab or Enter moves between cells. Esc restores the starting value. Type n/a for not offered, or a number (0 means offered with zero periods).</p>';
 const legacy=subjects().filter(isLegacySubject);if(legacy.length)root.insertAdjacentHTML('beforeend','<p class="warning-text">Legacy Pull/FSci still has assignments or teaching groups in this version. Reassign these before retiring the legacy subject; its rates are preserved.</p>');
 for(const subject of legacy)root.append(button('Review legacy '+subject,()=>selectionEditor('Convert legacy subject','<p>All '+esc(subject)+' teaching groups and assignments in this version will use the chosen subject and its current workload rates. Historical rates remain archived.</p><label>Current subject<select id="legacyTarget"><option>Science</option><option>FSC</option></select></label>',d=>change('convertLegacySubject',{subject,targetSubject:d.querySelector('#legacyTarget').value}),'meta'),!kp()));
 const keys=[...new Set(['Assembly','FTGP','FTT','FT',...subjects().filter(s=>s!=='PD'&&s!=='TTT'),'PD'])],can=kp()||admin();
 if(Object.values(v().loads).some(r=>'PD' in r&&'TTT' in r&&r.PD!==r.TTT))root.insertAdjacentHTML('beforeend','<p class="warning-text">PD and legacy TTT rates differ. PD is displayed; legacy values are retained for review.</p>');
 root.insertAdjacentHTML('beforeend',table(['Level',...keys],Object.entries(v().loads).filter(([l])=>!level||l===level).map(([l,r])=>'<tr><td>P'+esc(l)+'</td>'+keys.map(k=>'<td class="load-cell '+(['TTT','PD','Assembly','FTGP','FTT'].includes(k)?'ft-component':'')+'">'+(k==='FT'?'<strong data-ft-level="'+esc(l)+'" title="Calculated FT load">'+loadValue(v(),l,k)+'</strong>':`<input aria-label="P${esc(l)} ${esc(k)} periods" type="text" autocomplete="off" spellcheck="false" value="${(k==='PD'?('PD' in r?r.PD:r.TTT):r[k])??'n/a'}" data-level="${esc(l)}" data-key="${esc(k==='PD'&&!('PD' in r)&&'TTT' in r?'TTT':k)}" placeholder="(n/a)" ${can?'':'disabled'}>` )+'</td>').join('')+'</tr>')));
 root.querySelector('table').classList.add('load-table');
 root.querySelectorAll('.load-cell input').forEach(i=>{
  let old=i.value,start=i.value;
  i.onfocus=()=>{old=start=i.value};
  i.oninput=()=>{unsavedDraft=i.value!==old;if(!Number.isNaN(parseLoadText(i.value)))finish();else i.classList.add('dirty')};
  const finish=()=>{
   if(i.value===old){i.setCustomValidity('');i.classList.remove('dirty');unsavedDraft=false;return true}
   const value=parseLoadText(i.value),expected=parseLoadText(old),message=Number.isNaN(value)?'Enter n/a or 0–100 in half-period increments.':value===null&&(['Assembly','FTGP','FTT'].includes(i.dataset.key)||v().assignments.some(a=>String(a.level)===i.dataset.level&&a.subject===i.dataset.key))?'This setting is in use; enter a number.':'';
   i.setCustomValidity(message);if(message){i.classList.add('dirty');return false;}
   queueCell({operation:'setLoad',level:i.dataset.level,subject:i.dataset.key,value,expected});old=i.value;unsavedDraft=false;
   i.classList.remove('dirty');i.classList.add('pending');return true;
  };
  i.onblur=()=>{if(!finish())i.reportValidity();};
  i.onkeydown=e=>{
   if(e.key==='Escape'){e.preventDefault();i.value=start;finish();i.classList.remove('dirty');unsavedDraft=false;i.blur()}
   if(e.key==='Enter'){e.preventDefault();if(finish()){const inputs=[...root.querySelectorAll('.load-cell input')],next=inputs[inputs.indexOf(i)+1];next?.focus()}}
   if(e.key==='Tab'&&!finish())e.preventDefault();
  };
 });
 root.append(button('Add subject',()=>{const subject=prompt('New subject code');if(subject)action('addSubject',{subject})},!can),button('Add level',()=>{const lev=prompt('New level number');if(lev)action('addLevel',{level:lev})},!can));
}
function subjectTypeRetained(subject){
 const d=v(),identity=GSISWorkload.subjectIdentity,mode=GSISWorkload.subjectType(d,subject),groups=new Set((d.groups||[]).map(g=>g.id));
 const classAssignments=mode==='tg'?(d.assignments||[]).filter(a=>!groups.has(a.target)&&identity(a.subject)===identity(subject)).length:0;
 const groupCount=mode==='class'?(d.groups||[]).filter(g=>identity(g.subject)===identity(subject)).length:0;
 return [classAssignments?classAssignments+' existing class assignment(s) retained':'',groupCount?groupCount+' existing TG(s) retained':''].filter(Boolean).join('; ');
}
function subjectTypesPage(root){
 const modes=[['class','Class only'],['tg','TG only'],['both','Both']],subs=GSISWorkload.subjectTypeSubjects(v());
 root.innerHTML='<h2>Subject Type</h2><p class="hint">Choose where each subject can be assigned in this version. TG only removes empty class cells and their planned demand. Weekly periods remain in Subject Load.</p><p class="hint">Existing assignments and TGs remain visible and count until you remove or reassign them. Whole-level TG rules still apply. Only Admin can change these settings.</p>'+table(['Subject',...modes.map(x=>x[1]),'Existing records'],subs.map((subject,i)=>{
  const current=GSISWorkload.subjectType(v(),subject);
  return '<tr data-subject-type-row="'+esc(subject)+'"><th scope="row">'+esc(subjectLabel(subject))+'</th>'+modes.map(([mode,label])=>'<td><input type="radio" name="subject-type-'+i+'" data-subject-type="'+esc(subject)+'" value="'+mode+'" aria-label="'+esc(subjectLabel(subject)+': '+label)+'"'+(current===mode?' checked':'')+(!admin()?' disabled':'')+'></td>').join('')+'<td data-subject-type-note>'+esc(subjectTypeRetained(subject))+'</td></tr>';
 }));
 const grid=root.querySelector('table');grid.classList.add('subject-types-table');grid.dataset.noColumnControls='true';grid.dataset.noSort='true';
 root.querySelectorAll('[data-subject-type]').forEach(input=>input.onchange=()=>{
  if(!admin()||queueFlight)return;
  const subject=input.dataset.subjectType;queueCell({operation:'setSubjectType',subject,value:input.value,expected:v().subjectTypes?.[subject]??null});
  input.closest('tr').querySelector('[data-subject-type-note]').textContent=subjectTypeRetained(subject);
 });
}
let campusBase=null,mapScale=1;
function deployPhysicalRoom(room,doc){const unit=room.id==='D1-06B'&&room.name==='Pump Room'?'D1-06C':room.id,registry=doc.venueRegistry?.venues?.find(x=>x.unitNumber===unit);return registry&&registry.name===undefined?{...registry,name:room.name}:registry||room;}
function deployRoomName(room,doc){const registry=deployPhysicalRoom(room,doc);if(registry!==room)return registry.shortName||'';return room.shortName||({'C4-17':'MCL1','C4-18':'MCL2'})[doc.unitGeometry?.[room.id]||room.id]||'';}
async function layout(root){
 root.innerHTML='<p class="hint">Version allocations on the original campus geometry. Read-only allocations from IP Deploy. Print / Save PDF defaults to A4 portrait and retains vector detail for A2 enlargement.</p><div class="layout-tools"></div><div class="campus-map" aria-busy="true">Loading campus map…</div>';
 const tools=root.querySelector('.layout-tools');tools.append(button('Print / Save PDF',printCampus),button('Export Excel',async()=>{try{await window.GSISLayoutExcel.download(root.querySelector('.campus-map svg'))}catch(e){alert(e.message)}}),button('−',()=>{mapScale=Math.max(.5,mapScale-.25);resizeCampus()}),button('+',()=>{mapScale=Math.min(3,mapScale+.25);resizeCampus()}),button('Fit',()=>{mapScale=1;resizeCampus()}));

 const version=current;
 try{
  if(!campusBase){const r=await fetch('/api/campus-map',{method:'POST',headers:{'Content-Type':'application/json',...(token==='session'?{}:{Authorization:'Bearer '+token})},body:'{}',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Could not load map. Use Refresh to retry.');campusBase=await r.text()}
  if(current!==version||tab!=='Layout')return;
  const map=root.querySelector('.campus-map');map.innerHTML=campusBase;map.removeAttribute('aria-busy');const svg=map.querySelector('svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Campus layout for '+v().name);
  window.GSISrenderLayout(svg,{positions:CAMPUS_ROOMS,rooms:v().venues.map(r=>({id:r.id,geometry:v().unitGeometry?.[r.id]||r.id,name:deployPhysicalRoom(r,v()).name,shortName:deployRoomName(r,v()),form:GSISVenueGroups.forms(r).join(', '),groups:v().groups.filter(g=>g.venue===r.id).map(g=>g.name),level:classInfo(r.form)?.level||v().groups.find(g=>g.venue===r.id)?.level})),title:'CLASSROOM LAYOUT · '+v().name,date:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),colors,onSelect:null,version:current});
  resizeCampus();
  const unmatched=v().venues.filter(r=>!CAMPUS_ROOMS.some(m=>m.id===(v().unitGeometry?.[r.id]||r.id)));
  if(unmatched.length){const details=document.createElement('details');details.className='unmapped-rooms';details.innerHTML='<summary>Venues not matched to a PDF boundary ('+unmatched.length+')</summary><p>These codes remain available; their positions have not been guessed.</p>';unmatched.forEach(r=>{const item=document.createElement('div');item.textContent=r.id;details.append(item)});root.append(details)}
 }catch(e){if(tab==='Layout'){const map=root.querySelector('.campus-map');map.textContent=e.message;map.removeAttribute('aria-busy')}}
}
function resizeCampus(){const map=document.querySelector('.campus-map');if(map){map.style.width=Math.round(100*mapScale)+'%';map.style.maxWidth='none'} }
function printCampus(){
 if(queuedEdits().length||unsavedDraft){alert('Finish saving before printing the confirmed layout.');return}
 const svg=document.querySelector('.campus-map svg');if(!svg){alert('Wait for the map to load.');return}
 const frame=document.createElement('iframe');frame.className='print-frame';document.body.append(frame);const d=frame.contentDocument;
 d.open();d.write('<!doctype html><html><head><title>'+esc(v().name)+' — Classroom layout</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0}svg{display:block;width:210mm;height:297mm}.room-hit{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>'+svg.outerHTML+'</body></html>');d.close();
 frame.contentWindow.onafterprint=()=>frame.remove();setTimeout(()=>{frame.contentWindow.focus();frame.contentWindow.print()},150);
}

async function downloadCampusReference(){const done=beginLoading(el('content'),'Loading reference…');try{const response=await fetch('/api/layout-reference',{method:'POST',headers:{'Content-Type':'application/json',...(token==='session'?{}:{Authorization:'Bearer '+token})},body:'{}',signal:AbortSignal.timeout(30000)});if(!response.ok){if(response.status===401)expired();throw Error('Could not load campus reference. Refresh and try again.')}exportFile('Classroom-Layout-21-Sep-2026.pdf',await response.arrayBuffer(),'application/pdf')}catch(e){alert(e.message)}finally{done()}}
async function moveGroup(venue){if(editing||acquiring||busy||exclusionEdits.size){alert('Finish the current edit first.');return}try{selectionEditor(venue?'Move TG to '+venue:'Unassign TG venue',`<label>Teaching group<select id="tg">${options(v().groups.map(g=>[g.id,g.name+' · '+(g.venue||'Unassigned')]))}</select></label>`,d=>stageChange('moveTG',{groupId:d.querySelector('#tg').value,venue}))}catch(e){alert(e.message);await release()}}

let liveSocket=null,liveVersion='',liveTimer=null,liveRetry=null,liveConnecting=false,liveEpoch=0,liveConfigured=false,liveDirty=false,liveBackoff=1500,liveDebounce=null;
function connectionText(){return (lastRefreshedAt?'Last refreshed '+lastRefreshedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Not loaded')+' · Save changes to submit edits; Refresh to check other users’ changes.';}
function stopLive(){liveEpoch++;clearTimeout(liveTimer);clearTimeout(liveRetry);clearTimeout(liveDebounce);const old=liveSocket;liveSocket=null;liveVersion='';if(old){old.onclose=null;old.close()}liveConnecting=false}
function requestLiveRefresh(){liveDirty=true;clearTimeout(liveDebounce);liveDebounce=setTimeout(()=>{if(!busy&&!editing&&!acquiring&&!unsavedDraft&&!exclusionEdits.size&&!refreshing){liveDirty=false;refresh()}},180)}
async function connectLive(){ /* Explicit refresh and Save own Deploy data updates. */ }

// Release additions are initialized before sign-in.

// Immediate local drafts; pending values are never labelled saved before acknowledgement.
let draftBase=null,staffCatalog=new Map(),roleCatalogue=[],contactSysFields=null,contactCatalogueHash='',cellQueue=[],queueFlight=null,queueTimer=null,queueError='',queueAttempts=0;
const classDraftLoaded=new Set(),classDraftUnreadable=new Set();let classDraftRecoveryConflict=false,classDraftStorageError='';
function classMetadata(c){return c?{level:c.level,name:c.name,shortName:classCode(c)}:null;}
function classDraftKey(){return 'deploy.class-draft.v1.'+encodeURIComponent(lastEmail.toLowerCase())+'|'+encodeURIComponent(current);}
function classRenameError(){const count=(v()?classList():[]).filter(c=>c.undefinedDraft).length;return count?'Complete '+count+' undefined class name(s) before Save to online.':classDraftRecoveryConflict?'Saved class names changed. Select Review to reconcile your recovered draft.':'';}
function projectClassRenames(doc,rows){
 const changes=new Map();for(const row of rows){const c=doc.classes.find(c=>c.ref===row.ref);if(c)changes.set(classKey(c),String(row.level)+row.shortName);}
 const mapped=value=>changes.get(value)||value;
 for(const r of doc.venues)GSISVenueGroups.setForms(r,GSISVenueGroups.forms(r).map(mapped));
 for(const a of doc.assignments)if(changes.has(a.target))a.target=mapped(a.target);
 for(const g of doc.groups){if(g.form)g.form=mapped(g.form);g.sources=(g.sources||[]).map(mapped);}
 for(const row of rows){const c=doc.classes.find(c=>c.ref===row.ref);if(c){Object.assign(c,{level:row.level,name:row.name,shortName:row.shortName});if(row.undefinedDraft)c.undefinedDraft=true;else delete c.undefinedDraft;}}
}
function queueClassRename(c,name,shortName){
 if(!token||!(kp()||admin()))return;if(queueFlight)throw Error('Finish or retry the submitted save before editing again.');
 if(!draftBase)draftBase=clone(v());
 const old=cellQueue.find(x=>x.operation==='renameClasses'),rows=clone(old?.rows||[]),put=(cl,n,s,temporary)=>{
  const added=cellQueue.find(x=>x.operation==='addClass'&&x.ref===cl.ref);
  if(added){Object.assign(added,{name:n,shortName:s,renamedDraft:true});if(temporary)added.undefinedDraft=true;else delete added.undefinedDraft;const at=rows.findIndex(row=>row.ref===cl.ref);if(at>=0)rows.splice(at,1);return;}
  const previous=rows.find(row=>row.ref===cl.ref),expected=previous?.expected||classMetadata(cl),row={ref:cl.ref,level:String(cl.level),name:n,shortName:s,expected,...(temporary?{undefinedDraft:true}:{})};
  if(previous)rows.splice(rows.indexOf(previous),1,row);else rows.push(row);
 };
 for(const other of classList())if(other.ref!==c.ref&&String(other.level)===String(c.level)&&!other.undefinedDraft&&(other.name.toLowerCase()===name.toLowerCase()||classCode(other).toLowerCase()===shortName.toLowerCase()))put(other,'(undefined)','__undefined_'+other.ref,true);
 put(c,name,shortName,false);
 const edit={operation:'renameClasses',rows,expected:rows.map(row=>({ref:row.ref,...row.expected}))};
 if(old){if(rows.length)cellQueue.splice(cellQueue.indexOf(old),1,edit);else cellQueue.splice(cellQueue.indexOf(old),1);}else if(rows.length)cellQueue.push(edit);
 viewEpoch++;invalidatePendingProjection();applyPendingProjection();drawQueueStatus();
}
function persistClassDraft(){
 if(!lastEmail||!current)return;const edits=queuedEdits(),hasRename=edits.some(x=>x.operation==='renameClasses'||x.operation==='addClass'&&x.renamedDraft);
 try{if(!hasRename){if(classDraftUnreadable.has(classDraftKey()))return;localStorage.removeItem(classDraftKey());classDraftStorageError='';return;}
  const flight=queueFlight?{versionId:queueFlight.versionId,requestId:queueFlight.requestId,issuedAt:queueFlight.issuedAt,wire:queueFlight.wire,baselineRevision:queueFlight.baselineRevision}:null;
  localStorage.setItem(classDraftKey(),JSON.stringify({schema:1,actor:lastEmail.toLowerCase(),version:current,at:Date.now(),edits,flight}));classDraftStorageError='';
 }catch{classDraftStorageError='Browser draft recovery is unavailable. Keep this page open until you save or discard.';}
}
function restoreClassDraft(){
 if(!lastEmail||!current||!(kp()||admin())||queuedEdits().length)return;const key=classDraftKey();if(classDraftLoaded.has(key))return;classDraftLoaded.add(key);
 try{const text=localStorage.getItem(key);if(!text)return;const saved=JSON.parse(text);
  if(saved.schema!==1||saved.actor!==lastEmail.toLowerCase()||saved.version!==current||!Array.isArray(saved.edits)||saved.edits.length>500||!saved.edits.some(x=>x?.operation==='renameClasses'||x?.operation==='addClass'&&x.renamedDraft))throw Error('Invalid draft');
  const renames=saved.edits.find(x=>x.operation==='renameClasses'),rows=renames?.rows||[];if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.ref!=='string'||typeof row.level!=='string'||typeof row.name!=='string'||typeof row.shortName!=='string'||!row.expected))throw Error('Invalid class draft');
  draftBase=clone(v());const renameSource=classRenameSource(v(),saved.edits);classDraftRecoveryConflict=!saved.flight&&rows.some(row=>JSON.stringify(classMetadata(renameSource.classes.find(c=>c.ref===row.ref)))!==JSON.stringify(row.expected));
  if(saved.flight){queueFlight={...saved.flight,edits:saved.edits,running:false};cellQueue=[];el('content').inert=true;queueError='Recovered an unconfirmed save. Retry checks its original save ID.';}
  else{cellQueue=saved.edits;queueError=classDraftRecoveryConflict?'Saved class names changed. Review this recovered draft before saving.':'Recovered class draft from this browser.';}
  invalidatePendingProjection();applyPendingProjection();
 }catch{classDraftUnreadable.add(key);classDraftStorageError='A stored class draft could not be recovered. Its browser copy is retained.';}
}
function eligibleTeacher(t){return GSISTeachingRules.eligible(plannerTeacher(t))}
function queueKey(x){if(x.operation==='renameClasses')return 'class-renames';if(x.operation==='setAscExportSettings')return 'asc-export';if(x.operation==='clearVenueAssignments')return 'venue-assignments';if(x.operation==='setSubjectType')return 'subject-type:'+x.subject;if(x.operation==='setPAL')return 'pal';if(x.operation==='setReliefSettings')return 'relief';if(x.operation==='setReportingOfficer')return 'reporting:'+x.officer;if(x.operation==='initReporting')return 'reporting-init';if(x.operation==='consolidateCCEEL')return 'cce-el-scope';if(x.operation==='setWorkload')return 'workload';if(x.operation==='updateTG')return 'update-tg:'+x.groupId;if(x.operation==='setFortnight')return 'fortnight:'+x.row+':'+x.field;if(['setOrganisation','setDuties','setMembership','setMasterOptions'].includes(x.operation))return x.operation+':'+(x.kind||'');if(x.operation==='removeTG')return 'remove-tg:'+x.groupId;if(x.operation==='moveClassBlock')return 'class-block:'+x.formRef;if(x.operation==='moveVenueGroup')return 'venue-group:'+x.from;if(x.operation==='setOffload')return 'offload';if(x.operation==='removeTeacherProfile')return 'teacher-remove:'+x.teacher;if(x.operation==='setClassAbility')return 'class-ability:'+x.ref;if(x.operation==='setTeacherField')return 'teacher-field:'+x.teacher+':'+x.field;if(x.operation==='setHRTerms')return 'hr-terms:'+x.field;if(x.operation==='upsertTeacherProfile')return 'teacher-profile:'+x.teacher;if(['upsertClassNameSet','deleteClassNameSet'].includes(x.operation))return 'name-set:'+(x.set?.id||x.setId);return x.operation==='setTeacherNote'?'note:'+x.teacher:x.operation==='setLoad'?'load:'+x.level+':'+x.subject:x.operation==='setExclusionCell'?'exclusion:'+x.teacher+':'+x.level:['addTeacher','removeTeacher'].includes(x.operation)?'assignment:'+(x.targetRef||x.target)+':'+x.subject+':'+x.teacher:['addClass','updateClass','deleteClass'].includes(x.operation)?'class:'+x.ref:x.operation==='moveClass'?'venue:class:'+(x.formRef||x.form):x.operation==='moveTG'?'venue:tg:'+x.groupId:'tg:'+x.localId}
function assignmentState(target,subject){return v().assignments.filter(a=>a.target===target&&a.subject===subject&&!a.pending).map(a=>a.id).sort()}
function queuedEdits(){return [...(queueFlight?.edits||[]),...cellQueue]}
function projectEdit(doc,input){projectEditBase(doc,input);if(input.operation!=='clearVenueAssignments')GSISPAL.reconcile(doc,input);}
function projectEditBase(doc,input){if(input.operation==='renameClasses'){projectClassRenames(doc,input.rows);if(doc.reliefResults)doc.reliefResults.pending=true;return;}if(input.operation==='setAscExportSettings'){doc.ascExport=clone(input.value);return;}if(input.operation==='clearVenueAssignments'){GSISVenueGroups.clearVenues(doc);return;}if(input.operation==='setPAL'){GSISPAL.set(doc,input.value);if(doc.reliefResults)doc.reliefResults.pending=true;return;}if(doc.reliefResults&&!['setExclusionCell','setTeacherNote','setReportingOfficer','initReporting','setClassAbility','moveClass','moveTG','moveVenueGroup','moveClassBlock','upsertClassNameSet','deleteClassNameSet'].includes(input.operation))doc.reliefResults.pending=true;if(input.operation==='setReliefSettings'){doc.relief=clone(input.value);if(doc.reliefAdmin)doc.reliefAdmin.settings=clone(input.value);return;}if(input.operation==='consolidateCCEEL'){GSISTGScope.consolidate(doc);return;}if(input.operation==='initReporting'){doc.reporting=clone(input.value);return;}if(input.operation==='setReportingOfficer'){GSISReporting.assign(doc,input.officer,input.value);return;}if(input.operation==='setSubjectType'){doc.subjectTypes||={};doc.subjectTypes[input.subject]=GSISWorkload.validateSubjectType(doc,input.subject,input.value);return;}if(input.operation==='setWorkload'){doc.workload=clone(input.value);return;}if(input.operation==='updateTG'){GSISVenueGroups.update(doc,input);return;}if(input.operation==='setFortnight'){doc.fortnight||={};doc.fortnight[input.row]||={};doc.fortnight[input.row][input.field]=input.value;return;}if(input.operation==='setOrganisation'){doc.organisations||={};doc.organisations[input.kind]=clone(input.value);return;}if(input.operation==='setDuties'){doc.duties=clone(input.value);return;}if(input.operation==='setMembership'){doc.membership=clone(input.value);if(doc.masterOptions)doc.masterOptions.Role=input.value.map(r=>r[0]);return;}if(input.operation==='setMasterOptions'){doc.masterOptions=clone(input.value);doc.hrTerms=Object.fromEntries(HR_FIELDS.map(k=>[k,clone(doc.masterOptions[k]||[])]));doc.hrTermsSelected={};return;}if(['moveVenueGroup','moveClassBlock'].includes(input.operation)){try{GSISVenueGroups.move(doc,input)}catch{}return;}if(input.operation==='removeTG'){if(doc.groups.some(g=>g.id===input.groupId))GSISVenueGroups.remove(doc,input.groupId);return;}
 if(input.operation==='setOffload'){doc.offload=clone(input.value);return;}if(input.operation==='removeTeacherProfile'){doc.removedTeachers||={};doc.removedTeachers[input.teacher]=doc.teachers.find(t=>t.id===input.teacher);GSISPlanning.clearTeacher(doc,input.teacher,true);return;}
 if(input.operation==='setClassAbility'){const c=doc.classes.find(c=>c.ref===input.ref);if(c)c.ability=input.value;return;}
 if(input.operation==='setTeacherField'){const t=doc.teachers.find(t=>t.id===input.teacher);if(t)projectEdit(doc,{operation:'upsertTeacherProfile',teacher:input.teacher,profile:{...t.profile,...doc.teacherDrafts?.[input.teacher],[input.field]:input.value}});return;}
 if(input.operation==='setHRTerms'){doc.hrTerms||=hrTermLists();doc.hrTerms[input.field]=clone(input.values);doc.hrTermsSelected||={};if(input.inherit)delete doc.hrTermsSelected[input.field];else doc.hrTermsSelected[input.field]=true;return;}
 if(input.operation==='upsertTeacherProfile'){doc.teacherDrafts||={};const profile=clone(input.profile),catalog=roleCatalogue.find(r=>r.role===profile.Role);doc.teacherDrafts[input.teacher]=profile;let t=doc.teachers.find(t=>t.id===input.teacher);if(!t){t={...(staffCatalog.get(input.teacher)||{}),id:input.teacher};doc.teachers.push(t)}const required=catalog?.requiredSubject||(['MTL','PE','Art','Music'].includes(profile.Role)?profile.Role:'');if(required){const list=String(profile['Subject Modifier']||'').split(/,\s*/).filter(Boolean);if(!list.includes(required))list.unshift(required);profile['Subject Modifier']=list.join(', ');}profile['EO Appt Level']=catalog?.level==='0'?'':GSISTeachingRules.group('',catalog?.level||'');const tags=k=>String(profile[k]||'').split(/,\s*/).map(x=>x.trim()).filter(Boolean).map(x=>' ('+x+')').join('');Object.assign(t,{profile,name:profile['Basic Name']+tags('Employment Modifier')+tags('Subject Modifier')+(t.mk?' ('+t.mk+')':''),active:profile.Active==='Y',role:profile.Role,groups:catalog?.groups||[],mk:t.mk||''});if(!t.active)GSISPlanning.clearTeacher(doc,input.teacher);return}

 if(['upsertClassNameSet','deleteClassNameSet'].includes(input.operation)){doc.classNameSets=clone(doc.classNameSets||classNameSets());const at=doc.classNameSets.findIndex(s=>s.id===(input.set?.id||input.setId));if(input.operation==='deleteClassNameSet'){if(at>=0)doc.classNameSets.splice(at,1)}else if(at<0)doc.classNameSets.push(clone(input.set));else doc.classNameSets[at]=clone(input.set);return}
 const x={...input};if(x.targetRef)x.target=doc.classes.find(c=>c.ref===x.targetRef)?classKey(doc.classes.find(c=>c.ref===x.targetRef)):x.target;if(x.formRef)x.form=doc.classes.find(c=>c.ref===x.formRef)?classKey(doc.classes.find(c=>c.ref===x.formRef)):x.form;if(x.sourceRefs)x.sources=x.sources.map((s,i)=>{const c=doc.classes.find(c=>c.ref===x.sourceRefs[i]);return c?classKey(c):s});
 if(x.operation==='setTeacherNote'){doc.teacherNotes||={};doc.teacherNotes[x.teacher]=x.value;}
 if(x.operation==='setLoad'&&doc.loads[x.level])doc.loads[x.level][x.subject]=x.value;
 if(x.operation==='setExclusionCell'){doc.levelExclusions||=[];let rule=doc.levelExclusions.find(r=>r.teacher===x.teacher);if(x.checked){if(!rule)doc.levelExclusions.push(rule={teacher:x.teacher,levels:[]});if(!rule.levels.includes(x.level))rule.levels.push(x.level)}else if(rule)rule.levels=rule.levels.filter(l=>l!==x.level)}
 if(x.operation==='addTeacher'&&!doc.assignments.some(a=>a.teacher===x.teacher&&a.target===x.target&&a.subject===x.subject)){const g=doc.groups.find(g=>g.id===x.target),c=doc.classes.find(c=>classKey(c)===x.target);doc.assignments.push({id:x.localId,pending:true,teacher:x.teacher,subject:x.subject,target:x.target,level:g?.level||c?.level,venue:g?.venue||GSISVenueGroups.room(doc,x.target)?.id||''})}
 if(x.operation==='removeTeacher')doc.assignments=doc.assignments.filter(a=>!(a.teacher===x.teacher&&a.target===x.target&&a.subject===x.subject));
 if(['updateClass','deleteClass'].includes(x.operation)){
  const c=doc.classes.find(c=>c.ref===x.ref);if(!c)return;const old=classKey(c),next=x.operation==='deleteClass'?'':String(x.level)+x.shortName;
  doc.venues.forEach(r=>GSISVenueGroups.setForms(r,GSISVenueGroups.forms(r).map(f=>f===old?next:f)));doc.assignments.filter(a=>a.target===old).forEach(a=>{a.target=next;a.level=x.level});doc.groups.forEach(g=>{if(g.form===old)g.form=next;g.sources=(g.sources||[]).map(s=>s===old?next:s)});
  if(x.operation==='deleteClass')doc.classes=doc.classes.filter(r=>r!==c);else Object.assign(c,{level:x.level,name:x.name,shortName:x.shortName});
 }
 if(x.operation==='addClass'&&!doc.classes.some(c=>c.ref===x.ref))doc.classes.push({ref:x.ref,level:x.level,name:x.name,shortName:x.shortName,...(x.undefinedDraft?{undefinedDraft:true}:{})});
 if(x.operation==='addTG'&&!doc.groups.some(g=>g.id===x.localId)){const g={id:x.localId,name:x.name,level:x.level,subject:x.subject,venue:x.venue,form:x.form,...(x.form==='P'+x.level?{levelWide:true}:{}),...(x.anchorRef&&x.form!=='P'+x.level?{anchorRef:x.anchorRef}:{}),sources:x.sources};if(x.classRefs!==undefined)Object.assign(g,GSISVenueGroups.workloadFields(doc,x),GSISVenueGroups.scopeFields(doc,x));if(!g.anchorRef)delete g.anchorRef;doc.groups.push(g);}
 if(x.operation==='moveTG'){const g=doc.groups.find(g=>g.id===x.groupId);if(g)g.venue=x.venue;doc.assignments.filter(a=>a.target===x.groupId).forEach(a=>a.venue=x.venue)}
 if(x.operation==='moveClass'){try{GSISVenueGroups.move(doc,x)}catch{}}
}
let pendingProjection=null;
function orderedClassDraftEdits(edits){
 const nameSet=x=>['upsertClassNameSet','deleteClassNameSet'].includes(x.operation),ordered=edits.filter(x=>x.operation==='setSubjectType').concat(edits.filter(nameSet),edits.filter(x=>x.operation!=='setSubjectType'&&!nameSet(x))),at=ordered.findIndex(x=>x.operation==='renameClasses');
 if(at<0)return ordered;
 // A newly formed class can use a name that this same batch frees. Keep its dependent allocations after its creation.
 const rows=ordered[at].rows,refs=new Set(ordered.slice(0,at).filter(x=>x.operation==='addClass'&&rows.some(r=>r.level===x.level&&(r.expected.shortName.toLowerCase()===x.shortName.toLowerCase()||r.expected.name.toLowerCase()===x.name.toLowerCase()))).map(x=>x.ref));
 const dependent=x=>refs.has(x.ref)||refs.has(x.targetRef)||refs.has(x.formRef)||refs.has(x.anchorRef)||x.sourceRefs?.some(ref=>refs.has(ref)),deferred=ordered.slice(0,at).filter(dependent);
 return ordered.slice(0,at).filter(x=>!dependent(x)).concat(ordered[at],deferred,ordered.slice(at+1));
}
function classRenameSource(doc,edits){const source=clone(doc);for(const x of orderedClassDraftEdits(edits)){if(x.operation==='renameClasses')break;projectEdit(source,x);}return source;}
function invalidatePendingProjection(){pendingProjection=null;}
function applyPendingProjection(){
 const currentDoc=v();if(!currentDoc||!draftBase){invalidatePendingProjection();return;}
 const edits=queuedEdits(),signature=JSON.stringify(edits),memo=pendingProjection;
 // Draft inputs are mutable/coalesced. Their content, the immutable base identity,
 // the saved note and live catalogue references all participate in reuse.
 if(memo&&memo.base===draftBase&&memo.notes===draftBase.notes&&memo.doc===currentDoc&&memo.version===current&&memo.session===sessionEpoch&&memo.email===lastEmail&&memo.role===role&&memo.roles===roleCatalogue&&memo.staff===staffCatalog&&memo.fields===contactSysFields&&memo.signature===signature)return;
 const doc=clone(draftBase);orderedClassDraftEdits(edits).forEach(x=>projectEdit(doc,x));state.versions=state.versions.map(x=>x.id===current?doc:x);
 if(!edits.length){draftBase=null;queueError='';invalidatePendingProjection();return;}
 pendingProjection={base:draftBase,notes:draftBase.notes,doc,version:current,session:sessionEpoch,email:lastEmail,role,roles:roleCatalogue,staff:staffCatalog,fields:contactSysFields,signature};
}
function newTGName(doc,value){
 if(typeof value!=='string'||!value.trim()||value.length>60)throw Error('Enter a teaching group name of up to 60 characters.');
 const name=value.trim();
 if(doc.groups.some(g=>String(g.name||'').trim().toLowerCase()===name.toLowerCase()))throw Error('Teaching group “'+name+'” already exists in this version or draft. Use its existing row, or enter a different name.');
 return name;
}
function queueCell(x){if(x.operation==='clearVenueAssignments'&&!canClearVenueAssignments())throw Error('Only Admin can clear venue assignments in an unpublished planning version.');if(x.operation==='setSubjectType'&&!admin()){alert('Only Admin can change Subject Type.');return;}if(['addTeacher','removeTeacher'].includes(x.operation)&&x.subject==='PAL'&&!canEditPAL()){alert('Only YHs and Admin can edit PAL in Auto mode.');return;}if(['setReliefSettings','setPAL'].includes(x.operation)&&!admin()){alert('Only Admin can change relief rules.');return;}
 if(!token||!(kp()||admin()))return;
 if(queueFlight){alert('Finish or retry the submitted save before editing again.');return}
 if(x.operation==='addTG')x.name=newTGName(v(),x.name);
 if(x.operation==='removeTeacherProfile'&&!admin())throw Error('Only Admin can delete a teacher.');
 if(['setTeacherField','upsertTeacherProfile'].includes(x.operation)){const preview=clone(v());projectEdit(preview,x);const message=teacherNameError(preview,x.teacher);if(message)throw Error(message);}
 if(x.operation==='addTeacher'&&x.subject==='FT'){const existing=v().assignments.find(a=>a.subject==='FT'&&a.teacher===x.teacher);if(existing){alert('This teacher is already FT for '+existing.target+'. Remove that assignment first.');return;}}
 if(x.target&&!x.targetRef)x.targetRef=classInfo(x.target)?.ref;if(x.form&&!x.formRef)x.formRef=classInfo(x.form)?.ref;if(x.sources&&!x.sourceRefs)x.sourceRefs=x.sources.map(s=>classInfo(s)?.ref||null);
 if(!draftBase)draftBase=clone(v());
 if(x.operation==='addTeacher')x.localId='pending-'+uid();
 const earlier=x.operation==='updateTG'?null:cellQueue.find(y=>queueKey(x)===queueKey(y));
 if(x.operation==='setExclusionCell'&&x.checked===(earlier?earlier.expected:x.expected)){cellQueue=cellQueue.filter(y=>y!==earlier);viewEpoch++;applyPendingProjection();drawQueueStatus();updateExclusionRows([x.teacher]);return;}
 if(earlier){const expected=earlier.expected;const op=earlier.operation==='addClass'&&x.operation==='updateClass'?'addClass':x.operation;Object.assign(earlier,x,{expected,operation:op})}else cellQueue.push(x);
 viewEpoch++;if(x.operation==='setOffload')projectEdit(v(),x);else applyPendingProjection();drawQueueStatus();
 if(!['Ledger','HR Terms','Teachers','Offload','Load Settings','Subject Type','Level Exclusions','Fortnight Split'].includes(tab)&&!document.querySelector('dialog').open&&!inlineDraftEditor?.open)render();
}
function drawQueueStatus(){
 persistClassDraft();
 let bar=el('saveQueue');if(!bar){bar=document.createElement('div');bar.id='saveQueue';document.querySelector('.workspace-bar').append(bar)}
 const count=queuedEdits().length,editable=['Venues','Relief Settings','Workload','IP Deploy','Ledger','HR Terms','Teachers','Offload','Classes','Level Exclusions','Load Settings'].includes(tab)&&(kp()||admin())||tab==='Subject Type'&&admin();
 bar.hidden=!editable&&!count;bar.replaceChildren();
 const teacherError=teacherInputError()||teacherNameError(v())||classRenameError();
 const status=document.createElement('span');status.setAttribute('role','status');status.textContent=teacherError||classDraftStorageError||queueError||(count?(queueFlight?(queueFlight.running?'Saving':'Save unconfirmed'):'Unsaved')+' · '+count+' change(s)':'No unsaved changes');bar.append(status);
 bar.append(button(queueError?'Retry save':'Save to online',()=>{document.activeElement?.blur();pumpQueue(true)},!count||!!queueFlight?.running||!!teacherError),button('Discard',discardDrafts,!count||!!queueFlight));
 if(queueError)bar.append(button('Review',resolveQueue));
 if(count)el('status').textContent=queueError?'Save needs attention':queueFlight?'Saving…':'Unsaved changes';
 for(const input of el('content').querySelectorAll('.load-cell input')){const pending=queuedEdits().some(x=>x.operation==='setLoad'&&x.level===input.dataset.level&&x.subject===input.dataset.key);input.classList.toggle('pending',pending);input.title=pending?'Unsaved change':''}
 if(v())for(const n of el('content').querySelectorAll('[data-ft-level]'))n.textContent=loadValue(v(),n.dataset.ftLevel,'FT');
}
function discardDrafts(){if(inlineDraftEditor?.open){alert('Apply or cancel the open selection first.');return}if(queueFlight)return;if(!confirm('Discard all unsaved changes in this version?'))return;state.versions=state.versions.map(x=>x.id===current&&draftBase?clone(draftBase):x);draftBase=null;cellQueue=[];queueError='';classDraftRecoveryConflict=false;persistClassDraft();unsavedDraft=false;render();refresh()}

function saveWireEdits(edits){
 if(edits.some(x=>x.operation==='renameClasses'&&x.rows.some(row=>row.undefinedDraft||row.shortName.startsWith('__undefined_'))||x.operation==='addClass'&&(x.undefinedDraft||x.shortName.startsWith('__undefined_'))))throw Error('Complete every undefined class name before Save to online.');
 return orderedClassDraftEdits(edits).map(x=>['setAscExportSettings','setOrganisation','setDuties','setMembership','setMasterOptions'].includes(x.operation)?{operation:'patchPlanning',source:x.operation,kind:x.kind,changes:GSISFields.diff(x.expected,x.value)}:x).filter(x=>!x.changes||x.changes.length);
}
function applyFieldDelta(delta){
 if(delta.versionId!==current||!v())return false;
 if(snapshotCache&&delta.revision<snapshotCache.revision)return false;
 const projection=delta.reliefProjection;
 if(projection&&(projection.versionId!==current||projection.revision!==delta.revision||!(projection.unchanged===true?v()?.reliefResults:Array.isArray(projection.reliefResults?.teachers))))throw Error('Calculation revision does not match the saved change.');
 if(projection?.previousRevision!==undefined&&(snapshotCache?.id!==current||snapshotCache?.revision!==projection.previousRevision||delta.revision!==projection.previousRevision+1||v()?.reliefResults?.stale||v()?.reliefResults?.pending))throw Error('Refresh required to retain the previous calculation.');
 if(projection?.unchanged&&projection.calculationVersion&&v()?.reliefResults?.calculationVersion!==projection.calculationVersion)throw Error('Refresh required for the current relief calculation model.');
 const fields=GSISFields.flat(v());for(const x of delta.changes||[]){if(x.value===null)delete fields[x.key];else fields[x.key]=x.value;}
 let doc=GSISFields.inflate(fields);
 if(projection?.unchanged){delete doc.reliefResults.pending;delete doc.reliefResults.stale;}
 else if(projection){doc.reliefResults=projection.reliefResults;if(admin()&&projection.reliefAdmin)doc.reliefAdmin=projection.reliefAdmin;else delete doc.reliefAdmin;}
 if(delta.catalogue){const row=delta.catalogue.versions.find(x=>x.id===current);doc={...doc,...row};state.versions=delta.catalogue.versions.map(x=>x.id===current?doc:x);el('version').innerHTML=options(state.versions.map(x=>[x.id,x.name+' · '+(x.publication||'Unpublished')]),current);el('tag').textContent=publicationText(doc);}
 else state.versions=state.versions.map(x=>x.id===current?doc:x);
 if(snapshotCache){snapshotCache.globalRevision=delta.globalRevision;snapshotCache.revision=delta.revision;}if(Number.isFinite(delta.globalRevision))acceptedSnapshot={epoch:sessionEpoch,id:current,revision:delta.globalRevision};
 if(delta.changes?.length||projection){const paths=(delta.changes||[]).map(x=>JSON.parse(x.key)),onlyExclusions=paths.length&&paths.every(p=>!p.length||['levelExclusions','audit'].includes(p[0]));const touched=[...new Set(paths.filter(p=>p[0]==='levelExclusions'&&String(p[1]).startsWith('@')).map(p=>p[1].slice(1)))];if(!onlyExclusions||!updateExclusionRows(touched))render(true);}return true;
}
async function pumpQueue(retry=false){
 if(noteSaving()){alert('Wait for the note save to finish.');return;}
 if(!token||queueFlight?.running||(!queueFlight&&!cellQueue.length))return;const teacherError=teacherInputError()||teacherNameError(v())||classRenameError();if(teacherError){drawQueueStatus();alert(teacherError);return;}const focusedExclusion=document.activeElement?.matches?.('#content [data-exclusion-level]')?document.activeElement:null;document.activeElement?.blur();if(inlineDraftEditor?.open||unsavedDraft){alert('Finish the current input before saving.');return;}
 const resuming=!!queueFlight;
 if(!queueFlight){queueFlight={versionId:current,requestId:uid(),issuedAt:Date.now(),edits:cellQueue.splice(0)};queueFlight.wire=saveWireEdits(queueFlight.edits);queueFlight.baselineRevision=snapshotCache?.revision;}
 const actionTrace=beginUserAction('save'),flight=queueFlight,epoch=sessionEpoch;flight.running=true;queueError='';drawQueueStatus();const finish=beginLoading(el('content'),'Saving changes…');let committed=false,result;
 try{
  if(retry&&resuming)result=await api('receipt',{versionId:flight.versionId,requestId:flight.requestId},false);
  if(!result?.saved)result=await api('change',{operation:'saveDraft',versionId:flight.versionId,requestId:flight.requestId,issuedAt:flight.issuedAt,clientId,edits:flight.wire},false);
  if(epoch!==sessionEpoch)throw Error('Sign in with the same account to confirm this save.');if(!result.saved)throw Error('Save confirmation pending');committed=true;
 }catch(e){
  if(![400,403,404,409].includes(e.status)){try{result=await api('receipt',{versionId:flight.versionId,requestId:flight.requestId},false);committed=!!result.saved;}catch(ignored){}}
  if(!committed){flight.running=false;if([400,403,404,409].includes(e.status)){cellQueue=flight.edits;queueFlight=null;}queueError=e.message+' Draft retained.'+(queueFlight?' Check/retry uses the original save ID.':'');drawQueueStatus();}
 }finally{finish();}
 if(!committed){el('content').inert=!!queueFlight;finishUserAction(actionTrace,false);return;}actionTrace.acknowledgedMs=Date.now()-actionTrace.started;
 // Acknowledgement is final. No display failure may turn this back into a write failure.
 queueFlight=null;queueError='';cellQueue=[];classDraftRecoveryConflict=false;persistClassDraft();const baseline=draftBase,reliefPending=!!v()?.reliefResults?.pending;draftBase=null;unsavedDraft=false;viewEpoch++;el('content').inert=false;el('status').textContent='Saved';
 try{state.versions=state.versions.map(x=>x.id===current&&baseline?baseline:x);if(reliefPending)markReliefStale();const delta=result.delta||await api('delta',{versionId:current,since:flight.baselineRevision,authority:role},false);if(delta.resync){markReliefStale();await refresh(true);}else applyFieldDelta(delta);el('status').textContent=v()?.reliefResults?.stale?'Saved · refresh needed':'Saved';el('connection').textContent=result.venueClear?'Saved online. Venue assignments cleared: '+venueClearSummary(result.venueClear)+'.':v()?.reliefResults?.stale?'Your save is confirmed. Use Refresh to reload calculated R.':connectionText();drawQueueStatus();if(result.conflicts?.length)showConflicts(result.conflicts,'Saved — conflicts resolved');else if(focusedExclusion?.isConnected)focusedExclusion.focus({preventScroll:true});}
 catch(e){snapshotCache=null;el('status').textContent='Saved · refresh needed';el('connection').textContent='Your save is confirmed. Use Refresh to reload the display. '+e.message;}
 finishUserAction(actionTrace,!v()?.reliefResults?.pending&&!v()?.reliefResults?.stale&&!!snapshotCache);
}

function savedNoticeKey(x){return JSON.stringify([lastEmail,current,x.requestId,x.where]);}
function scheduleSavedNotices(){
 clearTimeout(noticeTimer);const version=current,email=lastEmail,notices=(v()?.conflictNotices||[]).filter(x=>!seenConflictNotices.has(savedNoticeKey(x)));
 if(!notices.length)return;
 noticeTimer=setTimeout(()=>{if(current!==version||lastEmail!==email)return;if(document.querySelector('dialog').open){scheduleSavedNotices();return;}
  notices.forEach(x=>seenConflictNotices.add(savedNoticeKey(x)));showSavedNotices(notices,version,email);
 },250);
}
function showSavedNotices(notices,version,email){
 const ids=[...new Set(notices.map(x=>x.requestId))];
 modal('Saved values changed','<p>These are historical save notices. The current saved values are already in use. Acknowledge to stop showing these notices on reload; the audit record is kept.</p>'+conflictNoticeHTML(notices),async()=>{
  const result=await api('acknowledgeNotices',{versionId:version,eventIds:ids});if(!result.acknowledged)throw Error('Acknowledgement was not confirmed. Retry.');
  if(lastEmail===email){const doc=state.versions.find(x=>x.id===version);if(doc)doc.conflictNotices=(doc.conflictNotices||[]).filter(x=>!ids.includes(x.requestId));snapshotCache=null;}
 });document.querySelector('#ok').textContent='Acknowledge';document.querySelector('dialog footer button[value="cancel"]').textContent='Later';
}
function conflictNoticeHTML(conflicts){const alias=s=>String(s).replace(/@gsps\.edu\.sg$/i,'');return '<div class="conflict-list">'+conflicts.map(x=>'<p><strong>'+esc(x.where)+'</strong><br>'+esc(alias(x.overwrittenBy))+' → '+esc(alias(x.replacementBy))+'</p><pre>'+esc(JSON.stringify(x.overwrittenValue))+' → '+esc(JSON.stringify(x.replacementValue))+'</pre>').join('')+'</div>';}
function showConflicts(conflicts,title){modal(title,'<p>The current saved values are in use. These notices describe which earlier values changed; unrelated edits were retained.</p>'+conflictNoticeHTML(conflicts),async()=>{});document.querySelector('#ok').textContent='Close'}

function draftDisplayValue(d,x){if(x.operation==='renameClasses')return x.rows.map(row=>({ref:row.ref,...classMetadata(d.classes.find(c=>c.ref===row.ref))}));if(x.operation==='clearVenueAssignments')return GSISVenueGroups.clearState(d);if(x.operation==='setSubjectType')return d.subjectTypes?.[x.subject]??null;if(x.operation==='setPAL')return d.pal||null;if(x.operation==='setReliefSettings')return d.relief||null;if(['initReporting','setReportingOfficer'].includes(x.operation))return GSISReporting.value(d,x);if(x.operation==='consolidateCCEEL')return GSISTGScope.state(d);if(x.operation==='setWorkload')return d.workload||null;if(['updateTG','removeTG','moveClassBlock','moveVenueGroup'].includes(x.operation))return GSISVenueGroups.state(d,x);if(x.operation==='setFortnight')return d.fortnight?.[x.row]?.[x.field]??'';if(x.operation==='setOrganisation')return d.organisations?.[x.kind]||GSISPlanning.groups(x.kind);if(x.operation==='setDuties')return d.duties||GSISPlanning.duties();if(x.operation==='setMembership')return d.membership||[];if(x.operation==='setMasterOptions')return d.masterOptions||{};
 if(x.operation==='setOffload')return d.offload||{tags:[],staff:{}};if(x.operation==='removeTeacherProfile')return d.teachers.find(t=>t.id===x.teacher)||null;if(x.operation==='setClassAbility')return d.classes.find(c=>c.ref===x.ref)?.ability||'';
 if(x.operation==='setTeacherField')return (d.teacherDrafts?.[x.teacher]||d.teachers.find(t=>t.id===x.teacher)?.profile||{})[x.field]||'';
 if(x.operation==='setHRTerms')return d.hrTerms?.[x.field]||[];
 if(x.operation==='upsertTeacherProfile')return d.teacherDrafts?.[x.teacher]||d.teachers.find(t=>t.id===x.teacher)?.profile||null;
 if(['upsertClassNameSet','deleteClassNameSet'].includes(x.operation))return d.classNameSets?.find(t=>t.id===(x.set?.id||x.setId))||null;
 if(x.operation==='setTeacherNote')return d.teacherNotes?.[x.teacher]||'';
 if(x.operation==='setLoad')return d.loads[x.level]?.[x.subject]??null;
 if(x.operation==='setExclusionCell')return !!d.levelExclusions.find(r=>r.teacher===x.teacher)?.levels.includes(x.level);
 if(['addClass','updateClass','deleteClass'].includes(x.operation))return d.classes.find(c=>c.ref===x.ref)||null;
 const target=x.targetRef?d.classes.find(c=>c.ref===x.targetRef):null,form=x.formRef?d.classes.find(c=>c.ref===x.formRef):null;
 if(['addTeacher','removeTeacher'].includes(x.operation))return d.assignments.some(a=>a.target===(target?classKey(target):x.target)&&a.subject===x.subject&&a.teacher===x.teacher);
 if(x.operation==='moveClass')return GSISVenueGroups.room(d,form?classKey(form):x.form)?.id||'';
 if(x.operation==='moveTG')return d.groups.find(g=>g.id===x.groupId)?.venue||'';
 return d.groups.find(g=>g.id===x.localId)||null;
}
async function resolveQueue(){
 if(queueFlight?.running){alert('Waiting for the current save response. Your draft is retained.');return}
 const edits=clone(queuedEdits());if(!edits.length)return;
 const version=current,epoch=sessionEpoch,signature=JSON.stringify(queuedEdits()),flight=queueFlight;
 let saved=null;
 // Show feedback immediately. A slow or failed read must never hide the review or discard a draft.
 modal('Review pending changes','<p>Your '+edits.length+' pending change(s) are retained.</p><section data-review-content><p role="status">Checking current saved values…</p></section>',async d=>{
  if(!active())throw Error('The session or draft changed. Close this review and open it again.');
  if(!saved)throw Error('Check current saved values before continuing.');
  if(classDraftRecoveryConflict&&!flight){
   const next=clone(edits),rename=next.find(x=>x.operation==='renameClasses'),source=classRenameSource(saved,edits);
   for(const row of rename.rows){const cl=source.classes.find(c=>c.ref===row.ref);if(!cl)throw Error('A draft class was deleted. Keep this draft for reference, or discard it and start from current saved classes.');row.expected=classMetadata(cl);}
   rename.expected=rename.rows.map(row=>({ref:row.ref,...row.expected}));draftBase=clone(saved);cellQueue=next;classDraftRecoveryConflict=false;queueError='Reviewed class draft retained. Complete any undefined names before saving.';invalidatePendingProjection();applyPendingProjection();drawQueueStatus();render();return;
  }
  const inputs=[...d.querySelectorAll('[data-review-tg-name]')];
  if(inputs.length){
   const next=clone(edits),names={groups:clone(saved.groups||[])};
   inputs.forEach(input=>{next[Number(input.dataset.reviewTgName)].name=input.value;});
   for(const x of next){
    if(x.operation==='addTG'){x.name=newTGName(names,x.name);names.groups.push({id:x.localId,name:x.name});}
    else if(x.operation==='removeTG')names.groups=names.groups.filter(g=>g.id!==x.groupId);
    else if(x.operation==='updateTG'){const g=names.groups.find(g=>g.id===x.groupId);if(g&&x.name!==undefined)g.name=x.name;}
   }
   // Validate a complete replacement before changing any queue entry. IDs and expected values stay intact.
   const projected=clone(draftBase||saved);
   orderedClassDraftEdits(next).forEach(x=>projectEdit(projected,x));
   cellQueue=next;queueError='';queueAttempts=0;viewEpoch++;invalidatePendingProjection();applyPendingProjection();drawQueueStatus();
  }else{queueError='';queueAttempts=0;await pumpQueue(true);}
 });
 const d=document.querySelector('dialog'),panel=d.querySelector('[data-review-content]'),ok=d.querySelector('#ok');
 const active=()=>d.open&&d.querySelector('[data-review-content]')===panel&&current===version&&sessionEpoch===epoch&&queueFlight===flight&&JSON.stringify(queuedEdits())===signature;
 ok.textContent=flight?'Retry same save':'Retry save';ok.disabled=true;
 const refreshButton=button('Check saved values again',read);refreshButton.type='button';refreshButton.dataset.reviewRefresh='';d.querySelector('footer').prepend(refreshButton);
 async function read(){
  if(!active())return;
  refreshButton.disabled=true;ok.disabled=true;saved=null;panel.innerHTML='<p role="status">Checking current saved values…</p>';
  try{
   const data=await api('bootstrap',{versionId:version},false);
   if(!active())return;
   const doc=data.current;if(!doc||doc.id!==version)throw Error('This version is no longer available.');saved=doc;
   const rename=edits.find(x=>x.operation==='renameClasses');if(!flight&&rename){const source=classRenameSource(doc,edits);classDraftRecoveryConflict=rename.rows.some(row=>JSON.stringify(classMetadata(source.classes.find(c=>c.ref===row.ref)))!==JSON.stringify(row.expected));}
   const projected=clone(doc),rows=[];
   for(const x of orderedClassDraftEdits(edits)){const index=edits.indexOf(x);
    let before,after,error='';
    try{before=draftDisplayValue(doc,x);projectEdit(projected,x);after=draftDisplayValue(projected,x);}catch(e){error=e.message;}
    const title=x.operation==='addTG'?'Add teaching group '+x.name:queueKey(x);
    rows.push('<section><h3>'+esc(title)+'</h3>'+(!flight&&x.operation==='addTG'?'<label>Teaching group name<input data-review-tg-name="'+index+'" maxlength="60" value="'+esc(x.name)+'"></label>':'')+(error?'<p role="alert">'+esc(error)+' Your draft is retained.</p>':'')+'<details><summary>Saved and draft values</summary><pre>'+esc('Saved: '+JSON.stringify(before??null)+'\nDraft: '+JSON.stringify(after??x))+'</pre></details></section>');
   }
   const canCorrect=!flight&&edits.some(x=>x.operation==='addTG');
   panel.innerHTML='<p role="status">Current saved values checked.</p><p>'+(canCorrect?'Correct any duplicate TG names below, then apply the corrections to your draft and save. Linked teacher assignments and your other edits are retained.':flight?'This save is unconfirmed. Retry checks the original save ID before sending it again.':'Your draft is retained. Retry sends these pending changes again.')+'</p>'+rows.join('');
   if(classDraftRecoveryConflict&&!flight)panel.insertAdjacentHTML('afterbegin','<p role="alert">Saved class names changed since this draft. Inspect the saved and draft values below. Use reviewed draft names keeps current teacher allocations and applies your chosen names only when you later save.</p>');
   ok.textContent=classDraftRecoveryConflict&&!flight?'Use reviewed draft names':canCorrect?'Apply corrections to draft':flight?'Retry same save':'Retry save';ok.disabled=false;
  }catch(e){if(active())panel.innerHTML='<p role="alert">'+esc(e.message)+'. Your draft is retained. Check saved values again when the connection is available.</p>';}
  finally{if(active())refreshButton.disabled=false;}
 }
 await read();
}
function deleteClassVisible(c,confirmRemoval=true){
 const key=classKey(c),as=v().assignments.filter(a=>a.target===key),groups=v().groups.filter(g=>g.classRefs?.includes(c.ref)||g.form===key||g.sources?.includes(key));
 if(as.length||groups.length){modal('Class is linked','<p>Resolve these references before deleting '+esc(key)+'.</p><p>Assignments: '+esc(as.map(a=>(v().teachers.find(t=>t.id===a.teacher)?.name||a.teacher)+' / '+a.subject).join(', ')||'None')+'</p><p>Teaching groups: '+esc(groups.map(g=>g.name).join(', ')||'None')+'</p>',async()=>{});document.querySelector('#ok').textContent='Close';return}
 if(!confirmRemoval||confirm('Delete '+key+' from this version? Its venue remains available.')){if(!c.ref)c.ref=uid();const added=cellQueue.find(x=>x.ref===c.ref&&x.operation==='addClass');if(added){cellQueue=cellQueue.filter(x=>x!==added);viewEpoch++;applyPendingProjection();render()}else queueCell({operation:'deleteClass',ref:c.ref,previous:key,expected:{level:c.level,name:c.name,shortName:classCode(c)}})}
}
// Per-table display preferences only; staff data and drafts are kept in memory, not browser storage.
function tablePrefs(key){try{return JSON.parse(localStorage.getItem('deploy.table.'+key)||'{}')}catch{return {}}}
function storeTablePrefs(key,p){try{localStorage.setItem('deploy.table.'+key,JSON.stringify(p))}catch{}}
function wireTableControls(root){
 root.querySelectorAll('table').forEach((t,tableIndex)=>{if(t.closest('.class-group-level')||t.dataset.controlsWired||t.dataset.noColumnControls!==undefined||t.tHead?.rows.length!==1||[...t.tHead.rows[0].cells].some(c=>c.colSpan>1||c.rowSpan>1))return;t.dataset.controlsWired='true';
  const key=tab+':'+(tab==='Ledger'?mode:'')+':'+tableIndex,p=tablePrefs(key),headers=[...t.querySelectorAll('thead th')];p.widths||={};p.hidden||=[];
  const labels=headers.map(th=>th.querySelector('button')?.textContent.replace(/ [↕▴▾]$/,'')||th.textContent);
  const cg=document.createElement('colgroup');headers.forEach(()=>cg.append(document.createElement('col')));t.prepend(cg);
  const cells=Array.from({length:headers.length},()=>[]),occupied=[];
  [...t.rows].forEach(row=>{let col=0;for(const cell of row.cells){while(occupied[col]>0)col++;cell.dataset.gridColumn=col;cells[col]?.push(cell);if(cell.rowSpan>1)occupied[col]=cell.rowSpan;col+=cell.colSpan||1}for(let i=0;i<occupied.length;i++)if(occupied[i]>0)occupied[i]--});
  const dense=true;
  const fitWidths=headers.map((h,i)=>{if(t.classList.contains('group-table'))return i?185:115;if(t.classList.contains('duty-table'))return i?260:85;const max=Math.max(labels[i].length,...cells[i].map(c=>Math.min(65,String(cellSortValue(c)).split('\n').reduce((n,s)=>Math.max(n,s.length),0))));return labels[i]==='Formal Role Name'?Math.max(420,max*8+28):tab==='Classes'&&/^P[1-6]$/.test(labels[i])?122:labels[i]==='Notes'||labels[i]==='Planner notes'?320:labels[i]==='Choices for this version'||labels[i]==='Options'?420:Math.min(480,Math.max(48,max*8+28));});
  function apply(){let total=0;headers.forEach((th,i)=>{const hidden=p.hidden.includes(labels[i]),width=tab==='Classes'&&/^P[1-6]$/.test(labels[i])?Math.max(122,p.widths[labels[i]]||0):p.widths[labels[i]]||(dense?fitWidths[i]:({Venue:80,'Class / TG':110,Teacher:170,'Planner notes':(tab==='Teachers'?470:220),Name:225,Version:210,Status:100,Actions:190,Notes:(tab==='Versions'?470:320),Actor:210,Time:170,Before:190,After:190}[labels[i]]||(['Classes','Level Exclusions','Versions','Audit'].includes(tab)?80:95)));cg.children[i].hidden=hidden;cg.children[i].style.width=hidden?'0px':width+'px';cells[i].forEach(c=>{c.hidden=hidden;c.style.width=hidden?'0px':width+'px';c.style.maxWidth=width+'px'});if(!hidden)total+=width});if(tab==='Audit'){const visible=headers.filter((h,i)=>!p.hidden.includes(labels[i])).length;t.style.width='100%';headers.forEach((h,i)=>{if(!p.hidden.includes(labels[i])){const w=parseFloat(cg.children[i].style.width)/total*100;cg.children[i].style.width=w+'%';cells[i].forEach(c=>{c.style.width='';c.style.maxWidth='none'})}});t.parentElement.style.width='100%'}else t.style.width=total+'px';t.style.minWidth='0';t.parentElement.style.minWidth='0';window.GSISTableRefresh?.();}
  const picker=document.createElement('details');picker.className='column-picker';picker.dataset.tableControlsId=key;t.dataset.tableControlsId=key;const title=document.createElement('summary');title.textContent='Columns';picker.append(title);const menu=document.createElement('div');picker.append(menu);
  headers.forEach((th,i)=>{
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!p.hidden.includes(labels[i]);label.append(check,document.createTextNode(labels[i]));menu.append(label);
   check.onchange=()=>{if(!check.checked&&p.hidden.length>=headers.length-1){check.checked=true;return}p.hidden=p.hidden.filter(x=>x!==labels[i]);if(!check.checked)p.hidden.push(labels[i]);apply();storeTablePrefs(key,p)};
   const grip=document.createElement('span');grip.className='resize-grip';grip.title='Drag to resize; double-click to fit';th.append(grip);
   grip.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const start=e.clientX,width=th.getBoundingClientRect().width;grip.setPointerCapture?.(e.pointerId);grip.onpointermove=move=>{p.widths[labels[i]]=Math.max(44,Math.min(900,width+move.clientX-start));apply()};const end=()=>{grip.onpointermove=null;storeTablePrefs(key,p)};grip.onpointerup=end;grip.onpointercancel=end};
   grip.onclick=e=>e.stopPropagation();grip.ondblclick=e=>{e.preventDefault();e.stopPropagation();const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=getComputedStyle(t).font||'14px Arial';let width=ctx.measureText(labels[i]).width+32;cells[i].forEach(c=>{const text=cellSortValue(c);width=Math.max(width,...String(text).split('\n').map(s=>ctx.measureText(s).width+24))});p.widths[labels[i]]=Math.min(600,Math.max(44,Math.ceil(width)));apply();storeTablePrefs(key,p)};
  });
  menu.append(button('Autofit all',()=>{headers.forEach((h,i)=>p.widths[labels[i]]=fitWidths[i]);apply();storeTablePrefs(key,p)}));
  menu.append(button('Show all',()=>{p.hidden=[];menu.querySelectorAll('input').forEach(x=>x.checked=true);apply();storeTablePrefs(key,p)}));
  (t.closest('.assignment-split')||t.parentElement).before(picker);apply();
 });
}
window.addEventListener('beforeunload',e=>{if(cellQueue.length||queueFlight||unsavedDraft||versionCreateAttempt){e.preventDefault();e.returnValue=''}});

function openLandmark(unit){const target=window.GSIS_VIEWPORTS?.find(v=>v.id==='layout');if(!target)return;const url=new URL(target.url);url.searchParams.set('view','campus');if(unit)url.searchParams.set('unit',unit);window.open(url.href,'_blank','noopener');}

if(window.location?.search?.includes('view=layout'))tab='Layout';
function wireTeacherNotes(root){root.querySelectorAll('.note-editor:not([readonly])').forEach(input=>{let old=input.value,start=input.value;input.onfocus=()=>{old=start=input.value};const stage=()=>{if(input.value!==old){if(!ensureTeacherProfile(input.dataset.noteTeacher))return;queueCell({operation:'setTeacherNote',teacher:input.dataset.noteTeacher,value:input.value,expected:old});old=input.value}unsavedDraft=!!teacherInputError();input.classList.toggle('dirty',queuedEdits().some(x=>x.operation==='setTeacherNote'&&x.teacher===input.dataset.noteTeacher))};input.oninput=stage;input.onblur=stage;input.onkeydown=e=>{if(e.key==='Escape'){input.value=start;stage();input.blur()}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();stage();input.blur()}}})}

function assignVenue(){
 if(unsavedDraft||editing||acquiring||busy){alert('Finish pending edits first.');return}
 selectionEditor('Assign a venue',`<label>Form class or teaching group<select id="venueTarget">${options([...classList().map(c=>['class:'+classKey(c),'Form class · '+classLabel(c)]),...v().groups.map(g=>['tg:'+g.id,'TG · '+g.name])])}</select></label><label>Venue<select id="venuePick"><option value="">Unassigned</option>${options(v().venues.map(r=>[r.id,r.id+(r.form?' · '+r.form:'')]))}</select></label><p>Classes sharing a venue are grouped together. Teaching groups may share a venue.</p>`,d=>{const target=d.querySelector('#venueTarget').value,venue=d.querySelector('#venuePick').value;return target.startsWith('class:')?stageChange('moveClass',{form:target.slice(6),venue}):stageChange('moveTG',{groupId:target.slice(3),venue})});
}


const TEACHER_FIELDS=['Basic Name','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active'];
let showInactiveTeachers=true;
const HR_FIELDS=TEACHER_FIELDS.slice(1).filter(k=>k!=='EO Appt Level');
function hrTermLists(){
 if(v()?.masterOptions&&Object.keys(v().masterOptions).length)return Object.fromEntries(HR_FIELDS.map(k=>[k,[...(v().masterOptions[k]||[])]]));
 if(contactSysFields)return Object.fromEntries(HR_FIELDS.map(k=>[k,[...(contactSysFields[k]||[])]]));
 if(v().hrTerms)return clone(v().hrTerms);
 const lists=Object.fromEntries(HR_FIELDS.map(k=>[k,[]]));for(const t of v().teachers){const p=t.profile||{Role:t.role||'',Active:t.active?'Y':'N'};for(const k of HR_FIELDS)if(p[k]&&!lists[k].includes(p[k]))lists[k].push(p[k]);}
 if(!lists.Role.includes('Teacher'))lists.Role.push('Teacher');
 lists.Active=['Y','N'];return lists;
}

function teacherTermLists(){return hrTermLists();}
function plannerTeacher(t){return GSISTeachingRules.resolve(t,roleCatalogue.length?roleCatalogue:undefined,staffCatalog.get(t.id),v()?.teacherDrafts?.[t.id])}
function plannerProfile(t){return clone(plannerTeacher(t).profile)}
// Inactive Contacts are a display-only pool until an explicit profile or note edit.
// Version-owned records always win; never add the pool to the version on render.
function teacherRoster(){
 const byId=new Map(v().teachers.map(t=>[t.id,plannerTeacher(t)]));
 for(const t of staffCatalog.values()){if(!byId.has(t.id)&&!v().removedTeachers?.[t.id]){const person=plannerTeacher(t);if(!person.active)byId.set(t.id,person)}}
 return [...byId.values()].filter(t=>!t.active||eligibleTeacher(t));
}
function teacherRosterEntry(id){const t=v().teachers.find(t=>t.id===id)||staffCatalog.get(id);return t?plannerTeacher(t):null}
function ensureTeacherProfile(id){
 if(v().teachers.some(t=>t.id===id))return true;
 const t=teacherRosterEntry(id);if(!t||t.active)return false;
 queueCell({operation:'upsertTeacherProfile',teacher:id,profile:plannerProfile(t),expected:null});
 return v().teachers.some(t=>t.id===id);
}
function teacherNameError(doc,id){
 if(!doc)return '';const normal=name=>String(name||'').replace(/\s+/g,' ').trim().toLowerCase();
 for(const t of doc.teachers||[]){if(id&&t.id!==id)continue;const other=doc.teachers.find(x=>x.id!==t.id&&normal(x.name)===normal(t.name));if(other)return 'TTb name “'+t.name+'” is already used by another '+(other.active?'active':'inactive')+' teacher'+(admin()?' ('+other.id+')':'')+'. Change the name or modifiers.';}
 return '';
}
function teacherInputError(){return [...document.querySelectorAll('[data-teacher-error][data-invalid-input]')].map(x=>x.textContent).find(Boolean)||'';}
function teacherProfilePreview(id,profile){const doc=clone(v());projectEdit(doc,{operation:'upsertTeacherProfile',teacher:id,profile});return doc;}
function teacherRowProfile(row){const t=teacherRosterEntry(row.dataset.rosterTeacher),profile=plannerProfile(t);row.querySelectorAll('.teacher-cell').forEach(i=>profile[i.dataset.field]=i.value.trim());return profile;}
function validateTeacherRow(row){
 const profile=teacherRowProfile(row),preview=teacherProfilePreview(row.dataset.rosterTeacher,profile),message=!profile['Basic Name']?'Enter a Basic Name.':teacherNameError(preview,row.dataset.rosterTeacher);
 row.querySelector('[data-teacher-name]').textContent=preview.teachers.find(t=>t.id===row.dataset.rosterTeacher).name;
 const error=row.querySelector('[data-teacher-error]');error.textContent=message;error.toggleAttribute('data-invalid-input',!!message);row.querySelector('[data-field="Basic Name"]').setCustomValidity(message);drawQueueStatus();return message;
}
function teacherNotesPage(root){
 root.innerHTML=hrReminderHTML()+'<p class="hint">Teacher details and planner notes belong to this version. Save changes, then publish. Making a teacher inactive clears their deployment allocations when saved. Changes to Contacts require Admin approval; GSPS Alias is required for new-contact approval; other personal details may be completed later.</p>';
 const toolbar=document.createElement('div');toolbar.className='tools';toolbar.append(button('Add teacher',()=>editTeacherProfile()),button('Add existing teacher',pickExistingTeacher));
 const label=document.createElement('label');label.className='show-inactive-toggle';label.innerHTML='<input type="checkbox" '+(showInactiveTeachers?'checked':'')+'> Show inactive';label.querySelector('input').onchange=e=>{if(teacherInputError()){e.target.checked=showInactiveTeachers;return;}showInactiveTeachers=e.target.checked;render()};toolbar.append(label);root.append(toolbar);
 const rows=teacherRoster().filter(t=>showInactiveTeachers||t.active).filter(t=>!query||[t.name,...Object.values(plannerProfile(t))].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(!a.active)-Number(!b.active));
 const workload=workloadData(),lists=teacherTermLists();root.insertAdjacentHTML('beforeend',table(['TTb Name',...TEACHER_FIELDS,'Planner notes',...(admin()?['Admin']:[])],rows.map(t=>{const p=plannerProfile(t);return '<tr data-roster-teacher="'+esc(t.id)+'" class="'+(!t.active?'inactive':'')+'"><td><span data-teacher-name>'+esc(t.name)+'</span>'+(!t.active?' <small>Inactive</small>':'')+(!v().teachers.some(x=>x.id===t.id)?' <small class="contact-pool-note">Contacts only</small>':'')+'<small class="warning-text" data-teacher-error role="alert">'+esc(teacherNameError(v(),t.id))+'</small>'+(workload.rows.find(r=>r.teacher.id===t.id)?.modifierWarnings||[]).map(x=>'<small class="workload-warning">'+esc(x)+'</small>').join('')+'</td>'+TEACHER_FIELDS.map(k=>'<td>'+(k==='EO Appt Level'?'<span>'+esc(p[k])+'</span>':k==='Basic Name'?'<input class="teacher-cell" data-teacher="'+esc(t.id)+'" data-field="'+esc(k)+'" value="'+esc(p[k])+'" maxlength="120" aria-label="Basic Name">':'<select class="teacher-cell" data-teacher="'+esc(t.id)+'" data-field="'+esc(k)+'" aria-label="'+esc(t.name+' '+k)+'"><option value=""></option>'+options([...new Set([...(lists[k]||[]),...(p[k]?[p[k]]:[])])].map(x=>[x,x]),p[k])+'</select>')+'</td>').join('')+'<td><textarea class="note-editor full-cell-note" data-note-teacher="'+esc(t.id)+'" aria-label="Notes for '+esc(t.name)+'" maxlength="4000" rows="1" '+(kp()?'':'readonly')+'>'+esc(v().teacherNotes?.[t.id]||'')+'</textarea></td>'+(admin()?'<td><details class="teacher-admin"><summary>ID / delete</summary><label>Stable ID<input value="'+esc(t.id)+'" readonly aria-label="Stable ID for '+esc(t.name)+'"></label>'+(v().teachers.some(x=>x.id===t.id)?'<button type="button" data-delete-teacher="'+esc(t.id)+'">Delete teacher</button>':'')+'</details></td>':'')+'</tr>'})));
 root.querySelectorAll('.teacher-cell').forEach(input=>{
  input.addEventListener('input',()=>{unsavedDraft=true;validateTeacherRow(input.closest('tr'));});
  input.addEventListener('change',()=>{const row=input.closest('tr'),t=teacherRosterEntry(input.dataset.teacher),field=input.dataset.field,value=input.value.trim(),previous=plannerProfile(t)[field]||'';
   if(validateTeacherRow(row)){unsavedDraft=true;return;}
   if(value===previous){unsavedDraft=!!teacherInputError();drawQueueStatus();return;}
   const profile=teacherRowProfile(row),changes=TEACHER_FIELDS.filter(k=>(profile[k]||'')!==(plannerProfile(t)[k]||'')),existing=v().teachers.find(x=>x.id===t.id);
   try{queueCell(existing&&changes.length===1?{operation:'setTeacherField',teacher:t.id,field:changes[0],value:profile[changes[0]],expected:plannerProfile(t)[changes[0]]||''}:{operation:'upsertTeacherProfile',teacher:t.id,profile,expected:v().teacherDrafts?.[t.id]||existing?.profile||null});}
   catch(e){row.querySelector('[data-teacher-error]').textContent=e.message;row.querySelector('[data-teacher-error]').setAttribute('data-invalid-input','');unsavedDraft=true;drawQueueStatus();return;}
   unsavedDraft=!!teacherInputError();const updated=v().teachers.find(x=>x.id===t.id);row.querySelector('[data-teacher-name]').textContent=updated.name;row.cells[3].textContent=updated.profile['EO Appt Level']||'';
   if(['Active','Subject Modifier'].includes(field)&&!unsavedDraft)render();else drawQueueStatus();
  });
 });
 root.querySelectorAll('[data-delete-teacher]').forEach(b=>b.onclick=()=>reviewTeacherDeletion(b.dataset.deleteTeacher));wireTeacherNotes(root);
}
function pickExistingTeacher(){
 const choices=[...staffCatalog.values()].filter(t=>eligibleTeacher(t)&&!v().removedTeachers?.[t.id]&&!v().teachers.some(r=>r.id===t.id&&r.active));
 selectionEditor('Add existing teacher','<label>Teacher<select id="existingTeacher"><option value="">Choose teacher…</option>'+options(choices.map(t=>[t.id,t.name+(t.active?'':' — inactive')]))+'</select></label>',d=>{const t=staffCatalog.get(d.querySelector('#existingTeacher').value);if(!t)throw Error('Choose a teacher.');const profile=plannerProfile(v().teachers.find(r=>r.id===t.id)||t);profile.Active='Y';queueCell({operation:'upsertTeacherProfile',teacher:t.id,profile,expected:v().teacherDrafts?.[t.id]||v().teachers.find(r=>r.id===t.id)?.profile||null})});
}
function editTeacherProfile(t){
 const id=t?.id||'new-'+crypto.randomUUID(),p=t?plannerProfile(t):Object.fromEntries(TEACHER_FIELDS.map(k=>[k,k==='Active'?'Y':'']));
 const lists=teacherTermLists();
 const body=TEACHER_FIELDS.map((k,i)=>'<label>'+esc(k)+(k==='EO Appt Level'?'<input data-profile="'+i+'" value="'+esc(p[k])+'" readonly>':k==='Basic Name'?'<input data-profile="'+i+'" maxlength="120" value="'+esc(p[k])+'" required>':'<select data-profile="'+i+'"><option value="">Choose…</option>'+options([...new Set([...(lists[k]||[]),...(p[k]?[p[k]]:[])])].map(x=>[x,x]),p[k])+'</select>')+'</label>').join('');
 const read=d=>Object.fromEntries(TEACHER_FIELDS.map((k,i)=>[k,d.querySelector('[data-profile="'+i+'"]').value.trim()]));
 const d=selectionEditor(t?'Edit teacher':'Add teacher',body,d=>{const profile=read(d);if(!profile['Basic Name'])throw Error('Enter a Basic Name.');for(const k of HR_FIELDS)if(profile[k]&&!lists[k].includes(profile[k])&&profile[k]!==p[k])throw Error('Choose '+k+' from HR Terms.');queueCell({operation:'upsertTeacherProfile',teacher:id,profile,expected:v().teacherDrafts?.[id]||v().teachers.find(r=>r.id===id)?.profile||null})});
 const validate=()=>{const message=teacherNameError(teacherProfilePreview(id,read(d)),id);d.querySelector('#formerror').textContent=message;d.querySelector('[data-profile="0"]').setCustomValidity(message);d.querySelector('#ok').disabled=!!message;};
 d.addEventListener('input',validate);d.addEventListener('change',validate);
}
function reviewTeacherDeletion(id){
 if(!admin()){alert('Only Admin can delete a teacher.');return;}
 const t=v().teachers.find(t=>t.id===id);if(!t)return;
 const impact=GSISPlanning.teacherImpact(v(),id),items=[];
 impact.assignments.forEach(a=>items.push((v().groups.find(g=>g.id===a.target)?.name||a.target)+' · '+subjectLabel(a.subject)));
 impact.organisations.forEach(g=>items.push(g.name+' · '+(g.slots.length+g.additionalDeputies.length+g.tls.length+g.legacyLeadership.length)+' allocation(s)'));
 impact.nonTeachingActivities.forEach(a=>items.push(a.code+' · '+a.name+' · '+a.weeklyPeriods+' periods/week'));
 impact.duties.forEach(d=>items.push(d.name+' · '+d.days.map(day=>GSISPlanning.days[Number(day)]).join(', ')));
 if(impact.reporting.staff.length||Object.keys(impact.reporting.officers).length)items.push('Span of Control links');
 if(impact.blocks!==null)items.push('Relief blocked cards');
 const body='<p>Delete <strong>'+esc(t.name)+'</strong> from <strong>'+esc(v().name)+'</strong> when you save changes.</p><label>Stable ID<input value="'+esc(t.id)+'" readonly></label><p>The record and these allocations will be removed together. Contacts and published snapshots stay unchanged.</p>'+(items.length?'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>No deployment allocations.</p>');
 const d=selectionEditor('Delete teacher',body,()=>queueCell({operation:'removeTeacherProfile',teacher:id,expected:clone(t),expectedImpact:impact}));d.querySelector('#ok').textContent='Delete from draft';
}
async function reviewTeacherPublication(){
 if(queuedEdits().length||unsavedDraft||editing||busy){alert('Save or discard drafts before publishing.');return}if(!admin()){alert('An Admin must review and publish.');return}busy=true;
 try{const review=await api('publishReview',{versionId:current});busy=false;const changes=review.changes,fields=review.fields||[],requestId=crypto.randomUUID();if(!changes.length){if(confirm((hrChoiceReminders().length?hrChoiceReminders().length+' staff value(s) fall outside these HR choices. Values will be retained and flagged.\n\n':'')+'Publish the saved revision and replace Contacts’ HR choices?'))await action('publish');return}
 const body='<p>Publishing <strong>'+esc(v().name)+'</strong></p>'+hrReminderHTML()+'<p>Choose the correct present value for each difference. The chosen value updates Contacts and this version. Other versions stay unchanged.</p>'+changes.map((x,i)=>'<fieldset><legend>'+esc(x.values['Basic Name'])+' · '+(x.removed?'Removed from version':x.isNew?'New contact':'Resolve differences')+'</legend>'+fields.map((k,j)=>{const old=x.expected?.[k]||'',next=x.values[k]||'',derived=['TTb Name','EO Appt Level'].includes(k),different=!derived&&TEACHER_FIELDS.includes(k)&&!x.isNew&&old!==next;return '<label>'+esc(k)+(different?'<select data-native data-approval="'+i+'-'+j+'" required><option value="">Choose value…</option><option value="contacts">Contacts: '+esc(old||'(blank)')+'</option><option value="deploy">Deploy: '+esc(next||'(blank)')+'</option></select>':'<input data-approval="'+i+'-'+j+'" value="'+esc(next)+'" '+(derived||TEACHER_FIELDS.includes(k)?'readonly':'')+' '+(x.isNew&&k==='GSPS Alias (@gsps.edu.sg)'?'required':'')+'>')+'</label>'}).join('')+'</fieldset>').join('');
 let submitted=null;const d=selectionEditor('Review Contacts and publish',body,async d=>{if(!submitted){submitted=changes.map((x,i)=>({id:x.id,expected:x.expected,values:Object.fromEntries(fields.map((k,j)=>{const input=d.querySelector('[data-approval="'+i+'-'+j+'"]');if(input.tagName==='SELECT'){if(!input.value)throw Error('Choose which '+k+' value to take');return [k,input.value==='contacts'?x.expected[k]:x.values[k]]}if(x.isNew&&k==='GSPS Alias (@gsps.edu.sg)'&&!input.value.trim())throw Error('GSPS Alias is required for new contacts');return [k,input.value]}))}));d.querySelectorAll('[data-approval]').forEach(i=>{if(i.tagName==='SELECT')i.disabled=true;else i.readOnly=true})}if(!editing)await acquire('meta');try{await change('publish',{requestId,contactApprovals:submitted})}catch(e){if(e.status===409)await release();throw e}},null,el('content'));d.classList.add('publication-review');el('content').prepend(d);d.querySelector('#ok').textContent='Approve and publish';const heading=d.querySelector('h3');heading.tabIndex=-1;heading.focus({preventScroll:true});window.GSISTableRefresh?.();requestAnimationFrame(()=>{if(d.isConnected)heading.scrollIntoView?.({block:'start'})});
 }catch(e){alert(e.message)}finally{busy=false}
}

function stageChange(operation,args){const x={operation,...args};if(operation==='clearVenueAssignments')x.expected=GSISVenueGroups.clearState(v());else if(operation==='addTG'){x.localId=uid();x.expected=null}else if(['updateTG','removeTG','moveClassBlock','moveVenueGroup'].includes(operation))x.expected=clone(GSISVenueGroups.state(v(),x));else if(operation==='moveClass')x.expected=GSISVenueGroups.room(v(),x.form)?.id||'';else if(operation==='moveTG')x.expected=v().groups.find(g=>g.id===x.groupId)?.venue||'';queueCell(x)}
function packToolbar(root){
 let actions=el('viewActions');if(!actions){actions=document.createElement('div');actions.id='viewActions';el('viewFilters').after(actions)}actions.replaceChildren();
 const addGroup=nodes=>{if(!nodes.length)return;const group=document.createElement('div');group.className='toolbar-group';const divider=document.createElement('span');divider.className='toolbar-divider';divider.setAttribute('aria-hidden','true');divider.textContent='|';group.append(divider,...nodes);actions.append(group)};
 // Related actions wrap together; a group never splits over two lines.
 const direct=[...root.children].filter(n=>n.tagName==='BUTTON');for(let i=0;i<direct.length;i+=3)addGroup(direct.slice(i,i+3));
 for(const tools of root.querySelectorAll(':scope > .tools,:scope > .layout-tools'))addGroup([tools]);
 for(const picker of root.querySelectorAll('.column-picker'))addGroup([picker]);
 
}

if(window.location?.search&&new URLSearchParams(window.location.search).get('view')==='campus')openLandmark(new URLSearchParams(location.search).get('unit')||'');



function legacyOffloadHTML(value){
 const label=k=>({staff:'Staff entries',tags:'Tags and factors',legacyRows:'Original rows',unresolved:'Unmatched entries',staffId:'Teacher',_row:'Source row'}[k]||String(k).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '));
 const cell=x=>x==null?'':typeof x==='object'?Array.isArray(x)&&x.every(y=>y==null||typeof y!=='object')?esc(x.join(', ')):rows(x):esc(x);
 function rows(x){if(x==null||typeof x!=='object')return esc(x);if(Array.isArray(x)){if(!x.length)return '<p>No entries.</p>';if(x.every(y=>y&&typeof y==='object'&&!Array.isArray(y))){const keys=[...new Set(x.flatMap(Object.keys))];return '<div class="legacy-table-wrap"><table data-no-sort="true" class="legacy-table"><thead><tr>'+keys.map(k=>'<th>'+esc(label(k))+'</th>').join('')+'</tr></thead><tbody>'+x.map(r=>'<tr>'+keys.map(k=>'<td>'+cell(r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}return '<ul>'+x.map(v=>'<li>'+cell(v)+'</li>').join('')+'</ul>';}
  return '<dl class="legacy-values">'+Object.entries(x).map(([k,v])=>'<dt>'+esc(v&&typeof v==='object'?(label(k)):label(k))+'</dt><dd>'+cell(v)+'</dd>').join('')+'</dl>';
 }
 return Object.entries(value).map(([k,v])=>{if(k==='staff'&&v&&typeof v==='object')v=Object.entries(v).map(([id,values])=>({Teacher:v404LegacyTeacherName(id),...(values&&typeof values==='object'?values:{Value:values})}));return '<details class="legacy-section" open><summary>'+esc(label(k))+'</summary>'+rows(v)+'</details>';}).join('');
}
function v404LegacyTeacherName(id){return v().teachers.find(t=>t.id===id)?.name||id;}
function offloadPage(root){
 const current=GSISTeachingRules.migrate(v().offload),editable=admin(),sources=['Appointment group','Staff tag','Role','Employment Modifier','Subject Modifier','Appointment Status','Membership'];
 root.innerHTML='<p class="hint">Offload applies to teaching periods only. A Role percentage replaces the general Appointment group percentage. Blank uses the general rate; 0% is an explicit override. Other independent rules multiply remaining capacity; the lowest weekly cap applies. UT caps count total actual workload: FTT, teaching, PD, duties and other countable non-teaching periods. Other caps count FTT + teaching. Individual targets and quota bands are shown in Workload. Rules belong to this version. Admin edits; KP views.</p>';
 const tools=document.createElement('div');tools.className='tools';tools.append(button('Add rule',()=>{current.tags.push({id:uid(),name:'New rule '+(current.tags.length+1),source:'Role',match:'',percent:'',actingPercent:'',periods:'',notes:''});stage();render()},!editable));root.append(tools);
 const choices=source=>source==='Appointment group'?['HOD','Jnr KP','ST','LT','MTT']:source==='Staff tag'?[...new Set([...roleCatalogue.map(r=>r.role),...['Employment Modifier','Subject Modifier','Appointment Status'].flatMap(k=>hrTermLists()[k]||[])])].filter(value=>eligibleTeacher({role:value})):source==='Membership'?['SMC','KP','TL','SDT','CMT']:source==='Role'?roleCatalogue.map(r=>r.role).filter(role=>!current.tags.some(t=>t.source==='Role'&&t.match===role)):hrTermLists()[source]||[];
 const rows=current.tags.map(t=>'<tr><td><input data-rule="'+esc(t.id)+'" data-prop="name" value="'+esc(t.name)+'" aria-label="Rule name"></td><td><select data-rule="'+esc(t.id)+'" data-prop="source" aria-label="Match field">'+options(sources.map(x=>[x,x]),t.source)+'</select></td><td><select data-rule="'+esc(t.id)+'" data-prop="match" aria-label="Matching value"><option value=""></option>'+options([...new Set([...choices(t.source),...(t.match?[t.match]:[])])].map(x=>[x,x]),t.match)+'</select></td>'+['percent','actingPercent','periods'].map(k=>'<td><input type="number" min="0" max="'+(k==='periods'?200:100)+'" step="any" data-rule="'+esc(t.id)+'" data-prop="'+k+'" value="'+esc(t[k]??'')+'" aria-label="'+esc(t.name+' '+k)+'" '+(k==='actingPercent'&&t.source!=='Appointment group'?'disabled':'')+'></td>').join('')+'<td><textarea class="full-cell-note" data-rule="'+esc(t.id)+'" data-prop="notes" rows="2" maxlength="4000" aria-label="Notes for '+esc(t.name)+'">'+esc(t.notes)+'</textarea></td><td><button data-delete-rule="'+esc(t.id)+'" aria-label="Delete '+esc(t.name)+'">×</button></td></tr>');
 root.insertAdjacentHTML('beforeend',table(['Group / tag','Match field','Matching value','Offload %','Acting offload %','Weekly cap','Notes','Delete'],rows));root.querySelector('table').classList.add('offload-table');
 function stage(){queueCell({operation:'setOffload',value:clone(current),expected:v().offload||null})}
 root.querySelectorAll('[data-rule]').forEach(input=>{input.addEventListener('input',()=>{if(input.tagName!=='SELECT'){const rule=current.tags.find(t=>t.id===input.dataset.rule);rule[input.dataset.prop]=input.value;unsavedDraft=false;stage();}});input.addEventListener('change',()=>{const rule=current.tags.find(t=>t.id===input.dataset.rule);rule[input.dataset.prop]=input.value;unsavedDraft=false;stage();if(input.dataset.prop==='source'){rule.match='';rule.actingPercent='';stage();render()}})});
 root.querySelectorAll('[data-delete-rule]').forEach(b=>b.onclick=()=>{current.tags=current.tags.filter(t=>t.id!==b.dataset.deleteRule);stage();render()});if(!editable)root.querySelectorAll('input,select,textarea,button').forEach(i=>i.disabled=true);
 if(current.legacy)root.insertAdjacentHTML('beforeend','<details class="legacy-offload"><summary>Preserved legacy data · read only</summary><p>Earlier tags, factors and staff notes remain in the version archive. They are not applied a second time.</p><div data-legacy-values aria-label="Preserved legacy values">'+legacyOffloadHTML(current.legacy)+'</div></details>');
}
let roleTruthCache=null,roleTruthLoading=false,roleTruthAttempt=null;
/* GSIS_PLANNING_BEGIN */
/* Version-owned departments, committees, CCAs and weekly duties. Shared validation. */
var GSISPlanning=(function(){
 'use strict';
 var defaults={dept:['English','Maths','MTL','PE, Art & Music','Science','Social Studies'],comm:['CCE','Data and Knowledge Management','E21CC','EdTech','Partnerships and Engagement','School Library','School Publications and Website','Staff Innovation and Recognition','Staff Well-Being','Student Leadership Development','Student Management','Student Talent Development','Student Well-Being'],cca:['Art Club','Badminton','Basketball','Chess Club','Environmental Science Club','Floorball','Infocomm Technology Club','Modern Dance','Scouts','Speech & Drama','String Ensemble','Track & Field','Wushu']};
 defaults.plt=["P1", "P2", "PE", "Music", "Art", "CL1", "CL2", "CL3", "TL", "ML", "SS", "P5/6 EL", "P3/4 MA", "P5/6 MA", "P3/4 EL", "P3/4 Science", "P5/6 Science"];defaults.events=["AAP", "Access Arrangements", "ALP", "Children's Day", "CNY Celeb", "Deepavali Celeb", "Eco-Stewardship", "Games Day", "iEXAM Coord", "LLP", "MTL Fortnight", "NAPFA", "Natl Day Celeb", "NE Show", "OEL", "Orientation", "P1 Reg Ex", "P4 Swimsafer", "P5 Camp", "P6 Cultural Camp", "P6 Grad", "P6 to S1 Fair", "Post-PSLE Programme", "PSLE CPE", "PSLE EPE", "PSLE IPE", "PSLE Oral Sup", "Puasa Celeb", "RHD", "Teachers' Day", "TIE Trip", "VIA"];var additions=["Assessment", "Canteen", "Community Engagement", "PD", "Relief T1", "Relief T2", "Relief T3", "Relief T4", "Safety", "Talent Mgmt", "TTb (current year)", "TTb (next year)"];defaults.comm=defaults.comm.concat(additions).sort();
 var categories=['Before School','Recess','Dismissal','After School'],days=['Mon','Tue','Wed','Thu','Fri'];
 function roles(kind){return kind==='comm'?['HOD i/c','SH i/c','OIC','2IC']:kind==='plt'?['PLT Leader']:kind==='events'?['OIC','2IC']:kind==='cca'?['OIC (Boys)','OIC (Girls)','2IC','Enrichment']:['Head','Deputy'];}
 function groups(kind){return defaults[kind].map(function(name,i){return {id:kind+'-'+i,name:name,slots:Array(roles(kind).length).fill(''),...(kind==='comm'?{leadershipSchema:1}:{})};});}
 function duties(){var list=[],i=0;function add(category,name,start,end,days_,description){list.push({id:'duty-'+i++,category:category,name:name,start:start,end:end,days:days_||[0,1,2,3,4],description:description||'',teachers:{}});}
  add('Before School','D/A','07:00','07:30',null,'During Hall Assembly, maintain discipline and ensure every child is reading a book.');
  add('Before School','PUDO (AM)','07:00','07:30',null,'Maintain discipline and ensure safety of pupils alighting from private transport. Visual check on well-being.');
  add('Before School','LATE/C','07:30','08:00',null,'Prefects record the names of latecomers. Record latecomers in SC Mobile. Pupils arriving after the 07:30 bell stand near the gate. Bring pupils to the canteen and mark them as LATE. During heavy rain, do not book pupils for latecoming.');
  for(var n=1;n<=6;n++){var m=480+n*30;add('Recess','P'+n,time(m),time(m+30),null,'Pupils do not run or play in the canteen. Queue when buying food and return crockery to the respective basins. Gather pupils in classes and send them back near the end of recess. In an emergency, group pupils by class and send them to AA/CP via Parade Square.');}
  add('Dismissal','FOYER','13:20','13:50',null,'Direct pupils taking school buses and privately operated student care transport. Hold pupils taking private transport; private vehicles may enter at 13:45. Direct bus drivers towards Staircase 1 and then the student care centres.');
  add('Dismissal','GATE3','13:20','13:50',null,'General safety and visual check for wellness.');
  add('Dismissal','PUDO (PM)','13:30','14:00',null,'Maintain discipline and ensure safety of pupils waiting for private transport. Gather pupils at the foyer. After 14:00, send pupils still waiting to the GO to call their parents and inform the front desk.');
  add('After School','LUNCH','13:30','14:00',[0,1],'Maintain discipline; pupils are not to play. Send pupils back to classrooms near the end of lunch.');
  add('Dismissal','CCA HALL 1','13:15','13:45',[2]);list[list.length-1].adhoc=true;
  add('Dismissal','CCA HALL 2','13:45','14:15',[2]);list[list.length-1].adhoc=true;
  add('After School','LUNCH 1','13:30','13:50',[2],'Maintain discipline; pupils are not to play.');list[list.length-1].adhoc=true;
  add('After School','LUNCH 2','13:50','14:15',[2],'Maintain discipline and send pupils back to classrooms near the end of lunch.');list[list.length-1].adhoc=true;
  return list;
 }
 function time(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 function init(d){d.organisations=d.organisations||{};Object.keys(defaults).forEach(function(k){if(!Array.isArray(d.organisations[k]))d.organisations[k]=groups(k);});if(!d.planning402){additions.forEach(function(name,i){if(!d.organisations.comm.some(function(g){return g.name.toLowerCase()===name.toLowerCase();}))d.organisations.comm.push({id:'comm402-'+i,name:name,slots:['','','',''],leadershipSchema:1});});d.planning402=1;}d.organisations.comm.forEach(function(g){if(!g.leadershipSchema){g.legacyLeadership=['Head','Deputy'].flatMap(function(role,i){return g.slots[i]?[{role:role,teacher:g.slots[i]}]:[];});g.slots=['','','',''].concat(g.slots.slice(2));g.leadershipSchema=1;}});if(!d.fortnight)d.fortnight={};if(!Array.isArray(d.duties))d.duties=duties();return d;}
 function count(d,id){return (d.duties||[]).reduce(function(n,x){return n+x.days.filter(function(day){return x.teachers[day]===id;}).length;},0);}
 function validTeacher(d,id){return !id||d.teachers.some(function(t){return t.id===id&&(t.active===true||t.active==='Y')&&GSISTeachingRules.eligible(t);});}
 // Department slot 1 remains its first deputy for existing snapshots and integrations.
 function deputies(g){return [g.slots?.[1]||''].concat(g.additionalDeputies||[]).filter(Boolean);}
 function setDeputies(g,ids){g.slots[1]=ids[0]||'';g.additionalDeputies=ids.slice(1);return g;}
 function compactMembers(kind,g){var fixed=roles(kind).length;g.slots=g.slots.slice(0,fixed).concat(g.slots.slice(fixed).filter(id=>id!==''));return g;}
 function clearAssignments(kind,g){g.slots=Array(roles(kind).length).fill('');delete g.legacyLeadership;delete g.additionalDeputies;delete g.tls;return g;}
 // The same version-owned references drive the deletion review and its server guard.
 function teacherImpact(d,id){
  const organisations=[];for(const [kind,groups_] of Object.entries(d.organisations||{}))for(const g of groups_){const positions=key=>(g[key]||[]).flatMap((value,i)=>value===id?[i]:[]),slots=positions('slots'),additionalDeputies=positions('additionalDeputies'),tls=positions('tls'),legacyLeadership=(g.legacyLeadership||[]).filter(x=>x.teacher===id);if(slots.length||additionalDeputies.length||tls.length||legacyLeadership.length)organisations.push({kind,id:g.id,name:g.name,slots,additionalDeputies,tls,legacyLeadership});}
  return {assignments:(d.assignments||[]).filter(a=>a.teacher===id).map(({id,pending,...a})=>a).sort((a,b)=>(a.target+'|'+a.subject).localeCompare(b.target+'|'+b.subject)),organisations,nonTeachingActivities:(d.workload?.nonTeachingActivities||[]).filter(a=>a.teachers.includes(id)).map(({teachers,...a})=>a),duties:(d.duties||[]).flatMap(x=>{const days=Object.keys(x.teachers||{}).filter(day=>x.teachers[day]===id);return days.length?[{id:x.id,name:x.name,days}]:[];}),reporting:{staff:(d.reporting?.staff||[]).filter(t=>t.id===id),officers:Object.entries(d.reporting?.officers||{}).filter(([officer,ro])=>officer===id||ro===id)},blocks:d.relief?.blocks?.[id]??null};
 }
 function clearTeacher(d,id,removeProfile=false){
  d.assignments=(d.assignments||[]).filter(a=>a.teacher!==id);
  for(const [kind,groups_] of Object.entries(d.organisations||{}))for(const g of groups_){g.slots=(g.slots||[]).map(value=>value===id?'':value);for(const key of ['additionalDeputies','tls'])if(g[key])g[key]=g[key].filter(value=>value!==id);if(g.legacyLeadership)g.legacyLeadership=g.legacyLeadership.filter(x=>x.teacher!==id);compactMembers(kind,g);}
  for(const duty of d.duties||[])for(const day of Object.keys(duty.teachers||{}))if(duty.teachers[day]===id)delete duty.teachers[day];
  if(d.reporting){d.reporting.staff=(d.reporting.staff||[]).filter(t=>t.id!==id);for(const [officer,ro] of Object.entries(d.reporting.officers||{})){if(officer===id)delete d.reporting.officers[officer];else if(ro===id)d.reporting.officers[officer]='';}}
  if(d.relief?.blocks)delete d.relief.blocks[id];
  for(const a of d.workload?.nonTeachingActivities||[])a.teachers=a.teachers.filter(teacher=>teacher!==id);
  if(removeProfile){d.teachers=d.teachers.filter(t=>t.id!==id);for(const key of ['teacherDrafts','teacherNotes'])if(d[key])delete d[key][id];if(d.offload?.staff)delete d.offload.staff[id];if(d.workload?.noFTT)d.workload.noFTT=d.workload.noFTT.filter(value=>value!==id);if(d.levelExclusions)d.levelExclusions=d.levelExclusions.filter(x=>x.teacher!==id);}
  return d;
 }
 function tlEligible(d,id){
  var t=(d.teachers||[]).find(t=>t.id===id);if(!t)return false;
  var catalogue=Array.isArray(d.membership)?d.membership.map(r=>({role:r[0],level:r[12],groups:['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'].filter((k,i)=>r[i+2]==='1')})):undefined;
  var person=GSISTeachingRules.resolve(t,catalogue,undefined,d.teacherDrafts?.[id]);
  return person.active&&GSISTeachingRules.eligible(person)&&['ST','LT','MTT'].includes(person.profile['EO Appt Level']);
 }
 function checkGroups(d,kind,value){if(!defaults[kind]||!Array.isArray(value)||value.length>100)throw Error('Invalid group list');var names=new Set(),ids=new Set();value.forEach(function(g){if(!g.id||typeof g.id!=='string'||g.id.length>100||ids.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>160||names.has(g.name.trim().toLowerCase()))throw Error('Group names and IDs must be unique');ids.add(g.id);names.add(g.name.trim().toLowerCase());if(!Array.isArray(g.slots)||g.slots.length<roles(kind).length||g.slots.length>300)throw Error('Invalid member slots');for(var field of ['additionalDeputies','tls'])if(g[field]!==undefined&&(kind!=='dept'||!Array.isArray(g[field])||g[field].length>300||g[field].some(id=>typeof id!=='string'||!id)))throw Error('Invalid department selections');if(members(g).length>300)throw Error('Use up to 300 assignments per group');if(g.legacyLeadership!==undefined&&(!Array.isArray(g.legacyLeadership)||kind!=='comm'||g.legacyLeadership.length>2||g.legacyLeadership.some(function(x){return !x||!['Head','Deputy'].includes(x.role)||typeof x.teacher!=='string'||!x.teacher;})||new Set(g.legacyLeadership.map(function(x){return x.role;})).size!==g.legacyLeadership.length))throw Error('Invalid retained committee leadership');var old=(d.organisations?.[kind]||[]).find(x=>x.id===g.id),priorTL=kind==='dept'?(old?.tls||[]):[];if(kind==='dept')for(var id of g.tls||[])if(!tlEligible(d,id)&&!priorTL.includes(id))throw Error('Department TLs must be active eligible ST, LT or MTT teachers');var used=new Set();members(g).forEach(function(id){var retainedTL=kind==='dept'&&priorTL.includes(id)&&(g.tls||[]).includes(id);if(typeof id!=='string'||!validTeacher(d,id)&&!retainedTL)throw Error('Choose an active teacher');if(id&&used.has(id))throw Error('A teacher may appear only once within a group');if(id)used.add(id);});});value.forEach(g=>compactMembers(kind,g));return value;}
 function checkDuties(d,value){if(!Array.isArray(value)||value.length>200)throw Error('Use up to 200 duties');var ids=new Set(),byTeacher={};value.forEach(function(x){if(!x.id||typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>120||categories.indexOf(x.category)<0)throw Error('Choose a category and enter a duty name');ids.add(x.id);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end)||x.start>=x.end)throw Error('End time must be later than start time');if(!Array.isArray(x.days)||x.days.some(function(day){return !Number.isInteger(day)||day<0||day>4;})||new Set(x.days).size!==x.days.length||x.adhoc&&x.days.length!==1)throw Error('Choose valid weekdays');if(typeof x.description!=='string'||x.description.length>4000||!x.teachers||typeof x.teachers!=='object'||Array.isArray(x.teachers))throw Error('Invalid duty details');Object.keys(x.teachers).forEach(function(day){var id=x.teachers[day];if(String(Number(day))!==day||typeof id!=='string'||x.days.indexOf(Number(day))<0||!validTeacher(d,id))throw Error('Choose an active teacher on an enabled day');if(!id)return;var key=day+'|'+id;byTeacher[key]=byTeacher[key]||[];var hit=byTeacher[key].find(function(a){return x.start<a.end&&a.start<x.end;});if(hit)throw Error(days[Number(day)]+': '+x.name+' ('+x.start+'–'+x.end+') overlaps '+hit.name+' ('+hit.start+'–'+hit.end+') for '+(d.teachers.find(function(t){return t.id===id;})||{}).name);byTeacher[key].push(x);});});return value;}
 function members(g){return (g.slots||[]).concat(g.additionalDeputies||[],g.tls||[],(g.legacyLeadership||[]).map(function(x){return x.teacher;}));}
 return {teacherImpact:teacherImpact,clearTeacher:clearTeacher,tlEligible:tlEligible,members:members,deputies:deputies,setDeputies:setDeputies,compactMembers:compactMembers,clearAssignments:clearAssignments,defaults:defaults,categories:categories,days:days,roles:roles,groups:groups,duties:duties,init:init,count:count,checkGroups:checkGroups,checkDuties:checkDuties};
})();

/* GSIS_PLANNING_END */

/* GSIS_PLANNING_UI_BEGIN */
/* v0.4.18 planning pages. Embedded into app.js by the release builder. */
const groupTabs={PLT:'plt',Events:'events','PLT Settings':'plt','Events Settings':'events',Dept:'dept',Committees:'comm',CCAs:'cca','Dept Settings':'dept','Committee Settings':'comm','CCA Settings':'cca'};
function groupData(kind){GSISPlanning.init(v());return v().organisations[kind];}
function activeGroupTeachers(){return v().teachers.filter(t=>t.active&&eligibleTeacher(t)).sort((a,b)=>natural(a.name,b.name));}
function groupStage(kind,value){try{value.forEach(g=>GSISPlanning.compactMembers(kind,g));GSISPlanning.checkGroups(v(),kind,value);queueCell({operation:'setOrganisation',kind,value,expected:clone(groupData(kind))});return true}catch(e){alert(e.message);return false;}}
const groupRoleSearch=new Map();
const groupRoleKey=(group,field)=>JSON.stringify([v().id,group,field]);
function groupPage(root,kind,settingsMode=false){
 const groups=groupData(kind).map(g=>GSISPlanning.compactMembers(kind,clone(g))).sort((a,b)=>kind==='plt'?0:natural(a.name,b.name)),can=kind==='plt'?(kp()||admin()):kp(),roles=GSISPlanning.roles(kind),teachers=activeGroupTeachers();
 if(settingsMode){
  root.innerHTML='<p class="hint">Names belong to this deployment version. Renaming keeps assignments; removing a group returns its teachers to the unassigned list when they have no other group.</p>';
  root.append(button('Add '+(kind==='plt'?'PLT':kind==='events'?'event':kind==='cca'?'CCA':kind==='comm'?'committee':'department'),()=>{selectionEditor('Add group','<label>Name<input id="groupName" maxlength="160"></label>',d=>{const name=d.querySelector('#groupName').value.trim();if(!name)throw Error('Enter a name');const next=clone(groupData(kind));next.push({id:uid(),name,slots:Array(roles.length).fill(''),...(kind==='comm'?{leadershipSchema:1}:{})});if(!groupStage(kind,next))throw Error('Group could not be added');render();});},!can));
  root.insertAdjacentHTML('beforeend',table(['Name','Members','Delete'],groups.map(g=>'<tr><td><input data-group-name="'+esc(g.id)+'" aria-label="Group name" value="'+esc(g.name)+'" '+(!can?'disabled':'')+'></td><td>'+GSISPlanning.members(g).filter(Boolean).length+'</td><td><button data-group-delete="'+esc(g.id)+'" '+(!can?'disabled':'')+'>×</button></td></tr>')));
  root.querySelector('table').classList.add('group-settings-table');
  root.querySelectorAll('[data-group-name]').forEach(i=>{i.maxLength=160;const original=i.value;i.oninput=()=>{i.setCustomValidity('');unsavedDraft=i.value!==original;};i.onchange=()=>{const next=clone(groupData(kind));next.find(g=>g.id===i.dataset.groupName).name=i.value.trim();if(groupStage(kind,next)){unsavedDraft=false;render();}else{unsavedDraft=true;i.setCustomValidity('Use a unique, nonblank name.');}};i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();i.blur();}if(e.key==='Escape'){e.preventDefault();i.value=original;i.setCustomValidity('');unsavedDraft=false;i.blur();}};});
  root.querySelectorAll('[data-group-delete]').forEach(b=>b.onclick=()=>{if(confirm('Remove this group and its assignments?')){groupStage(kind,clone(groupData(kind)).filter(g=>g.id!==b.dataset.groupDelete));render();}});return;
 }
 const memberships=new Map();groups.forEach(g=>GSISPlanning.members(g).filter(Boolean).forEach(id=>{if(!memberships.has(id))memberships.set(id,new Set());memberships.get(id).add(g.id);}));
 const unassigned=teachers.filter(t=>!memberships.has(t.id)),displayRoles=kind==='dept'?['Head','Deputy','TLs']:roles,memberStart=displayRoles.length,height=memberStart+Math.max(0,...groups.map(g=>g.slots.length-roles.length))+1;
 root.innerHTML='<p class="hint">Light orange means membership in more than one '+(kind==='plt'?'PLT':kind==='events'?'event':kind==='cca'?'CCA':kind==='comm'?'committee':'department')+'. Blank leadership positions are allowed. Choose a teacher at the end of a member list to add them.</p><div class="assignment-split"><div class="assignment-main scroll"></div><aside class="unassigned-pane"><h3>'+(kind==='plt'?'Teacher without PLT':'Unassigned')+' <span>'+unassigned.length+'</span></h3><ul>'+unassigned.map(t=>'<li>'+esc(t.name)+'</li>').join('')+'</ul>'+(unassigned.length?'':'<p>All active teachers assigned.</p>')+'</aside></div>';
 const teacherName=id=>v().teachers.find(t=>t.id===id)?.name||id;
 function roleCheckboxes(g,field,label){
  const selected=field==='deputy'?GSISPlanning.deputies(g):(g.tls||[]),used=new Set(GSISPlanning.members(g).filter(Boolean)),allowed=field==='tls'?v().teachers.filter(t=>GSISPlanning.tlEligible(v(),t.id)).sort((a,b)=>natural(a.name,b.name)):teachers;
  const candidates=allowed.concat(selected.filter(id=>!allowed.some(t=>t.id===id)).map(id=>({id,name:teacherName(id)}))),saved=groupRoleSearch.get(groupRoleKey(g.id,field))||{};
  return '<td class="group-role-cell"><details class="group-role-picker" data-group="'+esc(g.id)+'" data-group-role="'+field+'" '+(saved.open?'open':'')+'><summary aria-label="'+esc(g.name+' · '+label)+'">'+(selected.length?selected.map(id=>'<span class="group-role-name '+(memberships.get(id)?.size>1?'multiple-membership':'')+'">'+esc(teacherName(id))+(field==='tls'&&!GSISPlanning.tlEligible(v(),id)?' (review TL eligibility)':'')+'</span>').join(''):'Choose…')+'</summary><fieldset><legend>'+esc(g.name+' · '+label)+'</legend><div class="group-role-search"><input type="search" data-group-role-search value="'+esc(saved.query||'')+'" placeholder="Search part of a name" aria-label="'+esc('Search '+g.name+' '+label)+'"><button type="button" data-group-role-clear aria-label="Clear name search">Clear</button></div><div class="group-role-options">'+candidates.map(t=>'<label data-group-role-option data-name="'+esc(t.name.toLocaleLowerCase())+'"><input type="checkbox" data-group="'+esc(g.id)+'" data-group-role-choice="'+field+'" value="'+esc(t.id)+'" '+(selected.includes(t.id)?'checked ':'')+(!can||used.has(t.id)&&!selected.includes(t.id)?'disabled ':'')+'>'+esc(t.name)+(field==='tls'&&!GSISPlanning.tlEligible(v(),t.id)?'<small class="warning-text">No longer eligible. Remove this selection when ready.</small>':'')+'</label>').join('')+'</div><p data-group-role-empty role="status" hidden>No matching names.</p></fieldset></details></td>';
 }
 const rows=Array.from({length:height},(_,row)=>'<tr><th scope="row">'+esc(displayRoles[row]||(row===memberStart?'Members':'Member '+(row-memberStart+1)))+'</th>'+groups.map(g=>{
  if(kind==='dept'&&(row===1||row===2))return roleCheckboxes(g,row===1?'deputy':'tls',displayRoles[row]);
  const member=row>=memberStart,slot=member?roles.length+row-memberStart:row;
  if(member&&slot>g.slots.length)return '<td class="group-member-blank"></td>';
  const id=g.slots[slot]||'',used=new Set(GSISPlanning.members(g).filter(Boolean)),label=g.name+' · '+(displayRoles[row]||'Member'),choices=teachers.concat(id&&!teachers.some(t=>t.id===id)?[{id,name:teacherName(id)}]:[]);
  return '<td class="'+(memberships.get(id)?.size>1?'multiple-membership':'')+'"><select data-group="'+esc(g.id)+'" data-slot="'+slot+'" '+(member?'data-member-picker="'+(id?'existing':'add')+'" ':'')+'aria-label="'+esc(label)+'" '+(!can?'disabled':'')+'><option value="">Choose…</option>'+choices.filter(t=>t.id===id||!used.has(t.id)).map(t=>'<option value="'+esc(t.id)+'" '+(id===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></td>';
 }).join('')+'</tr>');
 root.querySelector('.assignment-main').innerHTML='<table class="group-table" data-no-sort="true"><thead><tr><th>Role</th>'+groups.map(g=>'<th>'+esc(g.name)+'<small>'+GSISPlanning.members(g).filter(Boolean).length+' teachers</small>'+ (kind==='plt'&&!g.slots[0]?'<small class="warning-text">⚠ No leader</small>':'')+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>';
 root.querySelectorAll('[data-group-role]').forEach(picker=>{
  const key=groupRoleKey(picker.dataset.group,picker.dataset.groupRole),search=picker.querySelector('[data-group-role-search]'),list=picker.querySelector('.group-role-options'),saved=groupRoleSearch.get(key)||{};
  function remember(){groupRoleSearch.set(key,{query:search.value,open:picker.open,scroll:list.scrollTop});}
  function filter(){const query=search.value.trim().toLocaleLowerCase();let visible=0;picker.querySelectorAll('[data-group-role-option]').forEach(label=>{label.hidden=!label.dataset.name.includes(query);if(!label.hidden)visible++;});picker.querySelector('[data-group-role-empty]').hidden=!!visible;remember();}
  search.oninput=filter;picker.ontoggle=remember;list.onscroll=remember;
  picker.querySelector('[data-group-role-clear]').onclick=()=>{search.value='';filter();search.focus({preventScroll:true});};
  filter();list.scrollTop=saved.scroll||0;
 });
 root.querySelectorAll('[data-group-role-choice]').forEach(i=>i.onchange=()=>{
  const group=i.dataset.group,field=i.dataset.groupRoleChoice,id=i.value,next=clone(groupData(kind)),g=next.find(g=>g.id===group),selected=field==='deputy'?GSISPlanning.deputies(g):(g.tls||[]).slice(),ids=i.checked?[...selected,id]:selected.filter(x=>x!==id);
  if(field==='deputy')GSISPlanning.setDeputies(g,ids);else g.tls=ids;
  // Save all picker states before the page is rebuilt after each selection.
  root.querySelectorAll('[data-group-role]').forEach(p=>groupRoleSearch.set(groupRoleKey(p.dataset.group,p.dataset.groupRole),{query:p.querySelector('[data-group-role-search]').value,open:p.open,scroll:p.querySelector('.group-role-options').scrollTop}));
  if(groupStage(kind,next)){render();const picker=[...document.querySelectorAll('[data-group-role]')].find(x=>x.dataset.group===group&&x.dataset.groupRole===field);if(picker){picker.open=true;const choice=[...picker.querySelectorAll('[data-group-role-choice]')].find(x=>x.value===id&&!x.closest('label').hidden);(choice||picker.querySelector('[data-group-role-search]')).focus({preventScroll:true});}}
  else i.checked=selected.includes(id);
 });
 if(kind==='comm'){
  const retained=groups.flatMap(g=>(g.legacyLeadership||[]).map(x=>({group:g,...x})));
  if(retained.length){root.insertAdjacentHTML('beforeend','<section class="committee-legacy"><h3>Retained committee leadership</h3><p>These assignments keep their earlier Head or Deputy label. Choose the appropriate role when ready.</p>'+table(['Committee','Earlier role','Teacher','Assign as'],retained.map(x=>'<tr><td>'+esc(x.group.name)+'</td><td>'+esc(x.role)+'</td><td>'+esc(v().teachers.find(t=>t.id===x.teacher)?.name||x.teacher)+'</td><td><select data-legacy-group="'+esc(x.group.id)+'" data-legacy-role="'+esc(x.role)+'" '+(!can?'disabled':'')+'><option value="">Keep earlier role</option>'+roles.map((role,i)=>'<option value="'+i+'" '+(x.group.slots[i]?'disabled':'')+'>'+esc(role)+'</option>').join('')+'<option value="member">Member</option><option value="remove">Remove assignment</option></select></td></tr>'))+'</section>');
   root.querySelectorAll('[data-legacy-group]').forEach(i=>i.onchange=()=>{if(!i.value)return;const next=clone(groupData(kind)),g=next.find(g=>g.id===i.dataset.legacyGroup),entry=g.legacyLeadership.find(x=>x.role===i.dataset.legacyRole);if(i.value==='remove'&&!confirm('Remove this retained leadership assignment?'))return;if(i.value==='member')g.slots.push(entry.teacher);else if(i.value!=='remove')g.slots[Number(i.value)]=entry.teacher;g.legacyLeadership=g.legacyLeadership.filter(x=>x!==entry);groupStage(kind,next);render();});
  }
 }
 root.querySelectorAll('[data-group][data-slot]').forEach(i=>i.onchange=()=>{const next=clone(groupData(kind)),g=GSISPlanning.compactMembers(kind,next.find(g=>g.id===i.dataset.group)),row=Number(i.dataset.slot);while(g.slots.length<=row)g.slots.push('');g.slots[row]=i.value;while(g.slots.length>roles.length&&!g.slots[g.slots.length-1])g.slots.pop();groupStage(kind,next);render();});
}
function membershipPage(root){
 const readOnly=false;
 const rows=v().membership||[],fields=['Role Shortform','Formal Role Name','SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK','EO Appt Level'],editable=admin()&&!readOnly;
 root.innerHTML='<p class="hint">This table defines this version’s roles, memberships and EO mappings. Publishing replaces Contacts’ mappings.</p>';
 if(!readOnly)root.append(button('Add role',()=>{const next=clone(v().membership||rows);let n=1;while(next.some(r=>r[0]==='New role '+n))n++;next.push(['New role '+n,'',...Array(11).fill('')]);stage(next);render();},!editable));
 function stage(value){queueCell({operation:'setMembership',value,expected:clone(v().membership||rows)});roleCatalogue=value.map(r=>({role:r[0],level:r[12],groups:fields.slice(2,12).filter((k,j)=>r[j+2]==='1')}));}
 root.insertAdjacentHTML('beforeend',table([...fields,...(!readOnly?['Delete']:[])],rows.map((r,ri)=>'<tr>'+fields.map((f,ci)=>'<td>'+(ci>1&&ci<12?'<input type="checkbox" data-member-row="'+ri+'" data-member-col="'+ci+'" '+(r[ci]==='1'?'checked':'')+' '+(!editable?'disabled':'')+' aria-label="'+esc(r[0]+' '+f)+'">':ci===12?'<select data-member-row="'+ri+'" data-member-col="'+ci+'" '+(!editable?'disabled':'')+' aria-label="EO Appt Level"><option value=""></option>'+options([...new Set([...(v().masterOptions?.[f]||contactSysFields?.[f]||[]),...(r[ci]?[r[ci]]:[])])].map(x=>[x,x]),r[ci])+'</select>':'<input data-member-row="'+ri+'" data-member-col="'+ci+'" value="'+esc(r[ci])+'" '+(!editable?'readonly':'')+' aria-label="'+esc(f)+'">')+'</td>').join('')+(!readOnly?'<td><button data-member-delete="'+ri+'" '+(!editable?'disabled':'')+'>×</button></td>':'')+'</tr>')));
 root.querySelectorAll('[data-member-row]').forEach(i=>{i.onchange=()=>{const next=clone(v().membership||rows);next[+i.dataset.memberRow][+i.dataset.memberCol]=i.type==='checkbox'?(i.checked?'1':''):i.value.trim();if(new Set(next.map(r=>r[0].toLowerCase())).size!==next.length||next.some(r=>!r[0])){unsavedDraft=true;alert('Use unique nonblank role names');return;}unsavedDraft=false;stage(next);};if(i.type==='text')i.oninput=()=>unsavedDraft=true;});
 root.querySelectorAll('[data-member-delete]').forEach(b=>b.onclick=()=>{if(confirm('Remove this role mapping?')){stage((v().membership||rows).filter((r,i)=>i!==Number(b.dataset.memberDelete)));render();}});
}
function termOutsideChoices(field,value,lists){
 if(!value||!Array.isArray(lists?.[field]))return false;
 const parts=['Subject Modifier','Employment Modifier','MK Modifier'].includes(field)?String(value).split(/,\s*/):[value];
 return parts.some(x=>x&&!lists[field].includes(x));
}
function hrChoiceReminders(){
 const lists=v().masterOptions||contactSysFields||{},rows=[];
 for(const t of v().teachers||[]){const p=plannerProfile(t);for(const field of Object.keys(lists))if(termOutsideChoices(field,p[field],lists))rows.push({name:p['Basic Name']||t.name,field,value:p[field]});}
 return rows;
}
function hrReminderHTML(){const reminders=hrChoiceReminders();return reminders.length?'<details class="hr-reminders" open><summary>'+reminders.length+' staff value(s) outside this version’s choices — publication allowed</summary><ul>'+reminders.map(x=>'<li>'+esc(x.name)+' · '+esc(x.field)+': '+esc(x.value)+'</li>').join('')+'</ul></details>':'';}
function masterOptionsPage(root){
 const sourceNotes={'EO Appt Level':'Defines the levels available in Membership. Each teacher’s level follows their assigned role.','Appointment Status':'Defines the Appointment Status choices available in Teachers for this version.','Employment Modifier':'Defines the Employment Modifier choices available in Teachers for this version.'};
 const lists=clone(v().masterOptions||contactSysFields||{}),fixed=['Day of Birth','Month of birth','Active','Role'];
 root.innerHTML='<p class="hint">Choices belong to this version. Publishing replaces Contacts’ choices; other versions keep their own. Existing staff values outside these choices are retained and flagged. Edit roles and EO mappings in Membership.</p>'+hrReminderHTML()+table(['Field','Choices — one per line'],Object.keys(lists).map(k=>'<tr><td>'+esc(k)+'</td><td><textarea class="hr-text-list" rows="'+Math.min(6,Math.max(2,lists[k].length))+'" data-master-field="'+esc(k)+'" '+(!admin()||fixed.includes(k)?'readonly':'')+'>'+esc(lists[k].join('\n'))+'</textarea>'+(k==='Role'?'<small>Defined in Membership</small>':sourceNotes[k]?'<small class="hr-source-note">'+esc(sourceNotes[k])+'</small>':'')+'</td></tr>'));
 root.querySelectorAll('[data-master-field]').forEach(i=>{if(['Day of Birth','Month of birth','Role'].includes(i.dataset.masterField)){const text=document.createElement('span');text.className='fixed-hr-choices';text.textContent=i.value.split('\n').join(', ');text.title=i.dataset.masterField==='Role'?'Defined in Membership':'Fixed choices';i.replaceWith(text);return;}if(i.readOnly)return;i.oninput=()=>unsavedDraft=true;i.onchange=()=>{const value=clone(v().masterOptions||contactSysFields||{});value[i.dataset.masterField]=[...new Set(i.value.split('\n').map(x=>x.trim()).filter(Boolean))];queueCell({operation:'setMasterOptions',value,expected:clone(v().masterOptions||contactSysFields||{})});unsavedDraft=false;render();};});
}
function recessDescription(list=v().duties){return [...new Set(list.filter(x=>x.category==='Recess').map(x=>x.description.trim()).filter(Boolean))].join('\n\n');}
function editRecessDescription(){selectionEditor('Recess description','<label>Common description for all Recess duties<textarea id="recessDescription" rows="6" maxlength="4000">'+esc(recessDescription())+'</textarea></label>',d=>{const next=clone(v().duties),description=d.querySelector('#recessDescription').value;next.filter(x=>x.category==='Recess').forEach(x=>x.description=description);if(!dutyStage(next))throw Error('Resolve the description before applying.');});}

function dutyStage(value){try{GSISPlanning.checkDuties(v(),value);queueCell({operation:'setDuties',value,expected:clone(v().duties)});return true}catch(e){alert(e.message);return false;}}
function editDuty(id,day,category){
 GSISPlanning.init(v());const prior=v().duties.find(x=>x.id===id),x=prior?clone(prior):{id:uid(),name:'',category:category||GSISPlanning.categories[0],start:'07:00',end:'07:30',days:day===undefined?[0,1,2,3,4]:[day],adhoc:day!==undefined,description:'',teachers:{}};
 const body='<label>Duty name<input id="dutyName" maxlength="120" value="'+esc(x.name)+'"></label><label>Category<select id="dutyCategory">'+options(GSISPlanning.categories.map(k=>[k,k]),x.category)+'</select></label><div class="duty-times"><label>Start<input id="dutyStart" type="time" value="'+x.start+'"></label><label>End<input id="dutyEnd" type="time" value="'+x.end+'"></label></div><fieldset><legend>Apply to</legend>'+GSISPlanning.days.map((name,i)=>'<label class="weekday-choice"><input type="checkbox" data-duty-day="'+i+'" '+(x.days.includes(i)?'checked':'')+' '+(x.adhoc?'disabled':'')+'>'+name+'</label>').join('')+'</fieldset><p id="recessDescriptionNote">Recess uses the common description below the roster.</p><label id="dutyDescriptionLabel">Description<textarea id="dutyDescription" rows="4" maxlength="4000">'+esc(x.description)+'</textarea></label>';
 const editor=selectionEditor(prior?'Edit duty':'Add duty',body,d=>{Object.assign(x,{name:d.querySelector('#dutyName').value.trim(),category:d.querySelector('#dutyCategory').value,start:d.querySelector('#dutyStart').value,end:d.querySelector('#dutyEnd').value,description:d.querySelector('#dutyCategory').value==='Recess'?(prior?.category==='Recess'?prior.description:recessDescription()):d.querySelector('#dutyDescription').value,days:[...d.querySelectorAll('[data-duty-day]:checked')].map(i=>Number(i.dataset.dutyDay))});x.teachers=Object.fromEntries(Object.entries(x.teachers).filter(([day])=>x.days.includes(Number(day))));const next=clone(v().duties),index=next.findIndex(r=>r.id===x.id);if(index<0)next.push(x);else next[index]=x;if(!dutyStage(next))throw Error('Resolve the duty details before applying.');});
 const updateDescription=()=>{const shared=editor.querySelector('#dutyCategory').value==='Recess';editor.querySelector('#dutyDescriptionLabel').hidden=shared;editor.querySelector('#recessDescriptionNote').hidden=!shared;};editor.querySelector('#dutyCategory').onchange=updateDescription;updateDescription();
}
// Screen and PDF share the same physical columns, including every Recess duty.
function dutyColumns(list=v().duties){return GSISPlanning.categories.flatMap(category=>category==='Recess'&&list.some(x=>x.category===category)?list.filter(x=>x.category===category).map(x=>({category,id:x.id,name:x.name})): [{category}]);}
function dutiesInColumn(list,column,day){return list.filter(x=>x.category===column.category&&(!column.id||x.id===column.id)&&(day===undefined||x.days.includes(day)));}
function dutyPage(root){
 GSISPlanning.init(v());const list=v().duties,can=kp(),teachers=activeGroupTeachers(),columns=dutyColumns(list),slots=list.reduce((n,x)=>n+x.days.length,0),unfilled=list.reduce((n,x)=>n+x.days.filter(day=>!x.teachers[day]).length,0);
 root.innerHTML='<p class="hint">'+unfilled+' of '+slots+' duty slots unfilled. Blanks may be published. Each assigned occurrence counts as 1 period.</p>';
 const tools=document.createElement('div');tools.className='tools';tools.append(button('Export PDF',exportDutyPDF));root.append(tools);
 const lastInCategory=(c,i)=>columns[i+1]?.category!==c.category;
 const definition=x=>'<div class="duty-definition"><button data-edit-duty="'+esc(x.id)+'" '+(!can?'disabled':'')+'>'+esc(x.name)+'<small>'+x.start+'–'+x.end+'</small></button>'+(x.adhoc?'<small>'+GSISPlanning.days[x.days[0]]+' only</small>':'<div class="weekday-list">'+GSISPlanning.days.map((day,i)=>'<label><input type="checkbox" data-toggle-duty="'+esc(x.id)+'" data-day="'+i+'" '+(x.days.includes(i)?'checked':'')+' '+(!can?'disabled':'')+'>'+day+'</label>').join('')+'</div>')+'<button data-remove-duty="'+esc(x.id)+'" '+(!can?'disabled':'')+' aria-label="Remove '+esc(x.name)+'">×</button></div>';
 const slot=(x,di)=>'<div class="duty-slot '+(!x.teachers[di]?'unfilled-duty':'')+'"><button data-edit-duty="'+esc(x.id)+'" '+(!can?'disabled':'')+'>'+esc(x.name)+'</button><small>'+x.start+'–'+x.end+'</small><select data-duty-teacher="'+esc(x.id)+'" data-day="'+di+'" aria-label="'+esc(GSISPlanning.days[di]+' '+x.name)+'" '+(!can?'disabled':'')+'><option value="">Unfilled</option>'+options(teachers.map(t=>[t.id,t.name]),x.teachers[di]||'')+'</select>'+(x.adhoc?'<button data-remove-duty="'+esc(x.id)+'" '+(!can?'disabled':'')+' aria-label="Remove '+esc(x.name)+'">Remove day duty</button>':'')+'</div>';
 const widths=columns.map(c=>c.category==='Recess'?190:c.category==='After School'?260:300);
 const head='<thead><tr><th>Day / Venue</th>'+GSISPlanning.categories.map(category=>'<th scope="colgroup" colspan="'+columns.filter(c=>c.category===category).length+'">'+esc(category)+'</th>').join('')+'</tr></thead>';
 const definitions='<tr class="duty-definitions"><th scope="row">Duty / timing</th>'+columns.map((c,i)=>'<th data-duty-column="'+esc(c.id||c.category)+'">'+dutiesInColumn(list,c).map(definition).join('')+(lastInCategory(c,i)?'<button data-add-duty="'+esc(c.category)+'" '+(!can?'disabled':'')+'>+ Duty</button>':'')+'</th>').join('')+'</tr>';
 const rows=GSISPlanning.days.map((day,di)=>'<tr><th scope="row">'+day+'</th>'+columns.map((c,i)=>{const duties=dutiesInColumn(list,c,di);return '<td data-duty-column="'+esc(c.id||c.category)+'" class="'+(!duties.length?'not-scheduled':'')+'">'+duties.map(x=>slot(x,di)).join('')+(lastInCategory(c,i)?'<button data-adhoc-day="'+di+'" data-category="'+esc(c.category)+'" '+(!can?'disabled':'')+'>+ Day duty</button>':'')+'</td>';}).join('')+'</tr>').join('');
 const descriptions='<section class="duty-descriptions"><h3>Description of Duties</h3>'+GSISPlanning.categories.map(category=>'<div><h4>'+category+'</h4>'+(category==='Recess'?'<p class="recess-description">'+esc(recessDescription(list)||'Description not entered').replace(/\n/g,'<br>')+'</p><button data-edit-recess '+(!can||!list.some(x=>x.category==='Recess')?'disabled':'')+'>Edit Recess description</button>':list.filter(x=>x.category===category).map(x=>'<p><button data-edit-duty="'+esc(x.id)+'" '+(!can?'disabled':'')+'>'+esc(x.name)+(x.adhoc?' ('+GSISPlanning.days[x.days[0]]+')':'')+'</button> '+esc(x.description||'Description not entered')+'</p>').join(''))+'</div>').join('')+'</section>';
 root.insertAdjacentHTML('beforeend','<div class="scroll duty-scroll"><div class="duty-roster-title"><strong>GONGSHANG PRIMARY SCHOOL</strong><span>TEACHERS’ DUTY ROSTER · '+esc(v().name)+'</span></div><table class="duty-table" data-no-sort="true" data-no-column-controls="true" style="--duty-width:'+(85+widths.reduce((a,b)=>a+b,0))+'px"><colgroup><col style="width:85px">'+widths.map(width=>'<col style="width:'+width+'px">').join('')+'</colgroup>'+head+'<tbody>'+definitions+rows+'</tbody></table>'+descriptions+'</div>');
 // Use the print roster's row/column spans for entry too. Definition editing stays nearby.
 const oldTable=root.querySelector('.duty-table'),definitionRow=oldTable.querySelector('.duty-definitions'),manage=document.createElement('details');manage.className='duty-manage';manage.innerHTML='<summary>Duty names, times and days</summary><table><tbody></tbody></table>';manage.querySelector('tbody').append(definitionRow);root.querySelector('.duty-scroll').prepend(manage);
 const parsed=new DOMParser().parseFromString(dutyPrintHTML(),'text/html'),roster=parsed.querySelector('table');roster.className='duty-table duty-entry-roster';roster.dataset.noSort='true';roster.dataset.noColumnControls='true';roster.style.setProperty('--duty-width','2400px');oldTable.replaceWith(roster);
 roster.querySelectorAll('[data-duty-cell]').forEach(cell=>{const x=list.find(d=>d.id===cell.dataset.dutyCell),di=Number(cell.dataset.day);cell.innerHTML='<select data-duty-teacher="'+esc(x.id)+'" data-day="'+di+'" aria-label="'+esc(GSISPlanning.days[di]+' '+x.name)+'" '+(!can?'disabled':'')+'><option value="">Unfilled</option>'+options(teachers.map(t=>[t.id,t.name]),x.teachers[di]||'')+'</select>';});
 const addDay=document.createElement('div');addDay.className='duty-day-tools';addDay.innerHTML=GSISPlanning.days.map((day,di)=>'<div><strong>'+day+'</strong>'+GSISPlanning.categories.map(category=>'<button data-adhoc-day="'+di+'" data-category="'+esc(category)+'" '+(!can?'disabled':'')+'>+ '+esc(category)+'</button>').join('')+'</div>').join('');roster.after(addDay);
 root.querySelector('[data-edit-recess]')?.addEventListener('click',editRecessDescription);
 root.querySelectorAll('[data-add-duty]').forEach(b=>b.onclick=()=>editDuty(null,undefined,b.dataset.addDuty));root.querySelectorAll('[data-adhoc-day]').forEach(b=>b.onclick=()=>editDuty(null,Number(b.dataset.adhocDay),b.dataset.category));root.querySelectorAll('[data-edit-duty]').forEach(b=>b.onclick=()=>editDuty(b.dataset.editDuty));
 root.querySelectorAll('[data-remove-duty]').forEach(b=>b.onclick=()=>{if(confirm('Remove this duty and all its assignments?')){dutyStage(clone(v().duties).filter(x=>x.id!==b.dataset.removeDuty));render();}});
 root.querySelectorAll('[data-toggle-duty]').forEach(i=>i.onchange=()=>{const next=clone(v().duties),x=next.find(x=>x.id===i.dataset.toggleDuty),day=Number(i.dataset.day);if(i.checked)x.days.push(day);else{x.days=x.days.filter(d=>d!==day);delete x.teachers[day];}x.days.sort();dutyStage(next);render();});
 root.querySelectorAll('[data-duty-teacher]').forEach(i=>i.onchange=()=>{const next=clone(v().duties);next.find(x=>x.id===i.dataset.dutyTeacher).teachers[i.dataset.day]=i.value;dutyStage(next);render();});
}
function dutyPrintHTML(){
 const doc=v(),list=doc.duties,teacher=id=>doc.teachers.find(t=>t.id===id)?.name||(id?'Recorded teacher':''),recess=list.filter(x=>x.category==='Recess'),named=(category)=>list.filter(x=>x.category===category),before=named('Before School'),dismiss=named('Dismissal'),lunch=named('After School'),timing=x=>x.start.replace(':','')+'–'+x.end.replace(':',''),td=(text,span=1,klass='',colspan=1,attrs='')=>'<td rowspan="'+span+'" colspan="'+colspan+'" class="'+klass+'" '+attrs+'>'+text+'</td>';
 const widths=[5.5,6.2,11.9,...recess.map(()=>46/recess.length),7.1,15.3,5,8];
 const header='<tr><th rowspan="4">DAY /<br>VENUE</th><th colspan="2">BEFORE SCHOOL</th>'+recess.map(()=>'<th>RECESS</th>').join('')+'<th colspan="2">DISMISSAL</th><th colspan="2">AFTER SCHOOL</th></tr>'+[0,1,2].map((row)=>'<tr>'+(before[row]?'<th>'+esc(before[row].name)+'</th><th>'+timing(before[row])+'</th>':'<th></th><th></th>')+recess.map((x,i)=>'<th>'+esc(row===0?x.name:row===1?timing(x):'pd '+(i+3))+'</th>').join('')+'<th colspan="2">'+(row===0?dismiss.filter(x=>!x.adhoc).map(x=>esc(x.name)+' '+timing(x)).join(' · '):row===1?dismiss.filter(x=>x.adhoc).map(x=>esc(x.name)+' '+timing(x)).join(' · '):'pd 13')+'</th><th colspan="2">'+(row===0?'LUNCH':row===1?lunch.map(x=>timing(x)+(x.adhoc?' Wed':'')).filter((x,i,a)=>a.indexOf(x)===i).join(' / '):'pd 13')+'</th></tr>').join('');
 let body='';for(let di=0;di<5;di++){
  const bs=before.filter(x=>x.days.includes(di)),ds=dismiss.filter(x=>x.days.includes(di)),ls=lunch.filter(x=>x.days.includes(di)),count=Math.max(di===2?7:4,bs.length,ds.length,ls.length);
  function plan(items,kind){if(!items.length)return [{at:0,span:count,item:null}];let starts=items.map((x,i)=>Math.floor(i*count/items.length));if(kind==='before'&&items.length===3)starts=[0,1,3];if(kind==='dismiss'&&items.length===3)starts=[0,1,3];if(kind==='dismiss'&&di===2&&items.length===5)starts=[0,1,3,5,6];if(kind==='lunch'&&di===2&&items.length===2)starts=[0,3];return items.map((item,i)=>({item,at:starts[i],span:(starts[i+1]??count)-starts[i]}));}
  const plans=[plan(bs,'before'),plan(ds,'dismiss'),plan(ls,'lunch')];for(let row=0;row<count;row++){
   body+='<tr class="'+(row===0?'day-start':'')+'">';if(row===0)body+='<th rowspan="'+count+'">'+GSISPlanning.days[di].toUpperCase()+'</th>';
   const cells=(p,kind)=>{const cell=p.find(x=>x.at===row);if(!cell)return '';if(!cell.item)return td('',cell.span,'not-scheduled',2);const x=cell.item;return td(esc(kind==='lunch'?timing(x):x.name),cell.span,'duty-label')+td(esc(teacher(x.teachers[di])),cell.span,'teacher',1,'data-duty-cell="'+esc(x.id)+'" data-day="'+di+'"');};
   body+=cells(plans[0],'before');if(row===0)body+=recess.map(x=>td(esc(teacher(x.teachers[di])),count,x.days.includes(di)?'teacher':'not-scheduled',1,x.days.includes(di)?'data-duty-cell="'+esc(x.id)+'" data-day="'+di+'"':'')).join('');body+=cells(plans[1],'dismiss')+cells(plans[2],'lunch')+'</tr>';
  }
 }
 const paragraphs=items=>items.filter(x=>x.description).map(x=>'<p><b>'+esc(x.name)+':</b> '+esc(x.description).replace(/\n/g,'<br>')+'</p>').join(''),late=before.filter(x=>/LATE/i.test(x.name)),left='<section><h4>Before School</h4>'+paragraphs(before.filter(x=>!late.includes(x)))+'<h4>Recess</h4><p>'+esc(recessDescription(list)).replace(/\n/g,'<br>')+'</p><h4>Latecomers</h4>'+paragraphs(late)+'</section>',right='<section><h4>Dismissal</h4>'+paragraphs(dismiss)+'<h4>Lunch</h4>'+paragraphs(lunch)+'</section>';
 const updated=doc.dutyUpdatedAt||(doc.audit||[]).filter(a=>a.action==='setDuties').at(-1)?.at||'',date=updated?new Date(updated).toLocaleDateString('en-SG',{day:'2-digit',month:'short',year:'numeric'}):'Not recorded';
 return '<!doctype html><html><head><meta charset="utf-8"><title>GSiS Duty '+esc(doc.name)+'</title><style>@page{size:A4 landscape;margin:19.05mm 6.35mm}*{box-sizing:border-box}body{font:7.5pt Arial,sans-serif;color:#000;margin:0;background:#e8ebee}.page{width:284.3mm;margin:8mm auto;padding:0;background:#fff}h1,h2{text-align:center;margin:0;font-size:10pt;line-height:1.15}h2{font-size:9pt}table{border-collapse:collapse;table-layout:fixed;width:100%;margin:2mm 0}th,td{border:.2mm solid #222;padding:.45mm;overflow-wrap:anywhere;vertical-align:middle}thead th{font-size:7pt;line-height:1.1}tbody tr{height:3.05mm}tbody th{text-align:center}.duty-label{font-weight:normal}.teacher{text-align:center}.day-start>*{border-top:.4mm solid #222}.not-scheduled{background:#ddd;print-color-adjust:exact;-webkit-print-color-adjust:exact}h3{font-size:9pt;margin:2mm 0 1mm}h4{font-size:7.5pt;text-decoration:underline;margin:1mm 0}.descriptions{display:grid;grid-template-columns:1fr 1fr;gap:7mm;line-height:1.18}p{margin:.75mm 0}footer{text-align:right;margin-top:1mm}button{margin:8px}.overflow-note{font:12px Arial;margin:8px;color:#7c2719}tr,p{break-inside:avoid}@media print{body{background:white}.page{width:auto;margin:0}button,.overflow-note{display:none}thead{display:table-header-group}}</style></head><body><button onclick="window.print()">Save as PDF / Print</button><p class="overflow-note">A4 landscape. Extra duties or long descriptions continue onto another page when needed.</p><main class="page"><h1>GONGSHANG PRIMARY SCHOOL</h1><h2>TEACHERS’ DUTY ROSTER · '+esc(doc.name)+'</h2><table><colgroup>'+widths.map(w=>'<col style="width:'+w+'%">').join('')+'</colgroup><thead>'+header+'</thead><tbody>'+body+'</tbody></table><h3>Description Of Duties</h3><div class="descriptions">'+left+right+'</div><footer>Updated: '+esc(date)+(queuedEdits().length?' · UNSAVED DRAFT':'')+'</footer></main></body></html>';
}

function exportDutyPDF(){const w=window.open('','_blank');if(!w){alert('Allow pop-ups to export the Duty PDF.');return;}w.document.write(dutyPrintHTML());w.document.close();w.focus();setTimeout(()=>w.print(),200);}

function fortnightPage(root){
 GSISPlanning.init(v());const rows=Object.entries(v().loads).flatMap(([level,loads])=>Object.keys(loads).filter(s=>!['FT','TTT','PD','Duty','Duties','FTT','FTGP','Assembly'].some(x=>x.toLowerCase()===s.toLowerCase())&&GSISWorkload.category(v(),s)==='Teaching'&&loads[s]!==null&&loads[s]!==undefined&&!(typeof loads[s]==='string'&&/^(?:n\/a|\(n\/a\))$/i.test(loads[s].trim()))).map(subject=>({level,subject,key:JSON.stringify([level,subject]),total:loads[subject]})));
 root.innerHTML='<p class="hint">Off repeats the same weekly pattern. Enable a subject to plan different weeks. Fortnight values are retained while Off but are inactive. Weekly and fortnight columns are alternative planning views, not additive workloads.</p><div class="scroll fortnight-scroll"><table class="fortnight-table" data-no-sort="true" data-no-column-controls="true"><thead><tr><th rowspan="2">Level / Subject</th><th colspan="4">Count Per Week (no odd/even)</th><th colspan="4">Count per fortnight</th><th rowspan="2">Comments / Remarks</th></tr><tr>'+['Triple','Double','Single','Total','Triple','Double','Single','Total'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>{const value=v().fortnight[r.key]||{},enabled=value.enabled===true,group=prefix=>{const inactive=prefix==='f'&&!enabled,keys=prefix==='w'?['wt','wd','ws']:['ft','fd','fs'],sum=keys.reduce((n,k,i)=>n+(3-i)*Number(value[k]||0),0),total=r.total===null?null:r.total*(prefix==='w'?1:2),has=keys.some(k=>value[k]!==undefined&&value[k]!==''),warn=!inactive&&has&&(total===null||sum!==total);return keys.map(k=>'<td class="'+(inactive?'fortnight-inactive':'')+'"><input type="number" min="0" max="200" step="1" data-split-row="'+esc(r.key)+'" data-split-field="'+k+'" value="'+esc(value[k]??'')+'" '+(inactive?'disabled data-export-value="Inactive" ':!kp()?'readonly ':'')+'aria-label="P'+r.level+' '+esc(r.subject)+' '+k+'"></td>').join('')+'<td class="'+(inactive?'fortnight-inactive':warn?'split-warning':'')+'" title="'+(inactive?'Inactive — repeats weekly':warn?'Split totals '+sum+'; Subject Load target '+(total??'n/a'):'From Subject Load')+'">'+(inactive?'Weekly repeat':(total??'n/a')+(warn?' ⚠':''))+'</td>';};return '<tr><th>P'+esc(r.level)+' '+esc(subjectLabel(r.subject))+' <button class="fortnight-switch" role="switch" aria-checked="'+enabled+'" aria-label="Distinguish fortnight for P'+r.level+' '+esc(subjectLabel(r.subject))+'" data-fortnight-toggle="'+esc(r.key)+'" '+(!kp()?'disabled':'')+'><span aria-hidden="true"></span></button><small>'+(enabled?'On · fortnight':'Off · weekly repeat')+'</small></th>'+group('w')+group('f')+'<td><input data-split-row="'+esc(r.key)+'" data-split-field="remarks" maxlength="4000" value="'+esc(value.remarks||'')+'" '+(!kp()?'readonly':'')+' aria-label="Comments"></td></tr>';}).join('')+'</tbody></table></div>';
 const update=row=>{const b=row.querySelector('[data-fortnight-toggle]'),key=b.dataset.fortnightToggle,value=v().fortnight[key]||{},enabled=value.enabled===true;b.setAttribute('aria-checked',String(enabled));row.querySelector('th small').textContent=enabled?'On · fortnight':'Off · weekly repeat';for(const prefix of ['w','f']){const inactive=prefix==='f'&&!enabled,keys=prefix==='w'?['wt','wd','ws']:['ft','fd','fs'],inputs=keys.map(k=>[...row.querySelectorAll('[data-split-field]')].find(i=>i.dataset.splitField===k)),total=Number(v().loads[JSON.parse(key)[0]][JSON.parse(key)[1]])*(prefix==='w'?1:2),sum=keys.reduce((n,k,i)=>n+(3-i)*Number(value[k]||0),0),warn=!inactive&&keys.some(k=>value[k]!==undefined&&value[k]!=='')&&sum!==total;for(const i of inputs){i.disabled=inactive;i.closest('td').classList.toggle('fortnight-inactive',inactive);if(inactive)i.dataset.exportValue='Inactive';else delete i.dataset.exportValue;}const cell=inputs.at(-1).closest('td').nextElementSibling;cell.classList.toggle('fortnight-inactive',inactive);cell.classList.toggle('split-warning',warn);cell.textContent=inactive?'Weekly repeat':total+(warn?' ⚠':'');cell.title=inactive?'Inactive — repeats weekly':warn?'Split totals '+sum+'; Subject Load target '+total:'From Subject Load';}};
 root.querySelectorAll('[data-fortnight-toggle]').forEach(b=>b.onclick=()=>{if(queueFlight)return;queueCell({operation:'setFortnight',row:b.dataset.fortnightToggle,field:'enabled',value:b.getAttribute('aria-checked')!=='true',expected:v().fortnight[b.dataset.fortnightToggle]?.enabled??''});update(b.closest('tr'));});
 root.querySelectorAll('[data-split-field]').forEach(i=>{i.oninput=()=>unsavedDraft=true;i.onchange=()=>{const field=i.dataset.splitField,value=field==='remarks'?i.value:i.value===''?'':Number(i.value);if(field!=='remarks'&&value!==''&&(!Number.isInteger(value)||value<0||value>200)){i.setCustomValidity('Use a whole number of lesson blocks');return;}i.setCustomValidity('');unsavedDraft=false;queueCell({operation:'setFortnight',row:i.dataset.splitRow,field,value,expected:v().fortnight[i.dataset.splitRow]?.[field]??''});update(i.closest('tr'));};});
}
function dutyCardData(doc){const byDuty=new Map(),byTeacher=new Map();for(const duty of doc.duties||[]){const group=duty.category==='Recess'?'RECESS':duty.category==='After School'&&/^LUNCH(?:\s*\d+)?$/i.test(duty.name)?'LUNCH':duty.name;const key=duty.category+'|'+group;if(!byDuty.has(key))byDuty.set(key,{name:group,teachers:new Map()});for(const day of new Set(duty.days)){const id=duty.teachers[day];if(!id)continue;const entry=byDuty.get(key).teachers;entry.set(id,(entry.get(id)||0)+1);byTeacher.set(id,(byTeacher.get(id)||0)+1);}}return {byDuty,byTeacher};}
function dutyCardsPage(root){const data=dutyCardData(v()),name=id=>v().teachers.find(t=>t.id===id)?.name||'Recorded teacher ('+id+')',sort=(a,b)=>natural(name(a[0]),name(b[0]));root.innerHTML='<p class="hint">Read-only totals from this version’s Duty allocation'+(queuedEdits().length?' · includes unsaved draft changes':'')+'. Each assigned occurrence counts once.</p><div class="duty-cards"><section>'+table(['Duty','Teachers / Count'],[...data.byDuty.values()].filter(g=>g.teachers.size).map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+[...g.teachers].sort(sort).map(([id,n])=>esc(name(id))+' × '+n).join('<br>')+'</td></tr>'))+'</section><section>'+table(['No.','Teacher','Total duties'],[...data.byTeacher].sort(sort).map(([id,n],i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(name(id))+'</td><td>'+n+'</td></tr>'))+'</section></div>';}

/* GSIS_PLANNING_UI_END */


// Keep equal DOM branches and scroll owners during a soft refresh; replace edited cells
// as units so their new controls retain the listeners created for the current data.
// Different container classes have different owners (for example table tools versus
// the table scroll wrapper); never move table content into a stale tool container.
function comparableNode(node){const copy=node.cloneNode(true);if(copy.nodeType===1)for(const x of [copy,...copy.querySelectorAll('*')]){x.removeAttribute('style');x.removeAttribute('data-grid-column');x.classList.remove('frozen-col','table-window','single-scroll-owner','freeze-header');for(const k of x.getAttributeNames())if(x.getAttribute(k)==='')x.removeAttribute(k);}return copy;}
function patchContent(target,fresh){const old=[...target.childNodes],next=[...fresh.childNodes];for(let i=0;i<Math.max(old.length,next.length);i++){const a=old[i],b=next[i];if(!b){a?.remove();continue;}if(!a){target.append(b);continue;}const same=comparableNode(a).isEqualNode(comparableNode(b))&&(!a.querySelectorAll||[...a.querySelectorAll('input,select,textarea')].every((x,j)=>{const y=b.querySelectorAll('input,select,textarea')[j];return x.value===y.value&&x.checked===y.checked;}));if(same)continue;const container=a.nodeType===1&&b.nodeType===1&&a.tagName===b.tagName&&!['TD','TH','BUTTON','INPUT','SELECT','TEXTAREA','DETAILS','SUMMARY'].includes(a.tagName)&&a.id===b.id&&a.className===b.className;if(container)patchContent(a,b);else a.replaceWith(b);}}

/* GSIS_WORKLOAD_BEGIN */
/* Derived teacher-periods/week. Pure: never writes deployment or contact records. */
var GSISWorkload=(function(){
 const tg=()=>typeof GSISVenueGroups!=='undefined'?GSISVenueGroups:require('./venue-groups.js');
 const FT=['Assembly','FTGP','FTT'],KINDS=['FTT','Teaching','Non-teaching','Unclassified'];
 const key=c=>String(c.level)+(String(c.shortName).startsWith(String(c.level))?String(c.shortName).slice(String(c.level).length):c.shortName);
 const isPD=s=>s==='PD'||s==='TTT';
 const aliases=s=>s==='PE'?'PHE':s==='Science'?'Sci':isPD(s)?'PD':s;
 const subjectIdentity=s=>{const code=String(s).trim().toUpperCase();return code==='PE'?'PHE':code==='SCIENCE'?'SCI':code==='TTT'?'PD':code;};
 const subjects=d=>[...new Set([...Object.values(d.loads||{}).flatMap(r=>Object.keys(r)).filter(s=>s!=='FT').map(aliases),'PD'])];
 const groupOnly=['CL','ML','TL','HCL','HML','HTL','FCL','FML','FTL','CCE EL'],defaultGroupOnly=['RRP','SDR','CCE','LSM'];
 const subjectTypeSubjects=d=>[...new Set(Object.values(d.loads||{}).flatMap(r=>Object.keys(r)).filter(s=>!['FT','PD','TTT'].includes(s)))];
 function subjectType(d,s){
  const value=Object.prototype.hasOwnProperty.call(d.subjectTypes||{},s)?d.subjectTypes[s]:null;
  return ['class','tg','both'].includes(value)?value:groupOnly.includes(s)||defaultGroupOnly.includes(s)?'tg':FT.includes(s)||['FT','PD','TTT'].includes(s)?'class':'both';
 }
 function validateSubjectType(d,s,value){
  if(!subjectTypeSubjects(d).includes(s)||!['class','tg','both'].includes(value))throw Error('Choose an existing subject and Class only, TG only or Both.');
  return value;
 }
 const isGroupSubject=(d,s)=>subjectTypeSubjects(d).includes(s)&&subjectType(d,s)!=='class';
 function category(d,s){return isPD(s)?'Non-teaching':d.workload?.categories?.[s]||(FT.includes(s)?'FTT':'Teaching');}
 const defaultSpecialists=()=>[{subject:'PHE',pool:'assignment',modifier:'PE',demand:'classes'},{subject:'Art',pool:'assignment',modifier:'Art',demand:'classes'},{subject:'Music',pool:'assignment',modifier:'Music',demand:'classes'},{subject:'TL',pool:'assignment',modifier:'',demand:'groups'}];
 const specialists=d=>(d.workload?.specialists||defaultSpecialists()).map(x=>({...x,pool:'assignment'}));
 function nonTeachingActivities(d,value=d.workload?.nonTeachingActivities===undefined?[]:d.workload.nonTeachingActivities){
  if(!Array.isArray(value)||value.length>100)throw Error('Use up to 100 non-teaching activities.');
  const ids=new Set(),codes=new Set(),teachers=new Set((d.teachers||[]).map(t=>t.id));
  const reserved=new Set([...subjects(d),...FT,'FT','TTT','Duty',...Object.getOwnPropertyNames(Object.prototype)].map(subjectIdentity));
  return value.map(a=>{
   if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['id','code','name','weeklyPeriods','teachers'].includes(k))||typeof a.id!=='string'||!a.id.trim()||a.id.length>100||ids.has(a.id)||typeof a.code!=='string'||!a.code.trim()||a.code.length>40||codes.has(subjectIdentity(a.code))||typeof a.name!=='string'||!a.name.trim()||a.name.length>160)throw Error('Enter a unique ID, code and name for each non-teaching activity.');
   if(reserved.has(subjectIdentity(a.code)))throw Error('Use an activity code distinct from subjects and reserved names.');
   if(typeof a.weeklyPeriods!=='number'||!Number.isFinite(a.weeklyPeriods)||a.weeklyPeriods<0)throw Error('Activity periods must be finite, non-negative weekly periods.');
   if(!Array.isArray(a.teachers)||a.teachers.length>300||a.teachers.some(id=>typeof id!=='string'||!teachers.has(id))||new Set(a.teachers).size!==a.teachers.length)throw Error('Choose each teacher only once per non-teaching activity.');
   ids.add(a.id);codes.add(subjectIdentity(a.code));return {id:a.id,code:a.code.trim(),name:a.name.trim(),weeklyPeriods:a.weeklyPeriods,teachers:a.teachers.slice()};
  });
 }
 function validate(d,value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['categories','specialists','noFTT','nonTeachingActivities'].includes(k))||!value.categories||typeof value.categories!=='object'||Array.isArray(value.categories))throw Error('Invalid workload settings');
  const known=subjects(d),out={categories:{}};
  for(const [s,c] of Object.entries(value.categories)){
   if(!known.includes(aliases(s))||!KINDS.includes(c))throw Error('Choose an existing subject and workload category');
   out.categories[aliases(s)]=isPD(s)?'Non-teaching':c;
  }
  if(value.specialists!==undefined){
   if(!Array.isArray(value.specialists)||value.specialists.length>known.length)throw Error('Invalid specialist settings');
   const seen=new Set();out.specialists=value.specialists.map(x=>{
    if(!x||!known.includes(x.subject)||isPD(x.subject)||seen.has(x.subject)||!['modifier','assignment'].includes(x.pool)||!['classes','groups'].includes(x.demand)||typeof x.modifier!=='string'||x.modifier.length>60||x.pool==='modifier'&&!x.modifier.trim())throw Error('Choose a teaching subject, pool and demand basis for each specialist reference');
    seen.add(x.subject);if(x.subject==='TL'&&(x.pool!=='assignment'||x.demand!=='groups'))throw Error('TL uses assigned teachers and defined TL groups');
    if((out.categories[x.subject]||category(d,x.subject))!=='Teaching')throw Error('Specialist subjects must be teaching subjects');
    return {subject:x.subject,pool:'assignment',modifier:x.modifier.trim(),demand:x.demand};
   });
  }
  if(value.noFTT!==undefined){
   if(!Array.isArray(value.noFTT)||value.noFTT.some(id=>typeof id!=='string'||!(d.teachers||[]).some(t=>t.id===id))||new Set(value.noFTT).size!==value.noFTT.length)throw Error('Choose teachers in this version for No FTT expected');
   out.noFTT=value.noFTT.slice();
  }
  // Older category editors omit activities. Only an explicit empty list clears them.
  if(value.nonTeachingActivities!==undefined||d.workload?.nonTeachingActivities!==undefined)out.nonTeachingActivities=nonTeachingActivities(d,value.nonTeachingActivities===undefined?d.workload.nonTeachingActivities:value.nonTeachingActivities);
  return out;
 }
 function rate(d,l,s){const n=d.loads?.[String(l)]?.[s];return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}
 // The same offered form-class cells drive IP Deploy and unstaffed demand.
 function isFormSubject(d,level,subject){
  if(['FT','PD','TTT'].includes(subject)||subjectType(d,subject)==='tg')return false;
  if(/^Pull\/(?:F?Sci|FSC)$/i.test(subject)&&!(d.assignments||[]).some(a=>a.subject===subject)&&!(d.groups||[]).some(g=>g.subject===subject))return false;
  return rate(d,level,subject)!==null&&(subject==='Art'||!(d.groups||[]).some(g=>g.levelWide&&tg().levels(g).includes(String(level))&&g.subject===subject));
 }
 const empty=()=>({FTT:0,Teaching:0,'Non-teaching':0,Unclassified:0,total:0,incomplete:false});
 function add(t,cat,n){if(n===null||cat==='Unclassified')t.incomplete=true;if(n!==null){t[cat]+=n;if(cat!=='Unclassified')t.total+=n;}}
 function modal(values){
  if(!values.length||values.some(n=>n===null||!Number.isFinite(n)))return null;
  const counts=new Map();values.forEach(n=>{const prior=[...counts.keys()].find(k=>Math.abs(k-n)<1e-9),k=prior===undefined?n:prior;counts.set(k,(counts.get(k)||0)+1);});
  const most=Math.max(...counts.values());return Math.max(...[...counts].filter(([,n])=>n===most).map(([n])=>n));
 }
 function band(q){if(q===null||!Number.isFinite(q))return null;const snap=n=>Math.abs(n-Math.round(n))<1e-9?Math.round(n):n;return {lower:Math.floor(snap(q*.9)),upper:Math.ceil(snap(q*1.1))};}
 function tokens(t){return String(t.profile?.['Subject Modifier']||t.subject||'').split(/[,;]\s*/).map(x=>x.trim()).filter(Boolean);}
 function employment(t){
  const tags=String(t.profile?.['Employment Modifier']||t.employment||'').split(/[,;]\s*/).map(x=>x.trim().toUpperCase());
  const role=String(t.profile?.Role||t.role||'').trim().toUpperCase();
  return ['RT','FAJT','4/5'].find(x=>tags.includes(x)||role===x)||'Full time';
 }
 // Planned provision is separate from actual assignments and from relief.
 function plannedDemand(d,ledger,rows,activities){
  const entries=[],issues=[],seen=new Set(),eligible=new Set(rows.filter(r=>r.active&&r.rules.eligible).map(r=>r.teacher.id));
  const groups=d.groups||[],classes=d.classes||[],assigned=new Map();
  for(const e of ledger){if(!eligible.has(e.teacher))continue;const k=JSON.stringify([e.target,e.subject]);if(!assigned.has(k))assigned.set(k,new Set());assigned.get(k).add(e.teacher);}
  function put(target,subject,load,kind,label){
   const k=JSON.stringify([target,subject]);if(seen.has(k))return;seen.add(k);
   const count=assigned.get(k)?.size||0,units=Math.max(1,count),cat=category(d,subject);
   if(load===null||cat==='Unclassified')issues.push(label+': missing or unclassified weekly load.');
   entries.push({target,subject,kind,label,load,units,assigned:count,periods:load===null?null:load*units});
  }
  for(const c of classes)if(!d.loads?.[String(c.level)])issues.push(key(c)+': missing level loads.');
  for(const c of classes)for(const raw of Object.keys(d.loads?.[String(c.level)]||{})){
   const subject=aliases(raw),target=c.ref||key(c);if(raw==='FT'||isPD(subject))continue;
   const k=JSON.stringify([target,subject]);
   // Existing actual assignments still count even if the cell is no longer offered.
   if(!isFormSubject(d,c.level,raw)&&!assigned.has(k))continue;
   put(target,subject,rate(d,String(c.level),raw),'class',key(c)+' '+subject);
  }
  for(const g of groups)put(g.id,aliases(g.subject),tg().periods(d,g),'group',g.name);
  for(const plt of d.organisations?.plt||[])put(plt.id,'PD',2,'plt',plt.name);
  for(const a of activities){const count=a.teachers.filter(id=>eligible.has(id)).length;seen.add(JSON.stringify(['activity:'+a.id,a.code]));entries.push({target:'activity:'+a.id,subject:a.code,kind:'activity',label:a.name,load:a.weeklyPeriods,units:count,assigned:count,periods:a.weeklyPeriods*count});}
  for(const duty of d.duties||[])for(const day of new Set(duty.days||[]))entries.push({target:duty.id,subject:'Duty',kind:'duty',label:(duty.name||duty.id)+' '+day,load:1,units:1,assigned:eligible.has(duty.teachers?.[day])?1:0,periods:1});
  for(const e of ledger)if(!seen.has(JSON.stringify([e.target,e.subject]))&&eligible.has(e.teacher))issues.push('Assignment outside planned provision: '+e.target+' '+e.subject);
  const total=entries.reduce((n,e)=>n+(e.periods||0),0);
  return {entries,total,complete:!issues.length,issues:[...new Set(issues)]};
 }
 // Only the two configured budgets are needed by the public ledger. No private
 // relief defaults or legacy timetable budgets may substitute for missing input.
 function fajtTargetSettings(value){
  const weeklyPeriods=value?.weeklyPeriods,fajtWeeklyPeriods=value?.fajtWeeklyPeriods;
  return value?.schema===3&&[weeklyPeriods,fajtWeeklyPeriods].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&Number.isFinite(fajtWeeklyPeriods/weeklyPeriods)?{schema:3,weeklyPeriods,fajtWeeklyPeriods}:null;
 }
 function analyse(d,rules,reliefSettings=d.relief){
  const targetSettings=fajtTargetSettings(reliefSettings);
  const subs=subjects(d),levels=['1','2','3','4','5','6'],reportLevels=[...levels,...((d.groups||[]).some(g=>tg().levels(g).length>1)?['multi']:[])],totals=empty(),byLevel=Object.fromEntries(reportLevels.map(l=>[l,{...empty(),subjects:{}}])),issues=[],seen=new Set(),rows=[],ledger=[];
  let activities=[],activityError='';try{activities=nonTeachingActivities(d);}catch(e){activityError=e.message;issues.push(activityError);totals.incomplete=true;}
  const groupMap=new Map((d.groups||[]).map(g=>[g.id,g])),groups=[...groupMap.values()],pltMap=new Map((d.organisations?.plt||[]).map(g=>[g.id,g])),plts=[...pltMap.values()];
  // These lookups live for this calculation only; draft edits cannot leave stale results.
  const classRefs=new Map(),classCodes=new Map();for(const c of d.classes||[]){if(!classRefs.has(c.ref))classRefs.set(c.ref,c);if(!classCodes.has(key(c)))classCodes.set(key(c),c);}
  const assignedIds=new Set((d.assignments||[]).map(a=>a.teacher));
  for(const p of plts)for(const id of p.slots||[])if(id)assignedIds.add(id);
  for(const duty of d.duties||[])for(const day of new Set(duty.days||[]))if(duty.teachers?.[day])assignedIds.add(duty.teachers[day]);
  for(const a of activities)for(const id of a.teachers)assignedIds.add(id);
  const teachers=(d.teachers||[]).slice(),teacherIds=new Set(teachers.map(t=>t.id));for(const id of assignedIds)if(!teacherIds.has(id))teachers.push({id,name:'Missing teacher ('+id+')',active:false,orphan:true});
  for(const t of teachers){const rule=rules(t),active=t.active===true||t.active==='Y';if(!rule.eligible&&!assignedIds.has(t.id))continue;rows.push({teacher:t,active,rules:rule,subjects:{},...empty(),issues:[],capIncomplete:false});}
  const rowMap=new Map(rows.map(r=>[r.teacher.id,r])),assignedTeachers=new Map();
  function record(row,entry){
   ledger.push(entry);const {subject:s,category:cat,periods:n,level:lev}=entry,cell=row.subjects[s]||(row.subjects[s]={periods:0,incomplete:false,entries:[]});
   if(row.active&&row.rules.eligible&&!row.teacher.orphan){const k=JSON.stringify([entry.target,s]);if(!assignedTeachers.has(k))assignedTeachers.set(k,new Set());assignedTeachers.get(k).add(entry.teacher);}
   cell.entries.push(entry);if(n!==null)cell.periods+=n;cell.incomplete=cell.incomplete||n===null||cat==='Unclassified';add(row,cat,n);add(totals,cat,n);
   if(cat==='Unclassified'||n===null&&['FTT','Teaching'].includes(cat))row.capIncomplete=true;
   const level=byLevel[lev];if(level){add(level,cat,n);const sc=level.subjects[s]||(level.subjects[s]={periods:0,incomplete:false});sc.periods+=n||0;sc.incomplete=sc.incomplete||n===null||cat==='Unclassified';}
  }
  for(const a of d.assignments||[]){
   const row=rowMap.get(a.teacher);if(!row)continue;
   // PLT membership is the PD source. A legacy alias is never a second activity.
   if(isPD(a.subject)){
    const linked=pltMap.get(a.target);
    if(!linked||(linked.slots||[]).includes(a.teacher)===false){row.issues.push('Legacy PD/TTT assignment needs matching PLT membership; only PLT attendance is counted.');row.incomplete=true;totals.incomplete=true;}
    continue;
   }
   const g=groupMap.get(a.target),c=a.targetRef?classRefs.get(a.targetRef):classCodes.get(a.target),lev=g&&tg().levels(g).length>1?'multi':String(g?.level||c?.level||a.level||''),target=g?.id||c?.ref||a.target;
   for(const s of a.subject==='FT'?FT:[aliases(a.subject)]){
    const identity=JSON.stringify([a.teacher,target,s]);if(seen.has(identity))continue;seen.add(identity);
    const cat=category(d,s),n=g?tg().periods(d,g):rate(d,lev,s);record(row,{teacher:a.teacher,target,subject:s,level:lev,...(g?{levels:tg().levels(g)}:{}),periods:n,category:cat,assignment:a});
    if(!g&&!c){row.issues.push('Missing class/TG: '+a.target);row.capIncomplete=true;}
    if(n===null)row.issues.push('Missing/not offered load: '+(g?tg().levelLabel(g):'P'+lev)+' '+s);
    if(cat==='Unclassified')row.issues.push('Classify '+s+' in Workload settings');
   }
  }
  for(const row of rows){
   row.nonTeachingActivities=activities.filter(a=>a.teachers.includes(row.teacher.id)).map(({teachers,...a})=>a);
   for(const a of row.nonTeachingActivities)record(row,{teacher:row.teacher.id,target:'activity:'+a.id,subject:a.code,level:'',periods:a.weeklyPeriods,category:'Non-teaching',source:'activity',label:a.name});
   if(activityError){row.incomplete=true;row.issues.push(activityError);}
   row.pdGroups=plts.filter(p=>(p.slots||[]).includes(row.teacher.id));row.pd=row.pdGroups.length*2;
   for(const p of row.pdGroups)record(row,{teacher:row.teacher.id,target:p.id,subject:'PD',level:'',periods:2,category:'Non-teaching',source:'plt',label:p.name,assignment:{teacher:row.teacher.id,target:p.id,subject:'PD'}});
   let duties=0;for(const duty of d.duties||[])for(const day of new Set(duty.days||[]))if(duty.teachers?.[day]===row.teacher.id)duties++;
   row.duties=duties;add(row,'Non-teaching',duties);add(totals,'Non-teaching',duties);
   row.otherNonTeaching=row['Non-teaching']-row.pd-row.duties;
   if(!row.active&&(row.total||row.incomplete))row.issues.push('Inactive teacher retains assignments');
   if(!row.rules.eligible&&row.total)row.issues.push('Non-teaching staff record retains assignments');
   if(row.teacher.orphan){row.issues.push('Teacher record is missing');row.capIncomplete=true;}
   if(row.issues.some(x=>/^Missing class|Teacher record/.test(x))){row.incomplete=true;totals.incomplete=true;}
  }
  const fttSubjects=subs.filter(s=>category(d,s)==='FTT'),fByLevel=levels.map(l=>{const ns=fttSubjects.map(s=>rate(d,l,s));return ns.some(n=>n===null)?null:ns.reduce((a,b)=>a+b,0)});
  const F=fttSubjects.length?modal(fByLevel):null,fttUnequal=F!==null&&fByLevel.some(n=>Math.abs(n-F)>1e-9),N=rows.filter(r=>r.active&&r.rules.eligible).length;
  const teachingIncomplete=ledger.some(e=>e.category==='Unclassified'||e.category==='Teaching'&&e.periods===null)||rows.some(r=>r.teacher.orphan||r.issues.some(x=>/^Missing class/.test(x)));
  const standard=N&&F!==null&&!teachingIncomplete?totals.Teaching/N+F:null;
  const fullTimeN=rows.filter(r=>r.active&&r.rules.eligible&&employment(r.teacher)==='Full time').length;
  const teachingReference=fullTimeN&&!teachingIncomplete?totals.Teaching/fullTimeN:null;
  const planned=plannedDemand(d,ledger,rows,activities);if(activityError){planned.complete=false;planned.issues.push(activityError);}const D=fullTimeN&&planned.complete?planned.total/fullTimeN:null;issues.push(...planned.issues);
  const taught=(id,s)=>Object.prototype.hasOwnProperty.call(rowMap.get(id)?.subjects||{},s);
  const conflicts=rows.filter(r=>r.active&&taught(r.teacher.id,'Art')&&taught(r.teacher.id,'Music')).map(r=>r.teacher.id);
  const artEL=rows.filter(r=>r.active&&taught(r.teacher.id,'Art')&&taught(r.teacher.id,'EL')).map(r=>r.teacher.id);
  const special={};for(const def of specialists(d)){
   const s=def.subject,label=s==='PHE'?'PE':s;
   // Owner 29 Oct: FAJT staff are supplementary manpower. Demand counts in full; core headcount,
   // capacity and average exclude them, and their periods show as a separate supplementary line.
   const teaching=rows.filter(r=>r.active&&r.rules.eligible&&taught(r.teacher.id,s)),pool=teaching.filter(r=>employment(r.teacher)!=='FAJT'),supplementary=teaching.filter(r=>employment(r.teacher)==='FAJT');
   let demand=0,complete=true;
   const provisions=planned.entries.filter(p=>['class','group'].includes(p.kind)&&(p.kind!=='class'||def.demand==='classes')&&(p.subject===s||s==='TL'&&(p.subject==='HTL'||String(groupMap.get(p.target)?.name||'').trim().replace(/\s+/g,' ').toUpperCase()==='CCE TL'))).map(p=>{
    const g=groupMap.get(p.target),c=classRefs.get(p.target)||classCodes.get(p.target);
    return {...p,classKey:c?key(c):undefined,level:g&&tg().levels(g).length>1?'multi':String(g?.level||c?.level||''),...(g?{levels:tg().levels(g)}:{})};
   });
   const detail=reportLevels.map(l=>{
    const items=provisions.filter(p=>p.level===l).map(p=>{
     const assigned=[...(assignedTeachers.get(JSON.stringify([p.target,p.subject]))||[])];
     const load=p.kind==='group'?tg().periods(d,groupMap.get(p.target)):rate(d,l,p.subject),units=Math.max(1,assigned.length);if(load===null)complete=false;
     return {...p,teachers:assigned,assignedCount:assigned.length,units,provisional:!assigned.length,load,periods:load===null?null:load*units};
    });
    const periods=items.reduce((n,p)=>n+(p.periods||0),0);demand+=periods;
    return {level:l,count:items.length,formCount:items.filter(p=>p.kind==='class').length,groupCount:items.filter(p=>p.kind==='group').length,units:items.reduce((n,p)=>n+p.units,0),provisionalCount:items.filter(p=>p.provisional).length,load:rate(d,l,s),periods,incomplete:items.some(p=>p.load===null),items};
   });
   if(provisions.some(p=>!reportLevels.includes(p.level)))complete=false;
   const capacity=pool.reduce((n,r)=>n+(Number.isFinite(r.rules.retained)?r.rules.retained:0),0),pending=pool.some(r=>r.rules.pending.length||!Number.isFinite(r.rules.retained));
   const ofSubject=e=>e.subject===s||s==='TL'&&(e.subject==='HTL'||String(groupMap.get(e.target)?.name||'').trim().replace(/\s+/g,' ').toUpperCase()==='CCE TL');
   const poolIds=new Set(pool.map(r=>r.teacher.id)),assigned=ledger.filter(e=>poolIds.has(e.teacher)&&ofSubject(e));
   const supplementaryIds=new Set(supplementary.map(r=>r.teacher.id)),supplementaryAssigned=ledger.filter(e=>supplementaryIds.has(e.teacher)&&ofSubject(e)),supplementaryComplete=supplementaryAssigned.every(e=>e.category==='Teaching'&&Number.isFinite(e.periods));
   const assignedComplete=assigned.every(e=>e.category==='Teaching'&&Number.isFinite(e.periods)),assignedPeriods=assignedComplete?assigned.reduce((n,e)=>n+e.periods,0):null;
   const indicator={periods:assignedPeriods,headcount:pool.length,average:assignedComplete&&pool.length?assignedPeriods/pool.length:null,reason:!assignedComplete?'Missing assigned specialist load':!pool.length?'No assigned specialist teachers':''};
   const individual=Object.fromEntries(teaching.map(r=>{const es=[...assigned,...supplementaryAssigned].filter(e=>e.teacher===r.teacher.id);return [r.teacher.id,es.every(e=>Number.isFinite(e.periods)&&e.category==='Teaching')?es.reduce((n,e)=>n+e.periods,0):null];}));
   special[label]={label,subject:s,definition:def,indicator,individual,pool:pool.map(r=>r.teacher.id),supplementary:{label:'FAJT supplementary',pool:supplementary.map(r=>r.teacher.id),headcount:supplementary.length,periods:supplementaryComplete?supplementaryAssigned.reduce((n,e)=>n+e.periods,0):null},capacity:pending?null:capacity,demand,detail,complete,headcount:pool.length,reason:indicator.reason};
  }
  for(const row of rows){
   row.capBasis=row.rules.capBasis||'teaching';
   row.capUsed=row.capBasis==='total'?row.total:row.FTT+row.Teaching;
   if(row.capBasis==='total'){
    row.capIncomplete=row.capIncomplete||row.incomplete;
    const periods=new Map([['DUTY',row.duties]]);
    for(const entry of Object.values(row.subjects).flatMap(s=>s.entries))if(entry.category==='Non-teaching'&&Number.isFinite(entry.periods)){const code=subjectIdentity(entry.subject);periods.set(code,(periods.get(code)||0)+entry.periods);}
    row.capNonTeachingPeriods=Object.fromEntries(periods);
   }
   row.capExceeded=!row.capIncomplete&&row.rules.cap!==null&&row.capUsed>row.rules.cap;
   row.conflict=conflicts.includes(row.teacher.id);row.artEL=artEL.includes(row.teacher.id);row.noFTT=(d.workload?.noFTT||[]).includes(row.teacher.id);
   const hasFTT=Object.keys(row.subjects).some(s=>category(d,s)==='FTT');
   row.fttAllowance=row.noFTT?0:F;
   row.employment=employment(row.teacher);
   row.nonTeachingActual=row.FTT+row['Non-teaching'];
   row.targetRetained=row.employment==='RT'?null:row.employment==='FAJT'?(targetSettings?targetSettings.fajtWeeklyPeriods/targetSettings.weeklyPeriods:null):row.rules.retained;
   row.targetPending=row.employment==='FAJT'?!targetSettings:row.rules.pending.length>0;
   row.quota=D!==null&&!row.incomplete&&row.rules.eligible&&!row.targetPending&&Number.isFinite(row.targetRetained)?row.nonTeachingActual+row.targetRetained*(D-row.nonTeachingActual):null;
   row.band=band(row.quota);
   row.status=!row.active?'Inactive':row.employment==='RT'?'No target':row.incomplete||D===null?'Incomplete':row.quota===null?'Target pending':row.total<row.band.lower-1e-9?'Below standard':row.total>row.band.upper+1e-9?'Above standard':'Standard';
   row.special=Object.values(special).filter(s=>s.pool.includes(row.teacher.id)||s.supplementary.pool.includes(row.teacher.id)).map(s=>{
    const periods=s.individual[row.teacher.id],average=s.indicator.average;
    return {...s,periods,average,supplementary:s.supplementary.pool.includes(row.teacher.id),percentage:Number.isFinite(periods)&&average>0?100*periods/average:null};
   });
   row.modifierWarnings=['PHE','Art','Music'].filter(s=>taught(row.teacher.id,s)&&!tokens(row.teacher).includes(s==='PHE'?'PE':s)).map(s=>'Teaches '+(s==='PHE'?'PE':s)+' but is missing the matching TTb subject modifier');
   row.issues.push(...row.modifierWarnings);
   if(row.noFTT&&hasFTT)row.issues.push('No FTT expected is selected, but FTT assignments remain; actual periods still count.');

   row.issues=[...new Set(row.issues)];issues.push(...row.issues.map(x=>row.teacher.name+': '+x));
  }


  if(!N)issues.push('No active eligible teachers.');if(conflicts.length)issues.push('Art + Music assignments: multiple specialist indicators shown separately; never add percentages together.');
  if(!fullTimeN)issues.push('No active eligible full-time teachers for the Ledger target.');
  return {demand:planned,D,subjects:subs,teachingIncomplete,rows,ledger,byLevel,totals,F,fByLevel,fttUnequal,N,standard,fullTimeN,teachingReference,special,issues:[...new Set(issues)],fttSubjects,targetSettings};
 }
 return {analyse,fajtTargetSettings,validate,nonTeachingActivities,subjectIdentity,category,rate,subjects,KINDS,specialists,modal,band,isPD,employment,isFormSubject,subjectType,subjectTypeSubjects,validateSubjectType,isGroupSubject};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISWorkload;

/* GSIS_WORKLOAD_END */
/* GSIS_WORKLOAD_UI_BEGIN */
const isNumericalTableValue=value=>/^[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(String(value).trim());
/* One full-version ledger feeds Summary, Workload and its calculation guide. */
let workloadView='overview';
const workloadFilters={overview:{text:'',status:''},summary:{text:'',status:''}};
const workloadStatus=r=>({'Standard':'at load','Above standard':'overload','Below standard':'under load'}[r.status]||r.status);
function workloadData(){const doc={...v(),teachers:v().teachers.map(t=>({...plannerTeacher(t),name:t.name}))};return GSISWorkload.analyse(doc,t=>GSISTeachingRules.calculate(t,doc.offload),doc.relief===undefined?doc.reliefResults?.targetSettings:doc.relief);}
const wlNumber=n=>n===null||n===undefined?'Unavailable':Number(n.toFixed(2)).toLocaleString('en-GB',{maximumFractionDigits:2});
const wlTarget=r=>r.employment==='RT'?'—':r.employment==='FAJT'&&r.targetPending?'Needs configuration':wlNumber(r.quota);
const wlRange=r=>r.band?r.band.lower+'–'+r.band.upper:'Unavailable';
const wlTex=String.raw;
function wlMath(tex,fallback,block=false){let html=esc(fallback),fraction=false;try{if(window.katex){html=window.katex.renderToString('\\displaystyle '+tex,{displayMode:block,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'error',maxExpand:1000});fraction=/\\(?:d|t)?frac\b/.test(tex);}}catch{}return '<span class="workload-math'+(block?' display-math':'')+(fraction?' has-fraction':'')+'" data-math-fallback="'+esc(fallback)+'">'+html+'</span>';}
const wlNumeric=n=>Number.isFinite(n)?Number(n.toFixed(2)).toString():'';
const wlEqual=n=>Number.isFinite(n)&&Math.abs(n-Number(n.toFixed(2)))>1e-9?'\\approx':'=';
function wlSchoolEquation(w){return w.D===null?'Unavailable: review demand and full-time headcount.':wlMath(wlTex`D=\frac{${wlNumeric(w.demand.total)}}{${w.fullTimeN}}${wlEqual(w.D)}${wlNumeric(w.D)}`,wlNumber(w.demand.total)+' ÷ '+w.fullTimeN+' = '+wlNumber(w.D));}
function wlDemandEquation(x){if(x.incomplete)return 'Unavailable';if(!x.items.length)return '0';const rates=new Map();for(const p of x.items)rates.set(p.load,(rates.get(p.load)||0)+p.units);const terms=[...rates].map(([load,units])=>({tex:units+'\\times'+wlNumeric(load),text:units+' × '+wlNumber(load)}));return esc(terms.map(x=>x.text).join(' + ')+(wlEqual(x.periods)==='='?' = ':' ≈ ')+wlNumber(x.periods));}
function workloadMetrics(w){return '<div class="workload-totals" role="group" aria-label="Schoolwide demand"><strong>Schoolwide demand · periods/week</strong><span>Planned man-periods: '+wlNumber(w.demand.total)+(w.demand.complete?'':' (incomplete)')+'</span><span>Full-time teachers: '+w.fullTimeN+'</span><span>'+wlSchoolEquation(w)+'</span><span>Actual assigned periods: '+wlNumber(w.totals.total)+(w.totals.incomplete?' *':'')+'</span></div>';}
function workloadPill(r){const c={'Below standard':'below','Standard':'standard','Above standard':'above'}[r.status]||'workload-pending',title='Actual total '+wlNumber(r.total)+'; target '+wlTarget(r)+'; green range '+wlRange(r)+'. Weekly cap is checked separately.';if(r.employment==='RT')return '<span class="workload-na" title="RT: actual periods only; no target or load status">—</span>';return '<span class="ability-badge workload-pill '+c+'" title="'+esc(title)+'">'+esc(workloadStatus(r))+'</span>';}
function specialistValue(s){return wlNumber(s.indicator.average);}
function specialistColumns(){return [['Specialist subject',r=>r.special.map(s=>s.label).join('; ')],['Individual specialist periods',r=>r.special.map(s=>wlNumber(s.periods)).join('; ')||'n/a'],['Specialist average',r=>r.special.map(s=>wlNumber(s.average)).join('; ')||'n/a'],['Specialist %',r=>r.special.map(s=>s.percentage===null?'Unavailable':wlNumber(s.percentage)+'%').join('; ')||'n/a']];}

function workloadAssignments(entries){return [...new Set([...orderedAssignments(entries.filter(e=>e.source!=='plt'&&e.source!=='activity').map(e=>e.assignment)).map(assignmentName),...entries.filter(e=>e.source==='plt'||e.source==='activity').map(e=>e.label)])];}
function workloadTeacherTable(root,w,summary=false){
 const subjects=summary?w.subjects.filter(s=>!GSISWorkload.isPD(s)):w.subjects,relief=reliefResultData();
 const cols=[['Teacher',r=>r.teacher.name],['Load status',workloadStatus],['Actual total',r=>wlNumber(r.total)+(r.incomplete?' *':'')],['Target',wlTarget],['At-load range',r=>r.employment==='RT'?'—':wlRange(r)],['FTT periods',r=>wlNumber(r.FTT)+(r.incomplete?' *':'')],['Teaching periods',r=>wlNumber(r.Teaching)+(r.incomplete?' *':'')],['Non-teaching periods',r=>wlNumber(r['Non-teaching'])+(r.incomplete?' *':'')],['Cap-counted periods',r=>wlNumber(r.capUsed)+(r.capIncomplete?' *':'')],['Weekly cap',r=>r.rules.cap===null?'—':wlNumber(r.rules.cap)],...(!summary?[['PD periods',r=>wlNumber(r.pd)]]:[]),['Duty periods',r=>wlNumber(r.duties)],['R',r=>wlNumber(relief.byTeacher[r.teacher.id]?.quota)],...specialistColumns()];
 if(w.rows.some(r=>r.nonTeachingActivities.length))cols.push(['Countable activities',r=>r.nonTeachingActivities.map(a=>a.code+' · '+a.name+': '+wlNumber(a.weeklyPeriods)+' periods/week').join('\n')]);
 const subjectValue=(r,s)=>{const c=r.subjects[s];return !c?'':summary&&mode==='Assignments'?workloadAssignments(c.entries).join('\n'):wlNumber(c.periods)+(c.incomplete?' *':'');};
 cols.push(...subjects.map(s=>[subjectLabel(s),r=>subjectValue(r,s)]));
 if(summary)cols.push(['PD periods',r=>wlNumber(r.pd)],['PD',r=>subjectValue(r,'PD')]);
 const headers=cols.map(c=>c[0]),data=[];
 const rows=w.rows.filter(r=>r.active||r.total||r.incomplete).filter(r=>!summary||r.teacher.name.toLowerCase().includes(query.toLowerCase())).map(r=>{
  const values=cols.map(([,get])=>get(r));data.push(values);
  return '<tr data-load-status="'+esc(workloadStatus(r))+'" class="'+(!r.active?'inactive':'')+'">'+values.map((value,i)=>'<td class="'+(i===0?'wl-name':isNumericalTableValue(value)?'wl-numeric':'')+'"'+(headers[i]==='Cap-counted periods'?' title="'+((r.capBasis||r.rules.capBasis)==='total'?'UT: total actual workload':'FTT + teaching')+'"':'')+(headers[i]==='Weekly cap'&&r.capExceeded?' data-cap-warning="true"':'')+'>'+(i===0?esc(value)+(r.capExceeded?'<span class="workload-warning">Cap exceeded</span>':'')+(r.special.length>1?'<span class="workload-warning">Multiple specialist subjects</span>':'')+(r.issues.length?'<small class="context">'+esc(r.issues.join('; '))+'</small>':''):i===1?workloadPill(r):String(value).split('\n').map(esc).join('<br>'))+'</td>').join('')+'</tr>';
 });
 root.insertAdjacentHTML('beforeend',table(headers,rows));const t=[...root.querySelectorAll('table')].at(-1);if(t){t.classList.add('workload-ledger');t.dataset.freezeColumns='1';const rHead=t.tHead.rows[0].cells[headers.indexOf('R')];rHead.title='R: Deploy relief quota, periods per week; Roster allocates into available timetable periods';rHead.setAttribute('aria-label',rHead.title);workloadTableFilters(t,summary);}return {headers,data};
}
function workloadReference(w){
 const relief=reliefResultData();
 const eligible=w.rows.filter(r=>r.active&&r.rules.eligible),appt=r=>GSISTeachingRules.group(r.teacher.profile?.Role||r.teacher.role,r.teacher.profile?.['EO Appt Level']||''),employment=r=>String(r.teacher.profile?.['Employment Modifier']||r.teacher.employment||'').split(/[,;]\s*/);
 const categories=[{name:'Teacher',rows:eligible.filter(r=>!String(r.teacher.profile?.['EO Appt Level']||'').trim())},{name:'4/5 Load / PTES',rows:eligible.filter(r=>employment(r).includes('4/5'))},{name:'HOD',rows:eligible.filter(r=>appt(r)==='HOD')},{name:'Jnr KP',rows:eligible.filter(r=>appt(r)==='Jnr KP')},...['PE','Art','Music','TL'].map(name=>({name,rows:eligible.filter(r=>w.special[name]?.pool.includes(r.teacher.id))}))];
 const stat=(c,kind)=>{if(kind==='Teacher headcount')return c.rows.length;const values=c.rows.map(r=>kind==='R (average)'?relief.byTeacher[r.teacher.id]?.quota??null:r.incomplete?null:r.total);if(!values.length||values.some(n=>!Number.isFinite(n)))return 'Unavailable';return wlNumber(kind==='Max'?Math.max(...values):kind==='Min'?Math.min(...values):kind==='Avg'||kind==='R (average)'?values.reduce((a,b)=>a+b,0)/values.length:GSISWorkload.modal(values));};
 return '<section class="workload-reference"><h3>Workload reference</h3><p class="hint">Periods/week. Actual load includes FTT, teaching, PD, duties and other countable non-teaching activities. The benchmark span shows the lowest and highest individual benchmark in the group; it is not a shared at-load range. Individual load status uses each teacher’s own ±10% limits. Categories overlap and must not be added together. R is the average weekly Deploy relief quota per teacher, using the saved individual quotas for this version. Roster uses each quota directly and allocates into available timetable periods. It is unavailable if the category is empty or any teacher’s R is unavailable.</p><div class="workload-stats-scroll" role="region" aria-label="Workload statistics by teacher category" tabindex="0"><table class="workload-stats-table workload-stats-compact" data-no-sort data-no-column-controls data-no-table-tools data-plain-table><thead><tr><th>Measure</th>'+categories.map(c=>'<th>'+esc(c.name)+'</th>').join('')+'</tr></thead><tbody><tr><th>Individual benchmark span</th>'+categories.map(c=>{const ns=c.rows.filter(r=>r.employment!=='RT').map(r=>r.quota);return '<td>'+(!ns.length||ns.some(n=>!Number.isFinite(n))?'Unavailable':wlNumber(Math.min(...ns))+'–'+wlNumber(Math.max(...ns)))+'</td>';}).join('')+'</tr>'+['Max','Modal','Avg','Min','R (average)','Teacher headcount'].map(kind=>'<tr><th>'+kind+'</th>'+categories.map(c=>'<td>'+esc(stat(c,kind))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
}

function workloadTableFilters(table,summary){
 const state=workloadFilters[summary?'summary':'overview'],bar=document.createElement('div');bar.className='workload-filters tools';
 const text=document.createElement('input');text.type='search';text.placeholder='Filter table text…';text.setAttribute('aria-label','Filter workload table text');text.value=state.text;
 const status=document.createElement('select');status.setAttribute('aria-label','Filter load status');status.dataset.noEnhance='true';
 for(const label of ['', 'at load','overload','under load','Inactive','Incomplete','Target pending','No target']){const o=document.createElement('option');o.value=label;o.textContent=label||'All load statuses';status.append(o);}status.value=state.status;
 const reset=button('Clear filters',()=>{state.text='';state.status='';text.value='';status.value='';apply();text.focus();}),count=document.createElement('span');count.setAttribute('role','status');bar.append(text,status,reset,count);table.parentElement.before(bar);
 const apply=()=>{state.text=text.value;state.status=status.value;const q=state.text.trim().toLocaleLowerCase();let shown=0;for(const row of table.tBodies[0].rows){const content=[...row.cells].filter(c=>!c.hidden).map(c=>window.GSISTableTools?.text(c)||c.textContent).join(' ').toLocaleLowerCase();row.hidden=!!((state.status&&row.dataset.loadStatus!==state.status)||(q&&!content.includes(q)));if(!row.hidden)shown++;}count.textContent=shown?shown+' teacher(s)':'No matching teachers';window.GSISTableRefresh?.();};
 text.oninput=apply;status.onchange=apply;
 const observer=new MutationObserver(records=>{if(!table.isConnected){observer.disconnect();return;}if(records.some(r=>r.target.matches('td,th')))apply();});observer.observe(table,{subtree:true,attributes:true,attributeFilter:['hidden']});
 apply();
}

function ledgerFormula(w){
 return '<section class="ledger-formula" aria-label="Ledger load calculation">'+
 wlMath(wlTex`A_i=FTT_i+PD_i+Duties_i+Other_i,\quad B_i=(1-OF_i)(D-A_i)+A_i`,'A = actual FTT + PD + duties + other non-teaching; benchmark B = (1 − OF) × (D − A) + A')+
 '<p>Individual load is all actual deployed periods. Schoolwide demand D: '+wlSchoolEquation(w)+'. Each class or TG allocation counts its weekly periods × max(1, assigned teachers). Unstaffed duties count one period. Each TG is its own class. Form-class demand follows the offered IP Deploy cells; existing actual assignments still count. PD counts two periods per distinct PLT member, with one member assumed for an empty PLT. Other countable activities add their weekly periods once per assigned teacher.</p>'+
 '<p>Full-time headcount excludes FAJT, 4/5 and RT; their provision stays in demand. '+(w.targetSettings?'FAJT retains '+esc(w.targetSettings.fajtWeeklyPeriods+'/'+w.targetSettings.weeklyPeriods)+' with no appointment stacking.':'FAJT Target: Needs configuration. Ask Admin to configure the relief weekly budgets.')+' 4/5 keeps configured employment and appointment offload. RT has no benchmark or load status.</p>'+
 '<p>'+wlMath(wlTex`[\lfloor0.9B_i\rfloor,\;\lceil1.1B_i\rceil]`,'At load: floor(90% of benchmark) through ceil(110% of benchmark), inclusive')+'. UT weekly caps count total actual workload: FTT, teaching, PD, duties and other countable non-teaching periods. Other weekly caps count FTT + teaching. Caps are independent of the target band. Relief W and R use their separate calculation.</p></section>';
}
function renderWorkloadSummary(root){const w=workloadData(),controls=document.createElement('div');controls.className='tools';for(const m of ['Assignments','Periods'])controls.append(button(m,()=>{mode=m;render()}));controls.append(button('How it is calculated',()=>{tab='Workload';workloadView='guide';render()}));root.append(controls);
 root.insertAdjacentHTML('beforeend',ledgerFormula(w));
 workloadTeacherTable(root,w,true);
 if(w.issues.length)root.insertAdjacentHTML('beforeend','<p class="warning-text">Review warnings in Workload. * marks incomplete known subtotals.</p>');
}

function workloadSettings(host){
 if(!host){selectDeployTab('Workload Settings');return inlineDraftEditor;}
 const w=workloadData(),defs=GSISWorkload.specialists(v());
 const activities=GSISWorkload.nonTeachingActivities(v()),activityTable=activities.length?'<h3>Countable non-teaching activities</h3>'+table(['Activity','Periods per teacher/week','Teachers'],activities.map(a=>'<tr><td>'+esc(a.code+' · '+a.name)+'</td><td>'+wlNumber(a.weeklyPeriods)+'</td><td>'+esc(a.teachers.map(id=>v().teachers.find(t=>t.id===id)?.name||id).join(', '))+'</td></tr>'))+'<p>These periods count once in workload and relief capacity. They do not count as teaching or preparation and marking.</p>':'';
 const body=activityTable+'<p>Subject Load sets weekly rates. PD is 2 non-teaching periods per distinct PLT. Specialist pools use active eligible teachers assigned the subject; modifiers are checked separately.</p>'+table(['Subject','Category','Specialist subject','Demand basis'],w.subjects.map(sub=>{const pd=GSISWorkload.isPD(sub),def=defs.find(x=>x.subject===sub)||{demand:sub==='TL'?'groups':'classes'},tl=sub==='TL';return '<tr data-workload-row="'+esc(sub)+'"><td>'+esc(subjectLabel(sub))+'</td><td><select data-workload-subject="'+esc(sub)+'" '+(pd?'disabled':'')+'>'+options(GSISWorkload.KINDS.map(x=>[x,x]),GSISWorkload.category(v(),sub))+'</select></td><td><input type="checkbox" data-specialist '+(!pd&&defs.some(x=>x.subject===sub)?'checked ':'')+(pd?'disabled ':'')+'aria-label="Specialist reference for '+esc(sub)+'"></td><td><select data-demand '+(tl||pd?'disabled':'')+'>'+options([['classes','Form classes + extra TGs'],['groups','Defined subject TGs']],tl?'groups':def.demand)+'</select></td></tr>';}));
 const d=selectionEditor('Workload settings',body,d=>{const value={categories:Object.fromEntries([...d.querySelectorAll('[data-workload-subject]')].map(x=>[x.dataset.workloadSubject,x.value])),specialists:[...d.querySelectorAll('[data-workload-row]')].filter(r=>r.querySelector('[data-specialist]').checked).map(r=>({subject:r.dataset.workloadRow,pool:'assignment',modifier:'',demand:r.querySelector('[data-demand]').value})),noFTT:v().workload?.noFTT||[],...(v().workload?.nonTeachingActivities!==undefined?{nonTeachingActivities:clone(v().workload.nonTeachingActivities)}:{})};const valid=GSISWorkload.validate(v(),value);queueCell({operation:'setWorkload',value:valid,expected:clone(v().workload||null)});render();},null,host);d.classList.add('workload-settings');d.querySelector('form').prepend(d.querySelector('footer'));d.returnTab=workloadReturnTab;return d;
}
function compactWorkloadStats(table){
 if(!table)return;table.classList.add('workload-stats-compact');
 for(const cell of [table,...table.querySelectorAll('col,th,td')])for(const property of ['width','min-width','max-width','table-layout'])cell.style.removeProperty(property);
}
function renderWorkloadStats(root){
 const tools=document.createElement('div');tools.className='tools workload-stats-tools';
 const compact=button('Compact',()=>compactWorkloadStats(root.querySelector('.workload-stats-table')));compact.dataset.statsCompact='true';compact.title='Fit the statistics table width to its content';tools.append(compact);root.append(tools);
 root.insertAdjacentHTML('beforeend',workloadReference(workloadData()));compactWorkloadStats(root.querySelector('.workload-stats-table'));
}
function renderWorkloadGuide(root,w){
 root.insertAdjacentHTML('beforeend','<article class="workload-guide"><h2>How it is calculated</h2>'+ledgerFormula(w)+'<p>Demand and actual load are different. Unassigned provision contributes to demand, but not to any teacher’s actual load. Each TG is its own class and contributes its own weekly periods. Links to form classes identify pupils; they do not cancel class provision. An incomplete demand calculation shows unavailable benchmarks.</p><p>Specialist percentages compare actual assigned periods with the subject average. They do not determine overall load status or relief availability. No modal FTT or modal PD is used.</p></article>');
}
function specialistIndicatorHTML(w){
 return '<section class="specialist-indicators" aria-label="Average specialist periods per assigned teacher"><h3>Average specialist periods per assigned teacher</h3><p>Assigned specialist periods divided by assigned teacher headcount, including 4/5 teachers. FAJT staff are supplementary: excluded from headcount, capacity and average, and shown separately. Periods per week. This indicator does not set individual teaching targets or relief allowances. Tamil includes TL, HTL and CCE TL; PAL and SDR count in individual teaching, not these subject totals.</p>'+table(['Subject','Assigned specialist periods','Assigned teachers','Average periods per teacher','FAJT supplementary'],Object.values(w.special).map(s=>{const x=s.indicator,f=s.supplementary;return '<tr><th scope="row">'+esc(s.label)+'</th><td>'+wlNumber(x.periods)+'</td><td>'+x.headcount+'</td><td>'+wlNumber(x.average)+(x.reason?'<small class="context">'+esc(x.reason)+'</small>':'')+'</td><td>'+(f?.headcount?wlNumber(f.periods)+' periods · '+f.headcount+' FAJT':'None')+'</td></tr>';}))+'</section>';
}
function renderWorkload(root){
 const w=workloadData();root.insertAdjacentHTML('beforeend',workloadMetrics(w));renderWorkloadGuide(root,w);
 if(w.issues.length)root.insertAdjacentHTML('beforeend','<details class="workload-issues"><summary>Setup needs review: '+w.issues.length+' item(s)</summary><ul>'+w.issues.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details>');
 const subs=w.subjects.filter(s=>!GSISWorkload.isPD(s)),levels=Object.keys(w.byLevel),cell=(l,s)=>w.byLevel[l].subjects[s]||{periods:0,incomplete:false};
 root.insertAdjacentHTML('beforeend','<h3>Assigned subject periods by level</h3>'+table(['Level',...subs.map(subjectLabel)],[
 '<tr><th scope="row">Category</th>'+subs.map(s=>'<td>'+esc(GSISWorkload.category(v(),s))+'</td>').join('')+'</tr>',
 ...levels.map(l=>'<tr><th scope="row">'+(l==='multi'?'Multiple levels':'P'+esc(l))+'</th>'+subs.map(s=>{const c=cell(l,s);return '<td>'+wlNumber(c.periods)+(c.incomplete?' *':'')+'</td>';}).join('')+'</tr>'),
 '<tr><th scope="row">Total</th>'+subs.map(s=>'<td>'+wlNumber(levels.reduce((n,l)=>n+cell(l,s).periods,0))+(levels.some(l=>cell(l,s).incomplete)?' *':'')+'</td>').join('')+'</tr>'
 ])+'<p>Multi-level TGs count once in Multiple levels. PD and duties are schoolwide. * marks incomplete assigned totals.</p>');
 root.insertAdjacentHTML('beforeend',specialistIndicatorHTML(w));
 root.insertAdjacentHTML('beforeend','<h3>Subject specific load</h3><p>Effective capacity is the sum of retained teaching fractions. Specialist average uses assigned periods ÷ assigned teachers, without offload adjustment.</p>'+table(['Subject',...levels.map(l=>l==='multi'?'Multiple levels':'P'+l),'Demand','Teachers','Effective capacity','Specialist average'],Object.values(w.special).map(s=>'<tr><td>'+esc(s.label)+'</td>'+s.detail.map(x=>'<td>'+wlDemandEquation(x)+'</td>').join('')+'<td>'+wlNumber(s.demand)+(s.complete?'':' *')+'</td><td>'+s.pool.length+'</td><td>'+wlNumber(s.capacity)+'</td><td>'+specialistValue(s)+'</td></tr>')));
 const cols=[['Teacher',r=>r.teacher.name],...specialistColumns()];
 root.insertAdjacentHTML('beforeend','<h3>Individual specialist allocation</h3>'+table(cols.map(c=>c[0]),w.rows.filter(r=>r.active&&r.special.length).map(r=>'<tr>'+cols.map(([,get])=>'<td>'+esc(get(r))+'</td>').join('')+'</tr>')));
 root.insertAdjacentHTML('beforeend',Object.values(w.special).map(s=>'<details><summary>'+esc(s.label)+' · '+s.pool.length+' included teacher(s)</summary><p>Pool: active eligible teachers assigned '+esc(s.subject)+'. Each teacher counts once.</p>'+table(['Class/TG','Subject','Weekly load','Assigned teachers','Teacher units','Demand'],s.detail.flatMap(x=>x.items).map(p=>'<tr><td>'+esc(v().groups.find(g=>g.id===p.target)?.name||p.classKey||p.target)+'</td><td>'+esc(subjectLabel(p.subject))+'</td><td>'+wlNumber(p.load)+'</td><td>'+p.assignedCount+'</td><td>'+p.units+'</td><td>'+wlNumber(p.periods)+'</td></tr>'))+'</details>').join(''));
 root.querySelectorAll('table').forEach(t=>{t.dataset.noSort='true';t.dataset.noColumnControls='true';t.dataset.noTableTools='true';t.dataset.plainTable='true';});
}
function editTG(id){
 const g=v().groups.find(g=>g.id===id);if(!g)return;let selector,subjectSelector,levelSelector;
 const anchor=[...el('content').querySelectorAll('[data-edit-tg]')].find(b=>b.dataset.editTg===id),position=anchor?ipCellAnchor?.capture(anchor,{viewport:true}):null;
 const popup=document.createElement('dialog');popup.className='tg-popup';popup.setAttribute('aria-label','Edit teaching group');document.body.append(popup);
 let d;try{d=selectionEditor('Edit teaching group',
 '<label>Name<input id="tgName" maxlength="60" value="'+esc(g.name)+'"></label>'+tgLevelMarkup(g)+'<label>Subject<select id="tgSubject" required><option value="">Choose subject…</option></select></label><label id="tgRemap" hidden>Teaching assignments after subject change<select id="tgAssignments"><option value="">Choose…</option><option value="retain">Keep teachers and remap this TG’s assignments</option><option value="clear">Clear this TG’s teaching assignments</option></select></label>'+tgClassSelectorMarkup()+'<label>Venue<select id="tgVenue"><option value="">Unassigned</option>'+options(v().venues.map(r=>[r.id,r.id+' '+(deployPhysicalRoom(r,v()).name||'')]),g.venue||'')+'</select></label><p class="hint">Choose classes across the selected levels, or all classes. The venue stays separate. Each assigned teacher receives the TG’s weekly periods once.</p><button type="button" id="deleteTG">Delete TG and its assignments</button>',
 d=>{const subject=subjectSelector.value(),assignments=d.querySelector('#tgAssignments').value;if(subject!==g.subject&&!assignments)throw Error('Choose whether to keep or clear teaching assignments.');const x={groupId:id,name:d.querySelector('#tgName').value,subject,assignments,venue:d.querySelector('#tgVenue').value,...levelSelector.value(),...selector.value()};GSISVenueGroups.update(clone(v()),x);stageChange('updateTG',x);},undefined,popup);}catch(error){popup.remove();throw error;}
 selector=bindTGClassSelector(d,g.level,g);subjectSelector=bindTGSubject(d,d.querySelector('#tgSubject'),GSISVenueGroups.levels(g),g.subject,subject=>{d.querySelector('#tgRemap').hidden=subject===g.subject;d.querySelector('#tgAssignments').required=subject!==g.subject;selector.subject(subject);});levelSelector=bindTGLevels(d,g,ls=>{selector.levels(ls);subjectSelector.levels(ls);});
 const close=d.close;d.close=()=>{if(!d.open)return;popup.close();popup.remove();close();ipCellAnchor?.restore(position);};popup.oncancel=e=>{e.preventDefault();d.close();};popup.showModal();d.querySelector('#tgName').focus({preventScroll:true});
 d.querySelector('#deleteTG').onclick=()=>{if(!confirm('Delete '+g.name+' and only its teaching assignments? Teacher records are kept.'))return;stageChange('removeTG',{groupId:id});d.close();};
}

/* GSIS_WORKLOAD_UI_END */



/* GSIS_REPORTING_UI_BEGIN */
/* Version-owned Span of Control. All admitted Deploy users retain HR access. */
const reportingCollapsed=new Set(),reportingLayers=new Map(),reportingSearch=new Map();
let reportingView='assignment';
function reportingPage(root){
 const can=kp()||admin();if(!can){root.textContent='Deploy access is required.';return;}
 const toolbar=document.createElement('div');toolbar.className='tools reporting-toolbar';
 for(const [key,label] of [['assignment','Assignment'],['view','View']]){const b=button(label,()=>{reportingView=key;render()});b.setAttribute('aria-pressed',String(reportingView===key));toolbar.append(b);}
 if(reportingView==='assignment'){const label=document.createElement('label');label.textContent='Number of layers ';const input=document.createElement('input');input.type='number';input.min='1';input.max='12';input.value=reportingLayers.get(current)||3;input.setAttribute('aria-label','Number of layers');input.onchange=()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>12){input.value=reportingLayers.get(current)||3;return;}reportingLayers.set(current,n);render()};label.append(input);toolbar.append(label);}
 root.append(toolbar);root.insertAdjacentHTML('beforeend','<p class="hint">Drag a name into a reporting box. Click a name to choose its RO. Each person has one RO. MK and OSOs are excluded. Layers change the view; deeper links are kept. Save changes to store your edits.</p>');
 if(!v().reporting){root.append(button('Initialize staff list',()=>queueCell({operation:'initReporting',value:{staff:GSISReporting.snapshot(v(),[...staffCatalog.values()]),officers:{}},expected:null})));return;}
 const people=GSISReporting.staff(v()).filter(p=>!p.oso),by=new Map(people.map(p=>[p.id,p])),officers=people.filter(p=>!p.sl),links=v().reporting.officers||{},children=id=>officers.filter(p=>links[p.id]===id).sort((a,b)=>natural(a.name,b.name)),roots=people.filter(p=>p.sl).sort((a,b)=>natural(a.name,b.name)),unassigned=officers.filter(p=>!links[p.id]||!by.has(links[p.id])),shown=new Set();
 const matches=p=>!query||[p.name,p.role,by.get(links[p.id])?.name].join(' ').toLowerCase().includes(query.toLowerCase());
 const chip=p=>'<button type="button" class="ro-chip" data-ro-person="'+esc(p.id)+'" data-ro-edit="'+esc(p.id)+'" draggable="'+can+'" aria-label="Reporting officer for '+esc(p.name)+'">'+esc(p.name)+'</button>';
 const branch=(p,trail=new Set())=>{if(trail.has(p.id))return '<li>Cycle needs review: '+esc(p.name)+'</li>';shown.add(p.id);const nested=children(p.id),closed=reportingCollapsed.has(p.id);return '<li><div class="reporting-person">'+(nested.length?'<button data-ro-toggle="'+esc(p.id)+'" aria-expanded="'+!closed+'" aria-label="'+(closed?'Expand ':'Collapse ')+esc(p.name)+'">'+(closed?'+':'−')+'</button>':'<span class="reporting-leaf">·</span>')+'<span>'+esc(p.name)+' <small>'+esc(p.role)+'</small></span></div>'+(nested.length?'<ul '+(closed?'hidden':'')+'>'+nested.map(c=>branch(c,new Set([...trail,p.id]))).join('')+'</ul>':'')+'</li>';};
 let main='';
 if(reportingView==='assignment'){
  let managers=roots;const layers=reportingLayers.get(current)||3;
  for(let row=0;row<layers;row++){
   const boxes=managers.map(p=>{shown.add(p.id);return '<section class="ro-box" data-ro-drop="'+esc(p.id)+'"><h3>'+esc(p.name)+' <small>'+esc(p.role)+'</small></h3>'+'<p>'+children(p.id).length+' Job Holder(s)</p>'+children(p.id).filter(matches).map(chip).join('')+'<span class="muted">Drop a Job Holder here</span></section>';});
   if(row===0)while(boxes.length<4)boxes.push('<section class="ro-box ro-empty"><h3>SL position</h3><p>No active SL in this position.</p></section>');
   main+='<section class="ro-layer"><h3>Layer '+(row+1)+'</h3><div class="ro-layer-scroll scroll" tabindex="0" aria-label="Layer '+(row+1)+' reporting boxes">'+(boxes.join('')||'<p class="muted">Assign Job Holders in the row above to create their boxes.</p>')+'</div></section>';
   managers=managers.flatMap(p=>children(p.id));
  }
 }else{main='<div class="reporting-directory">'+roots.map(p=>'<section><ul>'+branch(p)+'</ul></section>').join('')+'</div>';}
 const disconnected=officers.filter(p=>!unassigned.includes(p)&&!shown.has(p.id)&&!roots.some(r=>{let next=p.id,trail=new Set();while(next&&!trail.has(next)){if(next===r.id)return true;trail.add(next);next=links[next];}return false;}));
 if(disconnected.length)main+='<section class="ro-review"><h3>Needs review</h3>'+(reportingView==='view'?'<ul>'+disconnected.map(p=>branch(p)).join('')+'</ul>':disconnected.filter(matches).map(chip).join(''))+'</section>';
 root.insertAdjacentHTML('beforeend','<div class="reporting-workspace reporting-content-fit" data-reporting-view="'+reportingView+'"><div class="reporting-main scroll">'+main+'</div><aside class="unassigned-pane reporting-unassigned" '+(reportingView==='assignment'?'data-ro-drop=""':'')+'><div class="ro-unassigned-head"><h3>Unassigned <span>'+unassigned.length+'</span></h3><label>Find a name<input type="search" data-ro-search aria-label="Search unassigned names" value="'+esc(reportingSearch.get(current)||'')+'"></label></div><div class="ro-unassigned-list">'+unassigned.map(p=>'<div data-ro-unassigned-name="'+esc(p.name.toLocaleLowerCase())+'">'+(reportingView==='assignment'?chip(p)+(links[p.id]?'<small class="warning-text">Previous RO excluded or unavailable; review retained link.</small>':''):'<ul>'+branch(p)+'</ul>')+'</div>').join('')+'</div></aside></div>');
 const search=root.querySelector('[data-ro-search]'),filter=()=>{reportingSearch.set(current,search.value);const q=search.value.trim().toLocaleLowerCase();root.querySelectorAll('[data-ro-unassigned-name]').forEach(e=>e.hidden=!e.dataset.roUnassignedName.includes(q));};search.oninput=filter;filter();
 const assign=(id,ro)=>{try{GSISReporting.assign(clone(v()),id,ro);queueCell({operation:'setReportingOfficer',officer:id,value:ro,expected:links[id]||''});}catch(e){alert(e.message);}};
 root.querySelectorAll('[data-ro-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.roToggle;reportingCollapsed.has(id)?reportingCollapsed.delete(id):reportingCollapsed.add(id);render()});
 root.querySelectorAll('[data-ro-edit]').forEach(b=>b.onclick=()=>{const id=b.dataset.roEdit,p=by.get(id);modal('Reporting officer for '+p.name,'<label>Reporting officer<select id="reportingChoice"><option value="">Unassigned</option>'+options(people.filter(r=>r.id!==id).map(r=>[r.id,r.name+' · '+r.role]),links[id]||'')+'</select></label>',d=>assign(id,d.querySelector('#reportingChoice').value));});
 root.querySelectorAll('[data-ro-person]').forEach(e=>e.ondragstart=event=>{event.dataTransfer.setData('application/x-gsis-officer',e.dataset.roPerson);event.dataTransfer.effectAllowed='move';});
 root.querySelectorAll('[data-ro-drop]').forEach(e=>{e.ondragover=event=>{if([...event.dataTransfer.types].includes('application/x-gsis-officer')){event.preventDefault();event.dataTransfer.dropEffect='move';e.classList.add('ro-drop-active');}};e.ondragleave=()=>e.classList.remove('ro-drop-active');e.ondrop=event=>{event.preventDefault();e.classList.remove('ro-drop-active');const id=event.dataTransfer.getData('application/x-gsis-officer');if(id&&by.has(id))assign(id,e.dataset.roDrop);};});
}

/* GSIS_REPORTING_UI_END */




/* GSIS_RELIEF_UI_BEGIN */
/* Admin editor. Calculations and private defaults are supplied by the backend. */
function reliefResultData(){
 const doc=v(),rows=(doc?.reliefResults?.teachers||[]).map(r=>({id:r.teacherId,quota:doc.reliefResults.pending||doc.reliefResults.stale?null:r.R,reason:r.reason}));
 return {rows,byTeacher:Object.fromEntries(rows.map(r=>[r.id,r]))};
}
function markReliefStale(){if(!v()?.reliefResults)return;v().reliefResults.stale=true;if(['Ledger','Stats','Relief Settings'].includes(tab))render(true);}
function renderReliefSettings(root){renderReliefBreakdown(root);}
function reliefFormulaHTML(settings){
 const t=String.raw,math=(tex,text)=>wlMath(tex,text,true),n=x=>Number.isFinite(x)?String(Number(x.toFixed(6))):'?',s=settings||{};
 const factor=Math.abs(s.timetablePeriods/s.weeklyPeriods-5/7)<1e-12?t`\frac{5}{7}`:t`\frac{${n(s.timetablePeriods)}}{${n(s.weeklyPeriods)}}`;
 return '<div class="relief-formulas" aria-label="Relief calculation equations">'+
 math(t`W_i=\mathrm{FTT}_i+\mathrm{PD}_i+\mathrm{Duties}_i+\mathrm{Other}_i+\left(1+\frac{\mathrm{SIUE}}{100}\right)\left(T_i+\mathrm{OF}_i T_{\mathrm{avg}}\right)`,'Wi = FTT + PD + Duties + Other non-teaching + (1 + SIUE / 100) × (Ti + OF × T_avg)')+
 math(t`R_{\mathrm{normal},i}=\begin{cases}\left\lfloor\max\left(0,${factor}\left(${n(s.weeklyPeriods)}-W_i\right)\right)\right\rfloor,&\text{full time}\\[4pt]\left\lfloor\max\left(0,${factor}\left(${n(s.weeklyPeriods*s.fourFifthsFraction)}-W_i\right)\right)\right\rfloor,&\text{4/5 load}\\[4pt]\left\lfloor\max\left(0,${n(s.fajtWeeklyPeriods)}-W_i\right)\right\rfloor,&\text{FAJT}\end{cases}`,'Round each R down to an integer. Full time: R = max(0, '+n(s.timetablePeriods/s.weeklyPeriods)+' × ('+n(s.weeklyPeriods)+' − Wi)); 4/5: R = max(0, '+n(s.timetablePeriods/s.weeklyPeriods)+' × ('+n(s.weeklyPeriods*s.fourFifthsFraction)+' − Wi)); FAJT: R = max(0, '+n(s.fajtWeeklyPeriods)+' − Wi)')+math(t`R_i=\left\lfloor\max\left(0,\min\left(R_{\mathrm{normal},i},C_i-L_{\mathrm{cap},i}\right)\right)\right\rfloor`,'With a configured weekly period cap C: R is the lower of normal R and cap minus cap-counted periods, rounded down and never negative.')+'<p>Without a configured period cap, normal R applies. For UT, cap-counted periods include total actual workload: FTT, teaching, PD, duties and other countable non-teaching periods. Other weekly caps count FTT + teaching. Offload and preparation factors affect normal R; they are not added to cap-counted periods.</p></div>';
}
function renderReliefBreakdown(root){
 const doc=v(),detail=doc.reliefAdmin,result=doc.reliefResults,settings=detail?.settings,reference=result?.reference;
 if(!result){root.innerHTML='<p>Refresh to load relief calculations.</p>';return;}
 const pending=result.pending||result.stale,editable=admin()&&!queueFlight&&!result.stale;
 const n=x=>Number.isFinite(x)?Number(x.toFixed(3)).toLocaleString('en-GB',{maximumFractionDigits:3}):'Unavailable';
 root.innerHTML='<h2>Relief calculations</h2><p>Deploy calculates the weekly R quota from every period it captures. Teaching uses the configured offload and SIUE factors. FTT, PD, duties and other non-teaching periods count once without those factors. Roster uses this quota to fill available timetable periods; blocked periods mark non-availability and do not reduce R again.</p>'+reliefFormulaHTML(settings||reference)+'<p>'+esc(reference?'School teaching demand: '+n(reference.teachingPeriodTotal)+' periods / '+reference.fullTimeTeacherCount+' full-time teachers = '+n(reference.T_avg)+'. SIUE: '+n(reference.siuePercent)+'%.':'Refresh to load the school teaching demand.')+'</p>';
 if(admin()&&settings?.schema===3){
  const form=document.createElement('form');form.dataset.reliefForm='true';
  const labels={weeklyPeriods:'Full-time weekly budget (periods)',fourFifthsFraction:'4/5 budget fraction',fajtWeeklyPeriods:'FAJT weekly budget (periods)',timetablePeriods:'Weekly timetable window (periods)',siuePercent:'Preparation and marking: SIUE (%)'};
  form.innerHTML='<div class="tools relief-controls">'+Object.entries(labels).map(([key,label])=>'<label>'+label+'<input data-relief-factor="'+key+'" type="number" min="0" step="any" value="'+esc(settings[key])+'" required '+(!editable?'disabled':'')+'></label>').join('')+'</div><fieldset class="relief-specialist-siue"><legend>Specialist SIUE (%)</legend><p class="hint">Blank uses the general SIUE. Applies to the whole teaching and offload term of teachers whose Subject Modifier includes the subject.</p><div class="tools relief-controls">'+['PE','Art','Music'].map(k=>'<label>SIUE for '+k+' (%)<input data-relief-specialism="'+k+'" type="number" min="0" step="any" value="'+esc(settings.siuePercentBySpecialism?.[k]??'')+'" placeholder="General" '+(!editable?'disabled':'')+'></label>').join('')+'</div></fieldset><p class="hint">The timetable factor is timetable periods divided by the full-time budget. FAJT uses factor 1. Personal lunch is excluded; rostered duties still count.</p><p data-relief-error role="alert"></p><p data-relief-status role="status">Apply settings, then Save changes. The table shows the last saved results.</p><button type="submit" '+(!editable?'disabled':'')+'>Apply settings</button> <button type="button" data-relief-reset>Reset fields</button>';
  root.append(form);form.querySelector('[data-relief-error]').textContent=detail.settingsError||'';
  function read(){
   const value=clone(settings);value.mode='actual';
   for(const input of form.querySelectorAll('[data-relief-factor]'))value[input.dataset.reliefFactor]=input.value.trim()===''?NaN:Number(input.value);
   if(!Number.isFinite(value.weeklyPeriods)||value.weeklyPeriods<=0||!Number.isFinite(value.fajtWeeklyPeriods)||value.fajtWeeklyPeriods<=0||!Number.isFinite(value.timetablePeriods)||value.timetablePeriods<=0)throw Error('Weekly budgets and timetable periods must be greater than zero.');
   if(value.timetablePeriods>value.weeklyPeriods)throw Error('Timetable periods must fit within the full-time weekly budget.');
   if(!Number.isFinite(value.fourFifthsFraction)||value.fourFifthsFraction<=0||value.fourFifthsFraction>1)throw Error('The 4/5 budget fraction must be greater than zero and at most one.');
   if(!Number.isFinite(value.siuePercent)||value.siuePercent<0)throw Error('SIUE must be a finite nonnegative percentage.');
   value.siuePercentBySpecialism={PE:null,Art:null,Music:null};
   for(const input of form.querySelectorAll('[data-relief-specialism]')){const text=input.value.trim(),n=Number(text);if(text!==''&&(!Number.isFinite(n)||n<0))throw Error('Specialist SIUE must be blank or a finite nonnegative percentage.');value.siuePercentBySpecialism[input.dataset.reliefSpecialism]=text===''?null:n;}
   return value;
  }
  form.oninput=()=>{if(!editable)return;try{const value=read();unsavedDraft=JSON.stringify(value)!==JSON.stringify(settings);form.querySelector('[data-relief-error]').textContent='';root.querySelector('.relief-formulas').outerHTML=reliefFormulaHTML(value);}catch(e){unsavedDraft=true;form.querySelector('[data-relief-error]').textContent=e.message;}};
  form.onsubmit=e=>{e.preventDefault();if(!editable||!admin())return;try{const value=read();if(!form.reportValidity())return;unsavedDraft=false;queueCell({operation:'setReliefSettings',value,expected:clone(doc.relief||null)});render();}catch(e){unsavedDraft=true;form.querySelector('[data-relief-error]').textContent=e.message;}};
  form.querySelector('[data-relief-reset]').onclick=()=>{unsavedDraft=false;render();};
 }
 const value=x=>pending?(result.stale?'Refresh to update':'Save to update'):n(x);
 const headings=[['Teacher'],['OF_i','OF'],['T_i','Ti'],['W_i','Wi'],['FTT'],['PD'],['Duties'],['Other non-teaching'],['R_i','R'],['Details']];
 const teachers=new Map((doc.teachers||[]).map(t=>[t.id,plannerTeacher(t)]));
 const visible=result.teachers.filter(t=>{const teacher=teachers.get(t.teacherId);return teacher?.active&&GSISTeachingRules.eligible(teacher);});
 root.insertAdjacentHTML('beforeend','<div class="table-wrap relief-table-wrap"><table class="relief-table gsis-compact" data-no-sort data-export-title="Relief calculations"><thead><tr>'+headings.map(([tex,label])=>'<th scope="col" data-export-value="'+esc(label||tex)+'">'+(label?wlMath(tex,tex==='R_i'?'R':label):tex)+'</th>').join('')+'</tr><tr class="column-filters" data-export-ignore>'+headings.map(([tex,label])=>'<th><input type="search" data-relief-filter aria-label="Filter '+esc(label||tex)+'" placeholder="Filter…"></th>').join('')+'</tr></thead><tbody>'+visible.map(t=>{const b=t.breakdown||{};return '<tr><th scope="row">'+esc(t.name)+'</th>'+[t.OF,t.Ti,b.Wi,b.FTT,b.PD,b.duties,b.otherNonTeaching,t.R].map((x,i)=>'<td'+(!pending&&Number.isFinite(x)?' class="relief-number"':'')+(i===7?' data-relief-value="quota"':'')+'>'+value(x)+'</td>').join('')+'<td>'+esc(pending?'Save or refresh for confirmed results.':t.reason||b.reason||[b.capConfigured||b.periodCap!==null&&b.periodCap!==undefined?'Normal R '+n(b.normalR)+'; weekly cap '+n(b.periodCap)+'; counted '+(b.capBasis==='total'?'total actual workload':'FTT + teaching')+' '+n(b.capWorkload)+'; cap headroom '+n(b.capHeadroom)+'; final R '+n(t.R)+(b.capWorkload>b.periodCap?' (existing workload exceeds cap)':''):'',(b.nonTeachingActivities||[]).map(a=>a.code+' ('+a.name+'): '+n(a.weeklyPeriods)+' periods/week').join('; '),(b.offloadComponents||[]).map(x=>x.label+(x.percent!==null?' '+n(x.percent)+'%':'')+(x.capPeriods!==null?' cap '+n(x.capPeriods):'')).join('; '),b.siueBasis&&b.siueBasis!=='general'?'SIUE '+n(b.siuePercentApplied)+'% ('+b.siueBasis+')':''].filter(Boolean).join('; '))+'</td></tr>';}).join('')+'</tbody></table></div><p data-relief-empty role="status"'+(visible.length?' hidden':'')+'>No teachers match this view.</p>');
 const table=root.querySelector('.relief-table'),filters=[...table.querySelectorAll('[data-relief-filter]')],rows=[...table.tBodies[0].rows];
 const searchText=rows.map(row=>[...row.cells].map(cell=>cell.textContent.toLowerCase()));
 table.tHead.addEventListener('input',()=>{const terms=filters.map(input=>input.value.trim().toLowerCase());rows.forEach((row,i)=>{row.hidden=!terms.every((term,j)=>!term||searchText[i][j].includes(term));});root.querySelector('[data-relief-empty]').hidden=rows.some(row=>!row.hidden);});
}

/* GSIS_RELIEF_UI_END */


function renderPAL(root){
 const d=v(),ready=!!d.pal,auto=d.pal?.auto??true,editable=admin()&&!queueFlight;
 root.innerHTML='<h2>PAL</h2><p>Auto adds P1 and P2 Form Teachers to PAL when FT assignments change. Existing PAL teachers remain until removed manually.</p><div class="pal-pill" role="group" aria-label="PAL assignment policy">'+['Manual','Auto'].map((label,i)=>'<button type="button" data-pal="'+!!i+'" aria-pressed="'+(auto===!!i)+'" '+(!editable?'disabled':'')+'>'+label+'</button>').join('')+'</div><p>'+(ready?(auto?'FT additions copy into PAL in the same save. Replacements retain the previous PAL teacher. YHs and Admin can edit PAL anytime.':'All SMC users can edit PAL allocations manually.'):'This older version has no PAL policy. Auto is the default. Admin can apply it here; existing published data stays unchanged.')+'</p><p class="hint">'+(editable?'Changes are queued with the other edits. Save changes to confirm workload and R.':'Only Admin can change this policy.')+'</p>';
 root.querySelectorAll('[data-pal]').forEach(b=>b.onclick=()=>{if(!admin()||queueFlight)return;queueCell({operation:'setPAL',value:{schema:1,auto:b.dataset.pal==='true'},expected:clone(d.pal||null)});render();});
}

/* GSIS_PAL_BEGIN */
/* PAL receives additions from FT edits; existing allocations remain independent. */
var GSISPAL=(function(){
 'use strict';
 const defaults=()=>({schema:1,auto:true});
 const key=c=>String(c.level)+(String(c.shortName).startsWith(String(c.level))?String(c.shortName).slice(String(c.level).length):c.shortName);
 function reconcile(d,edit){
  if(!d.pal?.auto||!edit||!Array.isArray(d.classes)||!Array.isArray(d.assignments))return d;
  if(edit.operation!=='setPAL'&&(edit.operation!=='addTeacher'||edit.subject!=='FT'))return d;
  const workload=typeof GSISWorkload!=='undefined'?GSISWorkload:require('./workload.js');
  if(workload.subjectType(d,'PAL')==='tg')return d;
  for(const ft of d.assignments.filter(a=>a.subject==='FT')){
   const c=d.classes.find(c=>ft.targetRef?c.ref===ft.targetRef:key(c)===ft.target);
   if(!c||!['1','2'].includes(String(c.level)))continue;
   if(edit.operation!=='setPAL'&&(ft.teacher!==edit.teacher||(edit.targetRef?c.ref!==edit.targetRef:key(c)!==edit.target)))continue;
   if(d.assignments.some(a=>a.subject==='PAL'&&a.teacher===ft.teacher&&(a.targetRef?a.targetRef===c.ref:a.target===key(c))))continue;
   d.assignments.push({...ft,id:'pal-'+ft.id,subject:'PAL',target:key(c),targetRef:c.ref});
  }
  return d;
 }
 function set(d,value){
  if(!value||value.schema!==1||typeof value.auto!=='boolean'||Object.keys(value).some(k=>!['schema','auto'].includes(k)))throw Error('Choose Manual or Auto PAL.');
  const enable=value.auto&&!d.pal?.auto;
  for(const a of d.assignments||[])if(a.palManaged)delete a.palManaged;
  d.pal={schema:1,auto:value.auto};return enable?reconcile(d,{operation:'setPAL'}):d;
 }
 function canEdit(d,user){const roles=user?.roles||[];return roles.includes('Admin')||roles.includes('KP')&&(d.pal?.auto===false||user.palEditor===true);}
 return {defaults,reconcile,set,canEdit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISPAL;

/* GSIS_PAL_END */


/* GSIS_ASC_EXPORT_BEGIN */
/* Pure Deploy → aSc database XML. No service, state mutation or scheduled cards. */
var GSISAscExport=(()=>{
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)), own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
 const vg=()=>typeof GSISVenueGroups!=='undefined'?GSISVenueGroups:require('./venue-groups.js');
 const wl=()=>typeof GSISWorkload!=='undefined'?GSISWorkload:require('./workload.js');
 const mapped=(o,k)=>own(o,k)?o[k]:undefined;
 const alias=s=>s==='PE'?'PHE':s==='Science'?'Sci':s;
 const FT=['Assembly','FTGP','FTT'], profiles=['reference-2012','current-catalogue'];
 const sorted=a=>a.slice().sort((x,y)=>String(x.id).localeCompare(String(y.id),'en'));
 const clock=x=>typeof x==='string'&&/^\d{2}:\d{2}$/.test(x)&&Number(x.slice(0,2))<24&&Number(x.slice(3))<60?Number(x.slice(0,2))*60+Number(x.slice(3)):NaN;
 const formatClock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 function fillBells(count,startNumber,start,duration,gap){
  if(!Number.isInteger(count)||count<1||count>48||![0,1].includes(startNumber)||!Number.isInteger(duration)||duration<1||!Number.isInteger(gap)||gap<0||!Number.isFinite(clock(start)))throw Error('Use 1–48 periods, numbering from 0 or 1, a valid start, positive minutes and a non-negative gap.');
  const end=clock(start)+count*duration+(count-1)*gap;if(end>=1440)throw Error('The bells must end before midnight.');
  return Array.from({length:count},(_,i)=>({period:i+startNumber,name:'Period '+(i+startNumber),short:'P'+(i+startNumber),starttime:formatClock(clock(start)+i*(duration+gap)),endtime:formatClock(clock(start)+i*(duration+gap)+duration)}));
 }
 function defaults(d={}){return {schema:1,namespace:String(d.id||'school'),profile:'reference-2012',installedVersion:'',schoolName:'',fileLabel:String(d.name||'Deployment'),destination:'new',includeStructure:true,includeUnassigned:false,days:['Monday','Tuesday','Wednesday','Thursday','Friday'].map(name=>({name,short:name.slice(0,3)})),weeks:['Odd','Even'],periods:fillBells(17,0,'07:00',30,0),termName:'Whole year',subjects:{},divisions:{},blocks:{}};}
 function validXmlText(value){for(const c of String(value)){const n=c.codePointAt(0);if(!(n===9||n===10||n===13||n>=32&&n<=0xd7ff||n>=0xe000&&n<=0xfffd||n>=0x10000&&n<=0x10ffff))return false;}return true;}
 function validateSettings(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Export settings must be an object.');
  const keys=Object.keys(defaults());if(Object.keys(input).some(k=>!keys.includes(k)))throw Error('Unknown export setting.');
  const s=copy(input);if(s.schema!==1||!profiles.includes(s.profile)||!['new','existing'].includes(s.destination)||typeof s.includeStructure!=='boolean'||typeof s.includeUnassigned!=='boolean')throw Error('Choose a supported export profile and destination.');
  for(const k of ['namespace','installedVersion','schoolName','fileLabel','termName'])if(typeof s[k]!=='string'||s[k].length>160||!validXmlText(s[k]))throw Error('Use valid text of up to 160 characters for '+k+'.');
  if(!s.namespace.trim())throw Error('A stable timetable namespace is required.');
  if(!Array.isArray(s.days)||s.days.length<1||s.days.length>7||s.days.some(x=>!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>60||typeof x.short!=='string'||!x.short.trim()||x.short.length>20)||new Set(s.days.map(x=>x.name.toLowerCase())).size!==s.days.length)throw Error('Use one to seven unique school days with names and short labels.');
  if(!Array.isArray(s.weeks)||![1,2].includes(s.weeks.length)||s.weeks.some(x=>typeof x!=='string'||!x.trim()||x.length>60)||new Set(s.weeks).size!==s.weeks.length)throw Error('Use one or two distinct week names.');
  if(!Array.isArray(s.periods)||s.periods.length<1||s.periods.length>48)throw Error('Use 1–48 periods.');
  for(const [i,p] of s.periods.entries())if(!p||![0,1].includes(s.periods[0].period)||p.period!==s.periods[0].period+i||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||typeof p.short!=='string'||!p.short.trim()||p.short.length>20||!Number.isFinite(clock(p.starttime))||!Number.isFinite(clock(p.endtime))||clock(p.endtime)<=clock(p.starttime)||i&&clock(p.starttime)<clock(s.periods[i-1].endtime))throw Error('Periods need continuous numbers and positive, ordered, non-overlapping bell times.');
  for(const k of ['subjects','divisions','blocks'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k])||Object.keys(s[k]).length>5000)throw Error('Invalid '+k+' mapping.');
  for(const [key,x] of Object.entries(s.subjects))if(key.length>200||!x||typeof x.code!=='string'||!x.code.trim()||x.code.length>80||typeof x.name!=='string'||!x.name.trim()||x.name.length>160)throw Error('Each subject needs an export code and name.');
  for(const [key,x] of Object.entries(s.divisions))if(key.length>500||!x||typeof x.tag!=='string'||!x.tag.trim()||x.tag.length>160||!['partial','unknown'].includes(x.entireClass))throw Error('Each TG fragment needs a division and reviewed partial/unknown scope.');
  for(const [key,blocks] of Object.entries(s.blocks))if(key.length>500||!Array.isArray(blocks)||blocks.length>30||blocks.some(b=>!b||!Number.isInteger(b.length)||b.length<1||b.length>48||!Number.isInteger(b.count)||b.count<1||b.count>200||!['all','odd','even'].includes(b.week)))throw Error('Use positive whole lesson block counts and lengths with a valid week.');
  // Reject XML controls in every nested field before either persistence or export.
  function visit(x){if(typeof x==='string'&&!validXmlText(x))throw Error('Invalid XML character in export settings.');if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(!validXmlText(k))throw Error('Invalid XML character in mapping key.');visit(v);}}visit(s);
  if(JSON.stringify(s).length>600000)throw Error('Export settings are too large.');return s;
 }
 // Reversible UTF-16 encoding avoids hash collisions, Unicode loss and mutable names.
 const token=x=>String(x).split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 const identity=(kind,namespace,key)=>kind+'_'+token(namespace)+'_'+token(key);
 function sourceEvents(d,settings,issues){
  const teachers=new Map(),classes=new Map(),classLabels=new Map(),groups=new Map(),venues=new Map(),events=new Map();
  const fail=(message,field='demand')=>issues.push({field,message});
  function index(rows,map,key,label){for(const row of rows||[]){if(!row||!row[key]||map.has(String(row[key])))fail('Missing or duplicate '+label+' identity.','source');else map.set(String(row[key]),row);}}
  index(d.teachers,teachers,'id','teacher');index(d.classes,classes,'ref','class');index(d.groups,groups,'id','TG');index(d.venues,venues,'id','room');
  for(const c of classes.values()){const k=vg().key(c);if(!classLabels.has(k))classLabels.set(k,[]);classLabels.get(k).push(c);}
  function put(kind,target,subject,load,staff,roomIds,label,level,classRefs){
   const key=JSON.stringify([kind,target,subject]);let e=events.get(key);
   if(!e){e={key,kind,target,subject,load,teachers:[],roomIds:[],label,level:String(level||''),classRefs:classRefs||[]};events.set(key,e);}
   if(e.load!==load)fail(label+': conflicting period loads.');
   for(const id of staff.filter(Boolean)){if(!teachers.has(String(id)))fail(label+': referenced teacher is missing ('+id+').','source');else if(!e.teachers.includes(id))e.teachers.push(id);}
   for(const id of roomIds.filter(Boolean)){if(!venues.has(String(id)))fail(label+': room is missing ('+id+').','source');else if(!e.roomIds.includes(id))e.roomIds.push(id);}
   return e;
  }
  for(const a of d.assignments||[]){
   if(wl().isPD(a.subject)){const p=(d.organisations?.plt||[]).find(p=>p.id===a.target);if(!p||(p.slots||[]).includes(a.teacher)===false)fail('Legacy PD assignment needs matching PLT membership.');continue;}
   const g=groups.get(String(a.target)),cs=a.targetRef?[classes.get(String(a.targetRef))].filter(Boolean):(classLabels.get(String(a.target))||[]),c=cs.length===1?cs[0]:null;
   if(!g&&!c){fail('Assignment '+(a.id||a.target)+': resolve its class or TG identity.','source');continue;}
   if(g&&a.subject!==g.subject){fail(g.name+': assignment subject differs from the TG subject.');continue;}
   for(const subject of a.subject==='FT'?FT:[alias(a.subject)]){
    const load=g?vg().periods(d,g):wl().rate(d,c.level,subject),kind=g?'tg':'class',target=g?.id||c.ref;
    const roomIds=a.venue?[a.venue]:[];put(kind,target,subject,load,[a.teacher],roomIds,g?.name||vg().key(c)+' '+subject,g?.level||c.level,c?[c.ref]:[]);
   }
  }
  if(settings.includeUnassigned){
   for(const c of classes.values())for(const subject of Object.keys(d.loads?.[c.level]||{}))if(wl().isFormSubject(d,c.level,subject))put('class',c.ref,subject,wl().rate(d,c.level,subject),[],[],vg().key(c)+' '+subject,c.level,[c.ref]);
   for(const g of groups.values())put('tg',g.id,g.subject,vg().periods(d,g),[],[],g.name,g.level,[]);
  }
  for(const p of d.organisations?.plt||[])if((p.slots||[]).some(Boolean))put('plt',p.id,'PD',2,p.slots,[],p.name||'PD','',[]);
  for(const a of d.workload?.nonTeachingActivities||[])for(const id of a.teachers||[])put('activity',JSON.stringify([a.id,id]),a.code,a.weeklyPeriods,[id],[],a.name||a.code,'',[]);
  for(const duty of d.duties||[])for(const day of new Set(duty.days||[])){const id=duty.teachers?.[day];if(id)put('duty',JSON.stringify([duty.id,day]),'Duty',1,[id],[],(duty.name||'Duty')+' '+day,'',[]);}
  for(const e of events.values()){
   if(typeof e.load!=='number'||!Number.isFinite(e.load)||e.load<0||!Number.isInteger(e.load*2))fail(e.label+': resolve its actual weekly period load.');
   if(e.kind==='tg'){const scope=vg().scope(d,groups.get(String(e.target)));if(scope.unresolved.length)fail(e.label+': '+scope.unresolved.join('; '));e.classRefs=scope.levelWide?[...classes.values()].filter(c=>vg().levels(groups.get(String(e.target))).includes(String(c.level))).map(c=>c.ref):scope.classRefs;if(!e.classRefs.length)fail(e.label+': map its contributing classes.');}
   if(e.roomIds.length>1)fail(e.label+': co-teachers have conflicting rooms; review the assignment.');
  }
  return {events:[...events.values()].filter(e=>e.load!==0).sort((a,b)=>a.key.localeCompare(b.key,'en')),teachers,classes,groups,venues};
 }
 function sourceBlocks(d,e,s){
  if(own(s.blocks,e.key))return s.blocks[e.key];
  if(e.kind==='duty')return [{length:1,count:1,week:'all'}];
  const split=d.fortnight?.[JSON.stringify([e.level,e.subject])];if(!split||split.enabled===true)return null;
  const values=['ws','wd','wt'].map(k=>split[k]);if(values.every(n=>n===undefined||n===''))return null;
  if(values.some(n=>n!==undefined&&n!==''&&(!Number.isInteger(n)||n<0)))return null;
  return values.flatMap((n,i)=>n?[{length:i+1,count:n,week:'all'}]:[]);
 }
 function preview(snapshot,settings){
  const d=copy(snapshot),blockers=[],warnings=[],add=(field,message)=>blockers.push({field,message});let s;
  try{s=validateSettings(settings||defaults(d));}catch(e){add(/period|bell/i.test(e.message)?'periods':'settings',e.message);return {blockers,warnings,events:[],mappingRows:[],model:null,entityCounts:{},weeklyAndCycleTotals:{},provenance:{}};}
  if(s.destination==='new'&&!s.includeStructure)add('destination','A new timetable requires its period, day and cycle definitions.');
  if(s.destination==='existing'&&!s.includeStructure)add('destination','Retaining an existing template needs a verified external-ID and structure profile. This draft supports new timetables, or an explicit structure import into a test copy.');
  const src=sourceEvents(d,s,blockers),ns=s.namespace,idCache=new Map(),namespaceToken=token(ns),id=(kind,key)=>{const cacheKey=JSON.stringify([kind,key]);if(!idCache.has(cacheKey))idCache.set(cacheKey,kind+'_'+namespaceToken+'_'+token(key));return idCache.get(cacheKey);},model={teachers:[],subjects:[],classes:[],classrooms:[],groups:[],lessons:[],periods:copy(s.periods)},subjectMap=new Map(),mappingRows=[];
  for(const [key,t] of src.teachers)model.teachers.push({id:id('t',key),name:t.name||key,short:t.name||key});
  for(const [key,c] of src.classes){model.classes.push({id:id('c',key),name:vg().key(c),short:vg().key(c)});model.groups.push({id:id('g',JSON.stringify(['whole',key])),classid:id('c',key),name:'Entire class',entireclass:'1',divisiontag:''});}
  for(const [key,r] of src.venues)model.classrooms.push({id:id('r',key),name:r.name||r.label||key,short:r.short||r.name||key});
  const rawSubjects=new Set([...Object.values(d.loads||{}).flatMap(Object.keys).filter(k=>k!=='FT'),...src.events.map(e=>e.subject)]);
  for(const raw of [...rawSubjects].sort()){const m=mapped(s.subjects,raw)||{code:raw,name:raw};const prior=subjectMap.get(m.code);if(prior&&prior.name!==m.name)add('subjects','Export subject '+m.code+' has conflicting names.');else if(!prior){const row={id:id('s',m.code),name:m.name,short:m.code};subjectMap.set(m.code,row);model.subjects.push(row);}}
  const usedFragments=new Set(),divisions=new Map(),teacherTotals=Object.create(null),eventRows=[];let eventWeekly=0,teacherWeekly=0;
  for(const e of src.events){
   const subject=mapped(s.subjects,e.subject)?.code||e.subject,groupids=[];
   if(e.kind==='class')groupids.push(id('g',JSON.stringify(['whole',e.target])));
   if(e.kind==='tg')for(const ref of e.classRefs){
    const key=JSON.stringify([ref,e.target]),m=mapped(s.divisions,key),gid=id('g',key),c=src.classes.get(String(ref));mappingRows.push({key,classRef:ref,className:c?vg().key(c):ref,tgId:e.target,tgName:e.label,subject:e.subject,...(m||{})});
    if(!m)add('divisions',e.label+' / '+(c?vg().key(c):ref)+': review its class-local division and pupil scope.');
    if(m){const partition=JSON.stringify([ref,m.tag]),seen=divisions.get(partition)||new Set();seen.add(e.subject);divisions.set(partition,seen);if(seen.size>1)add('divisions','Division '+m.tag+' for '+vg().key(c)+' mixes different subjects. Use distinct divisions unless a verified cross-subject partition is supplied.');}
    if(!usedFragments.has(key)){model.groups.push({id:gid,classid:id('c',ref),name:e.label,entireclass:m?.entireClass==='partial'?'0':'',divisiontag:m?.tag||''});usedFragments.add(key);}groupids.push(gid);
   }
   const blocks=sourceBlocks(d,e,s),known=typeof e.load==='number'&&Number.isFinite(e.load);let sum=0;
   if(!blocks||!blocks.length)add('blocks',e.label+': set the lesson block split for '+e.load+' periods per week.');
   for(const b of blocks||[]){if(s.weeks.length===1&&b.week!=='all')add('weeks',e.label+': Odd/Even blocks require a two-week cycle.');if(b.length>s.periods.length)add('blocks',e.label+': block is longer than the period grid.');sum+=b.length*b.count/(b.week==='all'?1:2);}
   if(blocks&&known&&Math.abs(sum-e.load)>1e-9)add('blocks',e.label+': blocks total '+sum+'; expected '+e.load+' periods per week.');
   if(!e.roomIds.length)warnings.push(e.label+': room unassigned.');if(!e.teachers.length)warnings.push(e.label+': teacher unassigned.');
   const consolidated=new Map();for(const b of blocks||[]){const k=b.length+':'+b.week;if(!consolidated.has(k))consolidated.set(k,{...b});else consolidated.get(k).count+=b.count;}
   for(const b of consolidated.values())model.lessons.push({id:id('l',JSON.stringify([e.kind,e.target,e.subject,b.length,b.week])),subjectid:subjectMap.get(subject).id,classids:e.classRefs.map(ref=>id('c',ref)).sort().join(','),groupids:groupids.sort().join(','),teacherids:e.teachers.map(t=>id('t',t)).sort().join(','),classroomids:e.roomIds.map(r=>id('r',r)).sort().join(','),[s.profile==='reference-2012'?'periodspercard':'durationperiods']:b.length,periodsperweek:b.length*b.count/(b.week==='all'?1:2),weeksdefid:id('w',b.week),termsdefid:id('term','all')});
   if(known){eventWeekly+=e.load;teacherWeekly+=e.load*e.teachers.length;for(const t of e.teachers)teacherTotals[t]=(teacherTotals[t]||0)+e.load;}
   eventRows.push({...e,blocks:copy(blocks||[])});
  }
  const masks=s.days.map((_,i)=>'0'.repeat(i)+'1'+'0'.repeat(s.days.length-i-1));
  model.daysdefs=s.days.map((day,i)=>({id:id('day',String(i)),name:day.name,short:day.short,days:masks[i]}));model.daysdefs.push({id:id('day','any'),name:'Any day',short:'Any',days:masks.join(',')});
  model.weeksdefs=[{id:id('w','all'),name:s.weeks.length===1?s.weeks[0]:'All weeks',short:'All',weeks:'1'.repeat(s.weeks.length)}];
  if(s.weeks.length===2)model.weeksdefs.push({id:id('w','odd'),name:s.weeks[0],short:s.weeks[0],weeks:'10'},{id:id('w','even'),name:s.weeks[1],short:s.weeks[1],weeks:'01'});
  model.termsdefs=[{id:id('term','all'),name:s.termName||'Whole year',short:'All',terms:'1'}];
  model.globals=[{name:s.schoolName}];
  for(const rows of Object.values(model))for(const row of rows)for(const value of Object.values(row))if(!validXmlText(value))add('source','Invalid XML character in source data. Correct the affected record before export.');
  const durations=s.periods.map(p=>clock(p.endtime)-clock(p.starttime)),min=Math.min(...durations),max=Math.max(...durations);
  warnings.unshift('Draft XML profile. Import into a new timetable or a copy and verify in the installed aSc version.');
  if(min!==30||max!==30)warnings.push('Bell edits keep all assigned period counts. Source reference uses 30-minute periods.');
  const counts=Object.fromEntries(['teachers','subjects','classes','classrooms','groups','lessons'].map(k=>[k,model[k].length]));
  return {settings:s,model,events:eventRows,mappingRows,blockers:[...new Map(blockers.map(x=>[x.field+'|'+x.message,x])).values()],warnings:[...new Set(warnings)],entityCounts:counts,weeklyAndCycleTotals:{eventWeekly,eventCycle:eventWeekly*s.weeks.length,teacherWeekly,teacherCycle:teacherWeekly*s.weeks.length,teacherTotals,eventMinutes:{min:eventWeekly*min,max:eventWeekly*max}},provenance:{versionId:d.id||'',version:d.name||'',revision:d.revision??'',year:d.year??d.academicYear??'',localDraft:d.ascLocalDraft===true,profile:s.profile,installedVersion:s.installedVersion,namespace:ns,scope:s.includeUnassigned?'Assigned and unassigned planned demand':'Recorded assigned demand',applicationTested:false}};
 }
 // Small XML AST serializer. Attributes are XML escaped, controls rejected, and
 // the browser export adapter reparses final bytes before offering a download.
 function node(name,attributes={},children=[]){return {name,attributes,children};}
 function serialise(n){const escape=x=>{if(!validXmlText(x))throw Error('Invalid XML character.');return String(x).replace(/[&<>"'\r\n\t]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;','\n':'&#10;','\t':'&#9;'}[c]));};const attrs=Object.entries(n.attributes).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('');return n.children.length?'<'+n.name+attrs+'>\n'+n.children.map(serialise).join('\n')+'\n</'+n.name+'>':'<'+n.name+attrs+'/>';}
 const tableRows={globals:'global',periods:'period',daysdefs:'daysdef',weeksdefs:'weeksdef',termsdefs:'termsdef',teachers:'teacher',subjects:'subject',classes:'class',classrooms:'classroom',groups:'group',lessons:'lesson'};
 function buildAscExport(snapshot,settings,options={}){
  const p=preview(snapshot,settings),basicOnly=options.basicOnly===true;p.xml='';if(!p.model)return p;
  const basicBlockers=p.blockers.filter(x=>!['blocks','divisions','demand'].includes(x.field));if((basicOnly?basicBlockers:p.blockers).length)return p;
  const model=copy(p.model);if(basicOnly){model.groups=model.groups.filter(g=>g.entireclass==='1');model.lessons=[];p.entityCounts={...p.entityCounts,groups:model.groups.length,lessons:0};}
  const order=Object.keys(tableRows).filter(name=>(!basicOnly||name!=='lessons')&&(name!=='globals'||p.settings.schoolName)),tree=node('timetable',{importtype:'database',options:'idprefix:GSiS,groupstype1,decimalseparatordot',displayname:'GSiS deployment'},order.map(name=>{const rows=name==='periods'?model[name]:sorted(model[name]);const schema={globals:['name'],periods:['period','name','short','starttime','endtime'],daysdefs:['id','name','short','days'],weeksdefs:['id','name','short','weeks'],termsdefs:['id','name','short','terms'],teachers:['id','name','short'],subjects:['id','name','short'],classes:['id','name','short'],classrooms:['id','name','short'],groups:['id','classid','name','entireclass','divisiontag'],lessons:['id','subjectid','classids','groupids','teacherids','classroomids',p.settings.profile==='reference-2012'?'periodspercard':'durationperiods','periodsperweek','weeksdefid','termsdefid']};const columns=schema[name];return node(name,{options:'canadd,canupdate',columns:columns.join(',')},rows.map(row=>node(tableRows[name],row)));}));
  const provenance=JSON.stringify({...p.provenance,scope:basicOnly?'Basic entities only; no teaching demand':p.provenance.scope}).replace(/--/g,'- -');
  p.xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<!-- '+provenance+' -->\n'+serialise(tree)+'\n';p.basicOnly=basicOnly;return p;
 }
 return {defaults,fillBells,validateSettings,preview,buildAscExport,validXmlText,identity};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISAscExport;

/* GSIS_ASC_EXPORT_END */

/* GSIS_ASC_EXPORT_UI_BEGIN */
/* ASC export uses a frozen local version. Settings use Deploy's surgical save queue. */
const ascExportDrafts=new Map();
function ascExportDraft(){
 const key=JSON.stringify([lastEmail,current]),saved=v().ascExport||{},signature=JSON.stringify(saved);let draft=ascExportDrafts.get(key);
 if(draft&&draft.submitted===signature&&!queuedEdits().some(x=>x.operation==='setAscExportSettings')){draft.base=clone(saved);draft.saved=signature;draft.dirty=JSON.stringify(draft.settings)!==signature;draft.submitted=null;draft.status='Export settings saved.';}
 if(!draft||!draft.dirty&&draft.saved!==signature){draft={base:clone(saved),settings:Object.keys(saved).length?clone(saved):GSISAscExport.defaults(v()),saved:signature,dirty:false,status:'',preview:null,filter:''};ascExportDrafts.set(key,draft);}return draft;
}
function renderAscExport(root){
 if(!kp()){root.textContent='ASC Export is available to Admin and KP.';return;}
 const draft=ascExportDraft(),s=draft.settings,version=current,epoch=sessionEpoch,host=document.createElement('section');host.className='asc-export';root.append(host);
 const field=(label,key,value,type='text',extra='')=>'<label>'+esc(label)+'<input data-asc-field="'+key+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
 const select=(label,key,items,value)=>'<label>'+esc(label)+'<select data-asc-field="'+key+'">'+options(items,value)+'</select></label>';
 const initial=GSISAscExport.preview(v(),s);
 host.innerHTML='<header><h2>ASC Export <span class="asc-draft-label">Draft format</span></h2><p>Export '+esc(v().name)+' for aSc to schedule. Your current local deployment is included. This does not save, publish or change a timetable.</p></header>'+
 '<p class="asc-note">Import into a new timetable or a test copy first. Check groups, co-teachers and lesson totals in your installed aSc version.</p>'+
 '<div class="asc-actions"><button data-asc-preview>Preview</button><button data-asc-save>Save export settings</button><button data-asc-reset>Reset to selected profile</button><button data-asc-export>Export aSc XML</button><button data-asc-basic>Export basic entities only</button></div><p data-asc-status role="status" aria-live="polite">'+esc(draft.status||'Ready. Preview and XML export work from local data.')+'</p><p data-asc-error role="alert" tabindex="-1"></p><div data-asc-results></div>'+
 '<fieldset><legend>Destination and identity</legend><div class="asc-fields">'+select('Destination','destination',[['new','New timetable'],['existing','Existing template / test copy']],s.destination)+select('XML profile','profile',[['reference-2012','School reference: legacy block field'],['current-catalogue','Current catalog: durationperiods']],s.profile)+field('Installed aSc version','installedVersion',s.installedVersion)+field('School name','schoolName',s.schoolName)+field('File label','fileLabel',s.fileLabel)+field('Stable timetable namespace','namespace',s.namespace)+'</div><label class="asc-check"><input type="checkbox" data-asc-structure '+(s.includeStructure?'checked':'')+'> Include period, day and cycle definitions</label><p class="hint">Keep the namespace for revisions of one timetable. Choose a new namespace for a new school year. Retaining an existing template without definitions needs a verified ID mapping and is not supported by this draft.</p></fieldset>'+
 '<details><summary>School days, cycle and bells</summary><fieldset><legend>School cycle</legend><div class="asc-fields">'+field('School days, in order (comma-separated)','days',s.days.map(x=>x.name).join(', '))+field('Day short labels, in order','dayShorts',s.days.map(x=>x.short).join(', '))+select('Week cycle','cycle',[['1','One week'],['2','Two weeks']],String(s.weeks.length))+field('Week names, in order (comma-separated)','weeks',s.weeks.join(', '))+field('Term name (whole-year mask)','termName',s.termName)+'</div><p class="hint">aSc handles lesson placement and solver rules. The cycle does not assign calendar dates or holidays.</p></fieldset><fieldset><legend>Fill bell times</legend><div class="asc-fields">'+field('Period count','bellCount',s.periods.length,'number','min="1" max="48"')+select('First period','bellNumber',[['0','0 (keep P0)'],['1','1']],String(s.periods[0]?.period||0))+field('First start','bellStart',s.periods[0]?.starttime||'07:00','time')+field('Minutes per period','bellMinutes',30,'number','min="1" max="240"')+field('Gap in minutes','bellGap',0,'number','min="0" max="240"')+'</div><button data-asc-fill>Fill bell grid</button><p class="hint">Clock edits keep the same number of assigned periods. Edit individual rows after filling.</p><div data-asc-bells></div></fieldset></details>'+
 '<details open><summary>Subject, class division and lesson review</summary><p class="hint">Review each TG fragment within its contributing class. Only groups in the same subject are known to be disjoint. Leave pupil coverage unknown unless partial coverage is verified. No student records are needed.</p><label class="asc-check"><input type="checkbox" data-asc-unassigned '+(s.includeUnassigned?'checked':'')+'> Also include unassigned planned class and TG demand</label><div data-asc-mappings></div><div class="asc-fields"><label>Find a lesson<input data-asc-filter type="search" value="'+esc(draft.filter)+'" placeholder="Class, TG, subject or teacher"></label><label>Lesson to review<select data-asc-event></select></label></div><div data-asc-event-editor></div></details>';
 function active(){return current===version&&sessionEpoch===epoch&&kp()&&host.isConnected;}
 function changed(){draft.dirty=true;draft.preview=null;draft.status='Local export settings changed. Preview again or export the current draft.';host.querySelector('[data-asc-status]').textContent=draft.status;host.querySelector('[data-asc-error]').textContent='';host.querySelector('[data-asc-results]').textContent='';updateSave();}
 function updateSave(){const other=queuedEdits().some(x=>x.operation!=='setAscExportSettings'),save=host.querySelector('[data-asc-save]');save.disabled=!!queueFlight||other;save.title=other?'Save or discard other Deploy changes first. XML export still includes your local draft.':queueFlight?'Wait for this save to finish.':'';}
 const showError=e=>{const error=host.querySelector('[data-asc-error]');error.textContent=e.message||String(e);error.focus({preventScroll:true});};
 function bellRows(){host.querySelector('[data-asc-bells]').innerHTML='<div class="scroll"><table data-no-sort="true" data-no-column-controls="true"><thead><tr><th>Period</th><th>Name</th><th>Short</th><th>Start</th><th>End</th></tr></thead><tbody>'+s.periods.map((p,i)=>'<tr><th>'+p.period+'</th>'+['name','short','starttime','endtime'].map(k=>'<td><input data-asc-bell="'+i+'" data-key="'+k+'" aria-label="Period '+p.period+' '+k+'" type="'+(k.endsWith('time')?'time':'text')+'" value="'+esc(p[k])+'"></td>').join('')+'</tr>').join('')+'</tbody></table></div>';host.querySelectorAll('[data-asc-bell]').forEach(input=>input.oninput=()=>{s.periods[Number(input.dataset.ascBell)][input.dataset.key]=input.value;changed();});}
 let review=initial;
 function mapRows(){
  review=GSISAscExport.preview(v(),s);const box=host.querySelector('[data-asc-mappings]');
  const subjects=[...new Set([...Object.values(v().loads||{}).flatMap(Object.keys).filter(x=>x!=='FT'),...review.events.map(e=>e.subject)])].sort();
  box.innerHTML='<details><summary>Subject crosswalk ('+subjects.length+')</summary><div class="scroll"><table data-no-sort="true" data-no-column-controls="true"><thead><tr><th>Deploy subject</th><th>aSc code</th><th>aSc name</th></tr></thead><tbody>'+subjects.map((key,i)=>'<tr><th>'+esc(key)+'</th>'+['code','name'].map(f=>'<td><input data-asc-subject="'+i+'" data-key="'+f+'" aria-label="'+esc(key+' '+f)+'" value="'+esc((Object.prototype.hasOwnProperty.call(s.subjects,key)?s.subjects[key]?.[f]:null)||key)+'"></td>').join('')+'</tr>').join('')+'</tbody></table></div></details><details'+(review.mappingRows.length?' open':'')+'><summary>Class-local TG divisions ('+review.mappingRows.length+')</summary><div class="scroll"><table data-no-sort="true" data-no-column-controls="true"><thead><tr><th>TG</th><th>Class</th><th>Subject</th><th>Division tag</th><th>Pupil scope</th></tr></thead><tbody>'+review.mappingRows.map((m,i)=>'<tr><th>'+esc(m.tgName)+'</th><td>'+esc(m.className)+'</td><td>'+esc(m.subject)+'</td><td><input data-asc-division="'+i+'" data-key="tag" aria-label="Division for '+esc(m.tgName+' '+m.className)+'" placeholder="Review division" value="'+esc(s.divisions[m.key]?.tag||'')+'"></td><td><select data-asc-division="'+i+'" data-key="entireClass" aria-label="Pupil scope for '+esc(m.tgName+' '+m.className)+'">'+options([['unknown','Coverage unknown'],['partial','Confirmed partial class']],s.divisions[m.key]?.entireClass||'unknown')+'</select></td></tr>').join('')+'</tbody></table></div></details>';
  box.querySelectorAll('[data-asc-subject]').forEach(input=>input.oninput=()=>{const raw=subjects[Number(input.dataset.ascSubject)];if(!Object.prototype.hasOwnProperty.call(s.subjects,raw))Object.defineProperty(s.subjects,raw,{value:{code:raw,name:raw},writable:true,enumerable:true,configurable:true});s.subjects[raw][input.dataset.key]=input.value;changed();});
  box.querySelectorAll('[data-asc-division]').forEach(input=>input.oninput=()=>{const m=review.mappingRows[Number(input.dataset.ascDivision)];s.divisions[m.key]||={tag:'',entireClass:'unknown'};s.divisions[m.key][input.dataset.key]=input.value;changed();});
  eventOptions();
 }
 function eventOptions(){const menu=host.querySelector('[data-asc-event]'),selected=menu.value,q=draft.filter.toLowerCase(),names=new Map((v().teachers||[]).map(t=>[t.id,t.name]));const events=review.events.filter(e=>[e.label,e.subject,...e.teachers.map(t=>names.get(t)||t)].join(' ').toLowerCase().includes(q));menu.innerHTML=events.map(e=>'<option value="'+esc(e.key)+'">'+esc(e.label+' · '+e.subject+' · '+e.load+' periods/week')+'</option>').join('');if(events.some(e=>e.key===selected))menu.value=selected;eventEditor();}
 function eventEditor(){const key=host.querySelector('[data-asc-event]').value,e=review.events.find(x=>x.key===key),box=host.querySelector('[data-asc-event-editor]');if(!e){box.textContent='No matching lessons.';return;}
  const blocks=s.blocks[key]||e.blocks||[],names=new Map(v().teachers.map(t=>[t.id,t.name]));box.innerHTML='<p><strong>'+esc(e.label)+'</strong> · '+e.load+' periods/week · '+esc(e.teachers.map(t=>names.get(t)||t).join(', ')||'No teacher assigned')+'</p><p class="hint">Counts are blocks, not periods. All weeks repeats each week. Odd / Even occurs only in that week. Existing Fortnight Split values are used when they form a complete weekly plan. Enter exact week choices for fortnight plans.</p><div class="scroll"><table data-no-sort="true" data-no-column-controls="true"><thead><tr><th>Week</th><th>Singles</th><th>Doubles</th><th>Triples</th></tr></thead><tbody>'+['all',...(s.weeks.length===2?['odd','even']:[])].map(week=>'<tr><th>'+esc(week==='all'?'All weeks':s.weeks[week==='odd'?0:1])+'</th>'+[1,2,3].map(length=>'<td><input type="number" min="0" max="200" step="1" data-asc-block-week="'+week+'" data-length="'+length+'" aria-label="'+week+' '+length+'-period blocks" value="'+blocks.filter(b=>b.week===week&&b.length===length).reduce((n,b)=>n+b.count,0)+'"></td>').join('')+'</tr>').join('')+'</tbody></table></div><p data-asc-block-total class="hint"></p><button data-asc-use-split>Use Deploy split again</button>';
  function total(){const bs=s.blocks[key]||blocks,sum=bs.reduce((n,b)=>n+b.length*b.count/(b.week==='all'?1:2),0);box.querySelector('[data-asc-block-total]').textContent='Planned '+sum+' / '+e.load+' periods per week.';}
  box.querySelectorAll('[data-asc-block-week]').forEach(input=>input.oninput=()=>{const old=s.blocks[key]||blocks;s.blocks[key]=old.filter(b=>!(b.week===input.dataset.ascBlockWeek&&b.length===Number(input.dataset.length)));const n=Number(input.value);if(n)s.blocks[key].push({length:Number(input.dataset.length),count:n,week:input.dataset.ascBlockWeek});changed();total();});box.querySelector('[data-asc-use-split]').onclick=()=>{delete s.blocks[key];changed();review=GSISAscExport.preview(v(),s);eventEditor();};total();
 }
 function showPreview(p){draft.preview=p;const target=host.querySelector('[data-asc-results]'),t=p.weeklyAndCycleTotals;target.innerHTML='<div class="asc-preview"><strong>'+esc(p.provenance.version||v().name)+' · revision '+esc(p.provenance.revision??'')+(p.provenance.localDraft?' · LOCAL DRAFT':'')+'</strong><p>'+Object.entries(p.entityCounts).map(([k,n])=>esc(n+' '+k)).join(' · ')+'</p>'+(t.eventWeekly!==undefined?'<p>Unique event demand: '+t.eventWeekly+' periods/week; '+t.eventCycle+' per cycle. Teacher-period total: '+t.teacherWeekly+'/week.</p><p>Unplaced event minutes: '+(t.eventMinutes.min===t.eventMinutes.max?t.eventMinutes.min:t.eventMinutes.min+'–'+t.eventMinutes.max)+' per week. No period counts were changed.</p>':'')+'<p><strong>'+(p.blockers.length?p.blockers.length+' checks to resolve':'Ready for draft XML export')+'</strong></p>'+ (p.blockers.length?'<ul>'+p.blockers.map(x=>'<li>'+esc(x.message)+'</li>').join('')+'</ul>':'')+'<details><summary>Notes ('+p.warnings.length+')</summary><ul>'+p.warnings.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></div>';}
 async function makeExport(download,basicOnly=false){
  if(!active())return;const snapshot=clone(v()),settings=clone(s);snapshot.revision=snapshotCache?.id===current?snapshotCache.revision:snapshot.revision;snapshot.ascLocalDraft=draft.dirty||queuedEdits().length>0;host.querySelector('[data-asc-status]').textContent='Preparing local XML…';await new Promise(resolve=>setTimeout(resolve,0));if(!active())return;
  try{const p=GSISAscExport.buildAscExport(snapshot,settings,{basicOnly});showPreview(p);if(download){if(!p.xml)throw Error('Resolve the checks above before exporting this scope.');const parsed=new DOMParser().parseFromString(p.xml,'application/xml');if(parsed.querySelector('parsererror'))throw Error('XML validation failed. No file was downloaded.');const name=[settings.schoolName||'GSiS',snapshot.year||snapshot.academicYear||'',settings.fileLabel||snapshot.name,basicOnly?'basic-only':'deployment','draft'].filter(Boolean).join('-').replace(/[^\p{L}\p{N}._-]+/gu,'-');exportFile(name+'.xml',p.xml,'application/xml');}draft.status=download?(basicOnly?'Basic entities exported. This file contains no teaching demand.':'Draft XML exported. Verify in aSc before using it.'):'Local preview ready.';host.querySelector('[data-asc-status]').textContent=draft.status;}catch(e){showError(e);host.querySelector('[data-asc-status]').textContent='Local data and edits are retained.';}
 }
 host.querySelectorAll('[data-asc-field]').forEach(input=>input.oninput=()=>{const k=input.dataset.ascField;if(k.startsWith('bell'))return;if(k==='days'){const names=input.value.split(',').map(x=>x.trim());s.days=names.map((name,i)=>({name,short:s.days[i]?.short||name.slice(0,3)}));}else if(k==='dayShorts'){const shorts=input.value.split(',').map(x=>x.trim());s.days=s.days.map((day,i)=>({...day,short:shorts[i]||''}));}else if(k==='cycle'){s.weeks=Number(input.value)===1?[s.weeks[0]||'Week']:s.weeks.length===2?s.weeks:['Odd','Even'];host.querySelector('[data-asc-field="weeks"]').value=s.weeks.join(', ');eventEditor();}else if(k==='weeks')s.weeks=input.value.split(',').map(x=>x.trim());else{s[k]=input.value;if(k==='destination'){s.includeStructure=k==='destination'&&input.value==='new';host.querySelector('[data-asc-structure]').checked=s.includeStructure;host.querySelector('[data-asc-structure]').disabled=s.destination==='new';}}changed();});
 host.querySelectorAll('select[data-asc-field],select[data-asc-division]').forEach(select=>select.onchange=select.oninput);
 host.querySelector('[data-asc-structure]').onchange=e=>{s.includeStructure=e.target.checked;changed();};host.querySelector('[data-asc-unassigned]').onchange=e=>{s.includeUnassigned=e.target.checked;changed();mapRows();};host.querySelector('[data-asc-filter]').oninput=e=>{draft.filter=e.target.value;eventOptions();};host.querySelector('[data-asc-event]').onchange=eventEditor;
 host.querySelector('[data-asc-fill]').onclick=()=>{try{const val=k=>host.querySelector('[data-asc-field="'+k+'"]').value;s.periods=GSISAscExport.fillBells(Number(val('bellCount')),Number(val('bellNumber')),val('bellStart'),Number(val('bellMinutes')),Number(val('bellGap')));changed();bellRows();}catch(e){showError(e);}};
 host.querySelector('[data-asc-preview]').onclick=()=>makeExport(false);host.querySelector('[data-asc-export]').onclick=()=>makeExport(true);host.querySelector('[data-asc-basic]').onclick=()=>makeExport(true,true);
 host.querySelector('[data-asc-save]').onclick=()=>{if(!active()||queueFlight||queuedEdits().some(x=>x.operation!=='setAscExportSettings'))return;try{const value=GSISAscExport.validateSettings(s);draft.status='Saving export settings…';draft.submitted=JSON.stringify(value);queueCell({operation:'setAscExportSettings',value,expected:clone(draft.base)});pumpQueue(true);}catch(e){showError(e);}};
 host.querySelector('[data-asc-reset]').onclick=()=>{const profile=s.profile,namespace=s.namespace;draft.settings=GSISAscExport.defaults(v());draft.settings.profile=profile;draft.settings.namespace=namespace;draft.dirty=true;draft.status='Profile defaults restored locally. Saved settings are unchanged.';render();};
 host.querySelector('[data-asc-structure]').disabled=s.destination==='new';bellRows();mapRows();updateSave();
}

/* GSIS_ASC_EXPORT_UI_END */

controls();startSignIn();
