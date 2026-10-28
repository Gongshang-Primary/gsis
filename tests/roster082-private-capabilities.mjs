import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=roster-worker-capabilities.mjs').toString('base64')));
const env={ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'synthetic-current-key-'.repeat(3),ROSTER_SERVICE_SECRET:'synthetic-service-'.repeat(3),APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const issuedAt=Date.parse('2026-10-21T00:00:00Z'),week=7*86400000;
const base={staffId:'fixture-teacher',date:'2026-10-21',purpose:'duties',issuedAt,expiresAt:issuedAt+week};
await test('private timetable expiry remains fixed across issuance retries and valid until exactly168 hours',async()=>{
 const first=await M.createCapability(base,env,issuedAt),retry=await M.createCapability(base,env,issuedAt+86400000);
 for(const token of [first,retry]){
  const cap=await M.readCapability(token,env,env.ROSTER_PUBLIC_ORIGIN,issuedAt+week-1);
  assert.equal(cap.issuedAt,issuedAt);assert.equal(cap.expiresAt,issuedAt+week);
  await assert.rejects(M.readCapability(token,env,env.ROSTER_PUBLIC_ORIGIN,issuedAt+week),e=>e.code==='PRIVATE_LINK_EXPIRED');
 }
});
await test('verified legacy duty links recover within signed issuance plus seven days, mutual approval does not',async()=>{
 const legacy=async purpose=>{const data={...base,purpose,...(purpose==='mutual'?{requestId:'request-1'}:{}),type:'gsis-roster-link-v1',aud:env.ROSTER_PUBLIC_ORIGIN,expiresAt:issuedAt+86400000,nonce:'fixture'};const signed=await M.sign(data,env.EXTERNAL_LINK_SECRET);return Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;};
 const token=await legacy('duties');assert.equal((await M.readCapability(token,env,env.ROSTER_PUBLIC_ORIGIN,issuedAt+2*86400000)).expiresAt,issuedAt+week);
 await assert.rejects(M.readCapability(await legacy('mutual'),env,env.ROSTER_PUBLIC_ORIGIN,issuedAt+2*86400000),e=>e.code==='PRIVATE_LINK_EXPIRED');
 await assert.rejects(M.readCapability(token+'x',env,env.ROSTER_PUBLIC_ORIGIN,issuedAt+2*86400000),e=>e.code==='PRIVATE_LINK_INVALID');
 await assert.rejects(M.readCapability(token,env,'https://wrong.example.test',issuedAt+2*86400000),e=>e.code==='PRIVATE_LINK_INVALID');
});
await test('planned key rotation verifies outstanding links without issuing with the previous key',async()=>{
 const token=await M.createCapability(base,env,issuedAt),rotated={...env,EXTERNAL_LINK_SECRET:'synthetic-new-key-'.repeat(3),EXTERNAL_LINK_PREVIOUS_SECRET:env.EXTERNAL_LINK_SECRET};
 assert.equal((await M.readCapability(token,rotated,env.ROSTER_PUBLIC_ORIGIN,issuedAt+86400000)).staffId,base.staffId);
 await assert.rejects(M.readCapability(token,{...rotated,EXTERNAL_LINK_PREVIOUS_SECRET:''},env.ROSTER_PUBLIC_ORIGIN,issuedAt+86400000));
});
await test('private views skip Calendar and surface safe distinct validation errors',async()=>{
 const now=Date.now(),token=await M.createCapability({...base,issuedAt:now,expiresAt:now+week},env,now);let calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.equal(String(url),env.APPS_SCRIPT_URL);return Response.json({ok:true,data:{date:base.date}});};
 const request=token=>new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/external',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,Authorization:'Bearer '+token},body:JSON.stringify({operation:'view'})});
 const response=await M.externalRoute(request(token),env);assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal((await (await M.externalRoute(request('invalid'),env)).json()).code,'PRIVATE_LINK_INVALID');
 assert.equal((await M.externalRoute(request(token),{...env,EXTERNAL_LINK_SECRET:''})).status,503);
});
