import assert from 'node:assert/strict';
import roster,{sign as rosterSign,rosterBackend,systemHealthRoute} from '../roster-update/public/_worker.js';
import deploy from '../public/_worker.js';
import {verifyBackendEnvelope,forwardOperationalRequest} from '../shared/backend-service.js';

const rosterOrigin='https://roster.gsps.edu.sg',deployOrigin='https://deploy.gsps.edu.sg',source='https://script.google.com/macros/s/source/exec';
const common={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:source,BRIDGE_SECRET:'browser-secret'.repeat(4),ROSTER_PUBLIC_ORIGIN:rosterOrigin,DEPLOY_PUBLIC_ORIGIN:deployOrigin,GSIS_BACKEND_REQUIRED:'true',GSIS_BACKEND_SECRET:'private-secret'.repeat(4),ROSTER_EDGE_AUTHORITY:'d1'};
const email='teacher@gsps.edu.sg';
async function cookie(origin){const now=Date.now(),signed=await rosterSign({purpose:'gsis-session-v1',origin,email,subject:'verified',issued:now,expires:now+86400000},common.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);return '__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;}
const cookies={[rosterOrigin]:await cookie(rosterOrigin),[deployOrigin]:await cookie(deployOrigin)},calls=[];
const binding={async fetch(request){const command=await verifyBackendEnvelope(request,common);calls.push(command);
 if(command.purpose.endsWith('-http'))return new Response('inner-handler-response',{status:207,headers:{'Content-Type':'text/plain'}});
 let value;
 if(command.purpose==='roster-calendar')value=Object.fromEntries(command.dates.map(date=>[date,{date,schoolDay:true,available:true}]));
 else if(command.purpose==='roster-transport')value=command.operation==='ready'?{ready:true}:null;
 else if(command.purpose==='roster')value={result:{ok:true,data:{saved:true}},backendMs:1};
 else if(command.purpose==='health')value={ok:true,data:{checkedAt:Date.now()}};
 else value={ok:true,data:{saved:true,user:{roles:[]}}};
 return Response.json({ok:true,value});
}};
const env={...common,GSIS_BACKEND:binding,ASSETS:{async fetch(){return new Response('<svg/>',{headers:{'Content-Type':'image/svg+xml'}});}}};
const post=(origin,path,input={},extra={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,Cookie:cookies[origin],...extra},body:JSON.stringify(input)});
const googleCalls=[],oldFetch=globalThis.fetch;globalThis.fetch=async(url,init)=>{
 assert.equal(String(url),source,'only the configured Google Roster backend may be contacted');const envelope=JSON.parse(init.body),request=JSON.parse(envelope.payload);
 assert.equal(envelope.signature,(await rosterSign(request,common.BRIDGE_SECRET)).signature);googleCalls.push(request);return Response.json({ok:true,data:{saved:true}});
};
try{
 for(const [path,action,input] of [['/api/profile','rosterProfile',{}],['/api/read','rosterRead',{view:'names',calendar:false}],['/api/upload','rosterUpload',{}],['/api/update','rosterUpdate',{}],['/api/operations','rosterOperations',{operation:'read',date:'2026-10-27'}]]){
  const response=await roster.fetch(post(rosterOrigin,path,input),env,{});assert.equal(response.status,200,path);const forwarded=googleCalls.at(-1);assert.equal(forwarded.action,action);assert.equal(forwarded.identity.email,email);assert.equal(calls.length,0,'recovery Pages cannot delegate through stale private bindings');
 }
 const migration=await roster.fetch(post(rosterOrigin,'/api/edge/migration',{operation:'status'}),env,{});assert.equal(migration.status,404);assert.equal((await migration.json()).code,'RECOVERY_MIGRATION_DISABLED');
 const before=calls.length,googleBefore=googleCalls.length;
 assert.equal((await roster.fetch(post(rosterOrigin,'/api/operations',{operation:'read'},{Origin:'https://evil.test'}),env,{})).status,403);
 assert.equal((await roster.fetch(new Request(rosterOrigin+'/api/read',{method:'POST',headers:{Origin:rosterOrigin},body:'{}'}),env,{})).status,401);
 assert.equal(calls.length,before,'rejected browser identity and origin never reach private service');assert.equal(googleCalls.length,googleBefore,'rejected requests never reach Google');
 const health=await roster.fetch(post(rosterOrigin,'/api/system-health',{operation:'read',identity:{email:'admin@gsps.edu.sg',service:true}}),env,{});assert.equal(health.status,403);assert.match((await health.json()).error,/SMC or Admin/);assert.equal(calls.length,before);
 // Existing private-service helpers still support the separate operations
 // service; only the deployed Roster entry selects the recovery profile.
 const identity={email,subject:'verified',expiresAt:Date.now()+3600000};
 for(const action of ['rosterProfile','rosterRead','rosterUpload','rosterUpdate','rosterOperations','edgeMigration']){const result=await rosterBackend(env,action,{},identity,crypto.randomUUID());assert.equal(result.result.ok,true);assert.equal(calls.at(-1).action,action);assert.equal(calls.at(-1).identity.email,email);assert.equal(calls.at(-1).origin,rosterOrigin);}
 const directHealth=await systemHealthRoute(post(rosterOrigin,'/api/system-health',{operation:'read',identity:{email:'admin@gsps.edu.sg',service:true}}),env);assert.equal(directHealth.status,200);assert.equal(calls.at(-1).identity.email,email);assert.equal(calls.at(-1).identity.service,undefined);
 const deployRoutes={'/api/edge/admin':'deployEdgeAdmin','/api/acknowledgeNotices':'acknowledgeNotices','/api/auditPage':'auditPage','/api/versionNote':'versionNote','/api/delta':'delta','/api/receipt':'receipt','/api/roleTruthTable':'roleTruthTable','/api/saveRoleTruthTable':'saveRoleTruthTable','/api/landmark/catalog':'publicCampus','/api/landmark/unit':'landmarkUnit','/api/landmark/search':'landmarkSearch','/api/publishReview':'publishReview','/api/bootstrap':'bootstrap','/api/sync':'sync','/api/lease':'lease','/api/change':'change','/api/active':'active','/api/layout-reference':'access','/api/campus-map':'access'};
 for(const [path,action] of Object.entries(deployRoutes)){const response=await deploy.fetch(post(deployOrigin,path,{}),env,{});assert.equal(response.status,200,path);const forwarded=calls.at(-1);assert.equal(forwarded.action,action,path);assert.equal(forwarded.identity.email,email);assert.equal(forwarded.origin,deployOrigin);}
 const relief=await deploy.fetch(new Request(deployOrigin+'/api/relief',{headers:{Cookie:cookies[deployOrigin]}}),env,{});assert.equal(relief.status,200);assert.equal(calls.at(-1).action,'relief');
 for(const [gateway,origin,path,method] of [[deploy,deployOrigin,'/api/venues-source','POST'],[deploy,deployOrigin,'/api/lord-source','POST'],[deploy,deployOrigin,'/api/edge/service','POST']]){
  const req=method==='POST'?post(origin,path,{payload:'inner-signed-request',signature:'unchanged'}):new Request(origin+path,{method,headers:{Cookie:cookies[origin],Origin:origin}}),response=await gateway.fetch(req,env,{});assert.equal(response.status,207,path);assert.equal(await response.text(),'inner-handler-response');assert.equal(calls.at(-1).request.url,origin+path);assert.equal(calls.at(-1).request.headers.Cookie,cookies[origin]);
 }
 for(const [path,method,status] of [['/api/venues-source','POST',503],['/api/whatsapp/media/wamid.123?waId=12345678','GET',503],['/api/whatsapp/reports/2026-10-26','HEAD',404]]){
  const request=()=>method==='POST'?post(rosterOrigin,path,{payload:'inner-signed-request',signature:'unchanged'}):new Request(rosterOrigin+path,{method,headers:{Cookie:cookies[rosterOrigin],Origin:rosterOrigin}});
  const beforePrivate=calls.length,response=await roster.fetch(request(),env,{});assert.equal(response.status,status,path+' is handled within the recovery boundary');assert.equal(calls.length,beforePrivate,'recovery source/media routes cannot delegate');
  const direct=await forwardOperationalRequest(request(),env,'roster');assert.equal(direct.status,207,'the private relay helper remains available to its explicit callers');assert.equal(calls.at(-1).request.url,rosterOrigin+path);assert.equal(calls.at(-1).request.headers.Cookie,cookies[rosterOrigin]);
 }
 const googleBeforeUncertain=googleCalls.length;
 const unavailable={...env,GSIS_BACKEND:{async fetch(){throw Error('response lost');}}};
 const oldError=console.error;console.error=()=>{};
 try{const response=await deploy.fetch(post(deployOrigin,'/api/change',{requestId:'retain-original-id'}),unavailable,{});assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'GSIS_BACKEND_UNCONFIRMED');assert.match(body.error,/Keep this save/);}finally{console.error=oldError;}assert.equal(googleCalls.length,googleBeforeUncertain,'an ambiguous private Deploy response never falls back to Google');
 const paused={...env,GSIS_RECOVERY_MODE:'true'},count=calls.length;assert.equal((await roster.fetch(post(rosterOrigin,'/api/operations',{operation:'saveAbsence'}),paused,{})).status,503);assert.equal(calls.length,count);assert.equal((await roster.fetch(post(rosterOrigin,'/api/system-health',{operation:'read'}),paused,{})).status,503);assert.equal((await systemHealthRoute(post(rosterOrigin,'/api/system-health',{operation:'read'}),paused)).status,200,'explicit private health helper remains readable during pause');
}finally{globalThis.fetch=oldFetch;}
console.log('PASS recovery Roster entry uses Google and pauses migration/health while Deploy and explicit private helpers preserve authentication, relay and no-fallback contracts');
