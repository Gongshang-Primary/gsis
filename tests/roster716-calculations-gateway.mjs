import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const original=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error('Unexpected network call');};
try{
 const safe=await worker.trustedOperationsInput({operation:'calculations',identity:{email:'other@gsps.edu.sg'},service:'forged',calendar:{schoolDay:true}}, {}, {email:'plain@gsps.edu.sg'});
 assert.deepEqual(safe.calendarByDate,{});assert.equal(calls,0,'own calculations must not wait for Calendar');assert.equal(safe.identity,undefined);assert.equal(safe.service,undefined);assert.equal(safe.calendar,undefined);assert.equal(safe.operation,'calculations');
 console.log('PASS 716 Calculations gateway: authenticated operation enrichment skips Calendar and removes browser identity/service claims.');
}finally{globalThis.fetch=original;}
