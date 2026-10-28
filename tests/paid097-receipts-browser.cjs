'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main></html>'}):route.abort());await page.goto('https://roster.test/');
  for(const file of ['roster-update/public/roster.css','roster-update/public/roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture,receipt=(id,extra)=>({requestId:id,acceptedAt:f.ctx.iso,dates:[f.ctx.today],command:{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,periods:[2]},intakeState:'applied',absenceApplied:true,peerState:'none',instructionState:'none',savedIds:[id],...extra}),entries=[receipt('review',{intakeState:'needsReview',absenceApplied:false}),receipt('saved'),receipt('peer',{peerState:'pending'}),receipt('saved-two')];
   await RosterOpsUI.render('Manage reported absences',{profile:f.profile,today:()=>f.ctx.today,container:document.querySelector('#content'),status:()=>{},api:async(route,p)=>{if(p.operation==='read'&&p.view==='intake')return {entries:structuredClone(entries)};const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();return result.data;}});
  });
  await page.waitForSelector('[data-clear-completed-intake]');assert.equal(await page.locator('[data-intake-attention]').innerText(),'Needs attention (2)');
  assert.equal(await page.locator('[data-intake-state="attention"]').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 248, 229)');
  for(const width of [390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('[data-ops-intake]').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'receipt controls fit the viewport');}
  await page.setViewportSize({width:390,height:844});await page.locator('[data-clear-completed-intake]').click();assert.equal(await page.locator('[data-intake-active] [data-intake-receipt]').count(),2);assert.equal(await page.locator('[data-intake-history] [data-intake-receipt]').count(),2);
  await page.locator('[data-intake-history] > summary').click();await page.locator('[data-intake-history] [data-intake-receipt]').first().locator('summary').click();await page.locator('[data-restore-intake]').first().click();assert.equal(await page.locator('[data-intake-active] [data-intake-receipt]').count(),3);assert.equal(await page.locator('[data-intake-history]').getAttribute('open'),'');assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-intake-receipt]')?.dataset.intakeReceipt),'saved','restore returns keyboard focus to the restored receipt');
  if(process.env.ROSTER_RECEIPT_SCREENSHOT)await page.locator('[data-ops-intake]').screenshot({path:process.env.ROSTER_RECEIPT_SCREENSHOT});
  assert.deepEqual(errors,[]);console.log('PASS paid097 browser receipt controls, amber unresolved status, keyboard focus and narrow/wide layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
