'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const message='Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.';
const f=fixture();f.ctx.baselineDays=structuredClone(f.ctx.days);
f.teachers[1].cells[2]=['EL','4A','Room B',''];
f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:0,notifyMode:'all'});
assert.equal(f.state.outbox.length,0,'Publish has no implicit notification');f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});
const job=f.state.outbox.find(j=>j.recipientId==='bob'),snapshot=JSON.stringify(f.state.dailyPublicationStates),fingerprint=job.data.fingerprint;
assert.equal(job.data.summary,message);
job.data.summary='P2 08:00 to 08:30 EL 4A Room B';
assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);
assert.equal(job.data.summary,message,'pre-existing daily queue gets current copy');
assert.equal(job.data.fingerprint,fingerprint);assert.equal(JSON.stringify(f.state.dailyPublicationStates),snapshot);
assert.equal(f.O.dailyTimetable(f.state,{...f.ctx,user:{staffId:'bob'}},{date:f.date}).modified.cells[2][0],'EL');

// Legacy Stapler creation and old queued rows use the same copy even without rich notice metadata.
const legacy=fixture();legacy.ctx.baselineDays=structuredClone(legacy.ctx.days);
let plan=legacy.O.read(legacy.state,legacy.ctx,{operation:'stapler',date:legacy.date}).plan;
const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);
plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
legacy.state.staplerPlans.push({date:legacy.date,baselineId:'baseline',revision:1,published:plan,publishedRevision:1,publishedAt:legacy.ctx.iso,notifiedFingerprints:{}});
legacy.O.refreshStaplerNotifications(legacy.state,legacy.ctx);
assert(legacy.state.outbox.length);assert(legacy.state.outbox.every(j=>j.data.summary===message));
delete legacy.state.staplerPlans[0].timetableNotices;
for(const j of legacy.state.outbox){j.data.summary='P2 old period detail';assert.equal(legacy.O.notificationCurrent(legacy.state,j,legacy.ctx.now),null);assert.equal(j.data.summary,message);}
console.log('Timetable notices use compact copy for new and queued daily/legacy sends; publication detail and fingerprints are unchanged');
