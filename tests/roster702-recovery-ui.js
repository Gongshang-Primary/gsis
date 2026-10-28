'use strict';
// Chromium, production UI/domain, synthetic local APIs. No live services.
// GSIS_BROWSER_EXECUTABLE=/path/to/chromium node tests/roster702-recovery-ui.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const executablePath=process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1250,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
   __fixture.setClock(__fixture.ctx.today+'T06:00:00+08:00');GSISRosterOperations.apply(__fixture.state,__fixture.ctx,{operation:'saveAdhoc',staffId:'ext',date:__fixture.ctx.today,periods:[2,3]});window.__calls=[];
   window.__opsContext={profile:__fixture.profile,today:()=>__fixture.ctx.today,container:document.getElementById('content'),status:()=>{},api:async(route,p)=>{
    __calls.push(structuredClone(p));
    if(p.operation==='read'&&window.__failRead){window.__failRead=false;throw Object.assign(Error('Synthetic resync unavailable'),{status:503});}
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error),{status:response.status,diagnosticId:'synthetic-recovery-reference'});return result.data;
   }};
   window.__current=await RosterOpsUI.render('Report Absence',__opsContext);
  });
  const idle=()=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false'&&!document.querySelector('.ops-progress'));
  async function preview(period,text){
   await page.locator('[data-period="'+period+'"]').click();await page.locator('[data-log-absence]').click();await page.locator('[data-instruction]').fill(text);
  }
  await preview(2,'Retain these instructions after an uncertain save.');
  await page.evaluate(()=>__fixture.fail='after-save');await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);assert.equal(await page.locator('[data-retry-save]').count(),1);

  // Direct service mutations cannot bypass the same pending receipt gate.
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Manage Ad-hoc relief',__opsContext));
  const beforeDirect=await page.evaluate(()=>__calls.length);
  await page.locator('[data-external-link]').click();
  assert.equal(await page.evaluate(()=>__calls.length),beforeDirect,'private-link write is blocked until the pending save is confirmed');
  await page.locator('[data-add-contact]').click();await page.locator('.ops-dialog [name="name"]').fill('Unique Synthetic Helper');
  await page.locator('.ops-dialog [name="mobile"]').fill('+6590001001');await page.locator('[data-create-contact]').click();
  assert.equal(await page.evaluate(()=>__calls.length),beforeDirect,'contact creation cannot bypass the pending write gate');
  await page.locator('[data-close-dialog]').click();

  // Read-only controls still work after a committed write loses its confirmation.
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Absences by Date',__opsContext));
  assert.equal(await page.evaluate(()=>document.querySelector('[data-ops-body]').inert),false);
  await page.locator('[data-table-search]').fill('Alice');await page.locator('[data-sort="reportedAt"]').click();
  await page.locator('.ops-row-menu summary').click();assert.equal(await page.locator('.ops-row-menu').getAttribute('open'),'');
  await page.locator('[data-view-entry]').click();await page.locator('.ops-facts').waitFor();
  assert.equal(await page.locator('.ops-dialog [data-retry-save]').isVisible(),true,'pending receipt remains explicit inside read-only details');
  await page.locator('[data-close-dialog]').click();

  // Retrying a report receipt from another page and date must not install its report projection.
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Assign Relief',__opsContext));
  await page.locator('[data-ops-date]').fill('2026-10-15');await page.locator('[data-ops-date]').dispatchEvent('change');await idle();
  const before=await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence'));
  await page.locator('[data-retry-save]').click();await idle();
  const after=await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence'));
  assert.equal(before.length,1);assert.equal(after.length,2);assert.deepEqual(after[0],after[1]);
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);
  assert.deepEqual(await page.evaluate(()=>({page:__current.page,date:__current.date,dataDate:__current.data.date,allocation:!!__current.data.allocationModel})),{page:'Assign Relief',date:'2026-10-15',dataDate:'2026-10-15',allocation:true});
  assert.deepEqual(await page.evaluate(()=>__calls.filter(c=>c.operation==='read').at(-1)),{operation:'read',date:'2026-10-15',view:'allocation',compact:true});
  assert.match(await page.locator('[data-ops-message]').textContent(),/Saved\. Current records refreshed/);assert.equal(await page.locator('[data-retry-save]').count(),0);

  // Definite conflicts do not reuse a stale revision forever or drop the draft.
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Report Absence',__opsContext));
  await preview(3,'Keep this exact draft across a 409.');
  await page.evaluate(()=>__fixture.state.revision++);await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1,'409 performs no write and no automatic overwrite');
  assert.equal(await page.locator('[data-instruction]').inputValue(),'Keep this exact draft across a 409.');
  assert.equal(await page.locator('[data-period="3"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>__current.data.revision===__fixture.state.revision),true,'authoritative revision resynchronised despite dirty draft');
  assert.match(await page.locator('[data-ops-message]').textContent(),/Review them, then submit again/);
  assert.equal(await page.locator('[data-retry-save]').count(),0,'definite rejection has no uncertain receipt');
  const rejected=await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence').at(-1));
  await page.locator('[data-save-instructions]').click();await idle();
  const reviewed=await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence').at(-1));
  assert.notEqual(reviewed.requestId,rejected.requestId);assert.equal(reviewed.revision,rejected.revision+1);assert.deepEqual(reviewed.instructionsByDate,rejected.instructionsByDate);
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),2,'explicit review and submit creates the intended new absence');

  // Saved instructions and entry forms are closure-local; conflict refresh keeps their live DOM.
  await page.locator('[data-instruction]').fill('Retain an edited saved instruction through conflict.');
  await page.evaluate(()=>{window.__instruction=document.querySelector('[data-instruction]');__fixture.state.revision++;});
  await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-instruction]')===__instruction),true);
  assert.equal(await page.locator('[data-instruction]').inputValue(),'Retain an edited saved instruction through conflict.');
  await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),2);
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Manage reported absences',__opsContext));
  await page.locator('.ops-row-menu summary').first().click();await page.locator('[data-edit-entry]').first().click();await page.locator('[data-edit-form]').waitFor();
  await page.locator('[data-edit-form] [name="typeId"]').selectOption('others');await page.locator('[data-edit-form] [name="reasonDetail"]').fill('Retain this modal correction.');
  await page.evaluate(()=>{window.__edit=document.querySelector('[data-edit-form]');__fixture.state.revision++;});
  await page.locator('[data-edit-form] button.primary').click();await idle();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-edit-form]')===__edit),true);
  assert.equal(await page.locator('[data-edit-form] [name="reasonDetail"]').inputValue(),'Retain this modal correction.');
  assert.equal(await page.evaluate(()=>__current.data.revision===__fixture.state.revision),true);
  await page.locator('[data-edit-form] button.primary').click();await idle();
  assert.equal(await page.locator('.ops-dialog').count(),0);assert.equal(await page.evaluate(()=>__fixture.state.absences.length),2);

  // If the conflict read itself fails, the next click refreshes and asks for review.
  await page.evaluate(async()=>window.__current=await RosterOpsUI.render('Report Absence',__opsContext));
  await preview(4,'Keep draft when the conflict resync is offline.');
  await page.evaluate(()=>{__fixture.state.revision++;__failRead=true;});await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>__current.needsReviewRefresh),true);assert.equal(await page.locator('[data-instruction]').inputValue(),'Keep draft when the conflict resync is offline.');
  const failedCount=await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence').length);
  await page.locator('[data-save-instructions]').click();await idle();
  assert.equal(await page.evaluate(()=>__calls.filter(c=>c.operation==='saveAbsence').length),failedCount,'recovery refresh does not submit automatically');
  assert.equal(await page.evaluate(()=>__current.needsReviewRefresh),false);assert.match(await page.locator('[data-ops-message]').textContent(),/Review your retained changes/);
  await page.locator('[data-save-instructions]').click();await idle();assert.equal(await page.evaluate(()=>__fixture.state.absences.length),3);
  assert.deepEqual(errors,[]);
  console.log('PASS v0.7.02 recovery: pending receipt leaves read-only menus/filter/details usable; direct service writes cannot bypass pending receipt; same payload replay from another page/date reloads current projection; 409 retains Report draft, saved instructions and live edit modal while refreshing revision; explicit reviewed resubmit; failed resync blocks writes until fresh review.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
