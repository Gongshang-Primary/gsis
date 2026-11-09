import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const bundle=await import('../notification-worker/dashboard-worker.mjs');
const env={WHATSAPP_DIAGNOSTICS_ENABLED:'true',WHATSAPP_ENABLED:'false',WHATSAPP_MENU_ENABLED:'false',ROSTER_AUTOMATION_ENABLED:'false',WHATSAPP_TEMPLATES_JSON:'{}',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'access-private-'.repeat(8),WHATSAPP_APP_SECRET:'app-private-'.repeat(8),WHATSAPP_VERIFY_TOKEN:'verify-private-'.repeat(8),GSIS_SECRET:'service-private-'.repeat(8),EXTERNAL_LINK_SECRET:'link-private-'.repeat(8),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy-test/exec',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-test/exec',CALENDAR_PROXY_SECRET:'calendar-private-'.repeat(8)};
const scheduledTime=Date.parse('2026-10-18T13:00:00Z');
const diagnosticBuildPattern=/^\d+\.\d+\.\d+-worker-diag[1-9]\d*$/;
let calls=[];
let sender=()=>Response.json({id:env.WHATSAPP_PHONE_NUMBER_ID});
let calendar=body=>Response.json({ok:true,result:{date:body.payload.date,schoolDay:true,parity:'odd',privateData:'PRIVATE_UPSTREAM'}});
function installFetch(){globalThis.fetch=async(input,init={})=>{
 const url=new URL(input),body=init.body?JSON.parse(init.body):null;
 calls.push({url,init,body});
 if(url.hostname==='graph.facebook.com'){
  assert.equal(init.redirect,'manual','Meta calls must use the Cloudflare-supported non-following redirect mode');
  assert(!init.method||init.method==='GET','Diagnostics must only read Meta');
  return url.pathname.endsWith('/message_templates')?Response.json({data:Object.values(gateway.WHATSAPP_CONTRACTS).map(c=>({...c,status:'APPROVED',components:[{type:'BODY',text:c.body}]}))}):sender();
 }
 if(url.href===env.APPS_SCRIPT_URL){
  const p=JSON.parse(body.payload);
  assert.deepEqual(p.input,{operation:'connectionStatus'},'No queue claim, allocation, publication or mail dispatch');
  assert.equal(body.signature,(await gateway.sign(p,env.GSIS_SECRET)).signature);
  return Response.json({ok:true,data:{readOnly:true,contactsReady:true,privateData:'PRIVATE_UPSTREAM'}});
 }
 assert.equal(url.href,env.CALENDAR_APPS_SCRIPT_URL);
 assert.equal(body.action,'rosterDate');assert.equal(body.service,'gsis-roster-notifier-v1');
 return calendar(body);
};}
function checkPrivacy(result){
 const text=JSON.stringify(result);
 for(const secret of [...Object.values(env).filter(x=>String(x).includes('private-')),'PRIVATE_UPSTREAM','RAW_PROVIDER_ERROR'])assert(!text.includes(secret));
 assert(!text.includes('script.google.com'),'Diagnostic output must not include deployment URLs');
}
for(const module of [gateway,bundle]){
 installFetch();calls=[];
 const success=await module.diagnoseNotificationConnections(env,scheduledTime);
 assert.equal(calls.length,4);assert.equal(success.connectionsReady,true);assert.equal(success.sendingTested,false);
 assert.match(success.diagnosticBuild,diagnosticBuildPattern);assert.equal(success.graphApiVersion,'v23.0');checkPrivacy(success);
 assert.equal(success.checks.find(c=>c.name==='metaTemplates').approved,22);
 const calendarSuccess=success.checks.find(c=>c.name==='calendar');
 assert.equal(calendarSuccess.phase,'complete');assert.equal(calendarSuccess.httpStatus,200);assert.equal(calendarSuccess.responseFormat,'json');assert(calendarSuccess.elapsedMs>=0);

 for(const field of ['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET',"GSIS_SECRET",'EXTERNAL_LINK_SECRET','ROSTER_PUBLIC_ORIGIN','APPS_SCRIPT_URL','WHATSAPP_VERIFY_TOKEN','WHATSAPP_ACCOUNT_ID','WHATSAPP_TEMPLATE_ACCOUNT_ID','CONTACTS_PUBLIC_URL','CALENDAR_APPS_SCRIPT_URL']){
  for(const [value,reason] of [['','MISSING_OR_EMPTY'],['bad','INVALID_VALUE']]){
   calls=[];const result=await module.diagnoseNotificationConnections({...env,[field]:value},scheduledTime);
   assert.equal(calls.length,0);assert.match(result.diagnosticBuild,diagnosticBuildPattern);
   assert.deepEqual(result.checks,[{name:'configuration',ok:false,code:'CONFIGURATION_INCOMPLETE',field,reason}]);checkPrivacy(result);
  }
 }
 for(const value of ['','bad']){calls=[];const ignoredLegacy=await module.diagnoseNotificationConnections({...env,CALENDAR_PROXY_SECRET:value},scheduledTime);assert.equal(calls.length,4,'obsolete Calendar key cannot disable canonical transport');assert.equal(ignoredLegacy.connectionsReady,true);checkPrivacy(ignoredLegacy);}
 const invalidTemplates=await module.diagnoseNotificationConnections({...env,WHATSAPP_TEMPLATES_JSON:'{"RAW_PROVIDER_ERROR":{}}'},scheduledTime);
 assert.equal(invalidTemplates.checks[0].field,'WHATSAPP_TEMPLATES_JSON');checkPrivacy(invalidTemplates);

 const senderCases=[
  [()=>Response.json({error:{code:190,error_subcode:463,message:'RAW_PROVIDER_ERROR'}},{status:401}),{phase:'response',httpStatus:401,metaErrorCode:190,metaErrorSubcode:463}],
  [()=>Response.json({error:{code:'190',error_subcode:'463',message:'RAW_PROVIDER_ERROR'}},{status:401}),{metaErrorCode:null,metaErrorSubcode:null}],
  [()=>Response.json({id:'different'}),{code:'SENDER_ID_MISMATCH',phase:'response'}],
  [()=>new Response('<html>RAW_PROVIDER_ERROR</html>',{status:302}),{code:'NON_JSON_RESPONSE',httpStatus:302,phase:'response-json'}],
  [()=>{throw Object.assign(Error('RAW_PROVIDER_ERROR'),{name:'TimeoutError'});},{code:'TIMEOUT',httpStatus:null,phase:'request'}],
  [()=>{throw Error('RAW_PROVIDER_ERROR');},{code:'FETCH_FAILED',httpStatus:null,phase:'request'}]
 ];
 for(const [response,expected] of senderCases){
  sender=response;const result=await module.diagnoseNotificationConnections(env,scheduledTime),check=result.checks.find(c=>c.name==='metaSender');
  assert.equal(check.ok,false);for(const [key,value] of Object.entries(expected))assert.equal(check[key],value);checkPrivacy(result);
 }
 sender=()=>Response.json({id:env.WHATSAPP_PHONE_NUMBER_ID});
 const calendarCases=[
  [()=>new Response('RAW_PROVIDER_ERROR',{status:503}),{code:'HTTP_ERROR',phase:'response',httpStatus:503}],
  [()=>new Response('<html>RAW_PROVIDER_ERROR</html>',{headers:{'Content-Type':'text/html'}}),{code:'NON_JSON_RESPONSE',phase:'response-json',responseFormat:'html'}],
  [()=>Response.json(null),{code:'INVALID_RESPONSE_ENVELOPE',phase:'backend-response'}],
  [()=>Response.json({ok:true,result:{date:'not-the-requested-date'}}),{code:'INVALID_CALENDAR_RESULT',phase:'result-validation'}],
  [()=>Response.json({ok:false,code:'YEAR_UNAVAILABLE'}),{code:'YEAR_UNAVAILABLE',phase:'backend-response'}],
  [()=>Response.json({ok:false,status:403,code:'PRIVATE_UPSTREAM',error:'Unauthorised proxy.'}),{code:'BACKEND_REJECTED',backendCode:'UNRECOGNISED_CODE',backendStatus:403,backendError:'PROXY_SECRET_MISMATCH'}],
  [()=>Response.json({ok:false,error:'Backend is not configured: CALENDAR_PROXY_SECRET missing.'}),{backendError:'CALENDAR_SECRET_MISSING'}],
  [()=>Response.json({ok:false,error:'Calendar service action is not allowed.'}),{backendError:'SERVICE_ACTION_NOT_ALLOWED'}],
  [()=>Response.json({ok:false,error:'GSPS account required.'}),{backendError:'SERVICE_IDENTITY_NOT_ACCEPTED'}],
  [()=>Response.json({ok:false,error:"Cannot read properties of null (reading 'getSheetByName')"}),{backendError:'SPREADSHEET_UNAVAILABLE'}],
  [()=>Response.json({ok:false,code:'RAW_PROVIDER_ERROR',error:'RAW_PROVIDER_ERROR'}),{backendError:'OTHER_BACKEND_ERROR',backendCode:'UNRECOGNISED_CODE'}],
  [()=>{throw Object.assign(Error('RAW_PROVIDER_ERROR'),{name:'TimeoutError'});},{code:'TIMEOUT',phase:'request',httpStatus:null}],
  [()=>{throw Error('RAW_PROVIDER_ERROR');},{code:'FETCH_FAILED',phase:'request',httpStatus:null}]
 ];
 for(const [response,expected] of calendarCases){
  calendar=response;const result=await module.diagnoseNotificationConnections(env,scheduledTime),check=result.checks.find(c=>c.name==='calendar');
  assert.equal(check.ok,false);for(const [key,value] of Object.entries(expected))assert.equal(check[key],value);assert(check.elapsedMs>=0);checkPrivacy(result);
 }
 calendar=body=>Response.json({ok:true,result:{date:body.payload.date,schoolDay:true,parity:'odd'}});
}

// Both browser and dashboard modules must preserve disabled defaults and the compact contracts.
for(const name of ['templates.activation.json','templates.disabled.example.json']){
 const raw=fs.readFileSync('notification-worker/'+name,'utf8'),templates=JSON.parse(raw);
 assert(Buffer.byteLength(raw)<5120);assert.equal(Object.keys(templates).length,name==='templates.activation.json'?22:21);
 for(const [key,value] of Object.entries(templates)){
  const base=gateway.WHATSAPP_CONTRACTS[key],c=[base,...Object.values(base.variants||{})].find(contract=>contract.name===value.name);assert(c,'Configured template must match a known exact contract: '+key);assert.equal(value.name,c.name);assert.equal(value.language,c.language);assert.equal(value.bodySha256,c.bodySha256);assert.equal(value.summaryMaxCharacters,1024);
  assert.equal(value.enabled,name==='templates.activation.json'&&key!=='system_alert','Pending system alert stays disabled until approved and activated');
 }
 for(const module of [gateway,bundle])assert.equal(module.notificationStatus({...env,WHATSAPP_TEMPLATES_JSON:raw}).configured,true);
}
assert.match(fs.readFileSync('notification-worker/wrangler.toml','utf8'),/WHATSAPP_ENABLED = "false"/);

// Exercise both sending paths with mocked Meta replies. Neither path may follow a redirect.
for(const module of [gateway,bundle]){
 const enabled={...env,WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true',WHATSAPP_TEMPLATES_JSON:fs.readFileSync('notification-worker/templates.activation.json','utf8')};
 const row={id:'test-job',claimId:'test-claim',recipientId:'test-teacher',name:'Teacher',mobile:'6590000000',kind:'relief_publication',date:'2026-10-18',expiresAt:Date.now()+60000,data:{templateKey:'relief_assignment',summary:'Test lesson'}};
 const sent=[],outcomes=[];let queue=[row];
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==='graph.facebook.com'){
   assert.equal(init.redirect,'manual');
   if(url.pathname.endsWith('/message_templates'))return Response.json({data:Object.values(gateway.WHATSAPP_CONTRACTS).map(c=>({...c,status:'APPROVED',components:[{type:'BODY',text:c.body}]}))});
   sent.push(JSON.parse(init.body));return Response.json({messages:[{id:'wamid.test'}]});
  }
  const p=JSON.parse(JSON.parse(init.body).payload).input;
  if(p.operation==='claimNotifications'){const notifications=queue;queue=[];return Response.json({ok:true,data:{notifications}});}
  if(p.operation==='prepareNotification')return Response.json({ok:true,data:{notification:row}});
  if(p.operation==='inboxIngest')return Response.json({ok:true,data:{recorded:true}});
  if(p.operation==='inboundMessage')return Response.json({ok:true,data:{receiptId:'test-receipt',replyClaimId:'test-reply',reply:{to:row.mobile,action:'menu'}}});
  outcomes.push(p);return Response.json({ok:true,data:{}});
 };
 assert.equal((await module.dispatchNotifications(enabled)).sent,1);
 const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages:[{id:'wamid.inbound',from:row.mobile,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'menu'}}]}}]}]};
 const signed=await module.sign(event,env.WHATSAPP_APP_SECRET);
 const response=await module.whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),enabled);
 assert.equal(response.status,200);assert.deepEqual(sent.map(x=>x.type),['template','interactive']);
 assert.deepEqual(outcomes.map(x=>[x.operation,x.state]),[['notificationResult','sent'],['inboundReplyResult','sent']]);
}

// Scheduled diagnostics still pre-empt all normal services, even with activation flags set.
installFetch();calls=[];
const savedInfo=console.info,logs=[];console.info=x=>logs.push(JSON.parse(x));
try{
 let pending;await bundle.default.scheduled({scheduledTime},{...env,WHATSAPP_ENABLED:'true',ROSTER_AUTOMATION_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true'},{waitUntil(p){pending=p;}});await pending;
 assert.equal(calls.length,4);assert.equal(logs.length,1);checkPrivacy(logs);
}finally{console.info=savedInfo;}
console.log('PASS v0.7.11 worker diagnostics: safe configuration/Meta/Calendar failure classes, manual redirects, no-send scheduler and compact 21-route values.');

