'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom'),tick=()=>new Promise(setImmediate),now=Date.parse('2026-11-01T08:00:00Z');
async function harness(quotaSnapshot,profile){
 const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.gsps.edu.sg/system-health.html',runScripts:'outside-only'}),w=dom.window;
 const snapshot={checkedAt:now,profile,quotaSnapshot,storage:{configured:true,available:true},jobs:[{job:'quota-snapshot',status:'failure',code:'QUOTA_SNAPSHOT_STALE',eventAt:now,counts:{pending:1,staff:'PRIVATE_STAFF'},error:'PRIVATE_ERROR'}],recentFailures:[],recovery:{mode:'active',paused:false}};
 let calls=0,denied=false;w.fetch=async()=>{calls++;return {ok:!denied,status:denied?403:200,json:async()=>denied?{ok:false,error:'PRIVATE_AUTH'}:{ok:true,data:snapshot}};};
 w.setInterval=()=>{throw Error('System Health must not poll');};
 vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await tick();await tick();
 return {dom,w,section:w.document.getElementById('quota-snapshot'),calls:()=>calls,expire:async()=>{denied=true;w.document.getElementById('op-refresh').click();await tick();await tick();}};
}
(async()=>{
 for(const profile of [undefined,'google-recovery']){
  const h=await harness({configured:true,available:true,status:'ready',revision:7,writtenAt:now,versionId:'PRIVATE_VERSION',snapshotId:'PRIVATE_SNAPSHOT',digest:'PRIVATE_DIGEST',commit:'PRIVATE_COMMIT',rows:[{id:'PRIVATE_STAFF',R:5}],payload:'<img src=x>'},profile);
  assert(h.section,'System Health exposes the R snapshot section');assert.match(h.section.textContent,/revision 7/i);assert.match(h.section.textContent,/written/i);assert.match(h.section.textContent,/1 Nov 2026/);assert.match(h.section.textContent,/up to date/i);assert.equal(h.section.dataset.tone,'info');
  assert.match(h.w.document.getElementById('jobs-body').textContent,/R snapshot/);assert.match(h.w.document.getElementById('jobs-body').textContent,/QUOTA_SNAPSHOT_STALE/);
  assert(!h.w.document.body.textContent.includes('PRIVATE_'));assert.equal(h.calls(),1);
  await h.expire();assert(h.w.document.getElementById('health-content').hidden);assert.equal(h.section.children.length,0,'expired authority clears snapshot metadata');h.dom.window.close();
 }
 for(const [state,pattern] of [
  [{configured:true,available:true,status:'behind',revision:6,writtenAt:now,lastCode:'QUOTA_SNAPSHOT_STALE'},/behind/i],
  [{configured:true,available:true,status:'behind',revision:6,writtenAt:now,lastCode:'QUOTA_SNAPSHOT_PENDING'},/behind/i],
  [{configured:true,available:true,status:'missing',lastCode:'QUOTA_SNAPSHOT_MISSING'},/no published R snapshot|missing/i],
  [{configured:true,available:false,status:'missing',lastCode:'QUOTA_SNAPSHOT_STORAGE'},/could not be read|unavailable/i],
  [{configured:false,available:false,status:'missing'},/not configured/i]
 ]){const h=await harness(state);assert.match(h.section.textContent,pattern);assert.equal(h.section.dataset.tone,'error');if(state.lastCode)assert.match(h.section.textContent,new RegExp(state.lastCode));h.dom.window.close();}
 const malicious=await harness({configured:true,available:true,status:'<img src=x onerror=alert(1)>',revision:'PRIVATE_STAFF',writtenAt:'PRIVATE_TIME',lastCode:'PRIVATE_ERROR',error:'<script>PRIVATE_BODY</script>',rows:[{id:'PRIVATE_ID'}]});
 assert.match(malicious.section.textContent,/unavailable/i);assert(!malicious.w.document.body.textContent.includes('PRIVATE_'));assert.equal(malicious.section.querySelectorAll('script,img').length,0);malicious.dom.window.close();
 for(const status of ['toString','__proto__',{id:'PRIVATE_STATUS'},null]){const h=await harness({configured:true,available:true,status});assert.match(h.section.textContent,/unavailable/i);assert(!h.section.textContent.includes('PRIVATE_'));h.dom.window.close();}
 console.log('PASS R snapshot health UI: Google/D1 profiles, revision/time, behind/missing/unavailable, safe projection, no polling and authority expiry.');
})().catch(error=>{console.error(error);process.exitCode=1;});
