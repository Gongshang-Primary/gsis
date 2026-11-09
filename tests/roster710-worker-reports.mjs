import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {rosterRecoveryEnvironment} from '../shared/roster-recovery-profile.js';
import {assertRecoveryWritable} from '../shared/edge-recovery.js';
import {safeHealthError} from '../shared/edge-health.js';
const code=fs.readFileSync('roster-update/public/_worker.js','utf8');
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy/exec',GSIS_SECRET:'s'.repeat(40),ROSTER_AUTOMATION_ENABLED:'false'};
let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Unexpected Calendar request');};
for(const operation of ['systemConfig','saveSystemConfig','dailyEmployment','saveDailyEmploymentSettings','staplerDates','requestStapler','decideStapler','acquireStaplerLock','renewStaplerLock','releaseStaplerLock','nameBridges','saveNameBridge','deleteNameBridge']){
 const value=await gateway.trustedOperationsInput({operation,schedulerAvailable:true,calendarByDate:{forged:true},trustedNow:0},env,{email:'admin@gsps.edu.sg'});
 assert.deepEqual(value.calendarByDate,{});
 assert.equal(value.schedulerAvailable,false);
 assert.ok(value.trustedNow>0);
}
assert.equal(calls,0,'Configuration and saved report reads must not wait for Calendar');
let input;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),env.APPS_SCRIPT_URL);
 const envelope=JSON.parse(options.body),payload=JSON.parse(envelope.payload);
 assert.equal((await gateway.sign(payload,env.GSIS_SECRET)).signature,envelope.signature);
 assert.equal(payload.action,'rosterService');
 assert.equal(payload.identity,undefined);
 input=payload.input;
 return Response.json({ok:true,data:{sent:1,uncertain:0}});
};
assert.deepEqual(await gateway.dispatchDailyEmploymentReports(env),{sent:1,uncertain:0});
assert.deepEqual(input,{operation:'dailyEmploymentMailDispatch'});
globalThis.fetch=async()=>Response.json({ok:false,status:503});
await assert.rejects(()=>gateway.dispatchDailyEmploymentReports(env),/could not be confirmed/);
const worker=fs.readFileSync('notification-worker/index.js','utf8');
// The signed employment service remains callable, but v098 deliberately removes
// employment mail from the critical Roster recovery tick under every old flag.
for(const flag of ['true','false',undefined]){
 let release,reportCalls=0,settled=false;
 const gate=new Promise(resolve=>{release=resolve;}),background=[],errors=[];
 const scope=vm.createContext({Response,crypto:globalThis.crypto,rosterRecoveryEnvironment,runAllocationCycle:async(_env,work)=>work(),assertRecoveryWritable,safeHealthError,console:{info(){},error:value=>errors.push(JSON.parse(value))},edgeRosterEnabled:()=>false,
  dispatchNotifications:async()=>({sent:0}),dispatchInboxPending:async()=>({}),dispatchAllocationAudit:async()=>({}),
  dispatchReceivedReports:async()=>({hasMore:false}),dispatchPeerMail:async()=>({sent:0}),dispatchDeliveryReviewReports:async()=>({}),
  scheduledRoster:async()=>({notificationsQueued:0}),dispatchDailyEmploymentReports:async()=>{reportCalls++;await gate;return {sent:1};}
 });
 vm.runInContext(worker.replace(/^import .*;$/gm,'').replace('export default ','globalThis.worker = '),scope);
 await scope.worker.scheduled({scheduledTime:Date.now()},{ROSTER_AUTOMATION_ENABLED:flag},{waitUntil:task=>background.push(task)});
 const completed=Promise.all(background).then(()=>{settled=true;});await new Promise(setImmediate);
 assert.equal(reportCalls,0,'recovery suspends employment mail even when automatic allocation is enabled');
 assert.equal(settled,true,'critical scheduled work does not wait for the suspended employment mail lane');
 release();await completed;assert.equal(settled,true);assert.deepEqual(errors,[]);
}
console.log('PASS direct signed report service; recovery suspends employment cron; config/report reads skip Calendar; scheduler status cannot be forged.');
