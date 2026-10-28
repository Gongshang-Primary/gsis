'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function setup(at='2026-10-23T00:00:00Z'){
 let now=Date.parse(at),held=false,store={schema:1,revision:1,outbox:[{id:'failed-1',name:'Teacher One',kind:'relief_updated',date:'2026-10-23',status:'uncertain',attempts:1,error:'https://private.example/secret-token',createdAt:'2026-10-22T23:01:00Z'},{id:'valid-pending',status:'queued',name:'Teacher Pending',data:{privateLink:'preserve'}}],deliveryReview:{revision:0,issues:[],monitor:[],jobs:[{id:'obsolete',status:'queued'},{id:'inflight',status:'sending'},{id:'sent',status:'sent'}]},smcAlerts:[{key:'delivery:failed-1'},{key:'allocation:other'}],inbox:[{id:'keep'}]},files=new Map([['root',{id:'root',name:'Roster',mimeType:'application/vnd.google-apps.folder',parents:['gsis']}]]),serial=0,afterWrite=null,failWrite=false,loseResponse=false,failCommit=false;
 const calls={mail:0,creates:[],patches:[],commits:0},copy=v=>JSON.parse(JSON.stringify(v)),reply=(data,status=200)=>({getContentText:()=>typeof data==='string'?data:JSON.stringify(data),getResponseCode:()=>status});
 const missing=()=>Object.assign(Error('missing'),{rosterDrive:{httpStatus:404}});
 const scope=vm.createContext({console,Map,Set,JSON,Array,Number,String,Object,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},ROSTER_ROOT:'root',Utilities:{getUuid:()=>crypto.randomUUID()},rosterServiceContacts_:()=>({c:{rosterPeople:[{id:'admin',active:true,email:'admin@example.test'}],rosterAdminIds:['admin']}}),MailApp:{getRemainingDailyQuota:()=>5,sendEmail:()=>{calls.mail++;throw Error('Email forbidden');}},gsisRequireBackendRole_:k=>assert.equal(k,'roster'),error_:(status,msg)=>{throw Object.assign(Error(msg),{status});},rosterOperationsDigest_:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),rosterNotificationEnsure_:()=>{},rosterNotificationState_:()=>copy(store),rosterNotificationLock_:()=>({tryLock(){if(held)return false;held=true;return true;},releaseLock(){held=false;}}),deployLock_:(lock)=>lock.tryLock(),deployUnlock_:lock=>lock.releaseLock(),rosterNotificationCommit_:state=>{assert(held);calls.commits++;if(failCommit){failCommit=false;throw Error('Settlement unavailable');}store=copy(state);store.revision++;},rosterDriveJson_:response=>JSON.parse(response.getContentText()),rosterFindFile_:(parent,name)=>{assert(!held,'file discovery outside transport lock');return [...files.values()].find(f=>f.parents?.includes(parent)&&f.name===name)?.id||'';},rosterReadFile_:id=>{assert(!held,'file verification outside transport lock');if(!files.has(id))throw missing();return files.get(id).text||'';},rosterDriveRequest_:(url,options={},operation)=>{
  assert(!held,'Drive report I/O must not hold transport lock');const method=options.method||'get';
  if(url.includes('/generateIds'))return reply({ids:Array.from({length:5},()=>`reserved-${++serial}`)});
  const id=/\/files\/([^?]+)/.exec(url)?.[1];
  if(method==='get'){if(!files.has(id))throw missing();return reply(files.get(id));}
  if(method==='post'){
   let meta,text;if(options.contentType?.startsWith('multipart/related')){const boundary=options.contentType.split('boundary=')[1],parts=String(options.payload).split('--'+boundary);meta=JSON.parse(parts[1].split('\r\n\r\n')[1].trim());text=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/,'');}else meta=JSON.parse(options.payload);
   if(failWrite&&meta.mimeType==='text/plain')throw failWrite===true?Error('Drive unavailable'):failWrite;
   if(files.has(meta.id))throw Object.assign(Error('already exists'),{rosterDrive:{httpStatus:409}});
   files.set(meta.id,{...meta,...(text===undefined?{}:{text})});calls.creates.push({id:meta.id,name:meta.name});
   if(meta.mimeType==='text/plain'&&afterWrite){const callback=afterWrite;afterWrite=null;callback();}
   if(meta.mimeType==='text/plain'&&loseResponse){loseResponse=false;throw Error('Response lost');}
   return reply({id:meta.id});
  }
  calls.patches.push(url);throw Error('Unexpected Drive '+operation);
 }});
 vm.runInContext(fs.readFileSync('backend/RosterDeliveryReview.gs','utf8'),scope);
 return {scope,calls,files,state:()=>copy(store),edit:fn=>fn(store),tick:ms=>{now+=ms;},run:monitor=>scope.rosterDeliveryReviewMailDispatch_({monitor}),onWrite:fn=>{afterWrite=fn;},failWrite:v=>{failWrite=v;},loseResponse:()=>{loseResponse=true;},failNextCommit:()=>{failCommit=true;}};
}
{
 const h=setup('2026-10-22T23:59:59Z'),outcome=h.run();assert.equal(h.calls.mail,0,'delivery review must never send email');assert.equal(outcome.deferred,'before-0800');assert.equal(h.files.size,1);assert(h.state().deliveryReview.jobs.filter(j=>['obsolete','inflight'].includes(j.id)).every(j=>j.status==='superseded'),'obsolete report work is retired without clearing issues');assert.equal(h.state().deliveryReview.issues.length,1);
 h.tick(1000);const original=h.state().outbox[0],inbox=h.state().inbox;const result=h.run();assert.equal(result.reported,1);assert.equal(result.cleared,1);assert.equal(h.state().deliveryReview.issues.length,0);assert(h.state().smcAlerts[0].closedAt);assert(!h.state().smcAlerts[1].closedAt);for(const [key,value] of Object.entries(original))assert.deepEqual(h.state().outbox[0][key],value,'provider outcomes preserved');assert.deepEqual(h.state().inbox,inbox);assert.equal(h.state().outbox[1].status,'queued');assert.equal(h.state().outbox[1].data.privateLink,'preserve');const file=[...h.files.values()].find(f=>f.mimeType==='text/plain');assert.equal(file.name,'WhatsApp-Delivery-Issues-2026-10-23.txt');assert.match(file.text,/Teacher One/);assert.match(file.text,/Captured: 2026-10-23 08:00:00 SGT/);assert.match(file.text,/provider outcome could not be confirmed/);assert(!file.text.includes('secret-token'));assert.deepEqual(h.calls.creates.map(f=>f.name),['WhatsApp','Delivery Reports','2026','10','WhatsApp-Delivery-Issues-2026-10-23.txt']);assert.equal(h.calls.mail,0);
 const count=h.calls.creates.length;h.run();assert.equal(h.calls.creates.length,count,'same day report is immutable and not duplicated');assert.equal(h.state().deliveryReview.issues.length,0,'reported fingerprint stays cleared');
 h.edit(s=>{s.outbox[0].attempts++;s.outbox[0].error='New failure';});h.run();assert.equal(h.state().deliveryReview.issues.length,1,'new outcome remains for next day');assert.equal(h.calls.creates.length,count);h.tick(86400000);h.run();assert.equal(h.state().deliveryReview.issues.length,0);assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,2);
}
{
 const h=setup();h.failWrite(true);const result=h.run();assert.equal(result.pending,1);assert.equal(h.state().deliveryReview.issues.length,1);assert(!h.state().outbox[0].adminReviewReceipt);const report=h.state().deliveryReview.reports['2026-10-23'];assert(report.fileId);h.failWrite(false);h.tick(600000);h.run();assert.equal(h.state().deliveryReview.issues.length,0);assert(h.files.has(report.fileId));assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,1);
}
{
 const h=setup();h.onWrite(()=>{h.edit(s=>{s.outbox[0].attempts++;s.outbox.push({id:'new',status:'failed',name:'Teacher Two'});});const concurrent=h.run();assert.equal(concurrent.busy,true,'active durable report claim prevents another writer');});h.loseResponse();h.run();assert.equal(h.state().deliveryReview.issues.length,2,'changed and newly added issues survive exact snapshot settlement');assert(!h.state().outbox[0].adminReviewReceipt);assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,1);h.run();assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,1,'lost create response is recovered by reserved identity');
}
{
 const h=setup();h.onWrite(()=>h.failNextCommit());const result=h.run();assert.equal(result.diagnostic?.code,'SETTLEMENT_UNCONFIRMED');assert.equal(result.diagnostic.stage,'settle-commit');assert.equal(h.state().deliveryReview.reports['2026-10-23'].error.code,'SETTLEMENT_UNCONFIRMED');assert.equal(h.state().deliveryReview.issues.length,1,'unconfirmed settlement retains entries');h.tick(600000);h.run();assert.equal(h.state().deliveryReview.issues.length,0,'saved-file retry settles without another file');assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,1);
}
{
 const h=setup();h.run({state:'failed',checkedAt:100});assert.equal(h.state().deliveryReview.issues.length,0);h.run({state:'failed',checkedAt:200});assert.equal(h.state().deliveryReview.issues.length,0,'unchanged reported monitoring issue stays closed');h.run({state:'checked',checkedAt:300,routes:[]});h.run({state:'failed',checkedAt:400});assert.equal(h.state().deliveryReview.issues.length,1,'new monitor occurrence is retained');h.run({state:'checked',checkedAt:250,routes:[]});assert.equal(h.state().deliveryReview.issues.length,1,'late check cannot erase newer issue');
}
{
 const h=setup();h.onWrite(()=>{const file=[...h.files.values()].find(f=>f.mimeType==='text/plain');file.text='Unexpected file contents';});assert.equal(h.run().pending,1);assert.equal(h.state().deliveryReview.issues.length,1,'a created file is not enough: content must verify');assert(!h.state().outbox[0].adminReviewReceipt);
}
{
 const h=setup();h.files.set('reserved-5',{id:'reserved-5',name:'Someone else’s report',mimeType:'text/plain',parents:['root'],text:'Preserve'});assert.equal(h.run().pending,1);assert.equal(h.files.get('reserved-5').text,'Preserve','a wrong owner/parent/digest is never overwritten');assert.equal(h.state().deliveryReview.issues.length,1);
}
{
 const h=setup();h.onWrite(()=>{h.tick(600001);assert.equal(h.run().reported,1,'expired claim retries the same frozen report');});h.run();assert.equal(h.state().deliveryReview.issues.length,0);assert.equal(h.calls.creates.filter(f=>f.name.endsWith('.txt')).length,1,'stale and current owners cannot duplicate report');
}
{
 const h=setup();h.failWrite(Object.assign(Error('Teacher Name secret-token https://private.example'),{rosterDrive:{httpStatus:403,reasons:['insufficientFilePermissions']}}));const result=h.run();assert.equal(result.diagnostic?.stage,'file-create');assert.equal(result.diagnostic.code,'DRIVE_ACCESS_DENIED');assert.equal(result.diagnostic.httpStatus,403);assert.equal(h.state().deliveryReview.reports['2026-10-23'].error.code,'DRIVE_ACCESS_DENIED');assert(!JSON.stringify(result).includes('secret-token'));assert(!JSON.stringify(result).includes('Teacher Name'));assert.equal(h.state().deliveryReview.issues.length,1);
}
{
 const h=setup();h.failWrite(true);h.run();const captured=h.state().deliveryReview.reports['2026-10-23'];h.edit(s=>{s.deliveryReview.reports['2026-10-23'].claimId='new-claim';s.deliveryReview.reports['2026-10-23'].error={code:'NEWER_DIAGNOSTIC'};});assert.equal(h.scope.rosterDeliveryReviewRecordFailure_(captured,{stage:'file-create',code:'DRIVE_UNAVAILABLE',httpStatus:503}),false);assert.equal(h.state().deliveryReview.reports['2026-10-23'].error.code,'NEWER_DIAGNOSTIC','a stale claimant must not overwrite current diagnostics');
 const safe=h.scope.rosterDeliveryReviewDiagnostic_({message:'secret-token Teacher Name',stack:'private stack',deliveryReportCode:'private-token',rosterDrive:{httpStatus:'secret'}},'private-stage');assert.equal(safe.stage,'unknown');assert.equal(safe.code,'REPORT_OPERATION_FAILED');assert.equal(safe.httpStatus,null);assert(!JSON.stringify(safe).includes('private'));
}
console.log('PASS daily Drive report, frozen versions, idempotent file identity, no email, exact cleanup and concurrent/new outcomes');
