import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('./roster701-fixture.cjs');
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
globalThis.fetch=async()=>{throw Error('This check must not send network requests');};
for(const [time,day,key,fields] of [['21:30','2026-10-13','relief_evening',4],['05:30','2026-10-14','relief_morning',5]]){
 const f=fixture();f.ctx.service=true;f.ctx.dutySources={[f.date]:{available:true,staffIds:['alice']}};f.state.smcDutyRoster=[{date:f.date,staffIds:['alice']}];f.ctx.now=Date.parse(day+'T'+time+':00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.today=day;
 for(let i=0;i<100;i++)f.state.absences.push({id:'many-'+i,date:f.date,staffId:'fixture-teacher-'+i,periods:[1,2,3,4,5,6,7,8,9,10,11,12]});
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);const row=f.state.outbox.find(j=>j.kind==='smc_report');row.claimId='fixture-claim';row.expiresAt=Date.now()+60000;assert.equal(row.data.templateKey,key);assert.equal(row.data.newAbsenceCount,undefined);
 const config={templates:{[key]:worker.WHATSAPP_CONTRACTS[key]}},payload=await worker.templateMessage(row,{ROSTER_PUBLIC_ORIGIN:'https://roster.test'},config),parameters=payload.template.components[0].parameters;
 assert.equal(payload.template.name,worker.WHATSAPP_CONTRACTS[key].name);assert.equal(parameters.length,fields);assert(parameters.every(p=>p.type==='text'&&p.text.trim().length));assert.equal(parameters[0].text,'Alice');assert.match(parameters[1].text,/14 Oct 2026/);assert.equal(parameters[2].text,row.data.summary);assert(parameters[2].text.length<=900);assert.match(parameters[2].text,/100 absent teachers/);assert.equal(parameters.at(-1).text,'https://roster.test/');if(key==='relief_morning')assert.equal(parameters[3].text,row.data.healthSummary);
}
console.log('PASS evening/morning queued summaries match existing approved template contracts, bind all fields without newAbsenceCount, and keep large school summaries bounded; network is blocked.');
