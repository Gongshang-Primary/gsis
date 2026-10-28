'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixedNow=Date.parse('2026-10-22T04:00:00Z'),copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const row=(id,status,extra={})=>({id,status,date:'2026-10-22',name:'Private Staff Name',kind:'stapler_timetable',recipientId:'private-recipient',expiresAt:fixedNow+3600000,linkIssuedAt:fixedNow-3600000,linkExpiresAt:fixedNow+6*86400000,attempts:1,attemptHistory:[{claimId:'claim-'+id,state:status}],data:{contentFingerprint:'published-1',timetableNoticeId:'notice-1',summary:'Private timetable'},...extra});
 return {schema:1,revision:7,outbox:[row('q','queued'),row('b','blocked'),row('c','claimed',{claimId:'claim-c'}),row('unprepared','sending',{claimId:'claim-unprepared'}),row('prepared','sending',{claimId:'claim-prepared',preparedAt:fixedNow-1000}),row('u','uncertain',{claimId:'claim-u',preparedAt:fixedNow-1000,error:'Unconfirmed provider outcome'}),row('f','failed',{providerError:{code:132018},error:'META_132018'}),row('sent','sent',{messageId:'wamid.sent'}),row('read','failed',{deliveryStatus:'read',messageId:'wamid.read'})],deliveryReview:{revision:2,issues:[],monitor:[],jobs:[{id:'email-q',status:'queued',to:'admin@example.test',revision:2},{id:'email-s',status:'sending',claimId:'mail-claim',claimedAt:new Date(fixedNow-1000).toISOString(),revision:2},{id:'email-done',status:'sent',sentAt:'2026-10-22T00:00:00Z',revision:2}]},smcAlerts:[{key:'delivery:u'},{notificationId:'f'},{key:'allocation:unrelated'}],absences:[{id:'absence',version:3}],allocations:{'2026-10-22':{P2:'teacher'}},timetables:{encoding:'gzip-base64',data:'H4sIAAAAAAA/EXACT-OPAQUE-COMPRESSED-BYTES=='},privateLinks:[{token:'not-to-be-logged',expiresAt:fixedNow+6*86400000}],receipts:[{id:'saved-absence'}],statistics:{preserve:'all'}};
}
function harness({legacy=false,split=false,primary=fixture()}={}){
 let now=fixedNow,failRead='',failWrite='',failLock='',invalidOwner=false;const files=new Map([['primary',JSON.stringify(primary)]]),locks=[],events=[],logs=[];
 const transport=()=>({schema:1,revision:4,owner:{email:'owner@example.test',scriptId:'roster-owner'},outbox:copy(primary.outbox),deliveryReview:copy(primary.deliveryReview),smcAlerts:copy(primary.smcAlerts),deliveryEvents:[],migrationComplete:true});
 if(split)files.set('transport',JSON.stringify(transport()));
 const scope=vm.createContext({console:{log:value=>logs.push(value)},Map,Set,JSON,Number,String,Array,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},ROSTER_DATA:'folder',Utilities:{getUuid:()=>crypto.randomUUID()},gsisRequireBackendRole_:kind=>{assert.equal(kind,'roster');events.push('role');},Session:{getEffectiveUser:()=>({getEmail:()=>invalidOwner?'other@example.test':'owner@example.test'})},ScriptApp:{getScriptId:()=> 'roster-owner'},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterOperationsDigest_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  props_:()=>({getProperty:key=>({'ROSTER_OPERATIONS_FILE':'primary','ROSTER_NOTIFICATION_TRANSPORT_FILE':split?'transport':null})[key]||null,setProperty(){}}),rosterFindFile_:()=>null,
  LockService:{getScriptLock:()=>({kind:'script'}),getUserLock:()=>({kind:'user'})},deployLock_:lock=>{events.push('lock:'+lock.kind);if(failLock===lock.kind)return false;assert(!locks.includes(lock.kind));if(lock.kind==='user')assert(locks.includes('script'));else assert(!locks.includes('user'));locks.push(lock.kind);return true;},deployUnlock_:lock=>{assert.equal(locks.pop(),lock.kind);events.push('unlock:'+lock.kind);},
  rosterReadFile_:id=>{events.push('read:'+id);assert(locks.includes('script'),'maintenance reads are inside the writer lock');if(id==='transport')assert(locks.includes('user'));if(failRead===id)throw Error('Read failed');return files.get(id);},
  rosterDriveRequest_:(url,options)=>{const id=/\/files\/([^?]+)/.exec(url)[1];events.push('write:'+id);assert(locks.includes('script'));if(split)assert(locks.includes('user'));if(failWrite===id)throw Error('Write failed');files.set(id,options.payload);return {};}
 });
 let review=fs.readFileSync('backend/RosterDeliveryReview.gs','utf8');
 if(legacy){const source=fs.readFileSync('Roster_Backend_v0.8.6a.gs','utf8');review=/\/\* GSIS_ROSTER_DELIVERY_REVIEW_BEGIN \*\/([\s\S]*?)\/\* GSIS_ROSTER_DELIVERY_REVIEW_END \*\//.exec(source)[1];}
 vm.runInContext(review,scope);if(split)vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),scope);
 vm.runInContext(fs.readFileSync('backend/RosterNotificationMaintenance.gs','utf8'),scope);
 return {scope,files,events,logs,locks,read:id=>JSON.parse(files.get(id||'primary')),set:(id,state)=>files.set(id,JSON.stringify(state)),inspect:()=>scope.inspectCurrentWhatsAppQueue(),clear:()=>scope.clearCurrentWhatsAppQueue(),failRead:id=>failRead=id,failWrite:id=>failWrite=id,failLock:id=>failLock=id,invalidOwner:()=>invalidOwner=true,tick:()=>now+=1000};
}
for(const legacy of [true,false]){
 const h=harness({legacy}),original=h.read(),raw=h.files.get('primary');
 h.inspect();assert.equal(h.files.get('primary'),raw);assert(!h.events.some(e=>e.startsWith('write:')));
 const result=h.clear(),saved=h.read();assert.equal(result.cleared.cancelled,4);assert.equal(result.cleared.preparedOutcomesRetained,1);assert.equal(result.cleared.cancelledReportEmails,1);assert.equal(result.cleared.inFlightReportEmails,1);
 for(const key of ['absences','allocations','timetables','privateLinks','receipts','statistics'])assert.deepEqual(saved[key],original[key],key+' must be preserved byte-for-byte as JSON');
 for(const before of original.outbox){const after=saved.outbox.find(r=>r.id===before.id);for(const key of ['attemptHistory','claimId','messageId','providerError','error','preparedAt','linkIssuedAt','linkExpiresAt','data'])assert.deepEqual(after[key],before[key],key+' is historical/private-link evidence');}
 for(const id of ['prepared','u'])assert.equal(saved.outbox.find(r=>r.id===id).status,'uncertain');assert.equal(saved.outbox.find(r=>r.id==='f').status,'failed');assert.equal(saved.deliveryReview.jobs.find(j=>j.id==='email-s').status,'sending');assert.equal(saved.deliveryReview.jobs.find(j=>j.id==='email-done').status,'sent');
 assert.equal(h.scope.rosterDeliveryReviewIssues_(saved,[],[]).length,0,'exact receipt suppresses legacy and current report regeneration');
 h.scope.rosterDeliveryReviewRefresh_(saved,null,['admin@example.test'],fixedNow);assert.equal(saved.deliveryReview.jobs.filter(j=>j.status==='queued').length,0,'no replacement email is created');
 assert(saved.smcAlerts[0].closedAt);assert(saved.smcAlerts[1].closedAt);assert(!saved.smcAlerts[2].closedAt);
 assert(!h.logs.join('').includes('Private Staff Name'));assert(!h.logs.join('').includes('not-to-be-logged'));assert.deepEqual(h.locks,[]);
 const firstRows=JSON.stringify(h.read().outbox);h.tick();h.clear();assert.equal(JSON.stringify(h.read().outbox),firstRows,'unchanged repeated maintenance is idempotent for delivery rows');
 const retried=h.read(),job=retried.outbox.find(r=>r.id==='q');job.status='queued';job.notificationIntentRevision=1;job.expiresAt=fixedNow+7200000;delete job.domainCancelled;h.set('primary',retried);h.tick();h.clear();assert.equal(h.read().outbox.find(r=>r.id==='q').status,'cancelled','a later explicit retry can be cancelled by a later cleanup');
 const newFailure=h.read();newFailure.outbox.find(r=>r.id==='u').attempts++;assert.equal(h.scope.rosterDeliveryReviewIssues_(newFailure,[],[]).length,1,'a materially changed outcome reopens');
 const monitor={id:'monitor',group:'monitoring',status:'check_failed'};assert.equal(h.scope.rosterDeliveryReviewIssues_(h.read(),[monitor],[]).length,1,'configuration/monitoring alerts remain active');
}
for(const failure of ['read','lock','owner']){
 const h=harness({split:true}),before=[...h.files];if(failure==='read')h.failRead('transport');if(failure==='lock')h.failLock('user');if(failure==='owner')h.invalidOwner();
 assert.throws(()=>h.clear());assert.deepEqual([...h.files],before,'both files remain unchanged when checks fail');assert(!h.events.some(e=>e.startsWith('write:')));assert.deepEqual(h.locks,[]);
}
{
 const h=harness({split:true}),primary=h.read(),store=h.read('transport');
 // Transport may retain a retryable state newer than the primary snapshot.
 store.outbox.find(r=>r.id==='u').status='queued';h.set('transport',store);
 h.failWrite('transport');assert.throws(()=>h.clear(),/Write failed/);assert.equal(h.read().revision,primary.revision+1);assert.equal(h.read('transport').outbox.find(r=>r.id==='u').status,'queued');assert.deepEqual(h.locks,[]);
 const recovered=h.read('transport');h.scope.rosterNotificationSync_(recovered,h.read());assert.equal(recovered.outbox.find(r=>r.id==='u').domainCancelled,true,'primary cancellation stops dispatch after the second write fails');assert.equal(recovered.outbox.find(r=>r.id==='u').status,'uncertain','prepared evidence is retained even when queue state was stale');
 assert.equal(h.scope.rosterDeliveryReviewIssues_(recovered,[],[]).filter(i=>i.id==='notification:f').length,0,'exact failed-result receipt propagates after a partial commit');
 const late=h.read('transport'),lateFailure=late.outbox.find(r=>r.id==='f');lateFailure.error='META_132000';lateFailure.providerError={code:132000};h.scope.rosterNotificationSync_(late,h.read());assert.equal(h.scope.rosterDeliveryReviewIssues_(late,[],[]).filter(i=>i.id==='notification:f').length,1,'new provider evidence is not dismissed by an old primary receipt');
 h.failWrite('');h.tick();h.clear();assert.equal(h.read('transport').deliveryReview.jobs.filter(j=>j.status==='queued').length,0,'retry finishes pending email cancellation');assert.equal(h.read('transport').deliveryReview.issues.length,0);
 const retried=h.read(),job=retried.outbox.find(r=>r.id==='q');job.status='queued';job.notificationIntentRevision=1;job.notificationIntentAction='retry';job.expiresAt=fixedNow+7200000;job.data.manualSend=true;delete job.domainCancelled;
 const current=h.read('transport');h.scope.rosterNotificationSync_(current,retried);assert.equal(current.outbox.find(r=>r.id==='q').status,'queued','an explicit later generation remains usable');assert(!current.outbox.find(r=>r.id==='q').domainCancelled);
 assert(h.read('transport').outbox.find(r=>r.id==='prepared').transportUpdatedAt,'migration cannot overwrite maintenance with a stale legacy snapshot');
 const firstWrite=h.events.indexOf('write:primary');assert(h.events.indexOf('read:primary')<firstWrite&&h.events.indexOf('read:transport')<firstWrite,'both authoritative reads precede mutation');
}
console.log('PASS notification maintenance: legacy/current receipt suppression, untouched compressed/domain/private-link state, preserved uncertain evidence, re-clear after retry, lock/read-before-write, owner rejection and split-store safe recovery.');
