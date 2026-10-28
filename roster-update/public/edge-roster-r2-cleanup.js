import {assertRecoveryWritable} from '../../shared/edge-recovery.js';
// Private generated timetable parts only. Canonical records and recovery objects are outside this scope.
const PREFIX='roster/timetables/v2/parts/',DAY=86400000,AGE=30*DAY,QUARANTINE=DAY,SCAN_LIMIT=50,DELETE_LIMIT=10,SCOPE='timetable-parts',schemas=new WeakMap();
const validKey=key=>/^roster\/timetables\/v2\/parts\/[a-f0-9]{64}(?:\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})?\.json\.gz$/.test(key);
const fail=(code,message)=>{throw Object.assign(Error(message),{status:503,code});};
const primary=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
const checked=value=>{if((Array.isArray(value)?value:[value]).some(row=>row?.success===false))fail('ROSTER_R2_STORAGE','A cleanup database operation could not be confirmed.');return value;};
const referenced="EXISTS(SELECT 1 FROM gsis_timetable_packages p,json_each(p.manifest_json,'$.parts') part WHERE json_extract(part.value,'$.objectKey')=?)";
const active="EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster' AND mode='active') AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster-register' AND mode='active')";
const owned="EXISTS(SELECT 1 FROM gsis_roster_r2_cleanup WHERE scope=? AND lease_token=? AND lease_until>?)";
async function ensure(db){
 if(!schemas.has(db))schemas.set(db,db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_part_tombstones (object_key TEXT PRIMARY KEY,marked_at INTEGER NOT NULL,deleted_at INTEGER,candidate_uploaded_at INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_part_candidates (object_key TEXT PRIMARY KEY,uploaded_at INTEGER NOT NULL,object_version TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS gsis_timetable_part_candidates_age ON gsis_timetable_part_candidates(first_seen,object_key)'),
  db.prepare('CREATE INDEX IF NOT EXISTS gsis_timetable_part_tombstones_pending ON gsis_timetable_part_tombstones(candidate_uploaded_at,object_key) WHERE deleted_at IS NULL'),
  db.prepare("CREATE TABLE IF NOT EXISTS gsis_roster_r2_cleanup (scope TEXT PRIMARY KEY,cursor TEXT NOT NULL DEFAULT '',completed_day TEXT NOT NULL DEFAULT '',lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,last_stats_json TEXT NOT NULL DEFAULT '{}')")
 ]).then(rows=>{if(rows.some(row=>row.success===false))fail('ROSTER_R2_STORAGE','Cleanup records could not be initialized.');}).catch(error=>{schemas.delete(db);throw error;}));await schemas.get(db);
}
async function protectedKeys(db,keys){if(!keys.length)return new Set();const rows=await primary(db).prepare("SELECT DISTINCT json_extract(part.value,'$.objectKey') object_key FROM gsis_timetable_packages p,json_each(p.manifest_json,'$.parts') part WHERE json_extract(part.value,'$.objectKey') IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).all();return new Set((rows.results||[]).map(row=>row.object_key));}
const uploaded=object=>object?.uploaded instanceof Date?object.uploaded.getTime():NaN;
function candidateStatement(db,object,now){
 return db.prepare('INSERT INTO gsis_timetable_part_candidates(object_key,uploaded_at,object_version,first_seen,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(object_key) DO UPDATE SET uploaded_at=excluded.uploaded_at,object_version=excluded.object_version,first_seen=CASE WHEN uploaded_at=excluded.uploaded_at AND object_version=excluded.object_version THEN first_seen ELSE excluded.first_seen END,last_seen=excluded.last_seen').bind(object.key,uploaded(object),String(object.version||''),now,now);
}
async function noteCandidate(db,object,now){checked(await candidateStatement(primary(db),object,now).run());}
export async function runRosterR2Cleanup(env,{now=Date.now(),dryRun=false}={}){
 assertRecoveryWritable(env);
 if(env.ROSTER_EDGE_AUTHORITY!=='d1')return {dryRun,scanned:0,deleted:0,skipped:true,reason:'authority-disabled'};
 const db=env.GSIS_JOBS,bucket=env.ROSTER_TIMETABLE_SNAPSHOTS;if(!db?.prepare||!db?.batch||!bucket?.list||!bucket?.head||!dryRun&&!bucket?.delete)fail('ROSTER_R2_SETUP','Bind the private timetable bucket and D1 before running cleanup.');if(!Number.isFinite(now))fail('ROSTER_R2_CLOCK','Cleanup requires a valid server time.');
 const clock=()=>Math.max(now,Date.now()),day=new Date(now+28800000).toISOString().slice(0,10),stats={dryRun,scanned:0,protected:0,young:0,quarantined:0,deleted:0,wouldDelete:0,missing:0,failed:0};
 const tables=(await primary(db).prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('gsis_edge_heads','gsis_timetable_packages')").all()).results||[];if(tables.length!==2)return {...stats,skipped:true,reason:'authority-unavailable'};
 if(!(await primary(db).prepare('SELECT 1 ready WHERE '+active).first()))return {...stats,skipped:true,reason:'authority-inactive'};
 // Unknown/corrupt manifest shapes cannot prove that an object is unreferenced.
 if(await primary(db).prepare("SELECT 1 invalid FROM gsis_timetable_packages WHERE CASE WHEN json_valid(manifest_json) THEN COALESCE(json_type(manifest_json,'$.parts'),'')<>'object' ELSE 1 END LIMIT 1").first())fail('ROSTER_R2_MANIFEST_UNVERIFIED','A package manifest needs review before cleanup can proceed.');
 await ensure(db);const token=crypto.randomUUID();let claimed=false,finished=false;
 if(!dryRun){const claim=await primary(db).prepare("INSERT INTO gsis_roster_r2_cleanup(scope,lease_token,lease_until) SELECT ?,?,? WHERE "+active+" ON CONFLICT(scope) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE gsis_roster_r2_cleanup.completed_day<? AND gsis_roster_r2_cleanup.lease_until<=?").bind(SCOPE,token,clock()+900000,day,clock()).run();checked(claim);if(claim.meta?.changes!==1)return {...stats,skipped:true,reason:'already-run-or-leased'};claimed=true;}
 try{
  const state=await primary(db).prepare('SELECT cursor FROM gsis_roster_r2_cleanup WHERE scope=?').bind(SCOPE).first(),page=await bucket.list({prefix:PREFIX,limit:SCAN_LIMIT,...(state?.cursor?{cursor:state.cursor}:{})});
  if(!Array.isArray(page.objects)||page.objects.length>SCAN_LIMIT||page.truncated&&typeof page.cursor!=='string')fail('ROSTER_R2_LIST','The bucket scan did not return a valid bounded page.');
  stats.scanned=page.objects.length;const keys=page.objects.map(object=>object.key).filter(validKey),live=await protectedKeys(db,keys),scanWrites=[];
  for(const object of page.objects){if(!validKey(object.key))continue;if(live.has(object.key)){stats.protected++;if(!dryRun)scanWrites.push(db.prepare('DELETE FROM gsis_timetable_part_candidates WHERE object_key=?').bind(object.key));continue;}
   const age=uploaded(object);if(!Number.isFinite(age)||age>now-AGE){stats.young++;if(!dryRun)scanWrites.push(db.prepare('DELETE FROM gsis_timetable_part_candidates WHERE object_key=?').bind(object.key));continue;}
   stats.quarantined++;if(!dryRun)scanWrites.push(candidateStatement(db,object,clock()),db.prepare('UPDATE gsis_timetable_part_tombstones SET deleted_at=NULL WHERE object_key=? AND deleted_at IS NOT NULL').bind(object.key));
  }
  if(scanWrites.length)checked(await primary(db).batch(scanWrites));
  // Retry interrupted deletions first. Tombstones never expire: writers must
  // use a new path and promotion must reject a retired path atomically.
  const pending=(await primary(db).prepare('SELECT object_key,candidate_uploaded_at uploaded_at,1 retired FROM gsis_timetable_part_tombstones WHERE deleted_at IS NULL AND candidate_uploaded_at<=? ORDER BY candidate_uploaded_at,object_key LIMIT ?').bind(now-AGE,DELETE_LIMIT).all()).results||[];
  const candidates=pending.length===DELETE_LIMIT?[]:(await primary(db).prepare('SELECT object_key,uploaded_at,object_version,first_seen,0 retired FROM gsis_timetable_part_candidates c WHERE first_seen<=? AND uploaded_at<=? AND NOT EXISTS(SELECT 1 FROM gsis_timetable_part_tombstones t WHERE t.object_key=c.object_key) ORDER BY first_seen,object_key LIMIT ?').bind(now-QUARANTINE,now-AGE,DELETE_LIMIT-pending.length).all()).results||[];
  for(const candidate of [...pending,...candidates]){
   const key=candidate.object_key;if(!validKey(key))fail('ROSTER_R2_CANDIDATE','A cleanup candidate is outside the generated cache scope.');
   try{
    const probe=await primary(db).prepare('SELECT '+referenced+' protected,'+(dryRun?'1':owned+' AND '+active)+' owned').bind(key,...(dryRun?[]:[SCOPE,token,clock()])).first();
    if(!probe.owned)return {...stats,skipped:true,reason:'lease-lost'};
    if(probe.protected){stats.protected++;if(!dryRun)checked(await primary(db).prepare('DELETE FROM gsis_timetable_part_candidates WHERE object_key=?').bind(key).run());continue;}
    const object=await bucket.head(key);if(!object){stats.missing++;if(!dryRun)checked(await primary(db).batch([db.prepare('DELETE FROM gsis_timetable_part_candidates WHERE object_key=?').bind(key),db.prepare('UPDATE gsis_timetable_part_tombstones SET deleted_at=? WHERE object_key=?').bind(clock(),key)]));continue;}
    const age=uploaded(object);if(!Number.isFinite(age)||age>now-AGE||!candidate.retired&&(age!==candidate.uploaded_at||String(object.version||'')!==candidate.object_version)){
     stats.young++;if(!dryRun&&Number.isFinite(age)){await noteCandidate(db,object,clock());if(candidate.retired)checked(await primary(db).prepare('UPDATE gsis_timetable_part_tombstones SET candidate_uploaded_at=? WHERE object_key=?').bind(age,key).run());}continue;
    }
    if(dryRun){stats.wouldDelete++;continue;}
    if(!candidate.retired){
     const mark=await primary(db).prepare('INSERT INTO gsis_timetable_part_tombstones(object_key,marked_at,deleted_at,candidate_uploaded_at) SELECT ?,?,NULL,? WHERE '+owned+' AND '+active+' AND EXISTS(SELECT 1 FROM gsis_timetable_part_candidates WHERE object_key=? AND uploaded_at=? AND object_version=? AND first_seen<=?) AND NOT '+referenced+' ON CONFLICT(object_key) DO NOTHING').bind(key,clock(),age,SCOPE,token,clock(),key,age,String(object.version||''),now-QUARANTINE,key).run();
     checked(mark);if(mark.meta?.changes!==1){stats.protected++;continue;}
    }
    // Reference exclusion and retirement are one D1 write; no future package
    // can legally publish this key while an unconditional R2 delete is pending.
    await bucket.delete(key);stats.deleted++;
    checked(await primary(db).batch([db.prepare('UPDATE gsis_timetable_part_tombstones SET deleted_at=? WHERE object_key=?').bind(clock(),key),db.prepare('DELETE FROM gsis_timetable_part_candidates WHERE object_key=?').bind(key)]));
   }catch{stats.failed++;}
  }
  if(!dryRun){const done=await primary(db).prepare("UPDATE gsis_roster_r2_cleanup SET cursor=?,completed_day=?,lease_token='',lease_until=0,last_stats_json=? WHERE scope=? AND lease_token=?").bind(page.truncated?page.cursor:'',day,JSON.stringify(stats),SCOPE,token).run();checked(done);finished=done.meta?.changes===1;if(!finished)return {...stats,skipped:true,reason:'lease-lost'};}
  return stats;
 }finally{if(claimed&&!finished)await primary(db).prepare("UPDATE gsis_roster_r2_cleanup SET lease_token='',lease_until=0 WHERE scope=? AND lease_token=?").bind(SCOPE,token).run();}
}
