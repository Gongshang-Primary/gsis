'use strict';
// Production UI and domain; fixture commits before losing the response. No live writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),diagnosticId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<p id="status"></p><main id="content"></main>');
  for(const file of ['roster-update/public/roster.css','roster-update/public/roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  for(const file of ['shared/roster-allocation.js','shared/roster-stapler.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async diagnosticId=>{
   const f=__fixture,O=GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');
   const id=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]}).savedId;
   O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[id+':2'],staffId:'dora',confirm:true,reason:'Synthetic manual allocation'});
   window.__manualAssignment=JSON.stringify(f.state.assignments[0]);window.__initialOutbox=JSON.stringify(f.state.outbox);
   await RosterOpsUI.render('Assign Relief',{profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status:text=>document.getElementById('status').textContent=text,api:async(route,p)=>{
    if(p.operation==='autoAllocate'&&window.__holdAuto)await new Promise(resolve=>window.__releaseAuto=resolve);
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error),{status:response.status,diagnosticId});
    return result.data;
   }});
   f.fail='after-save';window.__holdAuto=true;
  },diagnosticId);
  assert.equal(await page.locator('[data-auto-allocate]').isEnabled(),true);
  await page.locator('[data-auto-allocate]').click();await page.waitForFunction(()=>!!window.__releaseAuto);
  assert.equal(await page.locator('dialog.ops-progress').count(),0);assert.match(await page.locator('[data-ops-message]').innerText(),/Allocating relief for 14 Oct 2026/);
  await page.evaluate(()=>{__holdAuto=false;__releaseAuto();});
  await page.locator('[data-retry-save]').waitFor();
  assert.equal(await page.locator('[data-retry-save]').innerText(),'Retry auto-allocation');
  const feedback=await page.locator('[data-ops-message]').innerText();
  assert.match(feedback,/Auto-allocation could not be confirmed/);assert.ok(feedback.includes('Reference: '+diagnosticId));
  assert.match(feedback,/Assignments save automatically/);assert.match(feedback,/may already have completed/);assert.match(feedback,/Let teachers see is a separate step/);
  assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),2,'allocation committed before confirmation was lost');
  const committed=await page.evaluate(()=>({assignments:__fixture.state.assignments,revision:__fixture.state.revision}));
  await page.locator('[data-retry-save]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-retry-save]')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.deepEqual(await page.evaluate(()=>({assignments:__fixture.state.assignments,revision:__fixture.state.revision})),committed,'replay returns the receipt without allocating twice');
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.assignments[0])===__manualAssignment),true,'manual assignment is preserved');
  const requests=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='autoAllocate').map(c=>c.p));
  assert.equal(requests.length,2);assert.deepEqual(requests[1],requests[0],'retry preserves every request field and request id');
  assert.equal(requests[0].view,'allocation');assert.equal(requests[0].date,'2026-10-14');assert.equal(requests[0].compact,true);assert.ok(requests[0].requestId);
  assert.equal(requests[0].allocationMode,'reoptimise');
  assert.match(await page.locator('[data-ops-message]').innerText(),/Auto-allocation updated the draft\. Published, SMC and peer choices kept\./);
  assert.match(await page.locator('[data-relief-period="3"]').innerText(),/EL\s+4A\s+C1-01/,'compact confirmation still renders the complete lesson details');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.some(a=>a.status==='published')),false);
  assert.equal(await page.evaluate(()=>__fixture.state.publicationSnapshots.length),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.outbox)===__initialOutbox),true,'retry does not queue publication notices');
  assert.equal(await page.evaluate(()=>__fixture.calls.some(c=>['publish','notifyDaily'].includes(c.p.operation))),false);
  assert.deepEqual(errors,[]);
  console.log('PASS auto-allocation retry Chromium: specific progress and retry wording, diagnostic reference, exact request replay, no duplicate allocation, manual assignment preserved, no publication or notices.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
