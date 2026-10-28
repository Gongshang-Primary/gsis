import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js')).toString('base64')));
let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Current duty must not request Calendar');};
for(const input of [{operation:'currentDuty'},{operation:'read',view:'currentDuty'}]){
 const result=await gateway.trustedOperationsInput({...input,date:'forged-date',calendarByDate:{forged:true},trustedNow:0,identity:{email:'forged'},service:'forged'}, {},{email:'teacher@example.edu'});
 assert.deepEqual(result.calendarByDate,{});assert(result.trustedNow>0);assert.equal(result.identity,undefined);assert.equal(result.service,undefined);
}
assert.equal(calls,0);
console.log('PASS current duty operation and view skip Calendar and preserve server authority');
