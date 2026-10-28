'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const f of ['roster.css','roster-operations.css','roster-settings.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+f,'utf8')});
  for(const f of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-settings-ui.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(async()=>{window.__calls=[];window.__data={revision:1,config:GSISRosterOperations.initial().systemConfig,subjects:['PAL','EL'],consecutiveSubjects:['EL','PAL'],periods:[0,1,2,3,4,5],teachingGroups:[]};window.__ctx={profile:{user:{email:'admin@test.invalid',smc:true,admin:true}},today:()=> '2026-10-21',container:document.getElementById('content'),status(){},api:async(route,p)=>{__calls.push(p);if(p.operation==='saveSystemConfig'){const{operation,date,requestId,revision,...config}=p;__data.config=config;__data.revision++;}return structuredClone(__data);}};await RosterSettingsUI.render('System Config',__ctx);});
  await page.locator('[data-consecutive-rules]').scrollIntoViewIfNeeded();assert.equal(await page.locator('[data-consecutive-subject]').inputValue(),'PAL');assert.equal(await page.locator('[data-consecutive-periods]').inputValue(),'3');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile horizontal overflow');
  const calls=await page.evaluate(()=>__calls.length);await page.locator('[data-add-consecutive-rule]').click();await page.locator('[data-consecutive-subject]').last().selectOption('EL');await page.locator('[data-consecutive-periods]').last().fill('2');assert.equal(await page.evaluate(()=>__calls.length),calls);await page.locator('[data-config-form] button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');assert.deepEqual(await page.evaluate(()=>__data.config.consecutiveSubjectRules),[{subject:'PAL',periods:3},{subject:'EL',periods:2}]);
  await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(async()=>{RosterSettingsUI.unmount();__ctx.profile.user.admin=false;await RosterSettingsUI.render('System Config',__ctx);});assert.equal(await page.locator('[data-add-consecutive-rule]').isDisabled(),true);assert.equal(await page.locator('[data-consecutive-periods]').first().isDisabled(),true);assert.deepEqual(errors,[]);
  console.log('PASS consecutive System Config mobile and desktop layout, default PAL3, local input, save and SMC view only');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
