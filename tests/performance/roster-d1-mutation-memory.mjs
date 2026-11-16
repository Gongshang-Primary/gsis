// Synthetic local benchmark. Optional argument: an older checkout to compare.
// The current admission helper is harmless when the older handler does not call it.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {withRosterMutationAdmission} from '../../roster-update/public/edge-roster-admission.js';
assert.equal(typeof global.gc,'function','Run with node --expose-gc');
const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const {GSiSEdgeStore:Store}=await import(root+'/roster-update/public/edge-store.js');
const {GSISRosterOperations:O}=await import(root+'/roster-update/public/edge-roster-domain.js');
const {loadEdgeRoster,mutateEdgeRoster}=await import(root+'/roster-update/public/edge-roster.js');
const db=createRequire(import.meta.url)('../helpers/chunked-import-db.cjs')();
const width=3,auditCount=2000,textSize=3072,realBatch=db.batch.bind(db);
const mib=n=>+(n/1048576).toFixed(2);let measuring=false,samples=[];
function sample(stage){const before=process.memoryUsage();global.gc();const after=process.memoryUsage();const row={stage,heapMiB:mib(before.heapUsed),retainedHeapMiB:mib(after.heapUsed),rssMiB:mib(after.rss),externalMiB:mib(after.external)};samples.push(row);console.log(JSON.stringify(row));}
db.batch=async statements=>{if(measuring&&statements[0]?.text.startsWith('UPDATE gsis_edge_heads SET revision='))sample('encoded-write-batch');const values=await realBatch(statements);if(measuring&&statements.some(s=>s.text.includes('SELECT r.collection,r.record_id,r.position,r.record_date,r.value_json')))sample('raw-roster-query');return values;};
globalThis.fetch=()=>assert.fail('No external reads in synthetic probe');
const env=withRosterMutationAdmission({GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:{get(){assert.fail('No R2 reads');},put(){assert.fail('No R2 writes');}},WHATSAPP_ENABLED:'false'});
async function activate(scope,state){const store=Store.open(db,scope),h=await store.importState({state,actor:'synthetic-fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'synthetic-fixture',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});}
async function setup(){const state=O.initial();state.audit=Array.from({length:auditCount},(_,i)=>({id:'synthetic-history-'+i,date:'2026-10-01',operation:'syntheticMemoryEvidence',detail:String(i).padStart(8,'0')+':'+('0123456789abcdef'.repeat(Math.ceil(textSize/16)).slice(0,textSize))}));state.inboxMessages=Array.from({length:Math.floor(auditCount/3)},(_,i)=>({id:'synthetic-inbox-'+i,direction:'outbound',status:'sent',text:'synthetic '+i+':'+('abcdefghijklmnop'.repeat(128))}));await activate('roster',state);await activate('roster-register',{revision:0,entries:[],receipts:[]});await activate('roster-references',{schema:1,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{}});}
await setup();global.gc();const baseline=process.memoryUsage().heapUsed;const input=db.sql.prepare("SELECT collection,count(*) rows,sum(length(value_json)) json_bytes FROM gsis_edge_records WHERE scope='roster' GROUP BY collection HAVING sum(length(value_json))>10000").all();console.log(JSON.stringify({kind:'fixture',width,auditCount,textSize,collections:input,source:'synthetic only',node:process.version}));sample('baseline');
measuring=true;
async function measureSingleLoad(){let loaded=await loadEdgeRoster(env);assert.equal(loaded.state.audit.length,auditCount);assert.equal(loaded.state.inboxMessages.length,0);sample('loadEdgeRoster-return-raw-plus-clone');loaded=null;}
await measureSingleLoad();
await new Promise(r=>setImmediate(r));global.gc();sample('load-released');
let activeApply=0,maxActiveApply=0;const started=[];const requests=Array.from({length:width},()=>crypto.randomUUID());
for(let i=0;i<width;i++)started.push(mutateEdgeRoster(env,{actor:'synthetic-service',requestId:requests[i],command:{operation:'currentDuty',syntheticProbe:i},domainChanged:false,async apply(state){activeApply++;maxActiveApply=Math.max(maxActiveApply,activeApply);sample('mutation-'+i+'-apply');await new Promise(setImmediate);activeApply--;state.systemConfig.syntheticMemoryProbe=(state.systemConfig.syntheticMemoryProbe||0)+1;return {syntheticSaved:true};},beforeCommit(){sample('mutation-'+i+'-packed-before-commit');}}));
const results=await Promise.all(started);assert.equal(results.length,width);measuring=false;const saved=await loadEdgeRoster(env);assert.equal(saved.state.systemConfig.syntheticMemoryProbe,width);assert.equal(saved.state.audit.length,auditCount);console.log(JSON.stringify({kind:'result',root,completed:results.length,maxActiveApply,auditRows:saved.state.audit.length,retainedInboxRows:db.sql.prepare("SELECT count(*) n FROM gsis_edge_records WHERE scope='roster' AND collection='inboxMessages' AND record_id<>'$'").get().n,mutationReceipts:db.sql.prepare("SELECT count(*) n FROM gsis_edge_receipts WHERE scope='roster' AND actor='synthetic-service'").get().n,maxHeapMiB:Math.max(...samples.map(x=>x.heapMiB)),maxRetainedHeapMiB:Math.max(...samples.map(x=>x.retainedHeapMiB)),baselineMiB:mib(baseline),netRetainedPeakMiB:+(Math.max(...samples.map(x=>x.retainedHeapMiB))-mib(baseline)).toFixed(2),warning:'Node + in-process SQLite, not a Cloudflare heap measurement; explicit GC and synthetic currentDuty mutations; no live data or provider calls'}));db.sql.close();
