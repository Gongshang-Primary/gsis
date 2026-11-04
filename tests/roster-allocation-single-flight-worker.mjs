import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {recordJobHealth,safeHealthError} from '../shared/edge-health.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
const cyclePath=new URL('../notification-worker/allocation-cycle.js',import.meta.url),cycle=fs.existsSync(cyclePath)?await import(cyclePath):{};
const cycleSource=fs.existsSync(cyclePath)?fs.readFileSync(cyclePath,'utf8').replace(/^export /gm,''):'';
const NativeDate=Date;let now=NativeDate.parse('2026-11-04T16:01:00+08:00'),passed=0;
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
const source=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;\s*$/gm,'').replace('export default {','globalThis.worker={');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function until(check){for(let i=0;i<50&&!check();i++)await new Promise(r=>setImmediate(r));assert(check(),'allocator started');}
function fixture(work){
 const db=database(),health=[],sessions=[],env={GSIS_JOBS:db,ROSTER_AUTOMATION_ENABLED:'true'},calls={allocation:0,audit:0,notifications:0};let quiet=false;
 db.withSession=mode=>{sessions.push(mode);return db;};
 function worker(){const scope={Date,crypto,Promise,console:{info(){},error(){}},
  assertRecoveryWritable(){},rosterRecoveryEnvironment:e=>e,resolveRosterAuthorityEnvironment:async e=>e,readQuietMode:async()=>({active:quiet}),readRosterCutoverFreeze:async()=>({active:false}),
  recordJobHealth:async(_,value)=>health.push(value),safeHealthError,
  scheduledRoster:async()=>{calls.allocation++;return work(calls.allocation);},dispatchAllocationAudit:async()=>{calls.audit++;return {exported:1,failed:0,pending:0};},
  dispatchNotifications:async()=>{calls.notifications++;return {idle:true};},dispatchInboxPending:async()=>({idle:true}),dispatchReceivedReports:async()=>({idle:true}),dispatchPeerMail:async()=>({idle:true}),
  runRecoveryTimetableCleanup:async()=>({idle:true}),diagnoseNotificationConnections:async()=>({})};vm.createContext(scope);if(cycleSource)vm.runInContext(cycleSource,scope);vm.runInContext(source,scope);return scope.worker;}
 async function tick(cron='* * * * *'){const pending=[];await worker().scheduled({scheduledTime:now,cron},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);}
 return {db,env,health,calls,sessions,tick,setQuiet:value=>{quiet=value;},row:()=>db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get(),close:()=>db.sql.close()};
}
async function test(name,work){await work();passed++;console.log('PASS '+name);}
const timeout=()=>Object.assign(Error('Synthetic timeout'),{name:'TimeoutError'});
async function afterTimeout(f){await f.tick();assert.equal(f.row().timeout_streak,1);now=f.row().lease_until+1;}
try{
 for(const authority of ['legacy','d1'])await test('distinct '+authority+' Worker instances share atomic admission',async()=>{
  const waiting=deferred(),f=fixture(()=>waiting.promise);f.env.ROSTER_EDGE_AUTHORITY=authority;const first=f.tick();await until(()=>f.calls.allocation===1);now+=60000;
  await Promise.race([f.tick(),new Promise((_,reject)=>setTimeout(()=>reject(Error('overlap must finish independently')),500))]);
  waiting.resolve({idle:true});await first;
  assert.equal(f.calls.allocation,1,'overlapping triggers must start only one allocator before Calendar/Google work');
  assert(f.health.some(e=>e.job==='allocation'&&e.status==='skipped'&&e.code==='SKIPPED_BUSY'));assert(f.sessions.every(mode=>mode==='first-primary'));f.close();
 });
 await test('a denied claim whose owner settles before readback reports busy without false backoff',async()=>{
  const waiting=deferred(),f=fixture(()=>waiting.promise),first=f.tick();await until(()=>f.calls.allocation===1);const prepare=f.db.prepare;
  f.db.prepare=text=>{const statement=prepare(text);return text==='SELECT * FROM gsis_roster_allocation_cycle WHERE id=?'?{...statement,async first(){f.db.sql.prepare("UPDATE gsis_roster_allocation_cycle SET claim_id='',lease_until=0,next_run_at=0").run();return statement.first.call(this);}}:statement;};
  await f.tick();waiting.resolve({idle:true});await first;const skipped=f.health.find(e=>e.job==='allocation'&&e.status==='skipped');assert.equal(skipped.code,'SKIPPED_BUSY');assert.equal(skipped.counts.backoff,0);assert.equal(f.calls.allocation,1);f.close();
 });
 await test('uncertainty lease, two-timeout backoff and confirmed success reset',async()=>{
  const f=fixture(n=>{if(n<=2)throw timeout();return n===3?{busy:true}:{idle:true};});await afterTimeout(f);
  const first=f.health.find(e=>e.code==='TIMEOUT');assert.equal(first.counts.leaseSeconds,540);await f.tick();let row=f.row();assert.equal(row.timeout_streak,2);assert.equal(row.next_run_at-now,300000);
  now+=60000;await f.tick();assert.equal(f.calls.allocation,2);assert(f.health.some(e=>e.code==='SKIPPED_BUSY'&&e.status==='skipped'));
  now=row.lease_until+1;await f.tick();row=f.row();assert.equal(row.timeout_streak,2);assert.equal(row.lease_until,0);
  now+=60000;await f.tick();assert.equal(f.calls.allocation,3);assert(f.health.some(e=>e.code==='SKIPPED_BACKOFF'&&e.status==='skipped'));
  now=row.next_run_at;await f.tick();assert.equal(f.row().timeout_streak,0);assert.equal(f.row().next_run_at,0);now+=60000;await f.tick();assert.equal(f.calls.allocation,5);f.close();
 });
 await test('timeout then connection loss then timeout preserves consecutive uncertainty',async()=>{
  const f=fixture(n=>{throw n===2?new TypeError('Synthetic connection lost'):timeout();});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert(f.row().lease_until>now);now=f.row().lease_until+1;await f.tick();assert.equal(f.row().timeout_streak,2);assert.equal(f.row().next_run_at-now,300000);f.close();
 });
 await test('timeout names, codes and every 504 status count as timeouts',async()=>{
  for(const error of [{name:'AbortError'},{name:'TimeoutError'},{code:'TIMEOUT'},{code:'UPSTREAM_TIMEOUT'},{code:'ROSTER_GOOGLE_TIMEOUT'},{status:504},{httpStatus:504},{upstreamStatus:504}]){const f=fixture(()=>{throw error;});await f.tick();assert.equal(f.row().timeout_streak,1,JSON.stringify(error));assert(f.row().lease_until>now);assert(f.health.some(e=>e.code==='TIMEOUT'));f.close();}
 });
 await test('missing, malformed, unknown and contradictory results retain lease and streak',async()=>{
  for(const result of [null,undefined,[],{},true,0,{ok:true},{accepted:true},{revision:1},{allocatorRun:{}},{savedIds:null},{savedIds:[null]},{notificationsQueued:-1},{notificationsQueued:1.5},{ok:false,idle:true},{error:'PRIVATE',savedIds:[]},{failed:1,idle:true},{failures:['PRIVATE'],notificationsQueued:1},{success:false,idle:true},{idle:true,uncertain:1},{idle:true,pending:true},{idle:true,code:'PRIVATE_FAILURE'},{idle:true,status:504},{idle:true,savedIds:[null]},{savedIds:[],accepted:false}]){
   const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1,JSON.stringify(result));assert(f.row().lease_until>now,JSON.stringify(result));assert(f.health.some(e=>e.code==='INVALID_RESPONSE'&&e.status==='failure'));f.close();
  }
 });
 await test('disabled, configured, skipped and paused results preserve streak and release finished call',async()=>{
  for(const result of [{enabled:false},{configured:false},{disabled:true},{skipped:true},{backoff:true},{paused:true},{allocationPaused:true},{allocationSkipped:true},{allocationStopped:true},{idle:true,allocationPaused:true},{paused:true,savedIds:[],notificationsQueued:2}]){
   const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1,JSON.stringify(result));assert.equal(f.row().lease_until,0);assert.equal(f.health.filter(e=>e.job==='allocation').at(-1).status,'skipped');f.close();
  }
 });
 await test('malformed or failed skipped payloads retain uncertainty and never dispatch notices',async()=>{
  for(const result of [{allocationTimedOut:true,notificationsQueued:'2'},{paused:true,notificationsQueued:'2'},{skipped:true,notificationsQueued:-1},{allocationPaused:true,notificationsQueued:NaN},{paused:true,savedIds:[],error:'PRIVATE'},{skipped:true,ok:false},{paused:true,failed:1}]){
   const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert(f.row().lease_until>now,JSON.stringify(result));assert.equal(f.calls.notifications,2);assert(f.health.some(e=>e.code==='INVALID_RESPONSE'));f.close();
  }
 });
 await test('failure or unknown codes override skipped and legacy retry flags',async()=>{
  for(const flag of [{skipped:true},{paused:true},{allocationTimedOut:true}])for(const code of ['INVALID_RESPONSE','HTTP_ERROR','TIMEOUT','PRIVATE_UNKNOWN']){
   const f=fixture(n=>{if(n===1)throw timeout();return {...flag,code,notificationsQueued:3};});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert(f.row().lease_until>now,JSON.stringify({flag,code}));assert.equal(f.calls.notifications,2);const event=f.health.filter(e=>e.job==='allocation').at(-1);assert.equal(event.status,'failure');assert.equal(event.code,'INVALID_RESPONSE');f.close();
  }
 });
 await test('fresh completed paused/skipped notice work retains follow-up and never reports busy',async()=>{
  for(const result of [{skipped:true,code:'SKIPPED',notificationsQueued:1},{paused:true,code:'PAUSED',notificationsQueued:1},{configured:false,code:'NOT_CONFIGURED'},{skipped:true,code:'SKIPPED_BACKOFF'},{allocationTimedOut:true,code:'RETRY_LATER',notificationsQueued:1},{allocationTimedOut:true,savedIds:[],notificationsQueued:1},{paused:true,savedIds:[],notificationsQueued:2},{allocationPaused:true,notificationsQueued:1},{allocationSkipped:true,notificationsQueued:1},{skipped:true,notificationsQueued:1},{configured:false},{enabled:false}]){
   const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert.equal(f.row().lease_until,0);const event=f.health.filter(e=>e.job==='allocation').at(-1);assert.equal(event.status,'skipped');assert.equal(event.code,result.allocationTimedOut?'RETRY_LATER':result.code||'SKIPPED');assert.equal(f.calls.notifications,result.notificationsQueued?3:2);f.close();
  }
 });
 await test('confirmed current backend success shapes alone reset streak',async()=>{
  for(const result of [{idle:true},{replayed:true},{savedIds:[]},{savedIds:['synthetic-id'],revision:2,notificationsQueued:1},{notificationsQueued:0}]){const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,0,JSON.stringify(result));assert.equal(f.row().lease_until,0);f.close();}
 });
 await test('backend busy/refusal takes precedence and legacy timeout returns RETRY_LATER',async()=>{
  for(const result of [{busy:true},{skippedBusy:true},{allocationInProgress:true,allocationSkipped:true},{code:'ALLOCATION_BUSY'},{code:'ALLOCATION_IN_PROGRESS'},{code:'ALLOCATION_UNCONFIRMED'},{code:'SKIPPED_BUSY'},{busy:true,allocationTimedOut:true,notificationsQueued:3},{allocationTimedOut:true}]){
   const f=fixture(n=>{if(n===1)throw timeout();return result;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert.equal(f.row().lease_until,0);assert(f.health.some(e=>e.code===(result.allocationTimedOut&&!result.busy?'RETRY_LATER':'SKIPPED_BUSY')&&e.status==='skipped'));assert.equal(f.calls.notifications,2,'skipped results do not drain stale notices');f.close();
  }
  for(const error of [{code:'ALLOCATION_IN_PROGRESS',status:409},{code:'SKIPPED_BUSY',status:504},{code:'ABSENCE_TRANSPORT_PENDING',status:409}]){const f=fixture(n=>{if(n===1)throw timeout();throw error;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert.equal(f.row().lease_until,0);f.close();}
 });
 await test('thrown delivery counters cannot authorize a follow-up notification drain',async()=>{
  for(const error of [{code:'TIMEOUT',notificationsQueued:3},{code:'HTTP_ERROR',status:502,notificationsQueued:3},{name:'AbortError',notificationsQueued:3}]){
   const f=fixture(()=>{throw error;});await f.tick();assert(f.row().lease_until>now);assert.equal(f.calls.notifications,1);const event=f.health.find(e=>e.job==='allocation');assert.equal(event.status,'failure');assert.equal(event.counts.notificationsQueued,undefined);f.close();
  }
 });
 await test('falsy throws and non-timeout transport errors cannot become success',async()=>{
  for(const error of [undefined,null,false,0,'',new TypeError('Synthetic connection lost'),{code:'INVALID_RESPONSE',status:502},{code:'HTTP_ERROR',status:502}]){const f=fixture(n=>{if(n===1)throw timeout();throw error;});await afterTimeout(f);await f.tick();assert.equal(f.row().timeout_streak,1);assert(f.row().lease_until>now);assert(f.health.some(e=>e.status==='failure'));f.close();}
 });
 for(const reject of [false,true])await test('late '+(reject?'rejection':'success')+' cannot settle successor or dispatch stale notices',async()=>{
  const old=deferred(),next=deferred(),f=fixture(n=>n===1?old.promise:next.promise),first=f.tick();await until(()=>f.calls.allocation===1);now+=540001;const second=f.tick();await until(()=>f.calls.allocation===2);const before=f.row();
  if(reject)old.reject(timeout());else old.resolve({savedIds:['stale'],notificationsQueued:5});await first;assert.deepEqual(f.row(),before);assert.equal(f.calls.notifications,2);assert(f.health.some(e=>e.code==='SKIPPED_BUSY'&&e.counts.leaseLost===1));next.resolve({idle:true});await second;f.close();
 });
 await test('quiet mode and dedicated audit lane do not acquire allocation admission',async()=>{
  const f=fixture(()=>({idle:true}));f.setQuiet(true);await f.tick();await f.tick('2-57/5 * * * *');assert.equal(f.calls.allocation,0);assert.equal(f.calls.audit,0);assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='gsis_roster_allocation_cycle'").get().n,0);
  f.setQuiet(false);await f.tick('2-57/5 * * * *');assert.equal(f.calls.audit,1);assert.equal(f.calls.allocation,0);assert.equal(f.health.filter(e=>e.job==='audit-export').length,1);f.close();
 });
 await test('missing or failed durable storage fails closed before allocator',async()=>{
  for(const binding of [undefined,{}, {prepare(){throw Error('Synthetic unavailable');}}, {prepare(){return {async run(){return {success:false};}};}}]){const f=fixture(()=>({idle:true}));f.env.GSIS_JOBS=binding;await f.tick();assert.equal(f.calls.allocation,0);if(binding?.prepare)assert(f.health.some(e=>e.code==='ALLOCATION_CYCLE_STORAGE'));f.close();}
 });
 await test('automation disabled preserves durable timeout history without work',async()=>{
  const f=fixture(()=>{throw timeout();});await f.tick();const row=f.row();f.env.ROSTER_AUTOMATION_ENABLED='false';now+=60000;await f.tick();assert.equal(f.calls.allocation,1);assert.deepEqual(f.row(),row);f.close();
 });
 await test('health stores only approved safe single-flight codes and counters',async()=>{
  for(const code of ['SKIPPED_BUSY','SKIPPED_BACKOFF','ALLOCATION_CYCLE_STORAGE'])assert.equal(safeHealthError({code}).code,code);
  const db=database();await recordJobHealth({GSIS_JOBS:db},{job:'allocation',status:'skipped',code:'SKIPPED_BACKOFF',startedAt:now,finishedAt:now,counts:{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:420,leaseLost:1,staff:'PRIVATE',claim_id:'PRIVATE',readyAt:now}});
  const row=db.sql.prepare("SELECT code,counts_json FROM gsis_job_health WHERE job='allocation'").get();assert.equal(row.code,'SKIPPED_BACKOFF');assert.deepEqual(JSON.parse(row.counts_json),{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:420,leaseLost:1});db.sql.close();
 });
 console.log('PASS '+passed+' single-flight Worker groups');
}finally{globalThis.Date=NativeDate;}
