import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,webcrypto} from 'node:crypto';
globalThis.crypto ||= webcrypto;
const {default:worker,CalendarChangeHub}=await import('../calendar-job-worker/worker.mjs');
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../calendar-job-worker/schema.sql',import.meta.url),'utf8'));
const migration=new URL('../calendar-job-worker/change-awareness.sql',import.meta.url);
try{db.exec(readFileSync(migration,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
function statement(sql,args=[]){return{bind(...values){return statement(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
const env={CALENDAR_JOBS_DB:{prepare:sql=>statement(sql),async batch(list){db.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},GSIS_SECRET:'calendar-change-test-secret-'.repeat(3),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',CALENDAR_CHANGE_PUSH:'true',CALENDAR_CHANGE_HUB:{idFromName:s=>s,get:()=>({fetch:async()=>Response.json({ok:true})})}};
const actor={sub:'admin-sub',email:'admin@gsps.edu.sg',userAlias:'admin'},other={sub:'other-sub',email:'other@gsps.edu.sg',userAlias:'other'};
let sourceCalls=0;
globalThis.fetch=async(_url,options)=>{sourceCalls++;const body=JSON.parse(options.body);if(body.action==='calendarChangesAuthorize')return Response.json({ok:true,result:{authorized:true,year:body.payload.year}});throw Error('Unexpected source call: '+body.action);};
async function send(input,who=actor,overrides={}){const payload=JSON.stringify({purpose:'calendar-change-gateway-v1',timestamp:Date.now(),nonce:crypto.randomUUID(),actor:who,input,...overrides});return worker.fetch(new Request('https://jobs.internal/changes',{method:'POST',body:JSON.stringify({payload,signature:createHmac('sha256',env.GSIS_SECRET).update(payload).digest('hex')})}),env);}
let result=await send({kind:'begin',intentId:crypto.randomUUID(),action:'saveTag',year:2026});
assert.equal(result.status,202,'A source change intent must be durably recorded before forwarding the Google write');
const intent=(await result.json()).result.intentId;
assert.equal(sourceCalls,0,'Intent capture must never write Google');
assert.equal(db.prepare('SELECT state FROM calendar_change_intents WHERE intent_id=?').get(intent).state,'PENDING');
assert.equal((await send({kind:'finish',intentId:intent,outcome:'changed'},other)).status,404,'An actor cannot settle another actor\'s source intent');
assert.equal((await send({kind:'finish',intentId:intent,outcome:'changed'})).status,202);
let replay=await(await send({kind:'replay',year:2026,cursor:0})).json();
assert.equal(replay.result.entries.length,1);assert.equal(replay.result.entries[0].kind,'invalidate');
assert.equal(replay.result.entries[0].eventIds,undefined,'Shared hints carry no event identifiers or source payload');
assert.equal((await send({kind:'finish',intentId:intent,outcome:'changed'})).status,202);
assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_change_journal').get().n,1,'Lost acknowledgement retries cannot duplicate journal entries');
assert.equal((await send({kind:'begin',intentId:intent,action:'deleteTag',year:2026})).status,409,'Intent identity is immutable');
assert.equal((await send({kind:'replay',year:2026,cursor:0},actor,{timestamp:Date.now()-120000})).status,401);
assert.equal(typeof CalendarChangeHub,'function');
console.log('PASS Calendar changes: durable pre-dispatch intent, immutable identity, actor isolation, deduplicated invalidation and no committed claim');

// A lost DO wake acknowledgement retains the journal until the existing cron
// retries. It never calls or repeats a Google mutation.
let wakeFailures=1,wakes=0;
env.CALENDAR_CHANGE_HUB.get=()=>({fetch:async()=>{wakes++;if(wakeFailures-->0)throw Error('Synthetic lost wake');return Response.json({ok:true});}});
const lost=crypto.randomUUID();await send({kind:'begin',intentId:lost,action:'saveYear',year:2026});await send({kind:'finish',intentId:lost,outcome:'changed'});
assert.equal(db.prepare('SELECT delivered FROM calendar_change_journal WHERE source_id=?').get('intent:'+lost).delivered,0);
const sourceBefore=sourceCalls;await worker.scheduled({},env);assert.equal(sourceCalls,sourceBefore);assert.equal(db.prepare('SELECT delivered FROM calendar_change_journal WHERE source_id=?').get('intent:'+lost).delivered,1);assert(wakes>=2);
const unknown=crypto.randomUUID();await send({kind:'begin',intentId:unknown,action:'saveLane',year:2026});await send({kind:'finish',intentId:unknown,outcome:'unknown'});
for(let i=0;i<4;i++){db.prepare('UPDATE calendar_change_intents SET next_at=0 WHERE intent_id=?').run(unknown);await worker.scheduled({},env);}
assert.equal(db.prepare('SELECT state FROM calendar_change_intents WHERE intent_id=?').get(unknown).state,'REVIEW');
assert.equal(db.prepare("SELECT COUNT(*) n FROM calendar_change_journal WHERE source_id LIKE ?").get('uncertain:'+unknown+':%').n,3);assert.equal(sourceCalls,sourceBefore,'Uncertain generic intents trigger only bounded reconciliation hints, never source writes');
console.log('PASS Calendar changes: lost wakes retry without source writes; uncertain intents remain REVIEW after bounded reconciliation');

// Another actor may learn only that authorized source data changed, never a
// private job identity, payload or the writer's operation identity.
const {createHash}=await import('node:crypto');
const cursorBefore=db.prepare('SELECT cursor FROM calendar_change_head').get().cursor;
for(const [id,kind,key] of [['private-other-job','job',createHash('sha256').update(other.sub+'|'+other.email).digest('hex')],['commit:private-attempt','committed','']])db.prepare('INSERT INTO calendar_change_journal(source_id,kind,actor_key,year,created_at) VALUES(?,?,?,?,?)').run(id,kind,key,2026,Date.now());
db.exec('UPDATE calendar_change_head SET cursor=(SELECT MAX(cursor) FROM calendar_change_journal)');
replay=await(await send({kind:'replay',year:2026,cursor:cursorBefore})).json();assert.deepEqual(replay.result.entries.map(e=>e.kind),['committed']);assert(!JSON.stringify(replay).includes('private-attempt'));assert(!JSON.stringify(replay).includes('private-other-job'));
const privateReplay=await(await send({kind:'replay',year:2026,cursor:cursorBefore},other)).json();assert.deepEqual(privateReplay.result.entries.map(e=>e.kind),['job','committed']);

// Reproduce a prune interleaving between head/floor and journal row reads.
const prepare=env.CALENDAR_JOBS_DB.prepare;let interleaved=false;
env.CALENDAR_JOBS_DB.prepare=sql=>{
 const original=prepare(sql);if(sql!=='SELECT cursor,floor FROM calendar_change_head WHERE id=1')return original;
 return {...original,async first(){const row=await original.first();if(!interleaved){interleaved=true;db.prepare('UPDATE calendar_change_head SET floor=cursor WHERE id=1').run();db.prepare('DELETE FROM calendar_change_journal').run();}return row;}};
};
replay=await(await send({kind:'replay',year:2026,cursor:0})).json();assert.equal(replay.result.snapshotRequired,true,'A concurrent prune must not skip lost source changes');
env.CALENDAR_JOBS_DB.prepare=prepare;
replay=await(await send({kind:'replay',year:2026,cursor:0})).json();assert.equal(replay.result.snapshotRequired,true,'Expired cursors require scoped source reconciliation');
console.log('PASS Calendar changes: private-job isolation, opaque shared hints, pruning-race recovery and expired cursors');

// Subscription authorization can never outlive the signed Pages session.
let subscription;
env.CALENDAR_CHANGE_HUB.get=()=>({fetch:async request=>{subscription=await request.json();return Response.json({ok:true});}});
const expiry=Date.now()+5000;
assert.equal((await send({kind:'subscribe',year:2026,cursor:replay.result.cursor,sessionExpiresAt:expiry})).status,200);assert.equal(subscription.expiresAt,expiry);
assert.equal((await send({kind:'subscribe',year:2026,cursor:0,sessionExpiresAt:Date.now()-1})).status,401);
const sockets=[],alarms=[];
const ctx={getWebSockets:()=>sockets.filter(socket=>!socket.closed),storage:{setAlarm:async n=>alarms.push(n),deleteAlarm:async()=>{}},blockConcurrencyWhile:fn=>fn()};
const hub=new CalendarChangeHub(ctx,env),expired={closed:false,deserializeAttachment:()=>({actorKey:'opaque',year:2026,cursor:0,expiresAt:Date.now()-1}),close(code){this.closed=code;},send(){throw Error('Expired connection must not receive data');}};sockets.push(expired);
await hub.alarm();assert.equal(expired.closed,4401);
console.log('PASS Calendar changes: session-bounded subscriptions and alarm-driven authorization expiry');

// One closing socket may not starve healthy subscribers. Recreate the object
// around the same serialized attachments to model a hibernation wake.
let healthySends=0;
const metadata={actorKey:createHash('sha256').update(actor.sub+'|'+actor.email).digest('hex'),year:2026,cursor:0,expiresAt:Date.now()+60000};
const broken={deserializeAttachment:()=>({...metadata}),send(){throw Error('Socket closed during send');},close(){this.closed=true;}},healthy={deserializeAttachment(){return this.saved||{...metadata};},serializeAttachment(value){this.saved=value;},send(raw){healthySends++;assert.equal(JSON.parse(raw).snapshotRequired,true);},close(){this.closed=true;}};
sockets.push(broken,healthy);
const woken=new CalendarChangeHub(ctx,env),wakePayload=JSON.stringify({action:'wake',timestamp:Date.now(),cursor:100});
const wakeResponse=await woken.fetch(new Request('https://internal/wake',{method:'POST',headers:{'X-Calendar-Change-Signature':createHmac('sha256',env.GSIS_SECRET).update(wakePayload).digest('hex')},body:wakePayload}));
assert.equal(wakeResponse.status,200);assert.equal(broken.closed,true);assert.equal(healthySends,1);assert.equal(healthy.saved.cursor,db.prepare('SELECT cursor FROM calendar_change_head').get().cursor);
console.log('PASS Calendar changes: hibernation attachments replay and a closing socket cannot starve healthy clients');

// Backpressure must not prevent delivery of the existing backlog: otherwise
// a full undelivered journal would throw before its own recovery wake forever.
const capacityIntent=crypto.randomUUID();await send({kind:'begin',intentId:capacityIntent,action:'saveUrls',year:0});
db.prepare('UPDATE calendar_change_intents SET next_at=0 WHERE intent_id=?').run(capacityIntent);
const fill=db.prepare('INSERT INTO calendar_change_journal(source_id,kind,actor_key,year,created_at) VALUES(?,?,?,?,?)');
for(let i=0;i<10000;i++)fill.run('capacity-'+i,'invalidate','',0,Date.now());
db.exec('UPDATE calendar_change_head SET cursor=(SELECT MAX(cursor) FROM calendar_change_journal)');
await worker.scheduled({},env);
assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_change_journal WHERE delivered=0').get().n,0,'Cron must retry delivery before appending at capacity');
assert.equal(db.prepare('SELECT checks FROM calendar_change_intents WHERE intent_id=?').get(capacityIntent).checks,1);
console.log('PASS Calendar changes: journal capacity backpressure cannot deadlock notification delivery');
