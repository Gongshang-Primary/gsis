'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
function setup(){
 const f=fixture(),{O,state,ctx,date}=f;ctx.timetableEntries=[{id:'baseline',startDate:date,endDate:'2026-12-31',status:'published'}];
 const plan=S.create({...ctx.days[date],date});O.apply(state,ctx,{operation:'saveStapler',date,staplerRevision:0,plan});
 ctx.iso=date+'T00:01:00Z';O.apply(state,ctx,{operation:'confirmStapler',date,staplerRevision:1});
 const record=state.staplerPlans[0];delete record.confirmedPlan;delete record.confirmedRevision;
 const teacher={...ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
 return {...f,record,plan,teacher};
}
function legacyRename(f,name='EL EYE'){
 const r=f.record,before=r.name||'';r.name=name;r.revision++;r.updatedAt=f.date+'T00:0'+r.revision+':00Z';r.updatedBy=f.ctx.user.email;
 f.state.audit.push({id:'rename-'+r.revision,date:f.date,operation:'renameStapler',at:r.updatedAt,actor:r.updatedBy,before,name,staplerRevision:r.revision});
}
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
test('Rename-only legacy confirmation is readable by a normal teacher without mutating state',()=>{
 const f=setup();legacyRename(f);const before=JSON.stringify(f.state),out=f.O.timetableDay(f.state,f.teacher,{date:f.date});
 assert.equal(out.source,'confirmed');assert.equal(out.confirmedRevision,1);assert.equal(out.teachers[0].cells[2][0],'EL');
 assert.equal(JSON.stringify(f.state),before);assert.equal(f.state.outbox.length,0);
 const row=f.O.staplerDatesView(f.state,f.teacher).dates[0];assert.equal(row.canViewConfirmed,true);assert.equal(row.confirmedRevision,1);assert.equal(row.confirmedSnapshotAvailable,true);
});
test('Legacy confirmation at the current revision remains visible before any rename',()=>{const f=setup();assert.equal(f.O.timetableDay(f.state,f.teacher,{date:f.date}).source,'confirmed');});
test('Several contiguous rename revisions preserve the original confirmation',()=>{const f=setup();legacyRename(f);legacyRename(f,'Final name');assert.equal(f.O.confirmedStaplerSnapshot(f.record,f.state.audit).revision,1);});
test('Incomplete, duplicate, mismatched or content-edit history does not expose the draft',()=>{
 for(const alter of [f=>f.state.audit.pop(),f=>f.state.audit.push({...f.state.audit.at(-1)}),f=>f.state.audit.at(-1).operation='saveStapler',f=>f.state.audit.at(-1).at='2026-01-01T00:00:00Z',f=>f.state.audit.at(-1).name='Wrong',f=>f.record.revision++,f=>f.record.confirmedBy='other@gsps.edu.sg']){
  const f=setup();legacyRename(f);alter(f);const out=f.O.timetableDay(f.state,f.teacher,{date:f.date});assert.equal(out.source,'baseline');assert.equal(out.suspension.status,'needs-reconfirmation');assert.equal(out.teachers.length,0);
  const manager=f.O.staplerDatesView(f.state,f.ctx).dates[0];assert.equal(manager.status,'Needs reconfirmation');assert.equal(manager.confirmedSnapshotAvailable,false);
 }
});
test('New rename retains the exact legacy confirmed snapshot before metadata changes',()=>{
 const f=setup();f.ctx.iso=f.date+'T00:02:00Z';f.O.apply(f.state,f.ctx,{operation:'renameStapler',date:f.date,staplerRevision:1,name:'Renamed'});
 assert(f.record.confirmedPlan);assert.equal(f.record.confirmedRevision,1);f.state.audit=[];assert.equal(f.O.timetableDay(f.state,f.teacher,{date:f.date}).source,'confirmed');
});
test('Saving after legacy recovery freezes the old contents and keeps new lessons private',()=>{
 const f=setup();legacyRename(f);const changed=S.apply(f.plan,{type:'edit',tileId:f.plan.tiles[0].id,patch:{venue:'PRIVATE ROOM'}});f.ctx.iso=f.date+'T00:05:00Z';
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:2,basePlan:f.plan,plan:changed});f.state.audit=[];
 const out=f.O.timetableDay(f.state,f.teacher,{date:f.date});assert.equal(out.source,'confirmed');assert.equal(out.confirmedRevision,1);assert.doesNotMatch(JSON.stringify(out),/PRIVATE ROOM/);
});
test('Recovery preserves existing teacher eligibility and date restrictions',()=>{
 const f=setup();legacyRename(f);f.teacher.user.staffId='unknown';let out=f.O.timetableDay(f.state,f.teacher,{date:f.date});assert.equal(out.source,'baseline');assert.equal(out.suspension,undefined);
 f.teacher.user.staffId='bob';f.teacher.today='2026-10-15';out=f.O.timetableDay(f.state,f.teacher,{date:f.date});assert.equal(out.source,'baseline');assert.equal(out.suspension,undefined);
});
console.log(count+' confirmed rename recovery checks passed');
