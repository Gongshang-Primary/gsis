'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock,apiError}=require('./calendar/calendar_api_mock.cjs');
const tests=[];
function test(name,run){try{run();tests.push({name,ok:true});}catch(error){tests.push({name,ok:false});console.error('FAIL',name,error.stack);}}
const staffId='staff@example.test',parentId='parent@example.test';
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(options={}){
  const h=makeHarness({sourcePath:process.env.GSIS_CALENDAR_SOURCE});
  const api=makeCalendarApiMock(options);h.sandbox.Calendar=api.api;
  api.seedCalendar({id:staffId,summary:'Staff',accessRole:options.role||'writer'});
  api.seedCalendar({id:parentId,summary:'Parents'});
  h.seed('Settings',h.sandbox.tableObjects_(h.sheets.get('Settings')).map(row=>({...row,Value:row.Key==='STAFF_CALENDAR_ID'?staffId:row.Key==='PARENT_CALENDAR_ID'?parentId:row.Value})));
  h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(lane=>h.sandbox.legacyLaneScheduleRows_(lane)));
  const ev={...h.base,StaffCalendarEventId:'',ParentCalendarEventId:'',StaffSyncHash:'',ParentSyncHash:'',StaffSyncState:'PENDING_SYNC',ParentSyncState:'PENDING_SYNC'};
  h.seed('Events',[ev]);
  const sync=(event=ev,target='staff',desired=true)=>{
    h.sandbox.rc18ResetIO_();
    return h.sandbox.syncTarget_({id:target==='staff'?staffId:parentId,summary:target,timeZone:'Asia/Singapore'},target,event,desired);
  };
  const link=(event=ev,target='staff')=>plain(h.sandbox.calendarApiLink_(target,target==='staff'?staffId:parentId,event));
  return {...h,api,ev,sync,link};
}
function remote(overrides={}){
  return {id:'0abc123',iCalUID:'legacy.fixture@example.test',summary:'Old title',description:'Old description',location:'Old room',
    start:{dateTime:'2026-09-14T14:15:00+08:00',timeZone:'Asia/Singapore'},end:{dateTime:'2026-09-14T15:15:00+08:00',timeZone:'Asia/Singapore'},...overrides};
}
const calls=(h,method)=>h.api.calls.filter(call=>call.method===method);
const noMutations=h=>assert.equal(h.api.calls.filter(call=>['Events.insert','Events.update','Events.remove'].includes(call.method)).length,0);
function finishRemoval(h,target){
  const context=h.sandbox.syncYearContext_(2026,target);
  const pending=h.sandbox.eligibleSyncRows_(context.eventsSheet,2026,target,[],context.yearRow,context.laneMap);
  assert.deepEqual(Array.from(pending,row=>row.object.EventID),['E1']);
  const started=h.call('startSyncYear',{year:2026,target});
  assert.equal(started.completed,false);assert.equal(started.initialPending,1);
  const finished=h.call('syncYearBatch',{syncRunId:started.syncRunId});
  assert.equal(finished.completed,true);assert.equal(finished.remaining,0);assert.equal(finished.counts.errors.length,0);
  assert.equal(finished.counts[target+'Deletes'],1);
  assert.equal(h.api.live(target==='staff'?staffId:parentId).length,0);
  assert.equal(h.link(h.ev,target).state,'removed');
  assert.equal(h.event('E1')[target==='staff'?'StaffSyncState':'ParentSyncState'],'SYNCED');
}

test('First sync stores typed REST mapping and keeps the public event link as iCalUID',()=>{
  const h=fixture(),result=h.sync(),item=h.api.live(staffId)[0],link=h.link();
  assert.equal(h.api.live(staffId).length,1);assert.match(item.id,/^[a-v0-9]{5,1024}$/);
  assert.equal(result.patch.StaffCalendarEventId,item.iCalUID);assert.notEqual(item.id,item.iCalUID);
  assert.equal(result.patch.StaffSyncState,'SYNCED');assert.equal(link.format,'google-calendar-v3');
  assert.equal(link.apiId,item.id);assert.equal(link.iCalUID,item.iCalUID);assert.equal(link.legacyICalUID,'');assert.equal(link.state,'linked');
  assert.equal(link.calendarId,staffId);assert.equal(link.target,'staff');assert.equal(link.sourceEventId,h.ev.EventID);
  assert.deepEqual(item.extendedProperties.private,plain(h.sandbox.calendarApiOwnership_('staff',h.ev)));
  const second=h.sync({...h.ev,...result.patch});assert.equal(second.action,'none');assert.equal(calls(h,'Events.insert').length,1);
});
test('A legacy iCalUID is resolved on its exact calendar without creating a duplicate',()=>{
  const h=fixture(),existing=remote();h.api.seedEvent(staffId,existing);h.ev.StaffCalendarEventId=existing.iCalUID;
  h.api.seedEvent(parentId,{...existing,id:'0def456',summary:'Different calendar event'});
  const result=h.sync(),link=h.link();
  assert.equal(result.patch.StaffCalendarEventId,existing.iCalUID);assert.equal(link.apiId,existing.id);
  assert.equal(calls(h,'Events.insert').length,0);assert.equal(h.api.live(staffId).length,1);
  assert(calls(h,'Events.list').some(call=>call.calendarId===staffId&&call.params.iCalUID===existing.iCalUID));
  assert(calls(h,'Events.get').every(call=>!String(call.id).includes('@')));
  assert.equal(h.api.read(parentId,'0def456').summary,'Different calendar event');
});
test('Ambiguous legacy links are rejected without adopting or changing either event',()=>{
  const h=fixture();h.ev.StaffCalendarEventId='ambiguous@example.test';
  h.api.seedEvent(staffId,remote({iCalUID:h.ev.StaffCalendarEventId}));
  h.api.seedEvent(staffId,remote({id:'0def456',iCalUID:h.ev.StaffCalendarEventId}));
  assert.throws(()=>h.sync(),/ambiguous|multiple|more than one/i);noMutations(h);
});
test('Recurring legacy events are rejected instead of converting the recurrence master',()=>{
  const h=fixture(),existing=remote({recurrence:['RRULE:FREQ=WEEKLY']});h.ev.StaffCalendarEventId=existing.iCalUID;
  h.api.seedEvent(staffId,existing);assert.throws(()=>h.sync(),/recurr/i);noMutations(h);
});
test('A lost successful insert response recovers the same event and survives a replay',()=>{
  const h=fixture();let failed=false;
  h.api.setFault((stage,call)=>{if(!failed&&stage==='after'&&call.method==='Events.insert'){failed=true;throw apiError(503,'backendError','503 Lost insert response');}});
  try{h.sync();}catch(error){assert.match(error.message,/503|uncertain|unknown|confirm|lost/i);}
  h.api.setFault(null);const result=h.sync();assert(failed);assert.equal(h.api.live(staffId).length,1);
  assert.equal(result.patch.StaffCalendarEventId,h.api.live(staffId)[0].iCalUID);
  assert.equal(new Set(calls(h,'Events.insert').map(call=>call.body.id)).size,1);
  assert.equal(h.link().apiId,h.api.live(staffId)[0].id);
});
test('A failed linked receipt after Calendar success reuses its durable reserved ID',()=>{
  const h=fixture();let blocked=false;
  h.setFault((stage,write)=>{if(stage==='before'&&write.sheet==='MutationLog'&&write.values.flat().some(value=>{
    try{return JSON.parse(String(value)).state==='linked';}catch{return false;}
  })){blocked=true;throw Error('Synthetic linked receipt failure');}});
  assert.throws(()=>h.sync());assert(blocked);assert.equal(h.api.live(staffId).length,1);
  const originalId=h.api.live(staffId)[0].id;
  h.setFault(null);const result=h.sync();assert.equal(h.api.live(staffId).length,1);assert.equal(h.link().apiId,originalId);
  assert.equal(result.patch.StaffCalendarEventId,h.api.live(staffId)[0].iCalUID);assert.equal(calls(h,'Events.insert').length,1);
});
test('A failed durable reservation prevents all external Calendar writes',()=>{
  const h=fixture();h.setFault((stage,write)=>{if(stage==='before'&&write.sheet==='MutationLog')throw Error('Synthetic reservation failure');});
  assert.throws(()=>h.sync());noMutations(h);assert.equal(h.api.live(staffId).length,0);
});
test('409 is recovered only after verifying the existing event owns this source identity',()=>{
  const h=fixture();let raced=false;
  h.api.setFault((stage,call)=>{if(!raced&&stage==='before'&&call.method==='Events.insert'){
    raced=true;h.api.seedEvent(staffId,call.body);throw apiError(409,'duplicate','409 Duplicate event ID');
  }});
  const result=h.sync();assert(raced);assert.equal(h.api.live(staffId).length,1);assert.equal(result.patch.StaffSyncState,'SYNCED');
  assert(calls(h,'Events.get').some(call=>call.id===h.api.live(staffId)[0].id));
});
test('409 from a foreign ID collision never overwrites or deletes that remote event',()=>{
  const h=fixture();let raced=false;
  h.api.setFault((stage,call)=>{if(!raced&&stage==='before'&&call.method==='Events.insert'){
    raced=true;h.api.seedEvent(staffId,{...call.body,summary:'Foreign event',extendedProperties:{private:{gsisSource:'another-workbook'}}});
    throw apiError(409,'duplicate','409 Duplicate event ID');
  }});
  assert.throws(()=>h.sync(),/owner|ownership|belong|mismatch|another|collision/i);
  assert.equal(h.api.live(staffId)[0].summary,'Foreign event');assert.equal(calls(h,'Events.update').length,0);assert.equal(calls(h,'Events.remove').length,0);
});
test('ETag conflict rereads the remote event and preserves concurrent external fields',()=>{
  const h=fixture(),existing=remote({colorId:'4',eventLabelId:'custom-school-label',reminders:{useDefault:false,overrides:[{method:'popup',minutes:20}]},attendees:[{email:'guest@example.test',responseStatus:'accepted'}],extendedProperties:{private:{externalKey:'keep'}}});
  h.api.seedEvent(staffId,existing);h.ev.StaffCalendarEventId=existing.iCalUID;let raced=false;
  h.api.setFault((stage,call)=>{if(!raced&&stage==='before'&&call.method==='Events.update'){
    raced=true;h.api.externalPatch(staffId,existing.id,{colorId:'8',reminders:{useDefault:false,overrides:[{method:'popup',minutes:5}]}});
  }});
  const result=h.sync(),item=h.api.read(staffId,existing.id);assert(raced);assert.equal(result.patch.StaffSyncState,'SYNCED');
  assert.equal(item.summary,'[Mtg] '+h.ev.StaffTitle);assert.equal(item.location,h.ev.Location);
  assert.equal(item.colorId,'8');assert.deepEqual(item.reminders,{useDefault:false,overrides:[{method:'popup',minutes:5}]});
  assert.deepEqual(item.attendees,existing.attendees);assert.equal(item.extendedProperties.private.externalKey,'keep');
  assert.equal(item.eventLabelId,'custom-school-label');assert(calls(h,'Events.update').every(call=>call.params.eventLabelVersion===1));
  assert(calls(h,'Events.update').length>=2);assert(calls(h,'Events.update').every(call=>call.headers['If-Match']));
  assert(calls(h,'Events.get').length>=1);
});
test('403 permission errors stop without blind retries or a false SYNCED event patch',()=>{
  const h=fixture();h.api.setFault((stage,call)=>{if(stage==='before'&&call.method==='Events.insert')throw apiError(403,'forbidden','403 Insufficient calendar permission');});
  assert.throws(()=>h.sync(),/403|permission|forbidden/i);assert.equal(calls(h,'Events.insert').length,1);
  assert.equal(h.event('E1').StaffSyncState,'PENDING_SYNC');assert.equal(h.api.live(staffId).length,0);
});
test('429 rate limiting defers the retry and retains one stable insert ID',()=>{
  const h=fixture();let limited=false;
  h.api.setFault((stage,call)=>{if(!limited&&stage==='before'&&call.method==='Events.insert'){
    limited=true;throw apiError(429,'rateLimitExceeded','429 Rate limit exceeded');
  }});
  assert.throws(()=>h.sync(), error=>error.calendarDeferred);assert(limited);
  const pause=h.sandbox.calendarProviderProgress_();h.advanceClock(pause.retryAfterMs);
  assert.equal(h.sync().patch.StaffSyncState,'SYNCED');
  assert.equal(calls(h,'Events.insert').length,2);assert.equal(new Set(calls(h,'Events.insert').map(call=>call.id)).size,1);assert.equal(h.api.live(staffId).length,1);
});
test('Persistent rate limits stop after a bounded number of attempts with source still pending',()=>{
  const h=fixture();h.api.setFault((stage,call)=>{if(stage==='before'&&call.method==='Events.insert')throw apiError(429,'rateLimitExceeded','429 Rate limit exceeded');});
  assert.throws(()=>h.sync(),/429|rate limit/i);assert.equal(calls(h,'Events.insert').length,1);
  assert.equal(new Set(calls(h,'Events.insert').map(call=>call.id)).size,1);assert.equal(h.api.live(staffId).length,0);
  assert.equal(h.event('E1').StaffSyncState,'PENDING_SYNC');assert.equal(h.link().state,'reserved');
});
test('A denied update cannot silently skip location and report the source synchronized',()=>{
  const h=fixture(),existing=remote();h.api.seedEvent(staffId,existing);h.ev.StaffCalendarEventId=existing.iCalUID;
  h.api.setFault((stage,call)=>{if(stage==='before'&&call.method==='Events.update')throw apiError(403,'forbidden','403 Calendar update denied');});
  assert.throws(()=>h.sync(),/403|denied/i);assert.equal(calls(h,'Events.update').length,1);
  assert.equal(h.api.read(staffId,existing.id).location,existing.location);assert.equal(h.api.read(staffId,existing.id).summary,existing.summary);
  assert.equal(h.event('E1').StaffSyncState,'PENDING_SYNC');assert.equal(calls(h,'Events.insert').length,0);
});
test('Read access alone fails the write capability check before synchronization',()=>{
  const h=fixture({role:'reader'});assert.throws(()=>h.sandbox.syncYearContext_(2026,'staff'),/write|permission|reader|owner|access/i);noMutations(h);
});
test('A missing Advanced Calendar service fails closed before any business write',()=>{
  const h=fixture();delete h.sandbox.Calendar;
  assert.throws(()=>h.sync(),error=>error.code==='CALENDAR_SERVICE_DISABLED');
  assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);noMutations(h);
});
test('Read-only preflight reports read versus write access without creating test events',()=>{
  const h=fixture({role:'reader'}),result=h.call('calendarPreflight',{testWrite:'No'});
  assert.equal(result.testWrite,false);assert.equal(result.staff.accessible,true);assert.equal(result.staff.writable,false);
  assert.equal(result.staff.accessRole,'reader');assert.equal(result.parent.writable,true);noMutations(h);
  assert.equal(h.api.live(staffId).length,0);assert.equal(h.api.live(parentId).length,0);
});
test('A reserved insert deleted before its receipt was saved recovers with a new generation after 410',()=>{
  const h=fixture();
  h.setFault((stage,write)=>{if(stage==='before'&&write.sheet==='MutationLog'&&write.values.flat().some(value=>{
    try{return JSON.parse(String(value)).state==='linked';}catch{return false;}
  }))throw Error('Synthetic linked receipt failure');});
  assert.throws(()=>h.sync());h.setFault(null);
  const original=h.link();assert.equal(original.state,'reserved');
  h.api.api.Events.remove(staffId,original.apiId);
  h.api.setFault((stage,call)=>{if(stage==='before'&&call.method==='Events.get'&&call.id===original.apiId)throw apiError(410,'deleted','410 Resource has been deleted');});
  const result=h.sync(),current=h.link();
  assert.equal(result.patch.StaffSyncState,'SYNCED');assert.notEqual(current.apiId,original.apiId);assert(current.generation>original.generation);
  assert.equal(h.api.live(staffId).length,1);
});
test('Delete records a removed mapping and a later publication uses a fresh generation',()=>{
  const h=fixture(),created=h.sync(),first=h.link();
  const removed=h.sync({...h.ev,...created.patch},'staff',false);assert.equal(removed.patch.StaffCalendarEventId,'');
  assert.equal(h.link().state,'removed');assert.equal(h.api.live(staffId).length,0);
  const recreated=h.sync({...h.ev,...removed.patch}),second=h.link();
  assert.equal(recreated.patch.StaffSyncState,'SYNCED');assert.notEqual(second.apiId,first.apiId);assert(second.generation>first.generation);
  assert.equal(h.api.live(staffId).length,1);
});
test('After a Calendar wipe, retained durable mapping advances one generation before recreating the deleted ID',()=>{
  const h=fixture(),created=h.sync(),original=h.link();h.seed('Events',[{...h.ev,...created.patch}]);
  h.api.api.Events.remove(staffId,original.apiId); // Provider deletion performed by the existing wipe path.
  h.sandbox.resetTargetSyncAfterCalendarWipe_('staff',2026);
  assert.equal(h.event('E1').StaffCalendarEventId,'');assert.equal(h.event('E1').StaffSyncState,'PENDING_SYNC');
  assert.equal(h.link().state,'linked');assert.equal(h.link().apiId,original.apiId);
  const started=h.call('startSyncYear',{year:2026,target:'staff'});
  assert.equal(started.initialPending,1);
  const result=h.call('syncYearBatch',{syncRunId:started.syncRunId}),current=h.link();
  assert.equal(result.completed,true);assert.equal(result.counts.errors.length,0);assert.equal(result.counts.staffCreates,1);
  assert.equal(current.generation,original.generation+1);assert.notEqual(current.apiId,original.apiId);
  assert.equal(h.api.live(staffId).length,1);assert.equal(h.api.read(staffId,original.apiId).status,'cancelled');
  assert.equal(calls(h,'Events.insert').filter(call=>call.id===original.apiId).length,1);
  assert.equal(h.event('E1').StaffCalendarEventId,current.iCalUID);assert.equal(h.event('E1').StaffSyncState,'SYNCED');
});
test('Parent events stay all day with an exclusive end and no staff location',()=>{
  const h=fixture();const event={...h.ev,StartDate:'2026-12-31',EndDate:'2027-01-02',EventType:'TIMED'};
  const result=h.sync(event,'parent'),item=h.api.live(parentId)[0];
  assert.deepEqual(item.start,{date:'2026-12-31'});assert.deepEqual(item.end,{date:'2027-01-03'});
  assert.equal(item.summary,event.ParentTitle);assert.equal(item.location||'','');assert.equal(result.patch.ParentSyncState,'SYNCED');
});
test('Timed Staff events encode Singapore offsets and one coherent title/time/location update',()=>{
  const h=fixture();h.sync();const item=h.api.live(staffId)[0];
  assert.equal(Date.parse(item.start.dateTime),Date.parse('2026-09-14T14:15:00+08:00'));
  assert.equal(Date.parse(item.end.dateTime),Date.parse('2026-09-14T15:15:00+08:00'));
  assert.equal(item.start.timeZone,'Asia/Singapore');assert.equal(item.end.timeZone,'Asia/Singapore');
  assert.equal(item.location,h.ev.Location);assert.equal(item.summary,'[Mtg] '+h.ev.StaffTitle);
  assert.equal(calls(h,'Events.insert').length,1);assert.equal(calls(h,'Events.update').length,0);
});
test('Staff hide remains actionable when provider creation committed but the Events link receipt was lost',()=>{
  const h=fixture();h.sync(); // Keep durable provider mapping; omit the returned ordinary Events patch.
  assert.equal(h.event('E1').StaffCalendarEventId,'');assert.equal(h.link().state,'linked');
  const before=h.event('E1');
  h.call('saveEvent',{event:{...before,Status:'HIDDEN'},expectedRevision:before._revision,operationId:randomUUID()});
  const boot=h.call('bootstrap',{year:2026}),event=boot.events.find(event=>event.EventID==='E1');
  assert.equal(event.Status,'HIDDEN');assert.equal(event.StaffCalendarEventId,'');assert.equal(event._staffCalendarLinked,true);
  assert.notEqual(event.StaffSyncState,'SYNCED');assert.equal(h.api.live(staffId).length,1);
  finishRemoval(h,'staff');
});
test('Staff delete exposes pending removal and removes an owned provider event with no ordinary Events link',()=>{
  const h=fixture();h.sync(); // Simulate the final Events acknowledgement failing after provider success.
  assert.equal(h.event('E1').StaffCalendarEventId,'');const before=h.event('E1');
  h.call('deleteEvent',{eventId:'E1',expectedRevision:before._revision,operationId:randomUUID()});
  const boot=h.call('bootstrap',{year:2026});
  assert(!boot.events.some(event=>event.EventID==='E1'));
  assert(boot.pendingRemovals.some(event=>event.eventId==='E1'&&event.staff));
  assert.equal(h.call('bootstrap',{year:2026},'teacher').pendingRemovals.length,0);
  assert.equal(h.api.live(staffId).length,1);finishRemoval(h,'staff');
  assert.equal(h.call('bootstrap',{year:2026}).pendingRemovals.length,0);
});
test('Parent disable queues and completes removal after provider success without an Events link receipt',()=>{
  const h=fixture();h.sync(h.ev,'parent');
  assert.equal(h.event('E1').ParentCalendarEventId,'');assert.equal(h.link(h.ev,'parent').state,'linked');
  const before=h.event('E1');
  h.call('saveParentSide',{eventId:'E1',expectedRevision:before._revision,ParentEnabled:'No',ParentTitle:before.ParentTitle,ParentDescription:before.ParentDescription,operationId:randomUUID()},'publisher');
  const boot=h.call('bootstrap',{year:2026}),event=boot.events.find(event=>event.EventID==='E1');
  assert.equal(event.ParentEnabled,'No');assert.equal(event.ParentCalendarEventId,'');assert.equal(event._parentCalendarLinked,true);
  assert.notEqual(event.ParentSyncState,'SYNCED');assert.equal(h.api.live(parentId).length,1);
  finishRemoval(h,'parent');
});
test('Reconciliation reads every page, excludes out-of-window events, and reports without changing Calendar',()=>{
  const h=fixture({pageSize:2});h.ev.StartDate='2025-12-30';h.ev.EndDate='2025-12-30';h.seed('Events',[h.ev]);
  for(let i=0;i<5;i++)h.api.seedEvent(staffId,remote({id:'0abc'+i+'00',iCalUID:'fixture'+i+'@example.test',summary:'Fixture '+i}));
  h.api.seedEvent(staffId,remote({id:'0bef000',iCalUID:'lateprep@example.test',start:{date:'2025-12-30'},end:{date:'2025-12-31'}}));
  h.api.seedEvent(staffId,remote({id:'0fed000',iCalUID:'outofwindow@example.test',start:{date:'2027-01-01'},end:{date:'2027-01-02'}}));
  const result=h.call('calendarReconciliationPreview',{year:2026,target:'staff'});
  assert.equal(result.calendarEvents,6);assert.equal(result.unlinkedCalendarEvents,6);assert.equal(result.desiredUnlinked,1);noMutations(h);
  const pages=calls(h,'Events.list').filter(call=>call.params.timeMin);
  assert.equal(pages.length,3);assert.equal(new Set(pages.map(call=>call.params.pageToken||'')).size,3);
  assert.equal(Date.parse(pages[0].params.timeMin),Date.parse('2025-12-30T00:00:00+08:00'));
  assert.equal(Date.parse(pages[0].params.timeMax),Date.parse('2027-01-01T00:00:00+08:00'));
});
test('Reconciliation finds a legacy-only event moved outside the year and reports content drift without migrating it',()=>{
  const h=fixture();h.ev.StaffCalendarEventId='legacy.fixture@example.test';h.ev.StaffSyncState='SYNCED';
  h.ev.StaffSyncHash=h.sandbox.sha256_(JSON.stringify(h.sandbox.staffCalendarSpec_(h.ev)));
  h.seed('Events',[h.ev]);
  h.api.seedEvent(staffId,remote({summary:'[Mtg] '+h.ev.StaffTitle,description:h.ev.StaffDescription,location:h.ev.Location,
    start:{dateTime:'2027-03-04T14:15:00+08:00',timeZone:'Asia/Singapore'},end:{dateTime:'2027-03-04T15:15:00+08:00',timeZone:'Asia/Singapore'}}));
  const result=h.call('calendarReconciliationPreview',{year:2026,target:'staff'});
  assert.equal(result.calendarEvents,0);assert.equal(result.linkedPresent,1);assert.equal(result.linkedMissing,0);
  assert.equal(result.remoteDrift,1);assert.equal(result.samples.remoteDrift[0].eventId,'E1');
  assert(calls(h,'Events.list').some(call=>call.params.iCalUID===h.ev.StaffCalendarEventId&&!call.params.timeMin&&!call.params.timeMax));
  noMutations(h);assert.equal(h.link(),null);assert.equal(h.event('E1').StaffCalendarEventId,h.ev.StaffCalendarEventId);
});

console.log(JSON.stringify({passed:tests.filter(test=>test.ok).length,total:tests.length}));
if(tests.some(test=>!test.ok))process.exitCode=1;
