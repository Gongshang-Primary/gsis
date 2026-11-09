import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const origin='https://roster.test',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',GSIS_SECRET:'b'.repeat(40)};
const now=Date.now(),signed=await gateway.sign({purpose:'gsis-session-v1',origin,email:'test@gsps.edu.sg',subject:'test',issued:now,expires:now+60000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin);
const request=()=>new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:'__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature},body:JSON.stringify({operation:'stapler',date:'2026-10-21'})});
const original={fetch:globalThis.fetch,error:console.error,info:console.info},logs=[];
console.error=value=>logs.push(JSON.parse(value));console.info=()=>{};
try{
 let trace,calls=0;
 globalThis.fetch=async(_,options)=>{calls++;trace=JSON.parse(JSON.parse(options.body).payload).traceId;return Response.json({ok:false,status:503,error:'private plan and staff content',backendVersion:'0.7.17',failureStage:'stapler-unpack'});};
 const response=await gateway.default.fetch(request(),env),body=await response.json();
 assert.equal(response.status,503);assert.equal(calls,1);assert.equal(body.diagnosticId,trace);
 assert.equal(body.backendVersion,'0.7.17');assert.equal(body.failureStage,'stapler-unpack');assert.equal(body.code,'BACKEND_ERROR');
 assert.match(body.error,/Keep the saved date/);assert.match(response.headers.get('Server-Timing'),/backend;dur=/);
 assert.doesNotMatch(JSON.stringify(body),/private plan/);
 globalThis.fetch=async()=>Response.json({ok:false,status:503,error:'secret',backendVersion:'https://private.test',failureStage:'teacher@gsps.edu.sg'});
 const unsafe=await (await gateway.default.fetch(request(),env)).json();assert.equal(unsafe.backendVersion,undefined);assert.equal(unsafe.failureStage,undefined);
 globalThis.fetch=async()=>{throw Object.assign(Error('private upstream data'),{name:'TimeoutError'});};
 const timeout=await (await gateway.default.fetch(request(),env)).json();assert.equal(timeout.code,'UPSTREAM_TIMEOUT');assert.match(timeout.error,/too long/);
 assert.doesNotMatch(JSON.stringify(logs),/private plan|private upstream|teacher@|private.test/);
 // Backend exposes a fixed stage and release only, retaining the innermost failed phase.
 const code=fs.readFileSync('backend/Code.gs','utf8'),roster=fs.readFileSync('backend/Roster.gs','utf8');
 const context=vm.createContext({GSIS_DEPLOY_VERSION:'0.7.17',deployTrace_:{phase:'roster-storage',phases:{}}});
 vm.runInContext(code.slice(code.indexOf('function deployPhase_('),code.indexOf('\nfunction deployFlush_',code.indexOf('function deployPhase_(')))+'\n'+roster.slice(roster.indexOf('function rosterFailureDetail_('),roster.indexOf('\nfunction rosterDiagnosticLog_',roster.indexOf('function rosterFailureDetail_('))),context);
 vm.runInContext("try{deployPhase_('roster.context',()=>deployPhase_('roster.stapler-unpack',()=>{throw Error('secret');}));}catch(e){detail=rosterFailureDetail_(e);}",context);
 assert.equal(context.detail.failureStage,'stapler-unpack');assert.equal(context.detail.backendVersion,'0.7.17');
 context.deployTrace_.phase='stapler-ready';assert.equal(context.rosterFailureDetail_({failurePhase:'roster.quota'}).failureStage,'calculation-source');
 context.deployTrace_.phase='stapler-proof';assert.equal(context.rosterFailureDetail_({failurePhase:'roster.stapler-proof'}).failureStage,'stapler-proof');
 context.deployTrace_.phase='secret';assert.equal(context.rosterFailureDetail_({failurePhase:'private'}).failureStage,'backend');
 console.log('PASS 717 failure diagnostics: safe stage/version, original trace, timeout distinction, no content leak or blind retry.');
}finally{globalThis.fetch=original.fetch;console.error=original.error;console.info=original.info;}
