'use strict';
// Real Chromium controls and local APIs only; no staff messages or production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(6000);
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="content"></main></body></html>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-allocation.js','shared/roster-operations.js','shared/roster-stapler.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture,O=GSISRosterOperations,date=f.ctx.today;f.setClock(date+'T06:00:00+08:00');
   O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2]});const demand=O.demand(f.ctx,f.state,date)[0];O.apply(f.state,f.ctx,{operation:'assign',date,demandIds:[demand.id],staffId:'bob',confirm:true});
   window.testToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   window.testCtx={profile:f.profile,container:document.querySelector('#content'),initialDate:'2026-10-15',today:testToday,status(){},api:async(route,p)=>{const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}};
   await RosterOpsUI.render('Absences by Date',testCtx);
  });
  await page.locator('[data-ops-tab="relief"]').click();assert.equal(await page.locator('[data-publish-relief]').isDisabled(),true);assert.match(await page.locator('[data-publish-hint]').innerText(),/Future dates.*drafts/);
  await page.evaluate(async()=>{testCtx.initialDate=__fixture.ctx.today;await RosterOpsUI.render('Absences by Date',testCtx);});
  assert.equal(await page.locator('[data-publish-relief]').isDisabled(),false);await page.locator('[data-publish-relief]').click();await page.locator('[data-publish-audit]').waitFor({state:'visible'});await page.locator('[name="auditReason"]').fill('Reviewed staffing');
  await page.evaluate(()=>__fixture.setClock('2026-10-14T16:00:01Z'));await page.locator('[data-publish-audit] button.primary').click();assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='publish').length),0);assert.match(await page.locator('[data-dialog-message]').innerText(),/current Singapore workday/);assert.equal(await page.locator('[data-publish-relief]').isDisabled(),true);
  await page.locator('[data-cancel-publish]').click();await page.evaluate(async()=>{__fixture.setClock(__fixture.ctx.today+'T06:00:00+08:00');RosterOpsUI.resetPreloads();await RosterOpsUI.render('Absences by Date',testCtx);});await page.locator('[data-publish-relief]').click();await page.locator('[name="auditReason"]').fill('Reviewed staffing');await page.locator('[data-publish-audit] button.primary').click();await page.waitForFunction(()=>!!__fixture.state.massPublications[__fixture.ctx.today]&&!document.querySelector('[data-publish-audit]'));assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='publish').length),1);
  console.log('PASS 709 Chromium Relief: future Publish visibly disabled; current verified day publishes; open audit confirmation blocked at Singapore midnight without a write.');
  await page.evaluate(async()=>{
   RosterOpsUI.unmount();const periods=[{period:0,startMinutes:450,endMinutes:480}],day={date:__fixture.ctx.today,modelId:'test-baseline',periods,teachers:[{staffId:'alice',name:'Alice',cells:[['EL','Workshop','Room A','']]}],formClasses:[{id:'workshop',name:'Workshop',traditional:false}]};
   window.staplerTest={calls:[],plan:GSISRosterStapler.create(day),revision:1};const f=staplerTest;
   f.data=d=>({date:d,today:testToday(),revision:f.revision,staplerRevision:f.revision,plan:{...structuredClone(f.plan),date:d},canEdit:true,canConfirm:d>=testToday(),published:null,people:[],accessRequests:[],venues:[]});
   f.ctx={today:testToday,initialDate:'2026-10-15',profile:{user:{staffId:'alice',email:'alice@school.test',smc:false}},container:document.querySelector('#content'),status(){},invalidateOperations(){},api:async(route,p)=>{f.calls.push(structuredClone(p));if(p.operation==='saveStapler'){f.plan=structuredClone(p.plan);f.revision++;}return f.data(p.date);}};
   await RosterStaplerUI.render(f.ctx);
  });
  assert.equal(await page.locator('[data-confirm]').isDisabled(),false);assert.equal(await page.locator('[data-save]').isDisabled(),false);await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved'));assert.equal(await page.evaluate(()=>staplerTest.calls.filter(p=>p.operation==='saveStapler').length),1);await page.locator('[data-confirm]').click();await page.waitForFunction(()=>staplerTest.calls.some(p=>p.operation==='confirmStapler'));assert.equal(await page.evaluate(()=>staplerTest.calls.filter(p=>p.operation==='confirmStapler').length),1,'sponsored future plans can be confirmed');
  await page.evaluate(async()=>{RosterStaplerUI.unmount();staplerTest.ctx.initialDate=__fixture.ctx.today;await RosterStaplerUI.render(staplerTest.ctx);});assert.equal(await page.locator('[data-confirm]').isDisabled(),false);await page.evaluate(()=>{__fixture.setClock('2026-10-14T16:00:01Z');document.querySelector('[data-confirm]').onclick();});assert.equal(await page.evaluate(()=>staplerTest.calls.filter(p=>p.operation==='confirmStapler').length),1);assert.equal(await page.locator('[data-confirm]').isDisabled(),true);assert.match(await page.locator('[data-stapler-message]').innerText(),/Past plans are read only/);
  await page.evaluate(async()=>{__fixture.setClock(__fixture.ctx.today+'T06:00:00+08:00');RosterStaplerUI.unmount();await RosterStaplerUI.render(staplerTest.ctx);});await page.locator('[data-confirm]').click();await page.waitForFunction(()=>staplerTest.calls.filter(p=>p.operation==='confirmStapler').length===2);assert.equal(await page.evaluate(()=>staplerTest.calls.filter(p=>['publishStapler','publish'].includes(p.operation)).length),0);
  console.log('PASS 709 Chromium Stapler: sponsored planner saves and confirms a future plan; past-plan Confirm blocked at Singapore midnight without a write; no daily publication from Confirm.');assert.deepEqual(errors,[]);console.log('PASS 709 Chromium publication controls: no browser errors; all network requests served locally.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
