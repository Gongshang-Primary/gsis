'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1300,height:950}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<nav><button id="other">Other function</button></nav><main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+name,'utf8')});
  for(const name of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(name,'utf8')});
  await page.evaluate(()=>{
   window.__calls=[];window.__held=[];window.__hold=true;window.__fail=false;
   window.__data=date=>({date,today:'2026-10-20',revision:5,allocationRevision:3,canPublish:true,allowAdvancePublishing:true,publishedAt:'2026-10-20T12:00:00Z',publishedRevision:2,pendingDraft:true,user:{staffId:'bob',smc:true,admin:true},people:[],teachers:[{staffId:'bob',name:'Bob Colleague',changed:true,rows:[{period:2,kind:'relief',subject:'EL',className:'4A',venue:'C1-01',absentId:'alice',absentName:'Alice Teacher'}]}]});
   window.__ctx={profile:{revision:1,user:{staffId:'bob',email:'bob@test.invalid',smc:true,admin:true}},today:()=> '2026-10-20',container:document.getElementById('content'),status(){},api:async(route,p)=>{
    __calls.push(structuredClone(p));if(window.__deny&&p.operation==='dailyNotify'){__denyCalls++;if(__denyCalls===1)RosterOpsUI.invalidateDates();throw Object.assign(Error('Access no longer allowed'),{status:403});}if(__hold)await new Promise((resolve,reject)=>__held.push({p,resolve,reject}));if(__fail)throw Object.assign(Error('Temporary test failure'),{status:503});return {...__data(p.date),...(p.operation==='notifyDaily'?{notificationsQueued:1}:{})};
   }};
   window.__render=date=>RosterOpsUI.render('Daily Notify',{...__ctx,initialDate:date});
   window.__loading=__render('2026-10-21');
  });
  await page.waitForFunction(()=>__held.length===1);
  assert.equal(await page.locator('dialog.ops-progress').count(),0,'initial Daily Notify read must not open a blocking overlay');
  assert.equal(await page.locator('[data-ops-checked] .ops-spinner').count(),1,'initial read has inline spinner');
  assert.match(await page.locator('[data-ops-checked]').textContent(),/Loading notification records/);
  assert.equal(await page.locator('#other').isEnabled(),true);await page.locator('#other').click();
  assert.equal(await page.locator('[data-ops-date]').isEnabled(),true);
  await page.locator('[data-ops-date]').fill('2026-10-22');await page.locator('[data-ops-date]').dispatchEvent('change');await page.waitForFunction(()=>__held.length===2);
  await page.evaluate(()=>{__hold=false;__held[1].resolve();});await page.waitForFunction(()=>document.querySelector('[data-notify-all]')&&!document.querySelector('[data-ops-checked] .ops-spinner'));
  assert.equal(await page.locator('[data-notify-all]').isEnabled(),true,'published future date immediately enables all notices');
  assert.equal(await page.locator('[data-notify-teacher="bob"]').isEnabled(),true,'published future date immediately enables individual notices');
  assert.equal(await page.locator('[data-publish-relief][data-notify-mode="none"]').isEnabled(),true,'future publication is a separate visibility action');assert.equal(await page.locator('[data-publish-relief][data-notify-mode="all"]').count(),0,'publication never implicitly sends notifications');
  await page.evaluate(()=>__held[0].resolve());await page.evaluate(()=>__loading);
  assert.equal(await page.locator('[data-ops-date]').inputValue(),'2026-10-22','late earlier date response must not replace active date');
  await page.locator('[data-notify-teacher="bob"]').click();await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Notifications queued'));
  assert.deepEqual(await page.evaluate(()=>{const p=__calls.find(p=>p.operation==='notifyDaily');return [p.date,p.staffId,p.expectedPublicationRevision];}),['2026-10-22','bob',2]);assert.equal(await page.evaluate(()=>__calls.filter(p=>p.operation==='publish').length),0,'sending a recipient notification does not publish the day');
  await page.evaluate(()=>{__hold=true;});await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>__held.length===3);
  assert.equal(await page.locator('[data-ops-checked] .ops-spinner').count(),1);assert.equal(await page.locator('dialog.ops-progress').count(),0);
  const checked=await page.locator('[data-ops-checked]').textContent();assert.equal(await page.locator('[data-ops-body]').evaluate(e=>e.inert),false,'refresh keeps published summaries interactive');
  await page.locator('[data-notify-tab="absent"]').click();assert.equal(await page.locator('[data-notify-teacher="alice"]').isDisabled(),true,'absence group without published recipient remains disabled');
  await page.evaluate(()=>__held[2].reject(Object.assign(Error('Temporary test failure'),{status:503})));await page.locator('[data-retry-records]').waitFor();
  assert.equal(await page.locator('[data-ops-checked] .ops-spinner').count(),0);assert.match(await page.locator('[data-ops-checked]').textContent(),/Could not refresh/);assert.match(await page.locator('[data-ops-checked]').textContent(),new RegExp(checked.split('Loading')[0].trim()));
  await page.evaluate(()=>__hold=false);await page.locator('[data-retry-records]').click();await page.waitForFunction(()=>!document.querySelector('[data-retry-records]'));
  await page.locator('[data-notify-tab="relief"]').click();await page.evaluate(()=>window.__originalCard=document.querySelector('[data-notify-teacher="bob"]').closest('article'));
  const readsBefore=await page.evaluate(()=>__calls.length);
  await page.locator('[data-notify-tab="absent"]').click();await page.locator('[data-notify-tab="relief"]').click();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-notify-teacher="bob"]').closest('article')===__originalCard),true,'tab switching reuses existing card DOM');assert.equal(await page.evaluate(()=>__calls.length),readsBefore,'tab switching remains entirely local');
  await page.locator('[data-notify-search]').fill('ALICE');assert.equal(await page.locator('[data-notify-teacher="bob"]').isVisible(),false);await page.locator('[data-notify-tab="absent"]').click();assert.equal(await page.locator('[data-notify-teacher="alice"]').isVisible(),true,'local search applies to cached panels');
  await page.evaluate(()=>{__hold=true;});await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>__held.length===4);
  await page.evaluate(()=>{RosterOpsUI.invalidateDates('2026-10-22');__held[3].resolve();});await page.waitForFunction(()=>__held.length===5);
  assert.equal(await page.locator('[data-ops-checked] .ops-spinner').count(),1,'invalidation during read must keep checking a fresh response');
  await page.evaluate(()=>{__hold=false;__held[4].resolve();});await page.waitForFunction(()=>!document.querySelector('[data-ops-checked] .ops-spinner'));
  const cache=await page.evaluate(async()=>{
   RosterOpsUI.resetPreloads();const base=__calls.length;for(let day=1;day<=12;day++)await __render('2026-11-'+String(day).padStart(2,'0'));const filled=__calls.length;await __render('2026-11-01');const revisited=__calls.length;RosterOpsUI.invalidateDates('2026-11-01');await __render('2026-11-01');const invalidated=__calls.length;
   __ctx.profile={...__ctx.profile,user:{...__ctx.profile.user,email:'another@test.invalid'}};await __render('2026-11-01');const ownerChanged=__calls.length;__ctx.profile={...__ctx.profile,user:{...__ctx.profile.user,admin:false}};await __render('2026-11-01');const permissionChanged=__calls.length;RosterOpsUI.resetPreloads();await __render('2026-11-01');return {fill:filled-base,revisit:revisited-filled,invalidate:invalidated-revisited,owner:ownerChanged-invalidated,permission:permissionChanged-ownerChanged,reset:__calls.length-permissionChanged};
  });assert.deepEqual(cache,{fill:12,revisit:0,invalidate:1,owner:1,permission:1,reset:1},'bounded RAM cache retains date views but respects invalidation and identity');
  const expired=await page.evaluate(async()=>{const before=__calls.length,now=Date.now;Date.now=()=>now()+61000;try{await __render('2026-11-01');return __calls.length-before;}finally{Date.now=now;}});assert.equal(expired,1,'RAM cache freshness remains 60 seconds');
  await page.evaluate(async()=>{__fail=true;await __render('2026-11-02');});await page.locator('[data-retry-records]').waitFor();assert.equal(await page.locator('dialog.ops-progress').count(),0);assert.equal(await page.locator('[data-ops-date]').isEnabled(),true);
  await page.evaluate(()=>__fail=false);await page.locator('[data-retry-records]').click();await page.waitForFunction(()=>!document.querySelector('[data-retry-records]'));assert.equal(await page.locator('[data-ops-message]').textContent(),'','successful retry clears the prior read failure');
  await page.evaluate(()=>{__denyCalls=0;__deny=true;});
  await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Access no longer allowed')&&!document.querySelector('[data-ops-checked] .ops-spinner'));
  assert.equal(await page.evaluate(()=>__denyCalls),1,'authorization denial must not retry after the shell invalidates records');assert.equal(await page.locator('[data-notify-teacher]').count(),0,'authorization denial removes previously cached staff cards');assert.equal(await page.locator('[data-notify-all]').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS inline initial/refresh spinner, usable navigation, date-race protection, inline retry, future notification eligibility and cached summary tabs');
 }catch(e){console.error('Browser errors',errors);console.error(await page.evaluate(()=>({calls:__calls,held:__held.length,body:document.body.innerHTML.slice(0,2000)})));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
