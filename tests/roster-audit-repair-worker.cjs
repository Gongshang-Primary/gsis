'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{toWorkerModuleURL}=require('./helpers/worker-module.cjs');
globalThis.crypto??=webcrypto;
(async()=>{
 const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))),originalFetch=globalThis.fetch;
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Calendar must not be read for audit repair');};
 try{
  for(const mode of ['dryRun','apply']){
   const input={operation:'repairStaplerAuditIds',mode,date:'2026-11-06',identity:{admin:true},service:'forged',calendar:{forged:true},calendarByDate:{'2026-11-06':{available:true}},trustedNow:1,trustedIntakeAt:'forged'},safe=await worker.trustedOperationsInput(input,{CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture-calendar/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40)}, {email:'fixture-admin@example.test'}, {}, 1793750400000);
   assert.equal(safe.operation,input.operation);assert.equal(safe.mode,mode);assert.deepEqual(safe.calendarByDate,{});assert.equal(safe.trustedNow,1793750400000);for(const key of ['identity','service','calendar','trustedIntakeAt'])assert.equal(safe[key],undefined);
  }
  assert.equal(calls,0,'both modes must bypass Calendar');console.log('PASS date-free audit repair modes preserve command and strip browser authority with zero Calendar calls');
 }finally{globalThis.fetch=originalFetch;}
})().catch(error=>{console.error(error);process.exitCode=1;});
