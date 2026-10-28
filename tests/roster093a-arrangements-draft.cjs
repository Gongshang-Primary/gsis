'use strict';
// Actual UI and domain with a held provider-free API boundary. No school records or notifications.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));if(p.operation==='candidates'&&controls.candidates)await controls.candidates;
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return structuredClone(result.data);
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const idle=()=>wait(()=>$('#content').getAttribute('aria-busy')==='false'),state=await w.RosterOpsUI.render('Report Absence',ctx);
 const input=(selector,value,event='input')=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));};
 const preview=()=>{$('[data-period="2"]').click();$('[data-period="3"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 const writes=()=>calls.filter(p=>!w.GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus');
 return {dom,w,$,f,controls,calls,ctx,state,wait,idle,input,preview,writes};
}
(async()=>{
 const t=await setup();try{
  t.preview();t.input('[data-instruction]','Prepare the shared worksheet.');t.state.data.people=t.state.data.people.filter(p=>p.id==='alice');let release;t.controls.candidates=new Promise(r=>release=r);
  t.$('[data-own-arrangements]').click();
  assert.equal(t.writes().length,0,'opening Own arrangements must never save absence or instructions');
  assert(t.$('[data-colleague-filter]'),'filter opens while current availability is still pending');
  assert.equal(t.$('.ops-own-row').dataset.absentTeacher,'alice');assert.equal(t.$('.ops-own-row').querySelectorAll('td').length,17);
  t.input('[data-colleague-filter]','ＢＯＢ');assert.equal(t.$('[data-staff-row="bob"]').hidden,false);assert.equal(t.$('[data-staff-row="charlie"]').hidden,true);
  t.$('[data-own-period="2"]').click();const choice=t.$('[data-select-colleague="bob"][data-mutual-period="2"]');assert(!choice.hidden&&!choice.disabled,'local known timetable can stage a tentative choice');choice.click();
  t.$('[data-submit-mutual]').click();assert.equal(t.$('dialog'),null,'keep returns to the unsaved absence form');assert.equal(t.writes().length,0);assert.equal(t.f.state.absences.length,0);assert.equal(t.$('[data-instruction]').value,'Prepare the shared worksheet.');assert.match(t.$('[data-own-arrangement-summary]')?.textContent||'',/P2.*Bob Colleague/,'the form shows which peer request will be sent on submission');
  assert.deepEqual(JSON.parse(JSON.stringify(t.state.formDraft.ownArrangementsByStaffDate.alice['2026-10-14'])).map(p=>({period:p.period,recipientId:p.recipientId,combination:p.combination})),[{period:2,recipientId:'bob',combination:false}]);
  t.controls.candidates=null;release();await new Promise(r=>setTimeout(r,10));assert.equal(t.$('dialog'),null,'late check cannot reopen the closed chooser');
  t.$('[data-own-arrangements]').click();assert.match(t.$('[data-mutual-selections]').textContent,/Bob Colleague/,'reopening retains pending picks');t.$('[data-close-dialog]').click();
  t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.writes().length,1,'Submit absence commits one atomic command');assert.equal(t.f.state.absences.length,1);assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Prepare the shared worksheet/);assert.deepEqual(JSON.parse(JSON.stringify(t.f.state.requests.map(r=>({recipient:r.recipientId,periods:r.periods})))),[{recipient:'bob',periods:[2]}]);
 }finally{t.dom.window.close();}
 for(const removeChoice of [false,true]){
  const t=await setup();try{
   t.preview();t.$('[data-own-arrangements]').click();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);
   if(removeChoice){t.$('[data-own-period="2"]').click();t.$('[data-select-colleague="bob"][data-mutual-period="2"]').click();t.$('[data-remove-request="2"]').click();}
   t.$('[data-close-dialog]').click();t.$('[data-save-instructions]').click();await t.idle();assert.equal(t.f.state.absences.length,1,removeChoice?'removing the final pick still permits absence submission':'opening without selecting a colleague still permits absence submission');assert.equal(t.f.state.requests.length,0);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();let release;t.controls.candidates=new Promise(r=>release=r);t.$('[data-own-arrangements]').click();t.input('[data-colleague-filter]','Bob');t.$('[data-own-period="2"]').click();t.$('[data-select-colleague="bob"][data-mutual-period="2"]').click();
   const row=t.$('[data-staff-row="bob"]'),cell=row.querySelector('[data-mutual-column="15"]');t.f.day.teachers.find(x=>x.staffId==='bob').cells[15]=['SC','5B','Lab',''];t.f.day.staplerRevision=1;t.controls.candidates=null;release();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);
   assert.equal(t.$('[data-staff-row="bob"]'),row,'source refresh keeps the existing filtered row');assert.equal(row.querySelector('[data-mutual-column="15"]'),cell,'unrelated cell changes do not rebuild the table');assert.match(cell.textContent,/SC.*5B.*Lab/s);assert.equal(t.$('[data-colleague-filter]').value,'Bob');assert.match(t.$('[data-mutual-selections]').textContent,/P2.*Bob Colleague/);assert.doesNotMatch(t.$('[data-mutual-selections]').textContent,/No longer available/);assert.equal(t.state.formDraft.ownArrangementsByStaffDate.alice['2026-10-14'][0].expectedStaplerRevision,1);
   t.f.day.teachers.find(x=>x.staffId==='alice').cells[2]=['MA','6A','C6-01',''];t.f.day.staplerRevision=2;t.$('[data-refresh-mutual]').click();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);assert.match(t.$('.ops-own-row [data-mutual-column="2"]').textContent,/MA.*6A/s);assert.match(t.$('[data-mutual-selections]').textContent,/No longer available/,'changed selected lesson requires a new choice');assert.equal(t.writes().length,0);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.preview();let release;t.controls.candidates=new Promise(r=>release=r);t.$('[data-own-arrangements]').click();t.$('[data-own-period="2"]').click();t.$('[data-select-colleague="charlie"][data-mutual-period="2"]').click();
   assert.deepEqual(JSON.parse(JSON.stringify(t.state.formDraft.ownArrangementsByStaffDate.alice['2026-10-14'][0].expectedRecipientCell)),['MA','3A','C2-02','']);
   t.f.day.teachers.find(x=>x.staffId==='charlie').cells[2]=['MA','5A','C5-02',''];t.controls.candidates=null;release();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);assert.match(t.$('[data-mutual-selections]').textContent,/No longer available/,'a changed colleague class cannot silently change the requested combination');assert.equal(t.writes().length,0);
  }finally{t.dom.window.close();}
 }
 console.log('PASS draft Own arrangements: immediate filterable cached grid, zero writes before Submit absence, retained instruction text and choices, late-response isolation, atomic final submission.');
})().catch(error=>{console.error(error);process.exitCode=1;});
