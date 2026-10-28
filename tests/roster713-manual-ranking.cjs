'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');

function setup(){
 const f=fixture();f.state.systemConfig.allocationRuleEnabled={annualUtilisation:false,alternatives:false,rotation:false,levelMatch:false,subjectMatch:false};f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 for(const [id,R] of [['bob',8],['charlie',12],['dora',10]]){
  const teacher=f.teachers.find(t=>t.staffId===id);teacher.R=R;
  if(id!=='dora')teacher.cells[1]=['PD','','',''];
 }
 A.captureWeek(f.state,f.ctx,f.date);
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2]});
 f.dem=f.O.demand(f.ctx,f.state,f.date)[0];return f;
}

const f=setup(),model=A.manualModel(f.state,f.ctx,f.date),rows=A.manualRanks(model,f.dem).filter(r=>r.available);
assert.deepEqual(rows.map(r=>r.id),['charlie','dora','bob'],'R outranks the old timetable-fit bands');
assert.deepEqual(rows.map(r=>r.remaining),[12,10,8]);
assert.deepEqual(rows.map(r=>r.suitabilityTier),[3,1,3],'old fit remains available only as a tie breaker');
assert(rows.every(r=>r.tier===1),'eligible internal candidates share Tier 1');
const equal=structuredClone(model);for(const teacher of equal.teachers)teacher.balance.remaining=10;
assert.deepEqual(A.manualRanks(equal,f.dem).filter(r=>r.available).map(r=>r.id),['dora','bob','charlie'],'equal R uses timetable fit then stable identity');
equal.teachers.reverse();assert.deepEqual(A.manualRanks(equal,f.dem).filter(r=>r.available).map(r=>r.id),['dora','bob','charlie']);

const guarded=structuredClone(model),byId=id=>guarded.teachers.find(t=>t.id===id);
byId('charlie').absent=[2];byId('charlie').balance.remaining=100;
byId('bob').base.push(2);byId('bob').t.cells[2]=['EL','3A','C2-01',''];byId('bob').balance.remaining=90;
let guardedRows=A.manualRanks(guarded,f.dem);
assert.equal(guardedRows[0].id,'dora');
assert(guardedRows.filter(r=>['bob','charlie'].includes(r.id)).every(r=>!r.available&&!r.autoEligible));
byId('bob').base=byId('bob').base.filter(p=>p!==2);byId('bob').t.cells[2]=['','','',''];byId('bob').balance.remaining=null;
guardedRows=A.manualRanks(guarded,f.dem);assert.equal(guardedRows.find(r=>r.id==='bob').tier,2);assert(!guardedRows.find(r=>r.id==='bob').autoEligible);

const special=setup();special.teachers.find(t=>t.staffId==='dora').cells[2]=['Recess duty P1','','',''];
special.state.entitlements.find(t=>t.staffId==='dora').quota=0;
special.people.push({id:'external',name:'External relief',active:false,mobile:'90000001'});
special.state.adhoc.push({staffId:'external',date:special.date,periods:[2]});
const specialRows=A.manualRanks(A.manualModel(special.state,special.ctx,special.date),{...special.dem,recessActivationId:'recess',level:1}).filter(r=>r.available);
assert.deepEqual(specialRows.slice(0,2).map(r=>[r.id,r.tier]),[['dora',-1],['external',0]],'recess duty and activated ad hoc retain their priorities');
console.log('PASS manual ranking: remaining R across old fit tiers; equal-R fit; unavailable and unknown-R safeguards; special priorities');

(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{
  const w=dom.window,doc=w.document;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
  for(const path of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(path,'utf8'),dom.getInternalVMContext());
  const fixture=w.__fixture,O=w.GSISRosterOperations,date=fixture.ctx.today;fixture.setClock(date+'T06:00:00+08:00');fixture.state.systemConfig.allocationRuleEnabled={annualUtilisation:false,alternatives:false,rotation:false,levelMatch:false,subjectMatch:false};
  for(const [id,R] of [['bob',8],['charlie',12],['dora',10]]){
   const teacher=fixture.day.teachers.find(t=>t.staffId===id);teacher.R=R;teacher.cells=Array.from({length:17},()=>['','','','']);
   if(id!=='dora')teacher.cells[1]=['PD','','',''];
  }
  O.apply(fixture.state,fixture.ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2]});
  const ctx={profile:fixture.profile,today:()=>date,container:doc.querySelector('#content'),status:()=>{},api:async(route,p)=>{
   const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Error(result.error);return result.data;
  }};
  await w.RosterOpsUI.render('Assign Relief',ctx);
  const candidateNames=()=>[...doc.querySelectorAll('.ops-work-card:not([hidden])')].filter(card=>!card.querySelector('[data-manual-select]')?.disabled).map(card=>card.dataset.candidateName);
  assert.deepEqual(candidateNames(),['Charlie Busy','Dora Free','Bob Colleague'],'rendered cards retain global R order instead of regrouping by old fit');
  assert.equal(doc.querySelectorAll('.ops-candidate-tier').length,2,'available ranking and unavailable staff have separate groups');assert([...doc.querySelectorAll('.ops-work-card')].some(card=>card.dataset.candidateName==='Alice Teacher'&&card.querySelector('[data-manual-select]').disabled),'absent teacher remains visible without becoming assignable');
  assert.match(doc.querySelector('.ops-candidate-tier h4').textContent,/Tier 1 · Business preferences/);
  assert.match(doc.querySelector('[data-candidate-scroll]').textContent,/R left is the remaining weekly allowance/);
  assert.deepEqual([...doc.querySelectorAll('.ops-top-candidates [data-manual-select]')].map(b=>b.dataset.manualSelect),['charlie','dora','bob']);
  const search=doc.querySelector('[data-candidate-search]'),calls=fixture.calls.length;search.value='Dora';search.dispatchEvent(new w.Event('input'));
  assert.deepEqual(candidateNames(),['Dora Free']);assert.equal(fixture.calls.length,calls,'candidate filtering stays local');
  console.log('PASS Assign Relief DOM: descending available R cards and matching top candidates, separate unavailable staff, local search');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
