'use strict';
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js'),fixture=require('./helpers/stapler-period-fixture.cjs');
const {plan}=fixture(),original=JSON.stringify(plan),apply=patch=>S.apply(plan,{type:'bulkEdit',periods:[2],patch});
const changed=apply({subject:'Celebrate Learning',venue:'',group:''});
for(const tile of changed.tiles){const before=plan.tiles.find(t=>t.id===tile.id);if(tile.kind==='lesson'&&tile.period===2){assert.equal(tile.subject,'Celebrate Learning');assert.deepEqual({...tile,subject:before.subject},before,'Subject-only changes preserve every other tile field');}else assert.deepEqual(tile,before,'other periods and recess are unchanged');}
assert.equal(JSON.stringify(plan),original,'previous plan remains intact for Undo');
assert.deepEqual(apply({subject:'   '}),plan,'blank Subject does not clear existing values');
assert.deepEqual(S.apply(changed,{type:'bulkEdit',periods:[2],patch:{subject:'Celebrate Learning'}}),changed,'matching Subject is a complete no-op including revision');
assert.throws(()=>apply({subject:'x'.repeat(501)}),/Invalid Stapler text/);
for(const subject of ['Assembly','']){
 const filled=S.apply(plan,{type:'bulkEdit',periods:[2],view:'teacher',createTiles:true,patch:{subject,venue:'Hall'}}),added=filled.tiles.filter(t=>!plan.tiles.some(p=>p.id===t.id));assert.equal(added.length,1);assert.equal(added[0].subject,subject);assert.equal(added[0].source.subject,subject);assert.equal(added[0].venue,'Hall');assert.equal(added[0].teacherId,'teacher-empty');
}
const {day}=fixture();day.teachers[1].cells=[];const gaps=S.create(day),filled=S.apply(gaps,{type:'bulkEdit',periods:[2],view:'class',teacherId:'teacher-empty',createTiles:true,patch:{subject:'Class assembly'}}),newClass=filled.tiles.find(t=>!gaps.tiles.some(p=>p.id===t.id));assert(newClass);assert.equal(newClass.subject,'Class assembly');assert.deepEqual(newClass.classIds,['b']);
assert.throws(()=>S.apply(gaps,{type:'bulkEdit',periods:[2],view:'class',teacherId:'teacher-a',createTiles:true,patch:{subject:'Must roll back'}}),/already has a lesson/);assert.equal(gaps.tiles.find(t=>t.kind==='lesson'&&t.period===2).subject,'MA','conflicting creation does not retain a Subject edit');
console.log('PASS optional period Subject: existing-only isolation, blank/matching values, length validation, both creation views and atomic conflicts');
