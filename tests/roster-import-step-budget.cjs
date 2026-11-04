'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js'),database=require('./helpers/chunked-import-db.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const binding={actor:'admin@example.test',requestId:'step-budget',sessionId:hash('step-budget')};
const snapshot={sourceDigest:hash('source'),state:{history:[{id:'large',text:'中文\\"'.repeat(65000)}]},index:{entries:[]}};
const adapter={hash,base64:bytes=>{assert(bytes.every(value=>value>=-128&&value<=127),'Apps Script byte arrays use signed bytes');return Buffer.from(bytes).toString('base64');}};
(async()=>{
 const frozen=Import.freeze(snapshot,binding,adapter);
 assert(frozen.manifest.parts.every(part=>part.bytes<=262157),'a single large record must split into bounded transport parts');
 assert(frozen.manifest.parts.some(part=>part.kind==='record'),'the split retains one logical record with verified segment dependencies');
 assert.deepEqual(Import.freeze(snapshot,binding,adapter),frozen,'splits, offsets and digests must be deterministic');
 for(let start=0;start<frozen.parts.length;start++){const selected=Import.prepareRecords(snapshot,[],{ordinal:0,offset:0},adapter,{start,limit:1});assert.equal(selected.totalParts,frozen.parts.length);assert.deepEqual(selected.parts,[frozen.parts[start]]);assert.deepEqual(selected.partMetadata,[frozen.manifest.parts[start]]);}
 const indexed=Import.prepareRecords(snapshot,[],{ordinal:0,offset:0},adapter,{start:0,limit:1,plan:true});
 for(let next=0;next<indexed.totalParts;next++){const part=Import.prepareRecordPart(snapshot,[],{plan:indexed.partPlan,next,end:indexed.position,total:indexed.totalParts,scopes:indexed.scopes},adapter);assert.deepEqual(part.parts,[frozen.parts[next]],'bounded indexed reads retain exact payloads');}
 const shapes={rows:[{date:'2026-11-03'},{date:'2026-11-03'},{id:'stable',text:'中文'}],settings:{alpha:1,beta:false},flag:true};const encoded=[...Store.encode(shapes).values()];
 for(let start=0;start<encoded.length;start++)assert.deepEqual(Store.recordRange(shapes,start,1),[encoded[start]],'ranges preserve global natural IDs and collection metadata');
 assert.throws(()=>Store.recordRange(shapes,encoded.length,1),error=>error.code==='EDGE_STATE');
 const db=database(),store=Import.open(db,binding),files=new Map();await store.reserve();await store.bind(frozen.manifest,frozen.manifestDigest);
 const bucket={async put(key,bytes,options){files.set(key,{bytes:Buffer.from(bytes),...options});},async head(key){const file=files.get(key);return file&&{size:file.bytes.length,customMetadata:file.customMetadata};},async get(key){const file=files.get(key);return file&&{size:file.bytes.length,arrayBuffer:async()=>file.bytes};}};
 for(let i=0;i<frozen.parts.length;i++){
  const payload=frozen.parts[i],{part,body}=await store.validatePart(frozen.manifest.parts[i].id,payload);
  const receipt=part.kind==='records'?undefined:await Import.stageObject(bucket,store,binding.sessionId,part,body);
  await store.stage(part.id,payload,receipt);await store.stage(part.id,payload,receipt);
 }
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_rows WHERE collection=? AND record_id<>?').get('history','$').n,1,'retry cannot duplicate a split record');
 await store.referencesReady();await store.finalize();assert.deepEqual((await Store.open(db,'roster').load()).state,snapshot.state);
 db.sql.close();console.log('PASS oversized UTF-8 record: bounded deterministic parts, verified exact reassembly and duplicate-free retries');
})().catch(error=>{console.error(error);process.exitCode=1;});
