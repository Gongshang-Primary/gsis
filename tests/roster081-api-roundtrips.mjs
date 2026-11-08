import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const require=createRequire(import.meta.url),{makeHarness}=require('./calendar/backend_harness.cjs'),h=makeHarness();
const dates=['2026-10-20','2026-10-21'];
h.seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'}]);
h.seed('YearStructure',[{StructureID:'week',Year:2026,Kind:'TERM_WEEK',Term:'4',Week:'6',StartDate:'2026-10-19',EndDate:'2026-10-25'}]);
const yearReads=[],readYear=h.sandbox.rc18YearData_;
h.sandbox.rc18YearData_=(year,names)=>{yearReads.push(year);return readYear(year,names);};
const service={action:'rosterDates',service:'gsis-roster-notifier-v1',proxySecret:'synthetic-secret'.repeat(3),payload:{dates}};
const post=body=>JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify(body)}}).text);
const writesBefore=h.audit.writes;
const batch=post(service);
assert.equal(batch.ok,true,'Authenticated scheduler can batch its independent date reads');
assert.deepEqual(batch.result.dates.map(d=>d.date),dates);
assert.deepEqual(yearReads,[2026],'Two dates load the released year once');
assert(batch.result.dates.every(d=>d.schoolDay===true&&d.parity==='even'));
for(const change of [{proxySecret:'wrong'},{service:'wrong'},{action:'saveEvent'},{payload:{dates:[dates[0],dates[0]]}},{payload:{dates:['2026-02-30']}},{payload:{dates:Array.from({length:63},(_,n)=>new Date(Date.UTC(2026,0,n+1)).toISOString().slice(0,10))}}])assert.equal(post({...service,...change}).ok,false);
assert.equal(h.audit.writes,writesBefore,'Service date reads do not mutate Calendar');

const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster-test/exec',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),ROSTER_AUTOMATION_ENABLED:'true',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-test/exec',CALENDAR_PROXY_SECRET:'synthetic-secret'.repeat(3)};
const oldFetch=globalThis.fetch,oldTimeout=AbortSignal.timeout;
let calls=[],forwarded=[],deadlines=[];
try{
 AbortSignal.timeout=ms=>{deadlines.push(ms);return oldTimeout(ms);};
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url));const body=JSON.parse(options.body);
  if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){assert.equal(body.action,'rosterDates');assert.deepEqual(body.payload.dates,dates);assert.equal(body.service,'gsis-roster-notifier-v1');assert.equal(body.actor,undefined);return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);}
  assert.equal(String(url),env.APPS_SCRIPT_URL);const payload=JSON.parse(body.payload);forwarded.push(payload);assert.equal(body.signature,(await worker.sign(payload,env.ROSTER_SERVICE_SECRET)).signature);return Response.json({ok:true,data:{accepted:true}});
 };
 const stamp=Date.parse('2026-10-20T16:00:00+08:00');
 assert.equal((await worker.scheduledRoster(env,stamp)).accepted,true);
 assert.deepEqual(calls,[env.CALENDAR_APPS_SCRIPT_URL,env.APPS_SCRIPT_URL]);assert.deepEqual(deadlines,[12000,25000]);
 assert.equal(forwarded[0].input.date,dates[1]);assert.deepEqual(Object.keys(forwarded[0].input.calendarByDate),dates);
 assert(forwarded[0].input.calendarByDate[dates[0]].available);

 // H Notify independently captures the effective saved timetable as an immutable
 // recipient snapshot. It verifies only its selected date, without trusting client Calendar facts.
 calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(String(url),env.CALENDAR_APPS_SCRIPT_URL);const body=JSON.parse(options.body);assert.equal(body.action,'rosterDate');assert.equal(body.payload.date,dates[0]);return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);};
 const requestId=crypto.randomUUID(),notify=await worker.trustedOperationsInput({operation:'notifyDaily',date:dates[0],requestId,expectedPublicationRevision:3,expectedDayToken:'saved-day-token',calendarByDate:{[dates[0]]:{schoolDay:false,parity:'forged'}}},env,{email:'teacher@gsps.edu.sg',subject:'teacher'});
 assert.deepEqual(calls,[env.CALENDAR_APPS_SCRIPT_URL],'Notify obtains exactly one selected-date Calendar snapshot, with no extra requests');assert.equal(notify.calendarByDate[dates[0]].schoolDay,true);assert.equal(notify.calendarByDate[dates[0]].parity,'even');assert.deepEqual(Object.keys(notify.calendarByDate),[dates[0]]);assert.equal(notify.requestId,requestId);assert.equal(notify.expectedPublicationRevision,3);assert.equal(notify.expectedDayToken,'saved-day-token');
 // The review screen independently gets one selected-date Calendar read too.
 calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));const body=JSON.parse(options.body);assert.equal(body.action,'rosterDate');return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);};
 const screen=await worker.trustedOperationsInput({operation:'dailyNotify',date:dates[0]},env,{email:'teacher@gsps.edu.sg',subject:'teacher'});
 assert.equal(calls.length,1);assert.equal(screen.calendarByDate[dates[0]].schoolDay,true);

 // A malformed batched response cannot grant dated authority; there is no
 // serial per-date fallback that multiplies upstream waits under an outage.
 calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));if(String(url)===env.CALENDAR_APPS_SCRIPT_URL)return Response.json({ok:true,result:{dates:[{date:dates[0],schoolDay:true,parity:'even'}]}});forwarded.push(JSON.parse(JSON.parse(options.body).payload));return Response.json({ok:true,data:{accepted:true}});};
 await worker.scheduledRoster(env,stamp);assert.equal(calls.length,2);assert(Object.values(forwarded.at(-1).input.calendarByDate).every(d=>d.available===false));
 console.log('PASS 081 API: evening Calendar calls 2→1, released-year reads 2→1, Notify exactly one selected-date effective-snapshot Calendar read, authority/limits/receipt/day token preserved; no live latency claim.');
}finally{globalThis.fetch=oldFetch;AbortSignal.timeout=oldTimeout;}
