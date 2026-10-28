'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(clock='13:59:00'){
 const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''),dom=new JSDOM(html,{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[],controls={};
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-model.js','roster-update/public/roster-export.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture,original=w.fetch;f.setClock(f.ctx.today+'T'+clock+'+08:00');const next='2026-10-15';
 w.fetch=async(url,args={})=>{const p=JSON.parse(args.body||'{}');calls.push(p);if(p.operation==='nextSchoolDay'){if(controls.gate)await controls.gate;return {ok:true,status:200,json:async()=>({ok:true,data:controls.unavailable?{today:f.ctx.today,date:null,available:false,message:'Calendar unavailable'}:{today:f.ctx.today,date:next,available:true}})};}return original(url,args);};
 const originalRender=w.RosterOpsUI.render;w.RosterOpsUI.render=(page,ctx)=>{controls.ctx=ctx;return originalRender(page,ctx);};
 vm.runInContext(fs.readFileSync('roster-update/public/roster.js','utf8'),dom.getInternalVMContext());await wait(()=>$('[data-page="Assign Relief"]'));
 const home=async()=>{$('#nav [data-page="Home"]').click();await wait(()=>$('.function-tile'));},open=async()=>{$('[data-page="Assign Relief"]').click();await wait(()=>$('[data-ops-date]'));},ready=()=>wait(()=>$('[data-ops-date]')&&!$('#content').hasAttribute('aria-busy')||$('[data-ops-date]')&&$('#content').getAttribute('aria-busy')==='false');
 return {dom,w,$,f,next,calls,controls,wait,home,open,ready};
}
(async()=>{
 let t=await setup();try{
  await t.open();await t.ready();assert.equal(t.$('[data-ops-date]').value,t.f.ctx.today);assert.equal(t.calls.filter(p=>p.operation==='nextSchoolDay').length,0);
  t.f.setClock(t.f.ctx.today+'T14:00:00+08:00');t.$('#refresh').click();await t.ready();assert.equal(t.$('[data-ops-date]').value,t.f.ctx.today,'refresh does not move an already open allocation page');assert.equal(t.calls.filter(p=>p.operation==='nextSchoolDay').length,0);await t.home();await t.open();await t.wait(()=>t.$('[data-ops-date]').value===t.next);await t.ready();assert.equal(t.calls.filter(p=>p.operation==='nextSchoolDay').length,1);
  const date=t.$('[data-ops-date]');date.value='2026-10-16';date.dispatchEvent(new t.w.Event('change'));await t.ready();await t.home();await t.open();await t.ready();assert.equal(t.$('[data-ops-date]').value,'2026-10-16','explicit date survives reopening');assert.equal(t.calls.filter(p=>p.operation==='nextSchoolDay').length,1);
  await t.home();await t.controls.ctx.go('Assign Relief','2026-10-20');await t.ready();assert.equal(t.$('[data-ops-date]').value,'2026-10-20','explicit navigation date wins');
 }finally{t.dom.window.close();}
 t=await setup('06:00:00');try{
  t.w.GSISRosterOperations.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',typeId:'mc',date:t.f.ctx.today,periods:[2]});
  const base=t.w.GSISRosterOperations.read(t.f.state,t.f.ctx,{operation:'read',view:'allocation',date:t.f.ctx.today}),scope=t.f.ctx.user.email+'|'+t.f.ctx.today;
  t.w.localStorage.setItem('roster-relief-draft:'+scope+':retained',JSON.stringify({scope,anchor:{revision:base.revision},base,commands:[{operation:'unassign',demandIds:[base.demands[0].id]}]}));t.w.sessionStorage.setItem('roster-relief-active:'+scope,'retained');
  t.f.setClock(t.f.ctx.today+'T15:00:00+08:00');await t.open();await t.ready();assert.equal(t.$('[data-ops-date]').value,t.f.ctx.today);assert.equal(t.calls.filter(p=>p.operation==='nextSchoolDay').length,0,'unsaved local draft keeps its existing date');assert.equal(t.w.RosterOpsUI.isDirty(),true);
  const chosen=t.$('[data-ops-date]');chosen.value='2026-10-16';chosen.dispatchEvent(new t.w.Event('change'));await t.ready();await t.home();await t.open();await t.ready();assert.equal(t.$('[data-ops-date]').value,'2026-10-16','explicit remembered date wins over retained work on another date');assert.equal(t.w.RosterOpsUI.isDirty(),true,'work on the earlier date remains retained');
 }finally{t.dom.window.close();}
 t=await setup('15:00:00');try{
  let release;t.controls.gate=new Promise(r=>release=r);await t.open();assert.match(t.$('[data-ops-body]').textContent,/Checking the next school day/);assert.equal(t.$('dialog.ops-progress'),null,'date lookup uses inline feedback');assert.equal(t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,0,'no allocation read for the wrong default day');await t.home();release();await new Promise(r=>setTimeout(r,10));assert(t.$('.function-tile'),'late Calendar reply cannot overwrite Home');
 }finally{t.dom.window.close();}
 t=await setup('15:00:00');try{
  t.controls.unavailable=true;await t.open();await t.wait(()=>t.$('[data-open-selected-date]'));assert.equal(t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,0);assert.match(t.$('[data-ops-body]').textContent,/Choose a date/);t.$('[data-open-selected-date]').click();await t.ready();assert.equal(t.$('[data-ops-date]').value,t.f.ctx.today);assert.equal(t.calls.filter(p=>p.operation==='read'&&p.view==='allocation').length,1,'manual choice is explicit when Calendar cannot verify');
 }finally{t.dom.window.close();}
 console.log('PASS Assign Relief default date: Singapore 2pm cutoff, explicit dates and local drafts retained, no mid-page date jump, inline loading, no wrong-day load, late-response safety and manual fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
