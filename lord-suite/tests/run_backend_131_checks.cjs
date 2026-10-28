const componentVersions=require('../../package.json').gsisComponentVersions;
// Offline v1.3.1 regressions. Production functions run in a VM; Google services
// are in-memory fakes. Explicit dependency overrides are local to each test.
process.env.TZ = 'Asia/Singapore';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Source/backend/Code.gs'), 'utf8');
const results = [];
const plain = value => JSON.parse(JSON.stringify(value));
function test(name, fn) {
  try { fn(); results.push({name, ok:true}); }
  catch (error) { results.push({name, ok:false, error:error.stack}); }
}

const {harness,request,adminRequest,addExisting,metric,readCount}=require('./backend_harness.cjs');

test('R1: authenticated administrator creates a buffered booking with a reason',()=>{
  const h=harness();addExisting(h);const reply=h.post(adminRequest());assert.equal(reply.ok,true,reply.error);
  const row=h.sheets.Bookings.data[2];assert.equal(row[22],true);assert.equal(row[23],'Supervised handover');
  assert.equal(h.sheets.Bookings.data.length,3);assert.equal(readCount(h,'contacts'),1);assert(!h.locked);
});
for(const [name,req,expected] of [
  ['admin missing reason',adminRequest({overrideReason:''}),/Override reason is required/],
  ['nonadmin override',request({overrideReason:'please'}),/BUFFER_OVERRIDE_REQUIRED/],
  ['crafted adminPasskey bypass',request({adminPasskey:'x',overrideReason:'y'}),/BUFFER_OVERRIDE_REQUIRED/],
  ['raw admin flag for unknown email',request({authIsAdmin:true,adminPasskey:'x',overrideReason:'y'}),/BUFFER_OVERRIDE_REQUIRED/],
  ['mismatched bound Google subject',adminRequest({authSub:'other-sub'}),/BUFFER_OVERRIDE_REQUIRED/]
]) test('R1 rejects '+name,()=>{const h=harness();addExisting(h);const out=h.post(req);assert.equal(out.ok,false);assert.match(out.error,expected);assert.equal(h.sheets.Bookings.data.length,2);assert.equal(h.batches.length,0);assert(!h.locked);});
test('R1 rejects inactive administrator despite authIsAdmin',()=>{const h=harness();addExisting(h);h.admins.data[1][2]='no';const out=h.post(adminRequest());assert.equal(out.ok,false);assert.match(out.error,/BUFFER_OVERRIDE_REQUIRED/);});
for(const role of ['staff','admin']) test('R1 never overrides an overlap for '+role,()=>{const h=harness();addExisting(h,'2');const out=h.post(role==='admin'?adminRequest():request({adminPasskey:'x',overrideReason:'y'}));assert.equal(out.ok,false);assert.match(out.error,/Overlap cannot be overridden/);});
test('Ordinary staff booking remains accepted without conflict',()=>{const h=harness();const out=h.post(request());assert.equal(out.ok,true,out.error);assert.equal(h.sheets.Bookings.data[1][22],false);assert.equal(h.sheets.Bookings.data[1][25],'staff@gsps.edu.sg');});
test('On-behalf booking preserves owner, creator and both GSPS recipients',()=>{const h=harness();const out=h.post(adminRequest({bookingForTtbName:'Staff'}));assert.equal(out.ok,true,out.error);const row=h.sheets.Bookings.data[1];assert.equal(row[2],'Staff');assert.equal(row[3],'staff@gsps.edu.sg,staff@schools.gov.sg,admin@gsps.edu.sg,admin@schools.gov.sg');assert.equal(row[24]||'','');assert.equal(row[25],'staff@gsps.edu.sg');assert.equal(row[28],'admin@gsps.edu.sg');assert.equal(readCount(h,'contacts'),1);});
test('HTTP idempotent replay creates no second booking or tasks and is timed',()=>{const h=harness();const first=h.post(request());const count=Object.keys(h.properties).length;h.logs=[];const again=h.post(request());assert.equal(again.replayed,true);assert.deepEqual(again.result,first.result);assert.equal(h.sheets.Bookings.data.length,2);assert.equal(Object.keys(h.properties).length,count);assert.equal(metric(h).replayed,true);});
test('Existing update path still permits an authenticated buffer override',()=>{const h=harness();addExisting(h);const created=h.post(adminRequest({startPeriod:'4',endPeriod:'4'}));assert.equal(created.ok,true,created.error);const out=h.post(adminRequest({action:'bookingUpdate',bookingId:created.result.bookingId,clientRequestId:'update-1'}));assert.equal(out.ok,true,out.error);assert.equal(h.sheets.Bookings.data[2][10],'2');assert.equal(h.sheets.Bookings.data[2][22],true);});

function monitorFixture() {
  const h=harness(),c=h.ctx;
  c.getOverlordOverdueScan_=()=>({open:['A','B','C'].map(sessionId=>({sessionId,collector:'Staff',resource:'Cart A',expectedEndMs:h.now-3600000,booking:{bookingId:'B'+sessionId,endTime:'09:00'}}))});
  c.buildOverlordAlert_=movement=>movement.sessionId;
  h.queueRuns=0;const queue=c.processSecondaryQueue_;c.processSecondaryQueue_=limit=>{h.queueRuns++;return queue(limit);};
  h.run=()=>c.checkAndSendOverdueTelegramAlerts();
  h.next=()=>{h.now+=5*60000;h.run();};
  h.notified=()=>JSON.parse(h.properties[c.OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY] || '{}');
  return h;
}
test('R2: middle Telegram failure checkpoints other successes and retries only failure',()=>{const h=monitorFixture();h.sendFailure=text=>text==='B';h.run();assert.deepEqual(h.sends,['A','B','C']);assert.deepEqual(Object.keys(h.notified()),['A','C']);assert.equal(h.queueRuns,1);assert.equal(h.sheets['Event Log'].data.length,3);h.sendFailure=null;h.next();assert.deepEqual(h.sends,['A','B','C','B']);assert.deepEqual(Object.keys(h.notified()),['A','C','B']);assert.equal(h.queueRuns,2);assert.equal(h.sheets['Event Log'].data.length,4);});
test('R2: all delivery failures still attempt all sends and queue',()=>{const h=monitorFixture();h.sendFailure=()=>true;h.run();assert.deepEqual(h.sends,['A','B','C']);assert.deepEqual(h.notified(),{});assert.equal(h.queueRuns,1);assert.equal(h.warnings.length,3);});
test('R2: saved success suppresses duplicate delivery in the same bucket',()=>{const h=monitorFixture();h.run();h.run();assert.equal(h.sends.length,3);assert.equal(h.queueRuns,1);});
test('R2: no Telegram configuration still attempts safety sweep and queue',()=>{const h=monitorFixture();let swept=0;h.ctx.telegramConfigured_=()=>false;h.ctx.runSixPmForceReturnSweep_=()=>swept++;h.run();assert.equal(swept,1);assert.equal(h.queueRuns,1);assert.equal(h.sends.length,0);});
for(const dependency of ['getOverlordOverdueScan_','runSixPmForceReturnSweep_']) test('R2 finalizes maintenance after '+dependency+' fails',()=>{const h=monitorFixture();h.ctx[dependency]=()=>{throw new Error('Injected scan/sweep failure');};assert.throws(h.run,/Injected/);assert.equal(h.queueRuns,1);assert(!h.locked);});
test('R2 checkpoint failure stops later sends, flushes sent audit and still attempts queue',()=>{const h=monitorFixture();h.failProperty=h.ctx.OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY;assert.throws(h.run,/Properties failure/);assert.deepEqual(h.sends,['A']);assert.equal(h.queueRuns,1);assert.equal(h.sheets['Event Log'].data.length,2);assert(!h.locked);});
test('R2 audit failure retains sent events and still runs queue; later scan flushes without resend',()=>{const h=monitorFixture();h.failSheet='Event Log';assert.throws(h.run,/Sheet failure/);const key=h.ctx.OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY;assert.equal(JSON.parse(h.properties[key]).length,3);assert.equal(h.queueRuns,1);assert(!h.locked);h.failSheet=null;h.next();assert.equal(h.sends.length,3);assert.equal(h.sheets['Event Log'].data.length,4);assert.equal(h.properties[key],undefined);assert.equal(h.queueRuns,2);});
test('R2 pruning closed notifications persists even if all new sends fail',()=>{const h=monitorFixture();h.properties[h.ctx.OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY]=JSON.stringify({CLOSED:'old'});h.sendFailure=()=>true;h.run();assert.deepEqual(h.notified(),{});});
test('R2 busy audit lock preserves old and new pending events',()=>{const h=harness(),c=h.ctx,key=c.OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY;const event=id=>({sessionId:id,eventType:'TEST',teacher:'Staff'});h.properties[key]=JSON.stringify([event('old')]);h.busy=true;c.appendOverlordEventsBatch_([event('new')]);assert.deepEqual(JSON.parse(h.properties[key]).map(e=>e.sessionId),['old','new']);h.busy=false;c.appendOverlordEventsBatch_([]);assert.equal(h.sheets['Event Log'].data.length,3);assert.equal(h.properties[key],undefined);assert(!h.locked);});
test('R2 failed audit plus failed pending storage preserves original error and releases lock',()=>{const h=harness();h.failSheet='Event Log';h.failProperty=h.ctx.OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY;assert.throws(()=>h.ctx.appendOverlordEventsBatch_([{sessionId:'A'}]),/Sheet failure/);assert(h.warnings.some(s=>s.includes('could not be saved')));assert(!h.locked);});

test('Schema validation reads once per workbook per execution and resets next execution',()=>{const h=harness();h.ctx.assertSessionSchema_(h.ss);h.ctx.assertSessionSchema_(h.ss);assert.equal(readCount(h,'Sessions'),1);const other={getId:()=> 'other',getSheetByName:name=>h.sheets[name]};h.ctx.assertSessionSchema_(other);assert.equal(readCount(h,'Sessions'),2);h.reset();h.ctx.assertSessionSchema_(h.ss);assert.equal(readCount(h,'Sessions'),3);});
test('Failed schema validation is never memoized',()=>{const h=harness();h.sheets.Sessions.data[0][0]='broken';assert.throws(()=>h.ctx.assertSessionSchema_(h.ss),/schema mismatch/);h.sheets.Sessions.data[0][0]=h.ctx.SESSION_HEADERS[0];assert.equal(h.ctx.assertSessionSchema_(h.ss),true);assert.equal(readCount(h,'Sessions'),2);});
test('Contacts memo shares only source rows; fallback and caller changes do not leak',()=>{const h=harness(),c=h.ctx;const first=c.getBookingNotificationEmails_('Staff','alias@gsps.edu.sg');first.push('injected@gsps.edu.sg');assert.deepEqual(plain(c.getBookingNotificationEmails_('Staff','')),['staff@gsps.edu.sg','staff@schools.gov.sg']);assert.equal(c.getGspsEmailForTtbName_(' Admin '),'admin@gsps.edu.sg');assert.equal(readCount(h,'contacts'),1);h.contacts.data[2][3]='changed@gsps.edu.sg';h.reset();assert.equal(c.getGspsEmailForTtbName_('Staff'),'changed@gsps.edu.sg');assert.equal(readCount(h,'contacts'),2);});
test('Empty contacts snapshot is memoized',()=>{const h=harness();h.contacts.data=h.contacts.data.slice(0,1);h.ctx.getBookingEmailsByTtbName_('Staff');h.contacts.data.push(['Staff','','','new@gsps.edu.sg']);assert.deepEqual(plain(h.ctx.getBookingEmailsByTtbName_('Staff')),[]);h.reset();assert.deepEqual(plain(h.ctx.getBookingEmailsByTtbName_('Staff')),['new@gsps.edu.sg']);});
test('Admin memo normalizes emails, caches misses and resets changed status',()=>{const h=harness(),c=h.ctx;assert(c.findAdminByEmail_(' ADMIN@GSPS.EDU.SG ').active);assert(c.findAdminByEmail_('admin@gsps.edu.sg').active);assert.equal(readCount(h,h.admins.name),1);assert.equal(c.findAdminByEmail_('missing@gsps.edu.sg'),null);assert.equal(c.findAdminByEmail_('missing@gsps.edu.sg'),null);assert.equal(readCount(h,h.admins.name),2);h.admins.data[1][2]='no';h.reset();assert.equal(c.findAdminByEmail_('admin@gsps.edu.sg').active,false);});
test('First Google subject binding updates the memo used by later authentication',()=>{const h=harness(),c=h.ctx;h.admins.data[1][5]='';assert.equal(c.identityLookup_('admin@gsps.edu.sg','bound-sub').isAdmin,true);assert.equal(c.isAuthenticatedAdmin_(adminRequest({authSub:'bound-sub'})),true);assert.equal(c.isAuthenticatedAdmin_(adminRequest({authSub:'wrong-sub'})),false);assert.equal(readCount(h,h.admins.name),2);assert.equal(h.admins.data[1][5],'bound-sub');});
test('Reference miss reads five tabs and caches for one hour; hit avoids workbook reads',()=>{const h=harness(),c=h.ctx;const first=h.get({action:'reference'});assert.equal(first.ok,true,first.error);assert.equal(h.reads.length,5);assert.equal(h.cachePuts.find(p=>p.key===c.LORD_REFERENCE_CONFIG.CACHE_KEY).ttl,3600);assert.equal(metric(h).referenceCache,'miss');const opens=h.opens.length;h.logs=[];const second=h.get({action:'reference'});assert.deepEqual(second.data,first.data);assert.equal(h.reads.length,5);assert.equal(h.opens.length,opens);assert.equal(metric(h).referenceCache,'hit');});
test('Authenticated forced reference read warms shared cache and memo',()=>{const h=harness(),c=h.ctx;h.get({action:'reference'});h.refSheets[c.LORD_REFERENCE_CONFIG.SHEETS.teachers].data.push(['New Staff']);h.logs=[];const out=h.get({...adminRequest(),action:'reference',forceRefresh:'1'});assert.equal(out.cacheReloaded,true);assert(out.data.teachers.includes('New Staff'));assert.equal(metric(h).referenceCache,'forced');const reads=h.reads.length;c.getReferenceData_();assert.equal(h.reads.length,reads);h.get({action:'reference'});assert.equal(h.reads.length,reads);c.clearReferenceCache();assert(!h.cache.has(c.LORD_REFERENCE_CONFIG.CACHE_KEY));c.getReferenceData_();assert.equal(h.reads.length,reads+5);});
test('Reference diagnostics report canonical one-hour TTL',()=>{const h=harness();h.ctx.getOverlordOverdueScan_=()=>({open:[]});assert.equal(h.ctx.diagnoseOverlordMonitor().referenceCacheSeconds,3600);});
for(const installer of ['installOverdueTelegramTrigger','installLORDV1Triggers']) test(installer+' invalidates actual cached trigger status and retains schedules',()=>{const h=harness(),c=h.ctx;c.inspectLORDV1Configuration=()=>({});assert.equal(c.hasOverlordTrigger_(),false);c[installer]();assert.equal(c.hasOverlordTrigger_(),true);assert.equal(h.triggers.find(t=>t.handler==='checkAndSendOverdueTelegramAlerts').minutes,5);if(installer==='installLORDV1Triggers')assert.equal(h.triggers.find(t=>t.handler==='processSecondaryQueueTrigger').minutes,1);});

test('Idle minute queue performs one locked pruning scan with no Sheets or writes',()=>{const h=harness();h.properties.UNRELATED='retain';h.ctx.processSecondaryQueue_(10);assert.equal(h.snapshots,1);assert.equal(h.locks,1);assert.equal(h.opens.length,0);assert.equal(h.propertyWrites.length,0);assert.equal(h.properties.UNRELATED,'retain');});
function seedTask(h,id,age=0,kind='event') {const key=h.ctx.LORD_SECONDARY.PREFIX+id;h.properties[key]=JSON.stringify({kind,createdAt:h.now-age,payload:{id}});return key;}
test('Populated queue reads under lock, retains unreadable work and processes oldest pending tasks',()=>{const h=harness(),c=h.ctx;const keys=[seedTask(h,'new',1000),seedTask(h,'old',3000),seedTask(h,'middle',2000)];const expired=seedTask(h,'expired',c.LORD_SECONDARY.MAX_AGE_MS+1);const bad=c.LORD_SECONDARY.PREFIX+'bad';h.properties[bad]='broken';h.properties.UNRELATED='keep';const executed=[];c.executeSecondaryTask_=task=>executed.push(task.payload.id);c.processSecondaryQueue_(2);assert.equal(h.snapshots,1);assert.deepEqual(executed,['expired','old']);assert(h.properties[keys[0]]);assert.equal(h.properties[expired],undefined);assert.equal(h.properties[bad],'broken');assert.equal(h.properties.UNRELATED,'keep');assert(!h.locked);});
test('Queue failure retains task for retry and releases its lock',()=>{const h=harness();const key=seedTask(h,'retry');h.ctx.executeSecondaryTask_=()=>{throw new Error('Injected delivery failure');};h.ctx.processSecondaryQueue_(10);assert(h.properties[key]);assert(!h.locked);assert.equal(h.releases,2);});
test('Busy lock retains every task until an email claim can be made',()=>{const h=harness();const key=seedTask(h,'busy');h.busy=true;let runs=0;h.ctx.executeSecondaryTask_=()=>runs++;h.ctx.processSecondaryQueue_(10);assert.equal(runs,0);assert(h.properties[key]);const mail=seedTask(h,'mail',1,'booking_email');h.ctx.processSecondaryQueue_(10);assert.equal(runs,0);assert(h.properties[mail]);h.busy=false;h.ctx.processSecondaryQueue_(10);assert.equal(runs,2);assert.equal(h.properties[mail],undefined);});
test('Queue retains oldest pending tasks instead of dropping them at the count limit',()=>{const h=harness(),c=h.ctx;for(let i=0;i<102;i++)seedTask(h,String(i),102-i);const executed=[];c.executeSecondaryTask_=task=>executed.push(task.payload.id);c.processSecondaryQueue_(1);assert.deepEqual(executed,['0']);assert.equal(Object.keys(h.properties).filter(key=>key.indexOf(c.LORD_SECONDARY.PREFIX)===0).length,101);assert.equal(h.snapshots,1);});
test('Minute trigger resets execution memo before running queue',()=>{const h=harness();h.ctx.executionContext_().sentinel=true;h.ctx.processSecondaryQueueTrigger();assert.equal(h.ctx.executionContext_().sentinel,undefined);assert.equal(h.snapshots,1);});

test('Health produces one timing log without private request values',()=>{const h=harness();const out=h.get({action:'health',email:'private@gsps.edu.sg',photo:'private-photo'});assert.equal(out.version,componentVersions.lordBackend);const m=metric(h);assert.equal(m.action,'health');assert.equal(m.outcome,'ok');assert.equal(m.photoCount,0);assert(!h.logs[0].includes('private'));assert(!h.logs[0].includes(h.ctx.LORD_CONFIG.PROXY_SECRET));});
for(const method of ['GET','POST']) test(method+' unknown action is timed and sanitized',()=>{const h=harness();const out=method==='GET'?h.get({action:'private@gsps.edu.sg'}):h.post({action:'private@gsps.edu.sg'});assert.equal(out.ok,false);const m=metric(h);assert.equal(m.action,'unknown');assert.equal(m.outcome,'error');assert(!h.logs[0].includes('private'));});
test('Malformed POST is timed exactly once',()=>{const h=harness();const out=JSON.parse(h.ctx.doPost({postData:{contents:'{broken'}}).content);assert.equal(out.ok,false);assert.equal(metric(h).outcome,'error');});
test('Rejected proxy authentication is timed without echoing supplied secret',()=>{const h=harness();assert.equal(h.get({action:'reference',proxySecret:'bad-secret'}).ok,false);assert.equal(metric(h).outcome,'error');assert(!h.logs[0].includes('bad-secret'));});
test('Logging failure cannot change a successful booking response',()=>{const h=harness();h.failLog=true;const out=h.post(request());assert.equal(out.ok,true,out.error);assert.equal(h.sheets.Bookings.data.length,2);assert(!h.locked);});
test('Lock wait and failed commit durations are recorded, and lock releases',()=>{const h=harness(),c=h.ctx;const m=c.beginRequestMetrics_('POST');h.failBatch=true;assert.throws(()=>c.withWriteLock_(()=>c.commitSurgicalUpdates_([{updateCells:{range:{sheetId:1,startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:1},rows:[{values:[{userEnteredValue:{stringValue:'test'}}]}],fields:'userEnteredValue'}}])),/batch failure/);assert.equal(m.lockWaitMs,5);assert.equal(m.commitMs,9);assert.equal(m.lockHeldMs,9);assert(!h.locked);});
test('Lock timeout duration is recorded without releasing an unacquired lock',()=>{const h=harness(),c=h.ctx;const m=c.beginRequestMetrics_('POST');h.failLock=true;assert.throws(()=>c.withWriteLock_(()=>{}),/lock timeout/);assert.equal(m.lockWaitMs,5);assert.equal(m.lockHeldMs,0);assert.equal(h.releases,0);});
test('Photo timing preserves folder, filename and returned file metadata',()=>{const h=harness(),c=h.ctx;const m=c.beginRequestMetrics_('POST');const details={photoData:'data:image/jpeg;base64,AQID',sessionId:'S1',phase:'loan',sequence:1,trolleyName:'Cart A'};c.prepareEvidenceUploads_(request({action:'loan'}),'S1',[details]);const out=c.savePhoto_(details);assert.deepEqual(plain(out),{fileId:'photo-1',url:'https://example.test/photo/1'});assert.equal(h.photos[0].folder,'S1');assert.equal(h.photos[0].name,'S1_loan_1_Cart_A_20261008-100000.jpg');assert.deepEqual(h.photos[0].bytes,[1,2,3]);assert.equal(m.photoCount,1);assert.equal(m.photoMs,11);assert.equal(m.folderMs,5);});
test('Failed photo attempt is counted and timed; invalid photo is rejected before Drive',()=>{const h=harness(),c=h.ctx;const m=c.beginRequestMetrics_('POST');const details={photoData:'bad',sessionId:'S1',phase:'return',sequence:1,trolleyName:'A'};assert.throws(()=>c.savePhoto_(details),/format is invalid/);assert.equal(m.photoCount,0);h.failPhoto=true;details.photoData='data:image/png;base64,AQID';c.prepareEvidenceUploads_(request({action:'return'}),'S1',[details]);assert.throws(()=>c.savePhoto_(details),/unconfirmed/);assert.equal(m.photoCount,1);assert.equal(m.photoMs,11);assert.equal(h.photos.length,0);});
test('Timing finalizer is single-use and all values are nonnegative',()=>{const h=harness(),c=h.ctx;const m=c.beginRequestMetrics_('GET');h.now+=23;c.finishRequestMetrics_(m);c.finishRequestMetrics_(m);const out=metric(h);assert.equal(out.elapsedMs,23);for(const key of ['photoMs','folderMs','lockWaitMs','lockHeldMs','commitMs'])assert(out[key]>=0);});

test('Real HTTP Book, Collect, Return and queue complete one custody cycle with atomic movement writes',()=>{
  const h=harness(),c=h.ctx;
  const booked=h.post(request());assert.equal(booked.ok,true,booked.error);
  h.logs=[];h.reads=[];
  const collected=h.post(request({action:'loan',clientRequestId:'collect-1',bookingId:booked.result.bookingId,cartGroup:'Cart A',
    trolleys:[{name:'Trolley A',quantity:14,photoData:'data:image/jpeg;base64,AQID'}]}));
  assert.equal(collected.ok,true,collected.error);assert.equal(collected.result.status,'OPEN');
  assert.equal(h.batches.length,3);assert.equal(h.sheets.Bookings.data[1][1],'COLLECTED');
  assert.equal(metric(h).photoCount,1);assert.equal(metric(h).photoMs,11);
  assert.equal(h.reads.filter(r=>r.sheet==='Sessions'&&r.r===1).length,1);
  const sessionId=collected.result.sessionId;
  const trolleyRecordId=h.sheets[c.LORD_CONFIG.SHEETS.TROLLEYS].data[1][0];
  h.logs=[];
  const returnRequest=request({action:'return',clientRequestId:'return-1',sessionId,
    trolleys:[{trolleyRecordId,quantity:14,correctTrolleyDeclaration:true,sameOrientationDeclaration:true,photoData:'data:image/jpeg;base64,AQID'}]});
  const returned=h.post(returnRequest);
  assert.equal(returned.ok,true,returned.error);assert.equal(returned.result.status,'RETURNED');
  assert.equal(h.batches.length,5);assert.equal(h.sheets.Sessions.data[1][1],'RETURNED');
  assert.equal(metric(h).photoCount,1);assert.equal(metric(h).commitMs,18);assert(!h.locked);
  const photoCount=h.photos.length;h.logs=[];assert.equal(h.post(returnRequest).replayed,true);
  assert.equal(h.photos.length,photoCount);assert.equal(h.batches.length,5);assert.equal(metric(h).replayed,true);
  c.processSecondaryQueueTrigger();assert.equal(h.sheets.Bookings.data[1][1],'COMPLETED');
  assert(!Object.keys(h.properties).some(k=>k.startsWith(c.LORD_SECONDARY.PREFIX)));
  assert(!h.warnings.length,h.warnings.join('\n'));
});

const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,total:results.length,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),environment:'Offline VM with in-memory Google service fakes; no live deployment or browser verification',results};
fs.writeFileSync(path.join(__dirname,'backend_131_results.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total},null,2));
for(const failure of results.filter(r=>!r.ok)) console.error(failure.name+'\n'+failure.error);
process.exitCode=report.failed?1:0;
