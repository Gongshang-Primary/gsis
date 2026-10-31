import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const contract=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates.stapler_timetable;
const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'synthetic-access-'.repeat(4),WHATSAPP_APP_SECRET:'synthetic-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'synthetic-verify-'.repeat(4),ROSTER_SERVICE_SECRET:'synthetic-service-'.repeat(4),EXTERNAL_LINK_SECRET:'synthetic-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:'https://contacts.example.test/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',WHATSAPP_TEMPLATES_JSON:JSON.stringify({stapler_timetable:{...contract,enabled:true}}),WHATSAPP_SENDS_PER_SECOND:'20'};
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),ok=data=>Response.json({ok:true,data});
const jobs=n=>Array.from({length:n},(_,i)=>({id:'notice-'+i,claimId:'claim-'+i,recipientId:'teacher-'+i,mobile:'659'+String(i).padStart(7,'0'),name:'Fixture Teacher',date,expiresAt:now+3600000,data:{templateKey:'stapler_timetable',summary:'P2 MTL room A.'}}));
await test('sixteen recipients use bounded parallel Meta sends and two preparation/result writes',async()=>{
 const remaining=jobs(16),events=[],settled=[];let running=0,peak=0,claims=[];
 globalThis.fetch=async(url,init={})=>{
  if(String(url).includes('message_templates'))return Response.json({data:[{...contract,status:'APPROVED',components:[{type:'BODY',text:contract.body}]}]});
  const input=JSON.parse(init.body);
  if(String(url).endsWith('/messages')){running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,100));running--;return Response.json({messages:[{id:'wamid.'+input.biz_opaque_callback_data}]});}
  const p=JSON.parse(input.payload).input;events.push(p.operation);
  if(p.operation==='claimNotifications'){claims=remaining.splice(0,p.limit);return ok({transportVersion:1,notifications:claims});}
  if(p.operation==='prepareNotifications'){assert.deepEqual(p.claims,claims.map(({id,claimId})=>({id,claimId})));return ok({notifications:claims});}
  assert.equal(p.operation,'notificationResults');settled.push(...p.results);return ok({recorded:true});
 };
 const result=await M.dispatchNotifications(env);assert.equal(result.sent,16);assert.equal(result.batches,2);assert(peak>1&&peak<=12);assert.equal(events.filter(op=>op==='prepareNotifications').length,2);assert.equal(events.filter(op=>op==='notificationResults').length,2);assert.equal(new Set(settled.map(row=>row.id)).size,16);
});
await test('rate limiting persists the exact outcome, Retry-After and a shared cooldown before another claim',async()=>{
 const row=jobs(1)[0];let claimed=0,result;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).endsWith('/messages'))return Response.json({error:{code:130429}},{status:429,headers:{'Retry-After':'120'}});
  const p=JSON.parse(JSON.parse(init.body).payload).input;if(p.operation==='claimNotifications'){claimed++;return ok({transportVersion:1,notifications:[row]});}if(p.operation==='prepareNotifications')return ok({notifications:[row]});result=p.results[0];return ok({recorded:true});
 };
 const summary=await M.dispatchNotifications(env);assert.equal(summary.reason,'provider-cooldown');assert.equal(summary.failed,1);assert.equal(claimed,1);assert.equal(result.retryAfterMs,120000);assert.equal(result.rateLimited,true);
});
await test('no HTTP route performs a prepared WhatsApp dispatch',async()=>{
 assert(!source.includes('ctx.waitUntil(dispatchNotifications('));assert(!source.includes("MENU_ENABLED==='true')await dispatchNotifications"));
 const queued=[];globalThis.__dispatchFixture=async()=>({enabled:true,sent:0});
 const workerSource=fs.readFileSync('shared/roster-recovery-profile.js','utf8').replace(/^export (?=(?:async )?function )/gm,'')+fs.readFileSync('notification-worker/index.js','utf8').replace(/^import .*;$/gm,'').replace(/^/,'const assertRecoveryWritable=()=>{},safeHealthError=error=>({code:error.code||"UNKNOWN_ERROR"}),edgeRosterEnabled=()=>false,edgeDeployEnabled=()=>false,dispatchNotifications=(...args)=>globalThis.__dispatchFixture(...args),dispatchReceivedReports=async()=>({}),dispatchPeerMail=async()=>({});\n');
 const worker=(await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64')))).default;
 const binding={send:async row=>queued.push(row)},wakeEnv={...env,NOTIFICATION_QUEUE:binding};
 const signed=await M.sign({purpose:'gsis-notification-wake-v1',timestamp:Date.now(),nonce:crypto.randomUUID()},env.ROSTER_SERVICE_SECRET);
 const request=()=>new Request('https://notifier.example.test/dispatch',{method:'POST',body:JSON.stringify(signed)});
 assert.equal((await worker.fetch(request(),wakeEnv)).status,202);assert.equal(queued.length,1);assert.equal(queued[0].purpose,'gsis-notification-wake-v1');
 signed.signature='0'.repeat(64);assert.equal((await worker.fetch(request(),wakeEnv)).status,403);assert.equal(queued.length,1);
 let retried,acknowledged=0;globalThis.__dispatchFixture=async()=>({pending:true,readyAt:Date.now()+120000});await worker.queue({messages:[{body:queued[0]}],retryAll:value=>retried=value,ackAll:()=>acknowledged++},wakeEnv);assert(retried.delaySeconds>=119);assert.equal(acknowledged,0);
 globalThis.__dispatchFixture=async()=>({sent:1});await worker.queue({messages:[{body:queued[0]}],retryAll:()=>assert.fail(),ackAll:()=>acknowledged++},wakeEnv);assert.equal(acknowledged,1);
});
await test('statistics and acknowledgement status do not fetch Calendar day context',async()=>{
 globalThis.fetch=()=>assert.fail('No upstream call for compact read context');for(const operation of ['statistics','statisticsCalendar','acknowledgementStatus']){const input=await M.trustedOperationsInput({operation,from:'2025-01-01',to:'2026-10-22'},env,{email:'staff@example.test'});assert.deepEqual(input.calendarByDate,{});}
});
