// An HTTP timeout does not stop Apps Script. Cover its two-minute admission
// window, six-minute execution limit and one-minute margin before a successor.
export const ALLOCATION_CYCLE_LEASE_MS=9*60000;
export const ALLOCATION_CYCLE_BACKOFF_MS=5*60000;
const schemas=new WeakMap(),id='scheduledRoster';
const busyCodes=new Set(['SKIPPED_BUSY','ALLOCATION_BUSY','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function storageError(){return Object.assign(Error('Scheduled allocation control is unavailable.'),{code:'ALLOCATION_CYCLE_STORAGE',status:503});}
function checked(result){if(!result||result.success===false)throw storageError();return result;}
async function ensure(database,db){
 if(!schemas.has(database))schemas.set(database,Promise.resolve().then(()=>db.prepare('CREATE TABLE IF NOT EXISTS gsis_roster_allocation_cycle (id TEXT PRIMARY KEY,claim_id TEXT NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,timeout_streak INTEGER NOT NULL DEFAULT 0,next_run_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)').run()).then(checked).catch(error=>{schemas.delete(database);throw error;}));
 await schemas.get(database);
}
function metadata(row){const now=Date.now();return {timeoutStreak:row.timeout_streak,backoff:row.timeout_streak>=2?1:0,backoffSeconds:Math.max(0,Math.ceil((row.next_run_at-now)/1000)),leaseSeconds:Math.max(0,Math.ceil((row.lease_until-now)/1000)),readyAt:Math.max(row.lease_until,row.next_run_at)};}
function skipped(row,code='SKIPPED_BUSY'){return {skipped:true,code,...metadata(row)};}
const timedOut=error=>['AbortError','TimeoutError'].includes(error?.name)||['TIMEOUT','UPSTREAM_TIMEOUT','ROSTER_GOOGLE_TIMEOUT'].includes(error?.code)||[error?.status,error?.httpStatus,error?.upstreamStatus].includes(504);
const busy=value=>busyCodes.has(value?.code)||value?.busy===true||value?.skippedBusy===true||value?.allocationInProgress===true;
function outcome(value){
 if(!object(value))return 'uncertain';
 if(busy(value))return 'busy';
 const validIds=Array.isArray(value.savedIds)&&value.savedIds.every(id=>typeof id==='string'&&id.length>0),
  validQueued=Number.isSafeInteger(value.notificationsQueued)&&value.notificationsQueued>=0;
 if([value.status,value.httpStatus,value.upstreamStatus].some(status=>Number.isInteger(status)&&status>=400)||
  value.savedIds!==undefined&&!validIds||value.notificationsQueued!==undefined&&!validQueued||
  value.accepted===false||value.ok===false||value.success===false||value.error||value.failure||value.failures?.length||
  ['failed','uncertain','unconfirmed','prepareFailures','resultFailures','pending','hasMore','incomplete','blocked','deferred','retrying'].some(key=>!!value[key]))return 'uncertain';
 if(value.code!==undefined&&!['OK','IDLE','SKIPPED','PAUSED','NOT_CONFIGURED','RETRY_LATER','SKIPPED_BACKOFF'].includes(value.code))return 'uncertain';
 if(value.allocationTimedOut===true)return 'retry';
 if(value.enabled===false||value.configured===false||['disabled','skipped','backoff','paused','allocationPaused','allocationSkipped','allocationStopped'].some(key=>!!value[key]))return 'skipped';
 if(value.code!==undefined&&!['OK','IDLE'].includes(value.code))return 'uncertain';
 if(value.idle===true||value.replayed===true||validIds||validQueued)return 'success';
 return 'uncertain';
}
export async function runAllocationCycle(env,work){
 if(env.ROSTER_AUTOMATION_ENABLED!=='true')return {enabled:false};
 const database=env.GSIS_JOBS;let db,row,claimId;
 try{
  if(!database?.prepare)throw storageError();
  db=typeof database.withSession==='function'?database.withSession('first-primary'):database;await ensure(database,db);
  const now=Date.now();claimId=crypto.randomUUID();
  const result=checked(await db.prepare('INSERT INTO gsis_roster_allocation_cycle(id,claim_id,lease_until,timeout_streak,next_run_at,updated_at) VALUES(?,?,?,0,0,?) ON CONFLICT(id) DO UPDATE SET claim_id=excluded.claim_id,lease_until=excluded.lease_until,updated_at=excluded.updated_at WHERE gsis_roster_allocation_cycle.lease_until<=? AND gsis_roster_allocation_cycle.next_run_at<=? RETURNING *').bind(id,claimId,now+ALLOCATION_CYCLE_LEASE_MS,now,now,now).all());
  if(!Array.isArray(result.results))throw storageError();row=result.results[0];
  if(!row){const current=await db.prepare('SELECT * FROM gsis_roster_allocation_cycle WHERE id=?').bind(id).first();if(!current)throw storageError();return skipped(current,current.lease_until<=now&&current.next_run_at>now?'SKIPPED_BACKOFF':'SKIPPED_BUSY');}
 }catch{throw storageError();}
 const settle=async({timeout=false,retainLease=false,reset=false}={})=>{
  const now=Date.now(),streak=reset?0:row.timeout_streak+(timeout?1:0),next=streak>=2?now+ALLOCATION_CYCLE_BACKOFF_MS:0;
  try{
   const result=checked(await db.prepare('UPDATE gsis_roster_allocation_cycle SET claim_id=?,lease_until=?,timeout_streak=?,next_run_at=?,updated_at=? WHERE id=? AND claim_id=? RETURNING *').bind(retainLease?claimId:'',retainLease?row.lease_until:0,streak,next,now,id,claimId).all());
   if(!Array.isArray(result.results))throw storageError();return result.results[0]||null;
  }catch{throw storageError();}
 };
 let result,error,threw=false;
 try{result=await work();}catch(value){threw=true;error=value;}
 if(threw){
  const refused=busy(error),timeout=!refused&&timedOut(error),status=error?.httpStatus??error?.status??error?.upstreamStatus,
   retainLease=!refused&&(timeout||!Number.isInteger(status)||status<400||status>=500||status===408||['HTTP_ERROR','INVALID_RESPONSE','UPSTREAM_RESPONSE','BACKEND_UNAVAILABLE'].includes(error?.code)),
   saved=await settle({timeout,retainLease});
  if(!saved)return {skipped:true,code:'SKIPPED_BUSY',leaseLost:1};
  if(refused)return skipped(saved);
  const detail=Object.fromEntries(['code','status','httpStatus','upstreamStatus','diagnosticId','backendVersion','failureStage','operation','pendingCaptureCount','pendingPeerCount'].filter(key=>error?.[key]!==undefined).map(key=>[key,error[key]]));
  throw Object.assign(Error('Scheduled allocation could not be confirmed.'),detail,metadata(saved),timeout?{code:'TIMEOUT'}:{});
 }
 const state=outcome(result),saved=await settle({retainLease:state==='uncertain',reset:state==='success'});
 if(!saved)return {skipped:true,code:'SKIPPED_BUSY',leaseLost:1};
 if(state==='uncertain')throw Object.assign(Error('Scheduled allocation returned an unconfirmed result.'),{code:'INVALID_RESPONSE'},metadata(saved));
 if(state==='busy')return skipped(saved);
 if(state==='retry'||state==='skipped'){
  // A current owner can finish summary/notice work while allocation is paused.
  const {notificationsQueued,...rest}=result;
  return {...rest,...skipped(saved,state==='retry'?'RETRY_LATER':result.code||'SKIPPED'),...(Number.isSafeInteger(notificationsQueued)&&notificationsQueued>=0?{notificationsQueued}:{})};
 }
 return {...result,...metadata(saved)};
}
