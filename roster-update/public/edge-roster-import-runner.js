import {GSiSRosterImport} from './edge-store.js';

// Durable continuation belongs to the original verified Admin. Each step checks
// current Google authority again; neither a browser session nor a Queue receipt
// grants continuing authority. Source and part receipts remain in roster-import.
const TABLE='gsis_roster_import_jobs',LEASE_MS=600000;
const connection=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
async function exists(db){return !!await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(TABLE).first();}
function checked(result){if(result.success===false)throw Object.assign(Error('Import continuation storage is unavailable.'),{status:503,code:'ROSTER_IMPORT_STORAGE'});return result;}
export async function rosterImportRunnerStatus(db,sessionId){
 const c=connection(db);if(!await exists(c))return null;
 const row=await c.prepare(`SELECT state,next_at,lease_until,error_code,updated_at FROM ${TABLE} WHERE session_id=?`).bind(sessionId).first();
 return row?{state:row.state,readyAt:Math.max(row.next_at,row.lease_until),code:row.error_code||null,updatedAt:row.updated_at}:null;
}
export async function queueRosterImport(db,binding,identity){
 const c=connection(db),now=Date.now();
 if(identity?.email!==binding.actor||typeof identity.subject!=='string'||!identity.subject||identity.subject.length>320)throw Object.assign(Error('The original verified Admin identity is required.'),{status:403,code:'ROSTER_ADMIN_REQUIRED'});
 checked(await c.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE} (session_id TEXT PRIMARY KEY,identity_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'waiting',claim_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,error_code TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL)`).run());
 checked(await c.prepare(`INSERT INTO ${TABLE} (session_id,identity_json,updated_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND actor=? AND request_id=? AND state IN ('preparing','staging')) ON CONFLICT(session_id) DO UPDATE SET state=CASE WHEN ${TABLE}.state='attention' THEN 'waiting' ELSE ${TABLE}.state END,next_at=0,error_code='',updated_at=excluded.updated_at WHERE ${TABLE}.identity_json=excluded.identity_json`).bind(binding.sessionId,JSON.stringify({email:identity.email,subject:identity.subject}),now,binding.sessionId,binding.actor,binding.requestId).run());
 return rosterImportRunnerStatus(db,binding.sessionId);
}
export async function drainRosterImports(db,advance,{maxSteps=8,budgetMs=180000}={}){
 if(!db?.prepare)return {configured:false,pending:0};const c=connection(db);
 // A minute tick with no explicit import must not provision stores or heads.
 if(!await exists(c))return {pending:0,idle:true};
 const now=Date.now(),job=await c.prepare(`SELECT j.*,s.actor,s.request_id,s.state session_state FROM ${TABLE} j JOIN gsis_roster_import_sessions s USING(session_id) WHERE j.state IN ('waiting','running') AND s.state IN ('preparing','staging','imported') ORDER BY j.updated_at LIMIT 1`).first();
 if(!job)return {pending:0,idle:true};
 if(job.session_state==='imported'){checked(await c.prepare(`UPDATE ${TABLE} SET state='complete',claim_token='',lease_until=0,updated_at=? WHERE session_id=?`).bind(now,job.session_id).run());return {completed:1,pending:0};}
 if(job.next_at>now||job.lease_until>now)return {pending:1,readyAt:Math.max(job.next_at,job.lease_until)};
 const token=crypto.randomUUID(),claimed=checked(await c.prepare(`UPDATE ${TABLE} SET state='running',claim_token=?,lease_until=?,updated_at=? WHERE session_id=? AND state IN ('waiting','running') AND next_at<=? AND lease_until<=?`).bind(token,now+LEASE_MS,now,job.session_id,now,now).run());
 if(!claimed.meta?.changes)return {pending:1,readyAt:now+2000};
 const identity=JSON.parse(job.identity_json),input={operation:'import',requestId:job.request_id,sessionId:job.session_id},store=GSiSRosterImport.open(db,{actor:job.actor,requestId:job.request_id,sessionId:job.session_id});
 let result,steps=0,state='waiting',readyAt=0,errorCode='';
 try{
  while(steps<Math.max(1,Math.min(8,maxSteps))&&Date.now()-now<Math.max(1,Math.min(180000,budgetMs))){
   const progress=await store.progress();if(!progress||progress.requiresRestart){state='attention';break;}if(progress.imported){state='complete';break;}
   const renewed=checked(await c.prepare(`UPDATE ${TABLE} SET lease_until=?,updated_at=? WHERE session_id=? AND claim_token=?`).bind(Date.now()+LEASE_MS,Date.now(),job.session_id,token).run());if(!renewed.meta?.changes)return {pending:1,readyAt:Date.now()+2000};
   result=await advance(input,identity);steps++;
   if(result.imported){state='complete';break;}if(result.requiresRestart){state='attention';break;}
   if(result.preparationLeaseUntil>Date.now()){readyAt=result.preparationLeaseUntil;break;}
  }
 }catch(error){
  // A transport timeout retains the exact preparation checkpoint and its longer
  // source lease. Retry it after the lease, never capture a fresh live source.
  const preparation=await store.preparationStatus();readyAt=Math.max(Date.now()+60000,preparation?.busy?preparation.leaseUntil:0);
  state=error.status>=400&&error.status<500&&![408,429].includes(error.status)?'attention':'waiting';errorCode=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code||'')?error.code:'ROSTER_IMPORT_RETRY';
 }
 checked(await c.prepare(`UPDATE ${TABLE} SET state=?,claim_token='',lease_until=0,next_at=?,error_code=?,updated_at=? WHERE session_id=? AND claim_token=?`).bind(state,readyAt,errorCode,Date.now(),job.session_id,token).run());
 return {completed:state==='complete'?1:0,pending:state==='waiting'?1:0,needsReview:state==='attention'?1:0,processed:steps,...(readyAt?{readyAt}:{}),...(errorCode?{code:errorCode}:{})};
}
