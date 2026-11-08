import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {makeHarness} from './calendar/backend_harness.cjs';
const canonical='synthetic-calendar-transport-credential',legacy='synthetic-legacy-calendar-credential',sessionKey='synthetic-independent-calendar-session-key';
const hmac=(key,text,encoding='hex')=>createHmac('sha256',key).update(text).digest(encoding);
const h=makeHarness(),reads=[];
h.sandbox.Utilities.computeHmacSha256Signature=(text,key)=>[...createHmac('sha256',key).update(text).digest()];
h.props.set('GSIS_SECRET',canonical);
for(const key of ['CALENDAR_PROXY_SECRET','CALENDAR_SERVICE_SECRET','BRIDGE_SECRET'])h.props.set(key,legacy);
const properties=h.sandbox.PropertiesService.getScriptProperties();
h.sandbox.PropertiesService.getScriptProperties=()=>({...properties,getProperty(key){reads.push(key);return properties.getProperty(key);}});
const backend=(key=canonical)=>JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify({proxySecret:key,actor:h.actor('admin'),action:'rosterDate',payload:{date:'2026-09-14'}})}}).text);
assert.equal(backend().ok,true);
assert.equal(backend(legacy).ok,false);
for(const value of [undefined,'','short','x'.repeat(8001),' '.repeat(32),'é'.repeat(32),'x'.repeat(31)+'\n']){
 if(value===undefined)h.props.delete('GSIS_SECRET');else h.props.set('GSIS_SECRET',value);
 const result=backend(legacy);assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(result.code,'GSIS_SECRET_INVALID');
}
h.props.set('GSIS_SECRET',canonical);
assert(!reads.some(key=>/^(BRIDGE_SECRET|CALENDAR_PROXY_SECRET|CALENDAR_SERVICE_SECRET)$/.test(key)));
const restricted=JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify({proxySecret:canonical,service:'gsis-roster-notifier-v1',actor:h.actor('admin'),action:'saveEvent',payload:{}})}}).text);
assert.equal(restricted.ok,false,'a service credential must not authorize browser mutations');
// Outgoing Contacts and Venues calls must use the same canonical key, while
// source-service requests retain their source and time-window restrictions.
h.props.set('CONTACTS_APPS_SCRIPT_URL','https://script.google.com/macros/s/synthetic/exec');
h.props.set('VENUES_APPS_SCRIPT_URL','https://script.google.com/macros/s/synthetic/exec');
h.props.set('CONTACTS_BRIDGE_SECRET',legacy);h.props.set('VENUES_BRIDGE_SECRET',legacy);
let sourceCalls=0;
h.sandbox.UrlFetchApp={fetch(_url,options){sourceCalls++;const envelope=JSON.parse(options.payload),request=JSON.parse(envelope.payload);assert.equal(envelope.signature,hmac(canonical,envelope.payload));assert.notEqual(envelope.signature,hmac(legacy,envelope.payload));const data=request.action==='calendarBirthdays'?{schema:1,complete:true,authoritative:true,people:[],count:0,revision:'synthetic',observedAt:Date.now()}:{venues:[]};return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data})};}};
assert.equal(h.sandbox.calendarBirthdaySource_(h.actor('admin')).count,0);
assert.equal(h.sandbox.calendarVenueCatalogue_(h.actor('admin')).venueSource.status,'ready');assert.equal(sourceCalls,2);
h.props.delete('GSIS_SECRET');h.sandbox.rc18ResetIO_();
assert.throws(()=>h.sandbox.calendarBirthdaySource_(h.actor('admin')),error=>error.code==='GSIS_SECRET_INVALID');
assert.equal(h.sandbox.calendarVenueCatalogue_(h.actor('admin')).venueSource.status,'unavailable');assert.equal(sourceCalls,2,'legacy-only outbound config must not reach a provider');
h.props.set('GSIS_SECRET',canonical);
function sourceEnvelope(extra={},key=canonical){const payload=JSON.stringify({action:'venuesSource',service:'gsis-venues-v1',source:'calendar',timestamp:Date.now(),nonce:randomUUID(),input:{operation:'manifest'},...extra});return {payload,signature:hmac(key,payload)};}
assert.equal(h.sandbox.venuesSourceAuthenticate_(sourceEnvelope(),'calendar').operation,'manifest');
for(const envelope of [sourceEnvelope({source:'contacts'}),sourceEnvelope({timestamp:Date.now()-120000}),sourceEnvelope({},legacy)])assert.throws(()=>h.sandbox.venuesSourceAuthenticate_(envelope,'calendar'));
assert(!reads.some(key=>/^(BRIDGE_SECRET|CALENDAR_PROXY_SECRET|CALENDAR_SERVICE_SECRET|CONTACTS_BRIDGE_SECRET|VENUES_BRIDGE_SECRET)$/.test(key)));
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('calendar-update/public/_worker.js','utf8')).toString('base64'));
const {default:jobs}=await import('../calendar-job-worker/worker.mjs');
const origin='https://calendar.example.test';
const actor={sub:'synthetic-admin',email:'admin@gsps.edu.sg',userAlias:'admin'};
function cookie(key){const body=Buffer.from(JSON.stringify({...actor,exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return '__Host-gsps_cal_session='+body+'.'+hmac(key,body,'base64url');}
let dbCalls=0,providerCalls=0;
const db={prepare(){dbCalls++;return {bind(){return this;},async run(){return {meta:{changes:1}};},async all(){return {results:[]};}};}};
const jobEnv={GSIS_SECRET:canonical,CALENDAR_PROXY_SECRET:legacy,CALENDAR_JOBS_DB:db,CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec'};
const env={GSIS_SECRET:canonical,CALENDAR_PROXY_SECRET:legacy,CALENDAR_SERVICE_SECRET:legacy,CALENDAR_SESSION_SECRET:sessionKey,CALENDAR_APPS_SCRIPT_URL:jobEnv.CALENDAR_APPS_SCRIPT_URL,CALENDAR_JOBS:{fetch(request){return jobs.fetch(request,jobEnv);}}};
function browser(path,key=sessionKey,bindings=env){return worker.fetch(new Request(origin+path,{headers:{Cookie:cookie(key)}}),bindings);}
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async(_url,options)=>{providerCalls++;const body=JSON.parse(options.body);assert.equal(body.proxySecret,canonical);assert.notEqual(body.proxySecret,legacy);if(body.action==='calendarSyncContinue'){assert.equal(body.calendarServiceSecret,canonical);return Response.json({ok:true,result:{idle:true}});}assert.equal(body.actor.email,actor.email);return Response.json({ok:true,result:{actor,years:[2026]}});};
 assert.equal((await browser('/api/bootstrap?year=2026')).status,200);assert.equal(providerCalls,1);
 for(const key of [canonical,legacy,canonical+'|gsis-browser-session-v1|'+origin])assert.equal((await browser('/api/bootstrap',key)).status,401,'transport keys cannot forge a Calendar session');
 assert.equal((await browser('/api/bootstrap',sessionKey,{...env,CALENDAR_SESSION_SECRET:undefined})).status,500);
 assert.equal(providerCalls,1);
 for(const value of [undefined,'','short','x'.repeat(8001),' '.repeat(32),'é'.repeat(32),'x'.repeat(31)+'\n']){
  assert.equal((await browser('/api/bootstrap',sessionKey,{...env,GSIS_SECRET:value})).status,503);
 }
 assert.equal(providerCalls,1,'invalid transport configuration cannot reach the backend');
 const response=await browser('/api/calendar-jobs');assert.equal(response.status,200);assert.deepEqual((await response.json()).result.jobs,[]);assert(dbCalls>0);
 function command(key,purpose='calendar-job-gateway-v1',bindings=jobEnv){const payload=JSON.stringify({purpose,timestamp:Date.now(),nonce:randomUUID(),actor,input:{kind:'list'}});return jobs.fetch(new Request('https://jobs.test/commands',{method:'POST',body:JSON.stringify({payload,signature:hmac(key,payload)})}),bindings);}
 const before=dbCalls;
 assert.equal((await command(legacy)).status,401);assert.equal((await command(canonical,'wrong-purpose')).status,401);assert.equal(dbCalls,before);
 for(const value of [undefined,'','short','x'.repeat(8001),' '.repeat(32),'é'.repeat(32)])assert.equal((await command(legacy,undefined,{...jobEnv,GSIS_SECRET:value})).status,503);
 assert.equal(dbCalls,before,'legacy-only jobs config cannot use D1');
 const payload=JSON.stringify({purpose:'gsis-calendar-sync-wake-v1',timestamp:Date.now(),nonce:randomUUID()});
 const wake=key=>worker.fetch(new Request(origin+'/api/internal/sync-continue',{method:'POST',body:JSON.stringify({payload,signature:hmac(key,payload)})}),env);
 assert.equal((await wake(legacy)).status,401);assert.equal(providerCalls,1);assert.equal((await wake(canonical)).status,200);assert.equal(providerCalls,2);
}finally{globalThis.fetch=originalFetch;}
assert.equal(fs.readFileSync('Calendar_Backend_v0.9.9.gs','utf8'),fs.readFileSync('calendar-backend/Code.gs','utf8'));
for(const path of ['calendar-job-worker/dashboard-worker.mjs','calendar-job-worker/dashboard-worker.txt'])assert.equal(fs.readFileSync(path,'utf8'),fs.readFileSync('calendar-job-worker/worker.mjs','utf8'));
for(const [path,helper]of [['calendar-backend/Code.gs','backend/CalendarApiSecret.gs'],['calendar-update/public/_worker.js','shared/calendar-api-secret.js']])assert.equal(fs.readFileSync(path,'utf8').match(/\/\* GSIS_API_SECRET_BEGIN \*\/([\s\S]*?)\/\* GSIS_API_SECRET_END \*\//)[1].trim(),fs.readFileSync(helper,'utf8').trim());
console.log('PASS Calendar canonical backend/Worker/jobs transport, invalid/legacy-only rejection before I/O, service/purpose boundaries, independent session signer, signed sync continuation and generated parity');
