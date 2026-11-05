'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
let count=0;const test=(name,run)=>{run();count++;console.log('PASS',name);};
const legacy=['annualUtilisation','alternatives','weeklyRemaining','rotation'],matching=['subjectMatch','levelMatch',...legacy];
function setup(){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 for(const t of f.teachers){t.cells=f.blank();t.R=t.staffId==='alice'?0:2;t.teachingProfile={subjects:[],levels:[]};}
 A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};return f;
}
const teacher=(f,id)=>f.teachers.find(t=>t.staffId===id);
const quota=(f,id,n)=>{f.state.entitlements.find(r=>r.staffId===id).quota=n;teacher(f,id).R=n;};
const solve=(f,ds,options={})=>A.optimise(f.state,f.ctx,f.date,ds,{preferences:matching,...options});
test('Legacy saved orders retain their priorities and gain level then lowest-priority subject matching',()=>{
 const saved=['rotation','weeklyRemaining','alternatives','annualUtilisation'];assert.deepEqual(A.preferenceOrder(saved),[...saved,'levelMatch','subjectMatch']);assert.deepEqual(saved,['rotation','weeklyRemaining','alternatives','annualUtilisation']);
 assert.deepEqual(A.preferenceOrder(matching),matching);assert.throws(()=>A.preferenceOrder([...legacy,'subjectMatch']),/each rule/);assert.throws(()=>A.preferenceOrder([...legacy,'subjectMatch','subjectMatch']),/each rule/);
});
test('Teaching profiles use verified teaching classifications and class or teaching-group levels',()=>{
 const profile=A.teachingProfile([['ＥＬ','4A','',''],['MA (P3)','Kindness','',''],['SCI','','','Science extension'],['PD','6A','',''],['Form','1A','',''],['Unknown','6A','','']], [{name:'Kindness',level:3}], [{id:'tg',name:'Science extension',levels:[4,5]}], {Unknown:'Unclassified'});
 assert.deepEqual(profile,{subjects:['el','ma','sci'],levels:[3,4,5]});
 assert.deepEqual(A.teachingProfile([['PAL','P1','',''],['EL','P2','','']],[],[],{PAL:'Teaching',EL:'Non-teaching'}),{subjects:['pal'],levels:[1]});
});
test('The real backend includes both baseline weeks, not only the selected day',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),Roster=require('../shared/roster.js'),S=require('../shared/roster-stapler.js'),f=setup();
 const week=()=>({days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:85},()=>['','','',''])}))}),raw={layoutMode:'odd-even',odd:week(),even:week(),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]};
 raw.odd.blocks[3].cells[70]=['EL','4A','',''];raw.even.blocks[3].cells[0]=['SCI','P5','',''];const model=Roster.validate(raw),entry={id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1};
 const scope=vm.createContext({GSISRosterOperations:f.O,GSISRosterAllocation:A,GSISRoster:Roster,GSISRosterStapler:S,props_:()=>({getProperty:()=>null}),Utilities:{getUuid:f.ctx.uuid,formatDate:(_d,_tz,fmt)=>fmt==='yyyy-MM-dd'?f.date:fmt==='HH'?'06':'00'}});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);scope.rosterIndex_=()=>({entries:[entry]});scope.rosterModel_=()=>model;scope.rosterOperationsQuota_=()=>({from:entry.from,to:entry.to,rows:f.people.map(p=>({id:p.id,R:4})),subjectCategories:{EL:'Teaching',SCI:'Teaching'},formClasses:[{id:'4a',name:'4A',level:4}],teachingGroups:[]});
 const ctx=scope.rosterOperationsContext_({identity:{email:'alice@gsps.edu.sg'},input:{operation:'read',view:'allocation',date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'even'}}}},{user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people},f.state),dora=ctx.days[f.date].teachers.find(t=>t.staffId==='dora');
 assert(dora.cells.every(c=>c.every(v=>!v)));assert.deepEqual(dora.teachingProfile,{subjects:['el','sci'],levels:[4,5]});
});
test('Subject matching precedes level matching; level breaks equal subject matches',()=>{
 const f=setup();quota(f,'charlie',0);teacher(f,'bob').teachingProfile={subjects:['el'],levels:[2]};teacher(f,'dora').teachingProfile={subjects:['sci'],levels:[4]};const ds=[{id:'el',staffId:'alice',period:3,subject:'EL',className:'4A'}];
 assert.equal(solve(f,ds).assignments[0].staffId,'bob');teacher(f,'dora').teachingProfile.subjects=['el'];assert.equal(solve(f,ds).assignments[0].staffId,'dora');
});
test('Maximum coverage outranks subject matches and can revise the first lesson choice',()=>{
 const f=setup();quota(f,'charlie',0);quota(f,'bob',1);quota(f,'dora',1);teacher(f,'bob').teachingProfile={subjects:['el'],levels:[4]};teacher(f,'dora').teachingProfile={subjects:['sci'],levels:[4]};teacher(f,'dora').cells[5]=['PD','','',''];
 const ds=[3,5].map(period=>({id:'d'+period,staffId:'alice',period,subject:'EL',className:'4A'})),result=solve(f,ds);
 assert.equal(result.coverage,2);assert(result.coverageProven);assert(result.solver.preferencesProven);assert.equal(result.assignments.find(a=>a.period===3).staffId,'dora');assert.equal(result.assignments.find(a=>a.period===5).staffId,'bob');
});
test('Whole-plan matching avoids consuming the sole specialist for another lesson',()=>{
 const f=setup();quota(f,'charlie',0);teacher(f,'bob').teachingProfile={subjects:['el','ma'],levels:[4]};teacher(f,'dora').teachingProfile={subjects:['el'],levels:[4]};
 const ds=[{id:'a',staffId:'alice',period:3,subject:'EL',className:'4A'},{id:'b',staffId:'alice',period:3,subject:'MA',className:'4B'}],result=solve(f,ds);
 assert.equal(result.coverage,2);assert.equal(result.assignments.find(a=>a.demandId==='a').staffId,'dora');assert.equal(result.assignments.find(a=>a.demandId==='b').staffId,'bob');
 f.people.reverse();f.teachers.reverse();assert.deepEqual(solve(f,ds).assignments,result.assignments);
});
test('Saved rule priority outranks matching when coverage is equal',()=>{
 const f=setup();quota(f,'charlie',0);teacher(f,'dora').teachingProfile={subjects:['el'],levels:[4]};f.state.importedRelief.push({id:'past',staffId:'dora',date:'2026-10-06',status:'completed',rCost:1});
 const ds=[{id:'el',staffId:'alice',period:3,subject:'EL',className:'4A'}];assert.equal(solve(f,ds,{preferences:legacy}).assignments[0].staffId,'bob');assert.equal(solve(f,ds).assignments[0].staffId,'dora');
});
test('Confirmed baseline profiles remain authoritative after a Stapler day edit',()=>{
 const f=setup();quota(f,'charlie',0);teacher(f,'dora').teachingProfile={subjects:['el'],levels:[4]};f.ctx.baselineDays=structuredClone(f.ctx.days);teacher(f,'bob').teachingProfile={subjects:['el'],levels:[4]};teacher(f,'dora').teachingProfile={subjects:[],levels:[]};
 const result=solve(f,[{id:'el',staffId:'alice',period:3,subject:'EL',className:'4A'}]);assert.equal(result.assignments[0].staffId,'dora');
});
test('Independent employment headroom caps the complete allocation, including historical R overrides',()=>{
 const f=setup();quota(f,'charlie',0);quota(f,'dora',0);quota(f,'bob',10);Object.assign(teacher(f,'bob'),{periodCap:26,capConfigured:true,capVerified:true,capHeadroom:1,capWorkload:25});
 const ds=[1,3,5].map(period=>({id:'d'+period,staffId:'alice',period,subject:'EL',className:'4A'})),result=solve(f,ds);assert.equal(result.coverage,1);assert(result.coverageProven);assert.equal(result.uncovered,2);
 teacher(f,'bob').capVerified=false;assert.equal(solve(f,ds).coverage,0);
});
test('Protected assignments remain fixed even if matching would improve',()=>{
 const f=setup();teacher(f,'dora').teachingProfile={subjects:['el'],levels:[4]};const row={id:'manual',date:f.date,period:3,demandId:'el',staffId:'bob',status:'draft',origin:'smc',protected:true,rCost:1,version:1};f.state.assignments.push(row);const before=structuredClone(row);
 const result=solve(f,[{id:'el',staffId:'alice',period:3,subject:'EL',className:'4A'}]);assert.equal(result.assignments.length,0);assert.equal(result.fixedCoverage,1);assert.deepEqual(row,before);
});
test('Branch-and-bound searches equal-coverage alternatives for the global minimum policy cost',()=>{
 const teachers=[{id:'a',balance:{remaining:2},eligible:new Set([2,5]),base:new Set([0,1,3,4]),assigned:new Set(),periodCount:6,allocationLimits:{dailyTotal:9,consecutive:5}},{id:'b',balance:{remaining:2},eligible:new Set([2,5]),base:new Set(),assigned:new Set(),periodCount:6,allocationLimits:{dailyTotal:9,consecutive:5}}],ds=[{id:'x',period:2},{id:'y',period:5}],weights={teacherCost:()=>0,edgeCost:(t,d)=>t.id==='a'?0:d.id==='x'?1:10};
 // The relaxed flow puts both on a. The first feasible branch costs 1, the
 // other costs 10, so also reverse costs to exercise the non-first optimum.
 for(const reverse of [false,true]){const w={...weights,edgeCost:(t,d)=>t.id==='a'?0:(d.id==='x')!==reverse?10:1},result=A.solveCoverage(teachers,ds,w);assert.equal(result.coverage,2);assert.equal(result.cost,1);assert(result.preferencesProven);assert(result.searchComplete);assert(result.nodes>=3);}
 const bounded=A.solveCoverage(teachers,ds,weights,{maxNodes:2});assert.equal(bounded.coverage,2);assert.equal(bounded.proven,true);assert.equal(bounded.preferencesProven,false);assert.equal(bounded.searchComplete,false);
 const unproven=A.solveCoverage(teachers,ds,weights,{maxNodes:1});assert.equal(unproven.proven,false);assert.equal(unproven.preferencesProven,false);
});
test('Independent exhaustive oracle agrees on coverage and lexicographic matching across constrained plans',()=>{
 let seed=714;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32),compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const difference=(a[i]||0)-(b[i]||0);if(Math.abs(difference)>1e-8)return difference;}return 0;};
 for(let sample=0;sample<25;sample++){
  const f=setup(),ids=['bob','charlie','dora'];for(const id of ids){const t=teacher(f,id);quota(f,id,1+Math.floor(random()*3));t.teachingProfile={subjects:random()<.5?['el']:['ma'],levels:[random()<.5?3:4]};for(let p=0;p<7;p++)if(random()<.35)t.cells[p]=['PD','','',''];}
  const ds=Array.from({length:4},(_,i)=>({id:'d'+i,period:i+2,staffId:'alice',subject:i%2?'MA':'EL',className:i%3?'4A':'3A'})),tm=A.teacherContext(f.state,f.ctx,f.date),candidates=new Map();for(const d of ds)for(const r of A.ranked(f.state,f.ctx,f.date,d.period))candidates.set(r.staffId+'|'+d.period,r);
  const eligibleIds=ids.filter(id=>ds.some(d=>A.eligibility(tm.get(id),d.period).autoEligible));
  const value=rows=>{const counts=new Map(),out=Array(9).fill(0);for(const a of rows){const d=ds.find(d=>d.id===a.demandId),t=teacher(f,a.staffId),r=candidates.get(a.staffId+'|'+a.period),n=counts.get(a.staffId)||0;counts.set(a.staffId,n+1);out[1]+=!t.teachingProfile.subjects.includes(d.subject.toLowerCase());out[2]+=!t.teachingProfile.levels.includes(Number(d.className[0]));out[4]+=r.fairnessBand+100*n/tm.get(a.staffId).balance.entitlement;out[5]+=r.alternatives;out[6]+=-r.remaining+n;out[7]+=r.rotation;out[8]+=eligibleIds.indexOf(a.staffId);}return out;};
  let best={coverage:-1,value:null};const walk=(i,rows)=>{if(i===ds.length){const v=value(rows);if(rows.length>best.coverage||rows.length===best.coverage&&compare(v,best.value)<0)best={coverage:rows.length,value:v};return;}walk(i+1,rows);const d=ds[i];for(const id of ids)if(A.eligibility(tm.get(id),d.period,rows.filter(a=>a.staffId===id).map(a=>a.period)).autoEligible)walk(i+1,[...rows,{staffId:id,demandId:d.id,period:d.period}]);};walk(0,[]);
  const result=solve(f,ds);assert.equal(result.coverage,best.coverage,'coverage sample '+sample);assert.equal(compare(value(result.assignments),best.value),0,'score sample '+sample);assert(result.coverageProven);assert(result.solver.preferencesProven);assert.equal(compare(result.policyScore.after||[],[0,...best.value.slice(0,-1),0,best.value.at(-1)]),0,'policy score adds priority-use and stability slots; this fixture has neither SREs nor a previous draft');
 }
});
console.log(count+' v0.7.14 allocation policy checks passed');
