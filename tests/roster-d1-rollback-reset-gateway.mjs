import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js'),db=database(),previousFetch=globalThis.fetch;
const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_EDGE_AUTHORITY:'legacy',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/reset-gateway/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),GOOGLE_CLIENT_ID:'fixture-client'};
const now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,email:'admin@gsps.edu.sg',subject:'admin',issued:now,expires:now+3600000}),signature=createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature;
let admin=false,fenced=false;
const send=async(auth=true)=>{const response=await gateway.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/edge/migration',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:JSON.stringify({operation:'resetAfterRollback',requestId:'gateway-reset-request'})}),env);return {status:response.status,body:await response.json()};};
try{
 globalThis.fetch=async(_,options)=>{const input=JSON.parse(JSON.parse(options.body).payload).input;if(input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,legacyWritesDisabled:fenced}});if(input.operation==='edgeFenceStatus')return Response.json({ok:true,data:{legacyWritesDisabled:fenced}});throw Error('Unexpected operation');};
 for(const scope of ['roster','roster-register']){const store=Store.open(db,scope),head=await store.importState({state:{schema:1,rows:[]},actor:'setup',requestId:'old-'+scope});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
 assert.equal((await send(false)).status,401,'legacy preparation route still requires sign-in');assert.equal((await send()).status,403,'current Admin proof remains required');admin=true;fenced=true;assert.equal((await send()).body.code,'ROSTER_ROLLBACK_FENCED');
 fenced=false;const result=await send();assert.equal(result.status,200);assert.equal(result.body.data.reset,true);for(const scope of ['roster','roster-register'])assert.equal((await Store.open(db,scope).head()).mode,'legacy');
 console.log('PASS actual legacy Pages reset route: reachable preparation operation, browser session, live Admin and Google fence gates');
}finally{globalThis.fetch=previousFetch;db.sql.close();}
