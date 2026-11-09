import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
// Compile the canonical contract exactly as the release synchroniser does.
const source=fs.readFileSync('roster-update/public/_worker.js','utf8').replace(/const WHATSAPP_CONTRACTS=.*?;\n/,()=> 'const WHATSAPP_CONTRACTS='+JSON.stringify(contracts)+';\n');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=roster-worker-fixture.mjs').toString('base64')));
const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'synthetic-access-'.repeat(4),WHATSAPP_APP_SECRET:'synthetic-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'synthetic-verify-'.repeat(4),GSIS_SECRET:'synthetic-service-'.repeat(4),EXTERNAL_LINK_SECRET:'synthetic-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',CONTACTS_PUBLIC_URL:'https://contacts.example.test/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),week=7*86400000;
const row={id:'notice',claimId:'claim',recipientId:'fixture-teacher',mobile:'6590000000',name:'Fixture Teacher',date,createdAt:new Date(now).toISOString(),linkIssuedAt:now,linkExpiresAt:now+week,expiresAt:now+3600000,data:{templateKey:'stapler_timetable',dailyPublication:true,summary:'P2\nMTL\tclass 1A. Please open the private timetable and acknowledge this update.'}};
await test('approved two-button variant has exact separate parameters, one reusable capability and live approval enforcement',async()=>{
 const contract=contracts.stapler_timetable.variants?.buttons;assert.ok(contract,'button contract is prepared separately from the active inline contract');
 assert.equal(contract.submissionState,'APPROVED');assert.equal(contract.id,'1009634445543507');
 const cfg={contactsUrl:env.CONTACTS_PUBLIC_URL,templates:{stapler_timetable:{...contract,enabled:true}}};
 const message=await M.templateMessage(row,env,cfg),parts=message.template.components;
 assert.equal(parts.length,3);assert.deepEqual(parts[0].parameters.map(p=>p.text),['Fixture Teacher',parts[0].parameters[1].text,'P2; MTL class 1A.']);
 assert.deepEqual(parts.slice(1).map(p=>[p.type,p.sub_type,p.index]),[['button','url','0'],['button','url','1']]);
 assert.equal(parts[1].parameters[0].text,parts[2].parameters[0].text);const cap=await M.readCapability(parts[1].parameters[0].text,env,env.ROSTER_PUBLIC_ORIGIN);assert.equal(cap.expiresAt,row.linkExpiresAt);
 const retry=await M.templateMessage(row,env,cfg);assert.equal((await M.readCapability(retry.template.components[1].parameters[0].text,env,env.ROSTER_PUBLIC_ORIGIN)).issuedAt,now);
 let records=[{...contract,status:'PENDING',components:[{type:'BODY',text:contract.body},{type:'BUTTONS',buttons:contract.urlButtons.map(b=>({type:'URL',text:b.text,url:b.url}))}]}];
 globalThis.fetch=async()=>Response.json({data:records});assert.deepEqual(await M.approvedTemplateKeys({...env,WHATSAPP_ACCESS_TOKEN:'pending'.repeat(8)},cfg),[]);
 records[0].status='APPROVED';assert.deepEqual(await M.approvedTemplateKeys({...env,WHATSAPP_ACCESS_TOKEN:'approved'.repeat(8)},cfg),['stapler_timetable']);
 records[0].components[1].buttons.reverse();assert.deepEqual(await M.approvedTemplateKeys({...env,WHATSAPP_ACCESS_TOKEN:'wrongorder'.repeat(8)},cfg),[]);
});
await test('a failed prepare stops claims, while result persistence retries the exact outcome without another send',async()=>{
 const contract=contracts.stapler_timetable,config={stapler_timetable:{...contract,enabled:true}},active={...env,WHATSAPP_ACCESS_TOKEN:'serial'.repeat(8),WHATSAPP_TEMPLATES_JSON:JSON.stringify(config),WHATSAPP_SEND_CONCURRENCY:'1'};
 const events=[],queue=[{...row,id:'a',claimId:'a-claim'},{...row,id:'b',claimId:'b-claim'},{...row,id:'c',claimId:'c-claim'}];let current=null,failPrepare=true;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).includes('message_templates'))return Response.json({data:[{...contract,status:'APPROVED',components:[{type:'BODY',text:contract.body}]}]});
  if(String(url).endsWith('/messages')){events.push('send:'+current.id);return Response.json({messages:[{id:'wamid.'+current.id}]});}
  const input=JSON.parse(JSON.parse(init.body).payload).input;
  if(input.operation==='claimNotifications'){assert.equal(input.limit,1);current=queue.shift();events.push('claim:'+ (current?.id||'none'));return Response.json({ok:true,data:{notifications:current?[current]:[]}});}
  if(input.operation==='prepareNotification'){events.push('prepare:'+input.id);if(failPrepare)return Response.json({ok:false,status:503,error:'Temporary unavailable'});return Response.json({ok:true,data:{notification:current}});}
  events.push('result:'+input.id);throw Error('Response lost after durable result');
 };
 const first=await M.dispatchNotifications(active);assert.equal(first.claimed,1);assert.equal(first.sent,0);assert.equal(first.prepareFailures,1);assert.deepEqual(events,['claim:a','prepare:a']);
 failPrepare=false;events.length=0;const second=await M.dispatchNotifications(active);assert.equal(second.claimed,1);assert.equal(second.sent,1);assert.equal(second.resultFailures,1);assert.deepEqual(events,['claim:b','prepare:b','send:b','result:b','result:b']);assert.equal(queue.length,1);
});
