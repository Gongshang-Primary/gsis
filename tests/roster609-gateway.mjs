import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const mod=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test',env={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy/exec',GSIS_SECRET:'x'.repeat(32),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'calendar-secret'};
const issued=Date.now(),signed=await mod.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher',issued,expires:issued+60000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const request=input=>new Request(origin+'/api/profile',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)});
let calls=[],calendarFailed=false;
globalThis.fetch=async(url,options)=>{
 const p=JSON.parse(options.body);calls.push({url:String(url),p});
 if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){
  assert.equal(p.action,'rosterDate');assert.equal(p.actor.email,'teacher@gsps.edu.sg');assert.equal(p.proxySecret,env.GSIS_SECRET);
  if(calendarFailed)return new Response('service unavailable',{status:503});
  return Response.json({ok:true,result:{date:p.payload.date,schoolDay:true,parity:'odd'}});
 }
 const body=JSON.parse(p.payload);assert.equal(body.action,'rosterProfile');assert.equal(body.identity.email,'teacher@gsps.edu.sg');
 assert.equal((await mod.sign(body,env.GSIS_SECRET)).signature,p.signature);
 return Response.json({ok:true,data:{active:null,selected:{id:'next'},selection:'upcoming',model:{marker:'preloaded'}}});
};
let r=await mod.default.fetch(request({date:'2026-10-14'}),env);
assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal((await r.json()).data.calendar,undefined);
calls=[];r=await mod.default.fetch(request({date:'2026-10-14',preload:true}),env);
let body=await r.json();assert.equal(calls.length,2);assert.equal(body.data.calendar.date,'2026-10-14');assert.equal(body.data.calendar.available,true);assert.equal(body.data.model.marker,'preloaded');assert.equal(body.data.active,null);assert.equal(body.data.selection,'upcoming');
calendarFailed=true;calls=[];r=await mod.default.fetch(request({date:'2026-10-15',preload:true}),env);body=await r.json();
assert.equal(r.status,200);assert.equal(body.data.model.marker,'preloaded');assert.equal(body.data.calendar.available,false);assert.equal(calls.length,2);
console.log('PASS Roster preload gateway: authenticated parallel Calendar context, unchanged profile path, upcoming identity and graceful Calendar failure');
