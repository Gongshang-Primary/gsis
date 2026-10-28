'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock}=require('./calendar/calendar_api_mock.cjs');
const tests=[];
const op=()=>crypto.randomUUID();
function test(name,run){try{run();tests.push({name,ok:true});}catch(e){tests.push({name,ok:false});console.error('FAIL',name,e.stack);}}
function fixture(){
  const h=makeHarness({sourcePath:process.env.GSIS_CALENDAR_SOURCE});
  h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(l=>h.sandbox.legacyLaneScheduleRows_(l)));
  h.seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'},
    {Year:2027,Status:'PLANNING',ReleasedToTeachers:'No',RamadanStart:'2027-02-08',RamadanEnd:'2027-03-09',MOECalendarURL:'https://example.test/moe',MUISCalendarURL:'https://example.test/muis',CreatedAt:'saved-created',CreatedBy:'saved-owner'},
    {Year:2028,Status:'PLANNING',ReleasedToTeachers:'No'}]);
  const base={...h.base,Year:2027,StartDate:'2027-01-04',EndDate:'2027-01-04',Status:'HIDDEN',StaffCalendarEventId:'',ParentCalendarEventId:'',ParentEnabled:'No'};
  h.seed('Events',[{...base,EventID:'H7'},{...base,EventID:'P7',Status:'PUBLISHED'},
    {...base,EventID:'HP7',ParentEnabled:'Yes'},
    {...base,EventID:'D7',DeletedAt:'2026-10-13'},
    {...base,EventID:'H8',Year:2028,StartDate:'2028-01-03',EndDate:'2028-01-03'},
    {...base,EventID:'H6',Year:2026,StartDate:'2026-01-05',EndDate:'2026-01-05'}]);
  return h;
}
const yearRow=(h,y=2027)=>h.sandbox.findRowByKey_(h.sheets.get('Years'),'Year',y).object;
const rows=h=>h.sandbox.tableObjects_(h.sheets.get('Events'));
const eligible=(h,target='staff')=>{const map={};h.sandbox.configCached_().lanes.forEach(l=>map[l.LaneID]=l);
  return h.sandbox.eligibleSyncRows_(h.sheets.get('Events'),2027,target,[],yearRow(h),map).map(x=>x.object.EventID);};

test('Published planning event is Staff eligible before year release, even old SYNCED/no link',()=>{
  const h=fixture();assert.deepEqual(Array.from(eligible(h)),['P7']);
  assert.throws(()=>h.call('bootstrap',{year:2027},'teacher'),e=>e.code==='YEAR_UNAVAILABLE');
  assert.equal(yearRow(h).ReleasedToTeachers,'No');assert.equal(h.audit.apiWrites.length,0);
});
test('New Published event gets pending Staff sync in unreleased planning year',()=>{
  const h=fixture(),draft={...h.event('P7'),EventID:'',StaffTitle:'New event'};
  const saved=h.call('saveEvent',{event:draft,operationId:op()});
  assert.equal(saved.StaffSyncState,'PENDING_SYNC');assert(eligible(h).includes(saved.EventID));
  assert.equal(yearRow(h).ReleasedToTeachers,'No');
});
test('Planning default remains Hidden and active default remains Published',()=>{
  const h=fixture();for(const year of [2026,2027]){const event={...h.event('P7'),EventID:'',Year:year,StartDate:year+'-01-04',EndDate:year+'-01-04'};delete event.Status;
    const saved=h.call('saveEvent',{event,operationId:op()});assert.equal(saved.Status,year===2027?'HIDDEN':'PUBLISHED');}
});
test('Staff eligibility preserves disabled columns and hidden/deleted linked removals',()=>{
  const h=fixture(),base=h.event('P7');h.seed('Events',[
    {...base,EventID:'off',LaneID:'non-sync',StaffSyncState:'PENDING_SYNC'},
    {...base,EventID:'hidden',Status:'HIDDEN',StaffCalendarEventId:'LINK-H',StaffSyncState:'PENDING_SYNC'},
    {...base,EventID:'deleted',DeletedAt:'2026-10-13',StaffCalendarEventId:'LINK-D',StaffSyncState:'PENDING_REMOVAL'},
    {...base,EventID:'done',StaffCalendarEventId:'LINK-P',StaffSyncState:'SYNCED'}]);
  assert.deepEqual(Array.from(eligible(h)),['hidden','deleted']);
});
test('Publish version releases only selected year and publishes every live Hidden event',()=>{
  const h=fixture(),before={...yearRow(h)},result=h.call('publishVersion',{year:2027,operationId:op()});
  assert.equal(result.published,2);assert.equal(result.year,2027);assert.equal(result.ReleasedToTeachers,'Yes');
  for(const id of ['H7','HP7','P7']){assert.equal(h.event(id).Status,'PUBLISHED');assert.equal(h.event(id).StaffSyncState,'PENDING_SYNC');}
  for(const id of ['D7','H8','H6'])assert.equal(h.event(id).Status,'HIDDEN');
  for(const key of ['Status','RamadanStart','RamadanEnd','MOECalendarURL','MUISCalendarURL','CreatedAt','CreatedBy'])assert.equal(yearRow(h)[key],before[key]);
  assert.equal(yearRow(h,2028).ReleasedToTeachers,'No');assert.equal(h.event('H7').ParentEnabled,'No');
  assert.equal(h.event('H7').ParentSyncState,'SYNCED');assert.equal(h.event('HP7').ParentSyncState,'PENDING_SYNC');
  assert.equal(h.audit.calendarCalls.length,0);
  const ids=new Set(h.audit.nativeWrites.map(row=>row.sheet));
  for(const name of ['Years','Events','AuditLog','MutationLog'])assert(ids.has(name),name);
  assert.equal(h.audit.apiWrites.length,0);const receipt=h.sandbox.tableObjects_(h.sheets.get('MutationLog'))[0];assert.equal(receipt.State,'COMMITTED');
  assert(h.call('bootstrap',{year:2027},'teacher').events.every(e=>e.Status==='PUBLISHED'));
});
test('Already released version publishes newly Hidden events on a fresh operation',()=>{
  const h=fixture();h.call('publishVersion',{year:2027,operationId:op()});
  const added={...h.event('H7'),EventID:'LATER',Status:'HIDDEN',StaffSyncState:'SYNCED'};
  h.seed('Events',rows(h).concat(added));
  assert.equal(h.call('publishVersion',{year:2027,operationId:op()}).published,1);
  assert.equal(h.event('LATER').Status,'PUBLISHED');
});
test('Retry of same operation returns receipt without publishing later Hidden edits',()=>{
  const h=fixture(),payload={year:2027,operationId:op()},first=h.call('publishVersion',payload);
  h.seed('Events',rows(h).concat({...h.event('H7'),EventID:'LATER',Status:'HIDDEN'}));
  const writes=h.audit.apiWrites.length;assert.deepEqual(h.call('publishVersion',payload),first);
  assert.equal(h.event('LATER').Status,'HIDDEN');assert.equal(h.audit.apiWrites.length,writes);
  assert.throws(()=>h.call('publishVersion',{...payload,year:2028}),e=>e.code==='OPERATION_MISMATCH');
});
test('Only Admin can publish and invalid/archived years do not write',()=>{
  for(const alias of ['teacher','publisher']){const h=fixture();assert.throws(()=>h.call('publishVersion',{year:2027,operationId:op()},alias),e=>e.status===403);assert.equal(h.audit.apiWrites.length,0);}
  for(const year of [0,2029,2027.5]){const h=fixture();assert.throws(()=>h.call('publishVersion',{year,operationId:op()}),e=>e.definite===true);assert.equal(h.audit.apiWrites.length,0);}
  const h=fixture();h.seed('Years',[{Year:2027,Status:'ARCHIVED'}]);assert.throws(()=>h.call('publishVersion',{year:2027,operationId:op()}),e=>e.code==='YEAR_UNAVAILABLE');assert.equal(h.audit.apiWrites.length,0);
});
test('Missing operation identity and busy lock cannot publish',()=>{
  const h=fixture();assert.throws(()=>h.call('publishVersion',{year:2027}),e=>e.code==='OPERATION_ID_REQUIRED');
  h.setLocked(true);assert.throws(()=>h.call('publishVersion',{year:2027,operationId:op()}),e=>e.code==='BUSY');assert.equal(h.audit.apiWrites.length,0);
});
test('Lost native committed receipt response recovers the publication',()=>{
  const h=fixture(),payload={year:2027,operationId:op()};
  h.setFault((stage,w)=>{if(stage==='after'&&w.sheet==='MutationLog'&&w.values.some(row=>row.includes('COMMITTED')))throw Error('Lost response');});
  const result=h.call('publishVersion',payload);assert.equal(result.published,2);assert.equal(h.event('H7').Status,'PUBLISHED');
  h.setFault(null);assert.deepEqual(h.call('publishVersion',payload),result);
});
test('Ambiguous publication cannot partly release and fences later publication or year/event edits',()=>{
  const h=fixture(),payload={year:2027,operationId:op()},before=h.event('H7');
  h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Years')throw Error('Ambiguous write failure');});
  assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='UNKNOWN');h.setFault(null);
  assert.equal(yearRow(h).ReleasedToTeachers,'No');assert.equal(h.event('H7').Status,'HIDDEN');
  assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='UNKNOWN');
  assert.throws(()=>h.call('publishVersion',{year:2027,operationId:op()}),e=>e.code==='PENDING_EVENT_WRITE');
  assert.throws(()=>h.call('saveYear',{Year:2027,Status:'PLANNING',ReleasedToTeachers:'No'}),e=>e.code==='PENDING_EVENT_WRITE');
  assert.throws(()=>h.call('saveEvent',{event:{...before,StaffTitle:'Changed'},expectedRevision:before._revision,operationId:op()}),e=>e.code==='PENDING_EVENT_WRITE');
  assert.throws(()=>h.call('saveEvent',{event:{...before,EventID:''},operationId:op()}),e=>e.code==='PENDING_EVENT_WRITE');
});
test('Publication cannot overtake a dispatched new event with unknown outcome',()=>{
  const h=fixture();h.seed('MutationLog',[{OperationID:op(),UserAlias:'admin',Action:'saveEvent',State:'DISPATCHED',EventID:'NOT-YET-PRESENT'}]);
  assert.throws(()=>h.call('publishVersion',{year:2027,operationId:op()}),e=>e.code==='PENDING_EVENT_WRITE');assert.equal(h.audit.apiWrites.length,0);
});
test('Unknown publication globally fences other-year row edits, archive and Calendar sync',()=>{
  const h=fixture();h.seed('MutationLog',[{OperationID:op(),UserAlias:'admin',Action:'publishVersion',State:'DISPATCHED',EventID:'YEAR:2027'}]);
  const provider=makeCalendarApiMock(),calendarId=h.sandbox.setting_('STAFF_CALENDAR_ID');h.sandbox.Calendar=provider.api;provider.seedCalendar({id:calendarId});
  const source=()=>JSON.stringify([...h.sheets].map(([name,sheet])=>[name,sheet.values])),properties=()=>JSON.stringify([...h.props]);
  const beforeSource=source(),beforeProperties=properties();
  const unchanged=expectedProperties=>{assert.equal(source(),beforeSource);assert.equal(properties(),expectedProperties);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);assert.equal(provider.calls.length,0,'Publication fencing must prevent actual provider reads and writes');};
  const event=h.event('H6');assert.throws(()=>h.call('saveEvent',{event:{...event,StaffTitle:'Other year edit'},expectedRevision:event._revision,operationId:op()}),e=>e.code==='PENDING_EVENT_WRITE');
  // Keep the archive preview read-only fixture small; execute its real lock and write boundary.
  h.sandbox.normaliseArchiveSelections_=()=>[];
  h.sandbox.archivePreviewData_=()=>({years:[2026],selections:[]});
  h.sandbox.archiveConfirmationPhrase_=()=> 'ARCHIVE';
  assert.throws(()=>h.call('archiveYearsCommit',{confirmationPhrase:'ARCHIVE',confirmed:'Yes'}),e=>e.code==='PENDING_EVENT_WRITE');
  assert.throws(()=>h.call('startSyncYear',{year:2026,target:'staff'}),e=>e.code==='PENDING_EVENT_WRITE');
  // Session validation/cooldown precede the key scan so waiting jobs do not
  // repeatedly spend native reads; a missing session still fails closed.
  assert.throws(()=>h.call('syncYearBatch',{syncRunId:'synthetic-sync'}),/sync session is no longer active/);unchanged(beforeProperties);
  const session={syncRunId:'synthetic-sync',target:'staff',year:2026,calendarId,counts:h.sandbox.emptySyncCounts_(),failedIds:[],initialPending:1,processedTotal:0,remaining:1,startedEpochMs:Date.now(),startedBy:'admin'};
  h.sandbox.writeCalendarSyncSession_(session);const activeProperties=properties();
  assert.throws(()=>h.call('syncYearBatch',{syncRunId:session.syncRunId}),e=>e.code==='PENDING_EVENT_WRITE');unchanged(activeProperties);
  for(const state of ['paused','claimed']){
    h.sandbox.writeCalendarSyncSession_({...session,...(state==='paused'?{pauseReason:'SOURCE_READ_RATE_LIMIT',nextAttemptEpochMs:Date.now()+60000}:{claim:{id:'synthetic-claim',expiresAt:Date.now()+60000,items:[]}})});
    const before=properties(),progress=h.call('syncYearBatch',{syncRunId:session.syncRunId});assert.equal(progress[state==='paused'?'paused':'inProgress'],true);unchanged(before);
  }
  assert.equal(h.event('H6').StaffTitle,event.StaffTitle);
});
test('Oversized publication is definitely rejected before any business write and retry stays rejected',()=>{
  const h=fixture(),event=h.event('H7'),payload={year:2027,operationId:op()};
  h.seed('Events',Array.from({length:2500},(_,i)=>({...event,EventID:'BULK-'+i})));
  assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='WRITE_BATCH_TOO_LARGE'&&e.definite===true);
  assert.equal(yearRow(h).ReleasedToTeachers,'No');assert.equal(h.event('BULK-0').Status,'HIDDEN');
  assert.equal(h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),payload.operationId).object.State,'REJECTED');
  const writes=h.audit.apiWrites.length;assert.throws(()=>h.call('publishVersion',payload),e=>e.code==='WRITE_BATCH_TOO_LARGE'&&e.definite===true);assert.equal(h.audit.apiWrites.length,writes);
});
test('Proxy authentication applies to Publish version',()=>{
  const h=fixture(),request={action:'publishVersion',payload:{year:2027,operationId:op()},actor:h.actor('admin'),proxySecret:'wrong'};
  const result=JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify(request)}}).text);assert.equal(result.ok,false);assert.equal(h.audit.apiWrites.length,0);
});
console.log(JSON.stringify({passed:tests.filter(t=>t.ok).length,total:tests.length}));
if(tests.some(t=>!t.ok))process.exitCode=1;
