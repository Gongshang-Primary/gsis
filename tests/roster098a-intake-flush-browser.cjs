'use strict';
// Real Chromium and shipped Roster UI. Remote receipt responses are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const ids=['10000000-1000-4000-8000-000000000001','10000000-1000-4000-8000-000000000002','10000000-1000-4000-8000-000000000003'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 async function setup(count=2){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main></html>'}):route.abort());await page.goto('https://roster.test/');
  for(const file of ['roster-update/public/roster.css','roster-update/public/roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js',process.env.GSIS_INTAKE_FLUSH_UI_SOURCE||'roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async({ids,count})=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
   window.__flush={entries:[],commands:[],inFlight:0,maxInFlight:0,holdNext:false,loseId:null};const q=__flush;
   q.add=(id,extra={})=>{const row={requestId:id,acceptedAt:f.ctx.iso,dates:[f.ctx.today],command:{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,fullDay:true},intakeState:'needsReview',absenceApplied:false,savedIds:[],peerState:'none',instructionState:'none',...extra};q.entries.push(row);return row;};
   for(const id of ids.slice(0,count))q.add(id);
   q.add('processing',{intakeState:'pending'});q.add('saved-peer',{absenceApplied:true,peerState:'needsReview'});
   const hostile='\"><img src=x onerror="window.receiptLeak=true">';q.add(hostile,{absenceApplied:true,command:{operation:'saveAbsence',staffId:hostile,date:f.ctx.today,fullDay:true}});
   window.__ctx={profile:f.profile,today:()=>f.ctx.today,container:document.querySelector('#content'),status:()=>{},api:async(route,p)=>{
    if(p.operation==='read'&&p.view==='intake')return {entries:structuredClone(q.entries),total:q.entries.length,hasMore:false};
    if(p.operation==='resolveAbsenceIntake'){
     q.commands.push(structuredClone(p));q.inFlight++;q.maxInFlight=Math.max(q.maxInFlight,q.inFlight);
     try{
      if(q.holdNext){q.holdNext=false;await new Promise(resolve=>q.release=resolve);}
      const row=q.entries.find(entry=>entry.requestId===p.intakeRequestId);if(row.intakeState!=='withdrawn')Object.assign(row,{intakeState:'withdrawn',resolution:{action:'withdraw',reason:p.reason,actorName:'Synthetic SMC',at:f.ctx.iso}});
      if(q.loseId===p.intakeRequestId){q.loseId=null;throw Object.assign(Error('Synthetic unconfirmed response'),{status:503});}
      return {intakeReceipt:true,requestId:row.requestId,intakeState:'withdrawn',absenceApplied:false,resolution:row.resolution};
     }finally{q.inFlight--;}
    }
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};window.__ui=await RosterOpsUI.render('Assign Relief',__ctx);
  },{ids,count});
  await page.waitForFunction(()=>document.querySelector('[data-refresh-intake]')&&!document.querySelector('[data-refresh-intake]').disabled);
  return page;
 }
 async function openSelected(page){await page.locator('[data-select-all-intake]').click();await page.locator('[data-withdraw-selected-intake]').click();await page.locator('[data-withdraw-intake-batch-form]').waitFor();}
 async function confirm(page){await page.locator('[data-withdraw-intake-batch-form] [name="reason"]').fill('Synthetic duplicates verified.');await page.locator('[data-withdraw-intake-batch-form] [name="acknowledge"]').check();await page.locator('[data-withdraw-intake-batch-form] button[type="submit"]').click();}
 try{
  const page=await setup();
  assert.equal(await page.locator('[data-select-intake]').count(),2,'eligible checkboxes exist while reports are collapsed');
  assert.equal(await page.locator('[data-intake-receipt][open]').count(),0);
  assert.equal(await page.locator('[data-select-intake]').first().isVisible(),true,'selection is visible in a collapsed report');
  await page.locator('[data-select-intake]').first().check();assert.equal(await page.locator('[data-intake-receipt][open]').count(),0,'checking selection does not expand the details');assert.equal(await page.evaluate(()=>document.activeElement.dataset.selectIntake),ids[0],'selection retains keyboard focus after redraw');
  assert.match(await page.locator('[data-withdraw-selected-intake]').innerText(),/\(1\)/);await page.locator('[data-clear-intake-selection]').click();assert.equal(await page.locator('[data-withdraw-selected-intake]').isEnabled(),false);assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-select-all-intake')),true,'clearing selection returns focus to enabled Select all');
  assert.equal(await page.locator('[data-ops-intake] img').count(),0);assert.equal(await page.evaluate(()=>window.receiptLeak),undefined);
  for(const width of [390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('[data-ops-intake]').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'queue controls fit '+width+'px viewport');}
  await page.setViewportSize({width:390,height:844});
  if(process.env.ROSTER_FLUSH_SCREENSHOT_PREFIX){await page.locator('[data-select-all-intake]').click();await page.locator('[data-ops-intake]').screenshot({path:process.env.ROSTER_FLUSH_SCREENSHOT_PREFIX+'-controls.png'});}
  await openSelected(page);
  if(process.env.ROSTER_FLUSH_SCREENSHOT_PREFIX)await page.locator('dialog').screenshot({path:process.env.ROSTER_FLUSH_SCREENSHOT_PREFIX+'-confirmation.png'});
  for(const width of [390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().width<=innerWidth),true,'confirmation fits '+width+'px viewport');}
  await page.setViewportSize({width:390,height:844});await page.locator('[data-withdraw-intake-batch-form] button[type="submit"]').click();assert.equal(await page.evaluate(()=>__flush.commands.length),0,'empty reason cannot submit');
  await page.locator('[data-withdraw-intake-batch-form] [name="reason"]').fill('Synthetic duplicates verified.');await page.locator('[data-withdraw-intake-batch-form] button[type="submit"]').click();assert.equal(await page.evaluate(()=>__flush.commands.length),0,'acknowledgement is required');
  const before=await page.evaluate(()=>JSON.stringify(__fixture.state.absences));await page.evaluate(()=>__flush.holdNext=true);await confirm(page);await page.waitForFunction(()=>__flush.commands.length===1&&typeof __flush.release==='function');
  assert.equal(await page.locator('[data-select-all-intake]').isEnabled(),false);assert.equal(await page.evaluate(()=>__flush.maxInFlight),1);
  await page.evaluate(()=>{__flush.add('new-arrival');__flush.release();});await page.waitForFunction(()=>__flush.commands.length===2&&!__ui.busy&&document.querySelector('[data-intake-batch-status]')?.textContent.includes('2 of 2'));
  assert.deepEqual(await page.evaluate(()=>__flush.commands.map(p=>p.intakeRequestId)),ids.slice(0,2));assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.absences)),before);assert.equal(await page.evaluate(()=>__flush.maxInFlight),1);
  assert.equal(await page.locator('[data-select-intake="new-arrival"]').isChecked(),false,'new arrival is not added to the frozen batch');await page.close();

  const retry=await setup(3);await retry.evaluate(id=>__flush.loseId=id,ids[1]);await openSelected(retry);await confirm(retry);await retry.locator('[data-retry-save]').waitFor();await retry.waitForFunction(()=>!__ui.busy);
  assert.match(await retry.locator('[data-intake-batch-status]').innerText(),/1 of 3/);const uncertain=await retry.evaluate(()=>structuredClone(__flush.commands[1]));assert.equal(await retry.evaluate(()=>__flush.commands.length),2,'unconfirmed response stops the batch');
  await retry.locator('[data-retry-save]').click();await retry.waitForFunction(()=>__flush.commands.length===4&&!__ui.busy&&document.querySelector('[data-intake-batch-status]')?.textContent.includes('3 of 3'));
  assert.deepEqual(await retry.evaluate(()=>__flush.commands.map(p=>p.intakeRequestId)),[ids[0],ids[1],ids[1],ids[2]]);assert.deepEqual(await retry.evaluate(()=>__flush.commands[2]),uncertain,'Retry sends the exact retained resolution');assert.equal(await retry.evaluate(()=>__flush.maxInFlight),1);await retry.close();
  assert.deepEqual(errors,[]);console.log('PASS Chromium selective queue withdrawal: collapsed selection, narrow/wide layout, escaped receipt data, reason/acknowledgement, frozen sequential batch, and exact503response retry.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
