'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const file='tests/roster704-entry-read.cjs',source=fs.readFileSync(file,'utf8'),box={require:createRequire(path.resolve(file)),console,setTimeout,structuredClone};vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+'\nthis.setup=setup;',box);
(async()=>{
 for(const page of ['Manage reported absences','Absences by Date']){
  const t=await box.setup();try{
   const a=t.f.state.absences[0];a.coverage={kind:'timeRange',startMinutes:475,endMinutes:510};a.periodSnapshot=structuredClone(t.f.day.periods);a.timetablePending=false;
   const before=structuredClone(a),s=await t.render(page),reads=t.calls.length;
   assert.match(t.$('[data-ops-body]').textContent,/P1–P2/,'list shows projected periods instead of clock coverage');
   t.$('[data-edit-entry]').click();await t.wait(()=>t.$('[data-edit-form]'));
   assert.equal(t.$('[name=coverageKind]'),null,'existing clock coverage uses period buttons');
   assert.equal(t.$('[data-edit-periods] [data-period="1"]').getAttribute('aria-pressed'),'true');
   assert.equal(t.$('[data-edit-periods] [data-period="2"]').getAttribute('aria-pressed'),'true');
   assert.match(t.$('[data-edit-periods] [data-period="1"]').getAttribute('aria-label'),/07:30 to 08:00/);
   assert.equal(JSON.stringify(t.f.state.absences[0]),JSON.stringify(before),'opening editor does not change record');
   assert.equal(t.calls.length,reads,'fresh saved timing opens without another fetch');
   await t.submit();assert.deepEqual(t.calls.find(p=>p.operation==='saveAbsence').coverage,before.coverage,'reason-only save retains exact original interval');
   t.$('[data-edit-entry]').click();await t.wait(()=>t.$('[data-edit-form]'));
   t.$('[data-edit-periods] [data-period="1"]').click();await t.submit();
   const payload=t.calls.filter(p=>p.operation==='saveAbsence').at(-1);
   assert.equal(payload.coverage,undefined,'explicit period edit replaces clock coverage');assert.deepEqual(Array.from(payload.periods),[2]);
   assert.equal(t.f.state.absences[0].coverage,undefined);assert.deepEqual(Array.from(t.f.state.absences[0].periods),[2]);
  }finally{t.dom.window.close();}
 }
 const t=await box.setup();try{
  const a=t.f.state.absences[0];a.coverage={kind:'fullDay'};a.periodSnapshot=structuredClone(t.f.day.periods);a.timetablePending=false;
  await t.render('Manage reported absences');t.$('[data-edit-entry]').click();
  assert.equal(t.dom.window.document.querySelectorAll('[data-edit-periods] .selected').length,t.f.day.periods.length);
  t.$('[data-edit-clear-periods]').click();await t.submit();assert.match(t.$('[data-dialog-message]').textContent,/Select at least one/);assert(!t.calls.some(p=>p.operation==='saveAbsence'));
  t.$('[data-edit-select-periods]').click();await t.submit();assert(t.calls.some(p=>p.operation==='saveAbsence'));
 }finally{t.dom.window.close();}
 const current=await box.setup();try{
  const a=current.f.state.absences[0];a.coverage={kind:'fullDay'};a.periodSnapshot=structuredClone(current.f.day.periods.slice(0,2));a.timetablePending=false;
  await current.render('Assign Relief');current.$('[data-edit-entry]').click();
  assert.equal(current.dom.window.document.querySelectorAll('[data-edit-periods] .selected').length,current.f.day.periods.length,'verified same-day timetable takes precedence over saved old timings');
  await current.submit();assert.deepEqual(current.calls.find(p=>p.operation==='saveAbsence').coverage,{kind:'fullDay'},'viewing current full-day projection does not convert its durable coverage');
 }finally{current.dom.window.close();}
 const stale=await box.setup();try{
  await stale.render('Manage reported absences');stale.f.setClock(stale.f.ctx.today+'T06:02:00+08:00');
  const api=stale.ctx.api;stale.ctx.api=async(route,p)=>{const result=await api(route,p);if(p.view==='entry'){result.periods=structuredClone(result.periods);result.periods[0].start='06:45';}return result;};
  stale.$('[data-edit-entry]').click();await stale.wait(()=>/Period timings changed/.test(stale.$('[data-entry-check]').textContent));
  assert.equal(stale.$('[data-save-entry]').disabled,true,'changed timings require review instead of interpreting old buttons against a new map');
 }finally{stale.dom.window.close();}
 console.log('PASS manage absence period labels, timings, immediate cache, interval preservation, explicit conversion, empty selection and both management pages.');
})().catch(e=>{console.error(e);process.exitCode=1;});
