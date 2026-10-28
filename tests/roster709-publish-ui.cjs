'use strict';
// Actual UI handlers, synthetic staff and authoritative response flags. No live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function browser(files){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),errors=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;w.addEventListener('error',e=>errors.push(e.error));
 for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,4));}throw Error('Timed out: '+w.document.body.textContent);};
 return {dom,w,$,errors,wait};
}
async function relief(){
 const t=browser(['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js']);
 try{
  const {w,$,wait}=t,f=w.__fixture,O=w.GSISRosterOperations,calls=[],date=f.ctx.today;f.setClock(date+'T06:00:00+08:00');let today=date,allowed=true;
  const ctx={profile:f.profile,today:()=>today,container:$('#content'),status(){},api:async(route,p)=>{calls.push(structuredClone(p));const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});result.data.canPublish=allowed&&p.date===today;return result.data;}};
  const open=async(d=date)=>{ctx.initialDate=d;w.RosterOpsUI.invalidateDates?.([d]);await w.RosterOpsUI.render('Absences by Date',ctx);$('[data-ops-tab="relief"]').click();await wait(()=>$('[data-publish-relief]'));};
  await open('2026-10-15');assert.equal($('[data-publish-relief]').disabled,true);assert.match($('[data-publish-hint]').textContent,/Future dates.*drafts/);let before=calls.length;$('[data-publish-relief]').onclick();assert.equal(calls.length,before,'future publication is blocked locally even if a handler is invoked directly');
  allowed=false;await open(date);assert.equal($('[data-publish-relief]').disabled,true);assert.match($('[data-publish-hint]').textContent,/verified school day/);before=calls.length;$('[data-publish-relief]').onclick();assert.equal(calls.length,before,'unverified or non-school dates cannot publish');
  allowed=true;w.RosterOpsUI.resetPreloads();O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2]});const demand=O.demand(f.ctx,f.state,date)[0];O.apply(f.state,f.ctx,{operation:'assign',date,demandIds:[demand.id],staffId:'bob',confirm:true});await open(date);assert.equal($('[data-publish-relief]').disabled,false);
  today='2026-10-15';before=calls.length;$('[data-publish-relief]').onclick();assert.equal(calls.length,before,'a page left open across midnight cannot release yesterday');assert.match($('[data-ops-message]').textContent,/current Singapore workday/);assert.equal($('[data-publish-relief]').disabled,true);
  today=date;$('[data-publish-relief]').onclick();await wait(()=>f.state.massPublications[date]);assert.equal(calls.filter(p=>p.operation==='publish').length,1);assert.equal($('[data-publish-audit]'),null,'no audit-reason approval gate');assert.deepEqual(t.errors,[]);
 }finally{t.dom.window.close();}
}
async function stapler(){
 const t=browser(['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js']);
 try{
  const {w,$,wait}=t,date='2026-10-16',periods=Array.from({length:2},(_,period)=>({period,startMinutes:450+period*30,endMinutes:480+period*30})),day={date,modelId:'baseline',periods,teachers:[{staffId:'alice',name:'Alice',cells:[['EL','Workshop','Room A',''],['','','','']]},{staffId:'bob',name:'Bob',cells:[['','','',''],['','','','']]}],formClasses:[{id:'workshop',name:'Workshop',traditional:false}]};
  let today=date,allowed=true,afterSave=null,plan=w.GSISRosterStapler.create(day),revision=1;const calls=[];
  const data=d=>({date:d,today,revision,staplerRevision:revision,plan:{...structuredClone(plan),date:d},planningAllowed:allowed,canEdit:allowed,canConfirm:allowed,published:null,people:[],accessRequests:[],venues:[]});
  const ctx={today:()=>today,initialDate:date,profile:{user:{staffId:'alice',email:'alice@school.test',smc:true}},container:$('#content'),status(){},invalidateOperations(){},api:async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='saveStapler'){plan=structuredClone(p.plan);revision++;afterSave?.();}return data(p.date);}};
  const open=async(d=date)=>{w.RosterStaplerUI.unmount();ctx.initialDate=d;await w.RosterStaplerUI.render(ctx);};
  await open('2026-10-19');assert.equal($('[data-confirm]').disabled,false);assert.equal($('[data-save]').disabled,false,'a sponsored planner can save a future draft');$('[data-save]').click();await wait(()=>$('[data-stapler-message]').textContent.includes('Draft saved'));assert.equal(calls.filter(p=>p.operation==='saveStapler').length,1);$('[data-confirm]').click();await wait(()=>calls.some(p=>p.operation==='confirmStapler'));assert.equal(calls.filter(p=>p.operation==='confirmStapler').length,1,'future Confirm is available without publishing the day');
  allowed=false;await open(date);assert.equal($('[data-confirm]').disabled,true);assert.equal($('[data-save]').disabled,true,'denied planning access cannot save or confirm');assert.match($('[data-confirm-hint]').textContent,/planning access/);
  allowed=true;await open(date);assert.equal($('[data-confirm]').disabled,false);today='2026-10-17';$('[data-confirm]').onclick();await wait(()=>calls.filter(p=>p.operation==='confirmStapler').length===2);assert.equal($('[data-confirm]').disabled,false,'authorised SMC may confirm a past plan without an audit approval gate');
  today=date;await open(date);$('[data-scroll="teacher"] [data-tile]').click();$('[data-scroll="teacher"] [data-row="bob"][data-period="0"]').click();let before=calls.length;$('[data-confirm]').onclick();await new Promise(r=>setImmediate(r));assert.equal(calls.length,before,'Confirm never uploads unsaved local edits');assert.match($('[data-confirm-hint]').textContent,/Save to online/);afterSave=()=>{today='2026-10-17';};$('[data-save]').click();await wait(()=>$('[data-stapler-message]').textContent.includes('Draft saved'));assert.equal(calls.filter(p=>p.operation==='saveStapler').length,2,'the explicit save completes across midnight');assert.equal(calls.filter(p=>p.operation==='confirmStapler').length,2,'Save never implicitly confirms');$('[data-confirm]').onclick();await wait(()=>calls.filter(p=>p.operation==='confirmStapler').length===3);
  afterSave=null;today=date;await open(date);$('[data-confirm]').click();await wait(()=>calls.filter(p=>p.operation==='confirmStapler').length===4);assert.equal(calls.filter(p=>['publishStapler','publish'].includes(p.operation)).length,0);assert.equal(calls.filter(p=>/StaplerLock$/.test(p.operation)).length,0,'sponsored future planning needs no exclusive lease');allowed=false;ctx.profile.user.smc=false;today='2026-10-17';await open(date);assert.equal($('[data-save]').disabled,true);assert.equal($('[data-confirm]').disabled,true,'ordinary teacher past view remains read only');assert.deepEqual(t.errors,[]);
 }finally{t.dom.window.close();}
}
(async()=>{await relief();await stapler();console.log('PASS 709 publication UI: daily Publish current verified workday gate; authorised future/past SMC Confirm; explicit local save across midnight; denied ordinary editing.');})().catch(e=>{console.error(e);process.exitCode=1;});
