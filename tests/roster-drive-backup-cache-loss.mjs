import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {captureBackup,backupPayload,runDriveBackup} from '../roster-update/public/edge-roster-backup.js';
import {readBackupChain} from '../roster-update/public/edge-roster-backup-restore.js';
import {runRecoveryTimetableCleanup} from '../roster-update/public/roster-recovery-timetable-cache.js';
import {sha256Hex as hash} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const now=Date.parse('2026-11-12T02:15:00+08:00'),day=86400000;
async function fixture(){
 const db=database();
 for(const [scope,state] of [['roster',{schema:1,revision:1,absences:[{id:'synthetic',date:'2026-11-12'}],systemConfig:{driveBackup:{enabled:true,homeBaseFolderId:'home',folderId:'backups'}}}],['roster-register',{schema:1,revision:1,entries:[]}]]){
  const store=Store.open(db,scope);await store.importState({state,actor:'fixture',requestId:scope,digest:await Store.digest(state)});const h=await store.head();await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});
 }
 const raw=JSON.stringify({lessons:[{subject:'Synthetic'}]}),bytes=gzipSync(raw),partKey=hash(raw),encodedKey=hash(bytes.toString('base64')),objectKey=`roster/timetables/recovery-v1/parts/${partKey}.${encodedKey}.json.gz`;
 const manifest=JSON.stringify({header:{schema:1,stage:'baseline',sourceKey:'a'.repeat(64),authorityKey:'b'.repeat(64),baselineKey:'c'.repeat(64),from:'2026-11-10',to:'2026-12-10'},payload:{stage:'baseline',models:[{id:'synthetic',partKey}],modelKeys:{synthetic:'d'.repeat(64)}},parts:{[partKey]:{key:partKey,encodedKey,bytes:Buffer.byteLength(raw),objectKey}}});
 await db.prepare('CREATE TABLE gsis_recovery_timetable_heads(scope TEXT PRIMARY KEY,published INTEGER,current_json TEXT,current_hash TEXT,previous_json TEXT,previous_hash TEXT,updated_at INTEGER)').run();
 await db.prepare('INSERT INTO gsis_recovery_timetable_heads VALUES(?,?,?,?,NULL,NULL,?)').bind('baseline',1,manifest,hash(manifest),now-2*day).run();
 const objects=new Map([[objectKey,bytes]]),meta={key:objectKey,uploaded:new Date(now-3*day),version:'fixture'},bucket={get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k)}:null,put:async()=>assert.fail('No cache writes needed'),list:async()=>({objects:objects.has(objectKey)?[meta]:[],truncated:false}),head:async k=>objects.has(k)?meta:null,delete:async k=>objects.delete(k)};
 return {db,objects,objectKey,partKey,bucket,env:{GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_SNAPSHOT_CACHE:'true',ROSTER_TIMETABLE_SNAPSHOTS:bucket}};
}
// Capture protects a consistent D1 copy, but does not pin derived R2 parts.
// The real cleanup retires the live head and then deletes its old candidate.
const f=await fixture(),run=await captureBackup(f.db,{now});
await runRecoveryTimetableCleanup(f.env,{now,dryRun:true});
await f.db.prepare('INSERT INTO gsis_recovery_timetable_candidates VALUES(?,?,?,?)').bind(f.objectKey,now-3*day,'fixture',now-2*day).run();
const realNow=Date.now;let cleaned;try{Date.now=()=>now;cleaned=await runRecoveryTimetableCleanup(f.env,{now});}finally{Date.now=realNow;}assert.equal(cleaned.deleted,1);assert.equal(f.objects.has(f.objectKey),false);
assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_backup_items WHERE run_id=? AND scope=\'cache\'').get(run.id).n,1,'captured head still names the removed synthetic part');
const payload=await backupPayload(f.env,run,1);assert(!payload.rows.some(r=>r.scope==='cache'));assert.deepEqual(payload.missingCacheParts,[{scope:'baseline',version:'current',partKey:f.partKey,reason:'missing'}]);
const broken=await fixture();broken.objects.set(broken.objectKey,gzipSync('{}'));const brokenRun=await captureBackup(broken.db,{now});assert.equal((await backupPayload(broken.env,brokenRun,1)).missingCacheParts[0].reason,'digest-mismatch');
// Missing cache entries are recorded in the verified Drive manifest. Reading
// the chain retains authoritative state and leaves cache reconstruction to misses.
const complete=await fixture();complete.objects.clear();const files=new Map();let next=0;
const bridge=async p=>{if(p.step==='readBackup')return files.get(p.fileId);const fileId='synthetic-'+ ++next;files.set(fileId,{name:p.name,...p.data?{data:p.data}:{text:p.text}});const v=p.data?JSON.parse(gunzipSync(Buffer.from(p.data,'base64'))):null;return {fileId,verified:true,digest:p.digest,...v?{counts:v.counts,records:v.rows.length}:{}};};
assert.equal((await runDriveBackup(complete.env,{now,bridge})).verified,true);
const row=complete.db.sql.prepare("SELECT * FROM gsis_backup_ledger WHERE status='verified'").get(),manifest=JSON.parse(row.manifest_json);assert.equal(manifest.missingCacheParts[0].reason,'missing');const chain=await readBackupChain({manifestFileId:row.drive_file_id,config:{},bridge});assert.equal(chain.state.absences[0].id,'synthetic');assert.equal(chain.evidence.filter(r=>r.scope==='cache').length,0);
// An authoritative packed audit digest must still fail closed.
const strict=await fixture();strict.db.sql.prepare("INSERT INTO gsis_edge_records(scope,collection,record_id,position,record_date,value_json,revision) VALUES('roster','audit','id:bad',0,'',?,1)").run(JSON.stringify({id:'bad',evidence:{encoding:'gzip-audit-v1',digest:'0'.repeat(64),data:gzipSync('{}').toString('base64')}}));const strictRun=await captureBackup(strict.db,{now});await assert.rejects(backupPayload(strict.env,strictRun,2),e=>e.code==='BACKUP_DIGEST');
console.log('captured-cache cleanup race, missing/corrupt derived entries, verified manifest, authoritative digest rejection pass');
