'use strict';
// Real DOM and Roster UI; only the remote receipt service is simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[],entries=[],control={};w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');let inFlight=0,maxInFlight=0;
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));if(p.operation==='read'&&p.view==='intake')return {entries:structuredClone(entries),total:entries.length,hasMore:false};
  if(p.operation==='resolveAbsenceIntake'){
   inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);try{
    if(control.gate){const gate=control.gate;delete control.gate;await gate.promise;}
    if(control.rejectId===p.intakeRequestId){delete control.rejectId;throw Object.assign(Error('Report is being processed'),{status:409});}
    const row=entries.find(e=>e.requestId===p.intakeRequestId);if(row.intakeState!=='withdrawn')Object.assign(row,{intakeState:'withdrawn',resolution:{action:'withdraw',reason:p.reason,at:f.ctx.iso,actorName:'Alice'}});
    if(control.loseId===p.intakeRequestId){delete control.loseId;throw Object.assign(Error('Response unconfirmed'),{status:503});}
    return {intakeReceipt:true,requestId:row.requestId,intakeState:'withdrawn',absenceApplied:false,resolution:row.resolution};
   }finally{inFlight--;}
  }
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return structuredClone(result.data);
 }};
 const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const add=(id,extra={})=>{const e={requestId:id,acceptedAt:f.ctx.iso,intakeState:'needsReview',absenceApplied:false,savedIds:[],peerState:'none',instructionState:'none',command:{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,fullDay:true,remarks:'private report'},dates:[f.ctx.today],...extra};entries.push(e);return e;};
 const render=async(page='Assign Relief')=>{const state=await w.RosterOpsUI.render(page,ctx);await wait(()=>$('[data-refresh-intake]')&&!$('[data-refresh-intake]').disabled);return state;};
 const refresh=async()=>{$('[data-refresh-intake]').click();await wait(()=>!$('[data-refresh-intake]').disabled);};
 const commands=()=>calls.filter(p=>p.operation==='resolveAbsenceIntake');
 const select=()=>{$('[data-select-all-intake]').click();$('[data-withdraw-selected-intake]').click();};
 const confirm=()=>{const form=$('[data-withdraw-intake-batch-form]');form.elements.reason.value='Confirmed duplicate reports; saved coverage checked.';form.elements.acknowledge.checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));return form;};
 return {dom,w,$,f,ctx,calls,entries,control,wait,add,render,refresh,commands,select,confirm,maxInFlight:()=>maxInFlight};
}
(async()=>{
 {
  const t=await setup();try{
   t.add('a');t.add('b');t.add('processing',{intakeState:'pending'});t.add('saved',{absenceApplied:true});t.add('other-date',{dates:['2026-12-01']});const state=await t.render();
   assert.equal(t.w.document.querySelectorAll('[data-select-intake]').length,2,'only eligible reports shown for this date can be selected');t.$('[data-select-intake="a"]').click();assert.equal(t.w.document.activeElement,t.$('[data-select-intake="a"]'),'checkbox keeps keyboard focus across redraw');assert.equal(t.$('[data-select-intake="a"]').closest('details').open,false,'selection does not toggle the report details');assert.match(t.$('[data-withdraw-selected-intake]').textContent,/1/);t.$('[data-clear-intake-selection]').click();assert(t.$('[data-withdraw-selected-intake]').disabled);t.select();assert.equal(t.commands().length,0);assert.match(t.$('[data-dialog-body]').textContent,/a/);assert.match(t.$('[data-dialog-body]').textContent,/b/);assert.match(t.$('[data-dialog-body]').textContent,/unrecorded/i);t.$('[data-cancel-intake-batch]').click();assert.equal(t.commands().length,0,'cancel before confirmation sends nothing');
   t.$('[data-withdraw-selected-intake]').click();let form=t.$('[data-withdraw-intake-batch-form]');form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(t.commands().length,0);form.elements.reason.value='Reason only';form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(t.commands().length,0,'explicit acknowledgement is required');
   const before=JSON.stringify(t.f.state.absences);t.control.gate=deferred();const gate=t.control.gate;form=t.confirm();form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));await t.wait(()=>t.commands().length===1);assert.equal(t.commands()[0].intakeRequestId,'a');assert.equal(t.commands().length,1,'one row is in flight');t.add('new-arrival');gate.resolve();await t.wait(()=>t.commands().length===2&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','b'],'frozen selection does not include newly arrived reports');assert.equal(t.maxInFlight(),1);assert.equal(new Set(t.commands().map(p=>p.requestId)).size,2);for(const p of t.commands()){assert.equal(p.resolution,'withdraw');assert.equal(p.reason,'Confirmed duplicate reports; saved coverage checked.');assert.equal(p.date,t.f.ctx.today);}assert.equal(JSON.stringify(t.f.state.absences),before);assert.match(t.$('[data-intake-batch-status]').textContent,/2 of 2/);assert.match(t.$('[data-ops-intake]').textContent,/Withdrawn by SMC/);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.add('a');t.add('b');t.add('c');const state=await t.render();t.control.loseId='b';t.select();t.confirm();await t.wait(()=>t.$('[data-retry-save]')&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','b']);assert.match(t.$('[data-intake-batch-status]').textContent,/1 of 3/);const uncertain=structuredClone(t.commands()[1]);t.$('[data-retry-save]').click();await t.wait(()=>t.commands().length===4&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','b','b','c']);assert.deepEqual(t.commands()[2],uncertain,'unknown outcome retries its exact retained request');assert.match(t.$('[data-intake-batch-status]').textContent,/3 of 3/);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.add('a');t.add('b');t.add('c');const state=await t.render();t.control.rejectId='b';t.select();t.confirm();await t.wait(()=>t.commands().length===2&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','b']);assert.match(t.$('[data-intake-batch-status]').textContent,/1 of 3/);assert.equal(t.$('[data-retry-save]'),null,'definitive conflict requires fresh review rather than blind retry');await t.refresh();t.$('[data-withdraw-selected-intake]').click();t.confirm();await t.wait(()=>t.commands().length===4&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','b','b','c'],'confirmed successful a is not resent');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.add('a');t.add('b');const state=await t.render();t.control.loseId='a';t.select();t.confirm();await t.wait(()=>t.$('[data-retry-save]')&&!state.busy);t.ctx.profile.user={...t.ctx.profile.user};t.$('[data-retry-save]').click();await t.wait(()=>t.commands().length===2&&!state.busy);assert.deepEqual(t.commands().map(p=>p.intakeRequestId),['a','a']);assert.match(t.$('[data-intake-batch-status]').textContent,/1 of 2/);assert.match(t.$('[data-intake-batch-status]').textContent,/Stopped because/);assert.doesNotMatch(t.$('[data-intake-batch-status]').textContent,/Retry the same save/,'confirmed retry after reauthentication must replace stale paused guidance');
  }finally{t.dom.window.close();}
 }
 for(const change of ['navigation','date','authority','identity','reauthentication']){
  const t=await setup();try{
   t.add('a');t.add('b');const state=await t.render();t.control.gate=deferred();const gate=t.control.gate;t.select();t.confirm();await t.wait(()=>t.commands().length===1);
   if(change==='navigation')await t.render('Report Absence');else if(change==='date')state.date='2026-12-01';else if(change==='authority')t.ctx.profile.user={...t.ctx.profile.user,smc:false,admin:false};else if(change==='identity')t.ctx.profile.user={...t.ctx.profile.user,email:'other@gsps.edu.sg'};else t.ctx.profile.user={...t.ctx.profile.user};
   gate.resolve();await new Promise(resolve=>setTimeout(resolve,40));assert.equal(t.commands().length,1,change+' during a response stops unsent rows');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.add('a');const b=t.add('b');await t.render();t.$('[data-select-all-intake]').click();t.add('new');b.intakeState='pending';await t.refresh();assert.equal(t.$('[data-select-intake="new"]').checked,false);assert.equal(t.$('[data-select-intake="b"]'),null);assert.match(t.$('[data-withdraw-selected-intake]').textContent,/1/);t.$('[data-withdraw-selected-intake]').click();t.entries[0].intakeState='pending';await t.refresh();t.confirm();assert.equal(t.commands().length,0,'changed eligibility invalidates an open confirmation');
   t.ctx.profile.user={...t.ctx.profile.user,smc:false,admin:false};await assert.rejects(()=>t.render('Assign Relief'),/access/);await t.render('Report Absence');assert.equal(t.$('[data-select-all-intake]'),null);assert.equal(t.$('[data-select-intake]'),null);assert.equal(t.$('[data-withdraw-selected-intake]'),null);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{for(let i=0;i<151;i++)t.add('merged-'+i);await t.render();assert.equal(t.w.document.querySelectorAll('[data-select-intake]').length,151,'merged backend lists are not hidden behind a new frontend cap');t.$('[data-select-all-intake]').click();assert.equal(t.w.document.querySelectorAll('[data-select-intake]:checked').length,151);assert.equal(t.commands().length,0);}finally{t.dom.window.close();}
 }
 console.log('PASS selective received-report withdrawal: verified scope, frozen selection, acknowledgement, sequential writes, exact uncertain retry, partial-stop recovery, and navigation/authority stops.');
})().catch(error=>{console.error(error);process.exitCode=1;});
