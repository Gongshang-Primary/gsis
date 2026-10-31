'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function setup(){
 const h=adapter(),next='2026-10-15';h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.minute=360;h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];h.ctx.days[next]=copy(h.ctx.days[h.date]);
 const state=h.state();state.accountingYears['2026']={verified:true};h.O.apply(state,h.ctx,{operation:'saveAbsence',date:next,staffId:'alice',typeId:'mc',periods:[3]});const demand=h.O.demand(h.ctx,state,next)[0];h.O.apply(state,h.ctx,{operation:'assign',date:next,staffId:'bob',demandIds:[demand.id]});h.people.find(person=>person.id==='bob').active=false;state.outbox.push({id:'prior-uncertain',kind:'stapler_timetable',date:next,recipientId:'bob',mobile:'6592345678',status:'uncertain',error:'Provider outcome unknown',claimId:'prior-claim',data:{},attempts:1,attemptHistory:[{number:1,claimId:'prior-claim',state:'uncertain'}]});h.setState(state);
 const originalContext=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=(...args)=>{const ctx=originalContext(...args);return {...ctx,days:copy(ctx.days)};};
 vm.runInContext(fs.readFileSync('backend/RosterAbsencePipeline.gs','utf8'),h.scope);let pending=null,intakeLocked=false,race=false;const checked=[];
 const scriptLock=h.scope.LockService.getScriptLock,lock=h.scope.deployLock_,unlock=h.scope.deployUnlock_;h.scope.LockService.getScriptLock=()=>({...scriptLock(),kind:'script'});h.scope.LockService.getUserLock=()=>({kind:'intake'});h.scope.deployLock_=value=>{if(value.kind!=='intake')return lock(value);assert(!intakeLocked);intakeLocked=true;return true;};h.scope.deployUnlock_=value=>{if(value.kind!=='intake')return unlock(value);assert(intakeLocked);intakeLocked=false;};
 h.scope.rosterAbsenceIntakePending_=dates=>{checked.push({dates:dates?.slice(),intakeLocked});const blocked=!!pending&&(!dates||dates.includes(next));return {pendingCaptureCount:blocked&&pending==='absence'?1:0,pendingPeerCount:blocked&&pending==='peer'?1:0,blockedDates:blocked&&pending==='absence'?[next]:[],peerBlockedDates:blocked&&pending==='peer'?[next]:[]};};
 h.scope.rosterTimetableBatchCommitBegin_=()=>{if(race)pending='peer';return null;};
 const current=()=>h.state().assignments.find(row=>row.id===state.assignments[0].id),replacements=()=>A.effectiveAssignments(h.state()).filter(row=>row.demandId===demand.id&&row.staffId!=='bob');
 return {...h,next,demand,current,replacements,checked,pending:value=>{pending=value;},race:()=>{race=true;}};
}
for(const kind of ['absence','peer']){
 const h=setup(),uncertain=h.state().outbox.find(row=>row.id==='prior-uncertain');h.pending(kind);h.call({operation:'read',view:'mine',date:h.date});assert.equal(h.current().status,'cancelled','inactive duty retires despite pending '+kind);assert.equal(h.current().inactiveReplacementPending,true);assert.deepEqual(h.state().outbox.find(row=>row.id==='prior-uncertain'),uncertain,'uncertain delivery remains unchanged');assert.equal(h.replacements().length,0,'pending '+kind+' defers future replacement');
 h.pending(null);h.call({operation:'read',view:'mine',date:h.date});assert.equal(h.replacements().length,1,'replacement resumes after pending '+kind+' settles');
}
{
 const h=setup();h.pending('peer');const before=h.state();h.call({operation:'saveAdhoc',date:h.date,staffId:'dora',periods:[4],revision:before.revision,requestId:crypto.randomUUID()});assert.equal(h.current().status,'cancelled');assert.equal(h.replacements().length,0);assert(h.state().adhoc.some(row=>row.staffId==='dora'),'unrelated valid mutation still commits');
}
for(const operation of ['read','saveAdhoc','autoAllocate']){
 const h=setup(),before=h.state();h.race();const input=operation==='read'?{operation:'read',view:'mine',date:h.date}:{operation,date:h.date,staffId:'dora',periods:[4],revision:before.revision,requestId:crypto.randomUUID()};
 assert.throws(()=>h.call(input),error=>error.code==='ABSENCE_INTAKE_PENDING','new future peer capture fences stale '+operation+' replacement');assert.deepEqual(h.state(),before,'no stale replacement or partial mutation commits');assert(h.checked.some(row=>row.intakeLocked&&row.dates.includes(h.next)),'final fence covers the future repair date');
}
// A scheduled tick must protect repairs outside the tick's own date too.
for(const race of [false,true]){
 const h=setup();h.ctx.now=Date.parse(h.date+'T08:00:00+08:00');h.ctx.minute=480;h.ctx.iso=new Date(h.ctx.now).toISOString();const before=h.state();if(race)h.race();else h.pending('absence');
 const run=()=>h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});
 if(race){assert.throws(run,error=>error.code==='ABSENCE_INTAKE_PENDING');assert.deepEqual(h.state(),before);}
 else{run();assert.equal(h.current().status,'cancelled');assert.equal(h.current().inactiveReplacementPending,true);assert.equal(h.replacements().length,0);}
}
// Private peer replies also reconcile unrelated future duties.
for(const race of [false,true]){
 const h=setup(),state=h.state();h.people.find(person=>person.id==='bob').active=true;
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2]});const demand=h.O.demand(h.ctx,state,h.date)[0];
 h.O.apply(state,h.ctx,{operation:'requestMutual',date:h.date,absenceId:demand.absenceId,requests:[{recipientId:'dora',demandIds:[demand.id]}]});
 h.people.find(person=>person.id==='bob').active=false;h.setState(state);const before=h.state();if(race)h.race();else h.pending('peer');
 const command={input:{operation:'externalRespond',decision:'reject',reason:'Cannot cover',capability:{purpose:'mutual',staffId:'dora',date:h.date,requestId:state.requests[0].id,expiresAt:Date.parse(h.date+'T12:00:00+08:00')}}};
 if(race){assert.throws(()=>h.scope.rosterServiceDispatch_(command),error=>error.code==='ABSENCE_INTAKE_PENDING');assert.deepEqual(h.state(),before);}
 else{h.scope.rosterServiceDispatch_(command);assert.equal(h.current().status,'cancelled');assert.equal(h.replacements().length,0);assert.equal(h.state().requests[0].status,'rejected');}
}
console.log('PASS Google inactive repair: pending future attendance/peer defers replacement, retirement continues, and final capture races reject stale writes.');
