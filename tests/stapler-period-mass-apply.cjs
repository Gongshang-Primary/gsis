'use strict';
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js'),fixture=require('./helpers/stapler-period-fixture.cjs');
const {plan}=fixture(),before=JSON.stringify(plan),targets=plan.tiles.filter(t=>t.kind==='lesson'&&t.period===2);
assert.equal(targets.length,2);
const apply=patch=>S.apply(plan,{type:'bulkEdit',periods:[2],patch});
const result=apply({venue:'Assembly Hall',group:'Whole school'});
assert.equal(JSON.stringify(plan),before,'the original plan remains available to Undo');
assert.equal(result.tiles.length,plan.tiles.length,'no empty cell gains a tile');
for(const tile of result.tiles){const prior=plan.tiles.find(t=>t.id===tile.id);if(targets.some(t=>t.id===tile.id)){assert.equal(tile.venue,'Assembly Hall');assert.equal(tile.group,'Whole school');assert.deepEqual({...tile,venue:prior.venue,group:prior.group},prior);}else assert.deepEqual(tile,prior,'other periods and recess remain unchanged');}
for(const key of ['teachers','classes','periods','recessDefaults','baseline','mats'])assert.deepEqual(result[key],plan[key]);
const blank=apply({venue:'Hall',group:'   ',classIds:[]});for(const tile of blank.tiles.filter(t=>targets.some(x=>x.id===t.id))){const original=targets.find(t=>t.id===tile.id);assert.equal(tile.group,original.group);assert.deepEqual(tile.classIds,original.classIds);}
assert.deepEqual(apply({venue:' ',group:'',classIds:[]}),plan,'all blank is a no-op');
const same=S.apply(result,{type:'bulkEdit',periods:[2],patch:{venue:'Assembly Hall',group:'Whole school'}});assert.deepEqual(same,result,'already matching values change nothing');
const classes=apply({classIds:['a']});assert(classes.tiles.filter(t=>targets.some(x=>x.id===t.id)).every(t=>JSON.stringify(t.classIds)==='["a"]'),'latest class selection is canonical across the period, including duplicate coverage');
const custom=S.apply(plan,{type:'bulkEdit',periods:[2],patch:{classIds:[]},customClasses:['Assembly']});const added=custom.classes.find(c=>c.name==='Assembly');assert(added?.adhoc);assert(custom.tiles.filter(t=>targets.some(x=>x.id===t.id)).every(t=>t.classIds.includes(added.id)));
assert.throws(()=>apply({classIds:null}),/valid classes/);
assert.throws(()=>apply({classIds:['missing']}),/Invalid lesson card|valid class/);assert.equal(JSON.stringify(plan),before,'invalid class is atomic');
assert.throws(()=>S.apply(plan,{type:'bulkEdit',patch:{venue:'Hall'}}),/period/);
assert.throws(()=>S.apply(plan,{type:'bulkEdit',periods:[999],patch:{venue:'Hall'}}),/period/);
assert.throws(()=>apply({subject:'Assembly'}),/Venue|field/,'period overlay has no Subject operation');
const row=S.apply(plan,{type:'bulkEdit',classId:'a',patch:{subject:'Updated row'}});assert(row.tiles.filter(t=>t.kind==='lesson'&&t.classIds.includes('a')).every(t=>t.subject==='Updated row'),'existing row Subject mass-write is unchanged');
console.log('PASS period bulk apply: venue/group, blank no-op, recess/empty-cell isolation, canonical classes, custom/invalid classes, unchanged values and row compatibility');
