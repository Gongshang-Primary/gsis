'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const binding={actor:'admin@example.test',requestId:'resumable-fixture',sessionId:hash('resumable-fixture')};
const snapshot={sourceDigest:hash('source'),state:{revision:4,rows:[{date:'2026-10-29',value:'中文'.repeat(45000)},{date:'2026-10-30',value:'b'.repeat(150000)},{date:'2026-10-29',value:'c'.repeat(150000)}],allocationAuditExports:{'2026-10-29':{archiveFileId:'archive-1'}},staplerPlans:[{id:'plan-1',draft:{data:'plan'.repeat(10000)},confirmedPlan:{data:'plan'.repeat(10000)}}]},index:{schema:1,entries:[{id:'model-1',modelFile:'file-1',name:'Model 1'}],receipts:[]}};
let modelReads=0,archiveReads=0;
const adapter={hash,gzip:v=>[...zlib.gzipSync(v)],base64:v=>Buffer.from(v).toString('base64'),readModel:entry=>{modelReads++;assert.equal(entry.modelFile,'file-1');return {cells:[['EL','3A','中文']]};},readArchive:(date,id)=>{archiveReads++;assert.equal(date,'2026-10-29');assert.equal(id,'archive-1');return {schema:1,date,audit:[{id:'audit-1'}]};}};
const original=JSON.stringify(snapshot),jobs=Import.objectJobs(snapshot);
assert.equal(modelReads,0);assert.equal(archiveReads,0);assert.deepEqual(jobs.map(j=>j.kind),['baseline','audit','stapler','stapler']);
let position={ordinal:0,offset:0},parts=[],partMetadata=[],references=[];
for(const job of jobs){const result=Import.prepareObject(snapshot,job,position,adapter),replayed=Import.prepareObject(snapshot,job,position,adapter);assert.deepEqual(result,replayed,'replaying a killed job is deterministic');parts.push(...result.parts);partMetadata.push(...result.partMetadata);references.push({job,reference:result.reference});position=result.position;}
assert.equal(modelReads,2);assert.equal(archiveReads,2);
const encode=Store.encode,encoded=[];Store.encode=value=>{encoded.push(value);return encode(value);};
let records;try{records=Import.prepareRecords(snapshot,references,position,adapter);}finally{Store.encode=encode;}
assert.equal(encoded.length,2,'each complete scope is encoded once');parts.push(...records.parts);partMetadata.push(...records.partMetadata);
const result=Import.finishFreeze(snapshot,binding,partMetadata,records.scopes,adapter);
assert.equal(result.manifestDigest,'cacfe967da6c9cf950608f8f3f902d0626a55e7a62a06204ee16e3d524270d35','manifest remains byte-identical to the original freeze implementation');
assert.deepEqual(Import.freeze(snapshot,binding,adapter),{...result,parts});assert.equal(JSON.stringify(snapshot),original,'helpers never mutate frozen input');
const rows=parts.flatMap((payload,i)=>partMetadata[i].kind==='records'?JSON.parse(payload).rows.map(r=>({...r,scope:partMetadata[i].scope})):[]),restored=Store.decode(rows.filter(r=>r.scope==='roster'));
assert.equal(rows.find(r=>r.collection==='rows'&&r.position===0&&r.record_id!=='$').record_id,'index:0');assert.equal(rows.find(r=>r.collection==='rows'&&r.position===2&&r.record_id!=='$').record_id,'index:2');assert.deepEqual(restored.rows,snapshot.state.rows);
assert.throws(()=>Import.prepareRecords(snapshot,references.slice(1),position,adapter),e=>e.code==='ROSTER_IMPORT_OBJECT');
assert.throws(()=>Import.prepareRecords({...snapshot,state:{rows:[{id:'same'},{id:'same'}]},index:{entries:[]}},[],{ordinal:0,offset:0},adapter),e=>e.code==='EDGE_RECORD_ID');
assert.throws(()=>Import.prepareObject(snapshot,jobs[0],{ordinal:Import.MAX_PARTS,offset:0},adapter),e=>e.code==='ROSTER_IMPORT_LIMIT');
console.log('PASS resumable freeze helpers: exact old manifest, independent replay, complete global encoding, source immutability and limits.');
