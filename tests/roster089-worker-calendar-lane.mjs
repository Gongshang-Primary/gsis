import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {rosterRecoveryEnvironment} from '../shared/roster-recovery-profile.js';
import {assertRecoveryWritable} from '../shared/edge-recovery.js';
import {safeHealthError} from '../shared/edge-health.js';
const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace('export default ','globalThis.worker = '),secret='calendar-fixture-'.repeat(4),calls=[],jobs=[],errors=[],background=[];
let release;const gate=new Promise(resolve=>release=resolve);
const context=vm.createContext({Request,Response,URL,AbortSignal,Date,crypto,rosterRecoveryEnvironment,assertRecoveryWritable,safeHealthError,console:{info(){},error:value=>errors.push(JSON.parse(value))},dispatchNotifications:async()=>{jobs.push('notifications');await gate;return {sent:0};},dispatchDailyEmploymentReports:async()=>{},dispatchDeliveryReviewReports:async()=>{},scheduledRoster:async()=>{jobs.push('allocation');return {};},diagnoseNotificationConnections:async()=>({}),dispatchInboxPending:async()=>{jobs.push('inbox');},dispatchAllocationAudit:async()=>{},dispatchQuotaSnapshot:async()=>({idle:true}),dispatchReceivedReports:async()=>({}),dispatchPeerMail:async()=>({}),dispatchWebhookJobs:async()=>({}),fetch:async request=>{calls.push(request);return Response.json({ok:true,result:{state:'inProgress'}});}});
vm.runInContext(code,context);
const run=async extra=>{await context.worker.scheduled({scheduledTime:Date.now()},{CALENDAR_BACKGROUND_SYNC:'true',CALENDAR_GATEWAY_URL:'https://calendar.example.test',CALENDAR_SERVICE_SECRET:secret,...extra},{waitUntil(p){background.push(p);}});await new Promise(setImmediate);};
await run({});
assert.equal(calls.length,0,'v098 recovery does not wake Calendar on the minute tick even when an old sync flag remains enabled');
for(const job of ['notifications','inbox','allocation'])assert(jobs.includes(job),'critical '+job+' progresses without Calendar continuation');
release();await Promise.all(background);
// Old URL/binding configuration must not reactivate the suspended lane. Signed
// Calendar continuation authorization remains covered by calendar089-background-gateway.mjs.
for(const url of ['http://calendar.example.test','https://user:secret@calendar.example.test','https://calendar.example.test/path','https://calendar.example.test/?secret=yes'])await run({CALENDAR_GATEWAY_URL:url});
let bound=0;await run({CALENDAR_GATEWAY:{fetch:async()=>{bound++;return Response.json({ok:true});}}});await Promise.all(background);
assert.equal(calls.length,0);assert.equal(bound,0);assert.deepEqual(errors,[]);
console.log('PASS suspended recovery Calendar cron lane, ignored obsolete sync configuration and independent critical jobs');
