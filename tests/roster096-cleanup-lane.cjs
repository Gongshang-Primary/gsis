const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture(failCleanup=false){
 const calls=[],logs=[],errors=[],background=[];
 const scope={URL,Request,Response,AbortSignal,Date,crypto:globalThis.crypto,assertRecoveryWritable:()=>{},safeHealthError:error=>({code:error.code||'UNKNOWN_ERROR'}),console:{info:value=>logs.push(JSON.parse(value)),error:value=>errors.push(JSON.parse(value))},edgeRosterEnabled:env=>env.ROSTER_EDGE_AUTHORITY==='d1',sign:async value=>value};
 for(const name of ['runDeployHandoffs','refreshEdgeRosterReferences','dispatchNotifications','dispatchDailyEmploymentReports','dispatchDeliveryReviewReports','scheduledRoster','diagnoseNotificationConnections','dispatchInboxPending','dispatchAllocationAudit','dispatchQuotaSnapshot','dispatchWebhookJobs','dispatchReceivedReports','dispatchPeerMail','serviceBackend'])scope[name]=async()=>{calls.push(name);return {ok:true};};
 const cleaner={Date,TextEncoder,crypto:globalThis.crypto,assertRecoveryWritable:()=>{}};vm.runInNewContext(fs.readFileSync('roster-update/public/roster-recovery-timetable-cache.js','utf8').replace(/^import .*;$/gm,'').replace(/export async function /g,'async function '),cleaner);
 scope.runRecoveryTimetableCleanup=async(env,options)=>{calls.push({name:'cleanup',options});assert.equal(env.ROSTER_EDGE_AUTHORITY,'legacy');if(failCleanup)throw Error('private provider detail');return cleaner.runRecoveryTimetableCleanup(env,options);};
 const source=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;\s*$/gm,'').replace('export default','globalThis.worker=');
 vm.createContext(scope);vm.runInContext(fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace(/^export (?=(?:async )?function )/gm,''),scope);vm.runInContext(source,scope);
 return {calls,logs,errors,async run(cron){await scope.worker.scheduled({cron,scheduledTime:Date.parse('2026-10-26T18:15:00Z')},{ROSTER_EDGE_AUTHORITY:'d1',ROSTER_AUTOMATION_ENABLED:'true'},{waitUntil:task=>background.push(task)});await Promise.all(background);}};
}
(async()=>{
 const daily=fixture();await daily.run('15 18 * * *');
 assert.equal(daily.calls.length,1,'daily cleanup must have its own invocation, without allocation or delivery jobs');
 assert.equal(daily.calls[0].name,'cleanup');
 assert.equal(daily.calls[0].options.now,Date.parse('2026-10-26T18:15:00Z'));
 assert(daily.logs.some(row=>row.event==='roster-r2-cleanup'&&row.deleted===0&&row.scanned===0));
 const minute=fixture();await minute.run('* * * * *');
 assert(!minute.calls.some(call=>call.name==='cleanup'),'minute tick must never scan R2 cleanup candidates');
 assert(minute.calls.includes('scheduledRoster'),'normal scheduling remains enabled');
 assert(minute.calls.includes('dispatchQuotaSnapshot'),'R snapshot transfer belongs to the minute lane');assert.deepEqual(minute.errors,[],'required minute-lane service bindings are complete');
 const failed=fixture(true);await failed.run('15 18 * * *');
 assert.equal(failed.calls.length,1);assert.equal(failed.errors.length,1);
 assert.equal(failed.errors[0].event,'roster-r2-cleanup-failed');
 assert(!JSON.stringify(failed.errors).includes('private provider detail'));
 console.log('PASS daily R2 cleanup isolation, recovery-cache binding guard and safe results/failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
