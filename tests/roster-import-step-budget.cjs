'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js'),database=require('./helpers/chunked-import-db.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const binding={actor:'admin@example.test',requestId:'step-budget',sessionId:hash('step-budget')};
const snapshot={sourceDigest:hash('source'),state:{history:[{id:'large',text:'中文\\"'.repeat(65000)}]},index:{entries:[]}};
const adapter={hash,base64:bytes=>Buffer.from(bytes).toString('base64'),bytes:text=>[...Buffer.from(text)]};
(async()=>{
 const frozen=Import.freeze(snapshot,binding,adapter);
 assert(frozen.manifest.parts.every(part=>part.bytes<=262157),'a single large record must split into bounded transport parts');
 assert(frozen.manifest.parts.some(part=>part.kind==='record'),'the split retains one logical record with verified segment dependencies');
 assert.deepEqual(Import.freeze(snapshot,binding,adapter),frozen,'splits, offsets and digests must be deterministic');
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
