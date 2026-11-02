import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),GSiSEdgeStore=require('../shared/edge-store.js');
import {GSISRosterOperations as O,GSiSEdgeNotifications as N} from '../roster-update/public/edge-roster-domain.js';
import * as edge from '../roster-update/public/edge-notifications.js';
import {dispatchNotifications,dispatchInboxPending,dispatchDailyEmploymentReports,dispatchDeliveryReviewReports,dispatchReceivedReports,captureAbsenceTransport,scheduledRoster} from '../roster-update/public/_worker.js';

function database(){
 const sql=new DatabaseSync(':memory:'),statements=[],sessions=[],reads=[];
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){statements.push(this.text);reads.push({text:this.text,args:this.args});return sql.prepare(this.text).get(...this.args)||null;},async all(){statements.push(this.text);return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){statements.push(this.text);const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});
 return {sql,statements,sessions,reads,prepare,withSession(mode){sessions.push(mode);return this;},async batch(items){sql.exec('BEGIN');try{const results=items.map(item=>{statements.push(item.text);const q=sql.prepare(item.text);if(/^\s*(SELECT|WITH)/.test(item.text))return {success:true,results:q.all(...item.args),meta:{changes:0}};const result=q.run(...item.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
async function fixture(state=O.initial()){
 const db=database(),store=await activate(db,'roster',state),env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_AUTOMATION_ENABLED:'true',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_SERVICE_SECRET:'s'.repeat(32),WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_API_VERSION:'v22.0',WHATSAPP_ACCESS_TOKEN:'a'.repeat(40),WHATSAPP_APP_SECRET:'b'.repeat(40),EXTERNAL_LINK_SECRET:'c'.repeat(40),WHATSAPP_VERIFY_TOKEN:'d'.repeat(40),WHATSAPP_ACCOUNT_ID:'123456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'123456789',CONTACTS_PUBLIC_URL:'https://contacts.gsps.edu.sg/',WHATSAPP_TEMPLATES_JSON:'{}'};
 db.statements.length=0;db.sessions.length=0;return {db,store,env};
}
const peerToken=row=>createHash('sha256').update(JSON.stringify(N.peerMailReviewFields(row))).digest('hex');
function insert(db,collection,id,value){db.sql.prepare('INSERT OR REPLACE INTO gsis_edge_records(scope,collection,record_id,position,record_date,value_json,revision) VALUES(?,?,?,?,?,?,?)').run('roster',collection,id,0,value.date||'',JSON.stringify(value),1);}
function noHydration(db){assert(!db.statements.some(sql=>/SELECT (?:r\.)?collection,/.test(sql)),'idle dispatch must not hydrate the roster collections');assert(!db.statements.some(sql=>/^UPDATE gsis_edge_heads/.test(sql)),'idle dispatch must not create a transport receipt or revision');assert(db.sessions.includes('first-primary'),'idle decision must read the primary');}
let failures=0;
async function test(name,fn){try{await fn();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}}
globalThis.fetch=()=>assert.fail('idle D1 dispatch must not contact Google or Meta');

await test('empty notification outbox returns before claims and template work',async()=>{
 const {db,env}=await fixture(),result=await dispatchNotifications(env);
 assert.equal(result.enabled,true);assert.equal(result.claimed,0);assert.equal(result.prepareFailures,0);assert.equal(result.backendCalls,0);noHydration(db);
});
await test('empty inbox skips full roster and contacts hydration',async()=>{
 const {db,env}=await fixture(),result=await dispatchInboxPending(env);
 assert.deepEqual(result,{enabled:true,replies:0,alerts:0,unconfirmed:0});noHydration(db);
});
await test('empty peer mail and employment queues skip claims',async()=>{
 const {db,env}=await fixture();assert.equal((await edge.dispatchEdgePeerMail(env,()=>assert.fail('no mail'))).sent,0);assert.equal((await dispatchDailyEmploymentReports(env)).sent,0);noHydration(db);
});
await test('completed daily delivery report skips cold-start template checks and hydration',async()=>{
 const state=O.initial(),date='2026-10-26';state.deliveryReview={reports:{[date]:{status:'done',date}}};
 const {db,env}=await fixture(state),result=await dispatchDeliveryReviewReports(env,Date.parse(date+'T08:05:00+08:00'));
 assert.equal(result.alreadyReported,true);assert.equal(result.date,date);noHydration(db);
});
await test('idle received reports do not acquire empty transport leases',async()=>{
 const {db,env}=await fixture(),result=await dispatchReceivedReports(env);
 assert.equal(result.hasMore,false);assert.equal(result.transport.claimed,0);assert.equal(result.intake.claimed,0);
 assert(!db.statements.some(sql=>/^UPDATE gsis_absence_transport/.test(sql)),'no empty transport claim writes');assert(db.sessions.includes('first-primary'));
});
await test('new and retryable work remains visible after an idle read',async()=>{
 const {db,env}=await fixture();
 for(const status of ['queued','blocked','sending','failed','uncertain','preparing','claimed']){
  insert(db,'outbox','id:notice',{id:'notice',status,attempts:1,expiresAt:Date.now()+600000,claimExpiresAt:Date.now()-1});assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),true,status);
 }
 for(const status of ['sent','cancelled','superseded','expired']){insert(db,'outbox','id:notice',{id:'notice',status});assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),false,status);}
 insert(db,'outbox','id:new-notice',{id:'new-notice',status:'queued'});assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),true,'fresh primary read must see a new same-isolate intent');
});
await test('notification reconciliation survives terminal rows and unmatched receipts',async()=>{
 const {db,env}=await fixture();insert(db,'outbox','id:notice',{id:'notice',status:'cancelled',deliveryStatus:'read'});assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),true,'provider delivery must repair an obsolete terminal state');
 db.sql.prepare("DELETE FROM gsis_edge_records WHERE collection='outbox'").run();insert(db,'notificationTransport','key:unmatchedDeliveryEvents',[{eventId:'early',retainedAt:Date.now()}]);assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),true,'unmatched delivery receipts retain replay and expiry processing');
});
await test('inbox gates preserve queued sends, expiration and legacy nested inboxes',async()=>{
 const {db,env}=await fixture();
 for(const collection of ['inboxMessages','inboxAlerts'])for(const status of ['queued','sending']){insert(db,collection,'id:item',{id:'item',direction:'outbound',status,createdAt:1,preparedAt:1});assert.equal(await edge.edgeDispatchHasWork(env,'inbox'),true);db.sql.prepare('DELETE FROM gsis_edge_records WHERE collection=?').run(collection);}
 insert(db,'inboxMessages','id:incoming',{id:'incoming',direction:'inbound',status:'received'});assert.equal(await edge.edgeDispatchHasWork(env,'inbox'),false);
 insert(db,'inbox','key:messages',[{id:'old-format',direction:'outbound',status:'queued'}]);assert.equal(await edge.edgeDispatchHasWork(env,'inbox'),true,'legacy inbox before packing must not be skipped');
});
await test('peer and employment gates preserve recovery and new request discovery',async()=>{
 const {db,env}=await fixture();
 insert(db,'requests','id:request',{id:'request',status:'pending',expiresAt:Date.now()+600000,date:'2099-01-01'});assert.equal(await edge.edgeDispatchHasWork(env,'peerMail'),true,'new proposals may not yet have a mail row');
 insert(db,'requests','id:request',{id:'request',status:'pending',expiresAt:1,date:'2020-01-01'});assert.equal(await edge.edgeDispatchHasWork(env,'peerMail'),false,'expired proposals without live mail need no new sync');
 db.sql.prepare("DELETE FROM gsis_edge_records WHERE collection='requests'").run();
 for(const status of ['queued','blocked','sending','uncertain']){insert(db,'peerMail','id:mail',{id:'mail',status,claimExpiresAt:1});assert.equal(await edge.edgeDispatchHasWork(env,'peerMail'),true,status);}
 for(const status of ['queued','sending']){insert(db,'dailyEmploymentMail','id:mail',{id:'mail',status,claimedAt:'2020-01-01'});assert.equal(await edge.edgeDispatchHasWork(env,'employmentMail'),true,status);}
 insert(db,'dailyEmploymentMail','id:mail',{id:'mail',status:'sent'});assert.equal(await edge.edgeDispatchHasWork(env,'employmentMail'),false);
});
await test('idle peer mail reports no drain and does not count completed history',async()=>{
 const {db,env}=await fixture();for(let n=0;n<2000;n++)insert(db,'peerMail','id:cancelled-'+n,{id:'cancelled-'+n,status:'cancelled'});assert.equal((await edge.dispatchEdgePeerMail(env,()=>assert.fail('no mail'))).cancelled,0);assert(!db.statements.some(sql=>/COUNT\(\*\).*peerMail/.test(sql)),'idle ticks do not aggregate cumulative cancellation history');noHydration(db);
});
await test('handled uncertain peer mail stays idle while escalation creation, refresh and resolution remain visible',async()=>{
 const summary='Email delivery for the peer arrangement proposed to Teacher is unconfirmed. Check with the colleague before sending again. The absence remains recorded.';
 for(const [status,alert] of [['uncertain',null],['uncertain',{status:'open',summary}],['uncertain',{status:'resolved',summary}],['uncertain',{status:'open',summary:'old summary'}],['sent',{status:'open',summary}],['sent',{status:'resolved',summary}],['cancelled',{status:'open',summary}],['cancelled',null]]){
  const state=O.initial();state.peerMail=[{id:'mail',requestId:'old-request',status,recipientName:'Teacher'}];state.smcAlerts=alert?[{id:'alert',key:'delivery:peer-mail:mail',closedAt:'2026-10-25T00:00:00Z',...alert}]:[];
  N.peerMailHealth(state.peerMail,peerToken);
  const after=structuredClone(state);N.peerMailSync(after,after,[],Date.now());const expected=JSON.stringify([after.peerMail,after.smcAlerts])!==JSON.stringify([state.peerMail,state.smcAlerts]),{env}=await fixture(state);
  assert.equal(await edge.edgeDispatchHasWork(env,'peerMail'),expected,JSON.stringify({status,alert}));
 }
 const {db,env}=await fixture();for(let n=0;n<2000;n++){const handled={id:'handled-'+n,status:'uncertain',recipientName:'Teacher'};N.peerMailHealth([handled],peerToken);insert(db,'peerMail','id:handled-'+n,handled);insert(db,'smcAlerts','id:peer-alert-'+n,{id:'peer-alert-'+n,key:'delivery:peer-mail:handled-'+n,status:'open',summary,closedAt:'2026-10-25T00:00:00Z'});}
 assert.equal((await edge.dispatchEdgePeerMail(env,()=>assert.fail('no mail'))).sent,0);noHydration(db);
});
await test('handled failures and uncertain sends stay idle without hiding retries, normalization or missing alerts',async()=>{
 const now=Date.now(),base={id:'notice',status:'failed',retryable:false,attempts:3,expiresAt:now-1,mobile:'6590000001',error:'META_132000'};
 const cases=[
  {},{status:'uncertain'},{retryable:true,error:'META_1',attempts:1,expiresAt:now+600000},
  {retryable:true,error:'META_132000'},{retryable:false,nextAttemptAt:now+60000},
  {retryable:true,error:'MISSING_OR_INVALID_TEMPLATE_FIELD: name'},{retryable:true,error:'ordinary',providerError:{code:132001}},
  {retryable:true,error:'META_132000',providerError:{code:1}},{retryable:true,error:'META_132000x'},
  {retryable:true,error:'ordinary',attempts:0,expiresAt:now+60000},{status:'uncertain',deliveryStatus:'read'},
  {retryable:false,nextAttemptAt:0},{retryable:true,error:'FINAL_RUN_INCOMPLETE'},
 ];
 for(const override of cases)for(const alerted of [false,true]){
  const state=O.initial(),notice={...base,...override};state.outbox=[notice];if(alerted)state.smcAlerts=[{id:'handled',key:'delivery:notice',status:'resolved'}];
  const expected=N.retry(structuredClone(state),now),{env}=await fixture(state);
  assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),expected,JSON.stringify({override,alerted}));
 }
 const {db,env}=await fixture();
 for(let n=0;n<2000;n++){insert(db,'outbox','id:handled-'+n,{...base,id:'handled-'+n,status:n%2?'failed':'uncertain'});insert(db,'smcAlerts','id:alert-'+n,{id:'alert-'+n,key:'delivery:handled-'+n,status:n%3?'resolved':'open',closedAt:'2026-10-25T00:00:00Z'});}
 assert.equal((await dispatchNotifications(env)).claimed,0);noHydration(db);
 const query=db.reads.findLast(query=>query.text.includes('AS has_work')),plan=db.sql.prepare('EXPLAIN QUERY PLAN '+query.text).all(...query.args).map(row=>row.detail).join('\n');assert(plan.includes('gsis_edge_alert_key'),plan);
});
await test('delivery report gate retains older pending work and reads completion freshly',async()=>{
 const state=O.initial(),date='2026-10-26';state.deliveryReview={reports:{[date]:{status:'done',date}}};const {db,env}=await fixture(state);
 assert.equal(await edge.edgeDispatchHasWork(env,'deliveryReview',date),false);
 insert(db,'deliveryReview','key:reports',{[date]:{status:'done',date},'2026-10-25':{status:'pending',date:'2026-10-25',claimExpiresAt:1}});assert.equal(await edge.edgeDispatchHasWork(env,'deliveryReview',date),true);
 assert.equal(await edge.edgeDispatchHasWork(env,'deliveryReview','2026-10-27'),true,'next day still needs a report');
 db.sql.prepare("UPDATE gsis_edge_heads SET mode='paused' WHERE scope='roster'").run();await assert.rejects(edge.edgeDispatchHasWork(env,'inbox'),/active/i);
});
await test('received queue retains future retries and recovers expired claims',async()=>{
 const {db,env}=await fixture(),command={operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),staffId:'staff',date:'2026-10-26',typeId:'mc',fullDay:true};
 await captureAbsenceTransport(env,{email:'staff@gsps.edu.sg',subject:'staff'},command);
 db.sql.prepare('UPDATE gsis_absence_transport SET available_at=?').run(Date.now()+600000);
 assert.equal((await dispatchReceivedReports(env)).transport.claimed,0,'future retry is not claimed early');
 db.sql.prepare("UPDATE gsis_absence_transport SET state='claimed',lease_until=1").run();
 const result=await dispatchReceivedReports(env,{limit:1,budgetMs:10000});assert.equal(result.transport.claimed,1,'expired claim is retried');
 assert.equal(db.sql.prepare('SELECT state FROM gsis_absence_transport').get().state,'queued','backend unavailable keeps durable report queued');
});
await test('dispatch probes use narrow indexes despite 2000 completed history rows per collection',async()=>{
 const {db,env}=await fixture();db.sql.exec('BEGIN');
 for(let n=0;n<2000;n++)for(const collection of ['outbox','inboxMessages','inboxAlerts','peerMail','requests','smcAlerts','dailyEmploymentMail'])insert(db,collection,'id:history-'+n,{id:'history-'+n,status:collection==='requests'?'approved':collection==='smcAlerts'?'resolved':'sent',direction:'outbound',date:'2020-01-01',expiresAt:1});
 db.sql.exec('COMMIT');
 const cases={notifications:['gsis_edge_dispatch_outbox'],inbox:['gsis_edge_dispatch_inbox_messages','gsis_edge_dispatch_inbox_alerts'],peerMail:['gsis_edge_dispatch_peer_mail','gsis_edge_dispatch_peer_requests','gsis_edge_dispatch_peer_alerts'],employmentMail:['gsis_edge_dispatch_employment_mail']};
 for(const [kind,indexes] of Object.entries(cases)){
  assert.equal(await edge.edgeDispatchHasWork(env,kind),false,kind+' is idle with completed history');
  const query=db.reads.at(-1),plan=db.sql.prepare('EXPLAIN QUERY PLAN '+query.text).all(...query.args).map(row=>row.detail).join('\n');
  for(const index of indexes)assert(plan.includes(index),kind+' must use '+index+'\n'+plan);
 }
 insert(db,'outbox','id:recover',{id:'recover',status:'sending',claimExpiresAt:1});assert.equal(await edge.edgeDispatchHasWork(env,'notifications'),true,'expired sending remains indexed');
 insert(db,'inboxMessages','id:recover',{id:'recover',status:'sending',direction:'outbound',preparedAt:1});assert.equal(await edge.edgeDispatchHasWork(env,'inbox'),true,'stale outbound remains indexed');
 insert(db,'peerMail','id:recover',{id:'recover',status:'uncertain'});assert.equal(await edge.edgeDispatchHasWork(env,'peerMail'),true,'unconfirmed mail remains indexed for alerts');
 insert(db,'dailyEmploymentMail','id:recover',{id:'recover',status:'sending',claimedAt:'2020-01-01'});assert.equal(await edge.edgeDispatchHasWork(env,'employmentMail'),true,'expired employment claim remains indexed');
});
await test('D1 scheduler wrapper does not call Calendar HTTP before edge preflight',async()=>{
 const {db,env}=await fixture();env.CALENDAR_APPS_SCRIPT_URL='https://script.google.com/macros/s/calendar-fixture/exec';env.CALENDAR_PROXY_SECRET='calendar-secret'.repeat(4);let networkCalls=0;globalThis.fetch=()=>{networkCalls++;throw Error('unexpected Calendar HTTP');};
 try{await scheduledRoster(env,Date.now());}catch{}
 assert.equal(networkCalls,0,'D1 uses verified references, not the legacy Calendar HTTP adapter');
 try{await scheduledRoster({...env,ROSTER_EDGE_AUTHORITY:'legacy'},Date.now());}catch{}
 assert(networkCalls>0,'legacy scheduling retains its Calendar HTTP adapter');
});
if(failures)process.exitCode=1;else console.log('roster096 dispatch idle gates passed');
