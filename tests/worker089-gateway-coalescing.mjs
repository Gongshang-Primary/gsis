import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env={GOOGLE_CLIENT_ID:'client',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'x'.repeat(64)};
const origin='https://suite.test';
for (const [file,route,method] of [['contacts-update/public/_worker.js','bootstrap','GET'],['public/_worker.js','sync','POST']]) {
 const module=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(await readFile(file)).toString('base64')));
 const issued=Date.now(),value={purpose:'gsis-session-v1',origin,email:'teacher@gsps.edu.sg',subject:'teacher-1',issued,expires:issued+3600000};
 const session=await module.sign(value,env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin);
 const cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
 let calls=0, release;
 const gate=new Promise(r=>{release=r;});
 globalThis.fetch=async()=>{calls++;await gate;return Response.json({ok:true,data:{rows:[{id:'one'}]}});};
 const requests=Array.from({length:30},()=>module.default.fetch(new Request(origin+'/api/'+route,{method,headers:{Origin:origin,Cookie:cookie},...(method==='POST'?{body:'{}'}:{})}),env));
 for(let i=0;i<100&&calls===0;i++)await new Promise(r=>setTimeout(r,1));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(calls,1,file+' shares identical authenticated origin reads');release();
 const responses=await Promise.all(requests);assert.ok(responses.every(r=>r.status===200));
 const bodies=await Promise.all(responses.map(r=>r.json()));
 assert.equal(new Set(bodies.map(x=>x.gatewayTiming.diagnosticId)).size,30,'each caller has its own diagnostic reference');
 assert.equal(bodies.filter(x=>x.gatewayTiming.coalesced).length,29);
 const denied=await module.default.fetch(new Request(origin+'/api/'+route,{method,headers:{Origin:origin},...(method==='POST'?{body:'{}'}:{})}),env);
 assert.equal(denied.status,401);assert.equal(calls,1,'no unauthenticated sharing');
 console.log('PASS '+file+': 30 authenticated concurrent reads, one upstream call; independent diagnostics and auth denial');
}
