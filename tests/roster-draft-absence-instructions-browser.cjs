'use strict';
// Production UI/domain with synthetic staff and exact receipt confirmation. No live backend calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.setContent('<main id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
  for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(process.env.ROSTER_ABSENCE_BEFORE_UI||path.join(root,'roster-update/public/roster-operations-ui.js'),'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
   f.day.teachers.find(t=>t.staffId==='bob').cells=structuredClone(f.day.teachers.find(t=>t.staffId==='alice').cells);
   const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
   window.__requests=[];
   await RosterOpsUI.render('Report Absence',{profile:f.profile,today:()=>f.ctx.today,cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),container:document.getElementById('content'),api:async(route,p)=>{
    __requests.push(structuredClone(p));
    if(p.operation==='saveAbsence'&&window.__holdSave)await new Promise(resolve=>window.__releaseSave=resolve);
    if(p.operation==='saveAbsence'&&window.__denySave){__denySave=false;throw Object.assign(Error('Synthetic absence validation failed'),{status:400});}
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }});
  });
  const action=page.locator('[data-log-absence]'),headerAction=page.locator('[data-instructions-na]');
  const idle=()=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  const writes=()=>page.evaluate(()=>__requests.filter(p=>p.operation==='saveAbsence').length);
  const choose=async name=>{for(const chip of await page.locator('[data-absence-teacher] .teacher-chip').all())await chip.click();const input=page.locator('[data-teacher-search]');await input.fill(name);await input.press('ArrowDown');await input.press('Enter');await idle();assert.match(await page.locator('[data-absence-teacher] .teacher-chip').innerText(),new RegExp(name));};
  const actionVisible=async()=>{assert.equal(await action.count(),1,'one persistent period-review action is present');assert.equal(await action.isVisible(),true);assert.equal(await action.innerText(),"I'm not available during the above selected periods");};
  await actionVisible();assert.equal(await action.evaluate(el=>el.tagName),'BUTTON');
  const screenshots=process.env.ROSTER_ABSENCE_SCREENSHOTS;if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'report-absence-desktop.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:844});await action.scrollIntoViewIfNeeded();
  const bounds=await action.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,'the persistent action fits a narrow viewport');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'report-absence-mobile.png'),fullPage:true});
  await action.focus();await page.keyboard.press('Space');
  assert.equal(await writes(),0,'keyboard activation validates before writing');assert.match(await page.locator('[data-ops-message]').innerText(),/Select at least one absent period/);
  await page.setViewportSize({width:1280,height:900});
  // The action survives preview and submits the current teacher only, with relief still required.
  await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();
  await actionVisible();assert.equal(await headerAction.isVisible(),true,'period confirmation keeps the no-instructions action in the instructions header');assert.equal(await headerAction.innerText(),'No relief instructions');
  assert.equal(await page.locator('[data-own-arrangements]').count(),1,'own arrangements are available in the preview without saving the report');
  await page.setViewportSize({width:390,height:844});await headerAction.scrollIntoViewIfNeeded();const headerBounds=await headerAction.boundingBox();assert(headerBounds.x>=0&&headerBounds.x+headerBounds.width<=390);if(screenshots)await page.screenshot({path:path.join(screenshots,'instructions-header-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});
  await page.locator('[data-instruction]').fill('Alice only: use the reading worksheet.');
  await page.locator('[data-period="3"]').click();await actionVisible();assert.equal(await page.locator('[data-instruction]').count(),0,'period changes invalidate the old preview');assert.match(await page.locator('[data-instructions-area]').innerText(),/Relief instructions/);
  await page.locator('[data-period="3"]').click();
  await page.locator('[data-log-absence]').click();assert.match(await page.locator('[data-instruction]').first().inputValue(),/Alice only/,'same report retains existing notes after its period selection changes');
  await page.evaluate(()=>{__holdSave=true;__fixture.fail='after-save';});await headerAction.focus();await page.keyboard.press('Space');assert.equal(await writes(),0,'keyboard no-instructions action stages the choice');await page.locator('[data-save-instructions]').click();await page.waitForFunction(()=>!!window.__releaseSave);assert.equal(await writes(),1,'Submit absence starts one save');
  await actionVisible();assert.equal(await action.evaluate(el=>el.disabled||!!el.closest('[inert]')),true,'pending save cannot be submitted again');assert.equal(await page.locator('[data-instruction]').inputValue(),'Alice only: use the reading worksheet.');
  const aliceRequest=await page.evaluate(()=>__requests.find(p=>p.operation==='saveAbsence'));
  assert.equal(aliceRequest.staffId,'alice');assert.equal(aliceRequest.instructionsNA,true);assert.equal(aliceRequest.reliefRequired,true);assert.match(JSON.stringify(aliceRequest.instructionsByDate),/Alice only/);
  await page.evaluate(()=>{__holdSave=false;__releaseSave();});await page.locator('[data-retry-save]').waitFor();
  await actionVisible();assert.equal(await page.locator('[data-instruction]').inputValue(),'Alice only: use the reading worksheet.');
  assert.equal(await page.locator('[data-absence-form]').evaluate(el=>el.inert),true,'an uncertain save freezes the complete report');
  assert.equal(await page.locator('[data-instructions-area]').evaluate(el=>el.inert),true,'an uncertain save freezes its instruction editor');
  const pendingDraft=await page.evaluate(()=>({teacher:document.querySelector('[data-teacher-search]').value,from:document.querySelector('[name="from"]').value,to:document.querySelector('[name="to"]').value,periods:[...document.querySelectorAll('[data-period][aria-pressed="true"]')].map(el=>el.dataset.period),notes:[...document.querySelectorAll('[data-instruction]')].map(el=>el.value),requests:__requests.filter(p=>p.view!=='intake').length}));
  await page.locator('[data-retry-save]').focus();
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[data-absence-form],[data-instructions-area]')),false,'keyboard navigation cannot enter the pending report');}
  await page.locator('[data-teacher-search]').focus();assert.equal(await page.locator('[data-teacher-search]').evaluate(el=>el===document.activeElement),false,'a pending teacher field cannot receive focus');
  // Exercise the handler guard too: a programmatic refresh event must not discard the pending draft.
  await page.locator('[data-ops-refresh]').dispatchEvent('click');
  assert.deepEqual(await page.evaluate(()=>({teacher:document.querySelector('[data-teacher-search]').value,from:document.querySelector('[name="from"]').value,to:document.querySelector('[name="to"]').value,periods:[...document.querySelectorAll('[data-period][aria-pressed="true"]')].map(el=>el.dataset.period),notes:[...document.querySelectorAll('[data-instruction]')].map(el=>el.value),requests:__requests.filter(p=>p.view!=='intake').length})),pendingDraft);
  assert.equal(await page.locator('[data-retry-save]').isEnabled(),true);assert.equal(await page.locator('[data-retry-save]').evaluate(el=>!!el.closest('[inert]')),false,'retry stays usable outside the frozen form');
  const aliceCommitted=await page.evaluate(()=>JSON.stringify(__fixture.state.absences));
  await page.locator('[data-retry-save]').click();await idle();
  assert.equal(await page.locator('[data-absence-form]').evaluate(el=>el.inert),false);assert.equal(await page.locator('[data-instructions-area]').evaluate(el=>el.inert),false);
  await page.locator('[data-teacher-search]').focus();assert.equal(await page.locator('[data-teacher-search]').evaluate(el=>el===document.activeElement),true,'confirmation unlocks teacher selection');
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.absences)),aliceCommitted,'lost response retry does not duplicate the absence');
  const aliceAttempts=await page.evaluate(()=>__requests.filter(p=>p.operation==='saveAbsence'));assert.equal(aliceAttempts.length,1,'accepted receipt confirms the saved report without a second mutation');assert.deepEqual(await page.evaluate(()=>__requests.find(p=>p.operation==='receiptStatus').command),aliceRequest,'receipt lookup preserves the exact report and request ID');
  await actionVisible();assert.equal(await action.isDisabled(),true,'success leaves the visible action disabled until the report changes');
  const aliceRecord=await page.evaluate(()=>structuredClone(__fixture.state.absences.find(a=>a.staffId==='alice')));
  assert.equal(aliceRecord.instructionsNA,true);assert.equal(aliceRecord.reliefRequired,true);
  // Moving to another teacher clears saved edit targets and notes, but keeps the action in place.
  await choose('Bob Colleague');await actionVisible();assert.equal(await action.isEnabled(),true);
  assert.equal(await page.locator('[data-instruction]').count(),0,'a new teacher cannot retain the former teacher’s saved instruction editor');assert.match(await page.locator('[data-instructions-area]').innerText(),/Relief instructions/);
  await page.locator('[data-log-absence]').click();assert.equal(await page.locator('[data-instruction]').inputValue(),'','the next teacher does not inherit notes');
  assert.equal(await page.locator('[data-instruction]').evaluate(el=>el.readOnly),false,'the next teacher does not inherit instructionsNA');
  await page.locator('[data-instruction]').fill('Bob only: finish the class task.');
  await page.locator('[name="from"]').fill('2026-10-15');await page.locator('[name="from"]').dispatchEvent('change');await idle();await actionVisible();
  assert.equal(await page.locator('[data-instruction]').count(),0,'changing the report date removes the old preview target');assert.match(await page.locator('[data-instructions-area]').innerText(),/Relief instructions/);
  await page.locator('[data-log-absence]').click();assert.equal(await page.locator('[data-instruction]').inputValue(),'','new dates do not inherit another day’s notes');
  await page.locator('[name="from"]').fill('2026-10-14');await page.locator('[name="from"]').dispatchEvent('change');await idle();await actionVisible();
  await page.locator('[name="to"]').fill('2026-10-14');await page.locator('[name="to"]').dispatchEvent('change');
  await page.locator('[data-log-absence]').click();assert.equal(await page.locator('[data-instruction]').inputValue(),'Bob only: finish the class task.','same-teacher notes survive a date redraw for their own date');
  await page.locator('[name="reliefRequired"]').selectOption('no');await actionVisible();
  await page.evaluate(()=>{__denySave=true;});await page.locator('[data-log-absence]').click();await headerAction.click();await page.locator('[data-save-instructions]').click();await idle();
  assert.match(await page.locator('[data-ops-message]').innerText(),/Synthetic absence validation failed/);await actionVisible();assert.equal(await action.isEnabled(),true);
  const failedBob=await page.evaluate(()=>__requests.filter(p=>p.operation==='saveAbsence').at(-1));assert.equal(failedBob.staffId,'bob');assert.equal(failedBob.instructionsNA,true);assert.equal(failedBob.reliefRequired,false);assert.match(JSON.stringify(failedBob.instructionsByDate),/Bob only/);assert.doesNotMatch(JSON.stringify(failedBob.instructionsByDate),/Alice only/);
  assert.equal(await headerAction.isVisible(),true);await page.locator('[data-save-instructions]').click();await idle();
  const bob=await page.evaluate(()=>structuredClone(__fixture.state.absences.find(a=>a.staffId==='bob')));assert.equal(bob.instructionsNA,true);assert.equal(bob.reliefRequired,false);
  assert.deepEqual(await page.evaluate(()=>__fixture.state.absences.find(a=>a.staffId==='alice')),aliceRecord,'repeated on-behalf reporting does not edit the former teacher’s record');
  // A third teacher can use the ordinary instructions path after earlier no-instructions reports.
  await choose('Charlie Busy');await actionVisible();await page.locator('[name="reliefRequired"]').selectOption('yes');await page.locator('[data-log-absence]').click();
  assert.equal(await page.locator('[data-instruction]').inputValue(),'');assert.equal(await page.locator('[data-instruction]').evaluate(el=>el.readOnly),false);
  await page.locator('[data-instruction]').fill('Charlie only: practise multiplication.');await page.locator('[data-save-instructions]').click();await idle();
  const charlie=await page.evaluate(()=>__fixture.state.absences.find(a=>a.staffId==='charlie'));assert.equal(charlie.instructionsNA,false);assert.equal(charlie.reliefRequired,true);assert.match(JSON.stringify(charlie.instructions),/Charlie only/);assert.doesNotMatch(JSON.stringify(charlie.instructions),/Alice only|Bob only/);
  assert.equal(await page.evaluate(()=>__requests.some(p=>['publish','notifyDaily','saveInstructions'].includes(p.operation))),false,'reporting does not publish, notify or edit an earlier saved record');
  // A saved report uses its existing IDs, including after the prior step already submitted it.
  const countBefore=await page.evaluate(()=>__fixture.state.absences.length),writesBefore=await writes();
  assert.equal(await headerAction.innerText(),'No relief instructions');await headerAction.click();await idle();
  assert.equal(await writes(),writesBefore,'saved header action does not create another report');assert.equal(await page.evaluate(()=>__fixture.state.absences.length),countBefore);
  assert.equal(await page.evaluate(()=>__requests.filter(p=>p.operation==='saveInstructions').length),1,'saved no-instructions action saves instructions once');const savedRequest=await page.evaluate(()=>__requests.filter(p=>p.operation==='saveInstructions').at(-1));assert.deepEqual(savedRequest.absenceIds,[charlie.id]);assert.equal(savedRequest.instructionsNA,undefined,'saved edits use the scoped changed-cell contract');assert.equal(savedRequest.instructionChanges.length,1);assert.equal(savedRequest.instructionChanges[0].absenceId,charlie.id);assert.equal(savedRequest.instructionChanges[0].baseInstructionsNA,false);assert.equal(savedRequest.instructionChanges[0].instructionsNA,true);assert.deepEqual(savedRequest.instructionChanges[0].base,{});assert.deepEqual(savedRequest.instructionChanges[0].values,{});assert.equal(await page.evaluate(()=>__fixture.state.absences.find(a=>a.staffId==='charlie').instructionsNA),true);assert.equal(await page.evaluate(()=>__fixture.state.absences.find(a=>a.staffId==='charlie').reliefRequired),true);
  assert.deepEqual(errors,[]);
  console.log('PASS persistent report instructions Chromium: local review, deferred no-instructions choice, ordinary bottom submit, narrow keyboard action, exact lost-response retry, repeated on-behalf drafts, dated notes, definite failure recovery and independent relief requirement.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
