// Committed date intents only; rendering and all provider calls belong to the timer.
import {ensureBackup,base64,singaporeBackupDate,notifyOutputAlert} from './edge-roster-backup.js';
import {GSISRosterOperations as Operations} from './edge-roster-domain.js';
import {outputFailure,outputErrorText} from '../../shared/edge-output-error.js';

const INTERVAL=120000,LEASE=15*60000,MAX_RAW=16*1024*1024,MAX_GZIP=8*1024*1024;
const primary=db=>db.withSession?.('first-primary')||db;
const fail=(code,message)=>{throw Object.assign(Error(message),{code,status:503});};
const collections="'absences','assignments','importedRelief','reliefCorrections','adhoc','staplerPlans','dayRevisions','dailyPublicationStates','optimisationRuns','manualDecisions'";
export const dailyBytesDigest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function readDailyConfig(db){
 const rows=(await primary(db).prepare("SELECT record_id,value_json FROM gsis_edge_records WHERE scope='roster' AND collection='systemConfig' AND record_id IN ('key:driveDaily','key:driveBackup')").all()).results||[],value=id=>JSON.parse(rows.find(r=>r.record_id===id)?.value_json||'{}'),backup=value('key:driveBackup');
 return {...Operations.normalizeDriveDaily(value('key:driveDaily'),backup),homeBaseFolderId:backup.homeBaseFolderId||''};
}
export async function ensureDailyOutputs(db,{now=Date.now()}={}){
 await ensureBackup(db);
 const queue=`INSERT INTO gsis_roster_daily_outputs(date,desired_revision) VALUES(%ROW%.record_date,%REV%) ON CONFLICT(date) DO UPDATE SET desired_revision=MAX(desired_revision,excluded.desired_revision) WHERE finalized=0;`;
 const valid=row=>`${row}.scope='roster' AND ${row}.collection IN (${collections}) AND ${row}.record_id<>'$' AND ${row}.record_date GLOB '20??-??-??'`;
 const statements=[
  `CREATE TABLE IF NOT EXISTS gsis_roster_daily_outputs(date TEXT PRIMARY KEY,desired_revision INTEGER NOT NULL,written_revision INTEGER NOT NULL DEFAULT -1,last_attempt_at INTEGER NOT NULL DEFAULT 0,last_success_at INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,finalized INTEGER NOT NULL DEFAULT 0,pending_json TEXT NOT NULL DEFAULT '',failure_count INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS gsis_daily_output_worker(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,alert_fingerprint TEXT NOT NULL DEFAULT '',pending_fingerprint TEXT NOT NULL DEFAULT '',pending_id TEXT NOT NULL DEFAULT '')`,
  'INSERT OR IGNORE INTO gsis_daily_output_worker(id) VALUES(1)',
  `CREATE TRIGGER IF NOT EXISTS gsis_daily_record_insert AFTER INSERT ON gsis_edge_records WHEN ${valid('NEW')} BEGIN ${queue.replaceAll('%ROW%','NEW').replaceAll('%REV%','NEW.revision')} END`,
  `CREATE TRIGGER IF NOT EXISTS gsis_daily_record_update AFTER UPDATE ON gsis_edge_records WHEN ${valid('NEW')} BEGIN ${queue.replaceAll('%ROW%','NEW').replaceAll('%REV%','NEW.revision')} END`,
  `CREATE TRIGGER IF NOT EXISTS gsis_daily_record_previous AFTER UPDATE ON gsis_edge_records WHEN ${valid('OLD')} AND OLD.record_date<>NEW.record_date BEGIN ${queue.replaceAll('%ROW%','OLD').replaceAll('%REV%','NEW.revision')} END`,
  `CREATE TRIGGER IF NOT EXISTS gsis_daily_record_delete AFTER DELETE ON gsis_edge_records WHEN ${valid('OLD')} BEGIN ${queue.replaceAll('%ROW%','OLD').replaceAll('%REV%',"COALESCE((SELECT revision FROM gsis_edge_heads WHERE scope='roster'),OLD.revision)")} END`,
  // One bounded row per observed date, including writes before the first timer.
  `INSERT INTO gsis_roster_daily_outputs(date,desired_revision) SELECT record_date,MAX(revision) FROM gsis_edge_records WHERE scope='roster' AND collection IN (${collections}) AND record_id<>'$' AND record_date GLOB '20??-??-??' GROUP BY record_date ON CONFLICT(date) DO UPDATE SET desired_revision=MAX(desired_revision,excluded.desired_revision) WHERE finalized=0`
 ];
 const results=await db.batch(statements.map(sql=>db.prepare(sql)));if(results.some(r=>r.success===false))fail('DAILY_OUTPUT_STORAGE','Daily output intents could not be initialised.');
}
async function encodedFile(bucket,date,revision,file){
 const bytes=file.bytes instanceof Uint8Array?file.bytes:new TextEncoder().encode(file.bytes);
 if(!['excel','log'].includes(file.kind)||bytes.length>MAX_RAW)fail('DAILY_OUTPUT_SIZE','A daily output exceeds its 16 MiB raw limit.');
 const digest=await dailyBytesDigest(bytes),gzip=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());if(gzip.length>MAX_GZIP)fail('DAILY_OUTPUT_SIZE','A daily output exceeds its 8 MiB transfer limit.');
 const key='gsis/roster/daily-outputs/'+date+'/'+revision+'/'+file.kind+'-'+digest+'.gz';await bucket.put(key,gzip,{httpMetadata:{contentType:'application/gzip'},customMetadata:{digest,kind:file.kind,date}});
 return {kind:file.kind,key,digest,bytesRaw:bytes.length,bytesCompressed:gzip.length,records:file.records||0,done:false};
}
async function readEncoded(bucket,file){
 const object=await bucket.get(file.key);if(!object)fail('DAILY_OUTPUT_MISSING','The retained daily output is missing.');
 const compressed=new Uint8Array(await object.arrayBuffer());if(compressed.length!==file.bytesCompressed||compressed.length>MAX_GZIP)fail('DAILY_OUTPUT_INTEGRITY','The retained daily output size changed.');
 const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>file.bytesRaw||size>MAX_RAW)fail('DAILY_OUTPUT_INTEGRITY','The retained output is too large.');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
 const raw=new Uint8Array(size);let at=0;for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}if(size!==file.bytesRaw||await dailyBytesDigest(raw)!==file.digest)fail('DAILY_OUTPUT_INTEGRITY','The retained daily output digest changed.');return compressed;
}
async function failureRow(db,date,revision,now,error,kind='excel'){
 await db.prepare("INSERT INTO gsis_backup_ledger(id,started_at,finished_at,kind,date,revision_to,status,error,manifest_json) VALUES(?,?,?,?,?,?,'failed',?,?)").bind(crypto.randomUUID(),now,now,kind,date,revision,outputErrorText(error),JSON.stringify({outputError:outputFailure(error,'DAILY_OUTPUT_FAILED')})).run();
}
export async function dailyOutputStatus(db,{now=Date.now()}={}){
 if(!await primary(db).prepare("SELECT 1 found FROM sqlite_master WHERE type='table' AND name='gsis_roster_daily_outputs'").first())return {available:false,dates:[],warnings:[]};
 const dates=(await primary(db).prepare('SELECT date,desired_revision,written_revision,last_attempt_at,last_success_at,next_attempt_at,finalized,failure_count,last_error FROM gsis_roster_daily_outputs ORDER BY date DESC LIMIT 90').all()).results||[];
 const files=(await primary(db).prepare("SELECT date,kind,status,revision_to,drive_file_id,drive_version,digest,finished_at,error FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY date,kind ORDER BY started_at DESC,id DESC) n FROM gsis_backup_ledger WHERE kind IN ('excel','log')) WHERE n=1 ORDER BY date DESC LIMIT 180").all()).results||[];
 const failingDates=(await primary(db).prepare('SELECT COUNT(*) n FROM gsis_roster_daily_outputs WHERE failure_count>=2').first()).n;
 return {available:true,failingDates,dates:dates.map(d=>({...d,files:files.filter(f=>f.date===d.date)})),warnings:dates.filter(d=>d.failure_count>=2).map(d=>'daily-output-failed:'+d.date)};
}
export async function runDailyOutputs(env,{now=Date.now(),bridge,prepare,seed,onComplete,quiet=async()=>false,alert,selected,limit=2}={}){
 if(env.ROSTER_EDGE_AUTHORITY!=='d1')return {enabled:false,skipped:true,exports:[],failed:0};
 const db=primary(env.GSIS_JOBS);await ensureDailyOutputs(db,{now});const config=await readDailyConfig(db);if(!config.enabled)return {enabled:false,skipped:true,exports:[],failed:0};
 const head=await db.prepare("SELECT mode FROM gsis_edge_heads WHERE scope='roster'").first();if(head?.mode!=='active')return {enabled:true,skipped:true,exports:[],failed:0};
 const token=crypto.randomUUID(),lease=await db.prepare('UPDATE gsis_daily_output_worker SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<=?').bind(token,now+LEASE,now).run();if(!lease.meta?.changes)return {enabled:true,skipped:true,code:'SKIPPED_BUSY',exports:[],failed:0};
 const started=Date.now(),today=singaporeBackupDate(now),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),result={enabled:true,exports:[],completed:0,failed:0,pending:0};
 const guard=async()=>{if(Date.now()-started>12*60000)fail('DAILY_OUTPUT_BUDGET','Daily outputs will resume at the next timer.');const owner=await db.prepare("SELECT lease_token,(SELECT mode FROM gsis_edge_heads WHERE scope='roster') mode FROM gsis_daily_output_worker WHERE id=1").first();if(owner?.lease_token!==token)fail('DAILY_OUTPUT_LEASE','The daily output lease changed.');if(owner.mode!=='active')fail('DAILY_OUTPUT_AUTHORITY','Roster is no longer active on D1.');};
 try{
  if(seed)await seed(today);
  const interrupted=(await db.prepare("SELECT DISTINCT date FROM gsis_backup_ledger WHERE kind IN ('excel','log') AND status='running' AND started_at<?").bind(now-LEASE).all()).results;
  if(interrupted.length)await db.batch([db.prepare("UPDATE gsis_backup_ledger SET status='failed',finished_at=?,error='DAILY_OUTPUT_INTERRUPTED' WHERE kind IN ('excel','log') AND status='running' AND started_at<?").bind(now,now-LEASE),...interrupted.map(r=>db.prepare("UPDATE gsis_roster_daily_outputs SET failure_count=failure_count+1,last_error='DAILY_OUTPUT_INTERRUPTED' WHERE date=?").bind(r.date))]);
  // A calendar day closes once. The retained payload survives failures and later edits.
  const auditPaused=await quiet();
  const quietReady="(?=0 OR pending_json='' OR (date<? AND json_extract(pending_json,'$.final')<>1) OR (json_extract(pending_json,'$.final')<>1 AND json_extract(pending_json,'$.sourceRevision')<desired_revision) OR EXISTS(SELECT 1 FROM json_each(pending_json,'$.files') f WHERE json_extract(f.value,'$.kind')='excel' AND json_extract(f.value,'$.done')<>1))";
  const rows=(await db.prepare("SELECT * FROM gsis_roster_daily_outputs WHERE finalized=0 AND next_attempt_at<=? AND (?='' OR date=?) AND (pending_json<>'' OR desired_revision>written_revision OR date<?) AND (last_attempt_at=0 OR last_attempt_at<=?) AND "+quietReady+" ORDER BY CASE WHEN date=? THEN 0 WHEN date=? THEN 1 WHEN date>? THEN 2 ELSE 3 END,last_attempt_at,date DESC LIMIT ?").bind(now,selected||'',selected||'',today,now-INTERVAL,auditPaused?1:0,today,today,yesterday,today,Math.max(1,Math.min(5,limit))).all()).results;
  for(const row of rows){
   let pending=row.pending_json?JSON.parse(row.pending_json):null,attempted=false;
   try{
    await guard();const final=row.date<today;
    if(!pending||final&&!pending.final||!pending.final&&pending.sourceRevision<row.desired_revision){
     const view=await prepare(row.date,{now,final});
     if(view.deferred){await db.prepare('UPDATE gsis_roster_daily_outputs SET next_attempt_at=? WHERE date=?').bind(now+INTERVAL,row.date).run();continue;}
     if(view.schoolDay===false){await db.prepare('UPDATE gsis_roster_daily_outputs SET next_attempt_at=? WHERE date=?').bind(now+86400000,row.date).run();continue;}
     if(view.schoolDay!==true||!Number.isSafeInteger(view.revision)||!Number.isSafeInteger(view.sourceRevision)||!Array.isArray(view.files)||!(view.files.some(f=>f.kind==='excel')||view.auditOnly===true&&view.files.length===1&&view.files[0].kind==='log'))fail('DAILY_OUTPUT_SOURCE','The daily source could not be verified.');
     const bucket=env.ROSTER_TIMETABLE_SNAPSHOTS;if(!bucket?.put||!bucket?.get)fail('DAILY_OUTPUT_BUCKET','Bind the private Roster output bucket.');
     pending={date:row.date,revision:view.revision,sourceRevision:view.sourceRevision,final,workbookError:view.workbookError||'',metadata:view.metadata||{},files:[]};
     for(const file of view.files)pending.files.push(await encodedFile(bucket,row.date,view.sourceRevision,file));
     await guard();await db.prepare('UPDATE gsis_roster_daily_outputs SET pending_json=? WHERE date=? AND finalized=0').bind(JSON.stringify(pending),row.date).run();
    }
    for(const file of pending.files.filter(f=>!f.done)){
     if(file.kind==='log'&&await quiet())continue;
     await guard();attempted=true;await db.prepare('UPDATE gsis_roster_daily_outputs SET last_attempt_at=? WHERE date=?').bind(now,row.date).run();
     const id=crypto.randomUUID();await db.prepare("INSERT INTO gsis_backup_ledger(id,started_at,kind,date,revision_from,revision_to,record_count,bytes_raw,bytes_compressed,digest,status,manifest_json) VALUES(?,?,?,?,?,?,?,?,?,?,'running',?)").bind(id,now,file.kind,row.date,Math.max(0,row.written_revision),pending.revision,file.records,file.bytesRaw,file.bytesCompressed,file.digest,JSON.stringify({final:pending.final,sourceRevision:pending.sourceRevision,key:file.key})).run();
     try{
      const data=await readEncoded(env.ROSTER_TIMETABLE_SNAPSHOTS,file),saved=await bridge({operation:'edgeDriveOutput',step:'daily',kind:file.kind,date:row.date,revision:pending.revision,final:pending.final,config,data:base64(data),digest:file.digest,bytesRaw:file.bytesRaw});
      if(!saved?.verified||!saved.fileId||(!saved.alreadyFinal&&saved.digest!==file.digest))fail('DAILY_OUTPUT_READBACK','Daily output read-back was not confirmed.');
      await guard();await db.prepare("UPDATE gsis_backup_ledger SET status='verified',finished_at=?,duration_ms=?,drive_file_id=?,drive_version=?,digest=?,revision_to=?,bytes_raw=? WHERE id=?").bind(Date.now(),Math.max(0,Date.now()-started),saved.fileId,String(saved.version||''),saved.digest,saved.revision??pending.revision,saved.bytes??file.bytesRaw,id).run();
      file.done=true;file.fileId=saved.fileId;file.version=saved.version||'';file.alreadyFinal=saved.alreadyFinal===true;result.completed++;await db.prepare('UPDATE gsis_roster_daily_outputs SET pending_json=? WHERE date=?').bind(JSON.stringify(pending),row.date).run();
     }catch(error){await db.prepare("UPDATE gsis_backup_ledger SET status='failed',finished_at=?,duration_ms=?,error=?,manifest_json=json_set(manifest_json,'$.outputError',json(?)) WHERE id=?").bind(Date.now(),Math.max(0,Date.now()-started),outputErrorText(error),JSON.stringify(outputFailure(error,'DAILY_OUTPUT_FAILED')),id).run();throw error;}
    }
    if(pending.files.every(f=>f.done)){
     if(onComplete)await onComplete(pending);
     if(pending.workbookError){await failureRow(db,row.date,pending.revision,now,{code:pending.workbookError});result.failed++;await db.prepare("UPDATE gsis_roster_daily_outputs SET pending_json='',failure_count=failure_count+1,last_attempt_at=?,next_attempt_at=?,last_error=? WHERE date=?").bind(now,now+INTERVAL,pending.workbookError,row.date).run();continue;}
     await db.prepare("UPDATE gsis_roster_daily_outputs SET written_revision=MAX(written_revision,?),last_success_at=?,next_attempt_at=0,pending_json='',failure_count=0,last_error='',finalized=? WHERE date=?").bind(pending.sourceRevision,now,pending.final||pending.files.every(f=>f.alreadyFinal)?1:0,row.date).run();result.exports.push({date:row.date,revision:pending.revision,final:pending.final});
    }
   }catch(error){
    if(!attempted)await failureRow(db,row.date,pending?.revision||0,now,error);
    result.failed++;result.failure={code:error.code,outputError:outputFailure(error,'DAILY_OUTPUT_FAILED')};await db.prepare('UPDATE gsis_roster_daily_outputs SET failure_count=failure_count+1,last_attempt_at=?,next_attempt_at=?,last_error=? WHERE date=?').bind(now,now+Math.min(3600000,INTERVAL*2**Math.min(row.failure_count,4)),outputErrorText(error),row.date).run();
   }
  }
  const health=await dailyOutputStatus(db,{now});
  await notifyOutputAlert(db,{kind:'daily',now,health:{...health,warnings:health.failingDates?['daily-output-failed']:[]},message:'Daily Drive outputs failing: '+health.failingDates+' dates',enabled:async()=>(await readDailyConfig(db)).enabled},alert);
  result.pending=(await db.prepare('SELECT COUNT(*) n FROM gsis_roster_daily_outputs WHERE finalized=0 AND (pending_json<>\'\' OR desired_revision>written_revision OR date<?)').bind(today).first()).n;return result;
 }finally{await db.prepare("UPDATE gsis_daily_output_worker SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?").bind(token).run();}
}
