import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,randomUUID,webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const origin='https://roster.test',date='2026-10-21',secret='synthetic-bridge-secret-0123456789abcdef';
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster-test/exec',GSIS_SECRET:secret};
const identity={email:'synthetic@gsps.edu.sg',subject:'synthetic-test'};
// Use the real backend verifier and an independent native HMAC implementation.
// Only Google's utility service is adapted; no staff data or live requests.
const backendSource=fs.readFileSync('backend/Code.gs','utf8');
const verifier=vm.createContext({Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(value,key,charset='utf8')=>Array.from(createHmac('sha256',Buffer.from(key,charset)).update(value,charset).digest(),b=>b>127?b-256:b)}});
vm.runInContext(backendSource.match(/^function signature_\([^\n]+/m)[0]+'\n'+backendSource.match(/^function same_\([^\n]+/m)[0],verifier);
const verify=envelope=>verifier.same_(verifier.signature_(envelope.payload,secret),envelope.signature);
const unicode='EL (absent — School event) · 华文 தமிழ்மொழி 📚 e\u0301 / é \\u2014\n\t\u0000';
const command={operation:'saveStapler',view:'stapler',date,requestId:randomUUID(),revision:2,staplerRevision:1,plan:{notes:unicode,tiles:Array.from({length:1000},(_,i)=>({id:'synthetic-'+i,subject:unicode,period:i%17}))}};
const requestData={action:'rosterOperations',input:command,identity,timestamp:Date.now(),nonce:randomUUID()};
const envelope=await worker.sign(requestData,secret,true);
assert.match(envelope.payload,/^[\x00-\x7f]*$/,'signed JSON must contain only ASCII');
assert.deepEqual(JSON.parse(envelope.payload),requestData,'all Unicode and literal escapes roundtrip unchanged');
assert(verify(envelope),'real backend verifier agrees with WebCrypto');
// An ASCII envelope survives a byte-to-text boundary which would corrupt a
// literal em dash. This models the risk; it does not claim live GAS behavior.
const wire=JSON.stringify(envelope),received=JSON.parse(Buffer.from(wire,'utf8').toString('latin1'));
assert.equal(received.payload,envelope.payload);assert(verify(received));
assert(!verify({...received,payload:received.payload.replace('synthetic-0','synthetic-x')}),'modified plan is rejected');
assert(!verify({...received,signature:'0'.repeat(64)}),'forged signature is rejected');
assert(!verify(await worker.sign(requestData,'different-synthetic-bridge-secret-012345',true)),'wrong secret is rejected');
assert.equal((await worker.sign({input:'ordinary ASCII'},secret)).payload,JSON.stringify({input:'ordinary ASCII'}),'ASCII wire format stays compatible');
assert.equal((await worker.sign({input:unicode},secret)).payload,JSON.stringify({input:unicode}),'other sign callers retain literal Unicode and existing wire size');
const unicodeSecret=secret+'—校',legacyPayload=JSON.stringify(requestData),legacySignature=createHmac('sha256',Buffer.from(unicodeSecret,'utf8')).update(legacyPayload,'utf8').digest('hex');
assert.equal(verifier.signature_(legacyPayload,unicodeSecret),legacySignature,'legacy literal Unicode payload and Unicode key stay UTF8-compatible');
const unicodeSigned=await worker.sign(requestData,unicodeSecret,true);
assert.equal(verifier.signature_(unicodeSigned.payload,unicodeSecret),unicodeSigned.signature,'ASCII payload with a Unicode key agrees across implementations');

const issued=Date.now(),session=await worker.sign({purpose:'gsis-session-v1',origin,...identity,issued,expires:issued+60000},secret+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
const oldFetch=globalThis.fetch,oldInfo=console.info,oldError=console.error,logs=[];
let mode='accept',calls=0,accepted=0,forwarded,wireBytes;
const backendDiagnostic=randomUUID();
console.info=entry=>logs.push(JSON.parse(entry));console.error=entry=>logs.push(JSON.parse(entry));
globalThis.fetch=async(url,options)=>{
 calls++;assert.equal(String(url),env.APPS_SCRIPT_URL);
 assert.equal(options.headers['Content-Type'],'application/json; charset=utf-8');
 const posted=JSON.parse(options.body);assert(verify(posted));wireBytes=Buffer.byteLength(options.body);
 forwarded=JSON.parse(posted.payload);assert.equal(forwarded.identity.email,identity.email);
 const carriesPlan=forwarded.input.operation==='saveStapler'||forwarded.input.operation==='receiptStatus'&&forwarded.input.command?.operation==='saveStapler';
 if(carriesPlan)assert.match(posted.payload,/^[\x00-\x7f]*$/);
 else assert.equal(posted.payload,JSON.stringify(forwarded),'other operations retain their original signed representation');
 if(mode==='http-auth')return new Response('private upstream body',{status:401});
 if(mode==='auth')return Response.json({ok:false,status:401,error:'Invalid signature: private upstream body',diagnosticId:backendDiagnostic,backendVersion:'0.7.018b',failureStage:'bridge-signature'});
 if(mode==='tampered'){
  posted.payload=posted.payload.replace('synthetic-0','synthetic-x');assert(!verify(posted));
  return Response.json({ok:false,status:401,error:'Invalid signature'});
 }
 if(mode==='forbidden')return Response.json({ok:false,status:403,error:'Planning access is not granted.'});
 accepted++;return Response.json({ok:true,data:{revision:3,requestId:forwarded.input.requestId}});
};
const request=(input=command,headers={})=>worker.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie,...headers},body:JSON.stringify(input)}),env);
try{
 let response=await request();assert.equal(response.status,200);assert.deepEqual(forwarded.input.plan,command.plan);
 assert.equal(forwarded.input.requestId,command.requestId);assert.equal(accepted,1);
 for(const failure of ['auth','http-auth','tampered']){
  mode=failure;response=await request();const body=await response.json();
  assert.equal(response.status,503,'backend authentication must not trigger browser sign-out');
  assert.equal(body.code,'BACKEND_AUTHENTICATION');assert.match(body.diagnosticId,/^[a-f0-9-]{36}$/);
  if(failure==='auth'){assert.equal(body.diagnosticId,backendDiagnostic);assert.equal(body.backendVersion,'0.7.018b');assert.equal(body.failureStage,'bridge-signature');}
  assert.match(body.error,/Retry the same save/);assert.match(body.error,/backend deployment and shared secret/);
  assert.doesNotMatch(body.error,/private upstream body/);assert.equal(response.headers.get('Set-Cookie'),null);
 }
 assert.equal(accepted,1,'rejected requests never reach storage');
 mode='accept';response=await request();assert.equal(response.status,200,'the same session and original command remain usable');
 assert.equal(forwarded.input.requestId,command.requestId);assert.deepEqual(forwarded.input.plan,command.plan);
 response=await request({operation:'confirmStapler',view:'stapler',date,requestId:randomUUID(),revision:3,staplerRevision:2});assert.equal(response.status,200);
 response=await request({operation:'receiptStatus',command});assert.equal(response.status,200);assert.deepEqual(forwarded.input.command,command);
 const instructions={operation:'saveInstructions',date,instructions:'é'.repeat(100000),requestId:randomUUID()};
 assert(Buffer.byteLength(JSON.stringify(instructions))<262144);
 response=await request(instructions);assert.equal(response.status,200);assert.equal(forwarded.input.instructions,instructions.instructions);assert(wireBytes<600000,'Unicode instructions must remain inside the unchanged backend envelope limit');
 const inflated=await worker.sign(forwarded,secret,true);assert(Buffer.byteLength(JSON.stringify(inflated))>600000,'global ASCII escaping would regress this valid non-Stapler request');
 mode='forbidden';response=await request();assert.equal(response.status,403,'valid permission denial is unchanged');
 const before=calls;
 assert.equal((await request(command,{Cookie:''})).status,401,'missing browser session still requires sign-in');
 assert.equal((await request(command,{Cookie:cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0')})).status,401,'forged browser session still requires sign-in');
 assert.equal(calls,before,'invalid browser sessions cannot reach the backend');
 const safeLogs=JSON.stringify(logs);for(const privateValue of [secret,identity.email,unicode,'private upstream body',command.requestId])assert(!safeLogs.includes(privateValue),'diagnostic logs exclude secrets, staff content and command payloads');
 assert(logs.some(row=>row.code==='BACKEND_AUTHENTICATION'&&row.upstreamStatus===401));
 console.log('PASS 718b: ASCII-safe Unicode signing, actual backend verifier, tamper/wrong-key rejection, service-auth 503 with safe diagnostics, same-session Save/Confirm/receipt, and genuine session 401.');
}finally{globalThis.fetch=oldFetch;console.info=oldInfo;console.error=oldError;}
