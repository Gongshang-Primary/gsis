'use strict';
// Production UI + domain model, synthetic school data, real Chromium. No live messages or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<div class="status-row"><p id="status"></p><nav>Home › Relief › Assign Relief</nav></div><main id="content"></main>');
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',f),'utf8')});
  for(const f of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  // Exercise the actual shell status hook without its unrelated sign-in bootstrap.
  const shell=fs.readFileSync(path.join(root,'roster-update/public/roster.js'),'utf8'),status=shell.match(/ function status\(text,error=false\)\{[^\n]+\}/)[0];
  await page.addScriptTag({content:'const $=id=>document.getElementById(id);'+status+';window.__status=status;'});
  await page.evaluate(async()=>{
   const f=__fixture,O=GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');
   f.day.warning='Some timetable names could not be matched uniquely to Contacts; these teachers are unavailable for automatic selection.';
   O.apply(f.state,f.ctx,{operation:'saveAdhoc',staffId:'ext',date:f.ctx.today,periods:[2,3]});
   const id=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]}).savedId;
   O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[id+':2'],staffId:'dora',confirm:true,reason:'Synthetic test'});
   O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'bob',date:f.ctx.today,typeId:'mc',periods:[4],reliefRequired:false});
   window.__fixed=JSON.stringify(f.state.assignments[0]);window.__navigation=[];
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status:__status,go:(page,date)=>__navigation.push({page,date}),api:async(route,p)=>{
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};
   await RosterOpsUI.render('Assign Relief',__opsContext);__status('');
  });
  for(const selector of ['[data-assign-absence-form]','[data-quick-absence]','[data-publish-relief]','[data-export-slot]','[data-matrix-refresh]','.ops-notification-note','.ops-notification-readiness','[data-optimise]'])assert.equal(await page.locator(selector).count(),0,selector+' removed from Assign Relief');
  assert.doesNotMatch(await page.locator('[data-ops-body]').innerText(),/Identify absent teacher|unpublished entries/);
  assert.equal(await page.locator('.ops-absence-card').count(),2,'tiles come directly from reported absences');
  assert.equal(await page.locator('.ops-absence-card.partial .ops-absence-fraction').innerText(),'1/2');
  assert.equal(await page.locator('.ops-absence-card.complete.no-relief').count(),1);
  assert.equal(await page.locator('.ops-health').count(),1);
  assert.equal(await page.locator('.ops-health-period>header').evaluateAll(rows=>rows.every(row=>row.scrollWidth<=row.clientWidth)),true,'capacity period labels fit inside their columns');
  assert.equal(await page.evaluate(()=>document.querySelector('[data-relief-health]').nextElementSibling.matches('.ops-absence-bank')),true,'health immediately precedes the tiles');
  assert.equal(await page.locator('[data-auto-allocate]').isVisible(),true);
  assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true,'accounting prerequisite is visible and respected');
  assert.match(await page.locator('.ops-allocation-hint').innerText(),/Admin must verify annual R history/);
  assert.match(await page.locator('#status').innerText(),/Some timetable names/);
  assert.equal(await page.locator('[data-ops-body]').getByText(/Some timetable names/).count(),0,'warning moved to the existing status row');
  await page.evaluate(()=>__status('Network error',true));assert.equal(await page.locator('#status').innerText(),'Network error','persistent warning cannot replace active error');
  await page.evaluate(()=>__status(''));assert.match(await page.locator('#status').innerText(),/Some timetable names/,'shell status reset retains safety warning');
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='health').length),0,'health comes with the normal read');
  await page.locator('[data-manage-adhoc]').click();assert.deepEqual(await page.evaluate(()=>__navigation),[{page:'Manage Ad-hoc relief',date:'2026-10-14'}]);
  if(process.env.GSIS_UI_CAPTURE_DIR){fs.mkdirSync(process.env.GSIS_UI_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.GSIS_UI_CAPTURE_DIR,'705-assign-desktop.png'),fullPage:true});}
  const reads=await page.evaluate(()=>__fixture.calls.length);
  await page.locator('.ops-absence-card.complete [data-select-absence]').click();
  await page.locator('.ops-absence-card.partial [data-select-absence]').click();
  await page.locator('[data-relief-period="3"]').click();await page.locator('[data-candidate-search]').fill('Dora');await page.locator('[data-candidate-search]').fill('');
  await page.locator('.ops-absence-card.partial [data-view-entry]').click();await page.locator('[data-close-dialog]').click();
  await page.locator('.ops-absence-card.partial [data-edit-entry]').click();assert.equal(await page.locator('[data-edit-form]').count(),1);await page.locator('[data-close-dialog]').click();
  assert.equal(await page.evaluate(()=>__fixture.calls.length),reads,'selection, filtering, view and edit use loaded records');
  await page.evaluate(()=>{__fixture.state.accountingYears['2026']={verified:true};});
  await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-auto-allocate]').isEnabled(),true);

  // A conflict refreshes before retry; it cannot allocate against a stale revision.
  await page.evaluate(()=>__fixture.state.revision++);await page.locator('[data-auto-allocate]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Latest records are loaded')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),1);
  // A lost response retains the request identity and the original assignment.
  await page.evaluate(()=>{__fixture.fail='after-save';});await page.locator('[data-auto-allocate]').click();await page.locator('[data-retry-save]').waitFor();
  assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true,'unknown save must be confirmed before another allocation');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),2);
  await page.locator('[data-retry-save]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-retry-save]')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),2,'same-request retry cannot duplicate relief');
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.assignments[0])===__fixed),true,'existing manual assignment is unchanged');
  assert.equal(await page.locator('.ops-absence-card.selected .ops-absence-fraction').innerText(),'2/2');
  assert.match(await page.locator('.ops-relief-toolbar').innerText(),/0 unassigned periods/);
  assert.match(await page.locator('.ops-health-heading').innerText(),/0 uncovered/);
  assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true);
  assert.match(await page.locator('[data-ops-message]').innerText(),/Allocated 1 period/);
  const calls=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='autoAllocate').map(c=>c.p));
  assert.equal(calls.length,3);assert.equal(calls[1].requestId,calls[2].requestId);assert.equal(calls[1].view,'allocation');assert.equal(calls[1].date,'2026-10-14');
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='health').length),0,'confirmed allocation refreshes health without a follow-up read');

  // Publishing is a separate, explicit review action with its original replay safety.
  await page.evaluate(()=>RosterOpsUI.render('Absences by Date',__opsContext));
  await page.locator('[data-ops-tab="relief"]').click();
  assert.equal(await page.locator('[data-publish-relief]').count(),1);assert.equal(await page.locator('[data-daily-excel]').count(),1);
  assert.equal(await page.locator('[data-table-excel]').count(),0,'review tab has one exact daily workbook export');
  assert.equal(await page.locator('[data-auto-allocate]').count(),0);
  await page.evaluate(()=>__fixture.state.revision++);await page.locator('[data-publish-relief]').click();
  await page.waitForFunction(()=>document.querySelector('.ops-revision-summary')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.filter(a=>a.status==='published').length),0);
  await page.evaluate(()=>{__fixture.fail='after-save';});await page.locator('[data-publish-relief]').click();await page.locator('[data-retry-save]').waitFor();
  assert.equal(await page.locator('[data-publish-relief]').isDisabled(),true);
  const snapshots=await page.evaluate(()=>__fixture.state.publicationSnapshots.length);
  await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-retry-save]')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.filter(a=>a.status==='published').length),2);
  assert.equal(await page.evaluate(()=>__fixture.state.publicationSnapshots.length),snapshots,'publication retry cannot duplicate snapshots');
  const publishes=await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='publish').map(c=>c.p));
  assert.equal(publishes.length,3);assert.equal(publishes[1].requestId,publishes[2].requestId);assert.equal(publishes[1].view,'smc');assert.ok(Number.isInteger(publishes[1].allocationRevision));
  await page.evaluate(()=>{window.RosterExport={dailyRelief:data=>(window.__exportData=data,data),makeWorkbook:async()=>({blob:new Blob(['Synthetic workbook'])})};});
  await page.locator('[data-daily-excel]').click();await page.waitForFunction(()=>window.__exportData);
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='exportDaily').length),1);
  assert.equal(await page.evaluate(()=>__exportData.date),'2026-10-14');
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));

  // Old controls cannot save when the selected date is still loading.
  await page.evaluate(()=>{__fixture.delay.read=250;window.__oldAuto=document.querySelector('[data-auto-allocate]');});
  await page.locator('[data-ops-date]').fill('2026-10-15');await page.locator('[data-ops-date]').dispatchEvent('change');
  await page.evaluate(()=>__oldAuto.onclick());
  assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='autoAllocate').length),3);
  assert.equal(await page.evaluate(()=>RosterOpsUI.persistentWarning()),'','previous date warning does not apply during a new date read');
  await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  await page.locator('[data-ops-date]').fill('2026-10-13');await page.locator('[data-ops-date]').dispatchEvent('change');
  await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true);assert.match(await page.locator('.ops-allocation-hint').innerText(),/Past dates/);
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',{...__opsContext,initialDate:'2026-10-14'}));
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('[data-auto-allocate]').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile keeps horizontal scrolling inside timetable grids');
  if(process.env.GSIS_UI_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.GSIS_UI_CAPTURE_DIR,'705-assign-mobile.png'),fullPage:true});
  // Recess supervision is not a reported absence, but still has a manual cover path.
  await page.evaluate(async()=>{const f=__fixture;f.state=GSISRosterOperations.initial();f.receipts.clear();f.setClock('2026-10-14T08:00:00+08:00');GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveRecess',date:f.ctx.today,levels:[3]});await RosterOpsUI.render('Assign Relief',{...__opsContext,initialDate:f.ctx.today});});
  assert.equal(await page.locator('[data-reported-absences] [data-absence-card]').count(),0);
  assert.equal(await page.locator('[data-recess-supervision] [data-absence-card]').count(),1);
  assert.equal(await page.locator('[data-recess-supervision] [data-edit-entry]').count(),0);
  assert.match(await page.locator('[data-recess-supervision]').innerText(),/3A/);
  await page.locator('[data-recess-supervision] [data-select-absence]').click();await page.locator('[data-relief-period="7"]').click();
  await page.locator('[data-manual-select="dora"]').first().click();
  if(await page.locator('[data-confirm-manual]').count()){await page.locator('[data-manual-reason]').fill('Synthetic recess supervision');await page.locator('[data-confirm-manual]').click();}
  await page.waitForFunction(()=>__fixture.state.assignments.some(a=>a.recessActivationId&&a.staffId==='dora')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-recess-supervision] .ops-absence-fraction').innerText(),'1/1');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),0,'recess cover cannot create a phantom absent teacher');
  await page.evaluate(()=>{RosterOpsUI.unmount();__status('');});assert.equal(await page.locator('#status').innerText(),'','warning is removed when the view unmounts');
  const denied=await page.evaluate(async()=>{try{await RosterOpsUI.render('Assign Relief',{...__opsContext,profile:{user:{staffId:'bob',smc:false}}});return false;}catch{return true;}});assert.equal(denied,true);
  assert.deepEqual(errors,[]);
  console.log('PASS v0.7.05 Assign Relief: reported tiles, visible health, local interactions, role/accounting/date guards, exact retry, preserved assignments, bundled health refresh, status warning, mobile layout, and separate recess supervision.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
