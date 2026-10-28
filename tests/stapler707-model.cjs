'use strict';
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js');
const day=()=>({date:'2026-10-16',id:'tt1',verified:true,schoolDay:true,periods:Array.from({length:14},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30,start:String(7+Math.floor(period/2)).padStart(2,'0')+':'+(period%2?'30':'00')})),recesses:[{level:1,period:3}],formClasses:[{id:'p1',name:'1P',level:1}],teachers:[{staffId:'a',name:'A',timetableName:'A',cells:Array.from({length:14},(_,p)=>p>=1&&p<=12&&p!==3?['Math','1P','Room','']:['','','',''])},{staffId:'b',name:'B',timetableName:'B',cells:Array.from({length:14},()=>['','','',''])}]});
const base=S.create(day()),tile=p=>base.tiles.find(t=>t.kind==='lesson'&&t.period===p).id,recess=base.tiles.find(t=>t.kind==='recess').id;
assert.equal(S.validate(base,{publish:true}),base);
// Two projections share one identity; failed changes preserve every prior field.
const snapshot=JSON.stringify(base);
assert.throws(()=>S.apply(base,{type:'move',tileId:tile(1),teacherId:'a',period:2}),/already has a lesson/);
assert.equal(JSON.stringify(base),snapshot);
let p=S.apply(base,{type:'move',tileId:tile(1),teacherId:'b',period:1});
assert.equal(S.accounting(p).find(t=>t.staffId==='b').reliefCount,1);
assert.equal(S.accounting(p).find(t=>t.staffId==='b').ordinaryCurrent,0);
assert.equal(S.ghosts(p).find(t=>t.id===tile(1)).teacherId,'a');
assert.equal(S.effectiveDay(p,day()).teachers.find(t=>t.staffId==='b').cells[1][1],'1P');
p=S.apply(p,{type:'addClass',class:{id:'lo',name:'LO'}});
p=S.apply(p,{type:'move',tileId:tile(1),classId:'lo',period:0});
assert.equal(p.tiles.find(t=>t.id===tile(1)).teacherId,'b');
assert.equal(S.effectiveDay(p,day()).teachers.find(t=>t.staffId==='b').cells[0][1],'LO');
assert.equal(S.ghosts(p).find(t=>t.id===tile(1)).source.period,1);
// Adjacent accordion moves shift all intervening lessons; reset evicts once to Pit.
p=S.apply(base,{type:'recessMove',tileId:recess,period:5});
assert.equal(p.tiles.find(t=>t.id===tile(4)).period,3);
assert.equal(p.tiles.find(t=>t.id===tile(5)).period,4);
assert.equal(p.tiles.find(t=>t.id===recess).period,5);
S.validate(p,{publish:true});
p=S.apply(p,{type:'resetRecesses'});
assert.equal(p.tiles.find(t=>t.id===tile(4)).location,'pit');
assert.throws(()=>S.validate(p,{publish:true}),/Fill every class period/);
const again=S.apply(p,{type:'resetRecesses'});assert.deepEqual(again.tiles,p.tiles);
// Any displaced teacher clash rejects the whole accordion, including prior steps.
const blocked=day();blocked.teachers[1].cells[4]=['Art','LO','Other',''];blocked.teachers[0].cells[5]=['','','',''];blocked.teachers[1].cells[5]=['Math','1P','Room',''];
const blockedPlan=S.create(blocked),old=JSON.stringify(blockedPlan);
assert.throws(()=>S.apply(blockedPlan,{type:'recessMove',tileId:recess,period:5}),/already has a lesson/);
assert.equal(JSON.stringify(blockedPlan),old);
// Suspension is evacuation plus visual mat, and permits returning a tile onto the mat.
p=S.apply(base,{type:'suspend',target:'teacher',targetId:'a',fromPeriod:1,toPeriod:2,reason:'Invigilation'});
assert.equal(p.mats.length,1);assert.equal(p.tiles.filter(t=>t.location==='pit').length,2);
assert.equal(S.effectiveDay(p,day()).teachers[0].cells[1].join(''),'');
p=S.apply(p,{type:'move',tileId:tile(1),teacherId:'a',period:1});
assert.equal(p.tiles.find(t=>t.id===tile(1)).location,'grid');
assert.throws(()=>S.validate(p,{publish:true}),/Fill every class period/);
// Actual timing, not just period labels, enforces teacher clash.
const overlap={date:'2026-10-16',id:'o',verified:true,schoolDay:true,formClasses:[],periods:[{period:0,startMinutes:450,endMinutes:480},{period:1,startMinutes:465,endMinutes:495}],teachers:[{staffId:'a',name:'A',cells:[['Math','','',''],['','','','']]},{staffId:'b',name:'B',cells:[['','','',''],['Art','','','']]}]};
const op=S.create(overlap);assert.throws(()=>S.apply(op,{type:'move',tileId:op.tiles[0].id,teacherId:'b',period:0}),/already has a lesson/);
// Baseline and coverage cannot be altered by tampering with a client draft.
const tamper=JSON.parse(JSON.stringify(base));tamper.classes[0].traditional=false;assert.throws(()=>S.validate(tamper,{baseline:base,publish:true}),/Baseline class identities|Original recess identity/);
const tamperTile=JSON.parse(JSON.stringify(base));tamperTile.tiles[0].kind='recess';tamperTile.tiles[0].teacherId=null;assert.throws(()=>S.validate(tamperTile,{baseline:base}),/Invalid card identity|Original lesson identity/);
// Final Offline JSON retains the baseline without importing relief history.
const legacy={app:'Stapler',version:'4.3',stateType:'relief',selectedDate:base.date,selectedDay:'Friday',selectedSheet:'Single',startTime:'07:00',periodMinutes:30,tiles:base.baseline.tiles.map(t=>({id:t.id,sheet:'Single',day:'Friday',teacher:'A',sourceTeacher:'A',sourcePeriod:t.period,assignedPeriod:t.period,location:'teacher',subject:t.subject,className:'1P',venue:t.venue,group:t.group})),reliefAbsences:[]};
p=S.importLegacy(base,legacy);assert.equal(p.status,'draft');assert.deepEqual(p.baseline,base.baseline);assert.equal(S.accounting(p).find(t=>t.staffId==='b').reliefCount,0);assert.deepEqual(S.effectiveDay(S.importLegacy(p,legacy)).teachers,S.effectiveDay(p).teachers);
assert.throws(()=>S.importLegacy(base,{...legacy,selectedDate:'2026-10-15'}),/date does not match/);
assert.throws(()=>S.importLegacy(base,{...legacy,periodMinutes:15}),/period timings/);
assert.throws(()=>S.importLegacy(base,{...legacy,reliefAbsences:[{teacher:'A',assignments:{},swaps:{1:'B'}}]}),{message:'Invalid Offline JSON absence details.',status:400},'absence records must include a periods array');
// Original activity identity and cadence cannot be forged through a full-plan save.
const altered=JSON.parse(JSON.stringify(base));altered.teachers[0].name='Different person';assert.throws(()=>S.validate(altered,{baseline:base}),/Baseline teacher identities/);
const withExtra=S.apply(base,{type:'addTile',tile:{teacherId:'b',subject:'PD (ML)',venue:'Room'}});assert.equal(S.accounting(withExtra).find(t=>t.staffId==='b').nonTeachingDelta,0);
const placedExtra=S.apply(withExtra,{type:'move',tileId:withExtra.tiles.at(-1).id,period:0});assert.equal(S.accounting(placedExtra).find(t=>t.staffId==='b').nonTeachingDelta,1);
const forged=JSON.parse(JSON.stringify(placedExtra));forged.tiles.at(-1).source.teacherId='a';assert.throws(()=>S.validate(forged,{baseline:base,previous:base}),/Save a newly added card/);
const venueLegacy=JSON.parse(JSON.stringify(legacy));venueLegacy.tiles[0].sourceVenue='Room';venueLegacy.tiles[0].venue='Unknown venue';const customVenuePlan=S.importLegacy(base,venueLegacy);assert.equal(customVenuePlan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid').venue,'Unknown venue');assert(customVenuePlan.warnings.some(w=>w.includes('Unknown venue')));
// Short timetable slots keep a single recess card spanning its full configured duration.
const short=day();short.recesses=[{level:1,startMinutes:510,endMinutes:540}];short.periods=Array.from({length:28},(_,period)=>({period,startMinutes:420+period*15,endMinutes:435+period*15}));short.teachers=short.teachers.map(t=>({...t,cells:Array.from({length:28},(_,i)=>t.staffId==='a'&&i>=2&&i<26&&![6,7].includes(i)?['Math','1P','Room','']:['','','',''])}));
const shortPlan=S.create(short),shortRecess=shortPlan.tiles.find(t=>t.kind==='recess');assert.deepEqual(S.tilePeriods(shortPlan,shortRecess),[6,7]);S.validate(S.apply(shortPlan,{type:'recessMove',tileId:shortRecess.id,period:8}),{publish:true});
const marker=day();marker.teachers[0].cells[3]=['Recess','1P','Room',''];assert.equal(S.accounting(S.create(marker)).find(t=>t.staffId==='a').teachingDelta,0);assert.deepEqual(S.accounting(S.create(marker)).find(t=>t.staffId==='a').unknownActivities,[]);
const noRecess=day();noRecess.recesses=[];noRecess.teachers[0].cells[3]=['Math','1P','Room',''];assert.equal(S.create(noRecess).tiles.filter(t=>t.kind==='recess').length,0);
const early=day();early.endOfDayMinutes=780;early.teachers[0].cells[12]=['','','',''];S.validate(S.create(early),{publish:true});assert.throws(()=>S.validate(S.create({...early,endOfDayMinutes:810}),{publish:true}),/13:30/);
console.log('PASS Stapler model: atomic moves, linked views, recess, suspension, coverage, timing, immutable anchors and legacy Relief import.');
