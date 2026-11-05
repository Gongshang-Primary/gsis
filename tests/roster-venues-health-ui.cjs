'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.test/system-health.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 assert.equal(w.document.querySelectorAll('textarea').length,0,'no recovery form before current Admin status is known');
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const snapshot={profile:'google-recovery',checkedAt:Date.now(),venuesSync:{available:true,enabled:true,state:'uncertain',overdue:true,ageMs:301000,rosterState:'pending',venuesState:'pending',commitState:'uncertain',recoveryAllowed:true}};
 let denied=false;
 w.fetch=async(path,options)=>{const p=JSON.parse(options.body);if(path==='/api/operations'){assert.deepEqual(p,{operation:'read',view:'timetableReview'});return {ok:true,status:200,json:async()=>({ok:true,data:{alerts:[],migrationNeeded:0}})};}calls.push(p);return denied?{ok:false,status:403,json:async()=>({ok:false,status:403})}:{ok:true,status:200,json:async()=>({ok:true,data:p.operation==='recoverVenuesSync'?{complete:false,steps:[{step:'venues',state:'recovered',committed:false},{step:'roster',state:'refused',code:'VENUES_FENCE_PENDING'}]}:snapshot})};};
 try{
  vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await tick();await tick();const d=w.document,box=d.getElementById('venues-sync');assert(box,'System Health has a Venues sync row');assert.match(box.textContent,/uncertain/i);assert.equal(box.dataset.tone,'error');assert.equal(box.getAttribute('role'),'alert');
  d.getElementById('venues-evidence').value='Reviewed the actual stored transaction and its marker';d.getElementById('op-venues-recover').click();assert.equal(calls.length,1,'confirmation precedes recovery');assert(d.getElementById('confirmation').open);d.getElementById('confirm-action').click();await tick();await tick();assert.equal(calls.filter(p=>p.operation==='recoverVenuesSync').length,1);assert.match(d.getElementById('venues-recovery-results').textContent,/Venues.*recovered.*did not commit.*Roster.*refused/s);assert(!JSON.stringify(calls).includes('force'));
  const pending={...snapshot.venuesSync};
  for(const [label,value] of [['ready Admin',{...pending,state:'ready',overdue:false}],['unconfigured',{...pending,enabled:false}],['SMC',{...pending,recoveryAllowed:false}],['missing',undefined]]){
   snapshot.venuesSync=value;d.getElementById('op-refresh').click();await tick();await tick();assert.equal(d.getElementById('op-venues-recover'),null,label+' has no recovery action');assert.equal(d.querySelectorAll('textarea').length,0,label+' has no recovery evidence field');assert(d.getElementById('venues-recovery-controls').hidden);
  }
  snapshot.venuesSync=pending;d.getElementById('op-refresh').click();await tick();await tick();assert.equal(d.querySelectorAll('textarea').length,1,'non-ready Admin receives one form');assert.equal(d.getElementById('venues-evidence').value,'','removed evidence is not restored');
  d.getElementById('venues-evidence').value='Reviewed the current source and stored transaction';d.getElementById('op-venues-recover').click();assert(d.getElementById('confirmation').open);denied=true;d.getElementById('op-refresh').click();await tick();await tick();assert.equal(d.querySelectorAll('textarea').length,0,'authority loss removes the evidence form');assert.equal(d.getElementById('op-venues-recover'),null);assert.equal(d.getElementById('confirmation').open,false,'authority loss clears pending recovery');d.getElementById('confirm-action').click();await tick();assert.equal(calls.filter(p=>p.operation==='recoverVenuesSync').length,1,'cleared confirmation cannot recover');
 }finally{dom.window.close();}
 console.log('PASS Venues health UI: alert, Admin confirmation, separate outcomes and no recovery form for ready, unconfigured, SMC or expired access');
})().catch(e=>{console.error(e);process.exitCode=1;});
