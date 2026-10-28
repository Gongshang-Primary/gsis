'use strict';
// Exercises the real app transport with elapsed time and AbortSignal. A slow
// mocked Google response is allowed to finish after the client has stopped.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const release=require('../package.json'),version=release.gsisComponentVersions?.calendarBackend||release.gsisRelease;
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8')
  .replace("document.addEventListener('DOMContentLoaded', init);",'')
  .replace(/\}\)\(\);\s*$/,`renderAll=()=>{renderYearSelect();renderDirtyPill();updateFreshnessUI();};window.testCalendar={state,syncYear,api,bindStaticEvents};})();`);
function fixture(){
 const dom=new JSDOM(html,{url:'https://calendar.example/',runScripts:'outside-only'}),w=dom.window;
 let now=Date.parse('2026-10-28T05:00:00Z'),sequence=0;const timers=new Map(),calls=[],aborted=[];
 w.setTimeout=(fn,delay=0)=>{const id=++sequence;timers.set(id,{at:now+Math.max(0,Number(delay)||0),fn});return id;};
 w.clearTimeout=id=>timers.delete(id);
 const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
 const advance=async ms=>{const until=now+ms;await flush();let steps=0;while(true){const next=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;assert(++steps<1000,'No tight timer loop');now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=until;await flush();};
 const data={version,actor:{userAlias:'admin',isAdmin:true},selectedYear:2026,years:[{Year:2026,ReleasedToTeachers:'Yes'}],events:[],lanes:[],pendingRemovals:[],tags:[],yearStructure:[],dayNotes:[],colourRules:[]};
 let bootstrapDelay=0,handler=()=>{throw Error('Unexpected backend request');};
 w.fetch=(url,options={})=>{
  const bootstrap=String(url).startsWith('/api/bootstrap'),body=bootstrap?{action:'bootstrap',payload:{}}:JSON.parse(options.body);
  calls.push({...body,at:now});const spec=bootstrap?{result:data,raw:true,delay:bootstrapDelay}:handler(body.action,body.payload);
  return new Promise((resolve,reject)=>{
   const abort=()=>{aborted.push(body.action);reject(new w.DOMException('Aborted','AbortError'));};
   options.signal?.addEventListener('abort',abort,{once:true});
   if(options.signal?.aborted){abort();return;}
   w.setTimeout(()=>{spec.onComplete?.();options.signal?.removeEventListener('abort',abort);if(spec.networkError){reject(new TypeError('Network response lost'));return;}const status=spec.status||200;resolve({ok:status<400,status,json:async()=>{if(spec.invalidJson)throw new SyntaxError('Truncated JSON response');return spec.error?{ok:false,...spec.error}:spec.raw?spec.result:{result:spec.result};}});},spec.delay||0);
  });
 };
 w.confirm=()=>true;vm.runInContext(source,dom.getInternalVMContext());const app=w.testCalendar;
 Object.assign(app.state,{data,year:2026,page:'stats',readOnly:false});app.bindStaticEvents();
 return {dom,w,app,calls,aborted,timers,advance,flush,now:()=>now,node:id=>w.document.getElementById(id),handler:fn=>handler=fn,delayBootstrap:ms=>bootstrapDelay=ms};
}
const counters=(extra={})=>({staffCreates:0,staffUpdates:0,staffDeletes:0,parentCreates:0,parentUpdates:0,parentDeletes:0,errors:[],errorCount:0,...extra});
const active=(extra={})=>({syncRunId:'SYNC-one',year:2026,target:'staff',completed:false,initialPending:6,processedTotal:0,remaining:6,blockedCount:0,writes:0,counts:counters(),...extra});
const complete=(extra={})=>active({completed:true,processedTotal:6,remaining:0,writes:6,counts:counters({staffCreates:6}),fullySynced:true,...extra});
const results=[];
async function test(name,work){try{await work();results.push({name,ok:true});console.log('PASS',name);}catch(error){results.push({name,ok:false,error:error.message});console.error('FAIL',name,error.stack);}}
async function finish(f,promise,ms=180000){let ended=false;promise.finally(()=>{ended=true;});await f.advance(ms);assert(ended,'Operation must settle within the test window');await promise;}
(async()=>{
 await test('A49second batch completes instead of the old45second abort',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:{delay:49000,result:complete()});await finish(f,f.app.syncYear('staff'),52000);assert.deepEqual(f.aborted,[]);assert.match(f.node('toast').textContent,/sync complete/i);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);}finally{f.dom.window.close();}
 });
 await test('A49second sync start is allowed but ordinary reads retain their45second bound',async()=>{
  const f=fixture();try{f.handler(action=>({delay:action==='startSyncYear'?49000:0,result:action==='startSyncYear'?active():complete()}));await finish(f,f.app.syncYear('staff'),52000);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.deepEqual(f.aborted,[]);
   f.handler(()=>({delay:49000,result:{ok:true}}));const ordinary=f.app.api('calendarPreflight').then(()=>null,e=>e);await f.advance(46000);assert.match((await ordinary).message,/timed out/i);assert.deepEqual(f.aborted,['calendarPreflight']);}finally{f.dom.window.close();}
 });
 await test('Uncertain batch waits for its claim and resumes only the same sync identity',async()=>{
  const f=fixture();try{let firstSettled=false,batches=0;f.handler((action,payload)=>{
   if(action==='startSyncYear')return {result:active()};
   if(action==='syncYearBatch'){assert.equal(payload.syncRunId,'SYNC-one');if(++batches===1)return {delay:105000,result:active({processedTotal:5,remaining:1,writes:5}),onComplete:()=>firstSettled=true};return {result:complete()};}
   assert.equal(action,'calendarSyncStatus');assert.deepEqual(payload,{syncRunId:'SYNC-one',year:2026,target:'staff'});return {result:active(firstSettled?{processedTotal:5,remaining:1,writes:5,inProgress:false,readyToResume:true}:{inProgress:true,retryAfterMs:1200})};
  });await finish(f,f.app.syncYear('staff'),160000);assert.equal(batches,2);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);const polls=f.calls.filter(c=>c.action==='calendarSyncStatus');assert(polls.length>=2);assert(polls[1].at-polls[0].at>=5000);assert.match(f.node('toast').textContent,/6 Calendar writes/);}finally{f.dom.window.close();}
 });
 await test('Lost final response recovers compact30error history without another write or fresh run',async()=>{
  const f=fixture();try{f.handler(action=>{
   if(action==='startSyncYear')return {result:active()};
   if(action==='syncYearBatch')return {networkError:true};
   assert.equal(action,'calendarSyncStatus');return {result:complete({processedTotal:81,writes:50,fullySynced:false,completionState:'errors',counts:counters({staffCreates:50,errorCount:30})})};
  });await finish(f,f.app.syncYear('staff'),30000);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);assert.match(f.node('toast').textContent,/30 errors/);assert.match(f.node('syncStage').textContent,/with errors/);}finally{f.dom.window.close();}
 });
 await test('Missing mismatched corrupt and revoked status outcomes stop without restarting',async()=>{
  for(const code of ['SYNC_STATUS_MISSING','SYNC_STATUS_MISMATCH','SYNC_CHECKPOINT_UNREADABLE','AUTH_REQUIRED']){const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{networkError:true}:{status:code==='AUTH_REQUIRED'?403:409,error:{code,error:'Status requires attention: '+code,definite:true}});await finish(f,f.app.syncYear('staff'),30000);assert.equal(f.calls.filter(c=>c.action==='calendarSyncStatus').length,1);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);assert.match(f.node('toast').textContent,/attention/);}finally{f.dom.window.close();}}
 });
 await test('Recovered quota cooldown is honoured and manual review never dispatches another batch',async()=>{
  for(const manual of [false,true]){const f=fixture();try{let batches=0,pausedAt;f.handler(action=>{
   if(action==='startSyncYear')return {result:active()};
   if(action==='syncYearBatch'){if(++batches===1)return {networkError:true};assert(f.now()-pausedAt>=60000,'No write before saved cooldown');return {result:complete()};}
   assert.equal(action,'calendarSyncStatus');pausedAt=f.now();return {result:active({paused:true,manualReview:manual,pauseReason:manual?'DAILY_QUOTA':'RATE_LIMIT',retryAfterMs:60000,nextAttemptEpochMs:f.now()+60000,inProgress:false,readyToResume:false})};
  });await finish(f,f.app.syncYear('staff'),90000);assert.equal(batches,manual?1:2);if(manual)assert.match(f.node('toast').textContent,/review/i);}finally{f.dom.window.close();}}
 });
 await test('Recovery is bounded when a claim or network never settles',async()=>{
  for(const unreachable of [false,true]){const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'||unreachable?{networkError:true}:{result:active({inProgress:true,retryAfterMs:1200})});await finish(f,f.app.syncYear('staff'),12*60000);const polls=f.calls.filter(c=>c.action==='calendarSyncStatus');assert(polls.length>0&&polls.length<=24);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);assert.match(f.node('toast').textContent,/retained|resumable|confirm/i);}finally{f.dom.window.close();}}
 });
 await test('Repeated uncertain batches with unchanged ready status cannot run forever',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{networkError:true}:{result:active({inProgress:false,readyToResume:true})});await finish(f,f.app.syncYear('staff'),12*60000);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,3);assert.match(f.node('toast').textContent,/retained|confirm/i);}finally{f.dom.window.close();}
 });
 await test('Repeated claimed batches and unchanged ready status share the no-progress bound',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{result:active({inProgress:true,retryAfterMs:1200})}:{result:active({inProgress:false,readyToResume:true})});await finish(f,f.app.syncYear('staff'),12*60000);assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,3);assert.match(f.node('toast').textContent,/retained|confirm/i);}finally{f.dom.window.close();}
 });
 await test('Stop waiting releases the page and ignores a late in-flight response',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:{delay:49000,result:active({processedTotal:5,remaining:1})});const running=f.app.syncYear('staff');await f.advance(1000);const stop=f.node('stopSyncWaiting');assert(stop&&!stop.classList.contains('hidden'),'Sync exposes local Stop waiting');stop.click();await f.advance(0);assert.equal(f.app.state.calendarOperation,null);assert.match(f.node('toast').textContent,/may still finish|may finish/i);await f.advance(180000);await running;assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.equal(f.calls.filter(c=>c.action==='calendarSyncStatus').length,0);assert.equal(f.calls.filter(c=>c.action==='bootstrap').length,0);}finally{f.dom.window.close();}
 });
 await test('Stop waiting cancels a pending recovery delay',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{networkError:true}:{result:active({inProgress:true,retryAfterMs:1200})});const running=f.app.syncYear('staff');await f.advance(1000);const stop=f.node('stopSyncWaiting');assert(stop,'Stop control exists');stop.click();await f.advance(12*60000);await running;assert.equal(f.calls.filter(c=>c.action==='calendarSyncStatus').length,0);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);}finally{f.dom.window.close();}
 });
 await test('An unknown start response never automatically starts or continues another run',async()=>{
  const f=fixture();try{f.handler(action=>{assert.equal(action,'startSyncYear');return {delay:100000,result:active()};});await finish(f,f.app.syncYear('staff'),12*60000);assert.equal(f.calls.length,1);assert.match(f.node('toast').textContent,/not yet confirmed/);}finally{f.dom.window.close();}
 });
 await test('A truncated successful batch response checks saved status instead of losing progress',async()=>{
  const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{invalidJson:true}:{result:complete()});await finish(f,f.app.syncYear('staff'),30000);assert.equal(f.calls.filter(c=>c.action==='calendarSyncStatus').length,1);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.match(f.node('toast').textContent,/sync complete/i);}finally{f.dom.window.close();}
 });
 await test('A successful status envelope for the wrong identity or without progress fails closed',async()=>{
  for(const extra of [{syncRunId:'SYNC-other'},{year:2027},{target:'parent'},{}]){const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{networkError:true}:{result:active(extra)});await finish(f,f.app.syncYear('staff'),30000);assert.equal(f.calls.filter(c=>c.action==='calendarSyncStatus').length,1);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);assert.match(f.node('toast').textContent,/review/);}finally{f.dom.window.close();}}
 });
 await test('Malformed completion counters cannot be reported as a clean successful sync',async()=>{
  for(const extra of [{counts:counters({errorCount:undefined})},{counts:counters({errorCount:-1})},{counts:counters({staffCreates:undefined})},{processedTotal:undefined},{fullySynced:true,counts:counters({errorCount:30})}]){const f=fixture();try{f.handler(action=>action==='startSyncYear'?{result:active()}:action==='syncYearBatch'?{networkError:true}:{result:complete(extra)});await finish(f,f.app.syncYear('staff'),30000);assert.match(f.node('toast').textContent,/review|verify/i);assert.doesNotMatch(f.node('toast').textContent,/sync complete/i);assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,1);}finally{f.dom.window.close();}}
 });
 await test('A late stopped run cannot change or release the next manual operation',async()=>{
  const f=fixture();try{let starts=0;f.handler(action=>action==='startSyncYear'?{result:active({syncRunId:++starts===1?'SYNC-one':'SYNC-two'})}:{delay:49000,result:complete()});const first=f.app.syncYear('staff');await f.advance(1000);f.node('stopSyncWaiting').click();await f.advance(0);await first;const next=f.app.syncYear('staff');await f.advance(1000);const owner=f.app.state.calendarOperation;await f.advance(47500);assert.equal(f.app.state.calendarOperation,owner);assert(!f.node('syncOverlay').classList.contains('hidden'));assert.equal(f.calls.filter(c=>c.action==='bootstrap').length,0);f.node('stopSyncWaiting').click();await f.advance(100000);await next;assert.equal(f.calls.filter(c=>c.action==='syncYearBatch').length,2);}finally{f.dom.window.close();}
 });
 await test('Confirmed completion refresh keeps its owner until the stateful loader settles',async()=>{
  const f=fixture();try{f.delayBootstrap(20000);f.handler(action=>({result:action==='startSyncYear'?active():complete()}));const running=f.app.syncYear('staff');await f.advance(1000);assert.equal(f.calls.filter(c=>c.action==='bootstrap').length,1);const owner=f.app.state.calendarOperation;assert(f.node('stopSyncWaiting').classList.contains('hidden'),'Stop is unavailable once confirmed results are refreshing');f.node('stopSyncWaiting').click();await f.advance(0);assert.equal(f.app.state.calendarOperation,owner);await f.app.syncYear('staff');assert.equal(f.calls.filter(c=>c.action==='startSyncYear').length,1);await f.advance(22000);await running;assert.equal(f.app.state.calendarOperation,null);assert.match(f.node('toast').textContent,/sync complete/);}finally{f.dom.window.close();}
 });
 fs.mkdirSync('verification/v098q',{recursive:true});fs.writeFileSync('verification/v098q/calendar-sync-transport-ui.json',JSON.stringify({total:results.length,passed:results.filter(r=>r.ok).length,results},null,2));process.exitCode=results.some(r=>!r.ok)?1:0;
})();
