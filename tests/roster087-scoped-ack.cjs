'use strict';
// Durable adapter simulation: no production services or messages are used.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
function setup(){
 const h=adapter();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 const s=h.state();h.O.apply(s,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2,3],typeId:'mc'});
 const demands=h.O.demand(h.ctx,s,h.date);for(const [i,staffId] of ['bob','charlie'].entries())h.O.apply(s,h.ctx,{operation:'assign',date:h.date,staffId,demandIds:[demands[i].id]});
 h.O.apply(s,h.ctx,{operation:'publish',date:h.date,allocationRevision:s.dayRevisions[h.date],notifyMode:'none'});h.setState(s);
 h.scope.rosterIndex_=()=>{throw Error('Compact acknowledgement must not load timetable sources');};
 const call=(input,staffId='bob',roles={})=>h.scope.rosterOperationsDispatch_({input,identity:{email:staffId+'@gsps.edu.sg'}},{rosterPeople:h.people,user:{rosterStaffId:staffId,rosterSMC:false,rosterAdmin:false,...roles}});
 const status=(staffId='bob',roles={})=>call({operation:'acknowledgementStatus',date:h.date},staffId,roles);
 const command=(staffId='bob',extra={})=>({operation:'acknowledge',date:h.date,timetableNoticeId:status(staffId).notice.id,snapshotIds:[],compact:true,revision:h.state().revision,requestId:crypto.randomUUID(),...extra});
 return {...h,call,status,command};
}
const checks=[];function test(name,fn){fn();checks.push(name);console.log('PASS',name);}
test('current-teacher status is compact and ignores elevated viewing privileges',()=>{
 const h=setup(),s=h.status(),admin=h.status('charlie',{rosterSMC:true,rosterAdmin:true}),publication=h.state().dailyPublicationStates[h.date];assert.equal(s.notice.id,publication.teachers.find(t=>t.staffId==='bob').noticeId);assert.equal(admin.notice.id,publication.teachers.find(t=>t.staffId==='charlie').noticeId);
 assert.equal(s.notice.status,'pending');assert.equal(s.notice.publishedInstructions,undefined);assert.equal(s.timetable,undefined);assert.equal(h.calls.contexts.length,0);assert.equal(h.calls.writes,0);
 assert.throws(()=>h.call({operation:'acknowledgementStatus',staffId:'charlie',date:h.date}),e=>e.status===403);
});
test('two teachers acknowledge the same old revision without global conflict',()=>{
 const h=setup(),bob=h.command(),charlie=h.command('charlie');assert.equal(bob.revision,charlie.revision);
 const a=h.call(bob),b=h.call(charlie,'charlie');assert.equal(a.notice.status,'acknowledged');assert.equal(b.notice.status,'acknowledged');assert.equal(b.acceptedRevision,a.acceptedRevision+1);
 assert.equal(a.acceptedNoticeId,bob.timetableNoticeId);assert.equal(a.acknowledged.timetableNoticeId,bob.timetableNoticeId);assert.equal(a.acknowledgementOnly,true);assert.equal(h.calls.contexts.length,0);assert.equal(h.locked(),false);
});
test('same-request and same-notice retries preserve one acknowledgement and timestamp',()=>{
 const h=setup(),p=h.command(),first=h.call(p),before=h.state();assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);
 h.ctx.now+=60000;const duplicate=h.call({...p,requestId:crypto.randomUUID()});assert.equal(duplicate.savedIds.length,0);assert.equal(duplicate.notice.acknowledgedAt,first.notice.acknowledgedAt);
 assert.equal(h.state().acknowledgements.length,before.acknowledgements.length);assert.equal(h.state().revision,before.revision);assert.equal(h.state().receipts.length,2);
 assert.throws(()=>h.call({...p,date:'2026-10-15'}),e=>e.status===409);
});
test('foreign and superseded notices are rejected without a commit',()=>{
 const h=setup(),p=h.command();assert.throws(()=>h.call(p,'charlie'),e=>e.status===409);assert.equal(h.calls.writes,0);
 const s=h.state(),row=s.dailyPublicationStates[h.date].teachers.find(t=>t.staffId==='bob');row.noticeId='new-notice-bob';h.setState(s);
 assert.throws(()=>h.call(p),e=>e.status===409);assert.equal(h.calls.writes,0);assert.equal(h.state().acknowledgements.length,0);
});
test('uncertain response recovers a durable compact receipt and never repeats the write',()=>{
 const h=setup(),p=h.command();h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain response/);assert.equal(h.locked(),false);
 const receipt=h.call({operation:'receiptStatus',command:p});assert.equal(receipt.accepted,true);assert.equal(receipt.acceptedNoticeId,p.timetableNoticeId);assert.equal(receipt.notice.status,'acknowledged');assert.equal(receipt.acknowledgementOnly,true);
 assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);
 assert.throws(()=>h.call({operation:'receiptStatus',command:p},'charlie'),e=>e.status===409);
});
test('old receipt binds only the accepted notice when a newer publication is pending',()=>{
 const h=setup(),p=h.command(),accepted=h.call(p),s=h.state(),pub=s.dailyPublicationStates[h.date],row=pub.teachers.find(t=>t.staffId==='bob');pub.revision++;row.noticeId='new-bob-notice';row.fingerprint='changed-timetable';h.setState(s);
 const receipt=h.call({operation:'receiptStatus',command:p});assert.equal(receipt.acceptedNoticeId,p.timetableNoticeId);assert.equal(receipt.notice.id,'new-bob-notice');assert.equal(receipt.notice.status,'pending');assert.equal(receipt.acknowledged.acknowledgedAt,accepted.acknowledged.acknowledgedAt);
 const replay=h.call(p);assert.equal(replay.acceptedNoticeId,p.timetableNoticeId);assert.equal(replay.notice.id,'new-bob-notice');assert.equal(h.calls.writes,1);
});
console.log('PASS scoped acknowledgement adapter:',checks.length,'checks');
