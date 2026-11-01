import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';
import {edgeRosterMigration} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),db=require('./helpers/chunked-import-db.cjs')(),Import=require('../shared/roster-import.js');
const who={email:'admin@gsps.edu.sg',subject:'admin'},requestId='diagnostics-request',sessionId=sha256Hex(JSON.stringify([who.email,requestId])),sourceDigest='a'.repeat(64);
const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/diagnostics/exec',BRIDGE_SECRET:'b'.repeat(40),GOOGLE_CLIENT_ID:'fixture-client'};
const now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,...who,issued:now,expires:now+3600000}),signature=createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature;
const timeouts=[],originalTimeout=AbortSignal.timeout;
const result={current:false,sourceDigest,changed:['peerMail'],checkedAt:new Date().toISOString()},calls=[],oldFetch=globalThis.fetch;let admin=true;
async function send(auth=true,origin=env.ROSTER_PUBLIC_ORIGIN){const response=await gateway.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/edge/migration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:JSON.stringify({operation:'drift',importRequestId:requestId,sessionId})}),env);return {status:response.status,body:await response.json()};}
const dump=()=>JSON.stringify(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.sql.prepare('SELECT * FROM '+name).all()]));
try{
 AbortSignal.timeout=ms=>{timeouts.push(ms);return originalTimeout(ms);};
 globalThis.fetch=async(_url,options)=>{const req=JSON.parse(JSON.parse(options.body).payload);calls.push(req);if(req.input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin}});assert.equal(req.identity.email,who.email);assert.deepEqual(req.input,{operation:'edgeDrift',sourceDigest});return Response.json({ok:true,data:result});};
 const store=Import.open(db,{actor:who.email,requestId,sessionId});await store.reserve();const claim=await store.claimPreparation();await store.commitPreparation(claim,{adminVerified:true,sessionId,requestId,sourceDigest,preparing:true,step:1,done:1,total:3,elapsedMs:10});
 assert.equal(db.sql.prepare('SELECT source_digest FROM gsis_roster_import_sessions').get().source_digest,'','capture digest lives in accepted preparation before manifest binding');
 const before=dump();
 assert.equal((await send(false)).status,401,'drift requires a signed browser session');assert.equal((await send(true,'https://other.example')).status,403);
 admin=false;assert.equal((await send()).status,403,'current Admin proof required');admin=true;
 const reply=await send();assert.equal(timeouts.at(-1),135000,'full-snapshot drift uses the long bridge timeout');assert(timeouts.includes(55000),'reference reads retain their existing timeout');assert.equal(reply.status,200,'drift is allowed during preparation');assert.deepEqual(reply.body.data,result);assert.equal(dump(),before,'drift cannot advance, stop or change import');
 assert.equal((await edgeRosterMigration(env,{operation:'status'},who)).importSession.sourceDigest,sourceDigest,'reload can check a captured source before staging');
 await assert.rejects(edgeRosterMigration(env,{operation:'drift',importRequestId:requestId,sessionId,sourceDigest:'f'.repeat(64)},who),e=>e.status===400,'caller cannot choose another digest');
 await assert.rejects(edgeRosterMigration(env,{operation:'drift',importRequestId:requestId,sessionId},{email:'other@example.test'}),e=>e.status===409);
 assert(calls.filter(req=>req.input.operation==='edgeDrift').length===1);
 console.log('PASS drift session/Admin/origin gates, captured digest, exact bridge result and unchanged import');
}finally{AbortSignal.timeout=originalTimeout;globalThis.fetch=oldFetch;db.sql.close();}
