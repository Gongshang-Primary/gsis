const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const {O,state,ctx,date}=fixture();const preview=O.previewAbsence(ctx,{id:'preview',staffId:'alice',name:'Alice',date,periods:[2,3]});
assert.equal(preview.length,2);assert.equal(preview[0].lessonKey,preview[1].lessonKey);
O.apply(state,ctx,{operation:'saveAbsence',staffId:'alice',date,periods:[2,3],typeId:'mc',instructionsByDate:{[date]:{[preview[0].lessonKey]:'  Keep exact instructions.\n'}},instructionsNA:false});
assert.equal(state.absences.length,1);assert.equal(state.absences[0].instructions[preview[0].lessonKey],'  Keep exact instructions.\n');
const bad=fixture();assert.throws(()=>bad.O.apply(bad.state,bad.ctx,{operation:'saveAbsence',staffId:'alice',date,periods:[2],typeId:'mc',instructionsByDate:{[date]:{'stale':'No'}}}),/Lessons changed/);
console.log('PASS R05: shared preview lesson keys, final absence and instructions in one command, stale instruction keys rejected.');
