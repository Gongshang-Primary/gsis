const assert=require('node:assert/strict'),test=require('node:test'),adapter=require('./roster701-adapter.cjs');

function setup(time='05:07:00'){
 const h=adapter();h.ctx.now=Date.parse(h.date+'T'+time+'+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));
 h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 const s=h.state();h.O.apply(s,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2],typeId:'mc'});
 h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:[h.O.demand(h.ctx,s,h.date)[0].id],staffId:'bob'});
 h.O.apply(s,h.ctx,{operation:'publish',date:h.date,allocationRevision:s.dayRevisions[h.date],notifyMode:'none'});h.setState(s);return h;
}
const service=(h,operation,p={})=>h.scope.rosterServiceDispatch_({input:{operation,allowedTemplateKeys:['stapler_timetable','relief_assignment'],...p}});
function manual(h,extra={}){const s=h.state();return h.call({operation:'notifyDaily',revision:s.revision,date:h.date,view:'dailyNotify',expectedPublicationRevision:s.dailyPublicationStates[h.date].revision,requestId:crypto.randomUUID(),staffId:'bob',...extra});}
function automatic(h,{legacyManual=false,kind='stapler_timetable'}={}){
 const s=h.state(),publication=s.dailyPublicationStates[h.date],row=publication.teachers.find(t=>t.staffId==='bob');
 const data=kind==='stapler_timetable'?{templateKey:kind,dailyPublication:true,publicationRevision:publication.revision,fingerprint:row.fingerprint,timetableNoticeId:row.noticeId,summary:'Published changes'}:{templateKey:'relief_assignment',snapshotIds:s.publicationSnapshots.filter(v=>v.staffId==='bob').map(v=>v.id),manualSend:true,summary:'Automatic assignment'};
 h.O.queue(s,h.ctx,kind,'bob',h.date,data,null,'daily:'+h.date+':legacy:bob');
 if(legacyManual)s.audit.push({id:'legacy-audit',operation:'notifyDaily',date:h.date,at:h.ctx.iso,actor:h.ctx.user.email,staffIds:['bob'],publicationRevision:publication.revision});
 h.setState(s);return s.outbox.at(-1).id;
}

test('server-authorized individual Notify bypasses quiet hours at claim and preparation',()=>{
 const h=setup();assert.equal(manual(h).notificationsQueued,1);const row=service(h,'claimNotifications').notifications[0];assert(row,'manual notice must be claimed during quiet hours');assert.equal(row.data.manualSend,true);assert.equal(service(h,'prepareNotification',{id:row.id,claimId:row.claimId}).notification.id,row.id);
});

test('server-authorized Notify All and explicit Notify after Publish bypass quiet hours',()=>{
 const all=setup();manual(all,{staffId:undefined});assert.equal(service(all,'claimNotifications').notifications.length,1);
 const published=setup(),s=published.state();published.O.apply(s,published.ctx,{operation:'publish',date:published.date,allocationRevision:s.dayRevisions[published.date],notifyMode:'all',requestId:'publish-request'});assert.equal(s.outbox.length,0);published.O.notifyDaily(s,published.ctx,{date:published.date});published.setState(s);assert.equal(service(published,'claimNotifications').notifications.length,1);
});

test('legacy daily notices require a matching persisted manual audit to bypass quiet hours',()=>{
 const authorized=setup(),id=automatic(authorized,{legacyManual:true});assert.equal(service(authorized,'claimNotifications').notifications[0]?.id,id);
 const unproven=setup();automatic(unproven);assert.equal(service(unproven,'claimNotifications',{manualSend:true,bypassQuietHours:true}).notifications.length,0,'service request flags cannot grant provenance to a job');
});

test('automatic jobs retain a durable quiet hold and resume at the normal boundary',()=>{
 const h=setup(),id=automatic(h);assert.equal(service(h,'claimNotifications').notifications.length,0);let row=h.state().outbox.find(j=>j.id===id);assert.equal(row.status,'queued');assert.equal(row.attempts,0);assert.equal(row.holdReason,'quiet-hours');assert.equal(row.nextEligibleAt,Date.parse(h.date+'T05:45:00+08:00'));
 const writes=h.calls.writes;service(h,'claimNotifications');assert.equal(h.calls.writes,writes,'unchanged hold does not write repeatedly');
 h.ctx.now=Date.parse(h.date+'T05:45:00+08:00');const claimed=service(h,'claimNotifications').notifications[0];assert.equal(claimed.id,id);assert.equal(claimed.holdReason,undefined);assert.equal(claimed.nextEligibleAt,undefined);
});

test('automatic assignment notices cannot acquire manual privileges from an unrelated marker',()=>{
 const h=setup(),id=automatic(h,{kind:'relief_publication'});assert.equal(service(h,'claimNotifications').notifications.length,0);assert.equal(h.state().outbox.find(j=>j.id===id).holdReason,'quiet-hours');
});

test('an automatic claim crossing the quiet boundary is held before preparation',()=>{
 const h=setup(),id=automatic(h);h.ctx.now=Date.parse(h.date+'T21:29:00+08:00');const row=service(h,'claimNotifications').notifications[0];assert.equal(row.id,id);
 h.ctx.now=Date.parse(h.date+'T21:30:00+08:00');assert.equal(service(h,'prepareNotification',{id:row.id,claimId:row.claimId}).notification,null);const held=h.state().outbox.find(j=>j.id===id);assert.equal(held.status,'queued');assert.equal(held.attempts,0);assert.equal(held.attemptHistory[0].state,'not-sent');assert.equal(held.holdReason,'quiet-hours');assert.equal(held.nextEligibleAt,Date.parse('2026-10-15T05:45:00+08:00'));
});

test('a publication restored before dispatch cancels an unnecessary legacy manual notice',()=>{
 const h=setup(),id=automatic(h,{legacyManual:true}),s=h.state();
 h.O.apply(s,{...h.ctx,draftBatch:true},{operation:'unassign',date:h.date,demandIds:[h.O.demand(h.ctx,s,h.date)[0].id]});
 h.O.apply(s,h.ctx,{operation:'publish',date:h.date,allocationRevision:s.dayRevisions[h.date],notifyMode:'none'});h.setState(s);
 assert.equal(h.O.dailyNoticeState(s,h.date,'bob').eligible,false);
 const audit=JSON.stringify(s.audit);assert.equal(service(h,'claimNotifications').notifications.length,0);const saved=h.state();assert.equal(saved.outbox.find(j=>j.id===id).status,'cancelled');assert.match(saved.outbox.find(j=>j.id===id).error,/no.*(?:change|notice)|unnecessary|baseline/i);assert.equal(JSON.stringify(saved.audit),audit);
});

test('reusing a queued job retains the dispatch count without duplicating its durable intent',()=>{
 const h=setup();manual(h);const before=h.state(),id=before.outbox[0].id,result=manual(h);
 assert.equal(result.notificationOutcome.reused,1);assert.equal(result.notificationsQueued,1);assert.equal(h.state().outbox.length,before.outbox.length);assert.equal(h.state().outbox[0].id,id);
 assert.equal(service(h,'claimNotifications').notifications[0]?.id,id);
});

test('an explicit failed-job retry retains the dispatch count and prior attempt evidence',()=>{
 const h=setup();manual(h);const row=service(h,'claimNotifications').notifications[0];service(h,'prepareNotification',{id:row.id,claimId:row.claimId});
 service(h,'notificationResult',{id:row.id,claimId:row.claimId,state:'failed',error:'META_132018',providerError:{code:132018}});
 const before=h.state(),failed=before.outbox.find(j=>j.id===row.id);assert.equal(failed.status,'failed');const result=manual(h),after=h.state().outbox.find(j=>j.id===row.id);
 assert.equal(result.notificationOutcome.retried,1);assert.equal(result.notificationsQueued,1);assert.equal(h.state().outbox.length,before.outbox.length);assert.equal(after.status,'queued');assert.equal(after.attempts,1);assert.deepEqual(after.attemptHistory,failed.attemptHistory);assert.equal(service(h,'claimNotifications').notifications[0]?.id,row.id);
});

test('legacy preparation rechecks publication eligibility and preserves uncertain snapshot attempts',()=>{
 const h=setup();automatic(h,{legacyManual:true});const row=service(h,'claimNotifications').notifications[0];assert(row);const s=h.state(),teacher=s.dailyPublicationStates[h.date].teachers.find(t=>t.staffId==='bob');teacher.fingerprint='superseded';h.setState(s);assert.equal(service(h,'prepareNotification',{id:row.id,claimId:row.claimId}).notification,null);assert.equal(h.state().outbox.find(j=>j.id===row.id).status,'cancelled');
 const uncertain=setup();manual(uncertain);const u=uncertain.state(),job=u.outbox[0];job.status='uncertain';job.attempts=1;job.error='SEND_RESULT_UNCONFIRMED';job.attemptHistory=[{number:1,state:'uncertain'}];uncertain.setState(u);assert.equal(service(uncertain,'claimNotifications').notifications.length,0);assert.equal(uncertain.state().outbox[0].status,'uncertain');assert.deepEqual(uncertain.state().outbox[0].attemptHistory,[{number:1,state:'uncertain'}]);
});
