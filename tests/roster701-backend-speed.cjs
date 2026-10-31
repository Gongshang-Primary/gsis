'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const R=require('../shared/roster.js'),A=require('../shared/roster-allocation.js'),fixture=require('./roster701-fixture.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const blob=value=>{const bytes=Buffer.isBuffer(value)?value:typeof value==='string'?Buffer.from(value):Buffer.from(value||[]);return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString()};};

// A cache holds immutable uploaded content, never authority, active selection or
// the mutable operations document. Every read returns an independent object.
{
 const cache=new Map(),date='2026-10-14',cells=()=>Array.from({length:85},()=>['','','','']);
 const cards=[['EL','4A','C1',''],['CL','2A;2B','C2','CL1'],['ML','P3 A, P3 B','C3','ML2'],['EL','4A/5A','C4','Support'],['PD','4A','C5','Ignore'],['EL','6A','C6','whole class'],['EL','1A','C7','EL'],['TL','','C8','TL2'],['SC','3A\n3B','C9','Support']];
 const blocks=Array.from({length:80},(_,n)=>{const value=cells();cards.forEach((c,i)=>value[i]=c);return {name:'Teacher '+n,cells:value};});
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[{level:2,period:4}]}),entry={id:'a'.repeat(36),modelFile:'model-v1',from:'2026-01-01',to:'2026-12-31',priority:1};
 let modelReads=0,registerReads=0;
 const scope=vm.createContext({GSISRoster:R,GSIS_DEPLOY_VERSION:'0.7.01',Intl,Utilities:{newBlob:blob,base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')],gzip:v=>blob(zlib.gzipSync(Buffer.from(v.getBytes()))),ungzip:v=>blob(zlib.gunzipSync(Buffer.from(v.getBytes())))},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value)})},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),scope);
 vm.runInContext(fs.readFileSync('roster-update/public/roster-export.js','utf8'),scope);
 scope.rosterIndex_=()=>{registerReads++;return {revision:1,entries:[entry]};};
 scope.rosterReadFile_=()=>{modelReads++;return JSON.stringify(model);};
 const call=(input={},smc=false)=>scope.rosterDispatch_({action:'rosterRead',identity:{email:'teacher@gsps.edu.sg'},input:{date,...input}},{user:{rosterSMC:smc}});
 const full=call(),bytes=JSON.stringify(full).length;
 full.model.odd.blocks[0].cells[0][0]='MUTATED';assert.equal(call().model.odd.blocks[0].cells[0][0],'EL');assert.equal(modelReads,1,'warm immutable models avoid a second Drive read');
 const names=call({view:'names'});assert.equal(names.model,undefined);for(const type of ['teacher','class','tg'])assert.deepEqual(clone(names.names[type]),clone(scope.RosterExport.names(model,type)),'picker identity matches '+type+' export names');
 assert.equal(modelReads,1);assert(JSON.stringify(names).length<bytes/20,'names picker omits school-wide timetable cells');
 scope.rosterModel_=()=>{throw Error('Warm metadata must not load even a cached full model');};assert.equal(call({view:'names'}).names.teacher.length,80);
 assert.throws(()=>call({view:'names',id:'historic'}),e=>e.status===403,'metadata never bypasses date or role checks');
 assert.equal(registerReads,5,'every request still checks fresh register validity');
 console.log(JSON.stringify({check:'immutable models and names',fullBytes:bytes,namesBytes:JSON.stringify(names).length,modelDriveReads:modelReads,registerReads}));
}

// Personal absence management reads durable records without a school model,
// published quota calculation or incidental allocation projection.
{
 const {O,state,ctx,date}=fixture();state.absences.push({id:'own',staffId:'alice',name:'Alice',date,periods:[2],deletedAt:null},{id:'other',staffId:'bob',name:'Bob',date,periods:[3]});ctx.people.push({id:'inactive',name:'Inactive',active:false,mobile:'80000000'});
 // Reconciliation refreshes its server clock; keep this fixture before P2 starts.
 const BackendDate=class extends Date{static now(){return Date.parse(date+'T06:00:00+08:00');}};
 const scope=vm.createContext({Date:BackendDate,GSISRosterOperations:O,GSISRoster:R,Utilities:{formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?date:format==='HH'?'08':'00',getUuid:()=> 'uuid'},rosterIndex_:()=>({entries:[]}),rosterModel_:()=>{throw Error('A list view must not read a timetable');},book_:()=>{throw Error('A list view must not read Deploy quotas');}});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope);
 for(const input of [{operation:'read',view:'mine'},{operation:'read',view:'prune'},{operation:'audit'},{operation:'accounting'}]){
  const context=scope.rosterOperationsContext_({identity:{email:'alice@gsps.edu.sg'},input:{date,...input}},{user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:ctx.people},state);assert.equal(Object.keys(context.days).length,0);
  if(input.view==='mine'){const value=O.read(state,context,{date,...input});assert.deepEqual(value.ownAbsences.map(a=>a.id),['own']);assert.equal(value.timetable,null);assert.equal(value.demands.length,0);assert.equal(value.absences[0].editable,true);assert.equal(value.revision,state.revision);}
 }
 assert.equal(scope.rosterOperationsNeedsQuota_({operation:'read',view:'entry'}),false,'entry display does not calculate quota; candidate and mutation paths validate it separately');
 const teacherView=O.view(state,{...ctx,user:{...ctx.user,smc:false,admin:false}},{date,view:'mine'});assert(!teacherView.people.some(p=>p.id==='inactive'),'personal list does not disclose inactive directory entries');
 state.adhoc.push({id:'active-today',staffId:'inactive',date,periods:[2]});assert(!O.view(state,{...ctx,user:{...ctx.user,smc:false,admin:false}},{date,view:'mine'}).people.some(p=>p.id==='inactive'),'daily activation cannot bypass Contacts inactivity');
 // An omitted day is unknown, never an assertion that all lessons vanished.
 const live=fixture();live.ctx.minute=360;live.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];
 O.apply(live.state,live.ctx,{operation:'saveAbsence',staffId:'alice',typeId:'mc',date,periods:[2]});
 const demand=O.demand(live.ctx,live.state,date)[0];O.apply(live.state,live.ctx,{operation:'assign',staffId:'bob',date,demandIds:[demand.id]});
 const assignment=live.state.assignments[0],light={...live.ctx,days:{}};
 assert.equal(scope.rosterOperationsReconcile_(live.state,light),false);assert.equal(assignment.status,'draft','missing day metadata preserves committed cover');
 live.state.absences[0].deletedAt=live.ctx.iso;assert.equal(scope.rosterOperationsReconcile_(live.state,light),true);assert.equal(assignment.status,'draft','SMC decision remains available for review');assert(assignment.invalidCover&&assignment.protected);assert(!A.effectiveAssignments(live.state).some(row=>row.id===assignment.id),'deleted absence no longer provides valid cover');
 const current=fixture();current.ctx.minute=360;O.apply(current.state,current.ctx,{operation:'saveAbsence',staffId:'alice',typeId:'mc',date,periods:[2]});const dem=O.demand(current.ctx,current.state,date)[0];O.apply(current.state,current.ctx,{operation:'assign',staffId:'bob',date,demandIds:[dem.id]});
 scope.rosterOperationsReconcile_(current.state,{...current.ctx,days:{},timetableEntries:[{id:'replacement',from:'2026-01-01',to:'2026-12-31'}]});assert.equal(current.state.assignments[0].status,'draft');assert(current.state.assignments[0].invalidCover&&current.state.assignments[0].protected);assert.equal(A.effectiveAssignments(current.state).length,0,'fresh register replacement invalidates coverage while retaining SMC choice');
 const omitted=fixture();omitted.ctx.minute=360;O.apply(omitted.state,omitted.ctx,{operation:'saveAbsence',staffId:'alice',typeId:'mc',date,periods:[2]});const vacancy=O.demand(omitted.ctx,omitted.state,date)[0];O.apply(omitted.state,omitted.ctx,{operation:'assign',staffId:'bob',date,demandIds:[vacancy.id]});
 const missingQuota={...omitted.ctx,quotaRequested:false,days:clone(omitted.ctx.days)};missingQuota.days[date].teachers.forEach(t=>t.R=null);const before=JSON.stringify(omitted.state);
 assert.equal(O.reconcile(omitted.state,missingQuota),false,'intentionally omitted quota cannot generate a workload review');assert.equal(JSON.stringify(omitted.state),before,'light read cannot churn audit/revision data from absent quota inputs');
 assert.equal(O.reconcile(omitted.state,{...missingQuota,quotaRequested:true}),true,'a full planning context still records genuinely unavailable R');assert.match(omitted.state.assignments[0].workloadReview,/R is unverified/);assert.doesNotMatch(omitted.state.assignments[0].workloadReview,/Weekly R quota exceeded/,'unknown R remains unknown rather than being coerced to zero');
 omitted.state.absences.push({id:'new-absence',staffId:'bob',date,periods:[2],reliefRequired:true});O.reconcile(omitted.state,missingQuota);assert.equal(omitted.state.assignments[0].status,'draft');assert(omitted.state.assignments[0].invalidCover&&omitted.state.assignments[0].protected);assert.equal(A.effectiveAssignments(omitted.state).length,0,'omitted quota does not bypass real absence conflict');
 console.log('Personal list, audit and accounting contexts: zero timetable and quota reads.');
}

// Compute the same eligibility from one immutable snapshot per query, rather
// than rebuilding every teacher's annual balance once per person or period.
{
 const {O,state,ctx,date,blank}=fixture();for(let n=0;n<40;n++){ctx.people.push({id:'extra'+n,name:'Teacher '+n,active:true,mobile:String(80000000+n)});ctx.days[date].teachers.push({staffId:'extra'+n,name:'Teacher '+n,cells:blank(),R:4});}
 state.absences.push({id:'absence',staffId:'alice',name:'Alice',date,periods:[2,3],reliefRequired:true});
 const demands=O.demand(ctx,state,date),ids=demands.map(d=>d.id),people=ctx.people.filter(p=>p.id!=='alice'),expected=people.map(p=>O.availability(state,ctx,p.id,date,[2,3],ids)).sort((a,b)=>Number(b.available)-Number(a.available)||Number(b.external)-Number(a.external)||a.assigned-b.assigned||a.consecutive-b.consecutive||a.name.localeCompare(b.name));
 const old=A.teacherContext;let count=0;A.teacherContext=(...args)=>{count++;return old(...args);};
 try{const actual=O.candidates(state,ctx,ids);assert.deepEqual(actual,expected);assert.equal(count,1,'candidate query builds the school context once');count=0;
  const selected=['bob','charlie'],expectedPeriods=ctx.days[date].periods.map(p=>selected.filter(id=>O.availability(state,ctx,id,date,[p.period]).available));count=0;
  const result=O.read(state,ctx,{operation:'availability',date,staffIds:selected});assert.deepEqual(result.periods.map(p=>p.available.map(x=>x.id)),expectedPeriods);assert.equal(count,1,'all availability periods share one teacher context');count=0;
  O.read(state,ctx,{operation:'availability',date,staffIds:[]});assert.equal(count,0,'an empty selection does no eligibility work');
 }finally{A.teacherContext=old;}
 const oldManual=A.manualModel;let models=0;A.manualModel=(...args)=>{models++;return oldManual(...args);};try{O.read(state,ctx,{operation:'allocation',date});assert.equal(models,1,'one allocation projection per read');}finally{A.manualModel=oldManual;}
 console.log(JSON.stringify({check:'eligibility batching',people:ctx.people.length,periods:ctx.days[date].periods.length,candidateTeacherContexts:1,availabilityTeacherContexts:1,allocationModels:models}));
}
