import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHmac,webcrypto} from 'node:crypto';
import worker,{dispatchPeerMail} from '../roster-update/public/_worker.js';
globalThis.crypto??=webcrypto;
const origin='https://roster.gsps.edu.sg',now=Date.now(),diagnosticId=crypto.randomUUID(),env={GSIS_SECRET:'fixture-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_SERVICE_SECRET:'fixture-service-'.repeat(4)};
env.ROSTER_PUBLIC_ORIGIN=origin;
const payload=JSON.stringify({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'fixture',issued:now,expires:now+3600000}),cookie='__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin).update(payload).digest('hex');
const post=(path,body)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
let reply,requests=[];const saved=globalThis.fetch;
globalThis.fetch=async(url,init)=>{const req=JSON.parse(JSON.parse(init.body).payload);requests.push(req);return Response.json(typeof reply==='function'?reply(req):reply);};
try{
 reply={ok:false,status:503,code:'ABSENCE_PREPARATION_RETRY',diagnosticId,backendVersion:'0.9.8c',failureStage:'operations-read',operation:'timetableBatch',error:'PRIVATE STAFF REPORT'};
 let response=await worker.fetch(post('/api/operations',{operation:'timetableBatch',stage:'baseline'}),env),body=await response.json();
 assert.equal(response.status,503);assert.equal(body.code,reply.code);assert.equal(body.diagnosticId,diagnosticId);assert.equal(body.operation,'timetableBatch');assert.equal(body.failureStage,'operations-read');assert(!JSON.stringify(body).includes('PRIVATE'));
 reply={...reply,code:'BACKEND_UNAVAILABLE',operation:'sendPeerMail',failureStage:'peer-mail-review'};
 await assert.rejects(()=>dispatchPeerMail(env),error=>error.code===reply.code&&error.diagnosticId===diagnosticId&&error.operation==='sendPeerMail'&&error.failureStage==='peer-mail-review'&&!error.message.includes('PRIVATE'));
 // A metadata request routes directly through fresh Google Admin authorization.
 for(const operation of ['peerMailReview','reviewPeerMail']){
  requests=[];reply=req=>({ok:true,data:{operation:req.input.operation,reviewed:operation==='reviewPeerMail',messagesSent:0}});
  response=await worker.fetch(post('/api/system-health',{operation,id:'opaque',expectedToken:'a'.repeat(64),requestId:crypto.randomUUID()}),env);body=await response.json();assert.equal(response.status,200);assert.equal(body.data.operation,operation);assert.equal(requests.length,1);assert.equal(requests[0].action,'rosterOperations');assert.equal(requests[0].identity.email,'admin@gsps.edu.sg');
 }
 reply={ok:false,status:403,error:'Admin access is required.'};response=await worker.fetch(post('/api/system-health',{operation:'peerMailReview'}),env);assert.equal(response.status,403);
 // Summary visibility uses latest authority, never a role in the browser body.
 reply=req=>({ok:true,data:{user:{smc:true,admin:req.input.scope==='mine'},pendingCaptureCount:0,peerReviewCount:0}});
 response=await worker.fetch(post('/api/system-health',{operation:'read',admin:true}),env);body=await response.json();assert.equal(body.data.peerMailReviewAllowed,false);
 const source=readFileSync('backend/Roster.gs','utf8'),start=source.indexOf('function rosterFailureDetail_'),end=source.indexOf('\nfunction rosterDiagnosticLog_',start),scope=vm.createContext({GSIS_DEPLOY_VERSION:'0.9.8c',deployTrace_:{operation:'saveStapler'}});vm.runInContext(source.slice(start,end),scope);
 const detail=scope.rosterFailureDetail_({code:'STAPLER_BASELINE_CONFLICT',failurePhase:'roster.commit'});assert.equal(detail.code,'STAPLER_BASELINE_CONFLICT');assert.equal(detail.operation,'saveStapler');assert.equal(detail.failureStage,'save');assert.equal(scope.rosterFailureDetail_({code:'PRIVATE_STAFF'}).code,undefined);
 console.log('PASS 098c Worker preserves safe backend code/reference/operation/stage and freshly authorizes peer review');
}finally{globalThis.fetch=saved;}
