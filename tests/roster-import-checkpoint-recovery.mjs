import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
import {sha256Hex as hash} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Import=require('../shared/roster-import.js');
const who={email:'admin@example.test',subject:'admin'},previous=globalThis.fetch;
try{
 for(const scenario of ['late','late-body','late-google','pending','wrong-digest','google','google-timeout']){
  const db=database(),requestId='checkpoint-'+scenario,sessionId=hash(JSON.stringify([who.email,requestId])),binding={actor:who.email,requestId,sessionId};
  const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',GSIS_SECRET:'b'.repeat(40),APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec'};
  const store=Import.open(db,binding);await store.reserve();const initial=await store.claimPreparation();
  const checkpoint={fileId:'previous',digest:hash('previous')};
  await store.commitPreparation(initial,{adminVerified:true,sessionId,preparing:true,preparation:{ordinal:1,checkpoint},step:1,done:1,total:4,elapsedMs:1000,nextStep:{phase:'Freeze parts',bytes:262157,records:0}});
  let writes=0,reads=0,complete=false;
  const expectedDigest=hash(JSON.stringify({sessionId,ordinal:1,checkpoint}));
  const result={adminVerified:true,sessionId,requestId,preparing:true,step:2,done:2,total:4,elapsedMs:2000,preparation:{ordinal:2,checkpoint:{fileId:'next',digest:hash('next')}},checkpointInputDigest:scenario==='wrong-digest'?hash('wrong'):expectedDigest};
  globalThis.fetch=async(_url,options)=>{
   const input=JSON.parse(JSON.parse(options.body).payload).input;
   if(input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:true}});
   if(input.operation==='edgeExportCheckpoint'){reads++;return Response.json({ok:true,data:complete?{...result,completed:true}:{adminVerified:true,sessionId,completed:false}});}
   assert.equal(input.operation,'edgeExportManifest');writes++;
   if(scenario==='late-google'){complete=true;return Response.json({ok:false,status:400,error:'Google adapter error after the checkpoint was saved.'});}
   if(scenario==='google-timeout')return Response.json({ok:false,status:400,error:'Exceeded maximum execution time.',failureReason:{status:400,message:'Exceeded maximum execution time.',phase:'Freeze parts',elapsed:70000}});
   if(scenario==='google')return Response.json({ok:false,status:400,error:'Google rejected this step.'});
   complete=scenario!=='pending';if(scenario==='late-body')return {json:async()=>{throw new DOMException('The response body timed out.','AbortError');}};throw new DOMException('The bridge wait timed out.','TimeoutError');
  };
  if(['late','late-body','late-google'].includes(scenario)){
   const progress=await edgeRosterMigration(env,{operation:'import',requestId},who);assert.equal(progress.step,2);assert.equal((await store.preparationStatus()).ordinal,2);assert.equal(writes,1);assert(reads>=1);
  }else{
   await assert.rejects(edgeRosterMigration(env,{operation:'import',requestId},who),error=>{
    if(scenario==='wrong-digest')return error.code==='ROSTER_EXPORT_INVALID';
    assert.equal(error.code,scenario==='google'?'ROSTER_GOOGLE_ERROR':scenario==='google-timeout'?'ROSTER_GOOGLE_TIMEOUT':'ROSTER_BRIDGE_TIMEOUT');
    if(scenario==='google-timeout')assert.equal(error.status,504,'a Google timeout must stay retryable even if its envelope says 400');
    assert.equal(error.failureReason.bytes,262157);assert.equal(error.failureReason.records,0);assert.equal(error.failureReason.phase,'Freeze parts');return true;
   });
   assert.equal((await store.preparationStatus()).ordinal,1);
   if(scenario==='pending'){
    complete=true;const progress=await edgeRosterMigration(env,{operation:'import',requestId},who);assert.equal(progress.step,2);assert.equal(writes,1,'late checkpoint is adopted while the original lease is active, with no repeated Google work');
   }
  }
  db.sql.close();
 }
 console.log('PASS bridge recovery: exact late checkpoint adoption, live-lease reconciliation, digest refusal and sized timeout/Google errors');
}finally{globalThis.fetch=previous;}
