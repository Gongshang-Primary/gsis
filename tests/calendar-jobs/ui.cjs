'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{makeHarness}=require('../calendar/backend_harness.cjs');
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/,`window.testCalendar={state,logout,openEventModal,openParentModal,openRelocation,openTagModal,renderGlossary,renderAll,loadCalendarJobs:typeof loadCalendarJobs==='function'?loadCalendarJobs:null};})();`);
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(){
 const h=makeHarness(),data=h.call('bootstrap',{year:2026});
 data.venues=[{id:'venue-hall',unit:'A1-01',name:'School Hall',aliases:['assembly space']}];data.venueSource={status:'ready'};
 const dom=new JSDOM(html,{url:'https://calendar.example/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],jobs=[];
 w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>({measureText:text=>({width:String(text).length*7})});
 vm.runInContext(fs.readFileSync('calendar-update/public/calendar-core.js','utf8'),dom.getInternalVMContext());
 w.fetch=async(url,options={})=>{
  if(String(url).startsWith('/api/bootstrap')){const snapshot=h.call('bootstrap',{year:2026});snapshot.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];return {ok:true,status:200,json:async()=>({ok:true,result:snapshot})};}
  if(url==='/api/calendar-jobs'){
   if(!options.method||options.method==='GET')return {ok:true,status:200,json:async()=>({ok:true,result:{jobs:JSON.parse(JSON.stringify(jobs))}})};
   const input=JSON.parse(options.body);calls.push(input);
   const job={jobId:input.payload.operationId,action:input.action,payload:input.payload,state:'QUEUED',blocked:true,attemptOperationId:input.payload.operationId,attempts:0,checks:0};jobs.push(job);
   return {ok:true,status:202,json:async()=>({ok:true,result:JSON.parse(JSON.stringify(job))})};
  }
  const req=JSON.parse(options.body);calls.push(req);return {ok:true,status:200,json:async()=>({ok:true,result:h.call(req.action,req.payload)})};
 };
 vm.runInContext(source,dom.getInternalVMContext());const app=w.testCalendar;
 Object.assign(app.state,{data,year:2026,page:'events',readOnly:false,calendarJobsEnabled:true});app.renderAll();
 return {dom,w,app,h,data,calls,jobs,node:id=>w.document.getElementById(id)};
}
(async()=>{
 // Reverting any mutation path to the blocking Google API must fail these four real UI submissions.
 for(const action of ['saveEvent','deleteEvent','saveParentSide','relocateEvent']){
  const f=fixture(),event=f.data.events.find(e=>e.EventID==='E1');
  if(action==='saveEvent'){f.app.openEventModal(event);f.node('eventForm').elements.StaffTitle.value='Queued title';f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));}
  if(action==='deleteEvent'){f.app.openEventModal(event);f.node('deleteEventBtn').click();}
  if(action==='saveParentSide'){f.app.openParentModal(event);f.node('parentForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));}
  if(action==='relocateEvent'){f.app.openRelocation(event);f.node('confirmMove').click();}
  await settle();
  assert.equal(f.calls.length,1,action+' submits once');assert.equal(f.calls[0].kind,'enqueue',action+' captures through durable job service');assert.equal(f.calls[0].action,action);
  assert(!f.app.state.pendingMutation,action+' does not hold a global Google save lock');assert(!f.node('modalHost').firstElementChild,action+' closes editor after durable acceptance');
  assert.match(f.node('calendarJobsPanel').textContent,/Queued/);assert.match(f.node('calendarJobsPanel').textContent,/E1/);
  assert(f.data.events.some(e=>e.EventID==='E1'),'Accepted deletion retains authoritative event until saved');
  f.app.openEventModal(event);assert(!f.node('eventForm'),'Same-event editing waits for its exact receipt');
  f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});assert(f.node('eventForm'),'Independent event can be edited while Google writes continue');
  const independent=f.node('eventForm');independent.elements.StaffTitle.value='Independent draft';
  f.jobs[0].state='SAVED';f.jobs[0].blocked=false;f.jobs[0].result=action==='deleteEvent'?{deleted:true,eventId:'E1'}:{...event,StaffTitle:'Google saved',_revision:'latest'};
  await f.app.loadCalendarJobs();assert.equal(f.node('eventForm'),independent,'Status updates preserve another editor');assert.equal(independent.elements.StaffTitle.value,'Independent draft');
  assert.match(f.node('calendarJobsPanel').textContent,/Saved to Google/);
  f.dom.window.close();
 }
 // A lost acceptance response discovers the exact command, without creating a replacement.
 {
  const f=fixture(),base=f.w.fetch;f.w.fetch=async(url,options)=>{const result=await base(url,options);if(options?.method==='POST'&&url==='/api/calendar-jobs')throw Error('Lost accepted response');return result;};
  f.app.openEventModal(f.data.events[0]);f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.calls.length,1);assert.equal(f.jobs.length,1);assert(!f.node('modalHost').firstElementChild);assert.match(f.node('calendarJobsPanel').textContent,/Queued/);f.dom.window.close();
 }
 // A saved receipt arriving after a newer bootstrap must not replace a colleague's newer event.
 {
  const f=fixture(),event=f.data.events.find(e=>e.EventID==='E1');f.app.openEventModal(event);f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  Object.assign(event,{StaffTitle:'Newer authoritative change',_revision:'newer',LastMutationID:'newer-operation'});
  f.jobs[0].state='SAVED';f.jobs[0].blocked=false;f.jobs[0].result={...event,StaffTitle:'Older queued save',_revision:'older',LastMutationID:f.jobs[0].attemptOperationId};
  await f.app.loadCalendarJobs();assert.equal(f.data.events.find(e=>e.EventID==='E1').StaffTitle,'Newer authoritative change');f.dom.window.close();
 }
 // An unknown new-event capture freezes its exact body, even if the still-open form is edited again.
 {
  const f=fixture(),base=f.w.fetch;f.w.fetch=async(url,options)=>{
   if(url==='/api/calendar-jobs'&&(!options?.method||options.method==='GET'))throw Error('Status unavailable');
   const result=await base(url,options);if(url==='/api/calendar-jobs')throw Error('Lost acceptance');return result;
  };
  f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});const form=f.node('eventForm');form.elements.StaffTitle.value='Original frozen proposal';
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  form.elements.StaffTitle.value='Later unsaved edits';
  for(let i=0;i<2;i++){form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();}
  assert.equal(f.calls.length,1,'An edited unknown capture must not send a changed body or allocate a replacement operation');assert.equal(f.jobs.length,1);
  assert.equal(f.app.state.calendarJobs[0].payload.event.StaffTitle,'Original frozen proposal');assert.equal(form.elements.StaffTitle.value,'Later unsaved edits');f.dom.window.close();
 }
 // A first-seen completed job reconciles a bootstrap that preceded its commit, while preserving another editor.
 {
  const f=fixture(),event=f.data.events.find(e=>e.EventID==='E1'),payload={expectedRevision:event._revision,operationId:f.w.crypto.randomUUID(),event:{...event,StaffTitle:'Completed before first job listing'}};
  const saved=f.h.call('saveEvent',payload);f.jobs.push({jobId:payload.operationId,action:'saveEvent',payload,state:'SAVED',blocked:false,attemptOperationId:payload.operationId,result:saved});
  f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});const form=f.node('eventForm');form.elements.StaffTitle.value='Independent live draft';
  await f.app.loadCalendarJobs();assert.equal(f.app.state.data.events.find(e=>e.EventID==='E1').StaffTitle,'Completed before first job listing');assert.equal(f.node('eventForm'),form);assert.equal(form.elements.StaffTitle.value,'Independent live draft');f.dom.window.close();
 }
 // A response owned by a logged-out actor must never enter another actor's panel or close their editor.
 {
  const f=fixture(),base=f.w.fetch;let release;
  f.w.fetch=async(url,options)=>{if(url==='/api/calendar-jobs'&&options?.method==='POST'){const result=await base(url,options);return await new Promise(resolve=>{release=()=>resolve(result);});}return base(url,options);};
  f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});f.node('eventForm').elements.StaffTitle.value='Private old actor proposal';f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  await f.app.logout();assert(!f.node('modalHost').firstElementChild,'Sign-out clears private forms outside the app view');
  const next=JSON.parse(JSON.stringify(f.data));next.actor={...next.actor,userAlias:'different'};Object.assign(f.app.state,{data:next,year:2026,readOnly:false});f.app.renderAll();f.app.openEventModal(null,{StartDate:'2026-10-30',LaneID:'day'});const form=f.node('eventForm');form.elements.StaffTitle.value='New actor draft';
  release();await settle();assert.equal(f.node('eventForm'),form);assert.equal(form.elements.StaffTitle.value,'New actor draft');assert.equal((f.app.state.calendarJobs||[]).length,0);assert(!f.node('calendarJobsPanel').textContent.includes('Private old actor'));f.dom.window.close();
 }
 // Background status polling cannot replace an independent inline Parent Publishing draft.
 {
  const f=fixture();f.app.state.page='parent';f.app.renderAll();const title=f.w.document.querySelector('.parent-title-inline');assert(title);title.focus();title.value='Independent unsaved inline parent draft';title.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  await f.app.loadCalendarJobs();assert.equal(f.w.document.querySelector('.parent-title-inline'),title);assert.equal(title.value,'Independent unsaved inline parent draft');f.dom.window.close();
 }
 // Receipt refresh cannot expose a save in flight, and its late success closes only its own form.
 {
  const f=fixture(),base=f.w.fetch;let release;
  f.w.fetch=async(url,options)=>{if(url==='/api/calendar-jobs'&&options?.method==='POST'){const result=await base(url,options);return new Promise(resolve=>{release=()=>resolve(result);});}return base(url,options);};
  f.app.openEventModal(f.data.events.find(e=>e.EventID==='E1'));f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();await f.app.loadCalendarJobs();
  assert(!f.node('syncOverlay').classList.contains('hidden'),'Polling must preserve the in-flight capture overlay');
  f.app.openEventModal(null,{StartDate:'2026-10-30',LaneID:'day'});const newer=f.node('eventForm');newer.elements.StaffTitle.value='Later same-owner draft';
  release();await settle();assert.equal(f.node('eventForm'),newer);assert.equal(newer.elements.StaffTitle.value,'Later same-owner draft');f.dom.window.close();
 }
 // An old-owner glossary response cannot mutate a new owner's view or dismiss their editor.
 {
  const f=fixture(),base=f.w.fetch;let release;
  f.w.fetch=async(url,options)=>{if(url==='/api'&&JSON.parse(options.body).action==='saveTag'){const result=await base(url,options);return new Promise(resolve=>{release=()=>resolve(result);});}return base(url,options);};
  f.app.openTagModal(null);const tag=f.node('tagForm');tag.elements.Tag.value='OldOwnerTag';tag.elements.Meaning.value='Old private proposal';tag.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();await f.app.logout();
  const next=JSON.parse(JSON.stringify(f.data));next.actor={...next.actor,userAlias:'different'};Object.assign(f.app.state,{data:next,year:2026,readOnly:false});f.app.renderAll();f.app.openEventModal(null,{StartDate:'2026-10-30',LaneID:'day'});const form=f.node('eventForm');form.elements.StaffTitle.value='New owner editor';release();await settle();
  assert.equal(f.node('eventForm'),form);assert(!next.tags.some(t=>t.Tag==='OldOwnerTag'));f.dom.window.close();
 }
 // A command already completed when its POST response arrives also refreshes the authoritative event.
 {
  const f=fixture(),base=f.w.fetch;f.w.fetch=async(url,options)=>{
   if(url==='/api/calendar-jobs'&&options?.method==='POST'){
    await base(url,options);const job=f.jobs.at(-1);job.result=f.h.call(job.action,job.payload);job.state='SAVED';job.blocked=false;
    return {ok:true,status:202,json:async()=>({ok:true,result:JSON.parse(JSON.stringify(job))})};
   }return base(url,options);
  };
  f.app.openEventModal(f.data.events.find(e=>e.EventID==='E1'));f.node('eventForm').elements.StaffTitle.value='Saved before POST acknowledgement';f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.app.state.data.events.find(e=>e.EventID==='E1').StaffTitle,'Saved before POST acknowledgement');f.dom.window.close();
 }
 // A bounded listing omitting a retained pending job cannot unlock its event or invent a replacement.
 {
  const f=fixture(),base=f.w.fetch;f.app.openEventModal(f.data.events.find(e=>e.EventID==='E1'));f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  f.w.fetch=async(url,options)=>url==='/api/calendar-jobs'&&!options?.method?{ok:true,status:200,json:async()=>({ok:true,result:{jobs:[]}})}:base(url,options);
  await f.app.loadCalendarJobs();assert.equal(f.app.state.calendarJobs.length,1);f.app.openEventModal(f.data.events.find(e=>e.EventID==='E1'));assert(!f.node('eventForm'));f.dom.window.close();
 }
 // Glossary saved/deleted records and revision tokens update locally without replacing an open editor or bootstrap.
 {
  const f=fixture();f.app.state.page='glossary';f.app.renderGlossary();f.app.openTagModal(null);
  const form=f.node('tagForm');form.elements.Tag.value='TestNew';form.elements.Meaning.value='New meaning';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].action,'saveTag');assert(f.data.tags.some(t=>t.Tag==='TestNew'));assert.match(f.node('glossaryHost').textContent,/New meaning/);
  f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});const editor=f.node('eventForm');editor.elements.StaffTitle.value='Retain me';
  const button=f.w.document.querySelector('.delete-tag[data-tag="TestNew"]');button.click();await settle();
  assert.equal(f.calls.length,2);assert.equal(f.node('eventForm'),editor);assert.equal(editor.elements.StaffTitle.value,'Retain me');assert(!f.data.tags.some(t=>t.Tag==='TestNew'));f.dom.window.close();
 }
 // Venue partial name/unit/alias lookup preserves stable identity and custom text clears it.
 {
  const f=fixture();f.app.openEventModal(null,{StartDate:'2026-10-29',LaneID:'day'});const form=f.node('eventForm'),input=f.node('calendarVenueInput');
  for(const query of ['School','A1','assembly']){input.value=query;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.match(f.node('calendarVenueSuggestions').textContent,/School Hall/);}
  f.w.document.querySelector('[data-calendar-venue="venue-hall"]').click();assert.equal(form.elements.VenueID.value,'venue-hall');assert.equal(input.value,'');assert.equal(form.elements.Location.value,'A1-01 School Hall');
  input.value='Custom offsite venue';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(form.elements.VenueID.value,'venue-hall');assert.equal(form.elements.Location.value,'A1-01 School Hall, Custom offsite venue');assert(!/available|booked/i.test(f.node('calendarVenueHelp').textContent));f.dom.window.close();
 }
 console.log('PASS Calendar job UI: all four nonblocking mutation paths, independent editor retention, same-event locks, lost acceptance recovery, local glossary updates and partial venue identity');
})().catch(error=>{console.error(error);process.exit(1);});
