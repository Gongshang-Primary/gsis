import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const registry=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
const config={contactsUrl:'https://contacts.example.test/',templates:Object.fromEntries(Object.entries(registry).map(([key,t])=>[key,{...t,enabled:true,summaryMaxCharacters:12000}]))};
const env={ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'p'.repeat(40)};
const now=Date.now(),base={id:'n',claimId:'claim',recipientId:'alice',mobile:'6591234567',date:new Date(now+8*3600000).toISOString().slice(0,10),expiresAt:now+3600000,name:'Alice',requestId:'r1',kind:'test',data:{summary:'4A EL P2 08:00 to 08:30 C1-01. Full lesson instructions.',requesterName:'Bob',assignedTeacherName:'Dora',healthSummary:'25%',newAbsenceCount:2,finalRunComplete:true,originalMessage:'Exact urgent text',senderName:'Bob',senderContact:'6592345678',className:'4A',periodAndTime:'P2 · 08:00 to 08:30',instruction:'Dismiss at gate A.',absentTeacherName:'Bob',absentTeacherContact:'https://wa.me/6592345678'}};
let checks=0;
for(const [key,c] of Object.entries(registry)){
 const row=structuredClone(base);row.data.templateKey=key;row.data.startAt=Date.now()+(key==='relief_reminder'?20:key==='relief_unacknowledged'?10:12)*60000;
 const p=await M.templateMessage(row,env,config),values=p.template.components[0].parameters.map(v=>v.text);
 assert.equal(p.template.name,c.name);assert.equal(p.template.language.code,'en_GB');assert.equal(values.length,c.fields.length,key);assert.equal(values[0],key==='stapler_decision'?'Bob':'Alice');assert(!JSON.stringify(p).includes('sample-not-valid'));if(key==='relief_evening')assert.equal(p.template.name,'gsis_relief_evening_v1');
 if(key==='relief_evening'){assert.equal(values[2],row.data.summary);assert.equal(values[3],env.ROSTER_PUBLIC_ORIGIN+'/');}
 if(key==='mutual_request'){assert.equal(values[1],'Bob');const u=new URL(values[4]),cap=await M.readCapability(u.hash.slice(1),env,u.origin);assert.equal(cap.staffId,'alice');assert.equal(cap.requestId,'r1');}
 if(key==='relief_urgent_smc'){assert.equal(values[1],'Dora');assert.equal(values[3],'12');}
 checks++;
}
const long={...structuredClone(base),kind:'relief_publication',data:{...base.data,templateKey:'relief_assignment',summary:'START '+('complete instructions '.repeat(80))+' END'}};
const full=await M.templateMessage(long,env,config);assert(full.template.components[0].parameters[2].text.endsWith(' END'));
await assert.rejects(()=>M.templateMessage(long,env,{...config,templates:{...config.templates,relief_assignment:{...config.templates.relief_assignment,summaryMaxCharacters:100}}}),/EXCEEDS_VERIFIED_TEMPLATE/);checks++;
await assert.rejects(()=>M.templateMessage({...base,data:{...base.data,templateKey:'relief_manual_review',finalRunComplete:false}},env,config),/FINAL_RUN/);checks++;
await assert.rejects(()=>M.templateMessage({...base,data:{...base.data,templateKey:'relief_reminder',startAt:Date.now()+17*60000}},env,config),/STALE_COUNTDOWN/);checks++;
await assert.rejects(()=>M.templateMessage({...base,data:{...base.data,templateKey:'relief_urgent',startAt:Date.now()-60000}},env,config),/STALE_COUNTDOWN/);checks++;
await assert.rejects(()=>M.templateMessage({...base,data:{templateKey:'mutual_request',summary:'Details'}},env,config),/requesting_teacher_name/);checks++;
const list=M.menuReply({to:'6591234567',action:'menu'},env);assert.equal(list.interactive.type,'list');assert.equal(list.interactive.action.sections[0].rows.length,5);
const phone=M.menuReply({to:'6591234567',action:'office'},{...env,GENERAL_OFFICE_PHONE:'+6561234567'});assert.equal(phone.type,'contacts');assert.equal(phone.contacts[0].phones[0].wa_id,undefined);assert.equal(phone.contacts[0].phones[0].phone,'+6561234567');checks++;
// Verify live approval, exact body and utility category; never trust an environment status label alone.
const liveEnv={...env,WHATSAPP_TEMPLATE_ACCOUNT_ID:'123456',WHATSAPP_ACCESS_TOKEN:'k'.repeat(40),WHATSAPP_API_VERSION:'v23.0'};
const chosen=['relief_assignment','relief_evening','relief_morning','contact_review'];
const cfg={...config,templates:Object.fromEntries(chosen.map(k=>[k,config.templates[k]]))};let fetches=0;
globalThis.fetch=async()=>{fetches++;return Response.json({data:chosen.map(k=>({name:registry[k].name,language:'en_GB',status:k==='relief_morning'?'PENDING':'APPROVED',category:k==='contact_review'?'MARKETING':'UTILITY',components:[{type:'BODY',text:registry[k].body+(k==='relief_evening'?' changed':'')}]}))});};
assert.deepEqual(await M.approvedTemplateKeys(liveEnv,cfg),['relief_assignment']);assert.deepEqual(await M.approvedTemplateKeys(liveEnv,cfg),['relief_assignment']);assert.equal(fetches,1);checks++;
// The submitted instruction must retain its exact body and seven complete examples.
const proposals=JSON.parse(fs.readFileSync('notification-worker/proposed-template-submissions.json'));
assert.equal(proposals.length,1);const proposal=proposals[0],instruction=registry.conditional_relief_instruction;
assert.equal(proposal.integrationKey,'conditional_relief_instruction');assert.equal(proposal.state,'PENDING');assert.equal(proposal.templateId,instruction.id);
assert.equal(proposal.request.name,instruction.name);assert.equal(proposal.request.category,'UTILITY');assert.equal(proposal.request.language,'en_GB');assert.equal(proposal.request.parameter_format,'POSITIONAL');
assert.equal(proposal.request.components.length,1);assert.equal(proposal.request.components[0].text,instruction.body);
assert.equal(proposal.request.components[0].example.body_text[0].length,instruction.fields.length);assert(proposal.request.components[0].example.body_text[0].every(v=>typeof v==='string'&&v.trim()));checks++;
console.log('PASS '+checks+' WhatsApp contract, private-link, exact-text, countdown, contact-menu and approval-gate checks; no live sends.');
