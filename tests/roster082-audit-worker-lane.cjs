'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace('export default ','globalThis.worker = ');
const auditCron='2-57/5 * * * *';
function fixture(){
 const calls=[],errors=[],health=[],background=[];let resolvePlanning;
 const planning=new Promise(resolve=>{resolvePlanning=resolve;});
 const scope=vm.createContext({Response,crypto:globalThis.crypto,assertRecoveryWritable:()=>{},safeHealthError:error=>({code:error?.code||'UNKNOWN_ERROR'}),recordJobHealth:async(_,event)=>health.push(event),console:{error:s=>errors.push(JSON.parse(s)),info(){}},dispatchReceivedReports:async()=>({transport:{},intake:{}}),dispatchPeerMail:async()=>({sent:0}),dispatchNotifications:async()=>{calls.push('notifications');},dispatchInboxPending:async()=>{calls.push('inbox');},scheduledRoster:async env=>{calls.push('planning');assert.equal(env.ROSTER_EDGE_AUTHORITY,'legacy');assert.equal(env.GSIS_BACKGROUND_JOBS,'false');return planning;},dispatchAllocationAudit:async()=>{calls.push('audit');throw Error('Private staff details never logged');},diagnoseNotificationConnections:async()=>{}});
 vm.runInContext(fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace('export function ','function '),scope);vm.runInContext(code,scope);
 return {calls,errors,health,resolvePlanning,async tick(cron){await scope.worker.scheduled({cron,scheduledTime:Date.parse('2026-10-27T00:07:00Z')},{GSIS_JOBS:{prepare(){}},ROSTER_EDGE_AUTHORITY:'d1',GSIS_BACKGROUND_JOBS:'true'},{waitUntil:p=>background.push(p)});await new Promise(setImmediate);},finish:()=>Promise.all(background)};
}
(async()=>{
 const f=fixture();await f.tick('* * * * *');assert(!f.calls.includes('audit'),'minute work must not export');assert(f.calls.includes('notifications'));assert(f.calls.includes('inbox'));
 await f.tick(auditCron);assert(f.calls.includes('audit'),'dedicated low cadence invocation runs audit without waiting for slow planning');assert.equal(f.calls.filter(x=>x==='planning').length,1);assert.equal(f.calls.filter(x=>x==='notifications').length,1,'audit invocation never sends');assert.equal(f.health.at(-1).job,'audit-export');assert.equal(f.health.at(-1).status,'failure');
 f.resolvePlanning({notificationsQueued:0});await f.finish();assert.equal(f.errors.length,1);assert.equal(f.errors[0].event,'roster-allocation-audit-failed');assert(!JSON.stringify([f.errors,f.health]).includes('Private'));
 assert(fs.readFileSync('notification-worker/wrangler.toml','utf8').includes('"'+auditCron+'"'),'packaged Worker installs the export cron');
 console.log('PASS independent low cadence audit recovery, critical lanes, safe failure health and no notification sends from export');
})().catch(error=>{console.error(error);process.exitCode=1;});
