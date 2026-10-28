'use strict';
// Exercises the real UI, allocation model and drafts. Only the remote transport and poll timer are controlled.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 const timers=new Map(),nativeTimeout=w.setTimeout.bind(w);let serial=10000;
 w.setTimeout=(fn,ms,...args)=>ms>=5000?(timers.set(++serial,{fn,ms}),serial):nativeTimeout(fn,ms,...args);
 const nativeClear=w.clearTimeout.bind(w);w.clearTimeout=id=>{timers.delete(id);nativeClear(id);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
 O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3],reliefRequired:true});
 const control={token:'day-1',changeKey:'balance-1',clock:'before-school',reference:'ref-1',version:1},id=O.demand(f.ctx,f.state,f.ctx.today)[0].id;
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status(){},api:async(route,p)=>{
  calls.push(structuredClone(p));if(control.readError&&p.operation==='read'&&p.view==='allocation')throw control.readError;if(p.operation==='allocationVersion'){const result={revision:control.version,dayToken:control.token,allocationChangeKey:control.changeKey,allocationReferenceKey:control.reference,allocationClock:control.clock,allocatorRun:control.run};if(control.holdVersion)await new Promise(resolve=>control.releaseVersion=resolve);return result;}
  if(p.view==='intake')return {entries:[]};
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});
  if(p.view==='allocation'){Object.assign(value.data,{dayToken:control.token,allocationChangeKey:control.changeKey,allocationReferenceKey:control.reference,allocationClock:control.clock});value.data.cellProvenance=O.cellProvenance(f.state,f.ctx,f.ctx.today,value.data.demands.map(d=>d.id));}
  return value.data;
 }};
 const wait=async fn=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const poll=async()=>{const entry=[...timers].find(([,t])=>[20000,60000,5000].includes(t.ms));assert(entry,'allocation poll scheduled');timers.delete(entry[0]);f.setClock(new Date(f.ctx.now+21000).toISOString());await entry[1].fn();};
 const assign=staffId=>O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[id],staffId,confirm:true});
 return {dom,w,$,f,O,ctx,control,calls,id,poll,wait,assign};
}
async function test(name,fn){const t=await setup();try{await fn(t);console.log('PASS '+name);}catch(error){console.error('FAIL '+name,error);process.exitCode=1;}finally{t.dom.window.close();}}
(async()=>{
 await test('source badges distinguish automatic, SMC, peer approval and unknown origins',async t=>{
  t.assign('bob');t.O.apply(t.f.state,t.f.ctx,{operation:'returnAutomatic',date:t.f.ctx.today,demandIds:[t.id]});
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);
  assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'Automatic');
  t.$('[data-relief-period="2"]').click();assert.match(t.$('[data-selected-relief]').textContent,/Draft/);
  t.assign('dora');await t.$('[data-ops-refresh]').onclick();assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'SMC');
  assert.match(t.$('[data-assignment-provenance]').textContent,/Alice Teacher.*14 Oct 2026/);
  const row=t.w.GSISRosterAllocation.effectiveAssignments(t.f.state).find(a=>a.demandId===t.id);row.mutual=true;row.peerApproved=true;
  await t.$('[data-ops-refresh]').onclick();assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'SMC','current manual owner takes precedence over legacy mutual flag');assert.equal(t.$('[data-relief-period="2"] [data-peer-approved]'),null);
  t.O.apply(t.f.state,t.f.ctx,{operation:'returnAutomatic',date:t.f.ctx.today,demandIds:[t.id]});row.origin='legacy-import';await t.$('[data-ops-refresh]').onclick();assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'Source not recorded');
 });
 await test('peer approvals retain their actor and time and publication remains separate',async t=>{
  const absence=t.f.state.absences[0];t.O.apply(t.f.state,t.f.ctx,{operation:'requestMutual',date:t.f.ctx.today,absenceId:absence.id,requests:[{recipientId:'bob',demandIds:[t.id],combination:false}]});
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);assert(t.$('[data-relief-period="2"] [data-pending-peer]'));
  t.O.apply(t.f.state,{...t.f.ctx,user:{...t.f.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg'}},{operation:'respondMutual',id:t.f.state.requests[0].id,decision:'approve'});await t.$('[data-ops-refresh]').onclick();
  assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'Peer approved');assert.match(t.$('[data-assignment-provenance]').textContent,/bob@gsps.edu.sg.*14 Oct 2026/);assert.match(t.$('[data-selected-relief]').textContent,/Draft/);assert.equal(t.$('[data-return-automatic]'),null);
 });
 await test('unrelated global revisions do not reload or replace focused workspace',async t=>{
  const state=await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.$('[data-relief-period="3"]').click();const tile=t.$('[data-relief-period="3"]');tile.focus();const scroll=t.$('.ops-full-day-scroll');scroll.scrollLeft=217;
  const reads=t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length;t.control.version=99;await t.poll();
  assert.equal(t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,reads);assert.equal(t.$('[data-relief-period="3"]'),tile);assert.equal(t.w.document.activeElement,tile);assert.equal(scroll.scrollLeft,217);assert.equal(state.selectedPeriod,3);
 });
 await test('delayed version replies cannot invalidate a newer same-date refresh',async t=>{
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.control.holdVersion=true;const pending=t.poll();await t.wait(()=>t.control.releaseVersion);t.control.changeKey='balance-2';await t.$('[data-ops-refresh]').onclick();const reads=()=>t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,before=reads();t.control.releaseVersion();await pending;assert.equal(reads(),before);
 });
 await test('cross-date balance changes reload while the edited day token remains unchanged',async t=>{
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);const reads=()=>t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,before=reads();t.control.changeKey='balance-2';await t.poll();assert.equal(reads(),before+1);
 });
 await test('relevant changes refresh untouched records while preserving selection scroll and focus',async t=>{
  const state=await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.$('[data-relief-period="3"]').click();t.$('[data-relief-period="3"]').focus();t.$('.ops-full-day-scroll').scrollLeft=217;t.$('.ops-candidate-scroll').scrollTop=123;
  t.assign('bob');t.control.token='day-2';await t.poll();assert.equal(state.data.cellStates[t.id].staffId,'bob');assert.equal(state.selectedPeriod,3);assert.equal(t.w.document.activeElement.dataset.reliefPeriod,'3');assert.equal(t.$('.ops-full-day-scroll').scrollLeft,217);assert.equal(t.$('.ops-candidate-scroll').scrollTop,123);
 });
 await test('unchanged allocator status does not replace the status panel',async t=>{
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.control.run={id:'run-1',date:t.f.ctx.today,state:'completed',actorName:'Alice',canCancel:false,log:[{seq:1,message:'Complete'}]};await t.poll();const toggle=t.$('[data-run-action="toggle"]');toggle.focus();await t.poll();assert.equal(t.$('[data-run-action="toggle"]'),toggle);assert.equal(t.w.document.activeElement,toggle);
 });
 await test('minute ticks do not reload until an actual lesson boundary',async t=>{
  t.control.clock=t.f.ctx.today+':420';await t.w.RosterOpsUI.render('Assign Relief',t.ctx);const reads=()=>t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,initial=reads();
  t.control.clock=t.f.ctx.today+':421';await t.poll();assert.equal(reads(),initial);
  t.control.clock=t.f.ctx.today+':449';await t.poll();assert.equal(reads(),initial);
  t.control.clock=t.f.ctx.today+':450';await t.poll();assert.equal(reads(),initial+1,'start/end transitions affect live eligibility');
 });
 await test('clock ticks do not redraw a future day but day rollover refreshes eligibility',async t=>{
  t.control.clock='2026-10-13:420';await t.w.RosterOpsUI.render('Assign Relief',t.ctx);const reads=()=>t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,initial=reads();
  t.control.clock='2026-10-13:450';await t.poll();assert.equal(reads(),initial);
  t.control.clock='2026-10-14:450';await t.poll();assert.equal(reads(),initial+1);
 });
 await test('SMC no-relief and protected empty decisions retain their source',async t=>{
  t.O.apply(t.f.state,t.f.ctx,{operation:'setNoRelief',date:t.f.ctx.today,demandIds:[t.id],noRelief:true});await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.$('[data-relief-period="2"]').click();assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'SMC');assert.match(t.$('[data-selected-relief]').textContent,/No relief required.*Draft/);
  t.O.apply(t.f.state,t.f.ctx,{operation:'unassign',date:t.f.ctx.today,demandIds:[t.id]});await t.$('[data-ops-refresh]').onclick();assert.equal(t.$('[data-relief-period="2"] [data-assignment-source]')?.textContent,'SMC');assert.match(t.$('[data-relief-period="2"]').textContent,/Unassigned/);assert(t.$('[data-return-automatic]'));
 });
 await test('generic profile refresh defers while local allocation work exists',async t=>{
  await t.w.RosterOpsUI.render('Assign Relief',t.ctx);assert.equal(t.w.RosterOpsUI.canRefreshLocal(),true);t.$('[data-manual-select="dora"]').click();assert.equal(t.w.RosterOpsUI.canRefreshLocal(),false);
 });
 await test('allocation read failures show safe code stage version and reference',async t=>{
  t.control.readError=Object.assign(Error('Records unavailable'),{code:'BACKEND_FAILED',failureStage:'allocation-read',backendVersion:'0.9.8b',diagnosticId:'diag-123'});await t.w.RosterOpsUI.render('Assign Relief',t.ctx);
  assert.match(t.$('[data-ops-message]').textContent,/BACKEND_FAILED/);assert.match(t.$('[data-ops-message]').textContent,/allocation-read/);assert.match(t.$('[data-ops-message]').textContent,/0.9.8b/);assert.match(t.$('[data-ops-message]').textContent,/diag-123/);
 });
 await test('local edits remain untouched until explicit review of relevant online changes',async t=>{
  const state=await t.w.RosterOpsUI.render('Assign Relief',t.ctx);t.$('[data-manual-select="dora"]').click();t.$('[data-relief-period="2"]').focus();const tile=t.$('[data-relief-period="2"]'),reads=t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length;
  t.assign('bob');t.control.token='day-2';await t.poll();assert.equal(t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,reads,'poll must not fetch over local work');assert.equal(t.$('[data-relief-period="2"]'),tile);assert.equal(state.data.cellStates[t.id].staffId,'dora');assert.match(t.$('[data-ops-checked]').textContent,/Updates available/);assert(t.$('[data-review-updates]'));const review=t.$('[data-review-updates]');review.focus();await t.poll();assert.equal(t.$('[data-review-updates]'),review,'repeated detection preserves the review control');assert.equal(t.w.document.activeElement,review);
  t.$('[data-review-updates]').click();await t.wait(()=>t.$('[data-keep-mine]'));assert.match(t.$('dialog').textContent,/Dora Free.*Bob Colleague/);assert.equal(t.calls.filter(p=>p.operation==='reliefBatch').length,0);t.$('[data-keep-mine]').click();t.$('[data-apply-retained]').click();assert.equal(state.data.cellStates[t.id].staffId,'dora');assert.equal(t.$('[data-save-online]').disabled,false);
 });
})();
