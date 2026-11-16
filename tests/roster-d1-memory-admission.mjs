import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {withRosterMutationAdmission,runRosterMutation} from '../roster-update/public/edge-roster-admission.js';
import {runAllocationCycle} from '../notification-worker/allocation-cycle.js';
const database=createRequire(import.meta.url)('./helpers/chunked-import-db.cjs');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const busy=error=>error?.code==='ROSTER_MEMORY_BUSY'&&error.status===503;
async function until(check){for(let i=0;i<50&&!check();i++)await new Promise(setImmediate);assert(check(),'expected asynchronous boundary reached');}
let passed=0;
async function test(name,work){await work();passed++;console.log('PASS',name);}

await test('foreground, legacy and string settings cannot activate the gate',async()=>{
 for(const env of [{ROSTER_EDGE_AUTHORITY:'d1',ROSTER_MEMORY_ADMISSION:'true'},withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'legacy'}),{...withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'})}]){
  const hold=deferred();let inside=0;
  const run=()=>runRosterMutation(env,async()=>{inside++;await hold.promise;});
  const jobs=[run(),run()];await until(()=>inside===2);hold.resolve();await Promise.all(jobs);
 }
});

await test('D1 background mutations enter FIFO across separate invocation environments',async()=>{
 const a=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),b=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),hold=deferred(),order=[];
 let active=0,peak=0;
 const run=(env,id,wait)=>runRosterMutation(env,async()=>{active++;peak=Math.max(peak,active);order.push(id);try{if(wait)await wait;return id;}finally{active--;}});
 const first=run(a,1,hold.promise);await until(()=>active===1);
 const second=run(b,2),third=run(a,3);await Promise.resolve();assert.deepEqual(order,[1]);
 hold.resolve();assert.deepEqual(await Promise.all([first,second,third]),[1,2,3]);assert.deepEqual(order,[1,2,3]);assert.equal(peak,1);
});

await test('a thrown mutation releases its permit for a queued operation',async()=>{
 const env=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),hold=deferred(),error=Error('synthetic storage failure');let entered=false;
 const failed=runRosterMutation(env,async()=>{entered=true;await hold.promise;throw error;});
 const rejection=assert.rejects(failed,value=>value===error);await until(()=>entered);
 const next=runRosterMutation(env,()=>({saved:true}));hold.resolve();await rejection;assert.deepEqual(await next,{saved:true});
});

await test('only sixteen waiting commands are admitted and overflow never loads state',async()=>{
 const env=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),hold=deferred();let started=0;
 const first=runRosterMutation(env,async()=>{started++;await hold.promise;});await until(()=>started===1);
 const waiting=Array.from({length:16},(_,i)=>runRosterMutation(env,()=>{started++;return i;}));
 await assert.rejects(runRosterMutation(env,()=>assert.fail('overflow command must not load state')),busy);
 assert.equal(started,1);hold.resolve();await first;assert.deepEqual(await Promise.all(waiting),Array.from({length:16},(_,i)=>i));assert.equal(started,17);
});

function clockGate(){
 let now=1000,sequence=0;const timers=new Map(),source=fs.readFileSync(new URL('../roster-update/public/edge-roster-admission.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const context={Promise,WeakSet,Error,Date:{now:()=>now},setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(source+'\nglobalThis.gate={withRosterMutationAdmission,runRosterMutation};',context);
 return {...context.gate,timers,advance(ms,{fire=true}={}){now+=ms;if(fire)for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}

await test('waiting times out at thirty seconds without expiring the active mutation',async()=>{
 const gate=clockGate(),env=gate.withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),hold=deferred();let active=0;
 const first=gate.runRosterMutation(env,async()=>{active++;await hold.promise;active--;});await until(()=>active===1);
 const refused=assert.rejects(gate.runRosterMutation(env,()=>assert.fail('timed-out command must not load state')),busy);
 gate.advance(29999);assert.equal(gate.timers.size,1);gate.advance(1);await refused;assert.equal(active,1);
 let nextStarted=false;const next=gate.runRosterMutation(env,()=>{nextStarted=true;});await Promise.resolve();assert.equal(nextStarted,false);
 hold.resolve();await Promise.all([first,next]);assert.equal(nextStarted,true);assert.equal(gate.timers.size,0);
});

await test('an overdue waiter cannot start when its timer callback has been delayed',async()=>{
 const gate=clockGate(),env=gate.withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),hold=deferred();let entered=false;
 const first=gate.runRosterMutation(env,async()=>{entered=true;await hold.promise;});await until(()=>entered);
 const refused=assert.rejects(gate.runRosterMutation(env,()=>assert.fail('expired waiter must not materialize state')),busy);
 gate.advance(30000,{fire:false});hold.resolve();await Promise.all([first,refused]);assert.equal(gate.timers.size,0);
 assert.equal(await gate.runRosterMutation(env,()=>7),7);
});

await test('provider waiting outside a mutation does not hold resource admission',async()=>{
 const env=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'}),provider=deferred();let providerStarted=false;
 const sending=(async()=>{await runRosterMutation(env,()=>({claimId:'synthetic-claim'}));providerStarted=true;await provider.promise;return runRosterMutation(env,()=>({recorded:true}));})();
 await until(()=>providerStarted);assert.deepEqual(await runRosterMutation(env,()=>({absenceApplied:true})),{absenceApplied:true});provider.resolve();assert.deepEqual(await sending,{recorded:true});
});

await test('pre-admission refusal releases the durable allocation cycle lease',async()=>{
 const db=database(),env=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1',ROSTER_AUTOMATION_ENABLED:'true',GSIS_JOBS:db}),hold=deferred();let entered=false;
 const first=runRosterMutation(env,async()=>{entered=true;await hold.promise;});await until(()=>entered);
 const waiting=Array.from({length:16},()=>runRosterMutation(env,()=>true));
 try{
  const result=await runAllocationCycle(env,()=>runRosterMutation(env,()=>assert.fail('overflow allocation must not run')));
  assert.equal(result.code,'SKIPPED_BUSY');assert.equal(result.skipped,true);assert.equal(result.leaseSeconds,0);
  const row=db.sql.prepare('SELECT lease_until,timeout_streak,next_run_at FROM gsis_roster_allocation_cycle').get();
  assert.deepEqual({...row},{lease_until:0,timeout_streak:0,next_run_at:0});
 }finally{hold.resolve();await first;await Promise.all(waiting);}
 const recovered=await runAllocationCycle(env,()=>runRosterMutation(env,()=>({idle:true})));assert.equal(recovered.idle,true);assert.equal(recovered.leaseSeconds,0);db.sql.close();
});

await test('scheduled and queue entrypoints enable admission after verified D1 resolution',async()=>{
 const source=fs.readFileSync(new URL('../notification-worker/index.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace('export default {','globalThis.worker={');
 for(const kind of ['scheduled','queue']){
  let entered=0,acknowledged=false,resolved=0;const idle=async()=>({idle:true}),scope={Date,crypto,Promise,console:{info(){},error(){}},
   assertRecoveryWritable(){},resolveRosterAuthorityEnvironment:async env=>{resolved++;return {...env,ROSTER_EDGE_AUTHORITY:'d1'};},rosterRecoveryEnvironment:env=>env,
   withRosterMutationAdmission,readQuietMode:async()=>({active:false}),readRosterCutoverFreeze:async()=>({active:false}),safeHealthError:value=>({code:value?.code||'UNKNOWN_ERROR'}),
   dispatchReceivedReports:env=>runRosterMutation(env,()=>{entered++;return {idle:true};}),dispatchNotifications:env=>runRosterMutation(env,()=>{entered++;return {idle:true};}),
   dispatchReferencesRefresh:idle,dispatchRosterImports:idle,dispatchGoogleBackup:idle,dispatchInboxPending:idle,dispatchPeerMail:idle,dispatchDailyEmploymentReports:idle,dispatchVenuesSync:idle,
   runAllocationCycle:async(_env,work)=>work(),scheduledRoster:idle};
  vm.runInNewContext(source,scope);
  const hold=deferred(),background=withRosterMutationAdmission({ROSTER_EDGE_AUTHORITY:'d1'});let holding=false;
  const owner=runRosterMutation(background,async()=>{holding=true;await hold.promise;});await until(()=>holding);
  let work;
  if(kind==='scheduled')await scope.worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()},{ROSTER_EDGE_AUTHORITY:'legacy'},{waitUntil(value){work=value;}});
  else work=scope.worker.queue({messages:[{body:{purpose:'gsis-notification-wake-v1'}}],ackAll(){acknowledged=true;},retryAll(){assert.fail('idle queue work must not retry');}},{ROSTER_EDGE_AUTHORITY:'legacy'});
  await until(()=>resolved===1);await new Promise(setImmediate);assert.equal(entered,0,kind+' must wait before loading state');
  hold.resolve();await owner;await work;assert.equal(entered,2);if(kind==='queue')assert.equal(acknowledged,true);
 }
});

console.log(`${passed}/${passed} D1 mutation admission groups passed`);
