'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright'),S=require('../shared/roster-stapler.js'),fixture=require('./helpers/stapler-period-fixture.cjs'),root=path.resolve(__dirname,'..');
const f=fixture();f.day.teachers[0].cells[1]=[];f.day.teachers[0].cells[3]=[];f.day.teachers[1].cells=[];f.plan=S.create(f.day);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main></main></body></html>'}));await page.goto('https://roster.test/');
  for(const name of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({path:path.join(root,'roster-update/public',name)});
  for(const name of ['shared/roster-stapler.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({path:path.join(root,name)});
  await page.evaluate(async f=>{
   const copy=x=>JSON.parse(JSON.stringify(x)),v=window.f={...f,saved:copy(f.plan),revision:1,calls:[]};v.view=()=>({date:f.day.date,today:f.day.date,plan:copy(v.saved),revision:v.revision,staplerRevision:v.revision,planningAllowed:true,canEdit:true,canConfirm:true,people:f.people,accessRequests:[],nameBridges:[]});
   v.ctx={initialDate:f.day.date,today:()=>f.day.date,container:document.querySelector('main'),profile:{user:{admin:true,smc:true,email:'synthetic@school.test'}},status(){},api:async(_,p)=>{v.calls.push(copy(p));if(p.operation==='stapler')return v.view();if(p.operation==='saveStapler'){v.saved=copy(p.plan);v.revision++;return v.view();}throw Error(p.operation);}};await RosterStaplerUI.render(v.ctx);
  },f);
  const row=page.locator('[data-teacher-fields="teacher-a"]'),tiles=()=>page.locator('[data-pane=teacher] [data-tile]').allTextContents(),original=await tiles();
  assert.equal(await page.locator('[data-teacher-fields]').count(),3);
  for(const [field,max] of [['subject','200'],['venue','500'],['group','300']])assert.equal(await row.locator('[name=teacher-'+field+']').getAttribute('maxlength'),max);
  const input=row.locator('[name=teacher-venue]'),arrow=row.locator('[data-teacher-field-form=venue] button');await arrow.click();assert.match(await page.locator('[data-stapler-message]').innerText(),/Enter Venue/);await input.fill('Hall');await arrow.click();assert(await page.locator('dialog [data-bulk-class]').isHidden());await page.locator('dialog .primary').click();assert.match(await page.locator('[data-stapler-message]').innerText(),/Applied to 1 lesson tile/);assert.equal(await input.inputValue(),'Hall','typed value survives redraw');
  await arrow.click();await page.locator('dialog .primary').click();assert.match(await page.locator('[data-dialog-message]').innerText(),/Already matches/);await page.locator('[data-dialog-close]').click();await page.locator('[data-undo]').click();assert.deepEqual(await tiles(),original);
  await arrow.click();await page.locator('dialog [name=bulkMode][value=create]').check();assert(await page.locator('dialog [data-bulk-class]').isVisible());assert.equal(await page.locator('dialog [data-bulk-teacher]').count(),0);await page.locator('dialog details').click();await page.locator('dialog [name=classIds][value=b]').check();await page.locator('dialog .primary').click();assert.match(await page.locator('[data-stapler-message]').innerText(),/Created 2 tiles/);await page.locator('[data-undo]').click();assert.deepEqual(await tiles(),original);
  const empty=page.locator('[data-teacher-fields="teacher-empty"]');await empty.locator('[name=teacher-group]').fill('Cohort');await empty.locator('[data-teacher-field-form=group] button').click();await page.locator('dialog .primary').click();assert.match(await page.locator('[data-dialog-message]').innerText(),/There are no existing lesson tiles/);await page.locator('[data-dialog-close]').click();assert.equal(await page.evaluate(()=>f.calls.filter(c=>c.operation==='saveStapler').length),0);
  await page.evaluate(async()=>{RosterStaplerUI.unmount();const view=f.view;f.view=()=>({...view(),planningAllowed:false,canEdit:false});await RosterStaplerUI.render(f.ctx);});assert.equal(await page.locator('[data-teacher-fields]').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS Chromium teacher-row fields, blank validation, changed/matched/empty messages, class picker, local Undo, redraw retention and read-only view');

 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
