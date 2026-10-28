'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/,`window.testCalendar={state,syncYear,cancelSourceReadRetry:typeof cancelSourceReadRetry==='function'?cancelSourceReadRetry:null};})();`);
function fixture(code='SOURCE_READ_DEFERRED',definite=true){
 const dom=new JSDOM(html,{url:'https://calendar.synthetic.test',runScripts:'outside-only'}),w=dom.window,timers=[],calls=[];
 let timerId=0;const scheduled=new Map();
 w.setTimeout=(fn,delay)=>{const id=++timerId;scheduled.set(id,fn);if(delay>=60000&&delay<=600000)timers.push(fn);return id;};w.clearTimeout=id=>{const fn=scheduled.get(id),index=timers.indexOf(fn);if(index>=0)timers.splice(index,1);scheduled.delete(id);};
 w.fetch=async(url,options)=>{const input=JSON.parse(options.body);calls.push(input);return {ok:false,status:429,json:async()=>({ok:false,error:'Source reads limited',code,definite,retryAfterMs:60000})};};
 vm.runInContext(source,dom.getInternalVMContext());const app=w.testCalendar;Object.assign(app.state,{year:2026,page:'events',readOnly:false,data:{actor:{userAlias:'admin',isAdmin:true},years:[{Year:2026}],events:[],lanes:[],tags:[]}});
 return {dom,w,app,timers,calls};
}
(async()=>{
 // Only a typed definite source-read deferral may repeat preparation; unknown starts never repeat.
 const f=fixture();await f.app.syncYear('staff');assert.equal(f.calls.length,1);assert.equal(f.timers.length,1,'A known source-read-only failure schedules a bounded retry');assert(!f.app.state.calendarOperation,'Waiting for source quota does not block event editing');
 await f.timers.shift()();assert.equal(f.calls.length,2);await f.timers.shift()();assert.equal(f.calls.length,3);assert.equal(f.timers.length,0,'Automatic preparation retry stops after three total attempts');f.dom.window.close();
 for(const cancel of ['explicit','year','logout','editor','queued']){
  const g=fixture();await g.app.syncYear('staff');const retry=g.timers.shift();
  if(cancel==='explicit')g.app.cancelSourceReadRetry();
  if(cancel==='year')g.app.state.year=2027;
  if(cancel==='logout')g.app.state.data=null;
  if(cancel==='editor')g.w.document.getElementById('modalHost').innerHTML='<form data-dirty="1"><input value="retained draft"></form>';
  if(cancel==='queued')g.app.state.calendarJobs=[{blocked:true}];
  await retry();assert.equal(g.calls.length,1,cancel+' cancels deferred preparation without resending');g.dom.window.close();
 }
 for(const [code,definite]of [['TRANSPORT_ERROR',false],['SOURCE_READ_DEFERRED',false],['UNKNOWN',true]]){const g=fixture(code,definite);await g.app.syncYear('staff');assert.equal(g.timers.length,0,'Unknown/non-source errors must not repeat startSyncYear');g.dom.window.close();}
 console.log('PASS Calendar source retry UI: typed definite pre-session reads only, three total attempts, nonblocking wait, cancel/year/logout/editor/queued guards and no unknown-start retry');
})().catch(error=>{console.error(error);process.exit(1);});
