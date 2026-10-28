'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://fixture.test/');
  for(const file of ['roster.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const rows=[{date:'2026-10-23',name:'',status:'Confirmed',canListConfirmed:true,canViewConfirmed:false,previewUnavailable:true,mayEdit:false},{date:'2026-10-21',name:'Confirmed suspension',status:'Confirmed',canListConfirmed:true,canViewConfirmed:true,confirmedRevision:3,mayEdit:false},{date:'2026-10-22',name:'',status:'Confirmed',canListConfirmed:true,canViewConfirmed:false,previewUnavailable:true,mayEdit:false}];
   window.review={calls:[],response:{confirmedAccess:'available',dates:rows,sponsors:[],sponsorships:[]}};
   review.ctx={container:document.getElementById('content'),today:()=> '2026-10-21',profile:{user:{staffId:'teacher',email:'teacher@example.test'}},status(){},api:async(_,input)=>{review.calls.push(input.operation);return review.response;}};
   await RosterStaplerUI.render(review.ctx);
  });
  const section=page.locator('[data-confirmed-suspensions]');
  assert.deepEqual(await section.locator('tbody tr td:first-child').allTextContents(),['2026-10-21','2026-10-22','2026-10-23']);
  assert.equal(await section.locator('[data-open-date]').count(),1);assert.equal(await section.locator('[data-preview-unavailable]').count(),2);
  assert.match(await section.innerText(),/To view the confirmed suspended timetable, select Timetable from the main screen\./);
  assert.equal(await page.locator('[data-planning-access]').getAttribute('open'),null);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'date list fits '+width+'px');
   const button=section.locator('[data-open-date]');await page.locator('[data-refresh-dates]').focus();await page.keyboard.press('Tab');assert.equal(await button.evaluate(el=>el===document.activeElement),true);assert.equal(await button.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
   const bounds=await button.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width,'confirmed action fits the viewport');
  }
  await page.evaluate(()=>{review.response={};});await page.locator('[data-refresh-dates]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('incomplete'));
  assert.match(await page.locator('[data-stapler-message]').innerText(),/last checked list/);assert.equal(await section.locator('tbody tr').count(),3);
  await page.evaluate(async()=>{RosterStaplerUI.reset();review.response={confirmedAccess:'unmapped',dates:[],sponsors:[],sponsorships:[]};await RosterStaplerUI.render(review.ctx);});
  assert.match(await section.innerText(),/not linked to an active teacher/);assert.doesNotMatch(await section.innerText(),/No confirmed suspensions/);
  assert.deepEqual(await page.evaluate(()=>[...new Set(review.calls)]),['staplerDates']);assert.deepEqual(errors,[]);
  console.log('PASS teacher date metadata on desktop/mobile, safe preview controls, keyboard focus, retained error state and account guidance; no writes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
