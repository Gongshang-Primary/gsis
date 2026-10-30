import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker from '../roster-update/public/_worker.js';
globalThis.crypto??=webcrypto;
const origin='https://roster.gsps.edu.sg',now=Date.now(),env={BRIDGE_SECRET:'fixture-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_SNAPSHOT_CACHE:'true',ROSTER_TIMETABLE_SNAPSHOTS:{get(){},put(){}},GSIS_JOBS:{prepare(){throw Error('Fixture cache unavailable');},batch(){throw Error('Fixture cache unavailable');}}};
const payload=JSON.stringify({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'fixture',issued:now,expires:now+3600000}),cookie='__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin).update(payload).digest('hex');
const post=(body,path='/api/operations')=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
const fetchBefore=globalThis.fetch,logBefore=console.error;const work=[],calls=[],logs=[];let result={ok:true,data:{saved:true,revision:7}},release,arrived;const waiting=new Promise(resolve=>arrived=resolve);
// Node may print its own warnings through console.error; keep only structured log entries.
console.error=value=>{let entry;try{entry=JSON.parse(value);}catch{logBefore(value);return;}logs.push(entry);};
globalThis.fetch=async(_,init)=>{const req=JSON.parse(JSON.parse(init.body).payload);calls.push(req);if(req.input.operation!=='timetableBatch')return Response.json(result);if(req.input.stage==='baseline')return new Promise(resolve=>{arrived();release=()=>resolve(Response.json({ok:true,data:{baselineKey:'a'.repeat(64),sourceKey:'b'.repeat(64)}}));});return Response.json({ok:false,status:503,code:'BACKEND_UNAVAILABLE'});};
try{
 const response=await worker.fetch(post({operation:'renameStapler',date:'2026-10-27',name:'Fixture plan',requestId:crypto.randomUUID()}),env,{waitUntil:p=>work.push(p)});
 assert.equal(response.status,200);assert.equal((await response.json()).data.saved,true);assert.equal(work.length,1);await waiting;assert.equal(typeof release,'function','cache preparation is detached from successful save');release();await Promise.all(work);
 assert.equal(calls[1].input.manifestOnly,true);assert.equal(calls[2].input.stage,'suspended');assert.equal(calls[2].input.baselineKey,'a'.repeat(64));assert.equal(calls[2].input.baselineSourceKey,'b'.repeat(64));assert.equal(calls[2].identity.email,'admin@gsps.edu.sg');assert(logs.some(r=>r.event==='roster-cache-preparation-pending'));
 work.length=0;calls.length=0;result={ok:false,status:409,code:'STAPLER_CONFLICT',error:'Changed online.'};await worker.fetch(post({operation:'renameStapler',date:'2026-10-27',name:'Fixture plan'}),env,{waitUntil:p=>work.push(p)});assert.equal(work.length,0);assert.equal(calls.length,1,'a rejected save never warms a speculative source');
 console.log('PASS confirmed save acknowledgement is independent of cache warming; fresh source/actor reused; failed saves do not warm');
}finally{globalThis.fetch=fetchBefore;console.error=logBefore;}
