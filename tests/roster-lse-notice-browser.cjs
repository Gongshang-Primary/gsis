'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),fixture=require('./roster701-fixture.cjs');
(async()=>{
 const f=fixture();f.ctx.now=Date.parse(f.date+'T11:16:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=676;f.ctx.lseNoticeEnabled=true;f.state.smcDutyRoster=[];f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'charlie',typeId:'lse',periods:[10,11]});
 const data=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date});assert.equal(data.lseNotices.length,1);
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));await page.goto('https://roster.test/');
  for(const p of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(p,'utf8')});
  await page.evaluate(async data=>{window.currentData=data;await RosterOpsUI.render('Daily Notify',{initialDate:data.date,today:()=>data.date,profile:{user:{email:'synthetic@school.test',smc:true,admin:true}},container:document.querySelector('main'),status(){},api:async()=>structuredClone(window.currentData)});},data);
  assert.match(await page.locator('[data-lse-notices]').innerText(),/Charlie.*No duty SMC/s);assert.equal(await page.locator('[data-lse-notices] button').count(),0,'notice is information, not a retry action');
  await page.evaluate(()=>currentData.lseNotices[0].reason='LSE template is disabled or unavailable.');await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-lse-notices]').textContent.includes('template is disabled'));assert.deepEqual(errors,[]);
  console.log('PASS Daily Notify shows no-duty and disabled LSE outcomes and refreshes them without a retry action');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
