'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),A=require('../shared/roster-allocation.js'),fixture=require('./roster701-fixture.cjs');
const f=fixture(),template=A.manualModel(f.state,f.ctx,f.date),raw=template.teachers.find(t=>t.id==='bob'),teachers=Array.from({length:180},(_,i)=>({...structuredClone(raw),id:'teacher'+i,name:'Teacher '+i,aliasIds:i===0?['teacher0','alias0']:['teacher'+i],person:{...raw.person,id:'teacher'+i,name:'Teacher '+i}}));
let reads=0;const assignments=Array.from({length:1800},(_,i)=>{const staffId=i%25===0?'alias0':'teacher'+i%180;return {id:'a'+i,demandId:'d'+i,period:i%17,date:f.date,status:'draft',rCost:i%4===0?0:1,combination:i%4===0,noRelief:i%21===0,remove:i%29===0,invalidCover:i%31===0,get staffId(){reads++;return staffId;}};});
const model={...template,teachers,assignments},dem={id:'d1',staffId:'alice',period:2,date:f.date,subject:'EL',className:'3A',venue:'Room',groupName:''};
const rows=A.manualRanks(model,dem),digest=crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
console.log(JSON.stringify({assignmentStaffIdReads:reads,teachers:teachers.length,assignments:assignments.length,resultDigest:digest}));
// Revision F adds explicit workload policy metadata. Ordinary-day ranking and
// balances still match the original pre-index fixture byte for byte.
assert(rows.every(row=>row.workloadIgnored===false),'ordinary days retain workload policy');
const legacyDigest=crypto.createHash('sha256').update(JSON.stringify(rows.map(({workloadIgnored,...row})=>row))).digest('hex');
assert.equal(legacyDigest,'f30ab7e077567cb1515045f95c7c69e3cf06bbe84d4ff373549cd374b69e2edb','ranking fields other than the declared workload policy metadata match the pre-index fixture byte for byte');
assert(reads<assignments.length*10,'candidate ranking must index assignments once instead of rescanning every teacher');
assert.equal(rows.length,teachers.length);assert.deepEqual(rows.map(r=>r.rank),Array.from({length:180},(_,i)=>i+1));
// Aggregate costs must keep alias identities and exclude invalid cover exactly.
const next=assignments.filter((_,i)=>i%2===0),before=structuredClone(model),projected=A.withManualAssignments(model,next);
for(const t of projected.teachers){const old=before.teachers.find(row=>row.id===t.id),ids=new Set(old.aliasIds),cost=rows=>rows.filter(a=>ids.has(a.staffId)&&!a.invalidCover).reduce((n,a)=>n+A.cost(a),0),delta=cost(next)-cost(before.assignments);assert.equal(t.balance.weeklyUsed,old.balance.weeklyUsed+delta);}
console.log('PASS indexed candidate ranking and alias cost aggregation preserve ranking shape and balances.');
