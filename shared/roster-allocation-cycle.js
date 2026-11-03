// One durable scheduler admission per jobs database. A timed-out HTTP wait does
// not stop Apps Script. Cover its two-minute admission window, six-minute
// execution limit and one minute of safety margin before admitting a successor.
export const ALLOCATION_CYCLE_LEASE_MS=9*60000;
export const ALLOCATION_CYCLE_BACKOFF_MS=5*60000;
const schemas=new WeakMap(),id='scheduledRoster';
const busyCodes=new Set(['SKIPPED_BUSY','ALLOCATION_BUSY','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED']);
function storageError(){return Object.assign(Error('Scheduled allocation control is unavailable.'),{code:'ALLOCATION_CYCLE_STORAGE',status:503});}
function checked(result){if(result?.success===false)throw storageError();return result;}
async function ensure(db){
 if(!schemas.has(db))schemas.set(db,Promise.resolve().then(()=>db.prepare("CREATE TABLE IF NOT EXISTS gsis_roster_allocation_cycle (id TEXT PRIMARY KEY,claim_id TEXT NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,timeout_streak INTEGER NOT NULL DEFAULT 0,next_run_at INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)").run()).then(checked).catch(error=>{schemas.delete(db);throw error;}));
 await schemas.get(db);
}
function metadata(row){const now=Date.now();return {timeoutStreak:row.timeout_streak,backoff:row.timeout_streak>=2?1:0,backoffSeconds:Math.max(0,Math.ceil((row.next_run_at-now)/1000)),leaseSeconds:Math.max(0,Math.ceil((row.lease_until-now)/1000)),readyAt:Math.max(row.lease_until,row.next_run_at)};}
function skipped(row,code='SKIPPED_BUSY'){return {skipped:true,code,...metadata(row)};}
const timedOut=error=>['AbortError','TimeoutError'].includes(error?.name)||['TIMEOUT','UPSTREAM_TIMEOUT','ROSTER_GOOGLE_TIMEOUT'].includes(error?.code)||error?.status===504||error?.httpStatus===504;

export async function runAllocationCycle(env,work){
 if(env.ROSTER_AUTOMATION_ENABLED!=='true')return {enabled:false};
 const database=env.GSIS_JOBS;if(!database?.prepare)return {configured:false,skipped:true,code:'NOT_CONFIGURED'};
 let db,row,claimId;
 try{
  await ensure(database);db=typeof database.withSession==='function'?database.withSession('first-primary'):database;
  const now=Date.now();claimId=crypto.randomUUID();
  const claimed=checked(await db.prepare("INSERT INTO gsis_roster_allocation_cycle(id,claim_id,lease_until,timeout_streak,next_run_at,updated_at) VALUES(?,?,?,0,0,?) ON CONFLICT(id) DO UPDATE SET claim_id=excluded.claim_id,lease_until=excluded.lease_until,updated_at=excluded.updated_at WHERE gsis_roster_allocation_cycle.lease_until<=? AND gsis_roster_allocation_cycle.next_run_at<=? RETURNING *").bind(id,claimId,now+ALLOCATION_CYCLE_LEASE_MS,now,now,now).all());
  row=claimed.results?.[0];
  if(!row){const current=await db.prepare('SELECT * FROM gsis_roster_allocation_cycle WHERE id=?').bind(id).first();if(!current)throw storageError();return skipped(current,current.lease_until>now?'SKIPPED_BUSY':'SKIPPED_BACKOFF');}
 }catch{throw storageError();}
 const settle=async({timeout=false,retainLease=timeout,reset=false}={})=>{
  const now=Date.now(),streak=reset?0:timeout?row.timeout_streak+1:row.timeout_streak,
   next=streak>=2?now+ALLOCATION_CYCLE_BACKOFF_MS:0,lease=retainLease?row.lease_until:0;
  try{
   const result=checked(await db.prepare('UPDATE gsis_roster_allocation_cycle SET claim_id=?,lease_until=?,timeout_streak=?,next_run_at=?,updated_at=? WHERE id=? AND claim_id=? RETURNING *').bind(retainLease?claimId:'',lease,streak,next,now,id,claimId).all());
   return result.results?.[0]||null;
  }catch{throw storageError();}
 };
 let result,error;
 try{result=await work();}catch(value){error=value;}
 if(error){
  const busy=busyCodes.has(error?.code),timeout=!busy&&timedOut(error),status=error?.httpStatus??error?.status,
   uncertain=!busy&&(timeout||!Number.isInteger(status)||status>=500||status===408||['HTTP_ERROR','INVALID_RESPONSE','UPSTREAM_RESPONSE','BACKEND_UNAVAILABLE'].includes(error?.code)),
   saved=await settle({timeout,retainLease:uncertain,reset:!busy&&!timeout&&row.timeout_streak<2});
  if(!saved)return {skipped:true,code:'SKIPPED_BUSY',leaseLost:1};
  if(busy)return skipped(saved);
  const safe=error&&typeof error==='object'?error:Error('Scheduled allocation failed.');
  throw Object.assign(safe,metadata(saved),timeout?{code:'TIMEOUT'}:{});
 }
 const busy=result?.busy===true||result?.skippedBusy===true||busyCodes.has(result?.code),yielded=result?.allocationYielded===true||result?.allocationTimedOut===true,
  saved=await settle({reset:!busy&&!yielded});
 if(!saved)return {skipped:true,code:'SKIPPED_BUSY',leaseLost:1};
 if(busy)return {...result,...skipped(saved)};
 if(yielded)return {...result,skipped:true,code:'ALLOCATION_YIELDED',...metadata(saved)};
 return {...result,...metadata(saved)};
}
