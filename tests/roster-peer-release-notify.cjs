'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const f=fixture(),{O,state,ctx,date}=f;
state.requests.push({id:'peer',date,staffId:'alice',absentName:'Alice',recipientId:'bob',recipientName:'Bob',status:'approved',lessons:[{id:'d2',period:2,timeStart:'08:00',timeEnd:'08:30',className:'4A',subject:'EL',venue:'Room'},{id:'d3',period:3,timeStart:'08:30',timeEnd:'09:00',className:'4A',subject:'EL',venue:'Room'}]});
state.assignments.push({id:'a2',requestId:'peer',demandId:'d2',staffId:'bob',date,period:2,status:'cancelled',cancelledAt:ctx.iso,origin:'mutual'},{id:'a3',requestId:'peer',demandId:'d3',staffId:'bob',date,period:3,status:'draft',origin:'mutual'});
assert.equal(state.outbox.length,0,'release data alone never sends');
assert.equal(O.queuePeerReleaseNotices(state,ctx,date),2);assert.deepEqual(state.outbox.map(j=>j.recipientId).sort(),['alice','bob']);assert(state.outbox.every(j=>j.status==='queued'));
assert.equal(O.queuePeerReleaseNotices(state,ctx,date),0,'same release is queued once per peer');
const firstIds=state.outbox.map(j=>j.id);for(const j of state.outbox)j.status='failed';assert.equal(O.queuePeerReleaseNotices(state,ctx,date),2,'explicit Notify retries known failures');assert.deepEqual(state.outbox.map(j=>j.id),firstIds,'retry reuses durable intent');for(const j of state.outbox)j.status='uncertain';assert.equal(O.queuePeerReleaseNotices(state,ctx,date),0,'uncertain delivery is not sent again');for(const j of state.outbox)j.status='queued';
for(const j of state.outbox){assert.equal(O.notificationCurrent(state,j,ctx.now),null);assert.match(j.data.summary,/P2/);assert.doesNotMatch(j.data.summary,/P3/);}
state.assignments[1].status='cancelled';state.assignments[1].cancelledAt=ctx.iso;
assert.equal(O.queuePeerReleaseNotices(state,ctx,date),2);assert(state.outbox.slice(2).every(j=>j.data.peerReleasedDemandIds.join()==='d3'),'new release does not repeat earlier periods');
const forged=structuredClone(state.outbox[0]);forged.recipientId='charlie';assert.match(O.notificationCurrent(state,forged,ctx.now),/not owned/);
state.assignments[0].status='draft';assert.match(O.notificationCurrent(state,state.outbox[0],ctx.now),/no longer released/,'dispatch rechecks restored peer work');
assert.equal(O.queuePeerReleaseNotices(state,ctx,date,'charlie'),0,'unrelated selected teacher sends no peer notice');
assert.equal(state.requests[0].status,'approved','notification does not rewrite agreement history');
const draft=fixture();draft.state.requests.push({...state.requests[0],lessons:[state.requests[0].lessons[0]]});draft.state.assignments.push({id:'original',requestId:'peer',demandId:'d2',staffId:'bob',date,period:2,status:'published'},{id:'remove',requestId:'peer',demandId:'d2',staffId:'bob',date,period:2,status:'draft',remove:true,replaces:'original'});assert.equal(O.queuePeerReleaseNotices(draft.state,draft.ctx,date),2,'Notify sees saved removal before Publish');
console.log('PASS peer release recipients, partial-release history, dedupe, queued outcomes and dispatch revalidation');
