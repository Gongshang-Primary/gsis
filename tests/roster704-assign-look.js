'use strict';
// Real Chromium and production domain/UI. All staff and saves are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM});
 try{
  const page=await browser.newPage({viewport:{width:1900,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<main id="content"></main>');
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',f),'utf8')});
  for(const f of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture,O=GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');
   O.apply(f.state,f.ctx,{operation:'saveAdhoc',staffId:'ext',date:f.ctx.today,periods:[2,3]});
   const absence=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]}).savedId;
   O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[absence+':2'],staffId:'dora',confirm:true,reason:'Synthetic test'});
   O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'bob',date:f.ctx.today,typeId:'mc',periods:[4],reliefRequired:false});
   window.__navigation=[];window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),go:(page,date)=>__navigation.push({page,date}),api:async(route,p)=>{
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};
   await RosterOpsUI.render('Assign Relief',__opsContext);
  });
  const form=page.locator('[data-assign-absence-form]');
  assert.equal(await form.locator('[name="typeId"]').inputValue(),'');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'');
  assert.equal(await page.locator('.ops-assign-page').count(),1);
  assert.equal(await page.evaluate(()=>document.querySelector('.ops-relief-toolbar').nextElementSibling===document.querySelector('[data-quick-absence]')&&document.querySelector('[data-quick-absence]').nextElementSibling.matches('.ops-absence-bank')),true,'toolbar, quick form and absence cards follow the reference order');
  assert.equal(await page.locator('.ops-quick-adhoc-chip').innerText(),'External Known (SRE)');
  assert.equal(await page.locator('.ops-absence-card.partial.selected').count(),1,'selection retains partial status');
  assert.equal(await page.locator('.ops-absence-card.partial .ops-absence-fraction').innerText(),'1/2');
  assert.equal(await page.locator('.ops-absence-card.complete.no-relief').count(),1);
  assert.equal(await page.locator('.ops-absence-card.partial .ops-absence-state').innerText(),'Relief Required');
  await page.locator('[data-manage-adhoc]').click();
  assert.deepEqual(await page.evaluate(()=>__navigation),[{page:'Manage Ad-hoc relief',date:'2026-10-14'}]);
  const reads=await page.evaluate(()=>__fixture.calls.length);
  await page.locator('.ops-absence-card.complete [data-select-absence]').click();
  assert.equal(await page.locator('.ops-absence-card.complete.selected.no-relief').count(),1);
  assert.equal(await page.locator('.ops-absence-card.partial:not(.selected)').count(),1);
  assert.equal(await page.evaluate(()=>__fixture.calls.length),reads,'card selection is local');
  await form.locator('[name="typeId"]').selectOption('lsb');
  assert.equal(await form.locator('[data-select-periods]').isDisabled(),true);
  assert.equal(await form.locator('[data-period="12"]').isDisabled(),true);
  await form.locator('[name="typeId"]').selectOption('lse');
  assert.equal(await form.locator('[data-add-absence]').isDisabled(),true,'time restrictions still apply');
  await form.locator('[name="typeId"]').selectOption('others');
  assert.equal(await form.locator('[name="reasonDetail"]').getAttribute('required'),'');
  await form.locator('[name="typeId"]').selectOption('mc');
  await form.locator('[data-teacher-search]').fill('Charlie');
  await form.getByRole('option',{name:'Charlie Busy'}).click();
  await form.locator('[data-period="2"]').click();
  assert.equal(await page.evaluate(()=>__fixture.calls.length),reads,'form selection adds no backend request');
  await page.evaluate(()=>{__fixture.fail='after-save';});
  await form.locator('[data-add-absence]').click();
  await page.locator('[data-retry-save]').waitFor();
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'Charlie Busy');
  assert.equal(await form.locator('[data-period="2"]').getAttribute('aria-pressed'),'true');
  assert.equal(await form.locator('[data-teacher-search]').isDisabled(),true,'uncertain save keeps its immutable draft');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length),3);
  await page.locator('[data-retry-save]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-retry-save]')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length),3,'same-request retry cannot duplicate absence');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'');
  assert.equal(await form.locator('[name="typeId"]').inputValue(),'');
  assert.match(await page.locator('.ops-absence-card.selected').innerText(),/Charlie Busy/);
  assert.equal(await page.locator('.ops-absence-card.selected.unresolved').count(),1);
  const saved=await page.evaluate(()=>({a:__fixture.state.absences.find(a=>a.staffId==='charlie'),calls:__fixture.calls.filter(c=>c.p.operation==='saveAbsence')}));
  assert.equal(saved.a.instructionsNA,false);assert.equal(saved.calls.length,2);assert.equal(saved.calls[0].p.requestId,saved.calls[1].p.requestId);
  assert.equal(saved.calls[0].p.instructionsNA,undefined);assert.equal(saved.calls[0].p.view,'allocation');assert.equal(saved.calls[0].p.date,'2026-10-14');

  // Revision conflicts retain the single-date form while checking fresh records.
  await form.locator('[name="typeId"]').selectOption('mc');
  await form.locator('[data-teacher-search]').fill('Alice');await form.getByRole('option',{name:'Alice Teacher'}).click();
  await form.locator('[data-period="4"]').click();await page.evaluate(()=>__fixture.state.revision++);
  await form.locator('[data-add-absence]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Your changes are retained')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'Alice Teacher');
  assert.equal(await form.locator('[data-period="4"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length),3);
  await form.locator('[data-add-absence]').click();
  await page.waitForFunction(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length===4&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'');
  assert.match(await page.locator('.ops-absence-card.selected').innerText(),/Alice Teacher/);
  assert.equal(await page.locator('.ops-absence-card.selected .ops-absence-fraction').innerText(),'0/1');

  // Retain unrelated quick-form edits after removing another entry.
  await form.locator('[name="typeId"]').selectOption('others');await form.locator('[name="reasonDetail"]').fill('Retain this draft');
  await page.locator('.ops-absence-card.selected [data-delete-entry]').click();
  await page.waitForFunction(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length===3&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await form.locator('[name="reasonDetail"]').inputValue(),'Retain this draft');
  assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),true,'other mutations cannot silently clear the quick draft');
  assert.match(await page.evaluate(()=>__confirmations.at(-1)),/Delete 1 selected absence entry/);
  await form.locator('[data-teacher-search]').fill('Unfinished teacher search');
  await page.locator('.ops-absence-card').filter({hasText:'Alice Teacher'}).locator('[data-select-absence]').click();
  await page.locator('[data-relief-period="3"]').click();
  assert.ok(await page.locator('[data-manual-select="dora"]').count());
  await page.evaluate(()=>{__fixture.day.teachers.find(t=>t.staffId==='dora').cells[3]=['SC','3B','C2-03',''];__fixture.state.revision++;});
  await page.locator('[data-manual-select="dora"]').first().click();
  if(await page.locator('[data-confirm-manual]').count()){
   await page.locator('[data-manual-reason]').fill('Synthetic check');await page.locator('[data-confirm-manual]').click();
  }
  await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Candidates refreshed')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('[data-manual-select="dora"]').count(),0,'409 must redraw freshly checked candidates even with a dirty quick form');
  assert.equal(await form.locator('[name="reasonDetail"]').inputValue(),'Retain this draft');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'Unfinished teacher search');
  assert.equal(await page.evaluate(()=>RosterOpsUI.isDirty()),true);
  await form.locator('[data-teacher-search]').press('Escape');
  await page.locator('.ops-absence-card').filter({hasText:'Charlie Busy'}).locator('[data-delete-entry]').click();
  await page.waitForFunction(()=>__fixture.state.absences.filter(a=>!a.deletedAt).length===2&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await form.locator('[data-teacher-search]').inputValue(),'','redraw must not restore a search cancelled with Escape');
  assert.equal(await form.locator('[name="reasonDetail"]').inputValue(),'Retain this draft');
  await page.locator('[data-ops-date]').fill('2026-10-13');await page.locator('[data-ops-date]').dispatchEvent('change');
  await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false'&&document.querySelector('[data-ops-date]').value==='2026-10-13');
  assert.equal(await form.locator('[data-teacher-search]').isDisabled(),true,'past-date add form is read-only');
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',{...__opsContext,initialDate:'2026-10-16'}));
  assert.equal(await page.locator('[data-ops-date]').inputValue(),'2026-10-16','explicit navigation date takes precedence over page memory');
  await page.locator('[data-manage-adhoc]').click();
  assert.deepEqual(await page.evaluate(()=>__navigation.at(-1)),{page:'Manage Ad-hoc relief',date:'2026-10-16'});
  assert.deepEqual(errors,[]);
  console.log('PASS Assign Relief screenshot layout interactions: existing rules, local selection, atomic create/retry, retained conflict draft, card status, confirmed delete and past-date guard.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
