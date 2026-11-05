import {assertRecoveryWritable} from './edge-recovery.js';
import {readRosterCutoverFreeze} from './roster-cutover-freeze.js';

/* Compact operational metadata only. Callers must verify school administrator
 * authority before exposing these functions. Never pass request bodies or errors
 * through to D1: job names, codes, counts and diagnostic references are projected.
 */
const JOBS=new Set(['daily-outputs','drive-outputs','venues-sync','roster-import','google-backup','allocation','notifications','received-reports','timetables','audit-export','r2-cleanup','deploy-handoffs','references','peer-proposals','peer-mail','inbox','webhook','calendar-sync','read-claims','employment-mail','delivery-review','queue-notifications','queue-timetables','queue-audit']);
const STATUSES=new Set(['running','success','idle','skipped','failure']);
const CODES=new Set(['DAILY_OUTPUT_FAILED','DAILY_OUTPUT_CALENDAR','DAILY_OUTPUT_AUDIT','DAILY_OUTPUT_AUDIT_ARCHIVE','DAILY_OUTPUT_READBACK','DAILY_OUTPUT_STALE','DAILY_OUTPUT_BUSY','DAILY_OUTPUT_DAY_CLOSED','BACKUP_ATTENTION','BACKUP_JOB_FAILED','BACKUP_SIZE','BACKUP_VERIFY','BACKUP_CONFIG','BACKUP_OBJECT','BACKUP_CALENDAR','BACKUP_SCRATCH_TARGET','VENUES_FENCE_PENDING','VENUES_FENCE_UNCONFIRMED','COMMIT_UNCERTAIN','STAPLER_BASELINE_CONFLICT','STAPLER_CONFLICT','PEER_MAIL_REVIEW_CONFLICT','TIMETABLE_BATCH_CHANGED','TIMETABLE_BATCH_TOO_LARGE','CELL_CONFLICT','ABSENCE_CONFLICT','CONTACTS_RECOVERY_REQUIRED','SKIPPED_BUSY','SKIPPED_BACKOFF','ALLOCATION_CYCLE_STORAGE','OK','IDLE','SKIPPED','PAUSED','RECOVERY_PAUSED','GSIS_RECOVERY_PAUSED','GSIS_RECOVERY_CONFIG','UNKNOWN_ERROR','HTTP_ERROR','TIMEOUT','NOT_CONFIGURED','UNAVAILABLE','CONFLICT','INVALID_RESPONSE','RETRY_LATER','JOB_FAILED','JOB_PARKED','LEASE_HELD','EDGE_STORAGE','EDGE_AUTHORITY','EDGE_BINDING','ROSTER_R2_MANIFEST_UNVERIFIED','ROSTER_TIMETABLE_STORAGE','BACKGROUND_JOB_FAILED','BACKGROUND_JOB_PARKED','ABSENCE_INTAKE_PENDING','ABSENCE_TRANSPORT_PENDING','ABSENCE_PREPARATION_RETRY','ABSENCE_INTAKE_BUSY','BACKEND_CONFIG','BACKEND_AUTHENTICATION','BACKEND_UNAVAILABLE','UPSTREAM_TIMEOUT','UPSTREAM_RESPONSE','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED','ALLOCATION_CANCELLED','ALLOCATION_ABANDONED','ALLOCATION_CUTOFF','PLANNING_CLOCK_CHANGED','AUDIT_EXPORT_PENDING','AUDIT_EXPORT_BUSY','AUDIT_NOTIFICATION_PRIORITY','AUDIT_LOGGING_DISABLED','ROSTER_MIRROR_LAG','ROSTER_MIRROR_PENDING','ROSTER_MIRROR_VERIFY']);
const COUNT_KEYS=['pending','processed','sent','failed','queued','claimed','applied','deferred','exported','scanned','deleted','protected','candidates','removed','completed','retried','parked','pendingCaptureCount','pendingPeerCount','notificationsQueued','forwarded','needsReview','replies','alerts','retrying','blocked','unconfirmed','uncertain','newUncertain','reviewedUncertain','prepareFailures','resultFailures','timeoutStreak','backoff','backoffSeconds','leaseSeconds','leaseLost'];
const DAY=86400000,MAX_HISTORY=200,HISTORY_DAYS=7,schemas=new WeakMap();
const SCHEMA=[
 `CREATE TABLE IF NOT EXISTS gsis_job_health (job TEXT PRIMARY KEY,status TEXT NOT NULL,code TEXT NOT NULL,http_status INTEGER,trace_id TEXT,started_at INTEGER,finished_at INTEGER,event_at INTEGER NOT NULL,recorded_at INTEGER NOT NULL,last_success_at INTEGER,last_failure_at INTEGER,counts_json TEXT NOT NULL DEFAULT '{}',diagnostic_json TEXT NOT NULL DEFAULT '{}')`,
 `CREATE TABLE IF NOT EXISTS gsis_job_health_history (id INTEGER PRIMARY KEY AUTOINCREMENT,job TEXT NOT NULL,status TEXT NOT NULL,code TEXT NOT NULL,http_status INTEGER,trace_id TEXT,started_at INTEGER,finished_at INTEGER,event_at INTEGER NOT NULL,recorded_at INTEGER NOT NULL,counts_json TEXT NOT NULL DEFAULT '{}',diagnostic_json TEXT NOT NULL DEFAULT '{}')`,
 'CREATE INDEX IF NOT EXISTS gsis_job_health_history_age ON gsis_job_health_history(recorded_at,id)',
 'CREATE INDEX IF NOT EXISTS gsis_job_health_history_failure ON gsis_job_health_history(status,event_at DESC,id DESC)'
];
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clock=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000?value:null;
const nowValue=value=>clock(value)??Date.now();
const httpStatus=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;
function timestamp(value){if(clock(value)!==null)return value;if(typeof value==='string'&&value.length<=30&&/^\d{4}-\d\d-\d\dT/.test(value))return clock(Date.parse(value));return null;}
const trace=value=>typeof value==='string'&&/^(?:[a-f\d]{16}|[a-f\d]{32}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/i.test(value)?value.toLowerCase():null;
function counts(value){const output={};if(object(value))for(const key of COUNT_KEYS){const count=value[key];if(Number.isSafeInteger(count)&&count>=0&&count<=1e9)output[key]=count;}return output;}
function parseObject(value){if(typeof value!=='string'||value.length>4096)return {};try{const parsed=JSON.parse(value);return object(parsed)?parsed:{};}catch{return {};}}
const FAILURE_STAGES=new Set(['operations-location','operations-read','operations-json','operations-schema','stapler-unpack','stapler-json','stapler-identity','stapler-proof','stapler-validation','stapler-ready','calculation-source','history-read','bridge-signature','request-freshness','request-identity','contacts-config','contacts-fetch','contacts-json','contacts-result','contacts','timetable','plan-read','save','response','backend','peer-mail-review']);
const FAILURE_OPERATIONS=new Set(['nextAbsenceIntake','deferAbsenceIntake','prepareNotification','requestMutual','saveSchoolAbsence','renameStapler','scheduledRoster','sendPeerMail','peerMailReview','reviewPeerMail','claimNotifications','prepareNotifications','notificationResult','notificationResults','inboxPendingDispatch','inboxReplyPrepare','inboxReplyResult','inboxAlertPrepare','inboxAlertResult','deliveryReviewMailDispatch','dailyEmploymentMailDispatch','processAbsenceIntake','flushAbsenceIntake','captureAbsenceIntake','retryAbsenceIntake','resolveAbsenceIntake','timetableBatch','timetableDay','timetableCacheManifest','read','saveAbsence','saveInstructions','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler','deleteStapler','reliefBatch','publish','notifyDaily','autoAllocate','optimise','receiptStatus','allocationAuditExport']);
export function safeHealthError(error){
 const status=httpStatus(error?.httpStatus??error?.status),code=CODES.has(error?.code)||['ROSTER_CUTOVER_FROZEN','ROSTER_CUTOVER_OVERDUE','ROSTER_CUTOVER_STATUS_UNAVAILABLE'].includes(error?.code)?error.code:['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':status?'HTTP_ERROR':'UNKNOWN_ERROR',diagnosticId=trace(error?.diagnosticId);
 return {code,...(status?{httpStatus:status}:{}),...(diagnosticId?{diagnosticId}:{}),...(typeof error?.backendVersion==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}[a-z]?$/.test(error.backendVersion)?{backendVersion:error.backendVersion}:{}),...(FAILURE_STAGES.has(error?.failureStage)?{failureStage:error.failureStage}:{}),...(FAILURE_OPERATIONS.has(error?.operation)?{operation:error.operation}:{})};
}
function diagnostics(value){const safe=safeHealthError(value);return Object.fromEntries(['diagnosticId','backendVersion','failureStage','operation'].filter(key=>safe[key]!==undefined).map(key=>[key,safe[key]]));}
function eventProjection(event,now){
 if(!object(event)||!JOBS.has(event.job)||!STATUSES.has(event.status))throw Object.assign(Error('Unknown operational health event.'),{code:'INVALID_HEALTH_EVENT',status:400});
 const startedAt=timestamp(event.startedAt),finishedAt=event.status==='running'?null:timestamp(event.finishedAt)??now;
 if((startedAt!==null&&startedAt>now+300000)||(finishedAt!==null&&finishedAt>now+300000)||(startedAt!==null&&finishedAt!==null&&finishedAt<startedAt))throw Object.assign(Error('Invalid operational event time.'),{code:'INVALID_HEALTH_EVENT',status:400});
 const defaultCode=({running:'OK',success:'OK',idle:'IDLE',skipped:'SKIPPED',failure:'UNKNOWN_ERROR'})[event.status],code=event.code===undefined?defaultCode:safeHealthError(event).code;
 return {job:event.job,status:event.status,code,httpStatus:httpStatus(event.httpStatus),traceId:trace(event.traceId),startedAt,finishedAt,eventAt:finishedAt??startedAt??now,counts:counts(event.counts),diagnostics:diagnostics(event)};
}
const primary=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
function checked(result){if(result?.success===false)throw Object.assign(Error('Operational health storage is unavailable.'),{code:'EDGE_STORAGE',status:503});return result;}
async function diagnosticColumn(db,table){return !!await db.prepare("SELECT name FROM pragma_table_info(?) WHERE name='diagnostic_json'").bind(table).first();}
async function ensure(db){
 if(!schemas.has(db)){
  const operation=(async()=>{
   const session=primary(db);if(typeof session.batch==='function'){for(const result of await session.batch(SCHEMA.map(sql=>session.prepare(sql))))checked(result);}else for(const sql of SCHEMA)checked(await session.prepare(sql).run());
   for(const table of ['gsis_job_health','gsis_job_health_history'])if(!await diagnosticColumn(session,table)){
    try{checked(await session.prepare(`ALTER TABLE ${table} ADD COLUMN diagnostic_json TEXT NOT NULL DEFAULT '{}'`).run());}
    catch(error){if(!await diagnosticColumn(session,table))throw error;} // Another Worker may have completed the same additive upgrade.
   }
  })().catch(error=>{schemas.delete(db);throw error;});schemas.set(db,operation);
 }await schemas.get(db);
}

export async function recordJobHealth(env,event){
 assertRecoveryWritable(env);const now=nowValue(event?.now),row=eventProjection(event,now),db=env?.GSIS_JOBS;if(!db||typeof db.prepare!=='function')return {recorded:false,code:'NOT_CONFIGURED'};
 await ensure(db);const session=primary(db),values=[row.job,row.status,row.code,row.httpStatus,row.traceId,row.startedAt,row.finishedAt,row.eventAt,now],encoded=JSON.stringify(row.counts),detail=JSON.stringify(row.diagnostics);
 // MAX retains actual success/failure evidence even when a slower run finishes late.
 const latest=`INSERT INTO gsis_job_health(job,status,code,http_status,trace_id,started_at,finished_at,event_at,recorded_at,last_success_at,last_failure_at,counts_json,diagnostic_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job) DO UPDATE SET ${['status','code','http_status','trace_id','started_at','finished_at','event_at','recorded_at','counts_json','diagnostic_json'].map(key=>`${key}=CASE WHEN excluded.event_at>=gsis_job_health.event_at THEN excluded.${key} ELSE gsis_job_health.${key} END`).join(',')},last_success_at=CASE WHEN excluded.last_success_at IS NULL THEN gsis_job_health.last_success_at WHEN gsis_job_health.last_success_at IS NULL THEN excluded.last_success_at ELSE MAX(gsis_job_health.last_success_at,excluded.last_success_at) END,last_failure_at=CASE WHEN excluded.last_failure_at IS NULL THEN gsis_job_health.last_failure_at WHEN gsis_job_health.last_failure_at IS NULL THEN excluded.last_failure_at ELSE MAX(gsis_job_health.last_failure_at,excluded.last_failure_at) END WHERE excluded.status NOT IN ('idle','skipped') OR gsis_job_health.status<>excluded.status OR gsis_job_health.code<>excluded.code OR gsis_job_health.http_status IS NOT excluded.http_status OR gsis_job_health.counts_json<>excluded.counts_json OR excluded.event_at>=gsis_job_health.event_at+300000`;
 const statements=[
  session.prepare(latest).bind(...values,row.status==='success'?row.eventAt:null,row.status==='failure'?row.eventAt:null,encoded,detail),
  ...(row.status==='failure'?[session.prepare('INSERT INTO gsis_job_health_history(job,status,code,http_status,trace_id,started_at,finished_at,event_at,recorded_at,counts_json,diagnostic_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(...values,encoded,detail)]:[]),
  session.prepare('DELETE FROM gsis_job_health_history WHERE recorded_at<? OR id IN (SELECT id FROM gsis_job_health_history ORDER BY recorded_at DESC,id DESC LIMIT -1 OFFSET ?)').bind(now-HISTORY_DAYS*DAY,MAX_HISTORY)
 ];
 // Failure history is independent of idle/success volume. Healthy beats cannot
 // evict a diagnostic. Identical idle/skipped summaries write at most every five
 // minutes; transitions and changed counts remain immediate. Age pruning uses
 // its small index even when there are no new failures.
 // Batch is atomic on D1: summaries and retained evidence refer to the same event.
 assertRecoveryWritable(env);for(const result of await session.batch(statements))checked(result);return {recorded:true};
}
function rowProjection(row){
 if(!row||!JOBS.has(row.job)||!STATUSES.has(row.status))return null;
 return {job:row.job,status:row.status,code:safeHealthError({code:row.code,httpStatus:row.http_status}).code,httpStatus:httpStatus(row.http_status),traceId:trace(row.trace_id),startedAt:clock(row.started_at),finishedAt:clock(row.finished_at),eventAt:clock(row.event_at),recordedAt:clock(row.recorded_at),lastSuccessAt:clock(row.last_success_at),lastFailureAt:clock(row.last_failure_at),counts:counts(parseObject(row.counts_json)),...diagnostics(parseObject(row.diagnostic_json))};
}
async function tableExists(db,name){return !!await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();}
async function indexExists(db,name){return !!await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='index' AND name=?").bind(name).first();}
async function readBacklog(db,now){
 if(!await tableExists(db,'gsis_edge_records')||!await indexExists(db,'gsis_edge_pending_service'))return {available:false,items:[]};
 const items=[];for(const [collection,kind] of [['edgePeerProposals','peer-proposals'],['edgeInstructionDrafts','received-reports']]){
  // The partial index narrows to live pending work. Cap the read instead of
  // counting an unbounded historical collection or returning its JSON payload.
  const result=checked(await db.prepare("SELECT json_extract(value_json,'$.createdAt') AS created_at FROM gsis_edge_records INDEXED BY gsis_edge_pending_service WHERE scope='roster' AND collection=? AND record_id<>'$' AND json_extract(value_json,'$.status')='pending' ORDER BY position,record_id LIMIT 1001").bind(collection).all()),rows=result.results||[],capped=rows.length>1000,times=rows.map(row=>timestamp(row.created_at)).filter(value=>value!==null&&value<=now);
  items.push({kind,pending:Math.min(rows.length,1000),capped,oldestPendingAt:capped?null:times.length?Math.min(...times):null});
 }return {available:true,items};
}
async function readCleanup(db){
 if(!await tableExists(db,'gsis_roster_r2_cleanup'))return {available:false};const row=await db.prepare("SELECT completed_day,last_stats_json FROM gsis_roster_r2_cleanup WHERE scope='timetable-parts'").first();
 return {available:true,completedDay:typeof row?.completed_day==='string'&&/^20\d\d-\d\d-\d\d$/.test(row.completed_day)?row.completed_day:null,counts:counts(parseObject(row?.last_stats_json))};
}
async function readAllocationPreparation(db){
 if(!await tableExists(db,'gsis_edge_records'))return {available:false};
 // Read only bounded status fields. Never hydrate operational state or create
 // a missing schema from the health page, including during recovery.
 const result=checked(await db.prepare("SELECT json_extract(value_json,'$.date') AS date,json_extract(value_json,'$.state') AS state,json_extract(value_json,'$.startedAt') AS started_at,json_extract(value_json,'$.preparationMs') AS preparation_ms,json_extract(value_json,'$.preparationAttempts') AS preparation_attempts FROM gsis_edge_records WHERE scope='roster' AND collection='edgeAllocatorRuns' AND record_id<>'$' ORDER BY record_date DESC,record_id DESC LIMIT 60").all());
 const runs=(result.results||[]).filter(row=>/^20\d\d-\d\d-\d\d$/.test(row.date)&&['running','committing','completed','failed','cancelled','cancelling','uncertain','abandoned'].includes(row.state)).map(row=>({date:row.date,state:row.state,authority:'d1',startedAt:timestamp(row.started_at),preparationMs:clock(row.preparation_ms),preparationAttempts:Number.isSafeInteger(row.preparation_attempts)&&row.preparation_attempts>=0?row.preparation_attempts:0}));
 return {available:true,runs};
}
export async function readSystemHealth(env,{now=Date.now(),jobsOnly=false}={}){
 const checkedAt=nowValue(now),db=env?.GSIS_JOBS,output={checkedAt,storage:{configured:!!db,available:false},jobs:[],recentFailures:[],backlog:{available:false,items:[]},timetables:{available:false},cleanup:{available:false},allocationPreparation:{available:false}};
 if(jobsOnly)Object.assign(output.storage,{healthAvailable:false,historyAvailable:false});
 if(!db||typeof db.prepare!=='function')return output;
 try{
  const session=primary(db),fields='job,status,code,http_status,trace_id,started_at,finished_at,event_at,recorded_at,last_success_at,last_failure_at,counts_json';
  const healthAvailable=await tableExists(session,'gsis_job_health'),historyAvailable=await tableExists(session,'gsis_job_health_history');
  if(jobsOnly)Object.assign(output.storage,{healthAvailable,historyAvailable});
  const healthDetail=healthAvailable&&await diagnosticColumn(session,'gsis_job_health')?'diagnostic_json':"'{}' AS diagnostic_json",historyDetail=historyAvailable&&await diagnosticColumn(session,'gsis_job_health_history')?'diagnostic_json':"'{}' AS diagnostic_json";
  const jobs=healthAvailable?checked(await session.prepare(`SELECT ${fields},${healthDetail} FROM gsis_job_health ORDER BY job LIMIT 32`).all()):{results:[]};
  const failures=historyAvailable?checked(await session.prepare(`SELECT job,status,code,http_status,trace_id,started_at,finished_at,event_at,recorded_at,counts_json,${historyDetail} FROM gsis_job_health_history WHERE status='failure' AND recorded_at>=? ORDER BY event_at DESC,id DESC LIMIT 20`).bind(checkedAt-HISTORY_DAYS*DAY).all()):{results:[]};
  output.jobs=(jobs.results||[]).map(rowProjection).filter(Boolean);output.recentFailures=(failures.results||[]).map(rowProjection).filter(Boolean);output.storage.available=true;
  try{output.cutoverFreeze=await readRosterCutoverFreeze(env,{now:checkedAt});}catch{output.cutoverFreeze={available:false,code:'ROSTER_CUTOVER_STATUS_UNAVAILABLE'};}
  if(env.ROSTER_EDGE_AUTHORITY==='d1')try{output.allocationPreparation=await readAllocationPreparation(session);}catch{output.allocationPreparation={available:false};}
  if(jobsOnly)return output;
  // A missing optional schema cannot convert healthy storage into a false empty
  // backlog. Each section independently says whether it could be checked.
  try{output.backlog=await readBacklog(session,checkedAt);}catch{output.backlog={available:false,items:[]};}
  try{output.cleanup=await readCleanup(session);}catch{output.cleanup={available:false};}
 }catch{output.storage.available=false;}return output;
}
