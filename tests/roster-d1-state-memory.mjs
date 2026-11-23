import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {GSiSEdgeStore as Store} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {loadEdgeRoster,mutateEdgeRoster,hydrateEdgeRosterPlans} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
import {withRosterMutationAdmission} from '../roster-update/public/edge-roster-admission.js';

const database=createRequire(import.meta.url)('./helpers/chunked-import-db.cjs'),date='2026-11-17',other='2026-11-18';
globalThis.fetch=()=>assert.fail('Synthetic state-copy checks must not call a provider');
async function activate(db,scope,state){const store=Store.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
async function fixture(){
 const db=database(),objects=new Map(),reads=[],writes=[];let failWrite=false;
 const reference=(key,value)=>{const json=JSON.stringify(value);objects.set(key,gzipSync(json));return {edgeObject:true,key,digest:sha256Hex(json),encoding:'gzip-json-v1'};};
 const plan={schema:1,lessons:[{subject:'Synthetic',note:'unchanged'}]},draft=reference('draft',plan),published=reference('published',plan),archive=reference('archive',plan),later=reference('later',plan);
 const state=O.initial();state.audit=Array.from({length:16},(_,i)=>({id:'memory-history-'+i,date,detail:'synthetic-history '.repeat(1024)}));state.staplerPlans=[{id:'today',date,draft,published},{id:'later',date:other,draft:later}];state.staplerArchives=[{id:'archive',date,draft:archive}];
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',WHATSAPP_ENABLED:'false',ROSTER_TIMETABLE_SNAPSHOTS:{async get(key){reads.push(key);const bytes=objects.get(key);return bytes?{body:new Blob([bytes]).stream()}:null;},async put(key,bytes){writes.push(key);if(failWrite)throw Error('Synthetic object write interrupted');objects.set(key,new Uint8Array(bytes));}}};
 const store=await activate(db,'roster',state);await activate(db,'roster-register',{revision:0,entries:[],receipts:[]});await activate(db,'roster-references',{schema:1,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},contactsCheckedAt:Date.now(),calendarByDate:{},calendarCheckedAt:Date.now()});
 return {db,env,store,objects,reads,writes,draft,published,archive,later,setFailWrite:value=>failWrite=value};
}
async function countHistoryCopies(work){const original=globalThis.structuredClone;let copies=0;globalThis.structuredClone=(value,...args)=>{if(value?.audit?.[0]?.id==='memory-history-0')copies++;return original(value,...args);};try{return {result:await work(),copies};}finally{globalThis.structuredClone=original;}}
let passed=0;
async function test(name,work){await work();console.log('PASS '+name);passed++;}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function until(check){for(let i=0;i<50&&!check();i++)await new Promise(setImmediate);assert(check(),'expected D1 query boundary reached');}
function holdFirstRosterLoad(db){
 const original=db.batch.bind(db),hold=deferred();let loads=0;
 db.batch=async statements=>{const result=await original(statements);if(statements.some(s=>s.text.startsWith('SELECT r.collection,r.record_id,r.position,r.record_date,r.value_json'))){loads++;if(loads===1)await hold.promise;}return result;};
 return {get loads(){return loads;},release:hold.resolve};
}

await test('dated hydration keeps the raw CAS snapshot isolated and avoids unrelated objects',async()=>{
 const f=await fixture();try{
  f.objects.delete('later');const {result:loaded,copies}=await countHistoryCopies(()=>loadEdgeRoster(f.env,{hydrate:true,dates:[date]}));assert.equal(copies,1,'one independent working state is necessary');
  assert.deepEqual([...f.reads].sort(),['archive','draft','published']);assert.equal(loaded.state.staplerPlans[1].draft.edgeObject,true);
  const before=JSON.stringify(loaded.rawState);loaded.state.audit[0].detail='edited';loaded.state.staplerPlans[0].draft.lessons[0].note='edited';loaded.state.staplerPlans[0].date=other;loaded.state.staplerArchives[0].draft.lessons[0].note='edited';assert.equal(JSON.stringify(loaded.rawState),before);
 }finally{f.db.sql.close();}
});
await test('working-state hydration copies no unrelated history and preserves input on integrity failure',async()=>{
 const f=await fixture();try{
  const loaded=await loadEdgeRoster(f.env),before=JSON.stringify(loaded.state);f.objects.set('published',gzipSync(JSON.stringify({corrupt:true})));
  await assert.rejects(hydrateEdgeRosterPlans(f.env,loaded.state,[date]),e=>e.code==='ROSTER_MODEL_INTEGRITY');assert.equal(JSON.stringify(loaded.state),before,'failed hydration must not expose partial plan replacements');
  f.objects.set('published',f.objects.get('draft'));f.reads.length=0;const {copies}=await countHistoryCopies(()=>hydrateEdgeRosterPlans(f.env,loaded.state,[date]));assert.equal(copies,0,'expanding a dated plan must not duplicate retained history');
  assert.equal(loaded.state.staplerPlans[0].published.lessons[0].note,'unchanged');assert.equal(loaded.rawState.staplerPlans[0].published.edgeObject,true);assert(!f.reads.includes('later'));
 }finally{f.db.sql.close();}
});
await test('a plan edit packs only changed fields with one history copy per mutation',async()=>{
 const f=await fixture();try{
  let appliedState,rawSnapshot;const requestId=crypto.randomUUID();const {copies}=await countHistoryCopies(()=>mutateEdgeRoster(f.env,{actor:'fixture',requestId,command:{operation:'currentDuty'},domainChanged:false,async apply(state,ctx,loaded){appliedState=state;rawSnapshot=JSON.stringify(loaded.rawState);await hydrateEdgeRosterPlans(f.env,state,[date]);state.staplerPlans[0].draft.lessons[0].note='changed';return {saved:true};},beforeCommit(state,ctx,loaded){assert.equal(state,appliedState);assert.equal(state.staplerPlans[0].draft.lessons[0].note,'changed','packing must not replace working plans with references');assert.equal(JSON.stringify(loaded.rawState),rawSnapshot,'packing must not change the CAS baseline');}}));
  assert.equal(copies,1,'hydration and packing must not deep-copy all retained history');assert.equal(f.writes.length,1,'only the changed draft needs a new immutable object');const saved=(await f.store.load()).state;
  assert.deepEqual(saved.staplerPlans[0].published,f.published);assert.deepEqual(saved.staplerPlans[1].draft,f.later);assert.deepEqual(saved.staplerArchives[0].draft,f.archive);assert.notEqual(saved.staplerPlans[0].draft.digest,f.draft.digest);
  const expanded=await loadEdgeRoster(f.env,{hydrate:true,dates:[date]});assert.equal(expanded.state.staplerPlans[0].draft.lessons[0].note,'changed');
 }finally{f.db.sql.close();}
});
await test('interrupted object packing leaves D1 untouched and same-request retry applies once',async()=>{
 const f=await fixture();try{
  const before=await f.store.load(),requestId=crypto.randomUUID(),run=()=>mutateEdgeRoster(f.env,{actor:'fixture',requestId,command:{operation:'currentDuty'},domainChanged:false,async apply(state){await hydrateEdgeRosterPlans(f.env,state,[date]);state.staplerPlans[0].draft.lessons[0].note='retry';state.systemConfig.syntheticEdits=(state.systemConfig.syntheticEdits||0)+1;return {saved:true};}});
  f.setFailWrite(true);await assert.rejects(run(),/Synthetic object write interrupted/);const failed=await f.store.load();assert.equal(failed.revision,before.revision);assert.deepEqual(failed.state,before.state);
  f.setFailWrite(false);await run();assert.equal((await f.store.load()).state.systemConfig.syntheticEdits,1);assert.equal((await run()).replayed,true);assert.equal((await f.store.load()).state.systemConfig.syntheticEdits,1);
 }finally{f.db.sql.close();}
});
await test('packing hydrated allocation evidence preserves its original compressed bytes',async()=>{
 const f=await fixture();try{
  const json=JSON.stringify({version:1,teachers:[{id:'synthetic',reason:'retained evidence'}],periods:[],lessons:[]}),evidence={encoding:'gzip-audit-v1',bytes:Buffer.byteLength(json),digest:sha256Hex(json),data:gzipSync(json).toString('base64')};
  await mutateEdgeRoster(f.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixture'},needsContext:false,apply(state){state.optimisationRuns=[{id:'synthetic-run',date,decisionEvidence:evidence}];return {saved:true};}});
  const expanded=await loadEdgeRoster(f.env,{hydrate:true,dates:[date]});assert.equal(expanded.state.optimisationRuns[0].decisionEvidence.version,1);
  await mutateEdgeRoster(f.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'currentDuty'},apply(state){state.optimisationRuns=expanded.state.optimisationRuns;return {saved:true};}});
  assert.deepEqual((await f.store.load()).state.optimisationRuns[0].decisionEvidence,evidence);assert.equal(expanded.state.optimisationRuns[0].decisionEvidence.version,1,'packing must leave the caller’s hydrated evidence intact');
 }finally{f.db.sql.close();}
});
await test('concurrent background mutations wait before loading a second Roster snapshot',async()=>{
 const f=await fixture(),hold=holdFirstRosterLoad(f.db),jobs=[];try{
  for(let i=0;i<3;i++)jobs.push(mutateEdgeRoster(withRosterMutationAdmission(f.env),{actor:'memory-background',requestId:crypto.randomUUID(),command:{operation:'currentDuty',synthetic:i},needsContext:false,apply(state){state.systemConfig.syntheticEdits=(state.systemConfig.syntheticEdits||0)+1;return {saved:true};}}));
  await until(()=>hold.loads>0);await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(hold.loads,1,'waiting commands must not materialize raw D1 rows or working copies');hold.release();await Promise.all(jobs);assert.equal(hold.loads,3,'serialized mutations must each read current state once');
  const saved=await f.store.load();assert.equal(saved.state.systemConfig.syntheticEdits,3);assert.equal(saved.state.audit.length,16);assert.equal(saved.state.staplerPlans.length,2);assert.equal(saved.state.staplerArchives.length,1);
  assert.equal(f.db.sql.prepare("SELECT count(*) n FROM gsis_edge_receipts WHERE scope='roster' AND actor='memory-background'").get().n,3,'all commands retain their individual receipts');
 }finally{hold.release();await Promise.allSettled(jobs);f.db.sql.close();}
});
await test('foreground cancellation can commit while background materialization waits and CAS preserves it',async()=>{
 const f=await fixture(),hold=holdFirstRosterLoad(f.db);let background;try{
  background=mutateEdgeRoster(withRosterMutationAdmission(f.env),{actor:'memory-background',requestId:crypto.randomUUID(),command:{operation:'currentDuty'},needsContext:false,apply(state){state.systemConfig.syntheticEdits=(state.systemConfig.syntheticEdits||0)+1;return {saved:true};}});
  await until(()=>hold.loads===1);let cancelled=false;
  await mutateEdgeRoster(f.env,{actor:'memory-foreground',requestId:crypto.randomUUID(),command:{operation:'cancelAllocationRun',date},needsContext:false,apply(state){state.edgeAllocatorRuns||={};state.edgeAllocatorRuns[date]={id:'synthetic-manual-run',date,trigger:'manual',state:'cancelled'};cancelled=true;return {cancelled:true};}});
  assert.equal(cancelled,true);assert.equal(hold.loads,2,'foreground cancellation must not wait behind background admission');hold.release();await background;
  const saved=await f.store.load();assert.equal(saved.state.edgeAllocatorRuns[date].state,'cancelled');assert.equal(saved.state.systemConfig.syntheticEdits,1);assert.equal(saved.state.audit.length,16);assert.equal(hold.loads,3,'the stale background snapshot must retry after the foreground commit');
 }finally{hold.release();await Promise.allSettled(background?[background]:[]);f.db.sql.close();}
});
console.log('PASS '+passed+' D1 state memory/isolation groups');
