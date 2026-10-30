'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const f of ['roster.css','roster-operations.css','roster-settings.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+f,'utf8')});
  for(const f of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-settings-ui.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(async()=>{
   window.__calls=[];const config=GSISRosterOperations.initial().systemConfig;
   config.subjectFamilies=[{id:'chinese',name:'Chinese',subjects:['CL','HCL','FCL'],reliefRequired:true},{id:'malay',name:'Malay',subjects:['ML','HML','FML'],reliefRequired:true},{id:'tamil',name:'Tamil',subjects:['TL','HTL','FTL'],reliefRequired:false}];config.teachingGroupOverrides=[{groupId:'missing-group',reliefRequired:false}];
   window.__data={revision:1,config,subjects:['MTL','CL','TL','CCE'],consecutiveSubjects:['CCE','CL','MTL','PAL','TL'],periods:[0,1,2,3,4,5],teachingGroups:[{id:'cl1',name:'4CL1',subject:'CL'},{id:'tl1',name:'4TL1',subject:'TL'},{id:'tl2',name:'4TL2',subject:'TL'},{id:'untrusted',name:'<img src=x>',subject:'ML'}]};
   window.__ctx={profile:{user:{staffId:'smc',email:'smc@test.invalid',smc:true,admin:true}},initialDate:'2026-10-21',today:()=> '2026-10-20',container:document.getElementById('content'),status(){},api:async(route,p)=>{__calls.push(structuredClone(p));if(p.operation==='saveSystemConfig'){const {operation,date,requestId,revision,...config}=p;__data.config=config;__data.revision++;}return structuredClone(__data);}};
   await RosterSettingsUI.render('System Config',__ctx);
  });
  assert.equal(await page.locator('[data-family-relief="tamil"]').inputValue(),'false');assert.equal(await page.locator('[data-family-subjects="chinese"]').inputValue(),'CL, HCL, FCL');
  assert.equal(await page.locator('[data-group-family="cl1"]').inputValue(),'');assert.equal(await page.locator('[data-group-relief="tl1"]').inputValue(),'');
  assert.equal(await page.locator('[data-group-exceptions]').evaluate(e=>e.open),true,'a saved exception opens the section');assert.equal(await page.locator('[data-group-summary]').textContent(),'1 saved exception · 5 groups');
  assert.match(await page.locator('[data-teaching-group-row="tl1"]').textContent(),/No Relief Required/);assert.match(await page.locator('[data-teaching-group-row="missing-group"]').textContent(),/not in current Deploy/);assert.equal(await page.locator('[data-subject-business] img').count(),0);
  const calls=await page.evaluate(()=>__calls.length);await page.locator('[data-group-search]').fill('4TL');assert.equal(await page.locator('[data-teaching-group-row]:visible').count(),2);assert.equal(await page.evaluate(()=>__calls.length),calls,'group search is local');
  await page.locator('[data-group-relief="tl1"]').selectOption('true');assert.match(await page.locator('[data-teaching-group-row="tl1"]').textContent(),/Relief Required/);
  await page.locator('[data-config-form] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');
  assert.deepEqual(await page.evaluate(()=>__data.config.teachingGroupOverrides),[{groupId:'missing-group',reliefRequired:false},{groupId:'tl1',reliefRequired:true}]);
  await page.locator('[data-family-subjects="chinese"]').fill('CL, HCL, FCL, CSL');await page.locator('[data-config-cancel]').click();assert.equal(await page.locator('[data-family-subjects="chinese"]').inputValue(),'CL, HCL, FCL');
  await page.locator('[data-group-relief="tl1"]').selectOption('');await page.locator('[data-config-form] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');assert.deepEqual(await page.evaluate(()=>__data.config.teachingGroupOverrides),[{groupId:'missing-group',reliefRequired:false}]);
  await page.locator('[data-add-subject-family]').click();const newName=page.locator('[data-family-name]').last();await newName.fill('Science');await page.locator('[data-family-subjects]').last().fill('SCI, FSCI');await page.locator('[data-config-form] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');assert.equal(await page.evaluate(()=>__data.config.subjectFamilies.at(-1).name),'Science');
  await page.setViewportSize({width:390,height:800});assert.equal(await page.locator('[data-add-subject-family]').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'settings retain document scrolling without pagewide horizontal overflow');
  await page.evaluate(async()=>{RosterSettingsUI.unmount();__ctx.profile.user.admin=false;await RosterSettingsUI.render('System Config',__ctx);});assert.equal(await page.locator('[data-family-subjects="chinese"]').isDisabled(),true);assert.equal(await page.locator('[data-group-relief="tl1"]').isDisabled(),true);assert.equal(await page.locator('[data-add-subject-family]').isDisabled(),true);
  // Teaching group exceptions collapse by default when none are saved; collapsed rows are still saved.
  await page.evaluate(async()=>{RosterSettingsUI.unmount();sessionStorage.clear();__ctx.profile.user.admin=true;__data.config.teachingGroupOverrides=[];await RosterSettingsUI.render('System Config',__ctx);});
  assert.equal(await page.locator('[data-group-exceptions]').evaluate(e=>e.open),false,'no exceptions: collapsed');assert.equal(await page.locator('[data-group-summary]').textContent(),'No saved exceptions · 4 groups');assert.equal(await page.locator('[data-teaching-group-row]').count(),4);
  await page.locator('[data-group-exceptions] summary').click();await page.locator('[data-group-relief="tl1"]').selectOption('true');assert.equal(await page.locator('[data-group-summary]').textContent(),'1 saved exception · 4 groups');
  await page.locator('[data-config-form] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');assert.deepEqual(await page.evaluate(()=>__data.config.teachingGroupOverrides),[{groupId:'tl1',reliefRequired:true}]);
  await page.evaluate(async()=>{RosterSettingsUI.unmount();await RosterSettingsUI.render('System Config',__ctx);});assert.equal(await page.locator('[data-group-exceptions]').evaluate(e=>e.open),true,'open state is remembered this session');
  assert.deepEqual(errors,[]);console.log('PASS collapsible teaching group exceptions; subject family defaults, TG overrides, inherited policy, local search, save/cancel, missingTG retention, responsive layout and SMC readonly');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
