'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module'),zlib=require('node:zlib');
const source=fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8'),box={require:createRequire(path.resolve('tests/roster096-absence-adapter.cjs')),console};
vm.runInNewContext(source.slice(0,source.indexOf('const reject='))+'\nthis.adapter=adapter;',box);
{
 const h=box.adapter(),reads=[],p=h.command('alice',{view:'report'});let delivery='sent';
 h.scope.rosterNotificationOverlay_=state=>{reads.push(h.counts().locked?'locked':'unlocked');state.deliveryReview={fixtureStatus:delivery};return state;};
 const accepted=h.call(p),state=h.state();assert.deepEqual(reads,['locked'],'preparation does not fetch delivery state; commit still reads it fresh');
 assert.equal(h.counts().reads,2,'both authoritative primary-state reads remain');assert.equal(h.counts().contexts,1);assert.equal(h.counts().writes,1);assert.equal(state.deliveryReview.fixtureStatus,'sent');
 const firstCounts=h.counts();delivery='delivered';reads.length=0;let projectedStatus;
 const operations=h.scope.GSISRosterOperations;h.scope.GSISRosterOperations={...operations,view:(s,...args)=>{projectedStatus=s.deliveryReview.fixtureStatus;return operations.view(s,...args);}};
 const replay=h.call(p);assert.equal(replay.replayed,true);assert.equal(projectedStatus,'delivered','receipt replay projects the current delivery overlay');assert.deepEqual(reads,['unlocked']);assert.equal(h.counts().writes,1);
 assert.deepEqual(Array.from(replay.savedIds),Array.from(accepted.savedIds));
 console.log(JSON.stringify({scenario:'offline Report Absence adapter; not production timings',newSave:{primaryReads:firstCounts.reads,deliveryReads:1,previousDeliveryReads:2,contexts:firstCounts.contexts,writes:firstCounts.writes,responseBytes:Buffer.byteLength(JSON.stringify(accepted))},exactReplay:{primaryReads:h.counts().reads-firstCounts.reads,deliveryReads:reads.length,writes:h.counts().writes-firstCounts.writes}}));
}
{
 const h=box.adapter(),scope=h.scope,state=h.state(),counts={validation:0,compression:0};
 const blob=value=>({getBytes:()=>Buffer.from(value),getDataAsString:()=>Buffer.from(value).toString()});
 Object.assign(scope.Utilities,{newBlob:blob,gzip:b=>{counts.compression++;return blob(zlib.gzipSync(b.getBytes()));},base64Encode:b=>Buffer.from(b).toString('base64')});
 scope.GSISRosterStapler={validationVersion:1,validate:()=>counts.validation++};
 const row=(date,id)=>({date,id,baselineId:'baseline',revision:1,draft:{schema:1,date,baselineId:'baseline',tiles:Array.from({length:300},(_,n)=>({id:id+n,period:n%17,subject:'EL',className:'4A'}))}});
 state.staplerPlans=[row(h.date,'current'),row('2026-09-01','historic'),row('2026-11-02','future')];state.staplerArchives=[row('2026-08-01','archive')];
 const key=scope.rosterAbsenceContextKey_(state,h.ctx);assert.deepEqual(counts,{validation:0,compression:0},'source proof hashes relevant source data without creating generated packages');
 state.staplerArchives[0].draft.tiles[0].subject='SC';state.staplerPlans[1].draft.tiles[0].subject='MA';assert.equal(scope.rosterAbsenceContextKey_(state,h.ctx),key,'unrelated dates never alter absence context');
 state.staplerPlans[0].draft.tiles[0].subject='MA';assert.notEqual(scope.rosterAbsenceContextKey_(state,h.ctx),key,'a relevant plan edit still invalidates preparation');
 counts.validation=0;counts.compression=0;scope.rosterOperationsPackPlans_(state);assert.deepEqual(counts,{validation:4,compression:4},'full durable commit still validates and packs the complete document');
 console.log(JSON.stringify({scenario:'offline context-proof work with four plain stored plans',previousPlansPackedPerProof:4,plansPackedPerProof:0,fullCommitPlansPacked:4}));
}
console.log('PASS absence save cost: skip duplicate delivery read, retain fresh commit/replay overlays and scope only the preparation plan proof.');
