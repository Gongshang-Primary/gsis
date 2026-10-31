import {edgeDeployQuotaSource,edgeDeployQuotaUsesD1} from '../public/edge-deploy.js';
import {GSISRosterAllocation} from '../roster-update/public/edge-roster-domain.js';
import {writeQuotaSnapshot,readQuotaSnapshot,quotaSnapshotHealth} from './roster-quota-snapshot.js';
import {assertRecoveryWritable} from './edge-recovery.js';

const HOUR=3600000,LEASE=90000,installed=new WeakSet();
const fail=(code,message,status=503)=>{throw Object.assign(Error(message),{code,status});};
const time=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value)&&value.trim()===value;
const date=value=>typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function code(error){return /^QUOTA_SNAPSHOT_[A-Z0-9_]{1,60}$/.test(error?.code||'')||['GSIS_RECOVERY_PAUSED','GSIS_RECOVERY_CONFIG'].includes(error?.code)?error.code:'QUOTA_SNAPSHOT_SOURCE';}
async function configured(env){
 if(await edgeDeployQuotaUsesD1(env))return true;
 const secret=Object.prototype.hasOwnProperty.call(env||{},'GSIS_SECRET')?env.GSIS_SECRET:env?.DEPLOY_BRIDGE_SECRET||env?.BRIDGE_SECRET;
 return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env?.DEPLOY_APPS_SCRIPT_URL||env?.APPS_SCRIPT_URL||'')&&typeof secret==='string'&&/^[!-~]{32,8000}$/.test(secret);
}
function primary(env){const db=env?.GSIS_JOBS;if(!db?.prepare||!db?.batch)fail('QUOTA_SNAPSHOT_STORAGE','Published R snapshot storage is unavailable.');return typeof db.withSession==='function'?db.withSession('first-primary'):db;}
function checked(rows){if(!Array.isArray(rows)||rows.some(row=>row?.success===false))fail('QUOTA_SNAPSHOT_STORAGE','The R snapshot status transaction could not be confirmed.');return rows;}
async function storage(work){try{return await work();}catch(error){if(code(error)!=='QUOTA_SNAPSHOT_SOURCE')throw error;throw Object.assign(Error('Published R snapshot status storage is unavailable.'),{status:503,code:'QUOTA_SNAPSHOT_STORAGE'});}}
async function ensure(env,db){
 if(installed.has(db))return;assertRecoveryWritable(env);
 checked(await db.batch([db.prepare("CREATE TABLE IF NOT EXISTS gsis_roster_quota_control (cache_key TEXT PRIMARY KEY,attempt_token TEXT,attempt_at INTEGER NOT NULL DEFAULT 0,checked_at INTEGER NOT NULL DEFAULT 0,expected_json TEXT,state TEXT NOT NULL DEFAULT 'pending',last_code TEXT NOT NULL DEFAULT 'QUOTA_SNAPSHOT_MISSING',final_attempt INTEGER NOT NULL DEFAULT 0)")]));installed.add(db);
}
function source(value){
 if(!value||typeof value!=='object'||value.service!=='deploy'||!text(value.versionId)||!Number.isSafeInteger(value.revision)||value.revision<0||!text(value.commit)||!text(value.calculationVersion)||!date(value.from)||!date(value.to)||value.from>value.to||typeof value.publishedAt!=='string'||!Number.isFinite(Date.parse(value.publishedAt))||!date(value.publishedAt.slice(0,10))||value.publicationRevision!==undefined&&(!Number.isSafeInteger(value.publicationRevision)||value.publicationRevision<0))fail('QUOTA_SNAPSHOT_SOURCE','The published R source manifest is invalid.');
 return {service:'deploy',versionId:value.versionId,revision:value.revision,commit:value.commit,calculationVersion:value.calculationVersion,from:value.from,to:value.to,publishedAt:new Date(value.publishedAt).toISOString(),...(value.publicationRevision!==undefined?{publicationRevision:value.publicationRevision}:{})};
}
const identity=value=>JSON.stringify([value.service,value.versionId,value.revision,value.commit,value.calculationVersion,value.publishedAt,value.from,value.to,value.publicationRevision||0]);
const compare=(a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||(b.publicationRevision||0)-(a.publicationRevision||0)||b.revision-a.revision||b.commit.localeCompare(a.commit);
function manifest(value,{date:schoolDate,asOf}){
 if(!value||value.schema!=='gsis-roster-quota-source-v1'||!Array.isArray(value.publications)||value.publications.length>200||!Object.prototype.hasOwnProperty.call(value,'expectedSource'))fail('QUOTA_SNAPSHOT_SOURCE','The published R source manifest is unavailable.');
 const publications=value.publications.map(source),eligible=publications.filter(row=>Date.parse(row.publishedAt)<=asOf&&(!schoolDate||row.from<=schoolDate&&row.to>=schoolDate)).sort(compare)[0],expected=value.expectedSource===null?null:source(value.expectedSource);
 if(expected&&(Date.parse(expected.publishedAt)>asOf||schoolDate&&(expected.from>schoolDate||expected.to<schoolDate))||eligible&&(!expected||identity(eligible)!==identity(expected)))fail('QUOTA_SNAPSHOT_SOURCE','The published R source does not match this checkpoint.');
 return expected;
}
function control(row){
 if(!row)return null;
 if(!time(row.attempt_at)||!time(row.checked_at)||!['pending','checking','ready'].includes(row.state)||![0,1].includes(row.final_attempt)||row.expected_json!==null&&(typeof row.expected_json!=='string'||row.expected_json.length>5000))fail('QUOTA_SNAPSHOT_CORRUPT','The R snapshot status needs review.');
 let expected=null;try{const value=row.expected_json===null?null:JSON.parse(row.expected_json);expected=value===null?null:source(value);}catch{fail('QUOTA_SNAPSHOT_CORRUPT','The retained R publication identity needs review.');}
 return {...row,expected};
}
async function readControl(env,key){return storage(async()=>{const db=primary(env);await ensure(env,db);return control(await db.prepare('SELECT * FROM gsis_roster_quota_control WHERE cache_key=?').bind(key).first());});}
async function claim(env,key,now,interval,final){
 return storage(async()=>{
  assertRecoveryWritable(env);const db=primary(env);await ensure(env,db);const token=crypto.randomUUID();
  const rows=checked(await db.batch([
   db.prepare('INSERT OR IGNORE INTO gsis_roster_quota_control(cache_key) VALUES(?)').bind(key),
   db.prepare("UPDATE gsis_roster_quota_control SET attempt_token=?,attempt_at=?,checked_at=?,state='checking',last_code='QUOTA_SNAPSHOT_PENDING',final_attempt=CASE WHEN ?=1 THEN 1 ELSE final_attempt END WHERE cache_key=? AND attempt_at<=? AND (?=0 OR final_attempt=0) AND (attempt_token IS NULL OR checked_at<=? OR ?=1) AND (state<>'checking' OR attempt_at<=? OR ?=1)").bind(token,now,now,final?1:0,key,now,final?1:0,now-interval,final?1:0,now-LEASE,final?1:0),
   db.prepare('SELECT * FROM gsis_roster_quota_control WHERE cache_key=?').bind(key)
  ]));
  const row=control(rows[2]?.results?.[0]);if(!row)fail('QUOTA_SNAPSHOT_STORAGE','The R source check could not be claimed.');return {owned:row.attempt_token===token,token,row};
 });
}
async function record(env,key,token,state,lastCode,expected){
 return storage(async()=>{
  assertRecoveryWritable(env);const db=primary(env);await ensure(env,db);
  const result=await db.prepare('UPDATE gsis_roster_quota_control SET state=?,last_code=?,expected_json=CASE WHEN ?=1 THEN ? ELSE expected_json END WHERE cache_key=? AND attempt_token=?').bind(state,lastCode,expected===undefined?0:1,expected===undefined?null:JSON.stringify(expected),key,token).run();
  if(result?.success===false)fail('QUOTA_SNAPSHOT_STORAGE','The R source check was not saved.');return result?.meta?.changes===1;
 });
}
async function fetchSource(env,input){try{return await edgeDeployQuotaSource(env,input);}catch(error){throw Object.assign(Error('The trusted published R source is unavailable.'),{status:503,code:code(error)});}}
async function transfer(env,expected,request,now){
 const selection={date:request.date||expected.from,asOf:request.asOf,expectedSource:expected};
 try{return await readQuotaSnapshot(env,selection);}catch(error){if(!['QUOTA_SNAPSHOT_MISSING','QUOTA_SNAPSHOT_STALE'].includes(error.code))throw error;}
 const value=await fetchSource(env,{versionId:expected.versionId,revision:expected.revision,commit:expected.commit});
 if(identity(source(value?.source))!==identity(expected))fail('QUOTA_SNAPSHOT_SOURCE','The transferred R snapshot belongs to another publication.');
 assertRecoveryWritable(env);await writeQuotaSnapshot(env,JSON.parse(JSON.stringify(value)),{now});return readQuotaSnapshot(env,selection);
}
async function refresh(env,key,request,now,interval,final=false){
 const owned=await claim(env,key,now,interval,final);if(!owned.owned)return owned.row;
 try{
  const expected=manifest(await fetchSource(env,{manifest:true,...request}),request);
  // Save the trusted intent before transferring its body. Health can report lag
  // even if the body request fails or this execution is terminated afterward.
  if(!await record(env,key,owned.token,'checking','QUOTA_SNAPSHOT_PENDING',expected))return readControl(env,key);
  if(!expected){await record(env,key,owned.token,'pending','QUOTA_SNAPSHOT_MISSING');return readControl(env,key);}
  await transfer(env,expected,request,now);await record(env,key,owned.token,'ready','OK');return readControl(env,key);
 }catch(error){try{if(!await record(env,key,owned.token,'pending',code(error)))return readControl(env,key);}catch{}throw error;}
}

export async function dispatchQuotaSnapshot(env,{now=Date.now()}={}){
 assertRecoveryWritable(env);if(!await configured(env))return {configured:false,idle:true,processed:0,code:'QUOTA_SNAPSHOT_SOURCE'};
 if(!time(now))fail('QUOTA_SNAPSHOT_INVALID','Use a valid R snapshot sync time.',400);
 assertRecoveryWritable(env);const row=await refresh(env,'latest',{asOf:now},now,60000);
 if(row?.state==='checking')return {configured:true,idle:false,processed:0,pending:1,code:'QUOTA_SNAPSHOT_PENDING'};
 if(row?.state!=='ready')fail(row?.last_code||'QUOTA_SNAPSHOT_MISSING','The published R snapshot is awaiting transfer.');
 return {configured:true,idle:row.checked_at!==now,processed:row.checked_at===now?1:0,pending:0,revision:row.expected.revision,code:'OK'};
}

export async function readQuotaCheckpointEvidence(env,clock){
 const checkpoint=GSISRosterAllocation.quotaCheckpoint(clock),now=Number.isFinite(clock?.now)?clock.now:Date.parse(clock?.iso),last=GSISRosterAllocation.addDays(checkpoint.week,4),schoolDate=clock?.schoolDates===undefined?checkpoint.week:Array.isArray(clock.schoolDates)?[...new Set(clock.schoolDates.filter(value=>date(value)&&value>=checkpoint.week&&value<=last))].sort()[0]:null,key='week:'+checkpoint.week+':'+(schoolDate||'unverified');
 let row=null;const unavailable=error=>({...checkpoint,verified:false,source:row?.expected||null,rows:[],reason:'The publication-bound weekly R snapshot is not verified.',code:code(error||{code:row?.last_code||'QUOTA_SNAPSHOT_MISSING'})});
 try{
  if(!time(now)||!schoolDate)return unavailable();assertRecoveryWritable(env);if(!await configured(env))return unavailable();row=await readControl(env,key);
  const final=now>=checkpoint.retryUntil&&now<checkpoint.retryUntil+60000&&row?.final_attempt!==1,within=now>=checkpoint.cutoff&&now<checkpoint.retryUntil;
  if(final||within&&(!row||now-row.checked_at>=HOUR))row=await refresh(env,key,{date:schoolDate,asOf:checkpoint.cutoff},now,HOUR,final);
  if(row?.state!=='ready'||!row.expected)return unavailable();
  const value=await readQuotaSnapshot(env,{date:schoolDate,asOf:checkpoint.cutoff,expectedSource:row.expected});
  return {...checkpoint,verified:true,source:value.source,rows:value.rows};
 }catch(error){try{row=await readControl(env,key);}catch{}return unavailable(error);}
}

export async function readQuotaSnapshotStatus(env,{now=Date.now()}={}){
 try{
  assertRecoveryWritable(env);const row=await readControl(env,'latest'),health=await quotaSnapshotHealth(env,{now,expectedSource:row?.expected||undefined}),pending=!!row&&row.state!=='ready',lastCode=row?.last_code||(health.available?'OK':'QUOTA_SNAPSHOT_MISSING');
  return {...health,configured:await configured(env),status:pending||health.status==='behind'?'behind':health.status,lastCode,code:lastCode,sourceLag:pending||health.status==='behind',sourceCheckedAt:row?.checked_at||null,...(row?.expected?{expectedRevision:row.expected.revision,expectedVersionId:row.expected.versionId}:{})};
 }catch(error){return {configured:true,available:false,status:'missing',sourceLag:true,lastCode:code(error)==='QUOTA_SNAPSHOT_SOURCE'?'QUOTA_SNAPSHOT_STORAGE':code(error),code:code(error)==='QUOTA_SNAPSHOT_SOURCE'?'QUOTA_SNAPSHOT_STORAGE':code(error)};}
}
