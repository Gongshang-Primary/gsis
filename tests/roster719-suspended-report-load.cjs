'use strict';
// Production UI and domain with synthetic API gates; no school records or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));if(p.operation==='read'&&controls.readGate)await controls.readGate;if(p.operation==='saveAbsence'&&controls.saveGate)await controls.saveGate;if(p.operation==='candidates'&&controls.candidateGate)await controls.candidateGate;if(p.operation==='candidates'&&controls.candidateFailure)throw Error('Colleague availability could not be checked.');
  if(p.operation==='read'&&controls.compactRead){const dd=f.ctx.days[p.date],selected=p.staffId||f.ctx.user.staffId;const ctx=w.GSISRosterOperations.composeStaplerContext(f.state,{...f.ctx,days:{...f.ctx.days,[p.date]:{...dd,compact:true,targetId:selected,teachers:dd.teachers.filter(t=>t.staffId===selected)}}});return w.GSISRosterOperations.read(f.state,ctx,p);}
  if(p.operation==='read'&&controls.denied)throw Object.assign(Error('Denied'),{status:403});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});
  return result.data;
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const render=()=>w.RosterOpsUI.render('Report Absence',ctx),readCount=()=>calls.filter(p=>p.operation==='read').length;
 function preview(){ $('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
 return {dom,w,$,f,controls,calls,ctx,wait,render,readCount,preview};
}
(async()=>{
 {
  const t=await setup();try{
   const S=t.w.GSISRosterStapler,plan=S.apply(S.create({...t.f.day,date:t.f.ctx.today}),{type:'addTile',tile:{teacherId:'bob',period:2,subject:'SCI',venue:'Library',group:'Offline workshop'}});
   t.f.state.staplerPlans.push({date:t.f.ctx.today,baselineId:'baseline',revision:1,confirmed:true,confirmedRevision:1,confirmedPlan:structuredClone(plan),draft:plan});t.controls.compactRead=true;let warm=0;t.ctx.localTimetable=async()=>{warm++;};await t.render();
   const choose=name=>{for(const chip of t.w.document.querySelectorAll('[data-absence-teacher] .teacher-chip'))chip.click();const input=t.$('[data-teacher-search]');input.value=name;input.dispatchEvent(new t.w.Event('input'));t.$('[data-absence-teacher] [role=option]').click();};
   let release;t.controls.readGate=new Promise(r=>release=r);choose('Bob');assert.equal(t.$('[data-log-absence]').disabled,true);choose('Alice');
   t.controls.readGate=null;release();await t.wait(()=>t.$('#content').getAttribute('aria-busy')==='false');t.preview();assert(t.$('[data-instruction]'),'latest teacher retains available lesson instructions after an older teacher read');
   choose('Bob');await t.wait(()=>t.$('#content').getAttribute('aria-busy')==='false');t.$('[data-absence-form]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.match(t.$('[data-instructions-area]').textContent,/SCI/);assert.match(t.$('[data-instructions-area]').textContent,/Offline workshop/);assert.equal(warm,0,'suspended teacher cells never hydrate from recurring baseline');assert.equal(t.f.state.absences.length,0,'teacher changes and instruction review do not write');
  }finally{t.dom.window.close();}
 }

 {
  const t=await setup();try{
   const S=t.w.GSISRosterStapler,plan=S.apply(S.create({...t.f.day,date:t.f.ctx.today}),{type:'addTile',tile:{teacherId:'bob',period:2,subject:'SCI',venue:'Library',group:'Cached workshop'}});
   t.f.state.staplerPlans.push({date:t.f.ctx.today,baselineId:'baseline',revision:1,confirmed:true,confirmedRevision:1,confirmedPlan:structuredClone(plan),draft:plan});t.controls.compactRead=true;t.ctx.timetablePreload={getEffectiveDay:()=>({...S.effectiveDay(plan),staplerRevision:1})};await t.render();const count=t.readCount();for(const chip of t.w.document.querySelectorAll('[data-absence-teacher] .teacher-chip'))chip.click();const input=t.$('[data-teacher-search]');input.value='Bob';input.dispatchEvent(new t.w.Event('input'));t.$('[data-absence-teacher] [role=option][data-staff=bob]').click();t.preview();assert.equal(t.readCount(),count,'matching confirmed revision serves teacher switches locally');assert.match(t.$('[data-instructions-area]').textContent,/Cached workshop/);assert.equal(t.f.state.absences.length,0);
  }finally{t.dom.window.close();}
 }
 for(const mode of ['fresh-refresh','expired-refresh','invalidated-teacher-read']){
  const t=await setup();try{
   const week={perDay:17,blocks:t.f.day.teachers.map(teacher=>({name:teacher.name,cells:Array.from({length:5},()=>structuredClone(teacher.cells)).flat()}))};let cached=mode!=='invalidated-teacher-read';t.ctx.cachedTimetable=()=>cached?{modelId:'baseline',model:{even:week,odd:week}}:null;
   await t.render();if(mode==='expired-refresh')t.f.setClock(t.f.ctx.today+'T06:02:00+08:00');let release;t.controls.readGate=new Promise(r=>release=r);
   const choose=name=>{for(const chip of t.w.document.querySelectorAll('[data-absence-teacher] .teacher-chip'))chip.click();const input=t.$('[data-teacher-search]');input.value=name;input.dispatchEvent(new t.w.Event('input'));t.$('[data-absence-teacher] [role=option]').click();};
   if(mode!=='invalidated-teacher-read')t.$('[data-ops-refresh]').click();choose('Bob');assert.equal(t.$('[data-log-absence]').disabled,true,mode+' retains its authoritative check');
   if(mode==='invalidated-teacher-read'){cached=true;t.w.RosterOpsUI.invalidateDates([t.f.ctx.today]);}
   choose('Alice');assert.equal(t.$('[data-log-absence]').disabled,true,mode+' cannot be cancelled by cached teacher cells');assert.equal(t.$('#content').getAttribute('aria-busy'),'true');
   t.$('[data-absence-form]').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(t.$('[data-save-instructions]'),null,'no stale preview while verification is held');assert.equal(t.f.state.absences.length,0);
   t.controls.readGate=null;release();await t.wait(()=>t.$('#content').getAttribute('aria-busy')==='false');t.preview();assert(t.$('[data-instruction]'),'verified current teacher can review after the check completes');assert.equal(t.f.state.absences.length,0);
  }finally{t.dom.window.close();}
 }
 console.log('PASS suspended Report Absence: selected teacher fallback, rapid A/B/A selection, matching confirmed-cache teacher switches without reads, canonical lesson cells, authoritative fresh/expired refresh and invalidation guards, no early writes.');

})().catch(e=>{console.error(e);process.exitCode=1;});

