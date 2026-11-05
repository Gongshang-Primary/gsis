'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),S=require('../shared/roster-statistics.js');
function fixture(){
 const properties=new Map([['ROSTER_OPERATIONS_FILE','original-operations'],['ROSTER_INDEX_FILE','original-register'],['ROSTER_INBOX_FILE','original-inbox']]),writes=[],files=new Map(),state=O.initial();
 state.systemConfig.verboseLogging=false;state.nameBridges=[{timetableName:'Alice TTB',staffId:'alice'}];state.nameBridgesSeeded=true;state.dailyEmploymentSettings={recipients:['alice'],subject:'School update',time:'08:00'};state.types=[{id:'training',label:'Training leave',requiresDetail:true,allowSelectAll:true,allowedPeriods:null,afterMinutes:null,minStartMinutes:null,todayOnly:false}];
 files.set('original-operations',state);files.set('original-register',{schema:1,revision:4,entries:[],receipts:[]});
 const people=[{id:'alice',name:'Alice',active:true},{id:'bob',name:'Bob',active:true}],admin={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
 const scope={console,Date,GSISRosterOperations:O,GSISRosterAllocation:A,GSISRosterStatistics:S,ROSTER_DATA:'data',rosterToday_:()=> '2026-11-05',
  Utilities:{getUuid:()=>crypto.randomUUID(),newBlob:value=>({getBytes:()=>[...Buffer.from(value)],getDataAsString:()=>String(value)}),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,bytes)=>[...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()]},
  props_:()=>({getProperty:key=>properties.get(key)||null,getProperties:()=>Object.fromEntries(properties),setProperty:(key,value)=>{writes.push(key);properties.set(key,value);},setProperties:value=>{for(const [key,item]of Object.entries(value)){writes.push(key);properties.set(key,item);}},deleteProperty:key=>{writes.push(key);properties.delete(key);}}),
  LockService:{getScriptLock:()=>({}),getUserLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  rosterOperationsDigest_:hash,rosterOperationsStoredRead_:()=>{throw Error('Fallback source reader is forbidden');},rosterSplitReadDocument_:id=>({id,value:structuredClone(files.get(id))}),rosterFindFile_:()=>'',rosterReadFile_:id=>JSON.stringify(files.get(id)),
  rosterOperationsAuthority_:(c,identity)=>({staffId:c.user.rosterStaffId,email:identity.email,smc:c.user.rosterSMC,admin:c.user.rosterAdmin}),
  rosterOperationsState_:()=>{throw Error('Full operational hydration is forbidden');},rosterIndex_:()=>{throw Error('Baseline hydration is forbidden');},
  rosterPersonalCompletion_:(s,id,today)=>({from:today.slice(0,4)+'-01-01',to:today,completed:s.assignments.filter(row=>row.staffId===id).length}),
  rosterEdgeExportCreateImmutable_:()=>{throw Error('Small source must not create a history file');}
 };
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterMirror.gs','utf8'),scope);scope.rosterEdgeSnapshot_=()=>{throw Error('Full snapshot is forbidden');};
 const call=(input,c=admin,email='alice@example.test')=>scope.rosterEdgeMigrationDispatch_({input,identity:{email}},c)?.result;
 const service=input=>scope.rosterEdgeServiceMigrationDispatch_({input})?.result;
 const freezeId=crypto.randomUUID(),requestId=crypto.randomUUID(),effectiveDate='2026-11-05';
 const input={operation:'edgeFreshStartSource',requestId,effectiveDate,copyConfig:true};
 function freeze(){call({operation:'edgeFreeze',requestId:freezeId});}
 return {scope,properties,writes,files,state,admin,people,call,service,freeze,input,hash};
}
{
 const h=fixture();h.freeze();assert.throws(()=>h.call({...h.input,effectiveDate:'2026-11-06'}),e=>e.status===400,'a future fresh-start date must refuse');assert.equal(h.writes.filter(key=>key.startsWith('ROSTER_FRESH_START_SOURCE:')).length,0);
 console.log('PASS source refuses a future fresh-start date');
}
{
 const h=fixture();assert.throws(()=>h.call(h.input),e=>e.status===409,'fresh source requires confirmed freeze');h.freeze();
 assert.throws(()=>h.call(h.input,{...h.admin,user:{...h.admin.user,rosterAdmin:false}}),e=>e.status===403);
 const saved=h.call(h.input);assert.equal(saved?.adminVerified,true,'Admin source capture exists');assert.equal(saved.source.schema,'gsis-roster-fresh-start-source-v1');assert.equal(saved.source.settings.systemConfig.verboseLogging,false);assert.equal(saved.source.settings.nameBridges[0].staffId,'alice');assert.equal(saved.source.originalPointers.ROSTER_OPERATIONS_FILE,'original-operations');assert.equal(saved.source.freezeId,JSON.parse(h.properties.get('ROSTER_CUTOVER_FREEZE')).requestId);assert(Number.isFinite(Date.parse(saved.source.capturedAt)));
 assert.equal(saved.sourceDigest,h.hash(h.scope.rosterFreshStartJson_(saved.source)));assert.equal(saved.source.configDigest,h.hash(h.scope.rosterFreshStartJson_(saved.source.settings)));assert.equal(h.call(h.input).sourceDigest,saved.sourceDigest);
 assert.equal(saved.source.settings.types[0].id,'training','custom absence type survives fresh-start settings copy');assert.equal(saved.source.settings.typeDetailsVersion,1);
 assert.throws(()=>h.call({...h.input,copyConfig:false}),e=>e.status===409,'changed request must refuse');assert.throws(()=>h.call({...h.input,effectiveDate:'2026-11-04'}),e=>e.status===409);
 assert.throws(()=>h.call({...h.input,rawFileId:'original-operations'}),e=>e.status===400);
 const freeze=JSON.parse(h.properties.get('ROSTER_CUTOVER_FREEZE'));h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify({...freeze,requestId:crypto.randomUUID()}));assert.throws(()=>h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest}),e=>e.status===409,'a later freeze cannot activate an earlier capture');h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify(freeze));
 h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify({...freeze,state:'cancelled'}));assert.throws(()=>h.call(h.input),e=>e.status===409,'a cancelled freeze cannot replay source preparation');h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify(freeze));
 h.properties.set('ROSTER_INDEX_FILE','changed-register');assert.throws(()=>h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest}),e=>e.status===409,'a moved Google pointer cannot activate the capture');h.properties.set('ROSTER_INDEX_FILE','original-register');
 h.state.systemConfig.verboseLogging=true;assert.throws(()=>h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest}),e=>e.status===409,'configuration drift must refuse activation');assert.equal(h.properties.has('ROSTER_EDGE_AUTHORITY'),false);h.state.systemConfig.verboseLogging=false;
 const fence=h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});assert.equal(fence.legacyWritesDisabled,true);assert.equal(h.properties.get('ROSTER_EDGE_SOURCE_DIGEST'),saved.sourceDigest);assert.equal(h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest}).legacyWritesDisabled,true,'fence replay stays valid');
 const originals=saved.source.originalPointers;for(const [key,value]of Object.entries(originals))if(value)assert.equal(h.properties.get(key)||'',value,'capture/fence must not change Google pointer '+key);
 console.log('PASS fresh source requires Admin/freeze, binds retry input, avoids full snapshot and rejects config drift');
}
{
 const h=fixture();h.freeze();const saved=h.call(h.input);h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});h.service({operation:'edgeCutoverComplete',freezeId:saved.source.freezeId,sourceDigest:saved.sourceDigest});
 h.state.publicationSnapshots=[{id:'mine',assignmentId:'a',staffId:'alice',date:'2026-11-04',status:'published',publishedAt:'2026-11-04T00:00:00Z',period:1,assignment:{id:'a',staffId:'alice'}},{id:'other',assignmentId:'b',staffId:'bob',date:'2026-11-04',status:'published',publishedAt:'2026-11-04T00:00:00Z',period:1,assignment:{id:'b',staffId:'bob'}}];
 const teacher={...h.admin,user:{rosterStaffId:'bob',rosterSMC:false,rosterAdmin:false}},before=h.writes.length;
 const history=h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'history'},teacher,'bob@example.test');assert.equal(history.history.length,1);assert(history.history.every(row=>row.assignment.staffId==='bob'));assert.equal(history.archive.readOnly,true);
 const calculations=h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'calculations'},teacher,'bob@example.test');assert.equal(calculations.completion.to,'2026-11-04');
 const statistics=h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'statistics',from:'2026-11-01',to:'2026-11-30'});assert.equal(statistics.archive.throughDate,'2026-11-04');
 const proposal=h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'openingBalances'});assert.equal(proposal.proposed,true);assert.equal(proposal.rows.length,2);assert.equal(proposal.rows[0].asOfDate,'2026-11-04');assert.equal(h.state.openingBalances,undefined);
 assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'statistics',from:'2026-11-01',to:'2026-11-04'},teacher,'bob@example.test'),e=>e.status===403);
 assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'saveAbsence'},teacher,'bob@example.test'),e=>e.status===400);
 assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'history',fileId:'other'}),e=>e.status===400);
 assert.equal(h.writes.length,before,'archive projections must not write properties or documents');
 assert.throws(()=>h.scope.rosterMirrorDispatch_({input:{operation:'edgeMirror',step:'begin'}},true),e=>e.status===409,'normal mirror cannot overwrite archive');
 h.properties.set('ROSTER_MIRROR_RELEASE:stale-release',JSON.stringify({released:false,generationId:'old',epoch:1}));assert.throws(()=>h.scope.rosterMirrorDispatch_({input:{operation:'edgeMirror',step:'release',requestId:'stale-release',generationId:'old',epoch:1}},true),e=>e.status===409,'old mirror release replay cannot unfence fresh epoch');assert.equal(h.properties.get('ROSTER_EDGE_AUTHORITY'),'d1');
 const release={operation:'edgeFreshStartRelease',requestId:'fresh-release-0001',sourceDigest:saved.sourceDigest,archiveId:saved.source.archiveId,proof:{paused:true}};
 assert.throws(()=>h.service({...release,proof:{paused:false}}),e=>e.status===409);const released=h.service(release);assert.equal(released.released,true);assert.equal(h.properties.has('ROSTER_EDGE_AUTHORITY'),false);assert.equal(h.properties.get('ROSTER_OPERATIONS_FILE'),'original-operations');assert.equal(h.properties.get('ROSTER_INDEX_FILE'),'original-register');assert.equal(h.service(release).released,true);
 assert.throws(()=>h.service({...release,sourceDigest:'f'.repeat(64)}),e=>e.status===409);assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'history'},teacher,'bob@example.test'),e=>e.status===409,'archive route ends when original records become writable');
 console.log('PASS archive reads preserve permissions and write no data; fresh rollback preserves original Google pointers');
}
{
 const h=fixture();h.freeze();const saved=h.call({...h.input,copyConfig:false});assert.deepEqual(JSON.parse(JSON.stringify(saved.source.settings)),{});h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});
 const release={operation:'edgeFreshStartRelease',requestId:'lost-release-0001',sourceDigest:saved.sourceDigest,archiveId:saved.source.archiveId,proof:{paused:true}},remove=h.properties.delete.bind(h.properties);let lose=true;
 h.properties.delete=key=>{const result=remove(key);if(key==='ROSTER_EDGE_AUTHORITY'&&lose){lose=false;throw Error('Lost release acknowledgement');}return result;};
 assert.throws(()=>h.service(release),/Lost release acknowledgement/);assert.equal(h.properties.has('ROSTER_EDGE_AUTHORITY'),false);assert.equal(h.service(release).released,true,'retry completes the retained release after an uncertain unfence');
 assert.doesNotThrow(()=>h.scope.rosterEdgeAssertLegacyWrite_(),'release before edgeCutoverComplete must retire the freeze as well as the D1 authority');
 assert.equal(h.call({operation:'edgeFreeze',requestId:saved.source.freezeId}).cutoverFreeze.active,false,'a delayed source freeze cannot re-freeze released Google');
 h.properties.set('ROSTER_EDGE_AUTHORITY','d1');h.properties.set('ROSTER_EDGE_SOURCE_DIGEST','f'.repeat(64));h.properties.set('ROSTER_EDGE_FENCED_AT','newer-fence');assert.throws(()=>h.service(release),e=>e.status===409,'old release cannot unfence a newer owner');assert.equal(h.properties.get('ROSTER_EDGE_AUTHORITY'),'d1');
 console.log('PASS empty settings, uncertain release retry and newer-owner fence');
}
{
 for(const failure of ['history','current']){
  const h=fixture();h.freeze();const saved=h.call(h.input);h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});
  const release={operation:'edgeFreshStartRelease',requestId:'freeze-release-'+failure,sourceDigest:saved.sourceDigest,archiveId:saved.source.archiveId,proof:{paused:true}},set=h.properties.set.bind(h.properties);let lose=true;
  h.properties.set=(key,value)=>{const result=set(key,value);if(lose&&(failure==='history'?key===h.scope.rosterCutoverReceiptKey_(saved.source.freezeId):key==='ROSTER_CUTOVER_FREEZE')){lose=false;throw Error('Lost freeze retirement acknowledgement');}return result;};
  assert.throws(()=>h.service(release),/Lost freeze retirement acknowledgement/);assert.equal(h.properties.get('ROSTER_EDGE_AUTHORITY'),'d1','retirement must finish before removing the writer fence');
  const result=h.service(release);assert.equal(result.released,true);assert.equal(result.googleWritable,true);assert.doesNotThrow(()=>h.scope.rosterEdgeAssertLegacyWrite_());assert.equal(h.scope.rosterCutoverStatus_().active,false);
  const newerId=crypto.randomUUID();h.call({operation:'edgeFreeze',requestId:newerId});const before=h.writes.length;
  assert.throws(()=>h.service(release),e=>e.status===409,'an old release must not retire a newer Google freeze');assert.equal(h.scope.rosterCutoverStatus_().requestId,newerId);assert.equal(h.scope.rosterCutoverStatus_().active,true);assert.equal(h.writes.length,before);
 }
 console.log('PASS rollback retires only its matching freeze with retry-safe tombstones');
}
{
 const h=fixture();h.freeze();h.state.systemConfig.note='界'.repeat(2000);let file;
 h.scope.rosterEdgeExportCreateImmutable_=(name,raw)=>{file={name,raw};return {fileId:'large-source',digest:h.hash(raw)};};h.scope.rosterEdgeExportPrivateText_=ref=>{assert.equal(ref.fileId,'large-source');assert.equal(ref.digest,h.hash(file.raw));return file.raw;};
 const saved=h.call(h.input);assert(file,'UTF-8 source exceeding property bound uses an immutable file');assert.equal(h.call(h.input).sourceDigest,saved.sourceDigest);assert.equal(saved.source.settings.systemConfig.note,h.state.systemConfig.note);
 console.log('PASS Unicode settings use bounded private-source storage');
}
{
 const h=fixture();h.freeze();h.state.systemConfig.note='界'.repeat(2000);let stamp=Date.parse('2026-11-04T16:01:00Z'),frozen;
 h.scope.Date=class extends Date{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};
 h.scope.rosterEdgeExportCreateImmutable_=(name,raw)=>{if(!frozen){frozen={name,raw};throw Error('Lost immutable source upload response');}assert.equal(raw,frozen.raw,'recovered source retains timestamp and exact bytes');return {fileId:'retained-source',digest:h.hash(raw)};};h.scope.rosterEdgeExportPrivateText_=()=>frozen.raw;
 assert.throws(()=>h.call(h.input),/Lost immutable source upload response/);stamp+=60000;const result=h.call(h.input);assert.equal(result.source.capturedAt,'2026-11-04T16:01:00.000Z');assert.equal(h.call(h.input).sourceDigest,result.sourceDigest);
 console.log('PASS uncertain source upload retains exact capture bytes and timestamp');
}
{
 const h=fixture();h.freeze();let fallback=0;h.scope.rosterOperationsStoredRead_=()=>{fallback++;return {value:O.initial()};};
 const read=h.scope.rosterSplitReadDocument_;h.scope.rosterSplitReadDocument_=id=>{h.properties.set('ROSTER_OPERATIONS_FILE','newer-operations');return read(id);};
 assert.throws(()=>h.call(h.input),e=>e.status===409,'source rejects a pointer change during its strict read');assert.equal(fallback,0);
 h.properties.set('ROSTER_OPERATIONS_FILE','original-operations');h.scope.rosterSplitReadDocument_=read;const saved=h.call(h.input);h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});
 h.scope.rosterSplitReadDocument_=()=>{h.properties.set('ROSTER_OPERATIONS_FILE','newer-operations');throw Object.assign(Error('Captured file unavailable'),{status:503});};
 assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'calculations'}),e=>e.status===503);assert.equal(fallback,0,'unreadable captured file must never fall back to a newer pointer');
 h.properties.set('ROSTER_OPERATIONS_FILE','original-operations');h.scope.rosterSplitReadDocument_=id=>{const result=read(id);h.properties.set('ROSTER_OPERATIONS_FILE','newer-operations');return result;};
 assert.throws(()=>h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'calculations'}),e=>e.status===409,'archive rejects a pointer change while projecting');
 console.log('PASS strict captured-id reads reject missing files and pointer races without fallback');
}
{
 const h=fixture();h.scope.rosterToday_=()=> '2027-01-01';h.freeze();h.state.entitlements=[{staffId:'alice',year:'2026',week:'2026-12-28',quota:12,mode:'observed'}];h.state.assignments=[{id:'prior-year-duty',staffId:'alice',date:'2026-12-31',period:1,status:'completed',rCost:1,origin:'automatic',version:1}];
 const saved=h.call({...h.input,effectiveDate:'2027-01-01'});h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});const result=h.call({operation:'edgeArchiveRead',archiveId:saved.source.archiveId,view:'openingBalances'});
 assert.equal(result.archive.throughDate,'2026-12-31');assert(result.rows.length>0);assert(result.rows.every(row=>row.year==='2027'&&row.cumulativeQuota===0&&row.cumulativeDone===0),'January opening proposal must exclude the old accounting year');
 console.log('PASS January opening proposal excludes previous-year quota and relief');
}
{
 const h=fixture();h.freeze();const saved=h.call(h.input),input={operation:'edgeFreshStartDrift',sourceDigest:saved.sourceDigest},before=h.writes.length;
 const current=h.call(input);assert.equal(current.current,true,'fresh drift checks the small source');assert.equal(current.sourceDigest,saved.sourceDigest);assert.equal(current.changed.length,0);assert.equal(h.writes.length,before,'drift must not write');
 assert.throws(()=>h.call(input,{...h.admin,user:{...h.admin.user,rosterAdmin:false}}),e=>e.status===403);assert.throws(()=>h.call({...input,rawFileId:'original-operations'}),e=>e.status===400);
 h.state.systemConfig.verboseLogging=true;const settings=h.call(input);assert.equal(settings.current,false);assert.deepEqual(Array.from(settings.changed),['settings']);h.state.systemConfig.verboseLogging=false;
 h.properties.set('ROSTER_INDEX_FILE','new-register');const pointers=h.call(input);assert.equal(pointers.current,false);assert(pointers.changed.includes('pointers'));h.properties.set('ROSTER_INDEX_FILE','original-register');
 const freeze=JSON.parse(h.properties.get('ROSTER_CUTOVER_FREEZE'));h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify({...freeze,state:'cancelled'}));const cancelled=h.call(input);assert.equal(cancelled.current,false);assert(cancelled.changed.includes('freeze'));h.properties.set('ROSTER_CUTOVER_FREEZE',JSON.stringify(freeze));
 h.call({operation:'edgeFence',sourceDigest:saved.sourceDigest});h.service({operation:'edgeCutoverComplete',freezeId:saved.source.freezeId,sourceDigest:saved.sourceDigest});const activeBefore=h.writes.length;assert.equal(h.call(input).current,true,'drift works with the active fenced source');assert.equal(h.writes.length,activeBefore);
 console.log('PASS fresh drift reads small source with no snapshot or writes and reports settings/pointer/freeze changes');
}
