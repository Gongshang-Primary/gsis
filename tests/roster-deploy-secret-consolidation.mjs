import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {toWorkerModuleURL} from './helpers/worker-module.cjs';
const require=createRequire(import.meta.url),loadRole=require('./load-backend-role.cjs');
const canonical='synthetic-roster-deploy-canonical-credential',legacy='synthetic-distinct-legacy-transport-credential';
const legacyNames=['BRIDGE_SECRET','ROSTER_SERVICE_SECRET','CALENDAR_PROXY_SECRET','CALENDAR_SERVICE_SECRET','CONTACTS_BRIDGE_SECRET','VENUES_BRIDGE_SECRET','LORD_BRIDGE_SECRET','DEPLOY_BRIDGE_SECRET','DEPLOY_EDGE_SECRET','GSIS_BACKEND_SECRET'];
const badValues=[undefined,'','short','x'.repeat(8001),' '.repeat(32),'é'.repeat(32),'x'.repeat(31)+'\n'];
const digest=text=>createHash('sha256').update(text).digest('hex');
const hmac=(key,text)=>createHmac('sha256',key).update(text).digest('hex');
const actor={email:'synthetic@gsps.edu.sg',subject:'synthetic-school-actor'};
function backend(role){
 const values=new Map([['GSIS_SECRET',canonical],['CONTACTS_API_URL','https://script.google.com/macros/s/synthetic/exec'],...legacyNames.map(key=>[key,legacy])]),reads=[];
 const c=vm.createContext({Date,console:{log(){},info(){},error(){}},PropertiesService:{getScriptProperties:()=>({getProperty(key){reads.push(key);return values.get(key)??null;},setProperty(){assert.fail('Authentication must not write settings');}})},Utilities:{getUuid:randomUUID,Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_algorithm,text)=>[...createHash('sha256').update(text).digest()],computeHmacSha256Signature:(text,key)=>[...createHmac('sha256',key).update(text).digest()]},GSISSheets:{resetStats(){},stats:()=>({})}});
 vm.runInContext(fs.readFileSync(role==='roster'?'Roster_Backend_v0.9.9.gs':'Deploy_Backend_v0.9.9.gs','utf8'),c);
 loadRole(c,role);
 // Replace storage/network results, while using actual entry, signature, expiry,
 // service discrimination, ownership and service-operation guards.
 const outgoingContacts=c.contacts_;
 c.out_=value=>({text:JSON.stringify(value)});c.rosterDiagnostic_=()=>{};
 c.contacts_=()=>({user:{roles:['Admin'],admin:true,smc:true}});
 let dispatches=0;
 c.dispatch_=c.rosterDispatch_=()=>{dispatches++;return {accepted:true};};
 c.rosterServiceContacts_=()=>({});
 const request=(extra={})=>({action:role==='roster'?'rosterRead':'active',identity:actor,input:{},timestamp:Date.now(),nonce:randomUUID(),...extra});
 const send=(key=canonical,req=request())=>{const payload=JSON.stringify(req);return JSON.parse(c.doPost({postData:{contents:JSON.stringify({payload,signature:hmac(key,payload)})}}).text);};
 assert.equal(send().ok,true,role+' accepts canonical');assert.equal(send(legacy).status,401);
 for(const value of badValues){if(value===undefined)values.delete('GSIS_SECRET');else values.set('GSIS_SECRET',value);const response=send(legacy);assert.equal(response.status,503,role);assert.equal(response.code,'GSIS_SECRET_INVALID');}
 values.set('GSIS_SECRET',canonical);
 const before=dispatches;
 assert.equal(send(canonical,request({service:'gsis-roster-notifier-v1'})).status,403,'service envelope cannot be laundered into browser dispatch');assert.equal(dispatches,before);
 if(role==='roster'){
  const service=request({action:'rosterService',service:'gsis-roster-notifier-v1',input:{operation:'connectionStatus'}});delete service.identity;
  assert.equal(send(canonical,service).data.readOnly,true);assert.equal(send(legacy,service).status,401);
  assert.equal(send(canonical,{...service,service:'wrong-purpose'}).status,401);
  assert.equal(send(canonical,{...service,input:{operation:'saveAbsence'}}).status,403,'service allowlist must reject browser mutations');
 }
 let calls=0;c.UrlFetchApp={fetch(_url,options){calls++;const signed=JSON.parse(options.payload);assert.equal(signed.signature,hmac(canonical,signed.payload));assert.notEqual(signed.signature,hmac(legacy,signed.payload));return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data:{accepted:true}})};}};
 assert.equal(outgoingContacts(actor,false,'saveData',{}).accepted,true);assert.equal(calls,1);
 values.delete('GSIS_SECRET');assert.throws(()=>outgoingContacts(actor,false,'saveData',{}),error=>error.code==='GSIS_SECRET_INVALID');assert.equal(calls,1);values.set('GSIS_SECRET',canonical);
 for(const [fn,service,action]of [['lordSourceAuthenticate_','gsis-lord-v1','lordService'],['venuesSourceAuthenticate_','gsis-venues-v1','venuesSource']]){
  const payload=JSON.stringify({action,service,source:role,timestamp:Date.now(),nonce:randomUUID(),input:{operation:'manifest'}}),envelope={payload,signature:hmac(canonical,payload)};
  assert.equal(c[fn](envelope,role).operation,'manifest');assert.throws(()=>c[fn]({...envelope,signature:hmac(legacy,payload)},role));assert.throws(()=>c[fn](envelope,'another-app'));
 }
 if(role==='roster'){assert.equal(c.rosterVenuesConfig_(),null,'global GSIS_SECRET does not enable an unconfigured peer');values.set('VENUES_APPS_SCRIPT_URL','https://script.google.com/macros/s/synthetic/exec');assert.equal(c.rosterVenuesConfig_().secret,canonical);values.delete('GSIS_SECRET');assert.throws(()=>c.rosterVenuesConfig_(),error=>error.code==='GSIS_SECRET_INVALID');}
 assert(!reads.some(key=>legacyNames.includes(key)),role+' must not read legacy properties');
}
backend('roster');backend('deploy');
const workers={};
for(const [role,path]of [['roster','roster-update/public/_worker.js'],['deploy','public/_worker.js']])workers[role]=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')).toString('base64')));
function cookie(key,origin){const issued=Date.now(),payload=JSON.stringify({purpose:'gsis-session-v1',origin,...actor,issued,expires:issued+60000});return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+hmac(key,payload);}
const originalFetch=globalThis.fetch;let forwarded=0;
try{
 globalThis.fetch=async(_url,options)=>{forwarded++;const signed=JSON.parse(options.body);assert.equal(signed.signature,hmac(canonical,signed.payload));assert.notEqual(signed.signature,hmac(legacy,signed.payload));return Response.json({ok:true,data:{accepted:true}});};
 for(const role of ['roster','deploy']){
  const origin='https://'+role+'.example.test',env={GSIS_SECRET:canonical,GOOGLE_CLIENT_ID:'synthetic-client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec',...Object.fromEntries(legacyNames.map(key=>[key,legacy]))};
  const session=cookie(canonical+'|gsis-browser-session-v1|'+origin,origin),headers={Cookie:session,Origin:origin};
  assert.equal((await workers[role].readSession(new Request(origin+'/api/session',{headers}),env)).subject,actor.subject);
  for(const key of [canonical,legacy+'|gsis-browser-session-v1|'+origin,canonical+'|wrong-purpose|'+origin])await assert.rejects(workers[role].readSession(new Request(origin+'/api/session',{headers:{Cookie:cookie(key,origin)}}),env));
  await assert.rejects(workers[role].readSession(new Request('https://another.example.test/api/session',{headers:{Cookie:session}}),env));
  const before=forwarded,path=role==='roster'?'/api/read':'/api/active';
  assert.equal((await workers[role].default.fetch(new Request(origin+path,{method:'POST',headers,body:JSON.stringify(role==='roster'?{view:'names',calendar:false}:{})}),env,{})).status,200);assert.equal(forwarded,before+1);
  for(const value of badValues){const response=await workers[role].default.fetch(new Request(origin+'/api/config'),{...env,GSIS_SECRET:value},{});assert.equal(response.status,503);assert.equal((await response.json()).code,'GSIS_SECRET_INVALID');}
  assert.equal(forwarded,before+1);
  const logout=await workers[role].default.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:origin}}),{GSIS_SECRET:'bad'},{});assert.equal(logout.status,200);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
 }
}finally{globalThis.fetch=originalFetch;}
const service=await import('../shared/backend-service.js');
const privateEnv={GSIS_SECRET:canonical,GSIS_BACKEND_SECRET:legacy,ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',DEPLOY_PUBLIC_ORIGIN:'https://deploy.example.test',ROSTER_BRIDGE_SECRET:legacy,DEPLOY_BRIDGE_SECRET:legacy};
let delegated=0;privateEnv.GSIS_BACKEND={async fetch(request){delegated++;const command=await service.verifyBackendEnvelope(request,privateEnv);assert.equal(command.purpose,'roster');return Response.json({ok:true,value:{accepted:true}});}};
assert.equal((await service.callOperationalBackend(privateEnv,'roster',{action:'rosterRead',input:{},identity:{...actor,expiresAt:Date.now()+60000}})).accepted,true);assert.equal(delegated,1);
function envelope(key,extra={}){const payload=JSON.stringify({schema:1,purpose:'roster-service',origin:privateEnv.ROSTER_PUBLIC_ORIGIN,issuedAt:Date.now(),nonce:randomUUID(),...extra});return new Request('https://internal.test/v1/roster-service',{method:'POST',body:JSON.stringify({payload,signature:hmac(key,payload)})});}
await assert.rejects(service.verifyBackendEnvelope(envelope(legacy),privateEnv),error=>error.status===401);
await assert.rejects(service.verifyBackendEnvelope(envelope(canonical,{identity:{...actor,expiresAt:Date.now()+60000}}),privateEnv),error=>error.status===403);
for(const value of badValues)await assert.rejects(service.callOperationalBackend({...privateEnv,GSIS_SECRET:value},'roster',{identity:{...actor,expiresAt:Date.now()+60000}}),error=>error.status===503&&error.code==='GSIS_SECRET_INVALID');
assert.equal(delegated,1);
for(const role of ['roster','deploy'])assert.equal(service.backendDomainEnv(privateEnv,role).GSIS_SECRET,canonical);
const fence=await import('../shared/edge-venues-fence.js');assert.equal(await fence.inspectEdgeVenuesFence({GSIS_SECRET:canonical},'roster'),null);
await assert.rejects(fence.inspectEdgeVenuesFence({VENUES_APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec',VENUES_BRIDGE_SECRET:legacy},'roster'),error=>error.code==='GSIS_SECRET_INVALID');
for(const path of ['backend/Code.gs','Roster_Backend_v0.9.9.gs','Deploy_Backend_v0.9.9.gs','public/_worker.js','roster-update/public/_worker.js','shared/backend-service.js','shared/edge-venues-fence.js','notification-worker/index.js']){
 const helper=path.endsWith('.gs')?'backend/RosterDeployApiSecret.gs':'shared/roster-deploy-api-secret.js';assert.equal(fs.readFileSync(path,'utf8').match(/\/\* GSIS_API_SECRET_BEGIN \*\/([\s\S]*?)\/\* GSIS_API_SECRET_END \*\//)[1].trim(),fs.readFileSync(helper,'utf8').trim(),path);
}
for(const path of ['edge-deploy.js','edge-deploy-domain.js','edge-venues-fence.js'])assert.equal(fs.readFileSync('public/'+path,'utf8'),fs.readFileSync('roster-update/public/'+path,'utf8'));
const {bundle}=require('../scripts/bundle-worker.cjs');
for(const [dir,entry]of [['notification-worker','notification-worker/dashboard-entry.js'],['operations-worker','operations-worker/index.js']]){
 assert.equal(digest(fs.readFileSync(dir+'/dashboard-worker.mjs','utf8')),digest(bundle(entry)),dir+' canonical bundle');assert.equal(digest(fs.readFileSync(dir+'/dashboard-worker.mjs','utf8')),digest(fs.readFileSync(dir+'/dashboard-worker.txt','utf8')),dir+' copyable bundle');
}
console.log('PASS Roster/Deploy canonical-only backend/Worker/private transport; invalid and legacy-only rejection before I/O; service/action/source boundaries; canonical outgoing signing; purpose/origin-bound sessions; optional peer gates and generated parity');
