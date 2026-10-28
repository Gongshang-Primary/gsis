import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync(process.env.ROSTER_GATEWAY_SOURCE||'roster-update/public/_worker.js','utf8');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test',date='2026-10-15',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'b'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)};
const now=Date.now(),signed=await M.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
let calls=[],forwarded=[],revision=1,calendarDown=false;
globalThis.fetch=async(url,options)=>{
 calls.push(String(url));const envelope=JSON.parse(options.body);
 if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){
  assert.equal(envelope.actor.email,'teacher@gsps.edu.sg');
  if(calendarDown)return new Response('offline',{status:503});
  if(envelope.action==='rosterWindow')return Response.json({ok:true,result:{schema:1,from:envelope.payload.dates[0],to:envelope.payload.dates.at(-1),sourceRevision:'a'.repeat(64),sourceCheckedAt:new Date().toISOString(),dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});
  return Response.json({ok:true,result:envelope.action==='rosterDates'?{dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}:{date:envelope.payload.date,schoolDay:true,parity:'odd'}});
 }
 const payload=JSON.parse(envelope.payload);forwarded.push(payload);
 assert.equal((await M.sign(payload,env.BRIDGE_SECRET)).signature,envelope.signature);
 assert.equal(payload.identity.email,'teacher@gsps.edu.sg');
 return Response.json({ok:true,data:{revision}});
};
async function request(route,input,headers={}){
 calls=[];forwarded=[];
 return M.default.fetch(new Request(origin+'/api/'+route,{method:'POST',headers:{Origin:origin,Cookie:cookie,...headers},body:JSON.stringify(input)}),env);
}
const oldInfo=console.info;console.info=()=>{};
try{
 // Names metadata opens the timetable selector without a Calendar round trip.
 let response=await request('read',{date,view:'names',calendar:false});
 assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0],env.APPS_SCRIPT_URL);
 assert.equal((await response.json()).data.calendar,undefined);
 assert.equal(forwarded[0].action,'rosterRead');assert.equal(forwarded[0].input.view,'names');
 assert.equal((await request('read',{date,view:'names'},{Cookie:''})).status,401);assert.equal(calls.length,0);
 assert.equal((await request('read',{date,view:'names'},{Origin:'https://evil.test'})).status,403);assert.equal(calls.length,0);

 // Immutable timetable models can skip Calendar. Operational planning and saves
 // still replace client claims with trusted date verification.
 response=await request('read',{date,calendar:false});
 assert.equal(calls.length,1);assert.equal((await response.json()).data.calendar,undefined);
 const lighter=[{operation:'read',view:'mine'},{operation:'read',view:'prune'},{operation:'read',view:'duties'},{operation:'audit'},{operation:'accounting'},{operation:'history'},{operation:'acknowledge'}];
 for(const input of lighter){
  response=await request('operations',{...input,date,calendarByDate:{[date]:{available:true,schoolDay:false}},calendar:{schoolDay:false},identity:{email:'admin@gsps.edu.sg'},capability:{staffId:'victim'},service:'forged',trustedNow:0});
  assert.equal(response.status,200);assert.equal(calls.length,1,JSON.stringify(input));
  const value=forwarded[0].input;assert.deepEqual(value.calendarByDate,{});assert(value.trustedNow>=now);
  for(const key of ['calendar','identity','capability','service'])assert.equal(value[key],undefined);
 }
 for(const view of ['report','adhoc','types','allocation']){
  response=await request('operations',{operation:'read',view,date,calendar:false});
  assert.equal(response.status,200);assert.equal(calls.length,2,view);assert.equal(forwarded[0].input.calendarByDate[date].available,true);
 }
 // Mutable records are read again on every call, and no result crosses requests.
 response=await request('operations',{operation:'read',view:'mine',date});assert.equal((await response.json()).data.revision,1);
 revision=2;response=await request('operations',{operation:'read',view:'mine',date});assert.equal((await response.json()).data.revision,2);assert.equal(calls.length,1);

 // Dated saves still verify each date, replace client Calendar claims, and retain
 // the caller's revision/request ID so backend concurrency checks remain intact.
 const requestId=crypto.randomUUID();
 response=await request('operations',{operation:'saveAbsence',date,from:date,to:'2026-10-17',revision:4,requestId,calendar:false,calendarByDate:{[date]:{schoolDay:false}}});
 assert.equal(response.status,200);assert.equal(calls.length,2);assert.deepEqual(Object.keys(forwarded[0].input.calendarByDate).sort(),[date,'2026-10-16','2026-10-17']);
 assert.equal(forwarded[0].input.calendarByDate[date].schoolDay,true);assert.equal(forwarded[0].input.revision,4);assert.equal(forwarded[0].input.requestId,requestId);
 calendarDown=true;response=await request('operations',{operation:'saveAbsence',date,revision:4,requestId,calendarByDate:{[date]:{available:true,schoolDay:true}}});
 assert.equal(calls.length,2);assert.equal(forwarded[0].input.calendarByDate[date].available,false);
 assert.equal((await request('operations',{operation:'read',view:'mine',date:'bad'})).status,400);assert.equal(calls.length,0);
 console.log('PASS Roster gateway speed: names, mine and prune views use 1 upstream request instead of 2; fresh authority/records, dated planning/saves, trusted Calendar, revision and request ID retained. No live latency measured.');
}finally{console.info=oldInfo;}
