import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),adapter=require('./roster701-adapter.cjs');
globalThis.crypto??=webcrypto;
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost(e){'),post=source.slice(start,source.indexOf('\nfunction auth_',start));
const origin='https://roster.test',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'synthetic-email-settings-bridge-secret-0123456789'};
const h=adapter();
vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),h.scope);
h.scope.GSISRosterStapler=require('../shared/roster-stapler.js');
h.scope.Date=Date;
h.scope.Utilities.formatDate=(date,zone,format)=>{const value=new Date(date.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?value.slice(0,10):format==='HH'?value.slice(11,13):value.slice(14,16);};
for(const name of ['rosterIndex_','rosterModel_','rosterOperationsQuota_','rosterOperationsReconcile_','rosterOperationsReadReconcile_'])h.scope[name]=()=>assert.fail('Email settings must not use '+name);
const contacts={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:false},rosterPeople:h.people.map(person=>({...person,email:person.id+'@gsps.edu.sg',emails:[person.id+'@gsps.edu.sg']})),rosterSMCIds:['alice']};
let contactsCalls=0,backendCalls=0,backgroundCalls=0,failMode='';
const properties=h.scope.props_(),transportProperties=h.scope.PropertiesService.getScriptProperties();
Object.assign(h.scope,{
 GSIS_DEPLOY_VERSION:'0.8.2',GSISSheets:{resetStats(){}},
 props_:()=>({...properties,getProperty:key=>key==='BRIDGE_SECRET'?env.BRIDGE_SECRET:properties.getProperty(key)}),
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='BRIDGE_SECRET'?env.BRIDGE_SECRET:transportProperties.getProperty(key)})},
 signature_:(payload,secret)=>createHmac('sha256',secret).update(payload).digest('hex'),same_:(a,b)=>a===b,
 rosterDiagnostic_(){},rosterDiagnosticError_:error=>error.message,rosterDiagnosticText_:text=>text,
 rosterStage_(){},rosterFailureDetail_:()=>({backendVersion:'0.8.2',failureStage:'save'}),
 contacts_:(identity,authorityOnly,action,input)=>{
  contactsCalls++;assert.equal(identity.email,'alice@gsps.edu.sg');assert.equal(identity.subject,'synthetic-google-subject');
  assert.equal(action,'deploySnapshot');assert.equal(input.rosterAuthority,true);assert.equal(input.rosterDirectory,true);assert.equal(input.authorityOnly,true);assert.equal(input.palAuthority,false);
  return contacts;
 },
 rosterDispatch_:(req,c)=>{assert.equal(req.action,'rosterOperations');return h.scope.rosterOperationsDispatch_(req,c);},
 out_:result=>JSON.stringify(result),
 MailApp:{sendEmail:()=>assert.fail('Settings save sent email'),getRemainingDailyQuota:()=>assert.fail('Settings save checked email quota')}
});
vm.runInContext(fs.readFileSync('backend/ApiSecret.gs','utf8'),h.scope);
require('./helpers/load-roster-diagnostic-build.cjs')(h.scope);
vm.runInContext(post,h.scope);
const now=Date.now(),signed=await gateway.sign({purpose:'gsis-session-v1',origin,email:'alice@gsps.edu.sg',subject:'synthetic-google-subject',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const oldFetch=globalThis.fetch,oldInfo=console.info,oldError=console.error;
console.info=console.error=()=>{};
globalThis.fetch=async(url,options)=>{
 backendCalls++;assert.equal(String(url),env.APPS_SCRIPT_URL,'Settings save must not request Calendar or messaging services');
 const envelope=JSON.parse(options.body),payload=JSON.parse(envelope.payload);
 assert.equal(payload.action,'rosterOperations');assert.deepEqual(payload.input.calendarByDate,{});
 assert.equal(payload.identity.subject,'synthetic-google-subject');assert.ok(payload.input.trustedNow>0);
 if(failMode==='before'){failMode='';throw TypeError('Synthetic network unavailable');}
 const result=h.scope.doPost({postData:{contents:options.body}});
 if(failMode==='after'){failMode='';throw TypeError('Synthetic response lost');}
 return new Response(result,{headers:{'Content-Type':'application/json'}});
};
async function request(input){
 const response=await gateway.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env,{waitUntil:()=>{backgroundCalls++;assert.fail('Settings save queued background dispatch');}});
 return {status:response.status,body:await response.json()};
}
const input=(revision,subject='Daily Updates')=>({operation:'saveDailyEmploymentSettings',date:h.date,revision,requestId:crypto.randomUUID(),subject,time:'08:00',recipients:[{staffId:'bob',emails:['bob@gsps.edu.sg']}],calendarByDate:{forged:true},identity:{email:'forged@gsps.edu.sg',subject:'forged'},service:'forged'});
try{
 const saved=await request(input(0));assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.data.settings.subject,'Daily Updates');assert.deepEqual(saved.body.data.settings.recipients,[{staffId:'bob',emails:['bob@gsps.edu.sg']}]);assert.equal(saved.body.data.revision,1);assert.equal(h.calls.writes,1);assert.equal(backgroundCalls,0);
 console.log('PASS authenticated recipient save crosses gateway, signed doPost and actual backend without Calendar or email dispatch');

 const retry=input(1,'Updated report subject');failMode='after';const uncertain=await request(retry);assert.equal(uncertain.status,503);assert.equal(uncertain.body.code,'BACKEND_UNAVAILABLE');assert.match(uncertain.body.error,/save could not be confirmed/);assert.equal(h.calls.writes,2);assert.equal(h.state().dailyEmploymentSettings.subject,'Updated report subject');
 const replay=await request(retry);assert.equal(replay.status,200);assert.equal(replay.body.data.replayed,true);assert.equal(h.calls.writes,2);assert.equal(h.state().audit.filter(row=>row.operation==='saveDailyEmploymentSettings').length,2);
 console.log('PASS gateway response loss leaves one durable save and exact retry confirms its receipt without a duplicate save');

 const offline=input(2);failMode='before';const notSent=await request(offline);assert.equal(notSent.status,503);assert.equal(h.calls.writes,2);const retried=await request(offline);assert.equal(retried.status,200);assert.equal(h.calls.writes,3);
 const validation=await request({...input(3),recipients:[{staffId:'bob',emails:['unlisted@gsps.edu.sg']}]});assert.equal(validation.status,400);assert.match(validation.body.error,/Contacts/);
 const stale=await request(input(0));assert.equal(stale.status,409);assert.equal(h.calls.writes,3);
 contacts.user.rosterSMC=false;const denied=await request(input(3));assert.equal(denied.status,403);assert.equal(h.calls.writes,3);assert.equal(backgroundCalls,0);assert.equal(contactsCalls,backendCalls-1);
 console.log('PASS transport errors remain retryable; invalid recipient, stale revision and unauthorised editor retain precise status without writing');

 contacts.user.rosterSMC=true;const loaded=await request({operation:'dailyEmployment',date:h.date});assert.equal(loaded.status,200);assert.match(loaded.body.data.settingsToken,/^[a-f0-9]{64}$/);
 const changedElsewhere=h.state();changedElsewhere.revision+=5;h.setState(changedElsewhere);
 const scoped=input(loaded.body.data.revision,'Saved through settings token');scoped.expectedSettingsToken=loaded.body.data.settingsToken;
 const scopedSaved=await request(scoped);assert.equal(scopedSaved.status,200);assert.equal(scopedSaved.body.data.revision,changedElsewhere.revision+1);assert.notEqual(scopedSaved.body.data.settingsToken,loaded.body.data.settingsToken);
 const settingsConflict=await request({...scoped,requestId:crypto.randomUUID(),revision:scopedSaved.body.data.revision,subject:'Stale settings edit'});assert.equal(settingsConflict.status,409);assert.equal(settingsConflict.body.code,'SETTINGS_CONFLICT');assert.match(settingsConflict.body.error,/recipient settings changed/);
 const scopedReplay=await request(scoped);assert.equal(scopedReplay.status,200);assert.equal(scopedReplay.body.data.replayed,true);assert.equal(h.calls.writes,4);assert.equal(backgroundCalls,0);
 console.log('PASS settings tokens cross signed transport, permit unrelated revisions, preserve exact retry and expose genuine SETTINGS_CONFLICT');
}finally{globalThis.fetch=oldFetch;console.info=oldInfo;console.error=oldError;}
