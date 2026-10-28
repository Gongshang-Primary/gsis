import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
assert.ok(existsSync('venues-viewport/public/_worker.js'),'Venues must provide its authenticated same-origin gateway');
const source=readFileSync('venues-viewport/public/_worker.js','utf8');
const {default:worker}=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://venues.gsps.edu.sg',team='school.cloudflareaccess.com';
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:'venues-audience',VENUES_BACKEND_URL:'https://script.google.com/macros/s/venues/exec',VENUES_PROXY_SECRET:'x'.repeat(64),ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='key1';jwk.alg='RS256';jwk.use='sig';
const now=Math.floor(Date.now()/1000);
async function token(changes={}){const parts=[{alg:'RS256',kid:'key1',typ:'JWT'},{iss:'https://'+team,aud:[env.ACCESS_AUD],sub:'access-user',email:'staff@gsps.edu.sg',iat:now-1,exp:now+600,type:'app',...changes}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));const signed=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(parts.join('.')));return parts.join('.')+'.'+Buffer.from(signed).toString('base64url');}
let jwt=await token(),upstream=[],keyCalls=0;
// workerd rejects redirect:'error' before sending the request. Node's fetch
// accepts it, so an unconstrained network fake hid the production sign-in failure.
// https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c++
function signingKeys(options){if(options?.redirect&&!['follow','manual'].includes(options.redirect))throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');return Response.json({keys:[jwk]});}
globalThis.fetch=async (url,options)=>{if(String(url)==='https://'+team+'/cdn-cgi/access/certs'){keyCalls++;return signingKeys(options);}upstream.push(JSON.parse(options.body));return Response.json({ok:true,data:{version:'0.9.2'}});};
async function request(path='/api/read',input={operation:'bootstrap'},headers={},method='POST'){return worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Jwt-Assertion':jwt,...headers},...(method!=='GET'?{body:typeof input==='string'?input:JSON.stringify(input)}:{})}),env);}
assert.equal((await request()).status,200);
const envelope=upstream.at(-1),payload=JSON.parse(envelope.payload);
assert.deepEqual(Object.keys(payload).sort(),['action','identity','input','nonce','timestamp']);
assert.deepEqual(payload.identity,{email:'staff@gsps.edu.sg',subject:'access-user'});
assert.equal(payload.action,'venues');assert.equal(payload.input.operation,'bootstrap');
const key=await crypto.subtle.importKey('raw',Buffer.from(env.VENUES_PROXY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
assert.equal(await crypto.subtle.verify('HMAC',key,Buffer.from(envelope.signature,'hex'),Buffer.from(envelope.payload)),true);
assert.equal((await request('/api/read',{operation:'bootstrap'},{Origin:'https://evil.test'})).status,403);
assert.equal((await request('/api/read',{operation:'bootstrap'},{'Sec-Fetch-Site':'cross-site'})).status,403);
assert.equal((await request('/api/read',{}, {},'GET')).status,405);
assert.equal((await request('/api/read',{operation:'book'})).status,400);
assert.equal((await request('/api/command',{operation:'bootstrap'})).status,400);
assert.equal((await request('/api/read',{operation:'bootstrap',identity:{email:'admin@gsps.edu.sg'}})).status,400);
assert.equal((await request('/api/command',{operation:'book',requestId:'bad',expectedRevision:0})).status,400);
assert.equal((await request('/api/command',{operation:'book',requestId:crypto.randomUUID(),expectedRevision:0,venueId:'v1',dates:['2026-10-25'],periodIds:['p1']})).status,200);
assert.equal((await request('/api/read','x'.repeat(65537))).status,413);
assert.equal((await request('/api/read','null')).status,400);
assert.equal((await request('/api/read',{operation:'bootstrap'},{'Cf-Access-Jwt-Assertion':'','Cf-Access-Authenticated-User-Email':'admin@gsps.edu.sg'})).status,401);
for(const changes of [{aud:['wrong']},{iss:'https://other.cloudflareaccess.com'},{exp:now-1},{iat:now+180},{nbf:now+180},{sub:''},{email:'bad email'},{type:'service_token'}]){jwt=await token(changes);assert.equal((await request()).status,401,JSON.stringify(changes));}
jwt=await token();const parts=jwt.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),email:'admin@gsps.edu.sg'})).toString('base64url');jwt=parts.join('.');assert.equal((await request()).status,401);
jwt=await token();assert.equal(await (await request('/b/booking-id',{}, {},'GET')).text(),'/index.html');
assert.equal(await (await request('/r/transfer-id',{}, {},'GET')).text(),'/index.html');
assert.equal(keyCalls,1,'verified JWKS cached, requests still validate JWT claims/signature');
assert.equal((await worker.fetch(new Request(origin+'/api/read',{method:'POST',headers:{Origin:origin,'Cf-Access-Jwt-Assertion':jwt},body:'{}'}),{...env,ACCESS_TEAM_DOMAIN:'evil.test/path'})).status,503);
console.log('PASS Venues Worker: Access JWT, scoped signed identity, operation lanes, request bounds, same-origin, authenticated management routes');
const googleEnv={...env,ACCESS_TEAM_DOMAIN:undefined,ACCESS_AUD:undefined,GOOGLE_CLIENT_ID:'google-client'};
const previousFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>String(url)==='https://www.googleapis.com/oauth2/v3/certs'?signingKeys(options):previousFetch(url,options);
const googleParts=[{alg:'RS256',kid:'key1'},{iss:'https://accounts.google.com',aud:'google-client',sub:'google-user',email:'staff@gsps.edu.sg',hd:'gsps.edu.sg',email_verified:true,iat:now,exp:now+600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));
const googleToken=googleParts.join('.')+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(googleParts.join('.')))).toString('base64url');
const publicConfig=await worker.fetch(new Request(origin+'/api/config'),googleEnv);assert.equal(publicConfig.status,200,'same-suite Google sign-in configuration is available before login');assert.equal((await publicConfig.json()).clientId,'google-client');
assert.equal(await (await worker.fetch(new Request(origin+'/b/selected'),googleEnv)).text(),'/index.html','management routes present sign-in before authenticated API data');
const sessionResponse=await worker.fetch(new Request(origin+'/api/session',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+googleToken}}),googleEnv);assert.equal(sessionResponse.status,200);const sessionCookie=sessionResponse.headers.get('Set-Cookie');assert.match(sessionCookie,/Secure; HttpOnly; SameSite=Lax/);
const cookie=sessionCookie.split(';')[0];assert.equal((await worker.fetch(new Request(origin+'/api/read',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify({operation:'bootstrap'})}),googleEnv)).status,200);
assert.equal((await worker.fetch(new Request(origin+'/api/session',{headers:{Cookie:cookie}}),googleEnv)).status,200);
assert.equal((await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:'https://evil.test',Cookie:cookie}}),googleEnv)).status,403);
assert.match((await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie}}),googleEnv)).headers.get('Set-Cookie'),/Max-Age=0/);
console.log('PASS Venues Worker: same-suite Google identity, HttpOnly session, private API and logout CSRF');
for(const mode of ['google','access']){
 const {default:coldWorker}=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n// cold redirect test '+mode).toString('base64')));
 let networkCalls=0,redirected=false;
 globalThis.fetch=async (url,options)=>{networkCalls++;signingKeys(options);if(options?.redirect==='follow'){redirected=true;return Response.json({keys:[jwk]});}return Response.json({keys:[jwk]},{status:302,headers:{Location:'https://untrusted.test/keys'}});};
 const response=await coldWorker.fetch(new Request(origin+(mode==='google'?'/api/session':'/api/read'),{method:'POST',headers:{Origin:origin,...(mode==='google'?{Authorization:'Bearer '+googleToken}:{'Cf-Access-Jwt-Assertion':jwt})},body:JSON.stringify({operation:'bootstrap'})}),mode==='google'?googleEnv:env);
 assert.equal(response.status,401,'a redirected signing-key response must not authenticate '+mode);
 assert.equal(response.headers.get('Set-Cookie'),null,'no session may be minted from redirected keys');
 assert.equal(redirected,false,'do not follow signing-key redirects');assert.equal(networkCalls,1,'rejected identity must not reach Apps Script');
}
console.log('PASS Venues Worker: workerd redirect compatibility and fail-closed Google/Access key redirects');
