/* Daily Drive reporting owns transport review state only. Report-file I/O never holds a Roster or notification writer lock. */
function rosterDeliveryReviewText_(value){
 return String(value||'').replace(/https?:\/\/\S+|[A-Za-z0-9_-]{32,}/gi,'[redacted]').replace(/[\r\n\t\u0000-\u001f\u007f]/g,' ').slice(0,100);
}
function rosterDeliveryReviewMonitor_(input,previous){
 const value=input||{},state=value.state;
 if(!['checked','failed','configuration','disabled'].includes(state))return previous||[];
 if(state==='disabled')return [];
 if(state==='failed')return [...(previous||[]).filter(i=>i.group==='configuration'),{id:'monitor',group:'monitoring',status:'check_failed',cause:'The template approval check could not be completed. This does not confirm a delivery failure.',action:'Check the Worker connection and Meta account access; the background check will retry.'}];
 if(state==='configuration'){
  const fields=['GSIS_SECRET','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','ROSTER_SERVICE_SECRET','EXTERNAL_LINK_SECRET','ROSTER_PUBLIC_ORIGIN','APPS_SCRIPT_URL','WHATSAPP_VERIFY_TOKEN','WHATSAPP_ACCOUNT_ID','WHATSAPP_TEMPLATE_ACCOUNT_ID','CONTACTS_PUBLIC_URL','WHATSAPP_TEMPLATES_JSON'];
  const field=fields.includes(value.field)?value.field:'WhatsApp configuration';
  return [{id:'configuration',group:'configuration',status:'invalid',field,cause:'An enabled WhatsApp configuration could not be validated.',action:'Check '+field+' in the Worker settings and verify its approved template contract.'}];
 }
 const statuses=['pending','missing','mismatch','rejected','paused','disabled','in_appeal','pending_deletion','deleted'],keys=['mutual_request','mutual_override','contact_review','relief_assignment','relief_updated','relief_reminder','relief_unacknowledged','relief_urgent','relief_urgent_smc','relief_evening','relief_morning','absence_update','relief_manual_review','capacity_warning','relief_final','conditional_relief_instruction','urgent_forward','smc_attention','stapler_timetable','stapler_request','stapler_decision'];
 return (Array.isArray(value.routes)?value.routes:[]).filter(r=>keys.includes(r?.key)&&statuses.includes(r.status)).map(r=>({id:'template:'+r.key,group:'configuration',status:r.status,field:r.key,cause:'Enabled template '+r.key+' has verified status '+r.status+'.',action:'Review this template in Meta WhatsApp Manager and the Worker template configuration before resending.'}));
}
function rosterDeliveryReviewRowFingerprint_(row){return rosterOperationsDigest_([row.id,row.status,row.error||'',row.deliveryStatus||'',row.attempts||0,row.claimId||'',row.messageId||'',row.deliveryAt||'',row.completedAt||'',row.providerError||null]);}
function rosterDeliveryReviewMaterial_(issue){const {at,...rest}=issue;return JSON.stringify(rest);}
function rosterDeliveryReviewIssues_(state,monitor,previous){
 const old=new Map((previous||[]).filter(i=>i.group==='delivery').map(i=>[i.id,i])),issues=[];
 for(const row of state.outbox){
  const reported=row.adminReviewReceipt;
  if(reported?.schema===1&&(reported.fingerprint===rosterDeliveryReviewRowFingerprint_(row)||['queued','sending','claimed'].includes(row.status)))continue;
  if(['delivered','read'].includes(row.deliveryStatus))continue;
  const id='notification:'+row.id,prior=old.get(id),retry=['queued','sending','claimed'].includes(row.status);
  if(retry&&prior){issues.push(prior);continue;}
  if(!['failed','uncertain','blocked'].includes(row.status)&&!(retry&&row.deliveryStatus==='retry-pending'))continue;
  const status=retry?'failed':row.status,rawCode=row.providerError?.code??/^META_(\d+)$/.exec(row.error||'')?.[1],code=/^\d{1,9}$/.test(String(rawCode))?Number(rawCode):null;
  const cause=status==='uncertain'?'The provider outcome could not be confirmed.':status==='blocked'?'The notification is blocked by template approval or configuration.':code?'Meta reported error '+code+'.':'The notification could not be delivered.';
  const action=status==='uncertain'?'Check delivery before resending to avoid duplicate messages; contact the teacher directly if urgent.':status==='blocked'?'Check the enabled template and its approval, then retry the affected notification.':code===132000?'Check the approved template parameter count, then retry the affected notification.':'Check the affected recipient and delivery result; contact the teacher directly if urgent.';
  issues.push({id,group:'delivery',deliveryFingerprint:rosterDeliveryReviewRowFingerprint_(row),status,code,kind:rosterDeliveryReviewText_(row.kind),date:/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'',name:rosterDeliveryReviewText_(row.name)||'Teacher',record:rosterOperationsDigest_(row.id).slice(0,12),at:row.deliveryAt||row.completedAt||row.createdAt||'',cause,action});
 }
 return [...issues,...monitor.map(i=>({...i,occurrence:state.deliveryReview?.monitorEpochs?.[i.id]||0})).filter(i=>state.deliveryReview?.reportedMonitor?.[i.id]!==rosterOperationsDigest_(rosterDeliveryReviewMaterial_(i)))].sort((a,b)=>a.id.localeCompare(b.id));
}
function rosterDeliveryReviewReportText_(issues,observedAt,date){
 const clock=value=>{const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp+8*3600000).toISOString().replace('T',' ').slice(0,19)+' SGT':rosterDeliveryReviewText_(value);};
 const deliveries=issues.filter(i=>i.group==='delivery'),configuration=issues.filter(i=>i.group==='configuration'),monitoring=issues.filter(i=>i.group==='monitoring');
 const lines=['WhatsApp delivery review — '+date,'Captured: '+clock(observedAt),'Scheduled report: 08:00 Asia/Singapore.','Delivery issues: '+deliveries.length+'; configuration issues: '+configuration.length+'; monitoring issues: '+monitoring.length+'.',''];
 for(const [heading,rows] of [['Delivery',deliveries],['Configuration',configuration],['Monitoring',monitoring]])if(rows.length){lines.push(heading);for(const issue of rows){lines.push('- '+(issue.group==='delivery'?[issue.name,issue.date,issue.kind,'record '+issue.record].filter(Boolean).join(' | '):issue.field||'Template approval check')+' — '+issue.status, '  '+issue.cause,...(issue.at?['  Last recorded: '+clock(issue.at)]:[]),'  Next action: '+issue.action);}lines.push('');}
 lines.push('These diagnostics do not include private timetable links or access tokens. An unchecked route is not evidence of failure or success.');
 if(!issues.length)lines.push('No new delivery issues were present at capture.');
 lines.push('Archiving these issues does not establish successful WhatsApp delivery. New or changed issues after capture are retained for the next report.');
 return lines.join('\n')+'\n';
}
function rosterDeliveryReviewRefresh_(state,input,recipients,now){
 const before=JSON.stringify(state.deliveryReview),review=state.deliveryReview||(state.deliveryReview={revision:0,issues:[],monitor:[],jobs:[]}),iso=new Date(now).toISOString();
 // An older concurrent template poll must not reopen a newer resolved check.
 const checkedAt=Number(input?.checkedAt),authoritative=['checked','failed','configuration','disabled'].includes(input?.state);
 if(authoritative&&Number.isFinite(checkedAt)&&checkedAt>0&&checkedAt>=(review.monitorCheckedAt||0)){
  const nextMonitor=rosterDeliveryReviewMonitor_(input,review.monitor);review.monitorEpochs=review.monitorEpochs||{};
  for(const issue of review.monitor)if(!nextMonitor.some(i=>i.id===issue.id))review.monitorEpochs[issue.id]=(review.monitorEpochs[issue.id]||0)+1;
  review.monitor=nextMonitor;
  for(const id of Object.keys(review.reportedMonitor||{}))if(!review.monitor.some(i=>i.id===id))delete review.reportedMonitor[id];
  // Persist the newest observation even when its result is unchanged. Otherwise
  // a slower, older check can reopen an issue after a newer clean observation.
  review.monitorCheckedAt=checkedAt;
 }
 const material=rosterDeliveryReviewMaterial_,previous=new Map(review.issues.map(i=>[i.id,material(i)]));
 const issues=rosterDeliveryReviewIssues_(state,review.monitor,review.issues),fingerprint=rosterOperationsDigest_(issues.map(material));
 if(fingerprint!==review.fingerprint){
  // Removing an issue updates the next report, but does not re-alert all of the
  // unchanged issues that remain. Reopening is an addition after resolution.
  if(issues.some(i=>{const prior=review.issues.find(v=>v.id===i.id);if(prior?.group==='delivery'&&!prior.deliveryFingerprint){const {deliveryFingerprint,...legacy}=i;return material(prior)!==material(legacy);}return previous.get(i.id)!==material(i);}))review.revision++;
  review.fingerprint=fingerprint;review.issues=issues;review.observedAt=iso;
 }
 // Retire legacy report work without changing its submission history. An email
 // that the old deployment already submitted cannot be recalled by this release.
 for(const job of review.jobs)if(['queued','sending','uncertain'].includes(job.status)){
  job.previousStatus=job.status;job.status='superseded';job.finishedAt=iso;
  job.reason='Replaced by the daily Drive report. Any previously submitted email cannot be recalled.';
 }
 const old=review.jobs.filter(j=>['sent','superseded'].includes(j.status));
 if(old.length>100){const remove=new Set(old.slice(0,-100).map(j=>j.id));review.jobs=review.jobs.filter(j=>!remove.has(j.id));}
 return before!==JSON.stringify(review);
}
// Keep the existing service action during rolling upgrades. It cannot send mail.
function rosterDeliveryReviewMailDispatch_(input){return rosterDeliveryReviewReportDispatch_(input);}
function rosterDeliveryReviewReportDispatch_(input){
 gsisRequireBackendRole_('roster');rosterNotificationEnsure_();
 const outcome={sent:0,uncertain:0,reported:0,cleared:0,pending:0},trace={stage:'reserve'};let claim;
 const lock=rosterNotificationLock_();if(!deployLock_(lock,1500))return {...outcome,busy:true};
 try{
  const state=rosterNotificationState_(),now=Date.now(),iso=new Date(now).toISOString(),local=new Date(now+8*3600000).toISOString(),date=local.slice(0,10);
  const changed=rosterDeliveryReviewRefresh_(state,input?.monitor,[],now),review=state.deliveryReview;
  review.reports=review.reports||{};review.reportFolders=review.reportFolders||{};
  let report=Object.values(review.reports).filter(row=>row.status!=='done').sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(!report){
   if(local.slice(11,16)<'08:00'){if(changed)rosterNotificationCommit_(state);return {...outcome,deferred:'before-0800'};}
   if(review.reports[date]?.status==='done'){if(changed)rosterNotificationCommit_(state);return {...outcome,date,alreadyReported:true};}
   const issues=JSON.parse(JSON.stringify(review.issues)),text=rosterDeliveryReviewReportText_(issues,iso,date);
   report=review.reports[date]={schema:1,date,status:'pending',capturedAt:iso,issues,count:issues.length,digest:rosterOperationsDigest_(text)};
  }
  if(report.claimExpiresAt>now){if(changed)rosterNotificationCommit_(state);return {...outcome,date:report.date,pending:1,busy:true};}
  report.claimId=Utilities.getUuid();report.claimExpiresAt=now+10*60000;report.attempts=(report.attempts||0)+1;delete report.error;
  rosterNotificationCommit_(state);claim=JSON.parse(JSON.stringify({...report,folderIndex:review.reportFolders}));
 }finally{deployUnlock_(lock);}
 try{
  if(!claim.fileId){
   const reservation=rosterDeliveryReviewReserve_(claim),reserveLock=rosterNotificationLock_();trace.stage='reserve-commit';
   if(!deployLock_(reserveLock,1500))return {...outcome,date:claim.date,pending:1,busy:true};
   try{
    const state=rosterNotificationState_(),review=state.deliveryReview,current=review.reports[claim.date];
    if(current?.claimId!==claim.claimId)return {...outcome,date:claim.date,pending:1,busy:true};
    if(!current.fileId){
     current.fileId=reservation.fileId;current.folders=[];let parent=ROSTER_ROOT;
     for(const folder of reservation.folders){const id=review.reportFolders[folder.key]||folder.id;review.reportFolders[folder.key]=id;current.folders.push({id,name:folder.name,parent});parent=id;}
     rosterNotificationCommit_(state);
    }
    claim=JSON.parse(JSON.stringify(current));
   }finally{deployUnlock_(reserveLock);}
  }
  rosterDeliveryReviewWriteReport_(claim,trace);trace.stage='settle-read';
  const settle=rosterNotificationLock_();if(!deployLock_(settle,1500))return {...outcome,date:claim.date,pending:1,busy:true};
  try{
   const state=rosterNotificationState_(),review=state.deliveryReview,current=review.reports[claim.date];
   if(current?.claimId!==claim.claimId||current.digest!==claim.digest)return {...outcome,date:claim.date,pending:1,busy:true};
   const now=Date.now(),iso=new Date(now).toISOString(),live=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]),byId=new Map(live.map(issue=>[issue.id,issue]));
   review.reportedMonitor=review.reportedMonitor||{};
   for(const issue of current.issues){
    const latest=byId.get(issue.id),fingerprint=rosterOperationsDigest_(rosterDeliveryReviewMaterial_(issue));
    if(!latest||rosterOperationsDigest_(rosterDeliveryReviewMaterial_(latest))!==fingerprint)continue;
    if(issue.group==='delivery'){
     const row=state.outbox.find(row=>'notification:'+row.id===issue.id);
     if(!row||rosterDeliveryReviewRowFingerprint_(row)!==issue.deliveryFingerprint)continue;
     row.adminReviewReceipt={schema:1,fingerprint:issue.deliveryFingerprint,reportedAt:iso,reportDate:claim.date,reportFileId:claim.fileId,reason:'Archived in the daily Drive report; delivery outcome unchanged'};
     for(const alert of state.smcAlerts||[])if(alert.notificationId===row.id||alert.key==='delivery:'+row.id){alert.closedAt=iso;alert.reviewedAt=iso;alert.reviewReason='Archived in the daily Drive report';alert.reportFileId=claim.fileId;}
    }else review.reportedMonitor[issue.id]=fingerprint;
    outcome.cleared++;
   }
   current.status='done';current.verifiedAt=iso;current.cleared=outcome.cleared;delete current.issues;delete current.claimId;delete current.claimExpiresAt;delete current.error;
   // Receipts on each delivery row retain issue ownership. Keep a bounded daily
   // index, while all human-readable reports remain in Drive.
   const completed=Object.keys(review.reports).filter(date=>review.reports[date].status==='done').sort();
   for(const date of completed.slice(0,-90))delete review.reports[date];
   rosterDeliveryReviewRefresh_(state,null,[],now);trace.stage='settle-commit';rosterNotificationCommit_(state);
   return {...outcome,date:claim.date,reported:1,fileId:claim.fileId};
  }finally{deployUnlock_(settle);}
 }catch(error){
  // A lost create/settlement response keeps the frozen snapshot and reserved ID.
  // The next attempt verifies that same file before it clears any issue.
  const diagnostic=rosterDeliveryReviewDiagnostic_(error,trace.stage),diagnosticRecorded=rosterDeliveryReviewRecordFailure_(claim,diagnostic);
  return {...outcome,cleared:0,date:claim.date,pending:1,diagnostic,diagnosticRecorded,error:'The daily delivery report is pending. Check its diagnostic code; the same report will retry.'};
 }
}
function rosterDeliveryReviewReserve_(claim){
 const response=rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/generateIds?count=5&space=drive&type=files',{},'delivery-report-reserve'),ids=rosterDriveJson_(response,'delivery-report-reserve').ids;
 if(!Array.isArray(ids)||ids.length!==5||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id))||new Set(ids).size!==5)rosterDeliveryReviewError_('RESERVATION_INVALID');
 const folders=[];let parent=ROSTER_ROOT,key='',discover=true;
 for(const [index,name] of ['WhatsApp','Delivery Reports',claim.date.slice(0,4),claim.date.slice(5,7)].entries()){
  key+=(key?'/':'')+name;let id=claim.folderIndex?.[key];
  if(!id&&discover)id=rosterFindFile_(parent,name);
  if(!id){id=ids[index];discover=false;}
  folders.push({key,id,name,parent});parent=id;
 }
 return {folders,fileId:ids[4]};
}
function rosterDeliveryReviewFileMetadata_(id){
 try{return rosterDriveJson_(rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed,appProperties',{},'delivery-report-metadata'),'delivery-report-metadata');}
 catch(error){if(error?.rosterDrive?.httpStatus===404)return null;throw error;}
}
function rosterDeliveryReviewWriteReport_(report,trace={}){
 gsisRequireBackendRole_('roster');
 for(const folder of report.folders){
  trace.stage='folder-read';let found=rosterDeliveryReviewFileMetadata_(folder.id);
  if(!found){
   trace.stage='folder-create';try{rosterDriveRequest_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json; charset=UTF-8',payload:JSON.stringify({id:folder.id,name:folder.name,mimeType:'application/vnd.google-apps.folder',parents:[folder.parent]})},'delivery-report-folder');}
   catch(error){if(!rosterDeliveryReviewFileMetadata_(folder.id))throw error;}
   found=rosterDeliveryReviewFileMetadata_(folder.id);
  }
  trace.stage='folder-verify';if(found?.id!==folder.id||found.name!==folder.name||found.mimeType!=='application/vnd.google-apps.folder'||!found.parents?.includes(folder.parent)||found.trashed)rosterDeliveryReviewError_('FOLDER_IDENTITY_MISMATCH');
 }
 trace.stage='file-render';const text=rosterDeliveryReviewReportText_(report.issues,report.capturedAt,report.date),name='WhatsApp-Delivery-Issues-'+report.date+'.txt',parent=report.folders.at(-1).id;
 if(rosterOperationsDigest_(text)!==report.digest)rosterDeliveryReviewError_('SNAPSHOT_DIGEST_MISMATCH');
 trace.stage='file-read';let found=rosterDeliveryReviewFileMetadata_(report.fileId);
 if(!found){
  trace.stage='file-create';const metadata={id:report.fileId,name,mimeType:'text/plain',parents:[parent],appProperties:{gsisRole:'whatsapp-delivery-report',gsisDate:report.date,gsisDigest:report.digest}},boundary='gsis_delivery_'+report.claimId.replace(/[^A-Za-z0-9]/g,'');
  const payload='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'+text+'\r\n--'+boundary+'--';
  try{rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'post',contentType:'multipart/related; boundary='+boundary,payload},'delivery-report-write');}
  catch(error){if(!rosterDeliveryReviewFileMetadata_(report.fileId))throw error;}
  found=rosterDeliveryReviewFileMetadata_(report.fileId);
 }
 trace.stage='file-verify';if(found?.id!==report.fileId||found.name!==name||found.mimeType!=='text/plain'||!found.parents?.includes(parent)||found.trashed||found.appProperties?.gsisRole!=='whatsapp-delivery-report'||found.appProperties?.gsisDate!==report.date||found.appProperties?.gsisDigest!==report.digest)rosterDeliveryReviewError_('FILE_IDENTITY_MISMATCH');
 trace.stage='file-content';if(rosterReadFile_(report.fileId)!==text)rosterDeliveryReviewError_('FILE_CONTENT_MISMATCH');
}

// Diagnostic data is a fixed vocabulary only. Never persist provider exception
// text, request URLs, staff names, tokens, file content or a raw stack here.
function rosterDeliveryReviewError_(code){throw Object.assign(new Error('The daily delivery report needs review.'),{status:503,deliveryReportCode:code});}
function rosterDeliveryReviewDiagnostic_(error,stage){
 const stages=['reserve','reserve-commit','folder-read','folder-create','folder-verify','file-render','file-read','file-create','file-verify','file-content','settle-read','settle-commit'],codes=['RESERVATION_INVALID','FOLDER_IDENTITY_MISMATCH','SNAPSHOT_DIGEST_MISMATCH','FILE_IDENTITY_MISMATCH','FILE_CONTENT_MISMATCH'];
 const value=Number(error?.rosterDrive?.httpStatus),httpStatus=Number.isInteger(value)&&value>=100&&value<=599?value:null;
 const code=codes.includes(error?.deliveryReportCode)?error.deliveryReportCode:[401,403].includes(httpStatus)?'DRIVE_ACCESS_DENIED':httpStatus===404?'DRIVE_NOT_FOUND':httpStatus===429?'DRIVE_RATE_LIMIT':httpStatus>=500?'DRIVE_UNAVAILABLE':[400,409].includes(httpStatus)?'DRIVE_REQUEST_REJECTED':error?.rosterDrive?.reasons?.includes('NETWORK_ERROR')?'DRIVE_NETWORK_ERROR':stage==='settle-commit'?'SETTLEMENT_UNCONFIRMED':stage==='reserve-commit'?'RESERVATION_UNCONFIRMED':'REPORT_OPERATION_FAILED';
 return {stage:stages.includes(stage)?stage:'unknown',code,httpStatus};
}
function rosterDeliveryReviewRecordFailure_(claim,diagnostic){
 let lock,held=false;
 try{
  lock=rosterNotificationLock_();if(!deployLock_(lock,1500))return false;held=true;
  const state=rosterNotificationState_(),report=state.deliveryReview?.reports?.[claim.date];
  if(report?.status==='done'||report?.claimId!==claim.claimId||report?.digest!==claim.digest)return false;
  report.error={...diagnostic,at:new Date().toISOString()};rosterNotificationCommit_(state);return true;
 }catch(ignore){return false;}
 finally{if(held)deployUnlock_(lock);}
}
