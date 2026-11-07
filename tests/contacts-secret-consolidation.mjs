import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,randomUUID} from 'node:crypto';
const canonical='synthetic-contacts-transport-test-credential',legacy='synthetic-legacy-transport-test-credential';
const hmac=(key,text)=>createHmac('sha256',key).update(text).digest('hex');
const values=new Map([['GSIS_SECRET',canonical],['BRIDGE_SECRET',legacy],['ROSTER_SERVICE_SECRET',legacy]]),reads=[];
const c=vm.createContext({Date,console:{log(){},info(){},error(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>{reads.push(k);return values.get(k)??null;},setProperty(){assert.fail('Authentication must not write settings');}})},Utilities:{getUuid:randomUUID,Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(text,key)=>[...createHmac('sha256',key).update(text).digest()]},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
vm.runInContext(fs.readFileSync('Contacts_Code.gs','utf8'),c);
const deploymentReader=c.deploymentData_;
c.deploymentData_=()=>({available:true});
const request=()=>({action:'deployment',input:{},timestamp:Date.now(),nonce:randomUUID(),identity:{email:'synthetic@gsps.edu.sg',subject:'synthetic'}});
function send(key,req=request()){const payload=JSON.stringify(req);return JSON.parse(c.doPost({postData:{contents:JSON.stringify({payload,signature:hmac(key,payload)})}}).text);}
assert.equal(send(canonical).ok,true);assert.equal(send(legacy).status,401);
values.delete('GSIS_SECRET');assert.equal(send(legacy).status,503,'legacy-only backend config must not authenticate');
assert.equal(send(legacy).code,'GSIS_SECRET_INVALID');
for(const bad of ['', 'short', 'x'.repeat(8001), ' '.repeat(32), 'é'.repeat(32), 'x'.repeat(31)+'\n']){values.set('GSIS_SECRET',bad);const r=send(legacy);assert.equal(r.status,503);assert.equal(r.code,'GSIS_SECRET_INVALID');}
values.set('GSIS_SECRET',canonical);
assert.equal(send(canonical,{...request(),service:'gsis-roster-notifier-v1'}).status,403,'service envelope cannot become a school-user action');
assert(!reads.some(k=>/BRIDGE_SECRET|ROSTER_SERVICE_SECRET/.test(k)),'backend must never read a legacy key');
const envelope=req=>{const payload=JSON.stringify(req);return {payload,signature:hmac(canonical,payload)};};
for(const [fn,service,action]of [['lordSourceAuthenticate_','gsis-lord-v1','lordService'],['venuesSourceAuthenticate_','gsis-venues-v1','venuesSource']]){
 const req={action,service,source:'contacts',timestamp:Date.now(),nonce:randomUUID(),input:{operation:'manifest'}};
 // Service discrimination and replay-window guards remain the authority, even with one transport credential.
 assert.equal(c[fn](envelope(req),'contacts').operation,'manifest');
 assert.throws(()=>c[fn](envelope({...req,source:'roster'}),'contacts'));
 assert.throws(()=>c[fn](envelope({...req,timestamp:Date.now()-120000}),'contacts'));
 assert.throws(()=>c[fn]({...envelope(req),signature:hmac(legacy,JSON.stringify(req))},'contacts'));
}
values.set('DEPLOY_API_URL','https://script.google.com/macros/s/synthetic/exec');
values.set('DEPLOY_BRIDGE_SECRET',legacy);
c.SpreadsheetApp={openById:()=>({})};c.currentContactsDeployment_=()=>null;
let deployCalls=0;c.UrlFetchApp={fetch(url,options){deployCalls++;const signed=JSON.parse(options.payload);assert.equal(signed.signature,hmac(canonical,signed.payload));assert.notEqual(signed.signature,hmac(legacy,signed.payload));return {getContentText:()=>JSON.stringify({ok:true,data:{activeVersionId:'synthetic'}})};}};
assert.equal(deploymentReader({email:'synthetic@gsps.edu.sg'}).available,true);assert.equal(deployCalls,1);
assert(!reads.some(k=>k==='DEPLOY_BRIDGE_SECRET'));
for(const file of ['Contacts_Backend_v0.9.9.gs','backend/Contacts_Code_with_Deploy_API.gs'])assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync('Contacts_Code.gs','utf8'),'generated Contacts copy '+file);
for(const [file,helper]of [['Contacts_Code.gs','backend/ContactsApiSecret.gs'],['contacts-update/public/_worker.js','shared/contacts-api-secret.js']]){const block=fs.readFileSync(file,'utf8').match(/\/\* GSIS_API_SECRET_BEGIN \*\/([\s\S]*?)\/\* GSIS_API_SECRET_END \*\//)[1];assert.equal(block.trim(),fs.readFileSync(helper,'utf8').trim(),'Contacts-specific canonical helper '+file);}
const source=fs.readFileSync('contacts-update/public/_worker.js','utf8');
const {default:worker,readSession}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const origin='https://contacts.example.test',env=new Proxy({GSIS_SECRET:canonical,GOOGLE_CLIENT_ID:'synthetic-client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec'},{get(target,key){assert(!/^(BRIDGE_SECRET|.*_BRIDGE_SECRET|ROSTER_SERVICE_SECRET)$/.test(String(key)),'Worker read a legacy key');return target[key];}});
function cookie(key,host=origin){const issued=Date.now(),payload=JSON.stringify({purpose:'gsis-session-v1',origin:host,email:'synthetic@gsps.edu.sg',subject:'synthetic',issued,expires:issued+60000});return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+hmac(key,payload);}
const session=cookie(canonical+'|gsis-browser-session-v1|'+origin);
assert.equal((await readSession(new Request(origin+'/api/session',{headers:{Cookie:session}}),env)).subject,'synthetic');
for(const key of [canonical,legacy+'|gsis-browser-session-v1|'+origin,canonical+'|wrong-purpose|'+origin])await assert.rejects(readSession(new Request(origin+'/api/session',{headers:{Cookie:cookie(key)}}),env));
await assert.rejects(readSession(new Request('https://other.example.test/api/session',{headers:{Cookie:session}}),env));
const actualFetch=globalThis.fetch;let forwarded=0;
try{
 globalThis.fetch=async(url,options)=>{forwarded++;const signed=JSON.parse(options.body);assert.equal(signed.signature,hmac(canonical,signed.payload));assert.notEqual(signed.signature,hmac(legacy,signed.payload));return Response.json({ok:true,data:{available:true}});};
 const response=await worker.fetch(new Request(origin+'/api/deployment',{headers:{Cookie:session}}),env);assert.equal(response.status,200);assert.equal((await response.json()).data.available,true);assert.equal(forwarded,1);
 for(const value of [undefined,'','bad']){const response=await worker.fetch(new Request(origin+'/api/config'),{...env,GSIS_SECRET:value,BRIDGE_SECRET:legacy});assert.equal(response.status,503);assert.equal((await response.json()).code,'GSIS_SECRET_INVALID');}
 const logout=await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:origin}}),{GSIS_SECRET:'bad'});assert.equal(logout.status,200);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
}finally{globalThis.fetch=actualFetch;}
console.log('PASS Contacts GSIS_SECRET-only backend/Worker signing, legacy-only rejection, invalid-config fail-closed, service/source/time fencing, purpose/origin-bound sessions and independent logout');
