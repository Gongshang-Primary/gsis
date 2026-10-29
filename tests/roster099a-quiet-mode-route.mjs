// 0.9.9a quiet mode route: signed-in status, fresh SMC/Admin authority for
// switching, and server-side end after a confirmed publish or WhatsApp send.
import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=roster-quiet-route-fixture.js').toString('base64')));
const who={email:'smc@gsps.edu.sg',subject:'google-smc'};
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',BRIDGE_SECRET:'fixture-bridge-key-'.repeat(4),ROSTER_SERVICE_SECRET:'fixture-service-key-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-client-id'};
function database(){const sql=new DatabaseSync(':memory:');const prepare=query=>{const stmt=(args=[])=>({bind(...next){return stmt(next);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:r.changes}};}});return stmt();};return {sql,prepare,async batch(list){const out=[];for(const item of list)out.push(await item.run());return out;}};}
function cookie(identity=who){const issued=Date.now(),payload=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,email:identity.email,subject:identity.subject,issued,expires:issued+3600000}),signature=createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(payload).digest('hex');return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+signature;}
async function request(settings,path,{method='POST',body,signedIn=true}={}){
 const headers={Origin:env.ROSTER_PUBLIC_ORIGIN,...(signedIn?{Cookie:cookie()}:{}),...(body?{'Content-Type':'application/json'}:{})};
 const response=await M.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),settings);
 return {status:response.status,body:await response.json()};
}
let roles={smc:true,admin:false},backendOps=[];
const replayIds=new Set(),failOnce=new Set();let duringBackend=null;
globalThis.fetch=async(url,init)=>{
 assert.equal(String(url),env.APPS_SCRIPT_URL);
 const envelope=JSON.parse(init.body),payload=JSON.parse(envelope.payload);backendOps.push(payload.input?.operation);
 if(payload.input?.operation==='read')return Response.json({ok:true,data:{user:roles,entries:[]}});
 if(duringBackend&&payload.input?.operation==='notifyDaily'){const hook=duringBackend;duringBackend=null;await hook();}
 if(failOnce.has(payload.input?.requestId)){failOnce.delete(payload.input.requestId);replayIds.add(payload.input.requestId);return Response.json({ok:false,error:'Backend busy'},{status:503});}
 if(replayIds.has(payload.input?.requestId))return Response.json({ok:true,data:{revision:2,date:payload.input?.date,replayed:true}});
 return Response.json({ok:true,data:{revision:2,date:payload.input?.date}});
};
const db=database();
// A hook that runs before the next quiet-state SELECT completes, to simulate a slow D1 read.
let beforeQuietRead=null;
const gated={...db,prepare(sql){const statement=db.prepare(sql);if(!/^SELECT \* FROM gsis_quiet_mode/.test(sql))return statement;const wrap=st=>({...st,bind:(...args)=>wrap(st.bind(...args)),async first(){if(beforeQuietRead){const hook=beforeQuietRead;beforeQuietRead=null;await hook();}return st.first();}});return wrap(statement);}};
const settings={...env,GSIS_JOBS:gated};

assert.equal((await request(settings,'/api/quiet-mode',{method:'GET',signedIn:false})).status,401,'status requires sign-in');
const initial=await request(settings,'/api/quiet-mode',{method:'GET'});
assert.equal(initial.status,200);assert.equal(initial.body.data.active,false);
assert.equal(backendOps.length,0,'reading status never calls Google');

roles={smc:false,admin:false};
const denied=await request(settings,'/api/quiet-mode',{body:{action:'on'}});
assert.equal(denied.status,403,'a teacher cannot switch quiet mode');

roles={smc:true,admin:false};
const on=await request(settings,'/api/quiet-mode',{body:{action:'on'}});
assert.equal(on.status,200);assert.equal(on.body.data.active,true,'an SMC can switch quiet mode on');
assert.equal((await request(settings,'/api/quiet-mode',{body:{action:'maybe'}})).status,400);

backendOps=[];
await M.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/operations',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:cookie()},body:JSON.stringify({operation:'notifyDaily',date:'2026-10-30',view:'allocation',compact:true,requestId:crypto.randomUUID()})}),settings);
const after=await request(settings,'/api/quiet-mode',{method:'GET'});
if(backendOps.includes('notifyDaily')){assert.equal(after.body.data.active,false,'a confirmed WhatsApp send ends quiet mode on the server');assert.equal(after.body.data.endReason,'whatsapp-queued');}
else assert.fail('notifyDaily did not reach the backend fixture: '+JSON.stringify(backendOps));

const sendDaily=requestId=>M.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/operations',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:cookie()},body:JSON.stringify({operation:'notifyDaily',date:'2026-10-30',view:'allocation',compact:true,requestId})}),settings);
const quietActive=async()=>(await request(settings,'/api/quiet-mode',{method:'GET'})).body.data.active;
const pause=()=>new Promise(resolve=>setTimeout(resolve,5));
// A replayed receipt never ends quiet mode: a retry, an old or pre-feature
// request, or a lost-response retry (quiet then lasts until expiry or manual end).
await pause();await request(settings,'/api/quiet-mode',{body:{action:'on'}});
const old=crypto.randomUUID();replayIds.add(old);
await sendDaily(old);assert.equal(await quietActive(),true,'a replayed receipt leaves quiet mode on');
await sendDaily(old);assert.equal(await quietActive(),true,'repeated replays leave it on');
// Concurrent retries of an old request: still nothing ends.
await Promise.all([sendDaily(old),sendDaily(old)]);assert.equal(await quietActive(),true,'concurrent replays leave it on');
// Lost first response (503), then a retry that the backend answers as replayed:
// quiet mode stays on (Codex probe 2 on e0e6066).
const lost=crypto.randomUUID();failOnce.add(lost);
await sendDaily(lost);assert.equal(await quietActive(),true,'a failed first attempt leaves quiet mode on');
await sendDaily(lost);assert.equal(await quietActive(),true,'its replayed retry leaves quiet mode on');
// Work done now ends the session it arrived in.
await sendDaily(crypto.randomUUID());assert.equal(await quietActive(),false,'a new accepted send ends the current session');
// A request that arrives in session A and completes after B started ends neither B
// (A was already ended by hand during the request).
await pause();await request(settings,'/api/quiet-mode',{body:{action:'on'}});
duringBackend=async()=>{await request(settings,'/api/quiet-mode',{body:{action:'off'}});await pause();await request(settings,'/api/quiet-mode',{body:{action:'on'}});};
await sendDaily(crypto.randomUUID());assert.equal(await quietActive(),true,'a request from session A does not end session B');
// A request that arrives with quiet off ends nothing started later.
await request(settings,'/api/quiet-mode',{body:{action:'off'}});
duringBackend=async()=>{await pause();await request(settings,'/api/quiet-mode',{body:{action:'on'}});};
await sendDaily(crypto.randomUUID());assert.equal(await quietActive(),true,'a request from before the session does not end it');
// A session started while this request's quiet read is still in flight was not
// active when the request arrived, so the request must not end it (Codex on bd2513d).
await request(settings,'/api/quiet-mode',{body:{action:'off'}});
await pause();
const slow=sendDaily;let armed=true;
beforeQuietRead=async()=>{if(!armed)return;armed=false;await pause();await request(settings,'/api/quiet-mode',{body:{action:'on'}});};
await slow(crypto.randomUUID());assert.equal(await quietActive(),true,'a session started during the quiet read is not ended');
await request(settings,'/api/quiet-mode',{body:{action:'off'}});

await request(settings,'/api/quiet-mode',{body:{action:'on'}});
const off=await request(settings,'/api/quiet-mode',{body:{action:'off'}});
assert.equal(off.body.data.active,false);assert.equal(off.body.data.endReason,'manual');
console.log('PASS 0.9.9a quiet mode route: sign-in, SMC/Admin authority, server-side end after send');
