'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
function harness(){
 const h=adapter();h.scope.crypto=crypto;vm.runInContext(fs.readFileSync('shared/edge-notification-model.js','utf8'),h.scope);
 const M=h.scope.GSiSEdgeNotifications,state=h.state(),fresh={rosterPeople:h.ctx.people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]};
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2,3],typeId:'mc'});
 h.O.apply(state,h.ctx,{operation:'assign',date:h.date,demandIds:[h.O.demand(h.ctx,state,h.date).find(row=>row.period===2).id],staffId:'bob'});
 h.O.apply(state,h.ctx,{operation:'publish',date:h.date,allocationRevision:state.dayRevisions[h.date],notifyMode:'all'});
 assert.equal(state.outbox.length,0,'Publish changes visibility without sending');
 h.O.apply(state,h.ctx,{operation:'notifyDaily',date:h.date,staffId:'bob'});
 // Keep the legacy job's live pending-intake fence; H snapshot bypass is covered separately.
 for(const job of state.outbox)delete job.data.communicationSnapshot;
 return {...h,M,state,fresh,call:(operation,input={})=>M.transport(state,{operation,dispatchId:'drain-a',allowedTemplateKeys:['stapler_timetable'],...input},fresh,h.ctx.now)};
}
{
 const h=harness(),before=JSON.stringify(h.state.assignments),first=h.call('claimNotifications',{claimProtocol:2,batchId:'batch-1'}),job=first.notifications[0];assert(job);
 assert.equal(h.state.outbox.find(j=>j.id===job.id).status,'sending');assert.equal(JSON.stringify(h.state.assignments),before,'transport cannot rewrite human allocation');
 assert.equal(h.call('claimNotifications',{claimProtocol:2,batchId:'batch-1'}).reason,'batch-already-consumed','lost handoff response never reauthorizes send');
 assert.equal(h.call('claimNotifications',{dispatchId:'drain-b'}).reason,'dispatcher-active');
 h.ctx.now+=120001;h.call('claimNotifications',{dispatchId:'drain-b'});assert.equal(h.state.outbox.find(j=>j.id===job.id).status,'uncertain','expired prepared attempts are never automatically resent');
 h.call('notificationDelivery',{eventId:'read',messageId:'wamid.one',notificationId:job.id,recipientId:job.mobile,state:'read'});
 h.call('notificationResult',{id:job.id,claimId:job.claimId,state:'uncertain'});h.call('notificationDelivery',{eventId:'old-sent',messageId:'wamid.one',notificationId:job.id,recipientId:job.mobile,state:'sent'});
 h.call('notificationDelivery',{eventId:'old-failure',messageId:'wamid.one',notificationId:job.id,recipientId:job.mobile,state:'failed'});
 assert.equal(h.state.outbox.find(j=>j.id===job.id).status,'sent');assert.equal(h.state.outbox.find(j=>j.id===job.id).deliveryStatus,'read');assert.equal(h.state.outbox.find(j=>j.id===job.id).attemptHistory[0].state,'sent','late failure cannot regress delivered attempt audit');
 assert.equal(h.call('notificationDelivery',{eventId:'read',messageId:'wamid.one',notificationId:job.id,state:'read'}).results[0].replayed,true);
}
{
 const h=harness(),job=h.call('claimNotifications').notifications[0];h.ctx.now+=120001;const retry=h.call('claimNotifications',{dispatchId:'drain-b'}).notifications.find(j=>j.id===job.id);assert(retry,'unprepared claim is safely reclaimable');
 const person=h.fresh.rosterPeople.find(p=>p.id===retry.recipientId);person.mobile='6598765432';const prepared=h.call('prepareNotifications',{claims:[retry]}).notifications[0];assert.equal(prepared.mobile,'6598765432','current directory controls routing');
 assert.equal(h.call('prepareNotifications',{claims:[retry]}).notifications.length,0,'replayed prepare cannot authorize duplicate send');
 h.call('notificationResult',{id:retry.id,claimId:retry.claimId,state:'failed',rateLimited:true,retryAfterMs:90000,providerError:{code:130429}});
 assert.equal(h.call('claimNotifications',{dispatchId:'drain-b'}).reason,'provider-cooldown');assert(h.state.notificationTransport.cooldownUntil>=h.ctx.now+90000);
}
{
 const h=harness(),job=h.call('claimNotifications').notifications[0];h.state.outbox.find(j=>j.id===job.id).status='cancelled';assert.equal(h.call('prepareNotifications',{claims:[job]}).notifications.length,0,'domain cancellation wins before preparation');
 const fresh=harness();fresh.fresh.rosterPendingAbsenceDates=[fresh.date];assert.equal(fresh.call('claimNotifications').notifications.length,0,'queued absence capture fences publication notices');
}
{
 const h=harness();h.call('notificationDelivery',{eventId:'unmatched',messageId:'wamid.unknown',state:'delivered'});assert.equal(h.state.notificationTransport.unmatchedDeliveryEvents.length,1);
 const job=h.call('claimNotifications',{claimProtocol:2,batchId:'known'}).notifications[0];h.call('notificationResult',{id:job.id,claimId:job.claimId,state:'sent',messageId:'wamid.unknown'});assert.equal(h.state.notificationTransport.unmatchedDeliveryEvents.length,0);assert.equal(h.state.outbox.find(j=>j.id===job.id).deliveryStatus,'delivered','early receipt replays after message mapping appears');
}
{
 const h=harness(),Store=require('../shared/edge-store.js'),inbox={schema:1,revision:0,threads:[{waId:'6591234567'}],messages:Array.from({length:2100},(_,i)=>({id:'wamid.fixture-'+i,text:'x'.repeat(900)})),audit:[],receipts:[{requestId:'receipt-fixture'}],deliveryEvents:[],alerts:[]},state={inbox};
 assert.throws(()=>Store.encode(state),e=>e.code==='EDGE_RECORD_TOO_LARGE','large nested inbox would violate D1 record bounds');
 h.M.packInbox(state,inbox);const before=Store.encode(state);assert.equal(state.inboxMessages.length,2100);assert.equal(state.inboxThreads[0].id,'6591234567');assert.equal(state.inboxReceipts[0].id,'receipt-fixture');
 state.inboxMessages[1000].text='changed';const after=Store.encode(state);assert.equal([...after].filter(([key,row])=>row.value_json!==before.get(key)?.value_json).length,1,'one inbox message writes one D1 record');
}
console.log('roster094 edge notifications: claims, pacing, ambiguity, current recipients, cancellation and webhook ordering passed');
