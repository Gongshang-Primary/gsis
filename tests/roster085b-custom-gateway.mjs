import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const oldFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('Ongoing custom rule operations must not request Calendar or send WhatsApp');
try{
 for(const input of [{operation:'read',view:'custom'},{operation:'saveCustomInstruction',text:'Directions.'},{operation:'deleteCustomInstruction',id:'rule'},{operation:'setCustomInstructionEnabled',id:'rule',enabled:false}]){
  const value=await gateway.trustedOperationsInput({...input,calendarByDate:{forged:true},identity:{email:'forged'},service:'forged'}, {}, {email:'smc@test.invalid'});
  assert.deepEqual(value.calendarByDate,{});assert.equal(value.operation,input.operation);assert.equal(value.identity,undefined);assert.equal(value.service,undefined);assert.equal(typeof value.trustedNow,'number');
 }
 console.log('PASS ongoing custom rule reads and writes omit Calendar while removing forged context');
}finally{globalThis.fetch=oldFetch;}
