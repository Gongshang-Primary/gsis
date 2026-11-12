// The notification Worker is the only execution owner. Admin requests enqueue.
import {GSiSEdgeStore as Store} from './edge-store.js';
import {ensureBackup,readBackupConfig,runDriveBackup,backupStatus,singaporeBackupDate,notifyOutputAlert,expireBackupRuns} from './edge-roster-backup.js';
import {readBackupChain,restoreBackupChain} from './edge-roster-backup-restore.js';
import {outputFailure,outputErrorText} from '../../shared/edge-output-error.js';
import {GSISRosterAllocation as Allocation} from './edge-roster-domain.js';
const fail=(code,message)=>{throw Object.assign(Error(message),{code,status:409});};
const safe=e=>/^[A-Z][A-Z0-9_]{0,79}$/.test(e?.code||'')?e.code:'BACKUP_JOB_FAILED';
const primary=db=>db.withSession?.('first-primary')||db;
export function buildContinuityView(state,ctx,dates){
 const people=new Map(ctx.people.map(p=>[p.id,p])),name=id=>people.get(id)?.name||people.get(state.absences.find(a=>a.id===id)?.staffId)?.name||id||'';
 const days=dates.map(date=>({date,stapler:state.staplerPlans.some(p=>p.date===date&&(p.confirmed||p.published)),
  absences:state.absences.filter(a=>a.date===date&&!a.deletedAt).map(a=>({teacher:name(a.staffId),periods:Allocation.absencePeriods(a,ctx.days[date]).map(p=>'P'+p).join(', '),type:'Absent'})),
  assignments:Allocation.effectiveAssignments(state).filter(a=>a.date===date).map(a=>({period:'P'+a.period,className:a.className||'',absentTeacher:(a.absentIds||[a.absentId]).map(name).filter(Boolean).join(', '),reliefTeacher:name(a.staffId),status:a.status||'draft'}))
 }));
 const engaged=new Set(state.adhoc.filter(a=>!a.deletedAt&&dates.includes(a.date)).map(a=>a.staffId));
 const fairness=ctx.people.filter(p=>p.active||engaged.has(p.id)).map(p=>{const value=Allocation.personalCompletion(state,p.id,ctx.today,ctx.now);return {teacher:p.name,quota:value.entitlement??'Not available',done:value.historyVerified?value.completed:'Not verified',percent:value.percentage===null?'Not available':Number(value.percentage.toFixed(2))};}).sort((a,b)=>a.teacher.localeCompare(b.teacher));
 return {generatedAt:ctx.iso,days,fairness};
}
async function schema(db){
 await ensureBackup(db);await db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS gsis_backup_worker(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,continuity_revision INTEGER NOT NULL DEFAULT 0,continuity_day TEXT NOT NULL DEFAULT '',alert_fingerprint TEXT NOT NULL DEFAULT '',pending_fingerprint TEXT NOT NULL DEFAULT '',pending_id TEXT NOT NULL DEFAULT '',drill_manifest_id TEXT NOT NULL DEFAULT '')"),
  db.prepare('INSERT OR IGNORE INTO gsis_backup_worker(id) VALUES(1)')
 ]);
}
export async function queueBackupRequest(db,{id,kind,manifestFileId,actor,retry=false,now=Date.now()}){
 if(!/^[A-Za-z0-9_-]{8,160}$/.test(id||'')||!['verify','restore'].includes(kind)||! /^[A-Za-z0-9_-]{1,200}$/.test(manifestFileId||'')||!actor)fail('BACKUP_REQUEST','Choose a backup and a stable request identity.');
 await ensureBackup(db);const c=primary(db),prior=await c.prepare('SELECT * FROM gsis_backup_requests WHERE id=?').bind(id).first();
 if(prior){if(prior.actor!==actor||prior.kind!==kind||prior.manifest_file_id!==manifestFileId)fail('BACKUP_REQUEST_CONFLICT','This request identity already refers to another restore.');if(retry&&prior.status==='failed')await c.prepare("UPDATE gsis_backup_requests SET status='pending' WHERE id=? AND status='failed'").bind(id).run();}
 else await c.prepare('INSERT INTO gsis_backup_requests(id,kind,manifest_file_id,actor,created_at) VALUES(?,?,?,?,?)').bind(id,kind,manifestFileId,actor,now).run();
 return {queued:true,request:await c.prepare('SELECT id,kind,manifest_file_id,status,result_json FROM gsis_backup_requests WHERE id=?').bind(id).first()};
}
export async function backupRequests(db){if(!await db.prepare("SELECT 1 present FROM sqlite_master WHERE name='gsis_backup_requests' AND type='table'").first())return [];return (await db.prepare('SELECT id,kind,manifest_file_id,created_at,status,result_json FROM gsis_backup_requests ORDER BY created_at DESC LIMIT 20').all()).results;}
async function ledgerJob(db,kind,date,now,work){
 const id=crypto.randomUUID();await db.prepare("INSERT INTO gsis_backup_ledger(id,started_at,kind,date,status) VALUES(?,?,?,?,'running')").bind(id,now,kind,date).run();
 try{const result=await work();await db.prepare("UPDATE gsis_backup_ledger SET status=?,finished_at=?,duration_ms=?,record_count=?,drive_file_id=?,digest=?,manifest_json=? WHERE id=?").bind(result.pending?'pending':'verified',Date.now(),Math.max(0,Date.now()-now),result.records||result.rows||0,result.fileId||'',result.sourceDigest||result.digest||'',JSON.stringify(result),id).run();return result;}
 catch(error){await db.prepare("UPDATE gsis_backup_ledger SET status='failed',finished_at=?,duration_ms=?,error=?,manifest_json=json_set(manifest_json,'$.outputError',json(?)) WHERE id=?").bind(Date.now(),Math.max(0,Date.now()-now),outputErrorText(error),JSON.stringify(outputFailure(error,'BACKUP_JOB_FAILED')),id).run();throw error;}
}
async function latestManifest(db){const row=await db.prepare("SELECT drive_file_id FROM gsis_backup_ledger WHERE kind IN ('full','increment') AND status='verified' AND drive_file_id<>'' ORDER BY started_at DESC LIMIT 1").first();if(!row)fail('BACKUP_MISSING','No verified backup is available.');return row.drive_file_id;}
async function verifyCurrentCounts(db,chain){
 const heads=(await db.prepare("SELECT scope,revision FROM gsis_edge_heads WHERE scope IN ('roster','roster-register')").all()).results,revisions=chain.manifests.at(-1).revisions;
 if(heads.some(h=>h.revision!==revisions[h.scope==='roster'?'roster':'register']))return {sourceAdvanced:true,comparedCurrentCounts:false};
 for(const [scope,state] of [['roster',chain.state],['roster-register',chain.index]]){
  const expected=Store.encode(state),collections=[...new Set([...expected.values()].map(r=>r.collection))].filter(c=>c!=='$root'),actual=(await db.prepare("SELECT collection,COUNT(*) n FROM gsis_edge_records WHERE scope=? AND collection IN (SELECT value FROM json_each(?)) GROUP BY collection").bind(scope,JSON.stringify(collections)).all()).results;
  for(const collection of collections)if(actual.find(r=>r.collection===collection)?.n!==[...expected.values()].filter(r=>r.collection===collection).length)fail('BACKUP_COUNTS','Backup counts differ from the unchanged D1 revision.');
 }
 const after=(await db.prepare("SELECT scope,revision FROM gsis_edge_heads WHERE scope IN ('roster','roster-register')").all()).results;
 return after.some(h=>h.revision!==revisions[h.scope==='roster'?'roster':'register'])?{sourceAdvanced:true,comparedCurrentCounts:false}:{sourceAdvanced:false,comparedCurrentCounts:true};
}
async function resetScratch(sourceDb,targetDb){
 if(!targetDb?.prepare||sourceDb===targetDb)fail('BACKUP_SCRATCH_TARGET','Bind a separate scratch D1 for weekly restore tests.');
 const source=await sourceDb.prepare('SELECT identity FROM gsis_backup_identity WHERE id=1').first();
 if(await targetDb.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_backup_identity'").first()){
  const other=await targetDb.prepare('SELECT identity FROM gsis_backup_identity WHERE id=1').first();if(other?.identity===source.identity)fail('BACKUP_SCRATCH_TARGET','The scratch binding points to production.');
 }
 const markerExists=await targetDb.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_backup_scratch'").first(),marker=markerExists?await targetDb.prepare('SELECT * FROM gsis_backup_scratch WHERE id=1').first():null;
 await Store.open(targetDb,'roster').ensure();await Store.open(targetDb,'roster-register').ensure();
 const heads=(await targetDb.prepare('SELECT * FROM gsis_edge_heads').all()).results,n=await targetDb.prepare('SELECT COUNT(*) n FROM gsis_edge_records').first();
 if(heads.some(h=>!['roster','roster-register'].includes(h.scope)||['active','paused'].includes(h.mode)))fail('BACKUP_SCRATCH_TARGET','An operational database cannot be used for a restore drill.');
 if(!marker&&n.n||marker&&marker.source_identity!==source.identity)fail('BACKUP_SCRATCH_TARGET','The nonempty target is not this backup service’s scratch database.');
 if(marker){
  // Only this labelled scratch DB is reset. Production and Admin restore targets
  // never use this function. The source ledger retains every drill outcome.
  const names=['gsis_roster_import_rows','gsis_roster_import_parts','gsis_roster_import_preparation','gsis_roster_import_locks','gsis_roster_import_sessions','gsis_edge_records','gsis_edge_receipts','gsis_edge_transitions','gsis_backup_restored_evidence','gsis_backup_restore_checks'],statements=[];
  for(const name of names)if(await targetDb.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name=?").bind(name).first())statements.push(targetDb.prepare('DELETE FROM '+name));
  statements.push(targetDb.prepare("UPDATE gsis_edge_heads SET mode='legacy',revision=0,source_digest='',imported_records=0,metadata_json='{}' WHERE scope IN ('roster','roster-register')"));await targetDb.batch(statements);
 }
 await targetDb.prepare('CREATE TABLE IF NOT EXISTS gsis_backup_scratch(id INTEGER PRIMARY KEY CHECK(id=1),source_identity TEXT NOT NULL)').run();await targetDb.prepare('INSERT OR IGNORE INTO gsis_backup_scratch VALUES(1,?)').bind(source.identity).run();
}
export async function runBackupJobs(env,{bridge,continuity,alert,now=Date.now()}={}){
 if(env.ROSTER_EDGE_AUTHORITY!=='d1')return {enabled:false,skipped:true};
 const db=primary(env.GSIS_JOBS);await schema(db);await expireBackupRuns(db,now);const config=await readBackupConfig(db);if(!config.enabled)return {enabled:false,skipped:true};
 const token=crypto.randomUUID(),claim=await db.prepare("UPDATE gsis_backup_worker SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<=?").bind(token,now+15*60000,now).run();if(!claim.meta?.changes)return {enabled:true,skipped:true,code:'SKIPPED_BUSY'};
 const started=Date.now(),rawBridge=bridge;
 const renew=async()=>{
  const time=now+Math.max(0,Date.now()-started),owner=await db.prepare('UPDATE gsis_backup_worker SET lease_until=? WHERE id=1 AND lease_token=? AND lease_until>?').bind(time+15*60000,token,time).run();
  if(!owner.meta?.changes)fail('BACKUP_LEASE','This Worker no longer owns the backup run.');
 };
 bridge=async input=>{await renew();const result=await rawBridge(input);await renew();return result;};
 let failures=0,failure;const today=singaporeBackupDate(now),result={};
 try{
  // Recover interrupted auxiliary attempts. No outcome is reported as verified.
  await db.prepare("UPDATE gsis_backup_ledger SET status='failed',error='BACKUP_JOB_INTERRUPTED',finished_at=?,duration_ms=MAX(0,?-started_at) WHERE status='running' AND kind NOT IN ('full','increment') AND started_at<?").bind(now,now,now-15*60000).run();
  await db.prepare("UPDATE gsis_backup_requests SET status='pending' WHERE status='running'").run();
  result.backup=await runDriveBackup(env,{now,bridge,onProgress:renew});failures+=result.backup.failed||0;failure=result.backup.failure;
  const pending=await db.prepare("SELECT * FROM gsis_backup_requests WHERE status='pending' ORDER BY created_at LIMIT 1").first();
  if(pending){
   await db.prepare("UPDATE gsis_backup_requests SET status='running' WHERE id=?").bind(pending.id).run();
   try{
    const outcome=await ledgerJob(db,pending.kind,today,now,async()=>{
     const chain=await readBackupChain({manifestFileId:pending.manifest_file_id,config,bridge});
     if(pending.kind==='verify')return {verified:true,fileId:pending.manifest_file_id,sourceDigest:chain.sourceDigest,records:Store.encode(chain.state).size+Store.encode(chain.index).size,...await verifyCurrentCounts(db,chain)};
     return restoreBackupChain({sourceDb:env.GSIS_JOBS,targetDb:env.ROSTER_BACKUP_RESTORE_DB,targetBucket:env.ROSTER_BACKUP_RESTORE_BUCKET,chain,actor:pending.actor,requestId:pending.id});
    });await db.prepare("UPDATE gsis_backup_requests SET status=?,result_json=? WHERE id=?").bind(outcome.pending?'pending':'verified',JSON.stringify(outcome),pending.id).run();
   }catch(error){failures++;failure={code:safe(error),outputError:outputFailure(error,'BACKUP_JOB_FAILED')};await db.prepare("UPDATE gsis_backup_requests SET status='failed',result_json=? WHERE id=?").bind(JSON.stringify({code:safe(error),retryable:true}),pending.id).run();}
  }
  const control=await db.prepare('SELECT * FROM gsis_backup_worker WHERE id=1').first(),publication=await db.prepare("SELECT COALESCE(MAX(revision),0) revision FROM gsis_edge_records WHERE scope='roster' AND collection IN ('dailyPublicationStates','publicationSnapshots','massPublications')").first(),lastContinuity=await db.prepare("SELECT started_at,status FROM gsis_backup_ledger WHERE kind='continuity' ORDER BY started_at DESC LIMIT 1").first(),dailyDue=now>=Date.parse(today+'T02:15:00+08:00')&&control.continuity_day!==today;
  if(continuity&&(publication.revision>control.continuity_revision||dailyDue)&&(!lastContinuity||lastContinuity.status==='verified'||now-lastContinuity.started_at>=5*60000)){
   try{await ledgerJob(db,'continuity',today,now,async()=>{const value=await continuity(now),saved=await bridge({operation:'edgeDriveOutput',step:'continuity',config,continuity:value});if(!saved?.verified)fail('BACKUP_CONTINUITY','The continuity Sheet write was not confirmed.');return saved;});await db.prepare('UPDATE gsis_backup_worker SET continuity_revision=?,continuity_day=? WHERE id=1 AND lease_token=?').bind(publication.revision,dailyDue?today:control.continuity_day,token).run();}
   catch(error){failures++;failure={code:safe(error),outputError:outputFailure(error,'BACKUP_JOB_FAILED')};}
  }
  const lastDrill=await db.prepare("SELECT started_at,status FROM gsis_backup_ledger WHERE kind='restore-test' ORDER BY started_at DESC LIMIT 1").first(),lastGood=await db.prepare("SELECT started_at FROM gsis_backup_ledger WHERE kind='restore-test' AND status='verified' ORDER BY started_at DESC LIMIT 1").first(),sg=new Date(now+28800000),sunday=new Date(Date.UTC(sg.getUTCFullYear(),sg.getUTCMonth(),sg.getUTCDate()-sg.getUTCDay(),2,15)).getTime()-28800000;
  if((control.drill_manifest_id||now>=sunday&&(!lastGood||lastGood.started_at<sunday))&&(!lastDrill||lastDrill.status==='pending'||now-lastDrill.started_at>=3600000)){
   try{const outcome=await ledgerJob(db,'restore-test',today,now,async()=>{const fileId=control.drill_manifest_id||await latestManifest(db),chain=await readBackupChain({manifestFileId:fileId,config,bridge});if(!control.drill_manifest_id){await resetScratch(env.GSIS_JOBS,env.ROSTER_BACKUP_SCRATCH_DB);await db.prepare('UPDATE gsis_backup_worker SET drill_manifest_id=? WHERE id=1 AND lease_token=?').bind(fileId,token).run();}const restored=await restoreBackupChain({sourceDb:env.GSIS_JOBS,targetDb:env.ROSTER_BACKUP_SCRATCH_DB,targetBucket:env.ROSTER_BACKUP_SCRATCH_BUCKET,chain,actor:'backup-restore-drill',requestId:'weekly-'+fileId});return {...restored,fileId};});if(!outcome.pending)await db.prepare("UPDATE gsis_backup_worker SET drill_manifest_id='' WHERE id=1 AND lease_token=?").bind(token).run();}
   catch(error){failures++;failure={code:safe(error),outputError:outputFailure(error,'BACKUP_JOB_FAILED')};}
  }
  const health=await backupStatus(db,{now});
  if(result.backup.sizeWarning)health.warnings.push('size-threshold');
  for(const kind of ['backup','continuity','restore-test']){
   const warnings=health.warnings.filter(w=>kind==='backup'?!['continuity-failed','restore-test-failed'].includes(w):w===kind+'-failed');
   await notifyOutputAlert(db,{kind,now,health:{...health,warnings},message:kind==='backup'?'Drive backups need Admin attention':kind==='continuity'?'Drive continuity output failing':'Drive restore test failing',enabled:async()=>(await readBackupConfig(db)).enabled},alert);
  }
  return {enabled:true,completed:result.backup.completed||0,failed:failures,...(result.backup.backoff?{backoff:result.backup.backoff,backoffSeconds:result.backup.backoffSeconds,readyAt:result.backup.readyAt}:{}),...(failure?{failure}:{}),code:failures?'BACKUP_JOB_FAILED':result.backup.backoff?'SKIPPED_BACKOFF':health.warnings.length?'BACKUP_ATTENTION':'OK'};
 }finally{await db.prepare("UPDATE gsis_backup_worker SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?").bind(token).run();}
}
