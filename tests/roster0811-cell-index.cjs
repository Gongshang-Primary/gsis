'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),A=require('../shared/roster-allocation.js');
let scans=0;
const scope=vm.createContext({module:{exports:{}},GSISRosterAllocation:{...A,effectiveAssignments(...args){scans++;return A.effectiveAssignments(...args);}}});
vm.runInContext(fs.readFileSync('shared/roster-operations.js','utf8'),scope);
const O=scope.module.exports,date='2026-10-14',state=O.initial(),ids=Array.from({length:120},(_,i)=>'lesson'+i),plain=x=>JSON.parse(JSON.stringify(x));
state.assignments=Array.from({length:1800},(_,i)=>({id:'history'+i,date:'2026-10-13',demandId:'lesson'+i%120,staffId:'teacher'+i%180,status:'completed'}));
state.assignments.push(...ids.map((id,i)=>({id:'current'+i,date,demandId:id,staffId:'teacher'+i,status:'draft',noRelief:i%5===0,combination:i%7===0,invalidCover:i%11===0})));
state.assignments.push({id:'replacement',date,demandId:'lesson1',staffId:'changed-teacher',status:'draft',replaces:'current1'});
state.assignments.push({id:'cancelled',date,demandId:'lesson2',staffId:'cancelled-teacher',status:'cancelled'});
state.assignments.push({id:'removed',date,demandId:'lesson3',staffId:'removed-teacher',status:'draft',replaces:'current3',remove:true});
state.manualDecisions[date+'|lesson2']={date,demandId:'lesson2',kind:'assignment'};
state.manualDecisions[date+'|lesson3']={date,demandId:'lesson3',kind:'empty'};
state.manualDecisions[date+'|empty']={date,demandId:'empty',kind:'empty'};
ids.push('empty','unassigned');
const expected=Object.fromEntries(ids.map(id=>[id,plain(O.cellDecision(state,date,id))])),beforeScans=scans;
assert.equal(expected.lesson1.staffId,'changed-teacher');assert.equal(expected.lesson2.manual,true);assert.equal(expected.lesson3.staffId,null);assert.equal(expected.lesson3.cleared,true);assert.equal(expected.lesson0.noRelief,true);assert.equal(expected.lesson7.combination,true);assert.equal(expected.lesson11.staffId,'teacher11');assert.equal(expected.empty.cleared,true);assert.equal(expected.unassigned.manual,false);
scans=0;
assert.equal(typeof O.cellDecisions,'function','bulk cell comparison must avoid one full-history scan per lesson');
const actual=plain(O.cellDecisions(state,date,ids));
assert.deepEqual(actual,expected,'replacement, invalid cover, ownership, removal and empty decisions must retain their values');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(actual)).digest('hex'),'66af4c62a193fe14af4c5b948409b724e9b1deba00f2c9e6d5f86072db208b3b','all values match the pre-refactor source fixture');
assert.equal(scans,1,'all requested cell values use one effective-assignment pass');
state.assignments.find(row=>row.id==='replacement').staffId='newer-teacher';
assert.equal(O.cellDecisions(state,date,['lesson1']).lesson1.staffId,'newer-teacher','fresh state must never reuse an index from a previous save');
assert.deepEqual(Object.keys(O.cellDecisions(state,date,['lesson1'])),['lesson1'],'a surgical request returns only selected cells');
console.log('MEASURED '+JSON.stringify({cells:ids.length,assignments:state.assignments.length,beforeScans,afterScans:1}));
console.log('PASS indexed cell comparison preserves every value and observes subsequent changes');

const h=require('./roster701-adapter.cjs')(),saved=h.state();
saved.absences.push({id:'absence',date:h.date,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});h.setState(saved);
// The actual domain view supplies this projection. Repeating its complete
// assignment-history read in the backend adapter only adds user latency.
h.scope.GSISRosterOperations={...h.O,cellDecision(){throw Error('Repeated scalar cell projection');},cellDecisions(){throw Error('Repeated bulk cell projection');}};
const response=h.call({operation:'read',date:h.date,view:'allocation'});
assert.equal(response.cellStates['absence:2'].staffId,null);assert.equal(response.cellStates['absence:3'].staffId,null);assert.match(response.dayToken,/^[a-f0-9]{64}$/);
console.log('PASS backend reuses authoritative domain cell projection without another history scan');
