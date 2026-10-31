import {runRecoveryTimetableCleanup} from '../roster-update/public/roster-recovery-timetable-cache.js';
import {recordJobHealth,safeHealthError} from '../shared/edge-health.js';
import {assertRecoveryWritable} from '../shared/edge-recovery.js';
import {rosterRecoveryEnvironment} from '../shared/roster-recovery-profile.js';
import {readQuietMode} from '../shared/roster-quiet-mode.js';
// Test harnesses load this file with its imports removed; treat quiet mode as off there.
const quietMode=(db,at)=>typeof readQuietMode==='function'?readQuietMode(db,at):Promise.resolve({active:false});
import {dispatchNotifications,scheduledRoster,diagnoseNotificationConnections,dispatchInboxPending,dispatchWebhookJobs,dispatchReceivedReports,dispatchPeerMail,dispatchAllocationAudit} from '../roster-update/public/_worker.js';
/* GSIS_API_SECRET_BEGIN */
// First-party API credentials share one operator-selected setting. Browser
// sessions, private relief links and third-party credentials stay independent.
function gsisApiSecret(env,legacyName){
 const value=env?.GSIS_SECRET;
 if(value!==undefined||Object.prototype.hasOwnProperty.call(env||{},'GSIS_SECRET')){
  if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return env?.[legacyName];
}

/* GSIS_API_SECRET_END */
// v0.9.8: keep Google as Roster's record authority. D1 remains the durable
// transport inbox, and the original notification Queue is a wake-up mechanism.
// Existing send/automation/diagnostic/pause flags retain their meanings.
function writable(env){assertRecoveryWritable(env);}
function safeError(error){return safeHealthError(error);}
const summaryKeys=['quotaPending','quotaFallback','configured','enabled','idle','hasMore','claimed','sent','failed','uncertain','reviewedUncertain','cancelled','prepareFailures','resultFailures','batches','backendCalls','processed','pending','exported','queued','applied','deferred','scanned','deleted','protected','candidates','removed','completed','retried','parked','readyAt','pendingCaptureCount','pendingPeerCount','notificationsQueued','forwarded','needsReview','replies','alerts','retrying','blocked','unconfirmed'];
function safeSummary(result){
 const summary=Object.fromEntries(summaryKeys.filter(key=>typeof result?.[key]==='boolean'||Number.isFinite(result?.[key])&&result[key]>=0).map(key=>[key,result[key]]));
 // Received-report work reports its two processing stages separately. Retain
 // aggregate counters without persisting report identities or commands.
 if(result?.transport||result?.intake)for(const key of ['claimed','forwarded','applied','pending','deferred','needsReview','notificationsQueued']){
  const values=[result.transport?.[key],result.intake?.[key]].filter(value=>Number.isSafeInteger(value)&&value>=0&&value<=1e9);
  if(values.length)summary[key]=values.reduce((a,b)=>a+b,0);
 }
 return summary;
}
async function stage(env,job,event,work,{scheduledTime}={}){
 const startedAt=Date.now(),traceId=crypto.randomUUID();
 const record=async data=>{if(env.GSIS_JOBS?.prepare)try{await recordJobHealth(env,{job,traceId,startedAt,...data});}catch{console.error(JSON.stringify({event:'roster-health-record-failed',job,code:'UNAVAILABLE',traceId}));}};
 try{
  writable(env);const result=await work(),data=result?.data||result,summary=safeSummary(data);
  if(result?.ok===false||data?.failures?.length)throw Object.assign(Error('Job failed'),{...safeError(result),status:result.status});
  const measured=Object.entries(summary).filter(([key,value])=>typeof value==='number'&&!['readyAt','backendCalls','reviewedUncertain'].includes(key));
  const failed=!!(data?.quotaPending||data?.quotaFallback||data?.prepareFailures||data?.resultFailures||data?.failed||data?.uncertain||data?.unconfirmed||summary.needsReview||summary.deferred||summary.retrying||summary.blocked),idle=!data?.hasMore&&!data?.pending&&(data?.idle===true||data?.state==='idle'||measured.length>0&&measured.every(([,value])=>value===0));
  const status=failed?'failure':data?.configured===false||data?.enabled===false||data?.skipped===true?'skipped':idle?'idle':'success';
  const detail=failed&&data?.failure?safeError(data.failure):{},outcomeCode=data?.code?safeError(data).code:'UNKNOWN_ERROR';
  await record({status,...detail,code:failed?(detail.code&&detail.code!=='UNKNOWN_ERROR'?detail.code:'JOB_FAILED'):outcomeCode!=='UNKNOWN_ERROR'?outcomeCode:status==='idle'?'IDLE':status==='skipped'?'SKIPPED':'OK',finishedAt:Date.now(),counts:summary});
  if(event)console.info(JSON.stringify({event,...(scheduledTime?{scheduledTime}:{}),...summary,...detail}));
  return result;
 }catch(error){
  const safe=safeError(error),counts=safeSummary(error),blocked=['ABSENCE_INTAKE_PENDING','ABSENCE_TRANSPORT_PENDING'].includes(safe.code);
  await record({status:'failure',...safe,finishedAt:Date.now(),counts});
  console.error(JSON.stringify({event:event?event+(blocked?'-blocked':'-failed'):'roster-'+job+'-failed',job,...safe,...counts,traceId,...(scheduledTime?{scheduledTime}:{})}));
  return {stageFailed:true,...safe,...counts};
 }
}
function settleMessages(batch,messages,action,options){
 if(messages.every(message=>typeof message[action]==='function')){for(const message of messages)message[action](options);return;}
 if(messages.length===batch.messages.length)batch[action+'All'](options);
 // Real Queue messages have individual methods. A reduced host without them
 // must retain the whole mixed batch rather than acknowledge unsupported work.
 else if(action==='retry')batch.retryAll(options);
}
export default {
 async scheduled(event,env,ctx){
  env=rosterRecoveryEnvironment(env);
  ctx.waitUntil((async()=>{
   try{writable(env);}catch(error){console.error(JSON.stringify({event:'roster-scheduled-paused',...safeError(error)}));return;}
   if(env.WHATSAPP_DIAGNOSTICS_ENABLED==='true'){
    console.info(JSON.stringify({event:'roster-notification-connections',scheduledTime:event.scheduledTime,...await diagnoseNotificationConnections(env,event.scheduledTime)}));return;
   }
   const run=(job,name,work)=>stage(env,job,name,work,{scheduledTime:event.scheduledTime});
   // Assign Relief quiet mode pauses lock-heavy, deferrable work while SMCs allocate.
   const quiet=await quietMode(env.GSIS_JOBS,event.scheduledTime).catch(()=>({active:false}));
   // Daily private-cache pruning reads only bounded cache metadata and objects.
   // No timetable build or Google roster read runs in this maintenance lane.
   if(event.cron==='15 18 * * *'){
    await run('r2-cleanup','roster-r2-cleanup',()=>runRecoveryTimetableCleanup(env,{now:event.scheduledTime}));return;
   }
   // Separate execution from the critical minute lane: at most one retained day
   // per five-minute invocation, with backend notification and lock safeguards.
   if(event.cron==='2-57/5 * * * *'){
    if(quiet.active)return;
    await run('audit-export','roster-allocation-audit',()=>dispatchAllocationAudit(env));return;
   }
   const send=()=>run('notifications','roster-notification-dispatch',()=>dispatchNotifications(env));
   // Independent notice and human inbox work can progress during slow planning.
   // The backend still gates each affected date on all pending attendance.
   const received=run('received-reports','roster-received-report-drain',()=>dispatchReceivedReports(env));
   const notifications=send();
   const inbox=run('inbox','roster-inbox-dispatch',()=>dispatchInboxPending(env));
   const ingress=env.WHATSAPP_DURABLE_INGRESS==='true'?run('webhook','roster-webhook-drain',()=>dispatchWebhookJobs(env)):Promise.resolve();
   // Re-read quiet mode after the received-report drain: an SMC may have turned
   // it on while that drain was running. Jobs already started run to completion.
   const quietNow=()=>quietMode(env.GSIS_JOBS,Date.now()).then(q=>q.active).catch(()=>quiet.active);
   const peerMail=(async()=>{await received;return await quietNow()?null:run('peer-mail','roster-peer-mail-drain',()=>dispatchPeerMail(env));})();
   const planning=(async()=>{
    const receiptResult=await received;
    const result=await quietNow()?null:await run('allocation','roster-scheduled-cycle',()=>scheduledRoster(env,event.scheduledTime));
    // Reuse the same durable outbox. Never reconstruct or reset provider claims.
    if(result?.notificationsQueued>0||receiptResult?.intake?.notificationsQueued>0){await notifications;await send();}
   })();
   await Promise.all([received,notifications,inbox,ingress,peerMail,planning]);
  })());
 },
 async queue(batch,env){
  env=rosterRecoveryEnvironment(env);
  try{writable(env);}catch(error){console.error(JSON.stringify({event:'roster-queue-paused',...safeError(error)}));batch.retryAll({delaySeconds:300});return;}
  const supported=batch.messages.filter(message=>message.body?.purpose==='gsis-notification-wake-v1'),unsupported=batch.messages.filter(message=>message.body?.purpose!=='gsis-notification-wake-v1');
  if(unsupported.length){
   console.error(JSON.stringify({event:'roster-queue-unsupported-recovery-wake',code:'RECOVERY_UNSUPPORTED_WAKE',pending:unsupported.length}));
   // An old v0.9.7 background consumer may still be attached. Do not claim its
   // D1 jobs, erase their intents or report an acknowledgement as completed work.
   settleMessages(batch,unsupported,'retry',{delaySeconds:300});
  }
  if(!supported.length)return;
  const run=(job,work)=>stage(env,job,null,work);
  const received=await run('received-reports',()=>dispatchReceivedReports(env,{budgetMs:150000}));
  const result=await run('notifications',()=>dispatchNotifications(env,{budgetMs:240000}));
  const peer=(await quietMode(env.GSIS_JOBS).catch(()=>({active:false}))).active?{}:await run('peer-mail',()=>dispatchPeerMail(env));
  console.info(JSON.stringify({event:'roster-notification-queue',...safeSummary(result)}));
  if(received.stageFailed||result.stageFailed||peer.stageFailed||received.hasMore||received.transport?.pending||received.intake?.deferred||result.pending||result.prepareFailures||result.resultFailures||peer.pending||peer.failed||peer.blocked){
   const delaySeconds=Math.max(1,Math.min(900,Math.ceil(((received.hasMore?Date.now()+1000:result.readyAt||Date.now()+60000)-Date.now())/1000)));
   settleMessages(batch,supported,'retry',{delaySeconds});
  }else settleMessages(batch,supported,'ack');
 },
 async fetch(req,env){
  env=rosterRecoveryEnvironment(env);
  if(new URL(req.url).pathname!=='/dispatch'||req.method!=='POST')return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  try{writable(env);}catch{return Response.json({ok:false,error:'Background work is paused for recovery.'},{status:503,headers:{'Cache-Control':'no-store'}});}
  let serviceSecret;try{serviceSecret=gsisApiSecret(env,'ROSTER_SERVICE_SECRET');}catch(error){return Response.json({ok:false,code:error.code,error:error.message},{status:503,headers:{'Cache-Control':'no-store'}});}
  if(!env.NOTIFICATION_QUEUE||typeof serviceSecret!=='string'||serviceSecret.length<32)return Response.json({ok:false,error:'Immediate notification queue is not configured.'},{status:503});
  try{
   const text=await req.text();if(text.length>4096)throw Error();const envelope=JSON.parse(text);
   if(typeof envelope.payload!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature||''))throw Error();
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(serviceSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(envelope.signature.match(/../g),value=>parseInt(value,16)),new TextEncoder().encode(envelope.payload)))throw Error();
   const input=JSON.parse(envelope.payload);if(input.purpose!=='gsis-notification-wake-v1'||!Number.isFinite(input.timestamp)||Math.abs(Date.now()-input.timestamp)>120000||!/^[a-f0-9-]{36}$/i.test(input.nonce||''))throw Error();
   writable(env);await env.NOTIFICATION_QUEUE.send({purpose:'gsis-notification-wake-v1',id:input.nonce,queuedAt:Date.now()});
   return Response.json({ok:true,queued:true},{status:202,headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({ok:false,error:'Notification wake was not accepted.'},{status:403,headers:{'Cache-Control':'no-store'}});}
 }
};

