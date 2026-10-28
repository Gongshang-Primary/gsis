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
  if(p.view==='intakeReview')return {readOnly:true,requestId:p.intakeRequestId,checkedAt:f.ctx.iso,requested:{periods:[2],typeLabel:'MC',reliefRequired:true},teachers:[{name:'Alice',missingDates:[f.ctx.today],dates:[{date:f.ctx.today,savedEntries:[]}]}]};
  if(p.operation==='retryAbsenceIntake'){if(control.retryGate){const gate=control.retryGate;delete control.retryGate;await gate.promise;}if(control.malformedRetry)return {accepted:true,requestId:p.requestId};if(control.loseRetry){control.loseRetry=false;throw Error('Response lost');}const row=entries.find(e=>e.requestId===p.requestId);row.intakeState='pending';return {...row,accepted:true,intakeReceipt:true};}
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
 for(const mode of ['changed','malformed']){
  const x=await setup();try{x.add('first');x.add('second');const st=await x.render('Report Absence');x.$('[data-select-all-intake]').click();x.control.retryGate=deferred();const gate=x.control.retryGate;x.control.malformedRetry=mode==='malformed';x.$('[data-retry-selected-intake]').click();await x.wait(()=>x.calls.some(p=>p.operation==='retryAbsenceIntake'));
   if(mode==='changed'){x.entries[1].failureCode='ABSENCE_SHORTER_CONFIRMATION';await x.refresh();}
   gate.resolve();await x.wait(()=>!st.intakeRetryRunning);assert.equal(x.calls.filter(p=>p.operation==='retryAbsenceIntake').length,1,mode+' must stop remaining batch');
  }finally{x.dom.window.close();}
 }
 const t=await setup();try{
  t.add('done',{intakeState:'withdrawn',resolution:{action:'withdraw',at:t.f.ctx.iso}});t.add('pending');const state=await t.render('Report Absence');
  assert(t.$('[data-review-intake="pending"]'),'SMC reviews reports directly on Report Absence');
  assert(t.$('[data-retry-intake="pending"]'),'SMC retries original receipt');
  t.$('[data-dismiss-intake="done"]').click();assert(t.$('[data-delete-history="done"]'),'history entry has delete control');
  t.$('[data-delete-history="done"]').click();assert(!t.$('[data-intake-receipt="done"]'));await t.refresh();assert(!t.$('[data-intake-receipt="done"]'),'deleted completed update stays hidden on refresh');
  t.add('done2',{intakeState:'withdrawn'});await t.refresh();t.$('[data-dismiss-intake="done2"]').click();t.$('[data-clear-history]').click();assert(!t.$('[data-intake-receipt="done2"]'));
  t.entries[0].intakeState='needsReview';await t.refresh();assert(t.$('[data-intake-receipt="done"]'),'renewed work reappears');
  t.control.loseRetry=true;t.$('[data-retry-intake="pending"]').click();await t.wait(()=>t.$('[data-retry-intake="pending"]')?.textContent.includes('Retry same report'));
  t.$('[data-retry-intake="pending"]').click();await t.wait(()=>t.calls.filter(p=>p.operation==='retryAbsenceIntake').length===2);assert.deepEqual(t.calls.filter(p=>p.operation==='retryAbsenceIntake')[0],t.calls.filter(p=>p.operation==='retryAbsenceIntake')[1]);
  await t.refresh();assert(!t.$('[data-retry-intake="pending"]'),'processing reports cannot be retried again');
  t.add('x');t.add('y');await t.refresh();t.$('[data-select-all-intake]').click();assert(t.$('[data-retry-selected-intake]'));t.$('[data-retry-selected-intake]').click();await t.wait(()=>t.calls.filter(p=>p.operation==='retryAbsenceIntake').length===5);
  t.add('reviewed');await t.refresh();t.$('[data-review-intake="reviewed"]').click();await t.wait(()=>t.$('[data-apply-reviewed]'));assert.match(t.$('[data-intake-review]').textContent,/Dates with no saved entry/);t.$('[data-apply-reviewed]').click();await t.wait(()=>!t.$('[data-apply-reviewed]'));assert.equal(t.calls.filter(p=>p.operation==='retryAbsenceIntake').at(-1).requestId,'reviewed');
  t.ctx.profile.user={...t.ctx.profile.user,smc:false,admin:false};await t.render('Report Absence');assert(!t.$('[data-withdraw-intake]'));assert(!t.$('[data-review-intake]'));
  console.log('PASS E management: history deletion, reopened work, SMC page scope, exact retry identity and bulk retry');
 }finally{t.dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
