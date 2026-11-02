import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url),Import=require('../shared/roster-import.js'),database=require('./helpers/chunked-import-db.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function bucket(){const objects=new Map();return {objects,fail:false,corrupt:false,async put(key,value){if(this.fail)throw Error('private upload failure');objects.set(key,Buffer.from(value));},async get(key){const data=objects.get(key);if(!data)return null;const bytes=Buffer.from(data);if(this.corrupt)bytes[0]^=1;return {size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}};}
const tables=['gsis_roster_import_sessions','gsis_roster_import_preparation','gsis_roster_import_locks','gsis_roster_import_parts','gsis_roster_import_rows','gsis_roster_import_jobs'];
async function fixture(){const db=database(),r2=bucket();await Import.ensure(db);db.sql.exec("CREATE TABLE gsis_roster_import_jobs(session_id TEXT PRIMARY KEY,identity_json TEXT,state TEXT,claim_token TEXT,lease_until INTEGER,next_at INTEGER,error_code TEXT,updated_at INTEGER)");
 for(let i=0;i<8;i++){const id=String(i+1).repeat(64);db.sql.prepare("INSERT INTO gsis_roster_import_sessions(session_id,actor,request_id,state,created_at,updated_at) VALUES(?,?,?,'abandoned',?,?)").run(id,'admin@fixture.test','request-'+i,i+1,i+1);db.sql.prepare('INSERT INTO gsis_roster_import_preparation(session_id,checkpoint_json,result_json,updated_at) VALUES(?,?,?,?)').run(id,JSON.stringify({step:i,name:'保留 é 😀'}),JSON.stringify({failureReason:'retained original failure'}),i+1);db.sql.prepare("INSERT INTO gsis_roster_import_parts(session_id,part_id,ordinal,kind,scope,digest,bytes,records,receipt_json) VALUES(?,'part-00000',0,'records','roster',?,100,1,?)").run(id,'a'.repeat(64),JSON.stringify({uncertain:true,provider:'retain-original'}));db.sql.prepare("INSERT INTO gsis_roster_import_rows(session_id,scope,collection,record_id,position,record_date,value_json) VALUES(?,'roster','audit','original',0,'2026-11-02',?)").run(id,JSON.stringify({at:'2026-11-02T00:00:00Z',text:'exact original \n content',nested:{accepted:false}}));db.sql.prepare("INSERT INTO gsis_roster_import_jobs VALUES(?,?,'attention','',0,0,'ORIGINAL_FAILURE',?)").run(id,JSON.stringify({email:'admin@fixture.test'}),i+1);}
 const protectedId='f'.repeat(64);db.sql.prepare("INSERT INTO gsis_roster_import_sessions(session_id,actor,request_id,state,created_at,updated_at) VALUES(?,'admin@fixture.test','active-evidence','imported',0,0)").run(protectedId);
 return {db,r2,protectedId};}
async function drain(f){let result;for(let n=0;n<300;n++){result=await Import.archiveRetained(f.db,f.r2,{maxSteps:3});if(!result.pending)return result;}assert.fail('archive did not finish within bounded resumable calls');}
assert.equal(Import.MAX_RETAINED_SESSIONS,24,'R8 raises admission to 24 retained sessions');
{
 const f=await fixture();try{
 for(let i=0;i<160;i++)f.db.sql.prepare("INSERT INTO gsis_roster_import_rows(session_id,scope,collection,record_id,position,record_date,value_json) VALUES(?,'roster','audit',?,?,?,?)").run('1'.repeat(64),'large-'+i,i+1,'2026-11-02',JSON.stringify({id:i,text:'保留'.repeat(600)}));
 f.db.sql.prepare("INSERT INTO gsis_roster_import_rows(session_id,scope,collection,record_id,position,record_date,value_json) VALUES(?,'roster','audit','large-single',999,'2026-11-02',?)").run('1'.repeat(64),JSON.stringify({text:'x'.repeat(1800000)}));
 const before=new Map();for(const table of tables)before.set(table,JSON.parse(JSON.stringify(f.db.sql.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())));
 await drain(f);const retained=f.db.sql.prepare('SELECT session_id FROM gsis_roster_import_sessions ORDER BY created_at').all().map(r=>r.session_id);assert.deepEqual(retained,[f.protectedId,'7'.repeat(64),'8'.repeat(64)],'keep newest two and every non-abandoned session');
 const archives=f.db.sql.prepare("SELECT * FROM gsis_roster_import_archives WHERE state='archived' ORDER BY session_id").all();assert.equal(archives.length,6);
 const first=JSON.parse(gunzipSync(f.r2.objects.get(archives[0].manifest_key)));assert(first.parts.filter(p=>p.table==='gsis_roster_import_rows').length>2,'large records paginate within bounded archive steps');assert(first.parts.every(p=>p.bytes<2000000),'one large row never causes broad source buffering');
 for(const archive of archives){const zipped=f.r2.objects.get(archive.manifest_key),raw=gunzipSync(zipped);assert.equal(hash(raw),archive.manifest_digest);const manifest=JSON.parse(raw);assert.equal(manifest.sessionId,archive.session_id);
  for(const table of tables){const rows=[];for(const part of manifest.parts.filter(p=>p.table===table)){const compressed=f.r2.objects.get(part.key);assert.equal(hash(compressed),part.gzipDigest);const payload=gunzipSync(compressed);assert.equal(hash(payload),part.digest);rows.push(...JSON.parse(payload).rows);}assert.deepEqual(rows,before.get(table).filter(r=>r.session_id===archive.session_id),'exact archived '+table+' round trip');}
 }
 const calls=f.r2.objects.size;await drain(f);assert.equal(f.r2.objects.size,calls,'retry after completion writes no duplicate objects');
 await assert.rejects(Import.open(f.db,{actor:'admin@fixture.test',requestId:'request-0',sessionId:'1'.repeat(64)}).reserve(),e=>e.code==='ROSTER_IMPORT_ARCHIVED','archived request identity cannot be rebound to new data');
 const b={actor:'new-admin@fixture.test',requestId:'new-import-after-archive',sessionId:'e'.repeat(64)};assert.equal((await Import.open(f.db,b).reserve()).state,'preparing','new import starts after archival');
 }finally{f.db.sql.close();}
}
{
 const f=await fixture();try{f.r2.fail=true;await assert.rejects(Import.archiveRetained(f.db,f.r2,{maxSteps:4}),/upload failure/);assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,9,'failed upload deletes nothing');f.r2.fail=false;await drain(f);assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,3);}finally{f.db.sql.close();}
}
{
 const f=await fixture();try{
 await Import.archiveRetained(f.db,f.r2,{maxSteps:1});const job=f.db.sql.prepare("SELECT * FROM gsis_roster_import_archives WHERE state='copying'").get();assert(job);
 assert.throws(()=>f.db.sql.prepare('UPDATE gsis_roster_import_preparation SET result_json=? WHERE session_id=?').run('changed',job.session_id),/ROSTER_IMPORT_ARCHIVING/,'copying freezes the exact source across calls');
 f.r2.corrupt=true;await assert.rejects(Import.archiveRetained(f.db,f.r2,{maxSteps:20}),/verif|archive/i);assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,9,'failed readback deletes nothing');f.r2.corrupt=false;await drain(f);
 }finally{f.db.sql.close();}
}
{
 const f=await fixture();try{
 f.db.sql.exec("CREATE TRIGGER interrupt_archive_delete BEFORE DELETE ON gsis_roster_import_parts BEGIN SELECT RAISE(ABORT,'archive commit interrupted'); END");
 await assert.rejects(drain(f),/commit interrupted/);assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,9,'failed final transaction keeps every source row');assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_rows').get().n,8,'earlier child-table deletes roll back with the failed batch');f.db.sql.exec('DROP TRIGGER interrupt_archive_delete');await drain(f);assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,3);
 }finally{f.db.sql.close();}
}
{
 const f=await fixture();try{let row;for(let i=0;i<40;i++){await Import.archiveRetained(f.db,f.r2,{maxSteps:1});row=f.db.sql.prepare("SELECT * FROM gsis_roster_import_archives WHERE state='copying'").get();if(JSON.parse(row.cursor_json).phase==='verify')break;}const part=JSON.parse(row.manifest_json).parts[0],saved=f.r2.objects.get(part.key);f.r2.objects.set(part.key,Buffer.from('altered after copying'));await assert.rejects(Import.archiveRetained(f.db,f.r2,{maxSteps:1}),e=>e.code==='ROSTER_IMPORT_ARCHIVE_VERIFY');assert.equal(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,9,'final verification re-reads earlier checkpointed pages before deletion');f.r2.objects.set(part.key,saved);await drain(f);}finally{f.db.sql.close();}
}
{
 const db=database();try{await Import.ensure(db);for(let i=0;i<24;i++)db.sql.prepare("INSERT INTO gsis_roster_import_sessions(session_id,actor,request_id,state,created_at,updated_at) VALUES(?,?,?,'failed',?,?)").run(hash('session-'+i),'admin@fixture.test','request-'+i,i,i);await assert.rejects(Import.open(db,{actor:'admin@fixture.test',requestId:'at-capacity',sessionId:'f'.repeat(64)}).reserve(),e=>e.code==='ROSTER_IMPORT_CAPACITY');assert.equal((await Import.archiveRetained(db,bucket())).pending,0,'non-abandoned sessions remain protected even at capacity');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,24);}finally{db.sql.close();}
}
{
 const f=await fixture();try{let resume,entered;const waiting=new Promise(r=>{entered=r}),gate=new Promise(r=>{resume=r}),put=f.r2.put.bind(f.r2);let once=true;f.r2.put=async(...args)=>{if(once){once=false;entered();await gate;}return put(...args);};const first=Import.archiveRetained(f.db,f.r2,{maxSteps:1});await waiting;const competing=await Import.archiveRetained(f.db,f.r2,{maxSteps:1});assert.equal(competing.busy,true,'concurrent archiver cannot steal the lease');resume();await first;await drain(f);}finally{f.db.sql.close();}
}
console.log('PASS R8 exact gzip/manifest round trip, retention, bounded recovery, upload/readback failure, frozen source, idempotency and new import');
