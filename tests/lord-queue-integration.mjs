// Real gateway -> Worker/SQLite -> Apps Script handler -> synthetic Google storage.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac,webcrypto} from 'node:crypto';
import service from '../lord-job-worker/worker.mjs';
globalThis.crypto ||= webcrypto;
const require=createRequire(import.meta.url),{harness}=require('../lord-suite/tests/backend_harness.cjs');
const shared='synthetic-end-to-end-lord-queue-secret';
const h=harness({properties:{GSIS_SECRET:shared,LORD_QUEUE_BACKUP_FOLDER_ID:'private-fixture'}});h.now=Date.now();
h.ctx.Utilities.computeHmacSha256Signature=(value,key)=>Array.from(createHmac('sha256',key).update(value).digest());
const copies=new Map();h.ctx.DriveApp.getFolderById=id=>{assert.equal(id,'private-fixture');return {
 getFilesByName(name){let used=false;return {hasNext:()=>!used&&copies.has(name),next(){used=true;return copies.get(name);}};},
 createFile(name,text){const file={getId:()=>name,getBlob:()=>({getDataAsString:()=>text})};copies.set(name,file);return file;}
};};
const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../lord-job-worker/schema.sql',import.meta.url),'utf8'));
function query(sql,args=[]){return {bind(...v){return query(sql,v);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
const env={GSIS_SECRET:shared,LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/exec',LORD_QUEUE_ENABLED:'true',LORD_QUEUE_DISPATCH:'true',LORD_JOBS_DB:{prepare:s=>query(s)}};
const gateway=(await import('data:text/javascript;base64,'+Buffer.from(readFileSync(new URL('../lord-suite/Source/lord/_worker.js',import.meta.url))).toString('base64'))).default;
const sessionSecret='synthetic-cookie-secret';
const payload=Buffer.from(JSON.stringify({sub:'staff-sub',email:'staff@gsps.edu.sg',identityType:'GSPS',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const Cookie='__Host-lord_session='+payload+'.'+createHmac('sha256',sessionSecret).update(payload).digest('base64url');
let enqueueLost=true;
const pages={...env,LORD_SESSION_SECRET:sessionSecret,LORD_JOBS:{async fetch(request){const response=await service.fetch(request,env);if(enqueueLost){enqueueLost=false;throw Error('D1 accepted; receipt response lost');}return response;}}};
let lost=true,executions=0;
globalThis.fetch=async(url,init)=>{assert.equal(url,env.LORD_BACKEND_URL);const body=JSON.parse(init.body);h.now=Math.max(h.now,Date.now());const result=h.post(body);if(body.mode==='execute'){executions++;if(lost){lost=false;throw Error('Google committed; response lost');}}return Response.json(result);};
const jobId=Date.now()+'-'+crypto.randomUUID();
const submission={kind:'enqueue',jobId,action:'notificationPreferences',payload:{enabled:false,consentConfirmed:false,expectedRevision:'NONE'}};
function enqueueRequest(){return new Request('https://lord.invalid/api/jobs',{method:'POST',headers:{Cookie,Origin:'https://lord.invalid'},body:JSON.stringify(submission)});}
let response=await gateway.fetch(enqueueRequest(),pages);
assert.equal(response.status,503);assert.equal((await response.json()).definite,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM lord_jobs').get().n,1);
response=await gateway.fetch(enqueueRequest(),pages);
assert.equal(response.status,202);assert.equal(db.prepare('SELECT COUNT(*) n FROM lord_jobs').get().n,1);assert.equal(executions,0);
await service.scheduled({},env);assert.equal(db.prepare('SELECT state FROM lord_jobs').get().state,'CHECKING');assert.equal(executions,1);
db.exec('UPDATE lord_jobs SET next_at=0,lease_until=0');await service.scheduled({},env);
response=await gateway.fetch(new Request('https://lord.invalid/api/jobs/'+jobId,{headers:{Cookie}}),pages);
const outcome=await response.json();assert.equal(outcome.result.state,'APPLIED');assert.equal(outcome.result.receipt.jobId,jobId);assert.equal(executions,1);
assert.equal(h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length,2);assert.ok(copies.size>0);
const row=db.prepare('SELECT version,backup_version FROM lord_jobs').get();assert.equal(row.version,row.backup_version);
assert.deepEqual(h.sends,[]);assert.equal(h.sheets.Bookings.data.length,1);assert.deepEqual(h.photos,[]);
console.log('PASS LORD end-to-end: actual signed session gateway, real D1 protocol/backend signatures, committed Google preference, lost-response read-only recovery and verified private backup');
