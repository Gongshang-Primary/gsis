import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'false',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'private-access-'.repeat(8),WHATSAPP_APP_SECRET:'private-app-'.repeat(8),WHATSAPP_VERIFY_TOKEN:'private-verify-'.repeat(8),ROSTER_SERVICE_SECRET:'private-service-'.repeat(8),GSIS_SECRET:'private-bridge-'.repeat(8),EXTERNAL_LINK_SECRET:'private-link-'.repeat(8),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const origin=env.ROSTER_PUBLIC_ORIGIN,who={email:'smc@gsps.edu.sg',subject:'test-subject'},now=Date.now();
const session=await worker.sign({purpose:'gsis-session-v1',origin,...who,issued:now,expires:now+86400000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
const ok=data=>Response.json({ok:true,data});
const reply={id:'reply-1',claimId:'claim-1',to:'6590000000',kind:'text',text:'A human reply.',replyWindowExpiresAt:Date.now()+60000};
const template={name:'approved_reply',language:'en_GB',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}.'}]};
const calls=[];let handler;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);let payload;
 if(url.href===env.APPS_SCRIPT_URL){
  const signed=JSON.parse(init.body);payload=JSON.parse(signed.payload);
  assert.equal(signed.signature,(await worker.sign(payload,payload.action==='rosterService'?env.GSIS_SECRET:env.GSIS_SECRET)).signature);
 }else if(init.body)payload=JSON.parse(init.body);
 calls.push({url,init,payload});return handler(url,init,payload);
};
function reset(next){calls.length=0;handler=next;}
function browserRequest(input){return new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(input)});}
async function operation(input,settings=env){const tasks=[];const response=await worker.default.fetch(browserRequest(input),settings,{waitUntil(p){tasks.push(p);}});await Promise.all(tasks);return {response,data:await response.json()};}
async function webhook(messages,settings=env,extra={}){
 const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages,...extra}}]}]};
 const signed=await worker.sign(event,env.WHATSAPP_APP_SECRET);return worker.whatsappWebhook(new Request(origin+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),settings);
}

// Fresh user authority, no Calendar and no browser-provided service proof.
reset((url,init,payload)=>{assert.equal(payload.action,'rosterInbox');assert.deepEqual(payload.identity.email,who.email);assert.deepEqual(payload.input,{operation:'inboxList',filter:'open'});return ok({threads:[],alertCount:0});});
let result=await operation({operation:'inboxList',filter:'open',approvedTemplate:{name:'forged'},calendarByDate:{},identity:{admin:true}});
assert.equal(result.response.status,200);assert.equal(calls.length,1);
reset(()=>{throw Error('Internal authorization must not be browser callable.');});
assert.equal((await operation({operation:'inboxMediaAuthorize',waId:reply.to,messageId:'wamid.audio'})).response.status,403);

// Only approved BODY text templates are offered. Permission denied avoids Meta.
reset((url,init,payload)=>url.hostname==='script.google.com'?Response.json({ok:false,status:403,error:'SMC or Admin access is required.'}):assert.fail('Denied user must not read templates.'));
assert.equal((await operation({operation:'inboxTemplates'})).response.status,403);
reset((url,init,payload)=>{
 if(payload?.action==='rosterInbox')return ok({authorized:true});
 assert.equal(init.redirect,'manual');assert.match(url.pathname,/message_templates$/);
 return Response.json({data:[template,{...template,status:'PENDING'},{...template,category:'AUTHENTICATION'},{...template,components:[{type:'HEADER',text:'Header'},...template.components]},{...template,components:[{type:'BODY',text:'Hello {{2}}'}]},{...template,components:[{type:'BODY',text:'Hello {{name}}'}]}]});
});
result=await operation({operation:'inboxTemplates'});
assert.deepEqual(result.data.data.templates,[{name:'approved_reply',language:'en_GB',body:'Hello {{1}}.',parameterCount:1}]);

// Durable response strips internal dispatch. One provider attempt records exact Meta codes.
const outcomes=[];
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com'){assert.equal(init.redirect,'manual');assert.equal(payload.type,'text');assert.equal(payload.biz_opaque_callback_data,'inbox:reply-1');return Response.json({error:{code:190,error_subcode:463,message:'PRIVATE_PROVIDER_MESSAGE',fbtrace_id:'trace1'}},{status:401});}
 if(payload.action==='rosterInbox')return ok({message:{id:reply.id,status:'queued'},dispatch:{replyId:reply.id,claimId:reply.claimId},objectKey:'PRIVATE_OBJECT'});
 if(payload.input.operation==='inboxPendingDispatch')return ok({replies:[{replyId:reply.id,claimId:reply.claimId}],alerts:[]});
 if(payload.input.operation==='inboxReplyPrepare')return ok({reply});
 outcomes.push(payload.input);return ok({recorded:true});
});
result=await operation({operation:'inboxReply',waId:reply.to,kind:'text',text:reply.text,requestId:crypto.randomUUID(),expectedRevision:1});
assert.equal(result.response.status,200);assert(!JSON.stringify(result.data).includes('claim-1'));assert(!JSON.stringify(result.data).includes('PRIVATE_OBJECT'));
assert.equal(calls.filter(c=>c.url.hostname==='graph.facebook.com').length,0,'HTTP save must not send or prepare');
await worker.dispatchInboxPending(env);
assert.equal(outcomes[0].state,'failed');assert.equal(outcomes[0].error.metaErrorCode,190);assert.equal(outcomes[0].error.metaErrorSubcode,463);assert.equal(outcomes[0].error.fbtraceId,'trace1');assert(!JSON.stringify(outcomes).includes('PRIVATE_PROVIDER_MESSAGE'));
assert.equal(calls.filter(c=>c.url.pathname.endsWith('/messages')).length,1);

// An uncertain send has no automatic resend; replay carries no dispatch.
outcomes.length=0;
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com')throw Error('Connection lost after possible acceptance.');
 if(payload.input.operation==='inboxReplyPrepare')return ok({reply});outcomes.push(payload.input);return ok({recorded:true});
});
await worker.dispatchInboxReply({replyId:reply.id,claimId:reply.claimId},env);
assert.equal(outcomes[0].state,'uncertain');assert.equal(calls.filter(c=>c.url.hostname==='graph.facebook.com').length,1);
reset((url,init,payload)=>{assert.notEqual(url.hostname,'graph.facebook.com','Window expiry immediately before sending must block Meta.');if(payload.input.operation==='inboxReplyPrepare')return ok({reply:{...reply,replyWindowExpiresAt:Date.now()-1}});assert.equal(payload.input.state,'failed');assert.match(payload.input.error.message,/24-hour/);return ok({recorded:true});});
await worker.dispatchInboxReply({replyId:reply.id,claimId:reply.claimId},env);
reset((url,init,payload)=>{assert.equal(payload.action,'rosterInbox');return ok({replayed:true,message:{id:reply.id,status:'uncertain'}});});
assert.equal((await operation({operation:'inboxReply',waId:reply.to,kind:'text',text:reply.text,requestId:crypto.randomUUID(),expectedRevision:1})).response.status,200);assert.equal(calls.length,1);

// Fresh template proof is signed to prepare; rejected/changed approval cannot send.
const chosen={name:template.name,language:template.language,parameters:[' Teacher ']};
let templatesRead=0;
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com'){
  if(url.pathname.endsWith('/message_templates')){templatesRead++;return Response.json({data:[template]});}
  assert.equal(payload.template.components[0].parameters[0].text,'Teacher');return Response.json({messages:[{id:'wamid.reply'}]});
 }
 if(payload.action==='rosterInbox'){
  if(payload.input.operation==='inboxTemplates')return ok({authorized:true});
  assert.deepEqual(payload.input.approvedTemplate,{...chosen,parameters:['Teacher']});return ok({dispatch:{replyId:reply.id,claimId:reply.claimId,template:{...chosen,parameters:['Teacher']}}});
 }
 if(payload.input.operation==='inboxPendingDispatch')return ok({replies:[{replyId:reply.id,claimId:reply.claimId,template:{...chosen,parameters:['Teacher']}}],alerts:[]});
 if(payload.input.operation==='inboxReplyPrepare'){assert.deepEqual(payload.input.approvedTemplate,{...chosen,parameters:['Teacher']});return ok({reply:{...reply,kind:'template',template:payload.input.approvedTemplate}});}
 return ok({recorded:true});
});
result=await operation({operation:'inboxReply',waId:reply.to,kind:'template',template:chosen,approvedTemplate:{name:'forged'},requestId:crypto.randomUUID(),expectedRevision:1});
assert.equal(result.response.status,200);assert.equal(templatesRead,1);await worker.dispatchInboxPending(env);assert.equal(templatesRead,2);
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com'){assert.match(url.pathname,/message_templates$/);return Response.json({data:[{...template,status:'PAUSED'}]});}
 assert.equal(payload.input.operation,'inboxReplyPrepare');assert(!payload.input.approvedTemplate);return ok({reply:null});
});
await worker.dispatchInboxReply({replyId:reply.id,claimId:reply.claimId,template:chosen},env);
assert.equal(calls.filter(c=>c.url.pathname.endsWith('/messages')).length,0);
reset((url)=>{assert.equal(url.hostname,'graph.facebook.com');throw Error('Temporary catalogue outage.');});
await assert.rejects(()=>worker.dispatchInboxReply({replyId:reply.id,claimId:reply.claimId,template:chosen},env));assert.equal(calls.length,1,'An unattempted catalogue outage leaves the queued intent for the next cron tick.');

// Provider changes cannot hide the receipt for a previously saved exact reply.
let receiptExists=true;
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com')return Response.json({data:[{...template,status:'PAUSED'}]});
 if(payload.input.operation==='inboxTemplates')return ok({authorized:true});
 assert.equal(payload.input.receiptOnly,true);assert(!payload.input.approvedTemplate);
 return ok(receiptExists?{replayed:true,message:{id:reply.id,status:'sent'}}:{receiptMissing:true});
});
let replay=await operation({operation:'inboxReply',waId:reply.to,kind:'template',template:chosen,requestId:crypto.randomUUID(),expectedRevision:1});
assert.equal(replay.response.status,200);assert.equal(replay.data.data.replayed,true);
receiptExists=false;replay=await operation({operation:'inboxReply',waId:reply.to,kind:'template',template:chosen,requestId:crypto.randomUUID(),expectedRevision:1});assert.equal(replay.response.status,409,'A new intent still requires current approval.');
reset((url,init,payload)=>{assert.equal(payload.input.receiptOnly,true);return ok({replayed:true,message:{id:reply.id,status:'sent'}});});
assert.equal((await operation({operation:'inboxReply',waId:reply.to,kind:'text',text:reply.text,requestId:crypto.randomUUID(),expectedRevision:1},{...env,WHATSAPP_ENABLED:'false'})).response.status,200);

// Menu disabled still retains text, provider context and profile, with no automated reply.
const inbound={id:'wamid.incoming',from:reply.to,timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Please retain this message.'},context:{id:'wamid.original'}};
let retained;
reset((url,init,payload)=>{assert.equal(payload.input.operation,'inboxIngest');retained=payload.input.message;return ok({recorded:true});});
assert.equal((await webhook([inbound],env,{contacts:[{wa_id:reply.to,profile:{name:'Sender'}}]})).status,200);
assert.equal(retained.text,inbound.text.body);assert.equal(retained.context.id,'wamid.original');assert.equal(retained.profileName,'Sender');assert.equal(calls.length,1);
reset((url,init,payload)=>{assert.equal(payload.input.operation,'inboxIngest','Historical messages must not call the expired legacy menu path.');return ok({recorded:true});});
assert.equal((await webhook([{...inbound,id:'wamid.historical',timestamp:String(Math.floor(Date.now()/1000)-90000)}],{...env,WHATSAPP_MENU_ENABLED:'true'})).status,200);
reset((url,init,payload)=>{assert.equal(payload.input.operation,'inboxIngest');assert.equal(payload.input.message.audio.captureStatus,'unavailable');return ok({recorded:true});});
assert.equal((await webhook([{...inbound,id:'wamid.audio',type:'audio',audio:{id:'998877',mime_type:'audio/ogg',voice:true}}],{...env,WHATSAPP_MENU_ENABLED:'true'})).status,200);

// Durable audio capture is bounded, hash verified, deduplicated and never follows redirects.
const bytes=new TextEncoder().encode('mock audio data');
const digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const audioMessage={id:'wamid.audio',audio:{id:'998877',mime_type:'audio/ogg; codecs=opus',sha256:digest,voice:true}};
const objects=new Map();let puts=0;
const bucket={async head(key){const o=objects.get(key);return o?{size:o.bytes.length,httpMetadata:o.metadata.httpMetadata}:null;},async put(key,value,metadata){puts++;objects.set(key,{bytes:value,metadata});},async get(key,options){const o=objects.get(key);if(!o)return null;const start=options?.range?.offset||0,end=options?.range?start+options.range.length:o.bytes.length;return {body:o.bytes.slice(start,end)};}};
const withMedia={...env,WHATSAPP_INBOX_MEDIA:bucket};
reset((url,init)=>{
 assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+env.WHATSAPP_ACCESS_TOKEN);
 return url.hostname==='graph.facebook.com'?Response.json({id:'998877',mime_type:'audio/ogg',file_size:bytes.length,sha256:digest,url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/audio'}):new Response(bytes,{headers:{'Content-Type':'audio/ogg','Content-Length':String(bytes.length)}});
});
const captured=await worker.captureInboxAudio(audioMessage,withMedia);assert.equal(captured.audio.captureStatus,'stored');assert.match(captured.audio.objectKey,/^inbox\/123456789\/[a-f0-9]{64}$/);assert.equal(puts,1);assert.equal(calls.length,2);
await worker.captureInboxAudio(audioMessage,withMedia);assert.equal(puts,1);assert.equal(calls.length,2);
reset(()=>Response.json({id:'998877',mime_type:'audio/ogg',file_size:bytes.length,sha256:digest,url:'https://attacker.invalid/audio'}));
const unsafe=await worker.captureInboxAudio({...audioMessage,id:'wamid.unsafe'},withMedia);assert.equal(unsafe.audio.captureStatus,'failed');assert.equal(unsafe.retry,false);assert.equal(calls.length,1);
reset((url)=>url.hostname==='graph.facebook.com'?Response.json({id:'998877',mime_type:'audio/ogg',file_size:bytes.length,sha256:digest,url:'https://lookaside.fbsbx.com/audio'}):new Response(bytes,{headers:{'Content-Type':'audio/ogg','Content-Length':String(16*1024*1024+1)}}));
assert.equal((await worker.captureInboxAudio({...audioMessage,id:'wamid.toobig'},withMedia)).audio.captureStatus,'failed');assert.equal(puts,1);

// A temporary download failure retains the message before requesting webhook retry.
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com')throw Error('Temporary provider error.');
 assert.equal(payload.input.operation,'inboxIngest');assert.equal(payload.input.message.audio.captureStatus,'failed');return ok({recorded:true});
});
assert.equal((await webhook([{...inbound,id:'wamid.retryaudio',type:'audio',audio:audioMessage.audio}],withMedia)).status,503);

// Playback rechecks SMC/Admin on each request, does not reveal the key, and supports ranges.
const mediaUrl=origin+'/api/whatsapp/media/'+encodeURIComponent(audioMessage.id)+'?waId='+reply.to;
let authorized=true;
reset((url,init,payload)=>{assert.equal(payload.action,'rosterInbox');assert.deepEqual(payload.input,{operation:'inboxMediaAuthorize',waId:reply.to,messageId:audioMessage.id});return authorized?ok({...captured.audio}):Response.json({ok:false,status:403,error:'SMC or Admin access is required.'});});
let response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Range:'bytes=2-5'}}),withMedia);
assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 2-5/'+bytes.length);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.equal(await response.text(),'ck a');
response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Range:'bytes=-4'}}),withMedia);assert.equal(await response.text(),'data');
assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Range:'bytes=100-200'}}),withMedia)).status,416);
assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl),withMedia)).status,401);
assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Origin:'https://attacker.invalid'}}),withMedia)).status,403);
authorized=false;assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),withMedia)).status,403);

// Dedicated alerts are blocked until enabled/approved and recheck current duty before send.
const claim={alertId:'alert-1',claimId:'alert-claim'},alertContract=JSON.parse(fs.readFileSync('notification-worker/inbox-alert-template.proposed.json','utf8'));
reset((url,init,payload)=>{assert.equal(payload.input.operation,'inboxAlertResult');assert.equal(payload.input.state,'blocked');return ok({recorded:true});});
await worker.dispatchInboxAlerts([claim],env);assert.equal(calls.length,1);
let eligible=true;const alertOutcomes=[];
reset((url,init,payload)=>{
 if(url.hostname==='graph.facebook.com'){
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:[{name:'gsis_inbox_new_message_v1',language:'en_GB',category:'UTILITY',status:'APPROVED',components:[{type:'BODY',text:alertContract.components?.find(c=>c.type==='BODY')?.text||alertContract.body}]}]});
  assert.equal(payload.template.name,'gsis_inbox_new_message_v1');assert.equal(payload.to,reply.to);assert(!JSON.stringify(payload).includes(inbound.text.body));return Response.json({messages:[{id:'wamid.alert'}]});
 }
 if(payload.input.operation==='inboxAlertPrepare')return ok({alert:eligible?{id:claim.alertId,claimId:claim.claimId,to:reply.to,name:'Duty SMC',senderName:'Sender'}:null});
 alertOutcomes.push(payload.input);return ok({recorded:true});
});
await worker.dispatchInboxAlerts([claim],{...env,WHATSAPP_INBOX_ALERTS_ENABLED:'true'});assert.equal(alertOutcomes[0].state,'sent');eligible=false;calls.length=0;
await worker.dispatchInboxAlerts([claim],{...env,WHATSAPP_INBOX_ALERTS_ENABLED:'true'});assert.equal(calls.filter(c=>c.url.pathname.endsWith('/messages')).length,0);

// Provider statuses reconcile inbox replies without going through the relief outbox.
reset((url,init,payload)=>{assert.equal(payload.input.operation,'inboxDelivery');assert.equal(payload.input.replyId,reply.id);assert.equal(payload.input.error.metaErrorCode,131026);return ok({recorded:true});});
assert.equal((await webhook([],env,{statuses:[{id:'wamid.reply',status:'failed',timestamp:String(Math.floor(Date.now()/1000)),recipient_id:reply.to,biz_opaque_callback_data:'inbox:'+reply.id,errors:[{code:131026,title:'Undeliverable'}]}]})).status,200);assert.equal(calls.length,1);

console.log('WhatsApp Inbox worker: authenticated routes, template proof, one-send claims, durable media, private ranges, duty alerts and webhook recovery passed.');
