'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),R=require('../shared/roster.js'),A=require('../shared/roster-allocation.js'),S=require('../shared/roster-stapler.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let passed=0;
const test=(name,run)=>{run();passed++;console.log('PASS',name);};

function harness(){
 const f=fixture(),stats={reads:0,writes:0,locks:0,quota:0,contacts:0},contacts={user:{rosterSMC:false,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people,rosterSMCIds:['bob'],rosterAdminIds:['alice']};
 let saved=clone(f.state),locked=false,creation=null;
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.ctx.now]));}static now(){return f.ctx.now;}};
 const scope=vm.createContext({Date:ClockDate,GSISRosterOperations:f.O,GSISRoster:R,GSISRosterAllocation:A,GSISRosterStapler:S,
  props_:()=>({getProperty:key=>key==='ROSTER_NOTIFICATION_ADMIN_IDS'?'alice':null}),
  Utilities:{getUuid:crypto.randomUUID,formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'08':'00',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]},
  LockService:{getScriptLock:()=>({})},deployLock_:()=>{stats.locks++;assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  contacts_:(identity,authorityOnly,action,input)=>{stats.contacts++;creation={identity,authorityOnly,action,input};return {saved:true,person:{id:'external',name:input.name,active:false}};}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync(__dirname+'/../backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope);
 scope.rosterOperationsState_=()=>{stats.reads++;return clone(saved);};scope.rosterOperationsCommit_=state=>{assert(locked);stats.writes++;saved=clone(state);};
 scope.rosterServiceContacts_=()=>({identity:{email:'service'},c:contacts});
 scope.rosterIndex_=()=>{throw Error('Record-only operation unexpectedly loaded timetable register');};
 scope.rosterModel_=()=>{throw Error('Record-only operation unexpectedly loaded timetable model');};
 scope.rosterOperationsQuota_=()=>{stats.quota++;return {from:'2026-01-01',to:'2026-12-31',rows:f.people.map(p=>({id:p.id,R:4})),subjectCategories:{},teachingGroups:[]};};
 const request=input=>({identity:{email:'alice@gsps.edu.sg'},input:{date:f.date,...input}});
 return {...f,scope,contacts,stats,state:()=>clone(saved),creation:()=>clone(creation),call:input=>scope.rosterOperationsDispatch_(request(input),contacts),context:input=>scope.rosterOperationsContext_(request(input),contacts,saved)};
}

test('Admin without SMC reads notification readiness through both backend guards',()=>{
 const h=harness(),context=h.context({operation:'read',view:'notificationReadiness'});
 assert.equal(context.user.admin,true);assert.equal(context.user.smc,false);
 const result=h.call({operation:'read',view:'notificationReadiness'});
 assert.equal(result.user.admin,true);assert.equal(result.user.smc,false);assert.equal(result.date,h.date);assert(result.notifications);assert.deepEqual(Array.from(result.notificationIssues),[]);
 assert.equal(h.stats.reads,1);assert.equal(h.stats.quota+h.stats.writes+h.stats.locks,0);
});

test('Ordinary teacher is denied readiness at dispatch and context boundaries before data reads',()=>{
 const h=harness();h.contacts.user.rosterAdmin=false;
 assert.throws(()=>h.context({operation:'read',view:'notificationReadiness'}),e=>e.status===403);
 assert.throws(()=>h.call({operation:'read',view:'notificationReadiness'}),e=>e.status===403);
 assert.equal(h.stats.reads+h.stats.quota+h.stats.writes+h.stats.locks,0);
});

test('Admin without SMC saves recess settings to the durable record and retries once',()=>{
 const h=harness(),command={operation:'saveRecessSettings',view:'recess',baseName:'Indoor Recess',revision:0,requestId:crypto.randomUUID()};
 const result=h.call(command);assert.equal(result.settings.baseName,'Indoor Recess');assert.equal(result.revision,1);assert.equal(h.state().recessSettings.baseName,'Indoor Recess');assert.equal(h.state().receipts.length,1);assert.equal(h.stats.writes,1);
 const retry=h.call(command);assert.equal(retry.replayed,true);assert.equal(h.stats.writes,1);assert.equal(h.stats.quota,0);
});

test('Ordinary teacher cannot save recess settings or reach a write lock',()=>{
 const h=harness();h.contacts.user.rosterAdmin=false;
 const command={operation:'saveRecessSettings',view:'recess',baseName:'Forbidden',revision:0,requestId:crypto.randomUUID()};
 assert.throws(()=>h.context(command),e=>e.status===403);assert.throws(()=>h.call(command),e=>e.status===403);
 assert.equal(h.stats.reads+h.stats.writes+h.stats.locks+h.stats.quota,0);assert.notEqual(h.state().recessSettings?.baseName,'Forbidden');
});

test('Admin without SMC completes contact creation and records its review notification',()=>{
 const h=harness(),command={operation:'contactCreate',name:'External Relief',mobile:'91234567',employment:'SRE',modifier:'',confirmDistinct:true,requestId:crypto.randomUUID()};
 const result=h.call(command);assert.equal(result.saved,true);assert.equal(result.person.name,'External Relief');assert.equal(result.notificationsQueued,1);
 assert.equal(h.stats.contacts,1);assert.equal(h.stats.writes,1);assert.equal(h.stats.locks,1);
 assert.equal(h.creation().identity.email,'alice@gsps.edu.sg');assert.equal(h.creation().action,'rosterContactCreate');assert.equal(h.creation().input.requestId,command.requestId);
 const jobs=h.state().outbox;assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'contact_review');assert.equal(jobs[0].recipientId,'alice');
});

test('Ordinary teacher cannot call the Contacts creation service',()=>{
 const h=harness();h.contacts.user.rosterAdmin=false;
 assert.throws(()=>h.call({operation:'contactCreate',name:'Forbidden',mobile:'91234567',requestId:crypto.randomUUID()}),e=>e.status===403);
 assert.equal(h.stats.contacts+h.stats.reads+h.stats.writes+h.stats.locks,0);
});

test('Admin optional saved-candidate projection supports another teacher’s absence; ordinary access does not',()=>{
 const h=harness(),state=h.state(),dd=clone(h.ctx.days[h.date]);dd.teachers.find(t=>t.staffId==='bob').cells[2]=['EL','4B','C1-02',''];
 state.absences.push({id:'saved-absence',staffId:'bob',name:'Bob',date:h.date,periods:[2],typeId:'mc',reliefRequired:true,noReliefSubjects:[],instructions:{}});
 const ctx={...h.ctx,user:{staffId:'alice',email:'alice@gsps.edu.sg',smc:false,admin:true},days:{[h.date]:dd},baselineDays:{[h.date]:dd},timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]};
 const command={operation:'saveAbsence',date:h.date,includeMutualCandidates:true},response={savedId:'saved-absence'},result={savedIds:['saved-absence']};
 const projected=h.scope.rosterOperationsSavedCandidates_(response,state,ctx,command,result);
 assert.equal(projected.mutualCandidates?.absenceId,'saved-absence');assert.equal(projected.mutualCandidatesUnavailable,undefined);
 assert(Array.isArray(projected.mutualCandidates.candidatesByPeriod[2]));assert(projected.mutualCandidates.candidatesByPeriod[2].some(p=>p.staffId==='charlie'&&p.available));assert.equal(h.stats.quota,1);
 const denied=h.scope.rosterOperationsSavedCandidates_(response,state,{...ctx,user:{...ctx.user,admin:false}},command,result);
 assert.equal(denied.mutualCandidates,null);assert.equal(denied.mutualCandidatesUnavailable,true);assert.equal(h.stats.quota,1,'deny foreign-absence projection before quota read');
 const own=h.scope.rosterOperationsSavedCandidates_(response,state,{...ctx,user:{...ctx.user,staffId:'bob',admin:false}},command,result);
 assert.equal(own.mutualCandidates?.absenceId,'saved-absence');assert.equal(own.mutualCandidatesUnavailable,undefined);assert.equal(h.stats.quota,2,'normal teachers retain the own-absence flow');
});

console.log(passed+' v0.7.11 backend authority checks passed');
