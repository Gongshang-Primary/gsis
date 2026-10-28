'use strict';
// Pending peer requests are visible to SMC without being counted as accepted cover.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q);
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
  const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
  const saved=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3],reliefRequired:true}),absenceId=saved.savedIds[0];
  O.apply(f.state,f.ctx,{operation:'requestMutual',absenceId,date:f.ctx.today,requests:[{recipientId:'bob',demandIds:[absenceId+':2'],combination:false}]});f.state.revision++;
  const context={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value.data;}};
  await w.RosterOpsUI.render('Assign Relief',context);
  const cell=()=> $('[data-relief-period="2"]');assert.match(cell().textContent,/Peer arranged · awaiting reply.*Bob Colleague/s,'affected period names the colleague whose approval is pending');assert.equal(cell().querySelector('.ops-day-decision.resolved'),null,'pending request never looks resolved');assert.match($('[data-selected-relief]').textContent,/awaiting.*approval/i);assert.equal(f.state.assignments.length,0);
  for(const status of ['rejected','expired','cancelled']){f.state.requests[0].status=status;f.state.revision++;await $('[data-ops-refresh]').onclick();assert.doesNotMatch(cell().textContent,/Peer arranged · awaiting reply/,'nonpending request no longer shows pending cover');}
  f.state.requests[0].status='pending';f.state.requests[0].expiresAt=f.ctx.now-1;f.state.revision++;await $('[data-ops-refresh]').onclick();assert.doesNotMatch(cell().textContent,/Peer arranged · awaiting reply/,'expired request is not shown as pending even before cleanup');
  f.state.requests[0].expiresAt=f.ctx.now+60000;O.apply(f.state,{...f.ctx,user:{...f.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg'}},{operation:'respondMutual',id:f.state.requests[0].id,decision:'approve'});f.state.revision++;await $('[data-ops-refresh]').onclick();assert.doesNotMatch(cell().textContent,/Peer arranged · awaiting reply/);assert.match(cell().textContent,/Bob Colleague/);assert(cell().querySelector('.ops-day-decision.resolved'),'approved peer choice appears as accepted draft cover');
  console.log('PASS Assign Relief distinguishes pending peer approval from cover and clears pending on rejection, expiry, cancellation and acceptance.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
