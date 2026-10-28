'use strict';
// The existing host adapter executes production dispatch, durable commits, locks
// and lost-response receipts. Extract its factory without rerunning its cases.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const source=fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8'),box={require:createRequire(require('node:path').resolve('tests/roster096-absence-adapter.cjs')),console};
vm.runInNewContext(source.slice(0,source.indexOf('const reject='))+'\nthis.adapter=adapter;',box);const adapter=box.adapter;
const h=adapter(),created=h.call(h.command()),id=created.savedIds[0];
assert.match(created.absences[0].absenceToken,/^[a-f0-9]{64}$/,'accepted records carry exact row version tokens');
const command={...h.command(),id,revision:1,typeId:'others',reasonDetail:'Appointment',expectedAbsenceToken:created.absences[0].absenceToken};
h.beforeLock(()=>h.call(h.command('bob')));const updated=h.call(command);
assert.equal(h.state().absences.length,2);assert.equal(h.state().absences.find(a=>a.id===id).reasonDetail,'Appointment');assert.equal(h.counts().contexts,3,'two independent reports and edit prepare once each');assert.equal(h.counts().writes,3);assert.equal(updated.acceptedRevision,3);
assert.equal(h.call(command).replayed,true);assert.equal(h.counts().writes,3,'identical receipt retry never writes twice');
assert.throws(()=>h.call({...command,requestId:h.command().requestId,reasonDetail:'Stale overwrite'}),e=>e.status===409&&e.code==='ABSENCE_CONFLICT','stale same-record edit is rejected');
assert.throws(()=>h.call({...command,requestId:h.command().requestId,expectedAbsenceToken:'bad'}),e=>e.status===409,'invalid token never bypasses concurrency');
assert.throws(()=>h.call({...command,requestId:h.command().requestId,expectedAbsenceToken:undefined}),e=>e.status===409,'legacy editor retains global revision guard');
const latest=updated.absences.find(a=>a.id===id),before=h.counts().writes;
h.beforeLock(()=>h.update(s=>{s.absences.find(a=>a.id===id).instructionsNA=true;s.revision++;}));
assert.throws(()=>h.call({...command,requestId:h.command().requestId,revision:updated.revision,expectedAbsenceToken:latest.absenceToken}),e=>e.status===409&&e.code==='ABSENCE_CONFLICT','same record changed after prepare rejects under commit lock');assert.equal(h.counts().writes,before);
console.log('PASS scoped absence concurrency: independent teacher update merges with one context load, same-row race rejected, exact receipt replay, legacy fallback.');

{
 const h=adapter(),first=h.call(h.command()),record=first.absences[0],edit={...h.command(),id:record.id,revision:first.revision,expectedAbsenceToken:record.absenceToken,typeId:'others',reasonDetail:'New details'};
 assert.throws(()=>h.call(edit,h.identity('bob')),e=>e.status===403,'a current row token never grants another teacher edit authority');
 h.lose();assert.throws(()=>h.call(edit),/Lost commit/);const receipt=h.call({operation:'receiptStatus',command:edit},h.identity('alice'));assert.equal(receipt.accepted,true);assert.equal(h.call(edit).replayed,true);assert.equal(h.counts().writes,2);
 assert.throws(()=>h.call({...edit,reasonDetail:'Different command'}),e=>e.status===409,'receipt identity binds the exact token and payload');
 const historic=h.state();historic.absences[0].date='2026-01-01';const response={absences:[{...historic.absences[0],editable:false}]};h.scope.rosterOperationsAttachDayToken_(response,historic,h.ctx,{});assert.equal(response.absences[0].absenceToken,undefined,'past rows do not compute unusable edit tokens');
}
console.log('PASS scoped absence authority, lost-response replay and exact command identity.');
