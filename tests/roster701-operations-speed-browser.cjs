'use strict';
// Runs the production operations UI and model with synthetic staff, without a school backend.
// NODE_PATH=<Playwright modules> ROSTER_TEST_CHROMIUM=<Chromium path> node tests/roster701-operations-speed-browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const source=process.env.ROSTER_TEST_UI_SOURCE||path.join(root,'roster-update/public/roster-operations-ui.js');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{const Format=Intl.DateTimeFormat;window.__formatters=0;Intl.DateTimeFormat=function(...args){__formatters++;return new Format(...args);};});
  await page.addScriptTag({content:fs.readFileSync(source,'utf8')});
  const formatterCount=await page.evaluate(()=>__formatters);
  await page.evaluate(()=>{for(let i=0;i<1000;i++)RosterOpsUI.dateText('2026-10-14');});
  assert.equal(await page.evaluate(()=>__formatters),formatterCount,'date rendering reuses the same Intl formatters');
  await page.evaluate(()=>{
   const f=__fixture;f.setClock('2026-10-14T06:00:00+08:00');
   GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]});
   const rank=GSISRosterAllocation.manualRanks;window.__rankCalls=0;GSISRosterAllocation.manualRanks=(...args)=>{__rankCalls++;return rank(...args);};
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};
  });
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));
  assert.equal(await page.evaluate(()=>__rankCalls),1);
  const count=await page.evaluate(()=>__fixture.calls.length);
  for(const query of ['b','bo','bob',''])await page.locator('[data-candidate-search]').fill(query);
  assert.equal(await page.evaluate(()=>__rankCalls),1,'typing only filters existing ranks');
  assert.equal(await page.evaluate(()=>__fixture.calls.length),count,'filtering adds no API reads');
  await page.locator('[data-relief-demand]').nth(1).click();
  assert.equal(await page.evaluate(()=>__rankCalls),2,'a different period gets its own ranks');
  await page.locator('[data-relief-demand]').first().click();
  assert.equal(await page.evaluate(()=>__rankCalls),2,'returning to the same period reuses only this render\'s ranks');
  const readsBeforeRefresh=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='read').length);
  await page.locator('[data-ops-refresh]').click();
  await page.waitForFunction(n=>__fixture.calls.filter(c=>c.p.operation==='read').length===n+1&&document.getElementById('content').getAttribute('aria-busy')==='false',readsBeforeRefresh);
  assert.equal(await page.evaluate(()=>__rankCalls),3,'explicit refresh rebuilds the current workspace with verified records');

  // While a date refresh is outstanding, old allocation controls must not save to the new date.
  await page.evaluate(()=>{__fixture.delay.read=300;window.__oldAuto=document.querySelector('[data-auto-allocate]');});
  await page.locator('[data-ops-date]').fill('2026-10-15');
  await page.locator('[data-ops-date]').dispatchEvent('change');
  assert.equal(await page.locator('[data-ops-body]').evaluate(el=>el.inert),true);
  await page.evaluate(()=>__oldAuto.onclick());
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='autoAllocate').length),0,'old controls cannot submit during a reload');
  await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-ops-body]').evaluate(el=>el.inert),false);

  // Daily tabs reuse records; Assign Relief receives health in the allocation view.
  await page.evaluate(()=>{__fixture.delay.read=0;__fixture.delay.health=300;__fixture.calls=[];});
  await page.evaluate(()=>RosterOpsUI.render('Absences by Date',__opsContext));
  await page.locator('[data-ops-tab="relief"]').click();
  assert.equal(await page.locator('[data-publish-relief]').count(),1,'daily relief tab contains the explicit publication action');
  await page.locator('[data-ops-tab="absences"]').click();
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='health').length),0,'daily tabs do not calculate allocation health');
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));
  assert.equal(await page.locator('.ops-health').isVisible(),true,'allocation view shows verified health immediately');
  assert.equal(await page.locator('.ops-health-disclosure').count(),0,'health does not need a removed accounting disclosure');
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='health').length),0,'health requires no extra server read');
  const healthCalls=await page.evaluate(()=>__fixture.calls.length);
  await page.locator('[data-ops-refresh]').click();
  await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.deepEqual(await page.evaluate(n=>__fixture.calls.slice(n).map(c=>({operation:c.p.operation,view:c.p.view,compact:c.p.compact})),healthCalls),[{operation:'read',view:'allocation',compact:true}],'refresh updates records and health in one compact allocation read');
  assert.equal(await page.locator('.ops-health').isVisible(),true);

  // Saved details and a fresh cached edit render without another entry request.
  await page.evaluate(()=>RosterOpsUI.render('Manage reported absences',__opsContext));
  await page.locator('.ops-row-menu summary').first().click();
  const beforeEntry=await page.evaluate(()=>__fixture.calls.length);
  await page.locator('[data-view-entry]').first().click();
  await page.waitForSelector('.ops-facts');
  assert.equal(await page.evaluate(()=>__fixture.calls.length),beforeEntry,'saved details need no backend request');
  assert.equal(await page.locator('.ops-facts').textContent().then(t=>t.includes('Alice Teacher')),true);
  await page.locator('[data-close-dialog]').click();
  await page.locator('[data-edit-entry]').first().click();
  await page.waitForSelector('[data-edit-form]');
  assert.equal(await page.evaluate(()=>__fixture.calls.length),beforeEntry,'fresh cached absence edit needs no duplicate backend request');

  // Lost acknowledgements confirm the exact pending request without another mutation.
  await page.evaluate(()=>{RosterOpsUI.unmount();document.querySelector('dialog')?.remove();__fixture.fail=null;});
  await page.evaluate(()=>RosterOpsUI.render('Report Absence',__opsContext));
  await page.locator('[data-period="4"]').click();
  await page.locator('[data-log-absence]').click();
  await page.evaluate(()=>__fixture.fail='after-save');
  await page.locator('[data-save-instructions]').click();
  await page.waitForSelector('[data-retry-save]');
  const before=await page.evaluate(()=>__fixture.state.absences.length);
  const originalSaves=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='saveAbsence').length);
  await page.locator('[data-retry-save]').click();
  await page.waitForFunction(()=>!RosterOpsUI.isDirty());
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),before);
  const saves=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='saveAbsence').map(c=>c.p));
  assert.equal(saves.length,originalSaves,'accepted receipt avoids a second mutation');
  assert.deepEqual(await page.evaluate(()=>__fixture.calls.findLast(c=>c.p.operation==='receiptStatus').p.command),saves.at(-1),'lookup keeps the exact request ID, revision and payload');
  assert.deepEqual(errors,[]);
  console.log('PASS operations speed: rank recomputations 5 → 1 while filtering; health included in one allocation read; daily review tabs; cached details and immediate cached edit; date reload interlock; exact receipt confirmation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
