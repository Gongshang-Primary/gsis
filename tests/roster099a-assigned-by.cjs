'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
const publisher='publisher@test.invalid',editor='editor@test.invalid';
function setup(){
 const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00'),iso:f.date+'T06:00:00+08:00'});
 f.state.accountingYears['2026']={verified:true};
 f.absenceId=f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,typeId:'mc',periods:[2,3]}).savedIds[0];
 f.publish=()=>f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,email:publisher}},{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});
 f.rows=()=>f.O.dailyNotifyView(f.state,{...f.ctx,user:{...f.ctx.user,email:'viewer@test.invalid'}},{date:f.date}).teachers.flatMap(t=>t.rows).filter(r=>r.kind==='relief');
 f.mine=staffId=>f.O.read(f.state,{...f.ctx,user:{staffId,email:staffId+'@test.invalid',smc:false,admin:false}},{operation:'read',view:'duties',date:f.date}).myDuties;
 return f;
}
test('automatic choices keep their attribution through publication, teacher reads and real Excel bytes',async()=>{
 for(const allocationMode of ['reoptimise','fill-only']){
  const f=setup();f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,allocationMode});f.publish();
  const assigned=f.state.assignments.filter(a=>a.status==='published');assert.equal(assigned.length,2);
  assert(f.rows().every(r=>r.assignedBy==='Auto-allocation'));
  for(const a of assigned){assert.equal(a.publishedBy,publisher);assert.equal(f.mine(a.staffId).find(r=>r.id===a.id).assignedBy,'Auto-allocation');}
  const data=f.O.dailyExport(f.state,f.ctx,{date:f.date,fullTeachers:true});
  assert(data.teacherSummary.assignments.every(a=>a.assignedBy==='Auto-allocation'));
  global.JSZip=require('jszip');const E=require('../roster-update/public/roster-export.js');
  const workbook=await E.makeWorkbook([E.dailyRelief(data)]),zip=await JSZip.loadAsync(await workbook.blob.arrayBuffer());
  assert.doesNotMatch(await zip.file('xl/worksheets/sheet1.xml').async('text'),/Assigned by/,'Excel shows relief-for only');
 }
});
test('an SMC taking ownership of the same automatic choice updates attribution without rewriting published duties',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});f.publish();
 const before=f.state.assignments.find(a=>a.period===2&&a.status==='published'),priorSnapshot=JSON.stringify(f.state.publicationSnapshots),notice=f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId===before.staffId).noticeId;
 f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,email:editor}},{operation:'assign',date:f.date,demandIds:[before.demandId],staffId:before.staffId,reason:'SMC reviewed this choice'});
 assert.equal(f.rows().find(r=>r.period===2).assignedBy,'Editor');
 assert.equal(f.mine(before.staffId).find(r=>r.period===2).assignedBy,'Auto-allocation','unpublished ownership must not replace a teacher publication');
 assert.equal(JSON.stringify(f.state.publicationSnapshots),priorSnapshot);
 f.publish();assert.equal(f.rows().find(r=>r.period===2).assignedBy,'Editor');
 assert.equal(f.mine(before.staffId).find(r=>r.period===2).assignedBy,'Editor');
 assert.equal(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId===before.staffId).noticeId,notice,'attribution alone does not create a new timetable notice');
 assert.equal(f.state.outbox.length,0);
});
test('manual and accepted peer choices use assignment provenance instead of their later publisher',()=>{
 const manual=setup();manual.O.apply(manual.state,{...manual.ctx,user:{...manual.ctx.user,email:editor}},{operation:'assign',date:manual.date,demandIds:[manual.absenceId+':2'],staffId:'bob'});manual.publish();
 assert.equal(manual.rows().find(r=>r.period===2).assignedBy,'Editor');
 const peer=setup();peer.O.apply(peer.state,peer.ctx,{operation:'requestMutual',date:peer.date,absenceId:peer.absenceId,proposalOnly:true,requests:[{recipientId:'bob',demandIds:[peer.absenceId+':2'],combination:false}]});
 peer.O.apply(peer.state,{...peer.ctx,user:{staffId:'bob',email:'bob@test.invalid',smc:false,admin:false}},{operation:'respondMutual',id:peer.state.requests[0].id,decision:'approve'});peer.publish();
 assert.equal(peer.rows().find(r=>r.period===2).assignedBy,'Peer arrangement');assert.equal(peer.mine('bob')[0].assignedBy,'Peer arrangement');
 assert.doesNotMatch(peer.O.dailyExport(peer.state,peer.ctx,{date:peer.date}).rows[0].cells[2].text,/Assigned by/);
});
test('unchanged legacy daily rows are corrected in the read projection while retained evidence stays intact',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});f.publish();
 for(const teacher of f.state.dailyPublicationStates[f.date].teachers)for(const row of teacher.rows)if(row.kind==='relief')row.assignedBy=publisher;
 const retained=JSON.stringify(f.state),ids=f.state.dailyPublicationStates[f.date].teachers.map(t=>t.noticeId);
 assert(f.rows().every(r=>r.assignedBy==='Auto-allocation'));assert.equal(JSON.stringify(f.state),retained);
 assert.deepEqual(f.state.dailyPublicationStates[f.date].teachers.map(t=>t.noticeId),ids);
});
test('legacy missing actors stay unknown and manual ownership overrides stale peer flags',()=>{
 const f=setup();assert.equal(f.O.publicDuty({origin:'smc',publishedBy:publisher}).assignedBy,'Not recorded');
 assert.equal(f.O.publicDuty({origin:'smc',createdBy:'first@test.invalid',updatedBy:editor,mutual:true}).assignedBy,'Editor');
 assert.equal(f.O.publicDuty({origin:'automatic',createdBy:editor,publishedBy:publisher}).assignedBy,'Auto-allocation');
 assert.equal(f.O.publicDuty({createdBy:'automatic'}).assignedBy,'Auto-allocation');
 assert.equal(f.O.publicDuty({origin:'shared-subject',createdBy:'shared subject rule'}).assignedBy,'Shared subject rule');
 assert.equal(A.effectiveAssignments(f.state).length,0);
});
test('a human assigner shows as the timetable name, then the Contacts name, then the email alias',()=>{
 const f=setup(),a={origin:'smc',createdBy:'ngiam.song.wee@gsps.edu.sg'};
 assert.equal(f.O.publicDuty(a).assignedBy,'Ngiam Song Wee','alias: periods become spaces, each word capitalised');
 const people=[{id:'sw',name:'Song Wee (Contacts)',email:'Ngiam.Song.Wee@gsps.edu.sg'}];
 assert.equal(f.O.publicDuty(a,{},{people}).assignedBy,'Song Wee (Contacts)');
 assert.equal(f.O.publicDuty(a,{},{people,days:{d:{teachers:[{staffId:'sw',timetableName:'Ngiam SW'}]}}}).assignedBy,'Ngiam SW','the timetable (TTb) name wins');
});
