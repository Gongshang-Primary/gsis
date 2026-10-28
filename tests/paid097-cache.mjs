import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url);globalThis.crypto??=webcrypto;
const R=require('../shared/roster.js'),O=require('../shared/roster-operations.js'),S=require('../shared/roster-stapler.js');
import * as M from '../roster-update/public/edge-timetable-cache.js';
import {runRosterR2Cleanup} from '../roster-update/public/edge-roster-r2-cleanup.js';
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

let failed=0,passed=0;
async function test(name,run){try{await run();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.message);}}
await test('on-demand reader rebuilds a missing baseline part without a cron beat',async()=>{
 const f=fixture(),base=await f.batch({stage:'baseline',encoding:'gzip-parts-v1'}),first=JSON.parse(base.data),key=Object.values(first.parts)[0].key,manifest=JSON.parse(f.sql.prepare("SELECT manifest_json FROM gsis_timetable_packages WHERE stage='baseline'").get().manifest_json);
 f.objects.delete(manifest.parts[key].objectKey);f.reset();
 const repaired=await f.batch({stage:'baseline',encoding:'json-v1'});
 assert.equal(JSON.parse(repaired.data).models[0].model.layoutMode,'single-week');
 assert.equal(f.counts.puts,1);assert.equal(f.counts.models,1);assert.equal(repaired.sourceKey,base.sourceKey);
 f.reset();await f.batch({stage:'baseline',encoding:'json-v1'});assert.equal(f.counts.models,0);assert.equal(f.counts.puts,0);
});
await test('on-demand reader repairs a corrupt suspended part under the same permissions',async()=>{
 const f=fixture(),base=await f.batch({stage:'baseline'}),input={stage:'suspended',baselineKey:base.baselineKey,encoding:'json-v1'};
 const first=await f.batch(input,{staff:true}),manifest=JSON.parse(f.sql.prepare("SELECT manifest_json FROM gsis_timetable_packages WHERE stage='suspended'").get().manifest_json),meta=Object.values(manifest.parts)[0];
 f.objects.set(meta.objectKey,new Uint8Array([1,2,3]));f.reset();
 const repaired=await f.batch(input,{staff:true});assert.equal(repaired.sourceKey,first.sourceKey);assert.equal(JSON.parse(repaired.data).plans[0].viewMode,'confirmed');assert.equal(f.counts.puts,1);assert.equal(f.counts.hydrate,1);
});
await test('persistent bucket loss stops after one repair pass',async()=>{
 const f=fixture(),input={stage:'baseline',encoding:'json-v1'};await f.batch(input);f.objects.clear();f.reset();
 const put=f.env.ROSTER_TIMETABLE_SNAPSHOTS.put;f.env.ROSTER_TIMETABLE_SNAPSHOTS.put=async(...args)=>{await put(...args);f.objects.clear();};
 await assert.rejects(f.batch(input),error=>error.code==='TIMETABLE_PART_MISSING');assert.equal(f.counts.puts,1);
});
await test('repair promotion rejects a source revision changed during its upload',async()=>{
 const f=fixture(),input={stage:'baseline',encoding:'json-v1'};await f.batch(input);f.objects.clear();f.reset();f.hooks.put=()=>f.touch('staplerPlans');
 await assert.rejects(f.batch(input),error=>error.code==='TIMETABLE_BATCH_CHANGED');assert.equal(f.counts.puts,1);
});
await test('recovery pause blocks all cache and cleanup mutations before accessing storage',async()=>{
 const env={GSIS_RECOVERY_MODE:'true'};
 for(const operation of [()=>M.enqueueEdgeTimetableRefresh(env),()=>M.edgeTimetableBatch(env,{stage:'baseline'},who,{}),()=>M.drainEdgeTimetableJobs(env,who),()=>M.isEdgeTimetableRefreshDue(env),()=>runRosterR2Cleanup({...env,ROSTER_EDGE_AUTHORITY:'d1'})])await assert.rejects(operation(),error=>error.code==='GSIS_RECOVERY_PAUSED');
});
await test('signed Venues reads do not consume a nonce during recovery',async()=>{
 const env={GSIS_RECOVERY_MODE:'true',VENUES_BRIDGE_SECRET:'s'.repeat(32)},payload=JSON.stringify({action:'venuesSource',service:'gsis-venues-v1',source:'roster',timestamp:Date.now(),nonce:crypto.randomUUID(),input:{operation:'manifest'}}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VENUES_BRIDGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('hex'),response=await M.edgeVenuesSourceRoute(new Request('https://roster.gsps.edu.sg/api/venues-source',{method:'POST',body:JSON.stringify({payload,signature})}),env,{});
 assert.equal(response.status,503);assert.equal((await response.json()).code,'GSIS_RECOVERY_PAUSED');
});
await test('a restored manifest repairs a deleted retired part only after recovery resumes',async()=>{
 const f=fixture(),input={stage:'baseline',encoding:'json-v1'};await f.batch(input);const manifest=JSON.parse(f.sql.prepare("SELECT manifest_json FROM gsis_timetable_packages WHERE stage='baseline'").get().manifest_json),old=Object.values(manifest.parts)[0];
 f.objects.delete(old.objectKey);f.sql.prepare('INSERT INTO gsis_timetable_part_tombstones VALUES(?,?,?,?)').run(old.objectKey,now,now,now-40*86400000);f.env.GSIS_RECOVERY_MODE='true';f.reset();
 await assert.rejects(f.batch(input),error=>error.code==='GSIS_RECOVERY_PAUSED');assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
 f.env.GSIS_RECOVERY_MODE='false';await f.batch(input);const repaired=JSON.parse(f.sql.prepare("SELECT manifest_json FROM gsis_timetable_packages WHERE stage='baseline'").get().manifest_json),fresh=Object.values(repaired.parts)[0];assert.equal(fresh.key,old.key);assert.notEqual(fresh.objectKey,old.objectKey);assert(f.objects.has(fresh.objectKey));assert(!f.objects.has(old.objectKey));
});
await test('repair of one dated part preserves unaffected cached dates',async()=>{
 const f=fixture(),next='2026-10-27',row=structuredClone(f.state.staplerPlans[0]);row.id='next';row.date=next;row.draft.date=next;row.confirmedPlan.date=next;f.state.staplerPlans.push(row);
 const base=await f.batch({stage:'baseline'}),input={stage:'suspended',baselineKey:base.baselineKey,encoding:'json-v1'};await f.batch(input);const manifest=JSON.parse(f.sql.prepare("SELECT manifest_json FROM gsis_timetable_packages WHERE stage='suspended'").get().manifest_json),part=manifest.parts[manifest.payload.plans.find(item=>item.date===today).partKey];f.objects.delete(part.objectKey);f.reset();f.hydratedDates.length=0;
 const result=await f.batch(input);assert.equal(JSON.parse(result.data).plans.length,2);assert.equal(f.counts.puts,1);assert.deepEqual(f.hydratedDates,[today]);
});
await test('due probe stays cold, detects missed changes, and settles irrelevant changes',async()=>{
 const f=fixture();assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),false);
 await f.drain();const baseline=await f.batch({stage:'baseline'});await f.batch({stage:'suspended',baselineKey:baseline.baselineKey});await M.enqueueEdgeTimetableRefresh(f.env,{stage:'baseline'});
 assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),true);await f.drain();f.reset();assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),false);assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
 f.touch('inboxMessages','unrelated');assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),false);const scans=f.db.scans;assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),false);assert.equal(f.db.scans,scans);
 f.touch('staplerPlans');assert.equal(await M.isEdgeTimetableRefreshDue(f.env,{now}),true);assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
});
await test('health reports preparation and pending work without reading private package bodies',async()=>{
 const f=fixture();assert.equal((await M.readTimetableCacheHealth(f.env,{now})).available,false);await f.drain();await f.batch({stage:'baseline'});await M.enqueueEdgeTimetableRefresh(f.env,{stage:'baseline'});f.reset();
 const health=await M.readTimetableCacheHealth(f.env,{now});assert.equal(health.available,true);assert.equal(health.stages.find(x=>x.stage==='baseline').pending,true);assert.equal(health.stages.find(x=>x.stage==='baseline').status,'pending');assert(!JSON.stringify(health).includes('alice'));assert(!JSON.stringify(health).includes('manifest'));assert.deepEqual(Object.values(f.counts),Array(7).fill(0));
});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
