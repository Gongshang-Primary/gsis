'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage();await page.goto('about:blank');await page.setContent('<main><div id="home"></div><div id="duties"></div><button id="other">Other function</button></main>');
  await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster-acknowledgement-ui.js','utf8')});
  await page.evaluate(()=>{
   window.calls=[];window.held=[];window.notice={id:'notice1',date:'2026-10-22',publishedAt:'2026-10-22T00:00:00Z',snapshotIds:[],status:'pending'};window.rev=7;window.fail=false;window.receipt=null;
   window.api=async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='acknowledgementStatus')return {revision:rev,notice:structuredClone(notice)};if(p.operation==='receiptStatus')return receipt||{accepted:false};return new Promise((resolve,reject)=>held.push({p,resolve,reject}));};
   window.mount=(id,fixed=false)=>RosterAcknowledgements.mount(document.getElementById(id),{owner:'verified-user',today:()=>notice.date,api,...(fixed?{notice:structuredClone(notice),revision:rev}:{}),onView(){}});
   window.offHome=mount('home');
  });
  await page.waitForSelector('#home [data-ack-notice="notice1"]');await page.evaluate(()=>{window.offDuties=mount('duties',true);});
  await page.click('#home [data-ack-notice]');assert.equal(await page.locator('#duties [data-ack-notice]').isDisabled(),true,'one shared in-flight action');assert.equal(await page.locator('#other').isEnabled(),true,'other functions remain usable');assert.equal(await page.locator('dialog').count(),0);
  assert.equal(await page.evaluate(()=>calls.filter(p=>p.operation==='acknowledge').length),1);await page.evaluate(()=>held[0].reject(Error('Backend timeout')));await page.waitForFunction(()=>document.querySelector('#home button').textContent==='Retry acknowledgement');
  const original=await page.evaluate(()=>calls.find(p=>p.operation==='acknowledge'));
  await page.evaluate(()=>{receipt={accepted:true,acknowledgementOnly:true,acceptedNoticeId:'notice1',revision:8,notice:{...notice,status:'acknowledged'},acknowledged:{timetableNoticeId:'notice1',snapshotIds:[],acknowledgedAt:'2026-10-22T00:01:02Z'}};});
  await page.click('#duties [data-ack-notice]');await page.waitForFunction(()=>document.querySelector('#home').textContent.includes('Acknowledged'));
  assert.equal(await page.evaluate(()=>calls.filter(p=>p.operation==='acknowledge').length),1,'durable receipt ends retry without resending');assert.deepEqual(await page.evaluate(()=>calls.find(p=>p.operation==='receiptStatus').command),original);
  assert.match(await page.locator('#home').textContent(),/08:01:02 SGT/);
  await page.evaluate(async()=>{rev=9;notice={...notice,id:'notice2',status:'pending'};await RosterAcknowledgements.refresh('verified-user',notice.date);});
  assert.equal(await page.locator('#home [data-ack-notice="notice2"]').count(),1,'new publication requires separate acknowledgement');assert.equal(await page.locator('#duties [data-ack-notice]').count(),0,'old visible timetable cannot acknowledge new publication');
  await page.click('#home [data-ack-notice]');await page.evaluate(async()=>{rev=11;notice={...notice,id:'notice3'};await RosterAcknowledgements.refresh('verified-user',notice.date);held[1].resolve({acknowledgementOnly:true,revision:10,notice:{id:'notice2',date:notice.date,status:'acknowledged'},acknowledged:{timetableNoticeId:'notice2',snapshotIds:[],acknowledgedAt:'2026-10-22T00:02:00Z'}});});
  await page.waitForFunction(()=>document.querySelector('#home [data-ack-notice="notice3"]')?.disabled===false);assert.match(await page.locator('#home').textContent(),/Acknowledgement required/,'older acknowledgement response does not confirm new notice');
  await page.click('#home [data-ack-notice="notice3"]');await page.evaluate(()=>held[2].reject(Error('Timeout before confirmation')));await page.waitForFunction(()=>document.querySelector('#home button').textContent==='Retry acknowledgement');
  const prior=await page.evaluate(()=>calls.filter(p=>p.operation==='acknowledge').at(-1));
  await page.evaluate(async()=>{rev=13;notice={...notice,id:'notice4'};await RosterAcknowledgements.refresh('verified-user',notice.date);receipt={accepted:true,acknowledgementOnly:true,revision:12,notice:{...notice,id:'notice3',status:'acknowledged'},acknowledged:{timetableNoticeId:'notice3',snapshotIds:[],acknowledgedAt:'2026-10-22T00:03:00Z'}};});
  assert.equal(await page.locator('#home [data-ack-notice="notice3"]').textContent(),'Check earlier acknowledgement');
  const beforeRecovery=await page.evaluate(()=>calls.filter(p=>p.operation==='acknowledge').length);await page.click('#home [data-ack-notice="notice3"]');await page.waitForSelector('#home [data-ack-notice="notice4"]');
  assert.deepEqual(await page.evaluate(()=>calls.filter(p=>p.operation==='receiptStatus').at(-1).command),prior,'recovery checks the exact original notice/request despite newer publication');
  assert.equal(await page.evaluate(()=>calls.filter(p=>p.operation==='acknowledge').length),beforeRecovery,'checking the earlier receipt never sends the new acknowledgement');
  assert.match(await page.locator('#home').textContent(),/Acknowledgement required/);assert.equal(await page.locator('#home [data-ack-notice="notice4"]').isEnabled(),true);
  await page.evaluate(()=>{offHome();offHome();offDuties();RosterAcknowledgements.clear();document.getElementById('home').replaceChildren();RosterAcknowledgements.mount(document.getElementById('home'),{owner:'other',today:()=>notice.date,api:async()=>({revision:0,notice:null})});});
  await page.waitForFunction(()=>document.getElementById('home').hidden);console.log('PASS v087 shared acknowledgement: duplicate clicks, nonblocking pending, receipt retry, publication races, exact notice, SGT time, owner cleanup');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
