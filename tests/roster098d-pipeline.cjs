'use strict';
const assert=require('node:assert/strict'),setup=require('./roster093b-absence-pipeline.cjs');
{
 const h=setup(),first=h.make({periods:[2,3]});assert.equal(h.process(first).intakeState,'applied');
 const id=h.state().absences[0].id,key=h.state().absences[0].lessonSnapshot[0].lessonKey;
 const second=h.make({periods:[2,3],instructionsNA:false,instructionsByDate:{[h.date]:{[key]:'Read page 5.'}}});second.sequence=2;
 assert.equal(h.process(second).intakeState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.state().absences[0].id,id);assert.equal(h.state().absences[0].instructions[key],'Read page 5.');
 const third=h.make({periods:[2,3,4],instructionsNA:false,instructionsByDate:{[h.date]:{[key]:'Read page 6.'}}});third.sequence=3;assert.equal(h.process(third).intakeState,'applied');assert.deepEqual(h.state().absences[0].periods,[2,3,4]);assert.equal(h.state().absences[0].instructions[key],'Read page 6.');
 const stale=h.make({periods:[2,3],instructionsNA:false,instructionsByDate:{[h.date]:{[key]:'Old'}}});stale.sequence=1;assert.equal(h.process(stale).intakeState,'applied');assert.equal(h.state().absences[0].instructions[key],'Read page 6.');assert.deepEqual(h.state().absences[0].periods,[2,3,4]);
 const current=h.state();current.absences[0].updatedBy='bob@gsps.edu.sg';h.setState(current);const shorter=h.make({periods:[2,3]});shorter.sequence=4;const review=h.process(shorter);assert.equal(review.failureCode,'ABSENCE_SHORTER_CONFIRMATION');assert.equal(review.absenceApplied,false);
}
console.log('PASS 098d real pipeline reuses absence identity, later instructions, stale replay and shorter prompt');
{
 const h=setup();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 h.process(h.make({periods:[2]}));h.process(h.make({periods:[3]}));
 const picks=h.state().absences.map(a=>{const l=a.lessonSnapshot[0];return {period:l.period,recipientId:'bob',combination:false,lessonKey:l.lessonKey,expectedTimetableId:l.timetableId,expectedParity:'even',expectedStaplerRevision:0};});
 const next=h.make({periods:[2,3],ownArrangementsByStaffDate:{alice:{[h.date]:picks}}});next.sequence=3;const result=h.process(next);assert.equal(result.peerState,'applied');assert.equal(h.state().requests.length,2,'each lesson proposal uses its actual saved absence');
}
{
 const h=setup();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.days[h.date].teachers[0].cells[3]=['MA','4B','C1-02',''];
 h.process(h.make({periods:[2,3]}));let s=h.state(),a=s.absences[0],key2=a.lessonSnapshot.find(l=>l.period===2).lessonKey,key3=a.lessonSnapshot.find(l=>l.period===3).lessonKey;
 a.instructions={[key3]:'Historical evidence'};a.instructionsNA=false;h.setState(s);
 const choice=h.make({periods:[2]});choice.sequence=2;h.scope.rosterAbsenceOverlapKey_=()=> 'a'.repeat(64);choice.overlapChoice={value:'replace',token:'a'.repeat(64),requestId:'decision'};assert.equal(h.process(choice).intakeState,'applied');
 const notes=h.make({periods:[2],instructionsNA:false,instructionsByDate:{[h.date]:{[key2]:'Current note'}}});notes.sequence=3;assert.equal(h.process(notes).intakeState,'applied');assert.equal(h.state().absences[0].instructions[key2],'Current note');assert.equal(h.state().absences[0].instructions[key3],'Historical evidence');
}
{
 const h=setup();h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.minute=360;h.process(h.make({periods:[2]}));
 let s=h.state();const a=s.absences[0],d=h.O.demand(h.ctx,s,h.date)[0];h.O.apply(s,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[d.id]});h.O.apply(s,h.ctx,{operation:'publish',date:h.date,allocationRevision:s.dayRevisions[h.date]});const assignment=s.assignments[0].id;h.setState(s);
 const job=h.make({periods:[2],instructionsNA:false,instructionsByDate:{[h.date]:{[a.lessonSnapshot[0].lessonKey]:'Use the worksheet'}}});job.sequence=2;assert.equal(h.process(job).intakeState,'applied');s=h.state();assert.equal(s.assignments[0].id,assignment);assert.equal(s.assignments[0].status,'published');assert.match(s.assignments[0].instructions,/worksheet/);const outbox=s.outbox.length,snapshots=s.publicationSnapshots.length;
 const repeat=h.make({...job.command,requestId:undefined});repeat.command.requestId=repeat.id;repeat.sequence=3;assert.equal(h.process(repeat).intakeState,'applied');assert.equal(h.state().outbox.length,outbox,'repeat instructions must not duplicate a notification');assert.equal(h.state().publicationSnapshots.length,snapshots);assert.equal(h.state().assignments[0].id,assignment);
}
