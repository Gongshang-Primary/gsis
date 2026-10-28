'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs');
function setup(){const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.baselineDays=structuredClone(f.ctx.days);f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});return f;}
function assign(f,staffId='bob',period=2){return f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===period).id],staffId});}
function preview(f){return f.O.read(f.state,f.ctx,{operation:'allocation',date:f.date}).publicationPreview;}
// H separates the reviewed visibility action from explicit recipient sends.
function publish(f,mode='affected',fields={}){const ids=preview(f).changedTeachers.map(t=>t.staffId),result=f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:mode,expectedPublicationRevision:f.state.dailyPublicationStates[f.date]?.revision||0,...fields});assert.equal(result.notificationsQueued,0,'Publish never sends');if(mode==='none')return result;for(const staffId of ids){const sent=f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId});result.notificationsQueued+=sent.notificationsQueued;for(const key of Object.keys(sent.notificationOutcome))result.notificationOutcome[key]+=sent.notificationOutcome[key];}return result;}
function expose(f){const row=f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob');f.O.acknowledgePublications(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg'}},{date:f.date,timetableNoticeId:row.noticeId,snapshotIds:[]});}
const notices=f=>f.state.outbox.filter(j=>j.kind==='stapler_timetable'&&j.data.dailyPublication);
function absent(f,periods){f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'bob',typeId:'mc',periods,reliefRequired:false});}

test('first-publication preview lists only teachers with present-period changes without changing saved state',()=>{
 const f=setup();assign(f);const before=JSON.stringify(f.state),p=preview(f);
 assert.deepEqual(p,{previousRevision:0,count:1,changedTeachers:[{staffId:'bob',name:'Bob'}]});assert.equal(JSON.stringify(f.state),before);
 assert.equal(publish(f).notificationsQueued,1);assert.deepEqual(notices(f).map(j=>j.recipientId),['bob']);
 assert.deepEqual(preview(f),{previousRevision:1,count:0,changedTeachers:[]});assert.equal(publish(f).notificationsQueued,0);assert.equal(notices(f).length,1,'version-only changes never resend');
});
test('reassignment explicitly notifies gaining and losing teachers after the old publication was acknowledged',()=>{
 const f=setup();assign(f);publish(f,'none');expose(f);assert.equal(notices(f).length,0);assign(f,'charlie');
 assert.deepEqual(preview(f),{previousRevision:1,count:2,changedTeachers:[{staffId:'bob',name:'Bob'},{staffId:'charlie',name:'Charlie'}]});
 assert.equal(publish(f).notificationsQueued,2);assert.deepEqual(notices(f).map(j=>j.recipientId),['bob','charlie']);
 for(const job of notices(f))assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);
 const bob=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date}).teachers.find(t=>t.staffId==='bob');assert(bob.correctionRequired);assert(bob.rows.some(r=>r.period===2&&r.kind==='restored'));
 publish(f,'none');assert.equal(f.O.notificationCurrent(f.state,notices(f)[0],f.ctx.now),null,'an unchanged later publication preserves the queued removal correction');
});
test('explicit unassignment is previewed and notified without touching the manual decision',()=>{
 const f=setup();assign(f);publish(f,'none');expose(f);f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===2).id]});
 assert.deepEqual(preview(f).changedTeachers,[{staffId:'bob',name:'Bob'}]);const manual=JSON.stringify(f.state.manualDecisions);assert.equal(publish(f).notificationsQueued,1);assert.equal(JSON.stringify(f.state.manualDecisions),manual);assert.equal(f.O.notificationCurrent(f.state,notices(f)[0],f.ctx.now),null);
});
test('changed absent periods and fully absent teachers are excluded while present-period removal remains eligible',()=>{
 for(const periods of [[2],Array.from({length:17},(_,i)=>i),[3]]){const f=setup();assign(f);publish(f,'none');expose(f);absent(f,periods);assign(f,'charlie');const expected=periods.includes(2)?['charlie']:['bob','charlie'];assert.deepEqual(preview(f).changedTeachers.map(t=>t.staffId),expected);publish(f);assert.deepEqual(notices(f).map(j=>j.recipientId),expected);}
 const f=setup();assign(f);publish(f,'none');expose(f);assign(f,'charlie');publish(f);delete notices(f).find(j=>j.recipientId==='bob').data.communicationSnapshot;absent(f,[2]);assert.match(f.O.notificationCurrent(f.state,notices(f).find(j=>j.recipientId==='bob'),f.ctx.now),/present|baseline/,'later attendance must still suppress a removal during absence');
});
test('changes only in an absent period do not notify a teacher with an unchanged present duty',()=>{
 const f=setup();assign(f,'bob',2);assign(f,'bob',3);publish(f,'none');absent(f,[2]);assign(f,'charlie',2);
 assert.deepEqual(preview(f).changedTeachers.map(t=>t.staffId),['charlie']);publish(f);assert.deepEqual(notices(f).map(j=>j.recipientId),['charlie']);
});
test('restored attendance compares new present duties with baseline and keeps present-period removals',()=>{
 for(const action of ['attendance-only','new-duty','remove-present-duty']){
  const f=setup();absent(f,[2]);if(action==='remove-present-duty')assign(f,'bob',3);publish(f,'none');if(action==='remove-present-duty')expose(f);
  f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',date:f.date,ids:[f.state.absences.find(a=>a.staffId==='bob').id],confirm:true});
  if(action==='new-duty')assign(f,'bob',2);
  if(action==='remove-present-duty')f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===3).id]});
  const expected=action==='attendance-only'?[]:['bob'];assert.deepEqual(preview(f).changedTeachers.map(t=>t.staffId),expected,action);publish(f);assert.deepEqual(notices(f).map(j=>j.recipientId),expected,action);
  for(const job of notices(f))assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null,action);
 }
});
test('unrelated attendance changes retain an outstanding removal but never revive a delivered or acknowledged correction',()=>{
 for(const status of ['queued','failed','sent','acknowledged']){
  const f=setup();assign(f);publish(f,'none');expose(f);assign(f,'charlie');publish(f);const job=notices(f).find(j=>j.recipientId==='bob'),noticeId=job.data.timetableNoticeId;
  if(status==='acknowledged')f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,staffId:'bob'}},{operation:'acknowledge',date:f.date,timetableNoticeId:noticeId});else job.status=status;
  absent(f,[3]);publish(f,'none');const row=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date}).teachers.find(t=>t.staffId==='bob');
  if(['queued','failed'].includes(status)){
   assert(row?.canNotify,status+' correction remains available');assert(row.rows.some(r=>r.period===2&&r.kind==='restored'),status+' retains its restored-period detail');assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null,status+' intent remains current');
   f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});assert.equal(notices(f).filter(j=>j.recipientId==='bob').length,1,status+' reuses the original intent');job.status='sent';
   absent(f,[4]);publish(f,'none');assert.notEqual(f.O.dailyNotifyView(f.state,f.ctx,{date:f.date}).teachers.find(t=>t.staffId==='bob')?.canNotify,true,'delivered correction does not survive another unrelated publication');
  }else assert.notEqual(row?.canNotify,true,status+' correction is not offered again');
  const count=notices(f).length;publish(f);assert.equal(notices(f).length,count,status+' unchanged update does not resend');
 }
});
test('stale previous-publication revision rejects atomically before publication or notification',()=>{
 const f=setup();assign(f);const stale=preview(f).previousRevision;publish(f,'none');const before=JSON.stringify(f.state);
 assert.throws(()=>publish(f,'affected',{expectedPublicationRevision:stale}),e=>e.code==='PUBLICATION_CONFLICT');assert.equal(JSON.stringify(f.state),before);
});
test('a pending or uncertain earlier send cannot be duplicated by the targeted follow-up',()=>{
 for(const status of ['sending','uncertain']){const f=setup();assign(f);publish(f);const job=notices(f)[0];job.status=status;assign(f,'charlie');assert.equal(publish(f).notificationOutcome.blocked,1);assert.equal(notices(f).filter(j=>j.recipientId==='bob').length,1);assert.equal(job.status,status);}
});
test('an unrelated absence cannot reset an in-flight removal notification or create another provider intent',()=>{
 for(const status of ['sending','uncertain']){const f=setup();assign(f);publish(f,'none');expose(f);assign(f,'charlie');publish(f);const job=notices(f).find(j=>j.recipientId==='bob');job.status=status;absent(f,[3]);publish(f,'none');assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);const result=f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});assert.equal(result.notificationOutcome.blocked,1);assert.equal(notices(f).filter(j=>j.recipientId==='bob').length,1);assert.equal(job.status,status);}
});
test('narrow saved-cell responses refresh the preview and failed removal sends remain recoverable',()=>{
 const f=setup();assign(f);publish(f,'none');expose(f);assign(f,'charlie');
 const patch=f.O.allocationCellView(f.state,f.ctx,{date:f.date,revision:f.state.revision});assert.deepEqual(patch.publicationPreview,preview(f));
 publish(f);const job=notices(f).find(j=>j.recipientId==='bob');job.status='failed';job.error='Provider temporarily unavailable';
 const result=f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob',expectedPublicationRevision:2});assert.equal(result.notificationOutcome.retried,1);assert.equal(job.status,'queued');assert.equal(notices(f).filter(j=>j.recipientId==='bob').length,1);assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);
});
test('a newly published removal is not suppressed by an older accepted notice with identical content',()=>{
 const f=setup(),remove=()=>f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===2).id]});
 assign(f);publish(f);notices(f).at(-1).status='sent';remove();publish(f);const earlier=notices(f).at(-1);earlier.status='sent';
 assign(f);publish(f,'none');expose(f);remove();assert.equal(preview(f).count,1);assert.equal(publish(f).notificationsQueued,1);
 assert.equal(notices(f).length,3);assert.notEqual(notices(f).at(-1).id,earlier.id);assert.equal(f.O.notificationCurrent(f.state,notices(f).at(-1),f.ctx.now),null);
 assert.equal(publish(f).notificationsQueued,0,'unchanged publication still cannot duplicate this new correction');
});
test('targeted publication survives a lost response with one durable receipt and no duplicate intent',()=>{
 const h=adapter(),f=setup();assign(f);publish(f,'none');expose(f);assign(f,'charlie');Object.assign(h.ctx,f.ctx);h.setState(f.state);
 const command={operation:'publish',view:'allocation',date:h.date,revision:h.state().revision,allocationRevision:h.state().dayRevisions[h.date],notifyMode:'affected',expectedPublicationRevision:1,requestId:'09300000-0000-4000-8000-000000000002'};
 h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain response/);const before=h.state(),writes=h.calls.writes;assert.equal(before.outbox.length,0,'lost Publish response cannot send');assert.equal(h.call(command).replayed,true);assert.equal(h.calls.writes,writes);assert.deepEqual(h.state().outbox,before.outbox);const send={operation:'notifyDaily',view:'dailyNotify',date:h.date,revision:before.revision,expectedPublicationRevision:2,requestId:'09300000-0000-4000-8000-000000000003'};h.loseNextResponse();assert.throws(()=>h.call(send),/Uncertain response/);const sent=h.state(),sentWrites=h.calls.writes;assert.deepEqual(sent.outbox.filter(j=>j.kind==='stapler_timetable').map(j=>j.recipientId),['bob','charlie']);assert.equal(h.call(send).replayed,true);assert.equal(h.calls.writes,sentWrites);assert.deepEqual(h.state().outbox,sent.outbox);
});
