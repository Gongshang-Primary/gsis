/* Delivery diagnostics use immutable private R2 archives and D1 review receipts. */
import {loadEdgeRoster,mutateEdgeRoster,buildEdgeRosterContext} from './edge-roster.js';
import {sha256Hex} from './edge-deploy-sha256.js';
const rosterOperationsDigest_=value=>sha256Hex(JSON.stringify(value));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function rosterDeliveryReviewText_(value){
 return String(value||'').replace(/https?:\/\/\S+|[A-Za-z0-9_-]{32,}/gi,'[redacted]').replace(/[\r\n\t\u0000-\u001f\u007f]/g,' ').slice(0,100);
}
function rosterDeliveryReviewMonitor_(input,previous){
 const value=input||{},state=value.state;
 if(!['checked','failed','configuration','disabled'].includes(state))return previous||[];
 if(state==='disabled')return [];
 if(state==='failed')return [...(previous||[]).filter(i=>i.group==='configuration'),{id:'monitor',group:'monitoring',status:'check_failed',cause:'The template approval check could not be completed. This does not confirm a delivery failure.',action:'Check the Worker connection and Meta account access; the background check will retry.'}];
 if(state==='configuration'){
  const fields=['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','EXTERNAL_LINK_SECRET','ROSTER_PUBLIC_ORIGIN','APPS_SCRIPT_URL','WHATSAPP_VERIFY_TOKEN','WHATSAPP_ACCOUNT_ID','WHATSAPP_TEMPLATE_ACCOUNT_ID','CONTACTS_PUBLIC_URL','WHATSAPP_TEMPLATES_JSON'];
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
function rosterDeliveryReviewPending_(row){return ['queued','blocked','claimed','sending'].includes(row.status)&&!row.preparedAt&&!row.domainCancelled&&!['sent','delivered','read'].includes(row.deliveryStatus);}
function rosterDeliveryReviewPendingToken_(row){return rosterOperationsDigest_([rosterDeliveryReviewRowFingerprint_(row),row.consumedIntentRevision||0,row.notificationIntentRevision||0,row.preparedAt||0,row.expiresAt||0,row.domainCancelled===true]);}
function rosterDeliveryReviewView_(state,admin){
 const review=state.deliveryReview||{issues:[],monitor:[],jobs:[]},issues=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]),jobs=review.jobs||[];
 const reports=Object.values(review.reports||{});
 const rows=issues.map(issue=>{const token=rosterOperationsDigest_(rosterDeliveryReviewMaterial_(issue)),captured=reports.find(report=>report.status!=='done'&&report.issues?.some(value=>value.id===issue.id&&rosterOperationsDigest_(rosterDeliveryReviewMaterial_(value))===token));return {...issue,token,reportStatus:captured?'Report '+captured.date+' pending':'Waiting for 08:00 report'};});
 const pending=(admin?state.outbox.filter(rosterDeliveryReviewPending_):[]).map(row=>({id:row.id,token:rosterDeliveryReviewPendingToken_(row),name:rosterDeliveryReviewText_(row.name)||'Teacher',date:/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'',kind:rosterDeliveryReviewText_(row.kind),status:row.status}));
 return {checkedAt:new Date().toISOString(),revision:state.revision||0,issues:rows,pending,canCancel:admin===true,inFlight:state.outbox.filter(row=>row.status==='sending'&&row.preparedAt).length,uncertain:state.outbox.filter(row=>row.status==='uncertain').length,unresolvedUncertain:state.outbox.filter(row=>row.status==='uncertain'&&!(row.adminReviewReceipt?.schema===1&&row.adminReviewReceipt.fingerprint===rosterDeliveryReviewRowFingerprint_(row))).length,reviewedUncertain:state.outbox.filter(row=>row.status==='uncertain'&&row.adminReviewReceipt?.schema===1&&row.adminReviewReceipt.fingerprint===rosterDeliveryReviewRowFingerprint_(row)).length,queuedReportEmails:jobs.filter(j=>j.status==='queued').length,inFlightReportEmails:jobs.filter(j=>j.status==='sending').length,messagesSent:0};
}
function requireReviewUser(ctx){if(!ctx.user.smc&&!ctx.user.admin)fail(403,'SMC or Admin access is required.');}
export async function edgeDeliveryReviewBackend(env,p,who){
 if(p.operation==='deliveryReview'){
  const loaded=await loadEdgeRoster(env,{hydrate:false}),ctx=await buildEdgeRosterContext(env,loaded.state,p,who);requireReviewUser(ctx);
  return {...rosterDeliveryReviewView_(loaded.state,ctx.user.admin),reports:reportIndex(loaded.state)};
 }
 if(!['dismissDeliveryIssues','cancelPendingNotifications'].includes(p.operation))return null;
 return mutateEdgeRoster(env,{actor:who.email,who,requestId:p.requestId,command:p,domainChanged:false,apply(state,ctx){
  requireReviewUser(ctx);if(p.operation==='cancelPendingNotifications'&&!ctx.user.admin)fail(403,'Only Admin can cancel pending notifications.');
  if(!Array.isArray(p.items)||p.items.length>2000||p.items.some(item=>!item||typeof item.id!=='string'||item.id.length>300||! /^[a-f0-9]{64}$/.test(item.token)))fail(400,'Refresh the preview before continuing.');
  if(new Set(p.items.map(item=>item.id)).size!==p.items.length)fail(400,'A preview item was repeated.');
  const view=rosterDeliveryReviewView_(state,ctx.user.admin),candidates=new Map((p.operation==='dismissDeliveryIssues'?view.issues:view.pending).map(row=>[row.id,row]));
  for(const item of p.items)if(candidates.get(item.id)?.token!==item.token)fail(409,'Delivery records changed. Refresh and review the current items before continuing.');
  const review=state.deliveryReview||(state.deliveryReview={revision:0,issues:[],monitor:[],jobs:[]}),touched=new Set();let cancelledReportEmails=0;
  for(const item of p.items){const selected=candidates.get(item.id);
   if(p.operation==='dismissDeliveryIssues'){
    if(selected.group==='delivery'){
     const row=state.outbox.find(row=>'notification:'+row.id===item.id);if(!row||rosterDeliveryReviewRowFingerprint_(row)!==selected.deliveryFingerprint)fail(409,'This notification has a newer attempt. Refresh before clearing its alert.');
     row.adminReviewReceipt={schema:1,fingerprint:selected.deliveryFingerprint,reviewedAt:ctx.iso,reviewedBy:who.email,reason:'Manually reviewed in Daily Notify; not evidence of delivery'};
     for(const alert of state.smcAlerts||[])if(alert.notificationId===row.id||alert.key==='delivery:'+row.id){alert.closedAt=ctx.iso;alert.reviewedAt=ctx.iso;alert.reviewReason='Manually reviewed in Daily Notify';}
    }else{review.reportedMonitor||={};review.reportedMonitor[item.id]=item.token;}touched.add(item.id);
   }else{
    const row=state.outbox.find(row=>row.id===item.id);row.status='cancelled';row.domainCancelled=true;row.retryable=false;
    row.maintenanceCancellation={at:ctx.iso,by:who.email,previousStatus:selected.status,intentRevision:Math.max(Number(row.consumedIntentRevision)||0,Number(row.notificationIntentRevision)||0),reason:'Pending notification cancelled from Daily Notify'};
    row.expiresAt=Math.min(Number(row.expiresAt)||ctx.now,ctx.now);row.transportUpdatedAt=ctx.now;delete row.nextAttemptAt;delete row.nextEligibleAt;delete row.holdReason;touched.add('notification:'+row.id);
   }
  }
  review.issues=rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]);
  for(const job of review.jobs||[])if(job.status==='queued'&&(!review.issues.length||job.bindings?.some(binding=>touched.has(binding.id)))){job.status='superseded';job.finishedAt=ctx.iso;job.reason='Delivery review changed after this report was prepared';cancelledReportEmails++;}
  review.fingerprint=rosterOperationsDigest_(review.issues.map(rosterDeliveryReviewMaterial_));review.observedAt=ctx.iso;
  const result={changed:p.items.length,cancelledReportEmails,action:p.operation,messagesSent:0};state.reviewActions||=[];state.reviewActions.push({id:p.requestId,actor:who.email,at:ctx.iso,items:p.items,result});state.reviewActions=state.reviewActions.slice(-200);
  return {...rosterDeliveryReviewView_(state,ctx.user.admin),...result,reports:reportIndex(state)};
 }});
}
function reportIndex(state){return Object.values(state.deliveryReview?.reports||{}).filter(row=>row.status==='done'&&row.objectKey).sort((a,b)=>b.date.localeCompare(a.date)).map(row=>({date:row.date,count:row.count,url:'/api/whatsapp/reports/'+row.date}));}
export async function edgeDeliveryReportRead(env,date,who){
 if(!/^20\d\d-\d\d-\d\d$/.test(date))fail(400,'Invalid report date.');
 const loaded=await loadEdgeRoster(env,{hydrate:false}),ctx=await buildEdgeRosterContext(env,loaded.state,{operation:'deliveryReportRead'},who);requireReviewUser(ctx);
 const report=loaded.state.deliveryReview?.reports?.[date];if(!report||report.status!=='done'||!report.objectKey)fail(404,'This report is unavailable.');
 const object=await env.ROSTER_TIMETABLE_SNAPSHOTS?.get(report.objectKey);if(!object)fail(503,'The archived report is unavailable.');const text=await object.text();if(sha256Hex(text)!==report.contentDigest)fail(503,'Report integrity verification failed.');
 return text;
}
export async function dispatchEdgeDeliveryReview(env,p){
 const outcome={sent:0,uncertain:0,reported:0,cleared:0,pending:0},mutate=apply=>mutateEdgeRoster(env,{actor:'roster-service',requestId:crypto.randomUUID(),command:p,needsContext:false,domainChanged:false,apply});
 const reserved=await mutate((state,ctx)=>{
  rosterDeliveryReviewRefresh_(state,p.monitor,[],ctx.now);const review=state.deliveryReview;review.reports||={};
  let report=Object.values(review.reports).filter(row=>row.status!=='done').sort((a,b)=>a.date.localeCompare(b.date))[0];
  if(!report){if(ctx.minute<480)return {deferred:'before-0800'};if(review.reports[ctx.today]?.status==='done')return {alreadyReported:true,date:ctx.today};const issues=structuredClone(review.issues);report=review.reports[ctx.today]={schema:1,date:ctx.today,status:'pending',capturedAt:ctx.iso,issues,count:issues.length};}
  if(report.claimExpiresAt>ctx.now)return {pending:1,busy:true,date:report.date};
  report.claimId=crypto.randomUUID();report.claimExpiresAt=ctx.now+600000;report.attempts=(report.attempts||0)+1;return {claim:structuredClone(report)};
 });
 if(!reserved.claim)return {...outcome,...reserved};const claim=reserved.claim,text=rosterDeliveryReviewReportText_(claim.issues,claim.capturedAt,claim.date),digest=sha256Hex(text),key='gsis/roster/delivery-reports/'+claim.date+'/'+digest+'.txt';
 try{
  const bucket=env.ROSTER_TIMETABLE_SNAPSHOTS;if(!bucket?.put||!bucket?.get)fail(503,'Private report storage is unavailable.');
  await bucket.put(key,text,{httpMetadata:{contentType:'text/plain; charset=UTF-8'},customMetadata:{digest,kind:'delivery-report'}});
  const saved=await bucket.get(key);if(!saved||sha256Hex(await saved.text())!==digest)fail(503,'Report verification failed.');
  return mutate((state,ctx)=>{
   const review=state.deliveryReview,current=review.reports[claim.date];if(current?.claimId!==claim.claimId)return {...outcome,date:claim.date,pending:1,busy:true};
   const live=new Map(rosterDeliveryReviewIssues_(state,review.monitor||[],review.issues||[]).map(issue=>[issue.id,issue]));review.reportedMonitor||={};let cleared=0;
   for(const issue of current.issues){const latest=live.get(issue.id),fingerprint=rosterOperationsDigest_(rosterDeliveryReviewMaterial_(issue));if(!latest||rosterOperationsDigest_(rosterDeliveryReviewMaterial_(latest))!==fingerprint)continue;
    if(issue.group==='delivery'){const row=state.outbox.find(row=>'notification:'+row.id===issue.id);if(!row||rosterDeliveryReviewRowFingerprint_(row)!==issue.deliveryFingerprint)continue;row.adminReviewReceipt={schema:1,fingerprint:issue.deliveryFingerprint,reportedAt:ctx.iso,reportDate:claim.date,reportObjectKey:key,reason:'Archived in the private daily report; delivery outcome unchanged'};for(const alert of state.smcAlerts||[])if(alert.notificationId===row.id||alert.key==='delivery:'+row.id){alert.closedAt=ctx.iso;alert.reviewedAt=ctx.iso;alert.reviewReason='Archived in the private daily report';}}
    else review.reportedMonitor[issue.id]=fingerprint;cleared++;
   }
   Object.assign(current,{status:'done',verifiedAt:ctx.iso,cleared,objectKey:key,contentDigest:digest});delete current.issues;delete current.claimId;delete current.claimExpiresAt;delete current.error;
   const completed=Object.keys(review.reports).filter(date=>review.reports[date].status==='done').sort();for(const date of completed.slice(0,-90))delete review.reports[date];rosterDeliveryReviewRefresh_(state,null,[],ctx.now);
   return {...outcome,date:claim.date,reported:1,cleared,url:'/api/whatsapp/reports/'+claim.date};
  });
 }catch{
  await mutate((state,ctx)=>{const report=state.deliveryReview.reports[claim.date];if(report?.claimId===claim.claimId){delete report.claimId;delete report.claimExpiresAt;report.error={code:'REPORT_ARCHIVE_UNCONFIRMED',at:ctx.iso};}return {recorded:true};});
  return {...outcome,date:claim.date,pending:1,diagnostic:{stage:'archive',code:'REPORT_ARCHIVE_UNCONFIRMED'},error:'The private delivery report is pending. The same snapshot will retry.'};
 }
}
