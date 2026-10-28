'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),S=require('../shared/roster-stapler.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function day(slot=30){
 const periods=Array.from({length:8},(_,period)=>({period,startMinutes:450+period*slot,endMinutes:450+(period+1)*slot})),recessSlots=30/slot;
 return {date:'2026-10-19',id:'level-recess',verified:true,schoolDay:true,periods,recesses:[{level:1,startMinutes:450+2*slot,endMinutes:480+2*slot}],formClasses:[{id:'a',name:'1A',level:1,venue:'Room A'},{id:'b',name:'1B',level:1,venue:'Room B'},{id:'c',name:'2A',level:2,venue:'Room C'}],teachers:['a','b'].map(id=>({staffId:id,name:'Teacher '+id.toUpperCase(),cells:periods.map(p=>p.period>=2&&p.period<2+recessSlots?['','','','']:['Subject '+p.period,'1'+id.toUpperCase(),'Room '+id.toUpperCase(),''])}))};
}
const lesson=(plan,teacher,sourcePeriod)=>plan.tiles.find(t=>t.kind==='lesson'&&t.source.teacherId===teacher&&t.source.period===sourcePeriod);
const recess=(plan,id)=>plan.tiles.find(t=>t.kind==='recess'&&t.classIds[0]===id);
const move=(plan,period,id='a')=>S.apply(plan,{type:'recessLevelMove',tileId:recess(plan,id).id,period});
const base=S.create(day()),snapshot=JSON.stringify(base),sources=base.tiles.map(t=>[t.id,clone(t.source)]);
assert.deepEqual(S.recessGroups(base),[{tileId:'recess:a',level:1,period:2,durationMinutes:30,classIds:['a','b'],tileIds:['recess:a','recess:b']}]);

// Every adjacent lesson column rotates once, for both directions and all cohort classes.
const right=move(base,4),left=move(base,0);
for(const id of ['a','b']){
 assert.equal(recess(right,id).period,4);assert.equal(lesson(right,id,3).period,2);assert.equal(lesson(right,id,4).period,3);
 assert.equal(recess(left,id).period,0);assert.equal(lesson(left,id,1).period,2);assert.equal(lesson(left,id,0).period,1);
}
assert.equal(right.revision,base.revision+1);assert.equal(JSON.stringify(base),snapshot);
assert.deepEqual(right.tiles.map(t=>[t.id,t.source]),sources);assert.deepEqual(right.baseline,base.baseline);
assert.equal(recess(right,'a').venue,'Room A');assert.equal(recess(right,'b').venue,'Room B');
assert.equal(move({...base,status:'confirmed'},3).status,'confirmed');

// Shared lessons within the cohort move once; both per-class recess identities survive.
const sharedDay=day();sharedDay.teachers[0].cells[3][1]='1A, 1B';sharedDay.teachers[1].cells[3]=['','','',''];
const sharedBase=S.create(sharedDay),shared=move(sharedBase,3);
assert.equal(lesson(shared,'a',3).period,2);assert.deepEqual(lesson(shared,'a',3).classIds,['a','b']);
assert.equal(shared.tiles.length,sharedBase.tiles.length);assert.equal(shared.tiles.filter(t=>t.location==='pit').length,0);

// Only displaced conflicting tiles go to Pit. The existing teacher booking stays intact.
const busyDay=day();busyDay.teachers[0].cells[2]=['Other lesson','2A','Room C',''];
const busyBase=S.create(busyDay),busy=move(busyBase,3),held=lesson(busyBase,'a',2);
assert.equal(lesson(busy,'a',3).location,'pit');assert.equal(lesson(busy,'a',3).period,null);
assert.deepEqual(lesson(busy,'a',2),held);assert.equal(lesson(busy,'b',3).period,2);
assert.equal(busy.tiles.filter(t=>t.location==='pit').length,1);assert.match(busy.warnings.at(-1),/1A Subject 3 \(Teacher A\).*teacher already has another lesson at 08:30/);
assert.deepEqual(lesson(busy,'a',3).source,lesson(busyBase,'a',3).source);
// Legacy single-class moves retain their reject-on-clash behavior.
assert.throws(()=>S.apply(busyBase,{type:'recessMove',tileId:'recess:a',period:3}),/already has a lesson/);

// A shared card involving another level goes to Pit intact rather than moving that class.
const outsideDay=day();outsideDay.teachers[0].cells[3][1]='1A, 2A';
const outsideBase=S.create(outsideDay),outside=move(outsideBase,3);
assert.equal(lesson(outside,'a',3).location,'pit');assert.deepEqual(lesson(outside,'a',3).classIds,['a','c']);
assert.equal(outside.tiles.length,outsideBase.tiles.length);assert.match(outside.warnings.at(-1),/shared with classes outside this recess block/);

// Two-slot recesses retain duration and shift one adjacent slot at each step.
const shortBase=S.create(day(15)),shortRight=move(shortBase,4),shortLeft=move(shortBase,0);
for(const id of ['a','b']){
 assert.deepEqual(S.tilePeriods(shortRight,recess(shortRight,id)),[4,5]);assert.equal(lesson(shortRight,id,4).period,2);assert.equal(lesson(shortRight,id,5).period,3);
 assert.deepEqual(S.tilePeriods(shortLeft,recess(shortLeft,id)),[0,1]);assert.equal(lesson(shortLeft,id,1).period,3);assert.equal(lesson(shortLeft,id,0).period,2);
}

// Incompatible timings reject the complete drag, including an earlier valid step.
const unevenDay=day();unevenDay.periods[4].endMinutes-=15;unevenDay.periods[5].startMinutes-=15;
const uneven=S.create(unevenDay),unevenBefore=JSON.stringify(uneven);
assert.throws(()=>move(uneven,4),/does not fit|matching adjacent/);assert.equal(JSON.stringify(uneven),unevenBefore);
assert.throws(()=>move(base,99),/valid period/);assert.equal(JSON.stringify(base),snapshot);

// Different existing times form independent cohorts, and Pit recesses never join a block.
const split=S.apply(base,{type:'recessMove',tileId:'recess:b',period:4});
assert.deepEqual(S.recessGroups(split).map(g=>[g.period,g.classIds]),[[2,['a']],[4,['b']]]);
const splitMoved=move(split,3);assert.equal(recess(splitMoved,'b').period,4);
const pit=S.apply(base,{type:'pit',tileId:'recess:b'});assert.deepEqual(S.recessGroups(pit)[0].classIds,['a']);
assert.equal(recess(move(pit,3),'b').location,'pit');assert.throws(()=>move(pit,3,'b'),/placed recess block/);
const source=fs.readFileSync(path.join(__dirname,'../shared/roster-stapler.js'),'utf8');
assert.equal(fs.readFileSync(path.join(__dirname,'../roster-update/public/roster-stapler-model.js'),'utf8'),source);
assert.equal(fs.readFileSync(path.join(__dirname,'../backend/Code.gs'),'utf8').split('/* GSIS_ROSTER_STAPLER_BEGIN */\n')[1].split('\n/* GSIS_ROSTER_STAPLER_END */')[0],source);
console.log('PASS level recess: atomic adjacent swaps, shared cards, conflict Pit, timing, split cohorts, immutable identities and synchronized runtimes.');
