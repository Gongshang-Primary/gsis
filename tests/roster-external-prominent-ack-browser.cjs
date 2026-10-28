'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const root='roster-update/public/',origin='https://private.test',copy=value=>structuredClone(value);
const notice={id:'notice-one',date:'2026-10-21',status:'pending',snapshotIds:['snapshot-one'],publishedInstructions:[]};
const record=()=>({date:notice.date,name:'Fixture Teacher',linkExpiresAt:Date.now()+7*86400000,duties:[],arrangements:[],changes:[],pendingNotices:[],history:[],timetableNotice:copy(notice),timetable:{daily:{name:'Fixture Teacher',date:notice.date,periods:[{period:0,start:'07:00',end:'07:30'}],baseline:{cells:[['EL','3A','','']]},modified:{cells:[['Math','3A','','']]}}}});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  // A delayed stylesheet must not delay the first authenticated data request.
  const early=await browser.newPage(),earlyCalls=[],errors=[];let releaseCss;
  early.on('pageerror',error=>errors.push(error.message));
  await early.route(origin+'/**',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(url.hash,'');assert.equal(req.headers().referer,undefined);
   if(url.pathname==='/api/external'){earlyCalls.push(req.postDataJSON());assert.equal(req.headers().authorization,'Bearer fixture-token');return route.fulfill({json:{ok:true,data:record()}});}
   if(url.pathname==='/external.css')await new Promise(resolve=>{releaseCss=resolve;});
   const name=url.pathname.slice(1);return route.fulfill(['external.html','external.js','external.css'].includes(name)?{body:fs.readFileSync(root+name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}:{status:404,body:''});
  });
  try{const first=early.waitForRequest(req=>req.url()===origin+'/api/external',{timeout:2000});await early.goto(origin+'/external.html#fixture-token',{waitUntil:'commit'});await (await first).response();assert.equal(earlyCalls.length,1,'startup begins one authenticated read while CSS is pending');}
  finally{releaseCss?.();}
  await early.locator('[data-timetable-ack]').waitFor();assert.equal(earlyCalls.length,1,'DOM startup consumes the early read without duplication');await early.close();
  console.log('PASS external data request starts before delayed CSS and is consumed exactly once');

  for(const failure of ['network',401,403]){
   const page=await browser.newPage();page.setDefaultTimeout(4000);page.on('pageerror',error=>errors.push(error.message));let releaseDom;
   await page.addInitScript(()=>{window.__unhandled=[];addEventListener('unhandledrejection',event=>__unhandled.push(String(event.reason)));});
   await page.route(origin+'/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/external')return failure==='network'?route.abort():route.fulfill({status:failure,json:{ok:false,error:'This private link is expired or not allowed.'}});
    if(url.pathname==='/hold-dom.js'){await new Promise(resolve=>{releaseDom=resolve;});return route.fulfill({contentType:'text/javascript',body:''});}
    const name=url.pathname.slice(1);if(!['external.html','external.js','external.css'].includes(name))return route.fulfill({status:404,body:''});
    const body=fs.readFileSync(root+name,'utf8');return route.fulfill({body:name==='external.html'?body.replace('</head>','<script src="/hold-dom.js"></script></head>'):body,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});
   });
   try{const first=page.waitForRequest(req=>req.url()===origin+'/api/external');await page.goto(origin+'/external.html#fixture-token',{waitUntil:'commit'});await (await first).response();assert.equal(await page.locator('#status').count(),0,'read settles before the page body exists');}
   finally{releaseDom?.();}
   await page.waitForFunction(()=>document.getElementById('status')?.classList.contains('error'));assert.deepEqual(await page.evaluate(()=>__unhandled),[]);assert.equal(await page.locator('#private-timetable').count(),0);assert.equal(await page.locator('[data-timetable-ack]').count(),0);await page.close();
  }
  console.log('PASS network and authorization failures before DOM readiness are handled without private rendering or unhandled rejection');

  for(const width of [1280,390,320]){
   const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(4000);page.on('pageerror',error=>errors.push(error.message));
   let data=record(),mode='hold',releaseAck,denied=0;const calls=[];
   await page.route(origin+'/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname!=='/api/external'){const name=url.pathname.slice(1);return route.fulfill(['external.html','external.js','external.css'].includes(name)?{body:fs.readFileSync(root+name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}:{status:404,body:''});}
    const input=req.postDataJSON();calls.push(input);assert.equal(req.headers().authorization,'Bearer fixture-token');
    if(denied)return route.fulfill({status:denied,json:{ok:false,error:'This private link has expired or is not allowed.'}});
    if(input.operation==='view')return route.fulfill({json:{ok:true,data:copy(data)}});
    assert.equal(input.operation,'acknowledge');assert.equal(input.timetableNoticeId,data.timetableNotice.id);
    if(mode==='hold')await new Promise(resolve=>{releaseAck=resolve;});
    if(mode==='conflict'){data.timetableNotice={...notice,id:'notice-new'};return route.fulfill({status:409,json:{ok:false,error:'The timetable changed.'}});}
    if(mode==='unconfirmed')return route.fulfill({json:{ok:true,data:{acknowledged:{timetableNoticeId:'wrong-notice',snapshotIds:[],acknowledgedAt:'2026-10-21T00:20:00Z'}}}});
    if(mode==='missing')return route.fulfill({json:{ok:true,data:{}}});
    if(mode==='failed')return route.fulfill({status:503,json:{ok:false,error:'The save could not be confirmed. Retry.'}});
    data.timetableNotice={...data.timetableNotice,status:'acknowledged',acknowledgedAt:'2026-10-21T00:20:00Z'};
    return route.fulfill({json:{ok:true,data:{acknowledged:{timetableNoticeId:input.timetableNoticeId,snapshotIds:[],acknowledgedAt:data.timetableNotice.acknowledgedAt}}}});
   });
   await page.goto(origin+'/external.html?action=ack#fixture-token');const button=page.locator('[data-timetable-ack]');await button.waitFor();
   const box=await button.boundingBox(),timetable=await page.locator('#private-timetable').boundingBox();assert(box.y<timetable.y&&box.y+box.height<=500,'action is prominent in the first screen '+JSON.stringify({width,box,timetable}));assert(box.height>=60,'primary action has a large touch target');
   assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(128, 0, 32)');assert.equal(await button.evaluate(el=>document.activeElement===el),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'small screens do not overflow');
   await button.click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Saving'));
   assert.equal(await button.isDisabled(),true);assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(128, 0, 32)','pending network is never green');
   releaseAck();const done=page.locator('[data-timetable-ack-confirmed]');await done.waitFor();assert.equal(await done.isDisabled(),true);assert.equal(await done.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 107, 65)');assert.equal(calls.length,2,'valid receipt needs no second view');
   data=record();mode='unconfirmed';await page.locator('#refresh').click();await button.waitFor();await button.click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('could not be confirmed'));
   assert.equal(await done.count(),0);assert.equal(await button.isEnabled(),true);assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(128, 0, 32)');
   mode='missing';await button.click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('could not be confirmed'));assert.equal(await done.count(),0);assert.equal(await button.isEnabled(),true);
   mode='failed';await button.click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Retry'));assert.equal(await button.isEnabled(),true);assert.equal(await done.count(),0);
   mode='conflict';await button.click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Please review'));assert.equal(await done.count(),0);assert.equal(await button.isEnabled(),true);
   denied=401;await page.locator('#refresh').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('expired'));assert.equal(await page.locator('#private-actions button').count(),0);assert.equal(await page.locator('#private-timetable').count(),0);
   await page.close();
  }
  const legacy=await browser.newPage();legacy.setDefaultTimeout(4000);legacy.on('pageerror',error=>errors.push(error.message));let legacyDone=false,newDuty=false;
  await legacy.route(origin+'/**',async route=>{
   const url=new URL(route.request().url());if(url.pathname!=='/api/external'){const name=url.pathname.slice(1);return route.fulfill(['external.html','external.js','external.css'].includes(name)?{body:fs.readFileSync(root+name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}:{status:404,body:''});}
   const input=route.request().postDataJSON();if(input.operation==='acknowledge'){assert.deepEqual(input.snapshotIds,['snapshot-one']);legacyDone=true;return route.fulfill({json:{ok:true,data:{acknowledged:{snapshotIds:input.snapshotIds,acknowledgedAt:'2026-10-21T00:20:00Z'}}}});}
   const snapshot={id:'snapshot-one',period:0,kind:'new',assignment:{className:'3A'},...(legacyDone?{acknowledgedAt:'2026-10-21T00:20:00Z'}:{})},data={...record(),timetableNotice:null,pendingNotices:legacyDone?newDuty?[{...snapshot,id:'snapshot-two',acknowledgedAt:null}]:[]:[snapshot],history:[snapshot]};
   return route.fulfill({json:{ok:true,data}});
  });
  await legacy.goto(origin+'/external.html#fixture-token');await legacy.getByRole('button',{name:'Acknowledge All',exact:true}).click();await legacy.locator('[data-timetable-ack-confirmed]').waitFor();
  await legacy.locator('#refresh').click();await legacy.waitForFunction(()=>!document.getElementById('refresh').disabled);assert.equal(await legacy.locator('[data-timetable-ack-confirmed]').count(),1,'server-acknowledged snapshot history retains the done action after refresh');
  newDuty=true;await legacy.locator('#refresh').click();await legacy.getByRole('button',{name:'Acknowledge All',exact:true}).waitFor();assert.equal(await legacy.locator('[data-timetable-ack-confirmed]').count(),0,'a new pending snapshot restores the maroon action');await legacy.close();
  assert.deepEqual(errors,[]);console.log('PASS prominent maroon pending/green confirmed actions, phone bounds, exact receipts, legacy refresh, retry, conflicts and expiry');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
