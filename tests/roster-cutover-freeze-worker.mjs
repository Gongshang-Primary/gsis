import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
import {readRosterCutoverFreeze} from '../shared/roster-cutover-freeze.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
const db=database(),env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/freeze-fixture/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40)},who={email:'admin@example.test',subject:'synthetic-admin'},id=crypto.randomUUID(),realFetch=globalThis.fetch;
let proof={available:true,active:false,state:'idle',requestId:null,frozenAt:null,ageMs:0,overdue:false},admin=true,lose=false,freezeCalls=0;
try{
 globalThis.fetch=async(_url,options)=>{
  const envelope=JSON.parse(options.body),req=JSON.parse(envelope.payload),p=req.input,secret=req.action==='rosterService'?env.GSIS_SECRET:env.GSIS_SECRET;
  assert.equal(envelope.signature,createHmac('sha256',secret).update(envelope.payload).digest('hex'));
  if(p.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},cutoverFreeze:proof}});
  if(p.operation==='edgeFreeze'){
   assert.equal(req.action,'rosterOperations');assert.equal(p.requestId,id);
   assert.equal((await readRosterCutoverFreeze(env)).active,true,'hold must be durable before Google starts the freeze');
   freezeCalls++;proof={available:true,active:true,state:'frozen',requestId:id,frozenAt:proof.frozenAt||new Date().toISOString(),ageMs:0,overdue:false};
   if(lose){lose=false;throw Error('lost freeze acknowledgement');}return Response.json({ok:true,data:{cutoverFreeze:proof}});
  }
  if(p.operation==='edgeUnfreeze'){assert.equal(p.freezeId,id);proof={...proof,active:false,state:'cancelled'};return Response.json({ok:true,data:{cutoverFreeze:proof}});}
  throw Error('unexpected Google call '+p.operation);
 };
 lose=true;await assert.rejects(edgeRosterMigration(env,{operation:'freeze',requestId:id},who),/lost freeze acknowledgement/);
 assert.equal((await readRosterCutoverFreeze(env)).active,true,'unknown outcomes keep the hold');
 const resumed=await edgeRosterMigration(env,{operation:'freeze',requestId:id},who);assert.equal(resumed.cutoverFreeze.active,true);assert.equal(freezeCalls,2);
 const status=await edgeRosterMigration(env,{operation:'status'},who);assert.equal(status.cutoverFreeze.requestId,id);
 admin=false;await assert.rejects(edgeRosterMigration(env,{operation:'cancelFreeze',requestId:crypto.randomUUID(),freezeId:id},who),e=>e.status===403);assert.equal((await readRosterCutoverFreeze(env)).active,true);admin=true;
 const cancelled=await edgeRosterMigration(env,{operation:'cancelFreeze',requestId:crypto.randomUUID(),freezeId:id},who);assert.equal(cancelled.cutoverFreeze.active,false);assert.equal((await readRosterCutoverFreeze(env)).active,false);
 console.log('PASS real signed Admin controls, pre-RPC durable hold, lost acknowledgement, same-id retry, status and cancellation');
}finally{globalThis.fetch=realFetch;db.sql.close();}
