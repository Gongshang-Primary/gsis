'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.test/system-health.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const snapshot={profile:'google-recovery',checkedAt:Date.now(),venuesSync:{available:true,enabled:true,state:'uncertain',overdue:true,ageMs:301000,rosterState:'pending',venuesState:'pending',commitState:'uncertain',recoveryAllowed:true}};
 w.fetch=async(_,options)=>{const p=JSON.parse(options.body);calls.push(p);return {ok:true,status:200,json:async()=>({ok:true,data:p.operation==='recoverVenuesSync'?{complete:false,steps:[{step:'venues',state:'recovered',committed:false},{step:'roster',state:'refused',code:'VENUES_FENCE_PENDING'}]}:snapshot})};};
 try{
  vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await tick();await tick();const d=w.document,box=d.getElementById('venues-sync');assert(box,'System Health has a Venues sync row');assert.match(box.textContent,/uncertain/i);assert.equal(box.dataset.tone,'error');assert.equal(box.getAttribute('role'),'alert');
  d.getElementById('venues-evidence').value='Reviewed the actual stored transaction and its marker';d.getElementById('op-venues-recover').click();assert.equal(calls.length,1,'confirmation precedes recovery');assert(d.getElementById('confirmation').open);d.getElementById('confirm-action').click();await tick();await tick();assert.equal(calls.filter(p=>p.operation==='recoverVenuesSync').length,1);assert.match(d.getElementById('venues-recovery-results').textContent,/Venues.*recovered.*Roster.*refused/s);assert(!JSON.stringify(calls).includes('force'));
  snapshot.venuesSync={...snapshot.venuesSync,state:'ready',overdue:false,recoveryAllowed:false};d.getElementById('op-refresh').click();await tick();await tick();assert.equal(box.dataset.tone,'info');assert.equal(d.getElementById('op-venues-recover').hidden,true,'SMC read view has no recovery action');
 }finally{dom.window.close();}
 console.log('PASS Venues health UI: state, five-minute red alert, Admin confirmation, evidence and separate recovery outcomes');
})().catch(e=>{console.error(e);process.exitCode=1;});
