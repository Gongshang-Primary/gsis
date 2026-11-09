import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';globalThis.crypto??=webcrypto;
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const origin='https://roster.test',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',GSIS_SECRET:'x'.repeat(40),GOOGLE_CLIENT_ID:'client'},now=Date.now();
const signed=await M.sign({purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'sub',issued:now,expires:now+60000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin),cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const logs=[],old=console.error;console.error=x=>logs.push(x);globalThis.fetch=async()=>{throw Error('PRIVATE UPSTREAM NOTE');};
try{for(const operation of ['read','saveAbsence']){
 const r=await M.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify({operation,date:'2026-10-14',remarks:'SECRET MEDICAL DETAILS'})}),env),body=await r.json();
 assert.equal(r.status,503);assert.match(body.diagnosticId,/^[a-f0-9-]{36}$/);assert.match(body.error,operation==='read'?/Retry loading/:/Retry the same save/);
}
for(const line of logs){const x=JSON.parse(line);assert(Number.isFinite(x.totalMs));assert(Number.isFinite(x.calendarMs));assert(!line.includes('SECRET'));assert(!line.includes('PRIVATE'));assert(!line.includes('teacher@'));}
console.log('PASS R13: read/mutation failure recovery distinguished, timings correlated by diagnostic ID, no notes/emails/upstream bodies in logs.');
}finally{console.error=old;}
