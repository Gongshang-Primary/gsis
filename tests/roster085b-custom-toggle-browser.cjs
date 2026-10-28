'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://roster.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture;f.state.customInstructions=[{id:'rule1',date:'2026-10-01',levels:[1],periods:[2],classNames:[],groupIds:[],text:'Use the foyer. '+('Long instructions '.repeat(20)),version:1}];window.__invalidations=[];
   window.__ctx={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},invalidateOperations:dates=>__invalidations.push(dates),api:async(route,p)=>{const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}};
   // Cache a second day before changing the global rule.
   await RosterOpsUI.render('Custom Notifications',{...__ctx,initialDate:'2026-10-15'});RosterOpsUI.unmount();await RosterOpsUI.render('Custom Notifications',{...__ctx,initialDate:f.ctx.today});
  });
  const toggle=page.getByRole('switch',{name:'Custom notification rule 1'}),text=page.locator('[data-custom-form] [name=text]');
  assert.equal(await page.locator('[data-ops-date]').count(),0);assert.equal(await toggle.isChecked(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'custom instructions stay inside mobile viewport');
  const target=await page.locator('.ops-custom-toggle').boundingBox();assert(target.width>=36&&target.height>=36,'touch label extends beyond the checkbox');
  await page.locator('[data-custom-edit]').tap();await text.fill('Unsaved mobile draft');await page.locator('[name=level][value="2"]').check();
  const calls=await page.evaluate(()=>__fixture.calls.length);assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),true);
  await toggle.focus();await page.keyboard.press('Space');await page.waitForFunction(()=>__fixture.state.customInstructions[0].enabled===false&&!document.querySelector('[data-ops-body]').inert);
  assert.equal(await toggle.isChecked(),false);assert.equal(await text.inputValue(),'Unsaved mobile draft');assert.equal(await page.locator('[name=level][value="2"]').isChecked(),true);assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),true);assert.equal(await page.evaluate(()=>__fixture.calls.length),calls+1);assert.equal(await page.evaluate(()=>__invalidations.at(-1)===undefined),true);assert.match(await toggle.locator('..').textContent(),/Off/);
  // Lost response must retain both the local editor and the exact toggle request.
  await page.evaluate(()=>{__fixture.fail='after-save';});await page.locator('.ops-custom-toggle').tap();await page.locator('[data-retry-save]').waitFor();
  const request=await page.evaluate(()=>__fixture.calls.at(-1).p);assert.equal(request.operation,'setCustomInstructionEnabled');assert.equal(await text.inputValue(),'Unsaved mobile draft');assert.equal(await page.locator('[data-custom-form]').evaluate(el=>el.inert),true);assert.equal(await page.locator('[data-custom-list]').evaluate(el=>el.inert),true);
  await page.locator('[data-retry-save]').tap();await page.waitForFunction(()=>!document.querySelector('[data-retry-save]'));
  assert.equal(await page.evaluate(()=>__fixture.calls.at(-1).p.requestId),request.requestId);assert.equal(await page.evaluate(()=>__fixture.state.customInstructions[0].version),3);assert.equal(await toggle.isChecked(),true);assert.equal(await text.inputValue(),'Unsaved mobile draft');assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),true);
  // Updating a paused rule must not reactivate it or lose its saved filters.
  await page.locator('.ops-custom-toggle').tap();await page.waitForFunction(()=>__fixture.state.customInstructions[0].enabled===false&&!document.querySelector('[data-ops-body]').inert);await page.getByRole('button',{name:'Save instructions',exact:true}).tap();await page.waitForFunction(()=>__fixture.state.customInstructions[0].text==='Unsaved mobile draft'&&!document.querySelector('[data-ops-body]').inert);
  assert.equal(await toggle.isChecked(),false);assert.equal(await text.inputValue(),'');assert.deepEqual(await page.evaluate(()=>__fixture.state.customInstructions[0].levels),[1,2]);assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),false);
  // A pending toggle from a clean editor cannot accept later edits that receipt retry would discard.
  await page.evaluate(()=>{__fixture.fail='after-save';});await page.locator('.ops-custom-toggle').tap();await page.locator('[data-retry-save]').waitFor();assert.equal(await page.locator('[data-custom-form]').evaluate(el=>el.inert),true);assert.equal(await page.locator('[data-custom-list]').evaluate(el=>el.inert),true);assert.equal(await text.evaluate(el=>{el.focus();return document.activeElement===el;}),false,'pending editor is not keyboard focusable');
  await page.locator('[data-retry-save]').tap();await page.waitForFunction(()=>!document.querySelector('[data-retry-save]'));assert.equal(await text.inputValue(),'');assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),false);assert.equal(await toggle.isChecked(),true);assert.equal(await page.locator('[data-custom-form]').evaluate(el=>el.inert),false);
  await page.locator('.ops-custom-toggle').tap();await page.waitForFunction(()=>__fixture.state.customInstructions[0].enabled===false&&!document.querySelector('[data-ops-body]').inert);
  const before=await page.evaluate(()=>__fixture.calls.length);await page.evaluate(async()=>{RosterOpsUI.unmount();await RosterOpsUI.render('Custom Notifications',{...__ctx,initialDate:'2026-10-15'});});assert.equal(await page.evaluate(()=>__fixture.calls.length),before+1,'global mutation invalidates the other cached day');assert.equal(await toggle.isChecked(),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log('PASS custom-rule mobile and desktop layout, touch/keyboard toggle, accessible state, draft/filter retention, uncertain retry, paused edits and global cache invalidation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
