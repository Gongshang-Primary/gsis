'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
function harness(){
 const h=adapter(),scope=h.scope;let primary=h.state(),files=new Map(),properties=new Map(),owner='owner@example.test',writes=[],locks=[];
 scope.gsisRequireBackendRole_=()=>{};scope.Session={getEffectiveUser:()=>({getEmail:()=>owner})};scope.ScriptApp={getScriptId:()=> 'roster-owner'};
 scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)});
 scope.rosterFindFile_=()=>null;scope.rosterReadFile_=id=>{if(!files.has(id))throw Error('missing');return files.get(id)};
 scope.rosterOperationsState_=()=>structuredClone(primary);scope.rosterOperationsCommit_=()=>{throw Error('TRANSPORT MUST NEVER WRITE OPERATIONS');};
 scope.Utilities.newBlob=data=>({data});scope.rosterCreateFile_=(folder,name,blob)=>{assert.deepEqual(locks,['script','user']);files.set('transport',blob.data);writes.push(name);return 'transport';};
 scope.rosterDriveRequest_=(url,options)=>{assert(locks.includes('user'));assert(!url.includes('operations'));files.set('transport',options.payload);writes.push('transport');return {};};
 scope.LockService={getScriptLock:()=>({kind:'script'}),getUserLock:()=>({kind:'user'})};scope.deployLock_=lock=>{assert(!locks.includes(lock.kind));if(lock.kind==='script')assert(!locks.includes('user'),'no lock inversion');locks.push(lock.kind);return true;};scope.deployUnlock_=lock=>{assert.equal(locks.pop(),lock.kind);};
 scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),scope);
 const state=()=>JSON.parse(files.get('transport')),setStore=s=>files.set('transport',JSON.stringify(s));
 const call=(operation,input={})=>scope.rosterServiceDispatch_({input:{operation,dispatchId:'dispatcher',allowedTemplateKeys:['stapler_timetable'],...input}});
 return {...h,scope,call,state,setStore,primary:()=>structuredClone(primary),setPrimary:s=>primary=structuredClone(s),owner:value=>owner=value,writes,locks,ready(){scope.rosterNotificationEnsure_();h.ctx.now+=360001;scope.rosterNotificationEnsure_();}};
}
function fixture(h){const state=h.primary(),d=h.date;h.O.apply(state,h.ctx,{operation:'saveAbsence',date:d,staffId:'alice',periods:[2,3],typeId:'mc'});h.O.apply(state,h.ctx,{operation:'assign',date:d,demandIds:[h.O.demand(h.ctx,state,d).find(row=>row.period===2).id],staffId:'bob'});h.O.apply(state,h.ctx,{operation:'publish',date:d,allocationRevision:state.dayRevisions[d],notifyMode:'none'});h.O.notifyDaily(state,h.ctx,{date:d});h.setPrimary(state);return state.outbox.find(row=>row.data?.dailyPublication&&row.recipientId==='bob');}
{
 const h=harness(),job=fixture(h),primary=h.primary(),pending=primary.outbox.find(row=>row.id===job.id);pending.data.summary='P2 old queued detail';const historyRows=['sent','uncertain'].map(status=>({...structuredClone(pending),id:'historical-'+status,date:'2026-10-13',status,messageId:status==='sent'?'wamid.history':'',completedAt:h.ctx.iso,preparedAt:h.ctx.now-60000,data:{...pending.data,summary:'P2 original '+status+' payload'}}));primary.outbox.push(...historyRows);h.setPrimary(primary);h.ready();const before=JSON.stringify(h.primary()),history=JSON.stringify(h.state().outbox.filter(row=>row.id.startsWith('historical-')));
 const claim=h.call('claimNotifications').notifications[0];assert(claim);assert.equal(claim.data.summary,'Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.');const prepared=h.call('prepareNotifications',{claims:[claim]}).notifications[0];assert.equal(prepared.data.summary,claim.data.summary);assert.equal(prepared.data.fingerprint,job.data.fingerprint);assert.equal(JSON.stringify(h.primary()),before);assert.equal(JSON.stringify(h.state().outbox.filter(row=>row.id.startsWith('historical-'))),history,'Claim and prepare preserve sent/uncertain payload audit');
}
{
 const h=harness(),job=fixture(h),p=h.primary(),legacy=p.outbox.find(row=>row.id===job.id);legacy.status='sending';legacy.claimId='old-claim';legacy.preparedAt=h.ctx.now;legacy.claimExpiresAt=h.ctx.now+120000;legacy.attempts=1;h.setPrimary(p);
 const pending=h.call('claimNotifications');assert.equal(pending.pending,true);assert.equal(pending.reason,'migration-drain');assert.equal(h.state().outbox.find(row=>row.id===job.id).preparedAt,legacy.preparedAt);
 h.ctx.now+=360001;assert.equal(h.call('claimNotifications').notifications.length,0);assert.equal(h.state().outbox.find(row=>row.id===job.id).status,'uncertain');assert.equal(h.state().migrationComplete,true);assert.equal(h.primary().outbox.find(row=>row.id===job.id).status,'sending','migration never writes primary');
}
{
 const h=harness(),job=fixture(h);h.ready();const before=JSON.stringify(h.primary()),claimed=h.call('claimNotifications',{limit:12});assert.equal(claimed.transportVersion,1);assert.equal(claimed.notifications.length,1);const row=claimed.notifications[0];assert.equal(row.id,job.id);
 const other=h.call('claimNotifications',{dispatchId:'other'});assert.equal(other.reason,'dispatcher-active');
 const prepared=h.call('prepareNotifications',{claims:[row]}).notifications[0];assert.equal(prepared.data.summary,job.data.summary,'published content frozen');
 assert.equal(h.call('prepareNotifications',{claims:[row]}).notifications.length,0,'prepare replay cannot send twice');
 h.call('notificationResults',{results:[{id:row.id,claimId:row.claimId,state:'sent',messageId:'wamid.example'}]});assert.equal(JSON.stringify(h.primary()),before,'all transport writes leave roster untouched');
 const raw=h.primary(),overlaid=h.scope.rosterNotificationOverlay_(raw);assert.equal(overlaid.outbox.find(r=>r.id===job.id).status,'sent');
 h.call('notificationDelivery',{eventId:'read-1',messageId:'wamid.example',notificationId:job.id,state:'read',recipientId:job.mobile});h.call('notificationDelivery',{eventId:'sent-late',messageId:'wamid.example',notificationId:job.id,state:'sent',recipientId:job.mobile});assert.equal(h.state().outbox.find(r=>r.id===job.id).deliveryStatus,'read');
 h.call('notificationDelivery',{eventId:'read-1',messageId:'wamid.example',notificationId:job.id,state:'read',recipientId:job.mobile});assert.equal(h.state().deliveryEvents.filter(id=>id==='read-1').length,1);
 h.owner('another@example.test');assert.throws(()=>h.call('claimNotifications'),/owner changed/);assert.deepEqual(h.locks,[]);
}
{
 const h=harness(),job=fixture(h);h.ready();const claim=h.call('claimNotifications').notifications[0],primary=h.primary();primary.outbox.find(row=>row.id===job.id).status='cancelled';primary.outbox.find(row=>row.id===job.id).error='New publication';h.setPrimary(primary);
 assert.equal(h.call('prepareNotifications',{claims:[claim]}).notifications.length,0);assert.equal(h.state().outbox.find(row=>row.id===job.id).status,'cancelled');assert.equal(h.scope.rosterNotificationOverlay_(h.primary()).outbox.find(row=>row.id===job.id).status,'cancelled');
}
{
 const h=harness(),job=fixture(h);h.ready();const claim=h.call('claimNotifications').notifications[0];h.call('prepareNotifications',{claims:[claim]});h.call('notificationResults',{results:[{id:claim.id,claimId:claim.claimId,state:'failed',error:'META_130429',providerError:{code:130429},rateLimited:true,retryAfterMs:120000}]});assert.equal(h.call('claimNotifications').reason,'provider-cooldown');
}
{
 const h=harness(),job=fixture(h);h.ready();const claim=h.call('claimNotifications').notifications[0];h.call('prepareNotifications',{claims:[claim]});const oldStore=h.state(),oldRow=oldStore.outbox.find(row=>row.id===job.id);oldRow.data.summary='P2 original prepared payload';h.setStore(oldStore);h.call('notificationResults',{results:[{id:claim.id,claimId:claim.claimId,state:'failed',error:'META_132000',providerError:{code:132000}}]});
 const primary=h.scope.rosterNotificationOverlay_(h.primary()),result=h.O.apply(primary,h.ctx,{operation:'notifyDaily',date:h.date,staffId:'bob',expectedPublicationRevision:primary.dailyPublicationStates[h.date].revision});h.setPrimary(primary);assert.equal(result.notificationOutcome.retried,1);h.ctx.now+=121000;
 const retry=h.call('claimNotifications').notifications[0];assert.equal(retry.id,job.id);assert.equal(retry.attempts,2);assert.equal(retry.attemptHistory[0].state,'failed');assert.equal(retry.data.summary,'P2 original prepared payload','Previously prepared retries retain the original body');assert.equal(h.call('prepareNotifications',{claims:[retry]}).notifications[0].data.summary,retry.data.summary);h.call('notificationResults',{results:[{id:retry.id,claimId:retry.claimId,state:'sent',messageId:'wamid.retry'}]});
 h.ctx.now+=121000;assert.equal(h.call('claimNotifications').notifications.length,0,'same retry generation cannot resend after settlement');
}
{
 const h=harness(),job=fixture(h),primary=h.primary();primary.outbox.find(row=>row.id===job.id).data.manualSend=false;h.setPrimary(primary);h.ctx.now=Date.parse(h.date+'T22:00:00+08:00');h.ready();assert.equal(h.call('claimNotifications').notifications.length,0,'automatic work remains quiet');
 const promoted=h.scope.rosterNotificationOverlay_(h.primary());h.O.apply(promoted,h.ctx,{operation:'notifyDaily',date:h.date,staffId:'bob',expectedPublicationRevision:promoted.dailyPublicationStates[h.date].revision});h.setPrimary(promoted);assert.equal(h.call('claimNotifications').notifications[0].data.manualSend,true,'explicit click promotes same intent during quiet hours');
}
{
 const h=harness(),job=fixture(h);h.ready();const claim=h.call('claimNotifications').notifications[0];h.call('prepareNotifications',{claims:[claim]});
 h.call('notificationDelivery',{eventId:'early-read',messageId:'wamid.early',state:'read',recipientId:job.mobile});assert.equal(h.state().unmatchedDeliveryEvents.length,1,'unknown receipt persisted before acknowledging webhook');
 h.call('notificationResults',{results:[{id:claim.id,claimId:claim.claimId,state:'sent',messageId:'wamid.early'}]});assert.equal(h.state().unmatchedDeliveryEvents.length,0);assert.equal(h.state().outbox.find(row=>row.id===job.id).deliveryStatus,'read');
 const store=h.state();store.schema=99;h.setStore(store);const view=h.scope.rosterNotificationOverlay_(h.primary());assert.equal(view.notificationTransportUnavailable,true);assert(!JSON.stringify(view).includes('notificationTransportUnavailable'),'availability marker is never persisted');assert.throws(()=>h.call('claimNotifications'),/administrator review/);
}
{
 const h=harness(),job=fixture(h);h.scope.rosterNotificationEnsure_();h.call('notificationDelivery',{eventId:'migration-read',messageId:'wamid.migration',notificationId:job.id,state:'read',recipientId:job.mobile});const primary=h.primary();primary.outbox.find(row=>row.id===job.id).status='failed';h.setPrimary(primary);h.ctx.now+=360001;h.scope.rosterNotificationEnsure_();assert.equal(h.state().outbox.find(row=>row.id===job.id).deliveryStatus,'read','migration cannot regress new callback proof with legacy failed snapshot');
}
console.log('PASS separate transport writes/locks, guarded migration, prepared uncertainty, frozen content, cancellation, replay safety, monotonic callbacks, current owner and cooldown.');
