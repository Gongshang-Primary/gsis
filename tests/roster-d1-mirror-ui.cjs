'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const tick=()=>new Promise(setImmediate);
async function setup(data,handler,domain='roster'){
 const html=fs.readFileSync('shared/edge-setup.html','utf8').replaceAll('__DOMAIN__',domain).replaceAll('__DOMAIN_LABEL__',domain);
 const dom=new JSDOM(html,{url:'https://'+domain+'.gsps.edu.sg/edge-setup.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,status:200,json:async()=>({ok:true,data:body.operation==='status'?data:await handler(body)})};};
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await tick();await tick();
 return {dom,w,calls,click:async id=>{w.document.getElementById(id).click();await tick();await tick();}};
}
const backup={enabled:true,phase:'copying',pending:2,lagMs:180000,warning:true,revisions:{roster:8,register:3},mirroredRevisions:{roster:6,register:3},largestPart:{name:'2026-10.json',chars:2400000}};
(async()=>{
 for(const googleBackup of [undefined,{enabled:false,phase:'legacy'}]){
  const h=await setup({scopes:[{scope:'roster',mode:'legacy',revision:0}],...(googleBackup?{googleBackup}:{})},()=>assert.fail('No backup action while Google is the record'));
  assert(h.w.document.getElementById('op-mirror').disabled);assert(h.w.document.getElementById('op-release').disabled);
  await h.click('op-mirror');await h.click('op-release');assert.equal(h.calls.length,1);assert(!h.w.document.getElementById('confirmation').open);h.dom.window.close();
 }
 const h=await setup({scopes:[{scope:'roster',mode:'active',revision:8},{scope:'roster-register',mode:'active',revision:3}],googleBackup:backup},body=>body.operation==='release'?{released:false,googleBackup:{...backup,phase:'quiescing'}}:{googleBackup:backup});
 const doc=h.w.document;assert.match(doc.getElementById('google-backup').textContent,/Roster.*6.*Timetable.*3/);assert.match(doc.getElementById('google-backup').textContent,/3 min behind/);assert.match(doc.getElementById('google-backup').textContent,/2026-10\.json/);assert.equal(doc.getElementById('google-backup').dataset.tone,'error');
 await h.click('op-mirror');assert.equal(h.calls.at(-1).operation,'mirror');await h.click('op-release');assert(doc.getElementById('confirmation').open);assert.equal(h.calls.filter(c=>c.operation==='release').length,0);assert.match(doc.getElementById('confirm-description').textContent,/pause|stop/i);
 await h.click('confirm-action');const first=h.calls.find(c=>c.operation==='release');assert(first.requestId);assert.match(doc.getElementById('status-message').textContent,/in progress|pending/i);await h.click('op-release');await h.click('confirm-action');const releases=h.calls.filter(c=>c.operation==='release');assert.equal(releases.length,2);assert.equal(releases[1].requestId,first.requestId,'a partial switch-back reuses its request identity');h.dom.window.close();
 const done=await setup({scopes:[{scope:'roster',mode:'paused',revision:8}],googleBackup:backup},()=>({released:true,googleBackup:{...backup,phase:'released'},nextAction:'Set Pages ROSTER_EDGE_AUTHORITY=legacy'}));
 await done.click('op-release');await done.click('confirm-action');assert.match(done.w.document.getElementById('status-message').textContent,/ROSTER_EDGE_AUTHORITY=legacy/);assert.equal(done.calls.filter(c=>c.operation==='release').length,1);done.dom.window.close();
 const deploy=await setup({scope:'deploy',mode:'active',revision:1},()=>({}), 'deploy');assert(deploy.w.document.getElementById('google-backup-section').hidden);assert.equal(deploy.calls.length,1);deploy.dom.window.close();
 const healthHtml=fs.readFileSync('roster-update/public/system-health.html','utf8'),health=new JSDOM(healthHtml,{url:'https://roster.gsps.edu.sg/system-health.html',runScripts:'outside-only'});
 health.window.setInterval=()=>assert.fail('Health must not poll');health.window.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,data:{checkedAt:Date.now(),storage:{available:true},jobs:[{job:'google-backup',status:'success',code:'OK',eventAt:Date.now(),counts:{pending:2}}],googleBackup:backup}})});
 vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),health.getInternalVMContext());await tick();await tick();assert.match(health.window.document.getElementById('jobs-body').textContent,/Google backup/);assert.match(health.window.document.getElementById('google-backup').textContent,/3 min behind/);assert.match(health.window.document.getElementById('google-backup').textContent,/6/);health.window.close();
 console.log('PASS Google backup UI: lag, revisions, legacy gates, stable confirmed release, next action and health summary');
})().catch(error=>{console.error(error);process.exitCode=1});
