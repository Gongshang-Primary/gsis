import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
assert(existsSync(new URL('../shared/edge-health.js',import.meta.url)), 'System Health shared module must exist');
const {recordJobHealth,readSystemHealth,safeHealthError}=await import('../shared/edge-health.js');
const NOW=Date.parse('2026-10-26T08:00:00Z'),DAY=86400000;
function database(){
 const sql=new DatabaseSync(':memory:'),queries=[];
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){queries.push(this.text);return sql.prepare(this.text).get(...this.args)||null;},async all(){queries.push(this.text);return {success:true,results:sql.prepare(this.text).all(...this.args)};},async run(){queries.push(this.text);const result=sql.prepare(this.text).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}});
 return {sql,queries,prepare,withSession(mode){assert.equal(mode,'first-primary');return this;},async batch(items){sql.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
let passed=0,failed=0;async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack);}}
const event=(values={})=>({job:'allocation',status:'success',startedAt:NOW-200,finishedAt:NOW,now:NOW,...values});
await test('safe errors never retain arbitrary exception text or caller codes',()=>{
 assert.deepEqual(safeHealthError(Object.assign(Error('staff@example.org secret'),{code:'staff@example.org',status:503})),{code:'HTTP_ERROR',httpStatus:503});
 assert.deepEqual(safeHealthError({code:'RECOVERY_PAUSED',message:'private'}),{code:'RECOVERY_PAUSED'});
 assert.deepEqual(safeHealthError({name:'AbortError',message:'private'}),{code:'TIMEOUT'});
 assert.deepEqual(safeHealthError({code:'X'.repeat(100000),status:'private'}),{code:'UNKNOWN_ERROR'});
});
await test('event storage projects only permitted finite counts and diagnostic pointers',async()=>{
 const db=database(),env={GSIS_JOBS:db};await recordJobHealth(env,event({status:'failure',code:'teacher@example.org',traceId:'password=<script>',message:'private staff name',payload:{secret:'value'},counts:{sent:2,pending:-3,failed:Infinity,queued:1e12,processed:'private',email:'private'}}));
 const result=await readSystemHealth(env,{now:NOW}),row=result.jobs[0];assert.equal(row.code,'UNKNOWN_ERROR');assert.deepEqual(row.counts,{sent:2});assert.equal(row.traceId,null);assert.equal(row.lastSuccessAt,null);assert.equal(result.recentFailures.length,1);
 const raw=JSON.stringify([...db.sql.prepare('SELECT * FROM gsis_job_health').all(),...db.sql.prepare('SELECT * FROM gsis_job_health_history').all(),result]);for(const secret of ['teacher@example.org','private','password','payload','secret'])assert(!raw.includes(secret),secret+' leaked');
 await recordJobHealth(env,event({traceId:'a'.repeat(32)}));assert.equal((await readSystemHealth(env,{now:NOW})).jobs[0].traceId,'a'.repeat(32));
});
await test('unknown jobs and statuses cannot spoof stored health',async()=>{
 const db=database(),env={GSIS_JOBS:db};await assert.rejects(recordJobHealth(env,event({job:'<script>'})),e=>e.code==='INVALID_HEALTH_EVENT');await assert.rejects(recordJobHealth(env,event({status:'healthy'})),e=>e.code==='INVALID_HEALTH_EVENT');assert.equal((await readSystemHealth(env,{now:NOW})).jobs.length,0);
});
await test('idle and skipped do not report a successful actual run; older completions cannot replace latest',async()=>{
 const env={GSIS_JOBS:database()};await recordJobHealth(env,event({status:'idle'}));assert.equal((await readSystemHealth(env,{now:NOW})).jobs[0].lastSuccessAt,null);
 await recordJobHealth(env,event({status:'success',finishedAt:NOW+100,now:NOW+100}));await recordJobHealth(env,event({status:'skipped',finishedAt:NOW+200,now:NOW+200}));await recordJobHealth(env,event({status:'failure',finishedAt:NOW-100,now:NOW+300}));
 const row=(await readSystemHealth(env,{now:NOW+300})).jobs[0];assert.equal(row.status,'skipped');assert.equal(row.lastSuccessAt,NOW+100);assert.equal(row.lastFailureAt,NOW-100);
});
await test('history is bounded by count and age; latest diagnostics survive history expiry',async()=>{
 const db=database(),env={GSIS_JOBS:db};for(let i=0;i<205;i++)await recordJobHealth(env,event({status:'failure',finishedAt:NOW+i,now:NOW+i}));assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_job_health_history').get().n,200);
 await recordJobHealth(env,event({job:'notifications',status:'failure',now:NOW+8*DAY,startedAt:NOW+8*DAY,finishedAt:NOW+8*DAY}));assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_job_health_history').get().n,1);assert.equal((await readSystemHealth(env,{now:NOW+8*DAY})).jobs.length,2);
});
await test('idle beats cannot crowd out failure diagnostics and identical idle writes are throttled',async()=>{
 const db=database(),env={GSIS_JOBS:db};await recordJobHealth(env,event({status:'failure',code:'TIMEOUT',traceId:'b'.repeat(32)}));
 for(let i=1;i<=205;i++)await recordJobHealth(env,event({status:'idle',startedAt:NOW+i*1000-100,finishedAt:NOW+i*1000,now:NOW+i*1000,traceId:'a'.repeat(32)}));
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_job_health_history').get().n,1,'history contains failure evidence, not every healthy beat');assert.equal(db.sql.prepare('SELECT recorded_at FROM gsis_job_health').get().recorded_at,NOW+1000);
 const health=await readSystemHealth(env,{now:NOW+205000});assert.equal(health.recentFailures[0].code,'TIMEOUT');assert.equal(health.recentFailures[0].traceId,'b'.repeat(32));
 await recordJobHealth(env,event({status:'idle',startedAt:NOW+301000,finishedAt:NOW+301000,now:NOW+301000}));assert.equal(db.sql.prepare('SELECT recorded_at FROM gsis_job_health').get().recorded_at,NOW+301000);
 await recordJobHealth(env,event({status:'idle',counts:{pending:2},finishedAt:NOW+301001,now:NOW+301001}));assert.equal(db.sql.prepare('SELECT recorded_at FROM gsis_job_health').get().recorded_at,NOW+301001,'changed counts bypass throttle');
});
await test('missing storage and optional metrics stay unavailable instead of claiming healthy',async()=>{
 assert.deepEqual((await readSystemHealth({},{now:NOW})).storage,{configured:false,available:false});const env={GSIS_JOBS:database()},result=await readSystemHealth(env,{now:NOW});assert.equal(result.storage.available,true);assert.equal(result.backlog.available,false);assert.equal(result.cleanup.available,false);assert.equal(result.timetables.available,false);
});
await test('health reads revalidate stored data and bound failure response',async()=>{
 const db=database(),env={GSIS_JOBS:db};for(let i=0;i<30;i++)await recordJobHealth(env,event({status:'failure',now:NOW+i,finishedAt:NOW+i}));db.sql.prepare("UPDATE gsis_job_health SET code='PRIVATE',trace_id='secret@example.org',counts_json=?").run(JSON.stringify({sent:1,privateStaff:'PRIVATE'}));const data=await readSystemHealth(env,{now:NOW+40});assert.equal(data.jobs[0].code,'UNKNOWN_ERROR');assert.equal(data.jobs[0].traceId,null);assert.deepEqual(data.jobs[0].counts,{sent:1});assert.equal(data.recentFailures.length,20);assert(!JSON.stringify(data).includes('PRIVATE'));
});
await test('indexed pending reads return safe counts/age without record payloads or a full roster load',async()=>{
 const db=database();db.sql.exec("CREATE TABLE gsis_edge_records(scope TEXT,collection TEXT,record_id TEXT,position INTEGER,value_json TEXT);CREATE INDEX gsis_edge_pending_service ON gsis_edge_records(scope,collection,position,record_id) WHERE record_id<>'$' AND json_extract(value_json,'$.status')='pending'");
 const put=db.sql.prepare('INSERT INTO gsis_edge_records VALUES (?,?,?,?,?)');put.run('roster','edgePeerProposals','one',0,JSON.stringify({status:'pending',createdAt:new Date(NOW-DAY).toISOString(),email:'private@gsps.edu.sg'}));put.run('roster','edgeInstructionDrafts','two',0,JSON.stringify({status:'pending',createdAt:NOW-5000,message:'PRIVATE'}));put.run('roster','edgePeerProposals','done',1,JSON.stringify({status:'sent'}));
 const data=await readSystemHealth({GSIS_JOBS:db},{now:NOW});assert.equal(data.backlog.available,true);assert.equal(data.backlog.items.find(x=>x.kind==='peer-proposals').pending,1);assert.equal(data.backlog.items.find(x=>x.kind==='peer-proposals').oldestPendingAt,NOW-DAY);assert(!JSON.stringify(data).includes('PRIVATE'));assert(db.queries.some(q=>q.includes('LIMIT 1001')));assert(!db.queries.some(q=>/SELECT\s+\*/i.test(q)));
});
await test('cleanup status exposes only safe aggregate counts and completion date',async()=>{
 const db=database();db.sql.exec('CREATE TABLE gsis_roster_r2_cleanup(scope TEXT PRIMARY KEY,cursor TEXT,completed_day TEXT,last_stats_json TEXT)');db.sql.prepare('INSERT INTO gsis_roster_r2_cleanup VALUES(?,?,?,?)').run('timetable-parts','private/object','2026-10-26',JSON.stringify({scanned:50,deleted:3,failed:0,secret:'PRIVATE',objects:['private']}));const data=await readSystemHealth({GSIS_JOBS:db},{now:NOW});assert.deepEqual(data.cleanup,{available:true,completedDay:'2026-10-26',counts:{scanned:50,deleted:3,failed:0}});assert(!JSON.stringify(data).includes('private'));
});
await test('paused or misconfigured recovery allows reads but no health schema or event writes',async()=>{
 for(const mode of ['true','broken']){const db=database(),env={GSIS_JOBS:db,GSIS_RECOVERY_MODE:mode};await readSystemHealth(env,{now:NOW});assert(!db.queries.some(sql=>/^(?:CREATE|INSERT|UPDATE|DELETE)/i.test(sql)));await assert.rejects(recordJobHealth(env,event()),e=>['GSIS_RECOVERY_PAUSED','GSIS_RECOVERY_CONFIG'].includes(e.code));assert(!db.queries.some(sql=>/^(?:CREATE|INSERT|UPDATE|DELETE)/i.test(sql)));}
 const db=database();await readSystemHealth({GSIS_JOBS:db},{now:NOW});assert(!db.queries.some(sql=>/^(?:CREATE|INSERT|UPDATE|DELETE)/i.test(sql)),'active status checks also remain read-only');
});
console.log(`${passed}/${passed+failed} health checks passed`);if(failed)process.exitCode=1;
