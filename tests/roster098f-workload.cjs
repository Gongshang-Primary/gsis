'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js'),S=require('../shared/roster-stapler.js');
function setup(confirmed=true){const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.minute=360;f.ctx.iso=new Date(f.ctx.now).toISOString();f.state.systemConfig={...f.state.systemConfig,maxDailyPeriods:1,maxConsecutivePeriods:1};
 for(const t of f.teachers){t.R=0;Object.assign(t,{periodCap:26,capConfigured:true,capVerified:false,capWorkload:null,capHeadroom:null});}
 const p=S.create({...f.ctx.days[f.date],date:f.date});f.state.staplerPlans.push({date:f.date,baselineId:p.baselineId,revision:1,confirmed,draft:p});return f;}
{
 const f=setup();const ctx=f.O.composeStaplerContext(f.state,f.ctx);assert.equal(ctx.days[f.date].workloadIgnored,true,'only confirmed composition skips the workload formula');
 const id=f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]}).savedId,dem=f.O.demand(ctx,f.state,f.date)[0],model=A.manualModel(f.state,ctx,f.date),bob=A.manualRanks(model,dem).find(t=>t.staffId==='bob');assert.equal(bob.available,false);assert.equal(bob.Rviolation,true);assert.equal(bob.capViolation,true);assert.equal(bob.autoEligible,false);assert.equal(bob.warnings.some(x=>/quota|cap|consecutive/i.test(x)),true);
 const run=A.optimise(f.state,ctx,f.date,f.O.demand(ctx,f.state,f.date));assert.equal(run.coverage,0,'a suspended timetable cannot bypass zero R or an unverified contractual cap');
 assert.throws(()=>f.O.apply(f.state,ctx,{operation:'assign',date:f.date,demandIds:[id+':2'],staffId:'bob'}),/employment cap cannot be verified/);assert.equal(f.state.assignments.length,0);
 f.people[2].active=false;const visible=A.manualModel(f.state,ctx,f.date);assert(visible.teachers.some(t=>t.id==='charlie'),'inactive identity remains visible with blocked availability');assert.equal(A.manualRanks(visible,dem).find(t=>t.id==='charlie').available,false);
}
{
 const f=setup(false),ctx=f.O.composeStaplerContext(f.state,f.ctx);assert.notEqual(ctx.days[f.date].workloadIgnored,true);const t=A.teacherContext(f.state,ctx,f.date).get('bob');assert.equal(A.eligibility(t,2).available,false,'unconfirmed drafts keep baseline cap enforcement');
}
{
 const f=setup();f.state.staplerPlans[0].draft=S.apply(f.state.staplerPlans[0].draft,{type:'addTile',tile:{teacherId:'bob',period:2,subject:'DUTY'}});const ctx=f.O.composeStaplerContext(f.state,f.ctx);assert.equal(A.eligibility(A.teacherContext(f.state,ctx,f.date).get('bob'),2).available,false,'real occupied periods remain blocked');
}
{const f=setup(),ctx=f.O.composeStaplerContext(f.state,f.ctx);f.O.apply(f.state,ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});const result=f.O.apply(f.state,ctx,{operation:'autoAllocate',date:f.date});assert.notEqual(result.paused,true,'a genuinely empty loaded ledger may initialise verified zero history');assert.equal(result.savedIds.length,0);assert.equal(result.run.coverage,0,'automatic allocation still respects exhausted R and unverified caps');}
console.log('PASS F suspended formula-only exemption, retained R/cap enforcement, zero-history initialisation, model visibility and actual clashes');
