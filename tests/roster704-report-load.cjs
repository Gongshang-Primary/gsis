'use strict';
// Production UI and domain with synthetic API gates; no school records or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};if(p.operation==='read'&&controls.readGate)await controls.readGate;if(p.operation==='saveAbsence'&&controls.saveGate)await controls.saveGate;if(p.operation==='candidates'&&controls.candidateGate)await controls.candidateGate;if(p.operation==='candidates'&&controls.candidateFailure)throw Error('Colleague availability could not be checked.');
  if(p.operation==='read'&&controls.denied)throw Object.assign(Error('Denied'),{status:403});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});
  return result.data;
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const render=()=>w.RosterOpsUI.render('Report Absence',ctx),readCount=()=>calls.filter(p=>p.operation==='read'&&p.view!=='intake').length;
 function preview(){ $('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
 return {dom,w,$,f,controls,calls,ctx,wait,render,readCount,preview};
}
(async()=>{
 {
  const t=await setup();try{
   let release;t.controls.readGate=new Promise(r=>release=r);const warm=t.w.RosterOpsUI.preload(t.ctx);
   t.f.setClock(t.f.ctx.today+'T06:00:20+08:00');const opened=t.render();assert.equal(t.readCount(),1,'opening joins the still-pending preload, even after 15 seconds');
   t.controls.readGate=null;release();await warm;await opened;assert(t.$('[data-absence-form]'));assert.equal(t.$('#content').getAttribute('aria-busy'),'false');
   t.f.setClock(t.f.ctx.today+'T06:01:10+08:00');await t.render();assert.equal(t.readCount(),1,'freshness is measured from completed preload, not its start');
   assert.equal(t.$('.ops-progress'),null,'fresh cached Report opens without blocking overlay or repeat request');
   t.$('[data-ops-refresh]').click();await t.wait(()=>t.$('#content').getAttribute('aria-busy')==='false');assert.equal(t.readCount(),2,'explicit refresh still checks backend');
   t.f.setClock(t.f.ctx.today+'T06:02:11+08:00');await t.render();assert.equal(t.readCount(),3,'expired report data is refreshed');
   t.controls.denied=true;t.$('[data-ops-refresh]').click();await t.wait(()=>t.$('[data-reload]'));t.controls.denied=false;await t.render();assert.equal(t.readCount(),5,'denial purges completed preload as well as view cache');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   let release;t.controls.readGate=new Promise(r=>release=r);const warm=t.w.RosterOpsUI.preload(t.ctx);t.w.RosterOpsUI.resetPreloads();t.controls.readGate=null;release();await warm;await t.render();assert.equal(t.readCount(),2,'a late preload cannot repopulate cache after logout/reset');
   t.ctx.profile={user:{...t.f.profile.user,smc:false,admin:false}};await t.render();assert.equal(t.readCount(),3,'changed role does not reuse old privileged report');
   t.ctx.profile={user:{...t.f.profile.user,email:'other@gsps.edu.sg'}};await t.render();assert.equal(t.readCount(),4,'changed account does not reuse old report');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   await t.render();t.preview();
   assert(t.$('[data-own-arrangements]'),'Own arrangements is available in the preview without saving');
   assert.equal(t.$('[data-save-instructions]').textContent,'Submit absence');
   const notes=t.$('[data-instruction]');notes.value='Read the worksheet.';notes.dispatchEvent(new t.w.Event('input'));
   assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,0,'preview and entered instructions remain local until a save action');
   let saveRelease,candidateRelease;t.controls.saveGate=new Promise(r=>saveRelease=r);t.controls.candidateGate=new Promise(r=>candidateRelease=r);
   t.$('[data-instructions-na]').click();assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,0,'no-instructions remains local');t.$('[data-save-instructions]').click();assert.equal(notes.value,'Read the worksheet.');assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'Submit absence starts exactly one save');
   assert.equal(t.f.state.absences.length,0);assert(t.$('[data-own-arrangements]'));assert.equal(t.$('[data-absence-form]').inert,true,'report controls wait for the save already in progress');assert.equal(t.$('[data-instructions-area]').inert,true,'Own arrangements waits for the save already in progress');assert.equal(t.$('[data-ops-body]').inert,false,'status remains perceivable while report controls are locked');assert.equal(t.calls.filter(p=>p.operation==='candidates').length,0,'availability is not requested for an unsaved report');
   t.controls.saveGate=null;saveRelease();await t.wait(()=>t.$('[data-own-arrangements]')&&t.$('#content').getAttribute('aria-busy')==='false');assert.equal(t.calls.filter(p=>p.operation==='candidates').length,0,'accepted submit does not prefetch optional colleague availability');
   assert.equal(t.f.state.absences.length,1);assert.match(t.$('[data-ops-message]').textContent,/Saved/);
   const payload=t.calls.find(p=>p.operation==='saveAbsence');assert.equal(payload.includeMutualCandidates,undefined);assert.equal(payload.date,t.f.ctx.today);assert.equal(payload.staffId,'alice');assert.equal(payload.instructionsNA,true);assert.match(JSON.stringify(payload.instructionsByDate),/Read the worksheet/);
   t.$('[data-own-arrangements]').click();assert(t.$('[data-colleague-filter]'),'saved Own arrangements opens synchronously');assert.equal(t.$('.ops-progress'),null,'optional availability does not block the local matrix');
   assert.match(t.$('[data-candidate-message]').textContent,/Checking current colleague availability/);assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'opening arrangements does not resubmit');
   t.$('[data-own-period="2"]').click();t.$('[data-colleague-filter]').value='Dora';t.$('[data-colleague-filter]').dispatchEvent(new t.w.Event('input'));assert.equal(t.$('[data-submit-mutual]').disabled,true,'no colleague request has been selected');
   t.controls.candidateGate=null;candidateRelease();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);assert.equal(t.$('[data-select-colleague="dora"][data-mutual-period="2"]').disabled,false);assert.equal(t.$('[data-select-colleague="charlie"][data-mutual-period="2"]').disabled,false,'occupied lesson is selectable for Combine');
   assert.equal(t.$('[data-colleague-filter]').value,'Dora','optional read preserves the local matrix');
   const before=t.calls.length;t.$('[data-colleague-filter]').value='';t.$('[data-colleague-filter]').dispatchEvent(new t.w.Event('input'));assert.equal(t.calls.length,before);
   assert.equal(t.readCount(),1,'submission and arrangements reuse their returned report rather than loading it again');
   t.f.setClock(t.f.ctx.today+'T06:01:01+08:00');t.$('[data-own-period="2"]').click();await t.wait(()=>t.calls.filter(p=>p.operation==='candidates').length===2);assert.equal(t.$('[data-submit-mutual]').disabled,true);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   let candidateRelease;t.controls.candidateGate=new Promise(r=>candidateRelease=r);t.controls.candidateFailure=true;
   await t.render();t.preview();t.$('[data-instructions-na]').click();t.$('[data-save-instructions]').click();await t.wait(()=>t.f.state.absences.length===1&&t.$('#content').getAttribute('aria-busy')==='false');
   t.$('[data-own-arrangements]').click();t.controls.candidateGate=null;candidateRelease();await t.wait(()=>t.$('[data-candidate-message]')&&/could not be checked/.test(t.$('[data-candidate-message]').textContent));
   assert.equal(t.f.state.absences.length,1,'optional availability failure never loses the saved absence');assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1);assert.equal(t.$('[data-submit-mutual]').disabled,true);
   t.controls.candidateFailure=false;t.$('[data-refresh-mutual]').click();await t.wait(()=>t.calls.filter(p=>p.operation==='candidates').length===2&&!/Checking current colleague availability/.test(t.$('[data-candidate-message]').textContent));assert.match(t.$('[data-candidate-message]').textContent,/Choose your lesson in the first row, then a colleague in the same period column/);
   assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'retry availability is read-only');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const state=await t.render();t.preview();let release;t.controls.saveGate=new Promise(r=>release=r);t.$('[data-instructions-na]').click();t.$('[data-save-instructions]').click();
   assert.equal(t.$('.ops-dialog'),null,'no stale arrangements matrix exists before the save receipt');
   t.f.day.id='replacement';t.controls.saveGate=null;release();await t.wait(()=>t.f.state.absences.length===1&&t.$('#content').getAttribute('aria-busy')==='false');assert.equal(state.data.timetable.id,'replacement','saved response adopts the current timetable');
   t.$('[data-own-arrangements]').click();await t.wait(()=>t.$('[data-candidate-message]')&&!/Checking current colleague availability/.test(t.$('[data-candidate-message]').textContent));
   assert.match(t.$('[data-own-period="2"]').textContent,/EL/);assert.equal(t.f.state.absences.length,1);assert.doesNotMatch(t.$('[data-candidate-message]').textContent,/timetable changed/);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const week={perDay:17,blocks:t.f.day.teachers.map(teacher=>({name:teacher.name,cells:Array.from({length:5},()=>structuredClone(teacher.cells)).flat()}))};t.ctx.cachedTimetable=()=>({modelId:'baseline',model:{even:week,odd:week}});
   const state=await t.render();t.preview();let release;t.controls.readGate=new Promise(r=>release=r);
   const from=t.$('[name=from]');from.value='2026-10-15';from.dispatchEvent(new t.w.Event('change'));
   t.$('[data-absence-form]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(t.$('[data-save-instructions]'),null,'a pending date check cannot preview stale lessons');assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,0);
   from.value=t.f.ctx.today;from.dispatchEvent(new t.w.Event('change'));t.controls.readGate=null;release();await new Promise(resolve=>setImmediate(resolve));
   assert.equal(state.date,t.f.ctx.today,'late next-day response cannot replace the selected cached date');assert.equal(t.readCount(),2,'returning to the fresh first day uses its cached result');
   const to=t.$('[name=to]');to.value=t.f.ctx.today;to.dispatchEvent(new t.w.Event('change'));
   for(const chip of t.w.document.querySelectorAll('[data-absence-teacher] .teacher-chip'))chip.click();const teacher=t.$('[data-absence-teacher] [data-teacher-search]');teacher.value='Charlie';teacher.dispatchEvent(new t.w.Event('input'));t.$('[data-absence-teacher] [role=option][data-staff=charlie]').click();assert.equal(t.readCount(),2,'matching cached baseline serves the new teacher locally');
   t.$('[data-absence-form]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.match(t.$('[data-instructions-area]').textContent,/MA/);assert.doesNotMatch(t.$('[data-instructions-area]').textContent,/4A/,'previous teacher lessons do not survive a teacher change');
   t.$('[data-instructions-na]').click();t.$('[data-save-instructions]').click();await t.wait(()=>t.f.state.absences.length===1&&t.$('#content').getAttribute('aria-busy')==='false');
   assert.equal(t.f.state.absences.length,1);assert.equal(t.f.state.absences[0].date,t.f.ctx.today);assert.equal(t.f.state.absences[0].staffId,'charlie','no-instructions submission uses the current date and teacher');
  }finally{t.dom.window.close();}
 }
 console.log('PASS Report load: one in-flight preload, completion-based freshness, warm entry without read, expiry/explicit refresh, auth/role/reset isolation, staged preview without writes, direct no-instructions submit, saved Own Arrangements, independent availability, local controls, freshness gating and stale date/teacher protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
