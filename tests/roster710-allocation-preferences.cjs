const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS',name);};
const defaults=['annualUtilisation','alternatives','weeklyRemaining','rotation'];
const alternativeFirst=['alternatives','annualUtilisation','weeklyRemaining','rotation'];
function setup(){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 f.teachers.forEach(t=>{t.R=['bob','dora'].includes(t.staffId)?4:0;t.cells=f.blank();});
 f.teachers.find(t=>t.staffId==='dora').cells[12]=['PD','','',''];
 A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};
 f.state.importedRelief.push({id:'past-dora',staffId:'dora',date:'2026-10-06',period:2,status:'completed',rCost:2});
 f.demands=[{id:'lesson',period:3,staffId:'alice'}];return f;
}
function proposal(f,preferences,other={}){return A.optimise(f.state,f.ctx,f.date,f.demands,{preferences,...other});}
function draft(f,staffId='bob'){f.state.assignments.push({id:'draft',date:f.date,period:3,demandId:'lesson',staffId,status:'draft',origin:'automatic',rCost:1,version:1});}
function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];}
test('Default annual priority and exact rule permutation are owned by allocation',()=>{
 assert.deepEqual(A.preferenceOrder(),[...defaults,'levelMatch','subjectMatch']);assert.deepEqual(A.preferenceRules.map(r=>r.id),[...defaults,'levelMatch','subjectMatch']);
 const supplied=alternativeFirst.slice(),validated=A.preferenceOrder(supplied);validated.reverse();assert.deepEqual(supplied,alternativeFirst);
 for(const bad of [null,{},'',[],defaults.slice(1),[...defaults,'unknown'],['rotation','rotation','alternatives','annualUtilisation']])assert.throws(()=>A.preferenceOrder(bad),e=>e.status===400);
});
test('Changing annual priority changes the final roster and accepts it despite worse annual spread',()=>{
 const f=setup();assert.equal(proposal(f).assignments[0].staffId,'bob');draft(f);
 const original=JSON.stringify(f.state),changed=proposal(f,alternativeFirst);
 assert(changed.changed);assert.equal(changed.assignments[0].staffId,'dora');assert(changed.fairness.after>changed.fairness.before);assert.match(changed.reason,/saved allocation preferences/);assert.equal(JSON.stringify(f.state),original);
 f.state.assignments[0].staffId='dora';const restored=proposal(f,A.preferenceOrder());assert(restored.changed);assert.equal(restored.assignments[0].staffId,'bob');
});
test('Fill-only uses the same preferences while manual suitability tiers do not change',()=>{
 const f=setup(),model=A.manualModel(f.state,f.ctx,f.date),manual=A.manualRanks(model,f.demands[0]);
 assert.equal(proposal(f,alternativeFirst,{fillOnly:true}).assignments[0].staffId,'dora');
 assert.deepEqual(A.manualRanks(model,f.demands[0]),manual);
 draft(f);assert.equal(proposal(f,alternativeFirst,{fillOnly:true}).assignments.length,0);assert.equal(f.state.assignments[0].staffId,'bob');
});
test('Weekly headroom and rotation can each precede annual balancing',()=>{
 const f=setup();f.state.entitlements.find(e=>e.staffId==='bob').quota=1;
 assert.equal(proposal(f,['weeklyRemaining','annualUtilisation','alternatives','rotation']).assignments[0].staffId,'dora');
 const g=setup();g.state.entitlements.find(e=>e.staffId==='bob').quota=100;
 g.state.importedRelief.push({id:'bob-turn',staffId:'bob',date:'2026-10-06',period:1,status:'completed',rCost:1});
 g.state.rotationEvents.push({id:'turn',assignmentId:'bob-turn',staffId:'bob',year:'2026',sequence:1});
 assert.equal(proposal(g).assignments[0].staffId,'bob');assert.equal(proposal(g,['rotation','annualUtilisation','alternatives','weeklyRemaining']).assignments[0].staffId,'dora');
});
test('Annual priority accounts for incremental allocation instead of placing every lesson with the initial first teacher',()=>{
 const f=setup();f.state.importedRelief=[];f.teachers.forEach(t=>t.cells=f.blank());f.demands=[1,3,5,7].map(period=>({id:'d'+period,period,staffId:'alice'}));
 const r=proposal(f);assert.equal(r.coverage,4);assert.equal(r.assignments.filter(a=>a.staffId==='bob').length,2);assert.equal(r.assignments.filter(a=>a.staffId==='dora').length,2);
 f.people.reverse();f.teachers.reverse();assert.deepEqual(proposal(f).assignments,r.assignments);
});
test('Every priority order preserves maximum coverage, protected assignments and unavailable teachers',()=>{
 for(const preferences of permutations(defaults)){
  const f=setup();f.state.importedRelief=[];f.state.entitlements.forEach(e=>e.quota=['bob','dora'].includes(e.staffId)?1:0);
  f.teachers.find(t=>t.staffId==='dora').cells[5]=['EL','4A','',''];f.demands=[{id:'lesson',period:3,staffId:'alice'},{id:'second',period:5,staffId:'alice'}];
  let r=proposal(f,preferences);assert(r.coverageProven);assert.equal(r.coverage,2);assert.equal(r.assignments.find(a=>a.period===5).staffId,'bob');
  draft(f,'bob');Object.assign(f.state.assignments[0],{origin:'smc',protected:true});const protectedRow=structuredClone(f.state.assignments[0]);r=proposal(f,preferences);assert.equal(r.assignments.length,0);assert.deepEqual(f.state.assignments[0],protectedRow);
  f.state.assignments=[];f.state.absences.push({id:'away',staffId:'bob',date:f.date,periods:[3,5]});r=proposal(f,preferences);assert(r.assignments.every(a=>a.staffId!=='bob'));assert.equal(r.coverage,1);
 }
});
test('Every order keeps zero-cost matching recess duty ahead of discretionary preferences',()=>{
 for(const preferences of permutations(defaults)){
  const f=setup();f.teachers.find(t=>t.staffId==='dora').cells[3]=['Recess duty P1','','',''];
  f.state.entitlements.find(e=>e.staffId==='dora').quota=0;Object.assign(f.demands[0],{staffId:null,recessActivationId:'recess',level:1});
  const r=proposal(f,preferences);assert.equal(r.assignments[0].staffId,'dora');assert.equal(r.assignments[0].rCost,0);assert(r.assignments[0].repurposedDuty);
 }
});
test('A bounded consecutive-period search never claims coverage or preference proof prematurely',()=>{
 const f=setup();f.state.systemConfig.maxConsecutivePeriods=5;f.state.entitlements.forEach(e=>e.quota=e.staffId==='bob'?2:0);const bob=f.teachers.find(t=>t.staffId==='bob');for(const p of [0,1,3,4])bob.cells[p]=['EL','','',''];
 f.demands=[{id:'a',staffId:'alice',period:2},{id:'b',staffId:'alice',period:5}];
 const bounded=proposal(f,undefined,{maxNodes:1});assert.equal(bounded.coverageProven,false);assert.equal(bounded.solver.preferencesProven,false);
 const complete=proposal(f);assert(complete.coverageProven);assert.equal(complete.coverage,1);
});
test('Stable valid drafts remain unchanged and duplicate teacher-period drafts are repaired',()=>{
 const f=setup();draft(f);assert.equal(proposal(f).changed,false);
 const stale=setup();draft(stale);stale.state.assignments[0].period=4;assert(proposal(stale).changed);assert.equal(proposal(stale).assignments[0].period,3);
 f.demands.push({id:'second',staffId:'charlie',period:3});f.state.assignments.push({...f.state.assignments[0],id:'duplicate',demandId:'second'});
 const repaired=proposal(f);assert(repaired.changed);assert(repaired.coverageProven);assert.equal(new Set(repaired.assignments.map(a=>a.staffId+'|'+a.period)).size,2);
});
test('All 24 orders match an independent exhaustive complete-allocation cost oracle',()=>{
 let seed=710;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32),compare=(a,b)=>{for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1e-8)return a[i]-b[i];return 0;};
 for(let sample=0;sample<8;sample++){
  const f=setup();f.state.importedRelief=[];f.demands=[0,3,6,9].map(period=>({id:'d'+period,staffId:'alice',period}));
  for(const t of f.teachers){if(t.staffId==='alice')continue;const quota=1+Math.floor(random()*4);f.state.entitlements.find(e=>e.staffId===t.staffId).quota=quota;t.R=quota;t.cells=f.blank();if(random()<.5)t.cells[12]=['PD','','',''];
   f.state.importedRelief.push({id:'history-'+t.staffId,staffId:t.staffId,date:'2026-10-06',status:'completed',rCost:Math.floor(random()*4)});
  }
  const tm=A.teacherContext(f.state,f.ctx,f.date),ids=['bob','charlie','dora'],candidates=new Map();for(const d of f.demands)for(const r of A.ranked(f.state,f.ctx,f.date,d.period))candidates.set(r.staffId+'|'+d.period,r);
  for(const order of permutations(defaults)){
   const cost=rows=>{const counts=new Map(),parts={annualUtilisation:[0,0],alternatives:[0],weeklyRemaining:[0],rotation:[0]};let identity=0;
    for(const row of rows){const r=candidates.get(row.staffId+'|'+row.period),n=counts.get(row.staffId)||0;counts.set(row.staffId,n+1);parts.annualUtilisation[1]+=r.fairnessBand+100*n/tm.get(row.staffId).balance.entitlement;parts.alternatives[0]+=r.alternatives;parts.weeklyRemaining[0]+=-r.remaining+n;parts.rotation[0]+=r.rotation;identity+=ids.indexOf(row.staffId);}
    return [0,...order.flatMap(id=>parts[id]),identity];
   };
   let best={coverage:-1,cost:null};const enumerate=(i,rows)=>{if(i===f.demands.length){const value=cost(rows);if(rows.length>best.coverage||rows.length===best.coverage&&compare(value,best.cost)<0)best={coverage:rows.length,cost:value};return;}
    enumerate(i+1,rows);const d=f.demands[i];for(const id of ids){const assigned=rows.filter(a=>a.staffId===id).map(a=>a.period);if(A.eligibility(tm.get(id),d.period,assigned).autoEligible)enumerate(i+1,[...rows,{staffId:id,period:d.period}]);}
   };enumerate(0,[]);
   const result=proposal(f,order);assert.equal(result.coverage,best.coverage);assert.equal(compare(cost(result.assignments),best.cost),0);assert(result.solver.preferencesProven);
  }
 }
});
console.log(checks+' allocation preference checks passed');
