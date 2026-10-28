import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const files=['public/_worker.js','contacts-update/public/_worker.js','layout-update/public/_worker.js','roster-update/public/_worker.js'];
const originalFetch=globalThis.fetch,originalNow=Date.now,clock={now:originalNow()};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey),encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(kid,changes={}){
 const header=encode({alg:'RS256',kid}),payload=encode({iss:'https://accounts.google.com',aud:'client',sub:'teacher',email:'teacher@gsps.edu.sg',email_verified:true,hd:'gsps.edu.sg',iat:clock.now/1000-1,exp:clock.now/1000+7200,...changes});
 const input=header+'.'+payload;return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');
}
let moduleId=0;
async function load(file){return import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(file,'utf8')+'\n// signing test '+moduleId++).toString('base64')));}
function helper(file){const src=fs.readFileSync(file,'utf8');return src.slice(src.indexOf('// Coalesce concurrent key reads.'),src.indexOf('export async function identity('));}
for(const file of files)assert.equal(helper(file),helper(files[0]),'Self-contained Workers must retain the identical key cache contract');
try{
 Date.now=()=>clock.now;
 for(const file of files){
  const mod=await load(file);let requests=0,active='initial',mode='ok';
  globalThis.fetch=async url=>{
   assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs','Never contact a live service');requests++;
   await new Promise(resolve=>setImmediate(resolve));
   if(mode==='network')throw Error('Synthetic certificate outage');
   if(mode==='invalid')return Response.json({keys:[{kid:active,kty:'RSA',n:'',e:'AQAB'}]});
   if(mode==='duplicate')return Response.json({keys:[{...jwk,kid:active},{...jwk,kid:active}]});
   return Response.json({keys:[{...jwk,kid:active}]});
  };
  const initial=await token('initial');
  await Promise.all(Array.from({length:30},()=>mod.identity(initial,'client')));assert.equal(requests,1);
  await mod.identity(initial,'client');assert.equal(requests,1,'Known key remains local');
  active='rotated';const rotated=await token('rotated');
  await Promise.all(Array.from({length:30},()=>mod.identity(rotated,'client')));assert.equal(requests,2,'Concurrent rotated-key lookups share one refresh');
  const unknown=await token('untrusted-key');
  await Promise.all(Array.from({length:30},()=>assert.rejects(()=>mod.identity(unknown,'client'),/Unknown signing key/)));assert.equal(requests,2,'Unknown keys cannot hammer the certificate service during cooldown');
  clock.now+=30001;
  await Promise.all(Array.from({length:30},()=>assert.rejects(()=>mod.identity(unknown,'client'),/Unknown signing key/)));assert.equal(requests,3,'One bounded unknown-key refresh after cooldown');
  for(const changes of [{aud:'wrong'},{hd:'outside.edu.sg'},{email:'other@example.com'},{email_verified:false},{exp:0},{iat:clock.now/1000+120},{iss:'https://attacker.example'}])await assert.rejects(()=>token('rotated',changes).then(t=>mod.identity(t,'client')),/Invalid school identity/);
  const tampered=rotated.slice(0,-20)+'A'.repeat(20);await assert.rejects(()=>mod.identity(tampered,'client'),/Invalid signature/);
  for(const malformed of ['invalid','duplicate']){
   clock.now+=30001;mode=malformed;active='bad';await assert.rejects(()=>token('bad').then(t=>mod.identity(t,'client')),/Invalid signing key response/);
   assert.equal((await mod.identity(rotated,'client')).subject,'teacher','Malformed response must not poison last valid keys');
  }
  mode='network';const fresh=await load(file),before=requests;
  await Promise.all(Array.from({length:30},()=>assert.rejects(()=>fresh.identity(initial,'client'),/Synthetic certificate outage/)));assert.equal(requests-before,1,'Concurrent failures share one attempt');
  mode='ok';active='initial';assert.equal((await fresh.identity(initial,'client')).subject,'teacher');assert.equal(requests-before,2,'Failed flight clears so the next request can recover');
  console.log('PASS '+file+': 30 cold callers = 1 cert fetch; 30 rotated callers = 1 refresh; bounded unknown keys, malformed-response isolation, failed-flight recovery, all identity guards');
 }
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
