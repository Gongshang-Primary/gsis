'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const root=path.resolve(__dirname,'..'),h=makeHarness(),snapshot=h.call('bootstrap',{year:2026});
let source=fs.readFileSync(path.join(root,'calendar-update/public/app.js'),'utf8');snapshot.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];
source=source.replace(/\}\)\(\);\s*$/,`window.pushCalendar={state,setPage};})();`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),counts={bootstrap:0,jobs:0,delta:0},errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.calendarSockets=[];window.WebSocket=class{constructor(url){this.url=url;this.readyState=1;window.calendarSockets.push(this);}close(){this.readyState=3;}message(data){this.onmessage({data:JSON.stringify(data)});}};});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='push-calendar.synthetic.test')return route.fulfill({body:''});
  if(url.pathname==='/api/client-config')return route.fulfill({json:{ok:true,calendarJobsEnabled:true,calendarChangePushEnabled:true,googleClientId:''}});
  if(url.pathname==='/api/bootstrap'){counts.bootstrap++;return route.fulfill({json:{ok:true,result:snapshot}});}
  if(url.pathname==='/api/calendar-jobs'){counts.jobs++;return route.fulfill({json:{ok:true,result:{jobs:[]}}});}
  if(url.pathname==='/api/calendar-changes/delta'){
   counts.delta++;const metadata={...snapshot};delete metadata.events;return route.fulfill({json:{ok:true,result:{year:2026,events:[{...snapshot.events[0],StaffTitle:'Pushed change',_revision:'new-edit',_changeRevision:'new-live'}],removed:[],snapshot:metadata}}});
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1),local=path.join(root,'calendar-update/public',file);
  if(file==='app.js')return route.fulfill({contentType:'text/javascript',body:source});
  if(fs.existsSync(local))return route.fulfill({path:local});return route.fulfill({status:404});
 });
 try{
  await page.goto('https://push-calendar.synthetic.test/');await page.locator('#appView').waitFor({state:'visible'});await page.evaluate(()=>window.pushCalendar.setPage('events'));
  await page.waitForFunction(()=>window.calendarSockets.length===1);
  await page.evaluate(()=>{const app=window.pushCalendar,actor=app.state.data.actor;window.pushAccess={userAlias:actor.userAlias,isAdmin:actor.isAdmin,isParentPublisher:actor.isParentPublisher};window.calendarSockets[0].message({type:'changes',cursor:0,entries:[],snapshotRequired:false,access:window.pushAccess});window.pushGrid=document.querySelector('.cal-grid');});
  await page.waitForTimeout(300);const baseline={...counts};
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(16000);assert.deepEqual(counts,baseline,'Idle/focus push mode must not perform the previous 15-second job poll or focus bootstrap');
  await page.evaluate(()=>{window.calendarSockets[0].message({type:'changes',cursor:1,entries:[{kind:'invalidate',cursor:1}],access:window.pushAccess});window.calendarSockets[0].message({type:'changes',cursor:2,entries:[{kind:'invalidate',cursor:2}],access:window.pushAccess});});
  await page.waitForFunction(()=>window.pushCalendar.state.calendarChangeState.cursor===2);assert.equal(counts.delta,1);assert.equal(counts.bootstrap,baseline.bootstrap);assert.equal(counts.jobs,baseline.jobs);assert.equal(await page.evaluate(()=>window.pushGrid===document.querySelector('.cal-grid')),true);assert.match(await page.locator('[data-event-id="E1"]').first().textContent(),/Pushed change/);assert.deepEqual(errors,[]);
  console.log('PASS Calendar push Chromium: 16-second idle/focus with zero data/status requests, one coalesced delta, stable grid and no full bootstrap');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
