// GSiS Calendar Job Worker release 0.9.9; queue protocol unchanged.
/** Optional Calendar-only durable command service. D1 is a receipt/queue, Google is authoritative. */
const ACTIONS=new Set(['saveEvent','deleteEvent','saveParentSide','relocateEvent']);
const MAX_PAYLOAD=32000,MAX_PENDING=1000,MAX_ACTOR_PENDING=100,MAX_CHECKS=5,MAX_DISPATCHES=3;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PURPOSE='calendar-job-gateway-v1';

export default {
 async fetch(request,env){
  try{
   if(new URL(request.url).pathname==='/changes'&&request.method==='POST')return await calendarChangesRequest(request,env);
   if(new URL(request.url).pathname!=='/commands'||request.method!=='POST')return json({ok:false,error:'Not found.'},404);
   configured(env);
   const {actor,input}=await authenticate(request,env);
   if(input.kind==='enqueue')return json({ok:true,result:await enqueue(env,actor,input)},202);
   if(input.kind==='list'){
    exact(input,['kind']);
    const rows=await env.CALENDAR_JOBS_DB.prepare('SELECT * FROM calendar_jobs WHERE actor_key=? ORDER BY blocked DESC,created_at DESC LIMIT 150').bind(actorKey(actor)).all();
    return json({ok:true,result:{jobs:rows.results.map(publicJob)}});
   }
   if(['retry','check'].includes(input.kind))return json({ok:true,result:await recover(env,actor,input)},202);
   throw failure(400,'JOB_INPUT','Choose a supported Calendar job action.');
  }catch(error){return json({ok:false,error:error.message||'Calendar job service failed.',code:error.code||'JOB_TRANSPORT',definite:error.definite===true},error.status||503);}
 },
 async scheduled(_event,env){configured(env);await drain(env);if(calendarChangesEnabled(env))await calendarChangesDrain(env);if(env.CALENDAR_SYNC_CONTINUE==='true')await continueExistingSync(env);}
};

function secret(env){
 const value=env.GSIS_SECRET;
 if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))throw failure(503,'JOB_SETUP','Configure the existing GSIS_SECRET for Calendar jobs.');
 return value;
}
function configured(env){secret(env);if(!env.CALENDAR_JOBS_DB||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env.CALENDAR_APPS_SCRIPT_URL||''))throw failure(503,'JOB_SETUP','The isolated Calendar job service is not configured.');}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw failure(400,'JOB_INPUT','Unexpected Calendar job input.');}
function actorKey(actor){return actor.sub+'|'+actor.email;}
async function authenticate(request,env,purpose=PURPOSE){
 if(Number(request.headers.get('Content-Length')||0)>MAX_PAYLOAD+8000)throw failure(413,'JOB_INPUT','Calendar job request is too large.');
 const raw=await request.text();if(raw.length>MAX_PAYLOAD+8000)throw failure(413,'JOB_INPUT','Calendar job request is too large.');
 let envelope;try{envelope=JSON.parse(raw);}catch{throw failure(400,'JOB_INPUT','Invalid Calendar job request.');}
 exact(envelope,['payload','signature']);
 if(typeof envelope.payload!=='string'||envelope.payload.length>MAX_PAYLOAD+4000||!/^[a-f0-9]{64}$/.test(envelope.signature||''))throw failure(401,'JOB_AUTH','Invalid Calendar job signature.');
 if(!equal(envelope.signature,await hmac(envelope.payload,secret(env))))throw failure(401,'JOB_AUTH','Invalid Calendar job signature.');
 let signed;try{signed=JSON.parse(envelope.payload);}catch{throw failure(401,'JOB_AUTH','Invalid Calendar job envelope.');}
 exact(signed,['purpose','timestamp','nonce','actor','input']);
 if(signed.purpose!==purpose||!Number.isFinite(signed.timestamp)||Math.abs(Date.now()-signed.timestamp)>60000||!UUID.test(signed.nonce||''))throw failure(401,'JOB_AUTH','Calendar job signature expired or has an invalid purpose.');
 const actor=signed.actor;exact(actor,['sub','email','userAlias']);
 if(typeof actor.sub!=='string'||!actor.sub||actor.sub.length>200||typeof actor.email!=='string'||!/^[-a-z0-9._+]+@gsps\.edu\.sg$/.test(actor.email)||actor.userAlias!==actor.email.split('@')[0])throw failure(401,'JOB_AUTH','The original verified Calendar actor is required.');
 exact(signed.input,purpose===PURPOSE?['kind','action','payload','jobId','attemptOperationId']:['kind','action','intentId','outcome','year','cursor','sessionExpiresAt']);
 const nonce=await env.CALENDAR_JOBS_DB.prepare('INSERT OR IGNORE INTO calendar_job_nonces(nonce,created_at) VALUES(?,?)').bind(signed.nonce,Date.now()).run();
 if(!nonce.meta.changes)throw failure(409,'JOB_REPLAY','This Calendar service envelope was already consumed.');
 return {actor,input:signed.input};
}
function operation(input){
 exact(input,['kind','action','payload']);
 if(!ACTIONS.has(input.action))throw failure(400,'JOB_INPUT','Only individual Calendar event changes can be queued.');
 const payload=input.payload;
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>MAX_PAYLOAD||!UUID.test(payload.operationId||''))throw failure(400,'JOB_INPUT','A bounded Calendar proposal and operation ID are required.');
 const id=String(input.action==='saveEvent'?payload.event?.EventID||'':payload.eventId||'');
 if(id.length>150||(!id&&input.action!=='saveEvent'))throw failure(400,'JOB_INPUT','A valid Calendar event identity is required.');
 if(input.action==='saveEvent'&&(!payload.event||!Number.isInteger(payload.event.Year)||payload.event.Year<2000||payload.event.Year>2099))throw failure(400,'JOB_INPUT','Choose a valid Calendar year.');
 return {id,payload};
}
async function enqueue(env,actor,input){
 const {id,payload}=operation(input),db=env.CALENDAR_JOBS_DB,hash=await digest(JSON.stringify({actor,action:input.action,payload}));
 const prior=await db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').bind(payload.operationId).first();
 if(prior){if(prior.actor_key!==actorKey(actor)||prior.payload_hash!==hash)throw failure(409,'JOB_MISMATCH','Calendar job identity does not match the accepted proposal.');return publicJob(prior);}
 // D1 acknowledges capture only. Google rechecks authority and all event
 // fences during execute; a queued proposal is never a saved event.
 const now=Date.now(),eventKey=id?'event:'+id:'new:'+payload.operationId;
 try{
  const result=await db.prepare(`INSERT INTO calendar_jobs(job_id,actor_key,actor_json,action,payload_json,payload_hash,event_key,year,state,attempt_operation_id,next_at,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,'QUEUED',?,?,?,? WHERE (SELECT COUNT(*) FROM calendar_jobs WHERE blocked=1)<? AND (SELECT COUNT(*) FROM calendar_jobs WHERE actor_key=? AND blocked=1)<?`)
   .bind(payload.operationId,actorKey(actor),JSON.stringify(actor),input.action,JSON.stringify(payload),hash,eventKey,Number(payload.event?.Year||payload.year||0),payload.operationId,now,now,now,MAX_PENDING,actorKey(actor),MAX_ACTOR_PENDING).run();
  if(!result.meta.changes)throw failure(429,'JOB_CAPACITY','The Calendar queue is full. Existing proposals are retained; try again after they finish.');
 }catch(error){
  if(error.code==='JOB_CAPACITY')throw error;
  const raced=await db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').bind(payload.operationId).first();
  if(raced&&raced.actor_key===actorKey(actor)&&raced.payload_hash===hash)return publicJob(raced);
  const blocked=await db.prepare('SELECT job_id FROM calendar_jobs WHERE event_key=? AND blocked=1').bind(eventKey).first();
  if(blocked)throw failure(409,'EVENT_PENDING','This event already has an unresolved Calendar change. Check its job before editing it again.');
  throw error;
 }
 return publicJob(await db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').bind(payload.operationId).first());
}
async function recover(env,actor,input){
 exact(input,['kind','jobId','attemptOperationId']);
 if(!UUID.test(input.jobId||'')||!UUID.test(input.attemptOperationId||''))throw failure(400,'JOB_INPUT','A Calendar job and exact attempt identity are required.');
 const db=env.CALENDAR_JOBS_DB,row=await db.prepare('SELECT * FROM calendar_jobs WHERE job_id=? AND actor_key=?').bind(input.jobId,actorKey(actor)).first();
 if(!row)throw failure(404,'JOB_GONE','Calendar job not found.');
 if(row.attempt_operation_id!==input.attemptOperationId||row.state!=='NEEDS_ATTENTION')throw failure(409,'JOB_CHANGED','The Calendar job changed. Check its current status.');
 if(input.kind==='retry'&&(row.outcome!=='NOT_SAVED'||row.dispatches>=MAX_DISPATCHES))throw failure(409,'JOB_REVIEW','Only a confirmed not-saved attempt can be retried. Review this proposal before creating another change.');
 const nextId=input.kind==='retry'?crypto.randomUUID():row.attempt_operation_id;
 try{
  const changed=await db.prepare(`UPDATE calendar_jobs SET state=?,blocked=1,attempt_operation_id=?,checks=0,next_at=?,lease_until=0,lease_token=NULL,updated_at=? WHERE job_id=? AND attempt_operation_id=? AND state='NEEDS_ATTENTION'`)
   .bind(input.kind==='retry'?'QUEUED':'CHECKING',nextId,Date.now(),Date.now(),row.job_id,row.attempt_operation_id).run();
  if(!changed.meta.changes)throw failure(409,'JOB_CHANGED','The Calendar job changed. Check its current status.');
 }catch(error){if(error.code==='JOB_CHANGED')throw error;throw failure(409,'EVENT_PENDING','Another change for this event is already pending.');}
 return publicJob(await db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').bind(row.job_id).first());
}
async function drain(env){
 const db=env.CALENDAR_JOBS_DB,now=Date.now();
 await db.prepare('DELETE FROM calendar_job_nonces WHERE created_at<?').bind(now-180000).run();
 // Unresolved commands are never expired or silently dropped.
 if(!calendarChangesEnabled(env))await db.prepare("DELETE FROM calendar_jobs WHERE blocked=0 AND updated_at<?").bind(now-30*86400000).run();
 else await db.prepare("DELETE FROM calendar_jobs WHERE blocked=0 AND updated_at<? AND EXISTS(SELECT 1 FROM calendar_change_job_checkpoints c WHERE c.job_id=calendar_jobs.job_id AND c.stamp=CAST(calendar_jobs.updated_at AS TEXT)||':'||calendar_jobs.state||':'||calendar_jobs.attempt_operation_id)").bind(now-30*86400000).run();
 const candidates=await db.prepare("SELECT job_id FROM calendar_jobs WHERE state IN ('QUEUED','RUNNING','CHECKING') AND next_at<=? AND lease_until<=? ORDER BY created_at LIMIT 5").bind(now,now).all();
 for(const candidate of candidates.results){
  const token=crypto.randomUUID(),claimed=await db.prepare(`UPDATE calendar_jobs SET dispatches=dispatches+CASE WHEN state='QUEUED' THEN 1 ELSE 0 END,checks=checks+CASE WHEN state='QUEUED' THEN 0 ELSE 1 END,state=CASE WHEN state='QUEUED' THEN 'RUNNING' ELSE 'CHECKING' END,lease_token=?,lease_until=?,updated_at=?
   WHERE job_id=? AND state IN ('QUEUED','RUNNING','CHECKING') AND next_at<=? AND lease_until<=? RETURNING *`).bind(token,Date.now()+90000,Date.now(),candidate.job_id,Date.now(),Date.now()).first();
  if(claimed)await processJob(env,claimed,token);
 }
}
async function checkpoint(env,row,token,state,outcome,blocked,result,error){
 await env.CALENDAR_JOBS_DB.prepare(`UPDATE calendar_jobs SET state=?,outcome=?,blocked=?,result_json=?,error_json=?,dispatches=?,checks=?,next_at=?,lease_until=0,lease_token=NULL,updated_at=? WHERE job_id=? AND lease_token=?`)
  .bind(state,outcome,blocked,result?JSON.stringify(result):null,error?JSON.stringify(error):null,row.dispatches,row.checks,Date.now()+15000,Date.now(),row.job_id,token).run();
}
async function processJob(env,row,token){
 const actor=JSON.parse(row.actor_json),payload={...JSON.parse(row.payload_json),operationId:row.attempt_operation_id};
 const checking=row.state==='CHECKING';
 try{
  const result=await backend(env,actor,row.action,payload,row.attempt_operation_id,checking?'status':'execute');
  if(!checking){validateResult(row.action,result);await checkpoint(env,row,token,'SAVED','SAVED',0,result,null);return;}
  if(result.state==='SAVED'){validateResult(row.action,result.result);await checkpoint(env,row,token,'SAVED','SAVED',0,result.result,null);return;}
  if(result.state==='REJECTED'){await checkpoint(env,row,token,'NEEDS_ATTENTION','REJECTED',0,null,result.error||{message:'The proposal was rejected.'});return;}
  if(result.state==='NOT_SAVED'){await checkpoint(env,row,token,'NEEDS_ATTENTION','NOT_SAVED',0,null,{message:'This exact attempt was confirmed not saved. The proposal is retained.'});return;}
  throw failure(503,'UNKNOWN','Google has not confirmed this exact save.');
 }catch(error){
  // An execution denial is definite. A status denial cannot prove a prior write failed.
  if(!checking&&error.definite){await checkpoint(env,row,token,'NEEDS_ATTENTION','REJECTED',0,null,detail(error));return;}
  await checkpoint(env,row,token,row.checks>=MAX_CHECKS?'NEEDS_ATTENTION':'CHECKING','UNKNOWN',1,null,detail(error));
 }
}
function validateResult(action,result){if(action==='deleteEvent'?(!result?.deleted||!result.eventId):(!result?.EventID||!result?._revision||!Number(result.Year)))throw failure(503,'UNKNOWN','Google returned an incomplete save receipt.');}
async function backend(env,actor,action,payload,commandId,mode){
 const body={proxySecret:secret(env),purpose:'calendar-mutation-job-v1',service:'gsis-calendar-command-v1',action:'calendarCommand',mode,actor,commandId,operation:{action,payload},requestId:crypto.randomUUID()};
 const result=await callBackend(env,body);
 if(mode==='authorize'&&result?.authorized!==true)throw failure(503,'UNKNOWN','Calendar did not authorize the command.');
 return result;
}
async function continueExistingSync(env){
 const db=env.CALENDAR_JOBS_DB,now=Date.now();
 await db.prepare("INSERT OR IGNORE INTO calendar_job_maintenance(id,lease_until) VALUES('sync',0)").run();
 const claimed=await db.prepare("UPDATE calendar_job_maintenance SET lease_until=? WHERE id='sync' AND lease_until<=? RETURNING id").bind(now+120000,now).first();
 if(!claimed)return;
 try{
  // The backend chooses the retained session and its original Admin, checks
  // authority and its durable provider claim, and honors its quota deadline.
  const result=await callBackend(env,{proxySecret:secret(env),calendarServiceSecret:secret(env),service:'gsis-calendar-sync-worker-v1',action:'calendarSyncContinue',requestId:crypto.randomUUID()});
  const retry=Math.min(86400000,Math.max(60000,Number(result?.retryAfterMs)||0));
  await db.prepare("UPDATE calendar_job_maintenance SET lease_until=? WHERE id='sync' AND lease_until=?").bind(Date.now()+retry,now+120000).run();
 }catch(error){
  // A lost response leaves the backend session/claim intact. Retry the bounded
  // continuation service only after the maintenance lease, never provider work.
  throw error;
 }
}
async function callBackend(env,body){
 const first=await fetch(env.CALENDAR_APPS_SCRIPT_URL,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
 let response=first;
 if(first.status>=300&&first.status<400){
  const location=first.headers.get('Location');
  if(!location||!/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(location))throw failure(503,'UNKNOWN','The Calendar result redirect could not be verified.');
  response=await fetch(location,{method:'GET',redirect:'follow',headers:{Accept:'application/json'},signal:AbortSignal.timeout(35000)});
 }
 let data;try{data=await response.json();}catch{throw failure(503,'UNKNOWN','Calendar returned an invalid result.');}
 if(data?.ok===false)throw Object.assign(failure(Number(data.status)||502,data.code||'BACKEND_ERROR',data.error||'Calendar rejected the request.'),{definite:data.definite===true,current:data.current||null});
 if(!response.ok||data?.ok!==true||!Object.hasOwn(data,'result'))throw failure(503,'UNKNOWN','Calendar did not confirm an outcome.');
 return data.result;
}
function publicJob(row){return {jobId:row.job_id,action:row.action,payload:JSON.parse(row.payload_json),state:row.state,outcome:row.outcome,blocked:!!row.blocked,attemptOperationId:row.attempt_operation_id,attempts:row.dispatches,checks:row.checks,createdAt:row.created_at,updatedAt:row.updated_at,result:row.result_json?JSON.parse(row.result_json):null,error:row.error_json?JSON.parse(row.error_json):null,canRetry:row.state==='NEEDS_ATTENTION'&&row.outcome==='NOT_SAVED'&&row.dispatches<MAX_DISPATCHES,canCheck:row.state==='NEEDS_ATTENTION'&&row.outcome==='UNKNOWN'};}
function detail(error){return {code:error.code||'JOB_TRANSPORT',message:error.message||'The Calendar save outcome is not confirmed.',current:error.current||null};}
function failure(status,code,message){return Object.assign(Error(message),{status,code,definite:[400,401,403,404,409,413,429].includes(status)});}
function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function hmac(value,key){const imported=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',imported,new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<b.length;i++)diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);return diff===0;}

// Optional notification journal. Google remains the data/permission authority.
// Invalidation is deliberately distinct from a verified event commit or job status.
const CHANGE_PURPOSE='calendar-change-gateway-v1',CHANGE_HISTORY_MS=7*86400000,CHANGE_RETRY_MS=[60000,600000,3600000];
function calendarChangesEnabled(env){return env.CALENDAR_CHANGE_PUSH==='true'&&!!env.CALENDAR_CHANGE_HUB?.get;}
function calendarChangesConfigured(env){configured(env);if(!calendarChangesEnabled(env))throw failure(503,'CHANGE_DISABLED','Calendar change push is not enabled. Existing queued saves remain available.');}
function calendarChangeYear(value){const year=Number(value);if(!Number.isInteger(year)||year<2000||year>2099)throw failure(400,'CHANGE_INPUT','A valid Calendar year is required.');return year;}
async function calendarChangesRequest(request,env){
 calendarChangesConfigured(env);
 const {actor,input}=await authenticate(request,env,CHANGE_PURPOSE),db=env.CALENDAR_JOBS_DB,now=Date.now();
 if(input.kind==='begin'){
  exact(input,['kind','intentId','action','year']);
  if(!UUID.test(input.intentId||'')||typeof input.action!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,59}$/.test(input.action))throw failure(400,'CHANGE_INPUT','A bounded source-change identity is required.');
  const year=input.year===0?0:calendarChangeYear(input.year),key=await digest(actorKey(actor));
  const prior=await db.prepare('SELECT * FROM calendar_change_intents WHERE intent_id=?').bind(input.intentId).first();
  if(prior){if(prior.actor_key!==key||prior.action!==input.action||prior.year!==year)throw failure(409,'CHANGE_MISMATCH','Source-change identity does not match the accepted intent.');return json({ok:true,result:{intentId:input.intentId}},202);}
  const added=await db.prepare("INSERT OR IGNORE INTO calendar_change_intents(intent_id,actor_key,action,year,state,created_at,updated_at,next_at) SELECT ?,?,?,?,'PENDING',?,?,? WHERE (SELECT COUNT(*) FROM calendar_change_intents WHERE state IN ('PENDING','REVIEW'))<10000 AND (SELECT COUNT(*) FROM calendar_change_journal WHERE delivered=0)<10000").bind(input.intentId,key,input.action,year,now,now,now+CHANGE_RETRY_MS[0]).run();
  if(!added.meta.changes){
   const raced=await db.prepare('SELECT * FROM calendar_change_intents WHERE intent_id=?').bind(input.intentId).first();
   if(raced&&raced.actor_key===key&&raced.action===input.action&&raced.year===year)return json({ok:true,result:{intentId:input.intentId}},202);
   if(raced)throw failure(409,'CHANGE_MISMATCH','Source-change identity does not match the accepted intent.');
   throw failure(429,'CHANGE_CAPACITY','Calendar change tracking is full. No source write was forwarded; resolve retained intents first.');
  }
  return json({ok:true,result:{intentId:input.intentId}},202);
 }
 if(input.kind==='finish'){
  exact(input,['kind','intentId','outcome']);
  if(!UUID.test(input.intentId||'')||!['changed','no-change','unknown'].includes(input.outcome))throw failure(400,'CHANGE_INPUT','Choose a source-change outcome.');
  const intent=await db.prepare('SELECT * FROM calendar_change_intents WHERE intent_id=? AND actor_key=?').bind(input.intentId,await digest(actorKey(actor))).first();
  if(!intent)throw failure(404,'CHANGE_GONE','Source-change intent not found.');
  if(input.outcome==='no-change')await db.prepare("UPDATE calendar_change_intents SET state='NO_CHANGE',updated_at=? WHERE intent_id=? AND state='PENDING' AND checks=0").bind(now,intent.intent_id).run();
  if(input.outcome==='changed'){
   // A source response confirms completion but generic invalidation makes no
   // claim about event/provider commit proof or a committed-data revision.
   await calendarChangeAppend(env,{sourceId:'intent:'+intent.intent_id,kind:intent.action==='saveUser'?'permissions':'invalidate',year:intent.year});
   await db.prepare("UPDATE calendar_change_intents SET state='ACKNOWLEDGED',updated_at=? WHERE intent_id=?").bind(now,intent.intent_id).run();
  }
  // UNKNOWN retains the original durable intent. Cron reconciles with bounded
  // hints, then retains REVIEW indefinitely rather than guessing completion.
  await calendarChangeWake(env);
  return json({ok:true,result:{intentId:intent.intent_id,outcome:input.outcome}},202);
 }
 if(['replay','subscribe'].includes(input.kind)){
  exact(input,['kind','year','cursor','sessionExpiresAt']);const year=calendarChangeYear(input.year);
  if(!Number.isSafeInteger(input.cursor)||input.cursor<0)throw failure(400,'CHANGE_CURSOR','A valid change cursor is required.');
  const allowed=await callBackend(env,{proxySecret:secret(env),actor,action:'calendarChangesAuthorize',payload:{year},requestId:crypto.randomUUID()});
  if(allowed?.authorized!==true||allowed.year!==year)throw failure(403,'CHANGE_FORBIDDEN','This Calendar year is not available to your account.');
  if(input.kind==='subscribe'&&(!Number.isFinite(input.sessionExpiresAt)||input.sessionExpiresAt<=Date.now()))throw failure(401,'CHANGE_AUTH','Calendar session expired.');
  const subscription={actorKey:await digest(actorKey(actor)),year,cursor:input.cursor,expiresAt:Math.min(now+5*60000,input.sessionExpiresAt||now+5*60000),access:{userAlias:actor.userAlias,isAdmin:allowed.roles?.isAdmin===true,isParentPublisher:allowed.roles?.isParentPublisher===true}};
  if(input.kind==='replay')return json({ok:true,result:await calendarChangeReplay(env,subscription)});
  return calendarChangeHubCall(env,'connect',subscription);
 }
 throw failure(400,'CHANGE_INPUT','Choose a supported Calendar change action.');
}
async function calendarChangeAppend(env,{sourceId,kind,year=0,actorKey:privateActor=''}){
 const db=env.CALENDAR_JOBS_DB,now=Date.now();
 // D1 batch is transactional: identity, cursor, journal and high-water advance
 // together. Retried delivery after a lost response reuses this identity.
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO calendar_change_journal(source_id,kind,actor_key,year,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM calendar_change_dedupe WHERE source_id=?) AND (SELECT COUNT(*) FROM calendar_change_journal WHERE delivered=0)<10000').bind(sourceId,kind,privateActor,year,now,sourceId),
  db.prepare('INSERT OR IGNORE INTO calendar_change_dedupe(source_id,cursor,created_at) SELECT source_id,cursor,created_at FROM calendar_change_journal WHERE source_id=?').bind(sourceId),
  db.prepare('UPDATE calendar_change_head SET cursor=MAX(cursor,COALESCE((SELECT MAX(cursor) FROM calendar_change_journal),0)) WHERE id=1')
 ]);
 if(!await db.prepare('SELECT cursor FROM calendar_change_dedupe WHERE source_id=?').bind(sourceId).first())throw failure(429,'CHANGE_CAPACITY','Calendar notification capacity reached. The original intent is retained for recovery.');
}
async function calendarChangeReplay(env,subscription){
 const db=env.CALENDAR_JOBS_DB,head=await db.prepare('SELECT cursor,floor FROM calendar_change_head WHERE id=1').first();
 if(!head)throw failure(503,'CHANGE_SCHEMA','Apply the optional Calendar change-awareness migration first.');
 const from=Number(subscription.cursor),snapshotRequired=from<head.floor||from>head.cursor;
 const rows=snapshotRequired?[]:(await db.prepare("SELECT cursor,source_id,kind,year FROM calendar_change_journal WHERE cursor>? AND cursor<=? AND (actor_key='' OR actor_key=?) AND (year=0 OR year=?) ORDER BY cursor LIMIT 201").bind(from,head.cursor,subscription.actorKey,subscription.year).all()).results;
 const after=await db.prepare('SELECT cursor,floor FROM calendar_change_head WHERE id=1').first();
 // A concurrent prune between the head and row reads cannot turn a missed
 // entry into an empty successful replay. Catch up from the current source.
 if(from<after.floor||from>after.cursor)return {cursor:after.cursor,snapshotRequired:true,entries:[]};
 if(rows.length>200)return {cursor:head.cursor,snapshotRequired:true,entries:[]};
 return {cursor:head.cursor,snapshotRequired,entries:rows.map(row=>({cursor:row.cursor,kind:row.kind,year:row.year})),coverage:'supported-pages-writes',externalEdits:false};
}
async function calendarChangeHubCall(env,action,body){
 const payload=JSON.stringify({action,...body,timestamp:Date.now()});
 const stub=env.CALENDAR_CHANGE_HUB.get(env.CALENDAR_CHANGE_HUB.idFromName('calendar-school'));
 return stub.fetch(new Request('https://calendar-change.internal/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Calendar-Change-Signature':await hmac(payload,secret(env))},body:payload}));
}
async function calendarChangeWake(env){
 const head=await env.CALENDAR_JOBS_DB.prepare('SELECT MAX(cursor) cursor FROM calendar_change_journal WHERE delivered=0').first();
 if(!head?.cursor)return;
 try{
  const response=await calendarChangeHubCall(env,'wake',{cursor:head.cursor});
  if(!response.ok)throw Error('Calendar push wake was not acknowledged.');
  await env.CALENDAR_JOBS_DB.prepare('UPDATE calendar_change_journal SET delivered=1 WHERE cursor<=?').bind(head.cursor).run();
 }catch(error){console.error('Calendar push wake retained for retry: '+String(error.message||error));}
}
async function calendarChangesDrain(env){
 // Deliver existing backlog first: capacity backpressure must never prevent
 // the wake whose acknowledgement frees notification capacity.
 await calendarChangeWake(env);
 const db=env.CALENDAR_JOBS_DB,now=Date.now();
 const intents=await db.prepare("SELECT * FROM calendar_change_intents WHERE state='PENDING' AND next_at<=? ORDER BY created_at LIMIT 20").bind(now).all();
 for(const intent of intents.results){
  await calendarChangeAppend(env,{sourceId:'uncertain:'+intent.intent_id+':'+intent.checks,kind:intent.action==='saveUser'?'permissions':'reconcile',year:intent.year});
  const checks=intent.checks+1;
  await db.prepare('UPDATE calendar_change_intents SET state=?,checks=?,next_at=?,updated_at=? WHERE intent_id=? AND checks=? AND state=\'PENDING\'').bind(checks>=CHANGE_RETRY_MS.length?'REVIEW':'PENDING',checks,now+(CHANGE_RETRY_MS[checks]||0),now,intent.intent_id,intent.checks).run();
 }
 // The accepted job is the durable pre-write intent. A SAVED checkpoint was
 // produced only by execution/repair of that exact source mutation receipt.
 // Neither the journal nor a wake can execute or retry a Google mutation.
 const jobs=await db.prepare("SELECT j.* FROM calendar_jobs j LEFT JOIN calendar_change_job_checkpoints c ON c.job_id=j.job_id WHERE c.stamp IS NULL OR c.stamp<>CAST(j.updated_at AS TEXT)||':'||j.state||':'||j.attempt_operation_id ORDER BY j.updated_at LIMIT 30").all();
 for(const job of jobs.results){
  const stamp=job.updated_at+':'+job.state+':'+job.attempt_operation_id;
  await calendarChangeAppend(env,{sourceId:'job:'+job.job_id+':'+stamp,kind:'job',actorKey:await digest(job.actor_key)});
  if(job.state==='SAVED')await calendarChangeAppend(env,{sourceId:'commit:'+job.attempt_operation_id,kind:'committed',year:0});
  await db.prepare('INSERT INTO calendar_change_job_checkpoints(job_id,stamp,updated_at) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET stamp=excluded.stamp,updated_at=excluded.updated_at').bind(job.job_id,stamp,now).run();
 }
 await calendarChangeWake(env);
 // Never prune undelivered signals or unresolved intents. A durable floor
 // makes missed retained history an explicit scoped snapshot requirement.
 await db.batch([
  db.prepare('UPDATE calendar_change_head SET floor=MAX(floor,COALESCE((SELECT MAX(cursor) FROM calendar_change_journal WHERE delivered=1 AND (created_at<? OR cursor<=(SELECT cursor-5000 FROM calendar_change_head WHERE id=1))),0)) WHERE id=1').bind(now-CHANGE_HISTORY_MS),
  db.prepare('DELETE FROM calendar_change_journal WHERE delivered=1 AND cursor<=(SELECT floor FROM calendar_change_head WHERE id=1)'),
  db.prepare("DELETE FROM calendar_change_intents WHERE state IN ('ACKNOWLEDGED','NO_CHANGE') AND updated_at<?").bind(now-30*86400000),
  db.prepare('DELETE FROM calendar_change_dedupe WHERE created_at<? AND source_id NOT IN (SELECT source_id FROM calendar_change_journal)').bind(now-31*86400000)
 ]);
}

/** One optional SQLite Durable Object, using hibernating WebSockets.
 * Socket attachments survive eviction. No browser/server heartbeat timer.
 * A single alarm expires authority; reconnect must recheck Google permissions.
 */
export class CalendarChangeHub {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  try{
   const raw=await request.text();if(raw.length>2000||!equal(request.headers.get('X-Calendar-Change-Signature')||'',await hmac(raw,secret(this.env))))return json({ok:false},401);
   const input=JSON.parse(raw);if(Math.abs(Date.now()-input.timestamp)>60000)return json({ok:false},401);
   if(input.action==='wake'){
    // Serialize replay with subscription establishment, including its high-water
    // read, so a concurrent wake cannot fall between replay and registration.
    return await this.ctx.blockConcurrencyWhile(async()=>{for(const socket of this.ctx.getWebSockets())await this.send(socket);return json({ok:true});});
   }
   if(input.action!=='connect'||!input.actorKey||!Number.isInteger(input.year)||input.expiresAt<=Date.now())return json({ok:false},400);
   return await this.ctx.blockConcurrencyWhile(async()=>{
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    server.serializeAttachment({actorKey:input.actorKey,year:input.year,cursor:input.cursor,expiresAt:input.expiresAt,access:input.access});
    this.ctx.acceptWebSocket(server);
    await this.send(server);
    await this.expiryAlarm();
    return new Response(null,{status:101,webSocket:client});
   });
  }catch(error){return json({ok:false,error:'Calendar change stream unavailable.'},503);}
 }
 async send(socket){
  if(socket.readyState>=2)return;
  let subscription;try{subscription=socket.deserializeAttachment();}catch{try{socket.close(1011,'Calendar stream interrupted');}catch{}return;}
  if(!subscription||subscription.expiresAt<=Date.now()){socket.close(4401,'Calendar permission renewal required');return;}
  const replay=await calendarChangeReplay(this.env,subscription);
  try{socket.send(JSON.stringify({type:'changes',...replay,access:subscription.access}));}catch{try{socket.close(1011,'Calendar stream interrupted');}catch{}return;}
  // cursor is last sent, not an application acknowledgement. The reconnecting
  // client supplies only its last applied cursor, so a lost update is replayed.
  subscription.cursor=replay.cursor;try{socket.serializeAttachment(subscription);}catch{try{socket.close(1011,'Calendar stream interrupted');}catch{}return;}
  if(replay.entries.some(entry=>entry.kind==='permissions'))socket.close(4401,'Calendar permissions changed');
 }
 async expiryAlarm(){const times=this.ctx.getWebSockets().filter(s=>!(s.readyState>=2)).map(s=>s.deserializeAttachment()?.expiresAt).filter(Number.isFinite);if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();}
 async alarm(){for(const socket of this.ctx.getWebSockets()){const value=socket.deserializeAttachment();if(!value||value.expiresAt<=Date.now())socket.close(4401,'Calendar permission renewal required');}await this.expiryAlarm();}
 async webSocketMessage(socket){socket.close(1008,'Calendar stream is receive-only');}
 async webSocketClose(socket,code){socket.close(code||1000);await this.expiryAlarm();}
 async webSocketError(socket){socket.close(1011,'Calendar stream interrupted');}
}
