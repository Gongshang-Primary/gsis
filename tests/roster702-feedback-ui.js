'use strict';
// Real Chromium; synthetic staff and local production modules only.
// GSIS_BROWSER_EXECUTABLE=/path/to/chromium node tests/roster702-feedback-ui.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const executablePath=process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<span id="header-status">Loading…</span><main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
   window.__reads=[];window.__writes=[];window.__writeCalls=[];window.__holdRead=true;window.__holdWrite=true;
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),
    status:text=>document.getElementById('header-status').textContent=text,api:async(route,p)=>{
     if(p.operation==='read'&&__holdRead)await new Promise(resolve=>__reads.push(resolve));
     const isWrite=!GSISRosterOperations.READS.includes(p.operation);
     if(isWrite)__writeCalls.push(structuredClone(p));
     const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();
     if(isWrite&&__holdWrite)await new Promise(resolve=>__writes.push(resolve));
     if(isWrite&&window.__failConfirmation){window.__failConfirmation=false;throw Object.assign(Error('Confirmation unavailable'),{status:503,diagnosticId:'synthetic-save-reference'});}
     if(p.operation==='read'&&window.__failRead){window.__failRead=false;throw Object.assign(Error('Records unavailable'),{status:503,diagnosticId:'synthetic-read-reference'});}
     if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
    }};
   window.__render=RosterOpsUI.render('Report Absence',__opsContext);
  });
  await page.waitForFunction(()=>__reads.length===1);
  assert.equal(await page.locator('.ops-progress:modal').count(),1);
  assert.equal(await page.locator('[data-progress-label]').textContent(),'Loading…');
  assert.equal(await page.locator('#header-status').textContent(),'','no second loading status');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.ops-progress:modal').count(),1,'a blocking read cannot dismiss its progress dialog');
  await page.evaluate(()=>{__holdRead=false;__reads.shift()();return __render;});
  assert.equal(await page.locator('.ops-progress').count(),0);
  await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();
  await page.locator('[data-instruction]').fill('Synthetic relief instruction.');
  await page.evaluate(()=>{__failConfirmation=true;document.querySelector('[data-save-instructions]').click();});
  await page.waitForFunction(()=>__writes.length===1);
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1,'authoritative write can finish before its response');
  const saving=await page.evaluate(()=>{
   const overlay=document.querySelector('.ops-progress'),r=overlay.getBoundingClientRect(),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let copies=0;
   while(walker.nextNode())if(walker.currentNode.textContent.trim()==='Saving…')copies++;
   return {copies,modal:overlay.matches(':modal'),label:overlay.querySelector('[data-progress-label]').textContent,blur:getComputedStyle(overlay,'::backdrop').backdropFilter,
    centered:Math.abs(r.top+r.height/2-innerHeight/2)<2,rootBusy:document.getElementById('content').getAttribute('aria-busy'),pageMessage:document.querySelector('[data-ops-message]').textContent};
  });
  assert.equal(saving.copies,1);assert.equal(saving.modal,true);assert.equal(saving.centered,true);assert.equal(saving.rootBusy,'true');assert.match(saving.blur,/blur/);assert.equal(saving.pageMessage,'');
  for(const reducedMotion of ['no-preference','reduce']){
   await page.emulateMedia({reducedMotion});
   const before=await page.locator('.ops-progress .ops-spinner').evaluate(el=>{const css=getComputedStyle(el);return {transform:css.transform,opacity:css.opacity};});
   await page.waitForFunction(({mode,before})=>{const el=document.querySelector('.ops-progress .ops-spinner'),css=getComputedStyle(el);return el.getAnimations().some(a=>a.playState==='running')&&css.opacity==='1'&&css.transform!==before.transform;},{mode:reducedMotion,before},{timeout:2000});
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.ops-progress:modal').count(),1);
  if(process.env.ROSTER_FEEDBACK_SCREENSHOT)await page.screenshot({path:path.resolve(process.env.ROSTER_FEEDBACK_SCREENSHOT)});
  await page.evaluate(()=>__writes.shift()());
  await page.waitForFunction(()=>!document.querySelector('.ops-progress')&&document.querySelector('[data-retry-save]'));
  assert.match(await page.locator('[data-ops-message]').textContent(),/synthetic-save-reference/);
  assert.equal(await page.locator('[data-retry-save]').isVisible(),true);
  await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>__writes.length===1);
  assert.deepEqual(await page.evaluate(()=>__writeCalls[0]),await page.evaluate(()=>__writeCalls[1]),'retry must use exactly the same immutable request and receipt');
  await page.evaluate(()=>__writes.shift()());
  await page.waitForFunction(()=>!document.querySelector('.ops-progress')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);assert.equal(await page.locator('[data-retry-save]').count(),0);
  assert.match(await page.locator('[data-ops-message]').textContent(),/Saved/);

  // A warm view stays usable while its records refresh in the background.
  await page.evaluate(async()=>{__holdRead=false;await RosterOpsUI.render('Manage reported absences',__opsContext);__fixture.setClock(__fixture.ctx.today+'T06:01:01+08:00');__holdRead=true;window.__warm=RosterOpsUI.render('Manage reported absences',__opsContext);});
  await page.waitForFunction(()=>__reads.length===1);
  assert.equal(await page.locator('.ops-progress').count(),0);assert.equal(await page.locator('.ops-record-table').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-ops-body]').inert),false);
  await page.evaluate(()=>{__holdRead=false;__reads.shift()();return __warm;});
  await page.locator('.ops-row-menu summary').click();await page.locator('[data-edit-entry]').click();await page.locator('[data-edit-form]').waitFor();
  await page.locator('[data-edit-form] button.primary').click();await page.waitForFunction(()=>__writes.length===1);
  assert.equal(await page.locator('dialog').count(),2,'progress opens above the existing editor');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog').classList.contains('ops-progress')),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),2);
  await page.evaluate(()=>{__failConfirmation=true;__writes.shift()();});
  await page.waitForFunction(()=>!document.querySelector('.ops-progress')&&document.querySelector('.ops-dialog [data-retry-save]'));
  assert.equal(await page.locator('.ops-dialog [data-retry-save]').isVisible(),true,'uncertain save recovery remains in the active editor top layer');
  await page.locator('.ops-dialog [data-close-dialog]').click();
  assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('[data-ops-message] [data-retry-save]').isVisible(),true,'closing an editor keeps its pending retry reachable');
  await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>__writes.length===1);
  assert.deepEqual(await page.evaluate(()=>__writeCalls[2]),await page.evaluate(()=>__writeCalls[3]));
  await page.evaluate(()=>__writes.shift()());await page.waitForFunction(()=>!document.querySelector('.ops-progress')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  const result=await page.locator('[data-ops-message]').boundingBox();assert.ok(result.y>=0&&result.y+result.height<=700,'result is visible without scrolling');

  // Cold failures include the diagnostic reference and a retry; unmount removes the top layer.
  await page.evaluate(()=>{__holdRead=true;__failRead=true;window.__failed=RosterOpsUI.render('My Relief Duties',__opsContext);});
  await page.waitForFunction(()=>__reads.length===1);assert.equal(await page.locator('.ops-progress').count(),1);
  await page.evaluate(()=>{__holdRead=false;__reads.shift()();return __failed;});
  assert.equal(await page.locator('.ops-progress').count(),0);assert.match(await page.locator('[data-ops-message]').textContent(),/synthetic-read-reference/);
  assert.equal(await page.locator('[data-reload]').isVisible(),true);
  await page.evaluate(()=>{__holdRead=true;document.querySelector('[data-reload]').click();});await page.waitForFunction(()=>__reads.length===1);
  await page.evaluate(()=>RosterOpsUI.unmount());assert.equal(await page.locator('dialog').count(),0);
  await page.evaluate(()=>{__holdRead=false;__reads.shift()();});
  await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.locator('dialog').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS v0.7.02 feedback: one centered native modal with blurred backdrop; no header/inline Saving duplicates; Escape blocked in flight; authoritative same-request retry on page and editor; fixed visible success/failure notices; cold-load progress; warm refresh remains interactive; diagnostic references and unmount cleanup.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
