import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={BRIDGE_SECRET:'b'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)},who={email:'smc@gsps.edu.sg',subject:'smc'},date='2026-10-26',now=Date.parse(date+'T00:00:00Z');
let checkedTime=now,calls=[],revision='a'.repeat(64),malformed=false;
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);calls.push(body);assert.equal(body.actor.email,who.email);
 if(body.action!=='rosterWindow')return Response.json({ok:true,result:{date,schoolDay:true,parity:'odd'}});
 const dates=body.payload.dates;return Response.json({ok:true,result:{schema:1,from:dates[0],to:dates.at(-1),sourceCheckedAt:new Date(checkedTime).toISOString(),checkedAt:new Date(now).toISOString(),sourceRevision:revision,...(body.payload.knownRevision===revision?{unchanged:true}:{dates:dates.map((day,i)=>({date:malformed&&i===1?dates[0]:day,schoolDay:true,parity:'odd'}))})}});
};
assert.equal(typeof worker.cachedCalendarWindow,'function');
const first=await worker.cachedCalendarWindow(env,[date],who,null,now);assert.equal(calls.length,1);assert.equal(calls[0].payload.dates.length,62);assert.equal(first.calendarByDate[date].sourceRevision,revision);assert.ok(first.calendarCache);
const warm=await worker.cachedCalendarWindow(env,[date],who,first.calendarCache,now+1000);assert.equal(calls.length,1,'valid local Calendar needs no API request');assert.deepEqual(warm.calendarByDate,first.calendarByDate);
checkedTime=now+300001;const checked=await worker.cachedCalendarWindow(env,[date],who,first.calendarCache,now+300001);assert.equal(calls.length,2);assert.equal(calls.at(-1).payload.knownRevision,revision);assert.ok(checked.calendarCache);
revision='b'.repeat(64);checkedTime=now+600002;const changed=await worker.cachedCalendarWindow(env,[date],who,checked.calendarCache,now+600002);assert.equal(changed.calendarByDate[date].sourceRevision,revision);
checkedTime=now;for(const proof of [{...first.calendarCache,payload:first.calendarCache.payload.replace('odd','even')},{...first.calendarCache,signature:'0'.repeat(64)}]){
 const n=calls.length;await worker.cachedCalendarWindow(env,[date],who,proof,now);assert.equal(calls.length,n+1);assert.equal(calls.at(-1).payload.knownRevision,undefined);
}
const n=calls.length;await worker.cachedCalendarWindow({...env,BRIDGE_SECRET:'z'.repeat(40)},[date],who,first.calendarCache,now);assert.equal(calls.length,n+1,'secret rotation invalidates old proof');
malformed=true;const invalid=await worker.cachedCalendarWindow(env,[date],who,null,now);assert.equal(invalid.calendarCache,undefined);assert.equal(invalid.calendarByDate[date].available,false);malformed=false;
const mutation=await worker.trustedOperationsInput({operation:'saveAbsence',date,calendarCache:first.calendarCache},env,who);assert.equal(calls.at(-1).action,'rosterDate');assert.equal(mutation.calendarCache,undefined,'client proof never enters mutation/receipt semantics');
const output={};await worker.trustedOperationsInput({operation:'allocationVersion',date,calendarCache:first.calendarCache},env,who,output,now);assert.ok(output.calendarCache);
for(const view of ['report','entry']){const n=calls.length,out={};const trusted=await worker.trustedOperationsInput({operation:'read',view,date,calendarCache:first.calendarCache},env,who,out,now+1000);assert.equal(calls.length,n,'report reads reuse verified Calendar');assert.equal(out.calendarCheckedAt,now);assert.equal(Object.keys(out.calendarByDate).length,62);assert.equal(trusted.calendarByDate[date].available,true);}
{const n=calls.length;await worker.trustedOperationsInput({operation:'read',view:'reportForm',date},env,who,{},now);assert.equal(calls.length,n,'form metadata never calls Calendar');}
const count=calls.length;await worker.trustedOperationsInput({operation:'allocationVersion',date,statusOnly:true,calendarCache:first.calendarCache},env,who,{},now);assert.equal(calls.length,count,'status-only polling skips Calendar');
const originalFetch=globalThis.fetch;
for(const sourceCheckedAt of [undefined,new Date(now-86400000).toISOString(),new Date(now+86400000).toISOString()]){
 globalThis.fetch=async()=>Response.json({ok:true,result:{schema:1,from:date,to:'2026-12-26',sourceRevision:'a'.repeat(64),unchanged:true,sourceCheckedAt}});
 const stale=await worker.cachedCalendarWindow(env,[date],who,first.calendarCache,now+300001);assert.equal(stale.calendarByDate[date].available,false,'conditional reply cannot certify an expired source check');assert.equal(stale.calendarCache,undefined);
}
globalThis.fetch=async(url,options)=>{const response=await originalFetch(url,options),value=await response.json();value.result.cacheable=false;return Response.json(value);};
const pending=await worker.cachedCalendarWindow(env,[date],who,null,now);assert.equal(pending.calendarByDate[date].available,true);assert.equal(pending.calendarCache,undefined,'uncertain source permits only a live read');
console.log('PASS signed Calendar local reuse, conditional revision, changed source, tamper/rotation rejection, malformed fail-closed, fresh mutations and status-only probe');
