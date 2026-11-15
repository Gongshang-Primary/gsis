'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const label=require('../package.json').gsisBuildLabel;
 for(const directory of ['public','roster-update/public'])assert(fs.readFileSync(directory+'/edge-setup.html','utf8').includes('v'+label+' · Administrator'),'setup must show the real build label');
 const dom=new JSDOM(fs.readFileSync('roster-update/public/edge-setup.html','utf8'),{url:'https://roster.example.test/edge-setup.html',runScripts:'outside-only'}),w=dom.window,timers=new Map();let now=10000,calls=0,failed=false,exact=false;
 w.performance.now=()=>now;w.setInterval=fn=>{const id=timers.size+1;timers.set(id,fn);return id;};w.clearInterval=id=>timers.delete(id);
 w.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({ok:true,data:{scopes:[{scope:'roster',mode:'legacy'}],canResume:true,cutoverFreeze:{supported:true,active:true,state:'frozen',requestId:'freeze-request',ageMs:119000},importSession:{state:'preparing',preparing:true,requestId:'import-request',sessionId:'a'.repeat(64),step:141,done:141,total:143,elapsedMs:70000,...(exact?{workDone:60,workTotal:63,preparedParts:141,progressUnit:'work-items'}:{}),...(failed?{failureReason:{status:504,phase:'Freeze parts',elapsed:70000,message:'Bridge timeout.',code:'ROSTER_BRIDGE_TIMEOUT',bytes:262157,records:0}}:{})}}})};};
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());for(let i=0;i<10;i++)await new Promise(setImmediate);
 assert.match(w.document.getElementById('status-message').textContent,/step 141 ·/,'reload renders persisted D1 preparation progress');
 now+=2000;for(const timer of timers.values())timer();assert.match(w.document.getElementById('cutover-freeze').textContent,/2 min/);assert.equal(calls,1,'age advances locally, with no extra server calls');
 failed=true;w.document.getElementById('op-status').click();for(let i=0;i<10;i++)await new Promise(setImmediate);assert.match(w.document.getElementById('status-message').textContent,/step 141\./i,'a failed step remains visible after reload');assert.match(w.document.getElementById('status-message').textContent,/Bridge timeout/);assert.match(w.document.getElementById('status-message').textContent,/262157 bytes/);assert.match(w.document.getElementById('status-message').textContent,/ROSTER_BRIDGE_TIMEOUT/);
 exact=true;w.document.getElementById('op-status').click();for(let i=0;i<10;i++)await new Promise(setImmediate);assert.match(w.document.getElementById('status-message').textContent,/60 of 63 work items/,'new replies render exact work counts');
 dom.window.close();console.log('PASS setup build label, restored preparation ordinal and live freeze age');
})().catch(error=>{console.error(error);process.exitCode=1;});

