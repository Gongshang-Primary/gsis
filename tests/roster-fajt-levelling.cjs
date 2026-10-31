'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../shared/roster-allocation'),fixture=require('./roster701-fixture.cjs');
function setup(percentage=55,on=true,margin=20){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.people[1].employment='FAJT';
 f.state.accountingYears['2026']={verified:true};f.state.systemConfig.allocationRuleEnabled={...A.ruleToggles(),fajtLevelling:on};f.state.systemConfig.fajtLeadPoints=margin;
 const used={alice:70,bob:percentage,charlie:40,dora:10};
 f.teachers.forEach(t=>{t.R=['bob','dora'].includes(t.staffId)?4:0;t.cells=f.blank();});
 f.state.entitlements=f.people.map(p=>({staffId:p.id,week:'2026-01-05',year:'2026',quota:100}));
 f.state.importedRelief=f.people.map(p=>({id:'history-'+p.id,staffId:p.id,date:'2026-01-05',period:1,status:'completed',rCost:used[p.id]}));
 f.demands=[{id:'lesson',staffId:'alice',date:f.date,period:3,subject:'EL',className:'4A'}];return f;
}
function winners(f){return [A.ranked(f.state,f.ctx,f.date,3).find(r=>r.autoEligible).staffId,A.manualRanks(A.manualModel(f.state,f.ctx,f.date),f.demands[0]).find(r=>r.autoEligible).id,A.optimise(f.state,f.ctx,f.date,f.demands).assignments[0]?.staffId];}
test('new and existing settings ship FAJT levelling Off',()=>{
 assert.equal(A.ruleToggles().fajtLevelling,false);
 assert.equal(fixture().state.systemConfig.fajtLeadPoints,20);
 assert.deepEqual(winners(setup(55,false)),['dora','dora','dora']);
});
test('FAJT leads below the configured threshold across automatic/manual/solver paths',()=>assert.deepEqual(winners(setup()),['bob','bob','bob']));
test('threshold equality, a higher FAJT mean and changed margin restore ordinary ranking',()=>{
 for(const f of [setup(60),setup(62),setup(55,true,10)])assert.deepEqual(winners(f),['dora','dora','dora']);
});
test('FAJT mean uses the full active eligible school and sorts known FAJT utilisation first',()=>{
 const f=setup();f.people[2].employment='FAJT';f.teachers[2].R=4;
 f.state.importedRelief.find(r=>r.staffId==='charlie').rCost=45;
 assert.deepEqual(winners(f),['charlie','charlie','charlie']);
 f.state.entitlements.find(r=>r.staffId==='charlie').quota=0;
 f.state.importedRelief.find(r=>r.staffId==='charlie').rCost=0;
 assert.deepEqual(winners(f),['bob','bob','bob']);
});
test('SRE priority, workload caps and restricted periods remain stronger than FAJT priority',()=>{
 const f=setup();f.people[2].employment='SRE';f.ctx.days[f.date].deployTeachingEvidence={verified:true,rows:[]};
 assert.deepEqual(winners(f),['charlie','charlie','charlie']);
 const g=setup();g.state.systemConfig.maxDailyPeriods=1;g.teachers[1].cells[4]=['EL','4A','',''];assert.deepEqual(winners(g),['dora','dora','dora']);
 const h=setup();h.state.systemConfig.employmentPeriodRestrictions=[{employment:'FAJT',periods:[3]}];assert.deepEqual(winners(h),['dora','dora','dora']);
});
test('lead margin accepts zero and 100 and rejects invalid input',()=>{
 for(const value of [0,100])assert.equal(A.fajtSettings({fajtLeadPoints:value}).margin,value);
 for(const value of [-1,101,'20',NaN,Infinity,null])assert.throws(()=>A.fajtSettings({fajtLeadPoints:value}),e=>e.status===400);
});

test('System Config reports the same persisted means without a new quota read',()=>{
 const f=setup();const view=f.O.view(f.state,f.ctx,{view:'systemConfig'});
 assert.equal(view.fajtLevelling.fajtMean,55);assert.equal(view.fajtLevelling.schoolMean,40);assert.equal(view.fajtLevelling.active,true);
});

test('a later run recalculates the cohort threshold from changed recorded balances',()=>{
 const f=setup();assert.deepEqual(winners(f),['bob','bob','bob']);
 f.state.importedRelief.find(r=>r.staffId==='bob').rCost=62;
 assert.deepEqual(winners(f),['dora','dora','dora']);
 f.state.importedRelief.find(r=>r.staffId==='bob').rCost=55;
 assert.deepEqual(winners(f),['bob','bob','bob']);
});

test('Settings and allocation exclude the same conflicting Contacts identities',()=>{
 const f=setup();f.people[0].mobile=f.people[2].mobile='90000000';
 f.state.importedRelief.find(r=>r.staffId==='alice').rCost=100;
 f.state.importedRelief.find(r=>r.staffId==='charlie').rCost=100;
 const expected=A.fajtStatus(A.teacherContext(f.state,f.ctx,f.date),f.state.systemConfig),actual=f.O.view(f.state,f.ctx,{view:'systemConfig'}).fajtLevelling;
 assert.equal(expected.schoolMean,10);assert.deepEqual(actual,expected);
});

