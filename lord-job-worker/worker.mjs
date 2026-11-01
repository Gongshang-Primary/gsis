/** LORD phase 1. D1 owns new queue/receipt/status/audit data; Google owns existing preference decisions. */
const PURPOSE='lord-job-gateway-v1',UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const OPEN="'QUEUED','RUNNING','CHECKING','UNCERTAIN'",DAY=86400000;
export default {
 async fetch(request,env){
  try{
   if(new URL(request.url).pathname!=='/commands'||request.method!=='POST')return json({ok:false,error:'Not found.'},404);
   configured(env);const {actor,input}=await authenticate(request,env);
   if(input.kind==='enqueue')return json({ok:true,result:await enqueue(env,actor,input)},202);
   if(input.kind==='list'){
    exact(input,['kind','cursor']);if(input.cursor!==undefined&&!/^[1-9]\d{0,15}$/.test(input.cursor))throw fail(400,'INPUT','Invalid status cursor.');
    const rows=(await env.LORD_JOBS_DB.prepare('SELECT rowid AS cursor,* FROM lord_jobs WHERE actor_key=? AND rowid<? ORDER BY rowid DESC LIMIT 101').bind(actorKey(actor),Number(input.cursor||Number.MAX_SAFE_INTEGER)).all()).results;
    return json({ok:true,result:{jobs:rows.slice(0,100).map(publicJob),nextCursor:rows.length>100?String(rows[99].cursor):null}});
   }
   if(input.kind==='status'||input.kind==='check'){
    exact(input,['kind','jobId']);validId(input.jobId);
    let row=await env.LORD_JOBS_DB.prepare('SELECT * FROM lord_jobs WHERE job_id=? AND actor_key=?').bind(input.jobId,actorKey(actor)).first();
    if(!row)throw fail(404,'NOT_FOUND','LORD job not found.');
    if(input.kind==='check'){
     // Explicit reads may inspect an uncertain receipt; they cannot execute a write.
     if(row.state!=='UNCERTAIN')throw fail(409,'CHANGED','Check the current job status.');
     await env.LORD_JOBS_DB.prepare("UPDATE lord_jobs SET state='CHECKING',checks=0,next_at=0,history_json=json_insert(CASE WHEN json_array_length(history_json)>=12 THEN json_remove(history_json,'$[0]') ELSE history_json END,'$[#]',json_object('state','CHECKING','at',?)),version=version+1,updated_at=? WHERE job_id=? AND state='UNCERTAIN'").bind(Date.now(),Date.now(),row.job_id).run();
     row=await env.LORD_JOBS_DB.prepare('SELECT * FROM lord_jobs WHERE job_id=?').bind(row.job_id).first();
    }
    return json({ok:true,result:publicJob(row)},input.kind==='check'?202:200);
   }
   throw fail(400,'INPUT','Unsupported LORD queue command.');
  }catch(error){return json({ok:false,code:error.code||'QUEUE_UNAVAILABLE',error:error.code?error.message:'LORD queue outcome is uncertain. Check or retry the SAME operation identity.',definite:error.definite===true},error.status||503);}
 },
 async scheduled(_event,env){configured(env);await maintain(env);if(env.LORD_QUEUE_DISPATCH==='true')await drain(env);await backup(env);}
};
function secret(env){if(typeof env.GSIS_SECRET!=='string'||!/^[!-~]{32,8000}$/.test(env.GSIS_SECRET))throw fail(503,'SETUP','Configure the existing GSIS_SECRET.');return env.GSIS_SECRET;}
function configured(env){secret(env);if(!env.LORD_JOBS_DB||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.LORD_BACKEND_URL||''))throw fail(503,'SETUP','Configure the dedicated LORD jobs D1 and backend.');}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw fail(400,'INPUT','Unexpected LORD queue input.');}
function actorKey(actor){return JSON.stringify([actor.sub,actor.email]);}
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function validId(id){if(typeof id!=='string'||!/^\d{13}-/.test(id)||!UUID.test(id.slice(14)))throw fail(400,'INPUT','An issued timestamp and UUID operation identity are required.');}
async function authenticate(request,env){
 if(Number(request.headers.get('Content-Length')||0)>12000)throw fail(413,'INPUT','LORD queue request is too large.');
 const raw=await request.text();if(new TextEncoder().encode(raw).length>12000)throw fail(413,'INPUT','LORD queue request is too large.');
 let envelope;try{envelope=JSON.parse(raw);}catch{throw fail(400,'INPUT','Invalid JSON.');}exact(envelope,['payload','signature']);
 if(typeof envelope.payload!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature||'')||!equal(envelope.signature,await hmac(envelope.payload,secret(env))))throw fail(401,'AUTH','Invalid LORD queue signature.');
 let signed;try{signed=JSON.parse(envelope.payload);}catch{throw fail(401,'AUTH','Invalid signed input.');}exact(signed,['purpose','timestamp','nonce','actor','input']);
 if(signed.purpose!==PURPOSE||!Number.isFinite(signed.timestamp)||Math.abs(Date.now()-signed.timestamp)>60000||!UUID.test(signed.nonce||''))throw fail(401,'AUTH','Expired or invalid LORD queue envelope.');
 exact(signed.actor,['sub','email']);const a=signed.actor;
 if(typeof a.sub!=='string'||!a.sub||a.sub.length>200||typeof a.email!=='string'||!/^[-a-z0-9._+]+@gsps\.edu\.sg$/.test(a.email))throw fail(401,'AUTH','A verified school actor is required.');
 exact(signed.input,['kind','jobId','action','payload','cursor']);
 const now=Date.now();
 await env.LORD_JOBS_DB.prepare('DELETE FROM lord_job_nonces WHERE created_at<?').bind(now-180000).run();
 const consumed=await env.LORD_JOBS_DB.prepare('INSERT OR IGNORE INTO lord_job_nonces(nonce,created_at) SELECT ?,? WHERE (SELECT COUNT(*) FROM lord_job_nonces)<10000').bind(signed.nonce,now).run();
 if(!consumed.meta.changes){
  if(await env.LORD_JOBS_DB.prepare('SELECT nonce FROM lord_job_nonces WHERE nonce=?').bind(signed.nonce).first())throw fail(409,'REPLAY','Service envelope already consumed.');
  throw fail(429,'CAPACITY','LORD replay journal is full. Retry the same operation later.');
 }
 return {actor:a,input:signed.input};
}
async function enqueue(env,actor,input){
 exact(input,['kind','jobId','action','payload']);validId(input.jobId);
 if(input.action!=='notificationPreferences')throw fail(400,'UNSUPPORTED','This LORD action is not available in queue phase 1.');
 exact(input.payload,['enabled','consentConfirmed','expectedRevision']);
 if(typeof input.payload.enabled!=='boolean'||typeof input.payload.consentConfirmed!=='boolean'||typeof input.payload.expectedRevision!=='string'||!input.payload.expectedRevision||input.payload.expectedRevision.length>150||/[\x00-\x1f]/.test(input.payload.expectedRevision))throw fail(400,'INPUT','Choose a notification preference and explicit consent value.');
 const db=env.LORD_JOBS_DB,hash=await digest(canonical({actor,action:input.action,payload:input.payload}));
 const existing=await db.prepare('SELECT * FROM lord_jobs WHERE job_id=?').bind(input.jobId).first();
 function replay(row){if(row.actor_key!==actorKey(actor)||row.payload_hash!==hash)throw fail(409,'MISMATCH','Operation identity belongs to different details.');return publicJob(row);}
 if(existing)return replay(existing);
 if(env.LORD_QUEUE_ENABLED!=='true')throw fail(503,'DISABLED','LORD queue admission is paused.');
 if(Math.abs(Date.now()-Number(input.jobId.slice(0,13)))>DAY)throw fail(409,'EXPIRED','This operation is too old for new admission. Reconcile its original receipt.');
 // Session-bound admission is local: Google authorization/revision checks run only at execution.
 const now=Date.now();
 try{
  const inserted=await db.prepare(`INSERT INTO lord_jobs(job_id,actor_key,actor_json,action,payload_json,payload_hash,state,history_json,created_at,updated_at)
   SELECT ?,?,?,?,?,?,'QUEUED',?,?,? WHERE (SELECT COUNT(*) FROM lord_jobs)<5000 AND (SELECT COUNT(*) FROM lord_jobs WHERE state IN (${OPEN}))<1000 AND (SELECT COUNT(*) FROM lord_jobs WHERE actor_key=? AND state IN (${OPEN}))<20`)
   .bind(input.jobId,actorKey(actor),canonical(actor),input.action,canonical(input.payload),hash,JSON.stringify([{state:'QUEUED',at:now}]),now,now,actorKey(actor)).run();
  if(!inserted.meta.changes)throw fail(429,'CAPACITY','LORD queue is full. Existing jobs are retained.');
 }catch(error){
  const raced=await db.prepare('SELECT * FROM lord_jobs WHERE job_id=?').bind(input.jobId).first();if(raced)return replay(raced);
  if(error.code==='CAPACITY')throw error;
  if(await db.prepare(`SELECT job_id FROM lord_jobs WHERE actor_key=? AND action=? AND state IN (${OPEN})`).bind(actorKey(actor),input.action).first())throw fail(409,'PENDING','An earlier preference operation needs an outcome first.');
  throw error;
 }
 return publicJob(await db.prepare('SELECT * FROM lord_jobs WHERE job_id=?').bind(input.jobId).first());
}
async function maintain(env){
 const db=env.LORD_JOBS_DB,now=Date.now();
 await db.prepare('DELETE FROM lord_job_nonces WHERE created_at<?').bind(now-180000).run();
 await db.prepare("DELETE FROM lord_jobs WHERE state IN ('APPLIED','REJECTED') AND updated_at<? AND backup_version=version").bind(now-30*DAY).run();
}
async function drain(env){
 const db=env.LORD_JOBS_DB,now=Date.now();
 const rows=(await db.prepare("SELECT job_id FROM lord_jobs WHERE state IN ('QUEUED','RUNNING','CHECKING') AND next_at<=? AND lease_until<=? ORDER BY created_at LIMIT 5").bind(now,now).all()).results;
 for(const candidate of rows){
  const token=crypto.randomUUID();
  const row=await db.prepare("UPDATE lord_jobs SET history_json=json_insert(CASE WHEN json_array_length(history_json)>=12 THEN json_remove(history_json,'$[0]') ELSE history_json END,'$[#]',json_object('state',CASE WHEN state='QUEUED' THEN 'RUNNING' ELSE 'CHECKING' END,'at',?)),state=CASE WHEN state='QUEUED' THEN 'RUNNING' ELSE 'CHECKING' END,lease_token=?,lease_until=?,version=version+1,updated_at=? WHERE job_id=? AND state IN ('QUEUED','RUNNING','CHECKING') AND lease_until<=? AND next_at<=? RETURNING *").bind(now,token,now+120000,now,candidate.job_id,now,now).first();
  if(!row)continue;
  try{
   const result=await backend(env,{mode:row.state==='RUNNING'?'execute':'status',actor:JSON.parse(row.actor_json),jobId:row.job_id,payloadHash:row.payload_hash,operation:{action:row.action,payload:JSON.parse(row.payload_json)}});
   if(result.state!=='APPLIED'||result.jobId!==row.job_id||result.payloadHash!==row.payload_hash||typeof result.result?.enabled!=='boolean')throw fail(503,'UNKNOWN','Google has not confirmed this exact operation.');
   await checkpoint(env,row,token,'APPLIED',result,null);
  }catch(error){
   const rejected=row.state==='RUNNING'&&error.definite===true;
   await checkpoint(env,row,token,rejected?'REJECTED':row.checks>=4?'UNCERTAIN':'CHECKING',null,{code:error.code||'UNKNOWN',message:error.code?error.message:'Google outcome is not confirmed.'});
  }
 }
}
async function checkpoint(env,row,token,state,receipt,error){
 const now=Date.now(),history=JSON.parse(row.history_json);history.push({state,at:now});
 await env.LORD_JOBS_DB.prepare('UPDATE lord_jobs SET state=?,receipt_json=?,error_json=?,history_json=?,checks=checks+1,next_at=?,lease_until=0,lease_token=NULL,version=version+1,updated_at=? WHERE job_id=? AND lease_token=?')
  .bind(state,receipt?JSON.stringify(receipt):null,error?JSON.stringify(error):null,JSON.stringify(history.slice(-12)),now+15000,now,row.job_id,token).run();
}
async function backup(env){
 const db=env.LORD_JOBS_DB,now=Date.now();
 const rows=(await db.prepare('SELECT job_id FROM lord_jobs WHERE backup_version<version AND backup_until<=? ORDER BY updated_at LIMIT 10').bind(now).all()).results;
 for(const item of rows){
  const token=crypto.randomUUID();
  const row=await db.prepare('UPDATE lord_jobs SET backup_token=?,backup_until=? WHERE job_id=? AND backup_version<version AND backup_until<=? RETURNING *').bind(token,now+120000,item.job_id,now).first();if(!row)continue;
  const record={schema:1,authority:'D1',jobId:row.job_id,version:row.version,actor:JSON.parse(row.actor_json),action:row.action,payload:JSON.parse(row.payload_json),payloadHash:row.payload_hash,state:row.state,receipt:row.receipt_json?JSON.parse(row.receipt_json):null,error:row.error_json?JSON.parse(row.error_json):null,history:JSON.parse(row.history_json),checks:row.checks,createdAt:row.created_at,updatedAt:row.updated_at};
  const hash=await digest(canonical(record));
  try{
   const ack=await backend(env,{mode:'backup',record,digest:hash});
   if(ack.jobId!==row.job_id||ack.version!==row.version||ack.digest!==hash)throw Error('Backup not verified.');
   await db.prepare('UPDATE lord_jobs SET backup_version=?,backup_until=0,backup_token=NULL WHERE job_id=? AND version=? AND backup_token=?').bind(row.version,row.job_id,row.version,token).run();
  }catch{
   // Keep the exact dirty version; backup retry never repeats Google decisions.
   await db.prepare('UPDATE lord_jobs SET backup_until=0,backup_token=NULL WHERE job_id=? AND backup_token=?').bind(row.job_id,token).run();
  }
 }
}
async function backend(env,body){
 const signed={purpose:'lord-mutation-job-v1',serviceTimestamp:Date.now(),...body};
 const serviceSignature=await hmac(canonical(signed),secret(env));
 const first=await fetch(env.LORD_BACKEND_URL,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'queueCommand',proxySecret:secret(env),...signed,serviceSignature}),signal:AbortSignal.timeout(35000)});
 let response=first;
 if(first.status>=300&&first.status<400){
  const location=first.headers.get('Location');
  if(!location||!/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(location))throw fail(503,'UNKNOWN','Google result redirect could not be verified.');
  response=await fetch(location,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(35000)});
 }
 let data;try{data=await response.json();}catch{throw fail(503,'UNKNOWN','Google returned an unreadable outcome.');}
 if(!response.ok||data?.ok!==true||!data.result){const error=fail(503,data?.code||'UNKNOWN',data?.error||'Google did not confirm an outcome.');error.status=Number(data?.status)||503;error.definite=data?.definite===true;throw error;}
 return data.result;
}
function publicJob(row){return {jobId:row.job_id,action:row.action,state:row.state,submittedAt:row.created_at,updatedAt:row.updated_at,version:row.version,receipt:row.receipt_json?JSON.parse(row.receipt_json):null,error:row.error_json?JSON.parse(row.error_json):null,canCheck:row.state==='UNCERTAIN',confirmedBooking:false};}
function fail(status,code,message){return Object.assign(Error(message),{status,code,definite:[400,401,403,404,409,413,429].includes(status)});}
function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function digest(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
async function hmac(value,key){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value)));}
function hex(value){return Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('');}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<b.length;i++)diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);return diff===0;}
