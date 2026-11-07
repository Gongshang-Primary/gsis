'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const canonical='0123456789ABCDEF0123456789ABCDEF!',legacy='legacy-secret-is-kept-unchanged-for-rollbacks';
const source=path=>fs.readFileSync(path,'utf8');
function scope(properties={}){
 const values=new Map(Object.entries(properties)),logs=[];
 const context=vm.createContext({console:{log:v=>logs.push(String(v)),info:v=>logs.push(String(v)),error:v=>logs.push(String(v))},Date,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>values.has(key)?values.get(key):null,setProperty:(key,value)=>values.set(key,value)})},
  Utilities:{getUuid:crypto.randomUUID,Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(text,key)=>[...crypto.createHmac('sha256',key).update(text).digest()]},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
 if(fs.existsSync('backend/ApiSecret.gs'))vm.runInContext(source('backend/ApiSecret.gs'),context);
 return {context,values,logs};
}
function signed(payload,key){const text=JSON.stringify(payload);return {postData:{contents:JSON.stringify({payload:text,signature:crypto.createHmac('sha256',key).update(text).digest('hex')})}};}
function request(action,input={},extra={}){return {action,input,timestamp:Date.now(),nonce:crypto.randomUUID(),identity:{email:'tester@gsps.edu.sg',subject:'verified-school-identity'},...extra};}
{
 const h=scope({GSIS_SECRET:canonical,BRIDGE_SECRET:legacy}),c=h.context;
 vm.runInContext(source('Contacts_Code.gs'),c);c.deploymentData_=()=>({available:true,activeVersionId:'unchanged-current'});
 const reply=key=>JSON.parse(c.doPost(signed(request('deployment'),key)).text);
 assert.equal(reply(canonical).ok,true,'Contacts accepts GSIS_SECRET without requiring the legacy bridge key');
 assert.equal(reply(legacy).status,401,'configured canonical key must not keep accepting the old bridge key');
 h.values.delete('GSIS_SECRET');assert.equal(reply(legacy).status,503,'Contacts requires GSIS_SECRET and never accepts legacy-only configuration');
 h.values.set('GSIS_SECRET','');assert.equal(reply(legacy).status,503,'empty configured canonical fails closed');assert.equal(reply(legacy).code,'GSIS_SECRET_INVALID');
 assert.equal(h.logs.some(line=>line.includes(canonical)||line.includes(legacy)),false,'diagnostics never disclose either key');
}
{
 const h=scope({GSIS_SECRET:canonical,BRIDGE_SECRET:legacy});
 assert.equal(h.context.gsisApiSecret_('BRIDGE_SECRET'),canonical);
 for(const invalid of ['', 'x'.repeat(31), 'x'.repeat(8001), 'x'.repeat(31)+' ', 'x'.repeat(31)+'\n', 'é'.repeat(32)]){
  h.values.set('GSIS_SECRET',invalid);
  assert.throws(()=>h.context.gsisApiSecret_('BRIDGE_SECRET'),error=>error.status===503&&error.code==='GSIS_SECRET_INVALID'&&!error.message.includes(invalid||'do-not-match-empty'));
 }
 h.values.set('GSIS_SECRET','!'.repeat(32));assert.equal(h.context.gsisApiSecret_('BRIDGE_SECRET'),'!'.repeat(32),'punctuation is preserved, never trimmed');
 h.values.delete('GSIS_SECRET');assert.equal(h.context.gsisApiSecret_('BRIDGE_SECRET'),legacy);assert.equal(h.context.gsisApiSecret_('MISSING'),'');
}
{
 const h=scope({GSIS_SECRET:canonical,CALENDAR_PROXY_SECRET:legacy,CALENDAR_SERVICE_SECRET:legacy}),c=h.context;
 vm.runInContext(source('calendar-backend/Code.gs'),c);
 assert.doesNotThrow(()=>c.verifyProxySecret_(canonical));assert.throws(()=>c.verifyProxySecret_(legacy),/Unauthorised proxy/);
 c.apiContinueCalendarSync_=()=>({continued:true});
 const response=c.doPost({postData:{contents:JSON.stringify({proxySecret:canonical,calendarServiceSecret:canonical,service:'gsis-calendar-sync-worker-v1',action:'calendarSyncContinue'})}});
 assert.equal(JSON.parse(response.text).ok,true,'Calendar proxy and background service both resolve canonical');
 h.values.set('GSIS_SECRET','bad');assert.throws(()=>c.verifyProxySecret_(legacy),error=>error.code==='GSIS_SECRET_INVALID');
}
{
 const h=scope({GSIS_SECRET:canonical,VENUES_PROXY_SECRET:legacy,VENUES_BRIDGE_SECRET:legacy}),c=h.context;
 vm.runInContext(source('venues-backend/Code.gs'),c);
 const service=request('venuesService',{operation:'sourceStatus'},{service:'gsis-venues-v1'});delete service.identity;
 assert.equal(c.venuesVerifyEnvelope_(signed(service,canonical)).action,'venuesService');
 assert.throws(()=>c.venuesVerifyEnvelope_(signed(service,legacy)),error=>error.code==='INVALID_SIGNATURE');
 assert.throws(()=>c.venuesVerifyEnvelope_(signed({...service,identity:{email:'x',subject:'x'}},canonical)),error=>error.code==='INVALID_SERVICE','shared key does not relax service identity restrictions');
 h.values.set('GSIS_SECRET','');assert.throws(()=>c.venuesVerifyEnvelope_(signed(service,legacy)),error=>error.code==='GSIS_SECRET_INVALID');
}
{
 const h=scope({GSIS_SECRET:canonical}),c=h.context;
 c.props_=()=>({getProperty:key=>h.values.has(key)?h.values.get(key):null});c.venuesSourceError_=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
 vm.runInContext(source('backend/RosterVenues.gs'),c);
 assert.equal(c.rosterVenuesConfig_(),null,'a canonical key alone must not activate the optional Venues integration');
 h.values.set('VENUES_APPS_SCRIPT_URL','https://script.google.com/macros/s/synthetic/exec');
 assert.equal(c.rosterVenuesConfig_().secret,canonical,'an installed optional Venues connection uses the shared key');
}
{
 const h=scope({GSIS_SECRET:canonical,ROSTER_SERVICE_SECRET:legacy,BRIDGE_SECRET:legacy}),c=h.context;
 const code=source('backend/Code.gs'),start=code.indexOf('function doPost(e){'),end=code.indexOf('\nfunction auth_',start);
 Object.assign(c,{GSIS_DEPLOY_VERSION:'synthetic',GSISSheets:{resetStats(){}},rosterDiagnostic_(){},rosterStage_(){},rosterDiagnosticText_:String,rosterDiagnosticError_:()=> 'Safe failure',rosterFailureDetail_:error=>({code:error.code}),out_:value=>value,
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},same_:(a,b)=>a===b,signature_:(text,key)=>crypto.createHmac('sha256',key).update(text).digest('hex'),gsisRequireBackendAction_:()=>{},rosterServiceDispatch_:()=>({checked:true}),contacts_:()=>({user:{roles:[]}}),dispatch_:()=>({active:true})});
 require('./helpers/load-roster-diagnostic-build.cjs')(c);
 vm.runInContext(code.slice(start,end),c);
 const service=request('rosterService',{operation:'connectionStatus'},{service:'gsis-roster-notifier-v1'});delete service.identity;
 assert.equal(c.doPost(signed(service,canonical)).ok,true,'Roster service HMAC accepts canonical');
 assert.equal(c.doPost(signed(service,legacy)).status,401);
 assert.equal(c.doPost(signed(request('active'),canonical)).ok,true,'Deploy proxy HMAC accepts canonical');
 assert.equal(c.doPost(signed(request('active'),legacy)).status,401);
 assert.equal(c.doPost(signed({...service,service:'wrong-service'},canonical)).status,401,'shared signing key does not relax the service discriminator');
 h.values.set('GSIS_SECRET','bad');assert.equal(c.doPost(signed(service,legacy)).status,503);
}
{
 const h=scope({GSIS_SECRET:canonical,VENUES_BRIDGE_SECRET:legacy,VENUES_CONTACTS_APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec'}),c=h.context;
 let requests=0;c.UrlFetchApp={fetch(url,options){requests++;assert.equal(url,'https://script.google.com/macros/s/synthetic/exec');const envelope=JSON.parse(options.payload);assert.equal(envelope.signature,crypto.createHmac('sha256',canonical).update(envelope.payload).digest('hex'),'outgoing GSiS source uses canonical signing key');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data:{schema:1,source:'contacts',authoritative:true,key:'current',observedAt:new Date().toISOString()}})};}};
 vm.runInContext(source('venues-backend/Sources.gs'),c);
 assert.equal(c.venuesSourceRequest_('contacts',{operation:'manifest'}).key,'current');assert.equal(requests,1);
 h.values.set('GSIS_SECRET','bad');assert.throws(()=>c.venuesSourceRequest_('contacts',{operation:'manifest'}),error=>error.code==='GSIS_SECRET_INVALID');assert.equal(requests,1,'invalid canonical prevents outgoing network IO');
}
console.log('PASS G canonical Apps Script authentication, strict precedence, legacy compatibility, safe failures and optional connection isolation');
