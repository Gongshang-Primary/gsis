import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/relief-info-fixture.mjs';
import {edgeRosterBackend,mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
import {GSiSEdgeNotifications as N,GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {templateMessage,approvedTemplateKeys} from '../roster-update/public/_worker.js';
const activation=JSON.parse(readFileSync('notification-worker/templates.activation.json')),contract=JSON.parse(readFileSync('notification-worker/template-contracts.json')).templates.lse_notice;
const realNow=Date.now,realFetch=globalThis.fetch;let f;
try{
 Date.now=()=>Date.parse('2026-11-12T11:16:00+08:00');globalThis.fetch=()=>assert.fail('No live provider or Google calls');
 f=await fixture(4,{date:'2026-11-12',lessonPeriods:[10,11]});f.env.WHATSAPP_TEMPLATES_JSON=JSON.stringify(activation);
 await mutateEdgeRoster(f.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureLse'},needsContext:false,apply(state){state.smcDutyRoster=[{date:f.date,staffIds:[f.people[3].id]}];state.massPublications[f.date]={at:f.date+'T06:00:00+08:00'};return {};}});
 const input={operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),staffId:f.people[0].id,date:f.date,typeId:'lse',periods:[10,11],reliefRequired:true};
 const reply=(await edgeRosterBackend(f.env,'rosterOperations',input,f.who(0),crypto.randomUUID())).result;assert.equal(reply.ok,true,JSON.stringify(reply));
 let state=await f.state(),jobs=state.outbox.filter(j=>j.kind==='lse_notice');assert.equal(jobs.length,1);assert.equal(jobs[0].recipientId,f.people[3].id);assert.equal(jobs[0].data.absentTeacherName,f.people[0].name);assert(!state.outbox.some(j=>j.data?.emergencyAbsence));
 const repeat=(await edgeRosterBackend(f.env,'rosterOperations',input,f.who(0),crypto.randomUUID())).result;assert.equal(repeat.ok,true);assert.equal((await f.state()).outbox.filter(j=>j.kind==='lse_notice').length,1);
 const fresh={rosterPeople:f.people,rosterSMCIds:[f.people[3].id],rosterAdminIds:[]},now=Date.parse(f.date+'T23:00:00+08:00'),job=structuredClone(jobs[0]);assert.equal(N.eligible(state,job,now,fresh,O.notificationIndex(state),new Set(['lse_notice'])),null,'proven LSE event bypasses quiet hours');assert.equal(N.eligible(state,{...job,key:'forged'},now,fresh,O.notificationIndex(state),new Set(['lse_notice'])),'LSE notice no longer matches the saved report.');assert.equal(N.eligible(state,structuredClone(job),now,fresh,O.notificationIndex(state),new Set()),'blocked');assert.match(N.eligible({...state,smcDutyRoster:[]},structuredClone(job),now,fresh,O.notificationIndex(state),new Set(['lse_notice'])),/no longer on relief duty/);
 const env={...f.env,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',WHATSAPP_API_VERSION:'v25.0',WHATSAPP_TEMPLATE_ACCOUNT_ID:'123456789',WHATSAPP_ACCESS_TOKEN:'synthetic-only'},config={templates:{lse_notice:activation.lse_notice}};
 const payload=await templateMessage({...jobs[0],claimId:'synthetic'},env,config);assert.equal(payload.template.name,'gsis_lse_notice_v1');assert.equal(payload.template.components.length,1,'static URL button sends no parameter');assert.deepEqual(payload.template.components[0].parameters.map(p=>p.text),[f.people[3].name,f.people[0].name,'12 Nov 2026 (Thu)']);
 let probes=0;globalThis.fetch=async url=>{assert(String(url).startsWith('https://graph.facebook.com/'));probes++;return Response.json({data:[{...contract,status:'APPROVED',components:[{type:'BODY',text:contract.body},{type:'BUTTONS',buttons:[{type:'URL',...contract.staticUrlButtons[0]}]}]}]});};assert.deepEqual(await approvedTemplateKeys(env,config),['lse_notice']);assert.equal(probes,1,'approval is simulated, never a provider call');
 f.env.WHATSAPP_TEMPLATES_JSON=JSON.stringify({...activation,lse_notice:{...activation.lse_notice,enabled:false}});const disabled=(await edgeRosterBackend(f.env,'rosterOperations',{...input,requestId:crypto.randomUUID(),staffId:f.people[1].id,lseNoticeEnabled:true},f.who(1),crypto.randomUUID())).result;assert.equal(disabled.ok,true,JSON.stringify(disabled));state=await f.state();assert.equal(state.outbox.filter(j=>j.kind==='lse_notice').length,1,'disabled template produces no new job');
 console.log('PASS native D1 LSE routing, replay, disabled template, quiet-hours proof, fresh duty check, approved static-button contract and exact payload');
}finally{if(f)f.db.sql.close();Date.now=realNow;globalThis.fetch=realFetch;}
