'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q);w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 try{
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
  const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');w.GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]});
  const ui=await w.RosterOpsUI.render('Assign Relief',{profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{if(p.view==='intake')return {entries:[],total:0};const r=await w.fetch('/'+route,{body:JSON.stringify(p)}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return structuredClone(v.data);}});
  const card=name=>[...w.document.querySelectorAll('.ops-work-card')].find(c=>c.dataset.candidateName===name);
  assert(card('Charlie Busy'),'busy teacher appears in selection');assert.match(card('Charlie Busy').textContent,/Unavailable/);assert.match(card('Charlie Busy').textContent,/Timetabled lesson or duty/);assert(card('Charlie Busy').querySelector('[data-manual-select]').disabled,'busy teacher cannot be assigned');
  assert.equal(card('External Known (SRE)'),undefined,'inactive Contacts staff are excluded from new assignment choices');
  assert(card('Alice Teacher'),'absent teacher remains visible');assert(card('Alice Teacher').querySelector('[data-manual-select]').disabled);
  const before=JSON.stringify(ui.data.allocationModel.assignments);card('Charlie Busy').querySelector('[data-manual-select]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,20));assert.equal(JSON.stringify(ui.data.allocationModel.assignments),before,'synthetic disabled-button click cannot create a draft');
  $('[data-candidate-search]').value='char';$('[data-candidate-search]').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(card('Charlie Busy').hidden,false,'partial search finds blocked teacher');assert.equal(card('Dora Free').hidden,true);assert.equal($('[data-candidate-empty]').hidden,true);
  $('[data-candidate-search]').value='';$('[data-candidate-search]').dispatchEvent(new w.Event('input',{bubbles:true}));assert(!card('Dora Free').querySelector('[data-manual-select]').disabled,'available teacher remains selectable');
  assert(![...w.document.querySelectorAll('[data-top-candidates] [data-candidate-name]')].some(c=>c.dataset.candidateName==='Charlie Busy'),'blocked teacher cannot become top suggestion');
  $('[data-assign-mode="combine"]').click();assert(!card('Charlie Busy').querySelector('[data-combine-select]').disabled,'valid class combination remains available');assert(card('Dora Free').querySelector('[data-combine-select]').disabled,'teacher without a class cannot combine');assert.match(card('Dora Free').textContent,/Unavailable/);
  console.log('PASS F teacher selection includes unavailable staff with reasons, searchable names, disabled conflict controls and safe combination eligibility');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
