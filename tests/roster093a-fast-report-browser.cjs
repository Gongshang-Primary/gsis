'use strict';
// Real form/domain: cold form paints immediately; explicit period review precedes final submission.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});page.setDefaultTimeout(4000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main>'}));await page.goto('https://roster.test/');
 for(const file of ['roster-update/public/roster.css','roster-update/public/roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{
  const f=__fixture;f.ctx.user.smc=false;f.ctx.user.admin=false;
  f.profile.reportForm={schema:1,revision:0,today:f.ctx.today,minute:480,people:f.ctx.people,types:f.state.types,noReliefSubjects:['PAL']};
  window.reads=[];window.calls=[];window.__render=RosterOpsUI.render('Report Absence',{profile:f.profile,quickAbsence:true,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{
   calls.push(structuredClone(p));if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};if(p.operation==='read')await new Promise((resolve,reject)=>reads.push({resolve,reject,p}));
   const r=await fetch('/'+route,{body:JSON.stringify(p)}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});
   if(p.receiptOnly)return {accepted:true,receiptOnly:true,requestId:p.requestId,savedIds:v.data.savedIds,revision:v.data.revision,date:p.date};
   return v.data;
  }});
 });
 await page.waitForFunction(()=>reads.length===1);assert.equal(await page.locator('[data-absence-form]').count(),1,'authenticated form paints while timetable/report read is held');
 assert.equal(await page.locator('[data-save-absence-now]').count(),0,'removed shortcut cannot bypass the explicit period review');assert.equal(await page.locator('[name=typeId]').isEnabled(),true,'the form remains editable during the held timetable read');assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);
 await page.evaluate(()=>reads[0].resolve());await page.waitForSelector('[data-period="2"]');await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
 await page.locator('[data-select-periods]').click();assert.equal(await page.locator('[data-period][aria-pressed=true]').count(),17,'Select All keeps explicit period and timing selection');await page.locator('[data-log-absence]').click();await page.locator('[data-instructions-na]').click();assert.equal(await page.evaluate(()=>calls.filter(p=>p.operation==='saveAbsence').length),0,'review and no-instructions selection remain local');
 const submit=page.locator('[data-save-instructions]');assert.equal(await submit.innerText(),'Submit absence');const bounds=await submit.boundingBox();assert(bounds.width>=44&&bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=390,'ordinary submit fits a mobile viewport');
 const screenshots=process.env.ROSTER_ABSENCE_SCREENSHOTS;if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:screenshots+'/report-explicit-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:screenshots+'/report-explicit-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});}
 await submit.click();await page.waitForFunction(()=>__fixture.state.absences.length===1);await page.waitForFunction(()=>document.querySelector('[data-ops-message]').dataset.state==='success');
 const state=await page.evaluate(()=>({row:__fixture.state.absences[0],sent:calls.find(p=>p.operation==='saveAbsence')}));
 assert.deepEqual(state.row.coverage,{kind:'fullDay'});assert.equal(state.row.instructionsNA,true);assert.equal(state.row.reliefRequired,true);assert.equal(state.sent.fullDay,true);assert.equal(state.sent.receiptOnly,true);assert.equal(state.sent.intake,true);assert.deepEqual(state.sent.periods,[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
 assert.match(await page.locator('[data-ops-message]').textContent(),/Saved/);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true,'accepted report cannot be duplicated until its details change');
 await page.waitForFunction(()=>reads.length===2);await page.evaluate(()=>reads[1].reject(Error('Network unavailable after commit')));await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');assert.equal(await page.locator('[data-ops-message]').getAttribute('data-state'),'success');assert.match(await page.locator('[data-ops-message]').textContent(),/Saved absence.*could not refresh/,'failed record refresh preserves accepted receipt');assert.equal(await page.evaluate(()=>calls.filter(p=>p.operation==='saveAbsence').length),1);
 assert.deepEqual(errors,[]);console.log('PASS cold editable form before held timetable; explicit Select All, local review and ordinary mobile submit; one save and retained confirmation after optional refresh fails.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
