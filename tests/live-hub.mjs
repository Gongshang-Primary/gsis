import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const source=await readFile(new URL('../live-worker/worker.js',import.meta.url),'utf8');const {DeployLive,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const values=new Map(),sockets=[];const storage={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k),setAlarm:async()=>{},list:async()=>values,transaction:async fn=>fn(storage)};
const hub=new DeployLive({storage,getWebSockets:()=>sockets});
const req=(path,body)=>new Request('https://hub'+path,{method:'POST',body:JSON.stringify(body)});
const data=await (await hub.fetch(req('/ticket',{versionId:'plan',actor:'kp@gsps.edu.sg',origin:'https://deploy.gsps.edu.sg',authUntil:Date.now()+100000}))).json();assert.ok(data.ticket);assert.ok(values.has('ticket:'+data.ticket));
function socket(versionId,privileged=false,until=Date.now()+60000){const sent=[];const ws={sent,closed:false,deserializeAttachment:()=>({versionId,privileged,until}),send:v=>sent.push(JSON.parse(v)),close(){this.closed=true}};sockets.push(ws);return ws}
const plan=socket('plan'),active=socket('active'),expired=socket('plan',false,0);
await hub.fetch(req('/publish',{versionId:'plan'}));assert.equal(plan.sent.length,1);assert.equal(active.sent.length,0);assert.equal(expired.closed,true);assert.deepEqual(Object.keys(plan.sent[0]).sort(),['at','type']);
await hub.fetch(req('/publish',{all:true}));assert.equal(active.sent.length,1);
assert.equal((await worker.fetch(new Request('https://worker/ticket'))).status,404);
const bad=await hub.fetch(new Request('https://hub/connect?ticket='+data.ticket,{headers:{Upgrade:'websocket',Origin:'https://evil.example'}}));assert.equal(bad.status,401);assert.equal(values.has('ticket:'+data.ticket),false);
hub.webSocketMessage(plan);assert.equal(plan.closed,true);
console.log('PASS live tickets, origin guard, single-use consumption, expiry, version isolation, no staff payload, receive-only/public route guards');
