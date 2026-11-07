import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile('contacts-update/public/_worker.js','utf8'),{default:worker}=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',key.publicKey);jwk.kid='test';
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),h=enc({alg:'RS256',kid:'test'}),p=enc({iss:'https://accounts.google.com',aud:'client',sub:'test',email:'qa@gsps.edu.sg',email_verified:true,hd:'gsps.edu.sg',iat:Date.now()/1000-10,exp:Date.now()/1000+600}),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(h+'.'+p)),jwt=h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
const env={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',GSIS_SECRET:'x'.repeat(64),BRIDGE_SECRET:'x'.repeat(64)};
const request=path=>new Request('https://contacts.example/api/'+path,{method:'POST',headers:{Origin:'https://contacts.example',Authorization:'Bearer '+jwt},body:JSON.stringify({requestId:crypto.randomUUID()})});
const originalTimeout=AbortSignal.timeout,originalFetch=globalThis.fetch,originalError=console.error;let budgets=[],mode='ok',logs=[];
AbortSignal.timeout=ms=>{budgets.push(ms);return originalTimeout(ms)};console.error=(label,data)=>logs.push(data);
globalThis.fetch=async url=>{if(String(url).includes('/certs'))return Response.json({keys:[jwk]});if(mode==='timeout')throw Object.assign(Error('private payload must not appear'),{name:'TimeoutError'});if(mode==='html')return new Response('<html>Unavailable</html>');if(mode==='http')return new Response('',{status:500});return Response.json({ok:true,data:{saved:true}})};
try{
 assert.equal((await worker.fetch(request('save-data'),env)).status,200);assert.equal(budgets.at(-1),60000);
 assert.equal((await worker.fetch(request('save-receipt'),env)).status,200);assert.equal(budgets.at(-1),8000);
 for(const [scenario,code] of [['timeout','UPSTREAM_TIMEOUT'],['html','UPSTREAM_RESPONSE'],['http','UPSTREAM_HTTP']]){mode=scenario;const r=await worker.fetch(request('save-data'),env),b=await r.json();assert.equal(r.status,503);assert.equal(b.code,code);assert.ok(b.diagnosticId);assert.equal(b.draftEditable,undefined);assert.doesNotMatch(JSON.stringify(b),/private payload/);}
 assert.doesNotMatch(JSON.stringify(logs),/private payload|gsps.edu.sg|BRIDGE_SECRET/);
}finally{AbortSignal.timeout=originalTimeout;globalThis.fetch=originalFetch;console.error=originalError;}
// A 40-second write response survives the actual Contacts adapter + transport without replay.
let now=0,id=0,calls=0,done=false,error;const timers=new Map(),context={window:{},token:'session',loginAttempt:0,performance:{now:()=>now},console,AbortController,setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id},clearTimeout:k=>timers.delete(k)};
context.fetch=(url,init)=>new Promise((resolve,reject)=>{calls++;init.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})));context.setTimeout(()=>resolve({ok:true,status:200,json:async()=>({ok:true,data:{saved:true}})}),40000)});
vm.createContext(context);vm.runInContext(await readFile('shared/transport.js','utf8'),context);const app=await readFile('contacts-update/public/app.js','utf8');const apiSource=app.match(/^async function api\([\s\S]*?^\}/m)?.[0];assert.ok(apiSource,'Locate the Contacts transport adapter without depending on the next directory feature declaration');vm.runInContext(apiSource,context);
vm.runInContext("api('save-data',{requestId:'fixed'})",context).then(r=>{assert.equal(r.saved,true);done=true},e=>{error=e;done=true});
for(let i=0;!done&&i<12;i++){await new Promise(r=>setImmediate(r));if(done)break;const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(next);timers.delete(next[0]);now=next[1].at;next[1].fn();}
assert.ifError(error);assert.ok(done);assert.equal(calls,1);assert.equal(now,40000);
console.log('PASS Contacts 60s gateway/75s browser write budgets, bounded receipt budget, timeout/HTTP/HTML classification, safe references and simulated 40s acknowledgement without write replay.');
