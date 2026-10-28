import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const jobs=await import('../shared/edge-background-jobs.js').catch(()=>({}));
assert.equal(typeof jobs.requestBackgroundWork,'function','durable post-commit background intent must be implemented');
const {requestBackgroundWork,readBackgroundJobs,retryBackgroundJob,runBackgroundJob,enqueueDueBackgroundWork}=jobs;
function fixture(){
 const sql=new DatabaseSync(':memory:');
 const db={prepare(text){return {text,args:[],bind(...args){return {...this,args};},async first(){return sql.prepare(text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(text).all(...this.args)};},async run(){return {success:true,meta:{changes:Number(sql.prepare(text).run(...this.args).changes)}};}};},withSession(){return this;},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const sent=[],env={GSIS_BACKGROUND_JOBS:'true',GSIS_JOBS:db,GSIS_BACKGROUND_QUEUE:{async send(body){sent.push(body);}}};
 return {sql,env,sent,async state(kind='notifications'){return (await readBackgroundJobs(env)).jobs.find(j=>j.kind===kind);}};
}
const now=Date.parse('2026-10-26T01:30:00Z');
Date.now=()=>now;
assert.deepEqual(await requestBackgroundWork({},'notifications',{now}),{enabled:false});
{
 const f=fixture();
 await Promise.all(Array.from({length:8},()=>requestBackgroundWork(f.env,'notifications',{now})));
 assert.equal(f.sent.length,1,'concurrent requests coalesce the queue wake');
 assert.equal((await f.state()).generation,8);
 assert.deepEqual(Object.keys(f.sent[0]).sort(),['id','kind','purpose'],'wake must contain no business data');
 let release,start;const begun=new Promise(r=>start=r),blocked=new Promise(r=>release=r);let executed=0;
 const first=runBackgroundJob(f.env,'notifications',async()=>{executed++;start();await blocked;return {};},{now});await begun;
 const duplicate=await runBackgroundJob(f.env,'notifications',async()=>{executed++;},{now});assert.equal(duplicate.claimed,false);
 await requestBackgroundWork(f.env,'notifications',{now:now+1});release();await first;
 assert.equal(executed,1);assert.equal((await f.state()).status,'pending','running completion cannot erase a newer committed generation');
 await runBackgroundJob(f.env,'notifications',async()=>({}),{now:now+1000});
 assert.equal((await f.state()).status,'idle');
 await enqueueDueBackgroundWork(f.env,{now:now+86400000});assert.equal(f.sent.length,1,'idle cron does not keep enqueuing completed work');
}
{
 const f=fixture();f.env.GSIS_BACKGROUND_QUEUE.send=async()=>{throw Error('private provider detail');};
 const result=await requestBackgroundWork(f.env,'audit',{now});assert.equal(result.queued,false);
 assert.equal((await f.state('audit')).status,'pending','lost queue wake must retain durable intent');
 f.env.GSIS_BACKGROUND_QUEUE.send=async body=>f.sent.push(body);
 await enqueueDueBackgroundWork(f.env,{now:now+60000});assert.equal(f.sent.length,1);
}
{
 const f=fixture();await requestBackgroundWork(f.env,'notifications',{now});
 let stamp=now;
 for(let i=0;i<3;i++){await runBackgroundJob(f.env,'notifications',async()=>{throw Object.assign(Error('teacher@example.edu token-secret'),{status:502});},{now:stamp});stamp=(await f.state()).readyAt;}
 const parked=await f.state();assert.equal(parked.status,'parked');assert.equal(parked.attempts,3);
 assert.equal(parked.lastCode,'HTTP_ERROR');assert.equal(parked.lastHttpStatus,502);assert(!JSON.stringify(await readBackgroundJobs(f.env)).includes('teacher@'));
 const recorded=f.sql.prepare("SELECT status,code,http_status,trace_id FROM gsis_job_health WHERE job='queue-notifications'").get();assert.equal(recorded.status,'failure');assert.equal(recorded.http_status,502);assert.match(recorded.trace_id,/^[a-f0-9-]{36}$/);
 const sent=f.sent.length;await requestBackgroundWork(f.env,'notifications',{now:stamp+1});await enqueueDueBackgroundWork(f.env,{now:stamp+86400000});assert.equal(f.sent.length,sent,'parked work never auto-requeues on cron or new writes');
 await assert.rejects(()=>retryBackgroundJob(f.env,{kind:'notifications',expectedGeneration:parked.generation},'admin'),e=>e.status===409);
 const current=await f.state();await retryBackgroundJob(f.env,{kind:'notifications',expectedGeneration:current.generation},'admin',{now:stamp+1000});
 assert.equal((await f.state()).status,'pending');assert.equal((await f.state()).attempts,0);
 // Controlled retry only changes the wake row, never the notification outbox.
 assert.deepEqual(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%outbox%'").all(),[]);
}
{
 const f=fixture();await requestBackgroundWork(f.env,'audit',{now});
 for(let i=1;i<=12;i++)await enqueueDueBackgroundWork(f.env,{now:now+i*300000});
 assert.equal(f.sent.length,3,'missing consumer/lost wakes cannot cause perpetual minute enqueues');assert.equal((await f.state('audit')).status,'parked');
}
{
 const f=fixture();await requestBackgroundWork(f.env,'audit',{now});
 // A killed invocation leaves its claim durable; automatic lease recovery
 // consumes the same capped attempt budget as a returned failure.
 f.sql.prepare("UPDATE gsis_background_jobs SET state='running',attempts=3,lease_token='crashed',lease_until=? WHERE kind='audit'").run(now-1);
 let calls=0;await runBackgroundJob(f.env,'audit',async()=>{calls++;},{now});assert.equal(calls,0);assert.equal((await f.state('audit')).status,'parked');
}
{
 const f=fixture();await requestBackgroundWork(f.env,'timetables',{now});
 let release,start;const begun=new Promise(r=>start=r),blocked=new Promise(r=>release=r);
 const stale=runBackgroundJob(f.env,'timetables',async()=>{start();await blocked;return {};},{now});await begun;
 const newer=await runBackgroundJob(f.env,'timetables',async()=>({hasMore:true,readyAt:now+1000000}),{now:now+1000000});assert.equal(newer.claimed,true);
 release();await stale;assert.equal((await f.state('timetables')).status,'pending','stale lease cannot settle replacement owner');
}
{
 const f=fixture();await requestBackgroundWork(f.env,'audit',{now});const before=JSON.stringify(await f.state('audit')),count=f.sent.length;
 f.env.GSIS_RECOVERY_MODE='true';let runs=0;
 for(const work of [()=>requestBackgroundWork(f.env,'audit',{now}),()=>enqueueDueBackgroundWork(f.env,{now}),()=>runBackgroundJob(f.env,'audit',async()=>{runs++;},{now}),()=>retryBackgroundJob(f.env,{kind:'audit',expectedGeneration:1},'admin')])await assert.rejects(work,e=>e.status===503);
 assert.equal(JSON.stringify(await f.state('audit')),before);assert.equal(f.sent.length,count);assert.equal(runs,0);
}
console.log('PASS v097 durable coalescing, redelivery, generation/lease races, capped retry, controlled retry, privacy and recovery pause');
