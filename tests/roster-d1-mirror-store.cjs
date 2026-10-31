'use strict';
const assert=require('node:assert/strict');
const database=require('./helpers/chunked-import-db.cjs');
const Store=require('../shared/edge-store.js');
const Mirror=require('../shared/roster-mirror.js');
async function active(db,scope,state){const s=Store.open(db,scope),d=await Store.digest(state);await s.importState({state,actor:'admin',requestId:'import-'+scope,digest:d});const h=await s.head();await s.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'admin',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});return s;}
async function main(){
 const db=database();await Mirror.ensure(db);assert.equal((await Mirror.capture(db)).enabled,false);
 const roster=await active(db,'roster',{revision:1,days:[{date:'2026-10-31',note:'first'}]}),register=await active(db,'roster-register',{revision:1,entries:[]});
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_outbox').get().n,2);
 db.sql.prepare('DELETE FROM gsis_roster_mirror_outbox').run();const unmirrored=await Mirror.status(db);assert.equal(unmirrored.pendingCount,1);assert(unmirrored.lagMs>0,'pre-upgrade active heads still report missing backup');
 db.sql.prepare("INSERT INTO gsis_roster_mirror_outbox(scope,revision,created_at) SELECT scope,revision,updated_at FROM gsis_edge_heads WHERE mode='active'").run();
 let before=await roster.load();await roster.commit({before:before.state,after:{...before.state,revision:2},expectedRevision:before.revision,actor:'admin',requestId:'write',digest:await Store.digest('write'),result:{saved:true}});
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_outbox WHERE scope='roster'").get().n,2);
 const generation=await Mirror.capture(db);assert.equal(generation.recordCount,7);assert(generation.receiptCount>=3);assert.equal(generation.revisions.roster,3);
 before=await roster.load();await roster.commit({before:before.state,after:{...before.state,revision:3},expectedRevision:before.revision,actor:'admin',requestId:'later',digest:await Store.digest('later'),result:{saved:true}});
 const page=await Mirror.page(db,generation.id,{cursor:0,leaseToken:generation.leaseToken,limit:100,maxBytes:200000});assert(page.items.length>0);assert(page.done);assert(page.items.some(x=>x.kind==='record'&&x.payload.collection==='revision'&&JSON.parse(x.payload.value_json).value===2));
 assert(!page.items.some(x=>x.kind==='receipt'&&x.payload.request_id==='later'),'immutable generation excludes later commit');
 await assert.rejects(Mirror.advance(db,generation.id,{leaseToken:generation.leaseToken,cursor:0,next:page.next,digest:'0'.repeat(64),proof:{}}),e=>e.code==='ROSTER_MIRROR_PAGE');
 await Mirror.advance(db,generation.id,{leaseToken:generation.leaseToken,cursor:0,next:page.next,digest:page.digest,proof:{generationId:generation.id,cursor:0,next:page.next,digest:page.digest}});
 const proof={verified:true,generationId:generation.id,epoch:generation.epoch,revisions:generation.revisions,transportRevision:generation.transportRevision,snapshotDigest:page.snapshotDigest,manifestDigest:'a'.repeat(64)};
 await Mirror.acknowledge(db,generation.id,{leaseToken:generation.leaseToken,...proof});assert((await Mirror.status(db)).lagMs>=0);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_outbox WHERE generation_id IS NULL").get().n,1);
 const release=await Mirror.beginRelease(db,'release-1');assert.equal(release.phase,'quiescing');before=await roster.load();await assert.rejects(roster.commit({before:before.state,after:before.state,expectedRevision:before.revision,actor:'admin',requestId:'blocked',digest:await Store.digest('blocked')}),e=>e.code==='ROSTER_MIRROR_WRITES_PAUSED');
 await Mirror.sealRelease(db,'release-1');assert.equal((await roster.head()).mode,'paused');assert.equal((await register.head()).mode,'paused');await assert.rejects(Mirror.finishRelease(db,'release-1',{generationId:generation.id,manifestDigest:'a'.repeat(64)}));
 const final=await Mirror.capture(db);let cursor=0,digest=final.snapshotDigest;while(cursor<final.totalCount){const p=await Mirror.page(db,final.id,{cursor,leaseToken:final.leaseToken,limit:100,maxBytes:200000});await Mirror.advance(db,final.id,{leaseToken:final.leaseToken,cursor,next:p.next,digest:p.digest,proof:{generationId:final.id,cursor,next:p.next,digest:p.digest}});cursor=p.next;digest=p.snapshotDigest;}
 await Mirror.acknowledge(db,final.id,{leaseToken:final.leaseToken,verified:true,generationId:final.id,epoch:final.epoch,revisions:final.revisions,transportRevision:final.transportRevision,snapshotDigest:digest,manifestDigest:'b'.repeat(64)});
 await Mirror.finishRelease(db,'release-1',{generationId:final.id,manifestDigest:'b'.repeat(64)});assert.equal((await Mirror.status(db)).phase,'released');
 await cleanupSafety();await cancelSafety();await transportSafety();await boundedSnapshot();
 console.log('PASS D1 mirror store: atomic outbox, immutable snapshot, page proofs, lag, release fencing and verified catch-up');
}
async function cleanupSafety(){
 const db=database();await Mirror.ensure(db);
 for(let n=1;n<=5;n++){
  const state=n===5?'captured':'mirrored';db.sql.prepare('INSERT INTO gsis_roster_mirror_generations(id,epoch,roster_revision,register_revision,transport_revision,record_count,receipt_count,transport_count,created_at,state,initial_digest,snapshot_digest,mirrored_at) VALUES(?,1,1,1,0,3,0,0,?,?,?, ?,?)').run('g'+n,n,state,'a'.repeat(64),'b'.repeat(64),n);
  for(let i=1;i<=3;i++)db.sql.prepare("INSERT INTO gsis_roster_mirror_items VALUES(?,?,'record','roster','{}')").run('g'+n,i);
  db.sql.prepare("INSERT INTO gsis_roster_mirror_pages VALUES(?,0,3,'digest','chain','{}')").run('g'+n);
 }
 let removed=0;for(let i=0;i<6;i++){const result=await Mirror.cleanup(db,2),count=result.itemsRemoved+result.pageReceiptsRemoved;assert(count<=2);removed+=count;}
 assert.equal(removed,8);assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_generations').get().n,5,'all proof metadata remains');assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_items WHERE generation_id IN ('g1','g2')").get().n,0);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_items WHERE generation_id IN ('g3','g4','g5')").get().n,9,'two verified generations and active capture remain');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_edge_records').get().n,0);
}
async function cancelSafety(){
 const db=database(),roster=await active(db,'roster',{revision:0});await active(db,'roster-register',{revision:0});const g=await Mirror.capture(db),before=await roster.load();const release=await Mirror.beginRelease(db,'cancel-me');const cancelled=await Mirror.cancelRelease(db,'cancel-me');assert.equal(cancelled.phase,'normal');assert(cancelled.epoch>release.epoch);assert.equal((await roster.load()).revision,before.revision);await Mirror.cancelRelease(db,'cancel-me');
 await roster.commit({before:before.state,after:{revision:1},expectedRevision:before.revision,actor:'a',requestId:'after-cancel',digest:await Store.digest('after-cancel')});await assert.rejects(Mirror.page(db,g.id,{cursor:0,leaseToken:g.leaseToken}),e=>e.code==='ROSTER_MIRROR_LEASE');await Mirror.beginRelease(db,'sealed');await Mirror.sealRelease(db,'sealed');await assert.rejects(Mirror.cancelRelease(db,'sealed'),e=>e.code==='ROSTER_RELEASE_STATE');
}
async function transportSafety(){
 const db=database();await Mirror.ensure(db);const roster=await active(db,'roster',{revision:0}),register=await active(db,'roster-register',{revision:0});
 db.sql.exec("CREATE TABLE gsis_absence_transport(namespace TEXT,actor TEXT,request_id TEXT,state TEXT,command TEXT,PRIMARY KEY(namespace,actor,request_id))");await Mirror.ensure(db);
 db.sql.prepare("INSERT INTO gsis_absence_transport VALUES('school','a','one','queued','original')").run();
 assert.equal((await Mirror.status(db)).transportRevision,1);const first=await Mirror.capture(db);
 db.sql.prepare("UPDATE gsis_absence_transport SET command='new' WHERE request_id='one'").run();assert.equal((await Mirror.status(db)).transportRevision,2);
 const p=await Mirror.page(db,first.id,{cursor:0,leaseToken:first.leaseToken,limit:100});assert.equal(p.items.find(x=>x.kind==='transport').payload.command,'original');await Mirror.advance(db,first.id,{cursor:0,next:p.next,digest:p.digest,leaseToken:first.leaseToken,proof:{generationId:first.id,cursor:0,next:p.next,digest:p.digest}});
 const beforeOutbox=db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_outbox').get().n,loaded=await roster.load();db.onBatch(()=>{throw Error('transaction unavailable');});await assert.rejects(roster.commit({before:loaded.state,after:{revision:1},expectedRevision:loaded.revision,actor:'a',requestId:'fail',digest:await Store.digest('fail')}));assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_outbox').get().n,beforeOutbox);
 await Mirror.beginRelease(db,'release');await assert.rejects(Mirror.acknowledge(db,first.id,{leaseToken:first.leaseToken,verified:true,generationId:first.id,epoch:first.epoch,revisions:first.revisions,transportRevision:first.transportRevision,snapshotDigest:p.snapshotDigest,manifestDigest:'a'.repeat(64)}));
 assert.throws(()=>db.sql.prepare("INSERT INTO gsis_absence_transport VALUES('school','b','two','queued','late')").run(),/PAUSED/);
 db.sql.prepare("UPDATE gsis_absence_transport SET state='claimed' WHERE request_id='one'").run();await assert.rejects(Mirror.sealRelease(db,'release'),e=>e.code==='ROSTER_RELEASE_INFLIGHT');db.sql.prepare("UPDATE gsis_absence_transport SET state='forwarded' WHERE request_id='one'").run();await Mirror.sealRelease(db,'release');assert.throws(()=>db.sql.prepare("UPDATE gsis_absence_transport SET state='queued'").run(),/PAUSED/);
 const deployment=await active(db,'deploy',{revision:0});const d=await deployment.load();await deployment.commit({before:d.state,after:{revision:1},expectedRevision:d.revision,actor:'a',requestId:'independent',digest:await Store.digest('deploy')});
 assert.equal((await register.head()).mode,'paused');
 const final=await Mirror.capture(db);const finalPage=await Mirror.page(db,final.id,{cursor:0,leaseToken:final.leaseToken,limit:100});await Mirror.advance(db,final.id,{cursor:0,next:finalPage.next,digest:finalPage.digest,leaseToken:final.leaseToken,proof:{generationId:final.id,cursor:0,next:finalPage.next,digest:finalPage.digest}});
 await Mirror.acknowledge(db,final.id,{verified:true,generationId:final.id,epoch:final.epoch,revisions:final.revisions,transportRevision:final.transportRevision,snapshotDigest:finalPage.snapshotDigest,manifestDigest:'f'.repeat(64),leaseToken:final.leaseToken});await Mirror.finishRelease(db,'release',{generationId:final.id,manifestDigest:'f'.repeat(64)});
 const beforeLegacy=(await Mirror.status(db)).transportRevision;db.sql.prepare("INSERT INTO gsis_absence_transport VALUES('school','legacy','after','queued','legacy')").run();assert.equal((await Mirror.status(db)).transportRevision,beforeLegacy,'Google-first transport remains usable after release without D1 mirror traffic');
} 
async function boundedSnapshot(){
 const db=database();const source={revision:0,rows:Array.from({length:15},(_,i)=>({id:'large-'+i,text:'x'.repeat(940000)}))};await active(db,'roster',source);await active(db,'roster-register',{revision:0});const g=await Mirror.capture(db);let cursor=0,total=0,digest=g.snapshotDigest;const memoryBefore=process.memoryUsage().heapUsed;
 while(cursor<g.totalCount){const p=await Mirror.page(db,g.id,{cursor,leaseToken:g.leaseToken,limit:1000,maxBytes:300000});assert(Buffer.byteLength(JSON.stringify(p.items))<2000000,'bounded database query returns at most one oversized source row');const accepted=await Mirror.advance(db,g.id,{cursor,next:p.next,digest:p.digest,leaseToken:g.leaseToken,proof:{generationId:g.id,cursor,next:p.next,digest:p.digest}});assert.equal(accepted.cursor,p.next);const replay=await Mirror.advance(db,g.id,{cursor,next:p.next,digest:p.digest,leaseToken:g.leaseToken,proof:{generationId:g.id,cursor,next:p.next,digest:p.digest}});assert.equal(replay.cursor,p.next);cursor=p.next;digest=p.snapshotDigest;total+=p.items.length;}
 assert.equal(total,g.totalCount);assert(validDigest(digest));const delta=process.memoryUsage().heapUsed-memoryBefore;console.log(JSON.stringify({mirrorFixtureChars:JSON.stringify(source).length,rows:total,heapDelta:delta}));
 await Mirror.releaseLease(db,g.id,g.leaseToken);const resumed=await Mirror.capture(db);assert.equal(resumed.id,g.id);assert.equal(resumed.cursor,g.totalCount);assert.notEqual(resumed.leaseToken,g.leaseToken);
 await assert.rejects(Mirror.advance(db,g.id,{cursor:0,next:1,digest:'a'.repeat(64),leaseToken:g.leaseToken,proof:{}}),e=>e.code==='ROSTER_MIRROR_LEASE','a stale execution cannot acquire the new lease through replay');
}
function validDigest(v){return /^[a-f0-9]{64}$/.test(v);}
main().catch(e=>{console.error(e);process.exitCode=1;});
