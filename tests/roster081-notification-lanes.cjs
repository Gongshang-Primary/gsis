'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace(/^/,'const edgeRosterEnabled=env=>env.ROSTER_EDGE_AUTHORITY===\"d1\",edgeDeployEnabled=env=>env.DEPLOY_EDGE_AUTHORITY===\"d1\";\n').replace('export default ','globalThis.worker = ');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function host(overrides={}){
 const calls=[],errors=[],background=[];
 const scope=vm.createContext({Response,crypto:globalThis.crypto,runAllocationCycle:async(_env,work)=>work(),assertRecoveryWritable:()=>{},safeHealthError:error=>({code:error.code||'UNKNOWN_ERROR'}),console:{info(){},error:value=>errors.push(JSON.parse(value))},
  dispatchNotifications:async()=>{calls.push('notify');return {sent:0};},
  dispatchInboxPending:async()=>{calls.push('inbox');},
  dispatchAllocationAudit:async()=>{},
  dispatchReceivedReports:async()=>({transport:{},intake:{}}),
  dispatchPeerMail:async()=>({sent:0}),
  dispatchDeliveryReviewReports:async()=>{calls.push('review');},
  scheduledRoster:async()=>{calls.push('allocate');return {notificationsQueued:0};},
  dispatchDailyEmploymentReports:async()=>{calls.push('mail');},
  diagnoseNotificationConnections:async()=>{calls.push('diagnostics');return {readOnly:true};},...overrides});
 vm.runInContext(fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace(/^export (?=(?:async )?function )/gm,''),scope);vm.runInContext(code,scope);
 return {scope,calls,errors,background,run:async(env={ROSTER_AUTOMATION_ENABLED:'true'})=>{await scope.worker.scheduled({scheduledTime:123},env,{waitUntil:p=>background.push(p)});await new Promise(setImmediate);}};
}
(async()=>{
 const slow=deferred(),inbox=deferred(),h=host({scheduledRoster:async()=>slow.promise,dispatchInboxPending:async()=>inbox.promise});
 await h.run();
 assert.deepEqual(h.calls,['notify'],'critical notifications run while allocation and inbox remain unresolved; noncritical review stays suspended');
 slow.resolve({notificationsQueued:0});inbox.resolve();await Promise.all(h.background);
 assert.deepEqual(h.calls,['notify'],'completion does not reintroduce daily review or employment mail');

 const firstSend=deferred(),allocation=deferred();let sends=0;
 const g=host({dispatchNotifications:async()=>{sends++;if(sends===1)await firstSend.promise;},scheduledRoster:async()=>allocation.promise});
 await g.run();assert.equal(sends,1);assert(!g.calls.includes('review'),'recovery cron does not run the noncritical review lane');
 allocation.resolve({notificationsQueued:2});await Promise.resolve();await Promise.resolve();
 assert.equal(sends,1,'the scheduler follow-up drain never overlaps this tick\'s first notification drain');
 firstSend.resolve();await Promise.all(g.background);assert.equal(sends,2,'newly queued notices get a same-tick drain');assert(!g.calls.includes('review'),'follow-up delivery does not reactivate review');

 const failure=host({dispatchNotifications:async()=>{throw Error('secret notification details');},scheduledRoster:async()=>{throw Error('secret scheduler details');},dispatchInboxPending:async()=>{throw Error('secret inbox details');},dispatchDailyEmploymentReports:async()=>{throw Error('secret mail details');},dispatchDeliveryReviewReports:async()=>{throw Error('secret Admin review details');}});
 await failure.run();await Promise.all(failure.background);
 assert.deepEqual(failure.errors.map(e=>e.event).sort(),['roster-inbox-dispatch-failed','roster-notification-dispatch-failed','roster-scheduled-cycle-failed'].sort());
 assert(!JSON.stringify(failure.errors).includes('secret'),'failure diagnostics never copy staff/service exception data');

 const diagnostics=host();await diagnostics.run({WHATSAPP_DIAGNOSTICS_ENABLED:'true',ROSTER_AUTOMATION_ENABLED:'true'});await Promise.all(diagnostics.background);assert.deepEqual(diagnostics.calls,['diagnostics']);
 const disabled=host();await disabled.run({ROSTER_AUTOMATION_ENABLED:'false'});await Promise.all(disabled.background);assert(!disabled.calls.includes('mail'));assert(!disabled.calls.includes('review'),'review remains suspended when allocation is disabled');assert(disabled.calls.includes('notify'));assert(disabled.calls.includes('inbox'),'human inbox work remains independent of automatic allocation');
 console.log('PASS recovery notification independence, same-tick follow-up, suspended noncritical lanes, failure isolation and diagnostics-only mode');
})().catch(error=>{console.error(error);process.exitCode=1;});
