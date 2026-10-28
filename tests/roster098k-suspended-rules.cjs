'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js'),S=require('../shared/roster-stapler.js');
function setup(){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.quotaRequested=true;
 for(const t of f.teachers){t.cells=f.blank();t.R=t.staffId==='alice'?0:100;}
 f.state.accountingYears['2026']={verified:true};f.state.systemConfig.maxDailyPeriods=8;f.state.systemConfig.maxConsecutivePeriods=6;f.state.systemConfig.sharedSubjectCoverEnabled=false;f.state.systemConfig.consecutiveSubjectRules=[];
 return f;
}
const teacher=(f,id)=>f.teachers.find(t=>t.staffId===id);
function lessons(f,id,periods,subject='EL'){for(const p of periods)teacher(f,id).cells[p]=[subject,'4A','A',''];}
function suspend(f){A.captureWeek(f.state,f.ctx,f.date);const plan=S.create({...f.ctx.days[f.date],date:f.date});f.ctx.baselineDays=structuredClone(f.ctx.days);f.state.staplerPlans.push({date:f.date,baselineId:plan.baselineId,revision:1,confirmed:true,confirmedRevision:1,confirmedPlan:plan,draft:plan});f.ctx=f.O.composeStaplerContext(f.state,f.ctx);assert.equal(f.ctx.days[f.date].workloadIgnored,true);return plan;}
function report(f,periods){f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods});return f.O.demand(f.ctx,f.state,f.date);}
const solve=(f,ds,options)=>A.optimise(f.state,f.ctx,f.date,ds,options);
function onlyBob(f){for(const id of ['charlie','dora'])f.people.find(p=>p.id===id).active=false;}

test('suspended effective timetable retains the consecutive hard limit',()=>{
 const f=setup();f.state.systemConfig.maxDailyPeriods=40;lessons(f,'alice',[7]);lessons(f,'bob',[0,1,2,3,4,5,6]);suspend(f);const ds=report(f,[7]),t=A.teacherContext(f.state,f.ctx,f.date).get('bob'),e=A.eligibility(t,7);
 assert.equal(e.consecutive,8);assert.equal(t.allocationLimits.consecutive,6);assert.equal(e.autoEligible,false);assert.equal(e.automaticStreakViolation,true);assert(!solve(f,ds).assignments.some(a=>a.staffId==='bob'));
});
test('suspended effective timetable retains the eight-period daily hard limit',()=>{
 const f=setup();f.state.systemConfig.maxConsecutivePeriods=40;lessons(f,'alice',[16]);lessons(f,'bob',[0,2,4,6,8,10,12,14]);suspend(f);report(f,[16]);const e=A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),16);
 assert.equal(e.dailyPeriods,9);assert.equal(e.automaticDailyViolation,true);assert.equal(e.autoEligible,false);
});
test('suspended days retain annual utilisation priority in ranking and complete plans',()=>{
 const f=setup();f.people.find(p=>p.id==='dora').active=false;lessons(f,'alice',[2]);
 for(const [staffId,rCost] of [['bob',30],['charlie',10]])f.state.importedRelief.push({id:'past-'+staffId,date:'2026-10-07',period:2,staffId,origin:'imported',status:'completed',rCost});
 suspend(f);const ds=report(f,[2]),r=solve(f,ds),ranked=A.ranked(f.state,f.ctx,f.date,2,ds);
 assert.deepEqual(r.preferences,A.preferenceRules.map(r=>r.id));assert.equal(r.assignments[0].staffId,'charlie');assert(ranked.find(r=>r.staffId==='charlie').rank<ranked.find(r=>r.staffId==='bob').rank);
 const model=A.manualModel(f.state,f.ctx,f.date),manual=A.manualRanks(model,ds[0]);assert(manual.find(r=>r.staffId==='charlie').rank<manual.find(r=>r.staffId==='bob').rank);
});
test('suspension preserves disabled settings and the saved complete preference order',()=>{
 const f=setup();f.state.systemConfig.allocationPreferences=['subjectMatch','annualUtilisation','rotation','weeklyRemaining','levelMatch','alternatives'];f.state.systemConfig.allocationRuleEnabled={annualUtilisation:false,weeklyRemaining:false,dailyTotal:false,consecutive:false};onlyBob(f);lessons(f,'alice',[7]);lessons(f,'bob',[0,1,2,3,4,5,6]);suspend(f);const ds=report(f,[7]),r=solve(f,ds);
 assert.equal(r.coverage,1);assert.deepEqual(r.preferences,['subjectMatch','rotation','levelMatch','alternatives']);assert.deepEqual(r.workloadLimits,{dailyTotal:null,consecutive:null});
});
test('suspended weekly quota constrains the full plan rather than each independent slot',()=>{
 const f=setup();onlyBob(f);teacher(f,'bob').R=1;lessons(f,'alice',[2,4]);suspend(f);const ds=report(f,[2,4]),r=solve(f,ds);
 assert.equal(r.coverage,1);assert.equal(r.assignments.length,1);
});
test('suspended missing or exhausted R is not unlimited and health remains unverified when missing',()=>{
 for(const R of [null,0]){const f=setup();onlyBob(f);teacher(f,'bob').R=R;lessons(f,'alice',[2]);suspend(f);const ds=report(f,[2]),e=A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2);
  assert.equal(e.Rviolation,true);assert.equal(e.autoEligible,false);assert.equal(solve(f,ds).coverage,0);if(R===null)assert.equal(A.health(f.state,f.ctx,f.date,ds).incomplete,true);
 }
});
test('all configured employment caps remain hard on suspension, not only UT',()=>{
 for(const headroom of [null,0,1]){const f=setup();onlyBob(f);Object.assign(teacher(f,'bob'),{periodCap:20,capConfigured:true,capBasis:'teaching',capVerified:headroom!==null,capHeadroom:headroom,capWorkload:headroom===null?null:20-headroom});lessons(f,'alice',[2]);suspend(f);const ds=report(f,[2]),e=A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2);
  assert.equal(e.capViolation,headroom!==1);assert.equal(solve(f,ds).coverage,headroom===1?1:0);
 }
});
test('a suspended FORM pair cannot exceed remaining weekly quota',()=>{
 const f=setup();onlyBob(f);teacher(f,'bob').R=1;f.state.systemConfig.consecutiveSubjectRules=[{subject:'FORM',periods:2}];lessons(f,'alice',[2,3],'FORM');suspend(f);const ds=report(f,[2,3]),r=solve(f,ds);assert.equal(r.coverage,0);assert.equal(r.assignments.length,0);
});
test('a suspended complete plan cannot bridge two vacancies into a seven-period streak',()=>{
 const f=setup();onlyBob(f);f.state.systemConfig.maxDailyPeriods=40;lessons(f,'alice',[3,6]);lessons(f,'bob',[0,1,2,4,5]);suspend(f);const ds=report(f,[3,6]),r=solve(f,ds);assert.equal(r.coverage,1);assert.equal(r.assignments.length,1);
});
test('mutable automatic drafts are repaired instead of retaining an over-limit suspended plan',()=>{
 const f=setup();onlyBob(f);f.state.systemConfig.maxDailyPeriods=40;lessons(f,'alice',[6,7]);lessons(f,'bob',[0,1,2,3,4,5]);suspend(f);const ds=report(f,[6,7]);
 for(const d of ds)f.state.assignments.push({id:'old-'+d.id,date:f.date,demandId:d.id,staffId:'bob',period:d.period,subject:d.subject,status:'draft',origin:'automatic',protected:false,rCost:1});
 const r=solve(f,ds);assert.equal(r.changed,true);assert.equal(r.coverage,1);assert.deepEqual(r.assignments.map(a=>a.period),[7]);assert.equal(r.reason,'invalid draft repaired');
});
test('manual suspension overrides retain warnings, ownership and cumulative accounting',()=>{
 const f=setup();teacher(f,'bob').R=0;f.state.systemConfig.maxDailyPeriods=40;lessons(f,'alice',[7]);lessons(f,'bob',[0,1,2,3,4,5,6]);suspend(f);const ds=report(f,[7]),before=structuredClone(f.state.entitlements);
 f.O.apply(f.state,f.ctx,{operation:'assign',staffId:'bob',demandIds:[ds[0].id]});const a=A.effectiveAssignments(f.state).find(a=>a.staffId==='bob');assert(a);assert(a.overrideWarnings.some(w=>/Weekly R quota/.test(w)));assert(a.overrideWarnings.some(w=>/consecutive/.test(w)));assert.equal(A.annual(f.state,f.ctx,'bob').spent,1);assert.equal(solve(f,ds).fixedCoverage,1);assert.deepEqual(f.state.entitlements,before);
});
test('suspended automatic allocation requires verified annual accounting',()=>{
 const f=setup();lessons(f,'alice',[2]);suspend(f);report(f,[2]);f.state.accountingYears['2026']={verified:false};f.state.importedRelief.push({id:'unverified-history',staffId:'bob',date:'2026-10-07',period:2,origin:'imported',status:'completed',rCost:1});
 const result=f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,requestId:'accounting-check'});assert.equal(result.paused,true);assert.equal(A.effectiveAssignments(f.state).length,0);
});
test('suspended decision evidence separates calculation skip from effective policy',()=>{
 const f=setup();lessons(f,'alice',[2]);suspend(f);const ds=report(f,[2]),r=solve(f,ds);assert.equal(r.decisionEvidence.policy.workloadCalculationSkipped,true);assert.deepEqual(r.decisionEvidence.policy.effectiveWorkloadLimits,{dailyTotal:8,consecutive:6});
});

test('configured consecutive-count exclusions remain active on suspended days',()=>{
 const f=setup();onlyBob(f);f.state.systemConfig.maxDailyPeriods=40;f.state.systemConfig.consecutiveCountExclusions=[{type:'exact',value:'INV'}];lessons(f,'alice',[7]);lessons(f,'bob',[0,1,2,3,4,5,6],'INV');suspend(f);const ds=report(f,[7]),e=A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),7);assert.equal(e.consecutive,1);assert.equal(e.autoEligible,true);assert.equal(solve(f,ds).coverage,1);
});
test('new non-UT contractual cap violations refuse selection and retain old SMC choices for review',()=>{
 const f=setup();lessons(f,'alice',[2]);suspend(f);const ds=report(f,[2]);f.O.apply(f.state,f.ctx,{operation:'assign',staffId:'bob',demandIds:[ds[0].id]});const saved=f.state.assignments.find(a=>a.staffId==='bob'),ownership=structuredClone(A.manualDecision(f.state,f.date,ds[0].id));
 Object.assign(f.ctx.days[f.date].teachers.find(t=>t.staffId==='bob'),{periodCap:20,capConfigured:true,capBasis:'teaching',capVerified:true,capHeadroom:0,capWorkload:20});
 f.O.reconcile(f.state,f.ctx);assert(f.state.assignments.includes(saved));assert.equal(saved.status,'draft');assert.equal(saved.invalidCover,true);assert.equal(saved.reviewRequired,true);assert.deepEqual(A.manualDecision(f.state,f.date,ds[0].id),ownership);
 assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'assign',staffId:'bob',demandIds:[ds[0].id]}),/employment cap would be exceeded/);assert.equal(solve(f,ds).coverage,0);assert(f.state.assignments.includes(saved));
});
