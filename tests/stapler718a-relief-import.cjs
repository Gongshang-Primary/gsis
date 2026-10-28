'use strict';
// Only synthetic staff identities live here. An optional local Offline JSON is
// checked against v4.3 Relief export precedence without copying it into Git.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const S=require('../shared/roster-stapler.js'),O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),{harness}=require('./stapler715-persistence.cjs'),root=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const historicalComparison=process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1';
if(!historicalComparison)console.log('HISTORICAL COMPARISON NOT RUN: 32d2c2d17621319ba1d57aea34046229544f5513; set GSIS_RUN_HISTORICAL_BENCHMARKS=1 with the original Git objects. Current synthetic export-oracle, rejection and persistence assertions remain active.');
const oldSource=historicalComparison?execFileSync('git',['show','32d2c2d17621319ba1d57aea34046229544f5513:shared/roster-stapler.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024}):null;
if(historicalComparison)assert(oldSource.includes('This Offline JSON includes saved absences or relief assignments.'),'failure reproduction must use the unchanged v0.7.18 model');
const active=plan=>plan.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid'),blank=periods=>periods.map(()=>['','','','']);
function fixture(){
 const periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period}));
 const teachers=['Alice','Bob','Cara','Dana','Online only'].map((name,i)=>({staffId:'staff-'+i,name,timetableName:name,cells:blank(periods)}));
 teachers[0].cells[1]=['EL','','',''];teachers[1].cells[5]=['EL','','',''];teachers[4].cells[6]=['PD','','Staff room',''];
 for(const t of teachers)Object.assign(t,{R:9,originalR:9,periodCap:30,capConfigured:true,capWorkload:20,capHeadroom:10,capVerified:true});
 const people=teachers.map(t=>({id:t.staffId,name:t.name,active:true})),day={date:'2026-10-21',id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]};
 const card=(id,teacher,p,subject,className,venue='Hall',group='Group')=>({id,teacher,assignedPeriod:p,subject,className,venue,group,sheet:'Even Week',day:'Wednesday',location:'teacher'});
 const payload={app:'Stapler',version:'4.3',stateType:'relief',selectedDate:day.date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:['Alice','Bob','Cara','Dana'],tiles:[card('a1','Alice',1,'EL','Exam A'),card('a2','Alice',2,'SCI','Exam B'),card('a3','Alice',3,'MA','Exam C'),card('b2','Bob',2,'ART','Exam D'),card('c5','Cara',5,'PE','Exam E')],reliefAbsences:[{teacher:'Alice',periods:[0,1,2,3],reason:'Others',reasonOther:'School event',noRelief:[3],assignments:{1:'Bob',2:'Bob'},swaps:{2:true},planSignatures:{},swapPlanSignatures:{}},{teacher:'Cara',periods:[4,5],reason:'Medical',reliefNeeded:false,noRelief:[5],assignments:{}}]};
 return {day,people,payload,plan:S.create(day),options:{people}};
}
function signature(payload,name,p){return payload.startTime+'|'+payload.periodMinutes+'|'+p+'␞'+payload.tiles.filter(t=>t.sheet===payload.selectedSheet&&t.day===payload.selectedDay&&t.location!=='pit'&&t.teacher===name&&t.assignedPeriod===p).map(t=>[t.id,t.subject.trim(),t.className.trim(),t.venue.trim(),t.group.trim()].join('␟')).sort().join('␝');}
// Independent worksheet oracle, following exportWorkbook('relief') in Stapler
// v4.3: planned cells, every absence annotation, coverage, then swap/dropped cells.
function oracle(payload,people,day){
 const ids=new Map(people.map(t=>[t.name,t.id])),rows=new Map(people.map(t=>[t.id,blank(day.periods)]));
 const planned=payload.tiles.filter(t=>t.sheet===payload.selectedSheet&&t.day===payload.selectedDay&&t.location!=='pit'&&t.assignedPeriod!=null),values=t=>[t.subject,t.className,t.venue,t.group].map(v=>String(v||'').trim());
 for(const t of planned)rows.get(ids.get(t.teacher))[Number(t.assignedPeriod)]=values(t);
 for(const a of payload.reliefAbsences||[]){
  const reason=a.reason==='Others'?(a.reasonOther||'Others'):(a.reason||'Unspecified');
  for(const p of a.periods){const t=planned.find(t=>t.teacher===a.teacher&&Number(t.assignedPeriod)===Number(p));rows.get(ids.get(a.teacher))[p]=t?[(t.subject||'Lesson')+' (absent — '+reason+')',...values(t).slice(1)]:['Absent — '+reason,'','',''];}
 }
 for(const a of payload.reliefAbsences||[])for(const [pText,name] of Object.entries(a.assignments||{})){
  const p=Number(pText),lesson=planned.find(t=>t.teacher===a.teacher&&Number(t.assignedPeriod)===p),own=planned.find(t=>t.teacher===name&&Number(t.assignedPeriod)===p),swap=!!a.swaps?.[p];
  assert(lesson,'oracle requires a planned absent lesson');rows.get(ids.get(name))[p]=[(lesson.subject||'Relief')+' ('+(swap?'swapped w/':'for')+' '+a.teacher+')',...values(lesson).slice(1)];
  if(swap&&own)rows.get(ids.get(a.teacher))[p]=[(own.subject||'Lesson')+' (dropped — swapped w/ '+name+')',...values(own).slice(1)];
 }
 return rows;
}
function cellKey(cell){return JSON.stringify([cell[0],cell[1].split(',').map(s=>s.trim().toLowerCase().replace(/^(?:primary|pri|p)\s*(?=[1-6])/,'').replace(/\s+/g,'')).filter(Boolean).sort().join(','),cell[2],cell[3]]);}
function compareRows(plan,day,rows){const effective=S.effectiveDay(plan,day);for(const [id,expected] of rows){const actual=effective.teachers.find(t=>t.staffId===id);assert(actual,'every imported teacher has a final row');assert.deepEqual(actual.cells.map(cellKey),expected.map(cellKey),'every final cell matches the independent offline export oracle');}}
function persistWithBackend({day,people,plan},label){
 const h=harness(day,people),leaseSessionId=crypto.randomUUID(),call=input=>h.call(input).result;
 const command=(operation,extra={})=>({operation,view:'stapler',date:day.date,leaseSessionId,leaseFence:1,revision:0,staplerRevision:0,requestId:crypto.randomUUID(),...extra});
 try{
  assert.equal(call(command('acquireStaplerLock',{leaseFence:0})).ok,true);
  const save=command('saveStapler',{plan}),saved=call(save);assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal(h.state().staplerPlans[0].draft.encoding,'gzip-base64-v1');
  const reread=call({operation:'stapler',date:day.date,leaseSessionId});assert.equal(reread.ok,true,JSON.stringify(reread));assert.deepEqual(reread.data.plan,{...clone(plan),status:'draft'});
  assert.equal(call(save).data.replayed,true);assert.equal(h.writes(),1,'retry has no second durable write');
  const confirmed=call(command('confirmStapler',{revision:1,staplerRevision:1}));assert.equal(confirmed.ok,true,JSON.stringify(confirmed));
  const final=call({operation:'stapler',date:day.date,leaseSessionId});assert.equal(final.ok,true);assert(final.data.confirmed);assert.deepEqual(S.effectiveDay(final.data.plan,day).teachers,S.effectiveDay(plan,day).teachers);
  for(const field of ['absences','assignments','importedRelief','outbox'])assert.equal((h.state()[field]||[]).length,0,'final overlay must not create online '+field);
  console.log('PASS '+label+': patched backend Save, fresh-runtime reload, receipt replay and Confirm; no attendance, relief history or notifications');
 }finally{h.close();}
}
function synthetic(){
 const f=fixture(),{plan,payload,options,day}=f,before=JSON.stringify(plan);
 for(const a of payload.reliefAbsences)for(const [p,name] of Object.entries(a.assignments||{})){a.planSignatures[p]=signature(payload,a.teacher,Number(p));if(a.swaps?.[p])a.swapPlanSignatures[p]=signature(payload,name,Number(p));}
 const input=JSON.stringify(payload),imported=S.importLegacy(plan,payload,options),rows=oracle(payload,f.people,day);rows.set('staff-4',day.teachers[4].cells);compareRows(imported,day,rows);
 assert.equal(JSON.stringify(plan),before,'import never mutates its existing draft');assert.equal(JSON.stringify(payload),input,'import does not alter the offline file');
 assert.deepEqual(S.effectiveDay(imported,day).teachers.find(t=>t.staffId==='staff-3').cells,blank(day.periods),'represented teacher with no final tiles stays blank');
 assert.equal(S.accounting(imported).reduce((n,t)=>n+t.reliefCount,0),0,'offline ownership is not online relief credit');
 for(const t of active(imported).filter(t=>t.id.startsWith('offline:')))assert(S.isImportedPlacement(imported,t),'flattened attendance cells have immutable current ownership');
 const repeated=S.importLegacy(imported,payload,options);assert.equal(repeated.tiles.length,imported.tiles.length);compareRows(repeated,day,rows);compareRows(S.importLegacy(plan,{...payload,stateType:'plan'},options),day,rows);
 const alias=clone(payload);alias.tiles.filter(t=>t.teacher==='Bob').forEach(t=>t.teacher='Cover alias');alias.addedTeachers=alias.addedTeachers.map(n=>n==='Bob'?'Cover alias':n);for(const a of alias.reliefAbsences)for(const p of Object.keys(a.assignments||{}))if(a.assignments[p]==='Bob')a.assignments[p]='Cover alias';
 const bridged=S.importLegacy(plan,alias,{...options,nameBridges:[{timetableName:'Cover alias',staffId:'staff-1'}]});assert.equal(S.effectiveDay(bridged,day).teachers.find(t=>t.staffId==='staff-1').cells[1][0],'EL (for Alice)');
 const fuzzy=clone(payload);fuzzy.reliefAbsences[0].assignments[1]='Bobb';assert.equal(S.importIssues(plan,fuzzy,options).find(i=>i.name==='Bobb').reason,'fuzzy');assert.throws(()=>S.importLegacy(plan,fuzzy,options),/Resolve Offline JSON teacher identities/);const mapped=S.importLegacy(plan,fuzzy,{...options,teacherMappings:{Bobb:'staff-1'}});assert.equal(S.effectiveDay(mapped,day).teachers.find(t=>t.staffId==='staff-1').cells[1][0],'EL (for Alice)');
 const reject=(mutate,pattern)=>{const invalid=clone(payload),snapshot=JSON.stringify(plan);mutate(invalid);assert.throws(()=>S.importLegacy(plan,invalid,options),pattern);assert.equal(JSON.stringify(plan),snapshot,'invalid import leaves draft untouched');};
 reject(p=>{p.reliefAbsences[0].planSignatures[1]='stale';},/older planning timetable/);reject(p=>{p.reliefAbsences[0].swapPlanSignatures[2]='stale';},/older planning timetable/);
 reject(p=>{p.reliefAbsences[0].swaps={};},/clashing relief/);
 reject(p=>{p.reliefAbsences[1]={teacher:'Dana',periods:[1],assignments:{},reason:'Medical'};p.reliefAbsences[0].assignments[1]='Dana';},/absent in that period/);
 reject(p=>{p.reliefAbsences.push({teacher:'Alice',periods:[0],assignments:{}});},/overlapping absence/);
 reject(p=>{p.reliefAbsences[0].assignments[3]='Dana';},/does not match an absent lesson/);reject(p=>{p.reliefAbsences[0].assignments[0]='Dana';},/does not match an absent lesson/);
 reject(p=>{p.reliefAbsences[0].periods.push(17);},/valid timetable period/);reject(p=>{p.reliefAbsences[0].assignments['01']='Dana';},/Invalid Offline JSON relief period/);
 reject(p=>{p.tiles.push({...p.tiles[0],id:'duplicate-period'});},/conflicting teacher periods/);
 reject(p=>{p.tiles.push({...p.tiles[0],id:'d1',teacher:'Dana'});p.reliefAbsences.push({teacher:'Dana',periods:[1],assignments:{1:'Bob'}});},/clashing relief/);
 assertWorkload(imported,f);
 persistWithBackend({...f,plan:imported},'synthetic capped relief overlay');
 console.log('PASS final Relief cells: absent blanks, no relief, normal coverage, swap/dropped precedence, Name Bridge, explicit fuzzy resolution, repeat import and atomic rejection');
}
function assertWorkload(plan,{day,people}){
 const state=O.initial(),effective=S.effectiveDay(plan,day),ctx={today:day.date,people,days:{[day.date]:effective}},teachers=A.teacherContext(state,ctx,day.date);
 for(const [id,periods] of [['staff-0',[0,1,2,3]],['staff-2',[4,5]]]){
  const t=teachers.get(id);for(const p of periods){assert(t.base.has(p),'offline absent/dropped annotation blocks availability');assert(!t.workloadBase.has(p),'absence or dropped lesson is not worked teaching');assert.equal(A.eligibility(t,p).available,false);assert.equal(O.needsCover(t.t.cells[p]),false);}
  const absence={id:'online-'+id,staffId:id,date:day.date,periods,reliefRequired:true};assert.equal(O.previewAbsence(ctx,absence).length,0);assert.equal(O.previewAbsence(ctx,{...absence,noReliefSubjects:[]}).length,0,'explicit school no-relief settings cannot replay annotated lessons');state.absences.push(absence);
 }
 assert.equal(O.demand(ctx,state,day.date).length,0,'online absence records cannot duplicate already flattened offline absence demand');
 assert.deepEqual([...teachers.get('staff-1').workloadBase],[1,2],'covering teacher has ordinary final teaching load');
 assert.equal(O.previewAbsence(ctx,{id:'new-cover-absence',staffId:'staff-1',date:day.date,periods:[1],reliefRequired:true}).length,1,'a subsequent absence of the covering teacher still produces real cover demand');
 assert.equal(S.capWorkload(effective.teachers.find(t=>t.staffId==='staff-0').cells),0);assert.equal(S.capWorkload(effective.teachers.find(t=>t.staffId==='staff-1').cells),2);
 const classify=S.activityClassifier({}),lesson=subject=>({subject,classIds:['Exam'],group:''});
 for(const subject of ['MA (for Alice (SRE))','MA (swapped w/ Alice (SRE))'])assert.deepEqual(classify(lesson(subject)),{kind:'teaching',known:true,cap:true});
 assert.deepEqual(classify(lesson('PD (P3/P4 MA) (for Alice)')),{kind:'nonTeaching',known:true,cap:false});
 for(const subject of ['Absent — Medical','EL (absent — Medical)','ART (dropped — swapped w/ Alice (SRE))','Invigilation (absent — Medical)'])assert.deepEqual(classify(lesson(subject)),{kind:null,known:true,cap:false});
 assert.deepEqual(A.teachingProfile([['MA (for Alice (SRE))','5A','',''],['PD (P3/P4 MA) (for Alice)','','','']]).subjects,['ma']);
 const annotated=clone(effective);annotated.teachers[0].cells[0]=['Invigilation (absent — Medical)','Exam','',''];const source=A.teacherSource({...ctx,days:{[day.date]:annotated}},day.date).rows.find(t=>t.person.id==='staff-0');assert(source.base.has(0));assert(!source.workloadBase.has(0),'invigilation fallback cannot count an absent annotation as work');
}
async function supplied(file){
 const payload=JSON.parse(fs.readFileSync(file,'utf8')),{JSDOM}=require('jsdom'),JSZip=require('jszip'),window=new JSDOM('').window,box=vm.createContext({window,DOMParser:window.DOMParser,JSZip,TextEncoder,TextDecoder,Uint8Array});
 try{
  vm.runInContext(fs.readFileSync(path.join(root,'roster-update/public/converter.js'),'utf8'),box);
  const workbook=await window.RosterConverter.parseFile(Buffer.from(payload.workbookBase64,'base64')),week=workbook.single||workbook[payload.selectedSheet.split(' ')[0].toLowerCase()],start=Number(payload.startTime.slice(0,2))*60+Number(payload.startTime.slice(3)),duration=Number(payload.periodMinutes),periods=Array.from({length:week.perDay},(_,period)=>({period,startMinutes:start+duration*period,endMinutes:start+duration*(period+1)}));
  const teachers=week.blocks.map((b,i)=>({staffId:'staff-'+i,name:b.name,timetableName:b.name,cells:periods.map(()=>['ONLINE BASELINE','','',''])})),people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));
  for(const name of payload.addedTeachers||[])if(!people.some(p=>p.name===name))people.push({id:'external-'+people.length,name,active:false});
  const outsider={staffId:'online-only',name:'Online-only synthetic teacher',timetableName:'Online-only synthetic teacher',cells:blank(periods)};outsider.cells[0]=['PD','','Staff room',''];teachers.push(outsider);people.push({id:outsider.staffId,name:outsider.name,active:true});
  const day={date:payload.selectedDate,id:'different-online-baseline',parity:payload.selectedSheet.startsWith('Odd')?'odd':'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]},base=S.create(day),before=JSON.stringify(base),options={people,workbook};
  if(historicalComparison){const oldBox=vm.createContext({});vm.runInContext(oldSource,oldBox);assert.throws(()=>oldBox.GSISRosterStapler.importLegacy(clone(base),clone(payload),clone(options)),/saved absences or relief assignments/,'the supplied file reproduces the exact v0.7.18 failure');}
  const plan=S.importLegacy(base,payload,options),expected=oracle(payload,people,day);expected.set(outsider.staffId,outsider.cells);compareRows(plan,day,expected);assert.equal(JSON.stringify(base),before);
  const absent=payload.reliefAbsences.reduce((n,a)=>n+a.periods.length,0),covered=payload.reliefAbsences.reduce((n,a)=>n+Object.keys(a.assignments||{}).length,0);assert.equal(absent,17);assert.equal(covered,6);assert.equal(active(plan).filter(t=>t.teacherId!=='online-only').length,722,'supplied exemplar final populated cells');
  assert.equal(S.accounting(plan).reduce((n,t)=>n+t.reliefCount,0),0);assert.deepEqual(S.effectiveDay(S.importLegacy(plan,payload,options),day).teachers,S.effectiveDay(plan,day).teachers);
  persistWithBackend({day,people,plan},'supplied Offline JSON');console.log('PASS supplied file: all 722 final cells, 17 absent periods and 6 covered periods match the independent export oracle; online-only teacher retains baseline');
 }finally{window.close();}
}
synthetic();
if(process.argv[2])supplied(path.resolve(process.argv[2])).catch(e=>{console.error(e);process.exitCode=1;});
