'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const R=require('../shared/roster.js'),S=require('../shared/roster-stapler.js'),clone=x=>JSON.parse(JSON.stringify(x));
// Optional reference checkout for a reproducible before/after benchmark; correctness checks need only this repo.
const priorRoot=process.env.ROSTER_CELL_BEFORE_ROOT;
function harness({legacy=false,size=150}={}){
 const root=legacy?priorRoot:path.resolve(__dirname,'..'),date='2026-10-14',stats={register:0,model:0,quota:0,reads:0,writes:0,locks:0,reconcile:0,initialiseHistory:0,captureWeek:0,health:0,manualModel:0,teachingProfile:0};
 let clock=Date.parse(date+'T06:00:00+08:00'),locked=false,afterRead=()=>{};
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 const A=require(root+'/shared/roster-allocation.js'),trackedA={...A};for(const key of ['initialiseHistory','captureWeek','health','manualModel','teachingProfile'])trackedA[key]=(...args)=>{stats[key]++;return A[key](...args);};
 const domain=vm.createContext({module:{exports:{}},GSISRosterAllocation:trackedA,GSISRosterStapler:S,GSISRoster:R});vm.runInContext(fs.readFileSync(root+'/shared/roster-operations.js','utf8'),domain);const O=domain.module.exports;
 const people=Array.from({length:size},(_,i)=>({id:'teacher'+i,name:'Teacher '+i,active:true,mobile:String(90000000+i)}));
 const periods=Array.from({length:17},(_,period)=>{const startMinutes=420+30*period,endMinutes=startMinutes+30,fmt=n=>String(n/60|0).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return {period,startMinutes,endMinutes,start:fmt(startMinutes),end:fmt(endMinutes)};});
 const teachers=people.map((p,i)=>({staffId:p.id,name:p.name,R:4,cells:Array.from({length:17},(_,period)=>i<Math.min(size,15)&&period>=2&&period<=9?['EL','4A','C1-01','']:['','','',''])}));
 const entry={id:'baseline',name:'Published timetable',modelFile:'immutable-v1',from:'2026-01-01',to:'2026-12-31',priority:1};
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>i>=34&&i<51?t.cells[i-34].slice():['','','',''])}))};
 const model=R.validate({layoutMode:'odd-even',odd:clone(week),even:clone(week),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 // The signed Contacts directory includes teaching eligibility for every person.
 const contacts={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'teacher0'},rosterPeople:people.map(p=>({...p,adhocEligible:true})),rosterSMCIds:['teacher0']};
 let saved=O.initial();for(let i=0;i<Math.min(size,15);i++)saved.absences.push({id:'absence'+i,staffId:'teacher'+i,name:people[i].name,date,periods:[2,3,4,5,6,7,8,9],typeId:'mc',reliefRequired:true,noReliefSubjects:[],instructions:{}});
 const ctx={today:date,now:clock,iso:new Date(clock).toISOString(),minute:360,user:{staffId:'teacher0',email:'teacher@gsps.edu.sg',smc:true,admin:true},people,days:{[date]:{id:'baseline',parity:'even',schoolDay:true,verified:true,periods,teachers}},uuid:crypto.randomUUID,notificationsConfigured:false,adminRecipients:[],smcIds:['teacher0']};
 const scope=vm.createContext({Date:ClockDate,GSISRosterOperations:O,GSISRoster:R,GSISRosterAllocation:trackedA,GSISRosterStapler:S,CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},props_:()=>({getProperty:()=>null}),Utilities:{getUuid:crypto.randomUUID,formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?date:format==='HH'?'06':'00',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},LockService:{getScriptLock:()=>({})},deployLock_:()=>{stats.locks++;assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync(root+'/backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope,root);
 // Fixture quota is supplied directly; the matching lightweight source manifest has no published Deploy entry.
 scope.book_=()=>({getId:()=> 'fixture-deploy'});scope.index_=()=>({});scope.publishedEntry_=()=>null;scope.GSISRelief={model:'fixture'};
 scope.rosterIndex_=()=>{stats.register++;return {revision:1,entries:[entry]};};scope.rosterModel_=()=>{stats.model++;afterRead();return model;};scope.rosterOperationsQuota_=()=>{stats.quota++;return {from:'2026-01-01',to:'2026-12-31',rows:people.map(p=>({id:p.id,R:4})),formClasses:[],teachingGroups:[]};};
 scope.rosterOperationsState_=()=>{stats.reads++;return clone(saved);};scope.rosterOperationsCommit_=s=>{assert(locked);stats.writes++;saved=clone(s);};
 const reconcile=scope.rosterOperationsReconcile_;scope.rosterOperationsReconcile_=(...args)=>{stats.reconcile++;return reconcile(...args);};
 const input=p=>({date,calendarByDate:{[date]:{date,schoolDay:true,parity:'even'}},...p}),command=()=>{const ds=O.demand(ctx,saved,date).filter(d=>d.id==='absence0:2');return {operation:'setNoRelief',view:'allocation',compact:true,date,revision:saved.revision,requestId:crypto.randomUUID(),demandIds:ds.map(d=>d.id),expectedTimetableId:'baseline',expectedStaplerRevision:0,expectedParity:'even',expectedDemandSources:Object.fromEntries(ds.map(d=>[d.id,JSON.stringify([d.staffId,d.timetableId,d.period,d.subject,d.className,d.venue,d.groupName])]))};};
 return {date,ctx,O,A,scope,people,entry,model,contacts,stats,command,state:()=>clone(saved),setState:s=>saved=clone(s),setAfterRead:fn=>afterRead=fn,setClock:n=>clock=n,call:p=>scope.rosterOperationsDispatch_({identity:{email:'teacher@gsps.edu.sg'},input:input(p)},contacts)};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name);}
test('150-teacher single-cell save removes quota, full reconciliation, accounting and health projections',()=>{
 const before=priorRoot?harness({legacy:true}):null,after=harness(),old=before?before.call(before.command()):null,next=after.call(after.command());
 assert.equal(next.allocationPatch,true);assert.equal(next.baseRevision,0);assert.equal(next.revision,1);assert.equal(next.assignments.length,1);assert.equal(next.effectiveAssignments.length,1);assert.equal(next.effectiveAssignments[0].noRelief,true);
 for(const key of ['quota','reconcile','initialiseHistory','captureWeek','health','manualModel'])assert.equal(after.stats[key],0,key+' omitted');
 for(const key of ['register','model','reads','writes','locks'])assert.equal(after.stats[key],1,key+' retained');
 assert.equal(after.state().receipts.length,1);assert(after.state().audit.some(a=>a.operation==='noRelief'));assert.equal(after.state().entitlements.length,0);assert.equal(after.state().outbox.length,0);
 const report={teachers:150,demands:120,before:before?.stats||null,after:after.stats,responseBytes:{before:old?Buffer.byteLength(JSON.stringify(old)):null,after:Buffer.byteLength(JSON.stringify(next))}};
 // The current patch carries receipt/audit/source tokens. Keep it within one 4 KiB
 // envelope and independent of school size, rather than the obsolete 3,000-byte schema.
 assert(report.responseBytes.after<=4096,JSON.stringify(report));
 for(const field of ['timetable','allocationModel','health','exportContext'])assert.equal(next[field],undefined,field+' must not enter a cell patch');
 const larger=harness({size:300}),largerBytes=Buffer.byteLength(JSON.stringify(larger.call(larger.command())));
 assert(largerBytes<=4096&&Math.abs(largerBytes-report.responseBytes.after)<=128,'cell response must stay bounded when the directory doubles: '+largerBytes);
 report.responseBytes.at300Teachers=largerBytes;report.responseBytes.limit=4096;if(before)assert(report.responseBytes.after<report.responseBytes.before/20);console.log('MEASURED',JSON.stringify(report));
});
test('Lost acknowledgement replay and restoring Unassigned are idempotent zero-cost changes',()=>{
 const h=harness(),p=h.command(),saved=h.call(p),audit=h.state().audit.length,replay=h.call(p);assert.equal(replay.replayed,true);assert.equal(replay.allocationPatch,true);assert.equal(h.stats.writes,1);assert.equal(h.state().audit.length,audit);assert.deepEqual(clone(replay.assignments),clone(saved.assignments));
 const restore={...h.command(),noRelief:false};h.call(restore);assert.equal(h.state().assignments[0].status,'cancelled');assert.equal(h.stats.quota,0);assert.equal(h.state().audit.at(-1).decisionChanges[0].after.kind,'empty');assert.equal(h.state().manualDecisions[h.date+'|'+p.demandIds[0]].kind,'empty');
 assert.throws(()=>h.call({...p,noRelief:false}),e=>e.status===409);assert.equal(h.stats.writes,2);
});
test('Fresh authority, stale revision, changed baseline, parity, lesson and Stapler source fail before saving',()=>{
 for(const change of ['authority','revision','baseline','parity','lesson','stapler','missing-demand']){
  const h=harness(),p=h.command();if(change==='authority'){h.contacts.user.rosterSMC=false;h.contacts.user.rosterAdmin=false;}if(change==='revision')p.revision=99;if(change==='baseline')h.entry.id='new-baseline';if(change==='parity')p.calendarByDate={[h.date]:{date:h.date,schoolDay:true,parity:'odd'}};if(change==='lesson')h.model.even.blocks[0].cells[36][0]='MA';if(change==='stapler')p.expectedStaplerRevision=1;if(change==='missing-demand'){const s=h.state();s.absences[0].deletedAt=h.ctx.iso;h.setState(s);}
  assert.throws(()=>h.call(p),e=>[403,409].includes(e.status),change);assert.equal(h.stats.writes,0,change);
 }
});
test('Clock crossing a period start preserves authorised SMC editing and audit capture',()=>{
 for(const full of [false,true]){const h=harness(),p=h.command();if(full){const s=h.state();h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:p.demandIds,staffId:'teacher20'});h.setState(s);p.confirm=true;}h.setAfterRead(()=>h.setClock(Date.parse(h.date+'T08:00:00+08:00')));h.call(p);assert.equal(h.stats.writes,1);assert(h.state().audit.some(event=>event.decisionChanges?.length));assert.equal(h.state().manualDecisions[h.date+'|'+p.demandIds[0]].kind,'noRelief');}
});
test('Saved changes preserve published cover and capture a protected draft without notifying',()=>{
 const h=harness(),s=h.state(),p=h.command();h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:p.demandIds,staffId:'teacher20'});const a=s.assignments[0];a.status='published';a.publishedAt=h.ctx.iso;h.setState(s);for(const key in h.stats)h.stats[key]=0;
 const result=h.call({...p,confirm:true});assert.equal(result.allocationPatch,undefined);assert.equal(h.stats.quota,1);assert.equal(h.stats.reconcile,1);assert(h.stats.health>=1);const state=h.state();assert.equal(state.assignments[0].status,'published');assert.equal(state.publicationSnapshots.length,0);assert.equal(state.outbox.length,0);assert.equal(h.A.effectiveAssignments(state).find(a=>a.demandId===p.demandIds[0]).noRelief,true);assert(state.audit.some(a=>a.operation==='noRelief'));assert.equal(h.stats.writes,1);
});
test('Replay after later records or changed baseline returns a full current projection without another write',()=>{
 for(const change of ['revision','baseline']){const h=harness(),p=h.command();h.call(p);if(change==='revision'){const s=h.state();s.revision++;h.setState(s);}else h.entry.id='new-baseline';const replay=h.call(p);assert.equal(replay.replayed,true);assert.equal(replay.allocationPatch,undefined);assert.equal(h.stats.writes,1);}
});
console.log(passed+' cell-save backend checks passed');
module.exports={harness};
