'use strict';
const edgeChecks=[];
const assert=require('node:assert/strict'),S=require('../shared/roster-stapler.js'),adapter=require('./roster701-adapter.cjs');
const h=adapter();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.baselineDays=h.ctx.days;
const state=h.state();let plan=h.O.read(state,h.ctx,{operation:'stapler',date:h.date}).plan;const id=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2).id;plan=S.apply(plan,{type:'move',tileId:id,teacherId:'bob',period:2});
h.O.apply(state,h.ctx,{operation:'saveStapler',date:h.date,plan,staplerRevision:0});h.O.apply(state,h.ctx,{operation:'confirmStapler',date:h.date,staplerRevision:1});h.setState(state);
const cap={purpose:'duties',staffId:'bob',date:h.date,expiresAt:h.ctx.now+3600000},assertPrivate=()=>{const value=h.scope.rosterPrivateRead_({capability:cap});assert.equal(value.overlay.modified.cells[2].some(Boolean),false);assert.equal(value.timetable.daily.modified.cells[2].some(Boolean),false);assert.equal(value.duties.length,0);};
assertPrivate();assert.equal(state.outbox.length,0);assert.equal(state.staplerPlans[0].published,undefined);
const school={...h.ctx,user:{staffId:'bob',email:'bob@school.test',smc:false,admin:false}};assert.equal(h.O.timetableDay(state,school,{date:h.date}).teachers.find(t=>t.staffId==='bob').cells[2][0],'EL','explicit authenticated timetable navigation may see confirmed schedule');
plan=S.apply(state.staplerPlans[0].draft,{type:'edit',tileId:id,patch:{venue:'Later uncommunicated room'}});h.O.apply(state,h.ctx,{operation:'saveStapler',date:h.date,plan,staplerRevision:1});h.O.apply(state,h.ctx,{operation:'confirmStapler',date:h.date,staplerRevision:2});h.setState(state);assertPrivate();assert.equal(h.O.timetableDay(state,school,{date:h.date}).teachers.find(t=>t.staffId==='bob').cells[2][2],'Later uncommunicated room');
console.log('PASS legacy private capability remains publication-only across new and later confirmations; explicit authenticated confirmed timetable navigation remains available.');

// An unchanged publication has no recipient delta row. Losing its source must
// not cause either private cells or wrapper timing metadata to use a new plan.
{
 const h=adapter();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.baselineDays=h.ctx.days;const state=h.state();
 h.O.apply(state,h.ctx,{operation:'publish',date:h.date,allocationRevision:0});assert.equal(state.dailyPublicationStates[h.date].teachers.length,0);
 let plan=h.O.read(state,h.ctx,{operation:'stapler',date:h.date}).plan;plan=S.apply(plan,{type:'move',tileId:plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2).id,teacherId:'bob',period:2});h.O.apply(state,h.ctx,{operation:'saveStapler',date:h.date,plan,staplerRevision:0});h.O.apply(state,h.ctx,{operation:'confirmStapler',date:h.date,staplerRevision:1});h.setState(state);
 const originalPeriods=structuredClone(state.dailyPublicationStates[h.date].periods),original=h.ctx.days[h.date];
 for(const reference of [undefined,{...structuredClone(original),id:'replacement',teachers:original.teachers.map(t=>({...t,cells:t.cells.map(()=>['Private replacement','','',''])}))}]){
  const ctx=h.O.composeStaplerContext(state,{...h.ctx,days:reference?{[h.date]:reference}:{},baselineDays:reference?{[h.date]:reference}:{}});ctx.days[h.date]={...ctx.days[h.date],periods:ctx.days[h.date].periods.map(p=>({...p,startMinutes:p.startMinutes+1,start:'Unpublished time'}))};h.scope.rosterOperationsContext_=()=>ctx;
  const value=h.scope.rosterPrivateRead_({capability:{purpose:'duties',staffId:'bob',date:h.date,expiresAt:h.ctx.now+3600000}});
  assert.equal(value.overlay.modified.cells[2].some(Boolean),false,'missing or replaced publication source cannot supply private cells');assert.match(value.overlay.unavailableReason,/published.*baseline/i);
  assert.deepEqual(JSON.parse(JSON.stringify(value.timetable.periods)),originalPeriods,'private wrapper uses published periods');assert.equal(value.timetable.perDay,originalPeriods.length);assert.equal(value.timetable.baseline.flat().some(Boolean),false,'private wrapper cannot expose replacement or effective week cells');
  const vm=require('node:vm'),source=require('node:fs').readFileSync('roster-update/public/edge-roster.js','utf8'),scope=vm.createContext({Date:{now:()=>ctx.now},GSISRosterOperations:h.O,GSISRosterAllocation:require('../shared/roster-allocation.js'),GSISRoster:require('../shared/roster.js'),loadEdgeRoster:async()=>({state}),readEdgeRosterReferences:async()=>({contacts:{rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']},headRevision:1}),actorContacts:refs=>refs.contacts,buildEdgeRosterContext:async()=>ctx,fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});}});vm.runInContext(source.slice(source.indexOf('function capabilityValid('),source.indexOf('export async function edgeRosterService(')),scope);edgeChecks.push(scope.privateProjection({},{capability:{purpose:'duties',staffId:'bob',date:h.date,expiresAt:ctx.now+3600000}}).then(edge=>{assert.deepEqual(JSON.parse(JSON.stringify(edge.overlay)),JSON.parse(JSON.stringify(value.overlay)));assert.deepEqual(JSON.parse(JSON.stringify(edge.timetable)),JSON.parse(JSON.stringify(value.timetable)));}));
 }
 console.log('PASS empty older publication fails closed after its baseline disappears or is replaced; private wrapper timing stays published.');
}
{
 const h=adapter();h.ctx.minute=360;h.ctx.baselineDays=h.ctx.days;const state=h.state();let plan=h.O.read(state,h.ctx,{operation:'stapler',date:h.date}).plan;
 h.O.apply(state,h.ctx,{operation:'saveStapler',date:h.date,plan,staplerRevision:0});h.O.apply(state,h.ctx,{operation:'confirmStapler',date:h.date,staplerRevision:1});h.O.apply(state,h.O.composeStaplerContext(state,h.ctx),{operation:'publish',date:h.date,allocationRevision:state.dayRevisions[h.date]||0});assert.equal(state.dailyPublicationStates[h.date].teachers.length,0);
 plan=S.apply(plan,{type:'move',tileId:plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2).id,teacherId:'bob',period:2});h.O.apply(state,h.ctx,{operation:'saveStapler',date:h.date,plan,staplerRevision:1});h.O.apply(state,h.ctx,{operation:'confirmStapler',date:h.date,staplerRevision:2});
 const ctx=h.O.composeStaplerContext(state,{...h.ctx,days:{},baselineDays:{}}),daily=h.O.dailyTimetable(state,ctx,{date:h.date});assert.equal(daily.modified.cells[2][0],'EL','the exact retained published plan supplies own cells even when comparison is absent');assert.equal(daily.unavailableReason,undefined);
 assert.equal(h.O.dailyTimetable(state,{...ctx,user:{staffId:'bob'}},{date:h.date}).modified.cells[2][0],'','later confirmed transfer remains private');
 console.log('PASS exact retained published plan remains readable without baseline while later confirmation stays private.');
}

Promise.all(edgeChecks).then(()=>console.log('PASS edge legacy private wrapper matches backend cells, timing and explicit unavailable state.')).catch(error=>{console.error(error);process.exitCode=1;});
