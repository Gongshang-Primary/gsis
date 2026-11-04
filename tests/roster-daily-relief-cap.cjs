'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');

function setup(enabled=true,limit=3){
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00'),iso:f.date+'T06:00:00+08:00'});
 for(const t of f.teachers){t.cells=f.blank();t.R=t.staffId==='bob'?30:0;t.teachingProfile={subjects:[],levels:[]};}
 A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};
 f.state.systemConfig.allocationRuleEnabled={dailyTotal:false,adhocDailyTotal:false,consecutive:false,...(enabled===undefined?{}:{dailyRelief:enabled})};
 f.state.systemConfig.maxDailyReliefPeriods=limit;f.state.systemConfig.consecutiveSubjectRules=[];return f;
}
const teacher=f=>A.teacherContext(f.state,f.ctx,f.date).get('bob');
const demands=(f,periods,subject='EL')=>periods.map(period=>({id:'d'+period,date:f.date,staffId:'alice',period,subject,className:'4A',venue:'C1-01'}));
const held=(f,id,period,extra={})=>({id,date:f.date,period,staffId:'bob',demandId:id,status:'published',origin:'smc',protected:true,rCost:1,version:1,...extra});
const solve=(f,periods,options={})=>A.optimise(f.state,f.ctx,f.date,demands(f,periods),options);
function absentLessons(f,periods){
 for(const p of periods)f.teachers[0].cells[p]=['EL','4A','C1-01',''];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods});
 return f.O.demand(f.ctx,f.state,f.date);
}

test('missing and disabled relief settings preserve four-period automatic coverage',()=>{
 const f=setup(false);delete f.state.systemConfig.allocationRuleEnabled.dailyRelief;delete f.state.systemConfig.maxDailyReliefPeriods;
 assert.equal(solve(f,[1,3,5,7]).coverage,4);assert.equal(A.workloadLimits(f.state.systemConfig).dailyRelief,null);
 f.O.validateState(f.state);assert.equal(f.state.systemConfig.maxDailyReliefPeriods,3);assert.equal(f.state.systemConfig.allocationRuleEnabled.dailyRelief,false);
 f.state.systemConfig.maxDailyReliefPeriods=1;assert.equal(solve(f,[1,3,5,7]).coverage,4);
 f.state.systemConfig.allocationRuleEnabled.dailyRelief=false;assert.equal(solve(f,[1,3,5,7]).coverage,4);
});

test('enabled cap allows three relief periods and blocks the fourth without counting own work',()=>{
 const f=setup();f.teachers[1].cells[0]=['EL','4A','',''];f.teachers[1].cells[2]=['Duty','','',''];f.teachers[1].cells[4]=['PD','','',''];f.teachers[1].cells[6]=['Invigilation','AA','',''];
 assert.equal(solve(f,[1,3,5,7]).coverage,3);
 const e=A.eligibility(teacher(f),7,[1,3,5]);assert.equal(e.dailyReliefPeriods,4);assert.equal(e.automaticReliefViolation,true);assert.equal(e.autoEligible,false);assert.equal(e.available,true);assert.match(e.dailyReliefWarning,/Daily relief limit 3 reached/);assert(!e.warnings.some(w=>/Daily relief limit/.test(w)));
});

test('complete-plan uncovered explanations name the relief cap that exhausted candidates',()=>{
 const f=setup(),result=solve(f,[1,3,5,7]),uncovered=result.decisionEvidence.lessons.filter(d=>d.disposition==='uncovered');
 assert.equal(uncovered.length,1);assert.match(uncovered[0].uncoveredReason,/Daily relief limit 3 reached/);
});

test('relief limit accepts only whole values from one to seventeen even while disabled',()=>{
 const f=setup(false);for(const value of [0,18,2.5,null,'3',NaN])assert.throws(()=>A.workloadLimits({...f.state.systemConfig,maxDailyReliefPeriods:value}),e=>e.status===400);
 for(const value of [1,17])assert.doesNotThrow(()=>A.workloadLimits({...f.state.systemConfig,maxDailyReliefPeriods:value}));
});

test('manual, approved peer and zero-cost relief count once per held period',()=>{
 const f=setup();f.state.assignments.push(held(f,'manual',1),held(f,'peer',3,{origin:'mutual',mutual:true,peerApproved:true}),held(f,'combined',5,{combination:true,rCost:0}),held(f,'same-period',5,{combination:true,rCost:0}),held(f,'not-needed',9,{noRelief:true}),held(f,'cancelled',11,{status:'cancelled'}));
 const e=A.eligibility(teacher(f),7);assert.equal(e.dailyReliefPeriods,4);assert.equal(e.autoEligible,false);assert.equal(e.available,true);
 const before=structuredClone(f.state.assignments),result=solve(f,[7]);assert.equal(result.coverage,0);assert.deepEqual(f.state.assignments,before);
});

test('pending peer reservations consume their slot but no relief-period headroom',()=>{
 const f=setup(true,1);f.state.requests.push({id:'pending',date:f.date,recipientId:'bob',periods:[1],demandIds:['pending-demand'],status:'pending',expiresAt:f.ctx.now+60000});
 assert.equal(A.eligibility(teacher(f),1).autoEligible,false);assert.equal(A.eligibility(teacher(f),3).dailyReliefPeriods,1);assert.equal(solve(f,[3]).coverage,1);
});

test('imported held periods count by slot across aliases and ignore aggregate or inactive rows',()=>{
 const f=setup();f.teachers[1].R=100;f.state.entitlements.find(e=>e.staffId==='bob').quota=100;f.people.push({id:'bob-old',name:'Old Bob',active:false,mobile:f.people[1].mobile});
 f.state.importedRelief.push(held(f,'import',1,{origin:'imported',rCost:7}),held(f,'alias-import',3,{staffId:'bob-old',origin:'imported'}),held(f,'same-slot',3,{origin:'imported'}),held(f,'aggregate',null,{origin:'imported',rCost:20}),held(f,'cancelled-import',5,{origin:'imported',status:'cancelled'}),held(f,'invalid-import',7,{origin:'imported',invalidCover:true}),held(f,'other-date',9,{origin:'imported',date:'2026-10-13'}));
 assert.equal(A.eligibility(teacher(f),5).dailyReliefPeriods,3);assert.equal(solve(f,[5,7]).coverage,1);
 const model=A.manualModel(f.state,f.ctx,f.date),rank=A.manualRanks(model,demands(f,[5])[0]).find(r=>r.staffId==='bob');assert.equal(rank.dailyReliefPeriods,3);assert(!rank.dailyReliefWarning);
});

test('import corrections and Stapler absence or publication supersession use held ledger semantics',()=>{
 const f=setup(true,2);f.state.importedRelief.push(held(f,'corrected',1,{origin:'imported'}),held(f,'transfer',3,{origin:'stapler',status:'draft'}),held(f,'published-transfer',5,{origin:'stapler',status:'draft'}));
 f.state.reliefCorrections.push({assignmentId:'corrected',sequence:1,actual:{period:7,completionStatus:'completed'}});
 f.state.absences.push({id:'away',staffId:'bob',date:f.date,periods:[3]});f.state.assignments.push(held(f,'published-cover',5));
 const e=A.eligibility(teacher(f),9);assert.equal(e.dailyReliefPeriods,3);assert.equal(e.autoEligible,false);
 f.state.reliefCorrections.push({assignmentId:'corrected',sequence:2,actual:{completionStatus:'not-completed'}});assert.equal(A.eligibility(teacher(f),9).dailyReliefPeriods,2);assert.equal(A.eligibility(teacher(f),9).autoEligible,true);
});

test('daily, long-term and unverified SREs are exempt from this non-SRE cap',()=>{
 for(const periods of [0,4,null]){const f=setup(true,1);f.people[1].employment='FAJT; SRE';f.ctx.days[f.date].deployTeachingEvidence={verified:periods!==null,rows:periods===null?[]:[{id:'bob',periods,verified:true}]};
  const e=A.eligibility(teacher(f),7,[1,3,5]);assert(!e.automaticReliefViolation);assert(!e.dailyReliefWarning);if(periods!==null)assert.equal(solve(f,[1,3,5,7]).coverage,4);else assert.equal(e.autoEligible,false);
 }
});

test('complete flow counts repurposed recess relief even though it consumes no R',()=>{
 const f=setup(true,1);f.teachers[1].cells[1]=['Recess duty P1','','',''];f.teachers[1].cells[3]=['Recess duty P1','','',''];
 const ds=[1,3].map(period=>({id:'recess'+period,date:f.date,period,staffId:null,recessActivationId:'recess',level:1})),result=A.optimise(f.state,f.ctx,f.date,ds);
 assert.equal(result.coverage,1);assert.equal(result.assignments[0].rCost,0);assert.equal(result.assignments[0].repurposedDuty,true);assert(result.coverageProven);
});

test('flow retains feasible ordinary coverage overlapping an imported held period',()=>{
 const t={id:'bob',balance:{remaining:10},base:new Set(),assigned:new Set(),importedReliefPeriods:[1],eligible:new Set([1,3]),periodCount:17,allocationLimits:{dailyTotal:null,consecutive:null,dailyRelief:1}};
 const result=A.solveCoverage([t],[{id:'same',period:1},{id:'new',period:3}],{teacherCost:()=>0,edgeCost:()=>0});assert.equal(result.coverage,1);assert.equal(result.assignments[0].period,1);assert(result.proven);
});

test('consecutive blocks and residual ordinary lessons share the relief cap',()=>{
 const f=setup(true,3);f.state.systemConfig.consecutiveSubjectRules=[{subject:'PAL',periods:3}];
 const ds=[...demands(f,[1,2,3],'PAL'),...demands(f,[5])];assert.equal(A.optimise(f.state,f.ctx,f.date,ds).coverage,3);
 f.state.importedRelief.push(held(f,'held-import',7,{origin:'imported'}));const r=A.optimise(f.state,f.ctx,f.date,ds);assert.equal(r.coverage,1);assert.equal(r.assignments[0].period,5);assert.match(r.decisionEvidence.lessons.find(d=>d.subject==='PAL').uncoveredReason,/Daily relief limit 3 reached/);
});

test('an incomplete subject block keeps its explicit review reason when relief headroom is exhausted',()=>{
 const f=setup(true,1);f.state.systemConfig.consecutiveSubjectRules=[{subject:'PAL',periods:3}];
 const r=A.optimise(f.state,f.ctx,f.date,[...demands(f,[1,2],'PAL'),...demands(f,[5])]);assert.equal(r.coverage,1);
 const lesson=r.decisionEvidence.lessons.find(d=>d.subject==='PAL');assert.match(lesson.uncoveredReason,/incomplete/);assert(!/Daily relief limit/.test(lesson.uncoveredReason));
});

test('manual draft rebase and replacement exclude old demand while preserving imported held work',()=>{
 const f=setup(true,2);f.state.importedRelief.push(held(f,'import',1,{origin:'imported'}));f.state.assignments.push(held(f,'old',3,{status:'draft',demandId:'d3'}));
 const model=A.manualModel(f.state,f.ctx,f.date),rank=(m,p)=>A.manualRanks(m,demands(f,[p])[0]).find(r=>r.staffId==='bob');
 assert.equal(rank(model,3).dailyReliefPeriods,2);assert(!rank(model,3).dailyReliefWarning);assert.match(rank(model,5).warnings.join(' '),/Daily relief limit 2 reached/);
 const changed=A.withManualAssignments(model,[]);assert.equal(rank(changed,5).dailyReliefPeriods,2);assert(!rank(changed,5).dailyReliefWarning);
});

test('bounded local exchanges cannot exceed relief headroom by overlooking zero-R recess cover',()=>{
 const f=setup(true,1);f.teachers[3].R=30;f.state.entitlements.find(e=>e.staffId==='dora').quota=30;f.teachers[1].cells[6]=['Recess duty P1','','',''];f.teachers[1].teachingProfile.subjects=['el'];
 f.state.systemConfig.allocationRuleEnabled={annualUtilisation:false,alternatives:false,weeklyRemaining:false,rotation:false,levelMatch:false,subjectMatch:true,dailyTotal:false,adhocDailyTotal:false,consecutive:false,dailyRelief:true};
 const ds=[...demands(f,[5]),{id:'recess',date:f.date,period:6,staffId:null,recessActivationId:'recess',level:1}],r=A.optimise(f.state,f.ctx,f.date,ds,{maxNodes:2});
 assert.equal(r.coverage,2);assert.equal(r.assignments.find(a=>a.period===5).staffId,'dora');assert.equal(r.assignments.find(a=>a.period===6).staffId,'bob');
});

test('manual save warns without refusal above cap',()=>{
 const f=setup(true,1),ds=absentLessons(f,[5]);f.state.assignments.push(held(f,'held',1));
 const result=f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'bob',demandIds:[ds[0].id]});
 const row=f.state.assignments.find(a=>a.id===result.savedIds[0]);assert.equal(row.staffId,'bob');assert.match(row.overrideWarnings.join(' '),/Daily relief limit 1 reached/);
});

test('manual combination saves its zero-cost relief warning above cap',()=>{
 const f=setup(true,1),ds=absentLessons(f,[5]);f.state.assignments.push(held(f,'held',1));f.teachers[1].cells[5]=['EL','4B','C1-01',''];
 const result=f.O.apply(f.state,f.ctx,{operation:'combine',date:f.date,staffId:'bob',demandIds:[ds[0].id]});
 const row=f.state.assignments.find(a=>a.id===result.savedIds[0]);assert.equal(row.rCost,0);assert.equal(row.combination,true);assert.match(row.overrideWarnings.join(' '),/Daily relief limit 1 reached/);
});

test('peer acceptance stays allowed above cap and then consumes automatic headroom',()=>{
 const f=setup(true,1),ds=absentLessons(f,[5,7]);f.state.assignments.push(held(f,'held',1));
 const chosen=ds.find(d=>d.period===5);f.state.requests.push({id:'peer',date:f.date,recipientId:'bob',recipientName:'Bob',absentId:'alice',absenceId:chosen.absenceId,demandIds:[chosen.id],periods:[5],status:'pending',expiresAt:f.ctx.now+60000,lessons:structuredClone([chosen])});
 f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,staffId:'bob'}},{operation:'respondMutual',id:'peer',decision:'approve'});
 assert.equal(f.state.requests.find(r=>r.id==='peer').status,'approved');assert(f.state.assignments.some(a=>a.requestId==='peer'&&a.peerApproved));assert.equal(A.eligibility(teacher(f),7).autoEligible,false);
});

test('manual Auto-allocate and scheduled entry points enforce the saved relief cap',()=>{
 for(const scheduled of [false,true])for(const enabled of [false,true]){
  const f=setup(enabled);absentLessons(f,[1,3,5,7]);
  if(scheduled){f.ctx.service=true;f.state.systemConfig.scheduledAllocationEnabled=true;f.O.scheduledTick(f.state,f.ctx,f.ctx.now);}else f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
  assert.equal(A.effectiveAssignments(f.state).filter(a=>a.staffId==='bob').length,enabled?3:4);const run=f.state.optimisationRuns.at(-1);assert.equal(run.workloadLimits.dailyRelief,enabled?3:null);
 }
});

test('rebuilt D1 domain and Google shared domain enforce the same saved cap',async()=>{
 const edge=await import('../roster-update/public/edge-roster-domain.js');
 for(const enabled of [false,true]){
  const outcomes=[];
  for(const operations of [require('../shared/roster-operations.js'),edge.GSISRosterOperations]){
   const f=setup(enabled);absentLessons(f,[1,3,5,7]);operations.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
   outcomes.push(A.effectiveAssignments(f.state).map(a=>({staffId:a.staffId,period:a.period})).sort((a,b)=>a.period-b.period));
  }
  assert.deepEqual(outcomes[1],outcomes[0]);assert.equal(outcomes[0].length,enabled?3:4);
 }
});
