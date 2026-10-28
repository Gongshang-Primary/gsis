import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test';
const env={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy/exec',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),EXTERNAL_LINK_SECRET:'l'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40),ROSTER_PUBLIC_ORIGIN:origin,CONTACTS_PUBLIC_URL:'https://contacts.test/',WHATSAPP_ENABLED:'false',WHATSAPP_API_VERSION:'v99.0',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'987654321',WHATSAPP_APP_SECRET:'a'.repeat(40),WHATSAPP_ACCESS_TOKEN:'t'.repeat(40),WHATSAPP_VERIFY_TOKEN:'v'.repeat(40),WHATSAPP_TEMPLATES_JSON:JSON.stringify(Object.fromEntries(['mutual_request','mutual_override','contact_review'].map(kind=>[kind,{name:'gsis_'+kind,language:'en_GB'}])))};
const now=Date.now(),today=new Date(now+8*3600000).toISOString().slice(0,10);
const signed=await M.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const req=(path,input,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,...headers},body:JSON.stringify(input)});
let calls=[],schoolInputs=[],serviceInputs=[];
function recordedFetch(handler){globalThis.fetch=async(url,options)=>{calls.push(String(url));return handler(String(url),options)}}
recordedFetch(async(url,options)=>{
 const envelope=JSON.parse(options.body);
 if(url===env.CALENDAR_APPS_SCRIPT_URL)return Response.json({ok:true,result:{date:envelope.payload.date,schoolDay:true,parity:'odd'}});
 const payload=JSON.parse(envelope.payload);schoolInputs.push(payload);
 assert.equal((await M.sign(payload,env.BRIDGE_SECRET)).signature,envelope.signature);
 return Response.json({ok:true,data:{revision:1}});
});
let result=await M.default.fetch(req('/api/operations',{operation:'read',date:today,trustedNow:-5,calendarByDate:{[today]:{schoolDay:false,parity:'even'}},calendar:{schoolDay:false},capability:{staffId:'victim'},identity:{email:'admin@gsps.edu.sg'},service:'forged'}),env);
assert.equal(result.status,200);let forwarded=schoolInputs.at(-1);
assert.equal(forwarded.action,'rosterOperations');assert.equal(forwarded.identity.email,'teacher@gsps.edu.sg');assert.equal(forwarded.input.calendarByDate[today].parity,'odd');assert.equal(forwarded.input.calendarByDate[today].available,true);assert.ok(forwarded.input.trustedNow>=now);assert.equal(forwarded.input.calendar,undefined);assert.equal(forwarded.input.capability,undefined);assert.equal(forwarded.input.identity,undefined);assert.equal(forwarded.input.service,undefined);
assert.equal((await M.default.fetch(req('/api/operations',{operation:'read',date:today},{Origin:'https://evil.test'}),env)).status,403);
assert.equal((await M.default.fetch(req('/api/operations',{operation:'read',date:today},{Cookie:''}),env)).status,401);
assert.equal((await M.default.fetch(req('/api/operations',{operation:'read',dates:['not-a-date']}),env)).status,400);
assert.equal((await M.default.fetch(req('/api/operations',{operation:'saveAbsence',from:'2026-01-01',to:'2026-12-31'}),env)).status,400);
assert.equal((await M.default.fetch(req('/api/operations',{operation:'prunePreview',from:'2026-01-01',to:'2026-12-31'}),env)).status,200);
assert.deepEqual(schoolInputs.at(-1).input.calendarByDate,{});
assert.equal((await M.default.fetch(req('/api/rosterService',{operation:'claimNotifications'}),env)).status,404);
recordedFetch(async(url,options)=>url===env.CALENDAR_APPS_SCRIPT_URL?new Response('offline',{status:503}):Response.json({ok:true,data:{input:JSON.parse(JSON.parse(options.body).payload).input}}));
result=await M.default.fetch(req('/api/operations',{operation:'read',date:today,calendarByDate:{[today]:{available:true,schoolDay:true}}}),env);
assert.equal((await result.json()).data.input.calendarByDate[today].available,false);

// Capabilities have independent secrets, audience, expiry and scoped actions.
const cap={staffId:'contact-1',date:today,purpose:'mutual',requestId:'mutual-1',expiresAt:now+3600000};
const token=await M.createCapability(cap,env,now);
assert.deepEqual(await M.readCapability(token,env,origin,now),cap);
await assert.rejects(()=>M.readCapability(token.slice(0,-1)+(token.endsWith('a')?'b':'a'),env,origin,now));
await assert.rejects(()=>M.readCapability(token,env,'https://evil.test',now));
await assert.rejects(()=>M.readCapability(token,env,origin,now+3600001));
await assert.rejects(()=>M.readCapability(token,{...env,EXTERNAL_LINK_SECRET:env.BRIDGE_SECRET},origin,now));
const url=await M.externalUrl(cap,env);assert.equal(new URL(url).search,'');assert.ok(new URL(url).hash.length>40);
recordedFetch(async(url,options)=>{
 const envelope=JSON.parse(options.body);
 if(url===env.CALENDAR_APPS_SCRIPT_URL){assert.equal(envelope.service,'gsis-roster-notifier-v1');assert.equal(envelope.actor,undefined);return Response.json({ok:true,result:{date:today,schoolDay:true,parity:'even'}})}
 const payload=JSON.parse(envelope.payload);serviceInputs.push(payload.input);assert.equal(payload.identity,undefined);assert.equal(payload.action,'rosterService');assert.equal(payload.service,'gsis-roster-notifier-v1');assert.equal((await M.sign(payload,env.ROSTER_SERVICE_SECRET)).signature,envelope.signature);return Response.json({ok:true,data:{date:today,duties:[]}});
});
result=await M.default.fetch(req('/api/external',{operation:'view',staffId:'victim',date:'2099-01-01',capability:{staffId:'victim'},calendarByDate:{[today]:{date:today,schoolDay:true,parity:'odd'}}},{Authorization:'Bearer '+token,Cookie:''}),env);
assert.equal(result.status,200);assert.equal(serviceInputs.at(-1).capability.staffId,'contact-1');assert.equal(serviceInputs.at(-1).capability.date,today);assert.equal(serviceInputs.at(-1).calendarByDate[today].parity,'even');assert.equal(serviceInputs.at(-1).calendarByDate[today].date,today);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('Referrer-Policy'),'no-referrer');
assert.equal((await M.default.fetch(req('/api/external',{operation:'respond',decision:'reject',reason:'',requestId:crypto.randomUUID()},{Authorization:'Bearer '+token}),env)).status,400);
result=await M.default.fetch(req('/api/external',{operation:'respond',decision:'approve',requestId:crypto.randomUUID(),calendarByDate:{[today]:{parity:'odd'}}},{Authorization:'Bearer '+token}),env);
assert.equal(result.status,200);assert.equal(serviceInputs.at(-1).calendarByDate[today].parity,'even');assert.equal(serviceInputs.at(-1).capability.requestId,'mutual-1');
const dutiesToken=await M.createCapability({...cap,purpose:'duties'},env);
assert.equal((await M.default.fetch(req('/api/external',{operation:'respond',decision:'approve',requestId:crypto.randomUUID()},{Authorization:'Bearer '+dutiesToken}),env)).status,403);
assert.equal((await M.default.fetch(req('/api/external',{operation:'prune'},{Authorization:'Bearer '+token}),env)).status,403);

// Disabled or incomplete configuration never even claims a queue item.
recordedFetch(()=>{throw Error('Must not call network')});
assert.deepEqual(await M.dispatchNotifications(env),{enabled:false,claimed:0,sent:0,failed:0,uncertain:0});
assert.equal((await M.dispatchNotifications({...env,WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:''})).claimed,0);
assert.equal(M.notificationStatus(env).ready,false);
const enabled={...env,WHATSAPP_ENABLED:'true'};
const row={id:'notification-1',claimId:'claim-1',kind:'mutual_request',recipientId:'contact-1',mobile:'6591234567',name:'Teacher',date:today,requestId:'mutual-1',expiresAt:Date.now()+3600000,data:{summary:'Please cover P2.'}};
let outcomes=[],sendCount=0,queue=[row],sendMode='ok';
recordedFetch(async(url,options)=>{
 if(url.startsWith('https://graph.facebook.com/')){
  sendCount++;const payload=JSON.parse(options.body);assert.equal(payload.to,'6591234567');assert.equal(payload.type,'template');assert.equal(typeof payload.biz_opaque_callback_data,'string');assert.equal(payload.template.components[0].parameters.length,4);assert.ok(payload.template.components[0].parameters[3].text.includes('/external.html#'));
  if(sendMode==='timeout')throw Object.assign(Error('timeout'),{name:'TimeoutError'});
  if(sendMode==='http500')return Response.json({error:{code:1}},{status:500});
  if(sendMode==='rejected')return Response.json({error:{code:131026}},{status:400});
  if(sendMode==='malformed')return Response.json({});
  return Response.json({messages:[{id:'wamid.message-1'}]});
 }
 const p=JSON.parse(JSON.parse(options.body).payload).input;
 if(p.operation==='claimNotifications'){const notifications=queue;queue=[];return Response.json({ok:true,data:{notifications}})}
 outcomes.push(p);return Response.json({ok:true,data:{}});
});
assert.equal((await M.dispatchNotifications(enabled)).sent,1);assert.equal(sendCount,1);assert.equal(outcomes.at(-1).messageId,'wamid.message-1');
assert.equal((await M.dispatchNotifications(enabled)).claimed,0);assert.equal(sendCount,1);
for(const [mode,expected] of [['timeout','uncertain'],['http500','uncertain'],['malformed','uncertain'],['rejected','failed']]){queue=[{...row,id:mode}];sendMode=mode;await M.dispatchNotifications(enabled);assert.equal(outcomes.at(-1).state,expected)}
const before=sendCount;queue=[{...row,expiresAt:Date.now()-1}];await M.dispatchNotifications(enabled);assert.equal(sendCount,before);assert.equal(outcomes.at(-1).error,'INVALID_OR_EXPIRED_NOTIFICATION');

// Verify signature against the exact raw body, account and sending number.
let deliveries=[];
recordedFetch(async(_url,options)=>{const p=JSON.parse(JSON.parse(options.body).payload);deliveries.push(p.input);return Response.json({ok:true,data:{duplicate:false}})});
const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},statuses:[{id:'wamid.message-1',status:'delivered',timestamp:'1791960000',recipient_id:'6591234567',biz_opaque_callback_data:'notification-1'}]}}]}]};
const raw=JSON.stringify(event),sig=await M.sign(event,env.WHATSAPP_APP_SECRET);
const webhook=(body=raw,signature='sha256='+sig.signature)=>new Request(origin+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':signature},body});
assert.equal((await M.default.fetch(webhook(raw,'sha256='+'0'.repeat(64)),env)).status,401);assert.equal(deliveries.length,0);
assert.equal((await M.default.fetch(webhook(raw+' '),env)).status,401);
assert.equal((await M.default.fetch(webhook(),env)).status,200);assert.equal(deliveries[0].messageId,'wamid.message-1');assert.equal(deliveries[0].notificationId,'notification-1');assert.equal(deliveries[0].recipientId,'6591234567');
await M.default.fetch(webhook(),env);assert.equal(deliveries[0].eventId,deliveries[1].eventId,'Duplicate webhook must pass same durable deduplication key');
const wrong=structuredClone(event);wrong.entry[0].changes[0].value.metadata.phone_number_id='999999999';const wrongSig=await M.sign(wrong,env.WHATSAPP_APP_SECRET);await M.default.fetch(webhook(wrongSig.payload,'sha256='+wrongSig.signature),env);assert.equal(deliveries.length,2);
globalThis.fetch=async()=>{throw Error('backend down')};assert.equal((await M.default.fetch(webhook(),env)).status,503,'Meta must retry delivery callbacks not yet persisted');
assert.equal((await M.default.fetch(new Request(origin+'/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token='+env.WHATSAPP_VERIFY_TOKEN+'&hub.challenge=123'),env)).status,200);
assert.equal((await M.default.fetch(new Request(origin+'/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123'),env)).status,403);

// Calendar service is strictly read-only and still verifies its bridge secret.
const calendar=fs.readFileSync('calendar-backend/Code.gs','utf8'),start=calendar.indexOf('function doPost(e)'),end=calendar.indexOf('\nfunction ',start+10),sandbox={Date,console:{log(){},error(){}},Utilities:{getUuid:()=>crypto.randomUUID()},parseRequest_:e=>e,jsonOutput_:x=>x,verifyProxySecret_:s=>{if(s!=='secret')throw Error('denied')},normaliseActor_:()=>{throw Error('Must not impersonate a school user')},apiRosterDate_:p=>({date:p.date,schoolDay:true})};
vm.createContext(sandbox);vm.runInContext(calendar.slice(start,end),sandbox);
assert.equal(sandbox.doPost({action:'rosterDate',service:'gsis-roster-notifier-v1',proxySecret:'secret',payload:{date:today}}).ok,true);
assert.equal(sandbox.doPost({action:'saveEvent',service:'gsis-roster-notifier-v1',proxySecret:'secret'}).ok,false);
assert.equal(sandbox.doPost({action:'rosterDate',service:'other',proxySecret:'secret'}).ok,false);
assert.equal(sandbox.doPost({action:'rosterDate',service:'gsis-roster-notifier-v1',proxySecret:'wrong'}).ok,false);

// External UI renders data as text, removes capability from URL, and requires
// a rejection reason. No Google identity is necessary for this scoped page.
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const dom=new JSDOM(fs.readFileSync('roster-update/public/external.html','utf8'),{url:origin+'/external.html#'+token,runScripts:'outside-only'}),w=dom.window;
Object.defineProperty(w,'crypto',{value:webcrypto});let pageCalls=[],requestStatus='pending';
w.fetch=async(url,options)=>{
 assert.equal(url,'/api/external');assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.referrerPolicy,'no-referrer');
 const input=JSON.parse(options.body);pageCalls.push(input);
 if(input.operation==='respond'){requestStatus=input.decision==='approve'?'approved':'rejected';return Response.json({ok:true,data:{recorded:true}})}
 return Response.json({ok:true,data:{date:today,duties:[{period:2,timeStart:'08:00',timeEnd:'08:30',subject:'<img src=x onerror=alert(1)>',className:'3A',venue:'C3-01',instructions:'Use https://example.test/worksheet and <script>alert(1)</script>'}],request:{status:requestStatus,expiresAt:Date.now()+60000,absentName:'Teacher A',lessons:[{period:2,subject:'EL',className:'3A',venue:'C3-01'}]}}});
};
w.eval(fs.readFileSync('roster-update/public/external.js','utf8'));
const tick=()=>new Promise(r=>setTimeout(r,0));await tick();await tick();
assert.equal(w.location.hash,'');assert.equal(w.sessionStorage.getItem('gsis-private-relief-link'),token);assert.equal(w.document.getElementById('decision-form').hidden,false);
assert.equal(w.document.querySelectorAll('#duty-list img, #duty-list script').length,0);assert.match(w.document.getElementById('duty-list').textContent,/08:00 to 08:30/);assert.equal(w.document.querySelector('#duty-list a').rel,'noopener noreferrer');
w.document.querySelector('button[value="reject"]').click();await tick();assert.equal(pageCalls.filter(p=>p.operation==='respond').length,0);assert.match(w.document.getElementById('status').textContent,/Enter a reason/);
w.document.getElementById('reason').value='Already assigned elsewhere';w.document.querySelector('button[value="reject"]').click();await tick();await tick();
const decision=pageCalls.find(p=>p.operation==='respond');assert.equal(decision.reason,'Already assigned elsewhere');assert.equal(decision.decision,'reject');assert.equal(typeof decision.requestId,'string');assert.equal(decision.staffId,undefined);assert.equal(w.document.getElementById('decision-form').hidden,true);dom.window.close();
console.log('PASS v0.7.00 gateway: school authority, trusted Calendar, scoped expiring links, disabled sends, durable send outcomes, signed deduplicated callbacks and read-only Calendar service.');
