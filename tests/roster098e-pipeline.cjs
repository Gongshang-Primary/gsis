'use strict';
const assert=require('node:assert/strict'),setup=require('./roster093b-absence-pipeline.cjs');
const h=setup(),job=h.make({instructionsNA:false,instructionsByDate:{[h.date]:{old:'Retained original note'}},ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob'}]}}});
h.ctx.now+=86400000;h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.today=new Date(h.ctx.now+8*3600000).toISOString().slice(0,10);
const result=h.process(job);assert.equal(result.absenceApplied,true);assert.equal(result.intakeState,'applied','past follow-on work must not leave an obsolete review');assert.equal(result.reasonCode,'EXPIRED_FOLLOWUPS_RETAINED');assert.equal(h.state().requests.length,0);assert.equal(h.state().outbox.length,0);assert.equal(job.command.instructionsByDate[h.date].old,'Retained original note');
console.log('PASS E past attendance saves while old notes and proposals remain evidence without invitations or alerts');

{
 const h=setup(),next='2026-10-15';h.ctx.days[next]={...structuredClone(h.ctx.days[h.date]),date:next};
 const job=h.make({dates:[h.date,next],instructionsNA:false,instructionsByDate:{[h.date]:{old:'Past retained note'}},ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',lessonKey:'old'}]}}});job.dates=[h.date,next];
 h.ctx.now+=86400000;h.ctx.today=next;h.ctx.iso=new Date(h.ctx.now).toISOString();
 const result=h.scope.rosterAbsenceIntakeProcess_({input:{requestId:job.id,claimId:job.claimId,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even'},[next]:{date:next,schoolDay:true,parity:'even'}}}});
 assert.equal(result.absenceApplied,true);assert.equal(result.intakeState,'applied','past parts of mixed-date receipt do not block current attendance');assert.equal(h.state().requests.length,0);assert.equal(result.reasonCode,'EXPIRED_FOLLOWUPS_RETAINED');
 console.log('PASS E mixed-date receipt retains past follow-on evidence without obsolete review');
}
