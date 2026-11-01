import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const path=new URL('../../calendar-job-worker/worker.mjs',import.meta.url);
const worker=existsSync(path)?(await import(path)).default:{fetch:async()=>new Response('Missing Calendar job service',{status:404}),scheduled:async()=>{}};
const db=new DatabaseSync(':memory:');
const schema=new URL('../../calendar-job-worker/schema.sql',import.meta.url);
if(existsSync(schema))db.exec(readFileSync(schema,'utf8'));
function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
const env={CALENDAR_JOBS_DB:{prepare:sql=>statement(sql),async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},GSIS_SECRET:'test-calendar-jobs-secret-'.repeat(3),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec'};
const actor={sub:'synthetic-sub',email:'admin@gsps.edu.sg',userAlias:'admin'};
let backendCalls=0,executions=0,statuses=0,mode='saved',authorize=true,checkpointCrash=false,syncContinuations=0;
globalThis.fetch=async(url,options)=>{
 backendCalls++;
 assert.equal(url,env.CALENDAR_APPS_SCRIPT_URL);
 const input=JSON.parse(options.body);
 if(input.service==='gsis-calendar-sync-worker-v1'){
  syncContinuations++;assert.equal(input.action,'calendarSyncContinue');assert.equal(input.proxySecret,env.GSIS_SECRET);assert.equal(input.calendarServiceSecret,env.GSIS_SECRET);
  assert.equal(input.actor,undefined);assert.equal(input.payload,undefined);assert.equal(input.year,undefined);
  return Response.json({ok:true,result:{idle:true}});
 }
 assert.equal(input.purpose,'calendar-mutation-job-v1');assert.equal(input.service,'gsis-calendar-command-v1');
 assert.equal(input.proxySecret,env.GSIS_SECRET);assert.deepEqual(input.actor,actor);
 assert.equal(input.commandId,input.operation.payload.operationId);
 if(input.mode==='authorize')return Response.json(authorize?{ok:true,result:{authorized:true}}:{ok:false,status:403,definite:true,code:'FORBIDDEN',error:'Role revoked'});
 if(input.mode==='execute'){
  executions++;
  if(mode==='forbidden')return Response.json({ok:false,status:403,definite:true,code:'FORBIDDEN',error:'Role revoked'});
  if(mode==='crash-after-send'){checkpointCrash=true;throw Error('Execution died after delivery');}
  if(mode==='lost')throw Error('Lost committed response');
  if(mode==='rejected')return Response.json({ok:false,status:409,definite:true,code:'CONFLICT',error:'Changed',current:{EventID:'E1',_revision:'new'}});
  return Response.json({ok:true,result:{EventID:input.operation.payload.event?.EventID||'NEW',Year:2026,_revision:'saved',StaffTitle:'Saved',LastMutationID:input.commandId}});
 }
 statuses++;
 return Response.json({ok:true,result:mode==='not-saved'?{state:'NOT_SAVED'}:mode==='unknown'?{state:'UNKNOWN'}:{state:'SAVED',result:{EventID:'E1',Year:2026,_revision:'recovered',LastMutationID:input.commandId}}});
};
function envelope(input,identity=actor,overrides={}){const payload=JSON.stringify({purpose:'calendar-job-gateway-v1',timestamp:Date.now(),nonce:crypto.randomUUID(),actor:identity,input,...overrides});return {payload,signature:createHmac('sha256',env.GSIS_SECRET).update(payload).digest('hex')};}
async function send(input,identity=actor,body){const response=await worker.fetch(new Request('https://jobs.example/commands',{method:'POST',body:JSON.stringify(body||envelope(input,identity))}),env);let data;try{data=await response.json();}catch{data={};}return {response,data};}
function proposal(id='E1'){return {kind:'enqueue',action:'saveEvent',payload:{operationId:crypto.randomUUID(),expectedRevision:'old',event:{EventID:id,Year:2026,StaffTitle:'Accepted proposal',StartDate:'2026-10-28',EndDate:'2026-10-28',LaneID:'day',OwnerTag:'Mtg'}}};}
function due(){db.exec('UPDATE calendar_jobs SET next_at=0,lease_until=0');}

// Losing durable capture or permitting concurrent commands for one event must fail this test.
let p=proposal(),result=await send(p);
assert.equal(result.response.status,202,'Calendar must durably accept without executing Google writes');
assert.equal(backendCalls,0,'D1 acceptance must not wait for any Apps Script call');assert.equal(executions,0);assert.equal(result.data.result.state,'QUEUED');
assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_jobs').get().n,1);
assert.equal((await send(p)).data.result.jobId,p.payload.operationId,'Exact replay returns the original durable receipt');
assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_jobs').get().n,1);
assert.equal((await send({...p,payload:{...p.payload,event:{...p.payload.event,StaffTitle:'different'}}})).response.status,409);
assert.equal((await send(proposal())).response.status,409,'One unresolved command blocks only its own event');
assert.equal((await send(proposal('E2'))).response.status,202,'An independent event can queue');
await worker.scheduled({},env);assert.equal(executions,2);
result=await send({kind:'list'});assert.equal(result.data.result.jobs.filter(j=>j.state==='SAVED').length,2);
assert.equal((await send({kind:'list'},{...actor,sub:'another-sub',email:'other@gsps.edu.sg',userAlias:'other'})).data.result.jobs.length,0);

// Invalid/replayed envelopes cannot mutate storage; Google permission denial happens after capture.
const count=db.prepare('SELECT COUNT(*) n FROM calendar_jobs').get().n;
assert.equal((await send(p,actor,{payload:'{}',signature:'0'.repeat(64)})).response.status,401);
assert.equal((await send(p,actor,envelope(p,actor,{timestamp:Date.now()-180000}))).response.status,401);
assert.equal((await send({...proposal(),action:'saveUser'})).response.status,400);
const replay=envelope({kind:'list'});assert.equal((await send(null,actor,replay)).response.status,200);assert.equal((await send(null,actor,replay)).response.status,409);
assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_jobs').get().n,count);
mode='forbidden';p=proposal('DENIED');assert.equal((await send(p)).response.status,202);
due();await worker.scheduled({},env);
const denied=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(p.payload.operationId);
assert.equal(denied.state,'NEEDS_ATTENTION');assert.equal(denied.outcome,'REJECTED');assert.equal(denied.blocked,0);assert.equal(JSON.parse(denied.error_json).code,'FORBIDDEN');mode='saved';

// A crash after delivery must recover the receipt, never blindly execute a second write.
mode='lost';p=proposal();result=await send(p);const jobId=result.data.result.jobId;
due();await worker.scheduled({},env);const once=executions;
mode='saved';due();await worker.scheduled({},env);
assert.equal(executions,once);assert.equal(statuses,1);
assert.equal(db.prepare('SELECT state FROM calendar_jobs WHERE job_id=?').get(jobId).state,'SAVED');

// Expired RUNNING leases also check status, including an exact NOT_SAVED fence before explicit retry.
mode='not-saved';p=proposal();await send(p);
db.prepare("UPDATE calendar_jobs SET state='RUNNING',lease_until=0,next_at=0 WHERE job_id=?").run(p.payload.operationId);
await worker.scheduled({},env);assert.equal(executions,once);
let row=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(p.payload.operationId);
assert.equal(row.state,'NEEDS_ATTENTION');assert.equal(row.outcome,'NOT_SAVED');
result=await send({kind:'retry',jobId:row.job_id,attemptOperationId:row.attempt_operation_id});
assert.equal(result.response.status,202);assert.notEqual(result.data.result.attemptOperationId,row.attempt_operation_id);
assert.equal((await send({kind:'retry',jobId:row.job_id,attemptOperationId:row.attempt_operation_id})).response.status,409);
mode='saved';due();await worker.scheduled({},env);assert.equal(executions,once+1);

// An unresolved provider receipt remains blocked and retained after bounded checks.
mode='lost';p=proposal();await send(p);due();await worker.scheduled({},env);mode='unknown';
for(let i=0;i<7;i++){due();await worker.scheduled({},env);}
row=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(p.payload.operationId);
assert.equal(row.state,'NEEDS_ATTENTION');assert.equal(row.outcome,'UNKNOWN');assert.equal(row.blocked,1);
assert.equal((await send({kind:'retry',jobId:row.job_id,attemptOperationId:row.attempt_operation_id})).response.status,409);
assert.equal((await send(proposal())).response.status,409);
assert.equal((await send({kind:'check',jobId:row.job_id,attemptOperationId:row.attempt_operation_id})).response.status,202);
mode='saved';due();await worker.scheduled({},env);
assert.equal(db.prepare('SELECT state FROM calendar_jobs WHERE job_id=?').get(row.job_id).state,'SAVED');
console.log('PASS Calendar jobs: real SQLite durable capture, actor isolation, per-event ordering, signed/replay-bounded gateway, receipt-first crash recovery, fenced explicit retries and bounded unknown outcomes');

// Dispatch accounting must survive death before the final checkpoint, or retry limits can be bypassed.
p=proposal('CRASH');await send(p);mode='crash-after-send';
const prepare=env.CALENDAR_JOBS_DB.prepare;
env.CALENDAR_JOBS_DB.prepare=sql=>{
 if(checkpointCrash&&sql.startsWith('UPDATE calendar_jobs SET state=?,outcome='))throw Error('D1 checkpoint unavailable');
 return prepare(sql);
};
due();await assert.rejects(worker.scheduled({},env),/checkpoint unavailable/);
row=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(p.payload.operationId);
assert.equal(row.dispatches,1,'An issued write must be counted before the network delivery');
env.CALENDAR_JOBS_DB.prepare=prepare;checkpointCrash=false;mode='saved';due();const beforeCrashRecovery=executions;await worker.scheduled({},env);assert.equal(executions,beforeCrashRecovery);
console.log('PASS Calendar jobs: dispatch count survives a crash before D1 result checkpoint');

// Optional sync continuation must never invent an actor/year or start a sync operation.
await worker.scheduled({},env);assert.equal(syncContinuations,0,'Sync continuation is disabled by default');
env.CALENDAR_SYNC_CONTINUE='true';await worker.scheduled({},env);assert.equal(syncContinuations,1);
await worker.scheduled({},env);assert.equal(syncContinuations,1,'A durable maintenance lease bounds overlapping cron invocations');
env.CALENDAR_SYNC_CONTINUE='false';db.exec("UPDATE calendar_job_maintenance SET lease_until=0");await worker.scheduled({},env);assert.equal(syncContinuations,1);
console.log('PASS Calendar jobs: optional continuation resumes only the existing backend-owned session, with no actor/year and a durable cron lease');

// Two recovery clicks racing on the same fenced attempt can allocate only one next attempt.
const retryRow=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(p.payload.operationId);
db.prepare("UPDATE calendar_jobs SET state='NEEDS_ATTENTION',outcome='NOT_SAVED',blocked=0 WHERE job_id=?").run(retryRow.job_id);
const recoverySnapshot=db.prepare('SELECT * FROM calendar_jobs WHERE job_id=?').get(retryRow.job_id);
env.CALENDAR_JOBS_DB.prepare=sql=>sql==='SELECT * FROM calendar_jobs WHERE job_id=? AND actor_key=?'?{bind(){return {first:async()=>recoverySnapshot};}}:prepare(sql);
const racing=await Promise.all([send({kind:'retry',jobId:retryRow.job_id,attemptOperationId:retryRow.attempt_operation_id}),send({kind:'retry',jobId:retryRow.job_id,attemptOperationId:retryRow.attempt_operation_id})]);
assert.deepEqual(racing.map(r=>r.response.status).sort(),[202,409]);
env.CALENDAR_JOBS_DB.prepare=prepare;
console.log('PASS Calendar jobs: recovery compare-and-swap accepts only one concurrent retry');
