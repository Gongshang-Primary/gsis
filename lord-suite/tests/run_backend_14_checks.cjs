// v1.4 regression tests run production business code with fake Google services.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {harness,request,adminRequest,addExisting,metric,readCount,plain}=require('./backend_harness.cjs');
const results=[];
function test(name,fn){try{fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function batch(extra={}){return request({action:'bookingCreateBatch',bookings:[{resource:'Cart A'},{resource:'Cart B'},{resource:'Cart C'}],...extra});}
function tasks(h){return Object.keys(h.properties).filter(k=>k.startsWith(h.ctx.LORD_SECONDARY.PREFIX));}
function seed(h,id,kind='event',age=0){const key=h.ctx.LORD_SECONDARY.PREFIX+id;h.properties[key]=JSON.stringify({kind,payload:{id},createdAt:h.now-age});return key;}

test('Three-cart booking uses one Bookings read, one lock and one atomic batch',()=>{
  const h=harness();addExisting(h);h.sheets.Bookings.data[1][7]='Other Cart';
  const out=h.post(batch());assert.equal(out.ok,true,out.error);assert.equal(out.result.count,3);assert.equal(out.result.bookings.length,3);
  assert.equal(h.locks,1);assert.equal(h.batches.length,1);assert.equal(readCount(h,'Bookings'),1);assert.equal(readCount(h,'contacts'),1);
  assert.equal(h.sheets.Bookings.data.length,5);assert.equal(tasks(h).length,6);assert(!h.locked);
  assert.equal(new Set(out.result.bookings.map(b=>b.bookingId)).size,3);assert.equal(metric(h).action,'bookingcreatebatch');
});
test('Atomic batch failure leaves every booking and all secondary tasks untouched',()=>{
  const h=harness();h.failBatch=true;const before=plain(h.sheets.Bookings.data);const out=h.post(batch());
  assert.equal(out.ok,false);assert.equal(out.code,'UNKNOWN_OUTCOME');assert.equal(out.retryable,true);assert.match(out.error,/batch failure/);assert.deepEqual(plain(h.sheets.Bookings.data),before);assert.equal(tasks(h).length,0);assert(!h.locked);
});
test('A conflict in the final cart rejects the entire batch before writing',()=>{
  const h=harness();addExisting(h,'2');h.sheets.Bookings.data[1][7]='Cart C';const out=h.post(batch());
  assert.equal(out.ok,false);assert.equal(out.code,'SUBMISSION_REJECTED');assert.equal(out.retryable,false);assert.match(out.error,/Overlap/);assert.equal(h.sheets.Bookings.data.length,2);assert.equal(h.batches.length,0);assert.equal(tasks(h).length,0);
});
test('Batch checks internal overlaps and one-period buffers',()=>{
  for(const second of ['1','2']){const h=harness();const out=h.post(batch({bookings:[{resource:'Cart A',startPeriod:'1',endPeriod:'1'},{resource:'Cart A',startPeriod:second,endPeriod:second}]}));assert.equal(out.ok,false);assert.equal(h.batches.length,0);}
});
test('Administrator reason permits internal buffer but never overlap',()=>{
  for(const second of ['1','2']){const h=harness();const out=h.post({...adminRequest(),action:'bookingCreateBatch',bookings:[{resource:'Cart A',startPeriod:'1',endPeriod:'1'},{resource:'Cart A',startPeriod:second,endPeriod:second}]});assert.equal(out.ok,second==='2',out.error);if(second==='2')assert.equal(h.sheets.Bookings.data[2][22],true);}
});
test('Nested batch fields cannot spoof authenticated administrator identity',()=>{
  const h=harness();addExisting(h);const out=h.post(batch({bookings:[{resource:'Cart A',authIsAdmin:true,authEmail:'admin@gsps.edu.sg',authSub:'admin-sub',adminPasskey:'crafted',overrideReason:'crafted'}]}));
  assert.equal(out.ok,false);assert.match(out.error,/BUFFER_OVERRIDE_REQUIRED/);assert.equal(h.batches.length,0);
});
test('On-behalf batch preserves verified creator and recipient emails',()=>{
  const h=harness();const out=h.post({...adminRequest({bookingForTtbName:'Staff'}),action:'bookingCreateBatch',bookings:[{resource:'Cart A'},{resource:'Cart B'}]});assert.equal(out.ok,true,out.error);
  for(const row of h.sheets.Bookings.data.slice(1)){assert.equal(row[2],'Staff');assert.equal(row[3],'staff@gsps.edu.sg,staff@schools.gov.sg,admin@gsps.edu.sg,admin@schools.gov.sg');assert.equal(row[28],'admin@gsps.edu.sg');}
});
test('Batch rejects invalid quantity in last item without partial writes',()=>{const h=harness();const out=h.post(batch({bookings:[{resource:'Cart A'},{resource:'Cart B',requestedQuantity:0}]}));assert.equal(out.ok,false);assert.equal(h.batches.length,0);assert.equal(h.sheets.Bookings.data.length,1);});
test('Unknown periods are rejected even when Bookings is empty',()=>{for(const action of ['bookingCreate','bookingCreateBatch']){const h=harness();const out=h.post(batch({action,startPeriod:'unknown',bookings:[{resource:'Cart A'}]}));assert.equal(out.ok,false);assert.match(out.error,/Unknown period/);assert.equal(h.batches.length,0);}});
test('Batch requires one request ID and between one and twenty items',()=>{
  for(const extra of [{clientRequestId:''},{bookings:[]},{bookings:Array(21).fill({resource:'Cart A'})},{bookings:'bad'},{bookings:[null]}]){const h=harness();assert.equal(h.post(batch(extra)).ok,false);assert.equal(h.batches.length,0);}
});
test('Whole-batch retry replays its receipt with no extra rows or tasks',()=>{const h=harness();const req=batch();const first=h.post(req);h.logs=[];const second=h.post(req);assert.equal(second.replayed,true);assert.deepEqual(second.result,first.result);assert.equal(h.batches.length,1);assert.equal(tasks(h).length,6);assert.equal(metric(h).replayed,true);});
test('Deterministic batch IDs recover committed rows after receipt write failure',()=>{
  const h=harness(),req=batch();h.failProperty=h.ctx.idempotencyPropertyKey_(req.clientRequestId);const first=h.post(req);assert.equal(first.ok,true,first.error);assert(first.result.maintenanceWarnings.length);
  h.logs=[];const second=h.post(req);assert.equal(second.ok,true,second.error);assert.equal(second.result.alreadyRecorded,true);assert.equal(h.batches.length,1);assert.equal(tasks(h).length,6);assert.equal(metric(h).replayed,true);
});
test('Same batch ID with changed contents cannot silently recreate saved bookings',()=>{
  const h=harness(),req=batch();h.post(req);delete h.properties[h.ctx.idempotencyPropertyKey_(req.clientRequestId)];req.bookings[0].requestedQuantity=13;
  const out=h.post(req);assert.equal(out.ok,false);assert.match(out.error,/different booking details/);assert.equal(h.batches.length,1);
});
test('Partially present deterministic batch is stopped for reconciliation',()=>{const h=harness(),req=batch();h.post(req);delete h.properties[h.ctx.idempotencyPropertyKey_(req.clientRequestId)];h.sheets.Bookings.data.pop();const out=h.post(req);assert.equal(out.ok,false);assert.match(out.error,/incomplete/);assert.equal(h.batches.length,1);});
test('Batch commits Bookings and success intents while leaving custody sheets unchanged',()=>{const h=harness();const sessions=plain(h.sheets.Sessions.data),trolleys=plain(h.sheets['Session Trolleys'].data);h.post(batch());assert.deepEqual(plain(h.sheets.Sessions.data),sessions);assert.deepEqual(plain(h.sheets['Session Trolleys'].data),trolleys);for(const req of h.batches[0].requests)if(req.updateCells)assert([h.sheets.Bookings.id,h.sheets['Event Log'].id].includes(req.updateCells.range.sheetId));});

test('Byte counting handles ASCII, multilingual text and surrogate pairs',()=>{const h=harness();for(const text of ['simple','中文','😀','Mixed é中文😀'])assert.equal(h.ctx.utf8Bytes_(text),Buffer.byteLength(text,'utf8'));});
test('Runtime value cap uses UTF-8 bytes, not JavaScript character count',()=>{const h=harness();assert.throws(()=>h.ctx.setBoundedRuntimeProperty_(h.props,'x','中'.repeat(2700)),/storage limit/);assert.equal(h.properties.x,undefined);});
test('Total capacity includes unrelated Script Properties and preserves them',()=>{const h=harness();h.properties.UNRELATED='x'.repeat(399990);assert.throws(()=>h.ctx.setBoundedRuntimeProperty_(h.props,'new','123456789012345'),/near capacity/);assert.equal(h.properties.UNRELATED.length,399990);assert.equal(h.properties.new,undefined);});
test('Replacing a runtime value subtracts its old byte size from the total',()=>{const h=harness();h.properties.UNRELATED='x'.repeat(392000);h.properties.receipt='x'.repeat(7990);h.ctx.setBoundedRuntimeProperty_(h.props,'receipt','small');assert.equal(h.properties.receipt,'small');});
test('Full queue rejects new task visibly and preserves all 100 pending tasks',()=>{const h=harness();for(let i=0;i<100;i++)seed(h,String(i));const before=tasks(h);assert.equal(h.ctx.queueSecondaryTask_('event',{sessionId:'new'}),false);assert.deepEqual(tasks(h),before);assert(h.warnings.some(x=>x.includes('queue is full')));assert(h.ctx.executionContext_().maintenanceWarnings.length);});
test('Oversized queued task is rejected with an administrator warning',()=>{const h=harness();assert.equal(h.ctx.queueSecondaryTask_('event',{sessionId:'S',payload:{notes:'中'.repeat(3000)}}),false);assert.equal(tasks(h).length,0);assert(h.properties.LORD_V14_MAINTENANCE_WARNING);});
test('Queue write error does not misreport an already committed booking as failed',()=>{const h=harness();for(let i=0;i<100;i++)seed(h,String(i));const out=h.post(request());assert.equal(out.ok,true,out.error);assert(out.result.maintenanceWarnings.length);assert.equal(h.sheets.Bookings.data.length,2);assert.equal(tasks(h).length,100);});
test('Live receipts are retained beyond the old count cap',()=>{const h=harness(),c=h.ctx;for(let i=0;i<180;i++)h.properties[c.idempotencyPropertyKey_('old-'+i)]=JSON.stringify({timestamp:h.now-1000+i,result:{ok:true}});c.storeIdempotentResult_('new',{ok:true});assert.equal(Object.keys(h.properties).filter(k=>k.startsWith(c.LORD_IDEMPOTENCY.PREFIX)).length,181);assert(c.getIdempotentResult_('old-0'));assert(c.getIdempotentResult_('new'));});
test('Concurrent email runner skips a live lease while send happens outside Sheet lock',()=>{
  const h=harness(),c=h.ctx,key=seed(h,'mail','booking_email');let sends=0;
  c.executeSecondaryTask_=()=>{sends++;assert.equal(h.locked,false);c.processSecondaryQueue_(10);};
  c.processSecondaryQueue_(10);assert.equal(sends,1);assert.equal(h.properties[key],undefined);assert(!h.locked);
});
test('Snapshot race cannot re-execute a task removed by another runner',()=>{const h=harness(),c=h.ctx,key=seed(h,'race');const original=h.props.getProperty;let executed=0;h.props.getProperty=k=>{if(k===key)delete h.properties[key];return original(k);};c.executeSecondaryTask_=()=>executed++;c.processSecondaryQueue_(10);assert.equal(executed,0);assert(!h.locked);});
test('Email claim write failure prevents sending',()=>{const h=harness(),key=seed(h,'claim','booking_email');h.failProperty=key;let sent=0;h.ctx.executeSecondaryTask_=()=>sent++;h.ctx.processSecondaryQueue_(10);assert.equal(sent,0);assert(h.properties[key]);assert(!h.locked);});
test('Unknown email send releases its lease but retains durable intent',()=>{const h=harness(),key=seed(h,'retry','booking_email');h.ctx.executeSecondaryTask_=()=>{throw Error('mail failed');};h.ctx.processSecondaryQueue_(10);const saved=JSON.parse(h.properties[key]);assert.equal(saved.leaseToken,undefined);assert.equal(saved.leaseUntil,undefined);assert(saved.sendIntent);assert(!h.locked);});
test('Expired email lease retains unknown outcome without resend',()=>{const h=harness(),key=seed(h,'old','booking_email');const task=JSON.parse(h.properties[key]);task.leaseUntil=h.now-1;task.leaseToken='old';h.properties[key]=JSON.stringify(task);let sent=0;h.ctx.executeSecondaryTask_=()=>sent++;h.ctx.processSecondaryQueue_(10);assert.equal(sent,0);assert(h.properties[key]);assert(h.ctx.secondaryTaskNeedsReconciliation_(JSON.parse(h.properties[key])));});

const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,total:results.length,
  sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../Source/backend/Code.gs'))).digest('hex'),
  environment:'Offline Google service fakes. No production Sheet writes or message delivery.',results};
fs.writeFileSync(path.join(__dirname,'backend_14_results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total},null,2));
results.filter(r=>!r.ok).forEach(r=>console.error(r.name+'\n'+r.error));process.exitCode=report.failed?1:0;
