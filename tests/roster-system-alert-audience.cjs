'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
const f=fixture(),{O,state:s,ctx,date}=f;
ctx.adminIds=['bob','charlie','bob'];ctx.smcIds=['alice'];ctx.dutySources={[date]:{available:true,staffIds:['alice']}};s.smcDutyRoster=[{date,staffIds:['alice']}];
s.systemConfig={driveDaily:{enabled:true},driveBackup:{enabled:true}};
O.systemAlert(s,ctx,date,'drive-backup:daily-fixture','Daily Drive outputs failing: 3 dates','daily');
assert.deepEqual(s.outbox.map(j=>j.recipientId).sort(),['bob','charlie']);
for(const j of s.outbox){assert.equal(j.kind,'system_alert');assert.equal(j.data.audience,'system-admin');assert.equal(j.data.templateKey,'system_alert');assert.match(j.data.summary,/GSiS system alert for Admin:/);}
O.systemAlert(s,ctx,date,'drive-backup:daily-fixture','Daily Drive outputs failing: 3 dates','daily');assert.equal(s.outbox.length,2);
O.smcAlert(s,ctx,date,'coverage-fixture','A lesson needs cover.');
assert.deepEqual(s.outbox.filter(j=>j.key.startsWith('coverage-fixture:')).map(j=>j.recipientId),['alice']);
const fresh={rosterPeople:ctx.people,rosterAdminIds:ctx.adminIds,rosterSMCIds:ctx.smcIds};
for(const path of ['backend/RosterOperations.gs','shared/edge-notification-model.js']){
 const text=fs.readFileSync(path,'utf8'),start=text.indexOf('function rosterNotificationEligible_('),end=text.indexOf('\n}',start)+2;
 const sandbox={GSISRosterOperations:O,GSISRosterAllocation:A,rosterNotificationManual_:()=>false,rosterNotificationEmergency_:()=>false};vm.createContext(sandbox);vm.runInContext(text.slice(start,end),sandbox);
 const eligible=j=>sandbox.rosterNotificationEligible_(s,j,ctx.now,fresh,O.notificationIndex(s),new Set(['system_alert','smc_attention']));
 const job=structuredClone(s.outbox[0]);assert.equal(eligible(job),null,path);
 fresh.rosterAdminIds=[];assert.match(eligible(job),/Admin/,path);fresh.rosterAdminIds=ctx.adminIds;
 s.systemConfig.driveDaily.enabled=false;assert.match(eligible(job),/disabled/,path);s.systemConfig.driveDaily.enabled=true;
 const legacy={...job,kind:'smc_alert',data:{summary:job.data.summary,audience:'duty-smc',templateKey:'smc_attention'},recipientId:'alice'};assert.match(eligible(legacy),/system alert|Admin/,path);
 const duty=s.outbox.find(j=>j.key.startsWith('coverage-fixture:'));assert.equal(eligible(structuredClone(duty)),null,path);
 const wrong={...structuredClone(duty),recipientId:'bob',data:{...duty.data,audience:'backup-admin'}};assert.match(eligible(wrong),/duty|Admin/,path);
}
ctx.people.find(p=>p.id==='charlie').active=false;O.systemAlert(s,ctx,date,'drive-backup:next','Backup failed','backup');assert.deepEqual(s.outbox.filter(j=>j.key.startsWith('drive-backup:next:')).map(j=>j.recipientId),['bob']);
const contract=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json','utf8')).templates.system_alert;
assert(contract);assert.match(contract.body,/GSiS Admin/);assert.doesNotMatch(contract.body,/on SMC relief duty|affected lessons/);
const activation=JSON.parse(fs.readFileSync('notification-worker/templates.activation.json','utf8'));assert.equal(activation.system_alert.enabled,false,'Unapproved Admin wording must not send.');
console.log('PASS Admin-only system alerts, duty-only coverage, dedupe, disabled/role-change fences and safe template wording in Google and D1.');
