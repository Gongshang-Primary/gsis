const assert=require('node:assert/strict'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
function setup(){const h=adapter();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});return h;}
const command=(h,operation,extra={})=>({operation,date:h.date,view:operation==='notifyDaily'?'dailyNotify':'allocation',revision:h.state().revision,requestId:crypto.randomUUID(),...extra});
function publication(h){
 const s=h.state(),now=Date.parse(h.date+'T06:00:00+08:00'),ctx={...h.ctx,now,iso:new Date(now).toISOString(),minute:360};
 h.O.apply(s,ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2],typeId:'mc'});
 h.O.apply(s,ctx,{operation:'assign',date:h.date,demandIds:[h.O.demand(ctx,s,h.date)[0].id],staffId:'bob'});
 h.O.apply(s,ctx,{operation:'publish',date:h.date,allocationRevision:s.dayRevisions[h.date],notifyMode:'none'});h.setState(s);
}
const checks=[];function test(name,fn){try{fn();checks.push(name);console.log('PASS',name);}catch(e){console.error('FAIL',name);throw e;}}
test('allocation reads expose a selected-day token',()=>{const h=setup(),r=h.call({operation:'read',date:h.date,view:'allocation'});assert.match(r.dayToken,/^[a-f0-9]{64}$/);});
test('notify accepts unrelated day writes but rejects changed reviewed publication',()=>{const h=setup();publication(h);const p=command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1});const s=h.state();s.revision++;s.dayRevisions['2026-10-15']=9;h.setState(s);const r=h.call(p);assert.equal(r.notificationsQueued,1);assert.equal(h.state().outbox.length,1);assert.equal(h.call(p).replayed,true);const next=h.state();next.dailyPublicationStates[h.date].revision=2;h.setState(next);assert.throws(()=>h.call({...command(h,'notifyDaily'),expectedPublicationRevision:1}),e=>e.status===409&&e.code==='PUBLICATION_CONFLICT');});
test('notify preparation runs outside the writer lock and preserves concurrent callback data',()=>{const h=setup();publication(h);const base=h.scope.rosterOperationsContext_;let injected=false;h.scope.rosterOperationsContext_=(...args)=>{assert.equal(h.locked(),false,'reference reads must not hold writer lock');if(!injected){injected=true;const s=h.state();s.deliveryEvents.push('provider-event');h.setState(s);}return base(...args);};h.call(command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1}));assert.deepEqual(h.state().deliveryEvents,['provider-event']);});
test('same day source change is rejected even if dayRevisions was not bumped',()=>{const h=setup(),read=h.call({operation:'read',date:h.date,view:'allocation'}),p=command(h,'autoAllocate',{expectedDayToken:read.dayToken});const s=h.state();s.adhoc.push({id:'new-adhoc',staffId:'bob',date:h.date,periods:[2]});s.revision++;h.setState(s);assert.throws(()=>h.call(p),e=>e.status===409&&e.code==='DAY_CONFLICT');});
test('paused next-day scheduler persists receipt without domain revision churn',()=>{
 const h=setup(),tomorrow='2026-10-15';h.ctx.minute=960;h.ctx.now=Date.parse(h.date+'T16:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.days[tomorrow]=structuredClone(h.ctx.days[h.date]);publication(h);
 // The day's employment report was already captured before the evening tick.
 const settled=h.state(),checkpoint=h.scope.GSISRosterAllocation.quotaCheckpoint(h.ctx);settled.quotaCheckpoints={[checkpoint.week]:{...checkpoint,status:'ready',captured:0,at:h.ctx.iso}};h.O.queueDailyEmployment(settled,h.ctx,h.date);h.setState(settled);
 const before=h.state(),context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=(...args)=>{assert.equal(h.locked(),false);return context(...args);};
 const r=h.scope.rosterServiceDispatch_({input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}});assert.equal(r.allocationPaused,true);assert.equal(h.state().revision,before.revision);assert.ok(Object.keys(h.state().scheduleReceipts).length);assert.equal(h.call(command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1})).notificationsQueued,1);
});
function twoDays(){
 const h=setup(),tomorrow='2026-10-15';h.ctx.days[tomorrow]=structuredClone(h.ctx.days[h.date]);
 const s=h.state();s.accountingYears['2026']={verified:true};
 for(const date of [h.date,tomorrow])h.O.apply(s,h.ctx,{operation:'saveAbsence',date,staffId:'alice',periods:date===h.date?[2]:[2,3],typeId:'mc'});
 const dem=h.O.demand(h.ctx,s,h.date)[0];h.O.apply(s,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[dem.id]});h.setState(s);
 // Production context loads the selected dates; an all-dates fixture would make
 // saveAbsence legitimately bump tomorrow as well and would mask this boundary.
 const context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=(req,...args)=>{const ctx=context(req,...args),date=req.input.date||h.date;return {...ctx,days:{[date]:ctx.days[date]}};};
 return {h,tomorrow};
}
function reviewed(h,operation,date=h.date,extra={}){const r=h.call({operation:'read',view:'allocation',date});return command(h,operation,{date,expectedDayToken:r.dayToken,allocationRevision:r.allocationRevision,...extra});}
for(const users of [1,10,30])test(users+' notification users and callbacks complete while tomorrow allocator has a computed proposal',()=>{
 const {h,tomorrow}=twoDays(),p=reviewed(h,'autoAllocate',tomorrow),requests=[];let allocations=0,injected=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){
  const result=h.O.apply(s,ctx,input);
  if(input.operation==='autoAllocate'){
   allocations++;assert.equal(h.locked(),false,'actual solver must finish without the writer lock');assert.equal(result.run.coverage,2);
   if(!injected){injected=true;
    const published=h.call(reviewed(h,'publish',h.date,{notifyMode:'none'}));assert.equal(published.publishedRevision,1);
    let job;
    for(let n=0;n<users;n++){
     const q=command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1}),identity={email:'smc'+n+'@gsps.edu.sg'};requests.push({q,identity});
     const response=h.call(q,identity);assert.equal(response.notificationsQueued,1);assert.equal(response.notificationOutcome[n?'reused':'queued'],1);
     const current=h.state().outbox.filter(j=>j.data?.dailyPublication&&j.recipientId==='bob');assert.equal(current.length,1);if(job)assert.equal(current[0].id,job.id);job=current[0];
    }
    const service=(operation,extra)=>h.scope.rosterServiceDispatch_({input:{operation,allowedTemplateKeys:['stapler_timetable'],...extra}});
    const claim=service('claimNotifications',{limit:1}).notifications[0];assert.equal(claim.id,job.id);
    assert.equal(service('prepareNotification',{id:job.id,claimId:claim.claimId}).notification.id,job.id);
    service('notificationResult',{id:job.id,claimId:claim.claimId,state:'sent',messageId:'wamid.current'});
    for(let n=0;n<users;n++)service('notificationDelivery',{eventId:'delivered-'+n,notificationId:job.id,messageId:'wamid.current',state:'delivered',recipientId:job.mobile});
    assert.equal(service('claimNotifications').notifications.length,0,'same-content user requests produce only one send');
   }
  }return result;
 }};
 const result=h.call(p);assert.equal(result.run.coverage,2);assert.equal(allocations,2,'today publication changes weekly inputs, so the proposal is recomputed outside the lock');
 const s=h.state();assert.equal(s.receipts.length,users+2);assert.equal(new Set(s.receipts.map(r=>r.id)).size,s.receipts.length);assert.equal(s.audit.filter(a=>a.operation==='notifyDaily').length,users);
 const jobs=s.outbox.filter(j=>j.data?.dailyPublication);assert.equal(jobs.length,1);assert.equal(s.deliveryEvents.length,users);assert(jobs.every(j=>j.status==='sent'&&j.deliveryStatus==='delivered'&&j.attempts===1&&j.attemptHistory.length===1));
 assert.equal(s.assignments.filter(a=>a.date===h.date&&a.status==='published').length,1);assert.equal(s.assignments.filter(a=>a.date===tomorrow&&a.status==='draft').length,2);
 const writes=h.calls.writes;for(const {q,identity} of requests)assert.equal(h.call(q,identity).replayed,true);assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,writes,'exact retries never duplicate intents or allocation');assert.equal(h.locked(),false);
});
test('same-day interleaving rejects an already computed stale allocation without losing the new absence',()=>{
 const {h,tomorrow}=twoDays(),p=reviewed(h,'autoAllocate',tomorrow);let injected=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const r=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'&&!injected){injected=true;h.call(command(h,'saveAbsence',{date:tomorrow,staffId:'bob',periods:[2],typeId:'mc'}));}return r;}};
 assert.throws(()=>h.call(p),e=>e.status===409&&e.code==='DAY_CONFLICT');assert(h.state().absences.some(a=>a.date===tomorrow&&a.staffId==='bob'));assert.equal(h.state().assignments.filter(a=>a.date===tomorrow).length,0);assert.equal(h.state().receipts.length,1);
});
test('changed policy rejects a computed proposal and retains the independently saved policy',()=>{
 const {h,tomorrow}=twoDays(),p=reviewed(h,'autoAllocate',tomorrow);let injected=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const r=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'&&!injected){injected=true;const latest=h.state();latest.systemConfig.maxDailyPeriods=8;latest.revision++;h.setState(latest);}return r;}};
 assert.throws(()=>h.call(p),e=>e.status===409&&e.code==='DAY_CONFLICT');assert.equal(h.state().systemConfig.maxDailyPeriods,8);assert.equal(h.state().assignments.filter(a=>a.date===tomorrow).length,0);
});
test('allocator exact retry after an uncertain durable commit preserves one proposal and receipt',()=>{
 const {h,tomorrow}=twoDays(),p=reviewed(h,'autoAllocate',tomorrow);h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain/);const committed=h.state();assert.equal(h.call(p).replayed,true);assert.deepEqual(h.state(),committed);assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);
});
test('notification-only commits and callbacks merge into an allocator proposal without rerunning the solver',()=>{
 const {h,tomorrow}=twoDays();h.call(reviewed(h,'publish',h.date,{notifyMode:'none'}));const p=reviewed(h,'autoAllocate',tomorrow);let runs=0;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const r=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'){
  runs++;assert.equal(h.locked(),false);h.call(command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1}));
  const job=h.state().outbox.find(j=>j.data?.dailyPublication);h.scope.rosterServiceDispatch_({input:{operation:'notificationDelivery',eventId:'live-delivery',notificationId:job.id,messageId:'wamid.live',state:'read',recipientId:job.mobile}});
 }return r;}};
 h.call(p);assert.equal(runs,1);assert.equal(h.state().receipts.length,3);assert.deepEqual(h.state().deliveryEvents,['live-delivery']);const job=h.state().outbox.find(j=>j.data?.dailyPublication);assert.equal(job.status,'sent');assert.equal(job.deliveryStatus,'read');assert.equal(job.messageId,'wamid.live');
});
test('new relief on another day rechecks the weekly employment cap before saving the selected-day proposal',()=>{
 const {h,tomorrow}=twoDays();for(const dd of Object.values(h.ctx.days))for(const t of dd.teachers)Object.assign(t,{R:1,periodCap:1,capConfigured:true,capVerified:true,capWorkload:0,capHeadroom:1});
 const p=reviewed(h,'autoAllocate',tomorrow),coverage=[];let injected=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const r=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'){
  coverage.push(r.run.coverage);if(!injected){injected=true;const chosen=s.assignments.find(a=>a.date===tomorrow&&a.status==='draft').staffId,absence=h.state().absences.find(a=>a.date===h.date);
   h.call(command(h,'saveAbsence',{id:absence.id,staffId:'alice',typeId:'mc',periods:[2,3]}));
   const demand=h.O.demand(h.ctx,h.state(),h.date).find(d=>d.period===3);h.call(command(h,'assign',{staffId:chosen,demandIds:[demand.id]}));
  }
 }return r;}};
 const result=h.call(p);assert.deepEqual(coverage,[2,1]);assert.equal(result.run.coverage,1);const s=h.state();for(const id of ['bob','charlie','dora'])assert(s.assignments.filter(a=>a.staffId===id&&['draft','published'].includes(a.status)).length<=1);
});
test('real source-manifest guard detects baseline and Deploy changes without loading teacher data',()=>{
 const h=setup(),entries=h.scope.rosterIndex_().entries,source={versionId:'deploy-1',revision:7,commit:'published-7'},ctx={...h.ctx,timetableEntries:entries,quotaRequested:true};ctx.days[h.date].quotaSource=source;
 let index={pendingFieldCommit:false},published={id:source.versionId,revision:7,commit:'published-7'},reads=0;h.scope.book_=()=>({});h.scope.index_=()=>{reads++;return index;};h.scope.publishedEntry_=()=>published;
 h.scope.rosterModel_=()=>{throw Error('Manifest validation must not load model cells');};h.scope.reliefRosterQuota_=()=>{throw Error('Manifest validation must not load quota rows');};
 assert.equal(h.referenceStamp(ctx),h.scope.rosterOperationsReferenceKey_(ctx));assert.equal(reads,1);
 published={...published,revision:8};assert.throws(()=>h.referenceStamp(ctx),e=>e.code==='PREPARED_RETRY');published={...published,revision:7};
 index.pendingFieldCommit=true;assert.throws(()=>h.referenceStamp(ctx),e=>e.code==='PREPARED_RETRY');index.pendingFieldCommit=false;
 h.scope.rosterIndex_=()=>({entries:[{...entries[0],modelFile:'replacement'}]});assert.throws(()=>h.referenceStamp(ctx),e=>e.code==='PREPARED_RETRY');
});
test('source change between proposal and commit rebuilds outside the lock before accepting the request',()=>{
 const {h,tomorrow}=twoDays(),p=reviewed(h,'autoAllocate',tomorrow);let changed=false,attempts=0;const context=h.scope.rosterOperationsContext_;
 h.scope.rosterOperationsContext_=(...args)=>{assert.equal(h.locked(),false);const ctx=context(...args);ctx.quotaRequested=true;ctx.days[tomorrow].quotaSource={versionId:'deploy',revision:changed?2:1,commit:changed?'c2':'c1'};return ctx;};
 h.scope.book_=()=>({});h.scope.index_=()=>({});h.scope.publishedEntry_=()=>({id:'deploy',revision:changed?2:1,commit:changed?'c2':'c1'});h.scope.rosterOperationsReferenceStamp_=h.referenceStamp;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const r=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'){attempts++;changed=true;}return r;}};
 assert.equal(h.call(p).run.coverage,2);assert.equal(attempts,2);assert.equal(h.calls.writes,1);
});
test('old clients without a day token retain the strict global revision guard',()=>{
 const h=setup(),p=command(h,'autoAllocate'),s=h.state();s.revision++;h.setState(s);assert.throws(()=>h.call(p),e=>e.status===409&&e.code==='DAY_CONFLICT');assert.equal(h.calls.writes,0);
});
test('independently discovered identical notification keys cannot merge into duplicate intents',()=>{
 const h=setup(),base=h.state(),next=structuredClone(base),current=structuredClone(base);next.outbox.push({id:'proposal',key:'one-intent'});current.outbox.push({id:'winner',key:'one-intent'});
 assert.throws(()=>h.scope.rosterOperationsMergePrepared_(base,next,current),e=>e.code==='PREPARED_RETRY');
});
test('default-today publication records the actual merged document revision',()=>{
 const {h}=twoDays();h.call(reviewed(h,'publish',h.date,{notifyMode:'none'}));const p=reviewed(h,'publish',h.date,{notifyMode:'none'});delete p.date;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const result=h.O.apply(s,ctx,input);if(input.operation==='publish')h.call(command(h,'notifyDaily',{staffId:'bob',expectedPublicationRevision:1}));return result;}};
 h.call(p);const s=h.state();assert.equal(s.dailyPublicationStates[h.date].sourceRevision,s.revision);assert.equal(s.dailyPublicationStates[h.date].revision,2);assert.equal(s.receipts.length,3);
});
console.log(checks.length+' day transaction checks passed');
