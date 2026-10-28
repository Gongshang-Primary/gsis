'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs');
let failed=0;
function test(name,run){try{run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error);}}
function clock(f,time){f.ctx.now=Date.parse(f.date+'T'+time+'+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));}
function setup(published=true){
 const f=fixture();f.ctx.smcIds=['alice','bob','charlie'];f.ctx.dutySources={[f.date]:{available:true,staffIds:['alice','bob','charlie']}};
 f.state.smcDutyRoster=[{date:f.date,staffIds:['alice','bob','bob','ghost']}];
 clock(f,'06:00:00');if(published)f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:0,notifyMode:'none'});
 clock(f,'10:00:00');return f;
}
function save(f,fields={}){return f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'charlie',typeId:'mc',periods:[10],...fields});}
function notices(f){return f.state.outbox.filter(j=>j.kind==='smc_alert'&&j.data.templateKey==='absence_update');}

test('future-period emergency absence after first publication queues every verified duty SMC once',()=>{
 const f=setup(),before=JSON.stringify(f.state.dailyPublicationStates),saved=save(f);
 assert.deepEqual(notices(f).map(j=>j.recipientId),['alice','bob']);
 for(const j of notices(f)){assert.match(j.data.summary,/Emergency/i);assert.match(j.data.summary,/Charlie/);assert.match(j.data.summary,/10:00.*SGT/);assert.match(j.data.summary,/P10/);assert.equal(j.data.newAbsenceCount,1);assert.equal(j.data.audience,'duty-smc');}
 assert.equal(JSON.stringify(f.state.dailyPublicationStates),before,'reporting must not publish');
 assert.equal(f.state.smcAlerts.filter(a=>a.key.includes(saved.savedId)).length,1,'one absence must not create overlapping late and emergency alerts');
});
test('strict 14:00 boundary applies even when affected periods have already started',()=>{
 for(const [time,periods,want] of [['13:59:59',[16],2],['14:00:00',[16],0],['14:00:00',[2],0],['14:00:01',[2],0]]){
  const f=setup();clock(f,time);save(f,{periods});assert.equal(notices(f).length,want,time+' '+periods);
 }
});
test('first publication is required and its original timestamp survives later publication',()=>{
 const none=setup(false);save(none);assert.equal(notices(none).length,0);
 const f=setup();clock(f,'09:00:00');f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none'});
 assert.equal(f.state.massPublications[f.date].at,'2026-10-13T22:00:00.000Z');
 clock(f,'10:00:00');save(f);assert.equal(notices(f).length,2);
 const equal=setup();clock(equal,'06:00:00');save(equal);assert.equal(notices(equal).length,0,'an absence at the publication timestamp is not after it');
});
test('ordinary edits do not create emergency notices and existing started-period edit alerts remain',()=>{
 const f=setup(false),saved=save(f);clock(f,'10:01:00');f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none'});clock(f,'10:02:00');
 save(f,{id:saved.savedId,remarks:'Edited'});assert.equal(notices(f).length,0);assert.equal(f.state.outbox.length,0);
 clock(f,'14:30:00');save(f,{id:saved.savedId,periods:[2],remarks:'Started-period edit'});
 assert.equal(notices(f).length,0);assert.deepEqual(f.state.outbox.filter(j=>j.data.templateKey==='smc_attention').map(j=>j.recipientId),['alice','bob']);
});
test('before-publication morning alerts and only one alert when emergency overlaps morning rules',()=>{
 for(const published of [false,true]){const f=setup(published);clock(f,'07:00:00');save(f);assert.equal(notices(f).length,2);assert.equal(f.state.smcAlerts.length,1);}
});
test('future dates, missing duty verification and ineligible recipients cannot receive new emergency notices',()=>{
 const future=setup();future.ctx.days['2026-10-15']=structuredClone(future.ctx.days[future.date]);save(future,{date:'2026-10-15'});assert.equal(notices(future).length,0);
 const unavailable=setup();unavailable.ctx.dutySources[unavailable.date].available=false;save(unavailable);assert.equal(notices(unavailable).length,0);
 const restricted=setup();restricted.ctx.people.find(p=>p.id==='bob').active=false;save(restricted);assert.deepEqual(notices(restricted).map(j=>j.recipientId),['alice']);
});
test('clock-based urgent leave and legacy publication snapshots retain the emergency trigger',()=>{
 const f=setup();save(f,{coverage:{kind:'timeRange',startMinutes:720,endMinutes:780}});assert.equal(notices(f).length,2);assert.match(notices(f)[0].data.summary,/12:00.*13:00/);
 for(const source of ['daily','stapler','snapshots']){const f=setup();delete f.state.massPublications[f.date];if(source!=='daily')delete f.state.dailyPublicationStates[f.date];if(source==='stapler')f.state.staplerPlans.push({date:f.date,published:{},publishedAt:'2026-10-14T06:00:00+08:00'});if(source==='snapshots')f.state.publicationSnapshots.push({id:'legacy-pub',date:f.date,publishedAt:'2026-10-14T06:00:00+08:00'});save(f);assert.equal(notices(f).length,2,source);}
 const earliest=setup();earliest.state.massPublications[earliest.date].at='2026-10-14T11:00:00+08:00';earliest.state.dailyPublicationStates[earliest.date].publishedAt='2026-10-14T11:00:00+08:00';earliest.state.publicationSnapshots.push({id:'first-legacy-pub',date:earliest.date,publishedAt:'2026-10-14T06:00:00+08:00'});save(earliest);assert.equal(notices(earliest).length,2,'the earliest durable proof wins over a later publication timestamp');
});
test('emergency jobs recheck current duty and approved template before provider preparation',()=>{
 const h=adapter(),f=setup();Object.assign(h.ctx,f.ctx);h.setState(f.state);
 const contacts={rosterPeople:h.ctx.people,rosterSMCIds:['alice','bob','charlie'],rosterAdminIds:['alice']};h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c:contacts});
 h.call({operation:'saveAbsence',view:'report',date:h.date,staffId:'charlie',typeId:'mc',periods:[10],revision:h.state().revision,requestId:'09300000-0000-4000-8000-000000000003'});
 const call=input=>h.scope.rosterServiceDispatch_({input}),claimed=call({operation:'claimNotifications',allowedTemplateKeys:['absence_update']}).notifications;assert.deepEqual(Array.from(claimed,j=>j.recipientId),['alice','bob']);
 const state=h.state();state.smcDutyRoster[0].staffIds=['alice'];h.setState(state);
 const bob=claimed.find(j=>j.recipientId==='bob');assert.equal(call({operation:'prepareNotification',id:bob.id,claimId:bob.claimId,allowedTemplateKeys:['absence_update']}).notification,null);
 const alice=claimed.find(j=>j.recipientId==='alice');assert.equal(call({operation:'prepareNotification',id:alice.id,claimId:alice.claimId,allowedTemplateKeys:[]}).notification,null);
});
test('an emergency after an early publication bypasses quiet hours only with its durable creation evidence',()=>{
 const h=adapter(),f=setup(false);clock(f,'05:00:00');f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:0,notifyMode:'none'});clock(f,'05:30:00');Object.assign(h.ctx,f.ctx);h.setState(f.state);
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c:{rosterPeople:h.ctx.people,rosterSMCIds:['alice','bob','charlie'],rosterAdminIds:['alice']}});
 h.call({operation:'saveAbsence',view:'report',date:h.date,staffId:'charlie',typeId:'mc',periods:[10],revision:h.state().revision,requestId:'09300000-0000-4000-8000-000000000004'});
 const forged=h.state();f.O.smcAlert(forged,h.ctx,h.date,'ordinary-alert','Ordinary automatic alert',true,'smc_alert',{templateKey:'absence_update',emergencyAbsence:true,absenceId:forged.absences[0].id,newAbsenceCount:1});h.setState(forged);
 const call=input=>h.scope.rosterServiceDispatch_({input}),claimed=call({operation:'claimNotifications',allowedTemplateKeys:['absence_update']}).notifications;assert.deepEqual(Array.from(claimed,j=>j.recipientId),['alice','bob']);assert(claimed.every(j=>j.key.startsWith('emergency-absence:')),'an arbitrary flag cannot bypass quiet hours');
 for(const j of claimed)assert(call({operation:'prepareNotification',id:j.id,claimId:j.claimId,allowedTemplateKeys:['absence_update']}).notification,'early emergency remains eligible at provider preparation');
 assert(h.state().outbox.filter(j=>j.key.startsWith('ordinary-alert:')).every(j=>j.status==='queued'&&j.holdReason==='quiet-hours'));
 const unpublished=setup(false);clock(unpublished,'05:30:00');save(unpublished,{emergencyAbsence:true,absenceId:'forged'});assert.equal(notices(unpublished).length,0,'client fields cannot manufacture an emergency event');
});
test('the 14:00 cutoff controls creation without discarding a valid earlier queued emergency',()=>{
 const h=adapter(),f=setup();clock(f,'13:59:59');save(f);clock(f,'14:00:00');Object.assign(h.ctx,f.ctx);h.setState(f.state);
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c:{rosterPeople:h.ctx.people,rosterSMCIds:['alice','bob','charlie'],rosterAdminIds:['alice']}});
 const claimed=h.scope.rosterServiceDispatch_({input:{operation:'claimNotifications',allowedTemplateKeys:['absence_update']}}).notifications;assert.deepEqual(Array.from(claimed,j=>j.recipientId),['alice','bob']);
});
test('lost response retries retain one absence and one durable notice per current duty recipient',()=>{
 const h=adapter(),f=setup();Object.assign(h.ctx,f.ctx);h.setState(f.state);
 const command={operation:'saveAbsence',view:'report',date:h.date,staffId:'charlie',typeId:'mc',periods:[10],revision:h.state().revision,requestId:'09300000-0000-4000-8000-000000000001'};
 h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain response/);
 const before=h.state(),writes=h.calls.writes;assert.equal(before.absences.length,1);assert.deepEqual(before.outbox.filter(j=>j.data.templateKey==='absence_update').map(j=>j.recipientId),['alice','bob']);
 const replay=h.call(command);assert.equal(replay.replayed,true);assert.equal(h.calls.writes,writes);assert.deepEqual(h.state().outbox,before.outbox);
});
if(failed)process.exitCode=1;
