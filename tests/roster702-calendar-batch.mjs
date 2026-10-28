import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const require=createRequire(import.meta.url),{makeHarness}=require('./calendar/backend_harness.cjs');
const h=makeHarness(),keys=Array.from({length:62},(_,n)=>new Date(Date.parse('2026-09-14T12:00:00Z')+n*86400000).toISOString().slice(0,10));
const week=(year,from,to,n)=>({StructureID:year+'-'+from,Year:year,Kind:'TERM_WEEK',Term:'4',Week:String(n),StartDate:from,EndDate:to});
const weeks=Array.from({length:9},(_,n)=>week(2026,keys[n*7],new Date(Date.parse(keys[n*7]+'T12:00:00Z')+6*86400000).toISOString().slice(0,10),n+1));
h.seed('YearStructure',[...weeks,{...weeks[2],StructureID:'vacation',Kind:'VACATION',Label:'School vacation'},{...weeks[4],StructureID:'overlap',Week:'20'}]);
h.seed('Events',[{...h.base,EventID:'holiday',OwnerTag:'hol',EventType:'ALL_DAY',StartDate:keys[2],EndDate:keys[2],StaffTitle:'School holiday'},{...h.base,EventID:'hidden',OwnerTag:'hol',EventType:'ALL_DAY',StartDate:keys[3],EndDate:keys[3],Status:'HIDDEN'}]);
const yearReads=[],readYear=h.sandbox.rc18YearData_;
h.sandbox.rc18YearData_=(year,names)=>{yearReads.push(year);return readYear(year,names);};
const beforeWrites=h.audit.writes,batch=h.call('rosterDates',{dates:keys},'teacher');
assert.deepEqual(yearReads,[2026],'62 dates reuse one year read');
const withoutStamp=({checkedAt,...value})=>value;
for(const [index,key] of keys.entries())assert.deepEqual(withoutStamp(batch.dates[index]),withoutStamp(h.call('rosterDate',{date:key},'teacher')),key);
for(const dates of [[],[keys[0],keys[0]],['2026-02-30'],[null],[20260914],Array.from({length:63},(_,n)=>new Date(Date.UTC(2026,0,n+1)).toISOString().slice(0,10))])assert.throws(()=>h.call('rosterDates',{dates},'teacher'),error=>error.code==='INVALID_DATE');

// A range crossing New Year reads each released year once. An unreleased
// year stays unavailable without reading its event bodies or hiding valid dates.
h.seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'},{Year:2027,Status:'ACTIVE',ReleasedToTeachers:'Yes'},{Year:2028,Status:'PLANNING',ReleasedToTeachers:'No'}]);
h.seed('YearStructure',[week(2026,'2026-12-28','2026-12-31',1),week(2027,'2027-01-01','2027-01-03',2)]);
yearReads.length=0;
const boundary=h.call('rosterDates',{dates:['2026-12-31','2027-01-01','2028-01-03']},'teacher');
assert.deepEqual(yearReads,[2026,2027]);assert.equal(boundary.dates[0].parity,'odd');assert.equal(boundary.dates[1].parity,'even');assert.deepEqual(boundary.dates[2],{date:'2028-01-03',code:'YEAR_UNAVAILABLE'});
assert.throws(()=>h.call('rosterDate',{date:'2028-01-03'},'teacher'),error=>error.code==='YEAR_UNAVAILABLE');
h.seed('Years',[{Year:2026,Status:'ARCHIVED',ReleasedToTeachers:'Yes'}]);
assert.equal(h.call('rosterDates',{dates:[keys[0]]},'teacher').dates[0].code,'YEAR_UNAVAILABLE');

function calendarPost(changes={}){const body={action:'rosterDates',payload:{dates:[keys[0]]},actor:h.actor('teacher'),proxySecret:'synthetic-secret',...changes};return JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify(body)}}).text);}
assert.equal(calendarPost().ok,true);
assert.equal(calendarPost({proxySecret:'wrong'}).ok,false);
assert.equal(calendarPost({actor:{...h.actor('teacher'),email:'teacher@outside.test'}}).ok,false);
assert.equal(calendarPost({actor:{...h.actor('teacher'),sub:''}}).ok,false);
assert.equal(calendarPost({service:'gsis-roster-notifier-v1'}).ok,true,'Private service can read a bounded date batch');
assert.equal(calendarPost({action:'rosterDate',payload:{date:keys[0]},service:'gsis-roster-notifier-v1'}).code,'YEAR_UNAVAILABLE');
assert.equal(h.audit.writes,beforeWrites);assert.equal(h.audit.calendarCalls.length,0);

const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster-test/exec',BRIDGE_SECRET:'s'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-test/exec',CALENDAR_PROXY_SECRET:'synthetic-secret'},who={email:'teacher@gsps.edu.sg',subject:'teacher'};
const input={operation:'saveAbsence',date:keys[0],from:keys[0],to:keys.at(-1),revision:4,requestId:crypto.randomUUID(),calendarByDate:{[keys[0]]:{date:keys[0],schoolDay:false,parity:'odd'}}};
const oldFetch=globalThis.fetch,oldTimeout=AbortSignal.timeout,oldInfo=console.info;
let calls=[];
try{
 h.seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'}]);h.seed('YearStructure',weeks);
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url));assert.equal(String(url),env.CALENDAR_APPS_SCRIPT_URL);
  const body=JSON.parse(options.body);assert.equal(body.action,'rosterDates');assert.deepEqual(body.payload.dates,keys);assert.equal(body.actor.email,who.email);assert.equal(body.service,undefined);
  return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);
 };
 const trusted=await gateway.trustedOperationsInput(input,env,who);
 assert.equal(calls.length,1);assert.equal(Object.keys(trusted.calendarByDate).length,62);assert.equal(trusted.calendarByDate[keys[0]].schoolDay,true);assert.equal(trusted.calendarByDate[keys[0]].available,true);assert.equal(trusted.requestId,input.requestId);assert.equal(trusted.revision,4);
 // Round trip through the authenticated Worker and actual Calendar HTTP
 // boundary: one Calendar request, then one signed Deploy request.
 const origin='https://roster.test',issued=Date.now(),session=await gateway.sign({purpose:'gsis-session-v1',origin,...who,issued,expires:issued+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin),cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
 let endToEndDeadlines=[];AbortSignal.timeout=ms=>{endToEndDeadlines.push(ms);return oldTimeout(ms);};calls=[];console.info=()=>{};
 globalThis.fetch=async(url,options)=>{
  calls.push(String(url));
  if(String(url)===env.CALENDAR_APPS_SCRIPT_URL)return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);
  assert.equal(String(url),env.APPS_SCRIPT_URL);const envelope=JSON.parse(options.body),command=JSON.parse(envelope.payload);
  assert.equal(envelope.signature,(await gateway.sign(command,env.BRIDGE_SECRET)).signature);assert.equal(command.input.requestId,input.requestId);assert.equal(command.input.revision,input.revision);assert.equal(Object.keys(command.input.calendarByDate).length,62);assert.equal(command.input.calendarByDate[keys[0]].schoolDay,true);
  return Response.json({ok:true,data:{revision:5}});
 };
 const response=await gateway.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env);
 assert.equal(response.status,200);assert.deepEqual(calls,[env.CALENDAR_APPS_SCRIPT_URL,env.APPS_SCRIPT_URL]);assert.deepEqual(endToEndDeadlines,[12000,25000]);AbortSignal.timeout=oldTimeout;
 // Single-date saves keep their fresh read contract. Readonly report views
 // use the bounded, source-certified window and may reuse its signed proof.
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.action,'rosterDate');assert.deepEqual(body.payload,{date:keys[0]});return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);};
 assert.equal((await gateway.trustedOperationsInput({operation:'saveAbsence',date:keys[0]},env,who)).calendarByDate[keys[0]].available,true);
 const reportCalendar={};let windowCalls=0;
 globalThis.fetch=async(url,options)=>{windowCalls++;const body=JSON.parse(options.body);assert.equal(body.action,'rosterWindow');assert.deepEqual(body.payload.dates,keys);return new Response(h.sandbox.doPost({postData:{contents:options.body}}).text);};
 assert.equal((await gateway.trustedOperationsInput({operation:'read',date:keys[0],view:'report'},env,who,reportCalendar)).calendarByDate[keys[0]].available,true);assert.equal(windowCalls,1);assert.equal(Object.keys(reportCalendar.calendarByDate).length,62);assert(reportCalendar.calendarCache);assert(Number.isFinite(reportCalendar.calendarCheckedAt));
 const reused={};assert.equal((await gateway.trustedOperationsInput({operation:'read',date:keys[0],view:'report',calendarCache:reportCalendar.calendarCache},env,who,reused)).calendarByDate[keys[0]].available,true);assert.equal(windowCalls,1,'verified report window avoids another Calendar request');assert.equal(reused.calendarCheckedAt,reportCalendar.calendarCheckedAt,'read reuse does not extend source freshness');

 const valid=keys.map(date=>({date,schoolDay:true,parity:'odd'}));
 for(const values of [valid.slice(1),valid.map((row,n)=>n===0?valid[1]:row),valid.map((row,n)=>n===0?{...row,date:'2099-01-01'}:row),valid.map((row,n)=>n===0?{...row,schoolDay:'yes'}:row),null]){
  calls=[];globalThis.fetch=async url=>{calls.push(String(url));return Response.json({ok:true,result:{dates:values}});};
  const result=await gateway.trustedOperationsInput(input,env,who);assert.equal(calls.length,1);assert.equal(Object.values(result.calendarByDate).every(value=>value.available===false),true,'Malformed batch response cannot grant dated authority');
 }
 globalThis.fetch=async()=>Response.json({ok:true,result:{dates:valid.map((row,n)=>n===0?{date:row.date,code:'YEAR_UNAVAILABLE'}:row)}});
 const partial=await gateway.trustedOperationsInput(input,env,who);assert.equal(partial.calendarByDate[keys[0]].available,false);assert.equal(partial.calendarByDate[keys[1]].available,true);

 // Abort the single batch immediately in the fixture. Its real deadline stays
 // 12 seconds for all 62 dates, with no fallback to 62 individual requests.
 let deadlines=[];AbortSignal.timeout=ms=>{deadlines.push(ms);const controller=new AbortController();queueMicrotask(()=>controller.abort());return controller.signal;};
 calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));return new Promise((resolve,reject)=>{const abort=()=>reject(Object.assign(Error('timeout'),{name:'TimeoutError'}));if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});};
 const timed=await gateway.trustedOperationsInput(input,env,who);assert.deepEqual(deadlines,[12000]);assert.equal(calls.length,1);assert(Object.values(timed.calendarByDate).every(value=>value.available===false));
 console.log('PASS Roster Calendar batch:62 date contexts, single/date equivalence, one read per year, release/auth/service guards, validated responses and one12s deadline. No live requests or writes.');
}finally{globalThis.fetch=oldFetch;AbortSignal.timeout=oldTimeout;console.info=oldInfo;}
