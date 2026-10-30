'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const adapter=require('./roster701-adapter.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const h=adapter(),files=new Map(),names=new Map(),events=[];let serial=0,corrupt=false,failMain=false;
 h.ctx.now=Date.parse('2026-10-31T20:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.today='2026-10-31';
 const oldRead=h.scope.rosterReadFile_;
 h.scope.rosterReadFile_=id=>{if(id==='ops-file')return oldRead(id);const value=files.get(id);return corrupt?value+'broken':value;};
 h.scope.rosterFindFile_=(_,name)=>names.get(name)||null;
 h.scope.Utilities.newBlob=text=>({getDataAsString:()=>String(text),getBytes:()=>[...Buffer.from(String(text))]});
 h.scope.props_=()=>({getProperty:key=>key==='ROSTER_OPERATIONS_FILE'?'ops-file':null,setProperty(){}});
 h.scope.rosterCreateFile_=(_,name,blob)=>{const id='archive-'+(++serial);names.set(name,id);files.set(id,blob.getDataAsString());events.push('archive-write');return id;};
 h.scope.rosterDriveRequest_=(url,options)=>{assert(h.locked());if(url.includes('/ops-file?')){events.push('main-write');if(failMain)throw Error('primary failure');h.setState(JSON.parse(options.payload));}else{const id=/files\/([^?]+)/.exec(url)[1];files.set(id,options.payload);events.push('archive-write');}return {};};
 h.scope.LockService.getUserLock=()=>({tryLock:()=>true,releaseLock(){}});
 vm.runInContext(fs.readFileSync('backend/RosterColdArchive.gs','utf8'),h.scope);
 const state=h.state();state.outbox.push({id:'sent-1',kind:'smc_report',recipientId:'alice',date:'2026-08-10',status:'sent',createdAt:'2026-08-10T00:00:00Z',completedAt:'2026-08-10T01:00:00Z',data:{body:'large saved message '.repeat(500)}});state.receipts.push({id:'receipt-1',actor:'alice@school.test',digest:'original',at:'2026-08-10T01:00:00Z',revision:1,result:{savedIds:['absence-1'],detail:'saved data '.repeat(300)}});h.setState(state);
 return {...h,files,names,events,original:clone(state),run:()=>h.scope.rosterColdArchiveRun_({now:h.ctx.now,manual:true,requestId:'archive-request'}),corrupt:()=>{corrupt=true;},failMain:()=>{failMain=true;},repair:()=>{corrupt=false;failMain=false;}};
}
test('verified monthly archive precedes main commit and resolves exact original payloads',()=>{
 const h=fixture(),before=JSON.stringify(h.original),result=h.run(),after=h.state();
 assert.equal(result.archive.lastRun.moved,2);assert(JSON.stringify(after).length<before.length);assert.deepEqual(h.events,['archive-write','main-write']);
 for(const collection of ['outbox','receipts']){const stub=after[collection][0];assert(stub.archiveRef);assert.equal(JSON.stringify(h.scope.rosterColdArchiveItem_(stub.archiveRef,after)),JSON.stringify(h.original[collection][0]));}
 const live=h.scope.rosterOperationsState_(true);assert.deepEqual(clone(live.receipts[0].result),h.original.receipts[0].result);assert(!JSON.stringify(live.receipts[0]).includes('saved data'));
});
test('failure after archive write retries without duplicate entries or lost records',()=>{
 const h=fixture();h.failMain();assert.throws(h.run,/primary failure/);assert.deepEqual(h.state(),h.original);assert.equal(h.files.size,1);h.repair();h.run();const stored=JSON.parse([...h.files.values()][0]);assert.equal(stored.items.length,2);assert(h.state().outbox[0].archiveRef);
});
test('unverified archive write leaves primary unchanged',()=>{
 const h=fixture();h.corrupt();assert.throws(h.run);assert.deepEqual(h.state(),h.original);assert(!h.events.includes('main-write'));
});
test('Admin-only archive endpoints reject teachers and malformed references',()=>{
 const h=fixture(),c={rosterPeople:[],user:{rosterSMC:false,rosterAdmin:false}},req={identity:{email:'teacher@school.test'},input:{operation:'archivedItem',archiveRef:{month:'2026-08',collection:'outbox',id:'sent-1'}}};
 assert.throws(()=>h.scope.rosterColdArchiveDispatch_(req,c),e=>e.status===403);h.run();assert.throws(()=>h.scope.rosterColdArchiveItem_({month:'../../',collection:'outbox',id:'sent-1'},h.state()),e=>e.status===400);
});
test('archived receipt replay preserves original result without serialising payloads back into primary',()=>{
 const h=fixture();h.run();const state=h.scope.rosterOperationsState_(true),bytes=JSON.stringify(state);
 assert.deepEqual(clone(state.receipts[0].result),h.original.receipts[0].result);assert.equal(JSON.stringify(state),bytes);
 const c={rosterPeople:[],user:{rosterAdmin:true,rosterSMC:true}},p={operation:'archiveColdOutput',requestId:'11111111-1111-4111-8111-111111111111'},req={identity:{email:'admin@example.test'},input:p};
 const first=h.scope.rosterColdArchiveDispatch_(req,c),writes=h.events.length,second=h.scope.rosterColdArchiveDispatch_(req,c);assert.equal(second.replayed,true);assert.equal(second.revision,first.revision);assert.equal(h.events.length,writes);
 const status=h.scope.rosterOperationsReceipt_({...req,input:{command:p}},c);assert.equal(status.accepted,true);
});
test('nightly completion prevents later full reads and daytime maintenance does no work',()=>{
 const h=fixture(),properties=new Map();h.scope.props_=()=>({getProperty:key=>key==='ROSTER_OPERATIONS_FILE'?'ops-file':properties.get(key),setProperty:(key,value)=>properties.set(key,value)});
 const result=h.scope.rosterColdArchiveRun_({now:h.ctx.now,manual:false});assert.equal(result.archive.lastRun.moved,2);
 h.scope.rosterOperationsState_=()=>assert.fail('completed maintenance must use cheap day marker');assert.equal(h.scope.rosterColdArchiveRun_({now:h.ctx.now,manual:false}).reason,'already-checked');
 assert.equal(h.scope.rosterColdArchiveRun_({now:Date.parse('2026-11-01T10:00:00+08:00'),manual:false}).reason,'outside-maintenance-hours');
});
test('archive success, save failure and transport contention release each acquired lock once',()=>{
 for(const outcome of ['success','save-failure','transport-busy']){
  const h=fixture(),script={},releases=[];let userHeld=false,scriptReleases=0,userReleases=0;
  const acquire=h.scope.deployLock_,unlock=h.scope.deployUnlock_;
  h.scope.LockService.getScriptLock=()=>script;
  h.scope.deployLock_=(lock,budget)=>{assert.equal(lock,script);return acquire(lock,budget);};
  h.scope.deployUnlock_=lock=>{assert.equal(lock,script);assert(h.locked());assert.equal(userHeld,false,'transport releases before the timed ScriptLock wrapper');scriptReleases++;releases.push('script');unlock(lock);};
  h.scope.rosterNotificationState_=()=>null;
  h.scope.LockService.getUserLock=()=>({tryLock(){assert(h.locked(),'ScriptLock must precede UserLock');if(outcome==='transport-busy')return false;userHeld=true;return true;},releaseLock(){assert(userHeld);userHeld=false;userReleases++;releases.push('user');}});
  if(outcome==='save-failure'){h.failMain();assert.throws(h.run,/primary failure/);}else if(outcome==='transport-busy')assert.equal(h.run().busy,true);else h.run();
  assert.equal(scriptReleases,1,outcome+' releases ScriptLock through deployUnlock_ once');assert.equal(userReleases,outcome==='transport-busy'?0:1,outcome+' releases only the acquired UserLock');assert.equal(h.locked(),false);assert.deepEqual(releases,outcome==='transport-busy'?['script']:['user','script']);
 }
});
test('late delivery updates scalar history without restoring payloads or archived alerts',()=>{
 const h=fixture();h.run();vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),h.scope);
 const state=h.state();state.smcAlerts=[{id:'closed',key:'delivery:sent-1',archiveRef:{month:'2026-08',collection:'smcAlerts',id:'closed',digest:'a'.repeat(64)}}];
 const store={outbox:[{...h.original.outbox[0],deliveryStatus:'read',deliveryAt:'2026-10-31T12:00:00Z',attemptHistory:[{details:'payload'}]}],smcAlerts:[{id:'closed',key:'delivery:sent-1',summary:'old large body'}],deliveryReview:{}};
 h.scope.rosterNotificationOverlayWith_(state,store);assert.equal(state.outbox[0].deliveryStatus,'read');assert.equal(state.outbox[0].data,undefined);assert.equal(state.outbox[0].attemptHistory,undefined);assert(state.smcAlerts[0].archiveRef);assert.equal(state.smcAlerts.length,1);
});
test('dated historical read restores exact old message only in a transient view',()=>{
 const h=fixture();h.run();const state=h.scope.rosterOperationsState_(true),view=h.scope.rosterColdArchiveDateView_(state,{date:'2026-08-10'});
 const {archiveRef,...original}=clone(view.outbox[0]);assert.deepEqual(original,h.original.outbox[0]);assert(archiveRef);assert(state.outbox[0].archiveRef);assert.equal(state.outbox[0].data,undefined);
});
test('a late successful callback updates archived history while the archived original stays exact',()=>{
 const h=fixture(),old=h.state();Object.assign(old.outbox[0],{status:'failed',retryable:false,error:'META_132000',providerError:{code:132000}});h.setState(old);h.run();
 vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),h.scope);
 const state=h.scope.rosterOperationsState_(true),ref=clone(state.outbox[0].archiveRef),transport={outbox:[{...old.outbox[0],status:'sent',deliveryStatus:'read',deliveryAt:'2026-10-31T12:00:00Z',error:'',providerError:undefined}],smcAlerts:[],deliveryReview:{}};
 h.scope.rosterNotificationOverlayWith_(state,transport);
 const view=h.scope.rosterColdArchiveDateView_(state,{date:'2026-08-10'}),row=view.outbox[0];
 assert.equal(row.status,'sent');assert.equal(row.deliveryStatus,'read');assert.equal(row.deliveryAt,'2026-10-31T12:00:00Z');assert.equal(row.error,'');assert.equal(row.failureCode,undefined);assert.equal(row.providerError,undefined);assert.deepEqual(clone(row.archiveRef),ref);assert.deepEqual(clone(row.data),old.outbox[0].data);
 assert.equal(state.outbox[0].error,'');assert.equal(state.outbox[0].failureCode,undefined);assert.equal(state.outbox[0].data,undefined);
 assert.deepEqual(clone(h.scope.rosterColdArchiveItem_(ref,state)),old.outbox[0]);
});
test('daily audit text export retains human actions and run evidence in primary',()=>{
 const h=adapter();vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),h.scope);h.scope.LockService.getUserLock=()=>({tryLock:()=>true,releaseLock(){}});h.scope.Utilities.newBlob=text=>({getBytes:()=>Buffer.from(text)});h.scope.rosterAllocationAuditFolder_=()=> 'folder';h.scope.rosterFindFile_=(_,name)=>name;h.scope.rosterAllocationAuditArchive_=state=>({state,fileId:'archive'});const write=h.scope.rosterDriveRequest_;h.scope.rosterDriveRequest_=(url,options)=>url.includes('.txt')?{}:write(url,options);
 const state=h.state();state.audit.push({id:'human-history',date:'2026-08-10',at:'2026-08-10T01:00:00Z',operation:'assign',actor:'teacher@example.test'});state.optimisationRuns.push({id:'run-history',date:'2026-08-10',at:'2026-08-10T01:00:00Z',status:'complete',decisionEvidence:{version:1,lessons:[]}});h.setState(state);
 const result=h.scope.rosterAllocationAuditExport_({});assert.equal(result.exported.length,1);assert(h.state().audit.some(row=>row.id==='human-history'));assert(h.state().optimisationRuns.some(row=>row.id==='run-history'));
});
