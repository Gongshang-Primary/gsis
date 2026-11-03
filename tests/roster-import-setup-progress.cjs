'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const label=require('../package.json').gsisBuildLabel;
 for(const directory of ['public','roster-update/public'])assert(fs.readFileSync(directory+'/edge-setup.html','utf8').includes('v'+label+' · Administrator'),'setup must show the real build label');
 const dom=new JSDOM(fs.readFileSync('roster-update/public/edge-setup.html','utf8'),{url:'https://roster.example.test/edge-setup.html',runScripts:'outside-only'}),w=dom.window,timers=new Map();let now=10000,calls=0;
 w.performance.now=()=>now;w.setInterval=fn=>{const id=timers.size+1;timers.set(id,fn);return id;};w.clearInterval=id=>timers.delete(id);
 w.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({ok:true,data:{scopes:[{scope:'roster',mode:'legacy'}],canResume:true,cutoverFreeze:{supported:true,active:true,state:'frozen',requestId:'freeze-request',ageMs:119000},importSession:{state:'preparing',preparing:true,requestId:'import-request',sessionId:'a'.repeat(64),step:141,done:141,total:143,elapsedMs:70000}}})};};
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());for(let i=0;i<10;i++)await new Promise(setImmediate);
 assert.match(w.document.getElementById('status-message').textContent,/step 141 of 143/,'reload renders persisted D1 preparation progress');
 now+=2000;for(const timer of timers.values())timer();assert.match(w.document.getElementById('cutover-freeze').textContent,/2 min/);assert.equal(calls,1,'age advances locally, with no extra server calls');
 dom.window.close();console.log('PASS setup build label, restored preparation ordinal and live freeze age');
})().catch(error=>{console.error(error);process.exitCode=1;});
