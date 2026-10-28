'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),{sample}=require('./roster716-calculations.cjs');
const wait=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for synthetic UI');};
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};const storage=w.localStorage;
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-calculations.js','roster-update/public/roster-learning.js'])w.eval(fs.readFileSync(file,'utf8'));
  Object.defineProperty(w,'localStorage',{configurable:true,value:storage});
  const f=w.__fixture,O=w.GSISRosterOperations;f.state.accountingYears['2026']={verified:true};
  for(const [id,extra] of [['mk',{mk:'MK'}],['oso',{role:'OSO'}],['sat',{groups:['SAT']}],['sl',{appointmentLevel:'SL'}],['fajt',{employment:'FAJT'}],['seno',{role:'SENO'}]])f.ctx.people.push({id,name:id.toUpperCase()+' fixture',active:true,...extra});
  O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2]});
  const calls=[];let notificationFailures=1,publishFailures=1;
  const ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.getElementById('content'),status(){},api:async(route,p)=>{
   calls.push(JSON.parse(JSON.stringify(p)));if(p.operation==='notifyDaily'&&notificationFailures-- >0)throw Error('Synthetic notification response unavailable');
   const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});const data=value.data;
   if(data.allocationModel)for(const teacher of data.allocationModel.teachers)teacher.person.reliefCandidateEligible=!['mk','oso','sat','sl'].includes(teacher.id);
   if(p.operation==='publish'){if(publishFailures-- >0)throw Error('Synthetic publication response lost after commit');return {publicationAcknowledgement:true,visibilityPublished:true,date:p.date,revision:data.revision,allocationRevision:data.allocationRevision,publishedAt:f.ctx.iso,publishedRevision:data.publishedRevision||1,dayToken:data.dayToken,canPublish:true,publishAudit:{required:false,changes:[]},published:0};}return data;
  }};
  await w.RosterOpsUI.render('Assign Relief',ctx);const find=s=>w.document.querySelector(s);
  assert(find('[data-save-online]').closest('.ops-freshness'));assert.equal(find('[data-notify-mode=all]').textContent,'Let teachers see and send WhatsApp to all');assert(find('[data-notify-all]'));assert(find('[data-notify-mode=none]'));
  for(const id of ['mk','oso','sat','sl'])assert.equal(find('[data-candidate-name="'+id.toUpperCase()+' fixture"]'),null);
  for(const id of ['fajt','seno'])assert(find('[data-candidate-name="'+id.toUpperCase()+' fixture"]'));
  find('[data-notify-mode=all]').click();await wait(()=>find('[data-retry-save]'));assert.equal(calls.filter(p=>p.operation==='notifyDaily').length,0,'unknown publication cannot start notifications');
  find('[data-retry-save]').click();await wait(()=>find('[data-retry-save]')&&/WhatsApp is not confirmed/.test(find('[data-ops-message]').textContent));
  const first=calls.filter(p=>['publish','notifyDaily'].includes(p.operation));assert.equal(first[0].requestId,first[1].requestId);assert.deepEqual(first[0],first[1]);assert.equal(first[0].notifyMode,'none');assert(first[0].publicationAcknowledgement);assert(find('[data-relief-period]'));
  const retained=Object.keys(storage).filter(k=>k.startsWith('gsis-publication-flow-v1:'));assert.equal(retained.length,1);assert.equal(JSON.parse(storage.getItem(retained[0])).stage,'notify');
  // Reload the UI module itself, preserving only browser storage: no restored stage auto-sends.
  w.RosterOpsUI.unmount();w.eval(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));const before=calls.length;await w.RosterOpsUI.render('Assign Relief',ctx);await wait(()=>find('[data-retry-save]'));assert.equal(calls.slice(before).filter(p=>['publish','notifyDaily'].includes(p.operation)).length,0);
  find('[data-retry-save]').click();await wait(()=>!find('[data-retry-save]')&&/Teachers can see/.test(find('[data-ops-message]').textContent));const after=calls.filter(p=>['publish','notifyDaily'].includes(p.operation));assert.deepEqual(after.map(p=>p.operation),['publish','publish','notifyDaily','notifyDaily']);assert.deepEqual(after[2],after[3]);assert.match(find('[data-ops-message]').textContent,/Teachers can see/);assert(find('[data-relief-period]'),'notification outcomes retain the current allocation model');assert.equal(Object.keys(storage).filter(k=>k.startsWith('gsis-publication-flow-v1:')).length,0);
  const standaloneStart=calls.length;find('[data-notify-mode=none]').click();await wait(()=>/No WhatsApp sent/.test(find('[data-ops-message]').textContent));assert.deepEqual(calls.slice(standaloneStart).filter(p=>['publish','notifyDaily'].includes(p.operation)).map(p=>p.operation),['publish']);
  const notifyStart=calls.length;find('[data-notify-all]').click();await wait(()=>calls.slice(notifyStart).some(p=>p.operation==='notifyDaily')&&find('[data-notify-all]').disabled===false);assert.deepEqual(calls.slice(notifyStart).filter(p=>['publish','notifyDaily'].includes(p.operation)).map(p=>p.operation),['notifyDaily']);assert(find('[data-relief-period]'));
  w.RosterOpsUI.unmount();
  const learning={config:{maxDailyPeriods:8,allocationRuleEnabled:{rotation:false},literal:'<img src=x>'},appliedRuleOrder:[{id:'weeklyRemaining',label:'Weekly remaining',description:'Actual order',enabled:true}],revision:73,updatedAt:'2026-10-28T00:00:00Z'};
  const learningContext={container:ctx.container,api:async(route,p)=>p.operation==='calculations'?sample():{learning}};await w.RosterLearningUI.render(learningContext);
  assert.deepEqual([...w.document.querySelectorAll('.allocation-learning-sections>li')].map(row=>row.querySelector('h2').textContent),['My Calculations','Business Rules','Understand an allocation log']);
  assert.match(find('[data-learning-rules]>.calculation-caption').textContent,/Updated 28 Oct 2026, 08:00 SGT/);
  const template=fs.readFileSync('docs/v098j/ALLOCATION_EXPLANATION_PROMPT.txt','utf8').trimEnd();assert.equal(find('[data-learning-prompt]').value,template.replace('currently:\n\nUsing','currently:\n\n'+JSON.stringify(learning,null,2)+'\n\nUsing'));assert.equal(find('.allocation-rule-settings img'),null);assert.equal(find('[data-copy-learning-prompt]').disabled,false);
  learningContext.api=async(route,p)=>{if(p.operation==='calculations')return sample();throw Error('Synthetic rules unavailable');};await w.RosterLearningUI.render(learningContext);assert.equal(find('[data-learning-prompt]').value,'');assert.equal(find('[data-copy-learning-prompt]').disabled,true);
  console.log('PASS J DOM: exact combined controls, saved visibility through publication and notification response loss, immutable stage retry after module reload, no automatic restored sends, category filtering, missing-timetable FAJT/SENO retained, three learning sections and exact prompt with actual rules.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
