import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import urgentFixture from './roster701-fixture.cjs';

const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
const env={WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'false',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'synthetic-access-'.repeat(4),WHATSAPP_APP_SECRET:'synthetic-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'synthetic-verify-'.repeat(4),ROSTER_SERVICE_SECRET:'synthetic-service-'.repeat(4),EXTERNAL_LINK_SECRET:'synthetic-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',WHATSAPP_TEMPLATES_JSON:JSON.stringify(Object.fromEntries(Object.entries(contracts).map(([key,c])=>[key,{...c,enabled:true}])))};
const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),ok=data=>Response.json({ok:true,data});
const row={id:'notice',claimId:'claim',recipientId:'fixture-teacher',mobile:'6590000000',name:'Fixture Teacher',date,expiresAt:Date.now()+3600000,data:{templateKey:'stapler_timetable',summary:'Period 3\nPeriod 4'}};
const canonical='Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.';
let handler;
globalThis.fetch=async(input,init={})=>{const url=new URL(input);const body=init.body?JSON.parse(init.body):null;return handler(url,body?.payload?JSON.parse(body.payload).input:body);};

await test('Urgent forwards use the four-field approved template even when generic Inbox alerts are disabled',async()=>{
 const jobs=['Duty One','Duty Two'].map((name,i)=>({...row,id:'urgent-'+i,claimId:'claim-'+i,recipientId:'duty-'+i,mobile:'659000000'+i,name,kind:'urgent_forward',data:{templateKey:'urgent_forward',audience:'duty-smc',originalMessage:'Please assist now.\nThe lift has stopped.',senderName:'Staff Sender',senderContact:'6591234567'}}));
 const sent=[],outcomes=[];let claimed=false;
 handler=(url,input)=>{
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:Object.values(contracts).map(c=>({...c,status:'APPROVED',parameter_format:'POSITIONAL',components:[{type:'BODY',text:c.body}]}))});
  if(url.pathname.endsWith('/messages')){sent.push(input);return Response.json({messages:[{id:'wamid.'+input.to}]});}
  if(input.operation==='claimNotifications'){const notifications=claimed?[]:jobs;claimed=true;return ok({notifications});}
  if(input.operation==='prepareNotification')return ok({notification:jobs.find(j=>j.id===input.id)});
  assert.equal(input.operation,'notificationResult');outcomes.push(input);return ok({recorded:true});
 };
 const result=await M.dispatchNotifications({...env,WHATSAPP_INBOX_ALERTS_ENABLED:'false'});
 assert.equal(result.sent,2);assert.equal(sent.length,2);assert(outcomes.every(o=>o.state==='sent'));
 for(const [i,payload] of sent.entries()){
  assert.equal(payload.template.name,'gsis_urgent_forward_v1');
  assert.equal(payload.template.language.code,'en_GB');
  assert.deepEqual(payload.template.components[0].parameters.map(p=>p.text),[jobs[i].name,'Please assist now.; The lift has stopped.','Staff Sender','6591234567']);
  assert.equal(jobs[i].data.originalMessage,'Please assist now.\nThe lift has stopped.');
 }
});

await test('Every part of a 4096-character Unicode urgent message fits the approved template without losing source text',async()=>{
 const f=urgentFixture(),body='🚨\n'.repeat(1365)+'x';
 Object.assign(f.ctx,{service:true,inboxMode:true,urgentSMCIds:['charlie'],user:{email:'webhook'}});
 const base={from:f.people[1].mobile,timestamp:f.ctx.now};
 f.O.inboundMessage(f.state,f.ctx,{...base,messageId:'wamid.long-prompt',type:'interactive',selection:'gsis_urgent'});
 f.O.inboundMessage(f.state,f.ctx,{...base,messageId:'wamid.long-body',type:'text',text:body});
 assert(f.state.outbox.length>1);assert.equal(body.length,4096);
 const original=[];
 for(const job of f.state.outbox){
  const payload=await M.templateMessage({...job,claimId:'fixture-claim',expiresAt:Date.now()+3600000},env);
  assert.equal(payload.template.name,'gsis_urgent_forward_v1');
  const text=payload.template.components[0].parameters[1].text;
  assert([...text].length<=1024);assert.match(text,new RegExp('^\\[Part '+job.data.partNumber+' of '+job.data.partCount+'\\]'));
  original.push(job.data.originalMessage.replace(/^\[Part \d+ of \d+\] /,''));
 }
 assert.equal(original.join(''),body);
});

await test('Automatic sends persist safe provider details and field metadata without content, secrets or signed links',async()=>{
 let outcome,sent;
 handler=(url,input)=>{
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:Object.values(contracts).map(c=>({...c,status:'APPROVED',parameter_format:'POSITIONAL',components:[{type:'BODY',text:c.body}]}))});
  if(url.pathname.endsWith('/messages')){sent=input;return Response.json({error:{code:132018,error_subcode:2494073,fbtrace_id:'safe_trace-1',message:'PRIVATE_PROVIDER_MESSAGE',error_data:{details:'Param text cannot have new-line/tab characters or more than 4 consecutive spaces. PRIVATE_BODY https://roster.example.test/external.html#PRIVATE_TOKEN Bearer PRIVATE_ACCESS'}}},{status:400});}
  if(input.operation==='claimNotifications')return ok({notifications:[row]});
  if(input.operation==='prepareNotification')return ok({notification:row});
  assert.equal(input.operation,'notificationResult');outcome=input;return ok({recorded:true});
 };
 assert.equal((await M.dispatchNotifications(env)).failed,1);
 assert.equal(outcome.error,'META_132018');assert.equal(outcome.providerError?.code,132018);assert.equal(outcome.providerError.subcode,2494073);assert.equal(outcome.providerError.traceId,'safe_trace-1');assert.equal(outcome.providerError.details,canonical);assert.equal(outcome.providerError.templateName,'gsis_timetable_updated_v1');
 assert.deepEqual(outcome.providerError.fields.map(f=>[f.index,f.field]),[[1,'recipient_name'],[2,'duty_date'],[3,'change_details'],[4,'private_timetable_url']]);
 assert.equal(outcome.providerError.fields[2].characters,18);assert.equal(sent.template.components[0].parameters[2].text,'Period 3; Period 4');
 assert.doesNotMatch(JSON.stringify(outcome),/PRIVATE_|Period 3|Fixture Teacher|https:\/\/|Bearer/);
});

await test('Inbox template replies encode only outbound parameters and preserve stored source',async()=>{
 const template={name:'approved_reply',language:'en_GB',parameters:['First\nSecond\tcolumn     end']},before=JSON.stringify(template);let sent,proof;
 handler=(url,input)=>{
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:[{name:template.name,language:'en_GB',status:'APPROVED',category:'UTILITY',parameter_format:'POSITIONAL',components:[{type:'BODY',text:'Hello {{1}}.'}]}]});
  if(url.pathname.endsWith('/messages')){sent=input;return Response.json({messages:[{id:'wamid.fixture'}]});}
  if(input.operation==='inboxReplyPrepare'){proof=input.approvedTemplate;return ok({reply:{id:'reply',claimId:'claim',to:'6590000000',kind:'template',template:proof}});}
  assert.equal(input.operation,'inboxReplyResult');return ok({recorded:true});
 };
 await M.dispatchInboxReply({replyId:'reply',claimId:'claim',template},env);
 assert.equal(sent.template.components[0].parameters[0].text,'First; Second column end');assert.equal(proof.parameters[0],template.parameters[0]);assert.equal(JSON.stringify(template),before);
});

await test('An Inbox instruction may start with a URL without becoming a URL-only parameter',async()=>{
 const template={name:'approved_reply',language:'en_GB',parameters:['https://example.test/worksheet#SIGNED_FRAGMENT\nRead pages 2 and 3.']};let sent;
 handler=(url,input)=>{
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:[{name:template.name,language:'en_GB',status:'APPROVED',category:'UTILITY',parameter_format:'POSITIONAL',components:[{type:'BODY',text:'Instructions: {{1}}'}]}]});
  if(url.pathname.endsWith('/messages')){sent=input;return Response.json({messages:[{id:'wamid.fixture'}]});}
  if(input.operation==='inboxReplyPrepare')return ok({reply:input.approvedTemplate?{id:'reply',claimId:'claim',to:'6590000000',kind:'template',template:input.approvedTemplate}:null});
  return ok({recorded:true});
 };
 await M.dispatchInboxReply({replyId:'reply',claimId:'claim',template},env);
 assert.equal(sent?.template.components[0].parameters[0].text,'https://example.test/worksheet#SIGNED_FRAGMENT; Read pages 2 and 3.');
 template.parameters[0]='https://example.test/worksheet#SIGNED_FRAGMENT';
 await M.dispatchInboxReply({replyId:'reply',claimId:'claim',template},env);assert.equal(sent.template.components[0].parameters[0].text,template.parameters[0],'A standalone signed link remains byte-for-byte unchanged');
 template.parameters[0]='https://example.test/worksheet#SIGNED_FRAGMENT Please acknowledge.';
 await M.dispatchInboxReply({replyId:'reply',claimId:'claim',template},env);assert.equal(sent.template.components[0].parameters[0].text,template.parameters[0]);
});

await test('Inbox duty alerts share parameter encoding and locally block invalid controls',async()=>{
 const claim={alertId:'alert',claimId:'claim'},c=JSON.parse(fs.readFileSync('notification-worker/inbox-alert-template.proposed.json','utf8'));let name='Duty\nSMC',sent=[],outcomes=[];
 handler=(url,input)=>{
  if(url.pathname.endsWith('/message_templates'))return Response.json({data:[{name:'gsis_inbox_new_message_v1',language:'en_GB',category:'UTILITY',status:'APPROVED',parameter_format:'POSITIONAL',components:[{type:'BODY',text:c.components?.find(x=>x.type==='BODY')?.text||c.body}]}]});
  if(url.pathname.endsWith('/messages')){sent.push(input);return Response.json({messages:[{id:'wamid.alert'}]});}
  if(input.operation==='inboxAlertPrepare')return ok({alert:{id:claim.alertId,claimId:claim.claimId,to:'6590000000',name,senderName:'Sender\tName'}});
  assert.equal(input.operation,'inboxAlertResult');outcomes.push(input);return ok({recorded:true});
 };
 await M.dispatchInboxAlerts([claim],{...env,WHATSAPP_INBOX_ALERTS_ENABLED:'true'});
 assert.deepEqual(sent[0].template.components[0].parameters.map(p=>p.text),['Duty; SMC','Sender Name','https://roster.example.test/#whatsappInbox']);
 name='Duty\0SMC';await M.dispatchInboxAlerts([claim],{...env,WHATSAPP_INBOX_ALERTS_ENABLED:'true'});assert.equal(sent.length,1);assert.equal(outcomes.at(-1).state,'failed');
});

await test('Failed delivery webhooks pass canonical provider diagnostics to the outbox',async()=>{
 const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},statuses:[{id:'wamid.notice',status:'failed',timestamp:String(Math.floor(Date.now()/1000)),recipient_id:row.mobile,biz_opaque_callback_data:row.id,errors:[{code:132018,error_subcode:999,fbtrace_id:'safe_trace_2',message:'PRIVATE_FULL_MESSAGE',error_data:{details:'Param text cannot have new-line/tab characters or more than 4 consecutive spaces'}}]}]}}]}]};
 const signed=await M.sign(event,env.WHATSAPP_APP_SECRET);let outcome;
 handler=(url,input)=>{assert.equal(input.operation,'notificationDelivery');outcome=input;return ok({recorded:true});};
 const response=await M.whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),env);
 assert.equal(response.status,200);assert.equal(outcome.providerError?.code,132018);assert.equal(outcome.providerError.details,canonical);assert.equal(outcome.providerError.traceId,'safe_trace_2');assert.doesNotMatch(JSON.stringify(outcome),/PRIVATE_FULL_MESSAGE/);
});
