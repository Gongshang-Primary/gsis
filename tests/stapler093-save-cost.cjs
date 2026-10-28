'use strict';
// Signed requests, fresh Apps Script VMs and the production commit helpers.
// Local counts/times describe this fixture, not Google or gateway latency.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),{performance}=require('node:perf_hooks');
const {harness,fixture}=require('./stapler715-persistence.cjs'),S=require('../shared/roster-stapler.js');
const copy=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),f=fixture(),h=harness(f.day,f.people);
let counts,seedMarker=false;
function inspect(scope){
 for(const file of ['backend/RosterTimetableBatch.gs','backend/RosterVenues.gs'])vm.runInContext(fs.readFileSync(file,'utf8'),scope);
 scope.rosterVenuesConfig_=()=>({url:'fixture',secret:'fixture'});scope.rosterVenuesCall_=()=>{counts.venueCalls++;};scope.rosterIndex_=()=>({entries:[]});scope.venuesSourceHash_=value=>hash(JSON.stringify(value));
 if(seedMarker){const state=scope.rosterOperationsState_(true);scope.props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify({schema:1,status:'ready',revision:'fixture-source',indexStamp:scope.rosterVenuesIndexStamp_({entries:[]}),operationsStamp:scope.rosterVenuesOperationsStamp_(state)}));seedMarker=false;}
 for(const name of ['gzip','ungzip']){const original=scope.Utilities[name];scope.Utilities[name]=(...args)=>{counts[name]++;return original(...args);};}
 const digest=scope.Utilities.computeDigest;scope.Utilities.computeDigest=(kind,value)=>{counts.hashChars+=value.length;return digest(kind,value);};
 scope.rosterOperationsPhase_=(name,fn)=>{const start=performance.now();try{return fn();}finally{const row=counts.phases[name]||(counts.phases[name]={calls:0,ms:0});row.calls++;row.ms+=performance.now()-start;}};
}
function call(operation,fields={},options={}){
 const state=h.state(),command={operation,view:'stapler',date:f.day.date,revision:state.revision,staplerRevision:state.staplerPlans.find(r=>r.date===f.day.date)?.revision||0,requestId:crypto.randomUUID(),...fields};
 counts={gzip:0,ungzip:0,hashChars:0,venueCalls:0,phases:{}};const start=performance.now(),response=h.call(command,{inspect,...options});counts.elapsedMs=performance.now()-start;
 assert.equal(response.result.ok,true,response.result.error);return {data:response.result.data,command,counts:copy(counts)};
}
try{
 call('saveStapler',{plan:f.plan});call('confirmStapler');const stored=h.state(),original=stored.staplerPlans[0];
 // A retained history of large confirmed dates must not be inflated by one
 // current draft edit. These rows have no derived package to migrate.
 for(let n=1;n<=8;n++){
  const row=copy(original),date='2026-09-'+String(n).padStart(2,'0');row.date=date;delete row.timetablePackage;
  for(const field of ['draft','published','confirmedPlan']){const packed=row[field];if(packed?.encoding!=='gzip-base64-v1')continue;const plan=JSON.parse(zlib.gunzipSync(Buffer.from(packed.data,'base64')));plan.date=date;const json=JSON.stringify(plan);packed.data=zlib.gzipSync(json).toString('base64');packed.bytes=Buffer.byteLength(json);packed.validation={...packed.validation,date,digest:hash(json)};}
  stored.staplerPlans.push(row);
 }
 h.replace(stored);seedMarker=true;const loaded=call('stapler').data,confirmedBefore=copy(h.state().staplerPlans[0].timetablePackage.confirmed),tile=loaded.plan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid');
 const edited=S.apply(loaded.plan,{type:'edit',tileId:tile.id,patch:{venue:'Saved latest room'}}),saved=call('saveStapler',{plan:edited,basePlan:loaded.plan}),savedState=h.state();
 console.log(JSON.stringify({scenario:'104 teachers, one edited draft, eight retained confirmed dates',...saved.counts}));
 assert.equal(saved.counts.ungzip,1,'saving one draft must not inflate unrelated confirmed dates for the Venues source stamp');
 assert.equal(saved.counts.gzip,2,'one primary plan and one changed draft package are compressed; the unchanged confirmed part is reused');
 assert.deepEqual(savedState.staplerPlans[0].timetablePackage.confirmed,confirmedBefore,'an unconfirmed draft edit preserves the exact confirmed preload bytes');
 assert.equal(saved.counts.venueCalls,0,'a draft edit does not change room occupancy or make remote fence calls');
 const writes=h.writes(),replay=call('saveStapler',saved.command).data;assert.equal(replay.replayed,true);assert.equal(h.writes(),writes);
 assert.equal(call('stapler').data.plan.tiles.find(t=>t.id===tile.id).venue,'Saved latest room','fresh runtime readback retains the edit');
 assert.equal(call('receiptStatus',{command:saved.command}).data.accepted,true);
 const next=call('stapler').data.plan,changed=S.apply(next,{type:'edit',tileId:tile.id,patch:{venue:'Saved despite lost response'}}),uncertain={operation:'saveStapler',view:'stapler',date:f.day.date,revision:h.state().revision,staplerRevision:savedState.staplerPlans[0].revision,requestId:crypto.randomUUID(),plan:changed,basePlan:next};
 h.loseResponse();counts={gzip:0,ungzip:0,hashChars:0,venueCalls:0,phases:{}};assert.equal(h.call(uncertain,{inspect}).result.ok,false);
 const afterLost=h.writes();assert.equal(call('receiptStatus',{command:uncertain}).data.accepted,true);assert.equal(call('saveStapler',uncertain).data.replayed,true);assert.equal(h.writes(),afterLost);assert.equal(call('stapler').data.plan.tiles.find(t=>t.id===tile.id).venue,'Saved despite lost response');
 console.log('PASS full-stack Stapler save cost: unchanged confirmations stay compressed, durable exact receipt replay, fresh readback and lost-ack recovery.');
}finally{h.close();}
