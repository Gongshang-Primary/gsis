import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const url=new URL('../lord-job-worker/worker.mjs',import.meta.url);
const worker=existsSync(url)?(await import(url)).default:{fetch:async()=>new Response('{}',{status:404}),scheduled:async()=>{}};
const sql=new DatabaseSync(':memory:');
const schema=new URL('../lord-job-worker/schema.sql',import.meta.url);
if(existsSync(schema))sql.exec(readFileSync(schema,'utf8'));
function statement(query,args=[]){return {bind(...values){return statement(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
const env={LORD_JOBS_DB:{prepare:query=>statement(query)},GSIS_SECRET:'synthetic-lord-jobs-secret'.repeat(3),LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/exec',LORD_QUEUE_ENABLED:'true',LORD_QUEUE_DISPATCH:'true'};
const actor={sub:'staff-sub',email:'staff@gsps.edu.sg'};
let backendCalls=0,executes=0,checks=0,backups=0,mode='ok',backupLost=false,wrongReceipt=false;
globalThis.fetch=async(target,options)=>{
 backendCalls++;assert.equal(target,env.LORD_BACKEND_URL);
 const b=JSON.parse(options.body);assert.equal(b.action,'queueCommand');assert.equal(b.proxySecret,env.GSIS_SECRET);
 if(b.mode==='backup'){backups++;if(backupLost)throw Error('backup acknowledgement lost');return Response.json({ok:true,result:{jobId:b.record.jobId,version:b.record.version,digest:b.digest}});}
 assert.ok(['staff-sub','other'].includes(b.actor.sub));
 if(b.mode==='execute'){executes++;if(mode==='lost')throw Error('lost execution response');if(mode==='rejected')return Response.json({ok:false,definite:true,code:'DENIED',error:'School managed',status:409});}
 else checks++;
 const result={state:'APPLIED',jobId:b.jobId,payloadHash:wrongReceipt?'0'.repeat(64):b.payloadHash,result:{enabled:false}};
 return Response.json({ok:true,result:mode==='unknown'?{state:'UNKNOWN'}:result});
};
function proposal(){return {kind:'enqueue',jobId:Date.now()+'-'+crypto.randomUUID(),action:'notificationPreferences',payload:{enabled:false,consentConfirmed:false,expectedRevision:'NONE'}};}
function signed(input,identity=actor){const payload=JSON.stringify({purpose:'lord-job-gateway-v1',timestamp:Date.now(),nonce:crypto.randomUUID(),actor:identity,input});return {payload,signature:createHmac('sha256',env.GSIS_SECRET).update(payload).digest('hex')};}
async function send(input,identity=actor,envelope){const response=await worker.fetch(new Request('https://jobs.invalid/commands',{method:'POST',body:JSON.stringify(envelope||signed(input,identity))}),env);return {status:response.status,data:await response.json()};}
const count=()=>sql.prepare('SELECT COUNT(*) n FROM lord_jobs').get().n;
const due=()=>sql.exec('UPDATE lord_jobs SET next_at=0,lease_until=0');
const get=id=>sql.prepare('SELECT * FROM lord_jobs WHERE job_id=?').get(id);
let p=proposal(),r=await send(p);
assert.equal(r.status,202,'queue persists before returning acceptance');assert.equal(executes,0);assert.equal(backendCalls,0,'durable admission never waits for Google');assert.equal(r.data.result.state,'QUEUED');assert.equal(count(),1);
assert.equal((await send(p)).data.result.jobId,p.jobId);assert.equal(count(),1);
assert.equal((await send({...p,payload:{...p.payload,enabled:true,consentConfirmed:true}})).status,409);
assert.equal((await send(p,{sub:'other',email:'other@gsps.edu.sg'})).status,409);
assert.equal((await send(proposal())).status,409,'one pending preference operation per actor');
assert.equal((await send({...proposal(),action:'bookingCreateBatch'})).status,400);
assert.equal((await send({...proposal(),payload:{enabled:false,authEmail:'other@gsps.edu.sg'}})).status,400);
assert.equal((await send({kind:'list'},{sub:'other',email:'other@gsps.edu.sg'})).data.result.jobs.length,0);
assert.equal((await send({kind:'status',jobId:p.jobId},{sub:'other',email:'other@gsps.edu.sg'})).status,404);
const replay=signed({kind:'list'});assert.equal((await send(null,actor,replay)).status,200);assert.equal((await send(null,actor,replay)).status,409);
assert.equal((await send(null,actor,{payload:'{}',signature:'0'.repeat(64)})).status,401);
await worker.scheduled({},env);assert.equal(executes,1);assert.equal(get(p.jobId).state,'APPLIED');assert.ok(JSON.parse(get(p.jobId).history_json).some(x=>x.state==='RUNNING'),'durable audit records the execution claim');assert.equal(get(p.jobId).backup_version,get(p.jobId).version);assert.ok(backups>0);
// A lost response moves to read-only checks; no later execution, even with absent evidence.
p=proposal();await send(p);mode='lost';due();await worker.scheduled({},env);assert.equal(get(p.jobId).state,'CHECKING');const once=executes;
mode='unknown';for(let i=0;i<7;i++){due();await worker.scheduled({},env);}assert.equal(executes,once);assert.equal(get(p.jobId).state,'UNCERTAIN');assert.equal((await send(proposal())).status,409);
mode='ok';r=await send({kind:'check',jobId:p.jobId});assert.equal(r.status,202);due();await worker.scheduled({},env);assert.equal(executes,once);assert.equal(get(p.jobId).state,'APPLIED');
// Unknown receipt identity cannot fabricate Google acceptance.
p=proposal();await send(p);wrongReceipt=true;due();await worker.scheduled({},env);assert.equal(get(p.jobId).state,'CHECKING');wrongReceipt=false;due();await worker.scheduled({},env);assert.equal(get(p.jobId).state,'APPLIED');
// Expired RUNNING claims recover only by status, including a process death before dispatch.
p=proposal();await send(p);sql.prepare("UPDATE lord_jobs SET state='RUNNING',lease_until=0,next_at=0 WHERE job_id=?").run(p.jobId);const before=executes;await worker.scheduled({},env);assert.equal(executes,before);assert.equal(get(p.jobId).state,'APPLIED');
// Definite execution denial terminates; authorization loss on a status read never proves prior failure.
p=proposal();await send(p);mode='rejected';due();await worker.scheduled({},env);assert.equal(get(p.jobId).state,'REJECTED');mode='ok';
mode='rejected';p=proposal();assert.equal((await send(p)).status,202,'session-authenticated acceptance precedes current Google permission checks');due();await worker.scheduled({},env);assert.equal(get(p.jobId).state,'REJECTED');mode='ok';
// Concurrent identical submissions share the one durable receipt.
p=proposal();const both=await Promise.all([send(p),send(p)]);assert.deepEqual(both.map(x=>x.status),[202,202]);due();await worker.scheduled({},env);
// Backup failure retains dirty records; only backed-up terminal rows expire.
p=proposal();await send(p);backupLost=true;due();await worker.scheduled({},env);assert.ok(get(p.jobId).backup_version<get(p.jobId).version);
sql.prepare('UPDATE lord_jobs SET updated_at=? WHERE job_id=?').run(Date.now()-31*86400000,p.jobId);await worker.scheduled({},env);assert.ok(get(p.jobId));backupLost=false;await worker.scheduled({},env);assert.equal(get(p.jobId).backup_version,get(p.jobId).version);await worker.scheduled({},env);assert.equal(get(p.jobId),undefined);
p=proposal();await send(p);sql.prepare("UPDATE lord_jobs SET state='UNCERTAIN',updated_at=? WHERE job_id=?").run(Date.now()-100*86400000,p.jobId);await worker.scheduled({},env);assert.ok(get(p.jobId));
// Admission refuses at total durable capacity rather than evicting unresolved work.
sql.exec("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT OR IGNORE INTO lord_jobs(job_id,actor_key,actor_json,action,payload_json,payload_hash,state,created_at,updated_at) SELECT 'fill-'||x,'fill-'||x,'{}','notificationPreferences','{}','x','REJECTED',1,1 FROM n");
assert.equal((await send(proposal(),{sub:'other',email:'other@gsps.edu.sg'})).status,429);
// Pending capacity is independent of total completed history capacity.
sql.exec("DELETE FROM lord_jobs WHERE job_id LIKE 'fill-%'; WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO lord_jobs(job_id,actor_key,actor_json,action,payload_json,payload_hash,state,created_at,updated_at) SELECT 'pending-'||x,'pending-'||x,'{}','notificationPreferences','{}','x','UNCERTAIN',1,1 FROM n");
assert.equal((await send(proposal(),{sub:'other',email:'other@gsps.edu.sg'})).status,429,'global pending capacity retains every unresolved job');
console.log('PASS LORD queue: SQLite persistence, signed actor isolation, payload binding, concurrent replay, capacity, one dispatch, uncertainty, exact receipt and verified backup retention');
// The nonce journal is bounded even if scheduled maintenance is delayed.
sql.exec('DELETE FROM lord_job_nonces');
sql.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO lord_job_nonces(nonce,created_at) SELECT 'nonce-'||x,? FROM n").run(Date.now());
assert.equal((await send({kind:'list'})).status,429,'full replay journal refuses without growing');assert.equal(sql.prepare('SELECT COUNT(*) n FROM lord_job_nonces').get().n,10000);
