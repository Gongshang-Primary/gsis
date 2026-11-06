'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
function setup(){const f=fixture();f.ctx.minute=300;f.ctx.baselineDays=structuredClone(f.ctx.days);const plan=S.create({...f.ctx.days[f.date],date:f.date,formClasses:[]},{date:f.date,venues:[]});f.O.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:0,plan});return f;}
function confirm(f){return f.O.staplerApply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:f.state.staplerPlans[0].revision});}
function edit(f,remove=false){const row=f.state.staplerPlans[0];let plan=structuredClone(row.draft);const tile=plan.tiles.find(t=>t.kind==='lesson'&&t.period===2);assert(tile);if(remove)plan=S.apply(plan,{type:'pit',tileId:tile.id});else tile.subject='MA';f.O.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:row.revision,plan});}
test('save keeps last confirmation, publication does not confirm the pending edit, explicit confirm switches',()=>{
 const f=setup(),{O,state,ctx,date}=f;confirm(f);const confirmed=structuredClone(state.staplerPlans[0].confirmedPlan),revision=state.dayRevisions[date],at=state.staplerPlans[0].confirmedAt;
 edit(f);assert.equal(O.readyStaplerPlan(state.staplerPlans[0]).tiles.find(t=>t.kind==='lesson'&&t.period===2).subject,'EL');assert.equal(state.dayRevisions[date],revision,'draft save must not advance effective allocation inputs');
 let day=O.effectiveTimetableDay(state,ctx,date);assert.equal(day.staplerRevision,1);assert.equal(day.teachers[0].cells[2][0],'EL');
 O.apply(state,O.composeStaplerContext(state,ctx),{operation:'publish',date,allocationRevision:revision||0});const row=state.staplerPlans[0];assert.equal(row.publishedRevision,1);assert.equal(row.confirmedRevision,1);assert.equal(row.confirmedAt,at);assert.deepEqual(row.confirmedPlan,confirmed);assert.equal(state.dailyPublicationStates[date].staplerRevision,1);
 confirm(f);day=O.effectiveTimetableDay(state,ctx,date);assert.equal(day.staplerRevision,2);assert.equal(day.teachers[0].cells[2][0],'MA');
 const own=O.read(state,ctx,{operation:'dailyTimetable',date});assert.equal(own.modified.cells[2][0],'MA','live timetable uses latest confirmation even after a prior publication');
});
test('retained confirmation stays effective when legacy confirmed flag is false',()=>{const f=setup();confirm(f);edit(f);f.state.staplerPlans[0].confirmed=false;assert.equal(f.O.effectiveTimetableDay(f.state,f.ctx,f.date).staplerRevision,1);});
test('never confirmed draft uses baseline and reports its pending confirmation',()=>{const f=setup();edit(f);assert.equal(f.O.effectiveTimetableDay(f.state,f.ctx,f.date).id,'baseline');const view=f.O.read(f.state,f.ctx,{operation:'read',view:'allocation',date:f.date});assert.equal(view.timetableSource.kind,'baseline');assert.equal(view.timetableSource.neverConfirmed,true);});
test('Report Absence, Daily Notify and full teacher export keep confirmed cells and revision',()=>{
 const f=setup();confirm(f);edit(f);const ctx=f.O.composeStaplerContext(f.state,f.ctx),report=f.O.reportView(f.state,ctx,{date:f.date,staffId:'alice'});
 assert.equal(report.timetable.staplerRevision,1);assert.equal(report.timetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'EL');assert.deepEqual(report.periods,ctx.days[f.date].periods);
 const notify=f.O.dailyNotifyView(f.state,ctx,{date:f.date}),exported=f.O.dailyExport(f.state,ctx,{date:f.date,fullTeachers:true,dailyDrive:true});
 assert.equal(notify.timetableSource.revision,1);assert.match(notify.timetableSource.label,/Stapler plan rev 1/);assert.equal(notify.timetableSource.pendingDraft,true);assert.equal(exported.teacherSummary.plan.tiles.find(t=>t.kind==='lesson'&&t.period===2).subject,'EL');
});
test('draft edits leave cover untouched; confirm reconciles just the changed lesson',()=>{
 const f=setup();confirm(f);let ctx=f.O.composeStaplerContext(f.state,f.ctx);f.O.apply(f.state,ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});f.O.apply(f.state,ctx,{operation:'autoAllocate',date:f.date});assert.equal(f.state.assignments.length,2);
 const before=structuredClone(f.state.assignments);edit(f,true);f.O.reconcileOperational(f.state,f.ctx,true);assert.deepEqual(f.state.assignments,before);assert.equal(f.state.smcAlerts.some(a=>a.code==='TIMETABLE_RECONCILE_BLOCKED'),false);
 confirm(f);f.O.reconcileOperational(f.state,f.ctx,true);const unchanged=f.state.assignments.find(a=>a.period===3);assert.deepEqual(unchanged,before.find(a=>a.period===3));assert.equal(f.state.assignments.find(a=>a.period===2).status,'cancelled');
});
test('replacement import retains confirmation and legacy notice evidence until explicitly confirmed',()=>{
 const f=setup();confirm(f);const row=f.state.staplerPlans[0],old=structuredClone(row.confirmedPlan);Object.assign(row,{published:old,publishedRevision:1,publishedAt:f.ctx.iso,notifiedFingerprints:{alice:'retained'},noticeSequence:9,timetableNotices:{alice:{id:'retained-notice'}}});
 const replacement=S.create({...f.ctx.days[f.date],id:'replacement-origin',date:f.date});f.O.staplerApply(f.state,f.ctx,{operation:'importStapler',date:f.date,staplerRevision:1,plan:replacement});const next=f.state.staplerPlans[0];
 assert.equal(next.baselineId,'replacement-origin');assert.equal(f.O.effectiveTimetableDay(f.state,f.ctx,f.date).staplerBaselineId,'baseline');assert.deepEqual(next.notifiedFingerprints,{alice:'retained'});assert.equal(next.noticeSequence,9);assert.deepEqual(next.timetableNotices,{alice:{id:'retained-notice'}});assert.equal(f.O.timetableDay(f.state,f.ctx,{date:f.date}).originBaselineId,'baseline');
});
test('audited legacy rename uses the same confirmation for export and publication',()=>{
 const f=setup();confirm(f);const row=f.state.staplerPlans[0];delete row.confirmedPlan;delete row.confirmedRevision;row.name='Renamed';row.revision=2;row.updatedAt=f.date+'T00:02:00Z';f.state.audit.push({id:'rename',date:f.date,operation:'renameStapler',at:row.updatedAt,actor:f.ctx.user.email,before:'',name:row.name,staplerRevision:2});
 assert.equal(f.O.effectiveTimetableDay(f.state,f.ctx,f.date).staplerRevision,1);assert.equal(f.O.dailyExport(f.state,f.O.composeStaplerContext(f.state,f.ctx),{date:f.date,fullTeachers:true}).teacherSummary.staplerStatus,'confirmed');f.O.publishDay(f.state,f.O.composeStaplerContext(f.state,f.ctx),{date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0});assert.equal(row.publishedRevision,1);assert.equal(f.O.timetableDay(f.state,f.ctx,{date:f.date}).staplerRevision,1);
});
test('new confirmed teacher view never overlays relief from an earlier publication by period index',()=>{
 const f=setup();confirm(f);f.O.publishDay(f.state,f.O.composeStaplerContext(f.state,f.ctx),{date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0});edit(f);confirm(f);
 f.state.assignments.push({id:'old-period',date:f.date,staffId:'alice',period:39,timeStart:'19:00',timeEnd:'19:30',status:'published',combination:true,subject:'OLD RELIEF',className:'1A'});
 const view=f.O.read(f.state,f.ctx,{operation:'dailyTimetable',date:f.date});assert.equal(view.modified.cells.length,view.periods.length);assert.equal(view.modified.cells[2][0],'MA');assert.doesNotMatch(JSON.stringify(view),/OLD RELIEF/);
});
