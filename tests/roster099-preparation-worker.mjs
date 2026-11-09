import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createHmac} from 'node:crypto';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),Import=require('../shared/roster-import.js'),database=require('./helpers/chunked-import-db.cjs');

function fixture(options={}){
 const db=database(),who={email:'admin@gsps.edu.sg',subject:'admin'},requestId=crypto.randomUUID(),sessionId=sha256Hex(JSON.stringify([who.email,requestId]));
 const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/preparation-fixture/exec',GSIS_SECRET:'b'.repeat(32),ROSTER_SERVICE_SECRET:'s'.repeat(32)};
 const binding={actor:who.email,requestId,sessionId},store=Import.open(db,binding),calls=[],files=new Map(),checkpoints=new Map();
 let admin=true,loseNext=false,held=false,release,abandonFailure=false,abandoned=null;
 const frozen=Import.freeze({sourceDigest:'a'.repeat(64),state:{revision:0,rows:[{id:'one',value:'frozen'}]},index:{entries:[]}},binding,{hash:sha256Hex,gzip:value=>[...gzipSync(value)],base64:bytes=>Buffer.from(bytes).toString('base64')});
 function checkpoint(ordinal){return {fileId:'drive-private-'+sessionId+'-'+ordinal,digest:sha256Hex('checkpoint-'+ordinal)};}
 function step(ordinal){
  if(!checkpoints.has(ordinal)){
   const common={adminVerified:true,sessionId,requestId,sourceDigest:frozen.manifest.sourceDigest,step:ordinal+1,done:ordinal+1,total:2,elapsedMs:47000,checkpointInputDigest:sha256Hex(JSON.stringify({sessionId,ordinal,checkpoint:ordinal===0?null:checkpoint(ordinal)})),preparation:{ordinal:ordinal+1,checkpoint:checkpoint(ordinal+1)}};
   checkpoints.set(ordinal,ordinal===0?{...common,preparing:true,retryAfterMs:1000}:{...common,manifest:frozen.manifest,manifestDigest:frozen.manifestDigest});
   files.set(checkpoint(ordinal+1).fileId,checkpoints.get(ordinal));
  }
  return checkpoints.get(ordinal);
 }
 globalThis.fetch=async(_url,optionsFetch)=>{
  const req=JSON.parse(JSON.parse(optionsFetch.body).payload),p=req.input;calls.push(p);
  if(p.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]}}});
  if(p.operation==='edgeExportCheckpoint'){const result=checkpoints.get(p.preparation.ordinal);return Response.json({ok:true,data:result?{...result,completed:true}:{adminVerified:true,sessionId,completed:false}});}
  if(p.operation==='edgeExportManifest'){
   assert.equal(p.sessionId,sessionId);assert.equal(p.requestId,requestId);
   if(options.failureReason)return Response.json({ok:false,status:503,error:'Roster is temporarily unavailable.',failureReason:options.failureReason});
   const ordinal=p.preparation?.ordinal;assert(Number.isInteger(ordinal));assert(ordinal===0?p.preparation.checkpoint===null:p.preparation.checkpoint.fileId===checkpoint(ordinal).fileId);
   if(options.holdFirst&&!held){held=true;await new Promise(resolve=>{release=resolve;});}
   if(loseNext&&options.deferCheckpoint){loseNext=false;throw Error('lost preparation response');}
   const result=step(ordinal);
   if(loseNext){loseNext=false;throw Error('lost preparation response');}
   return Response.json({ok:true,data:result});
  }
  if(p.operation==='edgeExportAbandon'){
   assert.equal(db.sql.prepare('SELECT state FROM gsis_roster_import_sessions WHERE session_id=?').get(sessionId).state,'abandoned','D1 reset must fence import completion before Google cleanup');
   if(abandonFailure)return Response.json({ok:false,status:503,error:'abandon not confirmed'});
   assert.equal(p.requestId,requestId);assert.equal(p.sessionId,sessionId);
   if(abandoned)assert.equal(abandoned,p.resetRequestId);abandoned=p.resetRequestId;
   return Response.json({ok:true,data:{adminVerified:true,abandoned:true,sessionId,resetRequestId:p.resetRequestId}});
  }
  if(p.operation==='edgeFence')assert.fail('preparation and restart never fence production');
  throw Error('Unexpected fixture operation '+p.operation);
 };
 return {db,who,requestId,sessionId,env,store,calls,files,import:()=>edgeRosterMigration(env,{operation:'import',requestId,sessionId},who),status:()=>edgeRosterMigration(env,{operation:'status'},who),restart:id=>edgeRosterMigration(env,{operation:'restart',requestId:id,importRequestId:requestId,sessionId},who),lose:()=>{loseNext=true;},setAdmin:value=>{admin=value;},failAbandon:value=>{abandonFailure=value;},isHeld:()=>held,release:()=>release(),manifestCalls:()=>calls.filter(p=>p.operation==='edgeExportManifest')};
}

const originalNow=Date.now;let now=Date.parse('2026-10-31T13:00:00+08:00');Date.now=()=>now;
try{
 const f=fixture();
 const first=await f.import();assert.equal(first.preparing,true);assert.equal(first.step,1);assert.equal(first.done,1);assert.equal(first.total,2);assert.equal(first.elapsedMs,47000);
 assert.equal(f.manifestCalls().length,1,'one poll performs one preparation step');
 const status=await f.status();assert.equal(status.importSession.done,1);assert(!JSON.stringify(status).includes('drive-private-'));
 const ready=await f.import();assert.equal(ready.state,'staging');assert.equal(f.manifestCalls().length,2);assert.equal(f.manifestCalls()[1].preparation.ordinal,1);
 assert.equal((await f.store.preparationStatus()).checkpoint.fileId,'drive-private-'+f.sessionId+'-2');
 const evidence=await f.store.evidence();assert(!JSON.stringify(evidence).includes('drive-private-'));

 const concurrent=fixture({holdFirst:true}),running=concurrent.import();
 while(!concurrent.isHeld())await new Promise(setImmediate);
 const waiting=await concurrent.import();assert.equal(waiting.preparing,true);assert.equal(concurrent.manifestCalls().length,1,'concurrent poll never starts another Apps Script step');
 concurrent.release();await running;

 const timeout=fixture({deferCheckpoint:true});timeout.lose();await assert.rejects(timeout.import(),error=>error.code==='ROSTER_BRIDGE_NETWORK');
 assert.equal((await timeout.store.preparationStatus()).busy,true,'ambiguous timeout retains its lease');
 const timeoutReason=(await timeout.status()).importSession.failureReason;assert.equal(timeoutReason.message,'The Google bridge connection failed.');assert.equal(timeoutReason.phase,'capture');assert.equal(timeoutReason.status,503);
 await timeout.import();assert.equal(timeout.manifestCalls().length,1,'retry waits while the previous execution could still run');
 now+=Import.PREPARATION_LEASE_MS+1;await timeout.import();assert.deepEqual(timeout.manifestCalls().map(p=>p.preparation.ordinal),[0,0]);
 assert.equal((await timeout.store.preparationStatus()).ordinal,1,'expired lease repeats only the uncommitted batch');
 assert.equal((await timeout.status()).importSession.failureReason,undefined,'a successful retry clears the earlier attempt failure');

 const recovered=fixture();recovered.lose();const adopted=await recovered.import();assert.equal(adopted.step,1);assert.equal(recovered.manifestCalls().length,1,'a completed checkpoint is adopted without another write');assert.equal((await recovered.store.preparationStatus()).busy,false);

 const failureReason={status:413,message:'The frozen source exceeds the capture bound.',phase:'capture-serialize',elapsed:41335},diagnostic=fixture({failureReason});
 await assert.rejects(diagnostic.import(),/capture-serialize/);assert.deepEqual((await diagnostic.status()).importSession.failureReason,{...failureReason,code:'ROSTER_GOOGLE_ERROR',ordinal:0,bytes:null,records:null});assert.equal((await diagnostic.store.preparationStatus()).busy,true,'backend failures retain the lease until the execution horizon');

 const late=fixture({holdFirst:true}),old=late.import();while(!late.isHeld())await new Promise(setImmediate);
 now+=Import.PREPARATION_LEASE_MS+1;await late.import();late.release();await assert.rejects(old,e=>e.code==='ROSTER_IMPORT_PREPARATION_STALE');
 assert.equal((await late.store.preparationStatus()).ordinal,1,'late execution cannot overwrite the accepted checkpoint');

 const restart=fixture();await restart.import();restart.failAbandon(true);const resetId=crypto.randomUUID();
 await assert.rejects(restart.restart(resetId),e=>e.code==='ROSTER_IMPORT_CLEANUP_PENDING');
 assert.equal(restart.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_locks').get().n,0,'atomic D1 reset releases only its own reservations before independent cleanup');
 assert.equal(restart.db.sql.prepare('SELECT state,reset_request FROM gsis_roster_import_sessions').get().state,'abandoned');
 assert.equal(restart.db.sql.prepare('SELECT reset_request FROM gsis_roster_import_sessions').get().reset_request,resetId,'pending cleanup retains the stable restart identity');
 await assert.rejects(edgeRosterMigration(restart.env,{operation:'activate',sourceDigest:'a'.repeat(64)},restart.who),e=>e.code==='ROSTER_IMPORT_SOURCE_MISMATCH','reset heads cannot be activated before Google cleanup');
 restart.failAbandon(false);assert.equal((await restart.restart(resetId)).restarted,true);assert.equal(restart.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_locks').get().n,0);
 assert.equal(restart.files.size,1,'restart retains the private checkpoint file');assert.equal((await restart.store.preparationStatus()).result.done,1);
 assert.equal((await restart.restart(resetId)).restarted,true,'lost restart acknowledgement reuses the same identity');

 const changed=fixture();await changed.import();changed.db.sql.prepare("UPDATE gsis_edge_heads SET revision=1 WHERE scope='roster'").run();
 await assert.rejects(changed.restart(crypto.randomUUID()),e=>e.code==='ROSTER_RESTART_ACTIVE');assert.equal(changed.calls.filter(p=>p.operation==='edgeExportAbandon').length,0,'changed head blocks before Google is abandoned');
 const racing=fixture();await racing.import();racing.db.onBatch(statements=>{if(statements.some(s=>s.text.includes("SET state='abandoned'")))racing.db.sql.prepare("UPDATE gsis_edge_heads SET mode='active' WHERE scope='roster'").run();});
 await assert.rejects(racing.restart(crypto.randomUUID()),e=>e.code==='ROSTER_RESTART_ACTIVE');assert.equal(racing.calls.filter(p=>p.operation==='edgeExportAbandon').length,0,'activation winning before the atomic reset prevents all Google cleanup');
 const revoked=fixture();await revoked.import();revoked.setAdmin(false);await assert.rejects(revoked.import(),e=>e.code==='ROSTER_ADMIN_REQUIRED');assert.equal(revoked.manifestCalls().length,1);

 const bundle=require('../scripts/bundle-worker.cjs').bundle,Pages=await import('data:text/javascript;base64,'+Buffer.from(bundle('roster-update/public/_worker.js')).toString('base64'));
 async function gateway(f,body){
  const origin='https://roster.gsps.edu.sg',env={...f.env,ROSTER_D1_PREPARE:'import',ROSTER_PUBLIC_ORIGIN:origin},payload=JSON.stringify({purpose:'gsis-session-v1',origin,email:f.who.email,subject:f.who.subject,issued:now,expires:now+3600000}),signature=createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin).update(payload).digest('hex');
  return Pages.default.fetch(new Request(origin+'/api/edge/migration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+signature},body:JSON.stringify(body)}),env);
 }
 const gate=fixture();await gate.store.reserve();await gate.store.failPreparation();
 const gateReset=crypto.randomUUID(),resetCommand={operation:'restart',requestId:gateReset,importRequestId:gate.requestId,sessionId:gate.sessionId};gate.failAbandon(true);
 const pendingCleanup=await gateway(gate,resetCommand),pendingBody=await pendingCleanup.json();assert.equal(pendingCleanup.status,409);assert.equal(pendingBody.code,'ROSTER_IMPORT_CLEANUP_PENDING');assert(pendingBody.error.includes(gateReset),'gateway exposes the retained retry reference without claiming full success');
 assert.equal(gate.db.sql.prepare('SELECT state,reset_request FROM gsis_roster_import_sessions').get().reset_request,gateReset);
 const reloaded=await gateway(gate,{operation:'status'}),retained=(await reloaded.json()).data.importSession;assert.equal(retained.state,'abandoned');assert.equal(retained.cleanupPending,true);assert.equal(retained.resetRequestId,gateReset);assert.equal(retained.requestId,gate.requestId);assert.equal(retained.sessionId,gate.sessionId);
 const otherTab=await gateway(gate,{operation:'import',requestId:crypto.randomUUID()});assert.equal(otherTab.status,409);assert.equal((await otherTab.json()).code,'ROSTER_IMPORT_CLEANUP_PENDING','another tab cannot hide pending cleanup with a new import');
 const stillPending=await gateway(gate,{operation:'status'});assert.equal((await stillPending.json()).data.importSession.requestId,gate.requestId);
 const resumedReset={operation:'restart',requestId:retained.resetRequestId,importRequestId:retained.requestId,sessionId:retained.sessionId};
 gate.failAbandon(false);const reset=await gateway(gate,resumedReset);assert.equal(reset.status,200);const resetData=(await reset.json()).data;assert.equal(resetData.restarted,true);assert.equal(resetData.cleanupPending,false);
 const completed=await gateway(gate,{operation:'status'});assert.equal((await completed.json()).data.importSession.cleanupPending,false,'successful cleanup is durably visible after another reload');
 assert.equal(gate.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_locks').get().n,0);
 assert.equal((await gateway(gate,{operation:'activate',sourceDigest:'a'.repeat(64)})).status,404,'recovery preparation exposes restart without opening the authority activation route');
 const marker=fixture();await marker.store.reserve();await marker.store.failPreparation();const markerReset=crypto.randomUUID(),markerCommand={operation:'restart',requestId:markerReset,importRequestId:marker.requestId,sessionId:marker.sessionId};
 const markerBatch=marker.db.batch.bind(marker.db);let failMarker=true;marker.db.batch=async statements=>{if(failMarker&&statements.some(s=>s.text.includes('(session_id,cleanup_request,updated_at)'))){failMarker=false;throw Error('injected cleanup marker failure');}return markerBatch(statements);};
 const markerPending=await gateway(marker,markerCommand);assert.equal(markerPending.status,409);assert.equal((await markerPending.json()).code,'ROSTER_IMPORT_CLEANUP_PENDING','Google acknowledgment alone is not a complete restart');
 assert.equal(failMarker,false,'the failure was injected before the marker transaction');
 assert.equal((await marker.store.progress()).cleanupPending,true);assert.equal((await gateway(marker,markerCommand)).status,200,'the same restart ID repairs an unconfirmed D1 cleanup marker');
 const lostMarker=fixture();await lostMarker.store.reserve();await lostMarker.store.failPreparation();const lostMarkerBatch=lostMarker.db.batch.bind(lostMarker.db);let loseMarker=true;
 lostMarker.db.batch=async statements=>{const saved=await lostMarkerBatch(statements);if(loseMarker&&statements.some(s=>s.text.includes('(session_id,cleanup_request,updated_at)'))){loseMarker=false;throw Error('lost cleanup marker acknowledgment');}return saved;};
 const recoveredMarker=await gateway(lostMarker,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:lostMarker.requestId,sessionId:lostMarker.sessionId});assert.equal(recoveredMarker.status,200,'committed marker readback resolves a lost acknowledgment');assert.equal(loseMarker,false);assert.equal((await lostMarker.store.progress()).cleanupPending,false);
 const forbidden=fixture();await forbidden.store.reserve();await forbidden.store.failPreparation();forbidden.setAdmin(false);
 const denied=await gateway(forbidden,{operation:'restart',requestId:crypto.randomUUID(),importRequestId:forbidden.requestId,sessionId:forbidden.sessionId});assert.equal(denied.status,403);assert.equal(forbidden.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_locks').get().n,2,'fresh Admin verification remains mandatory at the actual gateway');
 console.log('PASS preparation Worker: one-step progress, private checkpoints, concurrent poll lease, timeout recovery, stale response fencing, retained restart and unchanged production authority');
}finally{Date.now=originalNow;}
