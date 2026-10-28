'use strict';
// Regression: native Calendar source storage must not depend on Sheets v4.
// Provider Calendar API calls are independent and remain resumable.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock}=require('./calendar/calendar_api_mock.cjs');
const tests=[];
function test(name,run){try{run();tests.push({name,ok:true});console.log('PASS',name);}catch(error){tests.push({name,ok:false,error:error.message});console.error('FAIL',name,error.stack);}}
function native(h){let attempts=0;h.sandbox.Sheets=new Proxy({}, {get(){attempts++;throw Error('Advanced Sheets service deliberately unavailable');}});return ()=>attempts;}
function payload(h,id='E1',patch={}){const event=h.event(id);return {event:{...event,...patch},expectedRevision:event._revision,operationId:crypto.randomUUID()};}
function syncFixture(count){const h=makeHarness(),api=makeCalendarApiMock();h.sandbox.Calendar=api.api;const calendarId=h.sandbox.setting_('STAFF_CALENDAR_ID');api.seedCalendar({id:calendarId});h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(row=>h.sandbox.legacyLaneScheduleRows_(row)));h.seed('Events',Array.from({length:count},(_,i)=>{const date=new Date(Date.UTC(2026,0,1+i%365)).toISOString().slice(0,10);return {...h.base,EventID:'YEAR-'+i,StartDate:date,EndDate:date,StaffCalendarEventId:'',ParentCalendarEventId:'',StaffSyncHash:'',StaffSyncState:'PENDING_SYNC'};}));return {...h,api,calendarId};}
test('bootstrap, event saves, exact replay and glossary work with Advanced Sheets disabled',()=>{
 const h=makeHarness(),p=payload(h,'E1',{StaffTitle:'Native storage'}),forbidden=native(h);
 assert.equal(h.call('bootstrap',{year:2026}).events.length,2);
 const saved=h.call('saveEvent',p);assert.equal(saved.StaffTitle,'Native storage');
 const writes=h.audit.nativeWrites.length;assert.equal(h.call('saveEvent',p).LastMutationID,p.operationId);assert.equal(h.audit.nativeWrites.length,writes);
 assert.equal(h.call('saveTag',{Tag:'Native',Meaning:'Native glossary',Active:'Yes'}).Meaning,'Native glossary');
 assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload:p}).state,'SAVED');
 assert.equal(forbidden(),0);assert.equal(h.audit.apiReads.length,0);assert.equal(h.audit.apiWrites.length,0);assert(h.audit.nativeWrites.length>0);
});
test('native patches preserve unrelated fields and store formula-looking text literally',()=>{
 const h=makeHarness(),p=payload(h,'E1',{StaffTitle:'=1+1'}),forbidden=native(h),original=h.event('E1');
 const saved=h.call('saveEvent',p);assert.equal(saved.StaffTitle,'=1+1');assert.equal(saved.ParentTitle,original.ParentTitle);assert.equal(saved.CreatedAt,original.CreatedAt);assert.equal(saved.StaffCalendarEventId,original.StaffCalendarEventId);assert.equal(saved.ParentCalendarEventId,original.ParentCalendarEventId);
 assert(h.audit.nativeWrites.some(row=>row.sheet==='Events'&&row.values.some(values=>values.includes("'=1+1"))),'Literal text must be escaped before native setValues');assert.equal(forbidden(),0);
});
test('event row and LastMutationID are one native write; uncertain row acknowledgement is recoverable',()=>{
 const h=makeHarness(),p=payload(h,'E1',{StaffTitle:'Retained native event'}),forbidden=native(h);let lost=false;
 h.setFault((stage,row)=>{if(stage==='after'&&row.sheet==='Events'&&!lost){lost=true;throw Error('Lost native row acknowledgement');}});
 assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN');assert(lost);h.setFault(null);
 assert.equal(h.event('E1').StaffTitle,'Retained native event');
 const writes=h.audit.nativeWrites.filter(row=>row.sheet==='Events').length;
 assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload:p}).state,'SAVED');
 assert.equal(h.sandbox.findRowByKey_(h.sheets.get('MutationLog'),'OperationID',p.operationId).object.State,'COMMITTED','Recovery must be durable rather than mutating a cached projection');
 assert.equal(h.call('saveEvent',p).LastMutationID,p.operationId);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,writes);assert.equal(forbidden(),0);
 const eventWrites=h.audit.nativeWrites.filter(row=>row.sheet==='Events');assert.equal(eventWrites.length,1);const headers=h.sheets.get('Events').values[0],write=eventWrites[0],values=write.values[0];assert.equal(values[headers.indexOf('LastMutationID')-(write.col-1)],p.operationId);
});
test('native ambiguity before event write fences exact replay and later conflicting writes',()=>{
 const h=makeHarness(),p=payload(h,'E1',{StaffTitle:'Must remain pending'}),forbidden=native(h);let attempts=0;
 h.setFault((stage,row)=>{if(stage==='before'&&row.sheet==='Events'){attempts++;throw Error('Native source timeout');}});
 assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN');h.setFault(null);
 assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload:p}).state,'UNKNOWN');assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN');assert.throws(()=>h.call('saveEvent',payload(h,'E1',{StaffTitle:'Later proposal'})),error=>error.code==='PENDING_EVENT_WRITE');assert.equal(attempts,1);assert.equal(h.event('E1').StaffTitle,h.base.StaffTitle);assert.equal(forbidden(),0);
});
test('failed source flush never commits a success receipt before recovery',()=>{
 const h=makeHarness(),p=payload(h,'E1',{StaffTitle:'Flush recovery'});native(h);let sourceWritten=false;
 h.setFault((stage,row)=>{if(stage==='after'&&row.sheet==='Events')sourceWritten=true;if(stage==='flush'&&sourceWritten)throw Error('Native flush unavailable');});
 assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN'||/flush unavailable/.test(error.message));h.setFault(null);
 const receipt=h.sandbox.findRowByKey_(h.sheets.get('MutationLog'),'OperationID',p.operationId).object;assert.equal(receipt.State,'DISPATCHED');
 assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload:p}).state,'SAVED');assert.equal(h.event('E1').StaffTitle,'Flush recovery');
});
test('native write plans reject bad coordinates before any earlier patch can commit',()=>{
 const h=makeHarness();native(h);const sheet=h.sheets.get('Events'),before=JSON.stringify(sheet.values),requests=h.sandbox.rc18PatchRequests_(sheet,2,{StaffTitle:'Do not commit'});
 requests.push({deleteDimension:{range:{sheetId:sheet.getSheetId(),dimension:'ROWS',startIndex:999,endIndex:1002}}});
 assert.throws(()=>h.sandbox.rc18WriteRequests_(requests),/dimensions/);assert.equal(JSON.stringify(sheet.values),before);assert.equal(h.audit.nativeWrites.length,0);
});
test('one row marker cannot confirm an incomplete year-wide publication',()=>{
 const h=makeHarness();native(h);const identity=crypto.randomUUID(),event={...h.base,LastMutationID:identity};h.seed('Events',[event]);h.seed('MutationLog',[{OperationID:identity,UserAlias:'admin',Action:'publishVersion',State:'DISPATCHED',EventID:'YEAR:2026'}]);
 assert.throws(()=>h.call('saveEvent',payload(h,'E1',{StaffTitle:'Unsafe later edit'})),error=>error.code==='PENDING_EVENT_WRITE');
 assert.equal(h.sandbox.findRowByKey_(h.sheets.get('MutationLog'),'OperationID',identity).object.State,'DISPATCHED');
});
test('year-scale and incremental sync complete without Advanced Sheets transport',()=>{
 const h=syncFixture(365),forbidden=native(h);let result=h.call('startSyncYear',{year:2026,target:'staff'}),batches=0;
 while(!result.completed){h.advanceClock(Math.max(60000,result.retryAfterMs||0));result=h.call('syncYearBatch',{syncRunId:result.syncRunId});assert(++batches<=80);}
 assert.equal(h.api.live(h.calendarId).length,365);const original=h.event('YEAR-0').StaffCalendarEventId;
 const saved=h.call('saveEvent',payload(h,'YEAR-0',{StaffTitle:'Incremental native update'}));assert.equal(saved.StaffTitle,'Incremental native update');h.advanceClock(60000);result=h.call('startSyncYear',{year:2026,target:'staff'});assert.equal(result.initialPending,1);result=h.call('syncYearBatch',{syncRunId:result.syncRunId});assert.equal(result.completed,true);assert.equal(h.api.live(h.calendarId).length,365);assert.equal(h.event('YEAR-0').StaffCalendarEventId,original);assert.equal(forbidden(),0);
});
test('native storage preflight and upgrade preserve rows without Sheets service',()=>{
 const h=makeHarness(),before=JSON.stringify(h.sheets.get('Events').values),forbidden=native(h);
 const checked=h.sandbox.checkRC18SheetsApi();assert.equal(checked.ok,true);assert.equal(checked.readOnly,true);assert.equal(h.audit.nativeWrites.length,0);
 const upgraded=h.sandbox.upgradeCalendarToRC19();assert.equal(upgraded.ok,true);assert.match(upgraded.storage,/SpreadsheetApp/);assert.equal(JSON.stringify(h.sheets.get('Events').values),before);assert.equal(forbidden(),0);
});
require('node:fs').mkdirSync('verification',{recursive:true});require('node:fs').writeFileSync('verification/098l-calendar-native-results.json',JSON.stringify({passed:tests.filter(row=>row.ok).length,total:tests.length,tests},null,2));
console.log(JSON.stringify({passed:tests.filter(row=>row.ok).length,total:tests.length}));process.exitCode=tests.some(row=>!row.ok)?1:0;
