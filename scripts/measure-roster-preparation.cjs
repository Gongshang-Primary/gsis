#!/usr/bin/env node
'use strict';
// Offline comparison. The fixture models Drive costs, not live Google latency.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const assert=require('node:assert/strict');
const {prepare,harness}=require('../tests/roster099-resumable-budget.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function runtime(ref,{auditKeyProjection=false}={}){
 const read=path=>ref==='working'?fs.readFileSync(path,'utf8'):execFileSync('git',['show',ref+':'+path],{encoding:'utf8',maxBuffer:8*1024*1024});
 const storeScope={module:{exports:{}},require,TextEncoder,TextDecoder};vm.runInNewContext(read('shared/edge-store.js'),storeScope);
 if(auditKeyProjection){
  // Projection only: preserve every original audit payload while assigning
  // distinct hypothetical storage keys. The unmodified live import still
  // rejects duplicate IDs; this is not a production repair or acceptance test.
  const store=storeScope.module.exports,encode=store.encode;
  store.encode=state=>{
   if(!Array.isArray(state.audit))return encode(state);
   const counts=new Map();for(const row of state.audit){const id=row?.id??row?.ref;if(id!==undefined&&id!==null)counts.set(String(id),(counts.get(String(id))||0)+1);}
   const audit=state.audit.map((row,index)=>counts.get(String(row?.id??row?.ref))>1?{...row,id:'projection-audit-'+index}:row),rows=encode({...state,audit});
   for(const row of rows.values())if(row.collection==='audit'&&row.record_id!=='$')row.value_json=JSON.stringify(state.audit[row.position]);
   return rows;
  };
 }
 const importScope={module:{exports:{}},require,GSiSEdgeStore:storeScope.module.exports,TextEncoder,TextDecoder};vm.runInNewContext(read('shared/roster-import.js'),importScope);
 const operations=read('backend/RosterOperations.gs');
 return {backendSource:read('backend/RosterEdgeMigration.gs'),importModule:importScope.module.exports,storeModule:storeScope.module.exports,
  prelude:operations.slice(0,operations.indexOf('function rosterOperationsPackPlans_'))};
}
function summary(result){
 const s=result.preparationStats,phases={};
 for(const call of s.calls)for(const cost of call.costs){const phase=phases[cost.phase]||={ms:0,readCalls:0,readBytes:0,writeCalls:0,writeBytes:0};phase.ms+=cost.ms;if(cost.kind==='read'){phase.readCalls++;phase.readBytes+=cost.bytes;}if(cost.kind==='write'){phase.writeCalls++;phase.writeBytes+=cost.bytes;}}
 const basis=costs=>({ioCalls:costs.filter(c=>c.kind!=='cpu').length,transferMs:costs.filter(c=>c.kind!=='cpu').reduce((n,c)=>n+c.ms-5000,0),cpuMs:costs.filter(c=>c.kind==='cpu').reduce((n,c)=>n+c.ms,0)});
 return {steps:s.calls.length,completedSteps:result.steps+1,totalMs:s.calls.reduce((n,c)=>n+c.elapsed,0),maxCallMs:Math.max(...s.calls.map(c=>c.elapsed)),
  ...s.io,parts:result.parts.length,interruptions:s.interruptions,phases,
  calls:s.calls.map(c=>({ordinal:c.ordinal,...basis(c.costs),beforeCheckpoint:basis(c.costs.filter(x=>x.phase!=='Save checkpoint'))})),
  slowest:s.calls.slice().sort((a,b)=>b.elapsed-a.elapsed).slice(0,4).map(c=>({ordinal:c.ordinal,elapsed:c.elapsed,phases:Object.fromEntries([...new Set(c.costs.map(x=>x.phase))].map(p=>[p,c.costs.filter(x=>x.phase===p).reduce((n,x)=>n+x.ms,0)]))}))};
}
function projection(runs,checkpoint,sourceCreatedAt){
 const anchor=runs[0].calls.find(c=>c.ordinal===checkpoint.ordinal)?.beforeCheckpoint;assert(anchor?.ioCalls,'the old run must contain the observed checkpoint ordinal');
 const ioMs=(checkpoint.timing.elapsedMs-anchor.transferMs-anchor.cpuMs)/anchor.ioCalls;assert(ioMs>0,'the observed anchor does not fit the stated cost model');
 const duration=c=>c.ioCalls*ioMs+c.transferMs+c.cpuMs,observedMs=checkpoint.timing.finishedAt-Date.parse(sourceCreatedAt),completed=checkpoint.ordinal+1;
 const prefix=runs[0].calls.slice(0,completed).reduce((n,c)=>n+duration(c),0),pacingMs=Math.max(0,(observedMs-prefix)/completed);
 return {anchorOrdinal:checkpoint.ordinal,observedStepMs:checkpoint.timing.elapsedMs,observedPrefixMs:observedMs,fittedIoCallMs:ioMs,fittedPacingPerStepMs:pacingMs,
  runs:runs.map(r=>({ref:r.ref,steps:r.steps,simpleStepOnlyMs:r.steps*16000,backendMs:r.calls.reduce((n,c)=>n+duration(c),0),wallMs:r.calls.reduce((n,c)=>n+duration(c),0)+r.steps*pacingMs}))};
}
function capturedSource(directory,checkpointPath){
 const checkpoint=JSON.parse(fs.readFileSync(checkpointPath)),raw=fs.readFileSync(path.join(directory,'source.json'));
 assert.equal(hash(raw),checkpoint.source.digest,'captured source digest');
 const envelope=JSON.parse(raw),source={state:envelope.snapshot.state,index:envelope.snapshot.index,files:new Map()};
 // The retained string-digest proofs determine the host encoding. Byte-array
 // SHA-256 always remains byte-exact. Never change or bypass a stored proof.
 let utf8=true,ascii=true,proofs=0;
 for(const row of [...(source.state.staplerPlans||[]),...(source.state.staplerArchives||[])])for(const key of ['draft','published','confirmedPlan']){
  const value=row[key];if(value?.encoding!=='gzip-base64-v1'||!value.validation)continue;proofs++;
  const text=gunzipSync(Buffer.from(value.data,'base64')).toString('utf8');utf8&&=hash(text)===value.validation.digest;ascii&&=hash([...text].map(char=>char.codePointAt(0)<128?char:'?').join(''))===value.validation.digest;
 }
 assert(!proofs||utf8||ascii,'retained string-digest proofs do not match a supported host encoding');source.stringEncoding=utf8?'utf8':'ascii';
 checkpoint.references.forEach((entry,index)=>{
  const raw=fs.readFileSync(path.join(directory,index+'.decoded.json'));assert.equal(hash(raw),entry.reference.digest,'retained object digest');
  let value=envelope.snapshot;for(const key of entry.job.path)value=value[key];
  const id=entry.job.kind==='baseline'?value.modelFile:entry.job.kind==='audit'?value.archiveFileId:null;
  if(id)source.files.set(id,{name:entry.job.kind+'-'+index,bytes:raw});
 });
 return source;
}
function prepareCaptured(runtime,source){
 const h=harness({...runtime,source,stringEncoding:source.stringEncoding}),request={operation:'edgeExportManifest',requestId:'captured-fixture'};
 let response=h.call({...request,preparation:{ordinal:0,checkpoint:null}}),steps=0;
 while(response.preparing){assert(++steps<1000,'captured preparation must terminate');response=h.call({...request,preparation:response.preparation});}
 assert(response.manifest,'captured preparation manifest');runtime.importModule.validateManifest(response.manifest);
 for(const part of response.manifest.parts){const file=[...h.files.values()].find(f=>f.name.endsWith(' '+part.id+' '+part.digest+'.json'));assert(file,'retained part file');assert.equal(hash(file.bytes),part.digest,'part payload digest');}
 return {manifest:response.manifest,parts:response.manifest.parts,preparationStats:h.stats(),steps};
}
function main(args){
 const interrupted=args.includes('--interruptions');args=args.filter(x=>x!=='--interruptions');
 const auditKeyProjection=args.includes('--audit-key-projection');args=args.filter(x=>x!=='--audit-key-projection');
 const timeIndex=args.indexOf('--source-created-at'),sourceCreatedAt=timeIndex<0?null:args[timeIndex+1];if(timeIndex>=0)args.splice(timeIndex,2);
 const directory=args[0]==='--captured'?args[1]:null,checkpointPath=directory?args[2]:null,refs=directory?args.slice(3):args;assert(refs.length,'Supply one or more git refs, or working.');
 assert(!directory||!interrupted,'captured replay is uninterrupted; use the synthetic fixture for injected interruptions');
 let baseline;
 const runs=refs.map(ref=>{const code=runtime(ref,{auditKeyProjection}),result=directory?prepareCaptured(code,capturedSource(directory,checkpointPath)):prepare({...code,prelude:'',reload:interrupted,changeLive:interrupted,interrupt:interrupted});
  if(baseline)assert.equal(JSON.stringify(result.manifest.scopes),JSON.stringify(baseline.manifest.scopes),'scope contents must match');else baseline=result;
  return {ref,interrupted,...summary(result)};});
 console.log(JSON.stringify({simulation:{fixture:directory?'retained-capture':'synthetic-16M',counterfactualAuditKeys:auditKeyProjection,ioCallMs:5000,ioMsPerMiB:1000,cpuMsPerMiB:300,includesVerificationDownloads:false},runs,...(sourceCreatedAt?{projection:projection(runs,JSON.parse(fs.readFileSync(checkpointPath)),sourceCreatedAt)}:{})},null,2));
}
module.exports={runtime,summary,projection};
if(require.main===module)main(process.argv.slice(2));
