'use strict';
// Real Chromium UI and operations model with synthetic staff. No live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 const idle=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
 async function setup(quick){
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:read('roster-update/public/'+name)});
  for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:read(name)});
  await page.addScriptTag({content:fs.readFileSync(process.env.ROSTER_ABSENCE_BEFORE_UI||path.join(root,'roster-update/public/roster-operations-ui.js'),'utf8')});
  await page.evaluate(async quick=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
   const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
   window.__requests=[];
   await RosterOpsUI.render('Report Absence',{profile:f.profile,today:()=>f.ctx.today,quickAbsence:quick,cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),container:document.getElementById('content'),api:async(route,p)=>{
    __requests.push(structuredClone(p));
    if(p.operation==='saveAbsence'&&window.__denySave){__denySave=false;throw Object.assign(Error('Synthetic absence validation failed'),{status:400});}
    if(p.operation==='saveAbsence'&&window.__holdSave)await new Promise(resolve=>window.__releaseSave=resolve);
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }});
  },quick);
  return page;
 }
 const writes=page=>page.evaluate(()=>__requests.filter(p=>!GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus'));
 const assertVisibleInstructions=async page=>{
  assert.equal(await page.locator('[data-instructions-area] h3').innerText(),'Relief instructions');
  assert.equal(await page.locator('[data-instructions-area] details,[data-instructions-area] summary').count(),0,'instructions have no expand/hide control');
  assert.equal(await page.locator('[data-instructions-area]').evaluate(el=>!!el.closest('details')),false);
 };
 try{
  const page=await setup(true),review=page.locator('[data-log-absence]'),na=page.locator('[data-instructions-na]'),save=page.locator('[data-save-instructions]');
  assert.equal(await review.innerText(),"I'm not available during the above selected periods");
  assert.equal(await page.locator('[data-report-instructions-na]').count(),0,'no early submit shortcut remains');
  await assertVisibleInstructions(page);assert.equal(await save.count(),0,'no final write before a valid review');
  await review.focus();await page.keyboard.press('Space');assert.deepEqual(await writes(page),[]);assert.match(await page.locator('[data-ops-message]').innerText(),/Select at least one absent period/);
  for(const period of [2,3,4])await page.locator('[data-period="'+period+'"]').click();
  await page.locator('[name=to]').fill('2026-10-15');await page.locator('[name=to]').dispatchEvent('change');
  await review.click();await assertVisibleInstructions(page);assert.deepEqual(await writes(page),[],'reviewing selected periods performs no writes');
  assert.equal(await page.locator('[data-instruction]').count(),2,'adjacent same-class lessons share an instruction field');
  assert.equal(await na.innerText(),'No relief instructions');assert.equal(await page.locator('[data-own-arrangements]').count(),1,'own arrangements is available beside no-instructions in the preview');assert.match(await page.locator('.ops-instructions > .hint:not([data-own-arrangement-summary])').innerText(),/Submit absence\. Your report is received first; instructions and colleague requests are processed separately/);
  assert.equal(await na.evaluate(el=>!!(el.compareDocumentPosition(el.closest('section').querySelector('table'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'no-instructions choice precedes the selected lesson rows');
  assert.equal(await save.evaluate(el=>!!(el.compareDocumentPosition(el.closest('section').querySelector('table'))&Node.DOCUMENT_POSITION_PRECEDING)),true,'write control follows the instructions table');
  const dateStart=await page.locator('[name=from]').boundingBox(),dateEnd=await page.locator('[name=to]').boundingBox();
  assert(Math.abs(dateEnd.y-dateStart.y)<2&&dateEnd.x-dateStart.x-dateStart.width>=0&&dateEnd.x-dateStart.x-dateStart.width<=24,'date inputs sit close together on desktop');
  assert.equal(await na.evaluate(el=>!!el.closest('.ops-instructions-heading')),true,'no-instructions choice sits beside the instruction date');
  const instructionDateBox=await page.locator('[data-instruction-date]').boundingBox(),naBox=await na.boundingBox();
  assert(Math.abs(naBox.y-instructionDateBox.y)<5&&naBox.x>=instructionDateBox.x+instructionDateBox.width,'header choice follows the date on desktop');
  await page.locator('[data-instruction="0"]').fill('Wednesday: use the reading worksheet.');
  await page.locator('[data-instruction="1"]').fill('Wednesday: practise the new spelling words.');
  await page.evaluate(()=>window.confirm=()=>false);await na.click();assert.deepEqual(await writes(page),[],'cancelling no-instructions confirmation does not submit');
  assert.equal(await na.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('[data-instruction="0"]').evaluate(el=>el.readOnly),false);
  assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'Wednesday: use the reading worksheet.');
  assert.equal(await page.locator('[data-instruction="0"]').isVisible(),true,'cancelling preserves the visible lesson table');
  await page.evaluate(()=>window.confirm=()=>true);
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await review.scrollIntoViewIfNeeded();let box=await review.boundingBox();assert(box.x>=0&&box.x+box.width<=width,'review fits viewport '+width);
   await save.scrollIntoViewIfNeeded();box=await save.boundingBox();assert(box.x>=0&&box.x+box.width<=width,'final submit fits viewport '+width);
   const choice=await na.boundingBox();assert(choice.x>=0&&choice.x+choice.width<=width,'no-instructions choice fits viewport '+width);const own=await page.locator('[data-own-arrangements]').boundingBox();assert(own.x>=0&&own.x+own.width<=width,'own arrangements fits viewport '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no document overflow at '+width);
  }
  const screenshots=process.env.ROSTER_ABSENCE_SCREENSHOTS;
  if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'absence718d-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(screenshots,'absence718d-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});}
  await page.locator('[data-instruction-date]').selectOption('2026-10-15');await idle(page);
  assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'','a different day does not inherit instructions');
  await page.locator('[data-instruction="0"]').fill('Thursday: complete the comprehension task.');
  await page.locator('[data-instruction-date]').selectOption('2026-10-14');await idle(page);
  assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'Wednesday: use the reading worksheet.');
  assert.deepEqual(await writes(page),[],'changing reviewed dates only reads records');
  // Definite rejection keeps the report editable and retains both days of instructions.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>__denySave=true);await save.click();await idle(page);
  assert.match(await page.locator('[data-ops-message]').innerText(),/Synthetic absence validation failed/);assert.equal(await page.evaluate(()=>__fixture.state.absences.length),0);
  assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'Wednesday: use the reading worksheet.');assert.equal(await save.isEnabled(),true);
  // An uncertain acknowledgement freezes the exact command until receipt confirmation.
  await page.evaluate(()=>{__holdSave=true;__fixture.fail='after-save';});await save.click();await page.waitForFunction(()=>!!__releaseSave);
  const sent=await page.evaluate(()=>__requests.filter(p=>p.operation==='saveAbsence').at(-1));
  assert.deepEqual(sent.periods,[2,3,4]);assert.equal(sent.from,'2026-10-14');assert.equal(sent.to,'2026-10-15');assert.equal(sent.instructionsNA,false);assert.equal(sent.reliefRequired,true);
  assert.match(JSON.stringify(sent.instructionsByDate['2026-10-14']),/Wednesday/);assert.doesNotMatch(JSON.stringify(sent.instructionsByDate['2026-10-14']),/Thursday/);
  assert.match(JSON.stringify(sent.instructionsByDate['2026-10-15']),/Thursday/);assert.doesNotMatch(JSON.stringify(sent.instructionsByDate['2026-10-15']),/Wednesday/);
  await page.evaluate(()=>{__holdSave=false;__releaseSave();});await page.locator('[data-retry-save]').waitFor();
  assert.equal(await page.locator('[data-absence-form]').evaluate(el=>el.inert),true);assert.equal(await page.locator('[data-instructions-area]').evaluate(el=>el.inert),true);
  const accepted=await page.evaluate(()=>JSON.stringify(__fixture.state.absences));assert.equal(JSON.parse(accepted).length,2,'one atomic command records both dates');
  const retryBox=await page.locator('[data-retry-save]').boundingBox();assert(retryBox.y>=0&&retryBox.y+retryBox.height<=page.viewportSize().height,'pending retry is brought into view on a phone');
  await page.locator('[data-retry-save]').click();await idle(page);
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state.absences)),accepted,'receipt recovery does not duplicate records');
  assert.deepEqual(await page.evaluate(()=>__requests.find(p=>p.operation==='receiptStatus').command),sent,'receipt lookup retains the exact command');
  assert.equal((await writes(page)).length,2,'one denied attempt and one accepted mutation, no write on receipt retry');await assertVisibleInstructions(page);
  assert.equal(await page.locator('[data-own-arrangements]').isVisible(),true,'own arrangements remain available after the report exists');
  const beforeArrange=(await writes(page)).length;await page.locator('[data-own-arrangements]').click();await page.locator('dialog').waitFor();assert.equal((await writes(page)).length,beforeArrange,'opening saved own arrangements does not resubmit the absence');await page.locator('[data-close-dialog]').click();
  // The no-instructions shortcut saves the existing records without resubmitting absences.
  await na.click();await idle(page);assert.equal((await writes(page)).length,beforeArrange+1);assert.equal((await writes(page)).at(-1).operation,'saveInstructions');assert.equal(await page.evaluate(()=>__fixture.state.absences.every(a=>a.instructionsNA)),true);await assertVisibleInstructions(page);
  await page.close();
  // The non-quick route keeps the no-instructions choice local until Submit absence.
  const normal=await setup(false);await normal.setViewportSize({width:390,height:844});assert.equal(await normal.locator('[data-log-absence]').innerText(),"I'm not available during the above selected periods");await assertVisibleInstructions(normal);
  await normal.locator('[data-period="2"]').click();await normal.locator('[data-log-absence]').click();assert.deepEqual(await writes(normal),[]);await normal.locator('[data-instructions-na]').click();assert.deepEqual(await writes(normal),[]);await normal.locator('[data-save-instructions]').click();await idle(normal);assert.equal((await writes(normal)).length,1);const reported=await normal.evaluate(()=>__fixture.state.absences[0]);assert.equal(reported.instructionsNA,true);assert.equal(reported.reliefRequired,true);assert.deepEqual(reported.periods,[2]);await assertVisibleInstructions(normal);await normal.close();
  assert.deepEqual(errors,[]);console.log('PASS absence718d Chromium: local review and cancellation; no-instructions stays local until submit; visible instructions and ordinary bottom submit; mobile fit; dated notes; validation recovery; atomic multi-day save; exact receipt retry; own-arrangements available without an opening save; saved shortcut updates existing records.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
