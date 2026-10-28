'use strict';
// Real report/edit payloads must omit the removed field without erasing historical data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q);
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};
 const wait=async fn=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+doc.body.textContent);};
 try{
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
  const f=w.__fixture,O=w.GSISRosterOperations,date=f.ctx.today,legacy='Historical absence note';f.setClock(date+'T06:00:00+08:00');
  const id=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2],remarks:legacy}).savedId;
  const ctx={profile:f.profile,today:()=>date,container:$('#content'),status:()=>{},api:async(route,p)=>{const res=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await res.json();if(!res.ok)throw Object.assign(Error(result.error),{status:res.status});return result.data;}};
  const open=page=>w.RosterOpsUI.render(page,ctx),settled=()=>$('#content').getAttribute('aria-busy')==='false';
  await open('Manage reported absences');assert(![...doc.querySelectorAll('th')].some(th=>th.textContent.includes('Remarks')));
  $('[data-view-entry="'+id+'"]').click();await wait(()=>$('dialog .ops-facts'));assert(![...doc.querySelectorAll('dialog dt')].some(dt=>dt.textContent==='Remarks'));assert(!$('dialog').textContent.includes(legacy));$('[data-close-dialog]').click();
  $('[data-edit-entry="'+id+'"]').click();await wait(()=>$('[data-edit-form]'));assert.equal($('dialog [name="remarks"]'),null);
  const type=$('dialog [name="typeId"]');type.value='others';type.dispatchEvent(new w.Event('change',{bubbles:true}));$('dialog [name="reasonDetail"]').value='Appointment';$('[data-edit-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>!$('dialog')&&settled());let payload=f.calls.filter(c=>c.p.operation==='saveAbsence').at(-1).p;assert.equal(Object.hasOwn(payload,'remarks'),false);assert.equal(f.state.absences.find(a=>a.id===id).remarks,legacy);assert.equal(f.state.absences.find(a=>a.id===id).reasonDetail,'Appointment');
  await open('Report Absence');assert.equal($('[name="remarks"]'),null);const reliefRequired=$('[name="reliefRequired"]');reliefRequired.value='no';reliefRequired.dispatchEvent(new w.Event('change',{bubbles:true}));$('[data-period="3"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>$('[data-save-instructions]'));$('[data-save-instructions]').click();await wait(()=>f.state.absences.length===2&&settled());payload=f.calls.filter(c=>c.p.operation==='saveAbsence').at(-1).p;assert.equal(Object.hasOwn(payload,'remarks'),false);assert.equal(f.state.absences.find(a=>a.id===id).remarks,legacy);const created=f.state.absences.find(a=>a.id!==id);assert.equal(created.remarks,'');assert.equal(payload.reliefRequired,false,'No relief selection is sent unchanged');assert.equal(created.reliefRequired,false,'No relief selection is stored unchanged');assert.equal(O.demand(f.ctx,f.state,date).filter(d=>d.absenceId===created.id).length,0,'No relief absence creates no coverage demands');
  // Older clients retain the optional contract, including an intentional clear.
  O.apply(f.state,f.ctx,{operation:'saveAbsence',id,date,staffId:'alice',typeId:'mc',periods:[2],remarks:'Updated by older client'});assert.equal(f.state.absences.find(a=>a.id===id).remarks,'Updated by older client');
  O.apply(f.state,f.ctx,{operation:'saveAbsence',id,date,staffId:'alice',typeId:'mc',periods:[2]});assert.equal(f.state.absences.find(a=>a.id===id).remarks,'Updated by older client');
  O.apply(f.state,f.ctx,{operation:'saveAbsence',id,date,staffId:'alice',typeId:'mc',periods:[2],remarks:''});assert.equal(f.state.absences.find(a=>a.id===id).remarks,'');
  console.log('PASS v0.7.02 absence remarks: field absent from report, edit, details and table; real save payloads omit it; historical notes survive edits; older explicit update/clear remains compatible; No relief creates no demands.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
