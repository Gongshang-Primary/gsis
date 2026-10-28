'use strict';
// Real intake journal, authority and domain helpers; only Google storage/locks are simulated.
// These checks catch a reintroduced allocator lock, premature success, lost retry identity,
// cross-user recovery disclosure, or stale worker settlement erasing durable progress.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const O=require('../shared/roster-operations.js'),fixture=require('./roster701-fixture.cjs');
const modulePath='backend/RosterAbsenceIntake.gs';
assert(fs.existsSync(modulePath),'durable absence intake module must exist');
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const f=fixture(),files=new Map(),properties=new Map(),logs=[];let now=Date.parse(f.date+'T06:00:00+08:00'),locked=false,writes=0,lose=false,owner='owner@gsps.edu.sg',sequence=0;
 const Clock=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const scope={console:{log:x=>logs.push(x),info:x=>logs.push(x)},Date:Clock,JSON,Set,Map,WeakMap,GSISRosterOperations:O,ROSTER_DATA:'private-roster-data',
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,value)=>[...crypto.createHash('sha256').update(value).digest()],getUuid:()=>crypto.randomUUID(),newBlob:(value)=>({getDataAsString:()=>value})},
  Session:{getEffectiveUser:()=>({getEmail:()=>owner})},ScriptApp:{getScriptId:()=> 'roster-script'},
  props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)}),
  gsisRequireBackendRole_:role=>assert.equal(role,'roster'),error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  LockService:{getScriptLock(){throw Error('Intake must not acquire the allocator ScriptLock');},getUserLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{assert(locked);locked=false;}})},
  deployLock_:(lock,timeout)=>{assert(timeout<=8000);return lock.tryLock(timeout);},deployUnlock_:lock=>lock.releaseLock(),
  rosterFindFile_:(folder,name)=>{assert.equal(folder,'private-roster-data');return [...files].find(([,f])=>f.name===name)?.[0]||'';},
  rosterReadFile_:id=>{assert(files.has(id));return files.get(id).text;},
  rosterCreateFile_:(folder,name,blob)=>{assert(locked);assert.equal(folder,'private-roster-data');const id='intake-file-'+(++sequence);files.set(id,{name,text:blob.getDataAsString()});writes++;if(lose){lose=false;throw Error('Lost Drive acknowledgement');}return id;},
  rosterDriveRequest_:(url,options,operation)=>{assert(locked);assert.equal(options.method,'patch');assert.equal(operation,'absence-intake-commit');const id=url.match(/\/files\/([^?]+)/)[1];assert(files.has(id));files.get(id).text=options.payload;writes++;if(lose){lose=false;throw Error('Lost Drive acknowledgement');}return {};},
  rosterOperationsContext_:()=>{throw Error('Capture must not build timetable or quota context');},rosterOperationsQuota_:()=>{throw Error('Capture must not read quota');}
 };
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);scope.rosterOperationsState_=()=>clone(f.state);
 vm.runInContext(fs.readFileSync(modulePath,'utf8'),scope);
 const contacts=id=>({rosterPeople:clone(f.people),user:{rosterStaffId:id,rosterSMC:false,rosterAdmin:false}}),c=contacts('alice'),identity={email:'alice@gsps.edu.sg',subject:'alice-subject'},command=(extra={})=>({operation:'saveAbsence',intake:true,receiptOnly:true,requestId:crypto.randomUUID(),date:f.date,staffId:'alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructionsNA:true,...extra}),req=p=>({identity:clone(identity),input:clone(p)}),capture=p=>scope.rosterAbsenceIntakeCapture_(req(p),c),receipt=p=>scope.rosterAbsenceIntakeReceipt_({identity:clone(identity),input:{command:clone(p)}},c);
 return {f,scope,c,contacts,identity,command,req,capture,receipt,files,logs,properties,at:iso=>{now=Date.parse(iso);},advance:ms=>{now+=ms;},owner:value=>{owner=value;},lose:()=>{lose=true;},writes:()=>writes,journal:()=>JSON.parse([...files.values()][0].text)};
}
module.exports=setup;
if(require.main===module){
{
 const h=setup(),p=h.command(),r=h.capture(p);assert.equal(r.accepted,true);assert.equal(r.intakeReceipt,true);assert.equal(r.intakeState,'pending');assert.deepEqual([...r.savedIds],[]);assert.equal(h.journal().entries.length,1);assert.equal(h.journal().entries[0].command.requestId,p.requestId);assert.equal(h.journal().entries[0].identity.subject,'alice-subject');assert.equal(h.writes(),1);
 const replay=h.capture(p);assert.equal(replay.requestId,r.requestId);assert.equal(replay.acceptedAt,r.acceptedAt);assert.equal(h.writes(),1);assert.equal(h.receipt(p).accepted,true);
 assert.throws(()=>h.capture({...p,reasonDetail:'different content'}),e=>e.status===409);assert.equal(h.writes(),1);
 const other=h.req(p);other.identity={email:'bob@gsps.edu.sg',subject:'bob'};assert.throws(()=>h.scope.rosterAbsenceIntakeReceipt_({identity:other.identity,input:{command:p}},h.contacts('bob')),e=>e.status===403||e.status===409);
}
for(const firstCreate of [true,false]){
 const h=setup();if(!firstCreate)h.capture(h.command());const p=h.command();h.lose();assert.throws(()=>h.capture(p),/Lost Drive acknowledgement/);const written=h.writes(),r=h.receipt(p);assert.equal(r.accepted,true,'durable capture survives a lost response');assert.equal(h.capture(p).accepted,true);assert.equal(h.writes(),written,'retry never repeats a committed capture');assert.equal(h.journal().entries.filter(x=>x.id===p.requestId).length,1);
}
{
 const h=setup(),p=h.command();h.capture(p);const pending=h.scope.rosterAbsenceIntakePending_([h.f.date]);assert.equal(pending.pendingCaptureCount,1);assert.deepEqual([...pending.blockedDates],[h.f.date]);
 const [job]=h.scope.rosterAbsenceIntakeClaim_(1,[h.f.date]);assert.equal(job.id,p.requestId);assert.equal(job.identity.email,h.identity.email);assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0,'another worker cannot claim a live lease');
 h.advance(100000);const [retry]=h.scope.rosterAbsenceIntakeClaim_(1);assert.equal(retry.id,job.id);assert.notEqual(retry.claimId,job.claimId);assert.throws(()=>h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'applied'}),e=>e.status===409);
 h.scope.rosterAbsenceIntakeSettle_(retry.id,retry.claimId,{state:'pending',absenceApplied:true,savedIds:['absence-1'],peerState:'pending',retainClaim:true});
 assert.equal(h.receipt(p).absenceApplied,true);assert.deepEqual([...h.receipt(p).savedIds],['absence-1']);assert.equal(h.scope.rosterAbsenceIntakePending_([h.f.date]).pendingCaptureCount,0,'saved absence is not blocked by peer review');
 assert.equal(h.scope.rosterAbsenceIntakePending_([h.f.date]).pendingPeerCount,1,'allocator waits while the captured peer choices project after core absence save');assert.deepEqual([...h.scope.rosterAbsenceIntakePending_([h.f.date]).peerBlockedDates],[h.f.date]);
 h.scope.rosterAbsenceIntakeSettle_(retry.id,retry.claimId,{state:'needsReview',peerState:'needsReview',reasonCode:'PEER_SOURCE_CHANGED'});assert.equal(h.receipt(p).absenceApplied,true);assert.equal(h.receipt(p).intakeState,'needsReview');assert.equal(h.scope.rosterAbsenceIntakePending_().peerReviewCount,1);
 assert.equal(h.scope.rosterAbsenceIntakePending_().pendingPeerCount,0,'peer manual review does not keep the allocator blocked');assert.deepEqual([...h.scope.rosterAbsenceIntakePending_().peerBlockedDates],[]);
 assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0,'manual-review items do not retry forever');
}
{
 const h=setup();h.capture(h.command({reasonDetail:'private medical note'}));const own=h.scope.rosterAbsenceIntakeVisible_(h.req({}),h.c);assert.equal(own.entries.length,1);assert.equal(own.entries[0].command.reasonDetail,'private medical note');
 const bob={identity:{email:'bob@gsps.edu.sg',subject:'bob'},input:{}};assert.equal(h.scope.rosterAbsenceIntakeVisible_(bob,h.contacts('bob')).entries.length,0);const smc=h.contacts('bob');smc.user.rosterSMC=true;assert.equal(h.scope.rosterAbsenceIntakeVisible_(bob,smc).entries.length,1);
 assert.equal(h.scope.rosterAbsenceIntakeVisible_({...bob,input:{scope:'mine'}},smc).entries.length,0,'SMC own-report panel honours its requested scope');
 assert.equal(h.scope.rosterAbsenceIntakeVisible_({...bob,input:{date:'2026-10-15'}},smc).entries.length,0,'dated relief panel sees only captures affecting that date');
 assert(!JSON.stringify(h.scope.rosterAbsenceIntakePending_()).includes('medical'));assert(!h.logs.join('\n').includes('alice@'));assert(!h.logs.join('\n').includes('medical'));
 h.owner('changed-owner@gsps.edu.sg');assert.throws(()=>h.receipt(h.command()),e=>e.status===503,'a different effective owner cannot operate the journal with a different UserLock');
}
for(const extra of [{date:'2026-02-30'},{date:'2020-01-01'},{staffId:'bob'},{typeId:'missing'},{periods:[-1]},{periods:[]},{ownArrangementsByStaffDate:{alice:{'2026-10-14':[{period:2,recipientId:'missing'}]}}}]){
 const h=setup();assert.throws(()=>h.capture(h.command(extra)),e=>[400,403,404].includes(e.status),JSON.stringify(extra));assert.equal(h.writes(),0,'invalid report is never acknowledged');
}
{
 const h=setup(),p=h.command({from:h.f.date,to:'2027-10-14',fullDay:true,periods:[]});assert.equal(h.capture(p).accepted,true,'full-year intake needs no Calendar read');
}
{
 const h=setup(),commands=Array.from({length:30},()=>h.command());for(const p of commands)h.capture(p);assert.equal(h.journal().entries.length,30);assert.equal(new Set(h.journal().entries.map(row=>row.sequence)).size,30);for(const p of commands)assert.equal(h.receipt(p).accepted,true);
}
{
 const h=setup();h.f.state.absences.push({id:'absence-existing',staffId:'alice',date:h.f.date,periods:[2],reliefRequired:true});
 const p={operation:'requestMutual',intake:true,requestId:crypto.randomUUID(),date:h.f.date,absenceId:'absence-existing',requests:[{demandIds:['absence-existing:2'],recipientId:'bob',combination:false}]};
 assert.equal(h.capture(p).absenceApplied,true);assert.equal(h.scope.rosterAbsenceIntakePending_().pendingCaptureCount,0,'a proposal for an existing absence cannot block absence capture');assert.equal(h.scope.rosterAbsenceIntakePending_().pendingPeerCount,1,'standalone peer proposal reserves allocation until its domain projection is durable');assert.deepEqual([...h.scope.rosterAbsenceIntakePending_().peerBlockedDates],[h.f.date]);assert.equal(h.scope.rosterAbsenceIntakePending_(['2026-10-15']).pendingPeerCount,0,'peer fence honors selected dates');
 const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'pending',retryAfterMs:30000,reasonCode:'BACKEND_UNAVAILABLE'});assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0);h.advance(31000);const [retry]=h.scope.rosterAbsenceIntakeClaim_(1);assert.equal(retry.id,p.requestId);
 h.scope.rosterAbsenceIntakeSettle_(retry.id,retry.claimId,{state:'applied',peerState:'applied',mutualRequestIds:['peer-1']});assert.deepEqual([...h.receipt(p).mutualRequestIds],['peer-1']);assert.equal(h.receipt(p).intakeState,'applied');assert.equal(h.scope.rosterAbsenceIntakePending_().pendingPeerCount,0,'domain proposal takes over the allocation protection after projection');
 h.advance(181*86400000);const q=h.command({date:new Date(Date.parse(h.f.date+'T00:00:00Z')+181*86400000).toISOString().slice(0,10)});h.capture(q);const stored=h.journal().entries.find(row=>row.id===p.requestId);assert.equal(stored.command,undefined,'old completed sensitive payload is compacted');assert.equal(h.capture(p).accepted,true,'compacted receipt remains idempotent after the school date changes');assert.deepEqual([...h.receipt(p).mutualRequestIds],['peer-1']);
}
{
 const h=setup(),p=h.command();h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',reasonCode:'ABSENCE_REVIEW_REQUIRED'});assert.equal(h.scope.rosterAbsenceIntakePending_().pendingCaptureCount,1);
 assert.throws(()=>h.scope.rosterAbsenceIntakeRetry_({identity:{email:'bob@gsps.edu.sg',subject:'bob'},input:{requestId:p.requestId}},h.contacts('bob')),e=>e.status===403);h.scope.rosterAbsenceIntakeRetry_(h.req({requestId:p.requestId}),h.c);assert.equal(h.scope.rosterAbsenceIntakeClaim_(1)[0].id,p.requestId);
}
{
 const h=setup(),p=h.command({instructionsNA:false,instructionsByDate:{[h.f.date]:{lesson:'Read worksheet 1.'}}});const receipt=h.capture(p);assert.equal(receipt.instructionState,'pending');const [job]=h.scope.rosterAbsenceIntakeClaim_(1);
 h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'pending',absenceApplied:true,savedIds:['absence-1'],retainClaim:true});assert.equal(h.receipt(p).instructionState,'pending');
 assert.equal(h.scope.rosterAbsenceIntakePending_().pendingPeerCount,0,'instruction-only projection never blocks peer allocation');
 h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',instructionState:'needsReview',instructionCursor:1,peerState:'needsReview',peerCursor:2,reasonCode:'INSTRUCTION_SOURCE_CHANGED'});assert.equal(h.receipt(p).absenceApplied,true);assert.equal(h.receipt(p).instructionState,'needsReview');assert.equal(h.scope.rosterAbsenceIntakePending_().pendingCaptureCount,0);assert.equal(h.scope.rosterAbsenceIntakeVisible_(h.req({}),h.c).entries[0].instructionState,'needsReview');
 h.scope.rosterAbsenceIntakeRetry_(h.req({requestId:p.requestId}),h.c);assert.equal(h.receipt(p).instructionState,'pending');const retried=h.journal().entries.find(row=>row.id===p.requestId);assert.equal(retried.instructionCursor,0,'explicit review retry revisits failed instructions');assert.equal(retried.peerCursor,0,'explicit review retry revisits failed peer choices');assert.equal(retried.peerState,'pending');assert.equal(retried.absenceApplied,true);
 const empty=h.command({instructionsByDate:{[h.f.date]:{lesson:'   '}}});assert.equal(h.capture(empty).instructionState,'none');
}
{
 const h=setup(),acceptedAt=new Date(h.f.date+'T23:59:59+08:00').toISOString();h.at(acceptedAt);h.scope.deployLock_=lock=>{h.advance(2000);return lock.tryLock();};
 const p=h.command(),r=h.capture(p);assert.equal(r.acceptedAt,acceptedAt,'validation and durable receipt use the same pre-lock date across Singapore midnight');assert.equal(h.receipt(p).acceptedAt,acceptedAt);
}
{
 const h=setup(),acceptedAt=new Date(h.f.date+'T23:59:59+08:00').toISOString();h.at(acceptedAt);h.advance(2*86400000);h.f.state.types.find(t=>t.id==='mc').todayOnly=true;
 const p=h.command({trustedIntakeAt:acceptedAt});assert.equal(h.capture(p).acceptedAt,acceptedAt,'D1 receipt date survives delayed forwarding after midnight');assert.equal(h.journal().entries[0].command.trustedIntakeAt,undefined,'trusted bridge metadata is not browser command identity');
 const plain={...p};delete plain.trustedIntakeAt;assert.equal(h.receipt(plain).acceptedAt,acceptedAt);assert.equal(h.capture(plain).replayed,true,'same original browser command recovers the trusted durable receipt');
}
{
 const h=setup();assert.throws(()=>h.capture(h.command({trustedIntakeAt:'yesterday'})),e=>e.status===400);assert.equal(h.writes(),0);
 const future=new Date(h.f.date+'T06:00:00.001+08:00').toISOString(),p=h.command({trustedIntakeAt:future});assert.throws(()=>h.capture(p),e=>e.status===503,'future receipt time waits for backend clock to catch up');h.advance(1);assert.equal(h.capture(p).acceptedAt,future);
}
{
 const h=setup(),p=h.command();h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.advance(80000);
 h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'pending',absenceApplied:true,instructionCursor:4,peerCursor:3,retainClaim:true});h.advance(20000);
 const live=h.scope.rosterAbsenceIntakeGetClaim_(job.id,job.claimId);assert.equal(live.instructionCursor,4);assert.equal(live.peerCursor,3);assert(live.claimExpiresAt>job.claimExpiresAt,'partial durable progress renews the live lease');
 h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'pending',instructionCursor:2,peerCursor:1,retryAfterMs:1000});h.advance(1000);const [retry]=h.scope.rosterAbsenceIntakeClaim_(1);assert.equal(retry.instructionCursor,4,'checkpoint cursors never regress');assert.equal(retry.peerCursor,3);
 for(const instructionCursor of [-1,1.5,Infinity,1000001])assert.throws(()=>h.scope.rosterAbsenceIntakeSettle_(retry.id,retry.claimId,{state:'pending',instructionCursor}),e=>e.status===400);
}
{
 const h=setup(),p=h.command({remarks:'Retain for manual review'});h.capture(p);let [job]=h.scope.rosterAbsenceIntakeClaim_(1);const smc=h.contacts('bob');smc.user.rosterSMC=true;
 const resolve={identity:{email:'bob@gsps.edu.sg',subject:'bob'},input:{operation:'resolveAbsenceIntake',requestId:crypto.randomUUID(),intakeRequestId:p.requestId,resolution:'withdraw',reason:'Duplicate report; original absence confirmed with colleague.'}};
 assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_(resolve,h.contacts('bob')),e=>e.status===403,'browser cannot claim SMC authority');
 assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_(resolve,smc),e=>e.status===409,'live or not-reviewed capture cannot be withdrawn');
 h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',reasonCode:'ABSENCE_REVIEW_REQUIRED'});
 assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_({...resolve,input:{...resolve.input,reason:' '}},smc),e=>e.status===400);
 h.lose();assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_(resolve,smc),/Lost Drive acknowledgement/);const written=h.writes(),r=h.scope.rosterAbsenceIntakeResolve_(resolve,smc);assert.equal(h.writes(),written,'uncertain resolve commit replays one audited outcome');
 assert.equal(r.intakeState,'withdrawn');assert.equal(r.absenceApplied,false);assert.equal(r.resolution.reason,resolve.input.reason);assert.equal(r.resolution.actorName,'Bob');assert.equal(r.resolution.action,'withdraw');assert(!JSON.stringify(r.resolution).includes('bob@'));
 assert.equal(h.journal().entries[0].command.remarks,p.remarks,'withdrawal retains original private command');assert.equal(h.journal().entries[0].resolution.actor,'bob@gsps.edu.sg','audited resolver identity is retained privately');
 assert.equal(h.scope.rosterAbsenceIntakePending_().pendingCaptureCount,0);assert.equal(h.scope.rosterAbsenceIntakeVisible_(h.req({}),h.c).pendingCaptureCount,0);assert.equal(h.scope.rosterAbsenceIntakeClaim_(1).length,0);assert.equal(h.receipt(p).intakeState,'withdrawn');assert.equal(h.capture(p).intakeState,'withdrawn','original capture replay cannot resurrect a withdrawn report');
 assert.throws(()=>h.scope.rosterAbsenceIntakeRetry_(h.req({requestId:p.requestId}),h.c),e=>e.status===409);assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_({...resolve,input:{...resolve.input,reason:'Different reason'}},smc),e=>e.status===409);
 const saved=h.command();h.capture(saved);[job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',absenceApplied:true,savedIds:['real-absence'],peerState:'needsReview'});
 assert.throws(()=>h.scope.rosterAbsenceIntakeResolve_({...resolve,input:{...resolve.input,requestId:crypto.randomUUID(),intakeRequestId:saved.requestId}},smc),e=>e.status===409,'withdrawal cannot erase or dismiss a saved absence');
}
{
 const h=setup(),dates=[0,1,2].map(offset=>new Date(Date.parse(h.f.date+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10));
 // Seed the retained journal directly: old receipts predate the safe failure code.
 const p=h.command({dates,fullDay:true,remarks:'Private original evidence'});h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',reasonCode:'ABSENCE_REVIEW_REQUIRED'});
 h.f.people.push({...h.f.people.find(person=>person.id==='alice'),id:'alice-alias',mobile:'00'+O.mobile(h.f.people.find(person=>person.id==='alice').mobile)});h.f.state.absences=[{id:'partial',staffId:'alice-alias',date:dates[0],periods:[2],typeId:'mc',typeLabel:'Medical leave',reliefRequired:true,reasonDetail:'PRIVATE',instructions:{x:'PRIVATE'},periodSnapshot:[{period:2,startMinutes:480,endMinutes:510}]},{id:'full',staffId:'alice',date:dates[1],coverage:{kind:'fullDay'},periods:[2,3],typeId:'other',typeLabel:'Different leave',reliefRequired:false},{id:'deleted',staffId:'alice',date:dates[2],coverage:{kind:'fullDay'},deletedAt:'now'}];
 const smc=h.contacts('bob');smc.user.rosterSMC=true;const req=h.req({operation:'read',view:'intakeReview',intakeRequestId:p.requestId}),before=JSON.stringify(h.f.state),journal=JSON.stringify(h.journal()),writes=h.writes();
 const review=h.scope.rosterAbsenceIntakeReview_(req,smc);assert.equal(review.readOnly,true);assert.equal(review.failureCode,null);assert.equal(review.absenceApplied,false);assert.equal(review.requested.coverage.kind,'fullDay');assert.deepEqual([...review.teachers[0].missingDates],[dates[2]]);assert.equal(review.teachers[0].dates[0].savedEntries[0].staffId,'alice-alias','same-mobile identity bridge does not invent a missing date');assert.equal(review.teachers[0].dates[0].savedEntries[0].coverage,null,'period-only saved record is not represented as a full day');assert.deepEqual([...review.teachers[0].dates[0].savedEntries[0].periods],[2]);assert.equal(review.teachers[0].dates[1].savedEntries[0].reliefRequired,false);assert.equal(review.teachers[0].dates[1].savedEntries[0].typeId,'other');assert(!JSON.stringify(review).includes('PRIVATE'));assert.equal(JSON.stringify(h.f.state),before);assert.equal(JSON.stringify(h.journal()),journal);assert.equal(h.writes(),writes);assert.equal(h.scope.rosterAbsenceIntakePending_().pendingCaptureCount,1,'inspection cannot bypass the allocation safety gate');
 h.scope.rosterOperationsState_=()=>{throw Error('Teacher must be rejected before reading private register');};h.scope.rosterOperationsState_=()=>{throw Error('Teacher must be rejected before reading private register');};assert.throws(()=>h.scope.rosterAbsenceIntakeReview_(req,h.c),e=>e.status===403);
}
{
 const h=setup(),p=h.command();h.capture(p);const [job]=h.scope.rosterAbsenceIntakeClaim_(1);assert.throws(()=>h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',failureCode:'PRIVATE_EXCEPTION_TEXT'}),e=>e.status===400);h.scope.rosterAbsenceIntakeSettle_(job.id,job.claimId,{state:'needsReview',reasonCode:'ABSENCE_REVIEW_REQUIRED',failureCode:'ABSENCE_OVERLAP'});assert.equal(h.receipt(p).failureCode,'ABSENCE_OVERLAP');assert.equal(h.scope.rosterAbsenceIntakeVisible_(h.req({}),h.c).entries[0].failureCode,'ABSENCE_OVERLAP');h.scope.rosterAbsenceIntakeRetry_(h.req({requestId:p.requestId}),h.c);assert.equal(h.receipt(p).failureCode,null,'a retried report does not retain a stale failure');
}
console.log('PASS independent durable absence intake: allocator isolation, exact replay, trusted midnight capture, leased checkpoints, audited recovery, read-only SMC review and private visibility.');

}
