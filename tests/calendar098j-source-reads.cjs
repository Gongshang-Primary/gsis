'use strict';
const assert=require('node:assert/strict');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const {makeCalendarApiMock}=require('./calendar/calendar_api_mock.cjs');
function fixture(count=5){
 const h=makeHarness(),api=makeCalendarApiMock();h.sandbox.Calendar=api.api;
 const id=h.sandbox.setting_('STAFF_CALENDAR_ID');api.seedCalendar({id});
 h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(l=>h.sandbox.legacyLaneScheduleRows_(l)));
 h.seed('Events',Array.from({length:count},(_,i)=>{const date=new Date(Date.UTC(2026,0,1+i%365)).toISOString().slice(0,10);return {...h.base,EventID:'YEAR-'+i,StartDate:date,EndDate:date,StaffCalendarEventId:'',ParentCalendarEventId:'',StaffSyncHash:'',StaffSyncState:'PENDING_SYNC'};}));
 return {...h,api,id};
}
{
 const h=fixture();let forbiddenReads=0;
 h.setFault(stage=>{if(stage==='apiReadBefore'){forbiddenReads++;throw Error("Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'.");}});
 const started=h.call('startSyncYear',{year:2026,target:'staff'});
 const result=h.call('syncYearBatch',{syncRunId:started.syncRunId});
 assert.equal(result.completed,true);assert.equal(h.api.live(h.id).length,5);assert.equal(forbiddenReads,0,'Sync must not use the exhausted Advanced Sheets read transport');
 assert(h.audit.nativeWrites.length>0,'Native source writes remain enabled');assert.equal(h.audit.apiWrites.length,0);
}
{
 const h=fixture(365);h.audit.apiReads=[];
 let result=h.call('startSyncYear',{year:2026,target:'staff'}),batches=0,interrupted=false;const sheet=h.sheets.get('Events'),getRange=sheet.getRange.bind(sheet);
 sheet.getRange=(...args)=>{const range=getRange(...args),read=range.getValues.bind(range);range.getValues=()=>{if(batches===20&&!interrupted&&args[0]!==1){interrupted=true;throw Error('Service invoked too many times in a short time: spreadsheet.');}return read();};return range;};
 while(!result.completed){h.advanceClock(Math.max(60000,result.retryAfterMs||0));result=h.call('syncYearBatch',{syncRunId:result.syncRunId});assert(++batches<=80,'Full year must make bounded progress');}
 assert(interrupted,'The year-scale run must survive an actual interrupted source read');
 assert.equal(h.api.live(h.id).length,365);assert.equal(h.audit.apiReads.length,0);
 const first=h.event('YEAR-0'),originalId=first.StaffCalendarEventId;
 h.call('saveEvent',{event:{...first,StaffTitle:'One changed event'},expectedRevision:first._revision,operationId:require('node:crypto').randomUUID()});
 h.audit.apiReads=[];h.advanceClock(60000);result=h.call('startSyncYear',{year:2026,target:'staff'});
 assert.equal(result.initialPending,1);result=h.call('syncYearBatch',{syncRunId:result.syncRunId});
 assert.equal(result.completed,true);assert.equal(h.api.live(h.id).length,365);assert.equal(h.audit.apiReads.length,0,'Incremental Sync must also avoid Advanced Sheets reads');assert.equal(h.event('YEAR-0').StaffCalendarEventId,originalId);
}
{
 const h=fixture(1),started=h.call('startSyncYear',{year:2026,target:'staff'}),sheet=h.sheets.get('Events'),native=sheet.getRange.bind(sheet);let blocked=true,attempts=0;
 sheet.getRange=(...args)=>{const range=native(...args),read=range.getValues.bind(range);range.getValues=()=>{if(blocked&&args[0]!==1){attempts++;throw Error('Service invoked too many times in a short time: spreadsheet.');}return read();};return range;};
 const waiting=h.call('syncYearBatch',{syncRunId:started.syncRunId});
 assert.equal(waiting.completed,false);assert.equal(waiting.paused,true);assert.equal(waiting.pauseReason,'SOURCE_READ_RATE_LIMIT');assert(waiting.retryAfterMs>=60000);assert.equal(waiting.syncRunId,started.syncRunId);
 const before=attempts;h.call('syncYearBatch',{syncRunId:started.syncRunId});assert.equal(attempts,before,'Repeated wake must honor the persisted source deadline');
 blocked=false;h.advanceClock(waiting.retryAfterMs);assert.equal(h.call('syncYearBatch',{syncRunId:started.syncRunId}).completed,true);assert.equal(h.api.live(h.id).length,1);
}
for(const action of ['syncYearBatch','startSyncYear'])for(const alias of ['teacher','admin']){
 const h=fixture(1),started=h.call('startSyncYear',{year:2026,target:'staff'});
 if(alias==='admin')h.seed('Users',[{UserAlias:'admin',Active:'No',IsAdmin:'No'}]);
 const sheet=h.sheets.get('Users'),getRange=sheet.getRange.bind(sheet),readSession=h.sandbox.readCalendarSyncSession_,before=JSON.stringify(readSession());let sessionReads=0;
 h.sandbox.readCalendarSyncSession_=()=>{sessionReads++;return readSession();};
 sheet.getRange=(...args)=>{const range=getRange(...args),read=range.getValues.bind(range);range.getValues=()=>{if(args[0]!==1)throw Error('Service invoked too many times in a short time: spreadsheet.');return read();};return range;};
 assert.throws(()=>h.call(action,action==='syncYearBatch'?{syncRunId:started.syncRunId}:{year:2026,target:'staff'},alias),error=>error.code==='SOURCE_READ_DEFERRED'&&error.status===429&&!error.current&&!error.session,'Unproven authority may receive only a generic source deferral');
 assert.equal(sessionReads,0,'Unproven authority cannot read privileged session state');assert.equal(JSON.stringify(readSession()),before,'Unproven authority cannot delay or inspect another session');
}
{
 const h=fixture(1),started=h.call('startSyncYear',{year:2026,target:'staff'}),sheet=h.sheets.get('Users'),getRange=sheet.getRange.bind(sheet),before=JSON.stringify(h.sandbox.readCalendarSyncSession_());let reads=0;
 sheet.getRange=(...args)=>{const range=getRange(...args),read=range.getValues.bind(range);range.getValues=()=>{if(args[0]!==1&&++reads===2){const active=sheet.values[0].indexOf('Active'),admin=sheet.values[0].indexOf('IsAdmin');sheet.values[1][active]='No';sheet.values[1][admin]='No';throw Error('Service invoked too many times in a short time: spreadsheet.');}return read();};return range;};
 assert.throws(()=>h.call('syncYearBatch',{syncRunId:started.syncRunId}),error=>error.status===403,'Deferral must recheck a role revoked after the first permission read');
 assert.equal(JSON.stringify(h.sandbox.readCalendarSyncSession_()),before);
}
for(const kind of ['key-search','last-row','last-column']){
 const h=fixture(1),started=h.call('startSyncYear',{year:2026,target:'staff'});let attempts=0,blocked=true;
 const failure=()=>{attempts++;throw Error('Service invoked too many times in a short time: spreadsheet.');};
 if(kind==='key-search'){
  const sheet=h.sheets.get('MutationLog'),getRange=sheet.getRange.bind(sheet);
  sheet.getRange=(...args)=>{const range=getRange(...args),finder=range.createTextFinder.bind(range);range.createTextFinder=(...search)=>{const result=finder(...search),findAll=result.findAll.bind(result);result.findAll=()=>blocked?failure():findAll();return result;};return range;};
 }else{
  const sheet=h.sheets.get('Events'),method=kind==='last-row'?'getLastRow':'getLastColumn',read=sheet[method].bind(sheet);sheet[method]=()=>blocked?failure():read();
 }
 const waiting=h.call('syncYearBatch',{syncRunId:started.syncRunId});assert.equal(waiting.paused,true,kind);assert.equal(waiting.pauseReason,'SOURCE_READ_RATE_LIMIT');const first=attempts;
 h.call('syncYearBatch',{syncRunId:started.syncRunId});assert.equal(attempts,first,'A saved source deadline gates '+kind);
 blocked=false;h.advanceClock(waiting.retryAfterMs);assert.equal(h.call('syncYearBatch',{syncRunId:started.syncRunId}).completed,true);
}
{
 const h=fixture(1),started=h.call('startSyncYear',{year:2026,target:'staff'}),sheet=h.sheets.get('MutationLog'),getRange=sheet.getRange.bind(sheet);let armed=false,failed=false;
 h.api.setFault((stage,call)=>{if(stage==='after'&&call.method==='Events.insert')armed=true;});
 sheet.getRange=(...args)=>{const range=getRange(...args),finder=range.createTextFinder.bind(range);range.createTextFinder=(...search)=>{const result=finder(...search),findAll=result.findAll.bind(result);result.findAll=()=>{if(armed&&!failed){failed=true;throw Error('Service invoked too many times in a short time: spreadsheet.');}return findAll();};return result;};return range;};
 const waiting=h.call('syncYearBatch',{syncRunId:started.syncRunId});assert(failed);assert.equal(waiting.paused,true,'A source key quota after provider work must defer the claim, not mark the event failed');assert.equal(waiting.pauseReason,'SOURCE_READ_RATE_LIMIT');assert(waiting.retryAfterMs>=6*60000,'The saved deadline must include the retained claim recovery window');assert.equal(h.call('syncYearBatch',{syncRunId:started.syncRunId}).paused,true);assert.notEqual(h.event('YEAR-0').StaffSyncState,'ERROR');
 h.advanceClock(8*60000);assert.equal(h.call('syncYearBatch',{syncRunId:started.syncRunId}).completed,true);assert.equal(h.api.live(h.id).length,1);assert.equal(h.api.calls.filter(c=>c.method==='Events.insert').length,1,'Provider identity survives a source read deferral after create');
}
console.log('PASS Calendar 098j native sync full-year, incremental and source deferral');
