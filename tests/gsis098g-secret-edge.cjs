'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
const root=path.resolve(__dirname,'..'),canonical='aB9!'.repeat(8)+'~',legacy='legacy-separate-transport-credential';

function moduleContext(relative,extra={}){
 const code=fs.readFileSync(path.join(root,relative),'utf8').replace(/^import .*;\n/gm,'').replace(/export default /g,'globalThis.worker = ').replace(/export const /g,'const ').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ').replace(/^export \{[^\n]*\};?$/gm,'');
 const c=vm.createContext({crypto,TextEncoder,TextDecoder,Request,Response,Headers,URL,AbortSignal,AbortController,setTimeout,clearTimeout,atob,btoa,console,...extra});vm.runInContext(code+'\n;globalThis.__sessionKey=typeof sessionKey===\"function\"?sessionKey:undefined;',c);return c;
}
async function run(){
 let captured;
 const deploy=moduleContext('public/_worker.js',{assertRecoveryWritable(){},callOperationalBackend:async()=>undefined,edgeDeployEnabled:()=>false,readGSiSBackendResponse:async r=>r.json(),fetch:async(url,options)=>{captured=JSON.parse(options.body);return Response.json({ok:true,data:{}});}});
 const env={GSIS_SECRET:canonical,BRIDGE_SECRET:legacy,APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
 await deploy.backend(env,'bootstrap',{}, {email:'a@gsps.edu.sg',subject:'a',expiresAt:Date.now()+100000},{started:Date.now(),traceId:'trace',diagnosticId:'diag'});
 const hmac=async(secret,text)=>Buffer.from(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),new TextEncoder().encode(text))).toString('hex');
 assert.equal(captured.signature,await hmac(canonical,captured.payload));assert.notEqual(captured.signature,await hmac(legacy,captured.payload));
 assert.equal(deploy.__sessionKey(env,'https://deploy.gsps.edu.sg'),canonical+'|gsis-browser-session-v1|https://deploy.gsps.edu.sg','migrated Deploy sessions retain purpose/origin binding while using GSIS_SECRET');
 await assert.rejects(deploy.backend({...env,GSIS_SECRET:'bad'},'bootstrap',{}, {},{started:Date.now(),traceId:'trace',diagnosticId:'diag'}),e=>e.code==='GSIS_SECRET_INVALID');
 console.log('PASS G real Deploy transport signs with canonical key with purpose-bound canonical session derivation');

const helper=fs.readFileSync(path.join(root,'shared/gsis-api-secret.js'),'utf8');
const context=vm.createContext({});vm.runInContext(helper,context);
assert.equal(context.gsisApiSecret({GSIS_SECRET:canonical,BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),canonical);
assert.equal(context.gsisApiSecret({BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),legacy);
for(const bad of ['',null,'short',' '.repeat(32),'é'.repeat(32),'x'.repeat(31)+'\n','x'.repeat(8001)])assert.throws(()=>context.gsisApiSecret({GSIS_SECRET:bad,BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),error=>error.code==='GSIS_SECRET_INVALID'&&error.status===503&&!error.message.includes(legacy));
assert.equal(context.gsisApiSecret({},'BRIDGE_SECRET'),undefined);
console.log('PASS G canonical transport credential overrides legacy, validates 32..8000 printableASCII characters and fails closed');


 const notification=moduleContext('notification-worker/index.js',{rosterRecoveryEnvironment:e=>e,assertRecoveryWritable(){}}),sent=[];
 const now=Date.now(),input={purpose:'gsis-notification-wake-v1',timestamp:now,nonce:crypto.randomUUID()},payload=JSON.stringify(input),request=secret=>new Request('https://notify.gsps.edu.sg/dispatch',{method:'POST',body:JSON.stringify({payload,signature:require('node:crypto').createHmac('sha256',secret).update(payload).digest('hex')})});
 const notifyEnv={GSIS_SECRET:canonical,ROSTER_SERVICE_SECRET:legacy,NOTIFICATION_QUEUE:{send:async v=>sent.push(v)}};
 assert.equal((await notification.worker.fetch(request(canonical),notifyEnv)).status,202);assert.equal(sent.length,1);
 assert.equal((await notification.worker.fetch(request(legacy),notifyEnv)).status,403);assert.equal(sent.length,1);
 const invalid=await notification.worker.fetch(request(legacy),{...notifyEnv,GSIS_SECRET:'bad'});assert.equal(invalid.status,503);assert.equal(sent.length,1);
 console.log('PASS G notification wake accepts canonical signature and rejects stale legacy or invalid configuration');

 const lord=moduleContext('lord-suite/Source/starlord/_worker.js',{fetch:async(url)=>{captured=new URL(url);return Response.json({ok:true,bookings:[]});}});
 const board=await lord.worker.fetch(new Request('https://starlord.gsps.edu.sg/api/board?date=2026-10-27'),{GSIS_SECRET:canonical,LORD_BACKEND_URL:'https://script.google.com/macros/s/test/exec',ASSETS:{}});
 assert.equal(board.status,200);assert.equal(captured.searchParams.get('proxySecret'),canonical);
 console.log('PASS G STARLORD sends canonical key without requiring its legacy proxy credential');

 const transport=moduleContext('shared/backend-service.js'),who={email:'admin@gsps.edu.sg',subject:'admin',expiresAt:Date.now()+60000};
 let verified;
 const serviceEnv={GSIS_SECRET:canonical,GSIS_BACKEND_SECRET:legacy,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',GSIS_BACKEND:{fetch:async request=>{verified=await transport.verifyBackendEnvelope(request,{GSIS_SECRET:canonical,GSIS_BACKEND_SECRET:'not-the-client-legacy-secret',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg'});return Response.json({ok:true,value:{received:true}});}}};
 assert.deepEqual(JSON.parse(JSON.stringify(await transport.callOperationalBackend(serviceEnv,'roster',{action:'rosterRead',input:{},identity:who}))),{received:true});
 assert.equal(verified.identity.email,who.email);assert.equal(verified.purpose,'roster');
 await assert.rejects(transport.callOperationalBackend({...serviceEnv,GSIS_SECRET:'bad'},'roster',{action:'rosterRead',input:{},identity:who}),e=>e.code==='GSIS_SECRET_INVALID');
 console.log('PASS G private Worker binding uses canonical authentication while preserving purpose and verified identity');

 const fence=moduleContext('shared/edge-venues-fence.js');assert.equal(await fence.beginEdgeVenuesChange({GSIS_SECRET:canonical},{source:'roster',requestId:'request-identity'}),null);
 console.log('PASS G global credential alone does not activate optional Venues source integration');

 for(const file of ['public/_worker.js','contacts-update/public/_worker.js','layout-update/public/_worker.js','roster-update/public/_worker.js']){
  const c=moduleContext(file,{rosterRecoveryEnvironment:e=>e,assertRecoveryWritable(){}});
  const response=await c.worker.fetch(new Request('https://app.gsps.edu.sg/api/config'),{GSIS_SECRET:'bad'});
  assert.equal(response.status,503,file);assert.equal((await response.json()).code,'GSIS_SECRET_INVALID',file);
  const logout=await c.worker.fetch(new Request('https://app.gsps.edu.sg/api/logout',{method:'POST',headers:{Origin:'https://app.gsps.edu.sg'}}),{GSIS_SECRET:'bad',BRIDGE_SECRET:legacy,GOOGLE_CLIENT_ID:'school'});
  assert.equal(logout.status,200,file+' logout must remain independent from transport configuration');
 }
 console.log('PASS G API gateways return safe configuration errors for invalid canonical credentials');
 const venues=moduleContext('venues-viewport/public/_worker.js');
 assert.throws(()=>venues.__sessionKey({GSIS_SECRET:canonical},'https://venues.gsps.edu.sg'),/session.*configured/i,'transport configuration alone must never enable a predictable missing-secret cookie key');
 assert.equal(venues.__sessionKey({GSIS_SECRET:canonical,VENUES_PROXY_SECRET:legacy},'https://venues.gsps.edu.sg'),legacy+'|gsis-venues-session-v1|https://venues.gsps.edu.sg');
 console.log('PASS G Venues cookie signing requires its independent session credential');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
