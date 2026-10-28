'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{makeHarness}=require('./calendar/backend_harness.cjs');
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/,`window.changeTest={state,renderAll,scheduleCalendarJobs,startCalendarChangeStream:typeof startCalendarChangeStream==='function'?startCalendarChangeStream:null,drainCalendarChanges:typeof drainCalendarChanges==='function'?drainCalendarChanges:null,openEventModal,closeModal,clearCalendarOwnerState};})();`);
const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
(async()=>{
 const h=makeHarness(),data=h.call('bootstrap',{year:2026}),dom=new JSDOM(html,{url:'https://calendar.example/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,sockets=[],calls=[];
 w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({measureText:t=>({width:t.length*7})});
 class Socket{constructor(url){this.url=url;this.readyState=1;sockets.push(this);}close(){this.readyState=3;}message(value){this.onmessage({data:JSON.stringify(value)});}}w.WebSocket=Socket;
 let changed={...data.events[0],StaffTitle:'Remote title',_revision:'remote-revision'},deltaCount=0,serverJobs=[];
 w.fetch=async(url,options)=>{calls.push(url);if(url==='/api/calendar-jobs')return{ok:true,status:200,json:async()=>({ok:true,result:{jobs:serverJobs}})};assert.equal(url,'/api/calendar-changes/delta');deltaCount++;const snapshot=JSON.parse(JSON.stringify(data));delete snapshot.events;snapshot.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];return{ok:true,status:200,json:async()=>({ok:true,result:{year:2026,sourceRevision:'source',snapshot,events:[changed],removed:[]}})};};
 vm.runInContext(fs.readFileSync('calendar-update/public/calendar-core.js','utf8'),dom.getInternalVMContext());vm.runInContext(source,dom.getInternalVMContext());const app=w.changeTest;
 Object.assign(app.state,{data,year:2026,page:'events',readOnly:false,calendarJobsEnabled:true,calendarChangePushEnabled:true});app.renderAll();
 assert.equal(typeof app.startCalendarChangeStream,'function','Push integration must exist before disabling idle polling');
 app.scheduleCalendarJobs();assert(!app.state.calendarJobsTimer,'Push mode schedules no recurring job-status reads');
 app.startCalendarChangeStream();assert.equal(sockets.length,1);const grid=w.document.querySelector('.cal-grid');
 const access={userAlias:data.actor.userAlias,isAdmin:data.actor.isAdmin,isParentPublisher:data.actor.isParentPublisher};
 sockets[0].message({type:'changes',cursor:0,entries:[],snapshotRequired:false,access});await pause();assert.equal(calls.length,0,'An unchanged connection does not read Calendar data');
 sockets[0].message({type:'changes',cursor:1,entries:[{cursor:1,kind:'invalidate'}],access});sockets[0].message({type:'changes',cursor:2,entries:[{cursor:2,kind:'invalidate'}],access});await pause();
 assert.equal(deltaCount,1,'A burst coalesces into one source delta');assert.equal(app.state.data.events[0].StaffTitle,'Remote title');assert.equal(w.document.querySelector('.cal-grid'),grid);assert.equal(app.state.calendarChangeState.cursor,2);
 app.openEventModal(app.state.data.events[0]);const form=w.document.getElementById('eventForm');form.elements.StaffTitle.value='My local draft';
 sockets[0].message({type:'changes',cursor:3,entries:[{cursor:3,kind:'invalidate'}],access});await pause();assert.equal(deltaCount,1);assert.equal(form.elements.StaffTitle.value,'My local draft');assert.equal(app.state.calendarChangeState.cursor,2,'Unapplied hints cannot advance the cursor');
 app.closeModal(true);await pause();assert.equal(deltaCount,2);assert.equal(app.state.calendarChangeState.cursor,3);
 // A late data delta must retain the job part of the same hint batch. With
 // no idle poll, dropping it would leave an accepted command blocked forever.
 for(const intervening of ['draft','local-save']){
  const base=w.fetch,from=app.state.calendarChangeState.cursor,jobId='mixed-'+intervening;
  const event=app.state.data.events[0],queued={jobId,action:'saveEvent',payload:{event:{...event},expectedRevision:event._revision},state:'QUEUED',blocked:true,attemptOperationId:jobId,attempts:0,checks:0};
  app.state.calendarJobs=[queued];changed={...event,StaffTitle:'Saved mixed '+intervening,_revision:'saved-'+intervening,LastMutationID:jobId};serverJobs=[{...queued,state:'SAVED',blocked:false,result:changed}];
  let release,started=false,held=false;const gate=new Promise(resolve=>{release=resolve;});
  w.fetch=async(url,options)=>{if(url==='/api/calendar-changes/delta'&&!held){held=true;started=true;await gate;}return base(url,options);};
  const jobsBefore=calls.filter(url=>url==='/api/calendar-jobs').length;
  sockets[0].message({type:'changes',cursor:from+2,entries:[{cursor:from+1,kind:'invalidate'},{cursor:from+2,kind:'job'}],access});await pause();assert(started,'Mixed hints must begin the authorized delta');
  if(intervening==='draft'){app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});w.document.getElementById('eventForm').elements.StaffTitle.value='Retain this new draft';}
  else app.state.data.events.push({...event,EventID:'NEWER-LOCAL',StaffTitle:'Intervening local save',_revision:'local-save'});
  release();await pause();
  assert.equal(app.state.calendarChangeState.pendingJobs,true,intervening+' deferral must retain the job hint');
  assert.equal(app.state.calendarChangeState.cursor,from,'A deferred mixed batch cannot advance its cursor');
  assert.equal(app.state.calendarJobs[0].state,'QUEUED');
  if(intervening==='draft'){assert.equal(w.document.getElementById('eventForm').elements.StaffTitle.value,'Retain this new draft');app.closeModal(true);}else await app.drainCalendarChanges();
  await pause();assert.equal(calls.filter(url=>url==='/api/calendar-jobs').length,jobsBefore+1,'Resuming the deferred batch checks its job status exactly once');
  assert.equal(app.state.calendarJobs[0].state,'SAVED');assert.equal(app.state.calendarJobs[0].blocked,false);assert.equal(app.state.calendarChangeState.cursor,from+2);w.fetch=base;
 }
 console.log('PASS Calendar push UI: mixed data/job hints survive late-draft and local-save deferrals, clear queued state and advance only after both apply');
 app.clearCalendarOwnerState();assert.equal(sockets[0].readyState,3);assert.equal(app.state.calendarChangeState,undefined,'Owner changes discard cursors and connection state');
 dom.window.close();console.log('PASS Calendar push UI: zero idle status/data polling, coalesced stable updates, retained drafts/cursor and owner cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
