import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assertRecoveryWritable,readRecoveryState,recordRecoveryCheckpoint} from '../shared/edge-recovery.js';

function database(){
 const sql=new DatabaseSync(':memory:'),trace=[];
 const execute=(stmt,read)=>{trace.push(stmt.text);const q=sql.prepare(stmt.text);return read?q.all(...stmt.args):Number(q.run(...stmt.args).changes);};
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){return execute(this,true)[0]||null;},async all(){return {success:true,results:execute(this,true)};},async run(){return {success:true,meta:{changes:execute(this,false)}};}});
 return {sql,trace,prepare,withSession(mode){assert.equal(mode,'first-primary');return this;},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>({success:true,meta:{changes:execute(s,false)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const account='a'.repeat(32),databaseId='12345678-1234-1234-1234-123456789abc';
const bookmark='00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653';
const actor={email:'Admin@school.edu.sg',privateDetails:'must not persist'};
const configured=db=>({GSIS_JOBS:db,GSIS_RECOVERY_ACCOUNT_ID:account,GSIS_RECOVERY_DATABASE_ID:databaseId,GSIS_RECOVERY_CF_API_TOKEN:'server-only-secret',GSIS_RELEASE_VERSION:'0.9.7'});
const realFetch=globalThis.fetch,realNow=Date.now;
const now=Date.parse('2026-10-26T09:00:00Z');Date.now=()=>now;
let calls=[];
function response(body={success:true,errors:[],result:{bookmark}},status=200){globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(body),{status});};}
let passed=0,failed=0;
async function test(name,run){calls=[];response();try{await run();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack);}}
try{
await test('pause is synchronous, external to D1 and fails closed on invalid values',()=>{
 for(const value of [undefined,'',false,'false'])assert.doesNotThrow(()=>assertRecoveryWritable({GSIS_RECOVERY_MODE:value}));
 for(const value of [true,'true'])assert.throws(()=>assertRecoveryWritable({GSIS_RECOVERY_MODE:value}),e=>e.status===503&&e.code==='GSIS_RECOVERY_PAUSED');
 for(const value of ['TRUE','yes',' false ',1,null,{}])assert.throws(()=>assertRecoveryWritable({GSIS_RECOVERY_MODE:value}),e=>e.status===503&&e.code==='GSIS_RECOVERY_CONFIG');
});
await test('missing configuration returns useful read-only status; no checkpoint is invented',async()=>{
 const state=await readRecoveryState({});assert.equal(state.paused,false);assert.equal(state.mode,'active');assert.equal(state.checkpointCaptureConfigured,false);assert.equal(state.checkpointStorage,'unavailable');assert.deepEqual(state.checkpoints,[]);
 await assert.rejects(recordRecoveryCheckpoint({},{},actor),e=>e.status===503);assert.equal(calls.length,0);
 const db=database();const active=await readRecoveryState({GSIS_JOBS:db});assert.equal(active.checkpointStorage,'available');assert(db.trace.every(sql=>/^SELECT /.test(sql)));assert.equal(db.sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='gsis_recovery_checkpoints'").get().n,0);
});
await test('paused or malformed controls stop checkpoint capture before network and storage',async()=>{
 for(const [mode,code]of [['true','GSIS_RECOVERY_PAUSED'],['typo','GSIS_RECOVERY_CONFIG']]){
  const db=database(),env={...configured(db),GSIS_RECOVERY_MODE:mode};
  await assert.rejects(recordRecoveryCheckpoint(env,{},actor),e=>e.code===code);assert.equal(calls.length,0);assert.equal(db.trace.length,0);
  const state=await readRecoveryState(env);assert.equal(state.paused,true);assert.equal(state.mode,mode==='true'?'paused':'misconfigured');assert(db.trace.every(sql=>/^SELECT /.test(sql)));
 }
});
await test('only fixed reasons and authenticated actor identifiers can be recorded',async()=>{
 const env=configured(database());
 for(const input of [{bookmark},{label:'private sickness detail'},{reason:'anything'},{reason:'manual',label:'pre-upgrade'},{actor:'spoof@example.com'},[],null])await assert.rejects(recordRecoveryCheckpoint(env,input,actor),e=>e.status===400);
 for(const invalid of [undefined,{},'', 'private details', {email:'bad\nvalue@school.edu.sg'}])await assert.rejects(recordRecoveryCheckpoint(env,{},invalid),e=>e.status===400);
 assert.equal(calls.length,0);
});
await test('checkpoint verifies native Time Travel endpoint and stores only bounded provenance',async()=>{
 const db=database(),env=configured(db),result=await recordRecoveryCheckpoint(env,{reason:'pre-upgrade'},actor);
 assert.equal(calls.length,1);assert.equal(calls[0].url,`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${databaseId}/time_travel/bookmark`);assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers.Authorization,'Bearer server-only-secret');
 assert.equal(result.bookmark,bookmark);assert.equal(result.verified,true);assert.equal(result.reason,'pre-upgrade');assert.equal(result.label,'pre-upgrade');assert.equal(result.capturedAt,new Date(now).toISOString());assert.equal(result.sourceVersion,'0.9.7');assert.match(result.id,/^[a-f0-9-]{36}$/);
 const row=db.sql.prepare('SELECT * FROM gsis_recovery_checkpoints').get();assert.equal(row.actor,'admin@school.edu.sg');assert.equal(row.database_id,databaseId);assert.equal(row.verification,'cloudflare-time-travel-api');
 const state=await readRecoveryState(env);assert.equal(state.checkpointCaptureConfigured,true);assert.equal(state.checkpoints.length,1);
 for(const forbidden of ['server-only-secret','Admin@school.edu.sg','admin@school.edu.sg','privateDetails',account,databaseId])assert(!JSON.stringify(state).includes(forbidden));
 assert(!JSON.stringify(row).includes('must not persist'));
});
await test('native API errors, wrong shapes, arbitrary bookmarks and redirects cannot become verified',async()=>{
 for(const body of [{success:false,result:{bookmark}},{success:true,errors:[{code:1000,message:'secret token'}],result:{bookmark}},{success:true,result:{bookmark:'session-bookmark'}},{success:true,result:{bookmark:123}},{success:true,result:bookmark},{success:true,result:{}},{result:{bookmark}},null]){
  const db=database();response(body);await assert.rejects(recordRecoveryCheckpoint(configured(db),{},actor),e=>e.code==='GSIS_RECOVERY_VERIFY_FAILED'&&!e.message.includes('secret token'));assert.equal(db.trace.length,0);
 }
 const db=database();response({secret:'token'},403);await assert.rejects(recordRecoveryCheckpoint(configured(db),{},actor),e=>e.code==='GSIS_RECOVERY_VERIFY_FAILED');assert.equal(db.trace.length,0);
 globalThis.fetch=async()=>{throw new Error('private provider response');};await assert.rejects(recordRecoveryCheckpoint(configured(db),{},actor),e=>!e.message.includes('private provider'));
});
await test('malformed server configuration never sends credentials',async()=>{
 for(const patch of [{GSIS_RECOVERY_ACCOUNT_ID:'../../other'},{GSIS_RECOVERY_DATABASE_ID:'bad'},{GSIS_RECOVERY_CF_API_TOKEN:''},{GSIS_RELEASE_VERSION:'private details\nsecret'}])await assert.rejects(recordRecoveryCheckpoint({...configured(database()),...patch},{},actor),e=>e.code==='GSIS_RECOVERY_CONFIG');assert.equal(calls.length,0);
});
await test('status ignores unverified, wrong-database, expired and malformed records',async()=>{
 const db=database(),env=configured(db);await recordRecoveryCheckpoint(env,{},actor);
 const row=db.sql.prepare('SELECT * FROM gsis_recovery_checkpoints').get();
 for(const [id,patch]of [['old',{captured_at:now-31*86400000}],['unverified',{verification:'manual'}],['foreign',{database_id:'87654321-1234-1234-1234-123456789abc'}],['bad',{source_version:'private absence text'}]]){
  const r={...row,...patch,id};db.sql.prepare('INSERT INTO gsis_recovery_checkpoints (id,bookmark,captured_at,source_version,reason,actor,account_id,database_id,verification) VALUES (?,?,?,?,?,?,?,?,?)').run(r.id,r.bookmark,r.captured_at,r.source_version,r.reason,r.actor,r.account_id,r.database_id,r.verification);
 }
 const state=await readRecoveryState(env);assert.equal(state.checkpoints.length,1);assert.equal(state.checkpoints[0].id,row.id);assert(!JSON.stringify(state).includes('private absence'));
});
await test('checkpoint metadata remains bounded and status returns latest twenty without writes',async()=>{
 const db=database(),env=configured(db);await recordRecoveryCheckpoint(env,{},actor);const row=db.sql.prepare('SELECT * FROM gsis_recovery_checkpoints').get();
 const insert=db.sql.prepare('INSERT INTO gsis_recovery_checkpoints (id,bookmark,captured_at,source_version,reason,actor,account_id,database_id,verification) VALUES (?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<105;i++)insert.run(crypto.randomUUID(),bookmark,now-1000-i,'0.9.7','manual',row.actor,account,databaseId,row.verification);
 insert.run(crypto.randomUUID(),bookmark,now-31*86400000,'0.9.7','manual',row.actor,account,databaseId,row.verification);
 await recordRecoveryCheckpoint(env,{label:'manual'},actor);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM gsis_recovery_checkpoints').get().n,100);assert.equal(db.sql.prepare('SELECT min(captured_at) AS t FROM gsis_recovery_checkpoints').get().t>now-86400000,true);
 db.trace.length=0;const state=await readRecoveryState({...env,GSIS_RECOVERY_MODE:'true'});assert.equal(state.checkpoints.length,20);assert(db.trace.every(sql=>/^SELECT /.test(sql)));
});
await test('checkpoint storage failures are safe and never report a durable checkpoint',async()=>{
 const db=database();db.batch=async()=>{throw new Error('sensitive SQL content');};await assert.rejects(recordRecoveryCheckpoint(configured(db),{},actor),e=>e.status===503&&e.code==='GSIS_RECOVERY_STORAGE'&&!e.message.includes('sensitive'));
});
await test('equal clock timestamps retain the newly recorded checkpoint',async()=>{
 const db=database(),env=configured(db);await recordRecoveryCheckpoint(env,{},actor);
 const insert=db.sql.prepare('INSERT INTO gsis_recovery_checkpoints (id,bookmark,captured_at,source_version,reason,actor,account_id,database_id,verification) VALUES (?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<100;i++)insert.run('ffffffff-ffff-ffff-ffff-'+i.toString(16).padStart(12,'0'),bookmark,now,'0.9.7','manual','admin@school.edu.sg',account,databaseId,'cloudflare-time-travel-api');
 const saved=await recordRecoveryCheckpoint(env,{},actor);
 assert(db.sql.prepare('SELECT id FROM gsis_recovery_checkpoints WHERE id=?').get(saved.id));
 assert.equal((await readRecoveryState(env)).checkpoints[0].id,saved.id);
});
}finally{globalThis.fetch=realFetch;Date.now=realNow;}
console.log(`${passed}/${passed+failed} recovery checks passed`);if(failed)process.exitCode=1;
