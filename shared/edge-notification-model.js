/* Pure notification transitions. The caller commits this state with the originating
 * Roster authority through the same D1 revision. Provider I/O stays outside CAS. */
var GSiSEdgeNotifications = (() => {
'use strict';
const copy = value => JSON.parse(JSON.stringify(value));
function error_(status,message){const error=new Error(message);error.status=status;throw error;}
function rosterNotificationProviderError_(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.code)||value.code<0)return null;
 const result={code:value.code},details=[
  'Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.',
  'The number of template parameters does not match the approved template.',
  'A template parameter has an invalid format.',
  'A template parameter exceeds the permitted length.',
  'Provider details withheld; use the Meta trace ID for investigation.'
 ];
 if(Number.isSafeInteger(value.subcode)&&value.subcode>=0)result.subcode=value.subcode;
 if(typeof value.traceId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value.traceId))result.traceId=value.traceId;
 if(typeof value.details==='string')result.details=details.includes(value.details)?value.details:details[4];
 if(typeof value.templateName==='string'&&/^[a-z0-9_]{1,128}$/.test(value.templateName))result.templateName=value.templateName;
 if(Array.isArray(value.fields))result.fields=value.fields.slice(0,32).filter(f=>f&&typeof f.field==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(f.field)&&Number.isInteger(f.index)&&f.index>=1&&f.index<=100&&Number.isInteger(f.characters)&&f.characters>=0&&f.characters<=1000000).map(f=>({field:f.field,index:f.index,characters:f.characters,...(typeof f.normalized==='boolean'?{normalized:f.normalized}:{})}));
 return result;
}
function rosterNotificationRetryable_(error,providerError){
 if(/^(?:MISSING_OR_INVALID_TEMPLATE_FIELD|NOTIFICATION_CONTENT_EXCEEDS|INVALID_TEMPLATE|TEMPLATE_CONTRACT|FINAL_RUN|STALE_COUNTDOWN|STALE_TIMETABLE|INVALID_OR_EXPIRED_NOTIFICATION)/.test(error||''))return false;
 const code=providerError?.code??Number(/^META_(\d+)$/.exec(error||'')?.[1]);
 return ![100,131008,131009,132000,132001,132005,132007,132012,132015,132016,132018].includes(code);
}
/* Retries are allowed only after a confirmed failure. An ambiguous send is escalated,
   never blindly resent. The same durable intent ID and per-attempt receipts are retained. */
function rosterNotificationRetries_(s,now){
 let changed=false;const iso=new Date(now).toISOString();GSISRosterAllocation.ensure(s);
 for(const j of s.outbox){
  if(['delivered','read'].includes(j.deliveryStatus)){if(j.status!=='sent'){j.status='sent';changed=true;}continue;}
  if((j.status==='failed'||j.status==='queued'&&j.deliveryStatus==='retry-pending')&&!rosterNotificationRetryable_(j.error,j.providerError)){if(j.retryable!==false||j.status!=='failed'||j.nextAttemptAt){j.retryable=false;j.status='failed';delete j.nextAttemptAt;changed=true;}}
  if(j.status==='failed'&&j.retryable!==false&&(j.attempts||0)>0&&j.attempts<3&&j.expiresAt>now){j.status='queued';j.nextAttemptAt=(j.firstAttemptAt||now)+(j.attempts===1?60000:180000);j.deliveryStatus='retry-pending';changed=true;continue;}
  const exhausted=j.status==='failed'&&(j.retryable===false||(j.attempts||0)>=3||!j.mobile||j.expiresAt<=now),uncertain=j.status==='uncertain';
  if((exhausted||uncertain)&&!s.smcAlerts.some(a=>a.key==='delivery:'+j.id)){const recipients=s.smcDutyRoster.find(r=>r.date===j.date)?.staffIds||[];s.smcAlerts.push({id:crypto.randomUUID(),key:'delivery:'+j.id,date:j.date,createdAt:iso,recipients,status:'open',summary:'WhatsApp '+(uncertain?'outcome is unconfirmed':'delivery failed after '+(j.attempts||0)+' attempts')+' for '+j.name+'. Contact the teacher directly and check Roster. No assignment was reversed.',notificationId:j.id});changed=true;}
 }return changed;
}

function rosterNotificationManual_(s,j){
 if(j.kind!=='stapler_timetable'||j.data?.dailyPublication!==true)return false;
 // This field is written only by the domain's explicit Notify / Publish & Notify actions.
 if(j.data.manualSend!==undefined)return j.data.manualSend===true;
 // Earlier releases recorded those actions in the same durable transaction as the job.
 if(typeof j.key!=='string'||!j.key.startsWith('daily:'+j.date+':')||!j.key.endsWith(':'+j.recipientId))return false;
 return s.audit.some(a=>a.date===j.date&&a.at===j.createdAt&&a.publicationRevision===j.data.publicationRevision&&(a.staffIds||[]).includes(j.recipientId)&&(a.operation==='notifyDaily'||a.operation==='publishDaily'&&['all','affected'].includes(a.notifyMode)));
}
function rosterNotificationEmergency_(s,j){
 const data=j.data||{};if(j.kind!=='smc_alert'||data.emergencyAbsence!==true||data.templateKey!=='absence_update'||data.audience!=='duty-smc'||data.newAbsenceCount!==1)return false;
 const absence=s.absences.find(a=>a.id===data.absenceId&&a.date===j.date&&a.reportedAt===j.createdAt),key='emergency-absence:'+data.absenceId,created=Date.parse(j.createdAt);if(!absence||!Number.isFinite(created)||j.key!==key+':'+j.recipientId)return false;
 const slot=GSISRosterAllocation.schedule(created);if(slot.today!==j.date||slot.minute>=840)return false;
 // The domain records this alert and its recipient intent with the new absence.
 // A request field or an outbox flag alone cannot enable a quiet-hours bypass.
 return s.smcAlerts.some(a=>a.key===key&&a.date===j.date&&a.createdAt===j.createdAt&&(a.recipients||[]).includes(j.recipientId));
}
function rosterNotificationHold_(j,outcome,now){
 const before=JSON.stringify([j.holdReason,j.nextEligibleAt]);
 if(outcome==='quiet'){
  const slot=GSISRosterAllocation.schedule(now),morning=Date.parse(slot.today+'T05:45:00+08:00');
  j.holdReason='quiet-hours';j.nextEligibleAt=morning+(morning<=now?86400000:0);
 }else if(outcome==='pending-absence'){j.holdReason='pending-absence';j.nextEligibleAt=now+15000;
 }else{delete j.holdReason;delete j.nextEligibleAt;}
 return before!==JSON.stringify([j.holdReason,j.nextEligibleAt]);
}
/* Only the signed dispatcher supplies the live-approved allow-list. No client flag enables a send. */
function rosterNotificationEligible_(s,j,now,fresh,index,allowed){
 const invalid=GSISRosterOperations.notificationCurrent(s,j,now,index);if(invalid)return invalid;
 if(!j.data?.communicationSnapshot&&!j.data?.emergencyAbsence&&(fresh.rosterAbsenceIntakeUnavailable||fresh.rosterPendingAbsenceDates?.includes(j.date))&&['stapler_timetable','relief_publication','relief_reminder','conditional_relief_instruction','smc_report'].includes(j.kind))return 'pending-absence';
 if(j.kind==='conditional_relief_instruction'){const absent=fresh.rosterPeople.find(x=>x.id===j.data.absentTeacherId),contact=GSISRosterOperations.absentTeacherContact(absent);if(!absent?.name||!contact)return 'Absent teacher contact is missing or invalid in Contacts. Contact the teacher directly.';j.data.absentTeacherName=absent.name;j.data.absentTeacherContact=contact;}
 if(['stapler_request','stapler_decision'].includes(j.kind)){const requester=fresh.rosterPeople.find(x=>x.id===j.data.requesterId);if(!requester?.name)return 'The requesting teacher no longer exists in Contacts.';j.data.requesterName=requester.name;}
 const person=fresh.rosterPeople.find(x=>x.id===j.recipientId);
 if(!person)return 'Recipient no longer exists in Contacts.';
 if(j.kind==='stapler_timetable'&&!j.data.communicationSnapshot){const plan=j.data.dailyPublication?s.dailyPublicationStates?.[j.date]:s.staplerPlans.find(r=>r.date===j.date);if(!plan)return 'The saved timetable is unavailable.';}
 if(j.kind==='stapler_request'&&(!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!GSISRosterOperations.teacherSponsor(person)))return 'The nominated sponsor is no longer an eligible teacher.';
 if(j.kind==='stapler_decision'&&j.data.audience==='stapler-sponsor'&&(!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!GSISRosterOperations.teacherSponsor(person)))return 'The nominated sponsor is no longer an eligible teacher.';
 if(j.kind==='contact_review'&&!(fresh.rosterAdminIds||[]).includes(j.recipientId))return 'Recipient is no longer a Contacts Admin.';
 if(j.data.audience==='backup-admin'&&!(fresh.rosterAdminIds||[]).includes(j.recipientId))return 'Recipient is no longer a Roster Admin.';
 // Recheck audience at claim and immediately before send, including retained
 // pre-fix Drive jobs. Never reinterpret their duty wording as an Admin notice.
 const systemAlert=j.kind==='system_alert'||j.data.audience==='system-admin'||j.data.audience==='backup-admin'||String(j.key||'').startsWith('drive-backup:');
 if(systemAlert){
  if(j.kind!=='system_alert'||j.data.audience!=='system-admin'||j.data.templateKey!=='system_alert')return 'Legacy system alert requires the Admin route and wording.';
  if(!(fresh.rosterAdminIds||[]).includes(j.recipientId)||person.active!==true)return 'Recipient is no longer an active Roster Admin.';
  if(j.data.outputKind&&(j.data.outputKind==='daily'?s.systemConfig?.driveDaily?.enabled:s.systemConfig?.driveBackup?.enabled)!==true)return 'Drive output alerts are disabled.';
 }
 if(j.data.templateKey==='smc_attention'&&j.data.audience!=='duty-smc')return 'SMC duty wording requires a current duty recipient.';
 if(j.data.audience==='duty-smc'){const row=s.smcDutyRoster.find(r=>r.date===j.date);if(!GSISRosterOperations.dutyEligible(person)||!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!row?.staffIds.includes(j.recipientId)||!GSISRosterOperations.dutyWindow(row,j.date,now))return 'Recipient is no longer on relief duty for this time window.';}
 if(j.data.audience==='urgent-smc'&&!(fresh.rosterUrgentSMCIds||[]).includes(j.recipientId))return 'Recipient is no longer eligible for urgent staff messages.';
 if(person.active!==true&&(!['relief_publication','relief_reminder','conditional_relief_instruction','stapler_timetable','mutual_request','mutual_override'].includes(j.kind)||!GSISRosterAllocation.reliefActive(s,{people:fresh.rosterPeople},person,j.date)))return 'Recipient is inactive in Contacts.';
 j.mobile=GSISRosterOperations.mobile(person.mobile);j.name=person.name;j.external=person.active!==true;
 if(!/^\d{8,15}$/.test(j.mobile))return 'Recipient mobile number is missing or invalid. Contact the teacher directly.';
 // Explicit Notify actions and proven emergency-absence events bypass quiet hours.
 if(j.kind!=='urgent_forward'&&!GSISRosterOperations.scheduledSummaryCurrent(s,j)&&!rosterNotificationManual_(s,j)&&!rosterNotificationEmergency_(s,j)&&!GSISRosterOperations.lseNoticeCurrent(s,j)&&GSISRosterAllocation.schedule(now).quiet)return 'quiet';
 if(j.kind==='smc_report'&&now-Date.parse(j.createdAt)>30*60000)return 'Superseded by the next consolidated report.';
 if(j.data.scheduledSummary&&GSISRosterOperations.pendingSummary(index,j))return 'pending-summary';
 if(!allowed.has(j.data.templateKey))return 'blocked';
 return null;
}


function rosterNotificationExpire_(store,now){
 for(const row of store.outbox){if(row.status!=='sending'||row.claimExpiresAt>=now)continue;const attempt=(row.attemptHistory||[]).find(a=>a.claimId===row.claimId);
  if(row.preparedAt){row.status='uncertain';row.error='Prepared send lease expired; reconcile with WhatsApp before retrying.';}else{row.status=row.domainCancelled?'cancelled':'queued';row.attempts=Math.max(0,(row.attempts||0)-1);row.error='Unsent claim expired; returned safely to queue.';}
  if(attempt)attempt.state=row.preparedAt?'uncertain':'not-sent';
 }
}
function rosterNotificationCheck_(primary,row,now,contacts,index,allowed){
 if(row.domainCancelled)return 'This published notice was cancelled.';
 const candidate=copy(row),outcome=rosterNotificationEligible_(primary,candidate,now,contacts,index,allowed);
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
   store.unmatchedDeliveryEvents.push({...copy(p),retainedAt:p.retainedAt||now});
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
 if(attempt&&!(p.state==='failed'&&['delivered','read'].includes(row.deliveryStatus))){attempt.state=p.state==='failed'?'failed':'sent';attempt.messageId=String(p.messageId||row.messageId||'');attempt.completedAt=attempt.completedAt||iso;attempt.error=row.error||'';}
 row.deliveryAt=String(p.timestamp||iso);row.transportUpdatedAt=now;store.deliveryEvents.push(p.eventId);return {recorded:true};
}
function rosterNotificationReplayDelivery_(store,now){
 const pending=store.unmatchedDeliveryEvents||[];store.unmatchedDeliveryEvents=[];
 for(const event of pending)if(event.retainedAt>now-7*86400000)rosterNotificationApplyDelivery_(store,event,now);
}

function rosterPeerMailAddresses_(person){
 if(!person||person.active!==true)return [];
 return [...new Set([person.email,person.cesEmail,...(Array.isArray(person.emails)?person.emails:[])].map(v=>String(v||'').trim().toLowerCase()).filter(v=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(gsps\.edu\.sg|schools\.gov\.sg)$/.test(v)))];
}
function rosterPeerMailPending_(request,now){return !!request&&request.status==='pending'&&Number(request.expiresAt)>now&&request.date>=new Date(now+8*3600000).toISOString().slice(0,10);}
function rosterPeerMailFingerprint_(request){return JSON.stringify([request.id,request.recipientId,request.absenceId,request.date,request.absentName,request.combination===true,request.demandIds,request.periods,request.lessons]);}
function rosterPeerMailReviewFields_(row){return [1,row.id,row.requestId,row.recipientId,row.recipientName,row.date,row.email,row.fingerprint,row.status,row.claimId||'',row.claimExpiresAt||0,row.preparedAt||0,row.acceptedAt||'',row.completedAt||'',row.attempts||0,row.error||''];}
function rosterPeerMailReviewed_(row,token){return row.status==='uncertain'&&typeof token==='string'&&row.reviewReceipt?.schema===1&&row.reviewReceipt.fingerprint===token;}
function rosterPeerMailCounts_(rows,tokenForRow){return {uncertain:rows.filter(row=>row.status==='uncertain'&&!rosterPeerMailReviewed_(row,tokenForRow(row))).length,reviewedUncertain:rows.filter(row=>rosterPeerMailReviewed_(row,tokenForRow(row))).length,blocked:rows.filter(row=>row.status==='blocked').length,cancelled:rows.filter(row=>row.status==='cancelled').length};}
function rosterPeerMailHealth_(rows,tokenForRow){let count=0;for(const row of rows){if(row.status!=='uncertain')continue;const fingerprint=tokenForRow(row),evidence=JSON.stringify(rosterPeerMailReviewFields_(row));if(row.healthReceipt?.schema===1&&row.healthReceipt.fingerprint===fingerprint&&row.healthReceipt.evidence===evidence)continue;if(!rosterPeerMailReviewed_(row,fingerprint))count++;row.healthReceipt={schema:1,fingerprint,evidence};}return count;}
function rosterPeerMailAlert_(store,row,primary,now,tokenForRow=()=>null){
 const key='delivery:peer-mail:'+row.id,open=row.status==='blocked'||row.status==='uncertain'&&!rosterPeerMailReviewed_(row,tokenForRow(row));let alert=store.smcAlerts.find(a=>a.key===key);
 if(!open){if(alert&&alert.status==='open'&&(['sent','cancelled'].includes(row.status)||rosterPeerMailReviewed_(row,tokenForRow(row)))){alert.status='resolved';alert.resolvedAt=new Date(now).toISOString();}return;}
 if(!alert){alert={id:crypto.randomUUID(),key,date:row.date,createdAt:new Date(now).toISOString(),recipients:(primary.smcDutyRoster||[]).find(d=>d.date===row.date)?.staffIds||[],origin:'peer-email'};store.smcAlerts.push(alert);}
 alert.status='open';alert.summary=row.status==='uncertain'?'Email delivery for the peer arrangement proposed to '+row.recipientName+' is unconfirmed. Check with the colleague before sending again. The absence remains recorded.':'The peer arrangement email to '+row.recipientName+' is waiting: '+row.error+' The absence remains recorded.';
}
function rosterPeerMailSync_(store,primary,people,now,tokenForRow=()=>null){
 store.peerMail=store.peerMail||[];const requests=new Map((primary.requests||[]).map(r=>[r.id,r])),persons=new Map(people.map(p=>[String(p.id),p]));
 for(const row of store.peerMail){
  if(row.status==='sending'&&row.claimExpiresAt<=now){row.status='uncertain';row.error='The prepared email has no confirmed provider outcome. Check with the recipient before sending again.';row.completedAt=new Date(now).toISOString();}
  const request=requests.get(row.requestId),addresses=rosterPeerMailAddresses_(persons.get(String(request?.recipientId)));
  if(['queued','blocked'].includes(row.status)&&(!rosterPeerMailPending_(request,now)||row.email&&!addresses.includes(row.email)||row.fingerprint!==rosterPeerMailFingerprint_(request))){row.status='cancelled';row.error='The proposal or its authorised recipient changed before sending.';row.completedAt=new Date(now).toISOString();}
 }
 const existing=new Map(store.peerMail.map(row=>[row.id,row]));
 for(const request of requests.values()){
  if(!rosterPeerMailPending_(request,now))continue;
  const person=persons.get(String(request.recipientId)),addresses=rosterPeerMailAddresses_(person),fingerprint=rosterPeerMailFingerprint_(request);
  for(const email of addresses.length?addresses:['']){
   const id=String(request.id)+':'+email;let row=existing.get(id);
   if(!row){row={id,requestId:request.id,recipientId:request.recipientId,recipientName:person?.name||request.recipientName||'the proposed colleague',date:request.date,email,fingerprint,createdAt:new Date(now).toISOString(),status:'queued',attempts:0};store.peerMail.push(row);existing.set(id,row);}
   // Contacts can be temporarily inactive or missing while its directory is
   // edited. Restore only a provably unsent, unchanged proposal when the same
   // address becomes authorised again. Prepared/uncertain/accepted rows stay put.
   if(email&&row.status==='blocked'||row.status==='cancelled'&&!row.preparedAt&&!row.acceptedAt&&row.fingerprint===fingerprint){row.status='queued';row.error='';delete row.completedAt;}
   if(!email&&['queued','blocked'].includes(row.status)){row.status='blocked';row.error='No active CES or GSPS email address is available in Contacts.';}
  }
  const missing=existing.get(String(request.id)+':');if(addresses.length&&missing?.status==='blocked'){missing.status='cancelled';missing.error='A current Contacts email address is now available.';}
 }
 for(const row of store.peerMail)rosterPeerMailAlert_(store,row,primary,now,tokenForRow);
}
function rosterPeerMailMessage_(request,origin,email){
 const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const link=origin+'/?date='+encodeURIComponent(request.date)+'&peerRequest='+encodeURIComponent(request.id)+'#myReliefDuties',kind=request.combination?'combine classes':'provide relief';
 const lessons=(request.lessons||[]).map(l=>'P'+l.period+' '+[l.timeStart,l.timeEnd].filter(Boolean).join('–')+' · '+[l.className,l.subject,l.groupName,l.venue].filter(Boolean).join(' · '));
 const lines=[request.absentName+' has proposed that you '+kind+' on '+request.date+'.','This is a proposal, awaiting your explicit approval. It is not a confirmed duty.',...lessons,'Please approve or reject in GSiS → My Relief Duties. Sign in with your school account.',link,'If SMC has changed this arrangement, GSiS will show its current status.'];
 return {to:email,subject:'GSiS: peer relief request for '+request.date,body:lines.join('\n\n'),htmlBody:lines.map(line=>line===link?'<p><a href="'+escape(link)+'">Review and respond in GSiS</a></p>':'<p>'+escape(line)+'</p>').join(''),name:'GSiS Roster'};
}

function transport(primary,p,fresh,now=Date.now()){
 const op=p.operation,store={...(primary.notificationTransport||{}),outbox:primary.outbox,deliveryEvents:primary.deliveryEvents||[],smcAlerts:primary.smcAlerts||[]},iso=new Date(now).toISOString();
 store.recipientLastPrepared=store.recipientLastPrepared||{};
 const dates=p.pendingTransportDates||[];
 if(!Array.isArray(dates)||dates.length>366||dates.some(d=>!/^20\d\d-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))error_(400,'Invalid pending absence dates.');
 const contacts={...fresh,rosterPendingAbsenceDates:[...new Set([...(fresh?.rosterPendingAbsenceDates||[]),...dates])]};
 rosterNotificationExpire_(store,now);rosterNotificationRetries_(primary,now);
 let result={transportVersion:1};
  if(op==='claimNotifications'){
   const dispatchId=String(p.dispatchId||'').slice(0,100);if(!dispatchId)error_(400,'Notification dispatcher identity is required.');
   // One database-style commit settles the completed batch and hands off the
   // next prepared batch. The provider call itself always stays outside locks.
   const ready=p.claimProtocol===2;let replayed=false;
   if(ready){
    const batchId=String(p.batchId||'');if(!/^[\w-]{1,100}$/.test(batchId))error_(400,'Notification batch identity is required.');
    const outcomes=p.previousResults===undefined?[]:p.previousResults;if(!Array.isArray(outcomes)||outcomes.length>20)error_(400,'Invalid notification result batch.');
    const digest=JSON.stringify([dispatchId,outcomes]),receipts=(store.readyBatches||[]).filter(row=>row.at>now-600000),prior=receipts.find(row=>row.id===batchId);
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
     row.status='sending';row.preparedAt=null;row.error='';row.claimId=crypto.randomUUID();row.claimExpiresAt=now+120000;row.dispatchId=dispatchId;row.firstAttemptAt=row.firstAttemptAt||now;row.attempts=(row.attempts||0)+1;row.attemptHistory=row.attemptHistory||[];row.attemptHistory.push({number:row.attempts,claimId:row.claimId,at:iso,state:'sending'});if(ready){row.preparedAt=now;row.transportUpdatedAt=now;store.recipientLastPrepared[row.mobile]=now;}rows.push(copy(row));mobiles.add(row.mobile);
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
    else{row.preparedAt=now;row.transportUpdatedAt=now;store.recipientLastPrepared[row.mobile]=now;rows.push(copy(row));}
   }
   result={...result,...(op==='prepareNotification'?{notification:rows[0]||null}:{notifications:rows})};
  }else if(['notificationResult','notificationResults'].includes(op)){
   const rows=op==='notificationResult'?[p]:p.results;if(!Array.isArray(rows)||rows.length>20)error_(400,'Invalid notification result batch.');result={...result,recorded:true,results:rows.map(row=>rosterNotificationApplyResult_(store,row,now))};if(rows.length&&rows.every(row=>row.state==='sent')&&!(store.cooldownUntil>now))store.sendWindow=Math.min(20,(store.sendWindow||20)+1);
  }else{
   const rows=op==='notificationDelivery'?[p]:p.events;if(!Array.isArray(rows)||rows.length>100)error_(400,'Invalid delivery event batch.');result={...result,recorded:true,results:rows.map(row=>rosterNotificationApplyDelivery_(store,row,now))};
  }

 rosterNotificationReplayDelivery_(store,now);
 primary.outbox=store.outbox;primary.deliveryEvents=store.deliveryEvents;primary.smcAlerts=store.smcAlerts;
 rosterNotificationRetries_(primary,now);
 const {outbox,deliveryEvents,smcAlerts,...metadata}=store;primary.notificationTransport=metadata;
 return result;
}

const inboxCollections={threads:'inboxThreads',messages:'inboxMessages',audit:'inboxAudit',receipts:'inboxReceipts',deliveryEvents:'inboxDeliveryEvents',alerts:'inboxAlerts'};
function inboxState(primary){const meta=primary.inbox||{schema:1,revision:0};return {...meta,...Object.fromEntries(Object.entries(inboxCollections).map(([key,collection])=>[key,primary[collection]||meta[key]||[]]))};}
function packInbox(primary,value=inboxState(primary)){
 primary.inbox={schema:value.schema,revision:value.revision};
 for(const [key,collection] of Object.entries(inboxCollections))primary[collection]=value[key].map(row=>key==='threads'?{...row,id:row.waId}:key==='receipts'?{...row,id:row.requestId}:row);
 return primary;
}
return {peerMailReviewFields:rosterPeerMailReviewFields_,peerMailReviewed:rosterPeerMailReviewed_,peerMailCounts:rosterPeerMailCounts_,peerMailHealth:rosterPeerMailHealth_,inboxState,packInbox,transport,eligible:rosterNotificationEligible_,applyResult:rosterNotificationApplyResult_,applyDelivery:rosterNotificationApplyDelivery_,expire:rosterNotificationExpire_,retry:rosterNotificationRetries_,peerMailSync:rosterPeerMailSync_,peerMailMessage:rosterPeerMailMessage_,peerMailPending:rosterPeerMailPending_,peerMailAddresses:rosterPeerMailAddresses_,peerMailFingerprint:rosterPeerMailFingerprint_,peerMailAlert:rosterPeerMailAlert_};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSEdgeNotifications;
