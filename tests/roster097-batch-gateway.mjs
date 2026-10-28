import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const old=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Batch preload must not wait for Calendar');};
try{
 for(const stage of ['baseline','suspended']){
  const input=await M.trustedOperationsInput({operation:'timetableBatch',stage,calendarByDate:{'2026-10-21':{schoolDay:true}},capability:{},identity:{email:'forged'}},{CALENDAR_APPS_SCRIPT_URL:'https://calendar.test/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)},{email:'alice@gsps.edu.sg'});
  assert.equal(calls,0,'schedule preload is independent of Calendar requests');
  assert.deepEqual(input.calendarByDate,{});assert.equal(input.identity,undefined);assert.equal(input.capability,undefined);
 }
 console.log('PASS two-stage timetable preload bypasses Calendar and strips caller authority.');
}finally{globalThis.fetch=old;}
