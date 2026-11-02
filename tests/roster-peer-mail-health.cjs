'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const copy=v=>JSON.parse(JSON.stringify(v));
function harness(){
 let now=Date.parse('2026-11-01T08:00:00Z'),version='one',dirty=false,reads=0,writes=0,locked=false;
 let state={schema:1,revision:1,peerMail:[{id:'mail',requestId:'request',recipientId:'teacher',recipientName:'Teacher',date:'2026-11-02',email:'private@gsps.edu.sg',status:'uncertain',fingerprint:'proposal',claimId:'claim',preparedAt:100,completedAt:'2026-11-01T00:00:00Z',attempts:1,error:'unknown'}],smcAlerts:[]};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const scope=vm.createContext({Date:Clock,Map,Set,Utilities:{getUuid:crypto.randomUUID},gsisRequireBackendRole_:()=>{},props_:()=>({getProperty:key=>key==='ROSTER_VERSION_HINT'?version:key==='ROSTER_SCHEDULE_DIRTY'?dirty:null}),rosterOperationsDigest_:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),rosterNotificationEnsure_:()=>copy(state),rosterNotificationState_:()=>copy(state),rosterNotificationCopy_:copy,rosterNotificationLock_:()=>({}),deployLock_:()=>{assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},rosterNotificationCommit_:next=>{assert(locked);state=copy(next);writes++;},rosterOperationsState_:()=>{assert(!locked);reads++;return {requests:[],smcDutyRoster:[]};},MailApp:{getRemainingDailyQuota:()=>10,sendEmail:()=>assert.fail('uncertain mail must never be resent')}});
 vm.runInContext(fs.readFileSync('backend/RosterPeerMail.gs','utf8'),scope);
 return {scope,call:()=>scope.rosterPeerMailDispatch_({publicOrigin:'https://roster.test'}),state:()=>copy(state),mutate:fn=>fn(state),reads:()=>reads,writes:()=>writes,version:v=>version=v,dirty:v=>dirty=v,advance:n=>now+=n};
}
{
 const h=harness(),first=h.call();assert.equal(first.uncertain,1);assert.equal(first.newUncertain,1);assert.equal(h.state().smcAlerts.length,1);const evidence=h.state().peerMail[0];
 const second=h.call();assert.equal(second.newUncertain,0);assert.equal(second.uncertain,1);assert.equal(h.state().smcAlerts.length,1);assert.equal(h.reads(),1,'settled no-proposal drain avoids repeated full operations reads');
 assert.deepEqual(h.state().peerMail[0],evidence,'health observation never changes provider evidence on repeat');
 h.mutate(s=>s.peerMail[0].error='changed provider evidence');const changed=h.call();assert.equal(changed.newUncertain,1,'changed evidence is a new failure even at the same queue count');assert.equal(h.state().smcAlerts.length,1);
 h.version('two');h.call();assert.equal(h.reads(),3,'new operations version invalidates idle shortcut');h.dirty(true);h.call();assert.equal(h.reads(),4,'dirty operations force a full scan');h.dirty(false);h.advance(300000);h.call();assert.equal(h.reads(),5,'hint expires without renewing on idle reads');
}
{
 const h=harness();h.mutate(s=>{const row=s.peerMail[0];row.reviewReceipt={schema:1,fingerprint:h.scope.rosterPeerMailReviewToken_(row)};});
 const result=h.call();assert.equal(result.uncertain,0);assert.equal(result.reviewedUncertain,1);assert.equal(result.newUncertain,0);assert.equal(h.state().smcAlerts.length,0);h.call();assert.equal(h.reads(),1);
 h.mutate(s=>{s.peerMail.push({...s.peerMail[0],id:'other',reviewReceipt:undefined});});const mixed=h.call();assert.equal(mixed.uncertain,1);assert.equal(mixed.reviewedUncertain,1);assert.equal(mixed.newUncertain,1,'reviewed counts cannot hide a distinct unreviewed message');
}
const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace('export default ','globalThis.worker = ');
(async()=>{
 const health=[],scope=vm.createContext({Date,crypto:globalThis.crypto,assertRecoveryWritable:()=>{},safeHealthError:e=>({code:e?.code||'UNKNOWN_ERROR'}),recordJobHealth:async(_,e)=>health.push(e),console:{info(){},error(){}}});vm.runInContext(code,scope);
 for(const [data,status] of [[{uncertain:0,reviewedUncertain:2,newUncertain:0,pending:0,sent:0},'idle'],[{uncertain:1,reviewedUncertain:2,newUncertain:1,pending:0},'failure'],[{uncertain:1,reviewedUncertain:2,newUncertain:0,pending:0},'idle'],[{uncertain:1,reviewedUncertain:2,pending:0},'failure']]){
  await scope.stage({GSIS_JOBS:{prepare(){}}},'peer-mail',null,async()=>data);assert.equal(health.at(-1).status,status);assert.equal(health.at(-1).counts.uncertain,data.uncertain);
 }
 console.log('PASS peer-mail health: reviewed/mixed/new evidence, one alert, fenced idle scan, unchanged provider outcomes and legacy-safe Worker classification');
})().catch(e=>{console.error(e);process.exitCode=1;});
