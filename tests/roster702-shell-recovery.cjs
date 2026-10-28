'use strict';
// Production shell, operations UI and rules; all network responses use synthetic staff.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(initialControls={}){
 const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''),dom=new JSDOM(html,{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q),controls={...initialControls},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};
 const wait=async fn=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+doc.body.textContent);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-model.js','roster-update/public/roster-export.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture,original=w.fetch;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const unauthorized=()=>({ok:false,status:401,json:async()=>({ok:false,error:'Your session expired. Sign in again.'})});
 w.fetch=async(url,args={})=>{
  const p=JSON.parse(args.body||'{}');calls.push({url:String(url),p:structuredClone(p)});
  if(p.operation==='receiptStatus'){const saved=f.receipts.get(p.command.requestId);return {ok:true,status:200,json:async()=>({ok:true,data:{accepted:!!saved,requestId:p.command.requestId,savedIds:saved?.savedIds,revision:f.state.revision}})};}
  if(p.operation==='directory')return {ok:true,status:200,json:async()=>({ok:true,data:{people:f.ctx.people.filter(person=>person.active)}})};
  if(controls.read401&&p.operation==='read'){controls.read401=false;return unauthorized();}
  if(p.operation==='read'&&p.view==='report'&&controls.reportGate)await controls.reportGate;
  if(p.operation==='availability'){if(controls.availabilityGate)await controls.availabilityGate;if(controls.availabilityFail){controls.availabilityFail=false;throw Error('Synthetic offline');}}
  const result=await original(url,args);
  if(controls.save401&&p.operation==='saveAbsence'){controls.save401=false;return unauthorized();}
  return result;
 };
 vm.runInContext(fs.readFileSync('roster-update/public/roster.js','utf8'),dom.getInternalVMContext());await wait(()=>$('[data-page="Report Absence"]'));
 const open=async name=>{if(!$('.function-tile')){$('#nav [data-page="Home"]').click();await wait(()=>$('.function-tile'));}$('[data-page="'+name+'"]').click();};
 return {dom,w,doc,$,f,controls,calls,wait,open};
}
(async()=>{
 // Exercise the production Home tile wiring, not a direct call to preload().
 for(const firstEvent of ['pointerenter','focus','pointerdown']){
  let release;const reportGate=new Promise(resolve=>release=resolve);const t=await setup({reportGate});try{
   const reportReads=()=>t.calls.filter(c=>c.p.operation==='read'&&c.p.view==='report').length;
   await t.wait(()=>reportReads()===1);assert.equal(reportReads(),1,'Home automatically warms the missing dated context without a pointer gesture');
   const tile=t.$('[data-page="Report Absence"]');tile.dispatchEvent(new t.w.Event(firstEvent));
   await Promise.resolve();assert.equal(reportReads(),1,firstEvent+' joins the automatic compact preload');
   for(const event of ['pointerenter','focus','pointerdown'])tile.dispatchEvent(new t.w.Event(event));
   assert.equal(reportReads(),1,'all intent signals share one pending request');
   tile.click();assert.equal(reportReads(),1,'opening Report joins the pending intent read');
   await t.wait(()=>t.$('[data-absence-form]'));assert.equal(t.$('[data-log-absence]').disabled,true,'form metadata opens while ordinary instruction review waits for the held dated report');
   t.controls.reportGate=null;release();await t.wait(()=>t.$('[data-absence-form]')&&t.$('#content').getAttribute('aria-busy')==='false');
   assert.equal(reportReads(),1,'preload completion and opening need exactly one backend read');
   t.$('#nav [data-page="Home"]').click();await t.wait(()=>t.$('.function-tile'));await t.open('Report Absence');await t.wait(()=>t.$('[data-absence-form]'));
   assert.equal(reportReads(),1,'fresh Report reopening also uses the completed response');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.w.RosterOpsUI.resetPreloads();t.controls.read401=true;await t.open('Report Absence');await t.wait(()=>t.$('#retryLoad'));assert.match(t.$('#content').textContent,/session expired/);assert.equal(t.$('#nav').hidden,true);assert.equal(t.$('#logout').hidden,true);
   t.$('#retryLoad').click();await t.wait(()=>t.$('[data-absence-form]')&&t.$('#content').getAttribute('aria-busy')==='false');assert.equal(t.w.location.hash,'#reportAbsence','authentication recovery preserves the requested report destination');await t.open('Manage reported absences');await t.wait(()=>t.$('[data-table-search]'));assert.equal(t.$('#retryLoad'),null,'visible recovery returns to an authenticated usable screen');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   await t.open('Report Absence');await t.wait(()=>t.$('[data-absence-form]'));t.$('[data-clear-periods]').click();t.$('[data-period="2"]').click();t.$('[data-log-absence]').click();t.controls.save401=true;t.$('[data-save-instructions]').click();await t.wait(()=>t.$('#retryLoad'));assert.equal(t.f.state.absences.length,1,'synthetic server accepted before the session error');assert.equal(t.w.RosterOpsUI.isDirty(),true,'unconfirmed request survives authentication teardown');
   const first=t.calls.find(c=>c.p.operation==='saveAbsence').p;assert.deepEqual(first.periods,[2],'partial-day recovery retains the selected period');t.$('#retryLoad').click();await t.wait(()=>t.$('[data-retry-save]')&&t.$('#content').getAttribute('aria-busy')==='false');assert.equal(t.w.location.hash,'#reportAbsence','pending save returns directly to its report destination');t.$('[data-retry-save]').click();await t.wait(()=>!t.$('[data-retry-save]')&&t.$('#content').getAttribute('aria-busy')==='false');const saves=t.calls.filter(c=>c.p.operation==='saveAbsence');assert.equal(saves.length,1);assert.deepEqual(t.calls.find(c=>c.p.operation==='receiptStatus').p.command,first,'recovery confirms the original request receipt without a second write');assert.equal(t.f.state.absences.length,1,'retry after session recovery does not duplicate the write');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   await t.open('Check Availability');await t.wait(()=>t.$('#teacherSearch')&&!t.$('#teacherSearch').disabled);const choose=id=>{t.$('#teacherSearch').focus();t.$('#teacherChoices [data-staff="'+id+'"]').click();};
   choose('dora');await t.wait(()=>t.$('.availability-table'));assert.equal(t.$('.availability-table tbody tr:nth-child(3)').classList.contains('common-free'),true);
   const readsBefore=t.calls.filter(c=>c.p.operation==='availability').length;choose('charlie');assert.ok(t.$('.availability-table'),'a fresh complete snapshot updates the selected subset locally');assert.equal(t.$('.availability-table tbody tr:nth-child(3)').classList.contains('common-free'),false);assert.equal(t.calls.filter(c=>c.p.operation==='availability').length,readsBefore);
   let release;t.controls.availabilityGate=new Promise(resolve=>release=resolve);t.f.setClock(new Date(t.f.ctx.now+61001).toISOString());choose('alice');assert.equal(t.$('.common-free'),null,'expired availability is never displayed as confirmed');assert.match(t.$('#timetables').textContent,/Refresh current availability/);t.$('#retryAvailability').click();assert.match(t.$('#timetables').textContent,/Checking current availability/);assert.equal(t.$('#teacherSearch').disabled,false);assert.equal(t.doc.querySelectorAll('.teacher-chip').length,3);t.controls.availabilityGate=null;release();await t.wait(()=>t.$('.availability-table'));assert.equal(t.$('.availability-table tbody tr:nth-child(3)').classList.contains('common-free'),false,'latest selected busy teacher is respected');
   t.f.setClock(new Date(t.f.ctx.now+61001).toISOString());t.controls.availabilityFail=true;choose('bob');t.$('#retryAvailability').click();await t.wait(()=>t.$('#retryAvailability'));assert.equal(t.$('.common-free'),null);assert.equal(t.$('#teacherSearch').disabled,false);t.$('#retryAvailability').click();await t.wait(()=>t.$('.availability-table'));assert.equal(t.doc.querySelectorAll('.teacher-chip').length,4,'retry retains the selected teachers');
  }finally{t.dom.window.close();}
 }
 console.log('PASS shell intent preload and recovery: Home warms missing dated context automatically; pointer/focus intent coalesces with click and warm reopening;  operations401 shows Retry; sign-in recovery preserves exact pending save and receipt; pending availability never claims old free rows, names stay usable, and failures can retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});
