import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {recordJobHealth,safeHealthError} from '../shared/edge-health.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
const cyclePath=new URL('../shared/roster-allocation-cycle.js',import.meta.url),cycle=fs.existsSync(cyclePath)?await import(cyclePath):{};
const NativeDate=Date;let now=NativeDate.parse('2026-11-04T16:00:00+08:00');
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
const source=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;\s*$/gm,'').replace('export default {','globalThis.worker={');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(work){
 const db=database(),health=[],logs=[],env={GSIS_JOBS:db,ROSTER_AUTOMATION_ENABLED:'true'},calls={allocation:0,audit:0};let quiet=false;
 function worker(){const scope={Date,crypto,Promise,console:{info:x=>logs.push(x),error:x=>logs.push(x)},runAllocationCycle:cycle.runAllocationCycle,
  assertRecoveryWritable(){},rosterRecoveryEnvironment:e=>e,resolveRosterAuthorityEnvironment:async e=>e,readQuietMode:async()=>({active:quiet}),readRosterCutoverFreeze:async()=>({active:false}),
  recordJobHealth:async(_env,value)=>health.push(value),safeHealthError:e=>({code:e.code||(['AbortError','TimeoutError'].includes(e.name)?'TIMEOUT':e.status?'HTTP_ERROR':'UNKNOWN_ERROR')}),
  scheduledRoster:async()=>{calls.allocation++;return work(calls.allocation);},dispatchAllocationAudit:async()=>{calls.audit++;return {exported:1,failed:0,pending:0};},
  dispatchNotifications:async()=>({idle:true}),dispatchInboxPending:async()=>({idle:true}),dispatchReceivedReports:async()=>({idle:true}),dispatchPeerMail:async()=>({idle:true}),
  runRecoveryTimetableCleanup:async()=>({idle:true}),diagnoseNotificationConnections:async()=>({})};vm.createContext(scope);vm.runInContext(source,scope);return scope.worker;}
 async function tick(cron='* * * * *'){const pending=[];await worker().scheduled({scheduledTime:now,cron},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);}
 return {db,env,health,calls,logs,tick,setQuiet:value=>{quiet=value;},close:()=>db.sql.close()};
}
try{
 for(const authority of ['legacy','d1']){
 const waiting=deferred(),f=fixture(()=>waiting.promise);f.env.ROSTER_EDGE_AUTHORITY=authority;const first=f.tick();
 for(let i=0;i<20&&!f.calls.allocation;i++)await new Promise(r=>setImmediate(r));
 assert.equal(f.calls.allocation,1);now+=60000;const second=f.tick();
 await Promise.race([second,new Promise((_,reject)=>setTimeout(()=>reject(Error('overlapping trigger must finish without awaiting the active allocator')),500))]);
 assert.equal(f.calls.allocation,1,'overlapping triggers start only one allocator before Calendar/Google preparation');
 assert(f.health.some(e=>e.job==='allocation'&&e.status==='skipped'&&e.code==='SKIPPED_BUSY'),'overlap records a skipped busy outcome');
 waiting.resolve({idle:true});await first;f.close();
 }
 console.log('PASS allocation cycle: overlapping Google/D1 Worker invocations share one lease and record SKIPPED_BUSY');
 {
  const f=fixture(n=>{if(n<=2)throw Object.assign(Error('Synthetic timeout'),{name:'TimeoutError'});if(n===3)return {skipped:true,code:'SKIPPED_BUSY'};return {idle:true};});
  await f.tick();let row=f.db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get();assert.equal(row.timeout_streak,1);assert(row.lease_until>now,'lost HTTP response keeps the Google execution lease');assert.equal(f.health.find(e=>e.job==='allocation'&&e.code==='TIMEOUT').counts.leaseSeconds,cycle.ALLOCATION_CYCLE_LEASE_MS/1000);
  now+=60000;await f.tick();assert.equal(f.calls.allocation,1,'a fresh Worker skips while abandoned Google work may run');
  now=row.lease_until+1;await f.tick();row=f.db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get();assert.equal(row.timeout_streak,2);assert.equal(row.next_run_at-now,300000);assert(f.health.some(e=>e.job==='allocation'&&e.code==='TIMEOUT'&&e.counts.backoff===1));
  now=row.lease_until+1;await f.tick();assert.equal(f.calls.allocation,3);row=f.db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get();assert.equal(row.lease_until,0);assert.equal(row.timeout_streak,2,'contention cannot clear a timeout backoff');
  now+=60000;await f.tick();assert.equal(f.calls.allocation,3);assert(f.health.some(e=>e.job==='allocation'&&e.status==='skipped'&&e.code==='SKIPPED_BACKOFF'));
  now=row.next_run_at;await f.tick();assert.equal(f.calls.allocation,4);row=f.db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get();assert.equal(row.timeout_streak,0);assert.equal(row.next_run_at,0);
  now+=60000;await f.tick();assert.equal(f.calls.allocation,5,'successful work restores minute cadence');f.close();
  console.log('PASS allocation cycle: abandoned-run lease, two-timeout five-minute backoff, busy preservation and success reset');
 }
 {
  const first=deferred(),second=deferred(),f=fixture(n=>n===1?first.promise:second.promise),a=f.tick();
  for(let i=0;i<20&&!f.calls.allocation;i++)await new Promise(r=>setImmediate(r));
  now+=cycle.ALLOCATION_CYCLE_LEASE_MS+1;const b=f.tick();for(let i=0;i<20&&f.calls.allocation<2;i++)await new Promise(r=>setImmediate(r));
  const successor=f.db.sql.prepare('SELECT claim_id FROM gsis_roster_allocation_cycle').get().claim_id;
  first.resolve({idle:true});await a;assert.equal(f.db.sql.prepare('SELECT claim_id FROM gsis_roster_allocation_cycle').get().claim_id,successor,'late old completion cannot clear a successor lease');
  await f.tick();assert.equal(f.calls.allocation,2);second.resolve({idle:true});await b;f.close();
  console.log('PASS allocation cycle: expired-owner settlement cannot release a successor');
 }
 {
  const f=fixture(()=>({idle:true}));f.setQuiet(true);await f.tick('2-57/5 * * * *');assert.equal(f.calls.allocation,0);assert.equal(f.calls.audit,0);
  f.setQuiet(false);await f.tick('2-57/5 * * * *');assert.equal(f.calls.allocation,0);assert.equal(f.calls.audit,1);assert.equal(f.health.filter(e=>e.job==='audit-export').length,1,'audit lane still owns exactly its original job');f.close();
  console.log('PASS allocation cycle: quiet audit makes no backend call and audit-lane contract stays intact');
 }
 {
  const f=fixture(()=>({idle:true}));f.env.GSIS_JOBS={prepare(){throw Error('Synthetic D1 unavailable');}};await f.tick();assert.equal(f.calls.allocation,0);assert(f.health.some(e=>e.job==='allocation'&&e.code==='ALLOCATION_CYCLE_STORAGE'));f.close();
  console.log('PASS allocation cycle: unavailable durable control fails closed before Google');
 }
 {
  for(const error of [new TypeError('Synthetic connection lost'),Object.assign(Error('Synthetic invalid response'),{code:'INVALID_RESPONSE',status:502})]){
   const f=fixture(()=>{throw error;});await f.tick();const row=f.db.sql.prepare('SELECT * FROM gsis_roster_allocation_cycle').get();assert(row.lease_until>now,'uncertain response retains the abandoned backend execution lease');assert.equal(row.timeout_streak,0,'a non-timeout transport failure does not count as a timeout');
   now+=60000;await f.tick();assert.equal(f.calls.allocation,1);f.close();
  }
  console.log('PASS allocation cycle: connection loss and invalid response retain the uncertain execution lease');
 }
 {
  const f=fixture(n=>{if(n===1)throw Object.assign(Error('Synthetic backend contention'),{code:'ALLOCATION_IN_PROGRESS',status:409});if(n===2)return {skipped:true,pending:true,allocationYielded:true,code:'ALLOCATION_YIELDED'};return {idle:true};});
  await f.tick();assert(f.health.some(e=>e.job==='allocation'&&e.status==='skipped'&&e.code==='SKIPPED_BUSY'));assert.equal(f.db.sql.prepare('SELECT lease_until FROM gsis_roster_allocation_cycle').get().lease_until,0);
  now+=60000;await f.tick();assert(f.health.some(e=>e.job==='allocation'&&e.status==='skipped'&&e.code==='ALLOCATION_YIELDED'));assert.equal(f.db.sql.prepare('SELECT lease_until FROM gsis_roster_allocation_cycle').get().lease_until,0);
  now+=60000;await f.tick();assert.equal(f.calls.allocation,3);assert(!f.health.some(e=>e.job==='allocation'&&e.code==='TIMEOUT'));f.close();
  console.log('PASS allocation cycle: confirmed backend busy/yield outcomes release admission and resume without timeout failures');
 }
 {
  assert.equal(safeHealthError({code:'SKIPPED_BUSY'}).code,'SKIPPED_BUSY');assert.equal(safeHealthError({code:'SKIPPED_BACKOFF'}).code,'SKIPPED_BACKOFF');
  const db=database();await recordJobHealth({GSIS_JOBS:db},{job:'allocation',status:'skipped',code:'SKIPPED_BACKOFF',startedAt:now,finishedAt:now,counts:{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:420,staff:'PRIVATE',readyAt:now}});
  const row=db.sql.prepare('SELECT code,counts_json FROM gsis_job_health WHERE job=?').get('allocation');assert.equal(row.code,'SKIPPED_BACKOFF');assert.deepEqual(JSON.parse(row.counts_json),{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:420});db.sql.close();
  console.log('PASS allocation cycle: System Health retains only safe backoff counters');
 }
 {
  const {JSDOM}=require('jsdom'),dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.gsps.edu.sg/system-health.html',runScripts:'outside-only'}),w=dom.window;
  w.fetch=async()=>({ok:true,json:async()=>({ok:true,data:{checkedAt:now,storage:{configured:true,available:true},jobs:[{job:'allocation',status:'skipped',code:'SKIPPED_BACKOFF',eventAt:now,counts:{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:0,staff:'PRIVATE'}}],recovery:{mode:'active',paused:false}}})});
  vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  const text=w.document.getElementById('jobs-body').textContent;assert.match(text,/SKIPPED_BACKOFF/);assert.match(text,/backoff active.*5 min/i);assert(!text.includes('PRIVATE'));dom.window.close();
  console.log('PASS allocation cycle: System Health displays backoff without private values');
 }
}finally{globalThis.Date=NativeDate;}
