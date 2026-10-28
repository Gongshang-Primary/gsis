// Recovery's stop control must live outside the database being restored.
// The authenticated backend owns authorization; none of these helpers restore D1.
const RETENTION_MS=30*86400000;
const REASONS=new Set(['manual','pre-migration','pre-upgrade','pre-restore']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ACCOUNT=/^[a-f0-9]{32}$/i;
const BOOKMARK=/^[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}$/i;
const VERSION=/^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-.a-z0-9]{1,24})?$/;
const VERIFICATION='cloudflare-time-travel-api';

function failure(status,code,message){return Object.assign(new Error(message),{status,code});}
function modeOf(env){
 const mode=env?.GSIS_RECOVERY_MODE;
 if(mode===undefined||mode===''||mode===false||mode==='false')return 'active';
 return mode===true||mode==='true'?'paused':'misconfigured';
}
export function assertRecoveryWritable(env){
 const mode=modeOf(env);
 if(mode==='paused')throw failure(503,'GSIS_RECOVERY_PAUSED','Recovery is in progress. Changes and background work are paused.');
 if(mode!=='active')throw failure(503,'GSIS_RECOVERY_CONFIG','Recovery control is misconfigured. Changes and background work are paused.');
}
function identityConfig(env){
 const account=env?.GSIS_RECOVERY_ACCOUNT_ID,database=env?.GSIS_RECOVERY_DATABASE_ID;
 return typeof account==='string'&&ACCOUNT.test(account)&&typeof database==='string'&&UUID.test(database)?{account,database}:null;
}
function captureConfig(env){
 const identity=identityConfig(env),token=env?.GSIS_RECOVERY_CF_API_TOKEN,version=env?.GSIS_RELEASE_VERSION??'0.9.9';
 return identity&&typeof token==='string'&&token.length>0&&token.length<=4096&&!/\s/.test(token)&&typeof version==='string'&&VERSION.test(version)?{...identity,token,version}:null;
}
function primary(env){
 const db=env?.GSIS_JOBS;
 if(!db||typeof db.prepare!=='function')return null;
 return typeof db.withSession==='function'?db.withSession('first-primary'):db;
}
function checkpointView(row){
 if(!UUID.test(row.id)||!BOOKMARK.test(row.bookmark)||!VERSION.test(row.source_version)||!REASONS.has(row.reason)||row.verification!==VERIFICATION||!Number.isSafeInteger(row.captured_at))return null;
 return {id:row.id,bookmark:row.bookmark,capturedAt:new Date(row.captured_at).toISOString(),sourceVersion:row.source_version,reason:row.reason,label:row.reason,verified:true};
}

// This read intentionally does not create tables or prune: it remains safe while
// every writer is stopped, including immediately after a native D1 rollback.
export async function readRecoveryState(env){
 const mode=modeOf(env),config=identityConfig(env),db=primary(env),now=Date.now();
 const state={paused:mode!=='active',mode,checkpointCaptureConfigured:!!captureConfig(env),checkpointStorage:db?'available':'unavailable',checkpoints:[],timeTravelDays:30};
 if(!db)return state;
 try{
  const exists=await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='gsis_recovery_checkpoints'").first();
  if(!exists||!config)return state;
  const result=await db.prepare('SELECT id,bookmark,captured_at,source_version,reason,verification FROM gsis_recovery_checkpoints WHERE account_id=? AND database_id=? AND verification=? AND captured_at>=? AND captured_at<=? ORDER BY captured_at DESC,rowid DESC LIMIT 20').bind(config.account,config.database,VERIFICATION,now-RETENTION_MS,now).all();
  if(result.success===false)throw new Error('read failed');
  state.checkpoints=(result.results||[]).map(checkpointView).filter(Boolean);
 }catch{state.checkpointStorage='unavailable';}
 return state;
}

function inputReason(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='reason'&&k!=='label'))throw failure(400,'GSIS_RECOVERY_INPUT','Choose a supported checkpoint reason.');
 if(input.reason!==undefined&&input.label!==undefined&&input.reason!==input.label)throw failure(400,'GSIS_RECOVERY_INPUT','Choose one checkpoint reason.');
 const reason=input.reason??input.label??'manual';
 if(!REASONS.has(reason))throw failure(400,'GSIS_RECOVERY_INPUT','Choose a supported checkpoint reason.');
 return reason;
}
function actorIdentity(actor){
 const value=typeof actor==='string'?actor:actor?.email;
 if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||/[\u0000-\u001f\u007f]/.test(value))throw failure(400,'GSIS_RECOVERY_ACTOR','An authenticated administrator identity is required.');
 return value.toLowerCase();
}
async function nativeBookmark(config){
 try{
  // A D1 session bookmark or client-supplied string is not Time Travel evidence.
  // No timestamp means the provider returns the current native restore point.
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account}/d1/database/${config.database}/time_travel/bookmark`,{method:'GET',headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok||!response.body)throw new Error('provider response');
  const reader=response.body.getReader(),chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new Error('provider response size');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  if(payload?.success!==true||(payload.errors!==undefined&&(!Array.isArray(payload.errors)||payload.errors.length!==0))||typeof payload.result?.bookmark!=='string'||!BOOKMARK.test(payload.result.bookmark))throw new Error('provider evidence');
  return payload.result.bookmark;
 }catch{throw failure(503,'GSIS_RECOVERY_VERIFY_FAILED','Cloudflare could not verify a native Time Travel checkpoint. No checkpoint was recorded.');}
}

export async function recordRecoveryCheckpoint(env,input={},actor){
 assertRecoveryWritable(env);
 const reason=inputReason(input),actorId=actorIdentity(actor),config=captureConfig(env);
 if(!config)throw failure(503,'GSIS_RECOVERY_CONFIG','Native checkpoint capture is not configured. An operator can use D1 Time Travel directly.');
 const db=primary(env);
 if(!db||typeof db.batch!=='function')throw failure(503,'GSIS_RECOVERY_STORAGE','Checkpoint storage is unavailable.');
 const bookmark=await nativeBookmark(config),now=Date.now();
 assertRecoveryWritable(env);
 const row={id:crypto.randomUUID(),bookmark,captured_at:now,source_version:config.version,reason,verification:VERIFICATION};
 try{
  const statements=[
   db.prepare('CREATE TABLE IF NOT EXISTS gsis_recovery_checkpoints (id TEXT PRIMARY KEY,bookmark TEXT NOT NULL,captured_at INTEGER NOT NULL,source_version TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,account_id TEXT NOT NULL,database_id TEXT NOT NULL,verification TEXT NOT NULL)'),
   db.prepare('CREATE INDEX IF NOT EXISTS gsis_recovery_checkpoints_time ON gsis_recovery_checkpoints(captured_at DESC)'),
   db.prepare('INSERT INTO gsis_recovery_checkpoints (id,bookmark,captured_at,source_version,reason,actor,account_id,database_id,verification) VALUES (?,?,?,?,?,?,?,?,?)').bind(row.id,bookmark,now,config.version,reason,actorId,config.account,config.database,VERIFICATION),
   db.prepare('DELETE FROM gsis_recovery_checkpoints WHERE captured_at<?').bind(now-RETENTION_MS),
   // Insertion order breaks clock ties; a new UUID must not be pruned merely
   // because its random text sorts before an older row captured in the same ms.
   db.prepare('DELETE FROM gsis_recovery_checkpoints WHERE id IN (SELECT id FROM gsis_recovery_checkpoints ORDER BY captured_at DESC,rowid DESC LIMIT -1 OFFSET 100)')
  ];
  const results=await db.batch(statements);
  if(!Array.isArray(results)||results.length!==statements.length||results.some(r=>r.success===false))throw new Error('checkpoint write');
 }catch{throw failure(503,'GSIS_RECOVERY_STORAGE','The checkpoint record could not be saved. Retry capture before changing the database.');}
 return checkpointView(row);
}
