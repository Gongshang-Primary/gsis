import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const contract=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates.stapler_timetable;
const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'synthetic-access-'.repeat(4),WHATSAPP_APP_SECRET:'synthetic-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'synthetic-verify-'.repeat(4),GSIS_SECRET:'synthetic-service-'.repeat(4),EXTERNAL_LINK_SECRET:'synthetic-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',WHATSAPP_TEMPLATES_JSON:JSON.stringify({stapler_timetable:{...contract,enabled:true}}),WHATSAPP_SENDS_PER_SECOND:'20'};
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),ok=data=>Response.json({ok:true,data});
const jobs=n=>Array.from({length:n},(_,i)=>({id:'notice-'+i,claimId:'claim-'+i,recipientId:'teacher-'+i,mobile:'659'+String(i).padStart(7,'0'),name:'Fixture Teacher',date,expiresAt:now+3600000,data:{templateKey:'stapler_timetable',summary:'P2 MTL room A.'}}));

await test('v2 combines prepare and previous settlement into three Apps Script calls for sixteen recipients',async()=>{
 const remaining=jobs(16),events=[],settled=[],batches=new Set();let running=0,peak=0;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).includes('message_templates'))return Response.json({data:[{...contract,status:'APPROVED',components:[{type:'BODY',text:contract.body}]}]});
  const input=JSON.parse(init.body);
  if(String(url).endsWith('/messages')){running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,100));running--;return Response.json({messages:[{id:'wamid.'+input.biz_opaque_callback_data}]});}
  const p=JSON.parse(input.payload).input;events.push(p.operation);assert.equal(p.operation,'claimNotifications');assert.equal(p.claimProtocol,2);assert(!batches.has(p.batchId));batches.add(p.batchId);
  settled.push(...(p.previousResults||[]));return ok({transportVersion:2,prepared:true,notifications:remaining.splice(0,p.limit)});
 };
 const summary=await M.dispatchNotifications(env);assert.equal(summary.sent,16);assert.equal(summary.batches,2);assert.equal(events.length,3);assert.equal(settled.length,16);assert.equal(new Set(settled.map(r=>r.id)).size,16);assert(peak>1&&peak<=12);
});
await test('v2 provider cooldown settles outcomes without obtaining another prepared batch',async()=>{
 const row=jobs(1)[0];let claims=0,settled;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).endsWith('/messages'))return Response.json({error:{code:130429}},{status:429,headers:{'Retry-After':'120'}});
  const p=JSON.parse(JSON.parse(init.body).payload).input;
  if(p.operation==='claimNotifications'){claims++;return ok({transportVersion:2,prepared:true,notifications:[row]});}
  assert.equal(p.operation,'notificationResults');settled=p.results;return ok({recorded:true});
 };
 const summary=await M.dispatchNotifications(env);assert.equal(claims,1);assert.equal(summary.reason,'provider-cooldown');assert.equal(settled[0].retryAfterMs,120000);
});
await test('an ambiguous combined handoff settles known prior outcomes but never repeats Meta sends',async()=>{
 const row=jobs(1)[0];let claims=0,sends=0,settled=0;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).endsWith('/messages')){sends++;return Response.json({messages:[{id:'wamid.known'}]});}
  const p=JSON.parse(JSON.parse(init.body).payload).input;
  if(p.operation==='claimNotifications'){claims++;if(claims>1)throw Error('lost handoff');return ok({transportVersion:2,prepared:true,notifications:[row]});}
  assert.equal(p.operation,'notificationResults');settled+=p.results.length;return ok({recorded:true});
 };
 const summary=await M.dispatchNotifications(env);assert.equal(claims,2);assert.equal(sends,1);assert.equal(settled,1);assert.equal(summary.prepareFailures,1);
});
await test('one hundred recipients require ten bounded backend handoffs instead of twenty-eight',async()=>{
 const remaining=jobs(100),sentIds=new Set(),settledIds=new Set();let calls=0,peak=0,running=0;
 globalThis.fetch=async(url,init={})=>{
  const input=JSON.parse(init.body);
  if(String(url).endsWith('/messages')){assert(!sentIds.has(input.biz_opaque_callback_data));sentIds.add(input.biz_opaque_callback_data);running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,20));running--;return Response.json({messages:[{id:'wamid.'+input.biz_opaque_callback_data}]});}
  const p=JSON.parse(input.payload).input;calls++;assert.equal(p.operation,'claimNotifications');for(const result of p.previousResults||[]) {assert(Number.isFinite(result.submittedAt));settledIds.add(result.id);}
  return ok({transportVersion:2,prepared:true,notifications:remaining.splice(0,p.limit)});
 };
 const summary=await M.dispatchNotifications(env);assert.equal(summary.sent,100);assert.equal(summary.batches,9);assert.equal(calls,10);assert.equal(summary.backendCalls,10);assert.equal(settledIds.size,100);assert(peak<=12);assert(Number.isFinite(summary.firstSubmittedMs));assert(Number.isFinite(summary.firstAcceptedMs));
 console.log(JSON.stringify({fixture:'100 recipients; synthetic provider/backend',batches:summary.batches,backendCalls:summary.backendCalls,previousBackendCalls:28,elapsedMs:summary.elapsedMs,firstSubmittedMs:summary.firstSubmittedMs,firstAcceptedMs:summary.firstAcceptedMs}));
});
