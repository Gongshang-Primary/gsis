import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);globalThis.crypto??=webcrypto;
const R=require('../shared/roster.js'),O=require('../shared/roster-operations.js'),S=require('../shared/roster-stapler.js');
import * as M from '../roster-update/public/edge-timetable-cache.js';
const today='2026-10-26',now=Date.parse(today+'T01:00:00Z'),who={service:true,email:'roster-service',smc:true};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE gsis_edge_heads(scope TEXT PRIMARY KEY,revision INTEGER,mode TEXT,updated_at INTEGER);INSERT INTO gsis_edge_heads VALUES('roster',1,'active',0),('roster-register',1,'active',0),('roster-references',1,'active',0);CREATE TABLE gsis_edge_records(scope TEXT,collection TEXT,record_id TEXT,record_date TEXT,value_json TEXT,revision INTEGER,PRIMARY KEY(scope,collection,record_id))");
 const counts={roster:0,register:0,context:0,models:0,hydrate:0,gets:0,puts:0};
 const db={sql,scans:0,prepare(q){const make=(a=[])=>({bind(...v){return make(v);},async run(){const v=sql.prepare(q).run(...a);return {meta:{changes:v.changes}};},async first(){return sql.prepare(q).get(...a)||null;},async all(){if(q.includes('MAX(revision)'))db.scans++;return {results:sql.prepare(q).all(...a)};}});return make();},withSession(){return this;},async batch(xs){sql.exec('BEGIN');try{const out=[];for(const x of xs)out.push(await x.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const objects=new Map(),hooks={},bucket={async put(k,v){counts.puts++;if(hooks.put)await hooks.put(k);objects.set(k,new Uint8Array(v));},async get(k){counts.gets++;const v=objects.get(k);return v?{arrayBuffer:async()=>v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)}:null;}},env={GSIS_JOBS:db,ROSTER_TIMETABLE_SNAPSHOTS:bucket};
 const model={maxPeriod:0,timing:{startMinutes:420,periodMinutes:30},layoutMode:'single-week',single:{perDay:1,blocks:[{name:'Alice',cells:Array.from({length:5},()=>['EL','1A','Room A',''])}]}},entry={id:'baseline',modelKey:'immutable1',from:'2026-01-01',to:'2026-12-31',priority:1},reg={entries:[entry]},state=O.initial();state.revision=1;
 const day={id:'baseline',date:today,parity:'single',schoolDay:true,verified:true,periods:[{period:0,start:'07:00',end:'07:30',startMinutes:420,endMinutes:450}],teachers:[{staffId:'alice',name:'Alice',timetableName:'Alice',cells:[['EL','1A','Room A','']]}]},plan=S.create(day);state.staplerPlans=[{id:'plan',date:today,baselineId:'baseline',revision:1,confirmedRevision:1,confirmed:true,confirmedPlan:plan,draft:plan}];
 const head=scope=>sql.prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').get(scope),clock={today},people=[{id:'alice',name:'Alice',active:true}],hydratedDates=[];
 const runtime={GSISRoster:R,GSISRosterOperations:O,GSISRosterStapler:S,async loadEdgeRoster(){counts.roster++;if(hooks.load)await hooks.load();return {state:structuredClone(state),revision:head('roster').revision};},async readEdgeRosterRegister(){counts.register++;return {state:reg,revision:head('roster-register').revision};},async readEdgeRosterModel(){counts.models++;return model;},async hydrateEdgeRosterPlans(e,s,dates){counts.hydrate++;hydratedDates.push(...dates);},async buildEdgeRosterContext(e,s,p,identity=who){counts.context++;return {user:identity.staff?{email:'alice@gsps.edu.sg',staffId:'alice',smc:false,admin:false}:{email:who.email,staffId:null,smc:true,admin:true},people,today:clock.today,smcIds:[],days:{},timetableEntries:reg.entries,edgeGuards:[{scope:'roster-references',revision:head('roster-references').revision,mode:'active'}]};}};
 const reset=()=>{for(const key of Object.keys(counts))counts[key]=0;},drain=options=>M.drainEdgeTimetableJobs(env,who,{now,...options},runtime),batch=(input,identity=who)=>M.edgeTimetableBatch(env,input,identity,runtime),jobs=()=>sql.prepare('SELECT * FROM gsis_timetable_jobs ORDER BY stage').all();
 const touch=(collection,id='row',scope='roster')=>{sql.prepare('UPDATE gsis_edge_heads SET revision=revision+1 WHERE scope=?').run(scope);sql.prepare('INSERT INTO gsis_edge_records VALUES(?,?,?,?,?,?) ON CONFLICT(scope,collection,record_id) DO UPDATE SET revision=excluded.revision').run(scope,collection,id,today,'{}',head(scope).revision);state.revision=head('roster').revision;};
 return {sql,db,env,objects,hooks,counts,state,reg,clock,people,hydratedDates,runtime,reset,drain,batch,jobs,touch};
}
const f=fixture();
let first,error;try{first=await f.drain();}catch(e){error=e;}
assert.equal(error,undefined,'an empty new queue must return without importing/hydrating the roster');
assert.equal(first.idle,true);assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0),'repeated idle ticks do no roster or R2 work');
assert.equal(f.db.scans,1,'identical domain heads/day must skip even the D1 record-summary scan');

// The public on-demand path still produces complete packages from an empty cache.
const baseline=await f.batch({stage:'baseline',encoding:'gzip-parts-v1'});
await f.batch({stage:'suspended',baselineKey:baseline.baselineKey,encoding:'gzip-parts-v1'});
await M.enqueueEdgeTimetableRefresh(f.env,{stage:'baseline',revision:1});f.reset();
const warmed=await f.drain();assert.equal(warmed.processed,2);assert.equal(f.jobs().length,0);assert.equal(f.counts.gets,0);assert.equal(f.counts.puts,0);assert.equal(f.counts.models,0);assert.equal(f.counts.hydrate,0,'unchanged prewarm does not hydrate old plans');
f.reset();await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0));

// Only queued stages run, the cap is honoured, and responses are not downloaded.
f.state.staplerPlans[0].name='Updated name';f.state.staplerPlans[0].revision++;f.touch('staplerPlans');
await M.enqueueEdgeTimetableRefresh(f.env,{stage:'baseline',revision:f.state.revision});f.reset();
assert.equal((await f.drain({limit:1})).processed,1);assert.deepEqual(f.jobs().map(x=>x.stage),['suspended']);assert.equal(f.counts.gets,0);assert.equal(f.counts.puts,0);
f.reset();assert.equal((await f.drain({limit:1})).processed,1);assert.equal(f.counts.puts,1,'one changed plan uploads one part');assert.equal(f.counts.gets,0);assert.equal(f.jobs().length,0);
const changed=await f.batch({stage:'suspended',baselineKey:baseline.baselineKey,encoding:'json-v1'});assert.match(changed.data,/Updated name/);

// A lost enqueue is repaired from compact record revisions, not full hydration.
f.reset();f.touch('inboxMessages','irrelevant');await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
f.state.staplerPlans[0].name='Lost enqueue';f.state.staplerPlans[0].revision++;f.touch('staplerPlans');
assert.equal((await f.drain()).processed,1);assert.equal(f.counts.puts,1);assert.equal(f.counts.gets,0);
f.reset();await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
f.touch('contactsCheckedAt','$','roster-references');await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0),'reference freshness alone must not prewarm packages');
f.people[0].name='Alice updated';f.touch('contacts','key:rosterPeople','roster-references');assert.equal((await f.drain()).processed,1,'directory data changes repair the suspended cache even without enqueue');assert.equal(f.counts.hydrate,0,'a manifest-only directory change must reuse unchanged plan parts without hydration');
f.reset();await f.drain();assert.deepEqual(Object.values(f.counts),Array(7).fill(0));

// Moving the 31-day window wakes both stages once; the next tick is idle.
f.clock.today='2026-10-27';f.reset();assert.equal((await f.drain({now:now+86400000})).processed,2);assert.equal(f.counts.gets,0);assert.equal(f.counts.puts,0);
f.reset();await f.drain({now:now+86400000});assert.deepEqual(Object.values(f.counts),Array(7).fill(0));

// A changed date hydrates only that date, leaving other stored plan parts alone.
const k=fixture(),tomorrow=structuredClone(k.state.staplerPlans[0]);tomorrow.id='tomorrow';tomorrow.date='2026-10-27';tomorrow.draft.date=tomorrow.date;tomorrow.confirmedPlan.date=tomorrow.date;k.state.staplerPlans.push(tomorrow);
await k.drain();await M.enqueueEdgeTimetableRefresh(k.env,{stage:'baseline',revision:1});await k.drain();k.hydratedDates.length=0;k.reset();
k.state.staplerPlans[0].name='One date changed';k.state.staplerPlans[0].revision++;k.touch('staplerPlans');await k.drain();assert.deepEqual(k.hydratedDates,[today]);assert.equal(k.counts.puts,1);assert.equal(k.counts.gets,0);

// An overlapping drain cannot hydrate a stage owned by a durable claim.
const g=fixture();await g.drain();await M.enqueueEdgeTimetableRefresh(g.env,{stage:'suspended',revision:1});
let entered,release;const blocked=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);g.hooks.load=async()=>{entered();await gate;};
const active=g.drain();await blocked;const overlap=await g.drain();assert.equal(overlap.processed,0);assert.equal(g.counts.roster,1);release();await active;assert.equal(g.jobs().length,0);

// A newer same-revision job survives completion, even with the same wall clock.
await M.enqueueEdgeTimetableRefresh(g.env,{stage:'suspended',revision:1});
g.sql.prepare('UPDATE gsis_timetable_jobs SET updated_at=?').run('2099-01-01T00:00:00.000Z');
g.hooks.load=async()=>{delete g.hooks.load;await M.enqueueEdgeTimetableRefresh(g.env,{stage:'suspended',revision:1});};
await g.drain();assert.equal(g.jobs().length,1,'an enqueue during a build must not be acknowledged by that build');assert(g.jobs()[0].updated_at>'2099-01-01T00:00:00.000Z');
await g.drain();assert.equal(g.jobs().length,0);

// Failure releases the lease but retains durable work for the next beat.
const h=fixture();await h.drain();await M.enqueueEdgeTimetableRefresh(h.env,{stage:'baseline',revision:1});h.hooks.put=()=>{throw Error('simulated R2 failure');};
await assert.rejects(h.drain(),/simulated R2 failure/);assert.equal(h.jobs().length,2);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_job_claims').get().n,0);
delete h.hooks.put;await h.drain();assert.equal(h.jobs().length,0);
await M.enqueueEdgeTimetableRefresh(h.env,{stage:'suspended'});h.sql.prepare("INSERT INTO gsis_timetable_job_claims VALUES('roster','suspended','crashed-worker',?)").run(now-1);
assert.equal((await h.drain()).processed,1,'an expired crashed-worker claim is recoverable');assert.equal(h.jobs().length,0);

// Source advancement while uploading cannot promote or acknowledge old output.
const j=fixture();await j.drain();await M.enqueueEdgeTimetableRefresh(j.env,{stage:'baseline',revision:1});j.hooks.put=()=>{delete j.hooks.put;j.sql.exec("UPDATE gsis_edge_heads SET revision=2 WHERE scope='roster'");};
await assert.rejects(j.drain(),e=>e.code==='TIMETABLE_BATCH_CHANGED');assert.equal(j.jobs().length,2);assert.equal(j.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_packages').get().n,0);await j.drain();assert.equal(j.jobs().length,0);

// Every Contacts field used by confirmed-access eligibility invalidates a
// previously authorised staff cache; knownSourceKey must never bypass it.
const p=fixture(),pb=await p.batch({stage:'baseline'}),staffInput={stage:'suspended',baselineKey:pb.baselineKey,encoding:'json-v1'},allowed=await p.batch(staffInput,{staff:true});assert.equal(JSON.parse(allowed.data).plans.length,1);
for(const field of ['mk','appointmentLevel']){p.people[0][field]=field==='mk'?'MK':'SL';const denied=await p.batch({...staffInput,knownSourceKey:allowed.sourceKey},{staff:true});assert.notEqual(denied.unchanged,true,field+' must invalidate confirmed access');assert.equal(JSON.parse(denied.data).plans.length,0);delete p.people[0][field];}

// Cleanup tombstones are permanent: the same content gets a new object path,
// and promotion cannot make a marked object live again.
const t=fixture(),cache=await new M.TimetablePackageStore(t.db,t.env.ROSTER_TIMETABLE_SNAPSHOTS).ensure();
t.sql.exec('CREATE TABLE IF NOT EXISTS gsis_timetable_part_tombstones(object_key TEXT PRIMARY KEY,marked_at INTEGER NOT NULL,deleted_at INTEGER,candidate_uploaded_at INTEGER NOT NULL)');
const value={lesson:'preserved'},original=await cache.putPart(value);t.sql.prepare('INSERT INTO gsis_timetable_part_tombstones VALUES(?,?,NULL,?)').run(original.objectKey,now,now-86400000);
const replacement=await cache.putPart(value);assert.equal(replacement.key,original.key);assert.notEqual(replacement.objectKey,original.objectKey,'a tombstoned content key must use a fresh object path');assert.match(replacement.objectKey,/\.[a-f0-9-]{36}\.json\.gz$/);assert.equal((await cache.part(replacement)).key,replacement.key);
await assert.rejects(cache.part({...replacement,objectKey:replacement.objectKey.replace(replacement.key,'0'.repeat(64))}),e=>e.code==='TIMETABLE_PART_INVALID');
const promote=part=>cache.promote({stage:'baseline',authorityKey:'test-authority',sourceKey:'test-source',rosterRevision:1,registerRevision:1,manifest:{payload:{},parts:{[part.key]:part}}});
await assert.rejects(promote(original),e=>e.code==='TIMETABLE_PART_RETIRED');assert.equal(t.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_packages').get().n,0);await promote(replacement);

// A tombstone committed after the writer's first check still blocks promotion;
// a retained job retries with a unique unmarked key.
const u=fixture();await u.drain();await M.enqueueEdgeTimetableRefresh(u.env,{stage:'baseline'});u.hooks.put=key=>u.sql.prepare('INSERT OR IGNORE INTO gsis_timetable_part_tombstones VALUES(?,?,NULL,?)').run(key,now,now-86400000);
await assert.rejects(u.drain(),e=>e.code==='TIMETABLE_PART_RETIRED');assert.equal(u.jobs().length,2);assert.equal(u.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_packages').get().n,0);
delete u.hooks.put;await u.drain();assert.equal(u.jobs().length,0);assert.equal(u.sql.prepare("SELECT COUNT(*) AS n FROM gsis_timetable_packages p,json_each(p.manifest_json,'$.parts') part JOIN gsis_timetable_part_tombstones t ON t.object_key=json_extract(part.value,'$.objectKey')").get().n,0);

// A builder whose lease was replaced cannot publish after the new owner, even
// if the roster and register happen to remain at the same source revisions.
const v=fixture();await v.drain();await M.enqueueEdgeTimetableRefresh(v.env,{stage:'baseline'});v.hooks.put=()=>{delete v.hooks.put;v.sql.exec("UPDATE gsis_timetable_job_claims SET token='replacement-owner' WHERE stage='baseline'");};
await assert.rejects(v.drain(),e=>e.code==='TIMETABLE_CLAIM_LOST');assert.equal(v.jobs().length,2);assert.equal(v.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_packages').get().n,0);
assert.equal(v.sql.prepare('SELECT token FROM gsis_timetable_job_claims').get().token,'replacement-owner');v.sql.prepare('UPDATE gsis_timetable_job_claims SET expires_at=?').run(now-1);await v.drain();assert.equal(v.jobs().length,0);
const w=fixture();await w.drain();await M.enqueueEdgeTimetableRefresh(w.env,{stage:'baseline'});w.hooks.put=()=>{delete w.hooks.put;w.sql.exec("UPDATE gsis_edge_heads SET revision=revision+1 WHERE scope='roster-references'");};
await assert.rejects(w.drain(),e=>e.code==='TIMETABLE_BATCH_CHANGED');assert.equal(w.jobs().length,2);assert.equal(w.sql.prepare('SELECT COUNT(*) AS n FROM gsis_timetable_packages').get().n,0);await w.drain();assert.equal(w.jobs().length,0);
console.log('PASS timetable idle gate, compact repair, rollover, stage cap, changed-date hydration, durable claims, enqueue/retry/revision guards, eligibility and tombstone fencing');
