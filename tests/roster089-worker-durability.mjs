import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import {assertRecoveryWritable} from '../shared/edge-recovery.js';
import {safeHealthError} from '../shared/edge-health.js';
import {rosterRecoveryEnvironment} from '../shared/roster-recovery-profile.js';
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
let sequence=0;
const moduleFor=()=>import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n// isolated fixture '+sequence++).toString('base64')));
const M=await moduleFor();
const env={WHATSAPP_DURABLE_INGRESS:'true',WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'false',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'fixture-access-'.repeat(4),WHATSAPP_APP_SECRET:'fixture-app-'.repeat(4),ROSTER_SERVICE_SECRET:'fixture-service-'.repeat(4),BRIDGE_SECRET:'fixture-bridge-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const ok=data=>Response.json({ok:true,data});
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(M.WEBHOOK_SCHEMA_SQL);
 const db={sql,failSettle:false,failBatch:false,prepare(query){return {bind(...args){return {all:async()=>({success:true,results:sql.prepare(query).all(...args)}),run:async()=>{if(db.failSettle&&query.includes("state='done'"))throw Error('lost D1 settlement');const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:result.changes}};},query,args};}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements){sql.prepare(statement.query).run(...statement.args);if(db.failBatch)throw Error('D1 unavailable');}sql.exec('COMMIT');return statements.map(()=>({success:true}));}catch(error){sql.exec('ROLLBACK');throw error;}}};return db;
}
function bucket(){
 const items=new Map();return {items,puts:[],async get(key){const value=items.get(key);return value===undefined?null:{json:async()=>JSON.parse(value)};},async put(key,value,options={}){this.puts.push(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&items.has(key))return null;items.set(key,String(value));return {etag:'fixture'};}};
}
async function webhook(messages,settings,extra={},signatureOverride){
 const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages,...extra}}]}]};
 const signed=await M.sign(event,env.WHATSAPP_APP_SECRET);
 return M.whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+(signatureOverride||signed.signature)},body:signed.payload}),settings);
}
const message=id=>({id:'wamid.'+id,from:'6590000000',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Fixture message'}});
await test('verified acceptance commits once before replying; failed commit returns 503 with no partial rows',async()=>{
 const db=database(),settings={...env,GSIS_JOBS:db};globalThis.fetch=()=>assert.fail('acceptance must not await Apps Script');
 for(let i=0;i<2;i++)assert.equal((await webhook([message('once')],settings)).status,200);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_webhook_jobs').get().n,1);
 assert.equal((await webhook([message('forged')],settings,{},'0'.repeat(64))).status,401);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_webhook_jobs').get().n,1);
 db.failBatch=true;assert.equal((await webhook([message('failed-a'),message('failed-b')],settings)).status,503);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_webhook_jobs').get().n,1);
});
await test('overlapping consumers and restart keep each accepted incoming message once',async()=>{
 const db=database(),settings={...env,GSIS_JOBS:db},seen=new Map();
 await webhook(Array.from({length:20},(_,i)=>message('concurrent-'+i)),settings);
 globalThis.fetch=async(url,init)=>{const p=JSON.parse(JSON.parse(init.body).payload).input;assert.equal(p.operation,'inboxIngest');seen.set(p.message.id,(seen.get(p.message.id)||0)+1);await new Promise(resolve=>setTimeout(resolve,2));return ok({recorded:true});};
 const fresh=await moduleFor();await Promise.all([M.dispatchWebhookJobs(settings,{limit:10,budgetMs:1000}),fresh.dispatchWebhookJobs(settings,{limit:10,budgetMs:1000})]);
 assert.equal(seen.size,20);assert([...seen.values()].every(count=>count===1));
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_webhook_jobs WHERE state='done' AND payload='' ").get().n,20);
 await fresh.dispatchWebhookJobs(settings);assert.equal([...seen.values()].reduce((a,b)=>a+b,0),20);
});
await test('lost D1 settlement after uncertain menu send never repeats the provider side effect',async()=>{
 const db=database(),settings={...env,GSIS_JOBS:db,WHATSAPP_MENU_ENABLED:'true'},receipts=new Set();let providerSends=0,uncertain=0,ingests=0;
 await webhook([message('ambiguous')],settings);db.failSettle=true;
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('graph.facebook.com')){providerSends++;throw Error('provider response lost');}
  const p=JSON.parse(JSON.parse(init.body).payload).input;
  if(p.operation==='inboxIngest'){ingests++;return ok({recorded:true});}
  if(p.operation==='inboundMessage'){if(receipts.has(p.messageId))return ok({duplicate:true,reply:null});receipts.add(p.messageId);return ok({receiptId:p.messageId,replyClaimId:'fixture-claim',reply:{action:'unknown',to:p.from}});}
  assert.equal(p.operation,'inboundReplyResult');assert.equal(p.state,'uncertain');uncertain++;return ok({recorded:true});
 };
 await assert.rejects(M.dispatchWebhookJobs(settings));assert.equal(providerSends,1);assert.equal(uncertain,1);
 db.failSettle=false;db.sql.prepare("UPDATE gsis_webhook_jobs SET lease_until=0 WHERE state='claimed'").run();
 const restarted=await moduleFor();await restarted.dispatchWebhookJobs(settings);
 assert.equal(providerSends,1);assert.equal(ingests,2);assert.equal(db.sql.prepare("SELECT state FROM gsis_webhook_jobs").get().state,'done');
});
await test('delivery statuses are durable facts and reconcile in a single backend batch',async()=>{
 const db=database(),settings={...env,GSIS_JOBS:db};let calls=0;
 const statuses=Array.from({length:10},(_,i)=>({id:'wamid.status'+i,status:'delivered',timestamp:String(Math.floor(Date.now()/1000)),recipient_id:'6590000000',biz_opaque_callback_data:'notice-'+i}));
 await webhook([],settings,{statuses});await webhook([],settings,{statuses});
 globalThis.fetch=async(url,init)=>{calls++;const p=JSON.parse(JSON.parse(init.body).payload).input;assert.equal(p.operation,'notificationDeliveryBatch');assert.equal(p.events.length,10);assert.equal(new Set(p.events.map(e=>e.eventId)).size,10);return ok({recorded:true});};
 await M.dispatchWebhookJobs(settings);assert.equal(calls,1);
});
const baseManifest={schema:1,stage:'baseline',from:'2026-10-22',to:'2026-11-21',sourceKey:'a'.repeat(64),authorityKey:'b'.repeat(64),baselineKey:'c'.repeat(64)},identity={email:'teacher@gsps.edu.sg',subject:'fixture'};
await test('thirty isolated cold readers perform one model preparation, with fresh permission checks',async()=>{
 const db=database(),r2=bucket(),settings={...env,GSIS_JOBS:db,ROSTER_TIMETABLE_SNAPSHOTS:r2,ROSTER_SNAPSHOT_CACHE:'true'};let manifests=0,preparations=0;
 globalThis.fetch=async(url,init)=>{const p=JSON.parse(JSON.parse(init.body).payload).input;if(p.manifestOnly){manifests++;return ok(baseManifest);}preparations++;assert.equal(p.expectedSourceKey,baseManifest.sourceKey);await new Promise(resolve=>setTimeout(resolve,50));return ok({...baseManifest,encoding:'json-v1',data:'{"models":[]}'});};
 const modules=await Promise.all(Array.from({length:30},()=>moduleFor())),start=performance.now();
 const results=await Promise.all(modules.map((module,i)=>module.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'}, {...identity,email:'teacher'+i+'@gsps.edu.sg'},'trace-'+i)));
 assert(results.every(row=>row.result.ok&&row.result.data.sourceKey===baseManifest.sourceKey));assert.equal(manifests,30);assert.equal(preparations,1);
 assert.equal(r2.puts.length,2);assert(r2.puts[0].includes('/content/'));assert(r2.puts[1].includes('/manifests/'));
 console.log(JSON.stringify({fixture:'30 isolated concurrent Roster snapshot readers',durationMs:Math.round(performance.now()-start),authorityChecks:manifests,modelPreparations:preparations}));
 const before=r2.puts.length;const same=await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline',knownSourceKey:baseManifest.sourceKey},identity,'warm');assert.equal(same.result.data.unchanged,true);assert.equal(same.result.data.data,undefined);assert.equal(preparations,1);assert.equal(r2.puts.length,before);
});
await test('cached projections cannot bypass fresh denial or cross a source/authority boundary',async()=>{
 const r2=bucket(),settings={...env,ROSTER_TIMETABLE_SNAPSHOTS:r2,ROSTER_SNAPSHOT_CACHE:'true'};let denied=false,sourceTag='a',scope='b',preparations=0;
 globalThis.fetch=async(url,init)=>{const p=JSON.parse(JSON.parse(init.body).payload).input;if(denied)return Response.json({ok:false,status:403,error:'No access'});const manifest={...baseManifest,sourceKey:sourceTag.repeat(64),authorityKey:scope.repeat(64)};if(p.manifestOnly)return ok(manifest);preparations++;return ok({...manifest,encoding:'json-v1',data:'{"models":[]}'});};
 await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'first');
 denied=true;assert.equal((await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'denied')).result.status,403);assert.equal(preparations,1);
 denied=false;scope='d';await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'new-scope');sourceTag='e';await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'new-source');assert.equal(preparations,3);
});
await test('a worker for another destination cannot consume queued jobs',async()=>{
 const db=database();await webhook([message('right-destination')],{...env,GSIS_JOBS:db});globalThis.fetch=()=>assert.fail('wrong destination must remain queued');
 const result=await M.dispatchWebhookJobs({...env,GSIS_JOBS:db,WHATSAPP_PHONE_NUMBER_ID:'987654321'});assert.equal(result.claimed,0);assert.equal(db.sql.prepare('SELECT state FROM gsis_webhook_jobs').get().state,'queued');
});
await test('an older snapshot finishing last cannot replace the current source manifest',async()=>{
 const r2=bucket(),settings={...env,ROSTER_TIMETABLE_SNAPSHOTS:r2,ROSTER_SNAPSHOT_CACHE:'true'};let releaseOld,oldStarted;const oldReady=new Promise(resolve=>oldStarted=resolve),oldGate=new Promise(resolve=>releaseOld=resolve);let sourceTag='a',preparations=0;
 globalThis.fetch=async(url,init)=>{const p=JSON.parse(JSON.parse(init.body).payload).input;const tag=p.expectedSourceKey||sourceTag.repeat(64),manifest={...baseManifest,sourceKey:tag};if(p.manifestOnly)return ok(manifest);preparations++;if(tag==='a'.repeat(64)){oldStarted();await oldGate;}return ok({...manifest,encoding:'json-v1',data:JSON.stringify({source:tag})});};
 const old=M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'old');await oldReady;sourceTag='f';await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'new');releaseOld();await old;
 const current=await M.timetableSnapshot(settings,{operation:'timetableBatch',stage:'baseline'},identity,'latest');assert.equal(current.result.data.sourceKey,'f'.repeat(64));assert.equal(preparations,2);
});
await test('durable ingress captures image bytes privately before completing its incoming job',async()=>{
 const db=database(),bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),objects=new Map();let downloads=0,stored;
 const settings={...env,GSIS_JOBS:db,WHATSAPP_INBOX_MEDIA:{head:async key=>objects.has(key)?{size:objects.get(key).length}:null,put:async(key,data)=>objects.set(key,data)}};
 const image={...message('private-image'),type:'image',image:{id:'998877',mime_type:'image/png',sha256:digest,caption:'Fixture image'}};
 await webhook([image],settings);
 globalThis.fetch=async(url,init)=>{
  if(String(url).includes('graph.facebook.com'))return Response.json({id:'998877',mime_type:'image/png',file_size:bytes.length,sha256:digest,url:'https://lookaside.fbsbx.com/fixture.png'});
  if(String(url).includes('lookaside.fbsbx.com')){downloads++;return new Response(bytes,{headers:{'Content-Type':'image/png'}});}
  const p=JSON.parse(JSON.parse(init.body).payload).input;assert.equal(p.operation,'inboxIngest');stored=p.message.image;return ok({recorded:true});
 };
 await M.dispatchWebhookJobs(settings);assert.equal(stored.captureStatus,'stored');assert.match(stored.objectKey,/^inbox\//);assert.equal(objects.size,1);assert.equal(downloads,1);
 await webhook([image],settings);await M.dispatchWebhookJobs(settings);assert.equal(downloads,1);
});
await test('Recovery cron preserves read claims and pending ingress instead of running noncritical cleanup',async()=>{
 const db=database(),now=Date.now();for(let i=0;i<150;i++)db.sql.prepare('INSERT INTO gsis_read_claims VALUES (?,?,?)').run('old-'+i,'expired',now-2*86400000);
 db.sql.prepare('INSERT INTO gsis_read_claims VALUES (?,?,?)').run('active','running',now+300000);
 db.sql.prepare('INSERT INTO gsis_read_claims VALUES (?,?,?)').run('recent','expired',now-3600000);
 await webhook([message('keep-pending')],{...env,GSIS_JOBS:db});
 const code=fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace(/^/,'const edgeRosterEnabled=env=>env.ROSTER_EDGE_AUTHORITY===\"d1\",edgeDeployEnabled=env=>env.DEPLOY_EDGE_AUTHORITY===\"d1\";\n').replace('export default ','globalThis.worker = '),background=[],errors=[];
 // This fixture isolates claim retention; health storage has its own SQLite tests.
 const context=vm.createContext({Date,crypto:globalThis.crypto,rosterRecoveryEnvironment,assertRecoveryWritable,safeHealthError,recordJobHealth:async()=>({recorded:false}),console:{info(){},error:value=>errors.push(JSON.parse(value))},dispatchNotifications:async()=>({sent:0}),dispatchDailyEmploymentReports:async()=>{},dispatchDeliveryReviewReports:async()=>{},scheduledRoster:async()=>({}),dispatchInboxPending:async()=>{},dispatchAllocationAudit:async()=>{},dispatchQuotaSnapshot:async()=>({idle:true}),dispatchReceivedReports:async()=>({}),dispatchPeerMail:async()=>({})});vm.runInContext(code,context);
 await context.worker.scheduled({scheduledTime:now},{GSIS_JOBS:db,WHATSAPP_DURABLE_INGRESS:'false'},{waitUntil(p){background.push(p);}});await Promise.all(background);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_read_claims').get().n,152,'minute recovery work does not scan or prune abandoned read claims');
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_read_claims WHERE id IN ('active','recent')").get().n,2);
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_webhook_jobs WHERE state='queued'").get().n,1);
 assert.deepEqual(errors,[]);
});
