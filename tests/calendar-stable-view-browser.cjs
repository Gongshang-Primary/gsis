'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const root=path.resolve(__dirname,'..'),h=makeHarness();
let snapshot=h.call('bootstrap',{year:2026}),reads=0,held=null,holdNext=false,serverJobs=[];
let source=fs.readFileSync(path.join(root,'calendar-update/public/app.js'),'utf8');
snapshot.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];
source=source.replace(/\}\)\(\);\s*$/,`window.stableCalendar={state,setPage,loadBootstrap,requestRefresh,openEventModal,closeModal,upsertLocalEvent,renderDirtyPill,renderCalendarJobs,captureEventViewPosition,loadCalendarJobs};})();`);
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='stable-calendar.synthetic.test')return route.fulfill({contentType:'text/javascript',body:''});
  if(url.pathname==='/api/client-config')return route.fulfill({json:{ok:true,calendarJobsEnabled:false,googleClientId:''}});
  if(url.pathname==='/api/bootstrap'){
   reads++;const result=clone(snapshot);
   if(holdNext){holdNext=false;await new Promise(resolve=>{held=resolve;});}
   return route.fulfill({json:{ok:true,result}});
  }
  if(url.pathname==='/api/calendar-jobs')return route.fulfill({json:{ok:true,result:{jobs:serverJobs}}});
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1),local=path.join(root,'calendar-update/public',file);
  if(file==='app.js')return route.fulfill({contentType:'text/javascript',body:source});
  if(fs.existsSync(local))return route.fulfill({path:local});
  return route.fulfill({status:404,body:'Not in synthetic fixture'});
 });
 try{
  await page.goto('https://stable-calendar.synthetic.test/');await page.locator('#appView').waitFor({state:'visible'});
  await page.evaluate(()=>window.stableCalendar.setPage('events'));
  await page.locator('#dateSearch').fill('09/2026');await page.locator('#dateSearch').press('Enter');
  await page.evaluate(()=>{
   const a=window.stableCalendar,w=document.querySelector('#calendarHost .calendar-wrap');
   const row=document.querySelector('.cal-row[data-date="2026-09-12"]');
   w.scrollTop+=row.getBoundingClientRect().top-w.getBoundingClientRect().top-85;w.scrollLeft=130;
   document.querySelector('[data-event-id="E1"]').focus({preventScroll:true});
   window.beforeStable={wrap:w,grid:w.firstElementChild,year:document.querySelector('#yearSelect').firstElementChild,row:document.querySelector('.cal-row[data-date="2026-09-20"]'),focus:document.activeElement,actor:a.state.data.actor,position:a.captureEventViewPosition()};
  });
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.deepEqual(await page.evaluate(()=>{
   const b=window.beforeStable,a=window.stableCalendar,p=a.captureEventViewPosition();
   return {wrap:b.wrap===document.querySelector('#calendarHost .calendar-wrap'),grid:b.grid===document.querySelector('#calendarHost .cal-grid'),row:b.row===document.querySelector('.cal-row[data-date="2026-09-20"]'),year:b.year===document.querySelector('#yearSelect').firstElementChild,focus:b.focus===document.activeElement,actor:b.actor===a.state.data.actor,filter:document.querySelector('#dateSearch').value,anchor:p.anchorDate===b.position.anchorDate,left:p.wrapLeft===b.position.wrapLeft,offset:Math.abs(p.anchorOffset-b.position.anchorOffset)<1};
  }),{wrap:true,grid:true,row:true,year:true,focus:true,actor:true,filter:'09/2026',anchor:true,left:true,offset:true});
  console.log('PASS unchanged snapshot retains grid, rows, year options, focus, actor, filter and scroll anchor');

  snapshot.events[0].StaffTitle='Changed by another editor';snapshot.events[0]._revision='changed-title';
  snapshot.events.push({...clone(snapshot.events[0]),EventID:'ABOVE',StartDate:'2026-09-01',EndDate:'2026-09-01',StaffTitle:'Tall event above viewport '.repeat(80),_revision:'above'});
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.deepEqual(await page.evaluate(()=>{
   const b=window.beforeStable,p=window.stableCalendar.captureEventViewPosition();
   return {wrap:b.wrap===document.querySelector('#calendarHost .calendar-wrap'),row:b.row===document.querySelector('.cal-row[data-date="2026-09-20"]'),focus:document.activeElement.dataset.eventId,anchor:p.anchorDate===b.position.anchorDate,offset:Math.abs(p.anchorOffset-b.position.anchorOffset)<1,left:p.wrapLeft===b.position.wrapLeft};
  }),{wrap:true,row:true,focus:'E1',anchor:true,offset:true,left:true});
  assert.match(await page.locator('[data-event-id="E1"]').first().innerText(),/Changed by another editor/);
  console.log('PASS changed rows retain unrelated rows, focused event and date anchor despite height growth above viewport');

  // A response which began before the editor opens cannot install over its draft.
  holdNext=true;await page.evaluate(()=>{window.pendingStable=window.stableCalendar.loadBootstrap(2026,true,{refresh:true});});
  await page.waitForFunction(()=>window.stableCalendar.state.loadingYear);
  while(!held)await new Promise(resolve=>setTimeout(resolve,5));
  await page.evaluate(()=>window.stableCalendar.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'}));
  await page.locator('[name=StaffTitle]').fill('Keep this unsaved draft');
  held();held=null;await page.evaluate(()=>window.pendingStable);
  const afterDeferred=reads;await page.waitForTimeout(450);
  assert.equal(reads,afterDeferred,'A deferred editor must not cause a background read loop');
  assert.equal(await page.locator('[name=StaffTitle]').inputValue(),'Keep this unsaved draft');
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.readOnly),false);
  await page.evaluate(()=>window.stableCalendar.closeModal(true));
  await page.waitForFunction(()=>!window.stableCalendar.state.refreshDeferred&&!window.stableCalendar.state.loadingYear);
  console.log('PASS late snapshot preserves independent draft, restores editability and defers without polling loops');

  // A selected text range remains intact; clearing selection releases the deferred refresh.
  await page.evaluate(()=>{
   const node=document.querySelector('[data-event-id="E1"]');const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);window.selectedStable=selection.toString();
  });
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.equal(await page.evaluate(()=>window.getSelection().toString()),await page.evaluate(()=>window.selectedStable));
  const selectionReads=reads;await page.waitForTimeout(450);assert.equal(reads,selectionReads,'Selection must not create a refresh loop');
  await page.evaluate(()=>window.getSelection().removeAllRanges());
  await page.waitForFunction(()=>!window.stableCalendar.state.refreshDeferred&&!window.stableCalendar.state.loadingYear);
  console.log('PASS text selection survives background snapshot and releases deferred work on selection change');

  // Weekly view retains its wrapper/table and visible date across metadata updates.
  await page.evaluate(()=>{window.stableCalendar.setPage('weekly');const w=document.querySelector('.weekly-wrap');w.scrollTop=1000;w.scrollLeft=90;w.focus({preventScroll:true});window.weeklyStable={wrap:w,table:w.querySelector('table'),position:window.stableCalendar.captureEventViewPosition()};});
  snapshot.tags[0]={...snapshot.tags[0],Meaning:'Updated glossary meaning'};
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.deepEqual(await page.evaluate(()=>{const b=window.weeklyStable,p=window.stableCalendar.captureEventViewPosition();return {wrap:b.wrap===document.querySelector('.weekly-wrap'),table:b.table===document.querySelector('.weekly-grid'),focus:b.wrap===document.activeElement,anchor:b.position.anchorDate===p.anchorDate,offset:Math.abs(b.position.anchorOffset-p.anchorOffset)<1};}),{wrap:true,table:true,focus:true,anchor:true,offset:true});
  console.log('PASS weekly metadata changes preserve table, focus and visible date');

  const retained=clone(snapshot),priorLanes=clone(snapshot.lanes);snapshot.lanes=[null];
  assert.match(await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}).then(()=>'',error=>error.message)),/Invalid calendar records/);
  assert.deepEqual(await page.evaluate(()=>window.stableCalendar.state.data.lanes),priorLanes);
  snapshot=retained;await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  console.log('PASS malformed snapshot retains previous usable data');

  const jobEvent=clone(snapshot.events.find(event=>event.EventID==='E1'));
  const job={jobId:'selected-job',state:'QUEUED',action:'saveEvent',payload:{event:jobEvent,expectedRevision:jobEvent._revision},attemptOperationId:'selected-job',attempts:0,checks:0,blocked:true};
  serverJobs=[clone(job)];
  await page.evaluate(job=>{
   const a=window.stableCalendar;a.state.calendarJobsEnabled=true;a.state.calendarJobs=[job];a.renderCalendarJobs();a.renderDirtyPill();
   const node=document.querySelector('#weeklyHost [data-event-id="E1"]'),range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);window.selectedStable=selection.toString();
  },job);
  serverJobs=[{...job,state:'SAVED',blocked:false,result:{...jobEvent,StaffTitle:'Saved while selected',_revision:'selected-saved',LastMutationID:job.attemptOperationId}}];
  await page.evaluate(()=>window.stableCalendar.loadCalendarJobs());
  assert.equal(await page.evaluate(()=>window.getSelection().toString()),await page.evaluate(()=>window.selectedStable));
  const beforeClear=reads;
  await page.evaluate(()=>window.getSelection().removeAllRanges());
  await page.waitForFunction(()=>document.querySelector('#weeklyHost [data-event-id="E1"]').textContent.includes('Saved while selected'));
  assert.equal(reads,beforeClear,'Clearing a job-selected row should paint current data without a new source read');
  const currentEvent=await page.evaluate(()=>window.stableCalendar.state.data.events.find(event=>event.EventID==='E1'));
  const firstSaved={...job,jobId:'first-seen-saved',attemptOperationId:'first-seen-saved',state:'SAVED',blocked:false,payload:{event:currentEvent,expectedRevision:currentEvent._revision},result:{...currentEvent,StaffTitle:'Older held snapshot',_revision:'held-old'}};
  snapshot.events[snapshot.events.findIndex(event=>event.EventID==='E1')]=firstSaved.result;
  serverJobs=[firstSaved];holdNext=true;
  await page.evaluate(()=>{window.pendingJobStable=window.stableCalendar.loadCalendarJobs();});
  while(!held)await new Promise(resolve=>setTimeout(resolve,5));
  const newer={...currentEvent,StaffTitle:'Newer saved local event',_revision:'newer-local'};
  await page.evaluate(event=>window.stableCalendar.upsertLocalEvent(event),newer);
  held();held=null;await page.evaluate(()=>window.pendingJobStable);
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.data.events.find(event=>event.EventID==='E1')._revision),'newer-local');
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.pendingJobSnapshotRefresh),true);
  snapshot.events[snapshot.events.findIndex(event=>event.EventID==='E1')]=newer;
  await page.evaluate(()=>window.stableCalendar.loadCalendarJobs());
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.pendingJobSnapshotRefresh),false);
  await page.evaluate(()=>{window.stableCalendar.state.calendarJobsEnabled=false;clearTimeout(window.stableCalendar.state.calendarJobsTimer);});
  console.log('PASS saved job retains selected text; its delayed snapshot cannot overwrite a newer local save');

  await page.evaluate(()=>{
   const a=window.stableCalendar;a.state.calendarJobsEnabled=true;a.state.calendarJobs=[{jobId:'synthetic-status',state:'QUEUED',action:'saveEvent',payload:{event:{StaffTitle:'Safe proposal',StartDate:'2026-10-29',Year:2026}},attemptOperationId:'synthetic-status',attempts:0,checks:0,blocked:true}];a.renderCalendarJobs();a.renderDirtyPill();
  });
  assert.equal(await page.locator('#calendarJobsPanel').isVisible(),false);
  assert.match(await page.locator('#dirtyPill').innerText(),/Saving in background/);
  const beforePanel=await page.locator('.weekly-wrap').boundingBox();
  await page.locator('#dirtyPill button').click();assert.equal(await page.locator('#calendarJobsPanel').isVisible(),true);
  assert.deepEqual(await page.locator('.weekly-wrap').boundingBox(),beforePanel,'Details must float without resizing the table');
  assert.equal(await page.locator('.calendar-job-technical').getAttribute('open'),null);
  await page.locator('.calendar-job-technical summary').click();
  await page.evaluate(()=>window.stableCalendar.renderCalendarJobs());
  assert.notEqual(await page.locator('.calendar-job-technical').getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  await page.locator('[data-job-close]').click();
  await page.evaluate(()=>{const a=window.stableCalendar;a.state.calendarJobs[0].state='SAVED';a.state.calendarJobs[0].blocked=false;a.renderCalendarJobs();a.renderDirtyPill();});
  assert.doesNotMatch(await page.locator('#dirtyPill').innerText(),/Syncing in background/);
  await page.evaluate(()=>{const a=window.stableCalendar;a.state.calendarJobs[0].state='NEEDS_ATTENTION';a.state.calendarJobs[0].canCheck=true;a.renderCalendarJobs();a.renderDirtyPill();});
  await page.getByRole('button',{name:'Review saves',exact:true}).click();assert(await page.getByRole('button',{name:'Check exact receipt',exact:true}).isVisible());
  await page.locator('[data-job-close]').click();
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.locator('#dirtyPill button').click();
  const panel=await page.locator('#calendarJobsPanel').boundingBox();assert(panel.x>=0 && panel.x+panel.width<=390);
  await page.locator('[data-job-close]').click();
  await page.evaluate(()=>{const a=window.stableCalendar;a.state.calendarJobsEnabled=false;clearTimeout(a.state.calendarJobsTimer);window.narrowStable={wrap:document.querySelector('.weekly-wrap'),position:a.captureEventViewPosition()};});
  snapshot.events.find(event=>event.EventID==='ABOVE').StaffTitle='Taller narrow event above viewport '.repeat(100);
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.deepEqual(await page.evaluate(()=>{const b=window.narrowStable,p=window.stableCalendar.captureEventViewPosition();return {wrap:b.wrap===document.querySelector('.weekly-wrap'),anchor:b.position.anchorDate===p.anchorDate,offset:Math.abs(b.position.anchorOffset-p.anchorOffset)<1};}),{wrap:true,anchor:true,offset:true});
  console.log('PASS yellow status, truthful saved state, recovery actions, floating details and narrow viewport');

  // The job-snapshot path must enforce a same-alias permission change too.
  await page.evaluate(()=>{const a=window.stableCalendar;a.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});a.state.calendarJobsEnabled=true;a.state.pendingJobSnapshotRefresh=true;});
  snapshot.actor={...snapshot.actor,isAdmin:false,isParentPublisher:false};serverJobs=[];
  await page.evaluate(()=>window.stableCalendar.loadCalendarJobs());
  assert.equal(await page.locator('#eventForm').count(),0);
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.calendarJobs.length),0);
  assert.equal(await page.locator('#syncStaffBtn').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.data.actor.isAdmin),false);
  snapshot.actor={...snapshot.actor,userAlias:'new-reader'};
  await page.evaluate(()=>window.stableCalendar.loadBootstrap(2026,true,{refresh:true}));
  assert.equal(await page.evaluate(()=>window.stableCalendar.state.data.actor.userAlias),'new-reader');
  console.log('PASS job-snapshot permission change and direct actor change clear private draft/jobs and update access');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('PASS stable Calendar Chromium regression');
})().catch(error=>{console.error(error);process.exit(1);});
