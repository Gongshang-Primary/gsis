'use strict';
const assert=require('node:assert/strict');
const {projection}=require('../scripts/measure-roster-preparation.cjs');
// A 2,500 ms observed step less 500 ms CPU/transfer leaves a 2,000 ms IO call.
// Two old steps total 6,700 ms active work inside the observed 10,000 ms window.
const runs=[{ref:'old',steps:2,calls:[{ordinal:0,ioCalls:2,transferMs:100,cpuMs:100},{ordinal:1,ioCalls:1,transferMs:300,cpuMs:200,beforeCheckpoint:{ioCalls:1,transferMs:300,cpuMs:200}}]},
 {ref:'new',steps:3,calls:Array.from({length:3},()=>({ioCalls:1,transferMs:100,cpuMs:100}))}];
const value=projection(runs,{ordinal:1,timing:{elapsedMs:2500,finishedAt:10000}},'1970-01-01T00:00:00Z');
assert.equal(value.fittedIoCallMs,2000);assert.equal(value.fittedPacingPerStepMs,1650);
assert.deepEqual(value.runs.map(x=>[x.backendMs,x.wallMs]),[[6700,10000],[6600,11550]]);
assert.throws(()=>projection(runs,{ordinal:4,timing:{}},'1970-01-01'),/observed checkpoint/);
console.log('PASS time projection: observed IO anchor, explicit pacing and separate active versus wall time');
