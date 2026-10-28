'use strict';
// Production UI/domain, synthetic service. No live school data or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 w.GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.ctx.today,staffId:'alice',typeId:'mc',periods:[2,3],reliefRequired:true});f.state.revision++;
 const a=f.state.absences[0];a.instructions[a.lessonSnapshot[0].lessonKey]='Read the saved worksheet.';
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));
  if(p.operation==='read'&&p.view==='entry'){
   if(controls.entryGate)await controls.entryGate;
   if(controls.entryError)throw Object.assign(Error('Entry service unavailable.'),{status:controls.entryError,diagnosticId:'synthetic-entry-reference'});
  }
  if(p.operation==='read'&&controls.readError)throw Object.assign(Error('Review service unavailable.'),{status:controls.readError});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const render=page=>w.RosterOpsUI.render(page,ctx),idle=()=>wait(()=>$('#content').getAttribute('aria-busy')==='false'&&!$('.ops-progress'));
 const submit=()=>{$('[data-edit-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));return idle();};
 return {dom,w,$,f,controls,calls,ctx,wait,render,idle,submit};
}
(async()=>{
 {
  const t=await setup();try{
   const s=await t.render('Assign Relief'),initialRevision=s.data.revision,before=t.calls.length;
   t.$('[data-view-entry]').click();assert(t.$('.ops-facts'),'same-date details render synchronously');assert.match(t.$('.ops-dialog').textContent,/Read the saved worksheet/);assert.equal(t.calls.length,before,'opening loaded details needs no service call');t.$('[data-close-dialog]').click();
   t.$('[data-edit-entry]').click();assert(t.$('[data-edit-form]'),'same-date editor renders synchronously');assert.equal(t.calls.length,before,'opening loaded editor needs no service call');
   const form=t.$('[data-edit-form]');form.elements.typeId.value='others';form.elements.typeId.dispatchEvent(new t.w.Event('change'));form.elements.reasonDetail.value='Retain this correction.';
   // A newer page revision must not be attached to an older editor snapshot.
   t.f.state.revision++;s.data={...s.data,revision:t.f.state.revision};await t.submit();
   let saves=t.calls.filter(p=>p.operation==='saveAbsence');assert.equal(saves.length,1);assert.equal(saves[0].revision,initialRevision);assert.equal(t.f.state.absences[0].typeId,'mc','stale editor cannot silently overwrite');assert.equal(t.$('[data-edit-form]'),form);assert.equal(form.elements.reasonDetail.value,'Retain this correction.');assert.match(t.$('[data-dialog-message]').textContent,/Review them, then submit again/);
   await t.submit();saves=t.calls.filter(p=>p.operation==='saveAbsence');assert.equal(saves.length,2);assert.equal(saves[1].revision,initialRevision+1);assert.notEqual(saves[0].requestId,saves[1].requestId);assert.equal(t.f.state.absences[0].reasonDetail,'Retain this correction.');assert.equal(t.$('.ops-dialog'),null);
   // Instructions use the same captured-revision rule and reviewed resubmission.
   t.$('[data-edit-entry]').click();t.$('[data-edit-instructions]').click();const input=t.$('[data-edit-instruction]'),instructionRevision=s.data.revision;input.value='Keep my instruction correction.';
   t.f.state.revision++;s.data={...s.data,revision:t.f.state.revision};t.$('[data-save-instruction-edits]').click();await t.idle();
   let instructions=t.calls.filter(p=>p.operation==='saveInstructions');assert.equal(instructions[0].revision,instructionRevision);assert.equal(t.$('[data-edit-instruction]'),input);assert.equal(input.value,'Keep my instruction correction.');
   t.$('[data-save-instruction-edits]').click();await t.idle();instructions=t.calls.filter(p=>p.operation==='saveInstructions');assert.equal(instructions[1].revision,instructionRevision+1);assert.equal(t.f.state.absences[0].instructions[t.f.state.absences[0].lessonSnapshot[0].lessonKey],'Keep my instruction correction.');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const s=await t.render('Manage reported absences'),originalRevision=s.data.revision,before=t.calls.length;
   t.$('[data-view-entry]').click();assert(t.$('.ops-facts'));assert.match(t.$('.ops-dialog').textContent,/Read the saved worksheet/);assert.equal(t.calls.length,before,'mine details use recorded lesson snapshot without Calendar/timetable read');t.$('[data-close-dialog]').click();
   t.f.state.revision++;t.$('[data-edit-entry]').click();await t.wait(()=>t.$('[data-edit-form]'));assert.equal(s.data.revision,originalRevision,'entry response never advances unrelated page revision');
   await t.submit();assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').at(-1).revision,originalRevision,'cached editor keeps its snapshot revision and must first resolve conflict');assert(t.$('[data-edit-form]'));await t.submit();assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').at(-1).revision,originalRevision+1,'explicit reviewed resubmission advances the editor revision');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   await t.render('Manage reported absences');t.f.setClock(t.f.ctx.today+'T06:02:00+08:00');t.controls.entryError=503;t.$('[data-edit-entry]').click();await t.wait(()=>t.$('[data-retry-entry-check]'));
   assert.doesNotMatch(t.$('.ops-dialog').textContent,/Loading entry/);assert.match(t.$('[data-entry-check]').textContent,/synthetic-entry-reference/);assert.equal(t.calls.filter(p=>p.view==='entry').length,1,'failed entry read does not retry by itself');
   t.controls.entryError=null;t.$('[data-retry-entry-check]').click();await t.wait(()=>!t.$('[data-save-entry]').disabled);assert.equal(t.calls.filter(p=>p.view==='entry').length,2);
  }finally{t.dom.window.close();}
 }
 for(const uncertain of [false,true]){
  const t=await setup();try{
   t.f.ctx.days['2026-10-15']=structuredClone(t.f.day);t.w.GSISRosterOperations.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',date:'2026-10-15',staffId:'alice',typeId:'mc',periods:[2],reliefRequired:true});t.f.state.revision++;
   const record=t.f.state.absences.find(a=>a.date==='2026-10-15'),s=await t.render('Manage reported absences');t.$('[data-edit-entry="'+record.id+'"]').click();await t.wait(()=>t.$('[data-edit-form]'));if(uncertain)t.f.fail='after-save';await t.submit();
   if(uncertain){assert(t.$('[data-retry-save]'));t.$('[data-retry-save]').click();await t.idle();const saves=t.calls.filter(p=>p.operation==='saveAbsence');assert.equal(saves.length,1,'cross-date accepted receipt does not resubmit the saved edit');assert.deepEqual(t.calls.find(p=>p.operation==='receiptStatus').command,saves[0],'cross-date confirmation checks the exact original request');}
   assert.equal(t.$('.ops-dialog'),null,'confirmed cross-date edit closes its source dialog, including receipt replay');assert.equal(s.date,t.f.ctx.today);assert.equal(s.data.date,t.f.ctx.today);assert.equal(s.data.revision,t.f.state.revision);assert.match(t.$('[data-ops-message]').textContent,/Saved/);
  }finally{t.dom.window.close();}
 }
 for(const status of [401,403]){
  const t=await setup();try{
   const s=await t.render('Manage reported absences');t.f.setClock(t.f.ctx.today+'T06:02:00+08:00');t.controls.entryError=status;t.$('[data-edit-entry]').click();await t.wait(()=>t.$('[data-reload]'));
   assert.equal(s.data,null);assert.equal(t.$('.ops-dialog'),null);assert.equal(t.$('[data-edit-entry]'),null);assert.match(t.$('[data-ops-message]').textContent,/synthetic-entry-reference/);
  }finally{t.dom.window.close();}
 }
 for(const leave of ['close','unmount']){
  const t=await setup();try{
   const s=await t.render('Manage reported absences'),revision=s.data.revision;t.f.setClock(t.f.ctx.today+'T06:02:00+08:00');let release;t.controls.entryGate=new Promise(r=>release=r);t.$('[data-edit-entry]').click();assert(t.$('[data-edit-form]'));assert.match(t.$('[data-entry-check]').textContent,/Checking latest entry/);
   if(leave==='close')t.$('[data-close-dialog]').click();else t.w.RosterOpsUI.unmount();t.f.state.revision++;release();await new Promise(r=>setTimeout(r,20));assert.equal(t.$('.ops-dialog'),null);assert.equal(s.data.revision,revision,'late entry response cannot mutate page after '+leave);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const s=await t.render('Assign Relief');t.$('[data-edit-entry]').click();t.$('[data-edit-instructions]').click();t.$('[data-edit-instruction]').value='One atomic update, even when confirmation is lost.';t.f.fail='after-save';t.$('[data-save-instruction-edits]').click();await t.idle();assert(t.$('[data-retry-save]'));const count=t.f.state.revision;
   t.$('[data-retry-save]').click();await t.idle();const saves=t.calls.filter(p=>p.operation==='saveInstructions');assert.deepEqual(saves[0],saves[1]);assert.equal(t.f.state.revision,count,'retry replays the same receipt without a second mutation');assert.equal(t.$('.ops-dialog'),null);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const s=await t.render('Assign Relief'),originalRevision=s.data.revision;t.$('[data-edit-entry]').click();t.f.state.revision++;t.controls.readError=503;await t.submit();assert.equal(s.needsReviewRefresh,true);
   t.controls.readError=null;await t.submit();assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'failed conflict refresh recovery does not write automatically');assert.match(t.$('[data-dialog-message]').textContent,/Review your retained changes/);
   await t.submit();assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').at(-1).revision,originalRevision+1,'confirmed review refresh supplies next explicit save revision');assert.equal(t.$('.ops-dialog'),null);
  }finally{t.dom.window.close();}
 }
 console.log('PASS entry reads: cached View/Edit is synchronous with no request; mine snapshots avoid live reads; failures expose Retry/reference; denied/closed/unmounted reads are safe; snapshot revisions remain paired; explicit 409 review, failed-resync recovery and identical receipt replay preserve edits.');
})().catch(e=>{console.error(e);process.exitCode=1;});
