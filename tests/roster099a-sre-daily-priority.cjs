'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
function setup(){
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00'),iso:f.date+'T06:00:00+08:00'});
 f.state.accountingYears['2026']={verified:true};f.people[1].employment='SRE';f.teachers[1].R=null;
 f.day=f.ctx.days[f.date];f.day.deployTeachingEvidence={verified:true,rows:[{id:'bob',periods:0,verified:true}]};
 f.state.systemConfig.maxConsecutivePeriods=40;return f;
}
const demand=(period)=>({id:'d'+period,staffId:'alice',date:'2026-10-14',period,subject:'EL',className:'4A'});
const assignment=(id,period,extra={})=>({id,date:'2026-10-14',period,staffId:'bob',demandId:id,status:'published',origin:'automatic',rCost:1,version:1,...extra});
test('non-SRE composite modifiers and candidate response fields retain their existing contract',()=>{
 const f=fixture();f.people[1].employment='FAJT, BT';
 let t=A.teacherContext(f.state,f.ctx,f.date).get('bob'),r=A.eligibility(t,0);
 assert(r.autoEligible,'the SRE change must not introduce a new restriction for FAJT modifiers');
 assert(!Object.hasOwn(r,'dailyRoster'));assert(!Object.hasOwn(r,'sreMode'));
 assert(!Object.hasOwn(A.balances(f.state,f.ctx,f.date).get('bob'),'dailyRoster'));
 assert(!Object.hasOwn(A.annual(f.state,f.ctx,'bob'),'dailyRoster'));
 const row=A.manualModel(f.state,f.ctx,f.date).teachers.find(row=>row.id==='bob');assert(!Object.hasOwn(row,'dailyRoster'));assert(!Object.hasOwn(row,'sreMode'));
 f.state.systemConfig.employmentPeriodRestrictions=[{employment:'FAJT, BT',periods:[2]}];
 t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert(!A.eligibility(t,2).autoEligible);assert(A.eligibility(t,0).autoEligible);
});
test('verified daily SREs need no R and precede lower annual utilisation without inventing entitlements',()=>{
 const f=setup();f.state.assignments.push(assignment('past',2,{date:'2026-10-13',status:'completed',rCost:80}));
 const t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert(A.eligibility(t,3).autoEligible);
 assert.equal(A.ranked(f.state,f.ctx,f.date,3).filter(r=>r.autoEligible)[0].staffId,'bob');
 assert.equal(A.optimise(f.state,f.ctx,f.date,[demand(3)]).assignments[0].staffId,'bob');
 const b=A.balances(f.state,f.ctx,f.date).get('bob');assert.equal(b.dailyRoster,true);assert.equal(b.utilisation,null);assert.equal(b.R,null);assert.equal(b.remaining,null);assert.equal(b.spent,80);
 A.captureWeek(f.state,f.ctx,f.date);assert(!f.state.entitlements.some(row=>row.staffId==='bob'));
});
test('daily and consecutive limits constrain the actual solver and can be changed or switched off',()=>{
 for(const [limit,expected] of [[1,1],[2,2],[3,3]]){
  const f=setup();for(const t of f.teachers)if(t.staffId!=='bob')t.R=0;
  f.state.systemConfig.adhocReliefMaxPeriods=limit;
  assert.equal(A.optimise(f.state,f.ctx,f.date,[1,2,3].map(demand)).assignments.length,expected);
 }
 for(const [limit,expected] of [[2,2],[3,3]]){
  const f=setup();for(const t of f.teachers)if(t.staffId!=='bob')t.R=0;
  f.state.systemConfig.maxConsecutivePeriods=limit;
  assert.equal(A.optimise(f.state,f.ctx,f.date,[1,2,3].map(demand)).assignments.length,expected);
 }
 const f=setup();for(const t of f.teachers)if(t.staffId!=='bob')t.R=0;
 f.state.systemConfig.maxDailyPeriods=1;f.state.systemConfig.adhocReliefMaxPeriods=1;f.state.systemConfig.allocationRuleEnabled={adhocDailyTotal:false};
 assert.equal(A.optimise(f.state,f.ctx,f.date,[1,2,3].map(demand)).coverage,3);
});
test('daily SRE load and rotation break ties before annual preferences',()=>{
 const f=setup();f.people[3].employment='SRE';f.teachers[3].R=null;f.day.deployTeachingEvidence.rows.push({id:'dora',periods:0,verified:true});
 f.state.assignments.push(assignment('bob-today',1));
 assert.equal(A.optimise(f.state,f.ctx,f.date,[demand(5)]).assignments[0].staffId,'dora');
 f.state.assignments[0].date='2026-10-13';f.state.rotationEvents.push({id:'turn',year:'2026',assignmentId:'bob-today',sequence:1});
 assert.equal(A.optimise(f.state,f.ctx,f.date,[demand(5)]).assignments[0].staffId,'dora');
 const model=A.manualModel(f.state,f.ctx,f.date),rank=A.manualRanks(model,demand(5)).filter(r=>r.autoEligible);
 assert.equal(rank[0].id,'dora');assert.equal(rank[0].dailyRoster,true);
});
test('a free selected day never replaces verified published Deploy evidence',()=>{
 const f=setup();f.day.deployTeachingEvidence.rows[0].periods=8;f.teachers[1].R=4;
 assert.equal(A.sreBasis(f.people[1],f.day.deployTeachingEvidence),'long-term');
 assert.equal(A.teacherContext(f.state,f.ctx,f.date).get('bob').dailyRoster,false);
 f.day.deployTeachingEvidence.verified=false;assert.equal(A.sreBasis(f.people[1],f.day.deployTeachingEvidence),'unknown');
 assert.equal(A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),3).autoEligible,false);
 const quota={teachingEvidenceVersion:1,from:'2026-01-01',to:'2026-12-31',source:{versionId:'published',revision:1},rows:[{id:'bob',teachingPeriods:0,teachingVerified:false}]};
 assert.equal(A.sreBasis(f.people[1],A.deploymentTeachingEvidence(quota,f.date)),'unknown');
 quota.rows[0].teachingVerified=true;assert.equal(A.sreBasis(f.people[1],A.deploymentTeachingEvidence(quota,f.date)),'daily');
 delete quota.teachingEvidenceVersion;assert.equal(A.sreBasis(f.people[1],A.deploymentTeachingEvidence(quota,f.date)),'unknown');
});
test('inactive daily SREs require date activation and retain absence, period and peer protections',()=>{
 const f=setup();f.people[1].active=false;f.day.teachers=f.day.teachers.filter(t=>t.staffId!=='bob');
 assert(!A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2).autoEligible);
 f.state.adhoc.push({id:'day-activation',date:f.date,staffId:'bob',periods:[0,2]});
 let t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert(A.eligibility(t,2).autoEligible);assert(!A.eligibility(t,3).autoEligible);assert(!A.eligibility(t,0).autoEligible);
 f.state.absences.push({id:'absence',staffId:'bob',date:f.date,periods:[2]});t=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert(!A.eligibility(t,2).autoEligible);
 f.state.absences=[];f.state.requests.push({id:'peer',recipientId:'bob',date:f.date,status:'pending',periods:[2],demandIds:['d2'],expiresAt:f.ctx.now+60000});
 assert(!A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2).autoEligible);
 f.people[1].employment='SRE, BT';assert(!A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),0).autoEligible);
});
test('the real edge context carries published teaching evidence into the allocator',async()=>{
 const f=setup(),R=require('../shared/roster.js');
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>t.cells).flat()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 const {edgeRosterContextFromReferences}=await import('../roster-update/public/edge-roster-context.js');
 const quota={teachingEvidenceVersion:1,from:'2026-01-01',to:'2026-12-31',source:{versionId:'published',revision:1},rows:[{id:'bob',teachingPeriods:0,teachingVerified:true,R:null}],formClasses:[],teachingGroups:[],venues:[]};
 const ctx=edgeRosterContextFromReferences({state:f.state,input:{operation:'autoAllocate',date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'single'}}},who:f.ctx.user,contacts:{user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:f.people.map(p=>({...p,adhocEligible:true}))},index:{entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]},models:new Map([['baseline',model]]),quota,referenceKey:'fixture',clock:f.ctx,env:{}});
 assert.equal(A.sreBasis(f.people[1],ctx.days[f.date].deployTeachingEvidence),'daily');assert(A.eligibility(A.teacherContext(f.state,ctx,f.date).get('bob'),2).autoEligible);
});
test('consecutive lesson blocks use the daily limit and protected assignments stay untouched',()=>{
 const f=setup();for(const t of f.teachers)if(t.staffId!=='bob')t.R=0;
 f.state.systemConfig.adhocReliefMaxPeriods=2;const ds=[2,3,4].map(p=>({...demand(p),subject:'PAL'}));
 assert.equal(A.optimise(f.state,f.ctx,f.date,ds).coverage,0);
 f.state.systemConfig.adhocReliefMaxPeriods=3;assert.equal(A.optimise(f.state,f.ctx,f.date,ds).coverage,3);
 f.state.assignments.push(assignment('fixed',6,{origin:'smc',protected:true,demandId:'d6'}));const before=JSON.stringify(f.state.assignments);
 A.optimise(f.state,f.ctx,f.date,[...ds,demand(6)]);assert.equal(JSON.stringify(f.state.assignments),before);
});
test('personal daily roster projection retains counts and suppresses a false quota percentage',()=>{
 const f=setup(),original={asOf:f.date,source:{from:'2026-01-01',to:'2026-12-31'},deployTeachingEvidence:f.day.deployTeachingEvidence,calculation:{R:40},completion:{completed:7,entitlement:100,percentage:7}};
 const out=A.dailyRosterCalculation(original,f.people[1]);assert.equal(out.reliefBasis,'daily');assert.equal(out.calculation,null);assert.equal(out.completion.completed,7);assert.equal(out.completion.percentage,null);assert.equal(original.completion.percentage,7);
});
test('published Google and edge Deploy projections supply the same verified SRE teaching evidence',async()=>{
 const {harness}=require('./roster716-calculations.cjs'),h=harness();
 h.doc.teachers.find(t=>t.id==='plain').profile['Employment Modifier']='SRE';h.contacts.rosterPeople.find(p=>p.id==='plain').employment='SRE';
 h.doc.assignments=h.doc.assignments.filter(a=>a.teacher!=='plain');h.state.importedRelief=[{id:'history',staffId:'plain',date:'2026-10-12',status:'completed',rCost:7,origin:'imported'}];
 const google=h.read();assert.equal(google.reliefBasis,'daily');assert.equal(google.calculation,null);assert.equal(google.completion.completed,7);
 h.scope.hash_=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const quota=h.scope.reliefRosterQuota_(h.scope.book_(),h.idx,h.en);
 const {createDeployDomain}=await import('../roster-update/public/edge-deploy-domain.js'),{sha256Bytes}=await import('../roster-update/public/edge-deploy-sha256.js');
 const domain=createDeployDomain({state:{index:{versions:[],published:h.en,revision:2}},identity:{email:'fixture@test.invalid'},sha256:sha256Bytes,calculations:new Map(),integration(){throw Error('Unexpected integration');}});
 const edgeQuota=domain.rosterReference(h.doc,h.en),project=q=>A.deploymentTeachingEvidence(q,'2026-10-19');
 assert.deepEqual(JSON.parse(JSON.stringify(project(quota))),project(edgeQuota));
 const {row,reference,...own}=domain.personalCalculation(h.doc,h.en,'plain','2026-10-19');
 const edge=A.dailyRosterCalculation({...own,completion:google.completion},h.contacts.rosterPeople[0]);assert.equal(edge.reliefBasis,google.reliefBasis);assert.equal(edge.calculation,null);
 h.doc.assignments.push({id:'teach',teacher:'plain',target:'1A',targetRef:'class1',subject:'EL'});assert.equal(h.read().reliefBasis,'long-term');
});
