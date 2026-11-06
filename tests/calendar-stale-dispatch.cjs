'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{makeHarness}=require('./calendar/backend_harness.cjs');
function healthy(){const h=makeHarness();h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(l=>h.sandbox.legacyLaneScheduleRows_(l)));return h;}
function stuck(h,action='saveEvent',eventId='E1'){
 const operationId=crypto.randomUUID(),payload=action==='publishVersion'?{year:2027,operationId}:{event:{...h.event('E1'),StaffTitle:'Never landed'},expectedRevision:h.event('E1')._revision,operationId};
 const record={OperationID:operationId,UserAlias:'admin',Action:action,PayloadHash:h.sandbox.mutationIdentity_(h.actor('admin'),action,payload).hash,State:'DISPATCHED',EventID:eventId,CreatedAt:h.sandbox.isoNow_(),UpdatedAt:h.sandbox.isoNow_()};h.seed('MutationLog',[record]);return {payload,record};
}
test('young dispatch stays uncertain; old non-landed event fails once under the writer lock and unblocks',()=>{
 const h=makeHarness(),{payload,record}=stuck(h);assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload}).state,'UNKNOWN');h.advanceClock(3600001);
 const outcome=h.call('eventMutationStatus',{action:'saveEvent',payload});assert.equal(outcome.state,'REJECTED');assert.equal(outcome.error.code,'STALE_DISPATCH');assert.match(outcome.error.message,/did not apply. Please redo it/);assert.equal(outcome.error.current.EventID,'E1');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),record.OperationID).object.State,'FAILED');
 const audits=h.sandbox.tableObjects_(h.sheets.get('AuditLog')).filter(x=>x.Action==='STALE_DISPATCH');assert.equal(audits.length,1);h.call('eventMutationStatus',{action:'saveEvent',payload});assert.equal(h.sandbox.tableObjects_(h.sheets.get('AuditLog')).filter(x=>x.Action==='STALE_DISPATCH').length,1);
 const saved=h.call('saveEvent',{event:{...h.event('E1'),StaffTitle:'Redone'},expectedRevision:h.event('E1')._revision,operationId:crypto.randomUUID()});assert.equal(saved.StaffTitle,'Redone');
});
test('a landed old event is repaired to committed, never failed',()=>{const h=makeHarness(),{payload,record}=stuck(h);h.seed('Events',[{...h.base,LastMutationID:record.OperationID}]);h.advanceClock(3600001);assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload}).state,'SAVED');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),record.OperationID).object.State,'COMMITTED');});
test('old unlanded YEAR publication clears its fence; young publication still blocks',()=>{const h=makeHarness(),{payload,record}=stuck(h,'publishVersion','YEAR:2027');assert.throws(()=>h.call('saveEvent',{event:h.event('E1'),expectedRevision:h.event('E1')._revision,operationId:crypto.randomUUID()}),e=>e.code==='PENDING_EVENT_WRITE');h.advanceClock(3600001);assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='STALE_DISPATCH');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),record.OperationID).object.State,'FAILED');});
test('Admin receipt list is read-only and Check now uses the same resolver; parent publisher is refused',()=>{const h=makeHarness(),{record}=stuck(h);h.advanceClock(3600001);const listed=h.call('mutationReceipts',{check:false});assert.equal(listed.receipts.length,1);assert.equal(listed.receipts[0].state,'DISPATCHED');assert.equal(listed.receipts[0].user,'admin');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),record.OperationID).object.State,'DISPATCHED');assert.throws(()=>h.call('mutationReceipts',{check:true},'publisher'),/Admin|admin/);const checked=h.call('mutationReceipts',{check:true,operationId:record.OperationID});assert.equal(checked.checked[0].state,'REJECTED');assert.equal(checked.receipts.length,0);});

test('publication recovery requires the exact immutable operation, not a reused request ID',()=>{
 const h=healthy();h.call('publishVersion',{year:2027,operationId:crypto.randomUUID()});
 const audit=h.sandbox.tableObjects_(h.sheets.get('AuditLog')).find(r=>r.Action==='PUBLISH_VERSION');
 const {record}=stuck(h,'publishVersion','YEAR:2027');record.ResultJSON=JSON.stringify({dispatchRequestId:audit.RequestID});h.seed('MutationLog',[record]);
 const outcome=h.call('mutationReceipts',{check:true,operationId:record.OperationID});assert.equal(outcome.checked[0].state,'UNKNOWN');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),record.OperationID).object.State,'DISPATCHED');
});
test('exact publication audit repairs a lost committed receipt',()=>{
 const h=healthy(),payload={year:2027,operationId:crypto.randomUUID()},result=h.call('publishVersion',payload);
 const audit=h.sandbox.tableObjects_(h.sheets.get('AuditLog')).find(r=>r.Action==='PUBLISH_VERSION'),record=h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),payload.operationId).object;
 record.State='DISPATCHED';record.ResultJSON=JSON.stringify({dispatchRequestId:audit.RequestID});h.seed('MutationLog',[record]);h.advanceClock(3600001);
 const checked=h.call('mutationReceipts',{check:true,operationId:record.OperationID}).checked[0];assert.equal(checked.state,'SAVED');assert.equal(checked.result.published,result.published);assert.equal(checked.result.year,2027);
});
test('partially landed publication with an unchanged first Year row remains uncertain',()=>{
 const h=healthy(),now=h.sandbox.isoNow_();h.sandbox.isoNow_=()=>now;h.seed('Years',[{Year:2027,Status:'PLANNING',ReleasedToTeachers:'Yes',UpdatedAt:now,UpdatedBy:'admin'}]);
 const payload={year:2027,operationId:crypto.randomUUID()};h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='AuditLog')throw Error('Lost before audit');});
 assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='UNKNOWN');h.setFault(null);assert.equal(h.event('E3').Status,'PUBLISHED','event writes already landed');h.advanceClock(3600001);
 assert.equal(h.call('mutationReceipts',{check:true,operationId:payload.operationId}).checked[0].state,'UNKNOWN');assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),payload.operationId).object.State,'DISPATCHED');
});
test('an old publication stopped before its first Year write can safely fail',()=>{
 const h=healthy(),payload={year:2027,operationId:crypto.randomUUID()};h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Years')throw Error('Never landed');});assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='UNKNOWN');h.setFault(null);h.advanceClock(3600001);assert.equal(h.call('mutationReceipts',{check:true,operationId:payload.operationId}).checked[0].error.code,'STALE_DISPATCH');assert.equal(h.event('E3').Status,'HIDDEN');
});
test('original user sees failed save and fresh content on bootstrap; other accounts do not',()=>{
 const h=makeHarness(),{record}=stuck(h);h.advanceClock(3600001);h.call('mutationReceipts',{check:true,operationId:record.OperationID});h.seed('Events',[{...h.base,StaffTitle:'Current later title'}]);
 const notice=h.call('bootstrap',{year:2026}).mutationFailures[0];assert.equal(notice.operationId,record.OperationID);assert.equal(notice.current.StaffTitle,'Current later title');assert.equal(h.call('bootstrap',{year:2026},'publisher').mutationFailures.length,0);assert.equal(h.call('bootstrap',{year:2026},'teacher').mutationFailures.length,0);
});

test('reused request ID still recovers the exact later landed publication',()=>{
 const h=healthy(),first={year:2027,operationId:crypto.randomUUID()},second={year:2027,operationId:crypto.randomUUID()};h.call('publishVersion',first);h.call('publishVersion',second);
 const audits=h.sandbox.tableObjects_(h.sheets.get('AuditLog'));for(const row of audits.filter(r=>r.Action==='PUBLISH_VERSION'))row.RequestID='reused';h.seed('AuditLog',audits);
 const records=h.sandbox.tableObjects_(h.sheets.get('MutationLog')),record=records.find(r=>r.OperationID===second.operationId);record.State='DISPATCHED';record.ResultJSON=JSON.stringify({dispatchRequestId:'reused'});h.seed('MutationLog',records);
 const result=h.call('mutationReceipts',{check:true,operationId:second.operationId}).checked[0];assert.equal(result.state,'SAVED');assert.equal(result.result.operationId,second.operationId);
});
test('lost stale receipt write retries without duplicating its landed audit',()=>{
 const h=makeHarness(),{record}=stuck(h);h.advanceClock(3600001);h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='MutationLog'&&w.values.some(row=>row.includes('FAILED')))throw Error('Lost receipt write');});assert.throws(()=>h.call('mutationReceipts',{check:true,operationId:record.OperationID}));h.setFault(null);assert.equal(h.call('mutationReceipts',{check:true,operationId:record.OperationID}).checked[0].state,'REJECTED');assert.equal(h.sandbox.tableObjects_(h.sheets.get('AuditLog')).filter(r=>r.Action==='STALE_DISPATCH').length,1);
});

test('failed creation with no landed event still reaches its original user',()=>{const h=makeHarness(),{record}=stuck(h,'saveEvent','NEVER-CREATED');h.advanceClock(3600001);h.call('mutationReceipts',{check:true,operationId:record.OperationID});const notices=h.call('bootstrap',{year:2026}).mutationFailures;assert.equal(notices.length,1);assert.equal(notices[0].current,null);assert.match(notices[0].message,/NEVER-CREATED/);assert.equal(h.call('bootstrap',{year:2026},'publisher').mutationFailures.length,0);});
