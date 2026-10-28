import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),fixture=require('./roster701-fixture.cjs');
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true',WHATSAPP_CURRENT_RELIEF_URL:'https://roster.diveanalytics.com/',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'private-access-'.repeat(8),WHATSAPP_APP_SECRET:'private-app-'.repeat(8),ROSTER_SERVICE_SECRET:'private-service-'.repeat(8),APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.example.test'};
const to='6591234567',rows=worker.menuReply({to,action:'menu'},env).interactive.action.sections[0].rows;
assert.deepEqual(rows[0],{id:'gsis_report_absence',title:'Report Absence',description:'Open the current relief system'});
assert.deepEqual(rows.slice(1).map(r=>[r.id,r.title]),[['gsis_urgent','Urgent Message'],['gsis_layout','School Layout'],['gsis_devices','Collect / Return ICT'],['gsis_office','Call General Office']]);
assert.equal(worker.menuReply({to,action:'report-absence'},env).text.body,'Report Absence: https://roster.diveanalytics.com/');
for(const value of [undefined,'','http://roster.diveanalytics.com/','javascript:alert(1)','https://private:secret@roster.diveanalytics.com/','https://roster.diveanalytics.com/#secret']){
 const response=worker.menuReply({to,action:'report-absence'},{...env,WHATSAPP_CURRENT_RELIEF_URL:value});
 assert.equal(response.type,'text');
 assert.equal(response.text.body,'Report Absence is not configured. Please open Roster or contact the school directly.');
}
assert.equal(worker.menuReply({to,action:'report-absence'},{...env,WHATSAPP_CURRENT_RELIEF_URL:'https://relief.example.test/report?school=gsps'}).text.body,'Report Absence: https://relief.example.test/report?school=gsps');

function serviceFixture(){const f=fixture();f.ctx.now=Date.now();f.ctx.iso=new Date(f.ctx.now).toISOString();Object.assign(f.ctx,{service:true,inboxMode:true,urgentSMCIds:['charlie'],user:{email:'whatsapp-webhook'}});return f;}
function incoming(f,id,selection){return {messageId:'wamid.'+id,from:to,timestamp:f.ctx.now,type:'interactive',selection};}
for(const [selection,action] of [['gsis_report_absence','report-absence'],['gsis_urgent','urgent-prompt'],['gsis_layout','layout'],['gsis_devices','devices'],['gsis_office','office'],['unknown_selection','menu']]){
 const f=serviceFixture(),input=incoming(f,selection,selection),result=f.O.inboundMessage(f.state,f.ctx,input);
 assert.equal(result.reply.action,action);
 assert.equal(f.state.absences.length,0);assert.equal(f.state.assignments.length,0);assert.equal(f.state.outbox.length,0);
 assert.equal(f.O.inboundMessage(f.state,f.ctx,input).duplicate,true);
}
// Opening the relief service leaves no pending urgent-message capture session.
const session=serviceFixture();
session.O.inboundMessage(session.state,session.ctx,incoming(session,'prompt','gsis_urgent'));
assert(session.state.inboundSessions[to]);
session.O.inboundMessage(session.state,session.ctx,incoming(session,'relief','gsis_report_absence'));
assert.equal(session.state.inboundSessions[to],undefined);
const normal=session.O.inboundMessage(session.state,session.ctx,{...incoming(session,'ordinary',undefined),type:'text',text:'A message for the human inbox.'});
assert.equal(normal.reply.action,'menu');assert.equal(session.state.smcAlerts.length,0);

// Exercise the signed webhook through the actual backend selection mapping. All traffic is mocked.
let f=serviceFixture();const sent=[],retained=[],operations=[];
globalThis.fetch=async(url,options={})=>{
 if(String(url)===env.APPS_SCRIPT_URL){
  const envelope=JSON.parse(options.body),payload=JSON.parse(envelope.payload),input=payload.input;
  assert.equal(envelope.signature,(await worker.sign(payload,env.ROSTER_SERVICE_SECRET)).signature);
  assert.equal(payload.action,'rosterService');operations.push(input.operation);
  if(input.operation==='inboxIngest'){retained.push(input.message);return Response.json({ok:true,data:{recorded:true}});}
  if(input.operation==='inboundMessage'){assert.equal(input.inboxMode,true);return Response.json({ok:true,data:f.O.inboundMessage(f.state,f.ctx,input)});}
  if(input.operation==='inboundReplyResult')return Response.json({ok:true,data:{recorded:true}});
  assert.fail('Unexpected backend operation: '+input.operation);
 }
 assert.equal(String(url),'https://graph.facebook.com/v23.0/123456789/messages');assert.equal(options.redirect,'manual');
 assert.equal(operations.at(-1),'inboundMessage','The Inbox retains the message before an automated reply.');
 sent.push(JSON.parse(options.body));return Response.json({messages:[{id:'wamid.outgoing'}]});
};
async function webhook(message,settings=env){
 const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages:[message]}}]}]},signed=await worker.sign(event,env.WHATSAPP_APP_SECRET);
 return worker.whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),settings);
}
const message={id:'wamid.relief_selection',from:to,timestamp:String(Math.floor(Date.now()/1000)),type:'interactive',interactive:{list_reply:{id:rows[0].id,title:rows[0].title}}};
assert.equal((await webhook(message)).status,200);
assert.deepEqual(operations,['inboxIngest','inboundMessage','inboundReplyResult']);
assert.equal(retained[0].text,'Report Absence');assert.equal(sent[0].text.body,'Report Absence: https://roster.diveanalytics.com/');
assert.equal(f.state.absences.length,0);assert.equal(f.state.assignments.length,0);
assert.equal((await webhook(message)).status,200);assert.equal(sent.length,1,'Duplicate webhook must not send the link again.');
f=serviceFixture();operations.length=0;
assert.equal((await webhook({...message,id:'wamid.invalid_setting'},{...env,WHATSAPP_CURRENT_RELIEF_URL:'http://invalid.test/'})).status,200);
assert.match(sent.at(-1).text.body,/is not configured/);
operations.length=0;const before=sent.length;
assert.equal((await webhook({...message,id:'wamid.voice',type:'audio',audio:{id:'998877',mime_type:'audio/ogg',voice:true}})).status,200);
assert.deepEqual(operations,['inboxIngest']);assert.equal(sent.length,before);assert.equal(retained.at(-1).audio.captureStatus,'unavailable');
operations.length=0;
assert.equal((await webhook({...message,id:'wamid.menu_disabled'},{...env,WHATSAPP_MENU_ENABLED:'false'})).status,200);
assert.deepEqual(operations,['inboxIngest']);assert.equal(sent.length,before);
f=serviceFixture();
await webhook({...message,id:'wamid.urgent_prompt',interactive:{list_reply:{id:'gsis_urgent',title:'Urgent Message'}}});
await webhook({...message,id:'wamid.urgent_body',type:'text',text:{body:'Please call me urgently.'}});
assert.match(sent.at(-1).text.body,/WhatsApp forwarding is queued/,'sender is told what the urgent path actually queued');
assert.equal(f.state.outbox.filter(job=>job.kind==='urgent_forward').length,1);
console.log('PASS v0.7.12 WhatsApp menu: first Report Absence link, retained selection IDs, HTTPS settings, no absence import, Inbox coexistence, duplicate receipt and no live traffic.');
