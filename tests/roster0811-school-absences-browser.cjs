'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://range.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main>'}));await page.goto('https://range.test/');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture;window.requests=[];
   f.state.absences=Array.from({length:40},(_,i)=>({id:'absence-'+i,date:i<20?f.ctx.today:'2026-10-15',staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,reportedBy:'smc',reportedAt:f.ctx.today+'T06:00:00+08:00',instructions:{}}));
   window.ctx={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,input)=>{requests.push(input);return GSISRosterOperations.read(f.state,f.ctx,input);}};
   await RosterOpsUI.render('Absences by Date',ctx);
  });
  assert.equal(await page.locator('[data-absence-from]').inputValue(),'2026-10-14');assert.equal(await page.locator('[data-absence-to]').inputValue(),'2026-10-15');
  assert.equal(await page.locator('[data-table-page-size]').inputValue(),'50');
  assert.match(await page.locator('[data-table-count]').innerText(),/40 entries/);await page.locator('[data-select-matching]').click();assert.equal(await page.locator('[data-selected-count]').innerText(),'40 selected');assert.equal(await page.evaluate(()=>requests.length),1);
  for(const width of [390,620,1024]){await page.setViewportSize({width,height:900});const boxes=await page.locator('[data-absence-range] input,[data-absence-range] button,[data-table-page-size]').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));for(const b of boxes){assert(b.left>=0&&b.right<=width+1,JSON.stringify({width,b}));assert(b.height>=44);}}
  await page.locator('[data-absence-to]').fill('2026-10-14');await page.locator('[data-absence-range] button').click();await page.waitForFunction(()=>document.querySelector('[data-table-count]').textContent.includes('20 entries'));
  assert.equal(await page.locator('[data-selected-count]').innerText(),'0 selected');assert.equal(await page.evaluate(()=>requests.length),2);assert.deepEqual(errors,[]);
  console.log('PASS real browser range controls at 390/620/1024 px, one inclusive read, 40-row all-page selection and range reset.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
