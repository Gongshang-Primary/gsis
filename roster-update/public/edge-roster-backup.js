// Scheduled restore-grade exports. No request handler calls runDriveBackup.
import {GSiSEdgeStore as Store,GSiSRosterImport as Import} from './edge-store.js';
import {GSISRosterOperations as Operations} from './edge-roster-domain.js';
import {outputFailure,outputErrorText} from '../../shared/edge-output-error.js';
import {sha256Hex} from './edge-deploy-sha256.js';

export const BACKUP_FORMAT='gsis-roster-drive-backup-v1';
export const TIER_ONE=Object.freeze(('absences assignments importedRelief reliefCorrections requests adhoc staplerRequests staplerPlans staplerArchives dailyPublicationStates publicationSnapshots acknowledgements entitlements openingBalances accountingYears accountingProfiles rotationEvents smcDutyRoster recessActivations manualDecisions cellDecisionVersions manualAuditBaselines dayRevisions types systemConfig customInstructions nameBridges recessSettings dailyEmploymentSettings inboxThreads inboxMessages schema revision freshStart typeDetailsVersion manualDecisionsSchema publicationSchema').split(' '));
export const TIER_TWO=Object.freeze(('audit inboxAudit outbox deliveryEvents massPublications peerMail optimisationRuns allocationAuditExports dailyEmploymentMail dailyEmploymentSnapshots deliveryReview').split(' '));
const REGISTER_COLLECTIONS=['schema','revision','entries'];
const EVIDENCE_TABLES=['gsis_quiet_mode_log','gsis_job_health_history','gsis_job_health','gsis_roster_audit_exports','gsis_backup_restored_evidence'];
const HOUR=3600000,DAY=24*HOUR,LEASE=15*60000,MAX_RAW=32*1024*1024,MAX_GZIP=8*1024*1024;
const schemas=new WeakMap(),encoder=new TextEncoder();
const fail=(code,message,status=503)=>{throw Object.assign(Error(message),{code,status});};
const primary=db=>db.withSession?.('first-primary')||db;
const checked=r=>{if(r?.success===false)fail('BACKUP_STORAGE','Backup storage could not be confirmed.');return r;};
const sqlList=xs=>xs.map(x=>"'"+x+"'").join(',');
export const tierFor=(scope,collection)=>scope==='cache'&&collection==='recoveryPackages'?1:scope==='roster-register'?REGISTER_COLLECTIONS.includes(collection)?1:0:scope==='evidence'?2:scope==='roster'?TIER_ONE.includes(collection)?1:TIER_TWO.includes(collection)?2:0:0;
export const singaporeBackupDate=now=>new Date(now+8*HOUR).toISOString().slice(0,10);
const safeCode=e=>/^[A-Z][A-Z0-9_]{0,79}$/.test(e?.code||'')?e.code:'BACKUP_FAILED';
const forbiddenKey=key=>/(?:token|capabilit|secret|password|authorization|private.?link|private.?url|signature|nonce)/i.test(key)||['workbookKey','workbookFileId'].includes(key);
const cleanString=value=>value.replace(/https?:\/\/[^\s<>"']+/gi,url=>/#.+|[?&](?:token|cap|key|auth|signature)=|\/(?:external|private)(?:[./?]|$)/i.test(url)?'[private link removed]':url).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[credential removed]');
export function base64(bytes){const parts=[];for(let i=0;i<bytes.length;i+=24576)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+24576))));return parts.join('');}
export function unbase64(text){if(typeof text!=='string'||text.length>MAX_GZIP*4/3+4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))fail('BACKUP_FORMAT','Invalid compressed backup.');return Uint8Array.from(atob(text),x=>x.charCodeAt(0));}
export async function boundedText(bytes,compressed=true){
 const stream=new Blob([bytes]).stream(),reader=(compressed?stream.pipeThrough(new DecompressionStream('gzip')):stream).getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RAW)fail('BACKUP_SIZE','A backup tier exceeds the 32 MiB raw limit.');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
}
export async function gzip(text){if(encoder.encode(text).length>MAX_RAW)fail('BACKUP_SIZE','A backup tier exceeds the 32 MiB raw limit.');const bytes=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());if(bytes.length>MAX_GZIP)fail('BACKUP_SIZE','A backup tier exceeds the 8 MiB compressed limit.');return bytes;}
export async function sanitizeBackup(value){
 if(typeof value==='string'){if(/^[\s]*[\[{]/.test(value)){let parsed;try{parsed=JSON.parse(value);}catch{}if(parsed&&typeof parsed==='object')return JSON.stringify(await sanitizeBackup(parsed));}return cleanString(value);}
 if(!value||typeof value!=='object')return value;
 if(value.encoding==='gzip-audit-v1'){
  const raw=await boundedText(unbase64(value.data));if(value.digest&&sha256Hex(raw)!==value.digest)fail('BACKUP_DIGEST','Stored audit evidence failed verification.');
  const text=JSON.stringify(await sanitizeBackup(JSON.parse(raw)));
  return {encoding:'gzip-audit-v1',bytes:encoder.encode(text).length,digest:sha256Hex(text),data:base64(await gzip(text))};
 }
 if(Array.isArray(value))return Promise.all(value.map(sanitizeBackup));
 const result={};for(const [key,child] of Object.entries(value))if(!forbiddenKey(key))result[key]=await sanitizeBackup(child);return result;
}
export function backupConfig(value={}){try{return Operations.normalizeDriveBackup(value);}catch(e){fail('BACKUP_CONFIG',e.message,400);}}
export async function readBackupConfig(db){
 const rows=(await primary(db).prepare("SELECT record_id,value_json FROM gsis_edge_records WHERE scope='roster' AND collection='systemConfig'").all()).results||[];
 const row=rows.find(r=>r.record_id==='key:driveBackup');return backupConfig(row?JSON.parse(row.value_json):{});
}
export async function ensureBackup(db){
 if(schemas.has(db))return schemas.get(db);
 const work=(async()=>{
  await Store.open(db,'roster').ensure();await Store.open(db,'roster-register').ensure();
  const statements=[
   `CREATE TABLE IF NOT EXISTS gsis_backup_identity(id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS gsis_backup_ledger(id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,finished_at INTEGER,kind TEXT NOT NULL,date TEXT NOT NULL DEFAULT '',revision_from INTEGER NOT NULL DEFAULT 0,revision_to INTEGER NOT NULL DEFAULT 0,register_from INTEGER NOT NULL DEFAULT 0,register_to INTEGER NOT NULL DEFAULT 0,record_count INTEGER NOT NULL DEFAULT 0,bytes_raw INTEGER NOT NULL DEFAULT 0,bytes_compressed INTEGER NOT NULL DEFAULT 0,drive_file_id TEXT NOT NULL DEFAULT '',drive_version TEXT NOT NULL DEFAULT '',digest TEXT NOT NULL DEFAULT '',duration_ms INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',manifest_json TEXT NOT NULL DEFAULT '{}',lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0)`,
   `CREATE INDEX IF NOT EXISTS gsis_backup_ledger_history ON gsis_backup_ledger(kind,started_at DESC)`,
   `CREATE UNIQUE INDEX IF NOT EXISTS gsis_backup_one_active ON gsis_backup_ledger((1)) WHERE status='running' AND kind IN ('full','increment')`,
   `CREATE TABLE IF NOT EXISTS gsis_output_alerts(kind TEXT NOT NULL,day TEXT NOT NULL,alert_id TEXT NOT NULL,queued INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,day))`,
   `CREATE TABLE IF NOT EXISTS gsis_backup_changes(scope TEXT NOT NULL,collection TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL,PRIMARY KEY(scope,collection,record_id))`,
   `CREATE TABLE IF NOT EXISTS gsis_backup_items(run_id TEXT NOT NULL,tier INTEGER NOT NULL,scope TEXT NOT NULL,collection TEXT NOT NULL,record_id TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,record_date TEXT NOT NULL DEFAULT '',value_json TEXT NOT NULL DEFAULT 'null',revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(run_id,scope,collection,record_id))`,
   `CREATE TABLE IF NOT EXISTS gsis_backup_requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,manifest_file_id TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result_json TEXT NOT NULL DEFAULT '{}')`
  ];
  const condition="(NEW.scope='roster-register' AND NEW.collection IN ("+sqlList(REGISTER_COLLECTIONS)+")) OR (NEW.scope='roster' AND NEW.collection IN ("+sqlList(TIER_ONE)+"))";
  for(const event of ['INSERT','UPDATE'])statements.push(`CREATE TRIGGER IF NOT EXISTS gsis_backup_record_${event.toLowerCase()} AFTER ${event} ON gsis_edge_records WHEN ${condition} BEGIN INSERT INTO gsis_backup_changes(scope,collection,record_id,revision,deleted) VALUES(NEW.scope,NEW.collection,NEW.record_id,NEW.revision,0) ON CONFLICT(scope,collection,record_id) DO UPDATE SET revision=excluded.revision,deleted=0; END`);
  statements.push(`CREATE TRIGGER IF NOT EXISTS gsis_backup_record_delete AFTER DELETE ON gsis_edge_records WHEN (OLD.scope='roster-register' AND OLD.collection IN (${sqlList(REGISTER_COLLECTIONS)})) OR (OLD.scope='roster' AND OLD.collection IN (${sqlList(TIER_ONE)})) BEGIN INSERT INTO gsis_backup_changes(scope,collection,record_id,revision,deleted) VALUES(OLD.scope,OLD.collection,OLD.record_id,COALESCE((SELECT revision FROM gsis_edge_heads WHERE scope=OLD.scope),OLD.revision),1) ON CONFLICT(scope,collection,record_id) DO UPDATE SET revision=excluded.revision,deleted=1; END`);
  const c=primary(db);for(const r of await c.batch(statements.map(s=>c.prepare(s))))checked(r);
  checked(await c.prepare('INSERT OR IGNORE INTO gsis_backup_identity VALUES(1,?)').bind(crypto.randomUUID()).run());
 })();schemas.set(db,work);try{return await work;}catch(e){schemas.delete(db);throw e;}
}
export async function captureBackup(db,{kind='full',now=Date.now()}={}){
 await ensureBackup(db);const c=primary(db),id=crypto.randomUUID(),token=crypto.randomUUID();
 if(!['full','increment'].includes(kind))fail('BACKUP_KIND','Choose full or increment.',400);
 const latest=await c.prepare("SELECT * FROM gsis_backup_ledger WHERE kind IN ('full','increment') AND status='verified' ORDER BY started_at DESC LIMIT 1").first();if(!latest)kind='full';
 const from=kind==='full'?0:latest.revision_to,registerFrom=kind==='full'?0:latest.register_to;
 const statements=[
  c.prepare("UPDATE gsis_backup_ledger SET status='failed',error='BACKUP_LEASE_EXPIRED',finished_at=?,duration_ms=?-started_at WHERE status='running' AND kind IN ('full','increment') AND lease_until<=?").bind(now,now,now),
  c.prepare(`INSERT INTO gsis_backup_ledger(id,started_at,kind,date,revision_from,revision_to,register_from,register_to,status,lease_token,lease_until,manifest_json) SELECT ?,?,?,?, ?,r.revision,?,t.revision,'running',?,?,? FROM gsis_edge_heads r,gsis_edge_heads t WHERE r.scope='roster' AND t.scope='roster-register' AND r.mode='active' AND t.mode='active' AND NOT EXISTS(SELECT 1 FROM gsis_backup_ledger WHERE status='running' AND kind IN ('full','increment'))`).bind(id,now,kind,singaporeBackupDate(now),from,registerFrom,token,now+LEASE,JSON.stringify({previousManifestId:kind==='increment'?latest?.drive_file_id||'':''})),
  c.prepare(`INSERT INTO gsis_backup_items(run_id,tier,scope,collection,record_id,position,record_date,value_json,revision) SELECT ?,CASE WHEN scope='roster-register' OR collection IN (${sqlList(TIER_ONE)}) THEN 1 ELSE 2 END,scope,collection,record_id,position,record_date,value_json,revision FROM gsis_edge_records WHERE EXISTS(SELECT 1 FROM gsis_backup_ledger WHERE id=?) AND collection<>'$root' AND ((scope='roster-register' AND collection IN (${sqlList(REGISTER_COLLECTIONS)})) OR (scope='roster' AND ((collection IN (${sqlList(TIER_ONE)})) OR (?='full' AND collection IN (${sqlList(TIER_TWO)})))))`).bind(id,id,kind),
  c.prepare(`INSERT INTO gsis_backup_items(run_id,tier,scope,collection,record_id,revision,deleted) SELECT ?,1,scope,collection,record_id,revision,1 FROM gsis_backup_changes WHERE deleted=1 AND ?='increment' AND revision>CASE WHEN scope='roster' THEN ? ELSE ? END AND EXISTS(SELECT 1 FROM gsis_backup_ledger WHERE id=?)`).bind(id,kind,from,registerFrom,id)
 ];
 if(await c.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_recovery_timetable_heads'").first())statements.push(c.prepare("INSERT INTO gsis_backup_items(run_id,tier,scope,collection,record_id,value_json,revision) SELECT ?,1,'cache','recoveryPackages',scope,json_object('current',current_json,'currentDigest',current_hash,'previous',previous_json,'previousDigest',previous_hash),published FROM gsis_recovery_timetable_heads WHERE EXISTS(SELECT 1 FROM gsis_backup_ledger WHERE id=?)").bind(id,id));
 if(kind==='full')for(const table of EVIDENCE_TABLES){
  if(!await c.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name=?").bind(table).first())continue;
  const cols=(await c.prepare('PRAGMA table_info('+table+')').all()).results.map(r=>r.name);if(cols.some(x=>! /^[a-z_]+$/.test(x)))fail('BACKUP_SCHEMA','Invalid evidence schema.');
  statements.push(c.prepare(`INSERT INTO gsis_backup_items(run_id,tier,scope,collection,record_id,value_json,revision) SELECT ?,2,'evidence',?,CAST(rowid AS TEXT),json_object(${cols.flatMap(x=>["'"+x+"'",'"'+x+'"']).join(',')}),0 FROM ${table} WHERE EXISTS(SELECT 1 FROM gsis_backup_ledger WHERE id=?)`).bind(id,table,id));
 }
 for(const r of await c.batch(statements))checked(r);
 const row=await c.prepare('SELECT * FROM gsis_backup_ledger WHERE id=?').bind(id).first();return row||{busy:true,skipped:true,code:'SKIPPED_BUSY'};
}
function counts(rows){const result={};for(const row of rows){const v=JSON.parse(row.value_json);if(row.record_id==='$'&&['array','map'].includes(v?.kind)){result[row.scope+'.'+row.collection]??=0;continue;}const key=row.scope+'.'+row.collection;result[key]=(result[key]||0)+1;}return result;}
export async function backupPayload(env,run,tier){
 const source=(await primary(env.GSIS_JOBS).prepare('SELECT scope,collection,record_id,position,record_date,value_json,revision,deleted FROM gsis_backup_items WHERE run_id=? AND tier=? ORDER BY scope,collection,position,record_id').bind(run.id,tier).all()).results||[],objects=new Map(),visiting=new Set();
 const rewrite=async value=>{
  if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)){let parsed;try{parsed=JSON.parse(value);}catch{}if(parsed&&typeof parsed==='object')return JSON.stringify(await rewrite(parsed));}
  if(!value||typeof value!=='object')return value;
  if(value.encoding==='gzip-json-v1'&&typeof value.key==='string'){
   if(!/^gsis\/roster\/.+\/[a-f0-9]{64}\.json\.gz$/.test(value.key)||! /^[a-f0-9]{64}$/.test(value.digest||'')||!value.key.endsWith('/'+value.digest+'.json.gz'))fail('BACKUP_OBJECT','Invalid timetable object reference.');
   if(!objects.has(value.key)){
    if(visiting.has(value.key))fail('BACKUP_OBJECT','Cyclic timetable object reference.');visiting.add(value.key);
    const saved=await env.ROSTER_TIMETABLE_SNAPSHOTS?.get(value.key);if(!saved)fail('BACKUP_OBJECT','A referenced timetable object is missing.');
    const raw=await boundedText(await saved.arrayBuffer());if(sha256Hex(raw)!==value.digest)fail('BACKUP_DIGEST','A timetable object failed verification.');
    const json=JSON.stringify(await rewrite(await sanitizeBackup(JSON.parse(raw)))),digest=sha256Hex(json),key=value.key.replace(/[a-f0-9]{64}\.json\.gz$/,digest+'.json.gz');
    objects.set(value.key,{key,digest,encoding:'gzip-json-v1',json});visiting.delete(value.key);
   }
   const object=objects.get(value.key);return {...value,key:object.key,digest:object.digest};
  }
  if(Array.isArray(value)){const result=[];for(const child of value)result.push(await rewrite(child));return result;}
  const output={};for(const [key,child] of Object.entries(value))output[key]=await rewrite(child);return output;
 };
 const rows=[],deleted=[];for(const row of source){if(row.deleted){deleted.push({scope:row.scope,collection:row.collection,record_id:row.record_id,revision:row.revision});continue;}const {deleted:_,...record}=row;let value=JSON.parse(row.value_json);if(row.scope==='cache'){
   const versions=[];for(const label of ['current','previous']){const raw=value[label];if(!raw)continue;if(sha256Hex(raw)!==value[label+'Digest'])fail('BACKUP_DIGEST','A timetable cache manifest failed verification.');const m=JSON.parse(raw),parts=[];
    for(const [partKey,ref] of Object.entries(m.parts||{})){if(!/^roster\/timetables\/recovery-v1\/parts\/[a-f0-9.-]+\.json\.gz$/.test(ref.objectKey||''))fail('BACKUP_OBJECT','Invalid cached timetable path.');const saved=await env.ROSTER_TIMETABLE_SNAPSHOTS?.get(ref.objectKey);if(!saved)fail('BACKUP_OBJECT','A cached timetable part is missing.');const compressed=new Uint8Array(await saved.arrayBuffer()),rawPart=await boundedText(compressed);if(sha256Hex(base64(compressed))!==ref.encodedKey||sha256Hex(rawPart)!==partKey||encoder.encode(rawPart).length!==ref.bytes)fail('BACKUP_DIGEST','A cached timetable part failed verification.');const json=JSON.stringify(await sanitizeBackup(JSON.parse(rawPart)));parts.push({sourcePart:partKey,digest:sha256Hex(json),json});}
    versions.push({label,header:await sanitizeBackup(m.header),payload:await sanitizeBackup(m.payload),parts});
   }value={versions};
  }record.value_json=JSON.stringify(await rewrite(await sanitizeBackup(value)));rows.push(record);}
 const restoreBudget=await backupRestoreBudget(rows,[...objects.values()]),exported=run.kind==='full'?rows:rows.filter(r=>r.scope==='cache'||r.revision>(r.scope==='roster'?run.revision_from:run.register_from));
 return {schema:BACKUP_FORMAT,runId:run.id,kind:run.kind,tier,startedAt:run.started_at,revisions:{roster:run.revision_to,register:run.register_to},fromRevisions:{roster:run.revision_from,register:run.register_from},counts:counts(exported),restoreBudget,replaceCache:tier===1,rows:exported,deleted,objects:[...objects.values()]};
}
export async function backupRestoreBudget(rows,objects){
 const decode=scope=>{const selected=rows.filter(r=>r.scope===scope);return Store.decode([{collection:'$root',record_id:'$',position:0,record_date:'',value_json:JSON.stringify({keys:[...new Set(selected.map(r=>r.collection))]})},...selected]);};
 const state={...Operations.initial(),...decode('roster'),receipts:[]},index={schema:1,revision:0,entries:[],...decode('roster-register'),receipts:[]},prepared=Import.prepareStoredRecords(state,index,{ordinal:0,offset:0},{hash:sha256Hex,base64:v=>base64(Uint8Array.from(v,x=>x&255))});
 let bytes=prepared.partMetadata.reduce((n,p)=>n+p.bytes,0)+rows.length*256+65536,parts=prepared.partMetadata.length+2;
 for(const object of objects){const data=await gzip(object.json),segments=Math.ceil(data.length/196608);bytes+=Math.ceil(data.length*4/3)+segments*128+encoder.encode(object.key).length+2048;parts+=segments+1;}
 if(bytes>40*1024*1024||parts>2048)fail('BACKUP_RESTORE_LIMIT','The backup exceeds the verified import restore envelope.');return {bytes,parts};
}
export function validateBackupPayload(payload){
 if(payload?.schema!==BACKUP_FORMAT||![1,2].includes(payload.tier)||!Array.isArray(payload.rows)||!Array.isArray(payload.deleted)||!Array.isArray(payload.objects))fail('BACKUP_FORMAT','Invalid backup tier.');
 const ids=new Set();for(const row of [...payload.rows,...payload.deleted]){const id=JSON.stringify([row.scope,row.collection,row.record_id]);if(ids.has(id)||tierFor(row.scope,row.collection)!==payload.tier||forbiddenKey(row.collection)||typeof row.record_id!=='string')fail('BACKUP_FORMAT','Unexpected or duplicate backup collection.');ids.add(id);}
 for(const row of payload.rows){if(typeof row.value_json!=='string'||!Number.isSafeInteger(row.position)||row.position<0)fail('BACKUP_FORMAT','Invalid backup record.');JSON.parse(row.value_json);}
 if(Store.canonicalJson(counts(payload.rows))!==Store.canonicalJson(payload.counts))fail('BACKUP_COUNTS','Backup record counts do not match.');
 for(const object of payload.objects)if(object.encoding!=='gzip-json-v1'||typeof object.json!=='string'||sha256Hex(object.json)!==object.digest||!object.key.startsWith('gsis/roster/')||!object.key.endsWith('/'+object.digest+'.json.gz'))fail('BACKUP_DIGEST','A backup object failed verification.');
 return payload;
}
export async function finishBackup(db,run,{status,manifest={},fileId='',digest='',now=Date.now(),error}={}){
 if(!['verified','failed'].includes(status))fail('BACKUP_STATUS','Invalid backup outcome.');
 if(error)manifest={...manifest,outputError:outputFailure(error,'BACKUP_FAILED')};
 const files=manifest.files||[],c=primary(db),result=checked(await c.prepare("UPDATE gsis_backup_ledger SET status=?,finished_at=?,duration_ms=MAX(0,?-started_at),record_count=?,bytes_raw=?,bytes_compressed=?,drive_file_id=?,digest=?,manifest_json=?,error=?,lease_until=0 WHERE id=? AND status='running' AND lease_token=?").bind(status,now,now,files.reduce((n,f)=>n+(f.records||0),0),files.reduce((n,f)=>n+(f.bytesRaw||0),0),files.reduce((n,f)=>n+(f.bytesCompressed||0),0),fileId,digest,JSON.stringify(manifest),error?outputErrorText(error):'',run.id,run.lease_token).run());
 if(!result.meta?.changes)fail('BACKUP_LEASE','This backup run no longer owns its lease.');
 // Only transient captured copies are removed. The ledger and Drive versions stay.
 checked(await c.prepare('DELETE FROM gsis_backup_items WHERE run_id=?').bind(run.id).run());return {id:run.id,status,verified:status==='verified'};
}
export async function backupLedger(db,{kind='',status='',date='',before=Number.MAX_SAFE_INTEGER,beforeId='~',limit=100}={}){
 if(!await primary(db).prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_backup_ledger'").first())return [];
 if(!Number.isSafeInteger(before)||typeof beforeId!=='string'||beforeId.length>160||!Number.isInteger(limit)||limit<1||limit>500||kind&&!['full','increment','verify','restore','restore-test','continuity','excel','log'].includes(kind)||status&&!['pending','running','verified','failed'].includes(status)||date&&!/^20\d\d-\d\d-\d\d$/.test(date))fail('BACKUP_FILTER','Invalid ledger filter.',400);
 return (await primary(db).prepare('SELECT id,started_at,finished_at,kind,date,revision_from,revision_to,register_from,register_to,record_count,bytes_raw,bytes_compressed,drive_file_id,drive_version,digest,duration_ms,status,error FROM gsis_backup_ledger WHERE (started_at<? OR (started_at=? AND id<?)) AND (?=\'\' OR kind=?) AND (?=\'\' OR status=?) AND (?=\'\' OR date=?) ORDER BY started_at DESC,id DESC LIMIT ?').bind(before,before,beforeId,kind,kind,status,status,date,date,limit).all()).results||[];
}
export async function backupStatus(db,{now=Date.now()}={}){
 if(!await primary(db).prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_backup_ledger'").first())return {available:false,warnings:[]};
 const c=primary(db),latest=await c.prepare("SELECT * FROM gsis_backup_ledger WHERE kind IN ('full','increment') ORDER BY started_at DESC LIMIT 1").first(),verified=await c.prepare("SELECT * FROM gsis_backup_ledger WHERE kind IN ('full','increment') AND status='verified' ORDER BY started_at DESC LIMIT 1").first(),full=await c.prepare("SELECT * FROM gsis_backup_ledger WHERE kind='full' AND status='verified' ORDER BY started_at DESC LIMIT 1").first(),recent=(await c.prepare("SELECT status FROM gsis_backup_ledger WHERE kind IN ('full','increment') AND status<>'running' ORDER BY started_at DESC LIMIT 2").all()).results||[];
 const warnings=[];if(!verified||now-verified.started_at>2*HOUR)warnings.push('increment-overdue');if(!full||now-full.started_at>26*HOUR)warnings.push('full-overdue');if(recent.length===2&&recent.every(r=>r.status==='failed'))warnings.push('two-failures');const config=await readBackupConfig(db);if(verified?.bytes_raw>config.sizeAlertMiB*1024*1024)warnings.push('size-threshold');
 const aux=(await c.prepare("SELECT kind,status FROM (SELECT kind,status,ROW_NUMBER() OVER(PARTITION BY kind ORDER BY started_at DESC,id DESC) n FROM gsis_backup_ledger WHERE kind IN ('continuity','restore-test')) WHERE n<=2").all()).results;for(const kind of ['continuity','restore-test']){const recent=aux.filter(r=>r.kind===kind);if(recent.length===2&&recent.every(r=>r.status==='failed'))warnings.push(kind+'-failed');}
 return {available:true,lastVerifiedAt:verified?.finished_at||null,lastCapturedAt:verified?.started_at||null,lastFullAt:full?.finished_at||null,bytes:verified?.bytes_compressed||0,status:latest?.status||'not-run',lastError:latest?.error||'',lastCode:JSON.parse(latest?.manifest_json||'{}').outputError?.code||latest?.error||'',lastAttemptAt:latest?.started_at||null,warnings};
}
export async function runDriveBackup(env,{now=Date.now(),bridge,forceKind}={}){
 if(env.ROSTER_EDGE_AUTHORITY!=='d1')return {enabled:false,skipped:true};
 const db=env.GSIS_JOBS;await ensureBackup(db);const config=await readBackupConfig(db);if(!config.enabled)return {enabled:false,skipped:true};
 await expireBackupRuns(db,now);
 const latest=await primary(db).prepare("SELECT manifest_json FROM gsis_backup_ledger WHERE kind IN ('full','increment') AND status='verified' ORDER BY started_at DESC LIMIT 1").first(),previousManifest=JSON.parse(latest?.manifest_json||'{}');
 const status=await backupStatus(db,{now}),lastFull=await primary(db).prepare("SELECT started_at FROM gsis_backup_ledger WHERE kind='full' AND status='verified' ORDER BY started_at DESC LIMIT 1").first(),today=singaporeBackupDate(now),dueFull=!lastFull||previousManifest.chainRawBytes>=96*1024*1024||status.lastCode==='BACKUP_CHAIN_LIMIT'||now>=Date.parse(today+'T02:15:00+08:00')&&lastFull.started_at<Date.parse(today+'T02:15:00+08:00');
 if(!forceKind&&status.status==='failed'&&now-status.lastAttemptAt<60000)return {enabled:true,skipped:true,code:'SKIPPED_BACKOFF'};
 if(!forceKind&&status.status!=='failed'&&!dueFull&&status.lastCapturedAt&&now-status.lastCapturedAt<HOUR)return {enabled:true,idle:true};
 const run=await captureBackup(db,{kind:forceKind||(dueFull?'full':'increment'),now});if(run.busy)return {...run,enabled:true};
 const manifest={schema:BACKUP_FORMAT,runId:run.id,kind:run.kind,startedAt:run.started_at,revisions:{roster:run.revision_to,register:run.register_to},fromRevisions:{roster:run.revision_from,register:run.register_from},previousManifestId:JSON.parse(run.manifest_json).previousManifestId||'',chainRawBytes:run.kind==='full'?0:previousManifest.chainRawBytes||0,files:[]};
 try{
  let totalBudget={bytes:0,parts:0};if(run.kind==='increment'){const prior=await db.prepare("SELECT manifest_json FROM gsis_backup_ledger WHERE kind='full' AND status='verified' ORDER BY started_at DESC LIMIT 1").first();manifest.tierTwoRestoreBudget=JSON.parse(prior?.manifest_json||'{}').tierTwoRestoreBudget;if(!manifest.tierTwoRestoreBudget)fail('BACKUP_RESTORE_LIMIT','A full backup with verified restore bounds is required.');totalBudget={...manifest.tierTwoRestoreBudget};}
  for(const tier of run.kind==='full'?[1,2]:[1]){
   const payload=validateBackupPayload(await backupPayload(env,run,tier)),raw=JSON.stringify(payload),bytes=await gzip(raw),digest=sha256Hex(raw),name=today+'-tier'+tier+'-'+run.kind+'-r'+run.revision_from+'-'+run.revision_to+'-'+digest+'.json.gz';
   manifest.chainRawBytes+=encoder.encode(raw).length;if(manifest.chainRawBytes>128*1024*1024)fail('BACKUP_CHAIN_LIMIT','A new full backup is required before this chain grows further.');
   totalBudget.bytes+=payload.restoreBudget.bytes;totalBudget.parts+=payload.restoreBudget.parts;if(totalBudget.bytes>40*1024*1024||totalBudget.parts>2048)fail('BACKUP_RESTORE_LIMIT','The complete backup exceeds the verified import restore envelope.');if(tier===2)manifest.tierTwoRestoreBudget=payload.restoreBudget;manifest.restoreBudget=totalBudget;
   const response=await bridge({operation:'edgeDriveOutput',step:'writeBackup',config,date:today,name,data:base64(bytes),digest,counts:payload.counts,records:payload.rows.length});
   if(!response?.verified||response.digest!==digest||Store.canonicalJson(response.counts)!==Store.canonicalJson(payload.counts)||response.records!==payload.rows.length||typeof response.fileId!=='string')fail('BACKUP_VERIFY','Drive did not verify the backup digest and counts.');
   manifest.files.push({tier,name,fileId:response.fileId,version:response.version||'',digest,counts:payload.counts,records:payload.rows.length,bytesRaw:encoder.encode(raw).length,bytesCompressed:bytes.length});
   checked(await primary(db).prepare("UPDATE gsis_backup_ledger SET manifest_json=? WHERE id=? AND status='running' AND lease_token=?").bind(JSON.stringify(manifest),run.id,run.lease_token).run());
  }
  const raw=JSON.stringify(manifest),digest=sha256Hex(raw),saved=await bridge({operation:'edgeDriveOutput',step:'writeManifest',config,date:today,name:today+'-'+run.kind+'-'+run.id+'-'+digest+'.manifest.json',text:raw,digest});
  if(!saved?.verified||saved.digest!==digest||typeof saved.fileId!=='string')fail('BACKUP_VERIFY','Drive did not verify the backup manifest.');
  await finishBackup(db,run,{status:'verified',manifest,fileId:saved.fileId,digest,now:Math.max(now,Date.now())});
  return {enabled:true,verified:true,completed:1,full:run.kind==='full',sizeWarning:manifest.files.reduce((n,f)=>n+f.bytesRaw,0)>config.sizeAlertMiB*1024*1024,runId:run.id};
 }catch(error){await finishBackup(db,run,{status:'failed',manifest,error,now:Math.max(now,Date.now())});return {enabled:true,failed:1,code:safeCode(error),failure:{code:safeCode(error),outputError:outputFailure(error,'BACKUP_FAILED')},runId:run.id};}
}

export async function expireBackupRuns(db,now){
 const c=primary(db);
 await c.batch([
  c.prepare("UPDATE gsis_backup_ledger SET status='failed',error='BACKUP_LEASE_EXPIRED',finished_at=?,duration_ms=MAX(0,?-started_at),lease_until=0 WHERE status='running' AND kind IN ('full','increment') AND lease_until<=?").bind(now,now,now),
  c.prepare("DELETE FROM gsis_backup_items WHERE run_id IN (SELECT id FROM gsis_backup_ledger WHERE status='failed' AND error='BACKUP_LEASE_EXPIRED')")
 ]);
}
export async function notifyOutputAlert(db,{kind,now,health,message,enabled},alert){
 if(!alert||!health.warnings.length||!await enabled())return;
 const day=singaporeBackupDate(now),id='drive-'+kind+'-'+day;
 await db.prepare('INSERT OR IGNORE INTO gsis_output_alerts(kind,day,alert_id) VALUES(?,?,?)').bind(kind,day,id).run();
 const row=await db.prepare('SELECT * FROM gsis_output_alerts WHERE kind=? AND day=?').bind(kind,day).first();
 if(row.queued)return;
 const sent=await alert({...health,kind,message,alertId:row.alert_id});
 if(sent?.queued===true)await db.prepare('UPDATE gsis_output_alerts SET queued=1 WHERE kind=? AND day=?').bind(kind,day).run();
}
