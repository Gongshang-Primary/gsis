'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
function ready(){const f=fixture(),d='2026-10-15';f.ctx.days[d]=structuredClone(f.ctx.days[f.date]);f.ctx.minute=1200;f.ctx.now=Date.parse(f.date+'T20:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.state.systemConfig.allowAdvancePublishing=true;f.state.absences.push({id:'absence',date:d,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});f.O.apply(f.state,f.ctx,{operation:'assign',date:d,demandIds:['absence:2'],staffId:'bob'});return {...f,d};}
function publish(f,notifyMode='none'){return f.O.apply(f.state,f.ctx,{operation:'publish',date:f.d,allocationRevision:f.state.dayRevisions[f.d]||0,notifyMode});}
function notify(f,extra={}){return f.O.apply(f.state,f.ctx,{operation:'notifyDaily',date:f.d,expectedPublicationRevision:f.state.dailyPublicationStates[f.d]?.revision,requestId:f.ctx.uuid(),...extra});}
{
 const f=ready();publish(f);assert.equal(f.state.outbox.length,0,'Publish Only does not send');
 const published=JSON.stringify(f.state.dailyPublicationStates[f.d]);f.state.systemConfig.allowAdvancePublishing=false;
 const view=f.O.view(f.state,f.ctx,{view:'dailyNotify',date:f.d});assert.equal(view.canPublish,false);assert.equal(view.canNotify,true,'published dates remain eligible after advance publishing disabled');
 assert.equal(notify(f,{staffId:'bob'}).notificationsQueued,1,'future individual notification queues immediately');
 const job=f.state.outbox.at(-1);assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null,'dispatcher accepts authoritative future publication');
 assert.equal(f.O.notificationCurrent(f.state,job,Date.parse(f.d+'T06:00:00+08:00')),null,'previous-evening job remains eligible on its workday');
 f.O.apply(f.state,f.ctx,{operation:'assign',date:f.d,demandIds:['absence:3'],staffId:'dora'});
 assert.equal(notify(f).notificationsQueued,2,'explicit Notify All captures saved Bob and Dora changes');assert.deepEqual(f.state.outbox.map(j=>j.recipientId).sort(),['bob','dora'],'absence-only Alice remains excluded');assert(f.state.outbox.find(j=>j.recipientId==='dora').data.communicationSnapshot,'unpublished Dora is communicated only through her explicit snapshot');assert.equal(JSON.stringify(f.state.dailyPublicationStates[f.d]),published);
 assert.throws(()=>notify(f,{expectedPublicationRevision:999}),e=>e.code==='PUBLICATION_CONFLICT');
 f.ctx.days[f.d].id='changed';assert.equal(f.O.view(f.state,f.ctx,{view:'dailyNotify',date:f.d}).canNotify,true,'saved recipient communications do not require an active publication baseline');
}
{
 const f=ready();assert.equal(publish(f,'all').notificationsQueued,0,'legacy notifyMode never sends implicitly');assert.equal(notify(f).notificationsQueued,1,'separate explicit action sends present-period changed teachers');
 const snapshotCount=f.state.publicationSnapshots.length;assert.equal(publish(f,'affected').notificationsQueued,0,'unchanged republish does not send');assert.equal(f.state.publicationSnapshots.length,snapshotCount,'advance republish retains existing assignment snapshots');
 const view=f.O.view(f.state,f.ctx,{view:'dailyNotify',date:f.d});for(const t of view.teachers){assert(!('cells' in t));assert(!('fingerprint' in t));assert(Array.isArray(t.baseline));}
 assert(f.state.dailyPublicationStates[f.d].teachers.every(t=>t.cells&&t.fingerprint),'canonical snapshot stays complete');
 const fullBytes=Buffer.byteLength(JSON.stringify(f.state.dailyPublicationStates[f.d].teachers)),viewBytes=Buffer.byteLength(JSON.stringify(view.teachers));assert(viewBytes<fullBytes*.7);console.log('Daily Notify teacher bytes:',fullBytes,'->',viewBytes);
 const job=f.state.outbox[0];delete job.data.communicationSnapshot;f.state.dailyPublicationStates[f.d].teachers.find(t=>t.staffId===job.recipientId).fingerprint='new';assert.match(f.O.notificationCurrent(f.state,job,f.ctx.now),/superseded/);
}
{
 const f=ready();assert.equal(notify(f).notificationsQueued,1);assert.equal(f.state.dailyPublicationStates[f.d],undefined,'explicit Notify does not publish');assert.equal(f.O.view(f.state,f.ctx,{view:'dailyNotify',date:f.d}).canNotify,true);
 f.state.systemConfig.allowAdvancePublishing=false;assert.throws(()=>publish(f,'all'),e=>e.status===403);
 f.state.systemConfig.allowAdvancePublishing=true;publish(f);f.ctx.today='2026-10-16';assert.throws(()=>notify(f),e=>e.status===403);
 const job={kind:'stapler_timetable',date:f.d,createdAt:f.ctx.iso,expiresAt:f.ctx.now+86400000,data:{templateKey:'stapler_timetable'}};assert.match(f.O.notificationCurrent(f.state,job,f.ctx.now),/current Singapore workday/,'legacy timetable notices keep their date guard');
 f.ctx.user.smc=false;f.ctx.user.admin=false;assert.throws(()=>notify(f),e=>e.status===403);
}

{
 const f=ready();publish(f,'all');const v=f.state.publicationSnapshots.find(v=>v.staffId==='bob');
 const now=Date.parse(f.d+'T07:40:00+08:00'),job={kind:'relief_reminder',date:f.d,recipientId:'bob',createdAt:new Date(now).toISOString(),expiresAt:now+86400000,data:{templateKey:'relief_reminder',snapshotIds:[v.id]}};
 assert.equal(f.O.notificationCurrent(f.state,job,now),null,'morning reminder accepts an assignment released in the advance daily publication');
 assert.match(f.O.notificationCurrent(f.state,{...job,createdAt:f.ctx.iso},f.ctx.now),/current Singapore workday/,'no early countdown reminders');
 const later=structuredClone(f.state);later.assignments.find(a=>a.id===v.assignmentId).publishedAt=new Date(f.ctx.now+1000).toISOString();assert.match(f.O.notificationCurrent(later,structuredClone(job),now),/Publish these duties/,'assignment released after daily snapshot is not covered by it');
 const unpublished=structuredClone(f.state);delete unpublished.dailyPublicationStates[f.d];assert.match(f.O.notificationCurrent(unpublished,structuredClone(job),now),/Publish these duties/,'legacy early assignment without released daily snapshot remains blocked');
}

{
 const f=ready();const result=f.O.apply(f.state,f.ctx,{operation:'publish',date:f.d,allocationRevision:f.state.dayRevisions[f.d]||0});assert.equal(result.notificationsQueued,0);assert.equal(f.state.outbox.length,0,'omitted legacy notification option cannot send');assert(f.state.dailyPublicationStates[f.d]);
}
console.log('PASS advance publication, individual/all notify, dispatcher validity, authority, morning reminders and compact response');
