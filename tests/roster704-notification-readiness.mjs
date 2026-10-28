import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

// Synthetic Meta catalogue and school responses only. No live requests or sends.
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const C=M.WHATSAPP_CONTRACTS,chosen=['relief_assignment','relief_morning','relief_evening','conditional_relief_instruction','contact_review'];
const templates=Object.fromEntries(chosen.map(key=>[key,{...C[key],enabled:key!=='contact_review'}]));
const env={GOOGLE_CLIENT_ID:'test-client',WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v26.0',WHATSAPP_ACCESS_TOKEN:'test-token-'.repeat(8),WHATSAPP_APP_SECRET:'test-app-'.repeat(8),WHATSAPP_VERIFY_TOKEN:'test-verify-'.repeat(8),ROSTER_SERVICE_SECRET:'test-service-'.repeat(8),EXTERNAL_LINK_SECRET:'test-link-'.repeat(8),BRIDGE_SECRET:'test-bridge-'.repeat(8),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy-test/exec',WHATSAPP_TEMPLATES_JSON:JSON.stringify(templates)};
let calls=0;
globalThis.fetch=async()=>{throw Error('Status reads must not fetch Meta');};
let status=M.notificationStatus(env);
assert.equal(status.ready,false);assert.equal(status.routes.relief_assignment.status,'unverified');assert.equal(status.routes.contact_review.status,'disabled');assert.equal(status.routes.mutual_request.status,'not_configured');
const live=chosen.filter(key=>key!=='conditional_relief_instruction').map(key=>({...C[key],status:key==='relief_morning'?'PENDING':'APPROVED',components:[{type:'BODY',text:C[key].body+(key==='relief_evening'?' changed':'')}]}));
globalThis.fetch=async()=>{calls++;return Response.json({data:live});};
assert.deepEqual(await M.approvedTemplateKeys(env),['relief_assignment']);
assert.deepEqual(await M.approvedTemplateKeys(env),['relief_assignment']);assert.equal(calls,1);
status=M.notificationStatus(env);
assert.equal(status.ready,false,'one approved route cannot mark all enabled notifications ready');
assert.equal(status.templatesReady,1);assert.equal(status.templatesEnabled,4);assert.equal(status.approvalCheckRequired,false);
assert.deepEqual(chosen.map(key=>status.routes[key].status),['approved','pending','mismatch','missing','disabled']);
assert.equal(status.routes.contact_review.approval,'approved');assert.equal(status.routes.contact_review.ready,false,'provider approval does not enable a route');
const disabled=M.notificationStatus({...env,WHATSAPP_ENABLED:'false'});
assert.equal(disabled.ready,false);assert.equal(disabled.templatesReady,0);assert.equal(disabled.routes.relief_assignment.status,'disabled');assert.equal(disabled.routes.relief_assignment.approval,'approved');
assert.equal(calls,1,'page/status reads reuse existing cache without any new fetches');
assert.equal(M.notificationStatus({...env,WHATSAPP_API_VERSION:'v25.0'}).routes.relief_assignment.approval,'unverified');
const broken=M.notificationStatus({...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({...templates,relief_assignment:{...templates.relief_assignment,bodySha256:'wrong'}})});
assert.equal(broken.configured,false);assert.equal(broken.routes.relief_assignment.status,'mismatch');assert.equal(broken.ready,false);
const originalNow=Date.now;
try{Date.now=()=>status.checkedAt+300001;assert.equal(M.notificationStatus(env).routes.relief_assignment.approval,'unverified');assert.equal(M.notificationStatus(env).ready,false);}finally{Date.now=originalNow;}

// The public config and ordinary staff responses do not disclose route diagnostics.
globalThis.fetch=async()=>{throw Error('Public status must not fetch');};
const origin=env.ROSTER_PUBLIC_ORIGIN,publicConfig=await (await M.default.fetch(new Request(origin+'/api/config'),env)).json();
assert.equal(publicConfig.notifications.routes,undefined);
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),signed=await M.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
let user={email:'teacher@gsps.edu.sg',staffId:'teacher',smc:false,admin:false};
globalThis.fetch=async(url)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);return Response.json({ok:true,data:{date,today:date,user,notifications:{configured:false,pending:0}}});};
const request=(view='duties')=>new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify({operation:'read',view,date})});
let data=(await (await M.default.fetch(request(),env)).json()).data;
assert.equal(data.notifications.readiness,undefined);
user={...user,smc:true};data=(await (await M.default.fetch(request(),env)).json()).data;
assert.equal(data.notifications.readiness,undefined,'generic views have no readiness panel');
data=(await (await M.default.fetch(request('notificationReadiness'),env)).json()).data;
assert.deepEqual(data.notifications.readiness.routes,status.routes);
user={...user,smc:false,admin:true};data=(await (await M.default.fetch(request('notificationReadiness'),env)).json()).data;
assert(data.notifications.readiness,'Admin receives notification readiness diagnostics');
assert.deepEqual(data.notifications.readiness.routes,status.routes,'Admin receives the same readiness diagnostics as SMC');
user={...user,smc:true,admin:false};data=(await (await M.default.fetch(request('notificationReadiness'),env)).json()).data;
for(const value of [env.WHATSAPP_ACCESS_TOKEN,env.BRIDGE_SECRET,env.ROSTER_SERVICE_SECRET])assert(!JSON.stringify(data).includes(value));

const dom=new JSDOM('<main id="content"></main>',{url:origin,runScripts:'outside-only',pretendToBeVisual:true});
try{
 const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};
 vm.runInContext(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),dom.getInternalVMContext());
 const ctx={profile:{user},today:()=>date,container:w.document.getElementById('content'),status:()=>{},api:async()=>data};
 // Approval diagnostics remain a backend concern; the retired viewport must not return.
 for(const role of [{smc:true,admin:false},{smc:false,admin:true},{smc:false,admin:false}]){
  ctx.profile={user:{...user,...role}};
  assert.equal(w.RosterOpsUI.pages(ctx.profile).some(p=>p.name==='WhatsApp Readiness'),false);
  await assert.rejects(w.RosterOpsUI.render('WhatsApp Readiness',ctx),/do not have access/);
 }
 assert.equal(w.document.querySelector('.ops-notification-readiness'),null);
 assert.equal(w.document.querySelector('.ops-notification-issues'),null);
 assert(!w.document.body.textContent.includes('WhatsApp delivery needs review'));
}finally{dom.window.close();}
const onlyApproved={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({relief_assignment:templates.relief_assignment,contact_review:templates.contact_review})};
globalThis.fetch=async()=>Response.json({data:live});
assert.deepEqual(await M.approvedTemplateKeys(onlyApproved),['relief_assignment']);
assert.equal(M.notificationStatus(onlyApproved).ready,true,'all enabled routes are approved; disabled routes do not prevent readiness');
console.log('PASS per-route notification readiness, fail-closed approval/configuration/expiry, no extra Meta fetches, and retired diagnostics viewport for all roles. No live sends.');
