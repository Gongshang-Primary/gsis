'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {makeHarness}=require('../calendar/backend_harness.cjs');
const root=path.resolve(__dirname,'../..'),h=makeHarness(),data=h.call('bootstrap',{year:2026}),jobs=[];
data.venues=[{id:'hall',unit:'A1-01',name:'School Hall',aliases:['assembly space']},...Array.from({length:5},(_,i)=>({id:'room-'+i,unit:'B2-0'+i,name:'Long school venue '+i,aliases:[]}))];data.venueSource={status:'ready'};
let source=fs.readFileSync(path.join(root,'calendar-update/public/app.js'),'utf8');
data.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];
source=source.replace(/\}\)\(\);\s*$/,`window.calendarSynthetic={state,openEventModal,loadCalendarJobs};})();`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='calendar.synthetic.test')return route.fulfill({contentType:'text/javascript',body:''});
  if(url.pathname==='/api/client-config')return route.fulfill({json:{ok:true,calendarJobsEnabled:true,googleClientId:''}});
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:{ok:true,result:data}});
  if(url.pathname==='/api/calendar-jobs'){
   if(route.request().method()==='GET')return route.fulfill({json:{ok:true,result:{jobs}}});
   const input=route.request().postDataJSON(),job={jobId:input.payload.operationId,action:input.action,payload:input.payload,state:'QUEUED',blocked:true,attemptOperationId:input.payload.operationId,attempts:0,checks:0};jobs.push(job);
   return route.fulfill({status:202,json:{ok:true,result:job}});
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1),local=path.join(root,'calendar-update/public',file);
  if(file==='app.js')return route.fulfill({contentType:'text/javascript',body:source});
  if(fs.existsSync(local))return route.fulfill({path:local});
  return route.fulfill({status:404,body:'Synthetic missing route'});
 });
 await page.goto('https://calendar.synthetic.test/');await page.locator('#appView').waitFor({state:'visible'});
 await page.evaluate(()=>window.calendarSynthetic.openEventModal(window.calendarSynthetic.state.data.events.find(e=>e.EventID==='E1')));
 await page.locator('[name=StaffTitle]').fill('Synthetic durable proposal');await page.locator('#eventSaveBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#eventForm'));
 assert.equal(jobs.length,1);await page.locator('#dirtyPill button').click();await page.getByRole('region',{name:'Calendar save jobs'}).getByText('Queued',{exact:true}).waitFor();await page.locator('[data-job-close]').click();
 await page.evaluate(()=>window.calendarSynthetic.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'}));
 await page.locator('[name=StaffTitle]').fill('Independent retained draft');await page.locator('#calendarVenueInput').fill('assembly');
 await page.getByRole('option').filter({hasText:'School Hall'}).click();assert.equal(await page.locator('[name=VenueID]').inputValue(),'hall');
 await page.screenshot({path:'/tmp/calendar098j-desktop.png'});
 jobs[0].state='SAVED';jobs[0].blocked=false;jobs[0].result={...data.events.find(e=>e.EventID==='E1'),StaffTitle:'Synthetic durable proposal',_revision:'new-synthetic',LastMutationID:jobs[0].attemptOperationId};
 await page.evaluate(()=>window.calendarSynthetic.loadCalendarJobs());assert.equal(await page.locator('[name=StaffTitle]').inputValue(),'Independent retained draft');
 await page.setViewportSize({width:390,height:844});await page.locator('#calendarVenueInput').fill('School');await page.getByRole('option').filter({hasText:'School Hall'}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'The job panel and venue picker must fit the viewport');
 for(let i=0;i<5;i++){await page.locator('#calendarVenueInput').fill('B2-0'+i);await page.getByRole('option').filter({hasText:'Long school venue '+i}).click();}
 const chips=await page.locator('.calendar-venue-chip').evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right})));
 assert.equal(chips.length,6);assert(new Set(chips.map(c=>Math.round(c.top))).size>1,'Six chips wrap onto multiple phone rows');assert(chips.every(c=>c.left>=0&&c.right<=390),'Every chip stays inside the phone viewport');
 await page.screenshot({path:'/tmp/calendar098j-mobile.png'});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Calendar Chromium: durable capture, next editor, retained draft on saved receipt, venue identity and narrow viewport fit');
})().catch(error=>{console.error(error);process.exit(1);});
