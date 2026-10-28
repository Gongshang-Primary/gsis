import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const origin='https://roster.test',date='2026-10-21',newDate='2026-10-22';
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'b'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)};
const now=Date.now(),signed=await worker.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
let calls=[],forwarded=[],calendarDown=false;
const oldFetch=globalThis.fetch,oldInfo=console.info;
globalThis.fetch=async(url,options)=>{
 calls.push(String(url));const envelope=JSON.parse(options.body);
 if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){
  assert.equal(envelope.actor.email,'teacher@gsps.edu.sg');
  if(calendarDown)return new Response('offline',{status:503});
  if(envelope.action==='rosterWindow')return Response.json({ok:true,result:{schema:1,from:envelope.payload.dates[0],to:envelope.payload.dates.at(-1),sourceRevision:'a'.repeat(64),sourceCheckedAt:new Date().toISOString(),dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});
  return Response.json({ok:true,result:envelope.action==='rosterDates'?{dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}:{date:envelope.payload.date,schoolDay:true,parity:'odd'}});
 }
 const payload=JSON.parse(envelope.payload);forwarded.push(payload);
 assert.equal((await worker.sign(payload,env.BRIDGE_SECRET)).signature,envelope.signature);
 return Response.json({ok:true,data:{revision:3}});
};
console.info=()=>{};
async function request(route,input,headers={}){
 calls=[];forwarded=[];
 return worker.default.fetch(new Request(origin+'/api/'+route,{method:'POST',headers:{Origin:origin,Cookie:cookie,...headers},body:JSON.stringify(input)}),env);
}
try{
 // The combined profile receives signed, current Calendar facts before the backend
 // assembles the report. It cannot accept authority or Calendar from the browser.
 let response=await request('profile',{view:'report',date,preload:true,calendar:false,calendarByDate:{[date]:{available:true,schoolDay:false}},trustedNow:0,identity:{email:'admin@gsps.edu.sg'},service:'forged',capability:{staffId:'other'}});
 assert.equal(response.status,200);assert.equal(calls.length,2);assert.deepEqual(calls,[env.CALENDAR_APPS_SCRIPT_URL,env.APPS_SCRIPT_URL]);
 let input=forwarded[0].input;
 assert.equal(forwarded[0].action,'rosterProfile');assert.equal(input.compact,true);assert.equal(input.operation,undefined);assert.equal(input.calendarByDate[date].schoolDay,true);assert(input.trustedNow>=now);
 for(const field of ['calendar','identity','service','capability'])assert.equal(input[field],undefined);
 assert.match(response.headers.get('Server-Timing'),/calendar;dur=\d+, backend;dur=\d+/);
 calendarDown=true;response=await request('profile',{view:'report',date,calendarByDate:{[date]:{available:true,schoolDay:true}}});assert.equal(forwarded[0].input.calendarByDate[date].available,false);calendarDown=false;
 assert.equal((await request('profile',{view:'report',date:'invalid'})).status,400);assert.equal(calls.length,0);
 assert.equal((await request('profile',{view:'report',date},{Cookie:''})).status,401);assert.equal(calls.length,0);
 assert.equal((await request('profile',{view:'report',date},{Origin:'https://evil.test'})).status,403);assert.equal(calls.length,0);
 await request('profile',{date});assert.deepEqual(calls,[env.APPS_SCRIPT_URL],'ordinary Home profile stays lightweight');
 for(const operation of ['allocationVersion','teacherDailyUpdate']){await request('operations',{operation,date,...(operation==='allocationVersion'?{statusOnly:true}:{})});assert.deepEqual(calls,[env.APPS_SCRIPT_URL],operation+' status reads saved data without Calendar');assert.deepEqual(forwarded[0].input.calendarByDate,{});}

 response=await request('operations',{operation:'allocationVersion',date});assert.deepEqual(calls,[env.CALENDAR_APPS_SCRIPT_URL,env.APPS_SCRIPT_URL]);const calendarCache=(await response.json()).data.calendarCache;assert.ok(calendarCache);
 response=await request('operations',{operation:'allocationVersion',date,calendarCache});assert.deepEqual(calls,[env.APPS_SCRIPT_URL],'verified local Calendar avoids a repeated upstream request');assert.equal(forwarded[0].input.calendarByDate[date].available,true);

 // Receipt checks carry the exact original command for backend digest/actor checks,
 // but cannot initiate Calendar reads or elevate identity through that command.
 const command={operation:'saveAbsence',date,requestId:crypto.randomUUID(),revision:2};
 response=await request('operations',{operation:'receiptStatus',command,calendarByDate:{[date]:{available:true,schoolDay:true}}});
 assert.equal(response.status,200);assert.deepEqual(calls,[env.APPS_SCRIPT_URL]);assert.deepEqual(forwarded[0].input.command,command);assert.deepEqual(forwarded[0].input.calendarByDate,{});
 const largeCommand={operation:'saveStapler',date,requestId:crypto.randomUUID(),plan:{fixture:'x'.repeat(300000)}};
 assert.equal((await request('operations',{operation:'receiptStatus',command:largeCommand})).status,200);
 const mergedCommand={...largeCommand,plan:{fixture:'x'.repeat(1600000)},basePlan:{fixture:'y'.repeat(1600000)}};
 assert.equal((await request('operations',{operation:'receiptStatus',command:mergedCommand})).status,200,'cell merge receipt carries both individually bounded plans');
 assert.equal((await request('operations',{operation:'receiptStatus',command:{...largeCommand,basePlan:{fixture:'x'.repeat(1900001)}}})).status,413);assert.equal(calls.length,0);
 assert.equal((await request('operations',{operation:'receiptStatus',command:{...largeCommand,operation:'saveAbsence'}})).status,413);assert.equal(calls.length,0);
 assert.equal((await request('operations',{operation:'receiptStatus',command:{...largeCommand,plan:{fixture:'x'.repeat(2100000)}}})).status,413);assert.equal(calls.length,0);

 // Moving a plan verifies both dates. Record-only rename/delete avoid Calendar;
 // Restore verifies its original date against the current school calendar.
 await request('operations',{operation:'moveStapler',date,newDate,confirm:true});
 assert.equal(calls.length,2);assert.deepEqual(Object.keys(forwarded[0].input.calendarByDate),[date,newDate]);
 assert.equal((await request('operations',{operation:'moveStapler',date,newDate:'bad'})).status,400);assert.equal(calls.length,0);
 assert.equal((await request('operations',{operation:'moveStapler',date})).status,400);assert.equal(calls.length,0);
 for(const operation of ['renameStapler','deleteStapler']){await request('operations',{operation,date,view:'staplerDates'});assert.deepEqual(calls,[env.APPS_SCRIPT_URL]);assert.deepEqual(forwarded[0].input.calendarByDate,{});}
 await request('operations',{operation:'restoreStapler',date,archiveId:'archive',confirm:true});assert.equal(calls.length,2);assert.deepEqual(Object.keys(forwarded[0].input.calendarByDate),[date]);
 console.log('PASS 718 gateway: one combined profile/report, trusted Calendar, source/destination move dates, record-only lifecycle, receipt query and signed payload size gates. No live latency measured.');
}finally{globalThis.fetch=oldFetch;console.info=oldInfo;}
