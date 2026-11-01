import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const source=readFileSync(new URL('../lord-suite/Source/lord/_worker.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const env={LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/exec',GSIS_SECRET:'synthetic-gateway-shared-secret'.repeat(2),LORD_SESSION_SECRET:'fixture-cookie-signing-secret',LORD_QUEUE_ENABLED:'true',ASSETS:{fetch:()=>new Response('assets',{status:404})}};
function cookie(identity={sub:'staff-sub',email:'staff@gsps.edu.sg',identityType:'GSPS'}){const payload=Buffer.from(JSON.stringify({...identity,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return '__Host-lord_session='+payload+'.'+createHmac('sha256',env.LORD_SESSION_SECRET).update(payload).digest('base64url');}
const jobId=Date.now()+'-00000000-0000-4000-8000-000000000001';
let calls=0,transportLost=false;
env.LORD_JOBS={async fetch(request){calls++;if(transportLost)throw Error('acceptance response lost');const envelope=await request.json();assert.equal(envelope.signature,createHmac('sha256',env.GSIS_SECRET).update(envelope.payload).digest('hex'));const data=JSON.parse(envelope.payload);assert.deepEqual(data.actor,{sub:'staff-sub',email:'staff@gsps.edu.sg'});assert.equal(data.purpose,'lord-job-gateway-v1');assert.ok(data.nonce);return Response.json({ok:true,result:{...data.input,state:'QUEUED',confirmedBooking:false}},{status:data.input.kind==='enqueue'?202:200});}};
function request(method='POST',path='/api/jobs',headers={},body={kind:'enqueue',jobId,action:'notificationPreferences',payload:{enabled:false,consentConfirmed:false,expectedRevision:'NONE'}}){return new Request('https://lord.example'+path,{method,headers:{Cookie:cookie(),Origin:'https://lord.example',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
let r=await worker.fetch(request(),env);assert.equal(r.status,202,'signed-in LORD session can enqueue without wiring current UI');assert.equal((await r.json()).result.confirmedBooking,false);assert.equal(calls,1);
r=await worker.fetch(request('GET'),env);assert.equal((await r.json()).result.kind,'list');
r=await worker.fetch(request('GET','/api/jobs/'+jobId),env);assert.equal((await r.json()).result.jobId,jobId);
r=await worker.fetch(request('POST','/api/jobs',{Origin:'https://attacker.invalid'}),env);assert.equal(r.status,403);
r=await worker.fetch(request('POST','/api/jobs',{Cookie:''}),env);assert.equal(r.status,401);
r=await worker.fetch(request('POST','/api/jobs',{Cookie:cookie({sub:'relief:123',email:'',identityType:'RELIEF'})}),env);assert.equal(r.status,403);
const before=calls;env.LORD_QUEUE_ENABLED='false';r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.equal(calls,before);r=await worker.fetch(request('POST','/api/jobs',{}, {kind:'check',jobId}),env);assert.equal(r.status,200,'read-only recovery remains available while admission is paused');env.LORD_QUEUE_ENABLED='true';
transportLost=true;r=await worker.fetch(request(),env);assert.equal(r.status,503);assert.equal((await r.json()).definite,false);
console.log('PASS LORD gateway: session-derived actor, signed service envelope, school-only access, origin protection, default-off admission, uncertain transport without direct fallback');
