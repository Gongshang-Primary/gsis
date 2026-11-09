import assert from 'node:assert/strict';
import fs from 'node:fs';
import {toWorkerModuleURL} from './helpers/worker-module.cjs';

const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test';
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/archive-test/exec',GSIS_SECRET:'b'.repeat(40)};
const now=Date.now();
const signed=await worker.sign({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'admin',issued:now,expires:now+60000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin);
const cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const fetchBefore=globalThis.fetch;
const forwarded=[];
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),env.APPS_SCRIPT_URL,'archive access needs no Calendar or other remote source');
 const envelope=JSON.parse(options.body),request=JSON.parse(envelope.payload);
 forwarded.push(request);
 return Response.json({ok:true,data:{revision:2,items:[],item:{id:'old'},archive:{months:[]}}});
};
try{
 const archiveRef={month:'2026-08',collection:'outbox',id:'old',digest:'a'.repeat(64)};
 for(const input of [{operation:'archiveColdOutput',requestId:crypto.randomUUID()},{operation:'archiveItems',month:'2026-08',offset:0,limit:50},{operation:'archivedItem',archiveRef}]){
  const response=await worker.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(forwarded.at(-1).input.operation,input.operation);
  assert.deepEqual(forwarded.at(-1).input.calendarByDate,{});
 }
 assert.deepEqual(forwarded.at(-1).input.archiveRef,archiveRef);
 assert.equal(forwarded.length,3);
 console.log('PASS authenticated archive gateway forwards date-free reads and writes without Calendar calls');
}finally{globalThis.fetch=fetchBefore;}
