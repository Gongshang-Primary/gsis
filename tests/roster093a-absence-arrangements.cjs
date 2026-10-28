'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),O=require('../shared/roster-operations.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){const f=fixture(),p={operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2,3],instructionsNA:true};const a={id:'preview',staffId:'alice',date:f.date,periods:[2,3],reliefRequired:true},l=O.previewAbsence(f.ctx,a)[0];const pick={period:2,recipientId:'bob',combination:false,lessonKey:l.lessonKey,expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0};return {...f,p,pick};}
{
 const f=setup(),before=JSON.stringify(f.state),r=O.read(f.state,f.ctx,{operation:'candidates',date:f.date,byPeriod:true,purpose:'mutual',includeTimetable:true,previewAbsence:{staffId:'alice',date:f.date,periods:[2,3],reliefRequired:true}});
 assert(r.previewDemands.length===2);assert(r.candidatesByPeriod[2].some(p=>p.staffId==='bob'&&p.available));assert(r.timetable.teachers.length);assert.equal(JSON.stringify(f.state),before,'preview creates no absence, request, audit or notification');
}
{
 const f=setup(),r=O.apply(f.state,f.ctx,{...f.p,ownArrangementsByStaffDate:{alice:{[f.date]:[f.pick]}}});assert.equal(f.state.absences.length,1);assert.equal(f.state.requests.length,1);assert.equal(r.savedIds.length,1);assert.equal(r.mutualRequestIds.length,1);assert.equal(f.state.requests[0].absenceId,r.savedIds[0]);assert.equal(f.state.requests[0].recipientId,'bob');assert(f.state.outbox.some(j=>j.kind==='mutual_request'));
}
{
 const f=setup(),plan=new Proxy({},{get:()=>{throw Error('unrelated archive must stay lazy');},ownKeys:()=>{throw Error('unrelated archive must stay lazy');}});f.state.staplerArchives.push({date:'2025-01-01',draft:plan});O.apply(f.state,f.ctx,{...f.p,ownArrangementsByStaffDate:{alice:{[f.date]:[f.pick]}}});assert.equal(f.state.staplerArchives[0].draft,plan,'atomic working state preserves immutable plan identity');
}
for(const kind of ['changedLesson','unavailable','wrongStaff','changedBaseline','changedCombination']){
 const f=setup(),pick=clone(f.pick);if(kind==='changedLesson')pick.lessonKey+='stale';if(kind==='unavailable')f.teachers[1].cells[2]=['EL','5A','room',''];if(kind==='changedBaseline')pick.expectedTimetableId='old';if(kind==='changedCombination'){pick.combination=true;pick.expectedRecipientCell=['EL','6A','room',''];f.teachers[1].cells[2]=['EL','5A','room',''];}const map={[kind==='wrongStaff'?'dora':'alice']:{[f.date]:[pick]}},before=JSON.stringify(f.state);
 assert.throws(()=>O.apply(f.state,f.ctx,{...f.p,ownArrangementsByStaffDate:map}),e=>[400,409].includes(e.status),kind);assert.equal(JSON.stringify(f.state),before,kind+' leaves no partial absence/request');
}
{
 const f=setup();f.ctx.days[f.date].staplerRevision=8;assert.doesNotThrow(()=>O.apply(f.state,f.ctx,{...f.p,ownArrangementsByStaffDate:{alice:{[f.date]:[f.pick]}}}),'unrelated suspended edits keep exact selected lesson valid');
}
{
 const f=setup(),before=JSON.stringify(f.state);assert.throws(()=>O.apply(f.state,f.ctx,{...f.p,instructionsByDate:{[f.date]:{[f.pick.lessonKey]:'Read page 2'}},expectedInstructionScopes:{[f.date]:{timetableId:'old',parity:'even',staplerRevision:0}}}),e=>e.status===409);assert.equal(JSON.stringify(f.state),before);
}
console.log('PASS read-only draft colleague preview, atomic absence+requests, stale source/candidate/combination rollback, unrelated suspended edit and instruction source guard');
{
 const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module'),load={require:createRequire(require.resolve('./roster096-absence-adapter.cjs')),console};vm.createContext(load);vm.runInContext(fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8').split('const reject=')[0]+';this.adapter=adapter;',load);
 const draft=h=>{const lesson=O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],reliefRequired:true})[0];return h.command('alice',{receiptOnly:true,ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',combination:false,lessonKey:lesson.lessonKey,expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0}]}}});};
 {
  const h=load.adapter(),p=draft(h);h.lose();assert.throws(()=>h.call(p),/Lost commit/);const receipt=h.call(p);assert.equal(receipt.accepted,true);assert.equal(receipt.replayed,true);assert.equal(receipt.savedIds.length,1);assert.equal(receipt.mutualRequestIds.length,1);assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,1);assert.equal(h.counts().writes,1);
 }
 {
  const h=load.adapter(),p=draft(h),bob=h.command('bob');h.beforeLock(()=>h.call(bob));assert.throws(()=>h.call(p),e=>e.status===409);assert.equal(h.state().absences.length,1,'concurrent colleague absence remains; draft batch rejected');assert.equal(h.state().absences[0].staffId,'bob');assert.equal(h.state().requests.length,0);assert.equal(h.counts().writes,1);
 }
 {
  const h=require('./roster701-adapter.cjs')();h.scope.rosterOperationsReadReconcile_=()=>{throw Error('preview must not reconcile durably');};const before=JSON.stringify(h.state());h.call({operation:'candidates',date:h.date,byPeriod:true,purpose:'mutual',includeTimetable:true,previewAbsence:{staffId:'alice',date:h.date,periods:[2],reliefRequired:true}});assert.equal(h.calls.writes,0);assert.equal(JSON.stringify(h.state()),before);
 }
 console.log('PASS durable draft arrangements: one receipt/commit, exact lost-ack replay, concurrent recipient absence rollback and zero-write candidate preview');
}
