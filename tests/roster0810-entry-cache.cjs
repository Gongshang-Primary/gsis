'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const file='tests/roster704-entry-read.cjs',source=fs.readFileSync(file,'utf8'),box={require:createRequire(path.resolve(file)),console,setTimeout,structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+'\nthis.setup=setup;',box);
(async()=>{
 const t=await box.setup();try{
  const a=t.f.state.absences[0];a.coverage={kind:'fullDay'};a.periodSnapshot=structuredClone(t.f.day.periods);a.timetablePending=false;
  const api=t.ctx.api;t.ctx.api=async(route,p)=>{const result=await api(route,p);for(const row of [...(result.absences||[]),...(result.ownAbsences||[])])row.absenceToken='a'.repeat(64);return result;};
  await t.render('Manage reported absences');const reads=t.calls.length;
  t.controls.entryGate=new Promise(()=>{});t.$('[data-edit-entry]').click();
  assert(t.$('[data-edit-form]'),'full-day absence editor opens immediately from the saved record');assert.equal(t.calls.length,reads,'fresh saved period snapshot needs no extra entry request');
  assert.equal(t.$('[data-save-entry]').disabled,false);
  t.$('[data-edit-form]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));
  await t.wait(()=>t.calls.some(p=>p.operation==='saveAbsence'));
  assert.equal(t.calls.find(p=>p.operation==='saveAbsence').expectedAbsenceToken,'a'.repeat(64),'edit preserves the row token captured when the editor opened');
  console.log('PASS full-day cached editor: immediate render, zero entry reads, exact row token sent with save.');
 }finally{t.dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
