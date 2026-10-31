import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {runRosterMirror,rosterMirrorStatus,releaseRosterMirror} from '../roster-update/public/edge-roster-mirror.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

function fixture({object=null,copies=1,workbookBytes=null}={}){
 const calls=[],accepted=[],objects=new Map(),uploads=new Map();let cursor=0,remoteCursor=0,chain=sha256Hex('seed'),remoteChain=chain,verified=false,phase='normal',lostPage=false,badAck=false;
 const refs=object===null?[]:Array.from({length:copies},(_,i)=>({key:'gsis/roster/stapler/test-'+i+'/'+sha256Hex(object)+'.json.gz',digest:sha256Hex(object),encoding:'gzip-json-v1'})),reference=refs[0]||null;
 const values=[{collection:'$root',record_id:'$',position:0,record_date:'',value_json:JSON.stringify({keys:['revision','staplerPlans']})},{collection:'staplerPlans',record_id:'id:p1',position:0,record_date:'2026-10-31',value_json:JSON.stringify(reference?{id:'p1',draft:{edgeObject:true,...reference},also:refs.slice(1).map(ref=>({edgeObject:true,...ref}))}:{id:'p1',draft:{note:'saved'}})}];
 const workbookText=workbookBytes?.toString('base64'),workbookReference=workbookText?{key:'gsis/roster/workbooks/one/'+sha256Hex(workbookText)+'.xlsx',digest:sha256Hex(workbookText),encoding:'base64-binary-v1'}:null;
 if(workbookReference)values[1].value_json=JSON.stringify({...JSON.parse(values[1].value_json),workbookKey:workbookReference.key});
 const items=values.map((payload,i)=>({seq:i+1,kind:'record',scope:'roster',payload}));
 const generation=()=>({id:'generation-one',epoch:1,revisions:{roster:5,register:2},transportRevision:0,recordCount:2,receiptCount:0,transportCount:0,totalCount:2,cursor,initialDigest:sha256Hex('seed'),snapshotDigest:chain,leaseToken:'lease',leaseUntil:9999999999999});
 const proof=()=>({verified:true,generationId:'generation-one',epoch:1,revisions:{roster:5,register:2},transportRevision:0,snapshotDigest:chain,manifestDigest:sha256Hex('manifest')});
 const core={
  async capture(){return verified?{skipped:true,reason:'caught-up'}:generation();},
  async page(_db,_id,options){assert.equal(options.cursor,cursor);const selected=items.filter(item=>item.seq>cursor).slice(0,1);let nextChain=chain;for(const item of selected)nextChain=sha256Hex(nextChain+'\n'+JSON.stringify(item));return {cursor,next:selected.at(-1).seq,items:selected,digest:sha256Hex(JSON.stringify(selected)),snapshotDigest:nextChain};},
  async advance(_db,_id,value){assert.equal(value.cursor,cursor);assert.equal(value.proof.cursor,value.cursor);assert.equal(value.proof.next,value.next);chain=value.proof.snapshotDigest;cursor=value.next;accepted.push(cursor);return generation();},
  async acknowledge(_db,_id,value){assert.equal(cursor,2);assert.equal(value.snapshotDigest,chain);assert.equal(value.manifestDigest,sha256Hex('manifest'));verified=true;},
  async status(){return {enabled:phase!=='released',phase,lagMs:verified?0:180001,proof:verified?proof():null};},
  async beginRelease(){phase=phase==='released'?phase:'quiescing';return {phase};},
  async cancelRelease(){assert.equal(phase,'quiescing');phase='normal';},
  async sealRelease(){phase='paused';},
  async finishRelease(_db,_request,value){assert(verified);assert.equal(value.manifestDigest,sha256Hex('manifest'));phase='released';},
  async releaseLease(){}
 };
 const bridge=async p=>{
  assert.equal(p.operation,'edgeMirror');calls.push(p);const binding={generationId:'generation-one',epoch:badAck?2:1};
  if(p.step==='prune')return {pruned:0,pending:false};
  if(p.step==='begin')return {...binding,cursor:remoteCursor};
  if(p.step==='objectStatus'){const saved=uploads.get(p.reference.key);return {...binding,objectReady:objects.has(p.reference.key),nextIndex:saved?.length||0,total:saved?.total||0};}
  if(p.step==='objectsStatus')return {...binding,objects:p.references.map(ref=>{const saved=uploads.get(ref.key);return {key:ref.key,objectReady:objects.has(ref.key),nextIndex:saved?.length||0,total:saved?.total||0};})};
  if(p.step==='object'){
   let parts=uploads.get(p.reference.key);if(!parts){parts=[];parts.total=p.total;uploads.set(p.reference.key,parts);}assert.equal(p.index,parts.length);assert.equal(sha256Hex(p.text),p.digest);assert(p.text.length<=131072);parts.push(p.text);
   if(p.index===p.total-1){assert.equal(sha256Hex(parts.join('')),p.reference.digest);objects.set(p.reference.key,parts.join(''));}
   return {...binding,index:p.index,total:p.total,objectReady:p.index===p.total-1};
  }
  if(p.step==='page'){
   assert.equal(p.digest,sha256Hex(JSON.stringify(p.items)));
   if(p.cursor===remoteCursor){for(const item of p.items)remoteChain=sha256Hex(remoteChain+'\n'+JSON.stringify(item));remoteCursor=p.items.at(-1).seq;}
   const ack={...binding,cursor:p.cursor,next:remoteCursor,digest:p.digest,snapshotDigest:remoteChain};if(lostPage){lostPage=false;throw Error('lost page acknowledgement');}return ack;
  }
  if(p.step==='finalize'){assert.equal(p.snapshotDigest,remoteChain);return proof();}
  if(p.step==='release'){assert.equal(phase,'paused');assert.equal(p.proof.manifestDigest,sha256Hex('manifest'));return {...binding,released:true,manifestDigest:p.proof.manifestDigest};}
  throw Error('unexpected step '+p.step);
 };
 const compressed=reference?gzipSync(object):null;
 const env={ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:{prepare(){},batch(){}},ROSTER_TIMETABLE_SNAPSHOTS:{async get(key){if(key===workbookReference?.key)return {body:new Blob([workbookBytes]).stream()};assert(refs.some(ref=>ref.key===key));return {body:new Blob([compressed]).stream()};}}};
 return {env,core,bridge,calls,accepted,objects,reference,workbookReference,losePage:()=>lostPage=true,badAck:()=>badAck=true,status:()=>({cursor,remoteCursor,verified,phase}),options:{core,bridge,maxSteps:8}};
}

const inactive=await runRosterMirror({ROSTER_EDGE_AUTHORITY:'legacy'},{bridge(){assert.fail('legacy must not contact Google');}});assert(inactive.skipped);
assert.equal((await rosterMirrorStatus({})).enabled,false);
{
 const core={capture:async()=>({enabled:false,phase:'released'}),status:async()=>({enabled:false,phase:'released'})};
 const stopped=await runRosterMirror({ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:{prepare(){},batch(){}}},{core,bridge:()=>assert.fail('released D1 must not restart mirroring')});
 assert.equal(stopped.enabled,false);assert.equal(stopped.phase,'released');
}
{
 const h=fixture();h.losePage();await assert.rejects(runRosterMirror(h.env,h.options),/lost page/);assert.equal(h.status().cursor,0);assert.equal(h.status().remoteCursor,1);
 const done=await runRosterMirror(h.env,h.options);assert(done.mirrored);assert.deepEqual(h.accepted,[1,2]);assert.equal(h.calls.filter(p=>p.step==='page'&&p.cursor===0).length,2,'uncertain page reuses the same frozen cursor');
 assert.equal((await rosterMirrorStatus(h.env,{core:h.core})).lagMinutes,0);
}
{
 const h=fixture();h.badAck();await assert.rejects(runRosterMirror(h.env,h.options),error=>error.code==='ROSTER_MIRROR_ACK');assert.equal(h.accepted.length,0);
}
{
 const h=fixture();let attempts=0;h.core.cleanup=async()=>{attempts++;throw Error('transient cleanup failure');};
 const result=await runRosterMirror(h.env,h.options);assert(result.mirrored);assert(result.cleanupPending);assert.equal(attempts,1,'old spool cleanup does not block a current backup');
}
{
 const h=fixture(),bridge=input=>input.step==='prune'?Promise.reject(Error('temporary Drive cleanup failure')):h.bridge(input);
 const result=await runRosterMirror(h.env,{...h.options,bridge});assert(result.mirrored);assert(result.googleCleanupPending,'Drive cleanup errors remain visible without invalidating the confirmed backup');
}
{
 const object=JSON.stringify({note:'中文😀'.repeat(90000)}),h=fixture({object});let done;
 for(let n=0;n<20;n++){done=await runRosterMirror(h.env,{...h.options,maxSteps:3});if(done.mirrored)break;}
 assert(done.mirrored,'bounded object uploads resume across invocations');assert.equal(h.objects.get(h.reference.key),object);assert(h.calls.filter(p=>p.step==='object').length>1);
 const uploads=h.calls.filter(p=>p.step==='object');assert.equal(new Set(uploads.map(p=>p.index)).size,uploads.length,'confirmed object chunks are not uploaded again');
}
{
 const h=fixture({object:JSON.stringify({value:'small'}),copies:10});let done;
 for(let n=0;n<20;n++){done=await runRosterMirror(h.env,{...h.options,maxSteps:4});if(done.mirrored)break;}
 assert(done.mirrored,'pages with many confirmed objects must not exhaust the same status-check budget forever');assert.equal(h.objects.size,10);
}
{
 const h=fixture({object:JSON.stringify({value:'small'}),copies:10});
 const done=await runRosterMirror(h.env,{core:h.core,bridge:h.bridge});assert(done.mirrored,'default tick advances enough work to keep the backup caught up');assert(done.steps<=16);
}
{
 const h=fixture({object:JSON.stringify({saved:'original'})});h.env.ROSTER_TIMETABLE_SNAPSHOTS.get=async()=>({body:new Blob([gzipSync('{"saved":"corrupt"}')]).stream()});
 await assert.rejects(runRosterMirror(h.env,h.options),error=>error.code==='ROSTER_MIRROR_OBJECT_DIGEST');assert.equal(h.calls.filter(p=>p.step==='object').length,0);
}
{
 const bytes=Buffer.from([80,75,3,4,5,6,7,8]),h=fixture({workbookBytes:bytes});assert((await runRosterMirror(h.env,h.options)).mirrored);assert.equal(h.objects.get(h.workbookReference.key),bytes.toString('base64'));
 const corrupted=fixture({workbookBytes:bytes});corrupted.env.ROSTER_TIMETABLE_SNAPSHOTS.get=async()=>({body:new Blob([Buffer.from([80,75,3,4,9])]).stream()});
 await assert.rejects(runRosterMirror(corrupted.env,corrupted.options),error=>error.code==='ROSTER_MIRROR_OBJECT_DIGEST');assert.equal(corrupted.calls.filter(p=>p.step==='object').length,0);
}
{
 const h=fixture();const waiting=await releaseRosterMirror(h.env,{...h.options,requestId:'release-one',quiescent:async()=>false});assert.equal(waiting.phase,'blocked');assert.equal(h.status().phase,'normal','a blocked release permits the operator to finish pending work');assert.equal(h.calls.length,0);
 const done=await releaseRosterMirror(h.env,{...h.options,requestId:'release-one',quiescent:async()=>true});assert(done.released);assert.equal(h.status().phase,'released');assert.equal(h.env.ROSTER_EDGE_AUTHORITY,'d1');
 assert((await releaseRosterMirror(h.env,{...h.options,requestId:'release-one',quiescent:async()=>true})).released);
}
{
 const h=fixture();assert((await runRosterMirror(h.env,h.options)).mirrored);const pages=h.calls.filter(p=>p.step==='page').length;
 assert((await releaseRosterMirror(h.env,{...h.options,requestId:'release-caught-up',quiescent:async()=>true})).released);
 assert.equal(h.calls.filter(p=>p.step==='page').length,pages,'a caught-up backup supplies its verified proof without a new transfer');
}
// Exercise the client against the real SQLite core so cursor, lease and proof
// contracts cannot drift behind a permissive transport fake.
{
 const require=createRequire(import.meta.url),core=require('../shared/roster-mirror.js'),Store=require('../shared/edge-store.js'),db=require('./helpers/chunked-import-db.cjs')();
 for(const [scope,state]of [['roster',{revision:3,rows:[{id:'r1',date:'2026-10-31',value:'frozen'}]}],['roster-register',{schema:1,revision:2,entries:[]}]]){
  const store=Store.open(db,scope),imported=await store.importState({state,actor:'fixture',requestId:'import-'+scope});
  await store.transition({from:'imported',to:'active',expectedRevision:imported.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:imported.sourceDigest,verifiedRecords:imported.importedRecords}});
 }
 let generation,chain,cursor=0;
 const bridge=async input=>{
  if(input.step==='prune')return {pruned:0,pending:false};
  if(input.step==='begin'){generation=input.generation;chain=chain||generation.initialDigest;return {generationId:generation.id,epoch:generation.epoch,cursor};}
  if(input.step==='page'){assert.equal(input.cursor,cursor);for(const item of input.items)chain=sha256Hex(chain+'\n'+JSON.stringify(item));cursor=input.items.at(-1).seq;return {generationId:generation.id,epoch:generation.epoch,cursor:input.cursor,next:cursor,digest:input.digest,snapshotDigest:chain};}
  assert.equal(input.step,'finalize');assert.equal(input.snapshotDigest,chain);return {verified:true,generationId:generation.id,epoch:generation.epoch,revisions:generation.revisions,transportRevision:generation.transportRevision,snapshotDigest:chain,manifestDigest:sha256Hex('real core manifest')};
 };
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'},done=await runRosterMirror(env,{core,bridge,maxSteps:16});assert(done.mirrored);assert.equal((await core.status(db)).proof.manifestDigest,sha256Hex('real core manifest'));
}
console.log('PASS D1 mirror client: authority gate, frozen-page replay, ack fencing, resumed Unicode objects, integrity failure and verified release.');
