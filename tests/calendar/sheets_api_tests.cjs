'use strict';
const {makeCalendarApiMock}=require('./calendar_api_mock.cjs');
function installCalendarApi(h,rows){
 const api=makeCalendarApiMock(),id=h.sandbox.setting_('STAFF_CALENDAR_ID');
 api.seedCalendar({id});h.sandbox.Calendar=api.api;
 rows.forEach((ev,i)=>api.seedEvent(id,{id:'fixture'+i,iCalUID:ev.StaffCalendarEventId,
   ...h.sandbox.calendarApiFields_(h.sandbox.staffCalendarSpec_(ev)),
   extendedProperties:{private:h.sandbox.calendarApiOwnership_('staff',ev)}}));
 return api;
}
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {makeHarness}=require('./backend_harness.cjs');const results=[];
const op=()=>crypto.randomUUID();
function test(name,fn){try{fn();results.push({name,ok:true});console.log('PASS',name);}catch(e){results.push({name,ok:false,error:e.stack});console.error('FAIL',name,e.message);}}
const plain=v=>JSON.parse(JSON.stringify(v));
function reset(h){h.audit.apiReads=[];h.audit.apiWrites=[];h.audit.nativeReads=[];h.audit.nativeWrites=[];h.sandbox.rc18ResetIO_();}
function patchFields(h,sheetName){const headers=h.sheets.get(sheetName).values[0],out=[];
 for(const write of h.audit.nativeWrites.filter(w=>w.sheet===sheetName)){
  if(write.before.every(row=>row.every(value=>value===''||value==null)))continue;
  write.values.forEach((values,r)=>values.forEach((raw,c)=>{
   const value=typeof raw==='string'&&raw.startsWith("'")?raw.slice(1):raw;
   if(values.length>1&&value===write.before[r]?.[c])return;
   out.push({row:write.row+r,field:headers[write.col+c-1],value:typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{boolValue:value}:typeof value==='number'?{numberValue:value}:null});
  }));
 }return out;}
const payload=(h,patch={})=>({event:{...h.event('E1'),...patch},expectedRevision:h.event('E1')._revision,operationId:op()});
const relocation=h=>({eventId:'E1',expectedRevision:h.event('E1')._revision,year:2026,mode:'copy',anchorDate:'2026-09-14',targetDate:'2026-09-15',targetLaneId:'after_school',targetShift:'PM_I',operationId:op()});

test('Read-only Calendar logic diagnostics: 31/31',()=>{const h=makeHarness(),r=h.sandbox.runCalendarSelfTests();assert.equal(r.total,31);assert.equal(r.failed,0);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('A title-only edit changes six fields in one coherent native event range',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'Only this title'});reset(h);h.call('saveEvent',p);
 assert.deepEqual(patchFields(h,'Events').map(p=>p.field),['StaffTitle','StaffSyncState','ParentSyncState','UpdatedAt','UpdatedBy','LastMutationID']);
 assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,1);});
test('Event marker shares one native row write and receipt follows business and audit writes',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'Coherent'});reset(h);h.call('saveEvent',p);
 const writes=h.audit.nativeWrites,event=writes.findIndex(row=>row.sheet==='Events'),audit=writes.findIndex(row=>row.sheet==='AuditLog'),receipt=writes.findIndex(row=>row.sheet==='MutationLog'&&row.values.some(values=>values.includes('COMMITTED')));
 assert(event>=0&&audit>event&&receipt>audit);assert.equal(writes.filter(row=>row.sheet==='Events').length,1);assert(writes[event].values.some(row=>row.includes(p.operationId)));assert.equal(h.audit.apiWrites.length,0);});
test('Sparse metadata patch performs no Event body read',()=>{const h=makeHarness();reset(h);h.sandbox.updateRowPatch_(h.sheets.get('Events'),2,{StaffSyncState:'SYNCED'});
 assert.equal(h.audit.apiReads.length,0);assert.deepEqual(patchFields(h,'Events').map(p=>p.field),['StaffSyncState']);assert(h.audit.nativeReads.every(r=>r.row===1));});
test('Unknown patch field fails before any write',()=>{const h=makeHarness();reset(h);assert.throws(()=>h.sandbox.updateRowPatch_(h.sheets.get('Events'),2,{StaffTitle:'No',Misspelled:'No'}),/Unknown field/);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.event('E1').StaffTitle,h.base.StaffTitle);assert.equal(h.audit.nativeWrites.length,0);});
test('Header-row patch is blocked',()=>{const h=makeHarness();assert.throws(()=>h.sandbox.updateRowPatch_(h.sheets.get('Events'),1,{StaffTitle:'No'}),/header/);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('Explicit blank clears only the requested Location cell',()=>{const h=makeHarness();reset(h);h.sandbox.updateRowPatch_(h.sheets.get('Events'),2,{Location:''});assert.equal(h.event('E1').Location,'');assert.deepEqual(patchFields(h,'Events').map(x=>x.field),['Location']);});
test('Formula-looking title is sent as literal stringValue, never formulaValue',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'=IMPORTXML("https://example.invalid", "//x")'});reset(h);h.call('saveEvent',p);
 const f=patchFields(h,'Events').find(x=>x.field==='StaffTitle');assert.equal(f.value.stringValue,p.event.StaffTitle);assert(!('formulaValue'in f.value));});
test('Custom neighbouring column survives event edit byte-for-byte',()=>{const h=makeHarness(),s=h.sheets.get('Events');s.values[0].push('LocalFormula');s.values[1].push('=SUM(1,2)');const p=payload(h,{StaffTitle:'New'});reset(h);h.call('saveEvent',p);assert.equal(s.values[1].at(-1),'=SUM(1,2)');assert(!patchFields(h,'Events').some(x=>x.field==='LocalFormula'));});
test('Native event writes leave cell formats, notes and validation unchanged',()=>{const h=makeHarness();let formats=0;const sheet=h.sheets.get('Events'),get=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const range=get(...args);for(const method of ['setNumberFormat','setBackground','setDataValidation'])range[method]=()=>{formats++;throw Error('Unexpected cell metadata change');};return range;};h.call('saveEvent',payload(h,{StaffTitle:'Native values only'}));assert.equal(formats,0);assert.equal(h.audit.apiWrites.length,0);});
test('Parent-side save touches no staff title/time/link cells',()=>{const h=makeHarness(),e=h.event('E1');reset(h);h.call('saveParentSide',{eventId:'E1',expectedRevision:e._revision,ParentEnabled:'No',ParentTitle:'Revised parent',operationId:op()},'publisher');
 const allowed=new Set(['ParentEnabled','ParentTitle','ParentDescription','ParentSyncState','UpdatedAt','UpdatedBy','LastMutationID']);assert(patchFields(h,'Events').every(p=>allowed.has(p.field)));});
test('Delete remains soft deletion, with no Events row deletion',()=>{const h=makeHarness(),e=h.event('E1');h.call('deleteEvent',{eventId:'E1',expectedRevision:e._revision,operationId:op()});assert(h.event('E1').DeletedAt);assert.equal(h.sheets.get('Events').getLastRow(),4);});
test('Duplicate successful operation makes no second write',()=>{const h=makeHarness(),p=relocation(h);const r=h.call('relocateEvent',p);reset(h);assert.equal(h.call('relocateEvent',p).EventID,r.EventID);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('Copy creates one new row without touching the source row',()=>{const h=makeHarness(),before=h.event('E1');reset(h);const r=h.call('relocateEvent',relocation(h));assert.notEqual(r.EventID,'E1');assert.equal(r.ParentEnabled,'No');assert.deepEqual(h.event('E1'),before);assert.equal(patchFields(h,'Events').length,0);});
test('Mixed-case key lookup remains exact and trimmed',()=>{const h=makeHarness();h.seed('Tags',[{Tag:' MtG ',Meaning:'Meeting',Active:'Yes'},{Tag:'MtgPlus',Meaning:'Other',Active:'Yes'}]);assert.equal(h.sandbox.findRowByKeyCaseInsensitive_(h.sheets.get('Tags'),'Tag','mtg').row,2);});
test('Duplicate EventIDs fail closed instead of choosing a row',()=>{const h=makeHarness();h.seed('Events',[h.base,{...h.base,StaffTitle:'Duplicate'}]);assert.throws(()=>h.event('E1'),/Duplicate EventID/);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('Row lookup rechecks identity after a native sort between locate and fetch',()=>{const h=makeHarness();let once=true;h.setFault((stage,w)=>{if(stage==='nativeReadBefore'&&once&&w.sheet==='Events'&&w.row===2&&w.cols===h.spec.HEADERS.Events.length){once=false;const sheet=h.sheets.get('Events');[sheet.values[1],sheet.values[2]]=[sheet.values[2],sheet.values[1]];}});const hit=h.sandbox.findRowByKey_(h.sheets.get('Events'),'EventID','E1');assert.equal(hit.row,3);assert.equal(hit.object.EventID,'E1');});
test('Numeric Sheets date/time cells normalize without locale guessing',()=>{const h=makeHarness();h.seed('Events',[{...h.base,StartDate:46295,EndDate:46295,StartTime:0,EndTime:0.5}]);const e=h.event('E1');assert.equal(e.StartDate,'2026-09-30');assert.equal(e.StartTime,'00:00');assert.equal(e.EndTime,'12:00');});
test('Numeric timestamp keeps Singapore civil time',()=>{const h=makeHarness();assert.equal(h.sandbox.rc18Value_('UpdatedAt',46295.5),'2026-09-30T12:00:00+08:00');});
test('Read-only metadata/service preflight writes nothing',()=>{const h=makeHarness();const r=h.sandbox.checkRC18SheetsApi();assert.equal(r.ok,true);assert.equal(r.readOnly,true);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('Missing Advanced Sheets service does not block native event storage',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'Native required'});h.sandbox.Sheets=undefined;reset(h);assert.equal(h.call('saveEvent',p).StaffTitle,'Native required');assert(h.audit.nativeWrites.length>0);assert.equal(h.audit.apiWrites.length,0);});
test('RC1.7 upgrade preserves all Events cells and journal history',()=>{const h=makeHarness();const p=relocation(h);h.call('relocateEvent',p);const ev=JSON.stringify(h.sheets.get('Events').values),log=JSON.stringify(h.sheets.get('MutationLog').values);h.sandbox.upgradeCalendarToRC19();h.sandbox.upgradeCalendarToRC19();assert.equal(JSON.stringify(h.sheets.get('Events').values),ev);assert.equal(JSON.stringify(h.sheets.get('MutationLog').values),log);});
test('RC1.5 upgrade appends mutation and venue identities; no event reset',()=>{const h=makeHarness(),s=h.sheets.get('Events');s.values=s.values.map(r=>r.slice(0,-2));h.sheets.delete('MutationLog');h.sandbox.rc18ResetIO_();const before=plain(s.values);const report=h.sandbox.upgradeCalendarToRC19();assert.equal(report.eventRowsPreserved,3);assert.equal(s.values[0].at(-2),'LastMutationID');assert.equal(s.values[0].at(-1),'VenueID');assert.deepEqual(s.values.map(r=>r.slice(0,before[0].length)),before);assert(h.sheets.has('MutationLog'));});
test('Wrong journal headers stop upgrade before changing Events headers',()=>{const h=makeHarness(),s=h.sheets.get('Events');s.values=s.values.map(r=>r.slice(0,-1));h.sheets.get('MutationLog').values[0][0]='Wrong';h.sandbox.rc18ResetIO_();const before=JSON.stringify(s.values);assert.throws(()=>h.sandbox.upgradeCalendarToRC19(),/MutationLog headers/);assert.equal(JSON.stringify(s.values),before);});
test('Wrong Events headers stop upgrade without rewriting data',()=>{const h=makeHarness();h.sheets.get('Events').values[0][1]='Wrong';h.sandbox.rc18ResetIO_();const before=JSON.stringify(h.sheets.get('Events').values);assert.throws(()=>h.sandbox.upgradeCalendarToRC19(),/headers differ/);assert.equal(JSON.stringify(h.sheets.get('Events').values),before);});
test('Native bootstrap reads selected-year event bodies, not other-year event bodies',()=>{const h=makeHarness();reset(h);const b=h.call('bootstrap',{year:2026});assert.equal(b.events.length,2);const reads=h.audit.nativeReads.filter(row=>row.sheet==='Events');assert(reads.some(row=>row.col===2&&row.cols===1));assert(reads.some(row=>row.row===2&&row.rows===2&&row.cols===h.spec.HEADERS.Events.length));assert(!reads.some(row=>row.row===2&&row.rows===3&&row.cols===h.spec.HEADERS.Events.length));assert.equal(h.audit.apiReads.length,0);});
test('Scattered selected-year rows remain bounded to selected native ranges',()=>{const h=makeHarness(),events=[];for(let i=0;i<202;i++){const year=i%2?2027:2026;events.push({...h.base,EventID:'S'+i,Year:year,StartDate:year+'-09-14',EndDate:year+'-09-14'});}h.seed('Events',events);reset(h);const b=h.call('bootstrap',{year:2026});assert.equal(b.events.length,101);assert(b.events.every(e=>e.Year===2026));const bodies=h.audit.nativeReads.filter(row=>row.sheet==='Events'&&row.row>1&&row.cols===h.spec.HEADERS.Events.length);assert.equal(bodies.length,101);assert(bodies.every(row=>row.rows===1));assert.equal(h.audit.apiReads.length,0);});
test('Genuinely empty year remains a valid empty result',()=>{const h=makeHarness();assert.equal(h.call('bootstrap',{year:2028}).events.length,0);});
test('Year/body mismatch during native read is an error, not an empty success',()=>{const h=makeHarness();h.setFault((stage,row)=>{if(stage==='nativeReadBefore'&&row.sheet==='Events'&&row.row===2&&row.rows===2&&row.cols===h.spec.HEADERS.Events.length)h.sheets.get('Events').values[1][1]=2027;});assert.throws(()=>h.call('bootstrap',{year:2026}),/rows changed during loading/);});
test('Native source read failure is reported rather than showing an empty calendar',()=>{const h=makeHarness();h.setFault((stage,row)=>{if(stage==='nativeReadBefore'&&row.sheet==='Events'&&row.row>1)throw Error('Native range unavailable');});assert.throws(()=>h.call('bootstrap',{year:2026}),/Native range unavailable/);assert.equal(h.audit.nativeWrites.length,0);});
test('A failed native read is not blindly retried in the same request',()=>{const h=makeHarness();let attempts=0;h.setFault(stage=>{if(stage==='nativeReadBefore'){attempts++;throw Error('503 native source unavailable');}});assert.throws(()=>h.call('bootstrap',{year:2026}),/503/);assert.equal(attempts,1);assert.equal(h.audit.nativeWrites.length,0);});
test('Native permission read error does not retry',()=>{const h=makeHarness();let attempts=0;h.setFault(stage=>{if(stage==='nativeReadBefore'){attempts++;throw Error('403 permission denied');}});assert.throws(()=>h.call('bootstrap',{year:2026}),/403/);assert.equal(attempts,1);});
test('A fresh request can recover from an earlier native read failure without writes',()=>{const h=makeHarness();let remaining=1;h.setFault(stage=>{if(stage==='nativeReadBefore'&&remaining-->0)throw Error('429 native quota');});assert.throws(()=>h.call('bootstrap',{year:2026}),/429/);h.setFault(null);assert.equal(h.call('bootstrap',{year:2026}).events.length,2);assert.equal(h.audit.nativeWrites.length,0);assert.equal(h.audit.apiReads.length,0);});
test('Native audit failure retains a coherent event row and exact marker recovery',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'Source saved before audit failure'});h.setFault((stage,row)=>{if(stage==='before'&&row.sheet==='AuditLog')throw Error('Native audit unavailable');});assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN');h.setFault(null);assert.equal(h.event('E1').StaffTitle,p.event.StaffTitle);assert.equal(h.sheets.get('AuditLog').getLastRow(),1);assert.equal(h.call('eventMutationStatus',{action:'saveEvent',payload:p}).state,'SAVED');const writes=h.audit.nativeWrites.filter(row=>row.sheet==='Events').length;h.call('saveEvent',p);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,writes);});
test('Lost committed native receipt response returns saved without a second event write',()=>{const h=makeHarness(),p=relocation(h);h.setFault((stage,row)=>{if(stage==='after'&&row.sheet==='MutationLog'&&row.values.some(values=>values.includes('COMMITTED')))throw Error('Response lost');});const result=h.call('relocateEvent',p);assert(result.EventID);assert.equal(h.sheets.get('Events').getLastRow(),5);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,1);});
test('Ambiguous native event write is not retried through another transport',()=>{const h=makeHarness(),p=relocation(h);let attempts=0;h.setFault((stage,row)=>{if(stage==='before'&&row.sheet==='Events'){attempts++;throw Error('503 timeout');}});assert.throws(()=>h.call('relocateEvent',p),error=>error.code==='UNKNOWN');assert.equal(attempts,1);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,0);});
test('Journal dispatch receipt is not cancelled merely because its event is absent',()=>{const h=makeHarness(),p=relocation(h);h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Events')throw new Error('uncertain');});assert.throws(()=>h.call('relocateEvent',p));h.setFault(null);assert.equal(h.call('eventMutationStatus',{action:'relocateEvent',payload:p}).state,'UNKNOWN');const row=h.sandbox.mutationLookup_(h.sheets.get('MutationLog'),p.operationId);assert.equal(row.object.State,'DISPATCHED');});
test('Planning note edit preserves original ownership and changes only Text and audit metadata',()=>{const h=makeHarness();h.seed('DayNotes',[{NoteID:'N1',Year:2026,Date:'2026-09-30',Text:'Before',CreatedAt:'Old',CreatedBy:'owner',UpdatedAt:'Old',UpdatedBy:'owner'}]);reset(h);h.call('saveDayNote',{year:2026,date:'2026-09-30',text:'After'});assert.deepEqual(patchFields(h,'DayNotes').map(row=>row.field),['Text','UpdatedAt','UpdatedBy']);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='DayNotes').length,1);});
test('Planning note with a numeric date is updated in place, not duplicated',()=>{const h=makeHarness();h.seed('DayNotes',[{NoteID:'N1',Year:2026,Date:46295,Text:'Before'}]);h.call('saveDayNote',{year:2026,date:'2026-09-30',text:'After'});assert.equal(h.sheets.get('DayNotes').getLastRow(),2);assert.equal(h.sheets.get('DayNotes').values[1][3],'After');});
test('Formatting-rule reorder natively patches only Priority',()=>{const h=makeHarness();h.seed('ColourRules',[{RuleID:'R1',Priority:20,Value:'Keep1'},{RuleID:'R2',Priority:10,Value:'Keep2'}]);reset(h);h.call('reorderColourRules',{RuleIDs:['R2','R1']});assert.deepEqual(patchFields(h,'ColourRules').map(row=>row.field),['Priority','Priority']);assert.equal(h.sheets.get('ColourRules').values[1][0],'R1');assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='ColourRules').length,2);});
test('Lane schedule edit patches one changed time without replacing rows',()=>{const h=makeHarness(),sch=['MON','TUE','WED','THU','FRI','SAT','SUN'].map(Weekday=>({LaneID:'evening',Weekday,Enabled:'Yes',DefaultStartTime:'18:00',DefaultEndTime:'20:00'}));h.seed('LaneSchedule',sch);const desired=plain(h.sandbox.tableObjects_(h.sheets.get('LaneSchedule')));desired[0].DefaultStartTime='18:30';reset(h);h.sandbox.replaceLaneSchedule_('evening',desired);assert.deepEqual(patchFields(h,'LaneSchedule').map(x=>x.field),['DefaultStartTime']);assert.equal(h.sheets.get('LaneSchedule').getLastRow(),8);});
test('Year-release promotion only patches matching hidden live events',()=>{const h=makeHarness();reset(h);const r=h.sandbox.publishHiddenEventsForYearOnRelease_(h.actor('admin'),2027,'synthetic');assert.equal(r.published,1);assert(patchFields(h,'Events').every(x=>x.row===4));assert(patchFields(h,'Events').every(x=>['Status','UpdatedAt','UpdatedBy','StaffSyncState','ParentSyncState'].includes(x.field)));});
test('Wipe reset touches only target-year parent sync fields',()=>{const h=makeHarness(),before=h.event('E3');reset(h);assert.equal(h.sandbox.resetTargetSyncAfterCalendarWipe_('parent',2026),2);assert.deepEqual(h.event('E3'),before);assert(patchFields(h,'Events').every(x=>x.row<4&&['ParentCalendarEventId','ParentSyncHash','ParentSyncState'].includes(x.field)));});
test('No-op state normalization leaves unrelated event cells unchanged',()=>{const h=makeHarness();h.seed('Events',[{...h.base,Status:'HIDDEN',StaffCalendarEventId:'',StaffSyncState:'PENDING_SYNC'}]);reset(h);assert.equal(h.sandbox.normaliseNoOpStaffSyncStates_(),1);assert.deepEqual(patchFields(h,'Events').map(x=>x.field),['StaffSyncState']);});
test('Sync vocabulary migration patches changed states only',()=>{const h=makeHarness();h.seed('Events',[{...h.base,StaffSyncState:'DIRTY',ParentSyncState:'SYNCED'}]);reset(h);h.sandbox.migrateSyncStateVocabulary_();assert.deepEqual(patchFields(h,'Events').map(x=>x.field),['StaffSyncState']);});
test('Native table reconciliation preserves unchanged rows and patches one field',()=>{const h=makeHarness();h.seed('YearStructure',[{StructureID:'S1',Year:2026,Label:'Before'},{StructureID:'S2',Year:2027,Label:'Unchanged'}]);const desired=plain(h.sandbox.tableObjects_(h.sheets.get('YearStructure')));desired[0].Label='After';reset(h);h.sandbox.rewriteTableData_(h.sheets.get('YearStructure'),h.spec.HEADERS.YearStructure,desired);assert.deepEqual(patchFields(h,'YearStructure').map(row=>row.field),['Label']);assert.equal(h.audit.nativeWrites.length,1);assert.equal(h.audit.apiWrites.length,0);});
test('Native table reconciliation adds and removes only intended keys under its lock',()=>{const h=makeHarness();h.seed('YearStructure',[{StructureID:'S1',Year:2026,Label:'Remove'},{StructureID:'S2',Year:2027,Label:'Keep'}]);const keep=plain(h.sandbox.tableObjects_(h.sheets.get('YearStructure'))[1]);reset(h);h.sandbox.rewriteTableData_(h.sheets.get('YearStructure'),h.spec.HEADERS.YearStructure,[keep,{StructureID:'S3',Year:2026,Label:'New'}]);assert.deepEqual(plain(h.sandbox.tableObjects_(h.sheets.get('YearStructure')).map(row=>row.StructureID)),['S2','S3']);assert.equal(h.audit.apiWrites.length,0);assert(h.audit.nativeWrites.length>0);});
test('Table reconciliation rejects duplicate desired keys before any write',()=>{const h=makeHarness();assert.throws(()=>h.sandbox.rewriteTableData_(h.sheets.get('YearStructure'),h.spec.HEADERS.YearStructure,[{StructureID:'X'},{StructureID:'X'}]),/duplicate desired/);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.nativeWrites.length,0);});
test('Cold native configuration tables are read once per request snapshot',()=>{const h=makeHarness();h.seed('ColourRules',[{RuleID:'R1',Active:'Yes',Priority:10}]);h.seed('LaneSchedule',[{LaneID:'evening',Weekday:'MON',Enabled:'Yes'}]);reset(h);h.sandbox.configCached_();const reads=h.audit.nativeReads.filter(row=>['Lanes','LaneSchedule','Tags','ColourRules'].includes(row.sheet)&&row.row>1);for(const name of ['Lanes','LaneSchedule','Tags','ColourRules'])assert.equal(reads.filter(row=>row.sheet===name).length,1);h.sandbox.configCached_();assert.equal(h.audit.nativeReads.filter(row=>row.row>1).length,reads.length);assert.equal(h.audit.apiReads.length,0);});
test('Sync claims and revalidates only five full rows and patches staff sync metadata',()=>{
 const h=makeHarness(),rows=[];
 for(let i=0;i<12;i++){const e={...h.base,EventID:'SYNC'+i,StaffSyncState:'PENDING_SYNC',StaffCalendarEventId:'LINK'+i};e.StaffSyncHash=h.sandbox.sha256_(JSON.stringify(h.sandbox.staffCalendarSpec_(e)));rows.push(e);}h.seed('Events',rows);
 installCalendarApi(h,rows);
 const calId=h.sandbox.setting_('STAFF_CALENDAR_ID');h.sandbox.writeCalendarSyncSession_({syncRunId:'RUN1',target:'staff',year:2026,calendarId:calId,counts:h.sandbox.emptySyncCounts_(),failedIds:[],initialPending:12,processedTotal:0,startedEpochMs:Date.now(),startedBy:'admin'});
 reset(h);const result=h.call('syncYearBatch',{syncRunId:'RUN1'});assert.equal(result.batchProcessed,5);assert.equal(result.remaining,7);
 assert(patchFields(h,'Events').every(x=>['StaffCalendarEventId','StaffSyncHash','StaffSyncState','LastSyncedAt'].includes(x.field)));
 const bodies=h.audit.nativeReads.filter(r=>r.sheet==='Events'&&r.row===2&&r.col===1&&r.cols===h.spec.HEADERS.Events.length);assert.deepEqual(bodies.map(r=>r.rows),[5,5]);assert.equal(h.audit.apiReads.length,0);
});
test('Unresolved native event write blocks a different operation on that same event',()=>{const h=makeHarness(),p=payload(h,{StaffTitle:'Pending change'});let once=true;h.setFault((stage,row)=>{if(stage==='before'&&once&&row.sheet==='Events'){once=false;throw Error('503 native timeout');}});assert.throws(()=>h.call('saveEvent',p),error=>error.code==='UNKNOWN');h.setFault(null);assert.throws(()=>h.call('saveEvent',payload(h,{StaffTitle:'Unsafe later change'})),error=>error.code==='PENDING_EVENT_WRITE');assert.equal(h.event('E1').StaffTitle,h.base.StaffTitle);assert.equal(h.audit.nativeWrites.filter(row=>row.sheet==='Events').length,0);});
test('An unresolved write does not block a different event',()=>{
 const h=makeHarness();h.seed('MutationLog',[{OperationID:op(),UserAlias:'admin',Action:'saveEvent',State:'DISPATCHED',EventID:'E1'}]);
 const e=h.event('E2');const r=h.call('saveEvent',{event:{...e,StaffTitle:'Independent'},expectedRevision:e._revision,operationId:op()});assert.equal(r.StaffTitle,'Independent');
});
test('Committed receipt history never blocks a fresh event edit',()=>{
 const h=makeHarness();h.call('saveEvent',payload(h,{StaffTitle:'First'}));const r=h.call('saveEvent',payload(h,{StaffTitle:'Second'}));assert.equal(r.StaffTitle,'Second');
});
test('Mutation receipt lookup is independent of stale native last-row metadata',()=>{
 const h=makeHarness(),log=h.sheets.get('MutationLog');log.getLastRow=()=>1;
 const p=relocation(h),saved=h.call('relocateEvent',p);assert(saved.EventID);assert.equal(log.values.length,2);assert.equal(h.call('eventMutationStatus',{action:'relocateEvent',payload:p}).state,'SAVED');
});
test('Native bootstrap observes appended records after source memo invalidation',()=>{const h=makeHarness(),event={...h.base,EventID:'APPENDED'};h.sheets.get('Events').appendRow(h.spec.HEADERS.Events.map(field=>event[field]??''));const bootstrap=h.call('bootstrap',{year:2026});assert.equal(bootstrap.events.length,3);assert(bootstrap.events.some(row=>row.EventID==='APPENDED'));});
test('Native table reads see newly appended rows after request reset',()=>{const h=makeHarness(),sheet=h.sheets.get('Tags');h.sandbox.tableObjects_(sheet);sheet.appendRow(h.spec.HEADERS.Tags.map(field=>({Tag:'Added',Meaning:'New native row',Active:'Yes'}[field]??'')));h.sandbox.rc18ResetIO_();assert.equal(h.sandbox.tableObjects_(sheet).length,5);assert.equal(h.audit.apiReads.length,0);});

// RC1.9 targeted probes. These fail against RC1.9's redundant sync reads.
test('Staff sync eligibility reads only seven relevant native Event columns in adjacent groups',()=>{
 const h=makeHarness(),sheet=h.sheets.get('Events');sheet.values[1][sheet.values[0].indexOf('StaffSyncState')]='PENDING_SYNC';const before=JSON.stringify(sheet.values);reset(h);
 const eligible=h.sandbox.eligibleSyncRows_(sheet,2026,'staff',[],{ReleasedToTeachers:'Yes'},{after_school:{SyncToStaffCalendar:'Yes'}}),reads=h.audit.nativeReads.filter(row=>row.sheet==='Events'&&row.row>1);
 assert.deepEqual(plain(eligible.map(row=>({row:row.row,id:row.object.EventID}))),[{row:2,id:'E1'}]);
 assert.deepEqual(reads.map(row=>[row.col,row.cols]),[[1,4],[18,1],[20,1],[29,1]]);
 assert.deepEqual(reads.flatMap(row=>Array.from({length:row.cols},(_,i)=>row.col+i)),[1,2,3,4,18,20,29]);assert(reads.every(row=>row.rows===3));
 assert.equal(JSON.stringify(sheet.values),before);assert.equal(h.audit.nativeWrites.length,0);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.apiReads.length,0);
});
test('Parent sync eligibility reads only five relevant native Event columns in adjacent groups',()=>{
 const h=makeHarness(),sheet=h.sheets.get('Events');sheet.values[1][sheet.values[0].indexOf('ParentSyncState')]='ERROR';const before=JSON.stringify(sheet.values);reset(h);
 const eligible=h.sandbox.eligibleSyncRows_(sheet,2026,'parent',[],{},{}),reads=h.audit.nativeReads.filter(row=>row.sheet==='Events'&&row.row>1);
 assert.deepEqual(plain(eligible.map(row=>({row:row.row,id:row.object.EventID}))),[{row:2,id:'E1'}]);
 assert.deepEqual(reads.map(row=>[row.col,row.cols]),[[1,2],[15,1],[21,1],[23,1]]);
 assert.deepEqual(reads.flatMap(row=>Array.from({length:row.cols},(_,i)=>row.col+i)),[1,2,15,21,23]);assert(reads.every(row=>row.rows===3));
 assert.equal(JSON.stringify(sheet.values),before);assert.equal(h.audit.nativeWrites.length,0);assert.equal(h.audit.apiWrites.length,0);assert.equal(h.audit.apiReads.length,0);
});
function seededSync(h,count){
 const rows=[];
 for(let i=0;i<count;i++){
  const e={...h.base,EventID:'SYNC'+i,StaffSyncState:'PENDING_SYNC',StaffCalendarEventId:'LINK'+i};
  e.StaffSyncHash=h.sandbox.sha256_(JSON.stringify(h.sandbox.staffCalendarSpec_(e)));
  rows.push(e);
 }
 h.seed('Events',rows);
 installCalendarApi(h,rows);
 h.sandbox.writeCalendarSyncSession_({syncRunId:'RUN19',target:'staff',year:2026,calendarId:h.sandbox.setting_('STAFF_CALENDAR_ID'),counts:h.sandbox.emptySyncCounts_(),failedIds:[],initialPending:count,processedTotal:0,startedEpochMs:Date.now(),startedBy:'admin'});
 reset(h);
}
test('Intermediate sync batch rechecks current source identity and eligibility after provider work',()=>{
 const h=makeHarness();seededSync(h,12);
 const r=h.call('syncYearBatch',{syncRunId:'RUN19'});
 assert.equal(r.remaining,7);
 // Eligibility now coalesces EventID/Year/Status/LaneID; the independent
 // identity scan remains EventID-only. Both eligibility snapshots still run.
 const scans=h.audit.nativeReads.filter(r=>r.sheet==='Events'&&r.row===2&&r.col===1&&[1,4].includes(r.cols));
 assert.equal(scans.length,3);
 assert.deepEqual(scans.map(r=>r.cols),[4,1,4]);
 assert.equal(h.audit.apiReads.length,0);
 assert(scans.every(r=>r.rows===12));
});
test('Final sync batch rechecks authoritative backend before completion',()=>{
 const h=makeHarness();seededSync(h,2);
 const r=h.call('syncYearBatch',{syncRunId:'RUN19'});
 assert.equal(r.completed,true);
 const scans=h.audit.nativeReads.filter(r=>r.sheet==='Events'&&r.row===2&&r.col===1&&[1,4].includes(r.cols));
 assert.equal(scans.length,3);
 assert.deepEqual(scans.map(r=>r.cols),[4,1,4]);assert(scans.every(r=>r.rows===2));
});
test('Last native settlement rechecks newly inserted pending events',()=>{const h=makeHarness();seededSync(h,2);let inserted=false;h.setFault((stage,row)=>{if(stage==='after'&&!inserted&&row.sheet==='Events'){inserted=true;const sheet=h.sheets.get('Events'),event={...h.base,EventID:'NEW_PENDING',StaffSyncState:'PENDING_SYNC',StaffCalendarEventId:'LINKNEW'};sheet.values.push(sheet.values[0].map(field=>event[field]??''));}});const result=h.call('syncYearBatch',{syncRunId:'RUN19'});assert(inserted);assert.equal(result.completed,false);assert.equal(result.remaining,1);});
test('Committed journal history requires no API read for pending safety check',()=>{
 const h=makeHarness(),history=[];
 for(let i=0;i<100;i++)history.push({OperationID:'old-'+i,UserAlias:'admin',Action:'saveEvent',State:'COMMITTED',EventID:'E1'});
 h.seed('MutationLog',history);reset(h);h.sandbox.rc18AssertNoPendingEvent_('E1','');
 assert.equal(h.audit.apiReads.length,0);
});
test('Native pending journal projection ignores unrelated records and blocks matching edits',()=>{const h=makeHarness(),first=op(),second=op();h.seed('MutationLog',[{OperationID:first,State:'DISPATCHED',EventID:'E2'},{OperationID:second,State:'DISPATCHED',EventID:'E1'}]);reset(h);h.sandbox.rc18AssertNoPendingEvent_('E1',second);const reads=h.audit.nativeReads.filter(row=>row.sheet==='MutationLog'&&row.row>1);assert.equal(reads.length,2);assert(reads.every(row=>row.cols===1));assert.throws(()=>h.sandbox.rc18AssertNoPendingEvent_('E1','different'),error=>error.code==='PENDING_EVENT_WRITE');assert.doesNotThrow(()=>h.sandbox.rc18AssertNoPendingEvent_('E3',''));});

fs.writeFileSync(path.join(__dirname,'../../verification/606-calendar/sheets_api.json'),JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,tests:results},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,total:results.length}));if(results.some(r=>!r.ok))process.exitCode=1;
