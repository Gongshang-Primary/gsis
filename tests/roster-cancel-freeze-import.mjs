import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {test} from 'node:test';
import * as edge from '../roster-update/public/edge-roster.js';
import {readRosterCutoverFreeze,syncRosterCutoverFreeze} from '../shared/roster-cutover-freeze.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Import=require('../shared/roster-import.js'),O=require('../shared/roster-operations.js');
const who={email:'admin@gsps.edu.sg',subject:'admin'},stoppedCode='ROSTER_IMPORT_FREEZE_CANCELLED';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

function fixture(){
 const db=database(),previous=globalThis.fetch,calls=[],snapshots=new Map();let freeze={available:true,active:false,state:'cancelled',requestId:crypto.randomUUID(),frozenAt:new Date().toISOString()},pause=null;
 const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_EDGE_AUTHORITY:'legacy',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/cancel-fixture/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-fixture/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)};
 const source={sourceDigest:'a'.repeat(64),state:O.initial(),index:{schema:1,revision:0,entries:[],receipts:[]}};
 source.state.synthetic=Array.from({length:180},(_,i)=>({id:'row-'+i,date:'2026-11-03',text:'fixture'.repeat(1000)}));
 globalThis.fetch=async(_url,options)=>{
  const envelope=JSON.parse(options.body),input=typeof envelope.payload==='string'?JSON.parse(envelope.payload).input:envelope,operation=input.operation||input.action;calls.push(operation);
  if(pause?.operation===operation){const held=pause;held.entered.resolve();await held.release.promise;}
  if(operation==='rosterDates')return Response.json({ok:true,result:{dates:input.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});
  if(operation==='rosterStatisticsCalendar')return Response.json({ok:true,result:{terms:[],semesters:[]}});
  if(operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:true,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},legacyWritesDisabled:false,cutoverFreeze:{...freeze}}});
  if(operation==='edgeFreeze'){freeze={available:true,active:true,state:'frozen',requestId:input.requestId,frozenAt:new Date().toISOString()};return Response.json({ok:true,data:{cutoverFreeze:freeze}});}
  if(operation==='edgeUnfreeze'){assert.equal(input.freezeId,freeze.requestId);freeze={...freeze,active:false,state:'cancelled'};return Response.json({ok:true,data:{cutoverFreeze:freeze}});}
  if(operation==='edgeExportManifest'){
   if(!snapshots.has(input.sessionId))snapshots.set(input.sessionId,Import.freeze(source,{actor:who.email,requestId:input.requestId,sessionId:input.sessionId},{hash:sha256Hex,gzip:text=>[...gzipSync(text)],base64:bytes=>Buffer.from(bytes).toString('base64')}));
   const frozen=snapshots.get(input.sessionId);return Response.json({ok:true,data:{adminVerified:true,sessionId:input.sessionId,manifest:frozen.manifest,manifestDigest:frozen.manifestDigest}});
  }
  if(operation==='edgeExportPart'){const frozen=snapshots.get(input.sessionId),n=frozen.manifest.parts.findIndex(p=>p.id===input.partId);return Response.json({ok:true,data:{adminVerified:true,sessionId:input.sessionId,manifestDigest:frozen.manifestDigest,partId:input.partId,payload:frozen.parts[n]}});}
  if(operation==='edgeExportAbandon')return Response.json({ok:true,data:{adminVerified:true,abandoned:true,sessionId:input.sessionId,resetRequestId:input.resetRequestId}});
  throw Error('Unexpected Google call '+operation);
 };
 return {db,env,calls,snapshots,async freeze(){const requestId=crypto.randomUUID();await edge.edgeRosterMigration(env,{operation:'freeze',requestId},who);return requestId;},async start(){return edge.startEdgeRosterImport(env,{operation:'import',requestId:crypto.randomUUID()},who);},async cancel(freezeId){return edge.edgeRosterMigration(env,{operation:'cancelFreeze',freezeId,requestId:crypto.randomUUID()},who);},pause(operation){pause={operation,entered:deferred(),release:deferred()};return pause;},unpause(){pause?.release.resolve();pause=null;},close(){globalThis.fetch=previous;db.sql.close();}};
}
const evidence=db=>sha256Hex(JSON.stringify({parts:db.sql.prepare('SELECT * FROM gsis_roster_import_parts ORDER BY session_id,ordinal').all(),rows:db.sql.prepare('SELECT * FROM gsis_roster_import_rows ORDER BY session_id,scope,collection,record_id').all(),preparation:db.sql.prepare('SELECT ordinal,checkpoint_json,result_json,accepted_token FROM gsis_roster_import_preparation ORDER BY session_id').all()}));

for(const phase of ['preparation','staging'])test('confirmed cancellation stops '+phase+' and retains evidence',async()=>{
 const f=fixture();try{
  const freezeId=await f.freeze(),started=await f.start();
  if(phase==='staging'){await edge.runEdgeRosterImports(f.env,{maxSteps:1});await edge.runEdgeRosterImports(f.env,{maxSteps:1});assert(f.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_parts WHERE receipt_json IS NOT NULL').get().n>0);}
  const before=evidence(f.db);await f.cancel(freezeId);
  const job=f.db.sql.prepare('SELECT * FROM gsis_roster_import_jobs').get();assert.equal(job.state,'stopped');assert.equal(job.error_code,stoppedCode);assert.equal(job.claim_token,'');assert.equal(job.lease_until,0);
  const count=f.calls.length;await Promise.all([edge.runEdgeRosterImports(f.env),edge.runEdgeRosterImports(f.env)]);assert.equal(f.calls.length,count,'no Google call is admitted after cancellation');assert.equal(evidence(f.db),before,'rows, source checkpoint and part receipts are retained');
  const status=await edge.edgeRosterMigration(f.env,{operation:'status'},who);assert.equal(status.importSession.serverImport.code,stoppedCode);assert.equal(status.importSession.requiresRestart,true);
  await edge.startEdgeRosterImport(f.env,{operation:'import',requestId:started.requestId,sessionId:started.sessionId},who);assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs').get().state,'stopped','a repeated start never revives the cancelled job');
  await edge.edgeRosterMigration(f.env,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:started.requestId,sessionId:started.sessionId},who);
  const nextFreeze=await f.freeze(),next=await f.start();assert.notEqual(next.sessionId,started.sessionId);assert.notEqual(nextFreeze,freezeId);
  for(let n=0;n<20;n++)if((await edge.runEdgeRosterImports(f.env)).completed)break;
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_sessions WHERE session_id=?').get(next.sessionId).state,'imported','a new freeze and fresh import complete');
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs WHERE session_id=?').get(started.sessionId).state,'stopped','old job stays stopped through the later import');
 }finally{f.close();}
});

for(const phase of ['preparation','staging'])test('cancellation fences an in-flight '+phase+' response',async()=>{
 const f=fixture();try{
  const freezeId=await f.freeze();await f.start();if(phase==='staging')await edge.runEdgeRosterImports(f.env,{maxSteps:1});
  const gate=f.pause(phase==='preparation'?'edgeExportManifest':'edgeExportPart'),running=edge.runEdgeRosterImports(f.env);
  await gate.entered.promise;const before=evidence(f.db);await f.cancel(freezeId);const count=f.calls.length;f.unpause();await running;
  assert.equal(f.calls.length,count,'a late response triggers no follow-up Google call');assert.equal(evidence(f.db),before,'a late response cannot commit a checkpoint, row or receipt');
  const job=f.db.sql.prepare('SELECT * FROM gsis_roster_import_jobs').get();assert.equal(job.state,'stopped','old runner cannot overwrite the stop');assert.equal(job.error_code,stoppedCode);
  await edge.runEdgeRosterImports(f.env);assert.equal(f.calls.length,count);
 }finally{f.unpause();f.close();}
});

test('a stale cancel acknowledgement cannot stop a later freeze import',async()=>{
 const f=fixture();try{
  const first=await f.freeze();await f.start();await f.cancel(first);const old=await readRosterCutoverFreeze(f.env);
  const session=f.db.sql.prepare('SELECT * FROM gsis_roster_import_sessions').get();await edge.edgeRosterMigration(f.env,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:session.request_id,sessionId:session.session_id},who);
  await f.freeze();const started=await f.start();
  await syncRosterCutoverFreeze(f.env,{...old,available:true,active:false,state:'cancelled'},{expectedRevision:old.revision});
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs WHERE session_id=?').get(started.sessionId).state,'waiting');
  assert.equal((await readRosterCutoverFreeze(f.env)).state,'frozen');
 }finally{f.close();}
});

test('cancellation wins when staging is already waiting to commit',async()=>{
 const f=fixture();try{
  const freezeId=await f.freeze();await f.start();await edge.runEdgeRosterImports(f.env,{maxSteps:1});let before,count;
  const intercept=async statements=>{
   if(statements.some(s=>s.text.includes("UPDATE gsis_roster_import_sessions SET write_token="))){await f.cancel(freezeId);count=f.calls.length;before=evidence(f.db);}
   else f.db.onBatch(intercept);
  };
  f.db.onBatch(intercept);await edge.runEdgeRosterImports(f.env);
  assert.notEqual(count,undefined,'the real staging commit was intercepted');assert.equal(evidence(f.db),before);assert.equal(f.calls.length,count);
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs').get().state,'stopped');
 }finally{f.close();}
});

test('an unconfirmed database cancellation pauses work until status recovers the stop',async()=>{
 const f=fixture(),batch=f.db.batch;try{
  const freezeId=await f.freeze();await f.start();let rejected=false;
  f.db.batch=async statements=>{if(!rejected&&statements.some(s=>s.text.includes("SET state='failed'"))){rejected=true;throw Error('lost D1 cancellation transaction');}return batch(statements);};
  await assert.rejects(f.cancel(freezeId),/lost D1/);assert.equal((await readRosterCutoverFreeze(f.env)).state,'cancelling');
  const count=f.calls.length;await edge.runEdgeRosterImports(f.env);assert.equal(f.calls.length,count,'pending cancellation never calls Google from the runner');
  const recovered=await edge.edgeRosterMigration(f.env,{operation:'status'},who);assert.equal(recovered.cutoverFreeze.state,'cancelled');
  const job=f.db.sql.prepare('SELECT state,error_code FROM gsis_roster_import_jobs').get();assert.equal(job.state,'stopped');assert.equal(job.error_code,stoppedCode);
 }finally{f.db.batch=batch;f.close();}
});

test('a repeated cancelled proof leaves a fresh later job alone',async()=>{
 const f=fixture();try{
  const first=await f.freeze();await f.start();await f.cancel(first);const old=await readRosterCutoverFreeze(f.env);
  const session=f.db.sql.prepare('SELECT * FROM gsis_roster_import_sessions').get();await edge.edgeRosterMigration(f.env,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:session.request_id,sessionId:session.session_id},who);
  const next=await f.start();await syncRosterCutoverFreeze(f.env,{...old,available:true,active:false,state:'cancelled'},{expectedRevision:old.revision});
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs WHERE session_id=?').get(next.sessionId).state,'waiting');
 }finally{f.close();}
});

test('a cancellation that loses its transaction race cannot stop the replacement import',async()=>{
 const f=fixture();try{
  const freezeId=await f.freeze(),old=await f.start();let next;
  const intercept=async statements=>{
   if(!statements.some(s=>s.text.includes("SET state='failed'"))){f.db.onBatch(intercept);return;}
   const current=await readRosterCutoverFreeze(f.env);
   await syncRosterCutoverFreeze(f.env,{...current,available:true,active:false,state:'cancelled'},{expectedRevision:current.revision});
   await edge.edgeRosterMigration(f.env,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:old.requestId,sessionId:old.sessionId},who);
   next=await f.start();
  };
  f.db.onBatch(intercept);await f.cancel(freezeId);
  assert(next,'the first cancellation completed and a replacement was queued');
  assert.equal(f.db.sql.prepare('SELECT state FROM gsis_roster_import_jobs WHERE session_id=?').get(next.sessionId).state,'waiting');
 }finally{f.close();}
});
