'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const copy=value=>JSON.parse(JSON.stringify(value));
{
 const {O,state,ctx,date,teachers,people}=fixture(),actor={...ctx,user:{...ctx.user,smc:false,admin:false}};ctx.minute=actor.minute=360;
 teachers.find(t=>t.staffId==='bob').cells[2]=['MA','3B','C2-01',''];teachers.find(t=>t.staffId==='dora').cells[5]=['Absent — PRIVATE_REASON','','',''];
 for(const [i,separator] of ['\n','\r','\u2028','\u2029'].entries())teachers.find(t=>t.staffId==='dora').cells[6+i]=['EL (absent — PRIVATE'+separator+'REASON)','4A','Room',''];
 people.push({id:'external',name:'External relief',active:true,mobile:'89876543'});O.apply(state,ctx,{operation:'saveAdhoc',date,staffId:'external',periods:[2]});
 const absenceId=O.apply(state,actor,{operation:'saveAbsence',date,staffId:'alice',typeId:'mc',periods:[2,3]}).savedId,demandIds=O.demand(ctx,state,date).filter(d=>d.absenceId===absenceId).map(d=>d.id);
 const input={operation:'candidates',purpose:'mutual',byPeriod:true,date,demandIds},before=copy(state),legacy=O.read(state,actor,input),result=O.read(state,actor,{...input,includeTimetable:true});
 assert(result.timetable,'one candidate response includes the full-day grid when requested');assert.equal(legacy.timetable,undefined,'legacy callers keep their small response');
 assert.deepEqual(result.candidatesByPeriod,legacy.candidatesByPeriod);assert.deepEqual(state,before,'grid read changes no state or notification intent');
 const table=result.timetable;assert.equal(table.id,result.timetableId);assert.equal(table.parity,result.parity);assert.equal(table.staplerRevision,result.staplerRevision);assert.deepEqual(table.periods,ctx.days[date].periods);
 assert.deepEqual(new Set(table.teachers.map(t=>t.staffId)),new Set(['alice','bob','charlie','dora','external']));
 assert.deepEqual(table.teachers.find(t=>t.staffId==='bob').cells[2],['MA','3B','C2-01','']);assert.equal(table.teachers.find(t=>t.staffId==='external').cells.length,table.periods.length);
 for(const teacher of table.teachers)assert.deepEqual(Object.keys(teacher).sort(),['cells','name','staffId']);assert(!JSON.stringify(table).includes('89876543'));
 assert.equal(table.teachers.find(t=>t.staffId==='dora').cells[5][0],'Absent');assert(!JSON.stringify(table).includes('PRIVATE_REASON'));assert.equal(teachers.find(t=>t.staffId==='dora').cells[5][0],'Absent — PRIVATE_REASON','stored attendance labels are untouched');
 for(let period=6;period<10;period++)assert.equal(table.teachers.find(t=>t.staffId==='dora').cells[period][0],'Absent','line breaks cannot expose offline absence reasons');assert(!JSON.stringify(table).includes('PRIVATE'));
 table.teachers.find(t=>t.staffId==='bob').cells[2][0]='tampered';assert.equal(ctx.days[date].teachers.find(t=>t.staffId==='bob').cells[2][0],'MA','response cells do not alias trusted context');
 const bob=O.apply(state,ctx,{operation:'saveAbsence',date,staffId:'bob',typeId:'mc',periods:[2]}).savedId,bobDemand=O.demand(ctx,state,date).find(d=>d.absenceId===bob).id;
 assert.throws(()=>O.read(state,actor,{...input,includeTimetable:true,demandIds:[bobDemand]}),e=>e.status===403,'full grid cannot bypass absence ownership');
 assert.throws(()=>O.read(state,actor,{...input,includeTimetable:true,purpose:'allocation'}),e=>e.status===400);
 assert.throws(()=>O.apply(state,actor,{operation:'requestMutual',date,absenceId,requests:[{recipientId:'bob',combination:false,demandIds:[demandIds[0]]}]}),e=>e.status===409,'a displayed occupied or absent colleague is still denied by request validation');
}
{
 const {O,state,ctx,date}=fixture();ctx.minute=360;ctx.baselineDays=ctx.days;
 const plan=O.read(state,ctx,{operation:'stapler',date}).plan,tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);tile.subject='SCI';tile.venue='Laboratory';
 O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});O.staplerApply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 const current=O.composeStaplerContext(state,ctx),actor={...current,user:{...ctx.user,smc:false,admin:false}},absenceId=O.apply(state,actor,{operation:'saveAbsence',date,staffId:'alice',typeId:'mc',periods:[2]}).savedId,demandIds=O.demand(current,state,date).filter(d=>d.absenceId===absenceId).map(d=>d.id);
 const result=O.read(state,actor,{operation:'candidates',purpose:'mutual',byPeriod:true,includeTimetable:true,date,demandIds});
 assert.equal(result.timetable.staplerRevision,current.days[date].staplerRevision);assert.equal(result.timetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'SCI');assert.equal(result.timetable.teachers.find(t=>t.staffId==='alice').cells[2][2],'Laboratory');
 assert.equal(ctx.days[date].teachers.find(t=>t.staffId==='alice').cells[2][0],'EL','grid uses the composed source without overwriting baseline');
}
{
 const {O,state,ctx,date}=fixture();ctx.minute=360;ctx.baselineDays=ctx.days;ctx.days[date].teachers.find(t=>t.staffId==='bob').cells[2]=['MA','4B','Room',''];
 const plan=O.read(state,ctx,{operation:'stapler',date}).plan;O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});O.staplerApply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 const confirmed=O.composeStaplerContext(state,ctx),actor=context=>({...context,user:{...ctx.user,smc:false,admin:false}}),absenceId=O.apply(state,actor(confirmed),{operation:'saveAbsence',date,staffId:'alice',typeId:'mc',periods:[2]}).savedId;
 const input={operation:'candidates',purpose:'mutual',byPeriod:true,includeTimetable:true,date,demandIds:O.demand(confirmed,state,date).filter(d=>d.absenceId===absenceId).map(d=>d.id)};
 assert.equal(O.read(state,actor(confirmed),input).timetable.teachers.find(t=>t.staffId==='bob').cells[2][0],'MA');
 const changed=copy(state.staplerPlans[0].draft);changed.tiles.find(t=>t.teacherId==='bob'&&t.period===2).subject='UNCONFIRMED_PRIVATE_LESSON';O.staplerApply(state,ctx,{operation:'saveStapler',date,staplerRevision:1,plan:changed});
 const current=O.composeStaplerContext(state,ctx),before=copy(state);
 const grid=O.read(state,actor(current),input).timetable;assert.equal(grid.staplerRevision,1);assert.equal(grid.teachers.find(t=>t.staffId==='bob').cells[2][0],'MA');assert(!JSON.stringify(grid).includes('UNCONFIRMED_PRIVATE_LESSON'),'ordinary teacher receives only the retained confirmed grid');
 assert.deepEqual(state,before);assert.equal(state.absences.length,1,'blocked grid does not undo the saved absence');
 const compact=O.reportView(state,actor(current),{date,staffId:'alice'});assert.deepEqual(compact.timetable.teachers.filter(t=>Array.isArray(t.cells)).map(t=>t.staffId),['alice'],'accepted report cannot leak other teachers’ draft cells before the grid check');
 assert(!JSON.stringify(compact.timetable).includes('UNCONFIRMED_PRIVATE_LESSON'));
 assert.equal(O.read(state,current,input).timetable.teachers.find(t=>t.staffId==='bob').cells[2][0],'MA','SMC allocation also uses the retained confirmation');
 const record=state.staplerPlans[0];record.published=record.draft;record.publishedRevision=record.revision;delete record.confirmedPlan;delete record.confirmedRevision;
 assert.equal(O.read(state,actor(O.composeStaplerContext(state,ctx)),input).timetable.staplerRevision,record.publishedRevision,'matching published source remains available');
}
console.log('PASS own-arrangements timetable: one optional candidate projection, matching source identity, full current cells including STAPLER, external rows, privacy and unchanged mutation guards.');

