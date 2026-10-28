const assert=require('node:assert/strict'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
const h=adapter(),command={operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2],typeId:'mc',revision:0,requestId:crypto.randomUUID(),view:'report'};
h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain response/);assert.equal(h.state().absences.length,1);assert.equal(h.locked(),false);
const retry=h.call(command);assert(retry.replayed);assert.equal(h.calls.writes,1);assert.equal(h.state().audit.length,1);assert.deepEqual(h.calls.contexts,['saveAbsence','saveAbsence']);
const first=h.state().absences[0],independent={...command,staffId:'bob',requestId:crypto.randomUUID(),periods:[3]},saved=h.call(independent);
assert(saved.savedId);assert.equal(h.state().absences.length,2);assert.deepEqual(h.state().absences.find(a=>a.id===first.id),first,'independent stale new report preserves the earlier absence');assert.equal(h.calls.writes,2);
const committed=h.state();assert(h.call(independent).replayed);assert(h.call(command).replayed);assert.deepEqual(h.state(),committed);assert.equal(h.calls.writes,2,'exact retries of both reports add no writes');
const before=h.calls.contexts.length;assert.throws(()=>h.call({...command,id:first.id,requestId:crypto.randomUUID(),periods:[3]}),/changed/);assert.equal(h.calls.contexts.length,before,'stale same-record edit is rejected before expensive context');assert.deepEqual(h.state(),committed);assert.equal(h.locked(),false);
console.log('PASS R10: exact uncertain replay, independent stale new reports preserve earlier data, stale same-record edits load no quota/timetable context; full trace stages:',h.calls.phases.join(', '));
