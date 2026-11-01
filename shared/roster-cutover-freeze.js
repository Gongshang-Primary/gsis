// The Google Script Property is the writer fence. This small D1 hold keeps
// background jobs from consuming work while that fence is being established.
import {assertRecoveryWritable} from './edge-recovery.js';
const ACTIVE=new Set(['freezing','frozen','cancelling']),STATES=new Set([...ACTIVE,'cancelled','activated']);
const fail=(message,status=503,code='ROSTER_CUTOVER_STATUS_UNAVAILABLE')=>{throw Object.assign(Error(message),{status,code});};
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(value);
const validTime=value=>Number.isSafeInteger(value)&&value>=0;
const idle=()=>({available:true,active:false,state:'idle',requestId:null,frozenAt:null,ageMs:0,overdue:false,revision:0});
function database(env,required=false){const db=env?.GSIS_JOBS;if(!db?.prepare||!db?.batch){if(required)fail('Bind the existing operational database before freezing Google.');return null;}return db.withSession?.('first-primary')||db;}
async function stored(db){
 if(!db)return null;
 try{return await db.prepare('SELECT request_id,phase,started_at,revision FROM gsis_roster_cutover_freeze WHERE id=1').first();}
 catch(error){if(/no such table:\s*(?:main\.)?gsis_roster_cutover_freeze\b/i.test(String(error?.message||'')))return null;fail('Cutover freeze status could not be verified.');}
}
function project(row,now){
 if(!row)return idle();
 if(!validId(row.request_id)||!STATES.has(row.phase)||!validTime(row.started_at)||!Number.isSafeInteger(row.revision)||row.revision<1)fail('The retained cutover freeze status needs review.');
 const active=ACTIVE.has(row.phase),ageMs=active?Math.max(0,now-row.started_at):0;
 return {available:true,active,state:row.phase,requestId:row.request_id,frozenAt:new Date(row.started_at).toISOString(),ageMs,overdue:active&&ageMs>=14400000,revision:row.revision};
}
export async function readRosterCutoverFreeze(env,{now=Date.now()}={}){
 if(!validTime(now))fail('Use a valid cutover status time.');return project(await stored(database(env)),now);
}
async function ensure(db){
 const results=await db.batch([db.prepare("CREATE TABLE IF NOT EXISTS gsis_roster_cutover_freeze (id INTEGER PRIMARY KEY CHECK(id=1),request_id TEXT NOT NULL,phase TEXT NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL)")]);
 if(!Array.isArray(results)||results.some(row=>row?.success===false))fail('The cutover freeze hold could not be prepared.');
}
async function save(env,row,expectedRevision,now){
 assertRecoveryWritable(env);const db=database(env,true);await ensure(db);
 const results=await db.batch([
  db.prepare('INSERT INTO gsis_roster_cutover_freeze(id,request_id,phase,started_at,updated_at,revision) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET request_id=excluded.request_id,phase=excluded.phase,started_at=excluded.started_at,updated_at=excluded.updated_at,revision=excluded.revision WHERE gsis_roster_cutover_freeze.revision=?').bind(row.requestId,row.state,Date.parse(row.frozenAt),now,expectedRevision+1,expectedRevision),
  db.prepare('SELECT request_id,phase,started_at,revision FROM gsis_roster_cutover_freeze WHERE id=1')
 ]);
 if(!Array.isArray(results)||results.some(item=>item?.success===false))fail('The cutover freeze hold was not confirmed.');
 return {owned:results[0]?.meta?.changes===1,value:project(results[1]?.results?.[0],now)};
}
export async function beginRosterCutoverFreeze(env,{requestId,now=Date.now()}={}){
 if(!validId(requestId)||!validTime(now))fail('Use a stable cutover request reference.',400,'ROSTER_CUTOVER_REQUEST');
 assertRecoveryWritable(env);const db=database(env,true),before=project(await stored(db),now);
 if(before.requestId===requestId)return before;
 if(before.active)fail('Another cutover freeze is active. Reload its retained reference.',409,'ROSTER_CUTOVER_CONFLICT');
 const result=await save(env,{requestId,state:'freezing',frozenAt:new Date(now).toISOString()},before.revision,now);
 if(!result.owned)fail('The cutover freeze changed. Retry the same request.',409,'ROSTER_CUTOVER_CONFLICT');return result.value;
}
export async function cancelRosterCutoverFreeze(env,{freezeId,now=Date.now()}={}){
 if(!validId(freezeId)||!validTime(now))fail('Use the current freeze reference.',400,'ROSTER_CUTOVER_REQUEST');
 assertRecoveryWritable(env);const db=database(env,true),before=project(await stored(db),now);
 if(before.active&&before.requestId!==freezeId)fail('The freeze changed. Reload before cancelling it.',409,'ROSTER_CUTOVER_CONFLICT');
 if(before.requestId===freezeId&&(!before.active||before.state==='cancelling'))return before;
 const result=await save(env,{requestId:freezeId,state:'cancelling',frozenAt:before.frozenAt||new Date(now).toISOString()},before.revision,now);
 if(!result.owned)fail('The freeze changed. Retry cancellation.',409,'ROSTER_CUTOVER_CONFLICT');return result.value;
}
export async function syncRosterCutoverFreeze(env,proof,{expectedRevision,now=Date.now()}={}){
 if(!proof||proof.available!==true||typeof proof.active!=='boolean'||!['frozen','cancelled','activated'].includes(proof.state)||proof.active!==(proof.state==='frozen')||!validId(proof.requestId)||!validTime(Date.parse(proof.frozenAt))||!validTime(now))fail('The Google cutover freeze response could not be verified.');
 const db=database(env,true),before=project(await stored(db),now),expected=expectedRevision??before.revision;
 if(!Number.isSafeInteger(expected)||expected<0)fail('The cutover response revision is invalid.');
 if(before.revision!==expected)return before;
 const result=await save(env,proof,expected,now);return result.value;
}
