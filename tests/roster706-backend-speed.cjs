'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),R=require('../shared/roster.js'),A=require('../shared/roster-allocation.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const f=fixture(),stats={register:0,model:0,quota:0,reads:0,writes:0,locks:0},cache=new Map();
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.ctx.now]));}static now(){return f.ctx.now;}};
 const entry={id:'baseline',name:'Published timetable',modelFile:'immutable-v1',from:'2026-01-01',to:'2026-12-31',priority:1};
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>i>=34&&i<51?t.cells[i-34].slice():['','','',''])}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[{level:4,period:6}]});
 // The signed Contacts directory includes teaching eligibility for every person.
 const contacts={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people.map(p=>({...p,adhocEligible:true})),rosterSMCIds:['alice']};
 let saved=clone(f.state),locked=false;
 const scope=vm.createContext({Date:ClockDate,GSISRosterOperations:f.O,GSISRoster:R,GSISRosterAllocation:A,
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},props_:()=>({getProperty:()=>null}),
  Utilities:{getUuid:crypto.randomUUID,formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'06':'00',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
  LockService:{getScriptLock:()=>({})},deployLock_:()=>{stats.locks++;assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope);
 scope.rosterIndex_=()=>{stats.register++;return {revision:1,entries:[entry]};};scope.rosterModel_=()=>{stats.model++;return model;};
 scope.rosterOperationsQuota_=()=>{stats.quota++;return {from:'2026-01-01',to:'2026-12-31',rows:f.people.map(p=>({id:p.id,R:4})),formClasses:[{id:'deploy4A',name:'4A',level:4,venue:'D1-01'},{id:'phantom',name:'6Gt',level:6,venue:'D6-01'}],teachingGroups:[]};};
 scope.rosterOperationsState_=()=>{stats.reads++;return clone(saved);};scope.rosterOperationsCommit_=s=>{assert(locked);stats.writes++;saved=clone(s);};
 const input=p=>({date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'even'}},...p});
 return {...f,entry,model,contacts,stats,scope,input,state:()=>clone(saved),setState:s=>saved=clone(s),call:p=>scope.rosterOperationsDispatch_({identity:{email:'alice@gsps.edu.sg'},input:input(p)},contacts),context:p=>scope.rosterOperationsContext_({identity:{email:'alice@gsps.edu.sg'},input:input(p)},contacts,saved)};
}
{
 const h=harness();
 const state=h.state();state.assignments.push({id:'stale',date:h.date,timetableId:'deleted-baseline',status:'draft',staffId:'bob',absentId:'alice'});h.setState(state);
 for(const view of ['mine','notificationReadiness']){const before=JSON.stringify(h.state()),result=h.call({operation:'read',view});assert.equal(result.revision,0);assert.equal(JSON.stringify(h.state()),before,'record-only reads never reconcile/write');}
 for(const key of ['register','model','quota','writes','locks'])assert.equal(h.stats[key],0,key+' omitted for saved list/readiness');
 h.contacts.user.rosterSMC=false;assert(h.call({operation:'read',view:'notificationReadiness'}).notifications,'Admin-only readiness remains available');h.contacts.user.rosterAdmin=false;const reads=h.stats.reads;assert.throws(()=>h.call({operation:'read',view:'notificationReadiness'}),e=>e.status===403);assert.equal(h.stats.reads,reads,'ordinary staff denied before operational state access');
 h.contacts.user.rosterSMC=true;h.call({operation:'read',view:'duties'});assert.equal(h.stats.register,1,'duties retain fresh timetable registration checks');
}
{
 const h=harness(),full=h.context({operation:'read',view:'report'}),compact=h.context({operation:'read',view:'report',compact:true});
 assert.equal(full.days[h.date].teachers.length,4);assert.equal(compact.days[h.date].teachers.length,1);assert.equal(compact.days[h.date].teachers[0].staffId,'alice');
 assert.equal(compact.days[h.date].teacherIdentities.length,4);assert.equal(compact.days[h.date].teachers[0].timetableName,'Alice');assert.equal(compact.days[h.date].modelReference.id,'baseline');assert.equal(h.stats.quota,0);
 h.contacts.user.rosterSMC=false;h.contacts.user.rosterAdmin=false;assert.equal(h.context({operation:'read',view:'entry',compact:true,staffId:'bob'}).days[h.date].teachers[0].staffId,'alice','client cannot pick colleague as compact target');
 h.contacts.user.rosterSMC=true;assert.equal(h.context({operation:'read',view:'entry',compact:true,staffId:'bob'}).days[h.date].teachers[0].staffId,'bob');
 h.contacts.rosterPeople.push({id:'collision',name:'Mr Alice',active:true});assert(!h.context({operation:'read',view:'entry',compact:true}).days[h.date].teacherIdentities.some(t=>t.staffId==='alice'),'ambiguous name must not become cached staff identity');
 const writes=h.stats.writes;h.call({operation:'read',view:'report',compact:true});assert.equal(h.stats.writes,writes,'compact display does not reconcile partial day');
 const writeContext=h.context({operation:'saveAbsence',view:'report',compact:true,staffId:'alice',dates:[h.date]});assert.equal(writeContext.days[h.date].teachers.length,3,'write ignores compact narrowing and builds all uniquely matched rows');
}
{
 const h=harness(),week=h.model.odd;week.blocks[0].cells[0]=['Form','1P','C1-01',''];week.blocks[0].cells[1]=['EL','2P; 1Gt,2Gt','C2-01',''];week.blocks[1].cells[0]=['MTL','1P/2P','Special room','CL1'];week.blocks[1].cells[1]=['Duty','P1; CL1; 4CL1; hall','',''];
 const known=[{id:'deploy1P',name:'1P',level:1,venue:'Published venue'},{id:'phantom',name:'6Gt',level:6,venue:'Never'}];
 const rows=clone(h.scope.rosterOperationsFormClasses_(h.entry,h.model,known));assert(rows.some(c=>c.id==='deploy1P'&&c.name==='1P'&&c.venue==='Published venue'));assert(rows.some(c=>c.name==='1Gt'&&c.suffix==='Gt'));assert(rows.some(c=>c.name==='2Gt'));assert(!rows.some(c=>['6Gt','P1','CL1','4CL1','hall'].includes(c.name)));assert.equal(rows.filter(c=>c.name==='1P').length,1);assert.equal(rows.find(c=>c.name==='1P').timetableClassId,'tt:1p');
 const repeat=clone(h.scope.rosterOperationsFormClasses_(h.entry,h.model,[]));assert.equal(repeat.find(c=>c.name==='1P').timetableClassId,'tt:1p');assert.equal(repeat.find(c=>c.name==='1P').venue,'C1-01','cached class catalogue does not retain mutable Deploy venue');
}
{
 const h=harness(),p={operation:'saveRecessSettings',view:'recess',baseName:'Haze Recess',date:h.date,revision:0,requestId:crypto.randomUUID()};
 const first=h.call(p);assert.equal(first.settings.baseName,'Haze Recess');assert.equal(first.revision,1);assert.equal(h.stats.writes,1);
 const repeat=h.call(p);assert.equal(repeat.replayed,true);assert.equal(h.stats.writes,1,'exact retry uses durable receipt');
 assert.throws(()=>h.call({...p,baseName:'Changed'}),e=>e.status===409,'request ID cannot change intent');
 for(const key of ['register','model','quota'])assert.equal(h.stats[key],0,'setting save and replay omit '+key);
 assert.equal(h.state().receipts.length,1);
}
{
 const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost(e){'),end=source.indexOf('\nfunction auth_',start),calls=[];
 const scope=vm.createContext({GSIS_DEPLOY_VERSION:'test',GSISSheets:{resetStats(){}},Utilities:{getUuid:crypto.randomUUID},PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==="GSIS_SECRET"?'x'.repeat(40):null})},rosterDiagnostic_(){},rosterStage_(){},props_:()=>({getProperty:()=> 'x'.repeat(40)}),same_:()=>true,signature_:()=> 'signed',out_:x=>x,error_:(status,message)=>{throw Object.assign(Error(message),{status});},contacts_:(identity,authorityOnly,action,input)=>{calls.push(input);return {user:{rosterSMC:true,rosterAdmin:true}};},rosterDispatch_:()=>({user:{smc:true}})});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/ApiSecret.gs','utf8'),scope);require('./helpers/load-roster-diagnostic-build.cjs')(scope);vm.runInContext(source.slice(start,end),scope);
 for(const action of ['rosterProfile','rosterOperations']){const payload=JSON.stringify({action,input:{},identity:{email:'teacher@gsps.edu.sg',subject:'teacher'},timestamp:Date.now(),nonce:crypto.randomUUID()});const response=scope.doPost({postData:{contents:JSON.stringify({payload,signature:'signed'})}});assert.equal(response.ok,true,JSON.stringify(response));}
 assert.equal(calls[0].rosterDirectory,false,'profile never asks for unused staff directory');assert.equal(calls[1].rosterDirectory,true,'operational identity matching retains directory');assert(calls.every(c=>c.rosterAuthority===true&&c.authorityOnly===true),'authority remains fresh and verified');
}
// A normal absence write must not cancel unrelated recess cover when it omits R/Deploy enrichment.
{
 const h=harness(),state=h.state();state.accountingYears['2026']={verified:true};h.setState(state);
 const activation=h.call({operation:'saveRecess',view:'recess',dates:[h.date],levels:[4],revision:0,requestId:crypto.randomUUID()}),demand=activation.demands.find(d=>d.recessActivationId);
 const assigned=h.call({operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id],revision:1,requestId:crypto.randomUUID()}),before=h.state().assignments.find(a=>a.recessActivationId);
 assert.equal(before.venue,'D1-01','recess save uses authoritative current Deploy venue');
 const quotaReads=h.stats.quota;
 h.call({operation:'saveAbsence',view:'report',compact:true,date:h.date,staffId:'alice',typeId:'mc',periods:[2],revision:assigned.revision,requestId:crypto.randomUUID()});
 const after=h.state().assignments.find(a=>a.id===before.id);assert.equal(after.status,before.status,'unrelated absence does not cancel recess cover');assert.equal(after.sourceKey,before.sourceKey,'omitted Deploy venue does not rewrite assignment source');assert.equal(h.stats.quota,quotaReads,'ordinary absence save still omits quota');
 h.call({operation:'saveAbsence',view:'report',compact:true,date:h.date,staffId:'bob',typeId:'mc',periods:[6],revision:h.state().revision,requestId:crypto.randomUUID()});const invalid=h.state().assignments.find(a=>a.id===before.id);assert.equal(invalid.status,'draft');assert(invalid.invalidCover&&invalid.protected);assert(!A.effectiveAssignments(h.state()).some(a=>a.id===before.id),'a real covering-teacher absence invalidates cover while preserving the SMC choice');
}
// Opt-in save preparation remains compatible; new clients omit it and get the receipt directly.
{
 const h=harness(),response={savedId:'saved'};h.scope.rosterOperationsQuota_=()=>{throw Error('Optional planning must not run');};assert.equal(h.scope.rosterOperationsSavedCandidates_(response,h.state(),h.ctx,{operation:'saveAbsence'},{savedIds:['saved']}),response);
}
console.log('PASS v0.7.06 backend: record-only mine/readiness, privileged access, compact verified identity, full save context, actual class catalogue and immediate optional-free save acknowledgement.');
