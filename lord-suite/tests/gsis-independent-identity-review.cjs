'use strict';
// Independent adversarial review: real LORD dispatch and identity readers,
// local immutable snapshots, no upstream or messaging service calls.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness,request,adminRequest}=require('./backend_harness.cjs');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

function setup(){
 const h=harness(),files=new Map();
 h.snapshot={schema:1,key:'review-generation-a',installation:h.ctx.LORD_CONFIG.SPREADSHEET_ID,createdAt:new Date(h.now).toISOString(),
  contacts:{schema:1,source:'contacts',key:'review-contacts-a',authoritative:true,people:[
   {id:'stable-staff',name:'Original Teacher',active:true,email:'staff@gsps.edu.sg',cesEmail:'staff@schools.gov.sg',statutoryName:'Original Statutory',mobile:'6591234567'},
   {id:'stable-admin',name:'Admin',active:true,email:'admin@gsps.edu.sg',cesEmail:'admin@schools.gov.sg',statutoryName:'Administrator',mobile:'6581234567'}]},
  deploy:{schema:1,source:'deploy',key:'review-deploy-a',authoritative:true,updatedAt:'2026-10-01T00:00:00Z',publication:{id:'published-2026',revision:3,commit:'commit-a',from:'2026-01-01',to:'2026-12-31'},classes:[{id:'shared-id',name:'1P',fullName:'1 Perseverance'}],teachingGroups:[{id:'shared-id',name:'Science group'}],subjects:[{id:'SCI',name:'SCI'}]},
  activities:[{id:'local-workshop',name:'Workshop'}]};
 h.ctx.DriveApp={getFileById(id){assert(files.has(id));return {getBlob:()=>({getDataAsString:()=>files.get(id)})};}};
 h.remoteCalls=0;h.ctx.UrlFetchApp.fetch=()=>{h.remoteCalls++;throw Error('Ordinary local reader must not call an upstream service');};
 h.publish=()=>{
  h.snapshot.contacts.key=digest(JSON.stringify(['lord-contacts-v1',h.snapshot.contacts.people]));
  const pub=h.snapshot.deploy.publication;h.snapshot.deploy.key=digest(JSON.stringify(['lord-deploy-v1',pub.id,pub.revision,pub.commit]));
  const key='gsis-v1-'+digest(JSON.stringify([h.snapshot.contacts.key,h.snapshot.deploy.key,h.snapshot.activities])).slice(0,48);
  h.snapshot.key=key;const fileId='file-'+key,raw=JSON.stringify(h.snapshot);files.set(fileId,raw);
  h.properties.LORD_GSIS_ENABLED='true';h.properties.LORD_GSIS_SNAPSHOT=JSON.stringify({schema:1,key,fileId,digest:digest(raw)});
  h.properties.LORD_GSIS_CHECK=JSON.stringify({key,ok:true,checkedAt:new Date(h.now).toISOString(),contactsCheckedAt:new Date(h.now).toISOString(),deployCheckedAt:new Date(h.now).toISOString()});h.reset();
 };
 h.publish();
 h.create=(extra={})=>h.post(request({referenceKey:h.snapshot.key,classRef:{kind:'class',id:'shared-id'},subjectId:'SCI',...extra}));
 h.row=()=>h.sheets.Bookings.data[1];
 h.renameAndReuse=()=>{
  h.snapshot.contacts.key='review-contacts-b';h.snapshot.contacts.people[0].name='Renamed Teacher';
  h.snapshot.contacts.people.push({id:'different-staff',name:'Original Teacher',active:true,email:'other@gsps.edu.sg',cesEmail:'',statutoryName:'Another Person',mobile:'6599999999'});h.publish('review-generation-b');
 };
 return h;
}

const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('new booking records server identity and stable binding in one transaction',()=>{
 const h=setup(),result=h.create();assert.equal(result.ok,true,result.error);
 assert.equal(h.row()[2],'Original Teacher');assert.equal(h.row()[25],'staff@gsps.edu.sg');
 const binding=h.sheets['Event Log'].data.find(row=>row[2]==='GSIS_REFERENCE_BOUND');assert(binding);
 assert.equal(JSON.parse(binding[5]).staffId,'stable-staff');assert.equal(h.batches.length,1);assert.equal(h.remoteCalls,0);
});
test('rename and reuse of a timetable name cannot redirect booked owner or phone',()=>{
 const h=setup();assert.equal(h.create().ok,true);const row=h.row();h.renameAndReuse();
 const contact=h.ctx.bookingTeacherContact_(row);assert.equal(contact.email,'staff@gsps.edu.sg');assert.equal(contact.mobile,'6591234567');
 assert.equal(row[2],'Original Teacher','historical display is retained');
 assert.equal(h.ctx.isBookingOwner_(row,{authEmail:'other@gsps.edu.sg',authSub:'other-sub'}),false);
 assert.equal(h.ctx.isBookingOwner_(row,{authEmail:'staff@gsps.edu.sg',authSub:'staff-sub'}),true);assert.equal(h.remoteCalls,0);
});
test('phone-only generation refresh changes the local recipient without rewriting history',()=>{
 const h=setup();assert.equal(h.create().ok,true);const before=JSON.stringify(h.row());
 h.snapshot.contacts.people[0].mobile='6587654321';h.snapshot.contacts.key='review-phone-only';h.publish('review-generation-phone');
 assert.equal(h.ctx.bookingTeacherContact_(h.row()).mobile,'6587654321');assert.equal(JSON.stringify(h.row()),before);
 h.ctx.gsisRequireFreshContacts_();assert.equal(h.remoteCalls,0);
});
test('inactive booked owner does not fall back to a new holder of the old name',()=>{
 const h=setup();assert.equal(h.create().ok,true);h.renameAndReuse();h.snapshot.contacts.people[0].active=false;h.publish('review-generation-inactive');
 assert.equal(h.ctx.bookingTeacherContact_(h.row()),null);assert.equal(h.remoteCalls,0);
});
test('unchanged historical fields keep owner binding through an admin edit',()=>{
 const h=setup();assert.equal(h.create().ok,true);h.renameAndReuse();const row=h.row();
 const result=h.post(adminRequest({action:'bookingUpdate',clientRequestId:'review-edit-1',bookingId:row[0],teacher:row[2],classOrActivity:row[4],subject:row[5],referenceKey:h.snapshot.key,remarks:'Reviewed original booking'}));
 assert.equal(result.ok,true,result.error);assert.equal(h.row()[2],'Original Teacher');assert.equal(h.row()[25],'staff@gsps.edu.sg');
 assert.equal(h.ctx.bookingTeacherContact_(h.row()).email,'staff@gsps.edu.sg');assert.equal(h.ctx.bookingTeacherContact_(h.row()).mobile,'6591234567');
});
test('class and teaching-group IDs have separate namespaces and local activities remain selectable',()=>{
 const h=setup(),ref=h.ctx.getReferenceData_();assert.equal(ref.referenceCatalog.classes[0].id,ref.referenceCatalog.teachingGroups[0].id);
 assert.equal(h.create({classRef:{kind:'teachingGroup',id:'shared-id'}}).ok,true);assert.equal(h.row()[4],'Science group');
 const k=setup();assert.equal(k.create({classRef:{kind:'activity',id:'local-workshop'}}).ok,true);assert.equal(k.row()[4],'Workshop');
 assert(!JSON.stringify(ref).includes('6591234567'));assert(!JSON.stringify(ref).includes('staff@gsps.edu.sg'));
});
test('a stale 1P form cannot silently adopt a new publication with the same abbreviation',()=>{
 const h=setup(),oldKey=h.snapshot.key;h.snapshot.deploy.key='review-deploy-b';h.snapshot.deploy.classes[0].fullName='1 Prudence';h.snapshot.deploy.publication.commit='commit-b';h.publish('review-generation-b');
 const result=h.create({referenceKey:oldKey});assert.equal(result.ok,false);assert.equal(result.code,'GSIS_REFERENCE_CHANGED');assert.equal(h.sheets.Bookings.data.length,1);
});
test('a phone change after recipient lookup fences the provider send until a new local execution',()=>{
 const h=setup();assert.equal(h.create().ok,true);h.ctx.bookingTeacherContact_(h.row());
 h.properties.LORD_GSIS_SNAPSHOT=JSON.stringify({schema:1,key:'other-generation',fileId:'other-file'});
 h.properties.LORD_GSIS_CHECK=JSON.stringify({key:'other-generation',ok:true,contactsCheckedAt:new Date(h.now).toISOString()});
 assert.throws(()=>h.ctx.gsisRequireFreshContacts_(),/changed during delivery/);assert.equal(h.remoteCalls,0);
});
test('a committed booking without its optional receipt replays after a reference generation changes',()=>{
 const h=setup(),payload=request({referenceKey:h.snapshot.key,classRef:{kind:'class',id:'shared-id'},subjectId:'SCI'});
 h.failProperty=h.ctx.idempotencyPropertyKey_(payload.clientRequestId);
 const committed=h.post(payload);assert.equal(committed.ok,true,committed.error);
 assert.equal(h.properties[h.failProperty],undefined,'simulate a committed request whose success response was lost and receipt was not stored');
 h.failProperty='';h.snapshot.contacts.people[0].mobile='6587654321';h.publish();
 const replay=h.post(payload);assert.equal(replay.ok,true,replay.error);assert.equal(replay.result.bookingId,committed.result.bookingId);
 assert.equal(replay.result.alreadyRecorded,true);assert.equal(h.sheets.Bookings.data.length,2);assert.equal(h.batches.length,1);assert.equal(h.remoteCalls,0);
});
test('committed batch replay uses its original stable command despite name reuse and rejects changed IDs',()=>{
 const h=setup(),payload=request({action:'bookingCreateBatch',referenceKey:h.snapshot.key,classRef:{kind:'class',id:'shared-id'},subjectId:'SCI',bookings:[{}, {date:'2026-10-10'}]});
 h.failProperty=h.ctx.idempotencyPropertyKey_(payload.clientRequestId);
 const committed=h.post(payload);assert.equal(committed.ok,true,committed.error);h.failProperty='';h.renameAndReuse();
 const changed=h.post({...payload,classRef:{kind:'teachingGroup',id:'shared-id'}});assert.equal(changed.ok,false,'same request ID must not accept a different namespace with the same ID');
 assert.equal(h.sheets.Bookings.data.length,3);assert.equal(h.batches.length,1);
 const replay=h.post(payload);assert.equal(replay.ok,true,replay.error);assert.equal(replay.result.alreadyRecorded,true);
 assert.deepEqual(replay.result.bookings.map(x=>x.bookingId),committed.result.bookings.map(x=>x.bookingId));
 assert.equal(h.sheets.Bookings.data.length,3);assert.equal(h.batches.length,1);assert.equal(h.row()[2],'Original Teacher');assert.equal(h.remoteCalls,0);
});
test('explicit custom activity and purpose text remains part of the durable retry command',()=>{
 const h=setup(),payload=request({referenceKey:h.snapshot.key,classRef:{kind:'customActivity',name:'Student workshop'},subjectRef:{kind:'customPurpose',name:'Project preparation'}});
 h.failProperty=h.ctx.idempotencyPropertyKey_(payload.clientRequestId);
 const committed=h.post(payload);assert.equal(committed.ok,true,committed.error);h.failProperty='';
 assert.equal(h.post({...payload,classRef:{kind:'customActivity',name:'Different workshop'}}).ok,false);
 assert.equal(h.post({...payload,subjectRef:{kind:'customPurpose',name:'Different purpose'}}).ok,false);
 h.snapshot.contacts.people[0].mobile='6587654321';h.publish();
 const replay=h.post(payload);assert.equal(replay.ok,true,replay.error);assert.equal(replay.result.alreadyRecorded,true);
 assert.equal(h.row()[4],'Student workshop');assert.equal(h.row()[5],'Project preparation');assert.equal(h.batches.length,1);assert.equal(h.remoteCalls,0);
});
test('REIGN keeps the stable identity binding with its retained or archived booking',()=>{
 const h=setup();assert.equal(h.create().ok,true);h.ss.getName=()=> 'Fictional transaction workbook';
 let snapshot=h.ctx.buildReignSnapshot_();
 assert.equal(snapshot.sheets.Bookings.preservedRows.length,1);
 assert.equal(snapshot.sheets['Event Log'].preservedRows.filter(row=>row[2]==='GSIS_REFERENCE_BOUND').length,1);
 h.now+=2*86400000;h.reset();snapshot=h.ctx.buildReignSnapshot_();
 assert.equal(snapshot.sheets.Bookings.rows.length,1);
 assert.equal(snapshot.sheets['Event Log'].rows.filter(row=>row[2]==='GSIS_REFERENCE_BOUND').length,1);
 assert.equal(snapshot.sheets['Event Log'].preservedRows.filter(row=>row[2]==='GSIS_REFERENCE_BOUND').length,0);assert.equal(h.remoteCalls,0);
});

let passed=0;
for(const [name,fn] of tests){try{fn();passed++;console.log('PASS '+name);}catch(error){console.error('FAIL '+name);throw error;}}
console.log('PASS '+passed+' independent LORD identity/history checks.');
