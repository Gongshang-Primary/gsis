'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=path=>fs.readFileSync(path,'utf8'),legacy='legacy-credential-retained',message='GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.';
function helpers(){
 const values=new Map(),backend=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>values.has(key)?values.get(key):null})}});
 vm.runInContext(read('backend/ApiSecret.gs'),backend);
 const edge=vm.createContext({});vm.runInContext(read('shared/gsis-api-secret.js'),edge);
 const lord=vm.createContext({executionContext_:()=>({gsisSecret:values.has('GSIS_SECRET')?values.get('GSIS_SECRET'):null}),lordSetting_:()=>legacy});
 const src=read('lord-suite/Source/backend/Code.gs');vm.runInContext(src.slice(src.indexOf('function lordGSiSSecret_('),src.indexOf('\nfunction lordConfigurationStatus_',src.indexOf('function lordGSiSSecret_('))),lord);
 return {values,checks:[value=>{values.set('GSIS_SECRET',value);return backend.gsisApiSecret_('BRIDGE_SECRET');},value=>edge.gsisApiSecret({GSIS_SECRET:value,BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),value=>{values.set('GSIS_SECRET',value);return lord.lordGSiSSecret_('LORD_PROXY_SECRET');}],backend,edge,lord};
}
function secretTests(){
 const h=helpers();
 for(const check of h.checks){
  for(const n of [32,33,256,7999,8000]){const value='!aB9'.repeat(Math.ceil(n/4)).slice(0,n);assert.equal(check(value),value,`accept and preserve ${n} characters`);}
  for(const value of ['', 'x'.repeat(31),'x'.repeat(8001),'x'.repeat(31)+' ',' '+'x'.repeat(32),'x'.repeat(32)+'\n','x'.repeat(32)+'\r','x'.repeat(32)+'\t','é'.repeat(32),'x'.repeat(31)+'\u007f','x'.repeat(31)+'\u0000',123,{},[],true])assert.throws(()=>check(value),e=>e.status===503&&e.code==='GSIS_SECRET_INVALID'&&e.message===message,'invalid values fail closed with safe consistent diagnostics');
 }
 for(const value of [null,undefined])assert.throws(()=>h.edge.gsisApiSecret({GSIS_SECRET:value,BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),e=>e.code==='GSIS_SECRET_INVALID');
 h.values.delete('GSIS_SECRET');h.values.set('BRIDGE_SECRET',legacy);assert.equal(h.backend.gsisApiSecret_('BRIDGE_SECRET'),legacy);assert.equal(h.edge.gsisApiSecret({BRIDGE_SECRET:legacy},'BRIDGE_SECRET'),legacy);assert.equal(h.lord.lordGSiSSecret_('LORD_PROXY_SECRET'),legacy);
 console.log('PASS H canonical backend, edge and LORD 32..8000 boundaries, malformed types, strict precedence and absence fallback');
}
async function boot(config,status=200,signedIn=false,options={}){
 const elements=Object.fromEntries(['content','signin'].map(k=>[k,{innerHTML:''}])),calls={load:0,initialize:[],render:[],failures:[],status:[]};
 const google={accounts:{id:{initialize:cfg=>calls.initialize.push(cfg),renderButton:(...args)=>calls.render.push(args)}}};
 const context=vm.createContext({sessionEpoch:0,profile:null,$:id=>elements[id],window:{google},google,setTimeout,fetch:async()=>({ok:status>=200&&status<300,status,json:async()=>{if(options.slowConfig)await new Promise(resolve=>setTimeout(resolve,0));calls.configObservedSession=calls.sessionAttempted;return config;}}),api:async(route,input,method,token)=>{if(method==='POST'){calls.token=token;return;}calls.sessionAttempted=true;if(options.sessionError)throw options.sessionError;if(!signedIn)throw Object.assign(Error('Sign in'),{status:401});},load:async()=>{calls.load++;},status:(...args)=>calls.status.push(args),failure:e=>calls.failures.push(e)});
 const src=read('roster-update/public/roster.js'),start=src.indexOf(' async function start(){');vm.runInContext(src.slice(start,src.indexOf("\n $('refresh').onclick",start)),context);await context.start();return {calls,elements,context};
}
async function bootTests(){
 const diagnostics={ok:false,error:'Shared API configuration needs attention.',code:'GSIS_SECRET_INVALID',diagnosticId:'abcdef12-3456',backendVersion:'0.9.8h',failureStage:'configuration',operation:'config'};
 for(const signedIn of [true,false])for(const http of [200,503]){const {calls}=await boot(diagnostics,http,signedIn);assert.equal(calls.failures.length,1);const e=calls.failures[0];assert.equal(e.message,diagnostics.error);assert.equal(e.status,http);for(const key of ['code','diagnosticId','backendVersion','failureStage','operation'])assert.equal(e[key],diagnostics[key]);assert.equal(calls.load,0);assert.equal(calls.initialize.length,0);}
 const http=await boot({clientId:'school',error:'Service temporarily unavailable.',code:'CONFIG_UNAVAILABLE'},502);assert.equal(http.calls.failures[0].message,'Service temporarily unavailable.');assert.equal(http.calls.failures[0].code,'CONFIG_UNAVAILABLE');
 const sessionError=Object.assign(Error('Session transport unavailable.'),{status:503,code:'SESSION_UNAVAILABLE'});
 for(const configStatus of [200,503]){const race=await boot(diagnostics,configStatus,false,{slowConfig:true,sessionError});assert.equal(race.calls.failures[0].code,'GSIS_SECRET_INVALID','slower config error has deterministic priority over faster session failure');assert.equal(race.calls.failures[0].message,diagnostics.error);assert.equal(race.calls.failures[0].status,configStatus);assert.equal(race.calls.configObservedSession,true,'config and session requests start in parallel');}
 const httpRace=await boot({error:'Config HTTP failure.',code:'CONFIG_UNAVAILABLE'},502,false,{slowConfig:true,sessionError});assert.equal(httpRace.calls.failures[0].code,'CONFIG_UNAVAILABLE');assert.equal(httpRace.calls.failures[0].message,'Config HTTP failure.');
 const sessionFailure=await boot({clientId:'school'},200,false,{slowConfig:true,sessionError});assert.equal(sessionFailure.calls.failures[0],sessionError,'session error survives when configuration is valid');assert.equal(sessionFailure.calls.load,0);assert.equal(sessionFailure.calls.initialize.length,0);
 const slowSignedOut=await boot({clientId:'school'},200,false,{slowConfig:true});assert.equal(slowSignedOut.calls.failures.length,0);assert.equal(slowSignedOut.calls.initialize.length,1,'normal 401 remains signed-out boot');
 const missing=await boot({});assert.equal(missing.calls.failures[0].message,'School sign-in is not configured.');
 const signed=await boot({clientId:'school'},200,true);assert.equal(signed.calls.load,1);assert.equal(signed.calls.initialize.length,0);
 const out=await boot({clientId:'school'},200,false);assert.equal(out.calls.failures.length,0);assert.equal(out.calls.initialize[0].client_id,'school');assert.equal(out.calls.initialize[0].hd,'gsps.edu.sg');assert.equal(out.calls.render.length,1);await out.calls.initialize[0].callback({credential:'verified-google-credential'});assert.equal(out.calls.token,'verified-google-credential');assert.equal(out.calls.load,1);
 const safe=await boot({...diagnostics,code:'unsafe code',diagnosticId:'private/path',backendVersion:'private/value',failureStage:'private/value',operation:'private/value'},503);for(const key of ['code','diagnosticId','backendVersion','failureStage','operation'])assert.equal(safe.calls.failures[0][key],'');
 console.log('PASS H config HTTP/envelope diagnostics survive signed-in/out startup, safe reference validation and unchanged Google login flow');
}
async function transportTests(){
 const crypto=require('node:crypto'),helper=read('shared/gsis-api-secret.js');
 // Load the real service transport against its canonical helper before release sync.
 const code=read('shared/backend-service.js').replace(/\/\* GSIS_API_SECRET_BEGIN \*\/[\s\S]*?\/\* GSIS_API_SECRET_END \*\//,()=>helper).replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const transport=vm.createContext({crypto:crypto.webcrypto,TextEncoder,Request,Response,URL});vm.runInContext(code,transport);
 for(const n of [33,8000]){
  const secret='s'.repeat(n),env={GSIS_SECRET:secret,GSIS_BACKEND_SECRET:legacy,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg'},now=Date.now(),base={schema:1,purpose:'roster',origin:env.ROSTER_PUBLIC_ORIGIN,issuedAt:now,nonce:crypto.randomUUID(),identity:{email:'teacher@gsps.edu.sg',subject:'verified-google-subject',expiresAt:now+300000}};
  const request=(command,key=secret,route='roster')=>{const payload=JSON.stringify(command),signature=crypto.createHmac('sha256',key).update(payload).digest('hex');return new Request('https://backend.internal/v1/'+route,{method:'POST',body:JSON.stringify({payload,signature})});};
  assert.equal((await transport.verifyBackendEnvelope(request(base),env)).identity.subject,base.identity.subject);
  await assert.rejects(transport.verifyBackendEnvelope(request(base,legacy),env),e=>e.code==='GSIS_BACKEND_SIGNATURE');
  for(const patch of [{issuedAt:now-61000},{issuedAt:now+61000},{nonce:'bad'},{purpose:'deploy'}])await assert.rejects(transport.verifyBackendEnvelope(request({...base,...patch}),env),e=>e.code==='GSIS_BACKEND_EXPIRED');
  await assert.rejects(transport.verifyBackendEnvelope(request({...base,origin:'https://other.gsps.edu.sg'}),env),e=>e.code==='GSIS_BACKEND_ORIGIN');
  await assert.rejects(transport.verifyBackendEnvelope(request({...base,identity:{...base.identity,email:'outside@example.test'}}),env),e=>e.code==='GSIS_BACKEND_IDENTITY');
  const badService={...base,purpose:'roster-service'};await assert.rejects(transport.verifyBackendEnvelope(request(badService,secret,'roster-service'),env),e=>e.code==='GSIS_BACKEND_IDENTITY');
  env.GSIS_BACKEND={fetch:async req=>{const body=await req.clone().json();assert.equal(body.signature,crypto.createHmac('sha256',secret).update(body.payload).digest('hex'));await transport.verifyBackendEnvelope(req,env);return Response.json({ok:true,value:{verified:true}});}};
  const result=await transport.callOperationalBackend(env,'roster',{identity:base.identity,action:'read',input:{}});assert.equal(result.verified,true);
 }
 console.log('PASS H real private transport accepts 33/8000 HMAC credentials and retains signature, replay-window, purpose, origin and school identity checks');
}
(async()=>{if(!process.argv.includes('--boot-only')){secretTests();await transportTests();}await bootTests();})().catch(error=>{console.error(error);process.exitCode=1;});
