/* Legacy editor maintenance for v0.8.6a and later. The first two entry points
 * are editor-only; authenticated frontend review is separately authorised below.
 * Existing editor access and the active Roster ownership gate are required.
 * Preserve compressed timetable bytes and every unrelated operational field.
 * Lock order matches migration: ScriptLock, then UserLock when transport exists.
 */
function inspectCurrentWhatsAppQueue(){return gsisNotificationMaintenance_(false);}
function clearCurrentWhatsAppQueue(){return gsisNotificationMaintenance_(true);}
function gsisNotificationMaintenanceFingerprint_(row){
 return rosterOperationsDigest_([row.id,row.status,row.error||'',row.deliveryStatus||'',row.attempts||0,row.claimId||'',row.messageId||'',row.deliveryAt||'',row.completedAt||'',row.providerError||null]);
}
function gsisNotificationMaintenanceCounts_(state){
 const counts={waiting:0,inFlight:0,uncertain:0,reviewIssues:(state.deliveryReview?.issues||[]).length,queuedReportEmails:0,inFlightReportEmails:0};
 for(const row of state.outbox||[]){if(['queued','blocked','claimed'].includes(row.status))counts.waiting++;if(row.status==='sending')counts.inFlight++;if(row.status==='uncertain')counts.uncertain++;}
 for(const job of state.deliveryReview?.jobs||[]){if(job.status==='queued')counts.queuedReportEmails++;if(job.status==='sending')counts.inFlightReportEmails++;}
 return counts;
}
function gsisNotificationMaintenanceClear_(state,now,actor){
 const iso=new Date(now).toISOString(),result={cancelled:0,preparedOutcomesRetained:0,dismissedDeliveryIssues:0,cancelledReportEmails:0,inFlightReportEmails:0};
 const dismissed=new Set();
 for(const row of state.outbox||[]){
  if(['sent','delivered','read'].includes(row.deliveryStatus)||row.status==='sent')continue;
  if(!['queued','blocked','claimed','sending','failed','uncertain'].includes(row.status)&&!(row.status==='cancelled'&&row.maintenanceCancellation))continue;
  const pending=['queued','blocked','claimed','sending'].includes(row.status);
  if(!row.maintenanceCancellation||pending){
   const prior=row.maintenanceCancellation;
   row.maintenanceCancellation={at:iso,firstAt:prior?.firstAt||prior?.at||iso,by:actor,previousStatus:row.status,originalExpiresAt:row.expiresAt,intentRevision:Math.max(Number(row.notificationIntentRevision)||0,Number(row.consumedIntentRevision)||0),reason:'Current notification queue cleared by an authorised editor'};
   // This is dispatch expiry. Seven-day private-link expiry is a separate field.
   row.expiresAt=Math.min(Number(row.expiresAt)||now,now);row.retryable=false;row.domainCancelled=true;
   delete row.nextAttemptAt;delete row.nextEligibleAt;delete row.holdReason;
   if(pending){
    if(row.preparedAt){row.status='uncertain';result.preparedOutcomesRetained++;}
    else{row.status='cancelled';result.cancelled++;}
   }
   // Do not change claim IDs, provider outcomes, errors, or attempt history.
   // A late provider callback/result can still settle a prepared attempt.
   row.transportUpdatedAt=now;
  }
  const fingerprint=gsisNotificationMaintenanceFingerprint_(row);
  if(row.adminReviewReceipt?.fingerprint!==fingerprint){
   row.adminReviewReceipt={schema:1,fingerprint,reviewedAt:iso,reviewedBy:actor,reason:'Manually dismissed at user request; not evidence of WhatsApp delivery or email submission'};
   row.transportUpdatedAt=now;
   result.dismissedDeliveryIssues++;
  }
  dismissed.add(row.id);
 }
 const dismissedKeys=new Set([...dismissed].map(id=>'delivery:'+id));
 for(const alert of state.smcAlerts||[])if(dismissed.has(alert.notificationId)||dismissedKeys.has(alert.key)){
  if(!alert.closedAt){alert.closedAt=iso;alert.reviewedAt=iso;alert.reviewReason='Manually dismissed at user request';}
 }
 const review=state.deliveryReview;
 if(review){
  review.issues=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]);
  review.fingerprint=rosterOperationsDigest_(review.issues.map(issue=>{const {at,...rest}=issue;return JSON.stringify(rest);}));review.observedAt=iso;
  for(const job of review.jobs||[]){
   if(job.status==='queued'){job.status='superseded';job.finishedAt=iso;job.reason='Cancelled at user request';result.cancelledReportEmails++;}
   if(job.status==='sending')result.inFlightReportEmails++;
  }
 }
 return result;
}
function gsisNotificationMaintenance_(write){
 gsisRequireBackendRole_('roster');
 const script=LockService.getScriptLock();if(!deployLock_(script,8000))throw Error('Roster is saving another change. Run this same function again. Nothing was cleared.');
 let user=null;
 try{
  const id=props_().getProperty('ROSTER_OPERATIONS_FILE')||rosterFindFile_(ROSTER_DATA,'Roster operations.json');
  if(!id)throw Error('Roster operations file was not found. Nothing was cleared.');
  const primary=typeof rosterOperationsRaw_==='function'?rosterOperationsRaw_(false).value:JSON.parse(rosterReadFile_(id));
  if(primary?.schema!==1||!Number.isInteger(primary.revision)||!Array.isArray(primary.outbox))throw Error('Roster state needs review. Nothing was cleared.');
  const transportId=props_().getProperty('ROSTER_NOTIFICATION_TRANSPORT_FILE')||rosterFindFile_(ROSTER_DATA,'Roster notification transport.json');
  let transport=null;
  if(transportId){
   if(typeof rosterNotificationCheckOwner_!=='function')throw Error('A separate transport exists. Use this function in the v0.8.7 Roster owner. Nothing was cleared.');
   user=LockService.getUserLock();if(!deployLock_(user,8000)){user=null;throw Error('Notification delivery is settling. Run this same function again. Nothing was cleared.');}
   transport=JSON.parse(rosterReadFile_(transportId));rosterNotificationCheckOwner_(transport);
   if(transport?.schema!==1||!Array.isArray(transport.outbox))throw Error('Notification transport needs review. Nothing was cleared.');
   // Include intents accepted since the last sender tick without changing the
   // stored transport until the owning locks and both reads have succeeded.
   rosterNotificationSync_(transport,primary);
  }
  const before=gsisNotificationMaintenanceCounts_(transport||primary),now=Date.now(),actor=String(Session.getEffectiveUser().getEmail()||'script editor');
  let cleared=null;
  if(write){
   gsisRequireBackendRole_('roster');
   const primaryResult=gsisNotificationMaintenanceClear_(primary,now,actor);
   cleared=transport?gsisNotificationMaintenanceClear_(transport,now,actor):primaryResult;
   primary.revision++;
   primary.notificationMaintenance=primary.notificationMaintenance||[];
   primary.notificationMaintenance.push({at:new Date(now).toISOString(),by:actor,action:'clear-current-queue-and-delivery-reports',...cleared});
   if(primary.notificationMaintenance.length>100)primary.notificationMaintenance=primary.notificationMaintenance.slice(-100);
   // Primary cancellation commits first. If transport commit fails, rerunning
   // is safe; sync also carries these cancellations into the transport store.
   if(typeof rosterOperationsWriteRaw_==='function'){rosterOperationsWriteRaw_(JSON.stringify(primary));rosterOperationsVersionChanged_();}
    else rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:JSON.stringify(primary)},'notification-maintenance');
   if(transport)rosterNotificationCommit_(transport);
  }
  const result={readOnly:!write,before,...(cleared?{cleared}:{}),after:gsisNotificationMaintenanceCounts_(transport||primary),operationsRevision:primary.revision,messagesSent:0,deliveryHistoryPreserved:true,privateLinksPreserved:true,note:'Already submitted messages and emails cannot be recalled. Future new notification jobs and new failures remain enabled.'};
  console.log(JSON.stringify(result));return result;
 }finally{if(user)deployUnlock_(user);deployUnlock_(script);}
}

/* Authenticated frontend maintenance operates only on the notification store.
 * Preview tokens cover the exact issue/job generation. No provider sends or
 * allocation writes occur, and new work accepted after a preview is untouched. */
function rosterDeliveryReviewPending_(row){return ['queued','blocked','claimed','sending'].includes(row.status)&&!row.preparedAt&&!row.domainCancelled&&!['sent','delivered','read'].includes(row.deliveryStatus);}
function rosterDeliveryReviewPendingToken_(row){return rosterOperationsDigest_([rosterDeliveryReviewRowFingerprint_(row),row.consumedIntentRevision||0,row.notificationIntentRevision||0,row.preparedAt||0,row.expiresAt||0,row.domainCancelled===true]);}
function rosterDeliveryReviewView_(state,admin){
 const review=state.deliveryReview||{issues:[],monitor:[],jobs:[]},issues=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]),jobs=review.jobs||[];
 const reports=Object.values(review.reports||{});
 const rows=issues.map(issue=>{const token=rosterOperationsDigest_(rosterDeliveryReviewMaterial_(issue)),captured=reports.find(report=>report.status!=='done'&&report.issues?.some(value=>value.id===issue.id&&rosterOperationsDigest_(rosterDeliveryReviewMaterial_(value))===token));return {...issue,token,reportStatus:captured?'Report '+captured.date+' pending':'Waiting for 08:00 report'};});
 const pending=(admin?state.outbox.filter(rosterDeliveryReviewPending_):[]).map(row=>({id:row.id,token:rosterDeliveryReviewPendingToken_(row),name:rosterDeliveryReviewText_(row.name)||'Teacher',date:/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'',kind:rosterDeliveryReviewText_(row.kind),status:row.status}));
 return {checkedAt:new Date().toISOString(),revision:state.revision||0,issues:rows,pending,canCancel:admin===true,inFlight:state.outbox.filter(row=>row.status==='sending'&&row.preparedAt).length,uncertain:state.outbox.filter(row=>row.status==='uncertain').length,unresolvedUncertain:state.outbox.filter(row=>row.status==='uncertain'&&!(row.adminReviewReceipt?.schema===1&&row.adminReviewReceipt.fingerprint===rosterDeliveryReviewRowFingerprint_(row))).length,reviewedUncertain:state.outbox.filter(row=>row.status==='uncertain'&&row.adminReviewReceipt?.schema===1&&row.adminReviewReceipt.fingerprint===rosterDeliveryReviewRowFingerprint_(row)).length,queuedReportEmails:jobs.filter(j=>j.status==='queued').length,inFlightReportEmails:jobs.filter(j=>j.status==='sending').length,messagesSent:0};
}
function rosterDeliveryReviewDispatch_(req,contacts){
 gsisRequireBackendRole_('roster');const p=req.input||{},op=p.operation,user=rosterOperationsAuthority_(contacts,req.identity);
 if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 if(!['deliveryReview','dismissDeliveryIssues','cancelPendingNotifications'].includes(op))error_(400,'Unknown delivery review action.');
 if(op==='cancelPendingNotifications'&&!user.admin)error_(403,'Only Admin can cancel pending notifications.');
 const actor=String(req.identity?.email||user.email||'').trim().toLowerCase();if(!actor)error_(403,'A signed-in identity is required.');
 const write=op!=='deliveryReview';let items,digest;
 if(write){
  if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A request ID is required.');
  if(!Array.isArray(p.items)||p.items.length>2000||p.items.some(item=>!item||typeof item.id!=='string'||item.id.length>300||! /^[a-f0-9]{64}$/.test(item.token)))error_(400,'Refresh the preview before continuing.');
  items=p.items.map(item=>({id:item.id,token:item.token})).sort((a,b)=>a.id.localeCompare(b.id));if(new Set(items.map(item=>item.id)).size!==items.length)error_(400,'A preview item was repeated.');
  digest=rosterOperationsDigest_([op,items]);
 }
 const initial=rosterNotificationEnsure_();if(!initial.migrationComplete)error_(503,'Notification records are completing their upgrade. Refresh shortly.');
 const lock=rosterNotificationLock_();if(!deployLock_(lock,1500))error_(503,'Notification records are updating. Retry this action.');
 try{
  const state=rosterNotificationState_();rosterNotificationCheckOwner_(state);
  const old=(state.reviewActions||[]).find(action=>action.id===p.requestId);
  if(write&&old){if(old.actor!==actor||old.digest!==digest)error_(409,'This request ID was used for another action.');return {...rosterDeliveryReviewView_(state,user.admin),...old.result,replayed:true};}
  // Intent sync is read-only for Roster and includes newly accepted jobs in the
  // preview. It cannot race another transport writer while this lock is held.
  rosterNotificationSync_(state,rosterOperationsState_(true));
  const view=rosterDeliveryReviewView_(state,user.admin);if(!write)return view;
  const candidates=new Map((op==='dismissDeliveryIssues'?view.issues:view.pending).map(row=>[row.id,row]));
  for(const item of items)if(candidates.get(item.id)?.token!==item.token)error_(409,'Delivery records changed. Refresh and review the current items before continuing.');
  const now=Date.now(),iso=new Date(now).toISOString(),review=state.deliveryReview||(state.deliveryReview={revision:0,issues:[],monitor:[],jobs:[]});let changed=0,cancelledReportEmails=0;
  const touched=new Set();
  for(const item of items){
   const selected=candidates.get(item.id);
   if(op==='dismissDeliveryIssues'){
    if(selected.group==='delivery'){
     const row=state.outbox.find(row=>'notification:'+row.id===item.id);
     // In-progress retry issues may display their earlier failure. Dismissing
     // that preview must not dismiss an outcome from the new attempt.
     if(!row||rosterDeliveryReviewRowFingerprint_(row)!==selected.deliveryFingerprint)error_(409,'This notification has a newer attempt. Refresh before clearing its alert.');
     row.adminReviewReceipt={schema:1,fingerprint:selected.deliveryFingerprint,reviewedAt:iso,reviewedBy:actor,reason:'Manually reviewed in Daily Notify; not evidence of WhatsApp delivery or email submission'};
     for(const alert of state.smcAlerts||[])if(alert.notificationId===row.id||alert.key==='delivery:'+row.id){alert.closedAt=iso;alert.reviewedAt=iso;alert.reviewReason='Manually reviewed in Daily Notify';}
    }else{review.reportedMonitor=review.reportedMonitor||{};review.reportedMonitor[item.id]=item.token;}
    touched.add(item.id);
   }else{
    const row=state.outbox.find(row=>row.id===item.id);row.status='cancelled';row.domainCancelled=true;row.retryable=false;
    row.maintenanceCancellation={at:iso,by:actor,previousStatus:selected.status,intentRevision:Math.max(Number(row.consumedIntentRevision)||0,Number(row.notificationIntentRevision)||0),reason:'Pending notification cancelled from Daily Notify'};
    row.expiresAt=Math.min(Number(row.expiresAt)||now,now);row.transportUpdatedAt=now;delete row.nextAttemptAt;delete row.nextEligibleAt;delete row.holdReason;touched.add('notification:'+row.id);
   }
   changed++;
  }
  // Cancel only unsent report snapshots that contain handled items. A later
  // refresh can report any remaining/new issues; in-flight mail is retained.
  review.issues=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]);
  for(const job of review.jobs||[])if(job.status==='queued'&&(!review.issues.length||job.bindings?.some(binding=>touched.has(binding.id)))){job.status='superseded';job.finishedAt=iso;job.reason='Delivery review changed after this report was prepared';cancelledReportEmails++;}
  review.fingerprint=rosterOperationsDigest_(review.issues.map(rosterDeliveryReviewMaterial_));review.observedAt=iso;
  const result={changed,cancelledReportEmails,action:op,messagesSent:0};state.reviewActions=state.reviewActions||[];state.reviewActions.push({id:p.requestId,actor,digest,at:iso,items,result});if(state.reviewActions.length>200)state.reviewActions=state.reviewActions.slice(-200);
  rosterNotificationCommit_(state);return {...rosterDeliveryReviewView_(state,user.admin),...result};
 }finally{deployUnlock_(lock);}
}
