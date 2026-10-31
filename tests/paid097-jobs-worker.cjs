const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// The deployed 098 entry deliberately retires the paid migration orchestrator.
// Its durable job implementation is still covered separately by paid097-jobs.mjs.
function fixture({paused=false,paid=false,failPlanning=false,failReceived=false,stageResults={}}={}){
 const calls=[],events=[],health=[],queued=[],background=[],profiles=[];
 const scope={URL,Request,Response,AbortSignal,Date,Math,Promise,Number,Object,crypto:globalThis.crypto,console:{info:v=>events.push(JSON.parse(v)),error:v=>events.push(JSON.parse(v))},
 assertRecoveryWritable:env=>{if(env.GSIS_RECOVERY_MODE==='true')throw Object.assign(Error('private pause detail'),{code:'GSIS_RECOVERY_PAUSED',status:503});},
 safeHealthError:error=>({code:error.code==='GSIS_RECOVERY_PAUSED'?'RECOVERY_PAUSED':error.status?'HTTP_ERROR':'UNKNOWN_ERROR',...(error.status?{httpStatus:error.status}:{})}),
 recordJobHealth:async(env,event)=>health.push(event),edgeRosterEnabled:env=>env.ROSTER_EDGE_AUTHORITY==='d1',backgroundJobsEnabled:env=>env.GSIS_BACKGROUND_JOBS==='true',
 requestBackgroundWork:async(env,kind)=>{queued.push(kind);return {queued:true};},enqueueDueBackgroundWork:async()=>{queued.push('due');return {queued:0};},
 edgeDispatchHasWork:async()=>false,isEdgeTimetableRefreshDue:async()=>false,receivedReportWorkDue:async()=>false,
 runBackgroundJob:async()=>assert.fail('Recovery entry must not claim migrated durable jobs'),sign:async value=>value};
 for(const name of ['runDeployHandoffs','runRosterR2Cleanup','refreshEdgeRosterReferences','dispatchNotifications','dispatchDailyEmploymentReports','dispatchDeliveryReviewReports','scheduledRoster','diagnoseNotificationConnections','dispatchInboxPending','dispatchAllocationAudit','dispatchWebhookJobs','dispatchReceivedReports','dispatchPeerMail','serviceBackend'])scope[name]=async(env,input)=>{
  calls.push(name==='serviceBackend'?name+':'+input.operation:name);profiles.push(env);
  if(name==='scheduledRoster'&&failPlanning)throw Object.assign(Error('Bindiya private token secret'),{status:502});
  if(name==='dispatchReceivedReports'&&failReceived)throw Object.assign(Error('Private received report'),{status:503});
  return stageResults[name]||{ok:true,claimed:0,processed:0};
 };
 // Existing ownership metadata is read once before stale dashboard flags are ignored.
 const db={prepare(query){assert.match(query,/FROM gsis_edge_heads h/,'only read ownership metadata; never claim migrated jobs');return {async all(){return {success:true,results:[]};}};}};
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1',GSIS_BACKGROUND_JOBS:paid?'true':'false',GSIS_RECOVERY_MODE:paused?'true':undefined,GSIS_BACKEND_REQUIRED:'true',GSIS_BACKEND:{fetch(){assert.fail('Private migration binding must be ignored');}}};
 vm.runInNewContext(fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace(/^export (?=(?:async )?function )/gm,'')+'\n'+fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;\s*$/gm,'').replace('export default','globalThis.worker='),scope);
 return {calls,events,health,queued,profiles,env,worker:scope.worker,async scheduled(cron='* * * * *'){await scope.worker.scheduled({cron,scheduledTime:Date.now()},env,{waitUntil:p=>background.push(p)});await Promise.all(background);}};
}
function batch(purposes){const actions=[];return {actions,messages:purposes.map((purpose,index)=>({body:{purpose,kind:'notifications'},ack(){actions.push({index,action:'ack'});},retry(options){actions.push({index,action:'retry',delaySeconds:options.delaySeconds});}})),ackAll(){actions.push({action:'ackAll'});},retryAll(options){actions.push({action:'retryAll',delaySeconds:options.delaySeconds});}};}
(async()=>{
 const failed=fixture({failPlanning:true});await failed.scheduled();
 assert(failed.health.some(e=>e.job==='allocation'&&e.status==='failure'&&e.httpStatus===502),'caught planning failure persists safe stage diagnostics');
 assert(!failed.events.some(e=>e.event==='roster-scheduled-cycle'),'failed allocation never emits success');assert(!JSON.stringify([failed.events,failed.health]).match(/Bindiya|token secret|private staff/));
 const paused=fixture({paused:true,paid:true});await paused.scheduled();assert.equal(paused.calls.length,0,'recovery pause prevents scheduled side effects');const pausedBatch=batch(['gsis-background-work-v1']);await paused.worker.queue(pausedBatch,paused.env);assert.equal(paused.calls.length,0);assert.deepEqual(pausedBatch.actions,[{action:'retryAll',delaySeconds:300}]);
 const paid=fixture({paid:true});await paid.scheduled();
 for(const name of ['dispatchReceivedReports','dispatchNotifications','dispatchPeerMail','scheduledRoster','dispatchInboxPending'])assert(paid.calls.includes(name),'critical lane runs despite leftover paid flag: '+name);
 for(const name of ['dispatchAllocationAudit','dispatchDailyEmploymentReports','dispatchDeliveryReviewReports','runDeployHandoffs','serviceBackend:processEdgePeerProposals','serviceBackend:prewarmTimetables'])assert(!paid.calls.includes(name),'migration-only work is excluded: '+name);
 assert.deepEqual(paid.queued,[]);assert(!paid.health.some(e=>e.job.startsWith('queue-')),'recovery does not overwrite parked migration job health');
 for(const profile of paid.profiles){assert.equal(profile.GSIS_BACKEND,undefined);assert.equal(profile.GSIS_BACKEND_REQUIRED,'false');assert.equal(profile.ROSTER_EDGE_AUTHORITY,'legacy');assert.equal(profile.DEPLOY_EDGE_AUTHORITY,'legacy');assert.equal(profile.GSIS_BACKGROUND_JOBS,'false');assert.equal(profile.GSIS_JOBS,paid.env.GSIS_JOBS,'durable transport database remains bound');}
 assert.equal(paid.env.GSIS_BACKGROUND_JOBS,'true','the profile does not mutate dashboard settings');
 paid.calls.length=0;const mixed=batch(['invalid','gsis-background-work-v1','gsis-notification-wake-v1']);await paid.worker.queue(mixed,paid.env);
 assert.deepEqual(mixed.actions,[{index:0,action:'retry',delaySeconds:300},{index:1,action:'retry',delaySeconds:300},{index:2,action:'ack'}]);assert.deepEqual(paid.calls,['dispatchReceivedReports','dispatchNotifications','dispatchPeerMail']);assert(paid.events.some(e=>e.event==='roster-queue-unsupported-recovery-wake'&&e.pending===2));
 const intakeFailed=fixture({paid:true,failReceived:true}),retryBatch=batch(['gsis-notification-wake-v1']);await intakeFailed.worker.queue(retryBatch,intakeFailed.env);
 assert.equal(retryBatch.actions[0].action,'retry');assert(intakeFailed.calls.includes('dispatchNotifications'),'failed intake does not suppress independently eligible notices');assert(intakeFailed.health.some(e=>e.job==='received-reports'&&e.status==='failure'));assert(!JSON.stringify(intakeFailed.events).includes('Private received report'));
 const noticesFailed=fixture({paid:true,stageResults:{dispatchNotifications:{prepareFailures:1}}}),noticeBatch=batch(['gsis-notification-wake-v1']);await noticesFailed.worker.queue(noticeBatch,noticesFailed.env);assert.equal(noticeBatch.actions[0].action,'retry');assert(noticesFailed.health.some(e=>e.job==='notifications'&&e.status==='failure'));
 const work=fixture({paid:true,stageResults:{dispatchReceivedReports:{transport:{claimed:1,forwarded:1},intake:{applied:0}},dispatchNotifications:{enabled:false},dispatchPeerMail:{sent:1}}}),completed=batch(['gsis-notification-wake-v1']);await work.worker.queue(completed,work.env);assert.deepEqual(completed.actions,[{index:0,action:'ack'}]);assert(work.health.some(e=>e.job==='peer-mail'&&e.counts.sent===1));
 const planning=fixture({paid:true,stageResults:{scheduledRoster:{notificationsQueued:1}}});await planning.scheduled();assert.equal(planning.calls.filter(name=>name==='dispatchNotifications').length,2,'new planning notices drain after the initial dispatch');assert(planning.calls.indexOf('dispatchReceivedReports')<planning.calls.indexOf('scheduledRoster'));
 console.log('PASS recovery safe stage diagnostics, unchanged pause controls, critical cron lanes, no paid job claims, mixed queue retention and same-tick notification drain');
})().catch(error=>{console.error(error);process.exitCode=1;});
