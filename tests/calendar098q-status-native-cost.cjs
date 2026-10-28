'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock}=require('./calendar/calendar_api_mock.cjs');
const results=[];
function test(name,work){try{work();results.push({name,ok:true});console.log('PASS',name);}catch(error){results.push({name,ok:false,error:error.message});console.error('FAIL',name,error.stack);}}
function fixture(count=6,sourcePath){
 const h=makeHarness(sourcePath?{sourcePath}:{}),api=makeCalendarApiMock();h.sandbox.Calendar=api.api;
 const calendarId=h.sandbox.setting_('STAFF_CALENDAR_ID');api.seedCalendar({id:calendarId});
 h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(row=>h.sandbox.legacyLaneScheduleRows_(row)));
 h.seed('Events',Array.from({length:count},(_,i)=>({...h.base,EventID:'Q-EVENT-'+i,StaffCalendarEventId:i<6?'':'UNCHANGED-'+i,ParentCalendarEventId:'',StaffSyncHash:'',StaffSyncState:i<6?'PENDING_SYNC':'SYNCED'})));
 return {...h,api,calendarId,start:()=>h.call('startSyncYear',{year:2026,target:'staff'}),batch:syncRunId=>h.call('syncYearBatch',{syncRunId}),status:syncRunId=>h.call('calendarSyncStatus',{syncRunId,year:2026,target:'staff'})};
}
function sheets(h){return JSON.stringify([...h.sheets].map(([name,sheet])=>[name,sheet.values]));}
function readOnly(h,work){const source=sheets(h),properties=JSON.stringify([...h.props]),providers=h.api.calls.length,writes=h.audit.writes,flushes=h.audit.flushes;const value=work();assert.equal(sheets(h),source);assert.equal(JSON.stringify([...h.props]),properties);assert.equal(h.api.calls.length,providers);assert.equal(h.audit.writes,writes);assert.equal(h.audit.flushes,flushes,'Read-only status must not flush Sheets');return value;}
function auditSummary(h,id){const sheet=h.sheets.get('AuditLog'),column=sheet.values[0].indexOf('AuditID');return sheet.values.find(row=>row[column]==='AUD-SYNC-'+crypto.createHash('sha256').update(id).digest('hex'));}

test('status checks the exact active run without provider, Sheet or Properties writes',()=>{
 const h=fixture(),s=h.start(),r=readOnly(h,()=>h.status(s.syncRunId));
 assert.equal(r.syncRunId,s.syncRunId);assert.equal(r.year,2026);assert.equal(r.target,'staff');assert.equal(r.completed,false);assert.equal(r.inProgress,false);assert.equal(r.readyToResume,true);assert.equal(r.counts.errorCount,0);assert.deepEqual(r.counts.errors,[]);
});
test('status preserves live claim and cooldown, while saved settlement may resume without waiting a lease',()=>{
 const h=fixture(),s=h.start(),session=h.sandbox.readCalendarSyncSession_();
 session.claim={id:'claim-q',expiresAt:h.sandbox.Date.now()+420000,items:[]};h.sandbox.writeCalendarSyncSession_(session);
 let r=readOnly(h,()=>h.status(s.syncRunId));assert.equal(r.inProgress,true);assert.equal(r.readyToResume,false);assert(r.retryAfterMs>=1200);
 session.pendingSettlement={claimId:'claim-q',outcomes:[],providerBatch:{attempts:0,lastThrottleAt:null},fatal:null};h.sandbox.writeCalendarSyncSession_(session);
 r=readOnly(h,()=>h.status(s.syncRunId));assert.equal(r.inProgress,false);assert.equal(r.readyToResume,true);
 session.pauseReason='SOURCE_READ_RATE_LIMIT';session.nextAttemptEpochMs=h.sandbox.Date.now()+60000;h.sandbox.writeCalendarSyncSession_(session);
 r=readOnly(h,()=>h.status(s.syncRunId));assert.equal(r.paused,true);assert.equal(r.readyToResume,false);assert(r.retryAfterMs>50000);assert.equal(r.pauseReason,'SOURCE_READ_RATE_LIMIT');
});
test('status recovers exact deterministic completion, without starting a new run or retrying old failures',()=>{
 const h=fixture(1),s=h.start();const done=h.batch(s.syncRunId);assert(done.completed);
 const r=readOnly(h,()=>h.status(s.syncRunId));assert.equal(r.completed,true);assert.equal(r.completionState,'complete');assert.equal(r.writes,1);assert.equal(r.counts.staffCreates,1);assert.equal(r.counts.errorCount,0);assert.equal(r.readyToResume,false);assert.equal(r.fullySynced,true);assert.equal(r.remaining,0);
 assert.throws(()=>h.call('calendarSyncStatus',{syncRunId:s.syncRunId,year:2027,target:'staff'}),e=>e.code==='SYNC_STATUS_MISMATCH'&&e.definite);
 assert.throws(()=>h.call('calendarSyncStatus',{syncRunId:s.syncRunId,year:2026,target:'parent'}),e=>e.code==='SYNC_STATUS_MISMATCH'&&e.definite);
 assert.throws(()=>h.status('SYNC-nonexistent'),e=>e.code==='SYNC_STATUS_MISSING'&&e.definite);
});
test('large completion history has a compact error count and preserves blocked totals',()=>{
 const h=fixture(),s=h.start(),session=h.sandbox.readCalendarSyncSession_();
 session.counts.errors=Array.from({length:300},(_,i)=>({eventId:'FAILED-'+i,target:'staff',error:'Synthetic old failure '.repeat(10)}));session.failedIds=session.counts.errors.map(row=>row.eventId);session.processedTotal=300;session.initialPending=301;session.remaining=1;session.blockedEvents=[{eventId:'BLOCKED',code:'PENDING_EVENT_WRITE'}];
 h.sandbox.finaliseCalendarSyncSession_(h.actor('admin'),session,'synthetic-final');
 const r=readOnly(h,()=>h.status(s.syncRunId));assert.equal(r.counts.errorCount,300);assert.deepEqual(r.counts.errors,[]);assert.equal(r.blockedCount,1);assert.equal(r.remaining,1);assert.equal(r.completionState,'blocked');assert.equal(r.fullySynced,false);assert(JSON.stringify(r).length<2000);
});
test('chunked completion requires explicit totals and matching detail references',()=>{
 for(const kind of ['missing-count','mismatched-reference']){const h=fixture(),s=h.start(),session=h.sandbox.readCalendarSyncSession_();
  session.counts.errors=Array.from({length:300},(_,i)=>({eventId:'FAILED-'+i,target:'staff',error:'Synthetic old failure '.repeat(10)}));session.failedIds=session.counts.errors.map(row=>row.eventId);session.processedTotal=300;session.initialPending=301;session.remaining=1;session.blockedEvents=[{eventId:'BLOCKED',code:'PENDING_EVENT_WRITE'}];h.sandbox.finaliseCalendarSyncSession_(h.actor('admin'),session,'synthetic-final');
  const row=auditSummary(h,s.syncRunId),column=h.sheets.get('AuditLog').values[0].indexOf('AfterJSON'),saved=JSON.parse(row[column]);
  if(kind==='missing-count')delete saved.counts.errorCount;else saved.counts.history.sha256='0'.repeat(64);row[column]=JSON.stringify(saved);
  assert.throws(()=>h.status(s.syncRunId),e=>e.code==='SYNC_STATUS_UNREADABLE'&&e.definite,kind);
 }
});
test('status stops on corrupted or duplicate exact completion evidence and never substitutes latest history',()=>{
 for(const kind of ['json','identity','count','duplicate']){const h=fixture(1),s=h.start();h.batch(s.syncRunId);const row=auditSummary(h,s.syncRunId),sheet=h.sheets.get('AuditLog'),headers=sheet.values[0],after=headers.indexOf('AfterJSON');assert(row);
  if(kind==='duplicate')sheet.values.push([...row]);else if(kind==='json')row[after]='broken';else{const data=JSON.parse(row[after]);if(kind==='identity')data.syncRunId='SYNC-other';else data.counts.staffCreates=-1;row[after]=JSON.stringify(data);}
  assert.throws(()=>h.status(s.syncRunId),e=>['SYNC_STATUS_UNREADABLE','SYNC_STATUS_MISMATCH'].includes(e.code)&&e.definite,kind);
 }
});
test('status denies non-admin and a role revoked while waiting for its lock before reading any checkpoint',()=>{
 const h=fixture(),s=h.start();assert.throws(()=>h.call('calendarSyncStatus',{syncRunId:s.syncRunId,year:2026,target:'staff'},'publisher'),e=>e.status===403);
 const get=h.sandbox.LockService.getScriptLock;let sessionReads=0;const read=h.sandbox.readCalendarSyncSession_;h.sandbox.readCalendarSyncSession_=()=>{sessionReads++;return read();};
 h.sandbox.LockService.getScriptLock=()=>{const lock=get();return {...lock,tryLock(ms){const sheet=h.sheets.get('Users'),headers=sheet.values[0];sheet.values[1][headers.indexOf('IsAdmin')]='No';return lock.tryLock(ms);}};};
 assert.throws(()=>h.status(s.syncRunId),e=>e.status===403);assert.equal(sessionReads,0);
});
test('status keeps unreadable checkpoint and cannot mistake it for completion',()=>{
 const h=fixture(),s=h.start();h.props.set('CALV2_ACTIVE_CALENDAR_SYNC','bad-json');const before=JSON.stringify([...h.props]);assert.throws(()=>h.status(s.syncRunId),e=>e.code==='SYNC_CHECKPOINT_UNREADABLE'&&e.definite);assert.equal(JSON.stringify([...h.props]),before);
});
test('current-session recovery preserves 20 prior creates and 30 historical errors, then explicitly retries only those errors',()=>{
 const h=fixture(81);h.seed('Events',Array.from({length:81},(_,i)=>({...h.base,EventID:'Q-EVENT-'+i,StaffCalendarEventId:'',ParentCalendarEventId:'',StaffSyncHash:'',StaffSyncState:'PENDING_SYNC'})));
 let current=h.start();for(let batch=0;batch<4;batch++){h.advanceClock(2000);current=h.batch(current.syncRunId);}
 assert.equal(current.counts.staffCreates,20);assert.equal(h.api.live(h.calendarId).length,20);
 const source=h.sheets.get('Events'),stateColumn=source.values[0].indexOf('StaffSyncState');
 for(let index=20;index<50;index++)source.values[index+1][stateColumn]='ERROR';
 const journal=h.sheets.get('MutationLog'),receipt={OperationID:'Q-original-uncertain-save',UserAlias:'admin',Action:'saveEvent',PayloadHash:'original-payload-hash',State:'DISPATCHED',EventID:'Q-EVENT-80',CreatedAt:'2026-10-28T02:00:00Z',UpdatedAt:'2026-10-28T02:00:00Z'};
 journal.values.push(journal.values[0].map(key=>receipt[key]||''));const receiptBefore=JSON.stringify(journal.values.at(-1)),blockedBefore=JSON.stringify(source.values[81]);
 const saved=h.sandbox.readCalendarSyncSession_();saved.failedIds=Array.from({length:30},(_,i)=>'Q-EVENT-'+(i+20));saved.counts.errors=saved.failedIds.map(eventId=>({eventId,target:'staff',error:'Run upgradeCalendarToRC19() once in Apps Script before using Calendar writes.'}));saved.processedTotal=50;saved.remaining=31;saved.actionableRemaining=30;saved.blockedEvents=[{eventId:'Q-EVENT-80',code:'PENDING_EVENT_WRITE'}];h.sandbox.writeCalendarSyncSession_(saved);
 const firstRun=saved.syncRunId,writesBefore=h.api.calls.filter(call=>['Events.insert','Events.update','Events.remove'].includes(call.method)).length;
 const before=readOnly(h,()=>h.status(firstRun));assert.equal(before.counts.staffCreates,20);assert.equal(before.counts.errorCount,30);assert.equal(before.remaining,31);assert.equal(before.actionableRemaining,30);assert.equal(before.blockedCount,1);
 let batches=0;do{h.advanceClock(2000);current=h.batch(firstRun);assert(++batches<=6);}while(!current.completed);
 assert.equal(batches,6);assert.equal(current.counts.staffCreates,50);assert.equal(current.counts.errors.length,30);assert.equal(current.blockedCount,1);assert.equal(h.api.live(h.calendarId).length,50);
 const firstCompleted=readOnly(h,()=>h.status(firstRun));assert.equal(firstCompleted.completed,true);assert.equal(firstCompleted.counts.errorCount,30);assert.equal(firstCompleted.counts.staffCreates,50);assert.equal(firstCompleted.remaining,1);assert.equal(firstCompleted.actionableRemaining,0);
 h.advanceClock(2000);let later=h.start();assert.notEqual(later.syncRunId,firstRun);assert.equal(later.initialPending,31);const laterRun=later.syncRunId;
 const laterStatus=readOnly(h,()=>h.status(laterRun));assert.equal(laterStatus.counts.errorCount,0);assert.equal(laterStatus.counts.staffCreates,0);assert.equal(readOnly(h,()=>h.status(firstRun)).counts.errorCount,30,'Starting another run must not rewrite the previous history');
 batches=0;do{h.advanceClock(2000);later=h.batch(laterRun);assert(++batches<=6);}while(!later.completed);
 const finalStatus=readOnly(h,()=>h.status(laterRun));assert.equal(batches,6);assert.equal(finalStatus.counts.staffCreates,30);assert.equal(finalStatus.counts.errorCount,0);assert.equal(finalStatus.blockedCount,1);assert.equal(finalStatus.completionState,'blocked');assert.equal(finalStatus.fullySynced,false);
 const providerWrites=h.api.calls.filter(call=>['Events.insert','Events.update','Events.remove'].includes(call.method)),newWrites=providerWrites.slice(writesBefore);
 assert.equal(newWrites.length,60);assert(newWrites.every(call=>call.method==='Events.insert'&&call.committed));assert.equal(new Set(newWrites.map(call=>call.id)).size,60);assert.equal(h.api.live(h.calendarId).length,80);
 const receiptAfter=journal.values.find(row=>row[journal.values[0].indexOf('OperationID')]===receipt.OperationID);assert.equal(JSON.stringify(receiptAfter),receiptBefore);assert.equal(JSON.stringify(source.values[81]),blockedBefore);
 fs.mkdirSync('verification/v098q',{recursive:true});fs.writeFileSync('verification/v098q/calendar-current-session-recovery.json',JSON.stringify({fixture:{priorCreates:20,retainedUpgradeErrors:30,ready:30,uncertainSourceReceipts:1},before,firstCompleted,laterStarted:laterStatus,finalStatus,newProviderWrites:newWrites.length,uniqueNewProviderIds:new Set(newWrites.map(call=>call.id)).size,totalProviderEvents:h.api.live(h.calendarId).length,uncertainReceiptUnchanged:true,blockedSourceUnchanged:true,note:'Synthetic replay against final Q; no live services contacted.'},null,2));
});
test('native projections coalesce only adjacent requested columns and retain blank rows and field order',()=>{
 const h=fixture(3),sheet=h.sheets.get('Events');sheet.values.splice(2,0,[]);h.sandbox.rc18ResetIO_();h.audit.nativeReads=[];
 const fields=['Status','EventID','Year','StaffTitle'];const rows=h.sandbox.rc18Projection_(sheet,fields);
 assert.equal(rows.length,4);assert.deepEqual(Object.keys(rows[0].object),fields);assert.equal(rows[3].row,5);assert.equal(rows[3].object.StaffTitle,h.base.StaffTitle);assert.deepEqual(JSON.parse(JSON.stringify(rows[1])),{row:3,object:{Status:'',EventID:'',Year:'',StaffTitle:''}});
 const reads=h.audit.nativeReads.filter(r=>r.sheet==='Events'&&r.row===2);assert.equal(reads.length,2,'A:C and the separately requested title need only two native reads');assert.deepEqual(reads.map(r=>[r.col,r.cols]),[[1,3],[7,1]]);
 assert.equal(reads.reduce((n,r)=>n+r.rows*r.cols,0),16,'Do not read any unrequested intervening columns');
});
function measure(sourcePath){
 const h=fixture(1295,sourcePath),s=h.start();let now=Date.parse('2026-10-28T04:00:00Z'),locks=0;
 h.sandbox.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};h.sandbox.Utilities.sleep=ms=>{now+=ms;};
 const get=h.sandbox.LockService.getScriptLock;h.sandbox.LockService.getScriptLock=()=>{const lock=get();return {...lock,tryLock(ms){locks++;return lock.tryLock(ms);}};};
 h.setFault(stage=>{if(stage==='nativeReadBefore')now+=250;else if(stage==='before')now+=300;else if(stage==='flush')now+=200;});h.api.setFault(stage=>{if(stage==='before')now+=100;});
 function batch(){h.audit.reads=0;h.audit.readCells=0;h.audit.writes=0;h.audit.flushes=0;h.api.calls.length=0;locks=0;const start=now,result=h.batch(s.syncRunId);return {reads:h.audit.reads,readCells:h.audit.readCells,writes:h.audit.writes,flushes:h.audit.flushes,locks,providerCalls:h.api.calls.length,modeledMs:now-start,counts:result.counts};}
 const creates=batch();now+=2000;const sheet=h.sheets.get('Events'),headers=sheet.values[0];for(let i=1;i<=5;i++){sheet.values[i][headers.indexOf('StaffTitle')]='Changed '+i;sheet.values[i][headers.indexOf('StaffSyncState')]='PENDING_SYNC';}const updates=batch();
 assert.equal(creates.counts.staffCreates,5);assert.equal(updates.counts.staffUpdates,5);
 return {creates,updates};
}
test('1295-row batches preserve every lock/provider call and reduce flushes and native reads versus P',()=>{
 const prior=measure(path.resolve('Calendar_Backend_v0.9.8p.gs')),current=measure();
 const evidence={note:'Synthetic service-latency model, not measured live Google throughput. Reads250ms; native writes300ms; flush200ms; provider100ms. Count comparisons execute real retained P and current backend with the same fixture.',rows:1295,prior,current};
 fs.mkdirSync('verification/v098q',{recursive:true});fs.writeFileSync('verification/v098q/calendar-native-cost.json',JSON.stringify(evidence,null,2));
 for(const kind of ['creates','updates']){assert.equal(current[kind].locks,prior[kind].locks,'Preserve all authority/source/identity lock boundaries');assert.equal(current[kind].providerCalls,prior[kind].providerCalls);assert.equal(current[kind].writes,prior[kind].writes);assert.equal(current[kind].readCells,prior[kind].readCells,'No widened projection');assert(current[kind].flushes<=prior[kind].flushes-20,kind+' should omit at least20 audited non-writing flushes');assert(current[kind].reads<=prior[kind].reads-4,kind+' should coalesce adjacent requested columns');assert(current[kind].modeledMs<=prior[kind].modeledMs-4000,kind+' modeled service latency should improve');}
});
fs.mkdirSync('verification/v098q',{recursive:true});fs.writeFileSync('verification/v098q/calendar-status-native-cost.json',JSON.stringify({total:results.length,passed:results.filter(r=>r.ok).length,results},null,2));process.exitCode=results.some(r=>!r.ok)?1:0;
