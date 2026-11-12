'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js'),A=require('../shared/roster-allocation.js');
let count=0,failed=0;
const test=(name,run)=>{count++;try{run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.message);}};
const ready=()=>{const f=fixture();f.ctx.baselineDays=f.ctx.days;return f;};
const add=(plan,person)=>S.apply(plan,{type:'addTeacher',teacher:{staffId:person.id,name:person.name}});
test('All non-MK Contacts categories can join a dated timetable',()=>{
 const allowed=[{role:'SENO'},{role:'SL'},{role:'P'},{role:'VP (Admin)'},{role:'Acting Vice Principal'},{role:'OSO'},{role:'Support Staff'},{role:'SAT'},{groups:['SL','Support']},{appointmentLevel:'SL'},{profile:{Role:'OSO','EO Appt Level':'SL'}},{employment:'SL'}];
 for(const person of allowed)assert.equal(S.importContactEligible({...person,adhocEligible:false}),true,JSON.stringify(person));
 assert.equal(S.importContactEligible({role:'Teacher',importEligible:false}),false,'projected server eligibility remains authoritative');
});
test('MK classification stays excluded across Contacts field variants',()=>{
 const excluded=[{mk:'MK'},{mk:'MKE'},{mk:'Y'},{profile:{'MK Modifier':'MK'}},
  ...['MK','MKE','MK Ctr Hd','mk dy ctr hd','Acting MK ST CL','Ag. MKE'].flatMap(value=>[{role:value},{employment:value},{groups:[value]},{profile:{Role:value}},{profile:{'Employment Modifier':value}}]),
  {role:'Teacher',profile:{Role:'MK'}},{employment:'SRE',profile:{'Employment Modifier':'MKE'}}];
 for(const person of excluded)assert.equal(S.importContactEligible(person),false,JSON.stringify(person));
});
test('Active and inactive support staff persist without external relief activation',()=>{
 const {O,state,ctx,date}=ready(),people=[];
 for(const active of [true,false])for(const role of ['SENO','SL','OSO','Support'])people.push({id:role+'-'+active,name:role+' '+active,active,role,groups:role==='SL'?['SL']:['Support'],adhocEligible:false});
 ctx.people.push(...people);let plan=O.staplerView(state,ctx,{date}).plan;
 const projection=O.staplerView(state,ctx,{date}).people;
 for(const person of people){assert.equal(projection.find(p=>p.id===person.id).importEligible,true,person.name);plan=add(plan,person);}
 O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});
 O.staplerApply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 const reopened=O.staplerView(structuredClone(state),ctx,{date}).plan,effective=O.composeStaplerContext(state,ctx),candidates=A.teacherContext(state,effective,date);
 for(const person of people){
  assert(reopened.teachers.some(t=>t.staffId===person.id),person.name+' persists');
  assert(!state.adhoc.some(row=>row.staffId===person.id),person.name+' receives no external activation');
  const result=A.eligibility(candidates.get(person.id),2);assert.equal(result.available,false,person.name+' cannot cover relief');assert.equal(result.autoEligible,false,person.name+' cannot enter automatic relief');
 }
 assert.deepEqual(ctx.days[date].teachers.map(t=>t.staffId),['alice','bob','charlie','dora'],'recurring baseline is untouched');
});
test('Inactive SENO never gains an external relief reservation',()=>{
 const {O,state,ctx,date}=ready(),person={id:'olivia',name:'Olivia',active:false,role:'SENO',adhocEligible:false};ctx.people.push(person);
 const plan=add(O.staplerView(state,ctx,{date}).plan,person);
 O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});O.staplerApply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 assert(!state.adhoc.some(row=>row.staffId==='olivia'));
});
test('Inactive SRE remains in the retained plan but cannot receive new relief',()=>{
 const {O,state,ctx,date}=ready(),person={id:'external',name:'External (SRE)',active:false,role:'Teacher',employment:'SRE',adhocEligible:true};ctx.people.push(person);
 const plan=add(O.staplerView(state,ctx,{date}).plan,person);
 O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});O.staplerApply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 assert.equal(state.adhoc.filter(row=>row.staffId===person.id).length,1);
 const result=A.eligibility(A.teacherContext(state,O.composeStaplerContext(state,ctx),date).get(person.id),2);
 assert.equal(result.available,false);assert.equal(result.autoEligible,false);assert(result.reasons.includes('Teacher is inactive in Contacts.'));assert.equal(result.adhocPriority,true);person.active=true;assert.equal(A.eligibility(A.teacherContext(state,O.composeStaplerContext(state,ctx),date).get(person.id),2).autoEligible,true);
});
test('Server rejects a client-forged MK addition with the current policy',()=>{
 const {O,state,ctx,date}=ready(),person={id:'mk',name:'Kindergarten',active:true,role:'MKE'};ctx.people.push(person);
 const plan=add(O.staplerView(state,ctx,{date}).plan,person);
 assert.throws(()=>O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan}),/MK staff are excluded/);
});
console.log(`${count-failed}/${count} STAPLER staff-eligibility checks passed`);if(failed)process.exitCode=1;
