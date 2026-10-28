'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),setup=require('./roster093b-absence-intake.cjs');
const h=setup(),p=h.command();h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',failureCode:'ABSENCE_SHORTER_CONFIRMATION'});
h.f.state.absences=[{id:'existing',staffId:'alice',date:h.f.date,periods:[2,3,4],typeId:'mc',reliefRequired:true}];
const review=h.scope.rosterAbsenceIntakeReview_(h.req({intakeRequestId:p.requestId}),h.c);assert.match(review.overlapToken,/^[a-f0-9]{64}$/);assert.equal(review.teachers[0].staffId,'alice');
assert.throws(()=>h.scope.rosterAbsenceIntakeReview_({identity:{email:'bob@gsps.edu.sg'},input:{intakeRequestId:p.requestId}},h.contacts('bob')),e=>e.status===403);
const choice={requestId:p.requestId,overlapChoice:'replace',overlapToken:review.overlapToken,decisionId:crypto.randomUUID()};h.lose();assert.throws(()=>h.scope.rosterAbsenceIntakeRetry_(h.req(choice),h.c),/Lost Drive/);const writes=h.writes();const retry=h.scope.rosterAbsenceIntakeRetry_(h.req(choice),h.c);assert.equal(retry.intakeState,'pending');assert.equal(h.writes(),writes);assert.equal(h.journal().entries[0].overlapChoice.value,'replace');assert.equal(h.journal().entries[0].command.requestId,p.requestId);
assert.throws(()=>h.scope.rosterAbsenceIntakeRetry_(h.req({...choice,overlapChoice:'keep'}),h.c),e=>e.status===409);
// The final primary adapter compares this same token inside its existing write lock.
h.f.state.absences[0].periods.push(5);assert.notEqual(h.scope.rosterAbsenceOverlapKey_(h.f.state,p),review.overlapToken);
console.log('PASS shorter decision own-report authorization, immutable command, lost-response replay and changed-register token');
