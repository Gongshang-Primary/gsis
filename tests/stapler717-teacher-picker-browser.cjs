'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{fixture}=require('./stapler715-persistence.cjs'),root=path.resolve(__dirname,'..'),f=fixture();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><main></main></body></html>'}));await page.goto('https://roster.test/');
  for(const name of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({path:path.join(root,'roster-update/public',name)});
  for(const name of ['shared/roster-stapler.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({path:path.join(root,name)});
  await page.evaluate(f=>{
   const clone=x=>JSON.parse(JSON.stringify(x)),v=window.f={...f,saved:f.plan,revision:1,calls:[],confirmed:false};
   v.view=()=>({date:f.day.date,today:f.day.date,plan:clone(v.saved),revision:v.revision,staplerRevision:v.revision,structuralValidation:{version:1,date:f.day.date,baselineId:f.plan.baselineId,revision:v.revision},planningAllowed:true,canEdit:true,canConfirm:true,confirmed:v.confirmed?{revision:v.revision}:null,lock:{fence:1,mine:true,active:true,expiresAt:Date.now()+180000},people:f.people,accessRequests:[],nameBridges:[],timing:{backendVersion:'0.7.16-test'}});
   v.ctx={initialDate:f.day.date,today:()=>f.day.date,container:document.querySelector('main'),profile:{user:{admin:true,smc:true,email:'admin@school.test'}},status(){},api:async(_,p)=>{v.calls.push(clone(p));if(p.operation==='stapler')return v.view();if(p.operation==='saveStapler'){v.saved=clone(p.plan);v.revision++;return v.view();}if(p.operation==='confirmStapler'){v.confirmed=true;return v.view();}throw Error(p.operation);}};
   return RosterStaplerUI.render(v.ctx);
  },f);
  await page.locator('[data-add-card]').click();
  assert.equal(await page.locator('dialog h3').innerText(),'Add teacher tile');
  const pitBefore=await page.locator('[data-pit-cards] [data-tile]').count();
  assert.equal(await page.locator('[data-teacher-search]').inputValue(),'Teacher 0','picker starts on the first teacher');
  assert.equal(await page.locator('[name=teacherId]').inputValue(),'staff-0','picker starts on the first teacher id');
  await page.locator('[data-teacher-search]').fill('Teacher 10');
  assert.equal(await page.locator('[data-teacher-option]').count(),5,'search narrows 104 teachers to five');
  assert.equal(await page.locator('[data-teacher-option]').first().innerText(),'Teacher 10','exact match first');
  await page.locator('[data-teacher-option]').first().click();
  assert.equal(await page.locator('[name=teacherId]').inputValue(),'staff-10','clicked option sets the teacher id');
  await page.locator('[data-teacher-search]').fill('Teacher 2');
  await page.locator('[data-teacher-search]').press('ArrowDown');
  await page.locator('[data-teacher-search]').press('Enter');
  assert.equal(await page.locator('[name=teacherId]').inputValue(),'staff-20','keyboard select picks the highlighted teacher');
  await page.locator('[name=subject]').fill('EL');
  await page.locator('dialog button.primary').click();
  assert.equal(await page.locator('[data-pit-cards] [data-tile]').count(),pitBefore+1,'one tile added to the pit');
  await page.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved.'));
  assert.deepEqual(await page.evaluate(ids=>window.f.saved.tiles.filter(t=>!ids.includes(t.id)).map(t=>({teacherId:t.teacherId,subject:t.subject,location:t.location})),f.plan.tiles.map(t=>t.id)),[{teacherId:'staff-20',subject:'EL',location:'pit'}],'saved tile carries the picked staff id');
  assert.deepEqual(errors,[]);
  console.log('PASS v717 Stapler teacher picker in Chromium: dialog search narrows 104 teachers, click and keyboard select set the staff id, saved tile keeps it.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
