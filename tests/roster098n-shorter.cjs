'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),intake=require('./roster093b-absence-intake.cjs'),pipeline=require('./roster093b-absence-pipeline.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){const f=fixture(),date='2026-10-15';f.ctx.days[date]=clone(f.ctx.days[f.date]);Object.assign(f.ctx,{resubmission:true,attendanceOnly:true,minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.reportedAt=f.ctx.iso;f.ctx.reportSequence=1;
 const save=(extra={})=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date,staffId:'alice',typeId:'mc',periods:[2,3,4],instructionsNA:true,...extra});
 const advance=()=>{f.ctx.now+=1000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.reportedAt=f.ctx.iso;f.ctx.reportSequence++;};return {...f,date,save,advance};}

test('later same-reporter and same-editor shorter future report replaces full-day coverage without another review',()=>{
 const h=setup(),id=h.save({fullDay:true}).savedIds[0];h.advance();const result=h.save({periods:Array.from({length:11},(_,i)=>i),typeId:'others',reasonDetail:'Updated appointment'});
 assert.deepEqual(result.savedIds,[id]);assert.equal(h.state.absences.length,1);assert.deepEqual(h.state.absences[0].periods,Array.from({length:11},(_,i)=>i));assert.equal(h.state.absences[0].coverage.kind,'timeRange');assert.equal(h.state.absences[0].typeId,'others');assert.equal(h.state.absences[0].reasonDetail,'Updated appointment');
});
test('0.9.9a: a later shorter report replaces coverage saved by a different reporter or editor',()=>{
 for(const field of ['reportedBy','updatedBy']){const h=setup();h.save();h.state.absences[0][field]='bob@gsps.edu.sg';h.advance();h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3]);}
});
test('missing latest editor uses the original reporter; explicit keep and replace choices still win',()=>{
 {const h=setup();h.save();delete h.state.absences[0].updatedBy;h.advance();h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3]);}
 {const h=setup();h.save();h.advance();h.ctx.resubmissionChoice='keep';h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3,4]);}
 {const h=setup();h.save();h.state.absences[0].reportedBy='bob@gsps.edu.sg';h.advance();h.ctx.resubmissionChoice='replace';h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3]);}
});
test('strict report chronology prevents an old or identical-order report from shortening a newer entry',()=>{
 const h=setup();h.save();const original=h.ctx.reportedAt;h.advance();h.save({periods:[2,3,4,5]});const expected=clone(h.state.absences);
 h.ctx.reportedAt=original;h.ctx.reportSequence=1;h.save({periods:[2,3]});assert.deepEqual(h.state.absences,expected);
 h.ctx.reportedAt=expected[0].lastSubmissionAt;h.ctx.reportSequence=expected[0].lastSubmissionSequence;h.save({periods:[2,3]});assert.deepEqual(h.state.absences,expected,'an identical-order replay keeps the saved coverage');
 h.ctx.reportSequence++;h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3]);
});
test('0.9.9a: a later shorter report releases protected covers but never changes ended periods',()=>{
 for(const protection of [{origin:'smc'},{origin:'mutual'},{protected:true},{manualProtected:true},{combination:true},{sharedLessonKey:'shared-lesson'},{absenceIds:['other-absence','placeholder']}]){
  const h=setup(),id=h.save().savedIds[0];h.state.assignments.push({id:'protected-assignment',date:h.date,period:4,absenceId:id,status:'draft',origin:'automatic',...protection});h.advance();h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3]);
 }
 const h=setup();h.save();h.ctx.today=h.date;h.ctx.minute=900;h.ctx.now=Date.parse(h.date+'T15:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.reportedAt=h.ctx.iso;h.ctx.reportSequence++;h.save({periods:[2,3]});assert.deepEqual(h.state.absences[0].periods,[2,3,4],'ended periods keep their recorded absence');
});
test('same-actor shorter attendance does not overwrite instructions written by another actor',()=>{
 const h=setup();h.save();const a=h.state.absences[0],key=a.lessonSnapshot[0].lessonKey;a.instructions={[key]:'SMC note'};a.instructionsNA=false;a.instructionAuthors={[key]:{actor:'bob@gsps.edu.sg',at:h.ctx.reportedAt,sequence:1}};h.advance();const before=clone(h.state);assert.throws(()=>h.save({periods:[2,3],instructionsNA:false,instructionsByDate:{[h.date]:{[key]:'Reporter replacement'}}}),e=>e.code==='ABSENCE_INSTRUCTIONS_CONFLICT');assert.deepEqual(h.state,before);
});
test('0.9.9a: a later shorter report replaces overlapping rows whoever last edited them',()=>{
 const h=setup();h.save({periods:[2,3]});h.save({periods:[4,5]});h.state.absences[1].updatedBy='bob@gsps.edu.sg';h.advance();h.save({periods:[2,3,4]});assert.deepEqual(h.state.absences.flatMap(a=>a.periods),[2,3,4]);
});
test('retained shorter reviews are claimed only once under N and preserve the existing D overlap recovery',()=>{
 const h=intake(),command=h.command();h.capture(command);let [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',failureCode:'ABSENCE_SHORTER_CONFIRMATION'});
 const [recovery]=h.scope.rosterAbsenceIntakeClaim_(1);assert(recovery);assert.equal(recovery.id,command.requestId);assert.equal(recovery.shorterRecoveryVersion,'098n');assert.equal(recovery.command.requestId,command.requestId);assert.equal(recovery.digest,h.journal().entries[0].digest);h.scope.rosterAbsenceIntakeSettle_(recovery.id,recovery.claimId,{state:'needsReview',failureCode:'ABSENCE_SHORTER_CONFIRMATION'});assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0,'another actor conflict does not loop');
 const other=h.command();h.capture(other);[job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',failureCode:'ABSENCE_OVERLAP'});const [old]=h.scope.rosterAbsenceIntakeClaim_(1);assert.equal(old.id,other.requestId);assert.equal(old.mergeRecoveryVersion,'098d');h.scope.rosterAbsenceIntakeSettle_(old.id,old.claimId,{state:'needsReview',failureCode:'ABSENCE_OVERLAP'});assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0);
});
test('shorter recovery never reclaims active leases, applied attendance, withdrawn or resolved work',()=>{
 const h=intake(),p=h.command();h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',failureCode:'ABSENCE_SHORTER_CONFIRMATION'});
 const file=[...h.files.values()][0],base=JSON.parse(file.text);
 for(const extra of [{claimExpiresAt:Date.parse('2026-10-14T07:00:00+08:00')},{state:'applied',absenceApplied:true},{state:'withdrawn'},{resolution:{requestId:crypto.randomUUID()}},{absenceApplied:true},{shorterRecoveryVersion:'098n'}]){const current=clone(base);Object.assign(current.entries[0],extra);file.text=JSON.stringify(current);const writes=h.writes();assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0,JSON.stringify(extra));assert.equal(h.writes(),writes);}
});
test('real attendance pipeline accepts later same-actor shorter report and exact replay stays idempotent',()=>{
 const h=pipeline();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();const first=h.make({fullDay:true});assert.equal(h.process(first).intakeState,'applied');const id=h.state().absences[0].id;
 h.ctx.now+=1000;h.ctx.iso=new Date(h.ctx.now).toISOString();const shorter=h.make({periods:[2,3]});shorter.sequence=2;const result=h.process(shorter);assert.equal(result.intakeState,'applied');assert.equal(result.absenceApplied,true);assert.deepEqual(h.state().absences[0].periods,[2,3]);assert.equal(h.state().absences[0].id,id);const writes=h.calls.writes;
 shorter.state='pending';shorter.absenceApplied=false;shorter.savedIds=[];assert.equal(h.process(shorter).intakeState,'applied');assert.equal(h.calls.writes,writes);assert.equal(h.state().absences.length,1);
});

test('real intake journal accepts a capacity failure as retained review work and exposes its safe code',()=>{
 const h=intake(),fs=require('node:fs'),vm=require('node:vm'),command=h.command();h.capture(command);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.contacts_=()=>h.c;h.scope.rosterAbsenceDispatch_=()=>{throw Object.assign(Error('Relief records are full. Ask Admin to prune old records.'),{status:507,code:'ROSTER_STORAGE_CAPACITY'});};vm.runInContext(fs.readFileSync('backend/RosterAbsencePipeline.gs','utf8'),h.scope);
 const result=h.scope.rosterAbsenceIntakeProcess_({input:{requestId:job.requestId,claimId:job.claimId,calendarByDate:{[h.f.date]:{date:h.f.date,schoolDay:true,parity:'even'}}}});assert.equal(result.intakeState,'needsReview');assert.equal(result.reasonCode,'STORAGE_CAPACITY_REQUIRED');assert.equal(result.failureCode,'ROSTER_STORAGE_CAPACITY');assert.equal(result.absenceApplied,false);
 const receipt=h.receipt(command);assert.equal(receipt.intakeState,'needsReview');assert.equal(receipt.failureCode,'ROSTER_STORAGE_CAPACITY');assert.equal(h.journal().entries[0].command.requestId,command.requestId);assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0,'capacity failure needs action instead of an infinite cron retry');
});
