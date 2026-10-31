// Real local workerd + D1 acceptance probe for immutable Google-backup paging.
// Synthetic records only. The Google endpoint is a local test double; no remote
// service, school record, activation flag or deployment is touched.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,Response as LocalResponse} from 'miniflare';
import {profileWorker} from './worker-profile.mjs';

const require=createRequire(import.meta.url),Store=require('../../shared/edge-store.js');
const root=fileURLToPath(new URL('../../',import.meta.url)),MiB=1024*1024;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const roster={revision:1,audit:Array.from({length:5000},(_,i)=>({id:'synthetic-'+String(i).padStart(5,'0'),date:'2026-10-31',message:('record '+i+' ').padEnd(3000,'x')})),settings:{fixture:true}};
const register={revision:1,entries:[],receipts:[]},fixtureBytes=Buffer.byteLength(JSON.stringify({roster,register}));
assert(fixtureBytes>=14*MiB,'the D1 fixture must exceed14MiB');
const expected=new Map();let transferredBytes=0,maximumBridgeBytes=0,hostCursor=0,hostChain='',hostGeneration=null;
const script=await build({stdin:{resolveDir:root,sourcefile:'roster-mirror-runtime-entry.mjs',contents:`
 import Store from './shared/edge-store.js';
 import Mirror from './shared/roster-mirror.js';
 export default {async fetch(request,env){
  try{
   const op=new URL(request.url).pathname,input=request.method==='POST'?await request.json():{};
   if(op==='/start')return Response.json(await Mirror.capture(env.GSIS_JOBS,{leaseMs:420000}));
   if(op==='/step'){
    const page=await Mirror.page(env.GSIS_JOBS,input.id,{cursor:input.cursor,leaseToken:input.leaseToken,limit:128,maxBytes:524288});
    const response=await fetch('https://mirror-runtime.invalid/page',{method:'POST',body:JSON.stringify(page)}),proof=await response.json();
    const accepted=await Mirror.advance(env.GSIS_JOBS,input.id,{cursor:page.cursor,next:page.next,digest:page.digest,leaseToken:input.leaseToken,proof});
    return Response.json(accepted);
   }
   if(op==='/finish'){
    const response=await fetch('https://mirror-runtime.invalid/finalize',{method:'POST',body:JSON.stringify(input)}),proof=await response.json();
    return Response.json(await Mirror.acknowledge(env.GSIS_JOBS,input.id,{leaseToken:input.leaseToken,...proof}));
   }
   if(op==='/status')return Response.json(await Mirror.status(env.GSIS_JOBS));
   return new Response('not found',{status:404});
  }catch(error){return Response.json({error:error.message,code:error.code},{status:error.status||500});}
 }};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const bundled=script.outputFiles[0].text,name='roster-mirror-runtime';
const mf=new Miniflare({name,modules:true,script:bundled,compatibilityDate:'2026-07-01',inspectorPort:0,d1Databases:{GSIS_JOBS:'synthetic-roster-mirror'},
 async outboundService(request){
  const raw=await request.text();maximumBridgeBytes=Math.max(maximumBridgeBytes,Buffer.byteLength(raw));const data=JSON.parse(raw);
  if(new URL(request.url).pathname==='/page'){
   assert(hostGeneration);assert.equal(data.id,hostGeneration.id);assert.equal(data.cursor,hostCursor);assert.equal(data.digest,sha(JSON.stringify(data.items)));
   for(const item of data.items){
    assert.equal(item.seq,++hostCursor);hostChain=sha(hostChain+'\n'+JSON.stringify(item));transferredBytes+=Buffer.byteLength(JSON.stringify(item));
    if(item.kind==='record'){const key=JSON.stringify([item.scope,item.payload.collection,item.payload.record_id]),record=expected.get(key);assert(record,'every frozen row must belong to the original source');for(const field of ['value_json','position','record_date'])assert.equal(item.payload[field],record[field]);expected.delete(key);}
   }
   assert.equal(data.next,hostCursor);assert.equal(data.snapshotDigest,hostChain);
   return LocalResponse.json({generationId:hostGeneration.id,cursor:data.cursor,next:data.next,digest:data.digest,snapshotDigest:hostChain});
  }
  assert.equal(new URL(request.url).pathname,'/finalize');assert.equal(data.cursor,hostCursor);assert.equal(data.snapshotDigest,hostChain);
  return LocalResponse.json({verified:true,generationId:data.id,epoch:data.epoch,revisions:data.revisions,transportRevision:data.transportRevision,snapshotDigest:hostChain,manifestDigest:sha('synthetic Google manifest '+hostChain)});
 }});
let profiler;
try{
 const db=await mf.getD1Database('GSIS_JOBS');await Store.open(db,'roster').ensure();await Store.open(db,'roster-register').ensure();
 // Fixture generation/seeding runs outside the measured application isolate.
 for(const [scope,state]of [['roster',roster],['roster-register',register]]){
  const rows=[...Store.encode(state).values()];for(const row of rows)expected.set(JSON.stringify([scope,row.collection,row.record_id]),row);
  for(let n=0;n<rows.length;n+=50)await db.batch(rows.slice(n,n+50).map(row=>db.prepare('INSERT INTO gsis_edge_records(scope,collection,record_id,position,record_date,value_json,revision) VALUES(?,?,?,?,?,?,1)').bind(scope,row.collection,row.record_id,row.position,row.record_date,row.value_json)));
  await db.prepare("UPDATE gsis_edge_heads SET mode='active',revision=1,updated_at=? WHERE scope=?").bind(Date.now(),scope).run();
  await db.prepare('INSERT INTO gsis_edge_receipts(scope,actor,request_id,digest,revision,result_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(scope,'synthetic-admin','fixture-'+scope,sha(scope),1,'{"saved":true}',Date.now()).run();
 }
 profiler=await profileWorker(mf,name);
 const send=(label,route,data)=>profiler.measure(label,async()=>{const response=await mf.dispatchFetch('http://localhost'+route,{method:'POST',body:JSON.stringify(data||{})}),result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;});
 let generation=await send('freeze','/start');hostGeneration=generation;hostChain=generation.initialDigest;assert.equal(generation.revisions.roster,1);assert.equal(generation.revisions.register,1);
 // A live commit after capture must not change any frozen page.
 const changed=JSON.stringify({id:'synthetic-00000',date:'2026-10-31',message:'later live version'});
 await db.batch([db.prepare("UPDATE gsis_edge_records SET value_json=?,revision=2 WHERE scope='roster' AND collection='audit' AND record_id='id:synthetic-00000'").bind(changed),db.prepare("UPDATE gsis_edge_heads SET revision=2,updated_at=? WHERE scope='roster'").bind(Date.now())]);
 let steps=0;while(generation.cursor<generation.totalCount){assert(steps++<100,'paging must make bounded forward progress');const before=generation.cursor;generation=await send('page-'+steps,'/step',generation);assert(generation.cursor>before);}
 assert.equal(expected.size,0,'every original D1 record must be transferred exactly once');assert.equal(hostCursor,generation.totalCount);
 const mirrored=await send('finish','/finish',generation);assert.equal(mirrored.state,'mirrored');assert.equal(mirrored.snapshotDigest,hostChain);
 const status=await send('status','/status');assert.equal(status.latest.id,generation.id);assert.equal(status.proof,null,'later live commit keeps older verified generation stale');assert.equal(status.pendingCount,1);
 const next=await send('next-generation','/start');assert.equal(next.revisions.roster,2);assert.notEqual(next.id,generation.id);
 const measurements=profiler.measurements,maximumSampledCpuMs=Math.max(...measurements.map(r=>r.sampledActiveMs)),maximumWallMs=Math.max(...measurements.map(r=>r.wallMs));
 assert(profiler.peakBytes<96*MiB,'sampled app isolate must leave32MiB within128MiB');assert(maximumSampledCpuMs<30000&&maximumWallMs<30000,'each local step must fit paid Worker30s CPU budget');assert(maximumBridgeBytes<MiB,'no page may contain the wholeRoster');
 const report={runtime:'local workerd via miniflare '+require('miniflare/package.json').version,fixtureBytes,recordCount:generation.recordCount,receiptCount:generation.receiptCount,steps,transferredBytes,maximumBridgeBytes,bundleSha256:sha(bundled),sampledPeakIsolateBytes:profiler.peakBytes,maximumSampledCpuMs,maximumWallMs,measurements,boundaries:'Synthetic real workerd/D1 run. Google is a local digest-verifying endpoint double, not Apps Script. Fixture seeding is outside measured isolate. CPU is inspector sampling; memory is sampled V8+embedder+backing storage, not process RSS. Live Google timing, account CPU tier, R2-object conversion and production acceptance are not certified. No deployment, live authority change or real messages.'};
 const output=path.resolve(root,process.env.GSIS_MIRROR_PROFILE_OUTPUT||'docs/coordination/review/roster-d1-mirror-runtime.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,measurements:undefined,evidence:path.relative(root,output)},null,2));console.log('PASS real workerd/D1 immutable14MiB mirror paging and subsequent revision queue');
}finally{await profiler?.close();await mf.dispose();}
