'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Execute the production Worker handler. Imported service boundaries alone are
// simulated so deferred promises expose accidental ordering or flag coupling.
const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace('export default ','globalThis.worker = ');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function host(overrides={}){
 const calls=[],errors=[],background=[],empty={hasMore:false,transport:{pending:0},intake:{deferred:0}};
 const scope=vm.createContext({Response,crypto:globalThis.crypto,assertRecoveryWritable:()=>{},safeHealthError:error=>({code:error.code||'UNKNOWN_ERROR'}),edgeRosterEnabled:env=>env.ROSTER_EDGE_AUTHORITY==='d1',edgeDeployEnabled:env=>env.DEPLOY_EDGE_AUTHORITY==='d1',console:{info(){},error:value=>errors.push(JSON.parse(value))},
  dispatchReceivedReports:async()=>{calls.push('received');return empty;},
  dispatchNotifications:async()=>{calls.push('notifications');return {pending:0};},
  dispatchPeerMail:async()=>{calls.push('peer-mail');return {sent:0};},
  dispatchInboxPending:async()=>{calls.push('inbox');},
  dispatchAllocationAudit:async()=>{calls.push('audit');},
  dispatchDeliveryReviewReports:async()=>{calls.push('review');},
  scheduledRoster:async env=>{calls.push('planning:'+env.ROSTER_AUTOMATION_ENABLED);return {notificationsQueued:0};},
  dispatchDailyEmploymentReports:async()=>{calls.push('employment-mail');},
  diagnoseNotificationConnections:async()=>{calls.push('diagnostics');return {readOnly:true};},...overrides});
 vm.runInContext(fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace(/^export (?=(?:async )?function )/gm,''),scope);vm.runInContext(code,scope);
 return {scope,calls,errors,background,empty,run:async env=>{await scope.worker.scheduled({scheduledTime:123},env,{waitUntil:p=>background.push(p)});await new Promise(setImmediate);},finish:()=>Promise.all(background)};
}
(async()=>{
 for(const enabled of ['false','true']){
  const intake=deferred(),h=host();h.scope.dispatchReceivedReports=async env=>{h.calls.push('received');assert.equal(env.ROSTER_AUTOMATION_ENABLED,enabled);return intake.promise;};
  await h.run({ROSTER_AUTOMATION_ENABLED:enabled});
  assert(h.calls.includes('received'),'critical received reports start even with automatic allocation disabled');
  for(const lane of ['notifications','inbox'])assert(h.calls.includes(lane),lane+' progresses while critical projection is awaiting its response');
  assert(!h.calls.some(call=>call.startsWith('planning:')),'planning waits for this tick’s critical report drain');assert(!h.calls.includes('peer-mail'),'peer mail waits for durable proposal projection');
  intake.resolve(h.empty);await h.finish();assert(h.calls.includes('planning:'+enabled));assert(h.calls.includes('peer-mail'));for(const extra of ['audit','review','employment-mail'])assert(!h.calls.includes(extra),'noncritical work is absent from the restoration tick');assert.deepEqual(h.errors,[]);
 }
 {
  const h=host();h.scope.dispatchReceivedReports=async()=>{h.calls.push('received');throw Error('private report details');};await h.run({ROSTER_AUTOMATION_ENABLED:'false'});await h.finish();
  for(const lane of ['notifications','inbox','peer-mail','planning:false'])assert(h.calls.includes(lane),'a failed drain does not suppress '+lane);
  assert.deepEqual(h.errors.map(row=>row.event),['roster-received-report-drain-failed']);assert(!JSON.stringify(h.errors).includes('private'));
 }
 {
  const h=host(),actions=[];h.scope.dispatchReceivedReports=async(env,options)=>{h.calls.push('received');assert.equal(env.ROSTER_AUTOMATION_ENABLED,'false');assert.equal(options.budgetMs,150000);return {...h.empty,hasMore:true};};
  h.scope.dispatchNotifications=async()=>{h.calls.push('notifications');return {pending:0,readyAt:Date.now()+240000};};
  const batch={messages:[{body:{purpose:'gsis-notification-wake-v1'}}],ackAll:()=>actions.push({action:'ack'}),retryAll:options=>actions.push({action:'retry',delaySeconds:options.delaySeconds})};
  await h.scope.worker.queue(batch,{ROSTER_AUTOMATION_ENABLED:'false'});assert.deepEqual(h.calls,['received','notifications','peer-mail']);assert.deepEqual(actions,[{action:'retry',delaySeconds:1}],'a capped critical drain resumes in one second without waiting for notification pacing');
  h.calls.length=0;actions.length=0;h.scope.dispatchReceivedReports=async()=>{h.calls.push('received');return h.empty;};await h.scope.worker.queue(batch,{ROSTER_AUTOMATION_ENABLED:'false'});assert.deepEqual(actions,[{action:'ack'}],'a completed drain acknowledges its wake');
 }
 {
  const h=host();await h.run({WHATSAPP_DIAGNOSTICS_ENABLED:'true',ROSTER_AUTOMATION_ENABLED:'true',WHATSAPP_DURABLE_INGRESS:'true',CALENDAR_BACKGROUND_SYNC:'true'});await h.finish();assert.deepEqual(h.calls,['diagnostics'],'explicit diagnostics-only mode performs no intake, planning, inbox or delivery mutation');assert.deepEqual(h.errors,[]);
 }
 console.log('PASS critical report lane independence, planning ordering, bounded queue continuation, safe failure isolation and read-only diagnostics mode.');
})().catch(error=>{console.error(error);process.exitCode=1;});
