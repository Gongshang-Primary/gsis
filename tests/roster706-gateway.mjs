import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const origin='https://roster.test',date='2026-10-16',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'b'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40),WHATSAPP_ENABLED:'false'};
const now=Date.now(),signed=await M.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:now,expires:now+60000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
let calls=[],calendarActions=[],forwarded,user={staffId:'teacher',smc:true,admin:true};
globalThis.fetch=async(url,options)=>{
 calls.push(String(url));const envelope=JSON.parse(options.body);
 if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){calendarActions.push(envelope.action);if(envelope.action==='rosterWindow'){const dates=envelope.payload.dates;assert.equal(dates.length,62);return Response.json({ok:true,result:{schema:1,from:dates[0],to:dates.at(-1),sourceRevision:'a'.repeat(64),sourceCheckedAt:new Date(now).toISOString(),dates:dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});}assert.equal(envelope.action,'rosterDate');return Response.json({ok:true,result:{date:envelope.payload.date,schoolDay:true,parity:'odd'}});}
 assert.equal(String(url),env.APPS_SCRIPT_URL,'no Meta or notification fetch during reads');forwarded=JSON.parse(envelope.payload);
 assert.equal((await M.sign(forwarded,env.BRIDGE_SECRET)).signature,envelope.signature);
 return Response.json({ok:true,data:{revision:4,user,notifications:{configured:false,pending:0}}});
};
async function request(route,input){calls=[];calendarActions=[];forwarded=null;return M.default.fetch(new Request(origin+'/api/'+route,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env,{waitUntil(){throw Error('Read must not dispatch messages');}});}
const info=console.info;console.info=()=>{};
try{
 let response=await request('read',{date,calendar:false});assert.equal(response.status,200);assert.deepEqual(calls,[env.APPS_SCRIPT_URL]);assert.equal((await response.json()).data.calendar,undefined,'immutable baseline read does not claim Calendar verification');
 response=await request('read',{date});assert.equal(calls.length,2);assert.equal((await response.json()).data.calendar.available,true,'default timetable read retains Calendar');
 for(const input of [{operation:'read',view:'notificationReadiness'},{operation:'saveRecessSettings',baseName:'Haze Recess',revision:4,requestId:crypto.randomUUID()}]){
  response=await request('operations',{date,...input,calendarByDate:{[date]:{schoolDay:true,parity:'even'}},calendar:{schoolDay:true},identity:{email:'forged@gsps.edu.sg'},capability:{},service:'forged'});
  assert.equal(response.status,200);assert.deepEqual(calls,[env.APPS_SCRIPT_URL]);assert.deepEqual(forwarded.input.calendarByDate,{});
  for(const field of ['calendar','identity','capability','service'])assert.equal(forwarded.input[field],undefined);
 }
 response=await request('operations',{operation:'read',view:'notificationReadiness',date});let data=(await response.json()).data;assert(data.notifications.readiness);assert.equal(data.notifications.readiness.enabled,false);
 user={staffId:'teacher',smc:false,admin:true};response=await request('operations',{operation:'read',view:'notificationReadiness',date});data=(await response.json()).data;assert.equal(data.notifications.readiness.enabled,false,'Admin can inspect readiness without SMC membership');
 user.admin=false;response=await request('operations',{operation:'read',view:'notificationReadiness',date});data=(await response.json()).data;assert.equal(data.notifications.readiness,undefined,'Ordinary teachers do not receive route details');
 user.smc=true;response=await request('operations',{operation:'read',view:'adhoc',date});assert.equal((await response.json()).data.notifications.readiness,undefined,'readiness is not embedded in unrelated views');
 for(const input of [{operation:'read',view:'report',compact:true},{operation:'availability',complete:true,staffIds:[]},{operation:'saveAbsence',view:'report',compact:true,revision:4,requestId:crypto.randomUUID()}]){
  response=await request('operations',{...input,date,calendar:false,calendarByDate:{[date]:{schoolDay:false}}});assert.equal(response.status,200);assert.equal(calls.length,2);assert.equal(forwarded.input.calendarByDate[date].schoolDay,true,'planning and saves cannot suppress trusted Calendar');assert.deepEqual(calendarActions,[input.operation==='read'&&input.view==='report'?'rosterWindow':'rosterDate'],'only readonly report uses source-certified Calendar windows');
 }
 console.log('PASS v0.7.06 gateway: immutable calendar-free reads; lightweight readiness/settings; verified Admin/SMC readiness decoration; no Meta/send; planning and save Calendar verification preserved.');
}finally{console.info=info;}
