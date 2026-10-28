'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const O=require('../shared/roster-operations.js'),fixture=require('./roster701-fixture.cjs');
const load={require:createRequire(require.resolve('./roster096-absence-adapter.cjs')),console};vm.createContext(load);vm.runInContext(fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8').split('const reject=')[0]+';this.adapter=adapter;',load);
{
 const f=fixture(),before=JSON.stringify(f.state),view=O.read(f.state,{...f.ctx,days:{},user:{...f.ctx.user,smc:false,admin:false,staffId:'alice'}},{operation:'read',view:'reportForm'});
 assert.equal(view.schema,1);assert.equal(view.people.length,1);assert.equal(view.people[0].id,'alice');assert(view.types.length);assert(Array.isArray(view.noReliefSubjects));assert(Array.isArray(view.nameBridges));assert(Array.isArray(view.timetablePeople));assert.equal(view.timetable,undefined);assert.equal(view.absences,undefined);assert.equal(JSON.stringify(f.state),before,'metadata projection does not mutate operational facts');
}
{
 const h=load.adapter(),p=h.command('alice',{fullDay:true,periods:undefined,instructionsNA:true,receiptOnly:true,reliefRequired:false});h.ctx.days[h.date]={id:null,periods:[],teachers:[],verified:true,schoolDay:false};
 const saved=h.call(p);assert.equal(saved.accepted,true);assert.equal(saved.receiptOnly,true);assert.equal(saved.absences,undefined);assert.equal(saved.revision,1);assert.equal(h.state().absences[0].instructionsNA,true);assert.equal(h.state().absences[0].coverage.kind,'fullDay');assert.equal(h.state().absences[0].reliefRequired,false);
 h.scope.rosterOperationsContext_=()=>{throw Error('held timetable');};const replay=h.call(p);assert.equal(replay.accepted,true);assert.equal(replay.replayed,true);assert.deepEqual(Array.from(replay.savedIds),Array.from(saved.savedIds));assert.equal(h.counts().writes,1);assert.throws(()=>h.call({...p,remarks:'changed'}),e=>e.status===409);
 h.ctx.people.length=0;assert.throws(()=>h.call(p),e=>e.status===403||e.status===503,'revoked authority cannot receive accepted replay');
}
{
 const h=load.adapter(),p=h.command('alice',{receiptOnly:true});h.lose();assert.throws(()=>h.call(p),/Lost commit/);h.scope.rosterOperationsContext_=()=>{throw Error('held timetable');};assert.equal(h.call(p).accepted,true);assert.equal(h.counts().writes,1);
}
console.log('PASS fast Report Absence form metadata, explicit full-day N/A, durable receipt-only acceptance/replay, revoked authority, lost acknowledgment');
{
 const h=require('./roster701-adapter.cjs')(),scope=h.scope;vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);const source=fs.readFileSync('backend/Roster.gs','utf8');vm.runInContext(source.slice(source.indexOf('function rosterDispatch_')),scope);
 Object.assign(scope.Utilities,{formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'08':'00'});
 const held=()=>{throw Error('Held Calendar/register/model/quota/transport');};Object.assign(scope,{GSIS_DEPLOY_VERSION:'0.9.3a',rosterStage_:()=>{},rosterInput_:fn=>fn(),rosterToday_:()=>h.date,rosterIndex_:held,rosterModel_:held,rosterOperationsQuota_:held,rosterNotificationOverlay_:held,rosterOperationsReadReconcile_:held});
 const contacts={rosterPeople:h.people,user:{rosterStaffId:'alice',rosterSMC:false,rosterAdmin:false},rosterSMCIds:[]},identity={email:'alice@gsps.edu.sg'};
 const profile=scope.rosterDispatch_({action:'rosterProfile',identity,input:{view:'reportForm',preload:true}},contacts);assert.equal(profile.reportForm.schema,1);assert.equal(profile.user.accessVerified,true);assert.equal(profile.reportForm.people.length,1);assert.equal(h.calls.reads,1);assert.equal(h.calls.writes,0);
 const form=scope.rosterOperationsDispatch_({identity,input:{operation:'read',view:'reportForm',date:h.date}},contacts);assert.equal(form.schema,1);assert.equal(h.calls.reads,2);assert.equal(h.calls.writes,0);assert.equal(scope.rosterOperationsNeedsQuota_({operation:'saveAbsence',ownArrangementsByStaffDate:{}}),false);
 assert.throws(()=>scope.rosterDispatch_({action:'rosterProfile',identity,input:{view:'reportForm'}},{...contacts,user:{rosterStaffId:'alice'}}),e=>e.status===503);
 console.log('PASS real reportForm profile/read adapters: one primary read each; zero register/model/quota/transport/reconcile/writes with dependencies held');
}
{
 for(const coverage of [{kind:'fullDay'},{kind:'timeRange',startMinutes:480,endMinutes:510}]){
  const f=fixture();f.state.types.find(t=>t.id==='mc').allowedPeriods=[2,3];f.ctx.days[f.date]={id:null,periods:[],teachers:[],verified:true,schoolDay:false};const before=JSON.stringify(f.state);
  assert.throws(()=>O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',coverage,instructionsNA:true}),e=>e.status===409&&/timings/i.test(e.message),'restricted type requires real period timings');assert.equal(JSON.stringify(f.state),before,'unverifiable period restriction leaves no absence');
 }
 console.log('PASS missing period timings cannot bypass custom absence type period restrictions');
}
