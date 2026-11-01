import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../public/edge-store.js';
import {createDeployDomain} from '../public/edge-deploy-domain.js';
import {sha256Bytes} from '../public/edge-deploy-sha256.js';
import {edgeDeployQuotaSource as actualQuotaSource} from '../public/edge-deploy.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),A=require('../shared/roster-allocation.js');
globalThis.__quotaJobAllocation=A;globalThis.__quotaJobSource=(env,input)=>env.testSource(input);
let source=null;try{source=fs.readFileSync(new URL('../shared/roster-quota-job.js',import.meta.url),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
assert(source,'the publication snapshot job and checkpoint adapter are implemented');
source=source.replace("import {edgeDeployQuotaSource} from '../public/edge-deploy.js';","const edgeDeployQuotaSource=globalThis.__quotaJobSource;").replace("import {GSISRosterAllocation} from '../roster-update/public/edge-roster-domain.js';","const GSISRosterAllocation=globalThis.__quotaJobAllocation;");
source=source.replace("import {edgeDeployQuotaSource,edgeDeployQuotaUsesD1} from '../public/edge-deploy.js';","import {edgeDeployQuotaUsesD1} from "+JSON.stringify(new URL('../public/edge-deploy.js',import.meta.url).href)+";const edgeDeployQuotaSource=globalThis.__quotaJobSource;");
source=source.replaceAll("'./roster-quota-snapshot.js'",JSON.stringify(new URL('../shared/roster-quota-snapshot.js',import.meta.url).href)).replaceAll("'./edge-recovery.js'",JSON.stringify(new URL('../shared/edge-recovery.js',import.meta.url).href));
const {dispatchQuotaSnapshot,readQuotaCheckpointEvidence,readQuotaSnapshotStatus}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const at=value=>Date.parse(value),sunday=at('2026-11-01T16:00:00+08:00'),monday=at('2026-11-02T05:30:00+08:00');
const clock=now=>({now,today:new Date(now+8*3600000).toISOString().slice(0,10),minute:(now/60000+480)%1440,iso:new Date(now).toISOString()});
function publication(revision=1,publishedAt='2026-11-01T15:00:00+08:00'){return {service:'deploy',versionId:'deploy-2026',revision,commit:'published-'+revision,calculationVersion:'whole-week-test',publishedAt,publicationRevision:revision,from:'2026-01-01',to:'2026-12-31'};}
function fixture(){
 const db=database(),calls=[],state={sources:[publication()],failManifest:false,failBody:false,block:null,blockBody:null};
 const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'synthetic-test-secret-32-characters',testSource:async input=>{
  calls.push(structuredClone(input));
  if(input.manifest){if(state.failManifest)throw Object.assign(Error('Source unavailable'),{code:'QUOTA_SNAPSHOT_SOURCE',status:503});if(state.block)return state.block(input);
   const cutoff=input.asOf??Date.now(),sources=state.sources.toSorted((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||b.publicationRevision-a.publicationRevision),expectedSource=sources.find(row=>Date.parse(row.publishedAt)<=cutoff&&(!input.date||row.from<=input.date&&row.to>=input.date))||null;
   return {schema:'gsis-roster-quota-source-v1',publications:structuredClone(sources),expectedSource:structuredClone(expectedSource)};
  }
  if(state.failBody)throw Object.assign(Error('Transfer unavailable'),{code:'QUOTA_SNAPSHOT_SOURCE',status:503});if(state.blockBody)return state.blockBody(input);
  const found=state.sources.find(row=>row.versionId===input.versionId&&row.revision===input.revision&&row.commit===input.commit);assert(found,'body requests bind a trusted publication');
  return {versionId:found.versionId,from:found.from,to:found.to,rows:[{id:'staff-1',R:found.revision+3,teachingVerified:true,capConfigured:false}],source:structuredClone(found)};
 }};
 return {db,env,calls,state};
}
let count=0;async function test(name,work){await work();count++;console.log('PASS '+name);}
await test('background sync is publication-bound and reuses a transferred snapshot',async()=>{
 const h=fixture();const first=await dispatchQuotaSnapshot(h.env,{now:sunday});assert.equal(first.processed,1);assert.equal(h.calls.filter(row=>!row.manifest).length,1);
 await dispatchQuotaSnapshot(h.env,{now:sunday+60000});assert.equal(h.calls.filter(row=>!row.manifest).length,1,'retry reads immutable storage before requesting a body');
 assert.equal(h.db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_quota_snapshots').get().n,1);
 const health=await readQuotaSnapshotStatus(h.env,{now:sunday+60000});assert.equal(health.status,'ready');assert.equal(health.revision,1);assert.equal(health.lastCode,'OK');assert(!JSON.stringify(health).includes('staff-1'));
});
await test('overlapping normal sync retains one source call and reports pending work',async()=>{
 const h=fixture();let release;h.state.block=()=>new Promise(resolve=>{release=resolve;});const first=dispatchQuotaSnapshot(h.env,{now:sunday});
 while(!release)await new Promise(resolve=>setTimeout(resolve,0));const waiting=await dispatchQuotaSnapshot(h.env,{now:sunday+1});assert.equal(waiting.pending,1);assert.equal(waiting.processed,0);assert.equal(h.calls.length,1);
 h.state.block=null;release({schema:'gsis-roster-quota-source-v1',publications:[publication()],expectedSource:publication()});await first;
});
await test('a failed body transfer retains the published intent and shows lag',async()=>{
 const h=fixture();await dispatchQuotaSnapshot(h.env,{now:sunday});h.state.sources.push(publication(2,'2026-11-01T16:01:00+08:00'));h.state.failBody=true;
 await assert.rejects(dispatchQuotaSnapshot(h.env,{now:sunday+120000}),e=>e.code==='QUOTA_SNAPSHOT_SOURCE');
 const health=await readQuotaSnapshotStatus(h.env,{now:sunday+120001});assert.equal(health.status,'behind');assert.equal(health.expectedRevision,2);assert.equal(health.revision,1);assert.equal(health.sourceLag,true);
 h.state.failBody=false;await dispatchQuotaSnapshot(h.env,{now:sunday+180000});assert.equal((await readQuotaSnapshotStatus(h.env,{now:sunday+180001})).revision,2);
});
await test('checkpoint proof is cached between hourly checks without network calls',async()=>{
 const h=fixture(),first=await readQuotaCheckpointEvidence(h.env,clock(sunday));assert.equal(first.verified,true);assert.equal(first.week,'2026-11-02');assert.equal(first.cutoff,sunday);assert.equal(first.rows[0].R,4);
 assert.equal(h.calls.filter(row=>row.manifest).length,1);const again=await readQuotaCheckpointEvidence(h.env,clock(sunday+60000));assert.equal(again.verified,true);assert.equal(h.calls.filter(row=>row.manifest).length,1);
 await readQuotaCheckpointEvidence(h.env,clock(sunday+3600000));assert.equal(h.calls.filter(row=>row.manifest).length,2);assert.equal(h.calls.filter(row=>!row.manifest).length,1);
});
await test('a verified Monday holiday selects the first school date without changing the quota week',async()=>{
 const h=fixture();Object.assign(h.state.sources[0],{from:'2026-11-03',to:'2026-11-06'});
 const evidence=await readQuotaCheckpointEvidence(h.env,{...clock(sunday),schoolDates:['2026-11-06','2026-11-03','2026-11-05','2026-11-04']});
 assert.equal(evidence.verified,true);assert.equal(evidence.week,'2026-11-02');assert.equal(evidence.cutoff,sunday);assert.equal(evidence.rows[0].R,4);assert.equal(h.calls.find(row=>row.manifest).date,'2026-11-03');
});
await test('an explicit empty school week makes no source calls and Monday is preferred when verified',async()=>{
 const h=fixture(),empty=await readQuotaCheckpointEvidence(h.env,{...clock(sunday),schoolDates:[]});assert.equal(empty.verified,false);assert.deepEqual(empty.rows,[]);assert.equal(h.calls.length,0);
 Object.assign(h.state.sources[0],{from:'2026-11-03',to:'2026-11-06'});
 const mondayRequired=await readQuotaCheckpointEvidence(h.env,{...clock(sunday),schoolDates:['2026-11-03','2026-11-02']});assert.equal(mondayRequired.verified,false);assert.equal(h.calls[0].date,'2026-11-02');assert.equal(h.calls.filter(row=>!row.manifest).length,0,'a source that starts Tuesday cannot bypass a verified Monday');
});
await test('checkpoint proof cache is bound to its selected school date',async()=>{
 const h=fixture();const first=await readQuotaCheckpointEvidence(h.env,{...clock(sunday),schoolDates:['2026-11-02']});assert.equal(first.source.revision,1);
 const newer=publication(2,'2026-11-01T15:55:00+08:00');Object.assign(newer,{from:'2026-11-03',to:'2026-11-06'});h.state.sources=[newer,publication()];
 const next=await readQuotaCheckpointEvidence(h.env,{...clock(sunday+60000),schoolDates:['2026-11-03']});assert.equal(next.verified,true);assert.equal(next.source.revision,2);assert.equal(h.calls.filter(row=>row.manifest).length,2);assert.equal(h.calls.filter(row=>row.manifest).at(-1).date,'2026-11-03');
 const original=await readQuotaCheckpointEvidence(h.env,{...clock(sunday+120000),schoolDates:['2026-11-02']});assert.equal(original.verified,true);assert.equal(original.source.revision,1);assert.equal(h.calls.filter(row=>row.manifest).length,2);
});
await test('failed revalidation retains source identity but returns unverified evidence',async()=>{
 const h=fixture();await readQuotaCheckpointEvidence(h.env,clock(sunday));h.state.failManifest=true;
 const failed=await readQuotaCheckpointEvidence(h.env,clock(sunday+3600000));assert.equal(failed.verified,false);assert.equal(failed.source.revision,1);assert.deepEqual(failed.rows,[]);
 const again=await readQuotaCheckpointEvidence(h.env,clock(sunday+3660000));assert.equal(again.verified,false);assert.equal(h.calls.filter(row=>row.manifest).length,2);
 h.state.failManifest=false;const recovered=await readQuotaCheckpointEvidence(h.env,clock(sunday+7200000));assert.equal(recovered.verified,true);assert.equal(recovered.source.revision,1);
});
await test('later publications cannot enter an already fixed weekly cutoff',async()=>{
 const h=fixture();await dispatchQuotaSnapshot(h.env,{now:sunday});h.state.sources.push(publication(2,'2026-11-01T16:05:00+08:00'));await dispatchQuotaSnapshot(h.env,{now:sunday+600000});
 const evidence=await readQuotaCheckpointEvidence(h.env,clock(sunday+600000));assert.equal(evidence.verified,true);assert.equal(evidence.source.revision,1);assert.equal(evidence.rows[0].R,4);assert.equal(h.calls.at(-1).asOf,sunday);
});
await test('missing source produces no invented R and no calls outside the retry window',async()=>{
 const h=fixture();h.state.sources=[];const failed=await readQuotaCheckpointEvidence(h.env,clock(sunday));assert.equal(failed.verified,false);assert.deepEqual(failed.rows,[]);
 const before=h.calls.length;await readQuotaCheckpointEvidence(h.env,clock(at('2026-11-03T12:00:00+08:00')));assert.equal(h.calls.length,before);
 const noConfig=await readQuotaCheckpointEvidence({GSIS_JOBS:database()},clock(sunday));assert.equal(noConfig.verified,false);assert.deepEqual(noConfig.rows,[]);
 const dispatch=await dispatchQuotaSnapshot({GSIS_JOBS:database()},{now:sunday});assert.equal(dispatch.configured,false);assert.equal(dispatch.idle,true);
});
await test('existing Deploy bridge credentials enable sync without weakening explicit secret precedence',async()=>{
 const h=fixture();h.env.DEPLOY_APPS_SCRIPT_URL=h.env.APPS_SCRIPT_URL;h.env.DEPLOY_BRIDGE_SECRET=h.env.BRIDGE_SECRET;delete h.env.APPS_SCRIPT_URL;delete h.env.BRIDGE_SECRET;
 const synced=await dispatchQuotaSnapshot(h.env,{now:sunday});assert.equal(synced.configured,true);assert.equal(synced.processed,1);
 const blocked=fixture();blocked.env.DEPLOY_BRIDGE_SECRET=blocked.env.BRIDGE_SECRET;blocked.env.GSIS_SECRET='';
 assert.equal((await dispatchQuotaSnapshot(blocked.env,{now:sunday})).configured,false);assert.equal(blocked.calls.length,0,'an invalid explicit unified secret never falls back');
});
await test('persisted active Deploy authority syncs locally without routing flags or Google configuration',async()=>{
 const db=database(),state={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},identity={email:'synthetic@example.test'},domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('A frozen local quota needs no integration call');}});
 domain.dispatch({action:'change',input:{operation:'create',name:'Local quota',requestId:crypto.randomUUID()},identity},{user:{email:identity.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
 const entry=state.index.versions[0],document=domain.readDocument(entry),Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;');
 Object.assign(document,{from:'2026-01-01',to:'2026-12-31',teachers:[{id:'staff-1',name:'Synthetic teacher',active:true,role:'Teacher',groups:[],profile:{'Basic Name':'Synthetic teacher',Role:'Teacher',Active:'Y','EO Appt Level':'GEO3'}}]});
 const publication={...entry,commit:'local-immutable-publication',from:document.from,to:document.to,edgePublished:true,publishedAt:'2026-11-01T15:00:00+08:00'};publication.quotaCalculationVersion=domain.rosterReference(document,publication).source.calculationVersion;
 state.index.published=publication;state.index.venuePublications=[publication];state.index.quotaPublications=[publication];state.publications=Object.fromEntries(Object.entries(Fields.flat(document)).map(([key,value])=>[publication.commit+'|'+key,value]));
 const store=GSiSEdgeStore.open(db,'deploy'),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
 const env={GSIS_JOBS:db};env.testSource=input=>actualQuotaSource(env,input);const original=globalThis.fetch;let network=0;
 try{
  globalThis.fetch=async()=>{network++;assert.fail('Persisted active Deploy authority must not call Google');};
  const synced=await dispatchQuotaSnapshot(env,{now:sunday});assert.equal(synced.configured,true);assert.equal(synced.processed,1);const evidence=await readQuotaCheckpointEvidence(env,clock(sunday));assert.equal(evidence.verified,true);assert.equal(evidence.source.commit,publication.commit);assert(evidence.rows.some(row=>row.id==='staff-1'));assert.equal(network,0);assert.equal((await store.head()).mode,'active');assert.equal(env.DEPLOY_EDGE_AUTHORITY,undefined);
  const latest=await store.head();await store.transition({from:'active',to:'paused',expectedRevision:latest.revision,actor:'setup',proof:{reason:'test'}});Object.assign(env,{APPS_SCRIPT_URL:'https://script.google.com/macros/s/never-use/exec',BRIDGE_SECRET:'s'.repeat(40)});
  await assert.rejects(dispatchQuotaSnapshot(env,{now:sunday+60000}),e=>e.code==='QUOTA_SNAPSHOT_SOURCE');assert.equal((await readQuotaCheckpointEvidence(env,clock(sunday+60000))).verified,false);assert.equal(network,0,'paused authority never falls back to the configured Google source');
 }finally{globalThis.fetch=original;}
});
await test('an explicit D1 flag cannot activate an imported Deploy head or fall back',async()=>{
 const h=fixture(),store=GSiSEdgeStore.open(h.db,'deploy');await store.importState({state:{revision:0},actor:'setup',requestId:crypto.randomUUID()});h.env.DEPLOY_EDGE_AUTHORITY='d1';
 await assert.rejects(dispatchQuotaSnapshot(h.env,{now:sunday}),e=>e.code==='QUOTA_SNAPSHOT_SOURCE');assert.equal(h.calls.length,0);assert.equal((await store.head()).mode,'imported');
});
await test('Monday 05:30 forces one final attempt even after a recent failed check',async()=>{
 const h=fixture();h.state.failManifest=true;await readQuotaCheckpointEvidence(h.env,clock(monday-60000));assert.equal(h.calls.length,1);h.state.failManifest=false;
 const final=await readQuotaCheckpointEvidence(h.env,clock(monday));assert.equal(final.verified,true);assert.equal(h.calls.filter(row=>row.manifest).length,2);
 await readQuotaCheckpointEvidence(h.env,clock(monday+30000));await readQuotaCheckpointEvidence(h.env,clock(monday+60000));assert.equal(h.calls.filter(row=>row.manifest).length,2);
});
await test('a late older source call cannot replace a newer trusted checkpoint proof',async()=>{
 const h=fixture();let release;h.state.block=()=>new Promise(resolve=>{release=resolve;});const older=readQuotaCheckpointEvidence(h.env,clock(sunday));
 while(!release)await new Promise(resolve=>setTimeout(resolve,0));h.state.block=null;h.state.sources.push(publication(2,'2026-11-01T15:55:00+08:00'));
 const newer=await readQuotaCheckpointEvidence(h.env,clock(sunday+3600000));assert.equal(newer.source.revision,2);
 release({schema:'gsis-roster-quota-source-v1',publications:[publication()],expectedSource:publication()});await older;
 const retained=await readQuotaCheckpointEvidence(h.env,clock(sunday+3600100));assert.equal(retained.verified,true);assert.equal(retained.source.revision,2);assert.equal(retained.rows[0].R,5);
});
await test('a late superseded body failure cannot report failure over newer sync success',async()=>{
 const h=fixture();let release;h.state.blockBody=()=>new Promise(resolve=>{release=resolve;});const older=dispatchQuotaSnapshot(h.env,{now:sunday});
 while(!release)await new Promise(resolve=>setTimeout(resolve,0));h.state.blockBody=null;h.state.sources.push(publication(2,'2026-11-01T15:55:00+08:00'));
 await dispatchQuotaSnapshot(h.env,{now:sunday+120000});const first=publication();release({versionId:first.versionId,from:first.from,to:first.to,rows:[{id:'staff-1',R:4}],source:first});
 await assert.doesNotReject(older,'the superseded execution cannot emit a stale job failure');const health=await readQuotaSnapshotStatus(h.env,{now:sunday+120001});assert.equal(health.status,'ready');assert.equal(health.revision,2);assert.equal(health.lastCode,'OK');
});
await test('recovery pause and storage errors return safe status without writes or staff rows',async()=>{
 const db=database(),env={...fixture().env,GSIS_JOBS:db,GSIS_RECOVERY_MODE:'true'};
 const paused=await readQuotaCheckpointEvidence(env,clock(sunday));assert.equal(paused.verified,false);assert.deepEqual(paused.rows,[]);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'gsis_roster_quota%'").get().n,0);
 const health=await readQuotaSnapshotStatus({GSIS_JOBS:{prepare(){throw Error('private storage detail');},batch(){throw Error('private storage detail');}}},{now:sunday});assert.equal(health.available,false);assert.equal(health.lastCode,'QUOTA_SNAPSHOT_STORAGE');assert(!JSON.stringify(health).includes('private storage detail'));
});
console.log(count+' publication quota job checks passed');
