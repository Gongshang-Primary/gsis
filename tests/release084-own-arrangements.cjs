'use strict';
// Synthetic API gates around the production UI and domain; no live school data or messages.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(compact=false){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;if(compact)f.day.staplerRevision=1;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));
  if(p.operation==='read'&&controls.readGate)await controls.readGate;
  if(['saveAbsence','saveInstructions'].includes(p.operation)&&controls.saveGate)await controls.saveGate;
  if(['saveAbsence','saveInstructions'].includes(p.operation)&&controls.denySave)throw Object.assign(Error('Synthetic validation failed'),{status:400});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});const data=result.data;if(compact&&data.timetable&&p.operation!=='candidates'){data.timetable={...data.timetable,staplerRevision:1,teachers:data.timetable.teachers.filter(t=>t.staffId===f.ctx.user.staffId)};}return structuredClone(data);
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const idle=()=>wait(()=>$('#content').getAttribute('aria-busy')==='false');
 const state=await w.RosterOpsUI.render('Report Absence',ctx);
 const input=(selector,value,event='input')=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));};
 const preview=()=>{$('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 const writes=()=>calls.filter(p=>!w.GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus');
 return {dom,w,$,f,controls,calls,ctx,state,wait,idle,input,preview,writes};
}

(async()=>{
 const t=await setup(true);try{
  t.preview();let release;t.controls.saveGate=new Promise(r=>release=r);t.$('[data-own-arrangements]').click();
  assert(t.$('[data-colleague-filter]'),'Own arrangements renders the filter without saving');assert.equal(t.writes().length,0);
  assert.equal(t.calls.some(p=>p.operation==='requestMutual'),false);
  t.controls.saveGate=null;release();await t.wait(()=>t.$('[data-colleague-filter]'));await t.idle();
  await t.wait(()=>t.calls.some(p=>p.operation==='candidates'));await new Promise(r=>setTimeout(r,20));
  t.$('[data-own-period="2"]').click();
  const colleague=t.$('[data-select-colleague="dora"][data-mutual-period="2"]');
  assert(colleague&&!colleague.hidden&&!colleague.disabled,'authoritative ordinary colleagues appear with a compact suspended teacher-only timetable');
  colleague.click();assert.equal(t.$('[data-submit-mutual]').disabled,false);
  assert.equal(t.calls.some(p=>p.operation==='requestMutual'),false,'selection does not send a request');
 }finally{t.dom.window.close();}
 {
  const t=await setup();try{
   t.preview();let release;t.controls.saveGate=new Promise(r=>release=r);t.$('[data-own-arrangements]').click();t.$('[data-close-dialog]').click();
   t.controls.saveGate=null;release();await t.idle();await new Promise(r=>setTimeout(r,10));
   assert.equal(t.$('dialog'),null,'closing during save prevents late reopen');assert.equal(t.f.state.absences.length,0,'closing the chooser does not create an absence');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.input('[data-instruction]','Retain my local notes.');t.$('[data-instruction]').focus();t.$('[data-instruction]').setSelectionRange(4,4);
   await t.$('[data-ops-refresh]').onclick();await t.idle();
   assert.equal(t.$('[data-instruction]').value,'Retain my local notes.','refresh retains preview instructions');assert.equal(t.w.document.activeElement,t.$('[data-instruction]'));assert.equal(t.$('[data-instruction]').selectionStart,4);
   t.$('[data-save-instructions]').click();await t.idle();t.input('[data-instruction]','Changed saved instruction.');await t.$('[data-ops-refresh]').onclick();await t.idle();
   assert.equal(t.$('[data-instruction]').value,'Changed saved instruction.','refresh retains saved-record instruction drafts');
   t.$('[data-save-instructions]').click();await t.idle();const patch=t.calls.filter(p=>p.operation==='saveInstructions').at(-1);
   assert.equal(patch.instructionChanges.length,1);assert.equal(Object.keys(patch.instructionChanges[0].values).length,1);assert.equal(Object.values(patch.instructionChanges[0].base)[0],'Retain my local notes.');
   assert.equal(Object.values(t.f.state.absences[0].instructions)[0],'Changed saved instruction.');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   let release;t.controls.readGate=new Promise(r=>release=r);t.input('[name=from]','2026-10-15','change');
   assert.equal(t.$('[data-ops-body]').inert,false,'date check leaves report controls usable');t.$('[data-period="2"]').click();
   assert.equal(t.$('[data-period="2"]').getAttribute('aria-pressed'),'true');assert.equal(t.$('[data-log-absence]').disabled,true,'unverified day cannot be submitted');
   t.controls.readGate=null;release();await t.idle();assert.equal(t.$('[name=from]').value,'2026-10-15');assert.equal(t.$('[data-period="2"]').getAttribute('aria-pressed'),'true');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.$('[data-save-instructions]').click();await t.idle();t.input('[data-instruction]','My retained edit.');
   const record=t.f.state.absences[0],key=Object.keys(record.instructions)[0];record.instructions[key]='A concurrent saved edit.';t.f.state.revision++;
   t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.$('[data-instruction-review]'),null,'information saves have no source-comparison gate');assert.equal(t.$('[data-instruction]').value,'My retained edit.');t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.f.state.absences[0].instructions[key],'My retained edit.');assert(t.f.state.absences[0].instructionNotes[key].history.some(row=>row.text==='A concurrent saved edit.'),'concurrent text remains in history');

  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.input('[name=to]','2026-10-15','change');t.preview();t.$('[data-save-instructions]').click();await t.idle();t.input('[data-instruction]','First date unsaved note.');
   t.input('[data-instruction-date]','2026-10-15','change');await t.idle();t.$('[data-instructions-na]').click();await t.idle();
   assert.match(JSON.stringify(t.f.state.absences.find(a=>a.date==='2026-10-14').instructions),/First date unsaved note/,'NA across dates saves retained drafts for every affected date');assert(t.f.state.absences.every(a=>a.instructionsNA));assert.equal(t.state.instructionDrafts.size,0);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.$('[data-save-instructions]').click();await t.idle();t.input('[data-instruction]','Text from the old lesson.');
   t.f.day.teachers[0].cells[2]=['MA','5A','C5-01',''];t.f.day.staplerRevision=2;t.f.state.revision++;await t.$('[data-ops-refresh]').onclick();await t.idle();
   assert.equal(t.$('[data-keep-instruction-edits]'),null,'changed timetable is not an instruction review gate');assert.match(t.$('[data-retained-instruction-notes]').textContent,/Text from the old lesson/);assert.equal(t.$('[data-save-instructions]').disabled,false);
   t.input('[data-instruction]','Reviewed current lesson text.');t.$('[data-save-instructions]').click();await t.idle();assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Reviewed current lesson text/);assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Text from the old lesson/,'unmatched original text is retained alongside current input');
  }finally{t.dom.window.close();}
 }
 console.log('PASS v0.8.4 compact suspended candidates, immediate unsaved dialog, close isolation, responsive dates, retained focus/drafts, surgical instruction saves, explicit conflict recovery and multi-date NA preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
