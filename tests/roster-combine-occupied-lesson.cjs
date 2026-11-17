const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
let passed=0;const test=(name,work)=>{work();passed++;console.log('PASS '+name);};
function setup(cell=['Learning Event','','Hall','']){
 const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=360;
 f.teachers[0].cells[2]=['EL','4A','Hall',''];f.teachers[1].cells[2]=structuredClone(cell);
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2]});f.dem=f.O.demand(f.ctx,f.state,f.date)[0];
 f.rank=(dem=f.dem)=>A.manualRanks(A.manualModel(f.state,f.ctx,f.date),dem).find(row=>row.staffId==='bob');
 f.choose=operation=>f.O.apply(f.state,f.ctx,{operation,date:f.date,staffId:'bob',demandIds:[f.dem.id],reviewed:true});return f;
}
test('an occupied subject without a class label permits Combine and rejects ordinary relief',()=>{
 const f=setup(),before=structuredClone(f.teachers[1].cells[2]),rank=f.rank();assert.equal(rank.available,false);assert.equal(rank.combineAllowed,true);assert.equal(rank.sameClass,false);
 assert.throws(()=>f.choose('assign'),/Timetabled/);const result=f.choose('combine'),row=f.state.assignments.find(a=>a.id===result.savedId);
 assert.equal(row.combination,true);assert.equal(row.rCost,0);assert.deepEqual(row.originalLesson,{subject:before[0],className:'',venue:before[2],groupName:''});assert.deepEqual(f.teachers[1].cells[2],before);
 f.O.reconcile(f.state,f.ctx);assert.equal(row.status,'draft');assert.equal(row.invalidCover,undefined);
});
test('named-class Combine remains available while ordinary relief still requires a blank',()=>{
 const f=setup(['MA','4B','Hall','']);assert.equal(f.rank().combineAllowed,true);assert.equal(f.rank().available,false);assert.throws(()=>f.choose('assign'),/Timetabled/);f.choose('combine');
 const blank=setup(['','','','']);assert.equal(blank.rank().combineAllowed,false);assert.equal(blank.rank().available,true);assert.throws(()=>blank.choose('combine'),/cannot take another class/);blank.choose('assign');
});
test('blocked duties and location-only cells do not become combination bases',()=>{
 for(const cell of [['PD','','Hall',''],['BLK','','Hall',''],['BLOCK','4B','Hall',''],['IMP','','Hall',''],['Recess duty','','Hall',''],['','','Hall',''],['','','','Group']]){
  const f=setup(cell);assert.equal(f.rank().combineAllowed,false,JSON.stringify(cell));assert.throws(()=>f.choose('combine'),/cannot take another class/);
 }
});
test('two blank class labels never grant a same-class exemption or a second additional class',()=>{
 const f=setup();f.teachers[0].cells[2]=['Learning Event','','Hall',''];f.dem=f.O.demand(f.ctx,f.state,f.date)[0];assert.equal(f.dem.className,'');assert.equal(f.rank().sameClass,false);f.choose('combine');
 f.teachers[2].cells[2]=['Learning Event','','Hall',''];f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'charlie',date:f.date,typeId:'mc',periods:[2]});const second=f.O.demand(f.ctx,f.state,f.date).find(row=>row.staffId==='charlie');assert(second);
 assert.equal(f.rank(second).sameClass,false);assert.equal(f.rank(second).combineAllowed,false);assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'combine',date:f.date,staffId:'bob',demandIds:[second.id]}),/one-additional-class/);
});
test('matching named classes retain the existing exemption',()=>{
 const f=setup(['FTT','4A','Hall','']);assert.equal(f.rank().sameClass,true);f.choose('combine');
 f.teachers[2].cells[2]=['EL','4A','Hall',''];f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'charlie',date:f.date,typeId:'mc',periods:[2]});const second=f.O.demand(f.ctx,f.state,f.date).find(row=>row.staffId==='charlie');assert.equal(f.rank(second).combineAllowed,true);
});
test('attendance and inactive identity still refuse Combine',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'bob',date:f.date,typeId:'mc',periods:[2]});assert.equal(f.rank().combineAllowed,false);assert.throws(()=>f.choose('combine'));
 const inactive=setup();inactive.people[1].active=false;assert.equal(inactive.rank(),undefined);assert.throws(()=>inactive.choose('combine'));
});
test('published timetable preserves the original activity and the added class',()=>{
 const f=setup();const before=structuredClone(f.teachers[1].cells[2]);f.choose('combine');f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});
 const own=f.state.dailyPublicationStates[f.date].teachers.find(row=>row.staffId==='bob');assert(own);assert.deepEqual(own.baseline[2],before);assert(own.cells[2][0].includes('Learning Event'));assert(own.cells[2][0].includes('EL'));assert(own.cells[2][1].includes('4A'));assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);
});
test('colleague proposals share the occupied-lesson predicate and unnamed-class cap',()=>{
 const f=setup();const result=f.O.apply(f.state,f.ctx,{operation:'requestMutual',date:f.date,absenceId:f.state.absences[0].id,proposalOnly:true,requests:[{demandIds:[f.dem.id],recipientId:'bob',combination:true}]});
 assert.equal(result.savedIds.length,1);assert.equal(f.state.requests[0].combination,true);assert.equal(f.state.requests[0].originalLesson.subject,'Learning Event');assert.equal(f.state.requests[0].originalLesson.className,'');
});
console.log(passed+' occupied lesson Combine groups passed');
