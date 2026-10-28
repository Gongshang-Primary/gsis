'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const copy=v=>JSON.parse(JSON.stringify(v)),now=Date.parse('2026-10-22T05:30:00Z'),requestId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function setup(){
 let locked=false,writes=0,reads=0;
 const row=(id,status,extra={})=>({id,status,name:'Teacher '+id,date:'2026-10-22',kind:'stapler_timetable',attempts:1,expiresAt:now+60000,data:{token:'secret',timetableNoticeId:id},...extra});
 let store={schema:1,revision:1,migrationComplete:true,outbox:[row('failed','failed',{error:'META_132018'}),row('uncertain','uncertain',{preparedAt:now-1000}),row('queued','queued'),row('prepared','sending',{preparedAt:now-1000}),row('new','queued')],smcAlerts:[{key:'delivery:failed'}],deliveryEvents:[],deliveryReview:{revision:1,issues:[],monitor:[],jobs:[]},privateLinks:{secret:'untouched'}};
 const primary=copy(store);
 const scope={console,Date,Map,Set,JSON,Number,String,Array,Utilities:{getUuid:()=>crypto.randomUUID()},gsisRequireBackendRole_:()=>{},rosterOperationsAuthority_:c=>c.user,rosterOperationsDigest_:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),error_:(status,m)=>{throw Object.assign(Error(m),{status});},rosterNotificationEnsure_:()=>copy(store),rosterNotificationCheckOwner_:()=>{},rosterNotificationLock_:()=>({}),deployLock_:()=>{assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},rosterNotificationState_:()=>{reads++;return copy(store);},rosterNotificationCommit_:s=>{assert(locked);store=copy(s);writes++;},rosterNotificationSync_:()=>{},rosterOperationsState_:()=>copy(primary),LockService:{getScriptLock:()=>{throw Error('No allocation lock');}},rosterOperationsCommit_:()=>{throw Error('No allocation writes');},MailApp:{sendEmail:()=>{throw Error('No email sends');}}};
 vm.createContext(scope);for(const f of ['RosterDeliveryReview.gs','RosterNotificationMaintenance.gs'])vm.runInContext(fs.readFileSync('backend/'+f,'utf8'),scope);
 const user={smc:true,admin:true,email:'admin@school.test'};
 const run=(input,authority=user)=>scope.rosterDeliveryReviewDispatch_({input,identity:{email:authority.email}}, {user:authority});
 return {scope,run,state:()=>store,edit:f=>f(store),writes:()=>writes,reads:()=>reads};
}
{
 const h=setup();assert.throws(()=>h.run({operation:'deliveryReview'},{email:'teacher@school.test'}),e=>e.status===403);assert.equal(h.reads(),0);
 const view=h.run({operation:'deliveryReview'});assert.equal(view.issues.length,2);assert.equal(view.issues[0].reportStatus,'Waiting for 08:00 report');assert.equal(view.pending.length,2);assert.equal(view.inFlight,1);assert(!JSON.stringify(view).includes('secret'));assert.equal(h.writes(),0);
 const original=copy(h.state().outbox);const result=h.run({operation:'dismissDeliveryIssues',requestId:requestId(1),items:view.issues.map(i=>({id:i.id,token:i.token}))});assert.equal(result.changed,2);assert.equal(result.issues.length,0);assert.equal(h.writes(),1);
 for(let i=0;i<original.length;i++){const {adminReviewReceipt,...after}=h.state().outbox[i];assert.deepEqual(after,original[i]);}
 assert.equal(h.state().privateLinks.secret,'untouched');const count=h.writes();assert(h.run({operation:'dismissDeliveryIssues',requestId:requestId(1),items:view.issues.map(i=>({id:i.id,token:i.token}))}).replayed);assert.equal(h.writes(),count);
 assert.throws(()=>h.run({operation:'dismissDeliveryIssues',requestId:requestId(1),items:[]}),e=>e.status===409);
 h.edit(s=>s.outbox[0].attempts++);assert.equal(h.run({operation:'deliveryReview'}).issues.length,1,'new generation visible');
 assert.throws(()=>h.run({operation:'dismissDeliveryIssues',requestId:requestId(2),items:[{id:view.issues[0].id,token:view.issues[0].token}]}),e=>e.status===409,'old preview must not clear new failure');
}
{
 const h=setup(),view=h.run({operation:'deliveryReview'});assert.throws(()=>h.run({operation:'cancelPendingNotifications',requestId:requestId(3),items:view.pending},{smc:true,email:'smc@school.test'}),e=>e.status===403);
 const target=view.pending.find(r=>r.id==='queued');const result=h.run({operation:'cancelPendingNotifications',requestId:requestId(4),items:[{id:target.id,token:target.token}]});assert.equal(result.changed,1);
 assert.equal(h.state().outbox.find(r=>r.id==='queued').status,'cancelled');assert.equal(h.state().outbox.find(r=>r.id==='new').status,'queued');assert.equal(h.state().outbox.find(r=>r.id==='prepared').status,'sending');assert.equal(h.state().outbox.find(r=>r.id==='uncertain').status,'uncertain');
 const cancelled=h.state().outbox.find(r=>r.id==='queued');assert(cancelled.domainCancelled);assert.equal(cancelled.data.token,'secret');
}
{
 const h=setup();h.edit(s=>{s.deliveryReview.monitor=[{id:'configuration',group:'configuration',status:'invalid',cause:'Missing configuration',action:'Check settings'}];s.deliveryReview.jobs=[{id:'report',status:'queued',bindings:[]}];});const view=h.run({operation:'deliveryReview'});const config=view.issues.find(i=>i.id==='configuration');h.run({operation:'dismissDeliveryIssues',requestId:requestId(5),items:[{id:config.id,token:config.token}]});assert(!h.run({operation:'deliveryReview'}).issues.some(i=>i.id==='configuration'));
 h.edit(s=>s.deliveryReview.monitorEpochs={configuration:1});assert(h.run({operation:'deliveryReview'}).issues.some(i=>i.id==='configuration'),'new occurrence reopens');
}
console.log('PASS authenticated delivery review/clear/cancel: roles, exact preview, new failures, retry receipts, transport-only writes and historical preservation');
