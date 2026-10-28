'use strict';
// Synthetic API gates around the production UI and domain; no live school data or messages.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));
  if(['saveAbsence','saveInstructions'].includes(p.operation)&&controls.saveGate)await controls.saveGate;
  if(['saveAbsence','saveInstructions'].includes(p.operation)&&controls.denySave)throw Object.assign(Error('Synthetic validation failed'),{status:400});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const idle=()=>wait(()=>$('#content').getAttribute('aria-busy')==='false');
 const state=await w.RosterOpsUI.render('Report Absence',ctx);
 const input=(selector,value,event='input')=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));};
 const preview=()=>{$('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 const writes=()=>calls.filter(p=>!w.GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus');
 return {dom,w,$,f,controls,calls,ctx,state,wait,idle,input,preview,writes};
}
const assertNoPeerWrites=t=>assert.equal(t.calls.some(p=>['requestMutual','setNoRelief','assign'].includes(p.operation)),false,'opening the chooser neither sends a peer request nor changes cover');
(async()=>{
 for(const note of ['', 'Use the worksheet and keep the written instructions.']){
  const t=await setup();try{
   t.preview();const own=t.$('[data-own-arrangements]');assert(own);assert.equal(own.previousElementSibling,t.$('[data-instructions-na]'));
   t.input('[data-instruction]',note);own.click();own.click();assert.equal(t.writes().length,0,'repeated opening performs no writes');assert(t.$('[data-colleague-filter]'));await t.wait(()=>t.calls.some(p=>p.operation==='candidates'));
   assert.equal(t.f.state.absences.length,0);assert.equal(t.$('[data-instruction]').value,note);assertNoPeerWrites(t);
   t.$('[data-close-dialog]').click();assert.equal(t.w.document.activeElement,t.$('[data-own-arrangements]'),'closing restores trigger focus');
   t.$('[data-save-instructions]').click();await t.idle();const saved=t.f.state.absences[0];assert.equal(saved.instructionsNA,false);assert.equal(saved.reliefRequired,true);assert.equal(Object.values(saved.instructions)[0],note);assert.equal(t.f.state.absences.length,1);
   t.input('[data-instruction]','Revised instruction text.');t.$('[data-own-arrangements]').click();assert(t.$('[data-colleague-filter]'));assert.deepEqual(t.writes().map(p=>p.operation),['saveAbsence'],'opening keeps dirty saved instructions local');assert.equal(Object.values(t.f.state.absences[0].instructions)[0],note);
   t.$('[data-close-dialog]').click();t.$('[data-save-instructions]').click();await t.idle();assert.deepEqual(t.writes().map(p=>p.operation),['saveAbsence','saveInstructions']);assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Revised instruction text/);assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.input('[data-instruction]','Retain this text when instructions are not applicable.');t.$('[data-instructions-na]').click();assert.equal(t.writes().length,0,'preview NA is local until Submit absence');
   t.$('[data-own-arrangements]').click();assert(t.$('[data-colleague-filter]'));assert.equal(t.writes().length,0);t.$('[data-close-dialog]').click();t.$('[data-save-instructions]').click();await t.idle();
   assert.equal(t.writes().length,1);assert.equal(t.f.state.absences[0].instructionsNA,true);assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Retain this text/);assert.equal(t.$('[data-instruction]').readOnly,true);assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.input('[name=to]','2026-10-15','change');t.preview();t.input('[data-instruction]','Wednesday only.');
   t.input('[data-instruction-date]','2026-10-15','change');await t.idle();t.input('[data-instruction]','Thursday only.');
   t.$('[data-own-arrangements]').click();assert(t.$('[data-colleague-filter]'));assert.equal(t.f.state.absences.length,0);assert.equal(t.state.date,'2026-10-15');assert.match(t.$('dialog').textContent,/15 Oct 2026/);const candidate=t.calls.find(p=>p.operation==='candidates');assert.equal(candidate.previewAbsence.date,'2026-10-15');assert.equal(candidate.previewAbsence.staffId,'alice');
   t.$('[data-close-dialog]').click();t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.f.state.absences.length,2);assert.match(JSON.stringify(t.f.state.absences.find(a=>a.date==='2026-10-15').instructions),/Thursday only/);assert.match(JSON.stringify(t.f.state.absences.find(a=>a.date==='2026-10-14').instructions),/Wednesday only/);assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.input('[data-instruction]','Keep this after a rejected save.');t.controls.denySave=true;t.$('[data-own-arrangements]').click();assert(t.$('[data-colleague-filter]'));assert.equal(t.writes().length,0);t.$('[data-close-dialog]').click();t.$('[data-save-instructions]').click();await t.idle();
   assert.equal(t.f.state.absences.length,0);assert.equal(t.$('[data-instruction]').value,'Keep this after a rejected save.');assert.equal(t.$('[data-own-arrangements]').disabled,false);
   t.controls.denySave=false;t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.f.state.absences.length,1);assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();t.input('[data-instruction]','Keep this during receipt recovery.');t.$('[data-own-arrangements]').click();t.$('[data-close-dialog]').click();t.f.fail='after-save';t.$('[data-save-instructions]').click();await t.wait(()=>t.$('[data-retry-save]'));
   assert.equal(t.$('dialog'),null);assert.equal(t.f.state.absences.length,1);assert.equal(t.$('[data-instructions-area]').inert,true);const sent=t.writes()[0];t.$('[data-retry-save]').click();await t.idle();
   assert.equal(t.writes().length,1,'receipt recovery never resends accepted absence');assert.deepEqual(t.calls.find(p=>p.operation==='receiptStatus').command,sent);assert.equal(t.f.state.absences.length,1);assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Keep this during receipt recovery/);assert.equal(t.$('dialog'),null,'accepted save does not reopen chooser');assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();let release;t.controls.saveGate=new Promise(r=>release=r);const saving=t.$('[data-save-instructions]').onclick();await t.w.RosterOpsUI.render('My Relief Duties',t.ctx);t.controls.saveGate=null;release();await saving;
   assert.equal(t.f.state.absences.length,1,'navigation does not lose accepted absence');assert.equal(t.$('dialog'),null);assert.equal(t.calls.some(p=>p.operation==='candidates'),false);assertNoPeerWrites(t);
  }finally{t.dom.window.close();}
 }
 console.log('PASS Own arrangements draft lifecycle: zero opening writes, local NA/instructions, explicit save, multi-day scope, recovery, focus and navigation isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
