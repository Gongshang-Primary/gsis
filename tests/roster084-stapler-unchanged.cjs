'use strict';
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js');
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0;function test(name,run){run();passed++;console.log('PASS',name);}
function fixture(){
 const periods=Array.from({length:8},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),blank=()=>periods.map(()=>['','','','']),alice=blank(),bob=blank();alice[1]=['EL','4A, 4B','C1-01','4 EL'];bob[2]=['MA','4B','C1-02','.'];
 const day={date:'2026-10-16',id:'baseline-1',verified:true,schoolDay:true,periods,recesses:[],formClasses:[{id:'a',name:'4A',level:4},{id:'b',name:'4B',level:4}],teachers:[{staffId:'alice',name:'Alice',timetableName:'Alice',cells:alice},{staffId:'bob',name:'Bob',timetableName:'Bob',cells:bob}]},plan=S.create(day);
 const payload={app:'Stapler',version:'4.3',stateType:'plan',selectedDate:day.date,selectedDay:'Friday',selectedSheet:'Single',startTime:'07:00',periodMinutes:30,tiles:plan.baseline.tiles.map(t=>({id:t.id,sheet:'Single',day:'Friday',teacher:t.teacherId==='alice'?'Alice':'Bob',sourceTeacher:t.teacherId==='alice'?'Alice':'Bob',sourcePeriod:t.period,assignedPeriod:t.period,location:'teacher',subject:t.subject,className:t.classIds.map(id=>plan.classes.find(c=>c.id===id).name).join(','),venue:t.venue,group:t.group}))};
 return {day,plan,payload};
}
const placed=plan=>plan.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid');
test('Stored final-day imports equal to baseline have original cards and no ghosts',()=>{
 const {plan,payload}=fixture(),imported=S.importLegacy(plan,payload),stored=clone(imported),before=JSON.stringify(stored);
 assert(placed(stored).every(t=>t.id.startsWith('offline:')&&t.baselineId===null));assert(stored.tiles.some(t=>t.baselineId&&t.location==='pit'));
 assert.deepEqual(placed(stored).map(t=>S.tileState(stored,t)),['original','original']);assert.deepEqual(S.ghosts(stored),[]);assert.deepEqual(S.changes(stored),[]);
 assert.equal(JSON.stringify(stored),before,'comparison cannot rewrite imported provenance or historical plans');S.validate(stored,{baseline:plan,previous:plan});
});
test('Canonical cells ignore surrounding whitespace and class separator spacing only',()=>{
 assert.deepEqual(S.canonicalCell([' EL ','4A,4B / 4C;4D\n4E',' C1-01 ','. ']),['EL','4A, 4B, 4C, 4D, 4E','C1-01','.']);
 assert(S.sameCell(['EL','4A,4B','C1-01','G'],[' EL ','4A, 4B',' C1-01 ','G ']));
 for(const changed of [['el','4A, 4B','C1-01','G'],['EL','4B, 4A','C1-01','G'],['EL','4A, 4B','C1-02','G'],['EL','4A, 4B','C1-01',''],['EL (for Bob)','4A, 4B','C1-01','G'],['EL','4A, 4B','C1-01','G  extension']])assert(!S.sameCell(['EL','4A, 4B','C1-01','G'],changed));
 assert(!S.sameCell(['MA','4B','C1-02','.'],['MA','4B','C1-02','']),'a literal group marker remains meaningful');
});
test('Real imported subject, venue, group and class edits keep changed cards and ghosts',()=>{
 for(const patch of [{subject:'SCI'},{venue:'C2-01'},{group:'Changed group'},{classIds:['b']}]){
  const {plan,payload}=fixture(),imported=S.importLegacy(plan,payload),id=placed(imported).find(t=>t.teacherId==='alice').id,changed=S.apply(imported,{type:'edit',tileId:id,patch});
  assert.equal(S.tileState(changed,changed.tiles.find(t=>t.id===id)),'edited');assert.deepEqual(S.ghosts(changed).map(t=>t.id),['baseline:alice:1']);assert.equal(S.changes(changed).length,1);
 }
});
test('Moves, transfers, removal and restoration use effective baseline slots',()=>{
 const {plan,payload}=fixture(),stored=clone(S.importLegacy(plan,payload)),id=placed(stored).find(t=>t.teacherId==='alice').id;
 let next=S.apply(stored,{type:'move',tileId:id,period:3});assert.equal(S.tileState(next,next.tiles.find(t=>t.id===id)),'edited');assert.equal(S.changes(next).length,2);assert.equal(S.ghosts(next).length,1);
 next=S.apply(next,{type:'move',tileId:id,teacherId:'bob',period:3});assert.equal(S.tileState(next,next.tiles.find(t=>t.id===id)),'transfer');assert.equal(S.ghosts(next).length,1);
 next=S.apply(next,{type:'pit',tileId:id});assert.equal(S.changes(next).length,1);assert.equal(S.ghosts(next).length,1);
 next=S.apply(next,{type:'move',tileId:id,teacherId:'alice',period:1});assert.equal(S.tileState(next,next.tiles.find(t=>t.id===id)),'original');assert.deepEqual(S.ghosts(next),[]);assert.deepEqual(S.changes(next),[]);
});
test('An equal replacement at the original slot hides only the satisfied baseline ghost',()=>{
 const {plan}=fixture(),next=S.apply(S.apply(plan,{type:'pit',tileId:'baseline:alice:1'}),{type:'addTile',tile:{teacherId:'alice',period:1,subject:'EL',classIds:['a','b'],venue:'C1-01',group:'4 EL'}}),replacement=next.tiles.at(-1);
 assert.equal(S.tileState(next,replacement),'original');assert.deepEqual(S.ghosts(next),[]);assert.deepEqual(S.changes(next),[]);assert.equal(replacement.baselineId,null,'replacement identity is retained');
});
test('Immutable comparison reuse and mutable edits cannot produce stale card states',()=>{
 const {plan,payload}=fixture(),stored=clone(S.importLegacy(plan,payload)),canonical=S.canonical(clone(stored)),t=placed(canonical)[0];assert.equal(S.tileState(canonical,t),'original');assert.equal(S.tileState(canonical,t),'original');assert.deepEqual(S.ghosts(canonical),[]);
 const edited=S.apply(canonical,{type:'edit',tileId:t.id,patch:{venue:'Different room'}});assert.equal(S.tileState(edited,edited.tiles.find(x=>x.id===t.id)),'edited');assert.equal(S.tileState(canonical,t),'original');
 const mutable=placed(stored)[0];assert.equal(S.tileState(stored,mutable),'original');mutable.venue='Different room';assert.equal(S.tileState(stored,mutable),'edited');assert.equal(S.ghosts(stored).length,1);
});
test('A content-equal transfer retains provenance-based relief accounting and restores cleanly',()=>{
 const f=fixture();f.day.teachers[1].cells[1]=clone(f.day.teachers[0].cells[1]);const baseline=S.create(f.day);
 let plan=S.apply(S.apply(baseline,{type:'pit',tileId:'baseline:bob:1'}),{type:'move',tileId:'baseline:alice:1',teacherId:'bob',period:1}),tile=plan.tiles.find(t=>t.id==='baseline:alice:1');
 assert.equal(S.tileState(plan,tile),'original','the displayed recipient timetable is unchanged');
 const bob=S.accounting(plan).find(row=>row.staffId==='bob');assert.deepEqual(bob.reliefPeriods,[1]);assert.equal(bob.reliefCount,1);assert.equal(bob.ordinaryCurrent,1);assert.equal(bob.transfers[0].sourceTeacherId,'alice');
 plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'alice',period:1});plan=S.apply(plan,{type:'move',tileId:'baseline:bob:1',period:1});assert(S.accounting(plan).every(row=>row.reliefCount===0));assert.deepEqual(S.changes(plan),[]);assert.deepEqual(S.ghosts(plan),[]);
});
test('Mutable school-wide accounting does not rebuild display comparisons per card',()=>{
 const f=fixture(),day={...f.day,periods:Array.from({length:12},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),teachers:Array.from({length:50},(_,i)=>({staffId:'staff'+i,name:'Staff '+i,cells:Array.from({length:12},()=>['EL','4A','Room',''])}))},plan=S.create(day),classes=plan.classes;let classReads=0;Object.defineProperty(plan,'classes',{enumerable:true,get(){classReads++;return classes;}});
 const started=performance.now(),rows=S.accounting(plan),elapsed=performance.now()-started;assert.equal(rows.length,50);assert(rows.every(row=>row.ordinaryCurrent===12&&row.reliefCount===0));assert(classReads<10,'accounting must not repeatedly build class-label display indexes: '+classReads+' reads');console.log('MEASURED mutable Stapler accounting '+JSON.stringify({cards:600,elapsedMs:Math.round(elapsed*100)/100,classReads}));
});
test('Content comparison leaves source and baseline identity validation unchanged',()=>{
 const {plan,payload}=fixture(),stored=clone(S.importLegacy(plan,payload)),forged=clone(stored);forged.tiles.find(t=>t.id==='baseline:alice:1').source.subject='Tampered';assert.throws(()=>S.validate(forged,{baseline:plan}),/Original lesson details/);
 const identity=clone(stored);placed(identity)[0].baselineId='baseline-1';assert.throws(()=>S.validate(identity,{baseline:plan}),/Unknown baseline card|Invalid offline source/);
});
console.log(passed+' unchanged Stapler card checks passed');
