import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';
import {beginRosterCutoverFreeze,syncRosterCutoverFreeze} from '../shared/roster-cutover-freeze.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),db=database(),oldFetch=globalThis.fetch;
const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/freeze-gateway/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),GOOGLE_CLIENT_ID:'fixture-client'};
const now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,email:'admin@gsps.edu.sg',subject:'admin',issued:now,expires:now+3600000}),signature=createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature;
async function send(input,{auth=true,origin=env.ROSTER_PUBLIC_ORIGIN,path='/api/edge/migration'}={}){const r=await gateway.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};}
let admin=false,calls=0;
try{
 globalThis.fetch=async(_url,options)=>{calls++;const r=JSON.parse(JSON.parse(options.body).payload);if(r.input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},cutoverFreeze:{available:true,active:true,state:'frozen',requestId:id,frozenAt:held.frozenAt}}});return Response.json({ok:false,status:423,code:'ROSTER_CUTOVER_FROZEN',error:'Roster is being moved; try again shortly.'});};
 const input={operation:'activate',sourceDigest:'a'.repeat(64)};assert.equal((await send(input)).status,404,'unfrozen activation stays closed');assert.equal(calls,0);
 const id=crypto.randomUUID(),held=await beginRosterCutoverFreeze(env,{requestId:id});assert.equal((await send(input)).status,404,'an unconfirmed hold cannot open activation');
 await syncRosterCutoverFreeze(env,{available:true,active:true,state:'frozen',requestId:id,frozenAt:held.frozenAt},{expectedRevision:held.revision});
 assert.equal((await send(input,{auth:false})).status,401,'confirmed freeze never bypasses sign-in');assert.equal((await send(input,{origin:'https://other.example'})).status,403,'same-origin check remains');
 assert.equal((await send(input)).status,403,'current Admin proof remains mandatory');admin=true;const unavailable=await send(input);assert.equal(unavailable.status,409);assert.equal(unavailable.body.code,'ROSTER_IMPORT_SOURCE_MISMATCH','activation still requires both verified imported scopes');
 const blocked=await send({operation:'renameStapler',date:'2026-11-02',name:'Fixture',requestId:crypto.randomUUID()},{path:'/api/operations'});assert.equal(blocked.status,423);assert.equal(blocked.body.code,'ROSTER_CUTOVER_FROZEN');assert.match(blocked.body.error,/Roster is being moved/);
 console.log('PASS narrow frozen-only activation route, sign-in/current Admin/origin checks, imported-source gate and clear frozen-write response');
}finally{globalThis.fetch=oldFetch;db.sql.close();}
