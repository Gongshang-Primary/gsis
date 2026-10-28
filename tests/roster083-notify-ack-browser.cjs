'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const root='roster-update/public/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(root+f,'utf8')});
  for(const f of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js',root+'roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(async()=>{
   window.__calls=[];window.__data={date:'2026-10-21',today:'2026-10-20',revision:5,allocationRevision:3,canPublish:true,canNotify:true,allowAdvancePublishing:true,publishedAt:'2026-10-20T12:00:00Z',publishedRevision:2,user:{staffId:'smc',smc:true,admin:true},people:[],teachers:[{staffId:'bob',name:'Bob Teacher',changed:true,acknowledgement:{id:'n1',status:'pending',acknowledgedAt:null},rows:[{period:3,kind:'restored',subject:'EL',className:'4A',venue:'C1-01'}]},{staffId:'alice',name:'Alice Teacher',changed:true,acknowledgement:{id:'n2',status:'acknowledged',acknowledgedAt:'2026-10-20T13:00:00Z'},rows:[{period:4,kind:'relief',subject:'MTL',className:'4B',venue:'C1-02'}]}]};
   window.__ctx={profile:{revision:1,user:{staffId:'smc',email:'smc@test.invalid',smc:true,admin:true}},initialDate:'2026-10-21',today:()=> '2026-10-20',container:document.getElementById('content'),status(){},api:async(route,p)=>{__calls.push(structuredClone(p));return structuredClone({...__data,...(p.operation==='notifyDaily'?{notificationsQueued:1}:{})});}};
   await RosterOpsUI.render('Daily Notify',__ctx);
  });
  assert.equal(await page.locator('[data-notify-ack="bob"]').textContent(),'Pending','restored timetable still requires acknowledgement');
  assert.equal(await page.locator('[data-notify-ack="alice"]').textContent(),'Acknowledged ✓');
  assert.equal(await page.locator('[data-notify-ack="alice"]').evaluate(e=>e.classList.contains('acknowledged')),true);
  assert.equal(await page.locator('[data-notify-ack="bob"]').evaluate(e=>e.classList.contains('pending')),true);
  await page.locator('[data-notify-teacher="alice"]').click();await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Notifications queued'));
  assert.equal(await page.locator('[data-notify-ack="alice"]').textContent(),'Acknowledged ✓','resending does not clear a server acknowledgement');
  await page.evaluate(()=>{__data.teachers[1].acknowledgement={id:'n3',status:'pending',acknowledgedAt:null};});await page.locator('[data-ops-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-notify-ack="alice"]').textContent==='Pending');
  await page.setViewportSize({width:390,height:800});assert.equal(await page.locator('[data-notify-ack="bob"]').isVisible(),true);assert.equal(await page.locator('[data-notify-teacher="bob"]').isVisible(),true);
  assert.equal(await page.evaluate(()=>__calls.filter(p=>p.operation==='acknowledge').length),0,'SMC view never acknowledges on behalf of a teacher');
  await page.evaluate(async()=>{__data.timetableNotices=[{id:'staff-notice',date:'2026-10-21',publishedAt:'2026-10-20T13:00:00Z',status:'pending',snapshotIds:[],timetable:{date:'2026-10-21',periods:[{period:3,start:'08:30',end:'09:00'}],baseline:{cells:[[],[],[],['EL','4A']]},modified:{cells:[[],[],[],[]]}},publishedInstructions:[{period:3,instructions:'Updated lesson instructions.'}]}];__data.pendingNotices=[];await RosterOpsUI.render('My Relief Duties',__ctx);});
  assert.match(await page.locator('[data-timetable-notice="staff-notice"]').textContent(),/Updated lesson instructions/);assert.equal(await page.locator('[data-timetable-notice="staff-notice"] .ops-daily-overlay').count(),1);
  await page.locator('[data-ack-timetable="staff-notice"]').click();await page.waitForFunction(()=>__calls.some(p=>p.operation==='acknowledge'));
  assert.deepEqual(await page.evaluate(()=>{const p=__calls.find(p=>p.operation==='acknowledge');return [p.date,p.timetableNoticeId,p.snapshotIds];}),['2026-10-21','staff-notice',[]]);
  await page.close();

  const privatePage=await browser.newPage({viewport:{width:390,height:850}});privatePage.setDefaultTimeout(4000);privatePage.on('pageerror',e=>errors.push(e.message));
  let notice={id:'notice1',date:'2026-10-21',publishedAt:'2026-10-20T13:00:00Z',status:'pending',acknowledgedAt:null,snapshotIds:[],publishedInstructions:[{period:3,instructions:'Read both paragraphs.\n\nKeep <script> literal.',customInstructions:'Use https://example.test/lesson',conditionalInstructions:['Leave at 09:00.']}]};const calls=[];let conflict=false,expired=false;
  await privatePage.route('https://private.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/external'){
    const p=route.request().postDataJSON();calls.push(p);assert.equal(route.request().headers().authorization,'Bearer fixture-token');
    if(expired)return route.fulfill({status:401,json:{ok:false,error:'This private link has expired. Ask SMC for a new link.'}});
    if(p.operation==='acknowledge'){
     if(conflict)return route.fulfill({status:409,json:{ok:false,error:'The published timetable changed. Refresh and review it before acknowledging.'}});
     assert.equal(p.timetableNoticeId,notice.id);assert.deepEqual(p.snapshotIds,[]);notice={...notice,status:'acknowledged',acknowledgedAt:'2026-10-20T13:05:00Z'};
    }
    return route.fulfill({json:{ok:true,data:{date:'2026-10-21',duties:[],pendingNotices:[],history:[],timetableNotice:notice}}});
   }
   const name=url.pathname==='/external.html'?'external.html':url.pathname.slice(1);if(['external.html','external.js','external.css'].includes(name))return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(root+name)});return route.fulfill({status:404,body:''});
  });
  await privatePage.goto('https://private.test/external.html#fixture-token');await privatePage.locator('[data-timetable-ack]').waitFor();
  assert.equal(calls.filter(p=>p.operation==='acknowledge').length,0,'opening private link is not acknowledgement');assert.equal(new URL(privatePage.url()).hash,'#fixture-token','private link remains reusable');
  assert.match(await privatePage.locator('#private-notices').textContent(),/Read both paragraphs/);assert.equal(await privatePage.locator('#private-notices script').count(),0);assert.equal(await privatePage.locator('#private-notices a').getAttribute('rel'),'noopener noreferrer');
  await privatePage.locator('[data-timetable-ack]').click();await privatePage.waitForFunction(()=>document.querySelector('[data-timetable-ack-status]')?.textContent.includes('Acknowledged'));
  assert.equal(await privatePage.locator('[data-timetable-ack]').count(),0,'acknowledged notice cannot be submitted again');
  notice={...notice,id:'notice2',status:'pending',acknowledgedAt:null};await privatePage.locator('#refresh').click();await privatePage.locator('[data-timetable-ack]').waitFor();conflict=true;await privatePage.locator('[data-timetable-ack]').click();await privatePage.waitForFunction(()=>document.getElementById('status').textContent.includes('Please review the current timetable'));
  assert.equal(await privatePage.locator('[data-timetable-ack-status]').textContent(),'Pending acknowledgement','conflict never shows false acknowledgement');
  expired=true;await privatePage.locator('#refresh').click();await privatePage.waitForFunction(()=>document.getElementById('status').textContent.includes('expired'));
  assert.equal(await privatePage.locator('[data-timetable-ack]').count(),0,'expiry clears stale acknowledgement controls');assert.equal(await privatePage.locator('#private-notices').count(),0,'expiry clears private record content');
  assert.deepEqual(errors,[]);console.log('PASS Daily Notify acknowledgement badges, refresh/reset, resend retention, explicit public acknowledgement, instruction safety, conflict and expiry');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
