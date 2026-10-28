import {assertRecoveryWritable} from './edge-recovery.js';
import {recordJobHealth,safeHealthError} from './edge-health.js';

// D1 owns intent; Queue messages only wake it. There is at most one row per
// kind, so repeated user saves cannot create an unbounded queue or payload log.
// Longer than the Queue invocation's 15-minute wall limit: a still-running
// consumer cannot lose this outer lease merely because its providers are slow.
const KINDS=['notifications','timetables','audit'],MAX_ATTEMPTS=3,LEASE_MS=960000,WAKE_MS=960000,schemas=new WeakMap();
const columns='kind,state,generation,completed_generation,attempts,requested_at,available_at,started_at,finished_at,lease_until,last_code,last_http_status';
const fail=(code,status)=>{throw Object.assign(Error(code),{code,status});};
const stamp=value=>Number.isFinite(value)&&value>=0?Math.floor(value):Date.now();
const validKind=kind=>{if(!KINDS.includes(kind))fail('INVALID_JOB_KIND',400);return kind;};
export const backgroundJobsEnabled=env=>env.GSIS_BACKGROUND_JOBS==='true';
function database(env){if(!env.GSIS_JOBS?.prepare)fail('NOT_CONFIGURED',503);return env.GSIS_JOBS.withSession?env.GSIS_JOBS.withSession('first-primary'):env.GSIS_JOBS;}
async function ensure(env){
 assertRecoveryWritable(env);const db=database(env),key=env.GSIS_JOBS;
 if(!schemas.has(key))schemas.set(key,db.prepare(`CREATE TABLE IF NOT EXISTS gsis_background_jobs (
 kind TEXT PRIMARY KEY,state TEXT NOT NULL,generation INTEGER NOT NULL,completed_generation INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,requested_at INTEGER NOT NULL,available_at INTEGER NOT NULL,
 started_at INTEGER,finished_at INTEGER,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,
 wake_token TEXT,wake_until INTEGER NOT NULL DEFAULT 0,wake_attempts INTEGER NOT NULL DEFAULT 0,
 last_code TEXT,last_http_status INTEGER)`).run().then(result=>{if(result.success===false)fail('UNAVAILABLE',503);}).catch(error=>{schemas.delete(key);throw error;}));
 await schemas.get(key);assertRecoveryWritable(env);return db;
}
async function health(env,event){try{await recordJobHealth(env,{...event,now:event.finishedAt??event.startedAt??Date.now()});}catch{console.error(JSON.stringify({event:'background-health-record-failed',code:'UNAVAILABLE'}));}}
const publicRow=row=>({kind:row.kind,status:row.state,generation:row.generation,completedGeneration:row.completed_generation,attempts:row.attempts,requestedAt:row.requested_at,readyAt:row.available_at,startedAt:row.started_at,finishedAt:row.finished_at,leaseUntil:row.lease_until,lastCode:row.last_code,lastHttpStatus:row.last_http_status});

export async function readBackgroundJobs(env){
 if(!env.GSIS_JOBS?.prepare)return {enabled:backgroundJobsEnabled(env),jobs:[],counts:{pending:0,running:0,parked:0}};
 const db=database(env),exists=await db.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_background_jobs'").first();
 const rows=exists?(await db.prepare('SELECT '+columns+' FROM gsis_background_jobs ORDER BY kind LIMIT 3').all()).results||[]:[];
 return {enabled:backgroundJobsEnabled(env),jobs:rows.map(publicRow),counts:Object.fromEntries(['pending','running','parked'].map(state=>[state,rows.filter(row=>row.state===state).length]))};
}

export async function requestBackgroundWork(env,kind,{now=Date.now(),onlyIfIdle=false}={}){
 if(!backgroundJobsEnabled(env))return {enabled:false};
 assertRecoveryWritable(env);validKind(kind);now=stamp(now);const db=await ensure(env);
 await db.prepare(`INSERT INTO gsis_background_jobs(kind,state,generation,requested_at,available_at) VALUES(?,'pending',1,?,?)
 ON CONFLICT(kind) DO UPDATE SET generation=generation+1,requested_at=excluded.requested_at,
 state=CASE WHEN state IN ('running','parked') THEN state ELSE 'pending' END,
 available_at=CASE WHEN state='idle' THEN excluded.available_at ELSE available_at END
 ${onlyIfIdle?"WHERE state='idle'":''}`).bind(kind,now,now).run();
 const result=await enqueueDueBackgroundWork(env,{now,kind,limit:1});return {enabled:true,queued:result.queued>0};
}

export async function enqueueDueBackgroundWork(env,{now=Date.now(),kind,limit=3}={}){
 if(!backgroundJobsEnabled(env))return {enabled:false,queued:0};
 assertRecoveryWritable(env);if(kind)validKind(kind);now=stamp(now);const db=await ensure(env);
 if(!env.GSIS_BACKGROUND_QUEUE?.send)fail('NOT_CONFIGURED',503);
 // Exhausted claims include killed invocations: a crash must not bypass the cap.
 await db.prepare("UPDATE gsis_background_jobs SET state='parked',last_code='JOB_PARKED',finished_at=?,lease_token=NULL,lease_until=0 WHERE (state='pending' OR (state='running' AND lease_until<=?)) AND (attempts>=? OR (wake_attempts>=? AND wake_until<=?))").bind(now,now,MAX_ATTEMPTS,MAX_ATTEMPTS,now).run();
 const rows=(await db.prepare(`SELECT kind FROM gsis_background_jobs WHERE ((state='pending' AND available_at<=?) OR (state='running' AND lease_until<=?)) AND wake_until<=? ${kind?'AND kind=?':''} ORDER BY available_at,kind LIMIT ?`).bind(now,now,now,...(kind?[kind]:[]),Math.max(1,Math.min(3,limit|0))).all()).results||[];
 let queued=0;
 for(const row of rows){
  assertRecoveryWritable(env);const token=crypto.randomUUID();
  const claim=await db.prepare("UPDATE gsis_background_jobs SET wake_token=?,wake_until=?,wake_attempts=wake_attempts+1 WHERE kind=? AND ((state='pending' AND available_at<=?) OR (state='running' AND lease_until<=?)) AND wake_until<=? AND attempts<? AND wake_attempts<?").bind(token,now+WAKE_MS,row.kind,now,now,now,MAX_ATTEMPTS,MAX_ATTEMPTS).run();
  if(claim.meta?.changes!==1)continue;
  try{assertRecoveryWritable(env);await env.GSIS_BACKGROUND_QUEUE.send({purpose:'gsis-background-work-v1',kind:row.kind,id:token});queued++;}
  catch(error){
   assertRecoveryWritable(env);const safe=safeHealthError(error);
   await db.prepare("UPDATE gsis_background_jobs SET wake_until=?,last_code=?,last_http_status=? WHERE kind=? AND wake_token=?").bind(now+60000,safe.code,safe.httpStatus||null,row.kind,token).run();
   await health(env,{job:'queue-'+row.kind,status:'failure',...safe,traceId:token,finishedAt:now,counts:{queued:0}});
  }
 }
 return {enabled:true,queued};
}

export async function runBackgroundJob(env,kind,handler,{now=Date.now()}={}){
 assertRecoveryWritable(env);if(!backgroundJobsEnabled(env))return {enabled:false,claimed:false};
 validKind(kind);now=stamp(now);const db=await ensure(env),token=crypto.randomUUID();
 await db.prepare("UPDATE gsis_background_jobs SET state='parked',last_code='JOB_PARKED',finished_at=?,lease_token=NULL,lease_until=0 WHERE kind=? AND attempts>=? AND (state='pending' OR (state='running' AND lease_until<=?))").bind(now,kind,MAX_ATTEMPTS,now).run();
 const claim=await db.prepare("UPDATE gsis_background_jobs SET state='running',attempts=attempts+1,started_at=?,lease_token=?,lease_until=?,wake_until=0,wake_token=NULL,wake_attempts=0 WHERE kind=? AND ((state='pending' AND available_at<=?) OR (state='running' AND lease_until<=?)) AND attempts<?").bind(now,token,now+LEASE_MS,kind,now,now,MAX_ATTEMPTS).run();
 if(claim.meta?.changes!==1)return {enabled:true,claimed:false};
 const row=await db.prepare('SELECT generation,attempts FROM gsis_background_jobs WHERE kind=? AND lease_token=?').bind(kind,token).first();
 if(!row)return {enabled:true,claimed:false};
 const startedAt=now,job='queue-'+kind;await health(env,{job,status:'running',traceId:token,startedAt,counts:{claimed:1}});
 try{
  assertRecoveryWritable(env);const result=await handler()||{};assertRecoveryWritable(env);
  const finishedAt=stamp(Math.max(now,Date.now())),readyAt=Math.max(finishedAt+1000,stamp(result.readyAt||finishedAt+1000)),more=result.hasMore===true;
  const saved=await db.prepare(`UPDATE gsis_background_jobs SET state=CASE WHEN generation>? OR ? THEN 'pending' ELSE 'idle' END,
 completed_generation=MAX(completed_generation,?),attempts=0,finished_at=?,available_at=?,lease_token=NULL,lease_until=0,
 last_code=?,last_http_status=NULL WHERE kind=? AND lease_token=?`).bind(row.generation,more?1:0,row.generation,finishedAt,readyAt,more?'RETRY_LATER':'OK',kind,token).run();
  if(saved.meta?.changes===1)await health(env,{job,status:result.counts?.failed?'failure':result.idle?'idle':'success',code:result.counts?.failed?'JOB_FAILED':more?'RETRY_LATER':result.idle?'IDLE':'OK',traceId:token,startedAt,finishedAt,counts:result.counts||{processed:1}});
  return {enabled:true,claimed:true,completed:saved.meta?.changes===1,hasMore:more};
 }catch(error){
  // A pause leaves the claimed intent intact; after controlled resume its lease
  // can expire. Never mutate restored data or reset provider delivery records.
  assertRecoveryWritable(env);const safe=safeHealthError(error),finishedAt=stamp(Math.max(now,Date.now())),parked=row.attempts>=MAX_ATTEMPTS;
  const saved=await db.prepare("UPDATE gsis_background_jobs SET state=?,finished_at=?,available_at=?,lease_token=NULL,lease_until=0,last_code=?,last_http_status=? WHERE kind=? AND lease_token=?").bind(parked?'parked':'pending',finishedAt,finishedAt+Math.min(900000,60000*2**(row.attempts-1)),safe.code,safe.httpStatus||null,kind,token).run();
  if(saved.meta?.changes===1)await health(env,{job,status:'failure',...safe,traceId:token,startedAt,finishedAt,counts:{failed:1,parked:parked?1:0}});
  return {enabled:true,claimed:true,failed:true,parked};
 }
}

// Authorization belongs to the private backend. Expected generation fences an
// admin's stale screen; this does not edit message claims or uncertain outcomes.
export async function retryBackgroundJob(env,input,actor,{now=Date.now()}={}){
 assertRecoveryWritable(env);if(!backgroundJobsEnabled(env))fail('NOT_CONFIGURED',503);
 const kind=validKind(input?.kind);if(!actor||!Number.isSafeInteger(input?.expectedGeneration))fail('INVALID_JOB_RETRY',400);
 now=stamp(now);const db=await ensure(env),changed=await db.prepare("UPDATE gsis_background_jobs SET state='pending',attempts=0,available_at=?,wake_until=0,wake_attempts=0,lease_token=NULL,lease_until=0,last_code='RETRY_LATER',last_http_status=NULL WHERE kind=? AND state='parked' AND generation=?").bind(now,kind,input.expectedGeneration).run();
 if(changed.meta?.changes!==1)fail('CONFLICT',409);
 await health(env,{job:'queue-'+kind,status:'skipped',code:'RETRY_LATER',finishedAt:now,counts:{retried:1}});
 await enqueueDueBackgroundWork(env,{now,kind,limit:1});return {retried:true,kind};
}
