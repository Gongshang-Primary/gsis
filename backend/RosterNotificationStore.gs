/* v0.8.8: immutable Roster intents, independently locked mutable delivery state.
 * Deploy this web app as the script owner. UserLock then has one shared owner
 * while remaining independent of the allocation ScriptLock. Never deploy an
 * execute-as-user endpoint for this transport. Migration lock order is always
 * ScriptLock -> UserLock; ordinary delivery never acquires ScriptLock.
 */
var ROSTER_NOTIFICATION_FIELDS_=['status','claimId','claimExpiresAt','preparedAt','firstAttemptAt','attempts','attemptHistory','messageId','error','completedAt','providerError','retryable','nextAttemptAt','deliveryStatus','deliveryAt','holdReason','nextEligibleAt','transportUpdatedAt'];
function rosterNotificationCopy_(value){return JSON.parse(JSON.stringify(value));}
function rosterNotificationOwner_(){
 const email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase(),scriptId=ScriptApp.getScriptId();
 if(!email||!scriptId)error_(503,'Notification transport requires an execute-as-owner deployment.');
 return {email,scriptId};
}
function rosterNotificationFile_(){return props_().getProperty('ROSTER_NOTIFICATION_TRANSPORT_FILE')||rosterFindFile_(ROSTER_DATA,'Roster notification transport.json');}
function rosterNotificationState_(){
 const id=rosterNotificationFile_();if(!id)return null;
 let state;try{state=JSON.parse(rosterReadFile_(id));}catch(e){error_(503,'Notification delivery records could not be read.');}
 if(state?.schema!==1||!Array.isArray(state.outbox)||!Array.isArray(state.deliveryEvents)||!Array.isArray(state.smcAlerts)||!state.owner?.email||!state.owner?.scriptId)error_(503,'Notification delivery records need administrator review.');
 return state;
}
function rosterNotificationCheckOwner_(state){const owner=rosterNotificationOwner_();if(state&&(owner.email!==state.owner.email||owner.scriptId!==state.owner.scriptId))error_(503,'Notification transport owner changed. Restore the execute-as-owner deployment before sending.');return owner;}
function rosterNotificationLock_(knownState){rosterNotificationCheckOwner_(knownState===undefined?rosterNotificationState_():knownState);return LockService.getUserLock();}
function rosterNotificationCommit_(state){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 gsisRequireBackendRole_('roster');rosterNotificationCheckOwner_(state);state.revision=(state.revision||0)+1;
 const data=JSON.stringify(state);if(data.length>12000000)error_(507,'Notification delivery records are full. Ask Admin to archive old delivery records.');
 const stored=props_().getProperty('ROSTER_NOTIFICATION_TRANSPORT_FILE'),id=stored||rosterNotificationFile_();
 const saved=id?(rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:data},'notification-commit'),id):rosterCreateFile_(ROSTER_DATA,'Roster notification transport.json',Utilities.newBlob(data,'application/json'));
 if(!stored)props_().setProperty('ROSTER_NOTIFICATION_TRANSPORT_FILE',saved);
}
function rosterNotificationMaintenanceSync_(row,intent,generation){
 const marker=intent.maintenanceCancellation;
 if(!marker||generation>(Number(marker.intentRevision)||0)||['sent','delivered','read'].includes(row.deliveryStatus)||row.status==='sent')return;
 if(row.domainCancelled&&row.maintenanceCancellation?.at===marker.at&&row.maintenanceCancellation?.intentRevision===marker.intentRevision)return;
 // The primary file is committed first by editor maintenance. Carry its
 // cancellation across even if the second file write failed. A later explicit
 // retry is a new intent generation and is unaffected by this old marker.
 const at=Date.parse(marker.at)||Date.now();row.domainCancelled=true;row.retryable=false;row.expiresAt=Math.min(Number(row.expiresAt)||at,at);
 delete row.nextAttemptAt;delete row.nextEligibleAt;delete row.holdReason;
 if(['queued','blocked','claimed','sending'].includes(row.status))row.status=row.preparedAt?'uncertain':'cancelled';
 row.maintenanceCancellation=rosterNotificationCopy_(marker);row.transportUpdatedAt=Math.max(row.transportUpdatedAt||0,at);
 const fingerprint=rosterOperationsDigest_([row.id,row.status,row.error||'',row.deliveryStatus||'',row.attempts||0,row.claimId||'',row.messageId||'',row.deliveryAt||'',row.completedAt||'',row.providerError||null]);
 // Never dismiss a newer provider outcome using a stale primary receipt.
 if(intent.adminReviewReceipt?.schema===1&&intent.adminReviewReceipt.fingerprint===fingerprint)row.adminReviewReceipt=rosterNotificationCopy_(intent.adminReviewReceipt);
}
function rosterNotificationSync_(store,primary){
 const existing=new Map(store.outbox.map(row=>[row.id,row])),source=new Map((primary.outbox||[]).map(row=>[row.id,row]));
 for(const intent of source.values()){
  let row=existing.get(intent.id);
  if(!row){row=rosterNotificationCopy_(intent);row.intentDigest=rosterOperationsDigest_(JSON.stringify([row.id,row.recipientId,row.kind,row.date,row.data]));row.consumedIntentRevision=Number(intent.notificationIntentRevision)||0;store.outbox.push(row);existing.set(row.id,row);}
  const generation=Number(intent.notificationIntentRevision)||0;
  if(generation>(row.consumedIntentRevision||0)){
   // An explicit domain command is a generation, never inferred from a stale
   // status copied into the primary file. Consume once even if already sent.
   row.consumedIntentRevision=generation;
   const sameNotice=intent.data?.contentFingerprint===row.data?.contentFingerprint&&intent.data?.timetableNoticeId===row.data?.timetableNoticeId;
   if(sameNotice&&['queued','blocked','failed','cancelled'].includes(row.status)&&!['sent','delivered','read'].includes(row.deliveryStatus)){
    if(intent.data?.manualSend===true)row.data.manualSend=true;
    if(intent.data?.communicationSnapshot&&!row.data.communicationSnapshot&&!row.preparedAt)row.data.communicationSnapshot=rosterNotificationCopy_(intent.data.communicationSnapshot);
    row.expiresAt=Math.max(row.expiresAt||0,intent.expiresAt||0);delete row.holdReason;delete row.nextEligibleAt;
    // Maintenance cancels only the generation that was previewed. A concurrent
    // newer manual send is independent intent, unless a real domain cancellation
    // or prepared/accepted attempt forbids sending again. Keep the audit marker.
    const newerManualAfterMaintenance=intent.notificationIntentAction==='manual-send'&&row.status==='cancelled'&&row.domainCancelled&&!row.domainCancelledByRoster&&!row.preparedAt&&row.maintenanceCancellation&&generation>(Number(row.maintenanceCancellation.intentRevision)||0)&&!['cancelled','superseded'].includes(intent.status);
    if(intent.notificationIntentAction==='retry'&&['failed','cancelled'].includes(row.status)||newerManualAfterMaintenance){
     row.status='queued';row.error='';row.retryable=true;delete row.domainCancelled;delete row.domainCancelledByRoster;
     for(const key of ['providerError','deliveryStatus','nextAttemptAt','claimId','claimExpiresAt','preparedAt','messageId'])delete row[key];
    }
   }
  }
  rosterNotificationMaintenanceSync_(row,intent,generation);
  // Domain cancellation always prevents a new send. Keep accepted outcomes and
  // prepared history for reconciliation; they must never become retryable work.
  if(['cancelled','superseded'].includes(intent.status)){
   row.domainCancelled=true;row.domainCancelledByRoster=true;
   if(['sent','failed','uncertain'].includes(row.status))continue;
   if(row.status==='sending'&&row.preparedAt){row.status='uncertain';row.error='The notice changed after preparation; reconcile delivery before any retry.';}
   else{row.status='cancelled';row.error=intent.error||'The notice was cancelled in Roster.';}
  }
 }
 for(const row of store.outbox)if(!source.has(row.id)&&['queued','blocked'].includes(row.status)){row.domainCancelled=true;row.domainCancelledByRoster=true;row.status='cancelled';row.error='The original Roster notification intent is no longer retained.';}
 // Alerts are born in transport; import only legacy delivery alerts once.
 return store;
}
function rosterNotificationEnsure_(){
 gsisRequireBackendRole_('roster');let state=rosterNotificationState_();rosterNotificationCheckOwner_(state);
 if(state&&(state.migrationComplete||Date.now()<state.readyAt))return state;
 const script=LockService.getScriptLock();if(!deployLock_(script,1000))error_(503,'Notification migration is waiting for an existing roster update. Retry.');
 try{const user=LockService.getUserLock();if(!deployLock_(user,1000))error_(503,'Notification migration is already running. Retry.');try{
  state=rosterNotificationState_();rosterNotificationCheckOwner_(state);const now=Date.now();
  if(!state){const primary=rosterOperationsState_(true);state={schema:1,owner:rosterNotificationOwner_(),revision:0,initializedAt:now,readyAt:now+360000,migrationComplete:false,outbox:rosterNotificationCopy_(primary.outbox||[]),deliveryEvents:rosterNotificationCopy_(primary.deliveryEvents||[]),smcAlerts:rosterNotificationCopy_((primary.smcAlerts||[]).filter(a=>String(a.key||'').startsWith('delivery:'))),deliveryReview:rosterNotificationCopy_(primary.deliveryReview||{revision:0,issues:[],monitor:[],jobs:[]}),recipientLastPrepared:{},cooldownUntil:0};state.legacyIds=state.outbox.map(row=>row.id);rosterNotificationCommit_(state);}
  else if(!state.migrationComplete&&now>=state.readyAt){
   const primary=rosterOperationsState_(true),old=new Map((primary.outbox||[]).map(row=>[row.id,row]));
   for(const row of state.outbox){const legacy=old.get(row.id);if(!(state.legacyIds||[]).includes(row.id)||!legacy)continue;
    // New transport receipts are authoritative. A late old sender may still
    // supply stronger proof of delivery, but never reset a recorded outcome.
    const rank={sent:1,delivered:2,read:3};
    if(!row.transportUpdatedAt||(rank[legacy.deliveryStatus]||0)>(rank[row.deliveryStatus]||0))for(const key of ROSTER_NOTIFICATION_FIELDS_)if(key in legacy)row[key]=rosterNotificationCopy_(legacy[key]);
   }
   rosterNotificationSync_(state,primary);state.migrationComplete=true;delete state.legacyIds;rosterNotificationExpire_(state,now);rosterNotificationCommit_(state);
  }
  return state;
 }finally{deployUnlock_(user);}}finally{deployUnlock_(script);}
}
function rosterNotificationOverlayWith_(state,store){
 if(!store)return state;const jobs=new Map(store.outbox.map(row=>[row.id,row]));
 for(const intent of state.outbox||[]){const delivery=jobs.get(intent.id);if(!delivery)continue;const cancelled=['cancelled','superseded'].includes(intent.status);for(const key of ROSTER_NOTIFICATION_FIELDS_){if(key==='status'&&cancelled)continue;if(key in delivery)intent[key]=rosterNotificationCopy_(delivery[key]);else delete intent[key];}}
 state.smcAlerts=[...(state.smcAlerts||[]).filter(a=>!String(a.key||'').startsWith('delivery:')),...rosterNotificationCopy_(store.smcAlerts)];
 state.deliveryReview=rosterNotificationCopy_(store.deliveryReview);return state;
}
function rosterNotificationOverlay_(state){try{return rosterNotificationOverlayWith_(state,rosterNotificationState_());}catch(e){Object.defineProperty(state,'notificationTransportUnavailable',{value:true,enumerable:false,configurable:true});return state;}}
function rosterNotificationExpire_(store,now){
 for(const row of store.outbox){if(row.status!=='sending'||row.claimExpiresAt>=now)continue;const attempt=(row.attemptHistory||[]).find(a=>a.claimId===row.claimId);
  if(row.preparedAt){row.status='uncertain';row.error='Prepared send lease expired; reconcile with WhatsApp before retrying.';}else{row.status=row.domainCancelled?'cancelled':'queued';row.attempts=Math.max(0,(row.attempts||0)-1);row.error='Unsent claim expired; returned safely to queue.';}
  if(attempt)attempt.state=row.preparedAt?'uncertain':'not-sent';
 }
}
function rosterNotificationRetryStore_(store,primary,now){
 // Reuse the existing bounded retry/alert policy without persisting any domain
 // arrays in this file. No automatic retries of an uncertain prepared attempt.
 const facade={...primary,outbox:store.outbox,smcAlerts:store.smcAlerts};rosterNotificationRetries_(facade,now);store.smcAlerts=facade.smcAlerts;
 for(const row of store.outbox)if(row.domainCancelled&&['queued','blocked'].includes(row.status))row.status='cancelled';
}
function rosterNotificationCheck_(primary,row,now,contacts,index,allowed){
 if(row.domainCancelled)return 'This published notice was cancelled.';
 const candidate=rosterNotificationCopy_(row),outcome=rosterNotificationEligible_(primary,candidate,now,contacts,index,allowed);
 if(outcome)return outcome;
 // Corrected attendance suppresses that queued intent; the new publication can
 // create its own notice. Contacts routing remains current at send time.
 if(row.data?.dailyPublication&&JSON.stringify(candidate.data.attendanceAbsentPeriods||[])!==JSON.stringify(row.data.attendanceAbsentPeriods||[]))return 'Attendance changed after this notice was published.';
 row.mobile=candidate.mobile;row.name=candidate.name;row.external=candidate.external;
 // Refresh presentation copy only before the first prepared attempt; preserve
 // publication identity and the payload audit of every prepared send.
 if(row.kind==='stapler_timetable'){
  const preparedBefore=row.preparedAt||(row.attemptHistory||[]).some(attempt=>['sent','failed','uncertain'].includes(attempt.state));
  if(preparedBefore)candidate.data.summary=row.data.summary;else row.data.summary=candidate.data.summary;
 }
 // Non-publication workflow notices may resolve contact details once, before
 // preparation. Published timetable content is always the committed intent.
 if(!row.data?.dailyPublication&&!row.preparedAt)row.data=candidate.data;
 return null;
}
function rosterNotificationApplyResult_(store,p,now){
 const row=store.outbox.find(row=>row.id===p.id);if(!row||row.claimId!==p.claimId)error_(409,'Notification claim is stale.');if(!['sent','failed','uncertain'].includes(p.state))error_(400,'Invalid notification result.');
 const iso=new Date(now).toISOString();
 // Preparation can precede the paced provider launch. The next handoff settles
 // this timestamp before checking another notice for the same recipient.
 if(Number.isFinite(p.submittedAt)&&p.submittedAt>=now-600000&&p.submittedAt<=now+60000){store.recipientLastPrepared=store.recipientLastPrepared||{};store.recipientLastPrepared[row.mobile]=Math.max(store.recipientLastPrepared[row.mobile]||0,Math.min(now,p.submittedAt));}
 if(['sent','delivered','read'].includes(row.deliveryStatus)){row.status='sent';if(p.messageId&&!row.messageId)row.messageId=String(p.messageId).slice(0,300);row.error='';delete row.providerError;}
 else if(['sending','uncertain'].includes(row.status)){
  row.status=p.state;row.messageId=String(p.messageId||'').slice(0,300);row.error=String(p.error||'').slice(0,500);row.completedAt=iso;
  const diagnostic=p.state==='sent'?null:rosterNotificationProviderError_(p.providerError);if(diagnostic)row.providerError=diagnostic;else delete row.providerError;row.retryable=rosterNotificationRetryable_(row.error,row.providerError);
 }else if(row.status!==p.state&&!(row.status==='queued'&&row.deliveryStatus==='retry-pending'&&p.state==='failed'))error_(409,'Notification result was already recorded.');
 const attempt=(row.attemptHistory||[]).find(a=>a.claimId===p.claimId);if(attempt)Object.assign(attempt,{state:['sent','delivered','read'].includes(row.deliveryStatus)?'sent':p.state,messageId:row.messageId||'',error:row.error||'',completedAt:iso,...(row.providerError?{providerError:row.providerError}:{})});
 row.transportUpdatedAt=now;
 if(p.rateLimited===true||[130429,131048,131056].includes(row.providerError?.code)){store.cooldownUntil=Math.max(store.cooldownUntil||0,now+Math.max(1000,Math.min(900000,Number(p.retryAfterMs)||60000)));if(store.lastThrottleAt!==now)store.sendWindow=Math.max(1,Math.floor((store.sendWindow||20)/2));store.lastThrottleAt=now;}
 return {recorded:true};
}
function rosterNotificationApplyDelivery_(store,p,now){
 if(typeof p.eventId!=='string'||!p.eventId||p.eventId.length>300||!['sent','delivered','read','failed'].includes(p.state))error_(400,'Invalid delivery event.');
 if(store.deliveryEvents.includes(p.eventId))return {recorded:true,replayed:true};
 const row=store.outbox.find(j=>j.messageId&&j.messageId===p.messageId||(j.attemptHistory||[]).some(a=>a.messageId===p.messageId))||store.outbox.find(j=>p.notificationId&&j.id===p.notificationId);
 if(!row){
  // A callback can beat the result write and its message-id mapping. Retain the
  // receipt durably, then replay after a later handoff or result settlement.
  store.unmatchedDeliveryEvents=(store.unmatchedDeliveryEvents||[]).filter(event=>event.retainedAt>now-7*86400000);
  if(!store.unmatchedDeliveryEvents.some(event=>event.eventId===p.eventId)){
   if(store.unmatchedDeliveryEvents.length>=1000)error_(503,'Unmatched delivery receipts require administrator review.');
   store.unmatchedDeliveryEvents.push({...rosterNotificationCopy_(p),retainedAt:p.retainedAt||now});
  }
  return {recorded:true,matched:false,pending:true};
 }
 if(p.recipientId&&GSISRosterOperations.mobile(p.recipientId)!==row.mobile)error_(403,'Delivery recipient does not match.');
 if(p.messageId&&!row.messageId)row.messageId=String(p.messageId).slice(0,300);const rank={sent:1,delivered:2,read:3},iso=new Date(now).toISOString();
 if(p.state==='failed'){
  if((!p.messageId||row.messageId===p.messageId)&&!['delivered','read'].includes(row.deliveryStatus)){
   const diagnostic=rosterNotificationProviderError_(p.providerError);row.deliveryStatus='failed';row.status='failed';row.error=diagnostic?'META_'+diagnostic.code:'Provider confirmed delivery failure.';if(diagnostic)row.providerError=diagnostic;else delete row.providerError;row.retryable=rosterNotificationRetryable_(row.error,row.providerError);
  }
 }else{if((rank[p.state]||0)>(rank[row.deliveryStatus]||0))row.deliveryStatus=p.state;row.status='sent';row.error='';delete row.providerError;row.completedAt=row.completedAt||iso;delete row.nextAttemptAt;}
 const attempt=(row.attemptHistory||[]).find(a=>a.messageId===p.messageId)||(row.attemptHistory||[]).find(a=>a.claimId===row.claimId);
 if(attempt){attempt.state=p.state==='failed'?'failed':'sent';attempt.messageId=String(p.messageId||row.messageId||'');attempt.completedAt=attempt.completedAt||iso;attempt.error=row.error||'';}
 row.deliveryAt=String(p.timestamp||iso);row.transportUpdatedAt=now;store.deliveryEvents.push(p.eventId);return {recorded:true};
}
function rosterNotificationReplayDelivery_(store,now){
 const pending=store.unmatchedDeliveryEvents||[];store.unmatchedDeliveryEvents=[];
 for(const event of pending)if(event.retainedAt>now-7*86400000)rosterNotificationApplyDelivery_(store,event,now);
}
function rosterNotificationTransportDispatch_(req){
 const p=req.input||{},op=p.operation,operations=['claimNotifications','prepareNotification','prepareNotifications','notificationResult','notificationResults','notificationDelivery','notificationDeliveryBatch'];
 if(op==='sendPeerMail')return {handled:true,result:rosterPeerMailDispatch_(p)};
 if(!operations.includes(op))return {handled:false};gsisRequireBackendRole_('roster');const initial=rosterNotificationEnsure_();
 if(!initial.migrationComplete&&['claimNotifications','prepareNotification','prepareNotifications'].includes(op))return {handled:true,result:{transportVersion:1,pending:true,reason:'migration-drain',readyAt:initial.readyAt,notifications:[],notification:null}};
 const sending=['claimNotifications','prepareNotification','prepareNotifications'].includes(op),contacts=sending?rosterServiceContacts_().c:null;
 const transportDates=p.pendingTransportDates===undefined?[]:p.pendingTransportDates;
 if(sending&&(!Array.isArray(transportDates)||transportDates.length>366||transportDates.some(d=>typeof d!=='string'||!/^20\d\d-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)))error_(400,'Invalid pending absence dates.');
 // All transport operations read current immutable intents. They never write the
 // allocation document; concurrent SMC saves cannot lose their cells here.
 const lock=rosterNotificationLock_(initial);if(!deployLock_(lock,1500))error_(503,'Notification delivery is busy. Retry the same operation.');
 try{const store=rosterNotificationState_(),primary=rosterOperationsState_(true),now=Date.now(),iso=new Date(now).toISOString();rosterNotificationSync_(store,primary);rosterNotificationExpire_(store,now);rosterNotificationRetryStore_(store,primary,now);rosterNotificationOverlayWith_(primary,store);let result={transportVersion:1};
  if(sending&&typeof rosterAbsenceIntakePending_==='function'){
   // Read the intake journal once while holding its shared UserLock. If the
   // journal is unavailable, hold new timetable sends while still settling any
   // previous provider results in this batch.
   try{contacts.rosterPendingAbsenceDates=rosterAbsenceIntakePending_().blockedDates;}
   catch(e){contacts.rosterPendingAbsenceDates=[...new Set((primary.outbox||[]).map(row=>row.date))];}
  }
  // This field comes only through the signed service API. D1 receipt dates
  // supplement the Apps Script journal; browser input cannot authorise a send.
  if(sending)contacts.rosterPendingAbsenceDates=[...new Set([...(contacts.rosterPendingAbsenceDates||[]),...transportDates])];
  if(op==='claimNotifications'){
   const dispatchId=String(p.dispatchId||'').slice(0,100);if(!dispatchId)error_(400,'Notification dispatcher identity is required.');
   // One database-style commit settles the completed batch and hands off the
   // next prepared batch. The provider call itself always stays outside locks.
   const ready=p.claimProtocol===2;let replayed=false;
   if(ready){
    const batchId=String(p.batchId||'');if(!/^[\w-]{1,100}$/.test(batchId))error_(400,'Notification batch identity is required.');
    const outcomes=p.previousResults===undefined?[]:p.previousResults;if(!Array.isArray(outcomes)||outcomes.length>20)error_(400,'Invalid notification result batch.');
    const digest=rosterOperationsDigest_([dispatchId,outcomes]),receipts=(store.readyBatches||[]).filter(row=>row.at>now-600000),prior=receipts.find(row=>row.id===batchId);
    if(prior&&prior.digest!==digest)error_(409,'Notification batch identity was reused with different results.');
    if(!prior&&receipts.length>=2000)error_(503,'Notification batch receipts are busy. Retry later.');
    // Settlement is idempotent. Replaying a consumed handoff never returns a
    // prepared row: the first response might already have caused a send.
    for(const outcome of outcomes)rosterNotificationApplyResult_(store,outcome,now);
    if(outcomes.length&&outcomes.every(row=>row.state==='sent')&&!(store.cooldownUntil>now))store.sendWindow=Math.min(20,(store.sendWindow||20)+1);
    replayed=!!prior;store.readyBatches=receipts;if(!prior)store.readyBatches.push({id:batchId,digest,at:now});
    result={transportVersion:2,prepared:true,settled:outcomes.length};
   }
   if(replayed)result={...result,pending:true,reason:'batch-already-consumed',readyAt:store.drainLease?.until||now+120000,notifications:[]};
   else if(store.cooldownUntil>now)result={...result,pending:true,reason:'provider-cooldown',readyAt:store.cooldownUntil,notifications:[]};
   else if(store.drainLease?.until>now&&store.drainLease.id!==dispatchId)result={...result,pending:true,reason:'dispatcher-active',readyAt:store.drainLease.until,notifications:[]};
   else{
    const rows=[],mobiles=new Set();let nextReady=Infinity;const limit=Math.min(store.sendWindow||20,20,Math.max(1,Number(p.limit)||12)),index=GSISRosterOperations.notificationIndex(primary),allowed=new Set(Array.isArray(p.allowedTemplateKeys)?p.allowedTemplateKeys:[]);store.recipientLastPrepared=store.recipientLastPrepared||{};
    for(const row of store.outbox){if(rows.length>=limit)break;if(!['queued','blocked'].includes(row.status)||row.domainCancelled)continue;if(row.nextAttemptAt>now){nextReady=Math.min(nextReady,row.nextAttemptAt);continue;}
     const outcome=rosterNotificationCheck_(primary,row,now,contacts,index,allowed);rosterNotificationHold_(row,outcome,now);
     if(outcome){if(!['quiet','pending-summary','pending-absence'].includes(outcome)){row.status=outcome==='blocked'?'blocked':'cancelled';row.error=outcome;}continue;}
     if(mobiles.has(row.mobile)||(store.recipientLastPrepared[row.mobile]||0)+6000>now){nextReady=Math.min(nextReady,(store.recipientLastPrepared[row.mobile]||now)+6000);continue;}
     row.status='sending';row.preparedAt=null;row.error='';row.claimId=Utilities.getUuid();row.claimExpiresAt=now+120000;row.dispatchId=dispatchId;row.firstAttemptAt=row.firstAttemptAt||now;row.attempts=(row.attempts||0)+1;row.attemptHistory=row.attemptHistory||[];row.attemptHistory.push({number:row.attempts,claimId:row.claimId,at:iso,state:'sending'});if(ready){row.preparedAt=now;row.transportUpdatedAt=now;store.recipientLastPrepared[row.mobile]=now;}rows.push(rosterNotificationCopy_(row));mobiles.add(row.mobile);
    }
    if(rows.length)store.drainLease={id:dispatchId,until:now+120000};else if(store.drainLease?.id===dispatchId)delete store.drainLease;result={...result,notifications:rows,suggestedConcurrency:store.sendWindow||20,...(!rows.length&&Number.isFinite(nextReady)?{pending:true,reason:'recipient-pacing',readyAt:nextReady}:{})};
   }
  }else if(['prepareNotification','prepareNotifications'].includes(op)){
   const claims=op==='prepareNotification'?[p]:p.claims;if(!Array.isArray(claims)||claims.length>20)error_(400,'Invalid notification preparation batch.');
   const rows=[],index=GSISRosterOperations.notificationIndex(primary),allowed=new Set(Array.isArray(p.allowedTemplateKeys)?p.allowedTemplateKeys:[]);
   for(const claim of claims){const row=store.outbox.find(row=>row.id===claim.id);if(!row||row.claimId!==claim.claimId||row.status!=='sending'||row.claimExpiresAt<=now)continue;
    // A replay of prepare cannot authorize a second external send.
    if(row.preparedAt)continue;
    let outcome=rosterNotificationCheck_(primary,row,now,contacts,index,allowed);if(!outcome&&(store.cooldownUntil>now||(store.recipientLastPrepared[row.mobile]||0)+6000>now))outcome='pending-summary';rosterNotificationHold_(row,outcome,now);
    if(outcome){row.status=outcome==='blocked'?'blocked':['quiet','pending-summary','pending-absence'].includes(outcome)?'queued':'cancelled';row.error=outcome;row.attempts=Math.max(0,row.attempts-1);const attempt=row.attemptHistory.find(a=>a.claimId===row.claimId);if(attempt){attempt.state='not-sent';attempt.reason=outcome;}}
    else{row.preparedAt=now;row.transportUpdatedAt=now;store.recipientLastPrepared[row.mobile]=now;rows.push(rosterNotificationCopy_(row));}
   }
   result={...result,...(op==='prepareNotification'?{notification:rows[0]||null}:{notifications:rows})};
  }else if(['notificationResult','notificationResults'].includes(op)){
   const rows=op==='notificationResult'?[p]:p.results;if(!Array.isArray(rows)||rows.length>20)error_(400,'Invalid notification result batch.');result={...result,recorded:true,results:rows.map(row=>rosterNotificationApplyResult_(store,row,now))};if(rows.length&&rows.every(row=>row.state==='sent')&&!(store.cooldownUntil>now))store.sendWindow=Math.min(20,(store.sendWindow||20)+1);
  }else{
   const rows=op==='notificationDelivery'?[p]:p.events;if(!Array.isArray(rows)||rows.length>100)error_(400,'Invalid delivery event batch.');result={...result,recorded:true,results:rows.map(row=>rosterNotificationApplyDelivery_(store,row,now))};
  }
  rosterNotificationReplayDelivery_(store,now);rosterNotificationRetryStore_(store,primary,now);rosterNotificationCommit_(store);return {handled:true,result};
 }finally{deployUnlock_(lock);}
}

// Run once from the editor during upgrade. This initializes the store and prints
// only aggregate migration status; it never creates or sends a notification.
function initialiseRosterNotificationTransport(){
 const state=rosterNotificationEnsure_(),result={transportVersion:1,revision:state.revision,migrationComplete:state.migrationComplete,readyAt:new Date(state.readyAt).toISOString(),ownerScriptId:state.owner.scriptId,notifications:state.outbox.length,uncertain:state.outbox.filter(row=>row.status==='uncertain'||row.status==='sending'&&row.preparedAt).length};console.log(JSON.stringify(result));return result;
}
