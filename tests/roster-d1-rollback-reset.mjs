import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),Import=require('../shared/roster-import.js'),database=require('./helpers/chunked-import-db.cjs');
const db=database(),who={email:'admin@gsps.edu.sg'},env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'legacy',APPS_SCRIPT_URL:'https://script.google.com/macros/s/reset-fixture/exec',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40)},oldFetch=globalThis.fetch;
let fenced=false,admin=true,loseReply=false,cleanupCalls=0,loseCleanup=true;
try{
 globalThis.fetch=async(_,options)=>{const req=JSON.parse(JSON.parse(options.body).payload),op=req.input.operation;if(op==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,legacyWritesDisabled:fenced}});if(op==='edgeFenceStatus')return Response.json({ok:true,data:{legacyWritesDisabled:fenced}});if(op==='edgeExportAbandon'){cleanupCalls++;assert.equal(req.input.importActor,'importer@gsps.edu.sg');if(loseCleanup){loseCleanup=false;throw Error('Google cleanup response lost');}return Response.json({ok:true,data:{adminVerified:true,abandoned:true,sessionId:req.input.sessionId,resetRequestId:req.input.resetRequestId}});}throw Error('Unexpected Google operation '+op);};
 const binding={actor:'importer@gsps.edu.sg',requestId:'retained-import',sessionId:'a'.repeat(64)},original=Import.open(db,binding),hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 const frozen=Import.freeze({sourceDigest:'b'.repeat(64),state:{schema:1,revision:1,receipts:[],outbox:[{id:'unknown-send',status:'uncertain',providerId:'preserve'}]},index:{schema:1,revision:1,entries:[],receipts:[]}},binding,{hash});
 await original.reserve();await original.bind(frozen.manifest,frozen.manifestDigest);for(let i=0;i<frozen.parts.length;i++)await original.stage(frozen.manifest.parts[i].id,frozen.parts[i]);await original.referencesReady();await original.finalize();
 for(const scope of Import.SCOPES){const store=Store.open(db,scope),head=await store.head();await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:who.email,proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
 const requestId=crypto.randomUUID(),input={operation:'resetAfterRollback',requestId};
 const available=await edgeRosterMigration(env,{operation:'status'},who);assert.equal(available.scopes.length,3);assert.equal(available.canResetAfterRollback,true,'the unrelated reference head must not hide the reset for the two Roster heads');
 fenced=true;assert.equal((await edgeRosterMigration(env,{operation:'status'},who)).canResetAfterRollback,false);fenced=false;
 fenced=true;await assert.rejects(edgeRosterMigration(env,input,who),e=>e.code==='ROSTER_ROLLBACK_FENCED');
 fenced=false;await assert.rejects(edgeRosterMigration({...env,ROSTER_EDGE_AUTHORITY:'d1'},input,who),e=>e.code==='ROSTER_ROLLBACK_AUTHORITY');
 await assert.rejects(edgeRosterMigration({...env,ROSTER_EDGE_AUTHORITY:undefined},input,who),e=>e.code==='ROSTER_ROLLBACK_AUTHORITY');
 admin=false;await assert.rejects(edgeRosterMigration(env,input,who),e=>e.status===403);admin=true;
 const before=db.sql.prepare("SELECT * FROM gsis_edge_records WHERE scope IN ('roster','roster-register') ORDER BY scope,collection,record_id").all();
 const batch=db.batch.bind(db);db.batch=async statements=>{const result=await batch(statements);if(loseReply&&statements.some(s=>s.text.startsWith('INSERT INTO gsis_roster_rollback_resets'))){loseReply=false;throw Error('lost reset acknowledgement');}return result;};
 loseReply=true;await assert.rejects(edgeRosterMigration(env,input,who),/Google cleanup response lost/);const pending=await edgeRosterMigration(env,{operation:'status'},who);assert.equal(pending.rollbackResetRequestId,requestId,'a different Admin can recover the same reset after reload');assert.equal(pending.canResetAfterRollback,true);await assert.rejects(Import.open(db,{actor:who.email,requestId:'too-early',sessionId:'e'.repeat(64)}).reserve(),e=>e.code==='ROSTER_IMPORT_CLEANUP_PENDING');const reset=await edgeRosterMigration(env,input,who);assert.equal(reset.reset,true);assert.equal(reset.recordsRetained,true);assert.equal(cleanupCalls,2);assert.equal((await original.progress()).cleanupPending,false);
 for(const scope of Import.SCOPES){const head=await Store.open(db,scope).head();assert.equal(head.mode,'legacy');assert.equal(head.revision,0);assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_edge_records WHERE scope=?').get(scope).n,0);}
 const retained=db.sql.prepare("SELECT row_json FROM gsis_roster_rollback_evidence WHERE actor=? AND request_id=? AND source_table='gsis_edge_records' ORDER BY scope,record_key").all(who.email,requestId).map(row=>JSON.parse(row.row_json));
 assert.deepEqual(retained.map(row=>[row.scope,row.collection,row.record_id,row.value_json]).sort(),before.map(row=>[row.scope,row.collection,row.record_id,row.value_json]).sort());
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_outbox').get().n,0);
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_generations WHERE state='captured'").get().n,0);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_rollback_resets').get().n,1,'reset audit survives lost acknowledgement');
 const fresh={actor:who.email,requestId:crypto.randomUUID(),sessionId:'f'.repeat(64)},progress=await Import.open(db,fresh).reserve();assert.equal(progress.state,'preparing','a new import can reserve both heads');
 assert.equal((await edgeRosterMigration(env,input,who)).replayed,true);assert.equal((await Import.open(db,fresh).progress()).state,'preparing','replay cannot reset the next import');
 console.log('PASS manual rollback reset: Admin, exact legacy/fence gates, atomic retained evidence, lost acknowledgement, replay and new import');
}finally{globalThis.fetch=oldFetch;db.sql.close();}
