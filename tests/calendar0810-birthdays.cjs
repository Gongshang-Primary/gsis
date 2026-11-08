'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function fixture(){const h=makeHarness();const file='calendar-backend/Birthdays.gs';if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),h.sandbox);h.seed('LaneSchedule',h.sandbox.tableObjects_(h.sheets.get('Lanes')).flatMap(l=>h.sandbox.legacyLaneScheduleRows_(l)));h.seed('Tags',h.sandbox.tableObjects_(h.sheets.get('Tags')).concat({Tag:'SWC',Active:'Yes'}));h.seed('Events',[]);h.seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'},{Year:2027,Status:'PLANNING',ReleasedToTeachers:'No'}]);return h;}
const person=(id,extra={})=>({id,name:'Teacher '+id,active:'Y',mk:'',day:'5',month:'10',...extra});
const snapshot=people=>({schema:1,complete:true,authoritative:true,revision:'source-1',observedAt:Date.now(),count:people.length,people});
const tests=[];function test(name,run){try{run();tests.push(name);console.log('PASS '+name);}catch(e){console.error('FAIL '+name,e.stack);process.exitCode=1;}}
test('birthday implementation is available',()=>assert.equal(typeof fixture().sandbox.calendarBirthdayPlan_,'function'));
if(process.exitCode)process.exit(1);
const rows=h=>h.sandbox.tableObjects_(h.sheets.get('Events'));
const pull=(h,source,extra={})=>{h.sandbox.calendarBirthdaySource_=()=>source;return h.call('pullBirthdays',{year:2026,operationId:crypto.randomUUID(),...extra});};
test('active non-MK birthdays create all-day Day SWC events without publishing or Calendar API writes',()=>{
 const h=fixture(),r=pull(h,snapshot([person('a'),person('b',{active:'N'}),person('c',{mk:'MK'}),person('d',{day:'bad'})]));
 assert.equal(r.created,1);assert.equal(r.skipped,3);const e=rows(h)[0];assert.equal(e.StaffTitle,'Happy Bday Teacher a');assert.equal(e.StartDate,'2026-10-05');assert.equal(e.EndDate,e.StartDate);assert.equal(e.EventType,'ALL_DAY');assert.equal(e.LaneID,'day');assert.equal(e.OwnerTag,'SWC');assert.equal(e.Status,'PUBLISHED');assert.equal(e.StaffSyncState,'PENDING_SYNC');assert.match(e.CreatedBy,/^CONTACTS-BIRTHDAY-V1\|/);assert.equal(h.audit.calendarCalls.length,0);assert.equal(rows(h).length,1);
 const old=rows(h)[0];const again=pull(h,snapshot([person('a')]));assert.equal(again.created,0);assert.equal(again.updated,0);assert.equal(rows(h).length,1);assert.equal(rows(h)[0].UpdatedAt,old.UpdatedAt);
});
test('changed date and TTb name update stable event and preserve external links',()=>{
 const h=fixture();pull(h,snapshot([person('a')]));const old=rows(h)[0];h.seed('Events',[{...old,StaffCalendarEventId:'remote',StaffSyncHash:'old',StaffSyncState:'SYNCED'}]);
 const r=pull(h,snapshot([person('a',{name:'New name',month:'11',day:'6'})]));const e=rows(h)[0];assert.equal(r.updated,1);assert.equal(e.EventID,old.EventID);assert.equal(e.StaffTitle,'Happy Bday New name');assert.equal(e.StartDate,'2026-11-06');assert.equal(e.StaffCalendarEventId,'remote');assert.equal(e.StaffSyncState,'PENDING_SYNC');
});
test('cleared birthdays soft-delete only generated event and retain pending staff deletion',()=>{
 const h=fixture();pull(h,snapshot([person('a')]));const owned={...rows(h)[0],StaffCalendarEventId:'remote'};h.seed('Events',[owned,{...h.base,EventID:'manual',Year:2026,StaffTitle:owned.StaffTitle,CreatedBy:'admin'}]);
 const r=pull(h,snapshot([person('a',{day:'',month:''})]));assert.equal(r.removed,1);assert(rows(h).find(e=>e.EventID===owned.EventID).DeletedAt);assert.equal(rows(h).find(e=>e.EventID===owned.EventID).StaffSyncState,'PENDING_REMOVAL');assert.equal(rows(h).find(e=>e.EventID===owned.EventID).StaffCalendarEventId,'remote');assert(!rows(h).find(e=>e.EventID==='manual').DeletedAt);assert.equal(pull(h,snapshot([person('a',{day:'',month:''})])).removed,0);
 const data=h.call('bootstrap',{year:2026});assert(data.pendingRemovals.some(r=>r.eventId===owned.EventID&&r.staff));
});
test('inactive and MK source records remove owned birthdays; missing or malformed source preserves them',()=>{
 const h=fixture();pull(h,snapshot([person('a'),person('b'),person('c'),person('d')]));
 const r=pull(h,snapshot([person('a',{active:'N'}),person('b',{mk:'MK'}),person('c',{day:'oops'})]));assert.equal(r.removed,2);assert(!rows(h).find(e=>e.StaffTitle==='Happy Bday Teacher c').DeletedAt);assert(!rows(h).find(e=>e.StaffTitle==='Happy Bday Teacher d').DeletedAt);
});
test('incomplete source, duplicate identity and invalid authority never mutate Calendar',()=>{
 for(const change of [{complete:false},{authoritative:false},{count:2},{people:[person('a'),person('a')],count:2}]){const h=fixture();assert.throws(()=>pull(h,{...snapshot([person('a')]),...change}),/source|Contacts|identity/i);assert.equal(h.audit.nativeWrites.length,0);}
 const h=fixture();h.sandbox.calendarBirthdaySource_=()=>{throw Error('must not read');};assert.throws(()=>h.call('pullBirthdays',{year:2026,operationId:crypto.randomUUID()},'teacher'),e=>e.status===403);assert.equal(h.audit.nativeWrites.length,0);
});
test('selected planning year stays Hidden and does not release the year',()=>{
 const h=fixture();pull(h,snapshot([person('a')]),{year:2027});assert.equal(rows(h)[0].Status,'HIDDEN');assert.equal(rows(h)[0].Year,2027);assert.equal(h.sandbox.findRowByKey_(h.sheets.get('Years'),'Year',2027).object.ReleasedToTeachers,'No');
});
test('current Contacts identity remains authoritative regardless of historical import ambiguity',()=>{const h=fixture();assert.equal(pull(h,snapshot([person('resolved',{name:'Syahirah'})])).created,1);assert.equal(rows(h)[0].StaffTitle,'Happy Bday Syahirah');});
test('February 29 is skipped in non-leap year without inventing a different birthday',()=>{const h=fixture();const r=pull(h,snapshot([person('a',{month:'2',day:'29'})]));assert.equal(r.skipped,1);assert.equal(r.created,0);});
test('same operation receipt cannot recreate a birthday cleared by a later pull',()=>{
 const h=fixture(),operationId=crypto.randomUUID(),first=pull(h,snapshot([person('a')]),{operationId});pull(h,snapshot([person('a',{day:'',month:''})]));h.sandbox.calendarBirthdaySource_=()=>{throw Error('source unavailable');};assert.deepEqual(h.call('pullBirthdays',{year:2026,operationId}),first);assert(rows(h)[0].DeletedAt);
});
test('older concurrent source snapshot cannot overwrite a newer completed pull',()=>{const h=fixture();pull(h,{...snapshot([person('a')]),observedAt:Date.now()+100});assert.throws(()=>pull(h,{...snapshot([person('a',{day:'',month:''})]),observedAt:Date.now()-100}),e=>e.code==='STALE_BIRTHDAY_SOURCE');assert(!rows(h)[0].DeletedAt);});
test('ownership collision preserves manual event and refuses generated replacement',()=>{
 const h=fixture(),source=snapshot([person('a')]);pull(h,source);const owned=rows(h)[0];h.seed('Events',[{...owned,CreatedBy:'admin'}]);assert.throws(()=>pull(h,source),/ownership|identity|manual/i);assert.equal(rows(h)[0].CreatedBy,'admin');
});
test('lost committed native receipt response recovers receipt and uncertain write fences later updates',()=>{
 const h=fixture();h.setFault((stage,w)=>{if(stage==='after'&&w.sheet==='MutationLog'&&w.values.some(row=>row.includes('COMMITTED')))throw Error('Lost reply');});assert.equal(pull(h,snapshot([person('a')])).created,1);assert.equal(rows(h).length,1);
 const f=fixture();f.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Events')throw Error('Unknown write');});assert.throws(()=>pull(f,snapshot([person('a')])),e=>e.code==='UNKNOWN');f.setFault(null);assert.throws(()=>pull(f,snapshot([person('a')])),e=>e.code==='PENDING_EVENT_WRITE');assert.equal(rows(f).length,0);
});
test('signed Calendar-to-Contacts bridge reads the current source and denies bad secret without writes',()=>{
 const contacts=require('./contacts503-fixture.js')({source:fs.readFileSync('Contacts_Code.gs','utf8')+'\n'+fs.readFileSync('backend/Contacts_Birthdays.gs','utf8')});
 const row=contacts.sheets.get('contacts').data[2];row[contacts.headers.indexOf('Day of Birth')]='4';row[contacts.headers.indexOf('Month of birth')]='6';
 const h=fixture();h.props.set('CONTACTS_APPS_SCRIPT_URL','https://script.google.com/macros/s/test/exec');h.props.set('GSIS_SECRET','x'.repeat(32));
 h.sandbox.Utilities.computeHmacSha256Signature=(text,key)=>[...crypto.createHmac('sha256',key).update(text).digest()];
 h.sandbox.UrlFetchApp={fetch(url,options){assert.equal(url,'https://script.google.com/macros/s/test/exec');const envelope=JSON.parse(options.payload),request=JSON.parse(envelope.payload);assert.equal(request.action,'calendarBirthdays');assert.equal(request.identity.email,'admin@gsps.edu.sg');assert.equal(h.sandbox.rc18IO_().lockDepth,0,'network source read must not hold Calendar writer lock');contacts.ctx.signed={postData:{contents:options.payload}};const text=contacts.run('doPost(signed).text');return {getResponseCode:()=>200,getContentText:()=>text};}};
 const r=h.call('pullBirthdays',{year:2026,operationId:crypto.randomUUID()});assert.equal(r.created,1);assert.equal(rows(h)[0].StartDate,'2026-06-04');
 h.props.set('GSIS_SECRET','z'.repeat(32));const before=h.audit.nativeWrites.length;assert.throws(()=>h.call('pullBirthdays',{year:2026,operationId:crypto.randomUUID()}),e=>e.code==='CONTACTS_UNAVAILABLE');assert.equal(h.audit.nativeWrites.length,before);
});
test('a 1000-birthday removal keeps audit cells bounded with exact count and complete change digest',()=>{
 const h=fixture(),people=Array.from({length:1000},(_,i)=>person('scale-'+i,{active:'N'}));
 const events=people.map(p=>({...h.base,EventID:h.sandbox.calendarBirthdayId_(p.id,2026),CreatedBy:h.sandbox.calendarBirthdayMarker_(p.id),Year:2026,StaffTitle:'Happy Bday '+p.name,LaneID:'day',OwnerTag:'SWC',EventType:'ALL_DAY',StartDate:'2026-10-05',EndDate:'2026-10-05',StartTime:'',EndTime:'',ParentEnabled:'No',StaffCalendarEventId:'',ParentCalendarEventId:''}));
 h.seed('Events',events);
 h.setFault((stage,w)=>{if(stage==='before')for(const row of w.values||[])for(const text of row){if(typeof text==='string'&&text.length>50000)throw Error('Sheets cell exceeds 50000 characters');}});
 const result=pull(h,snapshot(people));assert.equal(result.removed,1000);assert.equal(rows(h).filter(e=>e.DeletedAt).length,1000);
 const audit=h.sandbox.tableObjects_(h.sheets.get('AuditLog')).find(r=>r.Action==='PULL_CONTACTS_BIRTHDAYS');assert(audit.AfterJSON.length<12000,'Audit evidence must remain below the Sheets cell limit');const value=JSON.parse(audit.AfterJSON),ids=events.map(e=>e.EventID).sort();assert.equal(value.removed,1000);assert.equal(value.eventIdsTotal,1000);assert.equal(value.eventIdsTruncated,true);assert(value.eventIds.length<=50);assert.deepEqual(value.eventIds,ids.slice(0,50));assert.equal(value.eventIdsSha256,crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex'));
 const receipt=h.sandbox.tableObjects_(h.sheets.get('MutationLog')).find(r=>r.OperationID===result.operationId);assert.equal(receipt.State,'COMMITTED');const auditWrites=h.audit.nativeWrites.filter(row=>row.sheet==='AuditLog');assert.equal(auditWrites.length,1);for(const name of ['Events','AuditLog','MutationLog'])assert(h.audit.nativeWrites.some(row=>row.sheet===name),name+' is included in the completed native operation');assert.equal(h.audit.apiWrites.length,0);
});
console.log(tests.length+' birthday checks passed');
