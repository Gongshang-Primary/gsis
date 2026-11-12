import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {GSISRosterOperations as Operations} from '../roster-update/public/edge-roster-domain.js';
import {captureBackup,heartbeatBackup,expireBackupRuns,runDriveBackup,TIER_ONE} from '../roster-update/public/edge-roster-backup.js';
import {readBackupChain,restoreBackupChain} from '../roster-update/public/edge-roster-backup-restore.js';
import worker from '../notification-worker/index.js';
import {runBackupJobs} from '../roster-update/public/edge-roster-backup-jobs.js';
import {sha256Hex as hash} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const now=Date.parse('2026-11-12T02:15:00+08:00'),minute=60000;
async function fixture(large=false){
 const db=database(),raw=JSON.stringify({allocations:Array.from({length:15},(_,n)=>({staffId:'synthetic-'+n,period:n,reason:'synthetic evidence'}))}),packed={encoding:'gzip-audit-v1',bytes:Buffer.byteLength(raw),digest:hash(raw),data:gzipSync(raw).toString('base64')};
 for(const [scope,input] of [['roster',{schema:1,revision:1,systemConfig:{driveBackup:{enabled:true,homeBaseFolderId:'home',folderId:'backups'}},absences:Array.from({length:large?1000:1},(_,i)=>({id:'synthetic-'+i,date:'2026-11-12',staffId:'synthetic-'+i})),audit:large?Array.from({length:13000},(_,i)=>({id:'history-'+i,date:'2026-11-12',decisionEvidence:packed})):[]}],['roster-register',{schema:1,revision:1,entries:[]}]]){
  const state=scope==='roster'?Operations.validateState({...Operations.initial(),...input}):input;
  const store=Store.open(db,scope);await store.importState({state,actor:'fixture',requestId:scope,digest:await Store.digest(state),source:{sourceDigest:'a'.repeat(64),manifestDigest:'b'.repeat(64)}});const h=await store.head();await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});await db.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.importSession',?) WHERE scope=?").bind('c'.repeat(64),scope).run();
 }return db;
}
const db=await fixture(),run=await captureBackup(db,{now});
await heartbeatBackup(db,run,{now:now+14*minute,progress:{stage:'export-tier-1',records:100}});
await expireBackupRuns(db,now+16*minute);assert.equal(db.sql.prepare('SELECT status FROM gsis_backup_ledger WHERE id=?').get(run.id).status,'running','progress survives the old 16-minute boundary');
assert.equal((await captureBackup(db,{now:now+16*minute})).busy,true);
await heartbeatBackup(db,run,{now:now+28*minute,progress:{stage:'export-tier-1',records:200}});
await expireBackupRuns(db,now+44*minute);const dead=db.sql.prepare('SELECT * FROM gsis_backup_ledger WHERE id=?').get(run.id);assert.equal(dead.status,'failed');
await expireBackupRuns(db,now+50*minute);assert.deepEqual(db.sql.prepare('SELECT * FROM gsis_backup_ledger WHERE id=?').get(run.id),dead,'dead run fails once');
await assert.rejects(heartbeatBackup(db,run,{now:now+50*minute}),e=>e.code==='BACKUP_LEASE');
assert(db.sql.prepare('SELECT COUNT(*) n FROM gsis_backup_items WHERE run_id=?').get(run.id).n>0,'captured records retained');
let attempts=0;const fault=async()=>{attempts++;throw Object.assign(Error('synthetic outage'),{code:'BACKUP_SYNTHETIC'});};
for(let n=0;n<60;n++)assert.equal((await runDriveBackup({GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'},{now:now+(44+n)*minute,bridge:fault})).code,'SKIPPED_BACKOFF');
assert.equal(attempts,0);assert.equal((await runDriveBackup({GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'},{now:now+104*minute,bridge:fault})).failed,1);assert.equal(attempts,1);
for(let n=1;n<60;n++)assert.equal((await runDriveBackup({GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'},{now:now+(104+n)*minute,bridge:fault})).code,'SKIPPED_BACKOFF');
assert.equal(attempts,1);
// The real timer entry records the backoff in gsis_job_health.
const originalNow=Date.now,originalFetch=globalThis.fetch;let networkCalls=0;
try{
 Date.now=()=>now+105*minute;globalThis.fetch=async()=>{networkCalls++;throw Error('No provider request is allowed in this fixture');};
 const tasks=[];await worker.scheduled({cron:'1-59/2 * * * *',scheduledTime:Date.now()},{GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',WHATSAPP_ENABLED:'false'},{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);
 const health=db.sql.prepare("SELECT counts_json FROM gsis_job_health WHERE job='drive-outputs'").get();assert.equal(JSON.parse(health.counts_json).backoff,1);assert(JSON.parse(health.counts_json).backoffSeconds>0);assert.equal(networkCalls,0);
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
// Real current-format rows, including compressed historical audit evidence.
const large=await fixture(true),files=new Map();let serial=0;
const bridge=async p=>{if(p.step==='readBackup')return files.get(p.fileId);const fileId='synthetic-'+ ++serial;files.set(fileId,{name:p.name,...p.data?{data:p.data}:{text:p.text}});const payload=p.data?JSON.parse(gunzipSync(Buffer.from(p.data,'base64'))):null;return {verified:true,fileId,digest:p.digest,...payload?{counts:payload.counts,records:payload.rows.length}:{}};};
const start=performance.now(),env={GSIS_JOBS:large,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_BACKUP_SCRATCH_DB:database(),ROSTER_BACKUP_SCRATCH_BUCKET:{}};assert.equal((await runBackupJobs(env,{now,bridge})).failed,0);assert.equal(large.sql.prepare("SELECT status FROM gsis_backup_ledger WHERE kind='restore-test'").get().status,'verified','scheduled drill verifies the new full');const elapsed=performance.now()-start;
const saved=large.sql.prepare("SELECT * FROM gsis_backup_ledger WHERE kind='full' AND status='verified'").get(),manifest=JSON.parse(saved.manifest_json);assert(saved.record_count>=14000);assert(elapsed<15*minute);assert(manifest.progress.timings.exportTier2Ms>0);
const chain=await readBackupChain({manifestFileId:saved.drive_file_id,config:{},bridge}),target=database(),result=await restoreBackupChain({sourceDb:large,targetDb:target,targetBucket:{},chain,actor:'synthetic',requestId:'synthetic-restore'});assert.equal(result.verified,true);
const source=(await Store.open(large,'roster').load()).state,restored=(await Store.open(target,'roster').load()).state;for(const key of TIER_ONE)if(source[key]!==undefined)assert.deepEqual(restored[key],source[key],key);
assert.equal((await runDriveBackup(env,{now:now+60*minute,bridge})).full,false,'verified full unlocks increments');
const progressing=await fixture();let virtual=now;const continuing=await runDriveBackup({GSIS_JOBS:progressing,ROSTER_EDGE_AUTHORITY:'d1'},{now,bridge,clock:()=>virtual,onProgress:async()=>{virtual+=2*minute;}});assert.equal(continuing.verified,true);assert(virtual-now>16*minute,'pipeline progress continues past the previous expiry boundary');
assert.equal(progressing.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE error='BACKUP_LEASE_EXPIRED'").get().n,0);
// Ten slow synthetic cache reads span twenty minutes. A second scheduled
// invocation must see the renewed outer lease and never start another full.
const timed=await fixture(),parts={},objects=new Map();
for(let n=0;n<10;n++){const raw=JSON.stringify({synthetic:n}),bytes=gzipSync(raw),partKey=hash(raw),encodedKey=hash(bytes.toString('base64')),key=`roster/timetables/recovery-v1/parts/${partKey}.${encodedKey}.json.gz`;parts[partKey]={objectKey:key,encodedKey,bytes:Buffer.byteLength(raw)};objects.set(key,bytes);}
const cache=JSON.stringify({header:{stage:'baseline'},payload:{models:[]},parts});
await timed.prepare('CREATE TABLE gsis_recovery_timetable_heads(scope TEXT,published INTEGER,current_json TEXT,current_hash TEXT,previous_json TEXT,previous_hash TEXT)').run();
await timed.prepare('INSERT INTO gsis_recovery_timetable_heads VALUES(?,?,?,?,NULL,NULL)').bind('baseline',1,cache,hash(cache)).run();
let clockNow=now,competed=false;const realNow=Date.now;
const timedEnv={GSIS_JOBS:timed,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_BACKUP_SCRATCH_DB:database(),ROSTER_BACKUP_SCRATCH_BUCKET:{},ROSTER_TIMETABLE_SNAPSHOTS:{get:async key=>{clockNow+=2*minute;return {arrayBuffer:async()=>objects.get(key)};}}};
try{
 Date.now=()=>clockNow;
 const result=await runBackupJobs(timedEnv,{now,bridge:async p=>{
  if(!competed){competed=true;assert(clockNow-now>=20*minute);const overlap=await runBackupJobs(timedEnv,{now:clockNow,bridge:async()=>assert.fail('second cron must not upload')});assert.equal(overlap.code,'SKIPPED_BUSY');}
  return bridge(p);
 }});
 assert.equal(result.failed,0);assert.equal(timed.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE kind='full'").get().n,1);assert.equal(timed.sql.prepare("SELECT status FROM gsis_backup_ledger WHERE kind='full'").get().status,'verified');
}finally{Date.now=realNow;}
console.log(JSON.stringify({records:saved.record_count,fullMs:Math.round(elapsed),stages:manifest.progress.timings}));
console.log('progress lease, single expiry, retained capture, hourly fault backoff, 14k full, restore round-trip and increment pass');
