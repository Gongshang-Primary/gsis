'use strict';
// Real Roster UI/domain; only the remote durable-intake transport is simulated.
let previewAbsenceClash,applyAbsenceClash;
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[],journal=new Map(),control={};
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const receipt=entry=>({accepted:true,intakeReceipt:true,receiptOnly:true,requestId:entry.requestId,savedIds:entry.savedIds,acceptedAt:entry.acceptedAt,intakeState:entry.intakeState,absenceApplied:entry.absenceApplied,peerState:entry.peerState,mutualRequestIds:entry.mutualRequestIds,resolution:entry.resolution,transportState:entry.transportState,instructionState:entry.instructionState});
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));
  if(p.operation==='read'&&p.view==='absenceClash')return previewAbsenceClash(f.state,f.ctx,p);
  if(p.operation==='read'&&p.view==='intakeReview'){const entry=journal.get(p.intakeRequestId),preview=previewAbsenceClash(f.state,f.ctx,entry.command);return {...receipt(entry),readOnly:true,requested:entry.command,teachers:[{name:'Alice',missingDates:[],dates:[{date:f.ctx.today,savedEntries:f.state.absences.filter(a=>!a.deletedAt)}]}],resolutionOptions:['replace','keep'],replacementToken:preview.token,overlapToken:'a'.repeat(64)};}
  if(p.operation==='read'&&p.view==='intake')return {revision:'intake-1',entries:[...journal.values()].map(entry=>structuredClone(entry)),pendingCaptureCount:journal.size,peerReviewCount:0};
  if(['saveAbsence','requestMutual'].includes(p.operation)&&p.intake===true){
   const entry={requestId:p.requestId,command:structuredClone(p),dates:[p.date],acceptedAt:f.ctx.iso,intakeState:'pending',absenceApplied:false,savedIds:[],peerState:p.operation==='requestMutual'||p.ownArrangementsByStaffDate?'pending':'none',mutualRequestIds:[],reasonCode:''};if(control.park){entry.intakeState='needsReview';}else{const applied=applyAbsenceClash(f.state,{...f.ctx,attendanceOnly:true},p);Object.assign(entry,{savedIds:applied.savedIds,intakeState:'applied',absenceApplied:true});}journal.set(p.requestId,entry);
   if(control.dropResponse){control.dropResponse=false;throw Object.assign(Error('Response was lost'),{status:503});}return receipt(entry);
  }
  if(p.operation==='resolveAbsenceIntake'){const entry=journal.get(p.intakeRequestId);if(p.resolution==='replace'){const applied=applyAbsenceClash(f.state,{...f.ctx,attendanceOnly:true},{...entry.command,absenceClashToken:p.replacementToken,confirmAbsenceReplacement:true});Object.assign(entry,{intakeState:'applied',absenceApplied:true,savedIds:applied.savedIds,resolution:{action:'replace'}});return receipt(entry);}Object.assign(entry,{intakeState:'withdrawn',resolution:{action:'withdraw',reason:p.reason,at:f.ctx.iso,actorName:'Alice Teacher'}});if(control.dropResolution){control.dropResolution=false;throw Object.assign(Error('Resolution response lost'),{status:503});}return receipt(entry);}
  if(p.operation==='receiptStatus'&&p.command.intake===true){const entry=journal.get(p.command.requestId);return entry?receipt(entry):{accepted:false,requestId:p.command.requestId};}
  if(control.failRead&&p.operation==='read')throw Object.assign(Error('Records unavailable'),{status:503});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return {...structuredClone(result.data),absenceClashSupported:true};
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const preview=()=>{$('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 return {dom,w,$,f,ctx,calls,journal,control,wait,preview};
}

(async()=>{
 ({previewAbsenceClash,applyAbsenceClash}=await import('../roster-update/public/edge-absence-clash.js'));
 for(const overlap of [false,true]){
  const t=await setup();try{
   t.w.GSISRosterOperations.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[overlap?2:3],reliefRequired:true});
   let prompts=[],accept=false;t.w.confirm=text=>{prompts.push(text);return accept;};
   const state=await t.w.RosterOpsUI.render('Report Absence',t.ctx);t.preview();t.$('[data-save-instructions]').click();
   await t.wait(()=>!state.clashChecking);
   if(overlap){
    assert.equal(prompts.length,1);assert.match(prompts[0],/Replace the current absence/);assert.match(prompts[0],/P2/);assert.equal(t.journal.size,0,'cancel does not capture or delete');assert.equal(t.f.state.absences.filter(a=>!a.deletedAt).length,1);
    accept=true;t.control.dropResponse=true;t.$('[data-save-instructions]').click();await t.wait(()=>t.$('[data-retry-save]')&&!state.busy);t.$('[data-retry-save]').click();await t.wait(()=>!state.busy&&!t.$('[data-retry-save]'));assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'lost acknowledgement reuses receipt, never replaces twice');assert.equal(t.f.state.absences.filter(a=>!a.deletedAt).length,1);assert(t.f.state.absences.some(a=>a.deletedAt));
   }else{await t.wait(()=>t.journal.size===1&&!state.busy);assert.equal(prompts.length,0,'disjoint report saves without a prompt');assert.equal(t.f.state.absences.filter(a=>!a.deletedAt).length,2);}
  }finally{t.w.RosterOpsUI.unmount();t.w.close();}
 }
 const t=await setup();try{
  t.w.GSISRosterOperations.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2],reliefRequired:true});
  t.w.confirm=()=>true;t.control.park=true;const state=await t.w.RosterOpsUI.render('Report Absence',t.ctx);t.preview();t.$('[data-save-instructions]').click();
  await t.wait(()=>t.$('[data-replace-current]')&&!state.busy);
  assert.equal(t.f.state.absences.filter(a=>!a.deletedAt).length,1,'queued review has not replaced the old absence');
  t.$('[data-replace-current]').click();await t.wait(()=>[...t.journal.values()][0].absenceApplied&&!state.busy);
  assert.equal(t.f.state.absences.filter(a=>!a.deletedAt).length,1);assert(t.f.state.absences.some(a=>a.deletedAt));
  assert.equal(t.calls.filter(p=>p.operation==='resolveAbsenceIntake').length,1);
 }finally{t.w.RosterOpsUI.unmount();t.w.close();}
 console.log('PASS real report form: disjoint save, overlap acknowledgement/cancel, replacement and lost-acknowledgement receipt retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
