'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 const idle=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
 const writes=page=>page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='saveAbsence'));
 async function setup(missing=false){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.setContent('<main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:read('roster-update/public/'+file)});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(async missing=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').cells=structuredClone(f.day.teachers[0].cells);
   if(missing)Object.assign(f.day,{id:null,periods:[],teachers:[],schoolDay:false});
   await RosterOpsUI.render('Report Absence',{profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}});
  },missing);return page;
 }
 const teacher=async(page,id)=>{await page.locator('[data-instruction-teacher]').selectOption(id);await idle(page);};
 const date=async(page,value)=>{await page.locator('[data-instruction-date]').selectOption(value);await idle(page);};
 async function addBob(page){const input=page.locator('[data-absence-teacher] [data-teacher-search]');await input.fill('Bob');await input.press('Enter');await idle(page);assert.equal(await page.locator('[data-absence-teacher] .teacher-chip').count(),2);}
 try{
  const page=await setup();assert.equal(await page.locator('[data-absence-teacher]>label').innerText(),'Absent teacher(s)');await addBob(page);
  assert.equal(await page.locator('[data-absence-teacher] [role=listbox]').getAttribute('aria-multiselectable'),'true');
  await page.locator('[name=to]').fill('2026-10-15');await page.locator('[name=to]').dispatchEvent('change');await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();assert.deepEqual(await writes(page),[]);
  await page.locator('[data-instruction="0"]').fill('Alice Wednesday');await teacher(page,'bob');assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'');await page.locator('[data-instruction="0"]').fill('Bob Wednesday');
  await date(page,'2026-10-15');await page.locator('[data-instruction="0"]').fill('Bob Thursday');await teacher(page,'alice');await page.locator('[data-instruction="0"]').fill('Alice Thursday');await date(page,'2026-10-14');assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'Alice Wednesday');assert.deepEqual(await writes(page),[],'teacher/date review is read-only');
  assert.equal(await page.locator('[data-save-instructions]').innerText(),'Submit absence');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ROSTER_ABSENCE_SCREENSHOTS){const directory=process.env.ROSTER_ABSENCE_SCREENSHOTS;fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:path.join(directory,'report-absence-batch-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(directory,'report-absence-batch-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});}
  await page.evaluate(()=>__fixture.fail='after-save');await page.locator('[data-save-instructions]').click();await page.locator('[data-retry-save]').waitFor();
  const first=await writes(page);assert.equal(first.length,1);assert.deepEqual(first[0].p.staffIds,['alice','bob']);assert.equal(first[0].p.instructionsByDate,undefined,'batch sends no ambiguous shared date map');
  const expected=[['alice','2026-10-14','Alice Wednesday'],['alice','2026-10-15','Alice Thursday'],['bob','2026-10-14','Bob Wednesday'],['bob','2026-10-15','Bob Thursday']];
  assert.deepEqual(await page.evaluate(()=>__fixture.state.absences.map(a=>[a.staffId,a.date,Object.values(a.instructions)[0]]).sort()),expected);
  assert.equal(await page.locator('[data-absence-form]').evaluate(el=>el.inert),true);await page.locator('[data-retry-save]').click();await idle(page);assert.equal((await writes(page)).length,1,'receipt recovery never repeats or partially replays the batch');assert.equal(await page.evaluate(()=>__fixture.state.absences.length),4);
  // Saved edits affect the reviewed teacher/date only.
  await teacher(page,'bob');await page.locator('[data-instruction="0"]').fill('Bob Wednesday revised');await page.locator('[data-save-instructions]').click();await idle(page);
  assert.deepEqual(await page.evaluate(()=>__fixture.state.absences.filter(a=>a.date==='2026-10-14').map(a=>[a.staffId,Object.values(a.instructions)[0]]).sort()),[['alice','Alice Wednesday'],['bob','Bob Wednesday revised']]);await page.close();
  const missing=await setup(true);await addBob(missing);await missing.locator('[name=reliefRequired]').selectOption('no');await missing.locator('[name=to]').fill('2026-10-15');await missing.locator('[name=to]').dispatchEvent('change');await missing.locator('[data-log-absence]').click();assert.deepEqual(await writes(missing),[]);await missing.locator('[data-instructions-na]').click();assert.deepEqual(await writes(missing),[]);await missing.locator('[data-save-instructions]').click();await idle(missing);assert.equal((await writes(missing)).length,1);assert.equal(await missing.evaluate(()=>__fixture.state.absences.length),4);assert.equal(await missing.evaluate(()=>__fixture.state.absences.every(a=>a.coverage.kind==='fullDay'&&!a.reliefRequired&&a.instructionsNA&&a.timetablePending)),true);await missing.close();
  assert.deepEqual(errors,[]);console.log('PASS batch absence Chromium: shared multi-picker, four distinct teacher/date notes, one atomic submit, exact lost-response recovery, scoped saved edits and missing-baseline No relief.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
