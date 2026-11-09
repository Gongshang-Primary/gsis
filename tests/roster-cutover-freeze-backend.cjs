'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const O=require('../shared/roster-operations.js');
function fixture(){
 const properties=new Map(),held=new Set(),events=[];let now=Date.parse('2026-11-01T00:00:00Z'),blocked=null;
 const state=O.initial(),index={schema:1,revision:1,entries:[],receipts:[]};
 const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
 const scope={console,GSISRosterOperations:O,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},ROSTER_DATA:'private',Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},ScriptApp:{getScriptId:()=> 'synthetic-roster'},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},newBlob:value=>({getBytes:()=>[...Buffer.from(value)],getContentType:()=> 'application/json'}),computeDigest:(_,value)=>[...crypto.createHash('sha256').update(Buffer.from(value)).digest()]},
  props_:()=>({getProperty:key=>properties.get(key)||null,getProperties:()=>Object.fromEntries(properties),setProperty:(key,value)=>{events.push({key,locks:[...held]});properties.set(key,value);},setProperties:value=>{for(const [key,item]of Object.entries(value)){events.push({key,locks:[...held]});properties.set(key,item);}},deleteProperty:key=>properties.delete(key)}),
  LockService:{getScriptLock:()=>({name:'script'}),getUserLock:()=>({name:'user'})},
  deployLock_:lock=>{if(blocked===lock.name)return false;assert(!held.has(lock.name),'lock must not nest');held.add(lock.name);return true;},deployUnlock_:lock=>held.delete(lock.name),
  gsisRequireBackendRole_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  rosterOperationsDigest_:hash,rosterFindFile_:()=>null,rosterReadFile_:()=>{throw Error('unexpected mutable read');},rosterDriveRequest_:()=>{throw Error('mutable I/O reached');},rosterStage_:()=>{},
  rosterOperationsState_:()=>structuredClone(state),rosterIndex_:()=>structuredClone(index)
 };
 vm.createContext(scope);
 for(const file of ['RosterOperations.gs','RosterNotificationStore.gs','RosterInbox.gs','RosterAbsenceIntake.gs','RosterColdArchive.gs','RosterEdgeMigration.gs'])vm.runInContext(fs.readFileSync('backend/'+file,'utf8'),scope);
 const roster=fs.readFileSync('backend/Roster.gs','utf8');
 vm.runInContext(roster.slice(roster.indexOf('function rosterCommit_('),roster.indexOf('function rosterPublic_(')),scope);
 scope.rosterOperationsState_=()=>structuredClone(state);scope.rosterNotificationState_=()=>null;scope.rosterInboxState_=()=>({schema:1,revision:0,threads:[],messages:[],audit:[],receipts:[],deliveryEvents:[],alerts:[]});
 vm.runInContext(roster.slice(roster.indexOf('function rosterDispatch_(')),scope);
 const call=(input,admin=true)=>scope.rosterDispatch_({action:'rosterOperations',input,identity:{email:'admin@example.test'}},{user:{rosterSMC:true,rosterAdmin:admin}});
 return {scope,properties,events,held,call,state,index,advance:ms=>{now+=ms;},block:name=>{blocked=name;}};
}
const id=crypto.randomUUID(),h=fixture(),frozen=h.call({operation:'edgeFreeze',requestId:id});
assert.equal(frozen?.cutoverFreeze?.active,true,'Admin freeze must be implemented');
assert.equal(frozen.cutoverFreeze.requestId,id);assert.equal(frozen.cutoverFreeze.ageMs,0);assert.equal(frozen.cutoverFreeze.overdue,false);
assert.deepEqual(h.events.find(e=>e.key==='ROSTER_CUTOVER_FREEZE').locks,['script','user'],'freeze is set only after both writer domains drain');
assert.equal(h.held.size,0);assert.equal(h.call({operation:'edgeFreeze',requestId:id}).cutoverFreeze.frozenAt,frozen.cutoverFreeze.frozenAt,'same request does not restart freeze age');
assert.throws(()=>h.call({operation:'edgeFreeze',requestId:crypto.randomUUID()}),e=>e.status===409);
assert.throws(()=>h.call({operation:'edgeFreeze',requestId:crypto.randomUUID()},false),e=>e.status===403);
const before=h.scope.rosterEdgeSnapshot_().sourceDigest,events=h.events.length;
for(const [name,work]of [
 ['user save',()=>h.scope.rosterOperationsCommit_(O.initial())],
 ['intake',()=>h.scope.rosterAbsenceIntakeCommit_({})],
 ['notification transport',()=>h.scope.rosterNotificationCommit_({})],
 ['inbox',()=>h.scope.rosterInboxCommit_({})],
 ['timetable register',()=>h.scope.rosterCommit_({})],
 ['cold archive',()=>h.scope.rosterColdArchiveRun_({manual:true})]
])assert.throws(work,e=>e.status===423&&e.code==='ROSTER_CUTOVER_FROZEN',name+' must refuse before mutable I/O');
assert.equal(h.events.length,events,'refused writes cannot update properties');assert.equal(h.scope.rosterEdgeSnapshot_().sourceDigest,before,'the real snapshot digest stays unchanged');
const fileSource=fs.readFileSync('backend/Roster.gs','utf8');vm.runInContext(fileSource.slice(fileSource.indexOf('const rosterFolderCache_='),fileSource.indexOf('// Both editor diagnostics')),h.scope);
const driveCalls=[];h.scope.ScriptApp.getOAuthToken=()=> 'synthetic-oauth';
h.scope.UrlFetchApp={fetch:(url,input)=>{driveCalls.push({url,input});const metadata=url.includes('/upload/')?{id:'immutable-file'}:url.includes('&q=')?{files:[]}:{id:'private-imports',mimeType:'application/vnd.google-apps.folder'};return {getAllHeaders:()=>({Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture'}),getResponseCode:()=>200,getContentText:()=>JSON.stringify(metadata)};}};
assert.throws(()=>h.scope.rosterCreateFile_('private','new model',h.scope.Utilities.newBlob('{}')),e=>e.code==='ROSTER_CUTOVER_FROZEN');
assert.equal(driveCalls.length,0,'ordinary file writes stop before OAuth or network');
assert.equal(h.scope.rosterEdgeExportImportFolder_(true),'private-imports','a frozen capture can create its server-selected private folder');
assert.equal(h.scope.rosterCreateFile_('private-imports','frozen source',h.scope.Utilities.newBlob('{}')),'immutable-file','the private uploader traverses the real Drive helper');
assert.equal(driveCalls.filter(row=>row.input.method==='post').length,2,'folder and resumable upload both use the guarded transport');
assert.equal(driveCalls.filter(row=>row.input.method==='put').length,1,'capture completes the guarded resumable upload');
assert.throws(()=>h.scope.rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/fixture',{method:'patch'},'operations-commit'),e=>e.code==='ROSTER_CUTOVER_FROZEN','direct business transport cannot borrow the preparation exception');
h.scope.rosterEdgeAssertLegacyWrite_(true);
h.properties.set('ROSTER_EDGE_AUTHORITY','d1');const fencedCalls=driveCalls.length;assert.throws(()=>h.scope.rosterCreateFile_('private-imports','frozen source',h.scope.Utilities.newBlob('{}')),e=>e.status===409,'the complete private uploader retains the D1 fence');assert.equal(driveCalls.length,fencedCalls);assert.throws(()=>h.scope.rosterEdgeAssertLegacyWrite_(true),e=>e.status===409,'preparation never bypasses the established D1 fence');h.properties.delete('ROSTER_EDGE_AUTHORITY');
h.advance(4*3600000);const overdue=h.scope.rosterEdgeServiceMigrationDispatch_({input:{operation:'edgeFenceStatus'}}).result.cutoverFreeze;
assert.equal(overdue.active,true);assert.equal(overdue.overdue,true);assert.equal(overdue.ageMs,4*3600000,'age warning never releases a freeze');
assert.throws(()=>h.call({operation:'edgeUnfreeze',requestId:crypto.randomUUID(),freezeId:crypto.randomUUID()}),e=>e.status===409,'stale tab cannot cancel a different freeze');
const cancelled=h.call({operation:'edgeUnfreeze',requestId:crypto.randomUUID(),freezeId:id});assert.equal(cancelled.cutoverFreeze.active,false);h.scope.rosterEdgeAssertLegacyWrite_();
assert.equal(h.call({operation:'edgeFreeze',requestId:id}).cutoverFreeze.active,false,'a delayed cancelled freeze request cannot freeze again');
h.state.revision++;assert.throws(()=>h.call({operation:'edgeFence',sourceDigest:before}),e=>e.status===409,'an unfrozen changed source still refuses activation');assert.equal(h.properties.has('ROSTER_EDGE_AUTHORITY'),false);
const contended=fixture();contended.block('user');assert.throws(()=>contended.call({operation:'edgeFreeze',requestId:crypto.randomUUID()}),e=>e.status===503);assert.equal(contended.properties.has('ROSTER_CUTOVER_FREEZE'),false);assert.equal(contended.held.size,0);
const pending=fixture();pending.scope.rosterAbsenceIntakePending_=()=>({blockedDates:['2026-11-02']});assert.throws(()=>pending.call({operation:'edgeFreeze',requestId:crypto.randomUUID()}),e=>e.status===409);assert.equal(pending.properties.has('ROSTER_CUTOVER_FREEZE'),false,'drain pre-existing Google intake before establishing an importable freeze');
const activated=fixture(),activeId=crypto.randomUUID();activated.call({operation:'edgeFreeze',requestId:activeId});
assert.throws(()=>activated.scope.rosterEdgeServiceMigrationDispatch_({input:{operation:'edgeCutoverComplete',freezeId:activeId,sourceDigest:'a'.repeat(64)}}),e=>e.status===409,'freeze cannot finish before Google is fenced');
activated.properties.set('ROSTER_EDGE_AUTHORITY','d1');activated.properties.set('ROSTER_EDGE_SOURCE_DIGEST','a'.repeat(64));
assert.equal(activated.scope.rosterEdgeServiceMigrationDispatch_({input:{operation:'edgeCutoverComplete',freezeId:activeId,sourceDigest:'a'.repeat(64)}}).result.cutoverFreeze.active,false);
assert.throws(()=>activated.scope.rosterEdgeAssertLegacyWrite_(),e=>e.status===409,'finishing freeze never restores Google after D1 activation');
const packed=require('./fixtures/roster099-packed-capture.cjs')();
assert.equal(packed.call({operation:'edgeFreeze',requestId:crypto.randomUUID()}).cutoverFreeze.active,true);
assert.equal(packed.call(packed.input).preparing,true,'real packed capture can proceed during a freeze');
assert.equal(packed.stats().decodes,0,'frozen capture still saves the packed representation');
const lease=fixture(),pastKey='ROSTER_STAPLER_LEASE:2026-10-30',past=JSON.stringify({fence:2});lease.properties.set(pastKey,past);
vm.runInContext(fs.readFileSync('backend/StaplerLeases.gs','utf8'),lease.scope);lease.scope.rosterToday_=()=> '2026-11-01';
const oldLock=lease.scope.deployLock_;lease.scope.deployLock_=lock=>{const acquired=oldLock(lock);if(acquired)lease.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify({schema:1,state:'frozen',requestId:crypto.randomUUID(),at:Date.now()}));return acquired;};
const leaseDigest=lease.scope.rosterEdgeSnapshot_().sourceDigest;
assert.throws(()=>lease.scope.rosterDispatch_({action:'rosterOperations',identity:{email:'admin@example.test'},input:{operation:'acquireStaplerLock',date:'2026-11-02',leaseSessionId:crypto.randomUUID(),leaseFence:0,staplerRevision:0}},{user:{rosterStaffId:'admin',rosterSMC:true,rosterAdmin:true},rosterPeople:[{id:'admin',name:'Synthetic Admin',active:true}]}),e=>e.code==='ROSTER_CUTOVER_FROZEN');
assert.equal(lease.properties.get(pastKey),past,'a writer admitted before freeze must not prune leases after waiting for ScriptLock');
assert.equal(lease.scope.rosterEdgeSnapshot_().sourceDigest,leaseDigest,'lease pruning cannot change the frozen source digest');
console.log('PASS Admin freeze, both locks, stable source, writer refusal, same-ID retry, stale cancellation, four-hour warning and verified completion');

(async()=>{
 const {edgeRosterMigration}=await import('../roster-update/public/edge-roster.js');
 const {readRosterCutoverFreeze}=await import('../shared/roster-cutover-freeze.js');
 const Import=require('../shared/roster-import.js'),db=require('./helpers/chunked-import-db.cjs')(),google=fixture(),realFetch=globalThis.fetch;
 const who={email:'admin@example.test',subject:'synthetic-admin'},requestId='failed-frozen-import',sessionId=crypto.createHash('sha256').update(JSON.stringify([who.email,requestId])).digest('hex'),binding={actor:who.email,requestId,sessionId},store=Import.open(db,binding),freezeId=crypto.randomUUID();
 const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/frozen-restart/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40)};let lost=true;
 try{
  await store.reserve();
  google.properties.set('ROSTER_EDGE_EXPORT:'+sessionId,JSON.stringify({...binding,state:'failed',sourceFileId:'retained-private-source'}));
  globalThis.fetch=async(_url,options)=>{const envelope=JSON.parse(options.body),req=JSON.parse(envelope.payload);assert.equal(envelope.signature,crypto.createHmac('sha256',env.GSIS_SECRET).update(envelope.payload).digest('hex'));assert.equal(req.action,'rosterOperations');
   try{const data=google.call(req.input);if(req.input.operation==='edgeExportAbandon'&&lost){lost=false;throw Error('lost abandonment acknowledgement');}return Response.json({ok:true,data});}catch(error){return Response.json({ok:false,status:error.status||503,error:error.message,code:error.code});}};
  await edgeRosterMigration(env,{operation:'freeze',requestId:freezeId},who);const digest=google.scope.rosterEdgeSnapshot_().sourceDigest;
  const reset={operation:'restart',requestId:'restart-frozen-import',importRequestId:requestId,sessionId};
  assert.throws(()=>google.call({operation:'edgeExportAbandon',requestId,sessionId,resetRequestId:reset.requestId},false),e=>e.status===403,'frozen preparation cleanup remains Admin-only');
  await assert.rejects(edgeRosterMigration(env,reset,who),e=>e.code==='ROSTER_IMPORT_CLEANUP_PENDING');
  const tombstone=JSON.parse(google.properties.get('ROSTER_EDGE_EXPORT_ABANDONED:'+sessionId)||'null');assert.equal(tombstone?.descriptor?.sourceFileId,'retained-private-source','frozen restart reaches real Admin-gated Google cleanup and retains the source after lost acknowledgement');
  assert.equal((await store.progress()).cleanupPending,true);
  const retried=await edgeRosterMigration(env,reset,who);assert.equal(retried.cleanupPending,false);assert.equal((await store.progress()).cleanupPending,false);
  assert.equal((await readRosterCutoverFreeze(env)).active,true,'restart never releases the Worker hold');assert.equal(google.scope.rosterCutoverStatus_().active,true,'restart never restores Google writers');assert.equal(google.scope.rosterEdgeSnapshot_().sourceDigest,digest,'preparation cleanup does not change the frozen source');
  console.log('PASS frozen restart traverses signed Worker RPC and actual Google dispatcher; lost cleanup acknowledgement retries safely with source and both fences retained');
 }finally{globalThis.fetch=realFetch;db.sql.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
