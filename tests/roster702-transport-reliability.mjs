import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test',date='2026-10-15',now=Date.now();
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'b'.repeat(40)};
const signed=await gateway.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const logs=[],oldError=console.error,oldInfo=console.info,oldFetch=globalThis.fetch;
console.error=s=>logs.push(JSON.parse(s));console.info=()=>{};
const reads=['timetableDay','read','directory','candidates','availability','audit','prunePreview','externalLink','health','accounting','allocation','history','exportDaily'];
function request(operation){return new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify({operation,date})});}
try{
 for(const failure of ['http','envelope','html','network','timeout'])for(const operation of [...reads,'saveAbsence','requestMutual','assign']){
  let calls=0;
  globalThis.fetch=async()=>{
   calls++;
   if(failure==='http')return new Response('private upstream details',{status:503});
   if(failure==='envelope')return Response.json({ok:false,status:503,error:'private upstream details'});
   if(failure==='html')return new Response('<html>private upstream details</html>');
   throw Object.assign(Error('private upstream details'),failure==='timeout'?{name:'TimeoutError'}:{});
  };
  const response=await gateway.default.fetch(request(operation),env),value=await response.json();
  assert.equal(response.status,503);assert.equal(calls,1,'Never blindly replay a failed upstream operation');
  assert.match(value.diagnosticId,/^[a-f0-9-]{36}$/i);
  assert.equal(/save could not be confirmed/.test(value.error),!reads.includes(operation),operation+' '+failure);
  assert.doesNotMatch(JSON.stringify(value),/private upstream details/);
 }
 assert.doesNotMatch(JSON.stringify(logs),/private upstream details|https:\/\/|teacher@/);
 // Exercise the actual browser API function, including a network failure before
 // any JSON response. A failed read must not claim that it attempted a save.
 const app=fs.readFileSync('roster-update/public/roster.js','utf8'),start=app.indexOf('function api('),end=app.indexOf('\n function errorText',start);
 assert(start>=0&&end>start);
 const browser=vm.createContext({invalidateHomeRelief(){},timedRead:request=>request(),window:{},profile:null,location:{origin},sessionEpoch:0,sequence:0,apiReadGeneration:0,preloadSchedule:0,preloadCheckedAt:0,timetablePreload:{invalidate(){}},apiReads:new Map(),timetableDays:new Map(),AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error('offline');}});
 vm.runInContext(app.slice(app.indexOf(' function cacheOwner('),app.indexOf(' function clear(){'))+'\n'+app.slice(start,end),browser);
 for(const operation of reads){await assert.rejects(()=>browser.api('operations',{operation}),e=>!e.message.includes('save could not be confirmed'),operation);}
 for(const operation of ['saveAbsence','requestMutual','assign'])await assert.rejects(()=>browser.api('operations',{operation}),/save could not be confirmed/);
 const reference='12345678-1234-1234-1234-123456789abc';
 browser.fetch=async()=>Response.json({ok:false,error:'Roster records could not load. Retry loading.',diagnosticId:reference},{status:503});
 for(const operation of reads)await assert.rejects(()=>browser.api('operations',{operation}),error=>error.status===503&&error.diagnosticId===reference&&!error.message.includes('save could not be confirmed'));
 // A new Google signing key must not lock out valid sign-in until the cached
 // key set expires. Only the key lookup refreshes; signature and claims stay mandatory.
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);let certCalls=0,activeKey='first';
 globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');certCalls++;return Response.json({keys:[{...jwk,kid:activeKey}]});};
 async function token(kid,changes={}){
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),header=encode({alg:'RS256',kid}),payload=encode({iss:'https://accounts.google.com',aud:'client',sub:'teacher',email:'teacher@gsps.edu.sg',email_verified:true,hd:'gsps.edu.sg',iat:Date.now()/1000-1,exp:Date.now()/1000+600,...changes});
  return header+'.'+payload+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(header+'.'+payload))).toString('base64url');
 }
 assert.equal((await gateway.identity(await token('first'),'client')).subject,'teacher');assert.equal(certCalls,1);
 activeKey='rotated';const rotated=await token(activeKey);
 assert.equal((await gateway.identity(rotated,'client')).subject,'teacher');assert.equal(certCalls,2,'Refresh cached certs once for a new signing key');
 await gateway.identity(rotated,'client');assert.equal(certCalls,2,'Known signing keys retain the cache');
 await assert.rejects(()=>token('unknown').then(value=>gateway.identity(value,'client')),/Unknown signing key/);assert.equal(certCalls,2,'An unknown key during the rotation cooldown fails without another fetch');
 for(const changes of [{aud:'wrong'},{hd:'other.edu.sg'},{email:'other@other.edu.sg'},{email_verified:false},{exp:0}])await assert.rejects(()=>token(activeKey,changes).then(value=>gateway.identity(value,'client')),/Invalid school identity/);
 const tampered=rotated.slice(0,-20)+'A'.repeat(20);await assert.rejects(()=>gateway.identity(tampered,'client'),/Invalid signature/);
 console.log('PASS Roster transport failures: read/save wording, HTTP/envelope/HTML/network/timeout paths, references, no blind replay and signing-key rotation with all identity guards retained. No live requests.');
}finally{console.error=oldError;console.info=oldInfo;globalThis.fetch=oldFetch;}
