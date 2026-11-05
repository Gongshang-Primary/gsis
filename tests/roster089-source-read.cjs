'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {harness,decode}=require('./roster097-batch-backend.cjs'),O=require('../shared/roster-operations.js'),S=require('../shared/roster-statistics.js');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
{
 const h=harness(),base=h.call({stage:'baseline'}),before=decode(base),reads=h.modelReads.length;
 h.index.revision++;h.index.entries[2].name='Unrelated historic rename';
 const same=h.call({stage:'baseline',knownSourceKey:base.sourceKey});assert(same.unchanged);assert.equal(h.modelReads.length,reads);assert(!('data' in same));
 h.setDate('2026-10-22');const next=h.call({stage:'baseline',knownModelKeys:before.modelKeys}),delta=decode(next);
 assert.equal(next.baselineKey,base.baselineKey);assert.notEqual(next.sourceKey,base.sourceKey);assert(delta.delta);assert.equal(delta.models.length,0);assert.equal(delta.dates[0].date,'2026-10-22');assert.equal(h.modelReads.length,reads,'rollover reuses all overlapping immutable models');
 h.index.entries[1].modelFile='model-b-v2';const changed=decode(h.call({stage:'baseline',knownModelKeys:before.modelKeys}));assert.deepEqual(changed.models.map(m=>m.id),['next']);assert.equal(h.modelReads.length,reads+1);assert.equal(changed.modelKeys.base,before.modelKeys.base);assert.notEqual(changed.modelKeys.next,before.modelKeys.next);
}
{
 const h=harness();h.record(h.today,{confirmed:true});h.scope.rosterTimetableBatchCommitEnd_(h.scope.rosterTimetableBatchCommitBegin_(h.state));
 const manifest=h.call({stage:'baseline',manifestOnly:true});assert(manifest.manifestOnly);assert.equal(h.modelReads.length,0);assert.equal(h.operationReads(),0);assert(!('data' in manifest));
 const baseline=h.call({stage:'baseline',expectedSourceKey:manifest.sourceKey});assert.equal(baseline.sourceKey,manifest.sourceKey);
 const suspended=h.call({stage:'suspended',baselineKey:baseline.baselineKey,baselineSourceKey:baseline.sourceKey,manifestOnly:true});assert.equal(h.operationReads(),0);assert(suspended.sourceKey&&suspended.authorityKey);
 const full=h.call({stage:'suspended',baselineKey:baseline.baselineKey,baselineSourceKey:baseline.sourceKey,expectedSourceKey:suspended.sourceKey});const plan=decode(full).plans[0];assert.equal(plan.baselineContentKey,null);assert.equal(plan.timetableDay.baselineId,plan.plan.id);
 h.contacts.user.rosterSMC=false;const teacher=h.call({stage:'suspended',baselineKey:baseline.baselineKey,manifestOnly:true});assert.notEqual(teacher.authorityKey,suspended.authorityKey);assert.notEqual(teacher.sourceKey,suspended.sourceKey);
 assert.throws(()=>h.call({stage:'suspended',baselineKey:baseline.baselineKey,expectedSourceKey:suspended.sourceKey}),e=>e.code==='TIMETABLE_BATCH_CHANGED');
 h.state.staplerPlans[0].revision++;h.scope.rosterTimetableBatchCommitBegin_(h.state);assert.equal(h.call({stage:'suspended',baselineKey:baseline.baselineKey,manifestOnly:true}).sourceKey,null,'pending commit cannot authorise an R2 hit');
}
{
 const properties=new Map(),cache=new Map(),state=O.initial();state.revision=5;state.statisticsTrackingFrom='2026-10-22';
 let reads=0,projections=0,skipTransport=[],authority={email:'smc@example.test',staffId:'smc',smc:true,admin:false};
 const blob=x=>({getBytes:()=>Buffer.from(x)}),scope=vm.createContext({rosterToday_:()=> '2026-10-22',GSISRosterStatistics:{...S,project:(...args)=>{projections++;return S.project(...args);}},props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)}),CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},rosterOperationsAuthority_:()=>authority,rosterOperationsState_:skip=>{reads++;skipTransport.push(skip);return copy(state);},rosterOperationsPlanDigest_:digest,error_:(status,message)=>{throw Object.assign(Error(message),{status});},Utilities:{formatDate:()=> '2026-10-22',newBlob:blob,gzip:b=>blob(zlib.gzipSync(b.getBytes())),base64Encode:b=>Buffer.from(b).toString('base64')}});
 vm.runInContext(fs.readFileSync('backend/RosterStatistics.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterTimetableBatch.gs','utf8'),scope);const people=[{id:'a',name:'Ada',active:true}],call=p=>scope.rosterStatisticsRead_({identity:{},input:{from:'2026-10-22',to:'2026-10-22',encoding:'gzip-base64-v1',...p}},{rosterPeople:people});
 const mark=()=>scope.rosterTimetableBatchCommitEnd_(scope.rosterTimetableBatchCommitBegin_(state));mark();
 const first=call({});assert.equal(reads,1);assert.equal(projections,1);assert.deepEqual(skipTransport,[true]);
 assert(call({knownKey:first.key}).unchanged);assert.equal(reads,1);assert.equal(projections,1,'unchanged marker skips state, joins, and projection');
 const cached=call({});assert.equal(cached.data,first.data);assert.equal(reads,1);assert.equal(projections,1,'second viewer reuses compressed summary');
 state.revision++;state.outbox.push({id:'delivery',status:'uncertain'});state.acknowledgements.push({id:'ack'});mark();assert(call({knownKey:first.key}).unchanged);assert.equal(reads,1);
 state.absences.push({id:'absence',date:'2026-10-22',staffId:'a',periods:[1],typeLabel:'Medical'});mark();const second=call({knownKey:first.key});assert(!second.unchanged);assert.equal(projections,2);assert.equal(reads,2);assert.equal(JSON.parse(zlib.gunzipSync(Buffer.from(second.data,'base64'))).absenceRows.length,1);
 people[0].name='Ada new name';const renamed=call({knownKey:second.key});assert.notEqual(renamed.key,second.key);assert.equal(projections,3);
 // A crash between begin and commit does not advertise uncommitted source state.
 state.revision++;properties.set('ROSTER_TIMETABLE_CACHE',JSON.stringify({schema:2,ready:true,source:scope.rosterTimetableBatchStamp_(state),statisticsReady:false,statisticsSource:scope.rosterStatisticsStamp_(state),statisticsRevision:state.revision}));const pending=call({knownKey:renamed.key});assert(pending.unchanged);assert.equal(reads,4,'pending marker falls back to durable state');assert.equal(projections,3);
 properties.set('ROSTER_TIMETABLE_CACHE','broken');call({knownKey:renamed.key});assert.equal(reads,5);
 authority={smc:false,admin:false};assert.throws(()=>call({}),e=>e.status===403);assert.equal(reads,5,'authority denied before marker/state reuse');
}
{
 const state=O.initial(),requestId=crypto.randomUUID(),command={operation:'saveAbsence',requestId,date:'2026-10-22',staffId:'a',periods:[1]},email='a@example.test';
 let overlays=0,reads=0;const scope=vm.createContext({GSISRosterOperations:O,props_:()=>({getProperty:()=> 'operations'}),rosterReadFile_:()=>{reads++;return JSON.stringify(state);},rosterNotificationOverlay_:()=>{overlays++;throw Error('Receipt must not load transport');},rosterOperationsAuthority_:()=>({email,staffId:'a'}),error_:(status,message)=>{throw Object.assign(Error(message),{status});},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]}});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);scope.rosterOperationsAuthority_=()=>({email,staffId:'a'});
 state.receipts.push({id:requestId,actor:email,digest:scope.rosterOperationsCommandDigest_(command),revision:1,at:'2026-10-22T00:00:00Z',result:{savedIds:['absence']}});
 const req={identity:{email},input:{command}},result=scope.rosterOperationsReceipt_(req,{});assert(result.accepted);assert.equal(result.savedIds[0],'absence');assert.equal(reads,1);assert.equal(overlays,0);
 assert.throws(()=>scope.rosterOperationsReceipt_({...req,input:{command:{...command,periods:[2]}}},{}),e=>e.status===409);
 assert.equal(scope.rosterOperationsReceipt_({...req,input:{command:{...command,requestId:crypto.randomUUID()}}},{}).confirmation,'unconfirmed');assert.equal(overlays,0);
}
console.log('PASS v0.8.9 immutable model deltas, manifest-only scoped cache contract, source-key statistics reuse, pending-marker recovery, and transport-free receipt confirmation.');
{
 const h=harness(),responses=Array.from({length:30},()=>h.call({stage:'baseline'})),base=decode(responses[0]);
 assert.equal(h.modelReads.length,2,'thirty same-scope readers share the optional cached immutable envelope');
 h.setDate('2026-10-22');const wire=h.call({stage:'baseline',knownModelKeys:base.modelKeys}),delta=decode(wire);
 assert.equal(delta.models.length,0);assert(wire.bytes<responses[0].bytes);
 console.log(JSON.stringify({scenario:'30 warm shared baseline reads + day rollover',viewers:30,modelsRead:h.modelReads.length,baselineDecodedBytes:responses[0].bytes,rolloverDecodedBytes:wire.bytes,rolloverModelPayloadBytes:0}));
}
{
 const h=harness();vm.runInContext(fs.readFileSync('backend/RosterStatistics.gs','utf8'),h.scope);
 let writes=0;const oldProps=h.scope.props_;h.scope.props_=()=>{const p=oldProps();return {...p,setProperty:(k,v)=>{writes++;return p.setProperty(k,v);}};};
 h.scope.rosterTimetableBatchCommitEnd_(h.scope.rosterTimetableBatchCommitBegin_(h.state));assert.equal(writes,2,'one pending+ready ticket, not two domains worth of writes');
 h.state.revision++;h.state.acknowledgements.push({id:'ack'});assert.equal(h.scope.rosterTimetableBatchCommitBegin_(h.state),null);assert.equal(writes,2,'unrelated write adds no property mutations');
 h.state.absences.push({id:'a',staffId:'alice',date:h.today,periods:[2]});h.state.revision++;
 let ticket=h.scope.rosterTimetableBatchCommitBegin_(h.state);assert.equal(ticket.ready,true);assert.equal(ticket.statisticsReady,false);assert(h.scope.rosterTimetableBatchMarker_(),'statistics-only pending commit keeps timetable source ready');assert.equal(h.scope.rosterStatisticsMarker_(),null);h.scope.rosterTimetableBatchCommitEnd_(ticket);assert.equal(writes,4);
 h.record(h.today,{confirmed:true});ticket=h.scope.rosterTimetableBatchCommitBegin_(h.state);assert.equal(ticket.ready,false);assert.equal(ticket.statisticsReady,true);assert(h.scope.rosterStatisticsMarker_(),'timetable-only pending commit keeps statistics ready');h.scope.rosterTimetableBatchCommitEnd_(ticket);assert.equal(writes,6);
 const sample=O.initial();sample.absences=Array.from({length:1000},(_,i)=>({id:'a'+i,staffId:'staff'+i%150,date:'2026-10-22',periods:[1,2,3],typeLabel:'Medical',coverage:{kind:'fullDay'},reportedAt:'2026-10-22T00:00:00Z'}));sample.assignments=Array.from({length:4000},(_,i)=>({id:'d'+i,staffId:'staff'+i%150,date:'2026-10-22',period:i%17,status:'completed',subject:'PAL',className:'3A',venue:'C1-01',origin:'smc'}));
 const samples=[];for(let i=0;i<30;i++){const start=performance.now();h.scope.rosterStatisticsStamp_(sample);samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);
 console.log(JSON.stringify({scenario:'Node VM source-digest CPU only (not Apps Script/network latency)',absences:1000,assignments:4000,inputBytes:Buffer.byteLength(JSON.stringify(sample)),p50Ms:+samples[15].toFixed(2),p95Ms:+samples[28].toFixed(2),markerWritesPerChangedCommit:2,markerWritesPerUnrelatedCommit:0}));
}
