import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto,createHmac} from 'node:crypto';
import {toWorkerModuleURL} from './helpers/worker-module.cjs';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8')+'\nexport {rosterFailure};';
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const originalError=console.error,originalFetch=globalThis.fetch;
try{
 console.error=()=>{};
 for(const code of ['VENUES_FENCE_PENDING','VENUES_FENCE_UNCONFIRMED','COMMIT_UNCERTAIN']){
  const response=worker.rosterFailure('rosterOperations','a'.repeat(32),{operation:'publish',code});const body=await response.json();assert.equal(response.status,503);assert.equal(body.code,code);assert.match(body.error,/Venues sync needs Admin recovery/);
 }
 const secret='fixture-'.repeat(8),origin='https://roster.test',now=Date.now(),env={GSIS_SECRET:secret,APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
 const payload=JSON.stringify({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'admin',issued:now,expires:now+60000});
 const cookie='__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',secret+'|gsis-browser-session-v1|'+origin).update(payload).digest('hex');
 let admin=false,calls=[];globalThis.fetch=async(_,options)=>{const request=JSON.parse(JSON.parse(options.body).payload);calls.push(request);return Response.json(admin?{ok:true,data:{complete:false,steps:[{step:'venues',state:'refused',code:'COMMIT_UNCERTAIN'}]}}:{ok:false,status:403,error:'Current Admin access is required.'});};
 const request=()=>new Request(origin+'/api/system-health',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify({operation:'recoverVenuesSync',evidence:'Reviewed the stored transaction before recovery',force:true,token:'untrusted-token'})});
 assert.equal((await worker.systemHealthRoute(request(),env)).status,403,'the backend rechecks current Admin authority');admin=true;
 const reply=await worker.systemHealthRoute(request(),env),body=await reply.json();assert.equal(body.data.complete,false);assert.equal(body.data.steps[0].state,'refused');assert.deepEqual(calls.at(-1).input,{operation:'recoverVenuesSync',evidence:'Reviewed the stored transaction before recovery'});
 const count=calls.length;const foreign=new Request(origin+'/api/system-health',{method:'POST',headers:{Origin:'https://foreign.test',Cookie:cookie},body:JSON.stringify({operation:'recoverVenuesSync'})});assert.equal((await worker.systemHealthRoute(foreign,env)).status,403);assert.equal(calls.length,count);
 console.log('PASS Venues gateway: safe causes, current Admin check, refusal results, origin guard and no client-supplied force/token');
}finally{console.error=originalError;globalThis.fetch=originalFetch;}
