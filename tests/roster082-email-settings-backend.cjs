'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs'),S=require('../shared/roster-stapler.js');
function setup(){
 const h=adapter();vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),h.scope);h.scope.GSISRosterStapler=S;
 h.scope.Utilities.formatDate=(date,zone,format)=>{const value=new Date(date.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?value.slice(0,10):format==='HH'?value.slice(11,13):value.slice(14,16);};
 for(const name of ['rosterIndex_','rosterModel_','rosterOperationsQuota_','rosterOperationsReconcile_','rosterOperationsReadReconcile_'])h.scope[name]=()=>assert.fail('Recipient settings used '+name);
 h.scope.MailApp={sendEmail:()=>assert.fail('Recipient settings sent email'),getRemainingDailyQuota:()=>assert.fail('Recipient settings checked Mail quota')};
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:false},rosterPeople:h.people.map(p=>({...p,emails:[p.id+'@example.test']})),rosterSMCIds:['alice']},call=input=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input},c);
 const state=h.state(),plan=S.canonical(S.create({...h.ctx.days[h.date],date:h.date}));state.staplerPlans.push({date:h.date,baselineId:'baseline',revision:1,confirmed:true,confirmedRevision:1,draft:plan,confirmedPlan:plan});state.outbox.push({id:'existing',kind:'stapler_timetable',date:h.date,status:'queued',recipientId:'bob',data:{}});h.setState(state);
 const input={operation:'saveDailyEmploymentSettings',date:h.date,revision:0,requestId:crypto.randomUUID(),subject:'Daily Updates',time:'08:00',recipients:[{staffId:'bob',emails:['bob@example.test']}]};return {...h,c,call,input};
}
{
 const h=setup(),before=h.state(),read=h.call({operation:'dailyEmployment',date:h.date});assert.equal(read.people.find(p=>p.id==='bob').emails[0],'bob@example.test');const saved=h.call(h.input);assert.deepEqual(Array.from(saved.settings.recipients[0].emails),['bob@example.test']);assert.equal(saved.notificationsQueued,0);assert.equal(saved.revision,1);assert.equal(h.calls.writes,1);assert.deepEqual(h.state().outbox,before.outbox);assert.equal(h.state().dailyEmploymentMail.length,0);assert.deepEqual(h.state().staplerPlans,before.staplerPlans);assert.equal(h.call(h.input).replayed,true);assert.equal(h.calls.writes,1);console.log('PASS actual recipient settings save and exact replay use Contacts and records only, never send mail or alter timetable');
}
{
 const h=setup();h.loseNextResponse();assert.throws(()=>h.call(h.input),/Uncertain response/);assert.equal(h.state().dailyEmploymentSettings.recipients[0].emails[0],'bob@example.test');assert.equal(h.call(h.input).replayed,true);assert.equal(h.calls.writes,1);assert.equal(h.state().audit.filter(e=>e.operation==='saveDailyEmploymentSettings').length,1);console.log('PASS uncertain committed recipient save retries exactly without duplicate audit or email');
}
{
 const h=setup(),before=h.state();assert.throws(()=>h.call({...h.input,recipients:[{staffId:'bob',emails:['unlisted@example.test']}]}),e=>e.status===400);assert.deepEqual(h.state(),before);h.c.user.rosterSMC=false;assert.throws(()=>h.call(h.input),e=>e.status===403);assert.equal(h.calls.writes,0);console.log('PASS recipient settings reject unverified email and unauthorised editor before mutation');
}
{
 const h=setup(),read=h.call({operation:'dailyEmployment',date:h.date});assert.match(read.settingsToken||'',/^[a-f0-9]{64}$/,'editable report settings must carry a settings-specific token');const concurrent=h.state();concurrent.revision=4;concurrent.acknowledgements.push({id:'other-update',at:h.ctx.iso,staffId:'bob',timetableNoticeId:'other-publication'});h.setState(concurrent);const input={...h.input,expectedSettingsToken:read.settingsToken},saved=h.call(input);assert.equal(saved.revision,5);assert.equal(h.state().acknowledgements.length,1);assert.notEqual(saved.settingsToken,read.settingsToken);assert.equal(h.call(input).replayed,true);assert.equal(h.calls.writes,1);console.log('PASS unrelated online changes do not invalidate settings save and exact retry remains idempotent');
}
{
 for(const same of [true,false]){const h=setup(),read=h.call({operation:'dailyEmployment',date:h.date}),first={...h.input,expectedSettingsToken:read.settingsToken};h.call(first);const before=h.state(),second={...first,requestId:crypto.randomUUID(),revision:before.revision,subject:same?first.subject:'Changed by a second editor'};assert.throws(()=>h.call(second),e=>e.status===409&&e.code==='SETTINGS_CONFLICT','changed settings must conflict even with the latest global revision');assert.deepEqual(h.state(),before);assert.equal(h.calls.writes,1);}console.log('PASS stale settings base cannot overwrite another editor even when the final choice matches');
}
{
 const h=setup(),before=h.state();assert.throws(()=>h.call({...h.input,expectedSettingsToken:'0'.repeat(64)}),e=>e.status===409&&e.code==='SETTINGS_CONFLICT');assert.deepEqual(h.state(),before);const concurrent=h.state();concurrent.revision=1;h.setState(concurrent);assert.throws(()=>h.call(h.input),e=>e.status===409);assert.equal(h.calls.writes,0);console.log('PASS forged settings token and stale legacy request remain blocked');
}
