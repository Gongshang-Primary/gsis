'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),copy=v=>JSON.parse(JSON.stringify(v));
const scope={console,Date,Map,Set,JSON,Number,String,Array,rosterOperationsDigest_:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')};vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),scope);
const intent=()=>({id:'n1',status:'queued',notificationIntentRevision:1,notificationIntentAction:'manual-send',expiresAt:9999999999999,data:{manualSend:true,contentFingerprint:'same',timetableNoticeId:'n1'}});
const cancelled=()=>({id:'n1',status:'cancelled',domainCancelled:true,consumedIntentRevision:0,expiresAt:1,retryable:false,maintenanceCancellation:{intentRevision:0,at:'2026-10-22T05:00:00Z',by:'admin'},data:{contentFingerprint:'same',timetableNoticeId:'n1'},attemptHistory:[]});
{
 const row=cancelled(),marker=copy(row.maintenanceCancellation),store={outbox:[row]};scope.rosterNotificationSync_(store,{outbox:[intent()]});assert.equal(row.status,'queued','new manual-send generation must supersede an older maintenance cancellation');assert(!row.domainCancelled);assert.equal(row.consumedIntentRevision,1);assert.deepEqual(row.maintenanceCancellation,marker,'keep cancellation audit');assert.equal(row.expiresAt,9999999999999);assert.equal(row.data.manualSend,true);
 scope.rosterNotificationSync_(store,{outbox:[intent()]});assert.equal(row.status,'queued','repeated sync cannot consume or retry twice');
}
for(const condition of ['same-generation','prepared','uncertain','sent','delivered','primary-cancelled','no-marker','different-notice','genuine-domain']){
 const row=cancelled(),next=intent();
 if(condition==='same-generation')next.notificationIntentRevision=0;
 if(condition==='prepared')row.preparedAt=123;
 if(condition==='uncertain')row.status='uncertain';
 if(condition==='sent')row.status='sent';
 if(condition==='delivered')row.deliveryStatus='delivered';
 if(condition==='primary-cancelled')next.status='cancelled';
 if(condition==='no-marker')delete row.maintenanceCancellation;
 if(condition==='different-notice')next.data.contentFingerprint='new';
 if(condition==='genuine-domain')row.domainCancelledByRoster=true;
 scope.rosterNotificationSync_({outbox:[row]},{outbox:[next]});assert.notEqual(row.status,'queued',condition+' must not be revived by manual-send');
}
{
 const row=cancelled(),next=intent();next.status='cancelled';scope.rosterNotificationSync_({outbox:[row]},{outbox:[next]});assert(row.domainCancelledByRoster);
 next.status='queued';next.notificationIntentRevision=2;scope.rosterNotificationSync_({outbox:[row]},{outbox:[next]});assert.equal(row.status,'cancelled','old maintenance marker cannot disguise a genuine domain cancellation');
}
console.log('PASS concurrent manual-send supersedes only older unprepared maintenance cancellation; all protected states and audit history preserved');
