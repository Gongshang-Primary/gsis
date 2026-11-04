import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac,randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
import vm from 'node:vm';
import gateway from '../roster-update/public/_worker.js';
import * as edge from '../roster-update/public/edge-roster.js';
import worker from '../notification-worker/index.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js'),O=require('../shared/roster-operations.js'),database=require('./helpers/chunked-import-db.cjs'),db=database(),previousFetch=globalThis.fetch;
const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_EDGE_AUTHORITY:'legacy',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/import-runner/exec',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),GOOGLE_CLIENT_ID:'fixture-client',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/import-calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)};
const wakes=[];env.NOTIFICATION_DISPATCH_URL='https://import-worker.gsps.edu.sg/dispatch';env.NOTIFICATION_QUEUE={async send(message){wakes.push(message);}};
const who={email:'admin@gsps.edu.sg',subject:'admin'},now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,...who,issued:now,expires:now+3600000}),signature=createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature,requestId=crypto.randomUUID();
let active=0,maximumActive=0,captures=0,browserCalls=0,admin=true,loseManifest=false,revokePart=false,losePart=false;const snapshots=new Map(),partReads=[];
const source={sourceDigest:'a'.repeat(64),state:O.initial(),index:{schema:1,revision:0,entries:[],receipts:[]}};source.state.synthetic=Array.from({length:1000},(_,n)=>({id:'row-'+n,date:'2026-11-02',text:'fixture'.repeat(300)}));
try{
 globalThis.fetch=async(url,options)=>{
  if(String(url)===env.NOTIFICATION_DISPATCH_URL)return worker.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:options.body}),env);
  const envelope=JSON.parse(options.body);if(envelope.action==='rosterDates')return Response.json({ok:true,result:{dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});if(envelope.action==='rosterStatisticsCalendar')return Response.json({ok:true,result:{terms:[],semesters:[]}});
  const input=JSON.parse(envelope.payload).input;
  if(input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},legacyWritesDisabled:false}});
  if(input.operation==='edgeExportCheckpoint')return Response.json({ok:true,data:{adminVerified:true,sessionId:input.sessionId,completed:false}});
  if(input.operation==='edgeExportManifest'){const binding={actor:who.email,requestId:input.requestId,sessionId:input.sessionId};if(!snapshots.has(input.sessionId)){captures++;snapshots.set(input.sessionId,Import.freeze(source,binding,{hash:sha256Hex,gzip:text=>[...gzipSync(text)],base64:bytes=>Buffer.from(bytes).toString('base64')}));}if(loseManifest){loseManifest=false;throw Error('Google reply lost after source capture');}const frozen=snapshots.get(input.sessionId);return Response.json({ok:true,data:{adminVerified:true,sessionId:input.sessionId,manifest:frozen.manifest,manifestDigest:frozen.manifestDigest}});}
  if(input.operation==='edgeExportPart'){active++;maximumActive=Math.max(maximumActive,active);partReads.push(input.sessionId+'/'+input.partId);await new Promise(setImmediate);active--;if(revokePart)admin=false;if(losePart){losePart=false;throw Error('part response lost');}const frozen=snapshots.get(input.sessionId),n=frozen.manifest.parts.findIndex(part=>part.id===input.partId);return Response.json({ok:true,data:{adminVerified:true,sessionId:input.sessionId,manifestDigest:frozen.manifestDigest,partId:input.partId,payload:frozen.parts[n]}});}
  throw Error('Unexpected source operation '+input.operation);
 };
 const request=new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/edge/migration',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({operation:'import',requestId})});browserCalls++;
 const response=await gateway.fetch(request,env),started=(await response.json()).data;assert.equal(started.serverDriven,true,'the initial HTTP request hands continuation to the Worker');assert.equal(captures,0,'Pages does not capture or stage the source');assert.equal(started.wake.queued,true);assert.equal(wakes.length,1);assert.equal(wakes[0].purpose,'gsis-roster-import-wake-v1');
 assert.equal(typeof edge.runEdgeRosterImports,'function');let finished=false;
 for(let tick=0;tick<20;tick++){
  let ack=false,retry=false;await worker.queue({messages:[{body:{purpose:'gsis-roster-import-wake-v1'},ack(){ack=true;},retry(){retry=true;}}]},env);
  if((await Store.open(db,'roster').head()).mode==='imported'){assert(ack);finished=true;break;}assert(retry);assert(tick<19,'bounded server ticks finish the import');
 }
 assert(finished);assert.equal(browserCalls,1,'no page polling or repeated import requests are needed');assert.equal(captures,1);assert(maximumActive>=2&&maximumActive<=4,'the Worker stages 2 to 4 independent parts concurrently');
 for(const scope of ['roster','roster-register'])assert.equal((await Store.open(db,scope).head()).mode,'imported','server continuation never activates authority');
 assert.deepEqual((await Store.open(db,'roster').load()).state.synthetic,source.state.synthetic);assert.equal(new Set(partReads).size,partReads.length,'successful parts commit once');
 const idle=await edge.runEdgeRosterImports(env);assert.equal(idle.pending,0);assert.equal(browserCalls,1,'a stalled or closed page cannot stall or restart completed server work');
 // Two cron/Queue actors cannot advance the same job concurrently. A lost
 // capture response retains the immutable source and the existing Google lease.
 const recovery=database(),recoveryEnv={...env,GSIS_JOBS:recovery},recoveryId=crypto.randomUUID();
 try{
  await edge.startEdgeRosterImport(recoveryEnv,{operation:'import',requestId:recoveryId},who);loseManifest=true;
  const beforeCapture=captures;await Promise.all([edge.runEdgeRosterImports(recoveryEnv),edge.runEdgeRosterImports(recoveryEnv)]);
  assert.equal(captures,beforeCapture+1);assert.equal((await edge.runEdgeRosterImports(recoveryEnv)).pending,1);assert.equal(captures,beforeCapture+1,'an ambiguous capture cannot be repeated while its lease is live');
  recovery.sql.exec('UPDATE gsis_roster_import_jobs SET next_at=0; UPDATE gsis_roster_import_preparation SET lease_until=0');
  await edge.runEdgeRosterImports(recoveryEnv,{maxSteps:1});assert.equal(captures,beforeCapture+1,'recovery reuses the original immutable source');
  const sessionId=recovery.sql.prepare('SELECT session_id FROM gsis_roster_import_sessions').get().session_id;
  revokePart=true;const revoked=await edge.runEdgeRosterImports(recoveryEnv,{maxSteps:1});assert.equal(revoked.needsReview,1);assert.equal(recovery.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_parts WHERE receipt_json IS NOT NULL').get().n,0,'no parallel part can commit after Admin revocation');
  revokePart=false;admin=true;await edge.startEdgeRosterImport(recoveryEnv,{operation:'import',requestId:recoveryId,sessionId},who);
  losePart=true;const lost=await edge.runEdgeRosterImports(recoveryEnv,{maxSteps:1});assert.equal(lost.pending,1);
  const accepted=recovery.sql.prepare('SELECT part_id FROM gsis_roster_import_parts WHERE receipt_json IS NOT NULL').all().map(row=>row.part_id);assert(accepted.length>=1&&accepted.length<=3,'successful parallel siblings retain their receipts');
  const readsBefore=partReads.length;recovery.sql.exec('UPDATE gsis_roster_import_jobs SET next_at=0');
  for(let n=0;n<20;n++)if((await edge.runEdgeRosterImports(recoveryEnv)).completed)break;
  assert.equal((await Store.open(recovery,'roster').head()).mode,'imported');assert.equal(captures,beforeCapture+1);
  assert(partReads.slice(readsBefore).every(id=>!accepted.some(part=>id===sessionId+'/'+part)),'accepted siblings are never fetched again');
 }finally{recovery.sql.close();admin=true;}
 // The actual cron adapter continues during cutover freeze, even without an
 // immediate wake, while every normal delivery/allocation job remains frozen.
 const cronDb=database(),objects=new Map(),cronEnv={...env,GSIS_JOBS:cronDb,ROSTER_TIMETABLE_SNAPSHOTS:{
  async put(key,input,metadata){const bytes=Buffer.from(await new Response(input).arrayBuffer());objects.set(key,{bytes,...metadata});return {key,size:bytes.length};},
  async head(key){const file=objects.get(key);return file?{size:file.bytes.length,customMetadata:file.customMetadata}:null;},
  async get(key){const file=objects.get(key);return file?{size:file.bytes.length,arrayBuffer:async()=>file.bytes}:null;}
 }};
 source.state.staplerPlans=[{id:'large-plan',date:'2026-11-02',draft:{data:randomBytes(900000).toString('base64')}}];
 try{
  await edge.startEdgeRosterImport(cronEnv,{operation:'import',requestId:crypto.randomUUID()},who);
  const forbidden=()=>assert.fail('cutover-frozen delivery/allocation must not run'),context=vm.createContext({crypto,console:{info(){},error(){}},rosterRecoveryEnvironment:value=>value,assertRecoveryWritable(){},readRosterCutoverFreeze:async()=>({active:true}),recordJobHealth:async()=>{},safeHealthError:error=>({code:error.code||'UNKNOWN_ERROR'}),dispatchRosterImports:value=>edge.runEdgeRosterImports(value),dispatchGoogleBackup:async()=>({idle:true,pending:0}),dispatchNotifications:forbidden,dispatchReceivedReports:forbidden,dispatchInboxPending:forbidden,dispatchPeerMail:forbidden,scheduledRoster:forbidden});
  vm.runInContext(fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace('export default','globalThis.worker='),context);
  for(let tick=0;tick<20;tick++){let pending;await context.worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()},cronEnv,{waitUntil(value){pending=value;}});await pending;if((await Store.open(cronDb,'roster').head()).mode==='imported')break;}
  assert.equal((await Store.open(cronDb,'roster').head()).mode,'imported');const receipts=cronDb.sql.prepare("SELECT kind,receipt_json FROM gsis_roster_import_parts WHERE kind IN ('object','segment')").all();assert(receipts.filter(row=>row.kind==='segment').length>=4);assert(receipts.every(row=>row.receipt_json),'parallel segments complete before object assembly');
  const saved=(await Store.open(cronDb,'roster').load()).state.staplerPlans[0].draft;assert(saved.edgeObject);assert(objects.has(saved.key));
 }finally{cronDb.sql.close();}
 console.log('PASS actual Pages start and isolated Queue hook and server-only completion: no page polling, four-part parallel stage, exact records/receipts and imported-only heads');
}finally{globalThis.fetch=previousFetch;db.sql.close();}
