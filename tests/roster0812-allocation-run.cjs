'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs');
function setup(){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);
 Object.assign(h.ctx,{minute:360,now:Date.parse(h.date+'T06:00:00+08:00')});h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.dutySources={[h.date]:{available:true,staffIds:['alice'],source:{versionId:'fixture'}}};
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>{properties.set(key,value);},getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 // These tests isolate allocator lifecycle after the weekly quota checkpoint.
 const checkpoint=h.scope.GSISRosterAllocation.quotaCheckpoint(h.ctx),state=h.state();state.quotaCheckpoints={...state.quotaCheckpoints,[checkpoint.week]:{...checkpoint,status:'ready',at:h.ctx.iso}};state.systemConfig.scheduledAllocationEnabled=true;state.accountingYears['2026']={verified:true};h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 const call=(input,contacts=c)=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input},contacts),command=()=>({operation:'autoAllocate',date:h.date,view:'allocation',requestId:crypto.randomUUID(),revision:h.state().revision}),row=()=>h.scope.rosterAllocationRunRead_(h.date),cancel=()=>call({operation:'cancelAllocationRun',date:h.date,runId:row().id,requestId:crypto.randomUUID()}),status=()=>call({operation:'allocationVersion',date:h.date,statusOnly:true});
 return {...h,c,properties,call,command,row,cancel,status};
}
let checks=0;function test(name,fn){try{fn();checks++;console.log('PASS',name);}catch(e){console.error('FAIL',name);throw e;}}
test('run starts before context loading, calculates outside lock and exactly replays one receipt',()=>{
 const h=setup(),p=h.command(),context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=(...args)=>{assert(!h.locked());assert(h.row());return context(...args);};
 const result=h.call(p);assert.equal(result.run.coverage,2);assert.equal(h.status().allocatorRun.requestId,p.requestId);assert.equal(h.row().state,'completed');assert.equal(h.row().actorName,'Alice');assert.equal(h.row().trigger,'manual');assert.equal(h.calls.writes,1);
 assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);assert.equal(h.cancel().cancellation,'too-late');assert.equal(h.state().receipts.length,1);
});
test('30 status-only viewers read no operational document or timetable index and require current authority',()=>{
 const h=setup(),run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c),reads=h.calls.reads;
 h.scope.rosterIndex_=()=>{throw Error('Index must not be loaded by status-only poll');};
 for(let n=0;n<30;n++){assert.equal(h.status().allocatorRun.id,run.id);assert.equal(h.status().allocatorRun.canCancel,true);}
 assert.equal(h.calls.reads,reads);assert.throws(()=>h.call({operation:'allocationVersion',date:h.date,statusOnly:true},{...h.c,user:{...h.c.user,rosterSMC:false,rosterAdmin:false}}),e=>e.status===403);
 assert.throws(()=>h.call({operation:'cancelAllocationRun',date:h.date,runId:run.id,requestId:crypto.randomUUID()},{...h.c,user:{...h.c.user,rosterSMC:false,rosterAdmin:false}}),e=>e.status===403);
});
test('concurrent start is rejected and accepted cancellation fences a fully computed proposal without undoing a manual save',()=>{
 const h=setup(),p=h.command();let cancelled;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const result=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'){
  assert(!h.locked());assert.throws(()=>h.call(h.command()),e=>e.code==='ALLOCATION_IN_PROGRESS');
  const latest=h.state();latest.deliveryEvents.push('independent-save');h.setState(latest);
  cancelled=h.cancel();assert.equal(cancelled.cancellation,'accepted');assert.equal(cancelled.allocatorRun.state,'cancelling');assert.equal(h.cancel().cancellation,'accepted','lost cancellation response can be retried');
 }return result;}};
 assert.throws(()=>h.call(p),e=>e.code==='ALLOCATION_CANCELLED');assert.equal(h.row().state,'cancelled');assert.equal(h.calls.writes,1,'only the cancellation receipt is written');assert.equal(h.state().assignments.length,0);assert.deepEqual(h.state().deliveryEvents,['independent-save']);assert.equal(h.state().receipts.length,1);assert.equal(h.state().receipts[0].cancelled,true);assert.equal(h.state().revision,p.revision);
 assert.throws(()=>h.call(p),e=>e.code==='ALLOCATION_CANCELLED');
});
test('lost Drive response confirms durable receipt and exact retry does not allocate twice',()=>{
 const h=setup(),p=h.command();h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain response/);assert.equal(h.row().state,'completed');assert.equal(h.cancel().cancellation,'too-late');assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);
});
test('interrupted pre-write commit recovers exact request under writer lock with monotone log sequence and a new fence',()=>{
 const h=setup(),p=h.command(),drive=h.scope.rosterDriveRequest_;let first=true;
 h.scope.rosterDriveRequest_=(...args)=>{if(first){first=false;throw Error('Drive unavailable before write');}return drive(...args);};
 assert.throws(()=>h.call(p),/before write/);const prior=h.row();assert.equal(prior.state,'uncertain');assert.equal(h.calls.writes,0);assert.equal(h.cancel().cancellation,'too-late');
 assert.throws(()=>h.call(h.command()),e=>e.code==='ALLOCATION_UNCONFIRMED');
 const stage=h.scope.rosterAllocationRunStage_;let retrySeq;h.scope.rosterAllocationRunStage_=(run,message)=>{if(run){assert.notEqual(run.fence,prior.fence);retrySeq=run.log.at(-1).seq;}return stage(run,message);};
 h.call(p);assert(retrySeq>prior.log.at(-1).seq);assert.equal(h.row().state,'completed');assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);assert.throws(()=>h.scope.rosterAllocationRunCheck_(prior),e=>e.code==='ALLOCATION_ABANDONED');
});
test('post-commit status storage failure cannot promise cancellation and normal version view projects receipt completion',()=>{
 const h=setup(),p=h.command(),props=h.scope.props_;h.scope.props_=()=>({...props(),setProperty:(key,value)=>{if(key.startsWith('ROSTER_ALLOCATION_RUN:')&&JSON.parse(value).state==='completed')throw Error('Status unavailable');return props().setProperty(key,value);}});
 h.call(p);assert.equal(h.row().state,'committing');assert.equal(h.state().receipts.length,1);const cancelled=h.cancel();assert.equal(cancelled.cancellation,'too-late');assert.equal(cancelled.allocatorRun.state,'completed');
 assert.equal(h.call({operation:'allocationVersion',date:h.date}).allocatorRun.state,'completed');assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);
});
test('expired run allows a new fenced attempt and rejects late writers without overwriting successor status',()=>{
 const h=setup(),p=h.command(),req={identity:h.ctx.user,input:p},old=h.scope.rosterAllocationRunStart_(req,h.c);
 h.ctx.now+=11*60000;assert.equal(h.status().allocatorRun.state,'abandoned');assert.equal(h.status().allocatorRun.canCancel,false);
 const next=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c);assert.notEqual(next.id,old.id);assert.throws(()=>h.scope.rosterAllocationRunBeforeCommit_(old),e=>e.code==='ALLOCATION_ABANDONED');h.scope.rosterAllocationRunComplete_(old,h.state());assert.equal(h.row().id,next.id);
});
test('bounded control history and log retain no timetable data',()=>{
 const h=setup(),run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c);
 for(let n=0;n<40;n++)h.scope.rosterAllocationRunStage_(run,'Planning stage '+n);
 assert.equal(h.row().log.length,12);assert.equal(h.row().log.at(-1).seq,41);assert(JSON.stringify(h.row()).length<7000);assert(!('timetable' in h.row()));
 for(let n=0;n<65;n++){const date=new Date(Date.UTC(2026,0,n+1)).toISOString().slice(0,10);h.properties.set('ROSTER_ALLOCATION_RUN:'+date,JSON.stringify({...run,date,state:'failed'}));}
 h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterAllocationRunWrite_({...h.row(),state:'failed'},'Stopped'));
 h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c);assert([...h.properties.keys()].filter(k=>k.startsWith('ROSTER_ALLOCATION_RUN:')).length<60);
});
test('scheduled allocator shares status, cancellation fence, receipt replay and trusted service attribution',()=>{
 const h=setup(),request={input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}};
 h.scope.rosterScheduledDispatch_(request);assert.equal(h.row().trigger,'scheduled');assert.equal(h.row().actorName,'Scheduled allocator');assert.equal(h.row().state,'completed');assert.equal(h.scope.rosterScheduledDispatch_(request).replayed,true);assert.equal(h.calls.writes,1);
 const k=setup(),tick=k.O.scheduledTick;k.scope.GSISRosterOperations={...k.O,scheduledTick(s,ctx,stamp){const result=tick(s,ctx,stamp);assert.equal(k.cancel().cancellation,'accepted');return result;}};
 assert.equal(k.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',date:k.date,scheduledTime:k.ctx.now}}).allocationSkipped,true);assert.equal(k.row().state,'cancelled');assert.equal(k.calls.writes,2,'cancellation receipt then report-only tick are written');assert.equal(Object.values(k.state().scheduleReceipts).length,1);assert.equal(Object.values(k.state().scheduleReceipts)[0].cancelled,true);assert.equal(Object.values(k.state().scheduleReceipts)[0].reportComplete,true);assert.equal(k.state().assignments.length,0);
});
test('successful scheduled no-op settles status and morning cut-off remains a commit fence',()=>{
 const h=setup(),begin=h.scope.rosterAllocationRunStart_;h.scope.rosterAllocationRunStart_=(...args)=>{const run=begin(...args),state=h.state();state.systemConfig.scheduledAllocationEnabled=false;state.systemConfig.smcSummaryTimes.morning=[];h.setState(state);return run;};
 const result=h.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}});assert.equal(result.idle,true);assert.equal(h.row().state,'failed');assert.equal(h.calls.writes,0);
 const k=setup();k.ctx.now=Date.parse(k.date+'T06:29:59+08:00');const tick=k.O.scheduledTick;k.scope.GSISRosterOperations={...k.O,scheduledTick(s,ctx,stamp){const result=tick(s,ctx,stamp);k.ctx.now+=1000;return result;}};
 assert.throws(()=>k.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',date:k.date,scheduledTime:k.ctx.now}}),e=>e.code==='ALLOCATION_CUTOFF');assert.equal(k.row().state,'failed');assert.equal(k.calls.writes,0);
});
test('cancelled exact command cannot restart after later failed runs replace the status marker',()=>{
 const h=setup(),a=h.command();let cancelled=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const result=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'&&!cancelled){cancelled=true;h.cancel();}return result;}};
 assert.throws(()=>h.call(a),e=>e.code==='ALLOCATION_CANCELLED');
 const context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=()=>{throw Error('Later context unavailable');};const b=h.command();assert.throws(()=>h.call(b),/Later context/);assert.equal(h.row().state,'failed');
 h.scope.rosterOperationsContext_=context;assert.throws(()=>h.call(a),e=>e.code==='ALLOCATION_CANCELLED');assert.equal(h.state().assignments.length,0);assert.equal(h.calls.writes,1);assert.deepEqual(JSON.parse(JSON.stringify(h.call({operation:'receiptStatus',command:a}))),{accepted:false,cancelled:true,confirmation:'cancelled',requestId:a.requestId,currentRevision:h.state().revision});
});
test('lost cancellation commit response remains terminal even when status property was never updated',()=>{
 const h=setup(),p=h.command(),before=h.state().revision;let injected=false;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,input){const result=h.O.apply(s,ctx,input);if(input.operation==='autoAllocate'&&!injected){injected=true;h.loseNextResponse();assert.throws(()=>h.cancel(),/Uncertain response/);assert.equal(h.row().state,'running');assert.equal(h.cancel().allocatorRun.state,'cancelled');}return result;}};
 assert.throws(()=>h.call(p),e=>e.code==='ALLOCATION_CANCELLED');assert.equal(h.row().state,'cancelled');assert.equal(h.calls.writes,1);assert.equal(h.state().revision,before);assert.equal(h.state().assignments.length,0);assert.throws(()=>h.call(p),e=>e.code==='ALLOCATION_CANCELLED');
});
test('successful no-op after accepted cancellation settles as cancelled',()=>{
 const h=setup(),p=h.command();h.scope.rosterAllocationRunExecute_({identity:h.ctx.user,input:p},h.c,()=>{h.cancel();return {idle:true};});assert.equal(h.row().state,'cancelled');
});
test('05:30 cancelled optimisation still queues morning SMC summary once',()=>{
 const h=setup();h.ctx.now=Date.parse(h.date+'T05:30:00+08:00');h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const tick=h.O.scheduledTick;let first=true;h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){const result=tick(s,ctx,stamp);if(first){first=false;h.cancel();}return result;}};
 const request={input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}},result=h.scope.rosterScheduledDispatch_(request);assert.equal(result.allocationSkipped,true);assert.equal(h.row().state,'cancelled');assert.equal(h.state().assignments.length,0);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);assert.equal(h.scope.rosterScheduledDispatch_(request).replayed,true);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);
});
test('cancelled final optimisation preserves report-only commit across 06:30 cutoff',()=>{
 const h=setup();h.ctx.now=Date.parse(h.date+'T06:29:59+08:00');h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const tick=h.O.scheduledTick;let first=true;h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){const result=tick(s,ctx,stamp);if(first){first=false;h.cancel();h.ctx.now+=1000;}return result;}};
 const result=h.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}});assert.equal(result.allocationSkipped,true);assert.equal(h.state().assignments.length,0);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);assert.equal(h.row().state,'cancelled');
});
test('scheduled report runs while manual allocation is active without changing its fence',()=>{
 const h=setup();h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c),request={input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}};
 assert.equal(h.scope.rosterScheduledDispatch_(request).allocationSkipped,true);assert.equal(h.row().id,run.id);assert.equal(h.row().fence,run.fence);assert.equal(h.row().state,'running');assert.equal(h.state().assignments.length,0);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);assert.equal(h.scope.rosterScheduledDispatch_(request).replayed,true);
});
test('duplicate same-slot scheduler delivery cannot replace an in-flight allocation with a report-only receipt',()=>{
 const h=setup(),request={input:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now}},tick=h.O.scheduledTick;let injected=false;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){const result=tick(s,ctx,stamp);if(!injected){injected=true;assert.throws(()=>h.scope.rosterScheduledDispatch_(request),e=>e.code==='ALLOCATION_IN_PROGRESS');assert.equal(Object.keys(h.state().scheduleReceipts).length,0);}return result;}};
 const result=h.scope.rosterScheduledDispatch_(request);assert.equal(result.run.coverage,2);assert.equal(h.state().assignments.length,2);assert.equal(Object.values(h.state().scheduleReceipts)[0].optimise,true);assert.equal(h.row().state,'completed');assert.equal(h.calls.writes,1);
});
console.log('PASS '+checks+' allocator lifecycle regressions.');

