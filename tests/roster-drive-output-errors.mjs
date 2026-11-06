import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {outputFailure,outputErrorText} from '../shared/edge-output-error.js';
import {ensureBackup,captureBackup,finishBackup,runDriveBackup,backupLedger,notifyOutputAlert} from '../roster-update/public/edge-roster-backup.js';
import {runBackupJobs} from '../roster-update/public/edge-roster-backup-jobs.js';
import {recordJobHealth,readSystemHealth} from '../shared/edge-health.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const error=Object.assign(Error('Drive output failed (HTTP 403). https://school.test/private#SECRET token=SECRET password="SECRET TWO" user@school.test eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature\nprivate stack'),{code:'ROSTER_BRIDGE_ERROR',googleCode:'ROSTER_DRIVE_OUTPUT'});
const detail=outputFailure(error);assert.match(detail.message,/HTTP 403/);assert.doesNotMatch(JSON.stringify(detail),/SECRET|user@|eyJ|private stack/);assert.equal(detail.googleCode,'ROSTER_DRIVE_OUTPUT');assert(outputFailure({message:'x '.repeat(500)}).message.length<=300);assert(outputErrorText(error).length<=300);
for(const googleCode of [403,'403','PERMISSION_DENIED']){const once=outputFailure({message:'Drive refused the output.',googleCode});assert.equal(once.googleCode,String(googleCode));assert.deepEqual(outputFailure(once),once);assert.match(outputErrorText(once),new RegExp('Google '+googleCode));}
for(const googleCode of [0,99,600,'403 private','secret'])assert.equal(outputFailure({googleCode}).googleCode,undefined);
const db=database(),now=Date.now(),env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'};
for(const [scope,state] of [['roster',{revision:1,systemConfig:{driveBackup:{enabled:true,homeBaseFolderId:'home',folderId:'backups'}},absences:[]}],['roster-register',{revision:1,entries:[]}]]){
 const store=Store.open(db,scope),h=await store.importState({state,actor:'test',requestId:scope});await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'test',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});
}
await ensureBackup(db);
const run=await captureBackup(db,{now});await finishBackup(db,run,{status:'failed',error,now});
const row=(await backupLedger(db))[0];assert.match(row.error,/HTTP 403/);assert.match(row.error,/ROSTER_DRIVE_OUTPUT/);assert.equal(JSON.parse(db.sql.prepare('SELECT manifest_json FROM gsis_backup_ledger WHERE id=?').get(run.id).manifest_json).outputError.message,detail.message);
await recordJobHealth(env,{job:'drive-outputs',status:'failure',code:'ROSTER_BRIDGE_ERROR',outputError:detail,startedAt:now,finishedAt:now,now});
const health=await readSystemHealth(env,{jobsOnly:true});assert.equal(health.jobs.find(r=>r.job==='drive-outputs').outputError.message,detail.message);assert.equal(health.recentFailures[0].outputError.googleCode,'ROSTER_DRIVE_OUTPUT');
// A recent verified full must not hide an expired manual/forced full run.
const verified=await captureBackup(db,{now:now+1});await finishBackup(db,verified,{status:'verified',manifest:{files:[],tierTwoRestoreBudget:{bytes:0,parts:0}},now:now+2});
const stuck=await captureBackup(db,{now:now+3});let calls=0;
const result=await runDriveBackup(env,{now:now+16*60000,bridge:async()=>{calls++;throw error;}});
assert.equal(db.sql.prepare('SELECT status FROM gsis_backup_ledger WHERE id=?').get(stuck.id).status,'failed');assert(calls>0,'retry must not wait for hourly schedule');assert.equal(result.failed,1);assert.equal(result.failure.outputError.googleCode,'ROSTER_DRIVE_OUTPUT');
await assert.rejects(finishBackup(db,stuck,{status:'verified',now:now+16*60000}),e=>e.code==='BACKUP_LEASE');
assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE status='running'").get().n,0);
const disabledRun=await captureBackup(db,{now:now+17*60000});
await db.prepare("UPDATE gsis_edge_records SET value_json=json_set(value_json,'$.enabled',json('false')) WHERE scope='roster' AND collection='systemConfig' AND record_id='key:driveBackup'").run();
const off=await runBackupJobs(env,{now:now+33*60000,bridge:async()=>assert.fail('disabled writer'),alert:async()=>assert.fail('disabled alert')});
assert.equal(off.enabled,false);assert.equal(db.sql.prepare('SELECT status FROM gsis_backup_ledger WHERE id=?').get(disabledRun.id).status,'failed','expiry continues while output writes are disabled');
let enabled=true;const sent=[],send=async h=>{sent.push(h);return {queued:true};},notify=(kind,time,n)=>notifyOutputAlert(db,{kind,now:time,health:{warnings:['failure'],failingDates:n},message:'Daily Drive outputs failing: '+n+' dates',enabled:async()=>enabled},send);
await notify('daily',now,2);await notify('daily',now+1,8);assert.equal(sent.length,1);assert.equal(sent[0].message,'Daily Drive outputs failing: 2 dates');
await notify('backup',now+2,1);assert.equal(sent.length,2);await notify('daily',now+86400000,9);assert.equal(sent.length,3);
enabled=false;await notify('daily',now+2*86400000,12);assert.equal(sent.length,3);
enabled=true;let lostId;await assert.rejects(notifyOutputAlert(db,{kind:'continuity',now,health:{warnings:['failure']},message:'failed',enabled:async()=>true},async h=>{lostId=h.alertId;throw Error('response lost');}));
await notifyOutputAlert(db,{kind:'continuity',now,health:{warnings:['failure']},message:'failed',enabled:async()=>true},async h=>{assert.equal(h.alertId,lostId);return {queued:true};});
db.sql.close();console.log('sanitised errors in ledger/manifest/health, expired-run retry and late-writer fence, daily alert identities and disabled silence pass');
