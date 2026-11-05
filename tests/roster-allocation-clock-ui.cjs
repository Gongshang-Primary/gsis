'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('allocation monitor warns after 45 s only on Google Auto-allocate and shows preparation duration',()=>{
 const dom=new JSDOM('<section data-allocation-run></section>'),source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),now=Date.parse('2026-11-05T06:01:00+08:00'),scope=vm.createContext({document:dom.window.document,Date:class extends Date{static now(){return now;}},$:(s,q)=>dom.window.document.querySelector(q),esc:String,dateText:String,stamp:String,allocationRunning:r=>['running','committing'].includes(r?.state)});
 vm.runInContext(source.slice(source.indexOf(' function drawAllocationRun('),source.indexOf(' async function cancelAllocationRun(')),scope);
 const s={page:'Assign Relief',date:'2026-11-05',allocationRun:{id:'one',date:'2026-11-05',state:'running',authority:'google',allocationMode:'reoptimise',startedAt:new Date(now-45001).toISOString(),preparationMs:46000,log:[]}};
 scope.drawAllocationRun(s);assert.match(dom.window.document.body.textContent,/Google is slow; consider Auto-fill blanks/);assert.match(dom.window.document.body.textContent,/Preparation: 46.0 s/);
 s.allocationRun.startedAt=new Date(now-45000).toISOString();scope.drawAllocationRun(s);assert.doesNotMatch(dom.window.document.body.textContent,/Google is slow/);
 s.allocationRun.startedAt=new Date(now-60000).toISOString();s.allocationRun.authority='d1';scope.drawAllocationRun(s);assert.doesNotMatch(dom.window.document.body.textContent,/Google is slow/);
 s.autoStarting=true;s.allocationRun.state='completed';s.allocationRun.authority='google';scope.drawAllocationRun(s);assert.doesNotMatch(dom.window.document.body.textContent,/Google is slow|Preparation: 46/);s.autoStarting=false;s.allocationRun.state='running';
 s.allocationRun.authority='google';s.allocationRun.allocationMode='fill-only';scope.drawAllocationRun(s);assert.doesNotMatch(dom.window.document.body.textContent,/Google is slow/);dom.window.close();
});
test('System Health displays bounded preparation durations without exposing run actors',async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.gsps.edu.sg/system-health.html',runScripts:'outside-only'}),w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>({ok:true,data:{storage:{available:true},checkedAt:Date.now(),jobs:[],allocationPreparation:{available:true,runs:[{date:'2026-11-05',authority:'google',state:'completed',preparationMs:61234,preparationAttempts:2,actor:'private@example.org'}]}}})});
 vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await new Promise(setImmediate);await new Promise(setImmediate);
 assert.match(w.document.querySelector('#jobs-body').textContent,/2026-11-05.*61.2 s.*2/s);assert.doesNotMatch(w.document.body.textContent,/private@example/);dom.window.close();
});
