'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q);
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
  const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
  const saved=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3],reliefRequired:true}),absenceId=saved.savedIds[0];
  let processing=[{absenceId,period:2,recipientId:'bob',recipientName:'Bob <img src=x onerror=alert(1)>',status:'processing',proposalId:'captured-one',date:f.ctx.today},{absenceId,period:3,recipientId:'',status:'processing',proposalId:'invalid',date:f.ctx.today},{absenceId,period:3,recipientId:'bob',status:'applied',proposalId:'old',date:f.ctx.today}];
  const context={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return {...value.data,pendingPeerProposals:processing};}};
  await w.RosterOpsUI.render('Assign Relief',context);const cell=()=> $('[data-relief-period="2"]');
  assert.match(cell().textContent,/Peer proposal processing · Bob <img/);assert.equal(cell().querySelector('img'),null,'recipient text is escaped');assert.equal(cell().querySelector('.ops-day-decision.resolved'),null,'processing is not confirmed cover');assert.equal(cell().querySelector('[data-peer-approved]'),null);assert.doesNotMatch(cell().textContent,/awaiting reply|Peer approved/);assert.match($('[data-selected-relief]').textContent,/approval has not been requested yet/);assert.equal($('[data-relief-period="3"] [data-peer-processing]'),null,'blank recipients and nonprocessing records do not appear');assert.equal(f.state.assignments.length,0);
  processing=[];O.apply(f.state,f.ctx,{operation:'requestMutual',absenceId,date:f.ctx.today,proposalOnly:true,requests:[{recipientId:'bob',demandIds:[absenceId+':2'],combination:false}]});f.state.revision++;await $('[data-ops-refresh]').onclick();assert.equal(cell().querySelector('[data-peer-processing]'),null);assert.match(cell().textContent,/Peer arranged · awaiting reply/);assert.equal(cell().querySelector('.ops-day-decision.resolved'),null);
  console.log('PASS Assign Relief durable proposal processing badge, no false approval, escaped names and handoff to colleague-awaiting state.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
