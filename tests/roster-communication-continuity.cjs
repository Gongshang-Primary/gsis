'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');

function ready(){
 const f=fixture();time(f,'06:00');f.ctx.baselineDays=structuredClone(f.ctx.days);
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});
 f.dem=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});return f;
}
function time(f,clock){f.ctx.now=Date.parse(f.date+'T'+clock+':00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=Number(clock.slice(0,2))*60+Number(clock.slice(3));}
function notify(f){f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});return f.state.outbox.filter(j=>j.kind==='stapler_timetable'&&j.recipientId==='bob').at(-1);}
const capability=(f,j)=>({purpose:'duties',staffId:'bob',date:f.date,communicationId:j.id,issuedAt:f.ctx.now,expiresAt:f.ctx.now+7*86400000});
const recipient=f=>({...f.ctx,user:{staffId:'bob',email:'bob@example.test',smc:false,admin:false}});
const publish=f=>f.O.publishDay(f.state,f.ctx,{date:f.date,allocationRevision:f.state.dayRevisions[f.date]});
function acknowledged(f){const job=notify(f),cap=capability(f,job),projection=f.O.communicationProjection(f.state,cap);f.O.acknowledgeCommunication(f.state,recipient(f),cap,{timetableNoticeId:projection.timetableNotice.id});return {job,cap,projection,ack:f.state.acknowledgements.at(-1)};}

test('equivalent first publication reuses the acknowledged communication notice and original teacher action',()=>{
 const f=ready(),{cap,projection,ack}=acknowledged(f),count=f.state.acknowledgements.length;time(f,'06:10');publish(f);
 const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.equal(notice.id,projection.timetableNotice.id);assert.equal(notice.status,'acknowledged');assert.equal(notice.acknowledgedAt,ack.at);assert.equal(f.state.acknowledgements.length,count);assert.equal(f.O.pendingPublications(f.state,'bob').length,0);
 assert(f.state.audit.some(a=>a.operation==='carryTimetableAcknowledgement'&&a.acknowledgementId===ack.id&&a.snapshotIds.length));
 const resolved=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now);assert.equal(resolved.source,'published');assert.equal(resolved.projection.updatedSinceMessage,false);assert.equal(resolved.projection.timetableNotice.status,'acknowledged');
 publish(f);assert.equal(f.O.timetableNotice(f.state,recipient(f),{date:f.date}).id,notice.id);assert.equal(f.O.timetableNotice(f.state,recipient(f),{date:f.date}).status,'acknowledged');
});

test('carried acknowledgement suppresses twenty-minute scheduling and cancels queued reminders for covered snapshots',()=>{
 const f=ready(),{ack}=acknowledged(f);time(f,'06:10');publish(f);const snapshot=f.state.publicationSnapshots.find(v=>v.staffId==='bob'&&v.kind==='assigned');
 const reminder={id:'waiting-reminder',kind:'relief_reminder',recipientId:'bob',date:f.date,status:'queued',createdAt:f.ctx.iso,expiresAt:f.ctx.now+86400000,data:{templateKey:'relief_reminder',snapshotIds:[snapshot.id]}};f.state.outbox.push(reminder);
 publish(f);assert.equal(reminder.status,'cancelled');assert.match(f.O.notificationCurrent(f.state,reminder,f.ctx.now),/acknowledged|superseded/);
 time(f,'07:40');f.O.scheduledTick(f.state,{...f.ctx,service:true},f.ctx.now);assert(!f.state.outbox.some(j=>j.kind==='relief_reminder'&&j.recipientId==='bob'&&j.status==='queued'));assert.equal(f.state.acknowledgements.find(a=>a.id===ack.id).at,ack.at);
});

test('changed class, subject, venue, time and instructions each require a fresh acknowledgement',()=>{
 for(const changed of ['className','subject','venue','timeStart','instructions']){
  const f=ready(),{projection}=acknowledged(f),a=f.state.assignments.find(a=>a.staffId==='bob');
  if(changed==='instructions')f.state.absences[0].instructions[f.dem.lessonKey]='Use the new worksheet.';else a[changed]=changed==='timeStart'?'08:15':changed==='className'?'5B':changed==='subject'?'MA':'New venue';
  time(f,'06:10');publish(f);const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(notice.id,projection.timetableNotice.id,changed);assert.equal(notice.status,'pending',changed);assert.equal(f.O.pendingPublications(f.state,'bob').length,1,changed);
 }
});

test('a newer explicit communication prevents older equivalent acknowledgement revival',()=>{
 const f=ready(),old=acknowledged(f),a=f.state.assignments.find(a=>a.staffId==='bob');a.className='5B';time(f,'06:10');const newer=notify(f);assert.notEqual(newer.id,old.job.id);
 a.className='4A';time(f,'06:20');publish(f);const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(notice.id,old.projection.timetableNotice.id);assert.equal(notice.status,'pending');
});

test('published cancellation and reinstatement cannot reuse the old communication acknowledgement',()=>{
 const f=ready(),old=acknowledged(f);time(f,'06:10');publish(f);time(f,'06:20');f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});publish(f);
 time(f,'06:30');f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});publish(f);const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(notice.id,old.projection.timetableNotice.id);assert.equal(notice.status,'pending');
});

test('uncommunicated draft cancellation and identical reinstatement preserve the last authorized acknowledgement',()=>{
 const f=ready(),old=acknowledged(f);f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});time(f,'06:10');publish(f);
 assert.equal(f.O.timetableNotice(f.state,recipient(f),{date:f.date}).id,old.projection.timetableNotice.id);assert.equal(f.O.pendingPublications(f.state,'bob').length,0);
});

test('carry requires the exact acknowledged recipient, date, communication and notice scope',()=>{
 for(const changed of ['staffId','date','communicationId','timetableNoticeId']){const f=ready(),old=acknowledged(f);old.ack[changed]=changed==='date'?'2026-10-15':'wrong';time(f,'06:10');publish(f);const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(notice.id,old.projection.timetableNotice.id,changed);assert.equal(notice.status,'pending',changed);}
});

test('valid older communication resolves newer publication but never exposes later unsent draft changes',()=>{
 const f=ready(),old=acknowledged(f),immutable=structuredClone(f.O.communicationProjection(f.state,old.cap));time(f,'06:10');publish(f);
 const a=f.state.assignments.find(a=>a.staffId==='bob');a.className='5B';time(f,'06:20');publish(f);const latest=f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now);assert.equal(latest.source,'published');assert.equal(latest.projection.duties[0].className,'5B');assert.equal(latest.projection.updatedSinceMessage,true);assert.equal(latest.projection.linkExpiresAt,old.cap.expiresAt);
 a.className='UNSENT DRAFT';assert.equal(f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now).projection.duties[0].className,'5B');assert.deepEqual(f.O.communicationProjection(f.state,old.cap),immutable);
});

test('newer explicit communication outranks an older publication and can be acknowledged using the old capability',()=>{
 const f=ready(),old=acknowledged(f);time(f,'06:10');publish(f);const original=f.state.assignments.find(a=>a.staffId==='bob');
 time(f,'06:20');f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});f.state.assignments.find(a=>a.staffId==='bob'&&a.status==='draft'&&!a.remove&&!a.noRelief).className='5B';const newest=notify(f);
 const latest=f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now);assert.equal(latest.source,'communication');assert.equal(latest.communicationId,newest.id);assert.equal(latest.projection.duties[0].className,'5B');assert.equal(latest.projection.updatedSinceMessage,true);
 f.O.acknowledgeDutiesCapability(f.state,recipient(f),old.cap,{timetableNoticeId:latest.projection.timetableNotice.id,snapshotIds:[]});assert.equal(f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now).projection.timetableNotice.status,'acknowledged');assert(f.state.acknowledgements.some(a=>a.communicationId===newest.id));assert.equal(original.status,'published');
});

test('retry timestamps never make an older captured communication the latest source',()=>{
 const f=ready(),old=acknowledged(f);time(f,'06:10');publish(f);f.state.assignments.find(a=>a.staffId==='bob').className='5B';time(f,'06:20');publish(f);old.job.notificationIntentAt=f.date+'T23:00:00+08:00';old.job.completedAt=old.job.notificationIntentAt;
 assert.equal(f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now).projection.duties[0].className,'5B');
});

test('read and acknowledgement resolve the same current notice and reject a stale displayed notice with conflict',()=>{
 const f=ready(),job=notify(f),cap=capability(f,job),shown=f.O.communicationProjection(f.state,cap);f.state.assignments.find(a=>a.staffId==='bob').className='5B';time(f,'06:10');publish(f);
 assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,recipient(f),cap,{timetableNoticeId:shown.timetableNotice.id,snapshotIds:[]}),e=>e.status===409);assert.equal(f.state.acknowledgements.length,0);
 const latest=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection;f.O.acknowledgeDutiesCapability(f.state,recipient(f),cap,{timetableNoticeId:latest.timetableNotice.id,snapshotIds:latest.timetableNotice.snapshotIds});assert.equal(f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection.timetableNotice.status,'acknowledged');
});

test('wrong original scope, expired capability and foreign displayed snapshot are rejected',()=>{
 const f=ready(),job=notify(f),cap=capability(f,job);publish(f);
 for(const bad of [{...cap,staffId:'charlie'},{...cap,date:'2026-10-15'},{...cap,purpose:'mutual'},{...cap,communicationId:'missing'},{...cap,expiresAt:f.ctx.now}])assert.throws(()=>f.O.resolveDutiesCapability(f.state,bad,f.ctx.now),e=>[401,403].includes(e.status));
 const notice=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection.timetableNotice;assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,recipient(f),cap,{timetableNoticeId:notice.id,snapshotIds:['foreign']}),e=>e.status===403);assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,{...recipient(f),user:{staffId:'charlie'}},cap,{timetableNoticeId:notice.id,snapshotIds:[]}),e=>e.status===403);
});

test('ordinary duties capability resolves only a saved authorized source and preserves expiry',()=>{
 const f=ready(),cap={purpose:'duties',staffId:'bob',date:f.date,expiresAt:f.ctx.now+86400000};assert.equal(f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection,null);publish(f);
 const resolved=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now);assert.equal(resolved.source,'published');assert.equal(resolved.projection.updatedSinceMessage,false);assert.equal(resolved.projection.linkExpiresAt,cap.expiresAt);
});

test('equal timestamps use captured publication revisions and outbox order without preferring stale content',()=>{
 const f=ready(),old=acknowledged(f);publish(f);assert.equal(f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now).source,'published');
 f.state.assignments.find(a=>a.staffId==='bob').className='5B';const newer=notify(f),communicated=f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now);assert.equal(communicated.source,'communication');assert.equal(communicated.communicationId,newer.id);assert.equal(communicated.projection.duties[0].className,'5B');
 publish(f);assert.equal(f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now).source,'published');
});

test('a newer publication without a recipient row supersedes old duties and rejects the stale acknowledgement',()=>{
 const f=ready(),old=acknowledged(f);f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});time(f,'06:10');publish(f);
 const resolved=f.O.resolveDutiesCapability(f.state,old.cap,f.ctx.now);assert.equal(resolved.source,'published');assert(resolved.projection);assert.deepEqual(resolved.projection.duties,[]);assert.equal(resolved.projection.timetableNotice,null);assert.match(resolved.projection.overlay.unavailableReason,/published/);assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,recipient(f),old.cap,{timetableNoticeId:old.projection.timetableNotice.id,snapshotIds:[]}),e=>e.status===409);
});

test('explicitly communicated cancellation breaks acknowledgement continuity before first publication',()=>{
 const f=ready(),old=acknowledged(f);f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});time(f,'06:10');const cancellation=notify(f);assert.notEqual(cancellation.id,old.job.id);
 f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});time(f,'06:20');publish(f);const notice=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(notice.id,old.projection.timetableNotice.id);assert.equal(notice.status,'pending');
});

test('published private views retain own notification history and own absence arrangements without crossing recipient scope',()=>{
 const f=ready();f.teachers[1].cells[3]=['MA','4B','C2-01',''];f.ctx.baselineDays[f.date].teachers[1].cells[3]=['MA','4B','C2-01',''];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'bob',typeId:'mc',periods:[3]});const dem=f.O.demand(f.ctx,f.state,f.date).find(d=>d.staffId==='bob');f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[dem.id],staffId:'charlie'});publish(f);
 const cap={purpose:'duties',staffId:'bob',date:f.date,expiresAt:f.ctx.now+86400000},view=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection;
 assert.equal(view.history.length,1);assert(view.history.every(v=>v.assignment.staffId==='bob'&&v.date===f.date));assert.equal(view.arrangements.length,1);assert.equal(view.arrangements[0].staffId,'charlie');assert.equal(view.arrangements[0].absentId,'bob');assert(view.duties.every(row=>row.staffId==='bob'));
});

test('published capability read preserves timetable eligibility and permits its scoped pending duty acknowledgement',()=>{
 const f=ready(),job=notify(f),cap=capability(f,job);time(f,'06:10');publish(f);f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'bob',typeId:'mc',periods:f.ctx.days[f.date].periods.map(p=>p.period)});
 const view=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection;assert.equal(f.O.timetableNotice(f.state,recipient(f),{date:f.date}),null);assert.equal(view.timetableNotice,null);assert.equal(view.pendingNotices.length,1);
 f.O.acknowledgeDutiesCapability(f.state,recipient(f),cap,{snapshotIds:view.pendingNotices.map(v=>v.id)});assert.equal(f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection.pendingNotices.length,0);
});

test('communicated cancellation after publication prevents acknowledgement revival',()=>{
 const f=ready(),old=acknowledged(f);time(f,'06:10');publish(f);time(f,'06:20');
 f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});notify(f).status='sent';
 time(f,'06:30');f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});publish(f);
 const current=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.notEqual(current.id,old.projection.timetableNotice.id);assert.equal(current.status,'pending');assert(f.O.pendingPublications(f.state,'bob').length>0);
});
test('acknowledged newer communication survives equivalent republish',()=>{
 const f=ready();publish(f);time(f,'06:10');f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.dem.id]});f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.dem.id],staffId:'bob'});
 f.state.assignments.find(a=>a.staffId==='bob'&&a.status==='draft'&&!a.remove&&!a.noRelief).className='5B';const job=notify(f),cap=capability(f,job),shown=f.O.resolveDutiesCapability(f.state,cap,f.ctx.now).projection;
 f.O.acknowledgeDutiesCapability(f.state,recipient(f),cap,{timetableNoticeId:shown.timetableNotice.id,snapshotIds:[]});time(f,'06:20');publish(f);
 const current=f.O.timetableNotice(f.state,recipient(f),{date:f.date});assert.equal(current.id,shown.timetableNotice.id);assert.equal(current.status,'acknowledged');assert.equal(f.O.pendingPublications(f.state,'bob').length,0);
});
