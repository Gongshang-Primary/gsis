import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const require=createRequire(import.meta.url),{makeHarness}=require('./calendar/backend_harness.cjs'),h=makeHarness();
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const origin='https://roster.test',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/absence-year-roster/exec',BRIDGE_SECRET:'synthetic-bridge-secret-'.repeat(3),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/absence-year-calendar/exec',CALENDAR_PROXY_SECRET:'synthetic-secret'},who={email:'teacher@gsps.edu.sg',subject:'synthetic-teacher'};
const issued=Date.now(),session=await gateway.sign({purpose:'gsis-session-v1',origin,...who,issued,expires:issued+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin),cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
const days=(from,to)=>Array.from({length:(Date.parse(to)-Date.parse(from))/86400000+1},(_,n)=>new Date(Date.parse(from)+n*86400000).toISOString().slice(0,10));
const yearly={operation:'saveAbsence',date:'2028-01-01',from:'2028-01-01',to:'2028-12-31',staffId:'alice',staffIds:['alice','bob'],typeId:'parental',periods:[2,3],reliefRequired:true,revision:7,requestId:crypto.randomUUID(),instructionsByStaffDate:{alice:{'2028-01-03':{'lesson-a':'Use the shared workbook.'}},bob:{'2028-01-03':{'lesson-b':'Complete pages 1–3.'}}}};
const released=year=>({Year:year,Status:'ACTIVE',ReleasedToTeachers:'Yes'}),baseYears=[released(2026),released(2027),released(2028),released(2029)];
h.seed('Years',baseYears);h.seed('Events',[]);h.seed('YearStructure',[{StructureID:'2028-week',Year:2028,Kind:'TERM_WEEK',Term:'1',Week:'1',StartDate:'2028-01-03',EndDate:'2028-01-09'}]);
const oldFetch=globalThis.fetch,oldInfo=console.info,oldError=console.error,readYear=h.sandbox.rc18YearData_;
let calls=[],yearReads=[],responseTransform=null,backendCommands=[];
h.sandbox.rc18YearData_=(year,names)=>{yearReads.push(year);return readYear(year,names);};
const reset=()=>{calls=[];yearReads=[];backendCommands=[];responseTransform=null;h.seed('Years',baseYears);};
const post=input=>gateway.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env);
const calendarCalls=()=>calls.filter(c=>c.kind==='calendar'),backendCalls=()=>calls.filter(c=>c.kind==='backend');
try{
 console.info=console.error=()=>{};
 globalThis.fetch=async(url,options)=>{
  if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){
   const body=JSON.parse(options.body),dates=body.action==='rosterDates'?body.payload.dates:[body.payload.date];
   assert(['rosterDate','rosterDates'].includes(body.action));assert(dates.length<=62);assert.equal(body.actor.email,who.email);assert.equal(body.proxySecret,env.CALENDAR_PROXY_SECRET);
   calls.push({kind:'calendar',dates,bytes:Buffer.byteLength(options.body)});
   let result=JSON.parse(h.sandbox.doPost({postData:{contents:options.body}}).text);if(responseTransform)result=responseTransform(result,body);
   return Response.json(result);
  }
  assert.equal(String(url),env.APPS_SCRIPT_URL,'fixture forbids live or unexpected endpoints');
  const envelope=JSON.parse(options.body),command=JSON.parse(envelope.payload);assert.equal(envelope.signature,(await gateway.sign(command,env.BRIDGE_SECRET)).signature);assert.equal(command.action,'rosterOperations');assert.equal(command.identity.email,who.email);
  calls.push({kind:'backend',bytes:Buffer.byteLength(options.body),characters:options.body.length});backendCommands.push(command);
  return Response.json({ok:true,data:{revision:8,savedIds:['synthetic-accepted-batch'],requestId:command.input.requestId}});
 };

 // Real Calendar HTTP authentication/release and date-context code, followed by
 // one signed backend command. The fixture does not split the durable mutation.
 reset();let response=await post(yearly);assert.equal(response.status,200);assert.equal((await response.json()).ok,true);assert.deepEqual(calendarCalls().map(c=>c.dates.length),[62,62,62,62,62,56]);assert.equal(backendCalls().length,1);assert.deepEqual(yearReads,Array(6).fill(2028));
 const full=backendCommands[0].input,keys=days(yearly.from,yearly.to);assert.equal(keys.length,366);assert(keys.includes('2028-02-29'));assert.deepEqual(Object.keys(full.calendarByDate).sort(),keys);assert.equal(full.calendarByDate['2028-02-01'].schoolDay,null,'released year without a defined term week is distinct from unavailable year');assert.equal(full.calendarByDate['2028-02-01'].available,true);assert.equal(full.calendarByDate['2028-01-03'].schoolDay,true);assert.deepEqual(full.staffIds,yearly.staffIds);assert.deepEqual(full.instructionsByStaffDate,yearly.instructionsByStaffDate);assert.equal(full.requestId,yearly.requestId);assert.equal(full.revision,yearly.revision);
 const baselineMetrics={days:keys.length,calendarRequests:calendarCalls().length,yearReads:yearReads.length,backendRequests:backendCalls().length,browserBytes:Buffer.byteLength(JSON.stringify(yearly)),calendarRequestBytes:calendarCalls().reduce((n,c)=>n+c.bytes,0),signedEnvelopeBytes:backendCalls()[0].bytes,signedEnvelopeCharacters:backendCalls()[0].characters};assert(baselineMetrics.signedEnvelopeCharacters<600000);

 // Ordinary years, changed instructions, and existing short ranges keep the
 // same bounded bridge; two released Calendar years may share one absence.
 for(const [operation,from,to,length] of [['saveAbsence','2027-01-01','2027-12-31',365],['saveInstructions','2028-01-01','2028-12-31',366],['saveAbsence','2027-12-30','2028-01-03',5],['saveAbsence','2027-09-01','2028-08-31',366]]){
  reset();const input={...yearly,operation,date:from,from,to};response=await post(input);assert.equal(response.status,200,operation+' '+from+' '+to);assert.equal(backendCalls().length,1);assert.equal(Object.keys(backendCommands[0].input.calendarByDate).length,length);assert.equal(calendarCalls().length,Math.ceil(length/62));
 }
 reset();h.seed('Years',[released(2027),{Year:2028,Status:'PLANNING',ReleasedToTeachers:'No'}]);const short=await gateway.trustedOperationsInput({...yearly,date:'2027-12-31',from:'2027-12-31',to:'2028-01-01'},env,who);assert.equal(short.calendarByDate['2027-12-31'].available,true);assert.equal(short.calendarByDate['2028-01-01'].available,false,'short absence retains existing missing-calendar fallback');

 // The view date does not enlarge the selected range or require publication
 // of that unrelated year. It is fetched once for projection context only.
 reset();h.seed('Years',[released(2028)]);response=await post({...yearly,date:'2026-10-14'});assert.equal(response.status,200);assert.equal(backendCalls().length,1);assert.equal(Object.keys(backendCommands[0].input.calendarByDate).length,367);assert.equal(backendCommands[0].input.calendarByDate['2026-10-14'].available,false);assert.equal(gateway.operationDates({...yearly,date:'2026-10-14'},true).length,366);

 // Reject oversized contiguous/sparse selections before any external read.
 for(const input of [{...yearly,to:'2029-01-01'},{...yearly,from:undefined,to:undefined,dates:['2028-01-01','2029-01-01']},{...yearly,from:undefined,to:undefined,dates:days('2028-01-01','2029-01-01')},{operation:'saveRecess',from:'2028-01-01',to:'2028-03-03'},{operation:'read',date:'2028-01-01',from:'2028-01-01',to:'2028-03-03',view:'report'}]){
  reset();response=await post(input);assert.equal(response.status,400);assert.match((await response.json()).error,/62|366/);assert.equal(calls.length,0);
 }
 assert.equal(gateway.operationDates({operation:'saveRecess',from:'2028-01-01',to:'2028-03-02'}).length,62,'unrelated operation bounds stay unchanged');

 // Missing, archived, unreleased and duplicate year configuration all stop the
 // long command before backend dispatch, even with forged browser authority.
 for(const rows of [[],[{Year:2028,Status:'ACTIVE',ReleasedToTeachers:'No'}],[{Year:2028,Status:'ARCHIVED',ReleasedToTeachers:'Yes'}],[released(2028),released(2028)]]){
  reset();h.seed('Years',rows);response=await post({...yearly,calendarByDate:Object.fromEntries(keys.map(date=>[date,{date,schoolDay:true,parity:'odd',available:true}]))});assert.equal(response.status,400);assert.match((await response.json()).error,/Calendar year is not released/);assert.equal(backendCalls().length,0);assert.equal(calendarCalls().length,6);
 }
 reset();h.seed('Years',[released(2027)]);response=await post({...yearly,date:'2027-09-01',from:'2027-09-01',to:'2028-08-31'});assert.equal(response.status,400);assert.equal(backendCalls().length,0,'unreleased second year cannot partially commit the first');

 // A missing/duplicated/unrequested date or malformed daily authority makes
 // the entire long save fail. No per-day fallback requests are attempted.
 for(const transform of [rows=>rows.slice(1),rows=>rows.map((r,i)=>i===0?rows[1]:r),rows=>rows.map((r,i)=>i===0?{...r,date:'2099-01-01'}:r),rows=>rows.map((r,i)=>i===0?{...r,schoolDay:'yes'}:r)]){
  reset();responseTransform=result=>({...result,result:{dates:transform(result.result.dates)}});response=await post(yearly);assert.equal(response.status,400);assert.equal(backendCalls().length,0);assert.equal(calendarCalls().length,6);
 }
 reset();response=await post({...yearly,calendarByDate:{'2028-01-03':{date:'2028-01-03',schoolDay:false,parity:'even',available:true}}});assert.equal(response.status,200);assert.equal(backendCommands[0].input.calendarByDate['2028-01-03'].schoolDay,true);assert.equal(backendCommands[0].input.calendarByDate['2028-01-03'].parity,'odd','Calendar result overwrites forged browser fields');

 // Retain existing transport limits. The large accepted fixture uses sparse
 // multi-teacher instruction dictionaries instead of duplicating every date.
 reset();const padded={...yearly,staffId:'staff-0',staffIds:Array.from({length:10},(_,i)=>'staff-'+i),reasonDetail:'家'.repeat(200),instructionsByStaffDate:Object.fromEntries(Array.from({length:10},(_,i)=>['staff-'+i,{'2028-01-03':Object.fromEntries([2,3,4].map(p=>['lesson-'+i+'-'+p,'Follow the prepared workbook and shared slides. '.repeat(110)]))}]))};const fixed=Buffer.byteLength(JSON.stringify(padded));assert(fixed<262144);response=await post(padded);assert.equal(response.status,200);assert.equal(backendCalls().length,1);assert(backendCalls()[0].characters<600000);const largeMetrics={browserBytes:fixed,signedEnvelopeBytes:backendCalls()[0].bytes,signedEnvelopeCharacters:backendCalls()[0].characters};
 // This exact byte-boundary probe exercises transport only, not field-domain
 // validation (the real backend separately bounds individual remarks/notes).
 reset();const empty={...yearly,remarks:''},boundary={...empty,remarks:'x'.repeat(262144-Buffer.byteLength(JSON.stringify(empty)))};assert.equal(Buffer.byteLength(JSON.stringify(boundary)),262144);response=await post(boundary);assert.equal(response.status,200);assert.equal(backendCalls().length,1);assert(backendCalls()[0].characters<600000);
 reset();const over={...boundary,remarks:boundary.remarks+'x'};assert.equal(Buffer.byteLength(JSON.stringify(over)),262145);response=await post(over);assert.equal(response.status,413);assert.equal(calls.length,0,'browser request bound rejects before Calendar or backend');
 assert.equal(h.audit.writes,0);assert.equal(h.audit.calendarCalls.length,0);
 console.log('PASS absence year Worker/Calendar transport: '+JSON.stringify({leapYear:baselineMetrics,sparseInstructions:largeMetrics})+'; cross-year release checks, malformed/spoofed context, view-date separation and unchanged unrelated/body limits; no live requests or writes.');
}finally{globalThis.fetch=oldFetch;console.info=oldInfo;console.error=oldError;h.sandbox.rc18YearData_=readYear;}
