/* Same-origin admin status. No polling, browser credentials, or health payload storage. */
(()=>{'use strict';
const $=id=>document.getElementById(id),endpoint='/api/system-health';
const LABELS={'roster-import':'Roster import','google-backup':'Google backup',allocation:'Relief allocation',notifications:'Notification processing','received-reports':'Received report instructions',timetables:'Timetable preparation','audit-export':'Daily allocation audit export','r2-cleanup':'R2 cleanup','deploy-handoffs':'Deploy handoffs',references:'Reference refresh','peer-proposals':'Colleague proposals','peer-mail':'Colleague email',inbox:'Inbox',webhook:'Delivery webhooks','calendar-sync':'Calendar sync','read-claims':'Read claims','employment-mail':'Employment email','delivery-review':'Delivery review','queue-notifications':'Notification queue','queue-timetables':'Timetable queue','queue-audit':'Audit queue'};
const KINDS={notifications:'Notification processing',timetables:'Timetable preparation',audit:'Audit export'},STATES={running:'Running',success:'Success',idle:'Idle',skipped:'Skipped',failure:'Failed',pending:'Pending',parked:'Needs attention',prepared:'Prepared','no-cache':'No cached package',unverified:'Unverified'};
const CODES=new Set(['STAPLER_BASELINE_CONFLICT','STAPLER_CONFLICT','PEER_MAIL_REVIEW_CONFLICT','TIMETABLE_BATCH_CHANGED','TIMETABLE_BATCH_TOO_LARGE','CELL_CONFLICT','ABSENCE_CONFLICT','CONTACTS_RECOVERY_REQUIRED','OK','IDLE','SKIPPED','PAUSED','RECOVERY_PAUSED','GSIS_RECOVERY_PAUSED','GSIS_RECOVERY_CONFIG','UNKNOWN_ERROR','HTTP_ERROR','TIMEOUT','NOT_CONFIGURED','UNAVAILABLE','CONFLICT','INVALID_RESPONSE','RETRY_LATER','JOB_FAILED','JOB_PARKED','LEASE_HELD','EDGE_STORAGE','EDGE_AUTHORITY','EDGE_BINDING','ROSTER_R2_MANIFEST_UNVERIFIED','ROSTER_TIMETABLE_STORAGE','BACKGROUND_JOB_FAILED','BACKGROUND_JOB_PARKED','ABSENCE_INTAKE_PENDING','ABSENCE_TRANSPORT_PENDING','ABSENCE_PREPARATION_RETRY','ABSENCE_INTAKE_BUSY','BACKEND_CONFIG','BACKEND_AUTHENTICATION','BACKEND_UNAVAILABLE','UPSTREAM_TIMEOUT','UPSTREAM_RESPONSE','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED','ALLOCATION_CANCELLED','ALLOCATION_ABANDONED','ALLOCATION_CUTOFF','AUDIT_EXPORT_PENDING','AUDIT_EXPORT_BUSY','AUDIT_NOTIFICATION_PRIORITY','AUDIT_LOGGING_DISABLED','ROSTER_MIRROR_LAG','ROSTER_MIRROR_PENDING','ROSTER_MIRROR_VERIFY']);
const COUNT_KEYS=['pending','processed','sent','failed','queued','claimed','applied','deferred','exported','scanned','deleted','protected','candidates','removed','completed','retried','parked','pendingCaptureCount','pendingPeerCount','notificationsQueued','forwarded','needsReview','replies','alerts','retrying','blocked','unconfirmed','uncertain','reviewedUncertain','prepareFailures','resultFailures'],REASONS={manual:'Manual checkpoint','pre-migration':'Before migration','pre-upgrade':'Before upgrade','pre-restore':'Before restoration'};
let busy=false,ready=false,data=null,pending=null,focusReturn=null,peerRetry=null;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value),rows=(value,max=32)=>Array.isArray(value)?value.filter(object).slice(0,max):[],number=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e9?value:null;
const stamp=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000?value:typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&value.length<=30&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const date=value=>stamp(value)!==null?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(stamp(value))):'Not recorded';
const element=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;};
const trace=value=>typeof value==='string'&&/^(?:[a-f\d]{16}|[a-f\d]{32}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(value)?value:null;
const code=value=>CODES.has(value)?value:'UNKNOWN_ERROR';
const FAILURE_STAGES=new Set(['operations-location','operations-read','operations-json','operations-schema','stapler-unpack','stapler-json','stapler-identity','stapler-proof','stapler-validation','stapler-ready','calculation-source','history-read','bridge-signature','request-freshness','request-identity','contacts-config','contacts-fetch','contacts-json','contacts-result','contacts','timetable','plan-read','save','response','backend','peer-mail-review']);
const FAILURE_OPERATIONS=new Set(['nextAbsenceIntake','deferAbsenceIntake','prepareNotification','requestMutual','saveSchoolAbsence','renameStapler','scheduledRoster','sendPeerMail','peerMailReview','reviewPeerMail','claimNotifications','prepareNotifications','notificationResult','notificationResults','inboxPendingDispatch','inboxReplyPrepare','inboxReplyResult','inboxAlertPrepare','inboxAlertResult','deliveryReviewMailDispatch','dailyEmploymentMailDispatch','processAbsenceIntake','flushAbsenceIntake','captureAbsenceIntake','retryAbsenceIntake','resolveAbsenceIntake','timetableBatch','timetableDay','timetableCacheManifest','read','saveAbsence','saveInstructions','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler','deleteStapler','reliefBatch','publish','notifyDaily','autoAllocate','optimise','receiptStatus','allocationAuditExport']);
const badge=status=>{const node=element('span',STATES[status]||'Unavailable','badge');node.dataset.state=Object.hasOwn(STATES,status)?status:'unavailable';return node;};
const safeFailure=message=>Object.assign(Error(message),{healthMessage:message});
function message(text,tone='info'){$('status-message').textContent=text;$('status-message').dataset.tone=tone;}
function countText(value){return object(value)?COUNT_KEYS.filter(key=>number(value[key])!==null).map(key=>key+': '+value[key]).join(' · '):'';}
function diagnostic(row){return code(row.code)+(Number.isInteger(row.httpStatus)&&row.httpStatus>=100&&row.httpStatus<=599?' · HTTP '+row.httpStatus:'')+(trace(row.traceId)?' · Worker trace '+trace(row.traceId):'')+(trace(row.diagnosticId)?' · Backend reference '+trace(row.diagnosticId):'')+(FAILURE_OPERATIONS.has(row.operation)?' · Operation '+row.operation:'')+(FAILURE_STAGES.has(row.failureStage)?' · Stage '+row.failureStage:'')+(typeof row.backendVersion==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}[a-z]?$/.test(row.backendVersion)?' · Backend '+row.backendVersion:'');}
function unavailable(box){box.replaceChildren(element('p','Status unavailable.','muted'));}
function controls(){
 $('op-refresh').disabled=busy;const recovery=data?.recovery,active=recovery?.mode==='active'&&recovery?.paused===false;
 $('op-checkpoint').disabled=busy||!ready||!active||recovery?.checkpointCaptureConfigured!==true||recovery?.checkpointStorage!=='available';
 for(const button of document.querySelectorAll('[data-retry-kind]'))button.disabled=busy||!ready||!active||data?.background?.enabled!==true;
 $('confirm-action').disabled=busy;
 $('op-peer-review').disabled=busy||!ready||data?.peerMailReviewAllowed!==true;
 $('op-peer-retry').disabled=busy||!ready||data?.peerMailReviewAllowed!==true;
 $('op-peer-retry').hidden=!peerRetry;
 for(const button of document.querySelectorAll('[data-peer-review]'))button.disabled=busy||!!peerRetry;
}
function clear(){$('timetable-preparation-link').hidden=true;ready=false;data=null;pending=null;if($('confirmation').open)$('confirmation').close();$('confirm-description').textContent='';$('health-content').hidden=true;for(const id of ['jobs-body','backlog','background-summary','background-jobs','timetables','cleanup','recent-failures','checkpoints','peer-mail-review','google-backup','cutover-freeze'])$(id).replaceChildren();controls();}
function showJobs(snapshot){
 $('storage-status').textContent=snapshot.storage?.available===true?'Operational status storage is available.':snapshot.storage?.configured===true?'Operational status storage could not be read.':'Operational status storage is not configured.';
 const body=$('jobs-body');body.replaceChildren();for(const row of rows(snapshot.jobs).filter(row=>Object.hasOwn(LABELS,row.job))){const tr=element('tr'),outcome=element('td'),success=element('td',stamp(row.lastSuccessAt)===null?'No successful run recorded':date(row.lastSuccessAt)),detail=element('td');outcome.append(badge(row.status),element('span',date(row.eventAt),'muted'));detail.append(element('span',diagnostic(row),'diagnostic'));const summary=countText(row.counts);if(summary)detail.append(element('span',summary,'muted'));tr.append(element('td',LABELS[row.job]),outcome,success,detail);body.append(tr);}if(!body.children.length){const cell=element('td','No job outcomes recorded yet.');cell.colSpan=4;const tr=element('tr');tr.append(cell);body.append(tr);}
}
for(const value of ['ROSTER_CUTOVER_FROZEN','ROSTER_CUTOVER_OVERDUE','ROSTER_CUTOVER_STATUS_UNAVAILABLE'])CODES.add(value);
function showCutoverFreeze(snapshot){
 const box=$('cutover-freeze'),freeze=snapshot.cutoverFreeze;box.dataset.tone='info';box.setAttribute('role','status');
 if(freeze?.available!==true){box.textContent='Cutover freeze status is unavailable. Check ownership setup before starting the final import.';return;}
 if(freeze.active!==true){box.textContent=freeze.state==='activated'?'The freeze ended after verified D1 activation.':'Google writes are not frozen.';return;}
 const minutes=number(freeze.ageMs)===null?'Age unavailable':Math.floor(freeze.ageMs/60000)+' min';box.textContent=(freeze.state==='frozen'?'Google writes frozen':freeze.state==='cancelling'?'Cancellation confirmation pending':'Freeze confirmation pending')+' · '+minutes+'. The freeze does not end automatically.';
 if(freeze.overdue===true){box.dataset.tone='error';box.setAttribute('role','alert');box.textContent+=' More than 4 hours have passed. Complete the cutover or cancel the freeze.';}
}
function showGoogleBackup(snapshot){
 const box=$('google-backup');box.replaceChildren();box.dataset.tone='info';const backup=snapshot.googleBackup;
 if(!object(backup)){unavailable(box);return;}
 if(backup.enabled!==true){box.append(element('p',backup.phase==='released'?'Verified Google backup restored. Complete the routing change in ownership setup.':'Google is the record. Mirroring starts after D1 activation.'));return;}
 const versions=backup.mirroredRevisions||{},revision=value=>number(value)??'not recorded';
 box.append(element('p','Google backup: Roster revision '+revision(versions.roster)+' · Timetable revision '+revision(versions.register)+'.'));
 const lag=Number.isFinite(backup.lagMs)&&backup.lagMs>=0?backup.lagMs:null;
 box.append(element('p',lag===null?'Backup lag is unavailable.':backup.pending===0&&lag===0?'Up to date.':Math.ceil(lag/60000)+' min behind.'));
 const phase={normal:'Waiting for changes',copying:'Copying',preparing:'Preparing',mirroring:'Copying',quiescing:'Stopping new work',paused:'Writes paused',releasing:'Restoring Google',released:'Google restored',idle:'Waiting for changes',complete:'Verified'}[backup.phase];if(phase)box.append(element('p',phase+'.','muted'));
 const largest=backup.largestPart;if(object(largest)&&typeof largest.name==='string'&&number(largest.chars)!==null)box.append(element('p','Largest part: '+largest.name.slice(0,100)+' · '+largest.chars.toLocaleString('en-SG')+' characters.','muted'));
 if(backup.warning===true||backup.behindThreshold===true){box.dataset.tone='error';box.append(element('p','Backup is behind the configured limit. Check the latest Google backup job before switching back.'));}
 else if(backup.error){box.dataset.tone='error';box.append(element('p','The last backup attempt could not be confirmed. Retry from ownership setup.'));}
}
function showBacklog(snapshot){
 const box=$('backlog');box.replaceChildren();
 const audit=rows(snapshot.jobs).find(row=>row.job==='audit-export');
 if(audit&&number(audit.counts?.pending)!==null){
  box.append(element('p','Pending daily audit exports at last check: '+audit.counts.pending+'.'),element('p','Checked '+date(audit.eventAt)+'. One pending day is exported per five-minute audit invocation.','muted'));
  const reason={AUDIT_LOGGING_DISABLED:'Verbose logging is off; optional audit exports are paused.',AUDIT_EXPORT_BUSY:'Audit export is waiting for its lock and will retry.',AUDIT_NOTIFICATION_PRIORITY:'Audit export yielded to pending notifications and will retry.',AUDIT_EXPORT_PENDING:'An audit export could not be confirmed and will retry.'}[audit.code];if(reason)box.append(element('p',reason,'muted'));
 }else box.append(element('p','Daily allocation audit export status is unavailable. Check that the five-minute audit trigger is installed.','muted'));

 if(snapshot.profile==='google-recovery'){
  const reports=snapshot.reports,available=reports?.available===true&&number(reports.pendingCaptureCount)!==null&&number(reports.peerReviewCount)!==null;
  box.append(element('p',available?'Saved receipts awaiting absence processing or review: '+reports.pendingCaptureCount+'. Colleague proposals awaiting review: '+reports.peerReviewCount+'.':'Saved receipt review/processing counts are unavailable.'));
  if(available)box.append(element('p','Google receipt journal across all dates. Checked '+date(reports.checkedAt)+'.','muted'));
  box.append(element('p','Unforwarded transport receipts are not included; their current count is unavailable. These are not total unresolved-report counts.','muted'),element('p','Open Assign Relief → Received reports in Roster to review retained reports.'));
  const link=element('a','Open Roster');link.href='/';box.append(link);return;
 }
if(snapshot.backlog?.available!==true)unavailable(box);else{for(const row of rows(snapshot.backlog.items,8).filter(row=>Object.hasOwn(LABELS,row.kind))){const block=element('div','','metric-row');block.append(element('strong',LABELS[row.kind]),element('p',(number(row.pending)??0)+(row.capped?' or more':'')+' pending','metric-value'));if(stamp(row.oldestPendingAt)!==null)block.append(element('p','Oldest pending: '+date(row.oldestPendingAt),'muted'));else if(row.pending>0)block.append(element('p','Oldest pending time unavailable.','muted'));box.append(block);}}
 const bg=snapshot.background;$('background-summary').replaceChildren(element('p',bg?.enabled===true?'Queue processing enabled.':'Queue processing is unavailable or disabled.'));const summary=countText(bg?.counts);if(summary)$('background-summary').append(element('p',summary,'muted'));
 const jobs=$('background-jobs');jobs.replaceChildren();for(const row of rows(bg?.jobs,3).filter(row=>Object.hasOwn(KINDS,row.kind))){const card=element('div','','job-row'),heading=element('div','','section-heading'),title=element('strong',KINDS[row.kind]);heading.append(title,badge(row.status));card.append(heading);if(stamp(row.requestedAt)!==null)card.append(element('p','Requested: '+date(row.requestedAt),'muted'));card.append(element('p','Attempts: '+(number(row.attempts)??0),'muted'));if(row.lastCode)card.append(element('p',diagnostic({code:row.lastCode,httpStatus:row.lastHttpStatus}),'diagnostic'));if(row.status==='parked'&&number(row.generation)!==null){const button=element('button','Retry parked job');button.type='button';button.dataset.retryKind=row.kind;button.addEventListener('click',()=>confirmRetry(row.kind,row.generation));card.append(button);}jobs.append(card);}if(!jobs.children.length)jobs.append(element('p','No background job intents recorded.','muted'));
}
function showCache(snapshot){
 const box=$('timetables');box.replaceChildren();if(snapshot.timetables?.available!==true)unavailable(box);else{for(const row of rows(snapshot.timetables.stages,2).filter(row=>['baseline','suspended'].includes(row.stage))){const card=element('div','','metric-row');card.append(element('strong',row.stage==='baseline'?'Baseline timetable':'Relief timetable views'),document.createTextNode(' '),badge(row.status),element('p','Last prepared: '+date(row.lastPreparedAt),'muted'),element('p','Last source check: '+date(row.lastSourceCheckAt),'muted'));const pendingCount=typeof row.pending==='boolean'?Number(row.pending):number(row.pending);if(pendingCount!==null)card.append(element('p','Preparation jobs pending: '+pendingCount,'muted'));box.append(card);}if(!box.children.length)box.append(element('p','No preparation metadata recorded.','muted'));}
 const cleanup=$('cleanup');cleanup.replaceChildren();if(snapshot.cleanup?.available!==true)unavailable(cleanup);else{const day=snapshot.cleanup.completedDay;cleanup.append(element('p',typeof day==='string'&&/^20\d\d-\d\d-\d\d$/.test(day)?'Last completed: '+day:'No completed cleanup recorded.'));const summary=countText(snapshot.cleanup.counts);if(summary)cleanup.append(element('p',summary,'muted'));}
}
function showFailures(snapshot){const box=$('recent-failures');box.replaceChildren();for(const row of rows(snapshot.recentFailures,20).filter(row=>Object.hasOwn(LABELS,row.job))){const block=element('div','','failure-row');block.append(element('strong',LABELS[row.job]),element('span',date(row.eventAt),'muted'),element('p',diagnostic(row),'diagnostic'));box.append(block);}if(!box.children.length)box.append(element('p',snapshot.storage?.available===true&&snapshot.storage?.historyAvailable!==false?'No failures in the retained recent history.':'Failure history is unavailable.','muted'));}
function showRecovery(snapshot){
 const recovery=snapshot.recovery;$('recovery-status').textContent=recovery?.mode==='active'&&recovery?.paused===false?'Operations active.':recovery?.mode==='paused'?'Recovery pause is active. Writes, dispatch and cleanup must remain paused.':'Recovery status is unavailable or misconfigured.';
 $('checkpoint-help').textContent=recovery?.checkpointCaptureConfigured!==true?'Checkpoint capture is not configured. An operator must complete the private Worker configuration in the recovery guide.':recovery?.paused!==false||recovery?.mode!=='active'?'Checkpoint capture is unavailable while recovery is paused or its state is unverified.':recovery?.checkpointStorage!=='available'?'Checkpoint history storage is unavailable.':'Record a checkpoint before planned maintenance. The server captures and verifies the native bookmark.';
 const box=$('checkpoints');box.replaceChildren();for(const row of rows(recovery?.checkpoints,20)){const card=element('div','','checkpoint-row');card.append(element('strong',Object.hasOwn(REASONS,row.reason)?REASONS[row.reason]:'Checkpoint'),element('p',date(row.capturedAt),'muted'));box.append(card);}if(!box.children.length)box.append(element('p',recovery?.checkpointStorage==='available'?'No checkpoints recorded yet.':'Checkpoint history unavailable.','muted'));
}
function show(snapshot){data=object(snapshot)?snapshot:{};ready=true;$('timetable-preparation-link').hidden=data.peerMailReviewAllowed!==true;
 $('peer-mail-section').hidden=data.peerMailReviewAllowed!==true;$('peer-mail-review').replaceChildren(element('p','Load a fresh preview to inspect current unresolved outcomes.','muted'));
 const recovery=data.profile==='google-recovery';
 $('op-checkpoint').closest('section').hidden=recovery;$('timetables').closest('section').hidden=recovery;
 for(const node of document.querySelectorAll('[data-private-health]'))node.hidden=recovery;
 showJobs(data);showCutoverFreeze(data);showGoogleBackup(data);showBacklog(data);showCache(data);showFailures(data);showRecovery(data);$('checked-at').textContent='Checked '+date(data.checkedAt)+' · Singapore time';$('health-content').hidden=false;}
async function call(body){const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let result;try{result=await response.json();}catch{throw safeFailure('Status could not be read. Refresh to check the current state.');}if(!response.ok||result?.ok!==true){const status=result?.status||response.status;if(status===401||status===403)throw Object.assign(safeFailure('Sign in to Roster with your school SMC or administrator account, then refresh status.'),{status});if(status===409)throw Object.assign(safeFailure('The record changed before this action completed. Load a fresh preview before trying again.'),{status});throw safeFailure('The action could not be confirmed. Refresh status and check the Worker logs.');}return result.data||{};}
async function run(body){if(busy)return;busy=true;controls();message(body.operation==='read'?'Checking current status…':'Waiting for the server to confirm this action…','busy');try{const result=await call(body);show(body.operation==='read'?result:await call({operation:'read'}));message(body.operation==='recordRecoveryCheckpoint'?'Checkpoint recorded. Status refreshed.':body.operation==='retryBackgroundJob'?'Retry accepted. Status refreshed.':'Status loaded. Use Refresh status for a new check.','success');}catch(error){clear();message(error.healthMessage||'Status could not be confirmed. Check your connection, then refresh status.','error');}finally{busy=false;controls();}}
function confirmRetry(kind,generation){if(busy||!ready)return;$('confirm-title').textContent='Retry parked work?';$('confirm-action').textContent='Retry job';pending={operation:'retryBackgroundJob',kind,expectedGeneration:generation};focusReturn=document.activeElement;$('confirm-description').textContent='Request another bounded attempt for '+KINDS[kind].toLowerCase()+'. Existing delivery claims and uncertain provider outcomes remain protected.';$('confirmation').showModal();$('cancel-action').focus();}
function showPeerReview(view){
 const box=$('peer-mail-review');box.replaceChildren();
 if(view.available!==true){unavailable(box);return;}
 const counts=view.counts||{};box.append(element('p','Current unresolved uncertain: '+(number(counts.uncertain)??'unavailable')+'. Reviewed uncertain: '+(number(counts.reviewedUncertain)??'unavailable')+'. Pending: '+(number(counts.pending)??'unavailable')+'. Blocked: '+(number(counts.blocked)??'unavailable')+'.'));
 box.append(element('p','Preview checked '+date(view.checkedAt)+'. Reviewing does not confirm delivery or erase failure history.','muted'));
 for(const row of rows(view.issues,100).filter(row=>row.status==='uncertain'&&typeof row.id==='string'&&typeof row.token==='string'&&/^[a-f0-9]{64}$/.test(row.token))){
  const card=element('div','','job-row'),name=typeof row.recipientName==='string'?row.recipientName.slice(0,120):'Colleague',day=typeof row.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'Date unavailable';
  card.append(element('strong',name+' · '+day),element('p','Provider outcome remains uncertain. Prepared: '+date(row.preparedAt),'muted'));
  const button=element('button','Mark reviewed…');button.type='button';button.dataset.peerReview='true';button.addEventListener('click',()=>runPeer({operation:'peerMailReview'},row.id));card.append(button);box.append(card);
 }
 if(view.capped)box.append(element('p','Showing the first 100 unresolved outcomes. Load another preview after review to see remaining items.','muted'));
}
async function runPeer(body,prepareId){
 if(busy||!ready||data?.peerMailReviewAllowed!==true)return;busy=true;controls();message(body.operation==='reviewPeerMail'?'Recording your review without sending email…':'Checking current email review records…','busy');
 try{
  const result=await call(body);if(body.operation==='reviewPeerMail')peerRetry=null;showPeerReview(result);
  if(prepareId){
   const row=rows(result.issues,100).find(row=>row.id===prepareId);if(!row)throw safeFailure('This outcome is no longer awaiting review. Check the refreshed preview.');
   pending={operation:'reviewPeerMail',id:row.id,expectedToken:row.token,requestId:crypto.randomUUID()};focusReturn=document.activeElement;
   $('confirm-title').textContent='Mark email outcome reviewed?';$('confirm-action').textContent='Mark reviewed';
   $('confirm-description').textContent='Confirm that you checked with '+String(row.recipientName||'the colleague').slice(0,120)+' about the proposal for '+String(row.date||'this date')+'. This preserves the uncertain provider outcome and records your review. It sends no email.';
   $('confirmation').showModal();$('cancel-action').focus();
  }
  message(body.operation==='reviewPeerMail'?'Review recorded. No email sent. Failure history is retained.':'Current email review preview loaded.','success');
 }catch(error){
  if(error.status===401||error.status===403){clear();}else if(error.status===409){peerRetry=null;$('peer-mail-review').replaceChildren(element('p','The record changed. Load a fresh preview.','muted'));}else if(body.operation==='reviewPeerMail'){$('peer-mail-review').replaceChildren(element('p','The review acknowledgement was not received. Retry review confirmation to recover the original request; no email will be sent.','muted'));}
  message(error.healthMessage||'Review could not be confirmed. Retry the original confirmation or load a fresh preview.','error');
 }finally{busy=false;controls();}
}
function closeDialog(){pending=null;$('confirmation').close();focusReturn?.focus();}
$('op-refresh').addEventListener('click',()=>run({operation:'read'}));$('op-checkpoint').addEventListener('click',()=>run({operation:'recordRecoveryCheckpoint',reason:'manual'}));$('cancel-action').addEventListener('click',closeDialog);$('confirmation').addEventListener('cancel',()=>{pending=null;focusReturn?.focus();});$('confirm-action').addEventListener('click',()=>{const body=pending;closeDialog();if(body){if(body.operation==='reviewPeerMail'){peerRetry=body;runPeer(body);}else run(body);}});
$('op-peer-review').addEventListener('click',()=>runPeer({operation:'peerMailReview'}));$('op-peer-retry').addEventListener('click',()=>{if(peerRetry)runPeer(peerRetry);});controls();run({operation:'read'});
})();
