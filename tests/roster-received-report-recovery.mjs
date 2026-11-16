import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,loadEdgeRoster,edgeRosterClock} from '../roster-update/public/edge-roster.js';
import {absenceTransportRoute,dispatchReceivedReports} from '../roster-update/public/_worker.js';
import {captureAbsenceTransport} from '../shared/roster-absence-transport.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

const database=createRequire(import.meta.url)('./helpers/chunked-import-db.cjs');
const originalFetch=globalThis.fetch;
async function fixture(){
 const db=database(),objects=new Map(),bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const value=objects.get(key);return value?{body:new Blob([value]).stream(),text:async()=>new TextDecoder().decode(value)}:null;}};
 const today=edgeRosterClock().today;let date=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
 while([0,6].includes(new Date(date).getUTCDay()))date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
 const people=[0,1,2].map(i=>({id:'synthetic-'+i,name:'Synthetic teacher '+i,active:true,email:'synthetic-'+i+'@gsps.edu.sg',emails:['synthetic-'+i+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(person=>({name:person.name,cells:Array.from({length:85},()=>['','','',''])}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
 const encoded=JSON.stringify(model),key='synthetic-recovery-baseline';await bucket.put(key,await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-capture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',NOTIFICATION_DISPATCH_URL:'https://notification.test/dispatch',GSIS_SECRET:'synthetic-recovery-credential-'.repeat(3),WHATSAPP_ENABLED:'false'};
 async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
 const store=await activate('roster',O.initial());
 await activate('roster-register',{revision:1,entries:[{id:key,name:'Synthetic timetable',from:today,to:'2099-12-31',priority:1,modelObject:{key,digest:sha256Hex(encoded),encoding:'gzip-json-v1'}}],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:[people[0].id],rosterAdminIds:[people[0].id],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'single',available:true}}});
 const background=[],wakes=[];let wakeStatus=202,wakeGate;
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),env.NOTIFICATION_DISPATCH_URL,'No Google, Meta or other provider calls are permitted');const envelope=JSON.parse(init.body);assert.equal(envelope.signature,createHmac('sha256',env.GSIS_SECRET).update(envelope.payload).digest('hex'));const payload=JSON.parse(envelope.payload);assert.equal(payload.purpose,'gsis-notification-wake-v1');wakes.push(payload);if(wakeGate)await wakeGate;return Response.json({ok:wakeStatus===202,queued:wakeStatus===202},{status:wakeStatus});};
 const who=i=>({email:people[i].email,subject:people[i].id});
 async function command(i=0,extra={}){const input={operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date,staffId:people[i].id,typeId:'mc',fullDay:true,reliefRequired:true,receiptOnly:true,...extra};const preview=(await edgeRosterBackend(env,'rosterOperations',{...input,operation:'read',view:'absenceClash'},who(i),'fixture')).result;assert.equal(preview.ok,true,JSON.stringify(preview));return {...input,absenceClashToken:preview.data.token,confirmAbsenceReplacement:false};}
 const ctx={waitUntil(promise){background.push(promise);}};
 async function route(input,identity=who(0)){const response=await absenceTransportRoute(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/operations'),input,env,identity,crypto.randomUUID(),ctx);assert(response);return {status:response.status,body:await response.json()};}
 const row=id=>db.sql.prepare('SELECT * FROM gsis_absence_transport WHERE request_id=?').get(id);
 const settle=()=>Promise.all(background);
 return {db,env,store,date,people,who,command,route,row,settle,background,wakes,setWakeStatus(status){wakeStatus=status;},holdWake(){let release;wakeGate=new Promise(resolve=>{release=resolve;});return release;},state:async()=>(await loadEdgeRoster(env)).state,async close(){await settle();db.sql.close();globalThis.fetch=originalFetch;}};
}

await test('durable 202 stays unsaved while local work waits; an accepted remote wake without a consumer cannot strand D1 intake',async()=>{
 const f=await fixture();let release,releaseWake;
 try{
  const input=await f.command(),gate=new Promise(resolve=>{release=resolve;}),prepare=f.db.prepare;releaseWake=f.holdWake();
  f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith("UPDATE gsis_absence_transport SET state='claimed'")){const all=statement.all;statement.all=async function(){await gate;return all.call(this);};}return statement;};
  const response=await f.route(input);assert.equal(response.status,202);assert.equal(response.body.data.accepted,true);assert.equal(response.body.data.absenceApplied,false);assert.deepEqual(response.body.data.savedIds,[]);assert.equal((await f.state()).absences.length,0);
  release();for(let turn=0;turn<30&&f.row(input.requestId).state!=='forwarded';turn++)await new Promise(setImmediate);
  assert.equal(f.row(input.requestId).state,'forwarded','D1 application must not wait for a remote Queue response or consumer');releaseWake();await f.settle();assert.equal(f.wakes.length,1);assert.equal((await f.state()).absences.length,1);
 }finally{release?.();releaseWake?.();await f.close();}
});

await test('a rejected HTTP wake still applies the retained D1 command without sending a provider message',async()=>{
 const f=await fixture();try{f.setWakeStatus(503);const input=await f.command(1,{fullDay:false,periods:[8,9]});assert.equal((await f.route(input,f.who(1))).status,202);await f.settle();assert.equal(f.row(input.requestId).state,'forwarded');const state=await f.state();assert.equal(state.absences.length,1);assert.deepEqual(state.absences[0].periods,[8,9]);assert.equal(state.outbox.length,0);}finally{await f.close();}
});

await test('opening an authorized pending list drains its original namespace when another Worker namespace sees idle',async()=>{
 const f=await fixture();try{
  const input=await f.command(1,{date:undefined,from:f.date,to:f.date});await captureAbsenceTransport(f.env,f.who(1),input);
  const remote=await dispatchReceivedReports({...f.env,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-other-context/exec'});assert.equal(remote.transport.claimed,0);assert.equal(f.row(input.requestId).attempts,0);
  const response=await f.route({operation:'read',view:'intake',scope:'mine'},f.who(1));assert.equal(response.status,200);assert.equal(response.body.data.pendingCaptureCount,1);assert(response.body.data.entries.some(row=>row.requestId===input.requestId));
  await f.settle();assert.equal(f.row(input.requestId).state,'forwarded','the list wake must use the capture context, not the other namespace');assert.equal((await f.state()).absences.length,1);
 }finally{await f.close();}
});

await test('list recovery respects live claims and future retry backoff',async()=>{
 const f=await fixture();try{
  const claimed=await f.command(0),delayed=await f.command(1);await captureAbsenceTransport(f.env,f.who(0),claimed);await captureAbsenceTransport(f.env,f.who(1),delayed);
  f.db.sql.prepare("UPDATE gsis_absence_transport SET state='claimed',claim_id='synthetic-lease',lease_until=? WHERE request_id=?").run(Date.now()+600000,claimed.requestId);
  f.db.sql.prepare('UPDATE gsis_absence_transport SET available_at=? WHERE request_id=?').run(Date.now()+600000,delayed.requestId);
  const before=[f.row(claimed.requestId),f.row(delayed.requestId)];assert.equal((await f.route({operation:'read',view:'intake',scope:'school'})).status,200);await f.settle();assert.deepEqual([f.row(claimed.requestId),f.row(delayed.requestId)],before);assert.equal((await f.state()).absences.length,0);
 }finally{await f.close();}
});

await test('local and scheduled drains race safely and reruns add no absence, receipt, audit or notification',async()=>{
 const f=await fixture();try{
  const input=await f.command();assert.equal((await f.route(input)).status,202);await Promise.all([f.settle(),dispatchReceivedReports(f.env)]);const saved=await f.state();assert.equal(saved.absences.length,1);assert.equal(saved.edgeAbsenceReceipts.length,1);assert.equal(f.row(input.requestId).state,'forwarded');assert.equal(f.row(input.requestId).attempts,1);assert.equal(saved.outbox.length,0);
  const head=await f.store.head();await f.route({operation:'receiptStatus',command:input});await f.route({operation:'read',view:'intake',scope:'mine'});await f.settle();await dispatchReceivedReports(f.env);assert.deepEqual(await f.state(),saved);assert.equal((await f.store.head()).revision,head.revision);
 }finally{await f.close();}
});

await test('a denied list cannot wake or mutate retained reports',async()=>{
 const f=await fixture();try{
  const input=await f.command(1);await captureAbsenceTransport(f.env,f.who(1),input);const before=f.row(input.requestId);
  const response=await f.route({operation:'read',view:'intake',scope:'school',all:true,user:{smc:true,admin:true}},{email:'unknown@gsps.edu.sg',subject:'unknown'});assert.equal(response.status,403);assert.equal(f.background.length,0);assert.equal(f.wakes.length,0);assert.deepEqual(f.row(input.requestId),before);assert.equal((await f.state()).absences.length,0);
 }finally{await f.close();}
});
