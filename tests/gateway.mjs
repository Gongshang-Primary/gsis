import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/_worker.js',import.meta.url),'utf8');const {identity,sign,default:worker}=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',key.publicKey);jwk.kid='test-key';globalThis.fetch=async()=>Response.json({keys:[jwk]});const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function jwt(overrides={}){const h=enc({alg:'RS256',kid:'test-key'}),p=enc({iss:'https://accounts.google.com',aud:'client',sub:'123',email:'tester@gsps.edu.sg',email_verified:true,hd:'gsps.edu.sg',iat:Date.now()/1000-10,exp:Date.now()/1000+600,...overrides}),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url')}
assert.equal((await identity(await jwt(),'client')).email,'tester@gsps.edu.sg');for(const change of [{aud:'wrong'},{hd:'external.com'},{email_verified:false},{exp:0},{email:'x@external.com'}])await assert.rejects(()=>jwt(change).then(t=>identity(t,'client')));const good=await jwt();await assert.rejects(()=>identity(good.slice(0,-8)+'AAAAAAAA','client'));const envelope=await sign({hello:'world'},'x'.repeat(64));assert.equal(envelope.signature.length,64);
assert.equal((await worker.fetch(new Request('https://deploy.gsps.edu.sg/api/change',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'x'.repeat(64)})).status,403);
console.log('PASS gateway: verified signatures, audience/domain/email/expiry guards, tamper rejection, HMAC, cross-origin write rejection');
const env={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'x'.repeat(64)};
function post(route,body){return new Request('https://deploy.gsps.edu.sg/api/'+route,{method:'POST',headers:{Origin:'https://deploy.gsps.edu.sg',Authorization:'Bearer '+good},body:JSON.stringify(body)})}
globalThis.fetch=async()=>Response.json({ok:true,data:{saved:true,versionId:'allowed'}});
const failedHub={idFromName(){throw Error('Unavailable')}};
const saved=await worker.fetch(post('change',{versionId:'allowed',operation:'addTeacher'}),{...env,LIVE_HUB:failedHub});assert.equal(saved.status,200);assert.equal((await saved.json()).data.saved,true);
globalThis.fetch=async()=>Response.json({ok:true,data:{current:{id:'active'},user:{roles:[]}}});
const denied=await worker.fetch(post('live-ticket',{versionId:'private-plan'}),{...env,LIVE_HUB:failedHub});assert.equal(denied.status,403);
assert.equal((await worker.fetch(new Request('https://deploy.gsps.edu.sg/api/live',{headers:{Origin:'https://evil.example',Upgrade:'websocket'}}),{...env,LIVE_HUB:failedHub})).status,403);
console.log('PASS successful save survives notification failure; inaccessible version cannot obtain live ticket; cross-origin sockets rejected');
globalThis.fetch=async()=>{throw Object.assign(Error('Synthetic timeout'),{name:'TimeoutError'})};
const oldError=console.error;console.error=()=>{};
const failedRead=await worker.fetch(post('bootstrap',{}),env),readBody=await failedRead.json();assert.equal(failedRead.status,503);assert.equal(readBody.code,'UPSTREAM_TIMEOUT');assert.ok(readBody.diagnosticId);assert.doesNotMatch(readBody.error,/save completed/);
const failedWrite=await worker.fetch(post('change',{}),env),writeBody=await failedWrite.json();assert.match(writeBody.error,/Keep this save/);console.error=oldError;
console.log('PASS upstream timeout diagnostics and distinct read versus uncertain-write recovery messages.');
