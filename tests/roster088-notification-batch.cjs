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
function fixture(h){const state=h.primary(),d=h.date;h.O.apply(state,h.ctx,{operation:'saveAbsence',date:d,staffId:'alice',periods:[2,3],typeId:'mc'});h.O.apply(state,h.ctx,{operation:'assign',date:d,demandIds:[h.O.demand(h.ctx,state,d).find(row=>row.period===2).id],staffId:'bob'});h.O.apply(state,h.ctx,{operation:'publish',date:d,allocationRevision:state.dayRevisions[d],notifyMode:'all'});assert.equal(state.outbox.length,0);h.O.notifyDaily(state,h.ctx,{date:d,staffId:'bob'});h.setPrimary(state);return state.outbox.find(row=>row.data?.dailyPublication&&row.recipientId==='bob');}
{
 const h=harness(),job=fixture(h);h.ready();
 const ready=h.call('claimNotifications',{claimProtocol:2,batchId:'batch-1',limit:12});
 assert.equal(ready.transportVersion,2);assert.equal(ready.prepared,true);assert.equal(ready.notifications.length,1);
 const row=ready.notifications[0];assert.equal(row.id,job.id);assert.equal(row.preparedAt,h.ctx.now);assert.equal(h.state().recipientLastPrepared[row.mobile],h.ctx.now);
 assert.equal(h.call('claimNotifications',{claimProtocol:2,batchId:'batch-1',limit:12}).notifications.length,0,'replaying a ready-batch response never authorizes another send');
 const result={id:row.id,claimId:row.claimId,state:'sent',messageId:'wamid.batch'};
 const finish=h.call('claimNotifications',{claimProtocol:2,batchId:'batch-2',previousResults:[result]});
 assert.equal(finish.notifications.length,0);assert.equal(h.state().outbox.find(r=>r.id===row.id).status,'sent');assert(!h.state().drainLease);
 h.call('claimNotifications',{claimProtocol:2,batchId:'batch-2',previousResults:[result]});assert.equal(h.state().outbox.find(r=>r.id===row.id).attempts,1);
}
{
 const h=harness(),job=fixture(h);h.ready();const row=h.call('claimNotifications',{claimProtocol:2,batchId:'rate-1'}).notifications[0];
 const stopped=h.call('claimNotifications',{claimProtocol:2,batchId:'rate-2',previousResults:[{id:row.id,claimId:row.claimId,state:'failed',error:'META_130429',providerError:{code:130429},rateLimited:true,retryAfterMs:120000}]});
 assert.equal(stopped.reason,'provider-cooldown');assert.equal(stopped.notifications.length,0);assert.equal(h.state().outbox.find(r=>r.id===job.id).deliveryStatus,'retry-pending');
}
{
 const h=harness(),job=fixture(h);h.ready();h.call('claimNotifications',{claimProtocol:2,batchId:'lost-1'});h.ctx.now+=120001;
 assert.equal(h.call('claimNotifications',{claimProtocol:2,batchId:'lost-2'}).notifications.length,0);
 assert.equal(h.state().outbox.find(r=>r.id===job.id).status,'uncertain','lost ready response cannot safely be resent');
}
{
 const h=harness();fixture(h);h.ready();const before=JSON.stringify(h.state());
 assert.throws(()=>h.call('claimNotifications',{claimProtocol:2,batchId:'bad-results',previousResults:new Array(21).fill({})}),/Invalid notification result batch/);
 assert.equal(JSON.stringify(h.state()),before,'invalid results abort without persistence');
}

{
 const h=harness(),job=fixture(h);h.ready();const row=h.call('claimNotifications',{claimProtocol:2,batchId:'pace-1'}).notifications[0];
 h.ctx.now+=1000;const submittedAt=h.ctx.now;
 h.call('claimNotifications',{claimProtocol:2,batchId:'pace-2',previousResults:[{id:row.id,claimId:row.claimId,state:'sent',messageId:'wamid.paced',submittedAt}]});
 assert.equal(h.state().recipientLastPrepared[row.mobile],submittedAt,'recipient pacing uses the actual provider launch, not earlier preparation');
 assert.throws(()=>h.call('claimNotifications',{claimProtocol:2,batchId:'pace-2',previousResults:[]}),/reused with different/);
}
console.log('PASS prepared batch once, atomic settlement/next claim, pacing and cooldown, lost-ready response safety.');
