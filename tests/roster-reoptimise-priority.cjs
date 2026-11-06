'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
function setup(){
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00'),iso:f.date+'T06:00:00+08:00'});
 f.state.accountingYears['2026']={verified:true};f.state.systemConfig.consecutiveSubjectRules=[];
 Object.assign(f.people[1],{employment:'SRE',active:false});f.teachers[1].R=null;
 f.ctx.days[f.date].deployTeachingEvidence={verified:true,rows:[{id:'bob',periods:0,verified:true}]};
 return f;
}
const command=(f,operation,extra={})=>f.O.apply(f.state,f.ctx,{operation,date:f.date,requestId:crypto.randomUUID(),...extra});
const run=(f,allocationMode='reoptimise')=>command(f,'autoAllocate',{allocationMode});
const activate=(f,periods=[2,3])=>command(f,'saveAdhoc',{staffId:'bob',periods});
const demand=(f,period)=>({id:'d'+period,staffId:'alice',date:f.date,period,subject:'EL',className:'4A'});
test('a fully covered draft adopts newly activated daily SRE up to the daily limit; fill-only does not',()=>{
 for(const cap of [1,2]){
  const f=setup();f.state.systemConfig.adhocReliefMaxPeriods=cap;
  command(f,'saveAbsence',{staffId:'alice',typeId:'mc',periods:[2,3]});run(f);
  const before=structuredClone(A.effectiveAssignments(f.state));assert.equal(before.length,2);assert(!before.some(a=>a.staffId==='bob'));
  activate(f);assert.deepEqual(A.effectiveAssignments(f.state),before,'activation never starts allocation');
  run(f,'fill-only');assert.deepEqual(A.effectiveAssignments(f.state),before);
  const result=run(f),rows=A.effectiveAssignments(f.state);assert.equal(rows.length,2);assert.equal(rows.filter(a=>a.staffId==='bob').length,cap);
  assert.equal(result.run.priority1.before,0);assert.equal(result.run.priority1.after,cap);assert.equal(result.run.reason,'priority-1 use improved');
  assert.equal(f.state.outbox.length,0);assert.equal(f.state.publicationSnapshots.length,0);
 }
});
test('coverage comes first, then priority-1 use before recess-duty reuse',()=>{
 const f=setup();activate(f);f.state.systemConfig.adhocReliefMaxPeriods=1;
 for(const p of [2,3]){f.teachers[2].cells[p]=['Recess duty P4','','',''];f.state.assignments.push({id:'old'+p,date:f.date,demandId:'d'+p,period:p,staffId:'charlie',status:'draft',origin:'automatic',rCost:0,repurposedDuty:true});}
 const ds=[2,3].map(p=>({...demand(f,p),recessActivationId:'recess',level:4})),plan=A.optimise(f.state,f.ctx,f.date,ds);
 assert.equal(plan.coverage,2);assert.equal(plan.assignments.filter(a=>a.staffId==='bob').length,1);assert.equal(plan.changed,true);
 assert.equal(plan.priority1.before,0);assert.equal(plan.priority1.after,1);
});
test('equal policy scores retain the existing teachers rather than use teacher ID as a change incentive',()=>{
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.state.accountingYears['2026']={verified:true};
 f.state.systemConfig.allocationRuleEnabled=Object.fromEntries(A.preferenceRules.map(r=>[r.id,false]));
 f.state.assignments.push({id:'old',date:f.date,demandId:'d2',period:2,staffId:'dora',status:'draft',origin:'automatic'});
 const plan=A.optimise(f.state,f.ctx,f.date,[demand(f,2)]);assert.equal(plan.changed,false);assert.equal(plan.assignments[0].staffId,'dora');
});
test('all protected ownership and started automatic cells survive priority reoptimisation',()=>{
 for(const kind of ['smc','mutual','stapler','protected','published','started']){
  const f=setup();command(f,'saveAbsence',{staffId:'alice',typeId:'mc',periods:[2,3]});run(f);activate(f);
  const row=A.effectiveAssignments(f.state).find(a=>a.period===2);
  if(['smc','mutual','stapler'].includes(kind))Object.assign(row,{origin:kind,protected:true});
  if(kind==='mutual')row.mutual=true;if(kind==='protected')row.protected=true;if(kind==='published')row.status='published';
  if(kind==='started')Object.assign(f.ctx,{now:Date.parse(f.date+'T08:10:00+08:00'),minute:490,iso:f.date+'T08:10:00+08:00'});
  const before=structuredClone(row);run(f);assert.deepEqual(row,before,kind);assert.equal(A.effectiveAssignments(f.state).find(a=>a.period===3).staffId,'bob');
 }
});
test('activation changes leave a durable dated suggestion until a successful full replan',()=>{
 const f=setup(),view=()=>f.O.read(f.state,f.ctx,{operation:'read',view:'allocation',date:f.date});
 activate(f);assert.equal(view().replanSuggested,true);const revision=f.state.dayRevisions[f.date];
 activate(f);assert.equal(f.state.dayRevisions[f.date],revision,'unchanged activation does not bump the date');
 run(f,'fill-only');assert.equal(view().replanSuggested,true);
 f.state.importedRelief.push({id:'old-history',date:'2026-10-07',staffId:'charlie',status:'completed',origin:'imported',rCost:1});f.state.accountingYears['2026'].verified=false;assert.equal(run(f).paused,true);assert.equal(view().replanSuggested,true);
 f.state.accountingYears['2026'].verified=true;run(f);assert.equal(view().replanSuggested,false);
 activate(f,[2]);assert.equal(view().replanSuggested,true);run(f);assert.equal(view().replanSuggested,false);
 command(f,'deleteAdhoc',{id:f.state.adhoc[0].id});assert.equal(view().replanSuggested,true,'deleted activation retains the reminder');
 run(f);assert.equal(view().replanSuggested,false);
});
for(const category of ['not available that period','restricted period','daily max reached','consecutive limit','activation window','no lessons to cover'])test('idle priority staff log '+category+' from actual feasibility',()=>{
 const f=setup();activate(f,[0,2,3]);let ds=[demand(f,2)];
 if(category==='not available that period')f.state.absences.push({id:'bob-away',staffId:'bob',date:f.date,periods:[2]});
 if(category==='restricted period')ds=[demand(f,0)];
 if(category==='daily max reached'){f.state.systemConfig.adhocReliefMaxPeriods=1;f.teachers[1].cells[5]=['EL','4B','',''];}
 if(category==='consecutive limit'){f.state.systemConfig.maxConsecutivePeriods=1;f.teachers[1].cells[1]=['PD','','',''];}
 if(category==='activation window')f.state.adhoc[0].periods=[3];
 if(category==='no lessons to cover')ds=[];
 f.state.systemConfig.verboseLogging=false;
 const plan=A.optimise(f.state,f.ctx,f.date,ds),idle=plan.priority1Idle.find(row=>row.staffId==='bob');assert(idle);assert(idle.reasons.some(r=>r.category===category));
 assert.equal(plan.decisionEvidence,undefined,'compact reasons remain available with verbose evidence off');
});

test('a higher-coverage equal-preference plan retains a previously covered demand',()=>{
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.state.accountingYears['2026']={verified:true};f.state.systemConfig.consecutiveSubjectRules=[];
 f.people[3].active=false;f.teachers[1].R=1;f.teachers[2].R=1;
 f.teachers[1].cells[1]=['EL','4A','',''];f.teachers[1].cells[3]=['EL','4A','',''];f.teachers[2].cells[2]=['EL','4A','',''];
 f.state.absences.push({id:'alice-away',staffId:'alice',date:f.date,periods:[1,2,3]});f.state.assignments.push({id:'prior',date:f.date,demandId:'d3',period:3,staffId:'charlie',status:'draft',origin:'automatic',rCost:1});
 const plan=A.optimise(f.state,f.ctx,f.date,[1,2,3].map(p=>demand(f,p)));assert.equal(plan.coverage,2);assert(plan.assignments.some(a=>a.demandId==='d3'&&a.staffId==='charlie'));assert.equal(plan.fairness.changes,0);assert.equal(plan.solver.preferencesProven,true);
});
for(const category of ['daily max reached','consecutive limit'])test('whole lesson blocks explain idle priority staff: '+category,()=>{
 const f=setup();activate(f);f.state.systemConfig.consecutiveSubjectRules=[{subject:'EL',periods:2}];
 if(category==='daily max reached')f.state.systemConfig.adhocReliefMaxPeriods=1;else f.state.systemConfig.maxConsecutivePeriods=1;
 const plan=A.optimise(f.state,f.ctx,f.date,[2,3].map(p=>demand(f,p))),idle=plan.priority1Idle.find(row=>row.staffId==='bob');assert(idle);assert(idle.reasons.some(r=>r.category===category),JSON.stringify(idle));assert(!idle.reasons.some(r=>r.category==='no lessons to cover'));
});

for(const employment of ['', 'FT', 'FAJT', 'SRE'])test('any activated teacher outside the baseline receives priority, employment='+employment,()=>{
 for(const cap of [1,2]){
  const f=setup();f.people[1].employment=employment;delete f.ctx.days[f.date].deployTeachingEvidence;f.ctx.days[f.date].teachers=f.teachers.filter(t=>t.staffId!=='bob');f.state.systemConfig.adhocReliefMaxPeriods=cap;
  command(f,'saveAbsence',{staffId:'alice',typeId:'mc',periods:[2,3]});run(f);const before=structuredClone(A.effectiveAssignments(f.state));assert.equal(before.length,2);assert(!before.some(a=>a.staffId==='bob'));
  activate(f);assert.deepEqual(A.effectiveAssignments(f.state),before);const ranked=A.ranked(f.state,f.ctx,f.date,2).filter(r=>r.autoEligible);assert.equal(ranked[0].staffId,'bob');assert.equal(ranked[0].adhocPriority,true);
  assert.equal(A.manualRanks(A.manualModel(f.state,f.ctx,f.date),demand(f,2)).filter(r=>r.autoEligible)[0].id,'bob');
  run(f,'fill-only');assert.deepEqual(A.effectiveAssignments(f.state),before);
  const result=run(f),rows=A.effectiveAssignments(f.state);assert.equal(rows.length,2);assert.equal(rows.filter(a=>a.staffId==='bob').length,cap);assert.equal(result.run.priority1.after,cap);assert.equal(result.run.reason,'priority-1 use improved');
 }
});
test('ad hoc priority requires activation for this date and no baseline identity, including aliases and compact projections',()=>{
 const f=setup();f.people[1].employment='FT';const baseline=structuredClone(f.ctx.days[f.date]);f.ctx.days[f.date].teachers=f.teachers.filter(t=>t.staffId!=='bob');
 let t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert(!t.adhocPriority);assert(!A.eligibility(t,2).autoEligible);
 activate(f);assert.equal(A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority,true);
 f.state.adhoc[0].date='2026-10-15';assert(!A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority);f.state.adhoc[0].date=f.date;
 f.state.adhoc[0].deletedAt=f.ctx.iso;assert(!A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority);delete f.state.adhoc[0].deletedAt;
 f.ctx.baselineDays={[f.date]:baseline};assert(!A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority,'an empty dated slice still belongs to the baseline');
 baseline.teacherIdentities=baseline.teachers.map(({staffId,name})=>({staffId,name}));baseline.teachers=[];assert(!A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority,'compact projection retains full identities');
 delete f.ctx.baselineDays;f.people[1].mobile=f.people[2].mobile;assert(!A.teacherContext(f.state,f.ctx,f.date).get('bob').adhocPriority,'a linked timetable identity is still a baseline teacher');
});
test('non-SRE ad hoc priority retains activation, workload and idle-reason limits',()=>{
 const f=setup();f.people[1].employment='FT';f.ctx.days[f.date].teachers=f.teachers.filter(t=>t.staffId!=='bob');activate(f,[2,3]);
 assert(!A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),1).autoEligible);
 f.state.systemConfig.consecutiveSubjectRules=[{subject:'EL',periods:2}];f.state.systemConfig.adhocReliefMaxPeriods=1;
 let plan=A.optimise(f.state,f.ctx,f.date,[2,3].map(p=>demand(f,p)));assert(plan.priority1Idle.find(r=>r.staffId==='bob').reasons.some(r=>r.category==='daily max reached'));
 f.state.systemConfig.adhocReliefMaxPeriods=10;f.state.systemConfig.maxConsecutivePeriods=1;
 plan=A.optimise(f.state,f.ctx,f.date,[2,3].map(p=>demand(f,p)));assert(plan.priority1Idle.find(r=>r.staffId==='bob').reasons.some(r=>r.category==='consecutive limit'));
 f.state.absences.push({id:'bob-away',staffId:'bob',date:f.date,periods:[2]});assert(!A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2).autoEligible);
});
test('non-SRE ad hoc priority retains the optional non-SRE daily relief cap',()=>{
 const f=setup();f.people[1].employment='TEMP';f.ctx.days[f.date].teachers=f.teachers.filter(t=>t.staffId!=='bob');activate(f,[2,3]);f.state.systemConfig.allocationRuleEnabled.dailyRelief=true;f.state.systemConfig.maxDailyReliefPeriods=1;
 const plan=A.optimise(f.state,f.ctx,f.date,[2,3].map(p=>demand(f,p)));assert.equal(plan.coverage,2);assert.equal(plan.assignments.filter(a=>a.staffId==='bob').length,1);
 const t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert.equal(t.allocationLimits.dailyRelief,1);assert.equal(A.eligibility(t,3,[demand(f,2)]).automaticReliefViolation,true);
});
for(const employment of ['FT','UT'])test('ad hoc priority uses the explicitly activated Contact identity and its own limits, '+employment,()=>{
 const f=setup();f.people[1].employment=employment;f.ctx.days[f.date].teachers=f.teachers.filter(t=>t.staffId!=='bob');f.people.push({id:'aa-bob-old',name:'Old Bob',employment:'FT',active:false,mobile:f.people[1].mobile});activate(f);
 const teachers=A.teacherContext(f.state,f.ctx,f.date),plan=A.optimise(f.state,f.ctx,f.date,[2,3].map(p=>demand(f,p)));
 assert(!plan.assignments.some(a=>a.staffId==='aa-bob-old'),'an unactivated alias cannot receive the relief');assert.equal(teachers.get('bob').canonicalId,'bob');assert(!teachers.get('aa-bob-old').adhocPriority);
 if(employment==='UT'){assert.equal(teachers.get('bob').balance.capVerified,false);assert(!plan.assignments.some(a=>a.staffId==='bob'));}else assert.equal(plan.assignments.filter(a=>a.staffId==='bob').length,2);
});
