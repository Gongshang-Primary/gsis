import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

execFileSync('python3',['scripts/build-notification-worker.py','--check']);
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const bundled=await import('../notification-worker/dashboard-worker.mjs');
assert.equal(fs.readFileSync('notification-worker/dashboard-worker.mjs','utf8'),fs.readFileSync('notification-worker/dashboard-worker.txt','utf8'));
assert.deepEqual(bundled.WHATSAPP_CONTRACTS,gateway.WHATSAPP_CONTRACTS);
const env={WHATSAPP_ENABLED:'false',ROSTER_AUTOMATION_ENABLED:'false',WHATSAPP_MENU_ENABLED:'false',WHATSAPP_TEMPLATES_JSON:'{}',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v26.0',WHATSAPP_ACCESS_TOKEN:'test-token-'.repeat(8),WHATSAPP_APP_SECRET:'test-app-'.repeat(8),WHATSAPP_VERIFY_TOKEN:'test-verify-'.repeat(8),ROSTER_SERVICE_SECRET:'test-service-'.repeat(8),EXTERNAL_LINK_SECRET:'test-link-'.repeat(8),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy-test/exec',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-test/exec',CALENDAR_PROXY_SECRET:'test-calendar-'.repeat(8)};
const event={scheduledTime:Date.parse('2026-10-15T08:00:00Z')};
// Keep diagnostics and notification claims in the fixture's afternoon window.
Date.now=()=>event.scheduledTime;
async function scheduled(module,settings){let pending;await module.default.scheduled(event,settings,{waitUntil(promise){pending=promise;}});await pending;}
let calls=[];
const independentOperations=[];
globalThis.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).payload).input;assert.equal(String(url),env.APPS_SCRIPT_URL);assert(['nextAbsenceIntake','sendPeerMail'].includes(input.operation),'recovery retains report capture and peer mail while auxiliary jobs stay paused');independentOperations.push(input.operation);if(input.operation==='nextAbsenceIntake')return Response.json({ok:true,data:{job:null}});if(input.operation==='sendPeerMail')return Response.json({ok:true,data:{sent:0,pending:0}});if(input.operation==='deliveryReviewMailDispatch'){assert.equal(input.monitor.state,'disabled');return Response.json({ok:true,data:{sent:0,pending:0,uncertain:0}});}return Response.json({ok:true,data:{exported:[],pending:0,failures:[]}});};
await scheduled(bundled,env);
assert.deepEqual(independentOperations.sort(),['nextAbsenceIntake','sendPeerMail']);
assert.equal((await bundled.default.fetch(new Request('https://worker.example.test/diagnostics'),env)).status,404);
assert.deepEqual(await bundled.diagnoseNotificationConnections(env),{enabled:false,readOnly:true});
const inactive=gateway.notificationStatus(env);
assert.equal(inactive.enabled,false);assert.equal(inactive.configured,true);assert.equal(inactive.ready,false);assert.equal(inactive.templatesEnabled,0);assert.equal(inactive.approvalCheckRequired,true);
assert(Object.values(inactive.routes).every(t=>t.status==='not_configured'&&t.approval==='unverified'&&!t.ready));
assert.equal((await gateway.trustedOperationsInput({operation:'directory'},env,{})).calendarByDate&&calls.length,0);

const live=Object.values(gateway.WHATSAPP_CONTRACTS).map(t=>({name:t.name,language:t.language,status:'PENDING',category:t.category,components:[{type:'BODY',text:t.body}]}));
function responses(input,init={}){
 const url=new URL(input),body=init.body?JSON.parse(init.body):null;
 calls.push({url,init,body});
 if(url.hostname==='graph.facebook.com'){
  assert(!init.method||init.method==='GET','Diagnostics only read Meta');
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:live});
  assert.equal(url.pathname,'/v26.0/'+env.WHATSAPP_PHONE_NUMBER_ID);
  return Response.json({id:env.WHATSAPP_PHONE_NUMBER_ID});
 }
 if(url.pathname.includes('/deploy-test/')){
  const req=JSON.parse(body.payload);
  assert.equal(req.action,'rosterService');assert.equal(req.service,'gsis-roster-notifier-v1');assert.deepEqual(req.input,{operation:'connectionStatus'});
  return gateway.sign(req,env.ROSTER_SERVICE_SECRET).then(expected=>{assert.equal(body.signature,expected.signature);return Response.json({ok:true,data:{readOnly:true,contactsReady:true,staffData:'must never be returned or logged'}});});
 }
 assert(url.pathname.includes('/calendar-test/'));assert.equal(body.action,'rosterDate');assert.equal(body.service,'gsis-roster-notifier-v1');
 return Response.json({ok:true,result:{date:body.payload.date,schoolDay:true,parity:'odd',staffData:'must never be returned or logged'}});
}
globalThis.fetch=responses;
const settings={...env,WHATSAPP_DIAGNOSTICS_ENABLED:'true'};
const result=await gateway.diagnoseNotificationConnections(settings,event.scheduledTime);
assert(result.readOnly&&result.connectionsReady&&!result.sendingTested);
assert.equal(result.checks.find(c=>c.name==='metaTemplates').approved,0);
assert.equal(calls.length,4);
assert(!JSON.stringify(result).includes('staffData'));
for(const value of [env.WHATSAPP_ACCESS_TOKEN,env.WHATSAPP_APP_SECRET,env.ROSTER_SERVICE_SECRET])assert(!JSON.stringify(result).includes(value));
const output=[];const info=console.info;console.info=value=>output.push(JSON.parse(value));
try{
 calls=[];
 // The diagnostic branch must suppress normal claims and allocation even if
 // an operator accidentally leaves their activation flags true.
 await scheduled(bundled,{...settings,WHATSAPP_ENABLED:'true',ROSTER_AUTOMATION_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true'});
 assert.equal(calls.length,4);assert.equal(output.length,1);assert.equal(output[0].event,'roster-notification-connections');
 assert(output[0].readOnly&&output[0].connectionsReady&&!output[0].sendingTested);
 assert(!JSON.stringify(output).includes('staffData'));
}finally{console.info=info;}
calls=[];
assert.equal((await gateway.diagnoseNotificationConnections({...settings,EXTERNAL_LINK_SECRET:''})).connectionsReady,false);assert.equal(calls.length,0);
globalThis.fetch=async()=>{throw Error('upstream contains '+env.WHATSAPP_ACCESS_TOKEN);};
const failed=await gateway.diagnoseNotificationConnections(settings,event.scheduledTime);
assert.equal(failed.connectionsReady,false);assert(failed.checks.filter(c=>c.name!=='configuration').every(c=>!c.ok));assert(!JSON.stringify(failed).includes(env.WHATSAPP_ACCESS_TOKEN));

// Changing the outbound API version cannot reuse an earlier approval cache.
const c=gateway.WHATSAPP_CONTRACTS.relief_assignment,config={templates:{relief_assignment:{...c,enabled:true}},contactsUrl:env.CONTACTS_PUBLIC_URL};
globalThis.fetch=async()=>Response.json({data:[{...c,status:'APPROVED',components:[{type:'BODY',text:c.body}]}]});
assert.deepEqual(await gateway.approvedTemplateKeys(env,config),['relief_assignment']);
globalThis.fetch=async()=>Response.json({error:{code:1}},{status:400});
await assert.rejects(()=>gateway.approvedTemplateKeys({...env,WHATSAPP_API_VERSION:'v25.0'},config),/approval check failed/);

// The pasted Worker preserves approved-contract dispatch and durable outcomes.
for(const module of [gateway,bundled]){
 const row={id:'job-test',claimId:'claim-test',recipientId:'person-test',name:'Test recipient',mobile:'6591234567',kind:'relief_publication',date:'2026-10-15',expiresAt:Date.now()+3600000,data:{templateKey:'relief_assignment',summary:'Test lesson'}};
 const enabled={...env,WHATSAPP_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:env.WHATSAPP_ACCESS_TOKEN+'dispatch-test',WHATSAPP_TEMPLATES_JSON:JSON.stringify({relief_assignment:{...c,enabled:true}})};
 const operations=[];let messages=0;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('/message_templates?'))return Response.json({data:[{...c,status:'APPROVED',components:[{type:'BODY',text:c.body}]}]});
  if(url.endsWith('/messages')){messages++;const p=JSON.parse(init.body);assert.equal(p.template.name,c.name);assert.equal(p.template.components[0].parameters.length,c.fields.length);return Response.json({messages:[{id:'wamid.test'}]});}
  const p=JSON.parse(JSON.parse(init.body).payload).input;operations.push(p);
  if(p.operation==='nextAbsenceIntake')return Response.json({ok:true,data:{job:null}});
  if(p.operation==='sendPeerMail')return Response.json({ok:true,data:{sent:0,pending:0}});
  if(p.operation==='inboxPendingDispatch')return Response.json({ok:true,data:{replies:[],alerts:[]}});
  if(p.operation==='allocationAuditExport')return Response.json({ok:true,data:{exported:[],pending:0,failures:[]}});
  if(p.operation==='deliveryReviewMailDispatch'){assert.equal(p.monitor.state,'checked');assert.deepEqual(p.monitor.routes,[]);return Response.json({ok:true,data:{sent:0,pending:0,uncertain:0}});}
  if(p.operation==='claimNotifications')return Response.json({ok:true,data:{notifications:[row]}});
  if(p.operation==='prepareNotification')return Response.json({ok:true,data:{notification:row}});
  assert.equal(p.operation,'notificationResult');assert.equal(p.state,'sent');assert.equal(p.messageId,'wamid.test');return Response.json({ok:true,data:{}});
 };
 if(module===gateway)assert.equal((await module.dispatchNotifications(enabled)).sent,1);else await scheduled(module,enabled);
 assert.equal(messages,1);assert.deepEqual(operations.map(p=>p.operation).filter(op=>!['inboxPendingDispatch','allocationAuditExport','deliveryReviewMailDispatch','nextAbsenceIntake','sendPeerMail'].includes(op)),['claimNotifications','prepareNotification','notificationResult','claimNotifications']);for(const auxiliary of ['deliveryReviewMailDispatch','allocationAuditExport'])assert.equal(operations.filter(p=>p.operation===auxiliary).length,0,'recovery suspends auxiliary jobs');
}

const snapshot=JSON.parse(fs.readFileSync('notification-worker/template-observation-20261016.json'));
assert.equal(snapshot.templates.length,19);assert.equal(snapshot.details.length,18);
assert(snapshot.templates.some(t=>t.name==='gsis_relief_evening_v2'),'v2 remains in the provider observation');
const currentSnapshot=JSON.parse(fs.readFileSync('notification-worker/template-observation-20261017.json'));
assert.equal(currentSnapshot.templates.length,21);
for(const contract of Object.values(gateway.WHATSAPP_CONTRACTS)){
 const observed=currentSnapshot.templates.find(t=>t.name===contract.name);
 assert(observed);assert.equal(contract.bodySha256,observed.bodySha256);assert.equal(contract.id,observed.id);assert.equal(observed.category,'UTILITY');assert.equal(contract.submissionState,observed.status);
}
const disabled=JSON.parse(fs.readFileSync('notification-worker/templates.disabled.example.json'));
assert(Object.values(disabled).every(t=>t.enabled===false&&t.verifiedAt===null));
assert.equal(gateway.WHATSAPP_CONTRACTS.smc_attention.name,'gsis_relief_attention_v2');
console.log('PASS notification setup: source/bundle parity, disabled sending with retained report intake and peer mail, signed read-only diagnostics, sanitized failures, API-version cache separation and exact provider contracts; no live sends.');
