import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {readRosterCutoverFreeze} from '../shared/roster-cutover-freeze.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Import=require('../shared/roster-import.js'),db=database(),who={email:'admin@gsps.edu.sg',subject:'admin'},id=crypto.randomUUID(),requestId=crypto.randomUUID();
const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/cutover-fixture/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-fixture/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)};
const source={schema:1,sourceDigest:'a'.repeat(64),state:O.initial(),index:{revision:1,entries:[],receipts:[]}},files=new Map(),oldFetch=globalThis.fetch;
let proof={available:true,active:false,state:'idle',requestId:null,frozenAt:null},completeCalls=0,loseComplete=true,failScope=false,legacyFenced=false,refuseFence=false;
try{
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);if(String(url)===env.CALENDAR_APPS_SCRIPT_URL)return Response.json({ok:true,result:{dates:body.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});
  const req=JSON.parse(body.payload),p=req.input;
  if(p.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:true,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},cutoverFreeze:proof,legacyWritesDisabled:legacyFenced}});
  if(p.operation==='edgeFreeze'){proof={available:true,active:true,state:'frozen',requestId:id,frozenAt:new Date().toISOString()};return Response.json({ok:true,data:{cutoverFreeze:proof}});}
  if(p.operation==='edgeExportManifest'){assert.equal(proof.active,true,'capture starts after the freeze');const binding={actor:who.email,requestId:p.requestId,sessionId:p.sessionId};if(!files.has(binding.sessionId))files.set(binding.sessionId,Import.freeze(source,binding,{hash:sha256Hex}));const value=files.get(binding.sessionId);return Response.json({ok:true,data:{adminVerified:true,sessionId:binding.sessionId,manifest:value.manifest,manifestDigest:value.manifestDigest}});}
  if(p.operation==='edgeExportPart'){const value=files.get(p.sessionId),i=value.manifest.parts.findIndex(row=>row.id===p.partId);return Response.json({ok:true,data:{adminVerified:true,sessionId:p.sessionId,manifestDigest:value.manifestDigest,partId:p.partId,payload:value.parts[i]}});}
  if(p.operation==='edgeFence'){if(refuseFence)return Response.json({ok:false,status:409,error:'The imported snapshot is no longer current. Legacy writers remain enabled; migrate the latest source before cutover. Changed since the snapshot: peerMail.'});assert.equal(p.sourceDigest,source.sourceDigest);legacyFenced=true;return Response.json({ok:true,data:{adminVerified:true,legacyWritesDisabled:true,sourceDigest:source.sourceDigest,cutoverFreeze:proof}});}
  if(p.operation==='edgeCutoverComplete'){
   completeCalls++;assert.equal(req.action,'rosterService','completion uses the internal service boundary');
   for(const scope of ['roster','roster-register'])assert.equal((await GSiSEdgeStore.open(db,scope).head()).mode,'active','both heads must be active before completing the Google freeze');
   assert.equal(p.freezeId,id);assert.equal(p.sourceDigest,source.sourceDigest);proof={...proof,active:false,state:'activated'};
   if(loseComplete){loseComplete=false;throw Error('lost completion acknowledgement');}return Response.json({ok:true,data:{cutoverFreeze:proof}});
  }
  throw Error('unexpected operation '+p.operation);
 };
 await edgeRosterMigration(env,{operation:'freeze',requestId:id},who);
 for(let n=0;n<100;n++){const result=await edgeRosterMigration(env,{operation:'import',requestId},who);if(result.imported)break;assert(n<99,'bounded import completes');}
 refuseFence=true;await assert.rejects(edgeRosterMigration(env,{operation:'activate',sourceDigest:source.sourceDigest},who),error=>error.status===409&&error.message==='The imported snapshot is no longer current. Legacy writers remain enabled; migrate the latest source before cutover. Changed since the snapshot: peerMail.');assert.equal(legacyFenced,false);for(const scope of ['roster','roster-register'])assert.equal((await GSiSEdgeStore.open(db,scope).head()).mode,'imported');refuseFence=false;
 const batch=db.batch.bind(db);db.batch=async statements=>{if(failScope&&statements.some(s=>s.text.startsWith('UPDATE gsis_edge_heads SET revision=revision+1,mode=')&&s.args.includes('roster')&&s.args.includes('active'))){failScope=false;throw Error('second scope interrupted');}return batch(statements);};
 failScope=true;await assert.rejects(edgeRosterMigration(env,{operation:'activate',sourceDigest:source.sourceDigest},who),/second scope interrupted/);assert.equal(completeCalls,0);assert.equal((await readRosterCutoverFreeze(env)).active,true);
 await assert.rejects(edgeRosterMigration(env,{operation:'cancelFreeze',requestId:crypto.randomUUID(),freezeId:id},who),e=>e.code==='ROSTER_CUTOVER_ALREADY_FENCED');assert.equal((await readRosterCutoverFreeze(env)).state,'frozen','a refused cancellation cannot strand partial activation behind a cancelling hold');
 await assert.rejects(edgeRosterMigration(env,{operation:'activate',sourceDigest:source.sourceDigest},who),/lost completion acknowledgement/);assert.equal((await readRosterCutoverFreeze(env)).active,true,'unknown completion keeps the Worker hold until verified');
 const resumed=await edgeRosterMigration(env,{operation:'activate',sourceDigest:source.sourceDigest},who);assert.equal(resumed.active,true);assert.equal(resumed.cutoverFreeze.active,false);assert.equal((await readRosterCutoverFreeze(env)).active,false);assert.equal(completeCalls,1,'verified replay need not repeat the completed Google action');
 console.log('PASS frozen import, partial activation, service-only completion after both heads, lost acknowledgement and verified replay');
}finally{globalThis.fetch=oldFetch;db.sql.close();}
