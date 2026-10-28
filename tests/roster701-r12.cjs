const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');const {O,state,ctx,date}=fixture();
assert(state.types.some(t=>t.id==='others'&&t.requiresDetail));assert.throws(()=>O.apply(state,ctx,{operation:'saveAbsence',date,periods:[2],typeId:'others'}),/specify/);
O.apply(state,ctx,{operation:'saveAbsence',date,periods:[2],typeId:'others',reasonDetail:'Appointment'});assert.equal(state.absences[0].reasonDetail,'Appointment');assert.equal(state.absences[0].typeLabel,'Others');
const legacy=O.initial();delete legacy.typeDetailsVersion;legacy.types=legacy.types.filter(t=>t.id!=='others');O.validateState(legacy);O.validateState(legacy);assert.equal(legacy.types.filter(t=>t.id==='others').length,1);
console.log('PASS R12: server enforces Others detail; category stays structured; old stored type list migrates once without duplicates.');
