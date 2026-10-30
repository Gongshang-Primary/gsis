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
 function analyse(d,rules){
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
   row.targetRetained=row.employment==='RT'?null:row.employment==='FAJT'?65/84:row.rules.retained;
   row.targetPending=row.employment!=='FAJT'&&row.rules.pending.length>0;
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
  return {demand:planned,D,subjects:subs,teachingIncomplete,rows,ledger,byLevel,totals,F,fByLevel,fttUnequal,N,standard,fullTimeN,teachingReference,special,issues:[...new Set(issues)],fttSubjects};
 }
 return {analyse,validate,nonTeachingActivities,subjectIdentity,category,rate,subjects,KINDS,specialists,modal,band,isPD,employment,isFormSubject,subjectType,subjectTypeSubjects,validateSubjectType,isGroupSubject};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISWorkload;
