import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const path='shared/roster-absence-transport.js';
assert(fs.existsSync(path),'durable Worker absence transport has not been implemented');
const M=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path,'utf8')+'\n//# sourceURL=roster-absence-transport.js').toString('base64'));
const who={email:'alice@gsps.edu.sg',subject:'google-alice'},bob={email:'bob@gsps.edu.sg',subject:'google-bob'},day='2026-10-26';
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg'};
const command=(extra={})=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date:day,staffId:'alice',typeId:'mc',fullDay:true,...extra});
const durable=input=>({ok:true,data:{accepted:true,intakeReceipt:true,receiptOnly:true,requestId:input.requestId,acceptedAt:new Date().toISOString(),intakeState:'pending',savedIds:[]}});
function database(){
 const sql=new DatabaseSync(':memory:');
 const db={sql,afterWrite:null,beforeWrite:null,prepare(query){const stmt=(args=[])=>({bind(...next){return stmt(next);},async all(){db.beforeWrite?.(query);const rows=sql.prepare(query).all(...args);db.afterWrite?.(query);return {success:true,results:rows};},async first(){return sql.prepare(query).get(...args)||null;},async run(){db.beforeWrite?.(query);const result=sql.prepare(query).run(...args);db.afterWrite?.(query);return {success:true,meta:{changes:result.changes}};}});return stmt();}};return db;
}
const setup=()=>{const db=database();return {db,settings:{...env,GSIS_JOBS:db}};};
const count=db=>db.sql.prepare('SELECT COUNT(*) n FROM gsis_absence_transport').get().n;
const rows=db=>db.sql.prepare('SELECT * FROM gsis_absence_transport').all();
await test('capture commits before acknowledgement without any Apps Script or Calendar dependency',async()=>{
 const {db,settings}=setup();globalThis.fetch=()=>assert.fail('critical capture must not wait for a network backend');
 const p=command(),receipt=await M.captureAbsenceTransport(settings,who,p);
 assert.equal(count(db),1);assert.equal(receipt.accepted,true);assert.equal(receipt.intakeReceipt,true);assert.equal(receipt.receiptOnly,true);assert.equal(receipt.transportState,'queued');assert.equal(receipt.intakeState,'pending');assert.equal(receipt.absenceApplied,false);assert.deepEqual(receipt.savedIds,[]);
 assert.equal((await M.absenceTransportReceipt(settings,who,p)).acceptedAt,receipt.acceptedAt);
 assert.equal(await M.captureAbsenceTransport(env,who,p),null);
});
await test('concurrent duplicate captures and 30 simultaneous reports create each command once',async()=>{
 const {db,settings}=setup(),p=command();
 const duplicates=await Promise.all(Array.from({length:30},()=>M.captureAbsenceTransport(settings,who,p)));
 assert.equal(new Set(duplicates.map(r=>r.acceptedAt)).size,1);assert.equal(count(db),1);
 await Promise.all(Array.from({length:30},()=>M.captureAbsenceTransport(settings,who,command())));assert.equal(count(db),31);
 const race=await Promise.allSettled([M.captureAbsenceTransport(settings,who,{...p,typeId:'sick'}),M.captureAbsenceTransport(settings,who,p)]);
 assert.equal(race[0].status,'rejected');assert.equal(race[0].reason.status,409);assert.equal(race[1].status,'fulfilled');assert.equal(JSON.parse(rows(db)[0].command).typeId,'mc');
});
await test('lost D1 insert acknowledgement remains recoverable using the same command identity',async()=>{
 const {db,settings}=setup(),p=command();let once=true;
 db.afterWrite=query=>{if(once&&query.startsWith('INSERT')){once=false;throw Error('network acknowledgement lost');}};
 const result=await M.captureAbsenceTransport(settings,who,p);assert.equal(result.accepted,true);assert.equal(count(db),1);
 assert.equal((await M.captureAbsenceTransport(settings,who,p)).acceptedAt,result.acceptedAt);
});
await test('transport sanitizes authority fields and retains dated instructions and proposal evidence',async()=>{
 const {db,settings}=setup(),p=command({identity:{email:'forged'},admin:true,service:'forged',calendarByDate:{forged:true},reportedAt:'2000-01-01',proposalOnly:true,publicOrigin:env.ROSTER_PUBLIC_ORIGIN,
 instructionsByDate:{[day]:{'lesson:a':'Please use page 3.'}},expectedInstructionScopes:{[day]:{timetableId:'tt1',staplerRevision:2,parity:'odd'}},ownArrangementsByStaffDate:{alice:{[day]:[{period:2,recipientId:'bob',combination:true,lessonKey:'lesson:a',expectedTimetableId:'tt1',expectedStaplerRevision:2,expectedParity:'odd',expectedRecipientCell:['MA','3P','A1','']} ]}}});
 await M.captureAbsenceTransport(settings,who,p);const stored=JSON.parse(rows(db)[0].command);
 for(const key of ['identity','admin','service','calendarByDate','reportedAt','proposalOnly'])assert.equal(stored[key],undefined);
 assert.deepEqual(stored.instructionsByDate,p.instructionsByDate);assert.deepEqual(stored.ownArrangementsByStaffDate,p.ownArrangementsByStaffDate);
 await M.dispatchAbsenceTransport(settings,{limit:1,capture:async(input,identity)=>{assert.deepEqual(input,stored);assert.deepEqual(identity,who);return durable(input);}});
 assert.equal(rows(db)[0].state,'forwarded');
});
await test('bad configuration and malformed bounded commands cannot receive false receipts',async()=>{
 const {db,settings}=setup();for(const cfg of [{ROSTER_PUBLIC_ORIGIN:''},{ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg/path'},{APPS_SCRIPT_URL:'https://evil.test/exec'}])await assert.rejects(M.captureAbsenceTransport({...settings,...cfg},who,command()));
 for(const p of [command({operation:'publish'}),command({intake:false}),command({requestId:'unsafe'}),command({date:'2026-02-30'}),command({from:'2026-01-01',to:'2027-01-02'}),command({fullDay:false,periods:[-1]}),command({remarks:'x'.repeat(2001)}),command({publicOrigin:'https://evil.test'}),command({ownArrangementsByStaffDate:{alice:{[day]:[{period:41}]}}})])await assert.rejects(M.captureAbsenceTransport(settings,who,p));
 await assert.rejects(M.captureAbsenceTransport(settings,{email:'external@example.test',subject:'evil'},command()));
 assert.equal(count(db),0);
 await M.captureAbsenceTransport(settings,who,command({from:'2026-01-01',to:'2026-12-31'}));assert.equal(JSON.parse(rows(db)[0].dates).length,365);
});
await test('own receipts and recovery commands stay private and namespaces do not overlap',async()=>{
 const {settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);await M.captureAbsenceTransport(settings,bob,command({staffId:'bob'}));
 assert.equal(await M.absenceTransportReceipt(settings,bob,p),null);
 const mine=await M.readAbsenceTransport(settings,who,{scope:'mine'});assert.equal(mine.total,1);assert.equal(mine.entries[0].command.requestId,p.requestId);
 assert.equal((await M.readAbsenceTransport(settings,who,{all:true})).total,2);
 assert.equal((await M.readAbsenceTransport({...settings,APPS_SCRIPT_URL:'https://script.google.com/macros/s/other/exec'},who,{})).total,0);
 assert.equal((await M.readAbsenceTransport({...settings,ROSTER_PUBLIC_ORIGIN:'https://preview.example.test'},who,{})).total,0);
});
await test('only durable backend acknowledgement settles forwarding, with same-ID replay after lost acknowledgement',async()=>{
 const {db,settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);const backendIds=new Set();let fail=true,calls=0;
 const capture=async input=>{calls++;backendIds.add(input.requestId);if(fail){fail=false;throw Error('backend committed but reply was lost');}return durable(input);};
 const first=await M.dispatchAbsenceTransport(settings,{limit:1,capture});assert.equal(first.pending,1);assert.equal(rows(db)[0].state,'queued');assert.equal(backendIds.size,1);
 db.sql.prepare('UPDATE gsis_absence_transport SET available_at=0').run();const second=await M.dispatchAbsenceTransport(settings,{limit:1,capture});assert.equal(second.forwarded,1);assert.equal(rows(db)[0].state,'forwarded');assert.equal(backendIds.size,1);assert.equal(calls,2);
});
await test('wrong receipt identity and malformed backend success stay pending',async()=>{
 for(const reply of [{accepted:true,intakeReceipt:true,requestId:'different'}, {ok:true,data:{}},{ok:false,status:503}]){
  const {db,settings}=setup();await M.captureAbsenceTransport(settings,who,command());const result=await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>reply});assert.equal(result.pending,1);assert.equal(rows(db)[0].state,'queued');
 }
});
await test('lease claims serialize delivery and late completions cannot settle a newer lease',async()=>{
 const {db,settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);let release,started;
 const began=new Promise(resolve=>started=resolve),holding=new Promise(resolve=>release=resolve);
 const first=M.dispatchAbsenceTransport(settings,{limit:1,capture:async input=>{started();await holding;return durable(input);}});await began;
 assert.equal((await M.dispatchAbsenceTransport(settings,{limit:1,capture:()=>assert.fail('live lease duplicated')})).claimed,0);
 db.sql.prepare('UPDATE gsis_absence_transport SET lease_until=0').run();
 const next=await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>({ok:false,status:403})});assert.equal(next.needsReview,1);
 release();await first;assert.equal(rows(db)[0].state,'needsReview');assert.equal(JSON.parse(rows(db)[0].command).requestId,p.requestId);
});
await test('a business conflict remains reviewable and continues to block its affected dates',async()=>{
 const {db,settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);
 await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>({ok:false,status:409,message:'private school detail'})});
 const report=await M.readAbsenceTransport(settings,who,{});assert.equal(report.entries[0].intakeState,'needsReview');assert.deepEqual(report.entries[0].command.requestId,p.requestId);assert.equal(JSON.stringify(report).includes('private school detail'),false);
 const pending=await M.pendingAbsenceTransport(settings,[day]);assert.equal(pending.pendingCaptureCount,1);assert.deepEqual(pending.blockedDates,[day]);assert.equal((await M.pendingAbsenceTransport(settings,['2026-10-27'])).pendingCaptureCount,0);
});
await test('peer-only requests remain tentative without blocking absence publication',async()=>{
 const {settings}=setup(),p={operation:'requestMutual',intake:true,requestId:crypto.randomUUID(),date:day,absenceId:'absence-a',requests:[{recipientId:'bob',combination:false,demandIds:['absence-a:2']}]};
 const receipt=await M.captureAbsenceTransport(settings,who,p);assert.equal(receipt.absenceApplied,false);assert.equal(receipt.peerState,'pending');assert.equal((await M.pendingAbsenceTransport(settings,[day])).pendingCaptureCount,0);
});
await test('lost D1 settlement retains the command and lease recovery forwards the same immutable identity',async()=>{
 const {db,settings}=setup(),p=command();const receipt=await M.captureAbsenceTransport(settings,who,p);let attempts=0;const backendIds=new Set();
 const capture=async(input,identity,metadata)=>{attempts++;backendIds.add(input.requestId);assert.deepEqual(metadata,{acceptedAt:receipt.acceptedAt});return durable(input);};
 let fail=true;db.beforeWrite=query=>{if(fail&&query.startsWith('UPDATE')&&query.includes('forwarded_at=?')){fail=false;throw Error('write unavailable');}};
 await assert.rejects(M.dispatchAbsenceTransport(settings,{limit:1,capture}));assert.equal(rows(db)[0].state,'claimed');
 db.sql.prepare('UPDATE gsis_absence_transport SET lease_until=0').run();const result=await M.dispatchAbsenceTransport(settings,{limit:1,capture});assert.equal(result.forwarded,1);assert.equal(attempts,2);assert.equal(backendIds.size,1);assert.equal(JSON.parse(rows(db)[0].command).requestId,p.requestId);
});
await test('explicit retry retains the original command, requires owner or server-authorized SMC, and never steals a live lease',async()=>{
 const {db,settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>({ok:false,status:409})});
 assert.equal(await M.retryAbsenceTransport(settings,bob,{requestId:p.requestId}),null);
 const retried=await M.retryAbsenceTransport(settings,who,{requestId:p.requestId});assert.equal(retried.transportState,'queued');assert.equal(JSON.parse(rows(db)[0].command).requestId,p.requestId);
 db.sql.prepare("UPDATE gsis_absence_transport SET state='claimed',claim_id='other',lease_until=?").run(Date.now()+60000);await assert.rejects(M.retryAbsenceTransport(settings,who,{requestId:p.requestId}),{status:409});
 db.sql.prepare("UPDATE gsis_absence_transport SET state='needsReview',lease_until=0").run();assert.equal((await M.retryAbsenceTransport(settings,bob,{requestId:p.requestId,all:true})).transportState,'queued');
});
await test('peer lesson evidence survives transport and normalized status probes match backend commands',async()=>{
 const {db,settings}=setup(),p={operation:'requestMutual',intake:true,requestId:crypto.randomUUID(),date:day,absenceId:'absence-a',requests:[{recipientId:'bob',combination:true,demandIds:['absence-a:2'],expectedLessons:{'absence-a:2':{lessonKey:'lesson2',timetableId:'tt1',parity:'odd'}},expectedRecipientCell:['MA','3P','B2','']}]};
 await M.captureAbsenceTransport(settings,who,p);const stored=JSON.parse(rows(db)[0].command);assert.deepEqual(stored.requests[0].expectedLessons,p.requests[0].expectedLessons);assert.deepEqual(M.normalizeAbsenceTransportCommand(settings,p),stored);
 await assert.rejects(M.captureAbsenceTransport(settings,who,{...p,requestId:crypto.randomUUID(),requests:[{...p.requests[0],expectedLessons:{'other-demand':{lessonKey:'lesson2',timetableId:'tt1',parity:'odd'}}}]}));
});
await test('SMC withdrawal of rejected capture retains its evidence and audit while unblocking the affected dates',async()=>{
 const {db,settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>({ok:false,status:403})});
 await assert.rejects(M.resolveAbsenceTransport(settings,who,{requestId:p.requestId,reason:'Wrong teacher'}),{status:403});
 await assert.rejects(M.resolveAbsenceTransport(settings,bob,{requestId:p.requestId,all:true,reason:''}),{status:400});
 const resolved=await M.resolveAbsenceTransport(settings,bob,{requestId:p.requestId,all:true,reason:'Reported against the wrong teacher; corrected with a new report.'});
 assert.equal(resolved.intakeState,'withdrawn');assert.equal(resolved.transportState,'withdrawn');assert.equal(resolved.resolution.by,bob.email);assert.match(resolved.resolution.reason,/wrong teacher/);assert.equal(resolved.absenceApplied,false);
 assert.equal((await M.pendingAbsenceTransport(settings,[day])).pendingCaptureCount,0);assert.equal((await M.readAbsenceTransport(settings,who,{})).entries[0].resolution.by,bob.email);assert.equal(JSON.parse(rows(db)[0].command).requestId,p.requestId);
 assert.equal((await M.retryAbsenceTransport(settings,who,{requestId:p.requestId})).intakeState,'withdrawn');assert.equal((await M.captureAbsenceTransport(settings,who,p)).intakeState,'withdrawn');
});
await test('forwarded reports resolve at Apps Script authority rather than being withdrawn twice',async()=>{
 const {settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);await M.dispatchAbsenceTransport(settings,{limit:1,capture:async input=>durable(input)});
 const result=await M.resolveAbsenceTransport(settings,bob,{requestId:p.requestId,all:true,reason:'Review at the application register.'});assert.equal(result.transportState,'forwarded');assert.equal(result.resolution,undefined);
});
await test('failed storage never claims capture and transient delivery backs off without new identities',async()=>{
 const {db,settings}=setup(),p=command();db.beforeWrite=query=>{if(query.startsWith('INSERT'))throw Error('storage unavailable');};
 await assert.rejects(M.captureAbsenceTransport(settings,who,p),{status:503});assert.equal(count(db),0);
 db.beforeWrite=null;await M.captureAbsenceTransport(settings,who,p);let calls=0;
 const capture=async()=>{calls++;return {ok:false,status:429};};await M.dispatchAbsenceTransport(settings,{limit:1,capture});assert.equal(rows(db)[0].state,'queued');assert(rows(db)[0].available_at>Date.now());
 assert.equal((await M.dispatchAbsenceTransport(settings,{limit:1,capture})).claimed,0);assert.equal(calls,1);assert.equal(count(db),1);
});
await test('queued and leased peer proposals gate allocation until handed off; review and withdrawal do not block publication',async()=>{
 const {db,settings}=setup(),p={operation:'requestMutual',intake:true,requestId:crypto.randomUUID(),date:day,absenceId:'absence-a',requests:[{recipientId:'bob',demandIds:['absence-a:2']}]};
 await M.captureAbsenceTransport(settings,who,p);
 for(const state of ['queued','claimed']){db.sql.prepare('UPDATE gsis_absence_transport SET state=?').run(state);const pending=await M.pendingAbsenceTransport(settings,[day]);assert.equal(pending.pendingCaptureCount,0);assert.equal(pending.pendingPeerCount,1);assert.deepEqual(pending.peerBlockedDates,[day]);assert.deepEqual(pending.blockedDates,[]);}
 for(const state of ['needsReview','withdrawn','forwarded']){db.sql.prepare('UPDATE gsis_absence_transport SET state=?').run(state);const pending=await M.pendingAbsenceTransport(settings,[day]);assert.equal(pending.pendingPeerCount,0);assert.deepEqual(pending.peerBlockedDates,[]);assert.equal(pending.pendingCaptureCount,0);}
 const disabled=await M.pendingAbsenceTransport(env,[day]);assert.equal(disabled.pendingPeerCount,0);assert.deepEqual(disabled.peerBlockedDates,[]);
});
await test('a burst of 12 reports forwards with bounded parallelism and claims each command once',async()=>{
 const {db,settings}=setup();await Promise.all(Array.from({length:12},()=>M.captureAbsenceTransport(settings,who,command())));let active=0,peak=0;const seen=new Set();
 const capture=async input=>{assert(!seen.has(input.requestId));seen.add(input.requestId);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return durable(input);};
 const result=await M.dispatchAbsenceTransport(settings,{limit:12,budgetMs:5000,capture});assert.equal(result.claimed,12);assert.equal(result.forwarded,12);assert.equal(peak,3);assert.equal(active,0);assert.equal(seen.size,12);assert.equal(rows(db).filter(row=>row.state==='forwarded').length,12);
});
await test('parallel forwarding respects the total limit and caps a requested concurrency above four',async()=>{
 const {db,settings}=setup();await Promise.all(Array.from({length:12},()=>M.captureAbsenceTransport(settings,who,command())));let active=0,peak=0;
 const result=await M.dispatchAbsenceTransport(settings,{limit:5,concurrency:99,capture:async input=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return durable(input);}});assert.equal(result.claimed,5);assert.equal(result.forwarded,5);assert.equal(peak,4);assert.equal(rows(db).filter(row=>row.state==='queued').length,7);
});
await test('normal recovery lists omit forwarded transport rows; backend-outage fallback can explicitly include them',async()=>{
 const {settings}=setup(),p=command();await M.captureAbsenceTransport(settings,who,p);await M.dispatchAbsenceTransport(settings,{limit:1,capture:async input=>durable(input)});
 const normal=await M.readAbsenceTransport(settings,who,{});assert.equal(normal.total,0);assert.deepEqual(normal.entries,[]);
 const fallback=await M.readAbsenceTransport(settings,who,{includeForwarded:true});assert.equal(fallback.total,1);assert.equal(fallback.entries[0].transportState,'forwarded');assert.equal(fallback.entries[0].absenceApplied,false);
});

await test('malformed or unauthorized rejected captures stay reviewable without fencing school allocation',async()=>{
 for(const status of [400,403,404,413,422]){
  const {db,settings}=setup(),p=command({staffId:'not-authorized'});await M.captureAbsenceTransport(settings,who,p);await M.dispatchAbsenceTransport(settings,{limit:1,capture:async()=>({ok:false,status})});
  assert.equal(rows(db)[0].state,'needsReview');assert.equal(JSON.parse(rows(db)[0].command).staffId,'not-authorized');
  const pending=await M.pendingAbsenceTransport(settings,[day]);assert.equal(pending.pendingCaptureCount,0);assert.deepEqual(pending.blockedDates,[]);assert.deepEqual(pending.requestIds,[]);
  const list=await M.readAbsenceTransport(settings,who,{});assert.equal(list.total,1);assert.equal(list.pendingCaptureCount,0);assert.equal(list.entries[0].intakeState,'needsReview');assert.equal(list.entries[0].reasonCode,'BACKEND_REJECTED_'+status);assert.equal(list.entries[0].absenceApplied,false);
 }
});
