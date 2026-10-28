'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(4000);
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+f,'utf8')});
  for(const f of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[3]});
   window.__ctx={profile:f.profile,initialDate:f.ctx.today,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{const res=await fetch('/'+route,{body:JSON.stringify(p)}),body=await res.json();if(!res.ok)throw Object.assign(Error(body.error),{status:res.status});for(const d of body.data.demands||[]){d.noReliefRequired=true;d.subjectFamilyName='Tamil';}if(body.data.health)body.data.health.uncovered=[];return body.data;}};await RosterOpsUI.render('Assign Relief',__ctx);
  });
  assert.match(await page.locator('.ops-relief-toolbar').textContent(),/0 unassigned periods/);assert.equal(await page.locator('.ops-absence-fraction').textContent(),'1/1');assert.equal(await page.locator('.ops-absence-state').textContent(),'No Relief');assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true);
  assert.match(await page.locator('[data-selected-relief]').textContent(),/No Relief Required/);assert.match(await page.locator('[data-relief-period="3"] .ops-day-decision').textContent(),/No Relief Required/);
  assert.equal(await page.locator('[data-candidate-scroll]').isVisible(),true,'manual cover remains available for policy excluded lessons');console.log('PASS policy No Relief Required display, zero uncovered count and retained manual assignment');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
