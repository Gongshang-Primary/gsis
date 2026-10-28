import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');let isolate=0;
const moduleFor=()=>import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+'\n// fixture isolate '+isolate+++'\n//# sourceURL=roster-worker-route-fixture.js').toString('base64')));
const M=await moduleFor(),day='2026-10-26',who={email:'alice@gsps.edu.sg',subject:'google-alice'},bob={email:'bob@gsps.edu.sg',subject:'google-bob'};
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',BRIDGE_SECRET:'fixture-bridge-key-'.repeat(4),ROSTER_SERVICE_SECRET:'fixture-service-key-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-client-id'};
const command=(extra={})=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date:day,staffId:'alice',typeId:'mc',fullDay:true,...extra});
function database(){const sql=new DatabaseSync(':memory:');return {sql,prepare(query){const stmt=(args=[])=>({bind(...next){return stmt(next);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:result.changes}};}});return stmt();}};}
const setup=()=>{const db=database();return {db,settings:{...env,GSIS_JOBS:db}};};
function cookie(identity=who,settings=env){const issued=Date.now(),payload=JSON.stringify({purpose:'gsis-session-v1',origin:settings.ROSTER_PUBLIC_ORIGIN,email:identity.email,subject:identity.subject,issued,expires:issued+3600000}),signature=createHmac('sha256',settings.BRIDGE_SECRET+'|gsis-browser-session-v1|'+settings.ROSTER_PUBLIC_ORIGIN).update(payload).digest('hex');return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+signature;}
async function call(module,settings,input,{identity=who,headers={},context}={}){const response=await module.default.fetch(new Request(settings.ROSTER_PUBLIC_ORIGIN+'/api/operations',{method:'POST',headers:{Origin:settings.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:cookie(identity,settings),...headers},body:JSON.stringify(input)}),settings,context);return {response,body:await response.json()};}
function signedRequest(init,settings=env){const envelope=JSON.parse(init.body);assert.equal(createHmac('sha256',settings.BRIDGE_SECRET).update(envelope.payload).digest('hex'),envelope.signature);return JSON.parse(envelope.payload);}
const receipt=(input,extra={})=>({accepted:true,intakeReceipt:true,receiptOnly:true,requestId:input.requestId,acceptedAt:new Date().toISOString(),intakeState:'pending',savedIds:[],...extra});
const row=(db,id)=>db.sql.prepare('SELECT * FROM gsis_absence_transport WHERE request_id=?').get(id);
await test('authenticated absence API returns durable 202 without Calendar or Apps Script; forged identity fields cannot change its owner',async()=>{
 const {db,settings}=setup(),p=command({trustedIntakeAt:'2000-01-01T00:00:00.000Z',reportedAt:'2000-01-01',identity:bob,service:'forged',admin:true,calendarByDate:{[day]:{schoolDay:true}}});let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No remote dependency may run before capture');};
 const result=await call(M,settings,p);assert.equal(result.response.status,202);assert.equal(result.body.ok,true);assert.equal(result.body.data.accepted,true);assert.equal(result.body.data.transportState,'queued');assert.equal(result.body.data.absenceApplied,false);assert.deepEqual(result.body.data.savedIds,[]);assert.equal(calls,0);
 const saved=row(db,p.requestId),stored=JSON.parse(saved.command);assert.equal(saved.actor,who.email);assert.deepEqual(JSON.parse(saved.identity),who);for(const key of ['trustedIntakeAt','reportedAt','identity','service','admin','calendarByDate'])assert.equal(stored[key],undefined);
 assert.equal(result.response.headers.get('Cache-Control'),'no-store');
});
await test('browser closure and a new Worker isolate still deliver the original command and trusted durable capture timestamp',async()=>{
 const {db,settings}=setup(),p=command({trustedIntakeAt:'2000-01-01T00:00:00.000Z'});globalThis.fetch=async()=>assert.fail('closed browser must not own delivery');
 const first=await call(M,settings,p);const acceptedAt=first.body.data.acceptedAt,N=await moduleFor();let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),settings.APPS_SCRIPT_URL);const req=signedRequest(init,settings);assert.equal(req.action,'rosterOperations');assert.deepEqual(req.identity,who);assert.equal(req.input.requestId,p.requestId);assert.equal(req.input.trustedIntakeAt,acceptedAt);assert.notEqual(req.input.trustedIntakeAt,p.trustedIntakeAt);assert.equal(req.input.intake,true);assert.equal(req.input.fullDay,true);assert.equal(req.input.calendarByDate,undefined);return Response.json({ok:true,data:receipt(req.input,{acceptedAt})});};
 const forwarded=await N.forwardAbsenceTransport(settings,{limit:1});assert.equal(forwarded.forwarded,1);assert.equal(calls,1);assert.equal(row(db,p.requestId).state,'forwarded');assert.equal(JSON.parse(row(db,p.requestId).command).trustedIntakeAt,undefined);
});
await test('own received-report recovery remains readable while Apps Script is unavailable, with no school-wide privilege from browser flags',async()=>{
 const {settings}=setup(),a=command(),b=command({staffId:'bob'});await call(M,settings,a);await call(M,settings,b,{identity:bob});
 globalThis.fetch=async()=>{throw Error('Apps Script unavailable');};
 const mine=await call(M,settings,{operation:'read',view:'intake',scope:'mine',all:true,user:{smc:true,admin:true}});assert.equal(mine.response.status,200);assert.equal(mine.body.data.entries.length,1);assert.equal(mine.body.data.entries[0].requestId,a.requestId);assert.equal(mine.body.data.processingStatusUnavailable,true);
 const school=await call(M,settings,{operation:'read',view:'intake',scope:'school',all:true,smc:true,admin:true});assert.equal(school.response.status,503);assert.equal(school.body.data,undefined);assert.equal(JSON.stringify(school.body).includes(b.requestId),false);
});
await test('school-wide recovery requires fresh SMC authority and explicit backend access denial is respected even for own reports',async()=>{
 const {settings}=setup(),a=command(),b=command({staffId:'bob'});await call(M,settings,a);await call(M,settings,b,{identity:bob});
 globalThis.fetch=async()=>Response.json({ok:true,data:{entries:[],user:{smc:false,admin:false}}});let response=await call(M,settings,{operation:'read',view:'intake',scope:'school',all:true,user:{smc:true}});assert.equal(response.response.status,200);assert.equal(response.body.data.entries.length,1);assert.equal(response.body.data.entries[0].requestId,a.requestId);
 globalThis.fetch=async()=>Response.json({ok:true,data:{entries:[],user:{smc:true,admin:false}}});response=await call(M,settings,{operation:'read',view:'intake',scope:'school'});assert.equal(response.response.status,200);assert.equal(response.body.data.entries.length,2);
 globalThis.fetch=async()=>Response.json({ok:false,status:403,error:'Current Roster access is required.'});response=await call(M,settings,{operation:'read',view:'intake',scope:'mine'});assert.equal(response.response.status,403);assert.equal(response.body.data,undefined);
});
await test('same capture command replays safely, a changed command receives 409 and missing or tampered school sessions cannot capture',async()=>{
 const {db,settings}=setup(),p=command();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected backend call');};const first=await call(M,settings,p),replay=await call(M,settings,p);assert.equal(replay.response.status,202);assert.equal(first.body.data.acceptedAt,replay.body.data.acceptedAt);
 const conflict=await call(M,settings,{...p,typeId:'sick'});assert.equal(conflict.response.status,409);assert.equal(conflict.body.code,'ABSENCE_CAPTURE_CONFLICT');assert.equal(row(db,p.requestId).state,'queued');assert.equal(JSON.parse(row(db,p.requestId).command).typeId,'mc');
 const missing=await call(M,settings,command(),{headers:{Cookie:''}});assert.equal(missing.response.status,401);const forged=await call(M,settings,command(),{headers:{Cookie:cookie(bob,settings).slice(0,-1)+'x'}});assert.equal(forged.response.status,401);
 const origin=await call(M,settings,command(),{headers:{Origin:'https://evil.test'}});assert.equal(origin.response.status,403);assert.equal(calls,0);assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_absence_transport').get().n,1);
});
await test('direct Apps Script fallback strips browser supplied capture time and still avoids Calendar before intake',async()=>{
 const p=command({trustedIntakeAt:'2000-01-01T00:00:00.000Z',identity:bob,service:'forged'});let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),env.APPS_SCRIPT_URL);const req=signedRequest(init);assert.equal(req.input.trustedIntakeAt,undefined);assert.equal(req.input.identity,undefined);assert.equal(req.input.service,undefined);assert.equal(req.input.intake,true);assert.deepEqual(req.identity.email,who.email);return Response.json({ok:true,data:receipt(req.input)});};
 const result=await call(M,env,p);assert.equal(result.response.status,200);assert.equal(result.body.data.intakeReceipt,true);assert.equal(calls,1);
});
await test('forwarded receipt status uses the same normalized backend command and returns authoritative progress',async()=>{
 const {settings}=setup(),p=command({identity:bob,admin:true});const first=await call(M,settings,p);const acceptedAt=first.body.data.acceptedAt;
 globalThis.fetch=async(url,init)=>{const req=signedRequest(init,settings);assert.equal(req.input.operation,'saveAbsence');return Response.json({ok:true,data:receipt(req.input,{acceptedAt})});};await M.forwardAbsenceTransport(settings,{limit:1});
 let checked=0;globalThis.fetch=async(url,init)=>{const req=signedRequest(init,settings);assert.equal(req.input.operation,'receiptStatus');assert.deepEqual(req.input.command,M.normalizeAbsenceTransportCommand(settings,p));checked++;return Response.json({ok:true,data:receipt(p,{acceptedAt,intakeState:'applied',absenceApplied:true,savedIds:['saved-absence-a']})});};
 const current=await call(M,settings,{operation:'receiptStatus',command:p});assert.equal(current.response.status,200);assert.equal(current.body.data.intakeState,'applied');assert.equal(current.body.data.absenceApplied,true);assert.equal(checked,1);
});
await test('queued capture fences allocation while saved publication and explicit notification reach the backend',async()=>{
 const {settings}=setup();await call(M,settings,command());let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must block before slow work');};
 for(const operation of ['autoAllocate','optimise']){const result=await call(M,settings,{operation,date:day});assert.equal(result.response.status,409);assert.equal(result.body.code,'ABSENCE_TRANSPORT_PENDING');}assert.equal(calls,0);
 const forwarded=[];globalThis.fetch=async(url,init)=>{assert.equal(String(url),settings.APPS_SCRIPT_URL);const req=signedRequest(init,settings);forwarded.push(req.input.operation);return Response.json({ok:true,data:{saved:true,notificationsQueued:0}});};
 for(const operation of ['publish','notifyDaily']){const result=await call(M,settings,{operation,date:day});assert.equal(result.response.status,200);assert.equal(result.body.data.saved,true);}assert.deepEqual(forwarded,['publish','notifyDaily']);
});
await test('queued peer proposal gates allocation but does not permanently block publishing after it needs review',async()=>{
 const {db,settings}=setup(),p={operation:'requestMutual',intake:true,requestId:crypto.randomUUID(),date:day,absenceId:'a',requests:[{recipientId:'bob',demandIds:['a:2']}]};await call(M,settings,p);let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Allocation must wait for the received peer proposal');};for(const operation of ['autoAllocate','optimise']){const result=await call(M,settings,{operation,date:day});assert.equal(result.response.status,409);assert.equal(result.body.code,'ABSENCE_TRANSPORT_PENDING');}assert.equal(calls,0);
 db.sql.prepare("UPDATE gsis_absence_transport SET state='needsReview'").run();globalThis.fetch=async(url,init)=>{const req=signedRequest(init);assert.equal(req.input.operation,'notifyDaily');return Response.json({ok:true,data:{notificationsQueued:0}});};const result=await call(M,settings,{operation:'notifyDaily',date:day});assert.equal(result.response.status,200);
});
await test('forwarded withdrawal uses fresh SMC authorization then resolves at Apps Script without consulting Calendar',async()=>{
 const {db,settings:base}=setup(),settings={...base,CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'fixture-calendar-key-'.repeat(3)},p=command();await call(M,settings,p);
 globalThis.fetch=async(url,init)=>Response.json({ok:true,data:receipt(signedRequest(init,settings).input)});await M.forwardAbsenceTransport(settings,{limit:1});
 const operations=[];globalThis.fetch=async(url,init)=>{if(String(url)===settings.CALENDAR_APPS_SCRIPT_URL){operations.push('calendar');throw Error('Resolution must not depend on Calendar');}const req=signedRequest(init,settings);assert.equal(req.action,'rosterOperations');operations.push(req.input.operation);if(req.input.operation==='read')return Response.json({ok:true,data:{entries:[],user:{smc:true}}});assert.equal(req.input.operation,'resolveAbsenceIntake');assert.equal(req.input.intakeRequestId,p.requestId);assert.equal(req.input.resolution,'withdraw');return Response.json({ok:true,data:receipt(p,{intakeState:'withdrawn',resolution:{at:new Date().toISOString(),by:who.email,reason:req.input.reason}})});};
 const result=await call(M,settings,{operation:'resolveAbsenceIntake',requestId:crypto.randomUUID(),intakeRequestId:p.requestId,resolution:'withdraw',reason:'Duplicate of another recorded report.'});assert.equal(result.response.status,200);assert.equal(result.body.data.intakeState,'withdrawn');assert.deepEqual(operations,['read','resolveAbsenceIntake']);assert.equal(row(db,p.requestId).state,'forwarded');
});
await test('browser all flags cannot withdraw another report and service operation names never select the service authority',async()=>{
 const {db,settings}=setup(),p=command();await call(M,settings,p);db.sql.prepare("UPDATE gsis_absence_transport SET state='needsReview'").run();let reads=0;
 globalThis.fetch=async(url,init)=>{const req=signedRequest(init,settings);assert.equal(req.action,'rosterOperations');assert.equal(req.input.operation,'read');reads++;return Response.json({ok:true,data:{entries:[],user:{smc:false,admin:false}}});};
 const rejected=await call(M,settings,{operation:'resolveAbsenceIntake',requestId:crypto.randomUUID(),intakeRequestId:p.requestId,resolution:'withdraw',reason:'Forged authority.',all:true,smc:true,admin:true},{identity:bob});assert.equal(rejected.response.status,403);assert.equal(reads,1);assert.equal(row(db,p.requestId).state,'needsReview');
 globalThis.fetch=async(url,init)=>{const req=signedRequest(init,settings);assert.equal(req.action,'rosterOperations');assert.equal(req.input.service,undefined);assert.equal(req.input.identity,undefined);assert.equal(req.input.trustedIntakeAt,undefined);assert.equal(req.identity.email,bob.email);return Response.json({ok:false,status:400,error:'Unknown operation.'});};
 const service=await call(M,settings,{operation:'processAbsenceIntake',requestId:p.requestId,service:'gsis-roster-notifier-v1',identity:who,trustedIntakeAt:'2000-01-01T00:00:00.000Z'},{identity:bob});assert.equal(service.response.status,400);assert.equal(row(db,p.requestId).state,'needsReview');
});
await test('an authoritative intake page cannot resurrect an omitted forwarded row as pending, while outage recovery keeps its receipt',async()=>{
 const {settings}=setup(),sent=command(),queued=command();await call(M,settings,sent);
 globalThis.fetch=async(url,init)=>Response.json({ok:true,data:receipt(signedRequest(init,settings).input)});await M.forwardAbsenceTransport(settings,{limit:1});await call(M,settings,queued);
 globalThis.fetch=async()=>Response.json({ok:true,data:{entries:[],total:0,hasMore:false,user:{smc:false,admin:false}}});
 const online=await call(M,settings,{operation:'read',view:'intake',scope:'mine'});assert.equal(online.response.status,200);assert.deepEqual(online.body.data.entries.map(entry=>entry.requestId),[queued.requestId]);assert.equal(online.body.data.pendingCaptureCount,1);assert.equal(online.body.data.total,1);
 globalThis.fetch=async()=>{throw Error('Backend temporarily unavailable');};const recovery=await call(M,settings,{operation:'read',view:'intake',scope:'mine'});assert.equal(recovery.response.status,200);assert.equal(recovery.body.data.processingStatusUnavailable,true);assert.equal(recovery.body.data.entries.length,2);assert.equal(recovery.body.data.entries.find(entry=>entry.requestId===sent.requestId).transportState,'forwarded');
});

await test('an unauthorized report remains available for review after rejection without fencing the school date',async()=>{
 const {db,settings}=setup(),p=command({staffId:'another-teacher'});await call(M,settings,p);
 globalThis.fetch=async()=>Response.json({ok:false,status:403,error:'You may report only your own absence.'});const forwarded=await M.forwardAbsenceTransport(settings,{limit:1});assert.equal(forwarded.needsReview,1);assert.equal(row(db,p.requestId).state,'needsReview');
 globalThis.fetch=async(url,init)=>{const req=signedRequest(init,settings);if(req.input.operation==='read')return Response.json({ok:true,data:{entries:[],total:0,user:{smc:false,admin:false}}});assert.equal(req.input.operation,'notifyDaily');return Response.json({ok:true,data:{notificationsQueued:0}});};
 const review=await call(M,settings,{operation:'read',view:'intake',scope:'mine'});assert.equal(review.response.status,200);assert.equal(review.body.data.entries.length,1);assert.equal(review.body.data.entries[0].intakeState,'needsReview');assert.equal(review.body.data.entries[0].reasonCode,'BACKEND_REJECTED_403');assert.equal(review.body.data.entries[0].absenceApplied,false);assert.equal(review.body.data.pendingCaptureCount,0);
 const publish=await call(M,settings,{operation:'notifyDaily',date:day});assert.equal(publish.response.status,200);assert.equal(row(db,p.requestId).state,'needsReview');
});
