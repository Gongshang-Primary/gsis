import {sha256Hex} from './edge-deploy-sha256.js';
/* Worker notification orchestration. All domain/claim changes use the same
 * authoritative Roster D1 CAS; provider calls are never inside a transaction. */
import {loadEdgeRoster,mutateEdgeRoster,buildEdgeRosterContext} from './edge-roster.js';
import {GSISRosterOperations,GSISRosterInbox,GSiSEdgeNotifications} from './edge-roster-domain.js';
import {edgeInboundMessage} from './edge-whatsapp-inbound.js';
const transportOps=new Set(['claimNotifications','prepareNotification','prepareNotifications','notificationResult','notificationResults','notificationDelivery','notificationDeliveryBatch']);
const inboxOps={inboxIngest:'ingest',inboxReplyPrepare:'prepare',inboxReplyResult:'replyResult',inboxDelivery:'delivery',inboxAlertPrepare:'alertPrepare',inboxAlertResult:'alertResult',inboxPendingDispatch:'pending'};
const receiptOps=new Set(['notificationResult','notificationResults','notificationDelivery','notificationDeliveryBatch','inboxReplyResult','inboxAlertResult','inboxDelivery','inboundReplyResult','settlePeerMail','settleEmploymentMail']);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const clone=value=>JSON.parse(JSON.stringify(value));
const service=(env,input,apply,needsContext=true)=>mutateEdgeRoster(env,{actor:'roster-service',requestId:crypto.randomUUID(),command:input,needsContext,domainChanged:false,allowDuringQuiesce:receiptOps.has(input.operation),apply});
// Match the retry/normalization rules in GSiSEdgeNotifications.retry. Completed
// failures still need work if their durable escalation has never been recorded.
const notificationNonRetryable=`(${['MISSING_OR_INVALID_TEMPLATE_FIELD','NOTIFICATION_CONTENT_EXCEEDS','INVALID_TEMPLATE','TEMPLATE_CONTRACT','FINAL_RUN','STALE_COUNTDOWN','STALE_TIMETABLE','INVALID_OR_EXPIRED_NOTIFICATION'].map(prefix=>`COALESCE(json_extract(r.value_json,'$.error'),'') GLOB '${prefix}*'`).join(' OR ')} OR COALESCE(COALESCE(json_extract(r.value_json,'$.providerError.code'),CASE WHEN json_extract(r.value_json,'$.error') GLOB 'META_[0-9]*' AND substr(json_extract(r.value_json,'$.error'),6) NOT GLOB '*[^0-9]*' THEN CAST(substr(json_extract(r.value_json,'$.error'),6) AS INTEGER) END) IN (100,131008,131009,132000,132001,132005,132007,132012,132015,132016,132018),0))`;
const notificationFailureWork=`(COALESCE(json_extract(r.value_json,'$.status'),'') NOT IN ('failed','uncertain')
 OR json_extract(r.value_json,'$.deliveryStatus') IN ('delivered','read')
 OR (json_extract(r.value_json,'$.status')='failed' AND (
  (${notificationNonRetryable} AND (json_type(r.value_json,'$.retryable') IS NOT 'false' OR COALESCE(json_extract(r.value_json,'$.nextAttemptAt'),0)<>0))
  OR (NOT ${notificationNonRetryable} AND json_type(r.value_json,'$.retryable') IS NOT 'false' AND json_extract(r.value_json,'$.attempts')>0 AND json_extract(r.value_json,'$.attempts')<3 AND json_extract(r.value_json,'$.expiresAt')>?)))
 OR ((json_extract(r.value_json,'$.status')='uncertain' OR (json_extract(r.value_json,'$.status')='failed' AND (json_type(r.value_json,'$.retryable')='false' OR json_extract(r.value_json,'$.attempts')>=3 OR COALESCE(json_extract(r.value_json,'$.mobile'),'')='' OR json_extract(r.value_json,'$.expiresAt')<=?)))
  AND NOT EXISTS(SELECT 1 FROM gsis_edge_records alert WHERE alert.scope='roster' AND alert.collection='smcAlerts' AND alert.record_id<>'$' AND json_extract(alert.value_json,'$.key')='delivery:'||json_extract(r.value_json,'$.id'))))`;
// These primary reads are only an idle shortcut. A positive result still uses
// the existing guarded claim, current Contacts and send/settlement protocol.
// Include recovery/maintenance candidates, not just immediately sendable rows.
const peerMailToken=row=>sha256Hex(JSON.stringify(GSiSEdgeNotifications.peerMailReviewFields(row)));
const peerMailEvidenceSql="json_array(1,"+['id','requestId','recipientId','recipientName','date','email','fingerprint','status'].map(key=>"json_extract(r.value_json,'$."+key+"')").join(',')+","+[['claimId',"''"],['claimExpiresAt','0'],['preparedAt','0'],['acceptedAt',"''"],['completedAt',"''"],['attempts','0'],['error',"''"]].map(([key,fallback])=>"COALESCE(json_extract(r.value_json,'$."+key+"'),"+fallback+")").join(',')+")";
const peerMailObservedSql=`json_extract(r.value_json,'$.healthReceipt.schema')=1 AND length(json_extract(r.value_json,'$.healthReceipt.fingerprint'))=64 AND json_extract(r.value_json,'$.healthReceipt.evidence')=${peerMailEvidenceSql}`;
const peerMailReviewedSql=`(${peerMailObservedSql}) AND json_extract(r.value_json,'$.reviewReceipt.schema')=1 AND json_extract(r.value_json,'$.reviewReceipt.fingerprint')=json_extract(r.value_json,'$.healthReceipt.fingerprint')`;
async function edgeDispatchProbe(env,kind,date){
 const db=env.GSIS_JOBS;if(!db?.prepare)fail(503,'The operational D1 binding is required.');
 const connection=typeof db.withSession==='function'?db.withSession('first-primary'):db;
 // Separate EXISTS branches let SQLite select each matching partial index.
 // Keep these predicates aligned with the additive indexes in edge-store.js.
 const pending={
  notifications:[`r.collection='outbox' AND (COALESCE(json_extract(r.value_json,'$.status'),'') NOT IN ('sent','cancelled','superseded','expired') OR (json_extract(r.value_json,'$.deliveryStatus') IN ('delivered','read') AND json_extract(r.value_json,'$.status')<>'sent')) AND ${notificationFailureWork}`,`r.collection='notificationTransport' AND r.record_id='key:unmatchedDeliveryEvents' AND json_array_length(r.value_json)>0`],
  inbox:[`r.collection='inboxMessages' AND json_extract(r.value_json,'$.direction')='outbound' AND json_extract(r.value_json,'$.status') IN ('queued','sending')`,`r.collection='inboxAlerts' AND json_extract(r.value_json,'$.status') IN ('queued','sending')`,`r.collection='inbox' AND r.record_id IN ('key:messages','key:alerts') AND json_array_length(r.value_json)>0`],
  peerMail:[`r.collection='peerMail' AND COALESCE(json_extract(r.value_json,'$.status'),'') NOT IN ('sent','cancelled')
   AND (COALESCE(json_extract(r.value_json,'$.status'),'')<>'uncertain' OR NOT COALESCE((${peerMailObservedSql}),0) OR NOT COALESCE((${peerMailReviewedSql}),0) AND NOT EXISTS(SELECT 1 FROM gsis_edge_records alert WHERE alert.scope='roster' AND alert.collection='smcAlerts' AND alert.record_id<>'$' AND json_extract(alert.value_json,'$.key')='delivery:peer-mail:'||json_extract(r.value_json,'$.id') AND json_extract(alert.value_json,'$.status')='open' AND json_extract(alert.value_json,'$.summary')='Email delivery for the peer arrangement proposed to '||COALESCE(json_extract(r.value_json,'$.recipientName'),'undefined')||' is unconfirmed. Check with the colleague before sending again. The absence remains recorded.'))`,
   // Pending proposals still require current Contacts to discover changed addresses.
   `r.collection='requests' AND json_extract(r.value_json,'$.status')='pending' AND CAST(json_extract(r.value_json,'$.expiresAt') AS REAL)>? AND json_extract(r.value_json,'$.date')>=?`,
   `r.collection='smcAlerts' AND json_extract(r.value_json,'$.status')='open' AND json_extract(r.value_json,'$.key') LIKE 'delivery:peer-mail:%'
    AND EXISTS(SELECT 1 FROM gsis_edge_records mail WHERE mail.scope='roster' AND mail.collection='peerMail' AND mail.record_id='id:'||substr(json_extract(r.value_json,'$.key'),length('delivery:peer-mail:')+1) AND (json_extract(mail.value_json,'$.status') IN ('sent','cancelled') OR json_extract(mail.value_json,'$.reviewReceipt.schema')=1 AND json_extract(mail.value_json,'$.reviewReceipt.fingerprint')=json_extract(mail.value_json,'$.healthReceipt.fingerprint')))`],
  employmentMail:[`r.collection='dailyEmploymentMail' AND json_extract(r.value_json,'$.status') IN ('queued','sending') AND ((json_extract(r.value_json,'$.status')='queued' AND json_extract(r.value_json,'$.date')<=?) OR (json_extract(r.value_json,'$.status')='sending' AND json_extract(r.value_json,'$.claimedAt')<?))`]
 };
 let predicate,args=[];
 if(kind==='deliveryReview'){
  if(!/^20\d\d-\d\d-\d\d$/.test(date||''))fail(400,'A report date is required.');
  predicate=`NOT EXISTS (SELECT 1 FROM gsis_edge_records r WHERE r.scope='roster' AND r.collection='deliveryReview' AND r.record_id='key:reports' AND json_extract(r.value_json,?)='done' AND NOT EXISTS (SELECT 1 FROM json_each(r.value_json) report WHERE COALESCE(json_extract(report.value,'$.status'),'')<>'done'))`;args=['$."'+date+'".status'];
 }else{
  if(!Object.hasOwn(pending,kind))fail(400,'Unknown dispatch queue.');
  if(kind==='notifications'){const now=Date.now();args=[now,now];}
  if(kind==='employmentMail'){const now=Date.now();args=[new Date(now+28800000).toISOString().slice(0,10),new Date(now-600000).toISOString()];}
  if(kind==='peerMail'){const now=Date.now();args=[now,new Date(now+28800000).toISOString().slice(0,10)];}
  predicate=pending[kind].map(where=>`EXISTS (SELECT 1 FROM gsis_edge_records r WHERE r.scope='roster' AND r.record_id<>'$' AND ${where})`).join(' OR ');
 }
 const row=await connection.prepare(`SELECT mode,${predicate} AS has_work FROM gsis_edge_heads WHERE scope='roster'`).bind(...args).first();
 if(row?.mode!=='active')fail(503,'Roster migration is not active. Complete the verified cutover before accepting changes.');
 return row;
}
export async function edgeDispatchHasWork(env,kind,date){return (await edgeDispatchProbe(env,kind,date)).has_work!==0;}
function contacts(ctx){return {...ctx.contacts,rosterPeople:ctx.people,rosterSMCIds:ctx.smcIds,rosterAdminIds:ctx.adminIds,rosterUrgentSMCIds:ctx.urgentSMCIds,timetableEntries:ctx.timetableEntries};}
function inboxContext(state,ctx,serviceMode){
 if(!serviceMode&&!ctx.user?.smc&&!ctx.user?.admin)fail(403,'SMC or Admin access is required.');
 return {...ctx,user:serviceMode?null:ctx.user,service:serviceMode,currentDutyIds:ctx.people?GSISRosterOperations.dutySMC(state,ctx,ctx.today):[],uuid:()=>crypto.randomUUID(),digest:ctx.digest||(value=>sha256Hex(JSON.stringify(value)))};
}
export function supportsEdgeNotificationOperation(op){return transportOps.has(op)||!!inboxOps[op]||['inboundMessage','inboundReplyResult'].includes(op);}
export async function edgeNotificationService(env,input){
 if(!supportsEdgeNotificationOperation(input.operation))return null;
 return service(env,input,(state,ctx)=>{
  if(transportOps.has(input.operation))return GSiSEdgeNotifications.transport(state,input,contacts(ctx),ctx.now);
  if(inboxOps[input.operation]){const inbox=GSISRosterInbox.validate(GSiSEdgeNotifications.inboxState(state)),result=GSISRosterInbox[inboxOps[input.operation]](inbox,inboxContext(state,ctx,true),input);GSiSEdgeNotifications.packInbox(state,inbox);return result;}
  if(input.operation==='inboundMessage')return edgeInboundMessage(state,{...ctx,service:true,inboxMode:input.inboxMode===true,urgentSMCIds:input.inboxMode?GSISRosterOperations.dutySMC(state,ctx,ctx.today):ctx.urgentSMCIds,uuid:()=>crypto.randomUUID()},input);
  const event=state.inboundEvents.find(row=>row.id===input.receiptId&&row.replyClaimId===input.replyClaimId);
  if(!event)fail(409,'Incoming reply claim changed.');
  if(!['sent','failed','uncertain'].includes(input.state))fail(400,'Invalid reply status.');
  if(event.replyStatus==='sending'){event.replyStatus=input.state;event.replyMessageId=String(input.messageId||'').slice(0,300);event.replyRecordedAt=ctx.iso;}
  return {recorded:true};
 },!receiptOps.has(input.operation));
}
export async function edgeInboxBackend(env,input,who){
 const reads={inboxList:'list',inboxThread:'thread',inboxMediaAuthorize:'media'};
 if(![...Object.keys(reads),'inboxTemplates','inboxAssign','inboxSetHandled','inboxReply'].includes(input.operation))return null;
 if(reads[input.operation]||input.operation==='inboxTemplates'){
  const loaded=await loadEdgeRoster(env,{includeInbox:true}),ctx=inboxContext(loaded.state,await buildEdgeRosterContext(env,loaded.state,input,who),false);
  if(input.operation==='inboxTemplates')return {authorized:true};
  return GSISRosterInbox[reads[input.operation]](GSISRosterInbox.validate(GSiSEdgeNotifications.inboxState(loaded.state)),ctx,input);
 }
 const saved=await mutateEdgeRoster(env,{actor:who.email,requestId:crypto.randomUUID(),command:input,who,domainChanged:false,apply(state,ctx){
  const inbox=GSISRosterInbox.validate(GSiSEdgeNotifications.inboxState(state)),context=inboxContext(state,ctx,false),result=GSISRosterInbox.mutation(inbox,context,input);GSiSEdgeNotifications.packInbox(state,inbox);
  return result.receiptMissing?result:{...result,...GSISRosterInbox.thread(inbox,context,{waId:input.waId,limit:100}),affectedDomains:['inbox'],affectedDates:[]};
 }});return {...saved,requestId:input.requestId};
}
// Per-phone reservations are atomic SQL, independent of the business revision.
// Concurrent batches therefore do not contend with mission-critical attendance.
const senderReady=new WeakMap();
export const WHATSAPP_SENDER_SCHEMA_SQL=[
 'CREATE TABLE IF NOT EXISTS gsis_whatsapp_sender (phone_id TEXT PRIMARY KEY,next_at INTEGER NOT NULL DEFAULT 0,cooldown_until INTEGER NOT NULL DEFAULT 0,reservation_id TEXT)',
 'CREATE TABLE IF NOT EXISTS gsis_whatsapp_recipient_pacing (phone_id TEXT NOT NULL,mobile TEXT NOT NULL,next_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(phone_id,mobile))',
 'CREATE INDEX IF NOT EXISTS gsis_whatsapp_recipient_expiry ON gsis_whatsapp_recipient_pacing(next_at)'
];
async function senderDatabase(env){
 const db=env.GSIS_JOBS;if(!db?.batch||!/^\d{5,30}$/.test(env.WHATSAPP_PHONE_NUMBER_ID||''))fail(503,'Shared WhatsApp pacing storage is unavailable.');
 if(!senderReady.has(db))senderReady.set(db,db.batch(WHATSAPP_SENDER_SCHEMA_SQL.map(sql=>db.prepare(sql))).then(results=>{if(results.some(result=>result.success===false))throw Error('Pacing schema unavailable.');}).catch(error=>{senderReady.delete(db);throw error;}));
 await senderReady.get(db);return db;
}
export async function reserveEdgeWhatsAppSend(env,mobile){
 if(!/^\d{8,15}$/.test(mobile||''))fail(400,'Invalid sender recipient.');
 const db=await senderDatabase(env),phone=env.WHATSAPP_PHONE_NUMBER_ID,now=Date.now(),interval=Math.ceil(1000/Math.max(1,Math.min(20,Number(env.WHATSAPP_SENDS_PER_SECOND)||12))),id=crypto.randomUUID();
 const rows=await db.batch([
  db.prepare('INSERT OR IGNORE INTO gsis_whatsapp_sender(phone_id) VALUES(?)').bind(phone),
  db.prepare('INSERT OR IGNORE INTO gsis_whatsapp_recipient_pacing(phone_id,mobile) VALUES(?,?)').bind(phone,mobile),
  db.prepare('UPDATE gsis_whatsapp_sender SET next_at=MAX(?,next_at,(SELECT next_at FROM gsis_whatsapp_recipient_pacing WHERE phone_id=? AND mobile=?))+?,reservation_id=? WHERE phone_id=? AND cooldown_until<=? AND MAX(?,next_at,(SELECT next_at FROM gsis_whatsapp_recipient_pacing WHERE phone_id=? AND mobile=?))<=? RETURNING next_at-? AS launch_at').bind(now,phone,mobile,interval,id,phone,now,now,phone,mobile,now+30000,interval),
  db.prepare('UPDATE gsis_whatsapp_recipient_pacing SET next_at=(SELECT next_at FROM gsis_whatsapp_sender WHERE phone_id=?)-?+6000 WHERE phone_id=? AND mobile=? AND EXISTS(SELECT 1 FROM gsis_whatsapp_sender WHERE phone_id=? AND reservation_id=?)').bind(phone,interval,phone,mobile,phone,id),
  db.prepare('SELECT MAX(cooldown_until,next_at,(SELECT next_at FROM gsis_whatsapp_recipient_pacing WHERE phone_id=? AND mobile=?)) AS ready_at FROM gsis_whatsapp_sender WHERE phone_id=?').bind(phone,mobile,phone)
 ]);
 if(rows.some(row=>row.success===false))fail(503,'Sender reservation could not be confirmed.');const at=rows[2].results?.[0]?.launch_at;
 return Number.isFinite(at)?{reserved:true,at}:{reserved:false,readyAt:rows[4].results?.[0]?.ready_at||now+60000};
}
export async function recordEdgeWhatsAppThrottle(env,retryAfterMs){
 const db=await senderDatabase(env),until=Date.now()+Math.max(1000,Math.min(900000,Number(retryAfterMs)||60000));
 const result=await db.prepare('INSERT INTO gsis_whatsapp_sender(phone_id,cooldown_until) VALUES(?,?) ON CONFLICT(phone_id) DO UPDATE SET cooldown_until=MAX(cooldown_until,excluded.cooldown_until)').bind(env.WHATSAPP_PHONE_NUMBER_ID,until).run();
 if(result.success===false)fail(503,'Sender cooldown could not be confirmed.');return {recorded:true,readyAt:until};
}
export async function dispatchEdgePeerMail(env,sendMail){
 const summary={sent:0,uncertain:0,reviewedUncertain:0,newUncertain:0,blocked:0,cancelled:0,pending:0},origin=String(env.ROSTER_PUBLIC_ORIGIN||'').replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i.test(origin))return {...summary,blocked:1,reason:'Configure ROSTER_PUBLIC_ORIGIN.'};
 // Idle counters describe this invocation. Cumulative queue counts are returned
 // by the existing claim path only when a drain actually examines that queue.
 const readiness=await edgeDispatchProbe(env,'peerMail');if(readiness.has_work===0)return summary;
 for(let count=0;count<6;count++){
  const claim=await service(env,{operation:'claimPeerMail'},(state,ctx)=>{
   GSiSEdgeNotifications.peerMailSync(state,state,ctx.people,ctx.now,peerMailToken);const row=state.peerMail.find(r=>r.status==='queued');
   if(!row)return {job:null,newUncertain:GSiSEdgeNotifications.peerMailHealth(state.peerMail,peerMailToken),counts:GSiSEdgeNotifications.peerMailCounts(state.peerMail,peerMailToken),pending:state.peerMail.filter(r=>['queued','blocked','sending'].includes(r.status)).length};
   const request=state.requests.find(r=>r.id===row.requestId);row.status='sending';row.preparedAt=ctx.now;row.claimId=crypto.randomUUID();row.claimExpiresAt=ctx.now+600000;row.attempts++;row.error='';
   return {job:clone(row),mail:GSiSEdgeNotifications.peerMailMessage(request,origin,row.email)};
  });
  if(!claim.job)return {...summary,...claim.counts,newUncertain:summary.newUncertain+claim.newUncertain,pending:claim.pending};
  const job=claim.job;
  const prepared=await service(env,{operation:'preparePeerMail',id:job.id,claimId:job.claimId},(state,ctx)=>{
   const row=(state.peerMail||[]).find(r=>r.id===job.id&&r.claimId===job.claimId);if(!row||row.status!=='sending'||row.launchAuthorizedAt)return {send:false};
   const request=state.requests.find(r=>r.id===row.requestId),person=ctx.people.find(p=>String(p.id)===String(row.recipientId));
   if(!GSiSEdgeNotifications.peerMailPending(request,ctx.now)||row.fingerprint!==GSiSEdgeNotifications.peerMailFingerprint(request)||!GSiSEdgeNotifications.peerMailAddresses(person).includes(row.email)){row.status='cancelled';row.error='The proposal or authorised recipient changed before submission.';return {send:false};}
   row.launchAuthorizedAt=ctx.now;return {send:true};
  });
  if(!prepared.send){summary.cancelled++;continue;}
  let status='uncertain',error='Email acceptance was not confirmed. Check with the recipient before sending again.';
  // At-most-once submission by the persisted claim. Even a transport timeout is
  // settled as uncertain, never a reason to call MailApp a second time.
  try{const result=await sendMail({operation:'sendEdgeMail',id:job.id,claimId:job.claimId,mail:claim.mail});if(result.ok&&result.data?.accepted===true){status='sent';error='';}else if(result.ok&&result.data?.notSent===true){status='blocked';error='Email service is unavailable; no message was sent.';}}catch{}
  const settled=await service(env,{operation:'settlePeerMail'},(state,ctx)=>{
   const row=(state.peerMail||[]).find(r=>r.id===job.id&&r.claimId===job.claimId);if(!row)fail(409,'Peer email claim changed.');
   if(row.status!=='sent'&&['sending','uncertain'].includes(row.status)){row.status=status;row.error=error;row.completedAt=ctx.iso;if(status==='blocked')delete row.launchAuthorizedAt;if(status==='sent')row.acceptedAt=ctx.iso;GSiSEdgeNotifications.peerMailAlert(state,row,state,ctx.now,peerMailToken);}
   return {recorded:true,newUncertain:GSiSEdgeNotifications.peerMailHealth(state.peerMail,peerMailToken)};
  },false);summary[status]++;summary.newUncertain+=settled.newUncertain;
 }
 return {...summary,pending:1};
}
export async function dispatchEdgeEmploymentMail(env,sendMail){
 const outcome={sent:0,failed:0,uncertain:0,blocked:0,cancelled:0},origin=String(env.ROSTER_PUBLIC_ORIGIN||'').replace(/\/$/,'');
 if(!/^https:\/\/[^\s/?#]+$/.test(origin))return {...outcome,blocked:1,reason:'Configure ROSTER_PUBLIC_ORIGIN.'};
 if(!await edgeDispatchHasWork(env,'employmentMail'))return outcome;
 for(let count=0;count<5;count++){
  const claim=await service(env,{operation:'claimEmploymentMail'},(state,ctx)=>{
   const addresses=new Set(ctx.people.filter(p=>p.active===true).flatMap(p=>[p.email,p.cesEmail,...(p.emails||[])]).filter(Boolean).map(value=>String(value).trim().toLowerCase()));
   let cancelled=0,uncertain=0;
   for(const row of (state.dailyEmploymentMail||[]).filter(row=>row.status==='queued'&&row.date<ctx.today).slice(0,50)){
    row.status='cancelled';row.error='STALE_BACKLOG: date passed before D1 dispatch was fixed';row.completedAt=ctx.iso;cancelled++;
   }
   for(const row of (state.dailyEmploymentMail||[]).filter(row=>row.status==='sending'&&ctx.now-Date.parse(row.claimedAt)>600000).slice(0,50)){
    row.status='uncertain';row.error='Email acceptance was not confirmed. Check the mailbox before sending again.';uncertain++;
   }
   const job=(state.dailyEmploymentMail||[]).find(row=>row.status==='queued'&&row.date===ctx.today);if(!job)return {job:null,cancelled,uncertain};
   const snapshot=state.dailyEmploymentSnapshots.find(row=>row.date===job.date);
   if(!snapshot){job.status='failed';job.error='The original report snapshot is unavailable.';job.completedAt=ctx.iso;return {failed:true,cancelled,uncertain};}
   if(!addresses.has(job.to)){job.status='blocked';job.error='The selected email is no longer in Contacts.';return {blocked:true,cancelled,uncertain};}
   if(state.dailyEmploymentMail.some(row=>row!==job&&row.date===job.date&&row.key===job.key&&row.to===job.to&&['sending','sent','uncertain'].includes(row.status))){
    job.status='cancelled';job.error='This report identity already has a delivery attempt. Check its recorded outcome.';job.completedAt=ctx.iso;return {cancelled:cancelled+1,uncertain,skip:true};
   }
   let content;try{content=GSISRosterOperations.employmentEmail(snapshot,origin);}catch{job.status='failed';job.error='The original report snapshot could not be read.';job.completedAt=ctx.iso;return {failed:true,cancelled,uncertain};}
   job.status='sending';job.claimId=crypto.randomUUID();job.claimedAt=ctx.iso;return {job:clone(job),cancelled,uncertain,mail:{to:job.to,subject:job.subject,...content,name:'GSiS Roster'}};
  });
  outcome.cancelled+=claim.cancelled||0;outcome.uncertain+=claim.uncertain||0;
  if(claim.failed){outcome.failed++;continue;}if(claim.blocked){outcome.blocked++;continue;}if(claim.skip)continue;if(!claim.job)return outcome;
  let status='uncertain',error='Email acceptance was not confirmed. Check the mailbox before sending again.',notSent=false;
  try{const result=await sendMail({operation:'sendEdgeMail',id:claim.job.id,claimId:claim.job.claimId,mail:claim.mail});if(result.ok&&result.data?.accepted===true){status='sent';error='';}else if(result.ok&&result.data?.notSent===true){status='queued';notSent=true;error='Email service is unavailable; no message was sent.';}}catch{}
  await service(env,{operation:'settleEmploymentMail'},(state,ctx)=>{const row=state.dailyEmploymentMail.find(row=>row.id===claim.job.id&&row.claimId===claim.job.claimId);if(!row)fail(409,'Email claim changed.');if(['sending','uncertain'].includes(row.status)){row.status=status;row.error=error;if(status==='sent')row.sentAt=ctx.iso;}return {recorded:true};},false);
  if(notSent)return {...outcome,blocked:outcome.blocked+1,pending:1};outcome[status]++;
 }
 return outcome;
}
