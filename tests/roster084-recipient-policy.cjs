'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
function setup(){const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=360;f.ctx.baselineDays=structuredClone(f.ctx.days);return f;}
const publish=f=>f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none'});
const read=f=>f.O.dailyNotifyView(f.state,f.ctx,{date:f.date});
const notify=(f,id='bob')=>f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:id,requestId:crypto.randomUUID()});
const row=f=>f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob');
function changed(){const f=setup();f.teachers[1].cells[2]=['EL','4A','Room','Group'];publish(f);return f;}
function restore(f){f.teachers[1].cells[2]=['','','',''];publish(f);}

test('untouched Stapler normalization never creates affected recipients',()=>{
 for(const cell of [['EL','4A,4B','Room',''],['EL ','4A','Room ','']]){
  const f=setup();f.teachers[0].cells[2]=cell;f.ctx.baselineDays=f.ctx.days;const original=JSON.stringify(f.teachers);
  const plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
  f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
  f.ctx=f.O.composeStaplerContext(f.state,f.ctx);publish(f);assert.equal(read(f).teachers.length,0);assert.equal(JSON.stringify(f.ctx.baselineDays[f.date].teachers),original);assert.deepEqual(S.changes(plan),[]);
 }
});
test('legacy published format-only rows are filtered on reads without rewriting publication or audit',()=>{
 const f=changed(),r=row(f);r.baseline=structuredClone(r.cells);r.baseline[2][1]='4A,4B';r.cells[2][1]='4A, 4B';r.fingerprint=JSON.stringify([r.cells,[]]);r.changed=true;r.updated=true;
 f.teachers[1].cells=structuredClone(r.cells);f.ctx.baselineDays[f.date].teachers[1].cells=structuredClone(r.baseline);const before=JSON.stringify(f.state);assert.equal(read(f).teachers.length,0);assert.equal(JSON.stringify(f.state),before);assert.equal(notify(f).notificationsQueued,0);assert.equal(notify(f,null).notificationsQueued,0);
});
test('return to baseline before any send is omitted and legacy queued intent is ineligible',()=>{
 const f=changed();notify(f);const job=f.state.outbox[0];delete job.data.communicationSnapshot;restore(f);assert.equal(row(f).changed,false);assert.equal(read(f).teachers.length,0);assert.match(f.O.notificationCurrent(f.state,job,f.ctx.now),/baseline/);assert.equal(notify(f).notificationsQueued,0);
});
test('a sent changed timetable retains its correction and unchanged correction intent is reused',()=>{
 const f=changed();notify(f);f.state.outbox[0].status='sent';f.state.outbox[0].deliveryStatus='delivered';restore(f);
 const teacher=read(f).teachers[0];assert.equal(teacher.changed,false);assert.equal(teacher.correctionRequired,true);assert.equal(teacher.rows[0].kind,'restored');assert.equal(notify(f).notificationOutcome.queued,1);
 const correction=f.state.outbox[1];assert.equal(correction.data.manualSend,true);assert.equal(notify(f).notificationOutcome.reused,1);assert.equal(f.state.outbox.length,2);assert.equal(f.O.notificationCurrent(f.state,correction,f.ctx.now),null);
 correction.status='sent';correction.deliveryStatus='read';assert.equal(notify(f).notificationOutcome.skipped,1);assert.equal(read(f).teachers[0].notification.state,'read');assert.equal(read(f).teachers[0].acknowledgement.status,'pending');assert.equal(f.state.outbox.length,2);
});
test('acknowledgement of a Publish Only change proves a later restoration needs correction',()=>{
 const f=changed(),notice=row(f).noticeId;f.O.acknowledgePublications(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@example.test'}},{date:f.date,timetableNoticeId:notice,snapshotIds:[]});assert.equal(f.state.outbox.length,0);restore(f);
 assert.equal(read(f).teachers[0].correctionRequired,true);assert.equal(read(f).teachers[0].changed,false);assert.equal(notify(f).notificationOutcome.queued,1);
});
test('queued intents are durable across repeated requests and unchanged republishing',()=>{
 const f=changed();const first=notify(f),job=f.state.outbox[0],notice=row(f).noticeId;assert.equal(first.notificationOutcome.queued,1);assert.equal(job.data.manualSend,true);
 assert.equal(notify(f).notificationsQueued,1);assert.equal(f.state.outbox.length,1);publish(f);assert.equal(row(f).noticeId,notice);assert.equal(notify(f).notificationOutcome.reused,1);assert.equal(f.state.outbox[0].id,job.id);
 job.status='sent';assert.equal(notify(f).notificationOutcome.skipped,1);assert.equal(f.state.outbox.length,1);
});
test('A to B to A sends a new correction after B rather than reusing historical A delivery',()=>{
 const f=changed();notify(f);f.state.outbox[0].status='sent';f.state.outbox[0].deliveryStatus='delivered';const firstNotice=row(f).noticeId;
 f.teachers[1].cells[2][2]='Room B';publish(f);notify(f);f.state.outbox[1].status='sent';f.state.outbox[1].deliveryStatus='delivered';
 f.teachers[1].cells[2][2]='Room';publish(f);assert.notEqual(row(f).noticeId,firstNotice);assert.equal(read(f).teachers[0].notification.state,'not-requested');assert.equal(notify(f).notificationOutcome.queued,1);assert.equal(f.state.outbox.length,3);assert.notEqual(f.state.outbox[2].id,f.state.outbox[0].id);
});
test('repeated changed to baseline cycles each require the latest correction',()=>{
 const f=changed();for(let cycle=0;cycle<2;cycle++){
  if(cycle){f.teachers[1].cells[2]=['EL','4A','Room','Group'];publish(f);}
  assert.equal(notify(f).notificationOutcome.queued,1);f.state.outbox.at(-1).status='sent';f.state.outbox.at(-1).deliveryStatus='delivered';restore(f);
  assert.equal(read(f).teachers[0].correctionRequired,true);assert.equal(notify(f).notificationOutcome.queued,1);f.state.outbox.at(-1).status='sent';f.state.outbox.at(-1).deliveryStatus='delivered';
 }
 assert.equal(f.state.outbox.length,4);
});
test('sending and uncertain outcomes block duplicate intent even after a new publication',()=>{
 for(const status of ['sending','uncertain']){const f=changed();notify(f);const job=f.state.outbox[0];job.status=status;job.attempts=1;job.attemptHistory=[{number:1,state:status}];assert.equal(notify(f).notificationOutcome.blocked,1);assert.equal(f.state.outbox.length,1);f.teachers[1].cells[2][2]='Different room';publish(f);assert.equal(notify(f).notificationOutcome.blocked,1);assert.equal(read(f).teachers[0].notification.state,status);assert.equal(read(f).teachers[0].canNotify,false);assert.deepEqual(job.attemptHistory,[{number:1,state:status}]);}
});
test('legacy duplicate queued intents have one authoritative dispatch job',()=>{
 const f=changed();notify(f);const first=f.state.outbox[0],second={...structuredClone(first),id:'old-second-intent',key:'old-second-key'};f.state.outbox.push(second);
 assert.match(f.O.notificationCurrent(f.state,first,f.ctx.now),/durable notification/);assert.equal(f.O.notificationCurrent(f.state,second,f.ctx.now),null);
 first.status='uncertain';first.attempts=1;assert.match(f.O.notificationCurrent(f.state,second,f.ctx.now),/delivery outcome/);assert.equal(notify(f).notificationOutcome.blocked,1);assert.equal(f.state.outbox.length,2);
});
test('explicit retry after definitive failure retains the durable job and audit trail',()=>{
 const f=changed();notify(f);const job=f.state.outbox[0],id=job.id;Object.assign(job,{status:'failed',deliveryStatus:'failed',error:'META_132018',providerError:{code:132018},retryable:false,attempts:3,nextAttemptAt:f.ctx.now+60000,attemptHistory:[{number:3,state:'failed',providerError:{code:132018}}]});
 assert.equal(notify(f).notificationOutcome.retried,1);assert.equal(f.state.outbox.length,1);assert.equal(job.id,id);assert.equal(job.status,'queued');assert.equal(job.attempts,3);assert.equal(job.nextAttemptAt,undefined);assert.equal(job.providerError,undefined);assert.deepEqual(job.attemptHistory,[{number:3,state:'failed',providerError:{code:132018}}]);assert(f.state.audit.some(a=>a.operation==='retryDailyNotification'&&a.notificationId===id));
});
test('legacy two-part fingerprints migrate without changing unchanged notice or acknowledgement',()=>{
 const f=changed(),r=row(f),notice=r.noticeId;r.fingerprint=JSON.stringify([r.cells,[]]);f.O.acknowledgePublications(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@example.test'}},{date:f.date,timetableNoticeId:notice,snapshotIds:[]});
 publish(f);assert.equal(row(f).noticeId,notice);assert.equal(row(f).updated,false);assert.equal(read(f).teachers[0].acknowledgement.status,'acknowledged');
 f.teachers[1].cells[2][2]='Changed venue';publish(f);assert.notEqual(row(f).noticeId,notice);assert.equal(read(f).teachers[0].acknowledgement.status,'pending');
});
test('publication comparison preserves duty instructions and timing changes',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date)[0].id],staffId:'bob'});publish(f);let notice=row(f).noticeId;
 f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'Bring the worksheet.'});publish(f);assert.notEqual(row(f).noticeId,notice);notice=row(f).noticeId;
 f.ctx.days[f.date].periods[2].start='08:01';publish(f);assert.notEqual(row(f).noticeId,notice);
});
test('legacy compact duty fingerprints retain acknowledgement and exact saved instructions',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date)[0].id],staffId:'bob'});f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'Original published instruction.'});publish(f);
 const r=row(f),parts=JSON.parse(r.fingerprint),notice=r.noticeId;r.fingerprint=JSON.stringify([parts[0],parts[2].map(a=>[a[1],a[9],a[10]])]);f.O.acknowledgePublications(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@example.test'}},{date:f.date,timetableNoticeId:notice,snapshotIds:[]});publish(f);assert.equal(row(f).noticeId,notice);assert.equal(row(f).updated,false);assert.equal(read(f).teachers.find(t=>t.staffId==='bob').acknowledgement.status,'acknowledged');
 f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'New instruction.'});publish(f);assert.notEqual(row(f).noticeId,notice);
});
test('manual publish intent and delivery projection do not create automatic morning requests',()=>{
 const f=changed();assert.equal(f.state.outbox.length,0);const result=f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'all'});assert.equal(result.notificationOutcome.queued,0);assert.equal(notify(f).notificationOutcome.queued,1);const job=f.state.outbox[0];job.holdReason='quiet-hours';job.nextEligibleAt=f.ctx.now+60000;const delivery=read(f).teachers[0].notification;assert.equal(delivery.holdReason,'quiet-hours');assert.equal(delivery.nextEligibleAt,f.ctx.now+60000);assert.equal(job.data.manualSend,true);
});
test('a newer private acknowledgement prevents skipping a return to historical sent content',()=>{
 const f=changed();notify(f);f.state.outbox[0].status='sent';f.teachers[1].cells[2][2]='Room B';publish(f);
 f.O.acknowledgePublications(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@example.test'}},{date:f.date,timetableNoticeId:row(f).noticeId,snapshotIds:[]});
 f.teachers[1].cells[2][2]='Room';publish(f);assert.equal(notify(f).notificationOutcome.queued,1);assert.equal(f.state.outbox.length,2);
});
test('explicit reuse renews an expired safe unsent request for an upcoming day',()=>{
 const f=changed();notify(f);const job=f.state.outbox[0];job.expiresAt=f.ctx.now-1;job.holdReason='quiet-hours';assert.equal(notify(f).notificationOutcome.reused,1);assert(job.expiresAt>f.ctx.now);assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);assert.equal(f.state.outbox.length,1);
});
test('equivalent assignment replacement inherits the acknowledged day evidence only after publication',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const demandId=f.O.demand(f.ctx,f.state,f.date)[0].id,assign=id=>f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[demandId],staffId:id});assign('bob');publish(f);
 const teacherCtx={...f.ctx,user:{staffId:'bob',email:'bob@example.test'}},notice=row(f).noticeId;f.O.acknowledgePublications(f.state,teacherCtx,{date:f.date,timetableNoticeId:notice,snapshotIds:[]});const originalAcks=JSON.stringify(f.state.acknowledgements);assign('charlie');assign('bob');publish(f);
 assert.equal(row(f).noticeId,notice);assert.equal(JSON.stringify(f.state.acknowledgements),originalAcks);assert.deepEqual(f.O.pendingPublications(f.state,'bob'),[]);for(const id of row(f).snapshotIds)assert(f.O.notificationIndex(f.state).ack.has('bob|'+id));
 assert(f.O.notificationHistory(f.state,teacherCtx,{}).history.filter(v=>row(f).snapshotIds.includes(v.id)).every(v=>v.acknowledgedAt));assert(f.O.view(f.state,f.ctx,{date:f.date}).acknowledgementStatus.filter(v=>v.staffId==='bob'&&row(f).snapshotIds.includes(v.id)).every(v=>v.acknowledgedAt));
 const coveredIds=[...row(f).snapshotIds];assert(f.state.audit.some(e=>e.operation==='carryTimetableAcknowledgement'&&e.timetableNoticeId===notice));f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'New unpublished instruction.'});assert.deepEqual(f.O.pendingPublications(f.state,'bob'),[]);publish(f);assert.notEqual(row(f).noticeId,notice);assert(f.O.pendingPublications(f.state,'bob').some(v=>v.customInstructions.includes('New unpublished')));assert(f.O.notificationHistory(f.state,teacherCtx,{}).history.filter(v=>coveredIds.includes(v.id)).every(v=>v.acknowledgedAt));assert.equal(JSON.stringify(f.state.acknowledgements),originalAcks);
});
test('unseen restoration has no pending acknowledgement or private notice',()=>{
 const f=changed();restore(f);const teacherCtx={...f.ctx,user:{staffId:'bob',email:'bob@example.test'}};assert.equal(f.O.timetableNotice(f.state,teacherCtx,{date:f.date}),null);assert.deepEqual(f.O.pendingPublications(f.state,'bob'),[]);assert.deepEqual(f.O.view(f.state,teacherCtx,{view:'duties',date:f.date}).timetableNotices,[]);
 const assigned=setup();assigned.O.apply(assigned.state,assigned.ctx,{operation:'saveAbsence',date:assigned.date,staffId:'alice',typeId:'mc',periods:[2]});const demandId=assigned.O.demand(assigned.ctx,assigned.state,assigned.date)[0].id;for(const staffId of ['bob','charlie']){assigned.O.apply(assigned.state,assigned.ctx,{operation:'assign',date:assigned.date,demandIds:[demandId],staffId});publish(assigned);}assert.deepEqual(assigned.O.pendingPublications(assigned.state,'bob'),[]);
});

test('legacy Stapler notices retain saved periods during compact fingerprint migration',()=>{
 const f=setup();let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;plan=S.apply(plan,{type:'move',tileId:plan.tiles[0].id,teacherId:'bob',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});const record=f.state.staplerPlans[0];Object.assign(record,{published:structuredClone(plan),publishedAt:f.ctx.iso,publishedRevision:1,confirmed:false});f.O.refreshStaplerNotifications(f.state,f.ctx);const before=record.timetableNotices.bob.noticeId,r=record.timetableNotices.bob;r.fingerprint=JSON.stringify([r.cells,[]]);f.O.refreshStaplerNotifications(f.state,f.ctx);assert.equal(record.timetableNotices.bob.noticeId,before);
});
