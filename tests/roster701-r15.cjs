const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const {O,state,ctx,date}=fixture();
const none=O.read(state,ctx,{operation:'availability',date});
assert.equal(none.people.length,4);assert(none.periods.every(p=>p.available.length===0));
const bob=O.read(state,ctx,{operation:'availability',date,staffIds:['bob','unknown']});
assert(bob.periods.every(p=>p.available.every(t=>t.id==='bob')));assert.equal(bob.periods[2].available.length,1);
const both=O.read(state,ctx,{operation:'availability',date,staffIds:['alice','bob']});
assert.deepEqual(both.periods[2].available.map(x=>x.id),['bob']);assert.equal(both.periods[1].available.length,2);
console.log('R15: no school-wide availability enumeration without selection; response scoped to selected IDs; occupied teacher excluded.');
