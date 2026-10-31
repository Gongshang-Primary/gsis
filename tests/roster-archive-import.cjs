'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Operations=require('../shared/roster-operations.js'),Store=require('../shared/edge-store.js'),Import=require('../shared/roster-import.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

function fixture(){
 const at='2026-08-10T01:00:00.000Z',date='2026-08-10';
 const reference=(collection,id)=>({month:'2026-08',collection,id,digest:hash(collection+':'+id)});
 const state=Operations.initial();
 state.outbox=[{id:'notice-1',kind:'smc_report',recipientId:'teacher-1',date,status:'sent',createdAt:at,completedAt:at,deliveryStatus:'delivered',archiveRef:reference('outbox','notice-1')}];
 state.receipts=[{id:'request-1',actor:'teacher@example.test',digest:hash('command'),at,revision:7,archiveRef:reference('receipts','request-1')}];
 state.scheduleReceipts={'2026-08-10T16:00':{at,optimise:true,allocationStatus:'complete',archiveRef:reference('scheduleReceipts','2026-08-10T16:00')}};
 state.optimisationRuns=[{id:'run-1',date,at,status:'complete',coverage:12,uncovered:0,auditExportCaptured:true,archiveRef:reference('optimisationRuns','run-1')}];
 state.audit=[{id:'audit-1',date,at,operation:'workload-review',actor:'system',archiveRef:reference('audit','audit-1')}];
 state.smcAlerts=[{id:'alert-1',date,status:'resolved',createdAt:at,resolvedAt:at,archiveRef:reference('smcAlerts','alert-1')}];
 state.coldArchive={schema:1,months:{'2026-08':{fileId:'private-monthly-archive',count:6,characters:18000}},lastNight:'2026-10-31',lastRun:{at:'2026-10-31T12:00:00.000Z',moved:6,characters:18000}};
 return Operations.validateState(state);
}

test('D1 record encoding preserves all cold stubs, reference digests and monthly summary',()=>{
 const state=fixture(),before=JSON.stringify(state),rows=[...Store.encode(state).values()],decoded=Store.decode(rows);
 assert.deepEqual(decoded,state);
 assert.equal(Store.canonicalJson(decoded),Store.canonicalJson(state));
 assert.equal(JSON.stringify(state),before,'encoding must not change the live snapshot');
 for(const collection of Operations.COLD_COLLECTIONS){
  const source=collection==='scheduleReceipts'?Object.values(state[collection]):state[collection];
  const restored=collection==='scheduleReceipts'?Object.values(decoded[collection]):decoded[collection];
  assert.deepEqual(restored.map(row=>row.archiveRef),source.map(row=>row.archiveRef),collection);
 }
 assert.deepEqual(decoded.coldArchive,state.coldArchive);
 assert.equal(Object.hasOwn(decoded.receipts[0],'result'),false,'D1 stores the archived receipt stub without reintroducing its body');
});

test('immutable D1 import accepts cold stubs and preserves their exact JSON through verified parts',()=>{
 const state=fixture(),before=JSON.stringify(state),index={schema:1,revision:0,entries:[],receipts:[]};
 const frozen=Import.freeze({state,index,sourceDigest:hash('captured-source')},{actor:'admin@example.test',requestId:'import-cold-stubs',sessionId:hash('import-session')},{
  hash,gzip:value=>zlib.gzipSync(value),base64:value=>Buffer.from(value).toString('base64'),
  readModel:()=>{throw Error('No baseline objects in this fixture');},
  readArchive:()=>{throw Error('Cold archive bodies are not part of this stub compatibility check');}
 });
 Import.validateManifest(frozen.manifest);
 assert.equal(frozen.manifestDigest,hash(JSON.stringify(frozen.manifest)));
 const records=[];
 for(let n=0;n<frozen.parts.length;n++){
  const payload=frozen.parts[n],part=frozen.manifest.parts[n];
  assert.equal(part.digest,hash(payload),'immutable part digest');
  assert.equal(part.bytes,Buffer.byteLength(payload),'immutable part length');
  if(part.kind==='records'&&part.scope==='roster')records.push(...JSON.parse(payload).rows);
 }
 assert.equal(records.length,frozen.manifest.scopes.roster.records);
 const restored=Store.decode(records);
 assert.deepEqual(restored,state);
 assert.equal(frozen.manifest.scopes.roster.digest,hash(Store.canonicalJson(restored)));
 assert.deepEqual(restored.coldArchive,state.coldArchive);
 assert.equal(JSON.stringify(state),before,'freezing must not change the source snapshot');
});
