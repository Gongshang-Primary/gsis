'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function harness(){
 let state={schema:1,migrationComplete:true,revision:1,outbox:[],smcAlerts:[{key:'delivery:peer-mail:peer:private@gsps.edu.sg',status:'open'}],peerMail:[{id:'peer:private@gsps.edu.sg',requestId:'peer',recipientId:'teacher',recipientName:'Teacher',date:'2026-10-26',email:'private@gsps.edu.sg',status:'uncertain',claimId:'claim',preparedAt:100,completedAt:'2026-10-26T00:00:00Z',error:'provider outcome unknown',attempts:1,fingerprint:'original'}]},locked=false,writes=0,lost=false,admin=true,lockAvailable=true;
 const clone=v=>JSON.parse(JSON.stringify(v));
 const scope={Date,Map,Set,console,gsisRequireBackendRole_:()=>{},rosterOperationsAuthority_:()=>({admin,smc:true}),rosterOperationsDigest_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterNotificationState_:()=>clone(state),rosterNotificationLock_:()=>({}),rosterNotificationCheckOwner_:()=>{},deployLock_:()=>{assert(!locked);if(!lockAvailable)return false;locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},rosterNotificationCommit_:next=>{assert(locked);state=clone(next);writes++;if(lost)throw Error('response lost after commit');},MailApp:{sendEmail:()=>assert.fail('Review must never send email'),getRemainingDailyQuota:()=>assert.fail('Review must not access MailApp')},rosterOperationsState_:()=>assert.fail('Review must not read or mutate allocation state')};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterPeerMail.gs','utf8'),scope);
 const call=(input={},email='admin@gsps.edu.sg')=>scope.rosterPeerMailReviewDispatch_({identity:{email},input:{operation:'peerMailReview',...input}},{});
 return {scope,call,state:()=>clone(state),mutate:fn=>fn(state),replace:value=>state=clone(value),writes:()=>writes,lost:value=>lost=value,admin:value=>admin=value,lock:value=>lockAvailable=value,command:()=>{const row=call().issues[0];return {operation:'reviewPeerMail',id:row.id,expectedToken:row.token,requestId:crypto.randomUUID()};}};
}
{
 const h=harness(),view=h.call();assert.equal(view.issues.length,1);assert.equal(view.counts.uncertain,1);assert(!JSON.stringify(view).includes('private@'),'Review projection must omit recipient email');assert.equal(h.writes(),0);
 const before=h.state().peerMail[0],command=h.command(),result=h.call(command);assert.equal(result.reviewed,true);assert.equal(result.messagesSent,0);assert.equal(result.counts.uncertain,0);assert.equal(result.counts.reviewedUncertain,1);assert.deepEqual(h.state().peerMail[0],{...before,reviewReceipt:h.state().peerMail[0].reviewReceipt});assert.equal(h.state().smcAlerts[0].status,'resolved');
 const checked=h.state();h.scope.rosterPeerMailAlert_(checked,checked.peerMail[0],{},Date.now());assert.equal(checked.smcAlerts[0].status,'resolved','Sync must not reopen a reviewed uncertain alert');assert.equal(h.call(command).replayed,true);assert.equal(h.writes(),1);assert.equal(h.call().issues.length,0);
 assert.throws(()=>h.call({...command,expectedToken:'b'.repeat(64)}),e=>e.status===409);assert.throws(()=>h.call(command,'other@gsps.edu.sg'),e=>e.status===409);
 h.admin(false);assert.throws(()=>h.call(),e=>e.status===403);assert.throws(()=>h.call(command),e=>e.status===403);
}
{
 const h=harness(),command=h.command();h.lost(true);assert.throws(()=>h.call(command),error=>/response lost/.test(error.message)&&error.failurePhase==='roster.peer-mail-review');h.lost(false);assert.equal(h.call(command).replayed,true);assert.equal(h.writes(),1,'Retry original identity recovers durable acknowledgement');
}
for(const mutate of [row=>row.status='sent',row=>row.claimId='new-claim',row=>row.completedAt='2026-10-26T01:00:00Z',row=>row.error='new outcome',row=>row.attempts++]){
 const h=harness(),command=h.command();h.mutate(s=>mutate(s.peerMail[0]));assert.throws(()=>h.call(command),e=>e.status===409);assert.equal(h.writes(),0,'Stale preview cannot dismiss a new outcome');
}
{
 const h=harness(),a=h.command(),b=h.command();h.call(a);assert.throws(()=>h.call(b),e=>e.status===409,'Second concurrent reviewer must refresh');
 h.mutate(s=>s.peerMail[0].claimId='new-claim');assert.equal(h.call().counts.uncertain,1,'Changed provider evidence invalidates previous review');assert.equal(h.call().counts.reviewedUncertain,0);
}
{
 const h=harness();h.lock(false);assert.throws(()=>h.call(),e=>e.status===503);h.lock(true);assert.throws(()=>h.call({},'outside@example.test'),e=>e.status===403);
 for(const fields of [{requestId:'bad'},{expectedToken:'bad'},{id:''}])assert.throws(()=>h.call({...h.command(),...fields}),e=>e.status===400);
 h.mutate(s=>s.peerMail.push({...s.peerMail[0],id:'second',status:'sending'}));assert.equal(h.call().issues.length,1);assert.equal(h.call().counts.pending,1);
}
for(const status of ['sent','uncertain']){
 const h=harness();h.call(h.command());const receipt=h.state().peerMail[0].reviewReceipt;
 h.scope.rosterPeerMailSettle_({id:h.state().peerMail[0].id,claimId:'claim'},status,status==='sent'?'':'late changed evidence',{});
 assert.deepEqual(h.state().peerMail[0].reviewReceipt,receipt,'Late provider result preserves the historical review receipt');
 assert.equal(h.call().counts.reviewedUncertain,0);
 assert.equal(h.call().counts.uncertain,status==='uncertain'?1:0,'New unresolved evidence requires a fresh review');
}
{
 const h=harness(),command=h.command(),saved=h.state();h.replace(null);
 const unavailable=h.call();assert.equal(unavailable.available,false);assert.equal(unavailable.configured,false);assert.equal(unavailable.counts,undefined,'Missing storage is not a verified zero queue');assert.equal(h.writes(),0,'Read cannot initialize notification storage');
 assert.throws(()=>h.call(command),error=>error.status===503,'Missing storage is retryable, not a stale-preview conflict');assert.equal(h.writes(),0);
 h.replace(saved);assert.equal(h.call(command).reviewed,true,'Original request remains usable when storage returns');
 h.replace({...saved,peerMail:[]});const empty=h.call();assert.equal(empty.available,true);assert.equal(empty.counts.uncertain,0,'Initialized empty storage has verified zero counts');
}
console.log('PASS 098c peer email review: current Admin authority, stale preview races, durable same-ID replay, unchanged provider evidence and no sends');
