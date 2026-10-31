import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {gzipSync} from 'node:zlib';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {loadEdgeRoster,mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){return sql.prepare(this.text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){const r=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(r.changes)}};}});return {sql,prepare,withSession(){return this;},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>{const q=sql.prepare(s.text);if(/^\s*(SELECT|WITH)/.test(s.text))return {success:true,results:q.all(...s.args),meta:{changes:0}};const r=q.run(...s.args);return {success:true,results:[],meta:{changes:Number(r.changes)}};});sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
function packed(value){const json=JSON.stringify(value);return {encoding:'gzip-audit-v1',bytes:Buffer.byteLength(json),digest:sha256Hex(json),data:gzipSync(json).toString('base64')};}
const db=database(),store=GSiSEdgeStore.open(db,'roster'),env={GSIS_JOBS:db},state=O.initial();
const evidence={version:1,inputs:{baselineId:'school'},teachers:Array.from({length:5000},(_,i)=>({staffId:'teacher-'+i,name:'Synthetic teacher',reason:'Selected from eligible school teachers'})),periods:[],lessons:[]};
const current=packed(evidence),older=packed({...evidence,inputs:{baselineId:'older'}}),bad={...current,data:'invalid-gzip'};
state.optimisationRuns=[{id:'past',date:'2026-10-29',decisionEvidence:bad},{id:'older',date:'2026-10-30',decisionEvidence:older},{id:'current',date:'2026-10-30',decisionEvidence:current}];
const head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
const compact=await loadEdgeRoster(env);assert.deepEqual(compact.state.optimisationRuns,state.optimisationRuns,'compact loads preserve packed evidence and never read corrupt history');
const expanded=await loadEdgeRoster(env,{hydrate:true,dates:['2026-10-30']});assert.equal(sha256Hex(JSON.stringify(expanded.state.optimisationRuns[2].decisionEvidence)),sha256Hex(JSON.stringify(evidence)),'dated hydration exposes the latest real audit evidence');assert.deepEqual(expanded.state.optimisationRuns[1].decisionEvidence,older,'older same-day runs remain compressed');assert.deepEqual(expanded.state.optimisationRuns[0].decisionEvidence,bad,'unrelated corrupt history is not decoded');assert.deepEqual(expanded.rawState.optimisationRuns,state.optimisationRuns,'raw D1 comparison baseline stays packed');
await mutateEdgeRoster(env,{actor:'test',requestId:crypto.randomUUID(),command:{operation:'fixture'},needsContext:false,apply:async s=>{const loaded=await loadEdgeRoster(env,{hydrate:true,dates:['2026-10-30']});s.optimisationRuns=loaded.state.optimisationRuns;s.testMarker=true;return {saved:true};}});
assert.deepEqual((await store.load()).state.optimisationRuns,state.optimisationRuns,'a write after hydration persists original packed bytes');
await assert.rejects(loadEdgeRoster(env,{hydrate:true,dates:['2026-10-29']}),e=>e.status===503&&e.code==='ROSTER_AUDIT_INTEGRITY');
for(const invalid of [{...current,bytes:2},{...current,digest:'0'.repeat(64)},packed({version:2,inputs:{}}),{...current,bytes:2000001}]){
 const before=await store.load(),after=structuredClone(before.state);after.optimisationRuns[2].decisionEvidence=invalid;
 await store.commit({before:before.state,after,expectedRevision:before.revision,actor:'fixture',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(after),result:{}});
 await assert.rejects(loadEdgeRoster(env,{hydrate:true,dates:['2026-10-30']}),e=>e.status===503&&e.code==='ROSTER_AUDIT_INTEGRITY');
}
console.log('PASS packed audit dated hydration, corrupt-history isolation, original-byte persistence, bounded decompression and integrity failures');
