import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
let api=null;try{api=await import('../shared/roster-quota-snapshot.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
assert(api,'the immutable publication quota snapshot store is implemented');
const {writeQuotaSnapshot,readQuotaSnapshot,quotaSnapshotHealth}=api;
const now=Date.parse('2026-11-01T15:58:00+08:00'),cutoff=Date.parse('2026-11-01T16:00:00+08:00'),date='2026-11-02';
function quota({revision=1,publishedAt='2026-11-01T15:55:00+08:00',versionId='deployment-2026',R=4}={}){
 return {versionId,from:'2026-01-01',to:'2026-12-31',teachingEvidenceVersion:1,formClasses:[{id:'4A',name:'4A',level:4}],rows:[{id:'staff-2',R:2,teachingVerified:true,periodCap:65,capConfigured:true,capVerified:true},{id:'staff-1',R,rawR:4.3,teachingPeriods:20,teachingVerified:true,capConfigured:false,periodCap:null}],source:{service:'deploy',versionId,revision,commit:'publication-'+revision,calculationVersion:'relief-test-v1',publishedAt,from:'2026-01-01',to:'2026-12-31',checkedAt:'2026-11-01T15:57:00+08:00',cacheDay:'2026-11-01'}};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
await test('missing storage and missing snapshots fail without inventing R',async()=>{
 await assert.rejects(readQuotaSnapshot({}, {date,asOf:cutoff}),e=>e.code==='QUOTA_SNAPSHOT_STORAGE');
 const env={GSIS_JOBS:database()};await assert.rejects(readQuotaSnapshot(env,{date,asOf:cutoff}),e=>e.code==='QUOTA_SNAPSHOT_MISSING');
 assert.deepEqual(await quotaSnapshotHealth(env,{now}),{configured:true,available:false,status:'missing'});
});
await test('immutable publication retains stable IDs, teaching/cap evidence and write time',async()=>{
 const env={GSIS_JOBS:database()},value=quota(),ack=await writeQuotaSnapshot(env,value,{now});
 assert.equal(ack.replayed,false);assert.match(ack.snapshotId,/^[a-f0-9]{64}$/);assert.match(ack.digest,/^[a-f0-9]{64}$/);
 const saved=await readQuotaSnapshot(env,{date,asOf:cutoff,expectedSource:value.source});
 assert.deepEqual(saved.rows,value.rows.toSorted((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(saved.formClasses,value.formClasses);
 assert.equal(saved.source.checkedAt,undefined);assert.equal(saved.source.cacheDay,undefined);assert.equal(saved.source.publishedAt,'2026-11-01T07:55:00.000Z');
 assert.equal(saved.snapshot.writtenAt,now);assert.equal(saved.snapshot.digest,ack.digest);assert.equal(value.source.checkedAt,'2026-11-01T15:57:00+08:00','caller value is not mutated');
});
await test('same publication retries ignore transport freshness and input key ordering',async()=>{
 const env={GSIS_JOBS:database()},first=quota(),ack=await writeQuotaSnapshot(env,first,{now});
 const retry=structuredClone(first);retry.source.checkedAt='2026-11-01T16:10:00+08:00';retry.source.cacheDay='2026-11-02';retry.rows.reverse();
 const reordered=Object.fromEntries(Object.entries(retry).reverse()),replay=await writeQuotaSnapshot(env,reordered,{now:now+1000});
 assert.equal(replay.replayed,true);assert.equal(replay.digest,ack.digest);assert.equal(replay.writtenAt,now);assert.equal(env.GSIS_JOBS.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_quota_snapshots').get().n,1);
});
await test('changed content under the same publication is rejected and original bytes survive',async()=>{
 const env={GSIS_JOBS:database()};await writeQuotaSnapshot(env,quota(),{now});
 await assert.rejects(writeQuotaSnapshot(env,quota({R:99}),{now}),e=>e.code==='QUOTA_SNAPSHOT_CONFLICT'&&e.status===409);
 assert.equal((await readQuotaSnapshot(env,{date,asOf:cutoff})).rows.find(r=>r.id==='staff-1').R,4);
});
await test('lost acknowledgements recover the same immutable publication',async()=>{
 const env={GSIS_JOBS:database()};await writeQuotaSnapshot(env,quota(),{now});
 const replay=await writeQuotaSnapshot(env,quota(),{now:now+10000});assert.equal(replay.replayed,true);
 const saved=await readQuotaSnapshot(env,{date,asOf:cutoff});assert.equal(saved.snapshot.writtenAt,now);
});
await test('concurrent publication writes cannot replace each other',async()=>{
 const env={GSIS_JOBS:database()};await quotaSnapshotHealth(env,{now});
 const outcomes=await Promise.allSettled([writeQuotaSnapshot(env,quota(),{now}),writeQuotaSnapshot(env,quota({R:9}),{now})]);
 assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);assert.equal(outcomes.filter(value=>value.status==='rejected'&&value.reason.code==='QUOTA_SNAPSHOT_CONFLICT').length,1);
 const saved=await readQuotaSnapshot(env,{date,asOf:cutoff}),winner=outcomes.findIndex(value=>value.status==='fulfilled');assert.equal(saved.rows.find(row=>row.id==='staff-1').R,winner===0?4:9);assert.equal(saved.snapshot.digest,outcomes[winner].value.digest);assert.equal(env.GSIS_JOBS.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_quota_snapshots').get().n,1);
});
await test('verified zero and unavailable null quotas stay distinct',async()=>{
 const env={GSIS_JOBS:database()},value=quota({R:0});value.rows[0].R=null;value.rows[0].capVerified=false;
 await writeQuotaSnapshot(env,value,{now});const saved=await readQuotaSnapshot(env,{date,asOf:cutoff});
 assert.equal(saved.rows.find(row=>row.id==='staff-1').R,0);assert.equal(saved.rows.find(row=>row.id==='staff-2').R,null);assert.equal(saved.rows.find(row=>row.id==='staff-2').capVerified,false);
});
await test('a failed write leaves no accepted snapshot and retries safely',async()=>{
 const env={GSIS_JOBS:database()};await quotaSnapshotHealth(env,{now});env.GSIS_JOBS.onBatch(()=>{throw Error('storage unavailable');});
 await assert.rejects(writeQuotaSnapshot(env,quota(),{now}),e=>e.code==='QUOTA_SNAPSHOT_STORAGE');
 await assert.rejects(readQuotaSnapshot(env,{date,asOf:cutoff}),e=>e.code==='QUOTA_SNAPSHOT_MISSING');
 assert.equal((await writeQuotaSnapshot(env,quota(),{now})).replayed,false);
});
await test('checkpoint selection excludes later publications and preserves weekly source cutoff',async()=>{
 const env={GSIS_JOBS:database()},first=quota(),later=quota({revision:2,publishedAt:'2026-11-04T12:00:00+08:00',R:8});
 await writeQuotaSnapshot(env,first,{now});await writeQuotaSnapshot(env,later,{now:Date.parse('2026-11-04T12:01:00+08:00')});
 assert.equal((await readQuotaSnapshot(env,{date,asOf:cutoff})).rows.find(r=>r.id==='staff-1').R,4);
 const next=await readQuotaSnapshot(env,{date:'2026-11-09',asOf:Date.parse('2026-11-08T16:00:00+08:00')});assert.equal(next.rows.find(r=>r.id==='staff-1').R,8);
 await assert.rejects(readQuotaSnapshot(env,{date,asOf:cutoff,expectedSource:later.source}),e=>e.code==='QUOTA_SNAPSHOT_STALE');
});
await test('a late older publication cannot replace latest health or a newer checkpoint source',async()=>{
 const env={GSIS_JOBS:database()},newer=quota({revision:2,publishedAt:'2026-11-01T15:56:00+08:00',R:8});
 await writeQuotaSnapshot(env,newer,{now});await writeQuotaSnapshot(env,quota(),{now:now+1000});
 assert.equal((await readQuotaSnapshot(env,{date,asOf:cutoff})).source.revision,2);
 const health=await quotaSnapshotHealth(env,{now:now+2000});assert.equal(health.revision,2);assert.equal(health.status,'ready');assert.equal(JSON.stringify(health).includes('staff-'),false);
 const behind=await quotaSnapshotHealth(env,{now,expectedSource:quota({revision:3}).source});assert.equal(behind.status,'behind');
});
await test('same-millisecond publications follow the trusted publication order',async()=>{
 const env={GSIS_JOBS:database()},older=quota({revision:9}),newer=quota({versionId:'new-version',revision:1,R:8});older.source.publicationRevision=20;newer.source.publicationRevision=21;
 await writeQuotaSnapshot(env,newer,{now});await writeQuotaSnapshot(env,older,{now:now+1});
 const saved=await readQuotaSnapshot(env,{date,asOf:cutoff,expectedSource:newer.source});assert.equal(saved.versionId,'new-version');assert.equal((await quotaSnapshotHealth(env,{now:now+2})).versionId,'new-version');
});
await test('date ranges and expected publication identities are enforced',async()=>{
 const env={GSIS_JOBS:database()},value=quota();await writeQuotaSnapshot(env,value,{now});
 await assert.rejects(readQuotaSnapshot(env,{date:'2027-01-04',asOf:cutoff}),e=>e.code==='QUOTA_SNAPSHOT_MISSING');
 for(const key of ['versionId','revision','commit','calculationVersion']){const expected={...value.source,[key]:key==='revision'?9:'wrong'};await assert.rejects(readQuotaSnapshot(env,{date,asOf:cutoff,expectedSource:expected}),e=>e.code==='QUOTA_SNAPSHOT_STALE');}
});
await test('corrupt snapshot bytes, stored digests and metadata fail closed',async()=>{
 for(const column of ['body_json','digest','published_at','version_id']){
  const env={GSIS_JOBS:database()};await writeQuotaSnapshot(env,quota(),{now});
  env.GSIS_JOBS.sql.prepare('UPDATE gsis_roster_quota_snapshots SET '+column+'=?').run(column==='published_at'?now-2000:column==='body_json'?'{}':'corrupt');
  await assert.rejects(readQuotaSnapshot(env,{date,asOf:cutoff}),e=>e.code==='QUOTA_SNAPSHOT_CORRUPT');
 }
});
await test('only bounded published quota payloads are accepted',async()=>{
 const env={GSIS_JOBS:database()};
 await quotaSnapshotHealth(env,{now});
 const bad=[];let v=quota();delete v.source.publishedAt;bad.push(v);v=quota();v.source.publishedAt='2026-02-30T12:00:00Z';bad.push(v);v=quota();v.published=false;bad.push(v);v=quota();v.source.published=false;bad.push(v);v=quota();v.source.revision=-1;bad.push(v);v=quota();v.source.from='2026-02-01';bad.push(v);v=quota();v.from='2026-02-30';v.source.from=v.from;bad.push(v);v=quota();v.rows[0].id='';bad.push(v);v=quota();v.rows[1].id=v.rows[0].id;bad.push(v);v=quota();v.rows[0].R=Infinity;bad.push(v);v=quota();v.rows[0].R=-1;bad.push(v);v=quota();v.rows=Array.from({length:2001},(_,i)=>({id:'staff-'+i,R:2}));bad.push(v);v=quota();v.extra='x'.repeat(1000000);bad.push(v);
 for(const value of bad)await assert.rejects(writeQuotaSnapshot(env,value,{now}),e=>e.code==='QUOTA_SNAPSHOT_INVALID'&&e.status===400);
 assert.equal(env.GSIS_JOBS.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_quota_snapshots').get().n,0);
});
console.log(checks+' immutable quota snapshot checks passed');
