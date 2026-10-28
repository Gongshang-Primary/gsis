import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
const config={contactsUrl:'https://contacts.example.test/',templates:Object.fromEntries(Object.entries(contracts).map(([key,c])=>[key,{...c,enabled:true,summaryMaxCharacters:1024}]))};
const env={ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'synthetic-link-secret-'.repeat(3)};
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),raw='First\r\nSecond\nThird\rFourth\tcolumn     five\u0085Sixth\u2028Seventh\u2029Eighth\u00a0word';
const expected='First; Second; Third; Fourth column five; Sixth; Seventh; Eighth word';
const timetableMessage='Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.';
const row={id:'fixture-notice',claimId:'fixture-claim',recipientId:'fixture-teacher',mobile:'6591234567',name:'Fixture Teacher',date,expiresAt:now+3600000,requestId:'fixture-request',data:{summary:raw,requesterName:'Requesting Teacher',assignedTeacherName:'Assigned Teacher',healthSummary:raw,newAbsenceCount:2,finalRunComplete:true,originalMessage:raw,senderName:'Sender',senderContact:'sender@example.test',className:'4A',periodAndTime:'P3 08:30 to 09:00',instruction:raw,absentTeacherName:'Absent Teacher',absentTeacherContact:'https://wa.me/6590000000'}};

// Every registered template must encode actual dynamic content at the send boundary.
for(const [key,c] of Object.entries(contracts)){
 const input={...row,data:{...row.data,templateKey:key,startAt:Date.now()+(key==='relief_reminder'?20:key==='relief_unacknowledged'?10:12)*60000}};
 const before=JSON.stringify(input),payload=await M.templateMessage(input,env,config),parameters=payload.template.components[0].parameters;
 assert.equal(payload.template.name,c.name);assert.equal(payload.template.language.code,'en_GB');assert.equal(payload.template.components.length,1);assert.equal(payload.template.components[0].type,'body');assert.equal(parameters.length,c.fields.length);
 for(const parameter of parameters){assert.equal(parameter.type,'text');assert.doesNotMatch(parameter.text,/[\r\n\t\u0085\u2028\u2029]| {5}/,key+' must produce provider-safe parameters');}
 for(const [i,field] of c.fields.entries())if(['change_details','lessons_and_periods','contact_review_details','lessons_periods_venues','changed_or_cancelled_duties','lesson_period_time_venue','lesson_period_start_venue','absence_allocation_uncovered_summary','overnight_absence_allocation_summary','relief_health_summary','additional_periods_allocation_summary','uncovered_periods_summary','allocation_summary','capacity_details','attention_details','original_message','conditional_instruction'].includes(field))assert.equal(parameters[i].text,expected,key+': '+field);
 assert.equal(JSON.stringify(input),before,'Original content must remain unchanged');
 assert.equal(M.WHATSAPP_CONTRACTS[key].body,c.body,'Approved fixed body paragraphs must remain unchanged');
 const linkIndex=c.fields.findIndex(f=>f.startsWith('private_'));
 if(linkIndex>=0){const link=new URL(parameters[linkIndex].text),claims=await M.readCapability(link.hash.slice(1),env,link.origin);assert.equal(claims.staffId,row.recipientId);assert.equal(claims.date,date);}
}

// Reproduce the real Daily Notify producer rather than a hand-authored one-line fixture.
const require=createRequire(import.meta.url),f=require('./roster701-fixture.cjs')();
Object.assign(f.ctx,{today:date,now,iso:new Date(now).toISOString()});f.ctx.days[date]={id:'fixture-baseline'};
const periods=[{period:3,start:'08:30',end:'09:00'},{period:4,start:'09:00',end:'09:30'},{period:7,start:'10:30',end:'11:00'}],cells=Array.from({length:8},()=>['','','','']),timings=periods.map(p=>[p.period,p.start,p.end]);cells[7]=['PD (P5/6 Sci)','PD','','.'];
const priorCells=structuredClone(cells);priorCells[3]=['EL','4A','Room',''];priorCells[4]=['MA','4A','Room',''];priorCells[7]=['EL','4A','Room',''];
f.state.outbox.push({id:'prior-delivered',kind:'stapler_timetable',recipientId:'bob',date,status:'sent',deliveryStatus:'delivered',createdAt:new Date(now-60000).toISOString(),completedAt:new Date(now-59000).toISOString(),data:{dailyPublication:true,fingerprint:JSON.stringify([priorCells,timings,[]])}});
f.state.dailyPublicationStates={[date]:{date,revision:3,baselineId:'fixture-baseline',publishedAt:new Date(now).toISOString(),periods,teachers:[{staffId:'bob',changed:false,updated:true,cells,baseline:structuredClone(cells),fingerprint:JSON.stringify([cells,timings,[]]),rows:[{period:3,timeStart:'08:30',timeEnd:'09:00',subject:'',className:'',groupName:'',venue:'',kind:'restored'},{period:4,timeStart:'09:00',timeEnd:'09:30',subject:'',className:'',groupName:'',venue:'',kind:'restored'},{period:7,timeStart:'10:30',timeEnd:'11:00',subject:'PD (P5/6 Sci)',className:'PD',groupName:'.',venue:'',kind:'restored'}]}]}};
f.ctx.days[date]={id:'fixture-baseline',date,schoolDay:true,verified:true,periods,teachers:[{staffId:'bob',name:'Bob',cells:structuredClone(cells)}]};
const published=JSON.stringify(f.state.dailyPublicationStates),history=JSON.stringify(f.state.outbox[0]);
f.O.notifyDaily(f.state,f.ctx,{date,staffId:'bob',expectedPublicationRevision:3,requestId:'fixture'});
const queued={...f.state.outbox.find(job=>job.status==='queued'),claimId:'fixture-claim'},summary=queued.data.summary;
assert.equal(summary,timetableMessage);
const actual=await M.templateMessage(queued,env,config);
assert.equal(actual.template.components[0].parameters[2].text,timetableMessage);
assert.equal(queued.data.summary,summary);
assert.equal(JSON.stringify(f.state.dailyPublicationStates),published,'Full published lessons and duties remain available behind View Detail');
assert.equal(JSON.stringify(f.state.outbox[0]),history,'New notice creation preserves sent history');
const buttonConfig={...config,templates:{...config.templates,stapler_timetable:{...contracts.stapler_timetable.variants.buttons,enabled:true,summaryMaxCharacters:1024}}};
const buttonEnv={...env,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg'},buttonPayload=await M.templateMessage(queued,buttonEnv,buttonConfig),body=buttonPayload.template.components.find(c=>c.type==='body'),buttons=buttonPayload.template.components.filter(c=>c.type==='button');
assert.equal(buttonPayload.template.name,'gsis_timetable_updated_button_v2');assert.equal(body.parameters.length,3);assert.equal(body.parameters[2].text,timetableMessage);assert.deepEqual(buttons.map(b=>b.index),['0','1']);
for(const button of buttons){const claims=await M.readCapability(button.parameters[0].text,buttonEnv,buttonEnv.ROSTER_PUBLIC_ORIGIN);assert.equal(claims.staffId,'bob');assert.equal(claims.date,date);}

const timetable={...row,data:{...row.data,templateKey:'stapler_timetable',summary:'Valid'}};
for(const bad of ['', ' \r\n\t ', 'bad\0text','bad\vtext','bad\ftext','bad\u007ftext','bad\u009ftext'])await assert.rejects(()=>M.templateMessage({...timetable,data:{...timetable.data,summary:bad}},env,config),/MISSING_OR_INVALID_TEMPLATE_FIELD/);
await assert.rejects(()=>M.templateMessage({...timetable,data:{...timetable.data,summary:'x'.repeat(1025)}},env,config),/EXCEEDS_VERIFIED_TEMPLATE/);
await assert.rejects(()=>M.templateMessage({...timetable,data:{...timetable.data,summary:'a\nb'}},env,{...config,templates:{...config.templates,stapler_timetable:{...config.templates.stapler_timetable,summaryMaxCharacters:3}}}),/EXCEEDS_VERIFIED_TEMPLATE/,'Check length after encoding, including separators');
const contact={...row,data:{...row.data,templateKey:'contact_review',summary:'Check contacts'}};
for(const bad of ['http://contacts.example.test/','https://user:pass@contacts.example.test/','https://contacts.example.test/\npath','https://contacts.example.test/\u0085path',' https://contacts.example.test/','https://contacts.example.test/with space','https://contacts.example.test/\\path'])await assert.rejects(()=>M.templateMessage(contact,env,{...config,contactsUrl:bad}),/INVALID_TEMPLATE_URL/);
const signed='https://contacts.example.test/external.html#header.payload_SIGNATURE-123';
const urlPayload=await M.templateMessage(contact,env,{...config,contactsUrl:signed});assert.equal(urlPayload.template.components[0].parameters.at(-1).text,signed,'Signed URLs must not be normalized');
console.log('PASS all 21 template payload contracts, real Daily Notify output, full text preservation, whitespace/control/length validation and unchanged private links; no network.');
