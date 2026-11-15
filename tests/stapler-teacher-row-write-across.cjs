'use strict';
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js'),fixture=require('./helpers/stapler-period-fixture.cjs');
const {plan}=fixture(),before=JSON.stringify(plan),cmd={type:'bulkEdit',teacherId:'teacher-a',view:'teacher',patch:{venue:'Hall'}};
const next=S.apply(plan,cmd);for(const t of plan.tiles){const after=next.tiles.find(x=>x.id===t.id);assert.deepEqual(after,t.kind==='lesson'&&t.teacherId==='teacher-a'?{...t,venue:'Hall'}:t);}assert.equal(JSON.stringify(plan),before);
for(const field of ['subject','venue','group']){const empty=S.apply(plan,{...cmd,teacherId:'teacher-empty',patch:{[field]:'Value'}});assert.deepEqual(empty.tiles,plan.tiles);}
assert.deepEqual(S.apply(next,cmd).tiles,next.tiles);
for(const command of [{...cmd,teacherId:'unknown'},{...cmd,patch:{teacherId:'teacher-b'}},{...cmd,patch:{classIds:['b']}}]){assert.throws(()=>S.apply(plan,command),/Choose a teacher|Only Subject/);assert.equal(JSON.stringify(plan),before);}
const filled=S.apply(plan,{...cmd,teacherId:'teacher-b',createTiles:true,classIds:[],customClasses:['Custom cohort']});const added=filled.tiles.filter(t=>!plan.tiles.some(o=>o.id===t.id));assert.deepEqual(added.map(t=>t.period),[1,3]);for(const t of added){assert.equal(t.teacherId,'teacher-b');assert.equal(t.venue,'Hall');assert.equal(filled.classes.find(c=>c.id===t.classIds[0]).name,'Custom cohort');}assert.deepEqual(filled.tiles.find(t=>t.kind==='recess'),plan.tiles.find(t=>t.kind==='recess'));assert.equal(JSON.stringify(plan),before);
assert.throws(()=>S.apply(plan,{...cmd,teacherId:'teacher-b',createTiles:true,classIds:['a']}),/No changes were applied/);assert.equal(JSON.stringify(plan),before);
const filtered=S.apply(plan,{...cmd,periods:[2]});assert.equal(filtered.tiles.filter(t=>t.venue==='Hall').length,1);
console.log('PASS teacher-row isolation, empty rows, matching values, validation, creation, custom classes, period filter and atomic conflict');

const recessFill=S.apply(plan,{...cmd,teacherId:'teacher-empty',createTiles:true,classIds:['c']});assert.deepEqual(recessFill.tiles.filter(t=>t.teacherId==='teacher-empty').map(t=>t.period),[1,3]);assert.deepEqual(recessFill.tiles.find(t=>t.kind==='recess'),plan.tiles.find(t=>t.kind==='recess'));
