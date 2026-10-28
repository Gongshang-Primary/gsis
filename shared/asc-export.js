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
