'use strict';
// Real UI + domain. Synthetic staff, delayed read gates, no network or school data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q),calls=[],controls={},errors=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.addEventListener('error',e=>errors.push(e.error));
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},go:()=>{},api:async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='candidates'&&controls.candidates)await controls.candidates;if(p.view==='entry'&&controls.entry)await controls.entry;const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});if(controls.recordOnly&&p.operation==='read'&&p.view==='mine')result.data.timetable=null;return result.data;}};
 const render=page=>w.RosterOpsUI.render(page,ctx),wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,4));}throw Error('Timed out: '+doc.body.textContent);};
 return {dom,w,doc,$,f,O,ctx,calls,controls,render,wait,errors};
}
(async()=>{
 {
  const t=await setup();try{
   t.f.day.teachers.find(x=>x.staffId==='alice').cells[2]=['SCI','5B','New room',''];t.O.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2]});
   const stale=()=>Array.from({length:85},()=>['OLD','Old class','Old venue','']);t.ctx.cachedTimetable=()=>({modelId:'baseline',model:{even:{perDay:17,blocks:t.f.day.teachers.map(x=>({name:x.name,cells:stale()}))}}});let warms=0;t.ctx.localTimetable=async()=>{warms++;};
   const api=t.ctx.api;t.ctx.api=async(...args)=>{const result=await api(...args);if(result.allocationModel){result.allocationModel.teachers.find(x=>x.id==='dora').t.cells=[];result.allocationModel.teachers=result.allocationModel.teachers.filter(x=>x.id!=='bob');result.timetable.teachers.find(x=>x.staffId==='bob').cells=[];}return result;};
   const state=await t.render('Assign Relief');assert.equal(state.data.timetable.teachers.find(x=>x.staffId==='alice').cells[2][1],'5B','published effective allocation cells beat warm immutable baseline');assert.match(t.$('[data-relief-period="2"]').textContent,/5B/);assert.doesNotMatch(t.$('[data-relief-period="2"]').textContent,/Old class/);assert.equal(state.data.timetable.teachers.find(x=>x.staffId==='dora').cells.length,0,'explicitly empty effective teacher cells never refill from baseline');assert.equal(state.data.timetable.teachers.find(x=>x.staffId==='bob').cells.length,0,'explicitly empty server cells never refill from baseline');assert.equal(warms,1,'baseline is prefetched once for offline export without altering authoritative empty cells');
  }finally{t.dom.window.close();}
 }

 {
  const t=await setup();try{
   await t.render('Report Absence');t.$('[data-period="2"]').click();t.$('[data-log-absence]').click();let release;t.controls.candidates=new Promise(r=>release=r);assert.equal(t.f.state.absences.length,0);t.$('[data-save-instructions]').click();await t.wait(()=>t.f.state.absences.length===1&&t.$('#content').getAttribute('aria-busy')==='false');t.$('[data-own-arrangements]').click();await t.wait(()=>t.calls.some(p=>p.operation==='candidates'));
   t.$('[data-own-period="2"]').click();const occupied=t.$('[data-select-colleague="charlie"][data-mutual-period="2"]');assert.equal(occupied.disabled,false,'cached occupied same-column class can be selected while the eligibility read is pending');assert.match(occupied.closest('.ops-arrangement-colleague').textContent,/MA[\s\S]*Combine/);assert.equal(t.$('[data-select-colleague="charlie"][data-mutual-period="3"]'),null,'other periods cannot be selected from the current-period colleague list');occupied.click();assert.match(t.$('[data-mutual-selections]').textContent,/Charlie Busy · Combine/);assert.equal(t.$('[data-submit-mutual]').disabled,false,'one selected period can submit while advisory eligibility is pending');
   const calls=t.calls.length;t.$('[data-colleague-filter]').value='CHAR';t.$('[data-colleague-filter]').dispatchEvent(new t.w.Event('input'));assert.equal(t.calls.length,calls,'local name filtering does not call backend');t.$('[data-submit-mutual]').click();await t.wait(()=>t.f.state.requests.length===1);t.controls.candidates=null;release();const sent=t.calls.find(p=>p.operation==='requestMutual');assert.equal(sent.requests[0].combination,true);assert.equal(sent.requests[0].recipientId,'charlie');assert.equal(t.f.day.teachers.find(x=>x.staffId==='charlie').cells[2][1],'3A','request preserves colleague original class');assert.deepEqual(t.errors,[]);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.O.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2]});t.controls.recordOnly=true;const state=await t.render('Manage reported absences'),before=t.calls.length;t.$('[data-edit-entry]').click();assert(t.$('[data-edit-form]'),'record-only list can paint edit form synchronously from cached periods and types');assert.equal(t.calls.length,before,'fresh cached edit has no duplicate read');t.$('[data-close-dialog]').click();
   t.f.setClock(t.f.ctx.today+'T06:02:00+08:00');let release;t.controls.entry=new Promise(r=>release=r);t.$('[data-edit-entry]').click();assert(t.$('[data-edit-form]'));const input=t.$('[name="reasonDetail"]');input.value='Keep this typed draft';input.dispatchEvent(new t.w.Event('input',{bubbles:true}));assert.equal(t.$('[data-save-entry]').disabled,true);t.controls.entry=null;release();await t.wait(()=>!t.$('[data-save-entry]').disabled);assert.equal(input.value,'Keep this typed draft','background metadata refresh does not recreate typed form');assert.deepEqual(t.errors,[]);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.O.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2]});const demand=t.O.demand(t.f.ctx,t.f.state,t.f.ctx.today)[0];t.O.apply(t.f.state,t.f.ctx,{operation:'assign',date:t.f.ctx.today,demandIds:[demand.id],staffId:'bob',confirm:true});
   await t.render('Absences by Date');t.$('[data-ops-tab="relief"]').click();await t.wait(()=>t.$('[data-publish-relief]'));t.$('[data-publish-relief]').click();await t.wait(()=>!!t.f.state.massPublications[t.f.ctx.today]);assert.equal(t.$('[data-publish-audit]'),null,'automatic audit capture does not block release on a written reason');assert.equal(t.calls.find(p=>p.operation==='publish').auditReason,undefined);assert.deepEqual(t.errors,[]);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   for(const teacher of t.f.day.teachers)teacher.R=null;await t.render('Assign Relief');assert.match(t.$('.ops-health').textContent,/not verified|incomplete/i);assert.doesNotMatch(t.$('.ops-health').textContent,/Critical capacity/,'unknown R must not be rendered as a capacity shortage');assert.equal(t.$('.ops-health .ops-danger-text'),null);
   await t.render('Recess Regression');assert.equal(t.$('[data-recess-start]'),null,'recess timings belong to the baseline upload settings, not a duplicate control');t.$('[name=baseName]').value='Haze Recess';t.$('[data-recess-settings]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));await t.wait(()=>t.calls.some(p=>p.operation==='saveRecessSettings'));assert.equal(t.calls.find(p=>p.operation==='saveRecessSettings').timings,undefined);assert.deepEqual(t.errors,[]);
  }finally{t.dom.window.close();}
 }
 {
  const V=require('../shared/roster-timetable-view.js'),daily={date:'2026-10-14',name:'Teacher <safe>',periods:[{period:1,start:'07:30',end:'08:00'},{period:2,start:'08:00',end:'08:30'}],baseline:{cells:[[],['EL','1A','Room 1',''],['MA','1B','Room 2','']]},modified:{cells:[[],['EL','1A','Room 1',''],['EL','2A','Room 3','']]},mats:[{fromPeriod:2,toPeriod:2,reason:'Invigilation <safe>'}]};
  const doc=new JSDOM(V.render({daily})).window.document;assert.equal(doc.querySelectorAll('thead th').length,3);assert.equal(doc.querySelectorAll('tbody tr').length,2,'published today and usual baseline share one aligned table');assert.equal(doc.querySelectorAll('[data-timetable-changed]').length,1);assert.match(doc.querySelector('.suspension-overlay').textContent,/2A[\s\S]*Invigilation <safe>/,'suspension deskmat does not hide the actual top lesson');assert.match(doc.querySelector('caption').textContent,/Teacher <safe>/);assert.equal(doc.querySelector('safe'),null);
 }
 console.log('PASS v0.7.07 UI: cached same-column cover/Combine selection, local filtering, authoritative request validation without waiting for advisory reads, immediate cached edit with preserved draft, automatic nonblocking publication audit, neutral unknown R health and a single baseline-owned recess timing setting.');
})().catch(error=>{console.error(error);process.exitCode=1;});
