'use strict';
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
const f=fixture();f.ctx.minute=360;for(const t of f.teachers){t.cells=f.blank();t.R=t.staffId==='alice'?0:8;}
for(let i=0;i<76;i++){const id='staff-'+String(i).padStart(3,'0');f.people.push({id,name:id,active:true,mobile:'9800'+String(i).padStart(4,'0')});f.teachers.push({staffId:id,name:id,cells:f.blank(),R:8});}
A.captureWeek(f.state,f.ctx,f.date);const demands=[];
for(let group=0;group<6;group++)for(const period of [2,3,4])demands.push({id:'pal-'+group+'-'+period,date:f.date,staffId:'alice',period,subject:'PAL',className:'1'+group,groupName:'PAL '+group});
for(let i=0;i<12;i++)demands.push({id:'el-'+i,date:f.date,staffId:'alice',period:5+i,subject:'EL',className:'3A'});
const start=performance.now(),result=A.optimise(f.state,f.ctx,f.date,demands,{maxNodes:128}),elapsedMs=performance.now()-start;
assert(result.solver.nodes<=128);assert.equal(result.coverage,30);assert(result.coverageProven);
for(let group=0;group<6;group++){const block=result.assignments.filter(a=>a.demandId.startsWith('pal-'+group+'-'));assert.equal(block.length,3);assert.equal(new Set(block.map(a=>a.staffId)).size,1);}
console.log(JSON.stringify({scenario:'80 teachers, six PAL blocks plus12 ordinary lessons',elapsedMs:Math.round(elapsedMs),coverage:result.coverage,coverageProven:result.coverageProven,preferencesProven:result.solver.preferencesProven,nodes:result.solver.nodes,budget:128}));
