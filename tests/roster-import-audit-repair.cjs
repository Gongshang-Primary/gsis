'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js');
const {harness}=require('./roster099-resumable-budget.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-11-04',binding={actor:'admin@example.test',requestId:'audit-repair',sessionId:hash('audit-repair')};
const adapter={hash,gzip:value=>[...zlib.gzipSync(value)],base64:bytes=>Buffer.from(bytes).toString('base64')};
function pair(id='synthetic-request'){
 return [{id,operation:'requestStapler',date,at:'2026-11-03T23:59:00.000Z',actor:'requester@example.test',note:'request',extra:{retain:true}},
  {id,operation:'decideStapler',date,at:'2026-11-04T00:01:00.000Z',actor:'sponsor@example.test',decision:'approve',note:'decision'}];
}
function snapshot(audit=pair()){return {schema:1,sourceDigest:hash('captured source bytes'),state:{schema:1,revision:3,audit,allocationAuditExports:{}},index:{schema:1,entries:[]}};}
function expected(audit){return audit.map(row=>['requestStapler','decideStapler'].includes(row.operation)?{...row,id:row.operation==='decideStapler'?row.id+'-decision':row.id,planningRequestId:row.id}:row);}
function rowsOf(result){
 const segments=new Map(),rows=[];
 for(let i=0;i<result.parts.length;i++){
  const part=result.partMetadata?.[i]||result.manifest.parts[i],body=JSON.parse(result.parts[i]);
  if(part.kind==='segment')segments.set(part.id,Buffer.from(body.base64,'base64'));
  if(part.kind==='records')rows.push(...body.rows.map(row=>({...row,scope:part.scope})));
  if(part.kind==='record')rows.push(...JSON.parse(Buffer.concat(body.segments.map(id=>segments.get(id)))).rows.map(row=>({...row,scope:part.scope})));
 }
 return rows;
}
function assertScopes(result,scopes){
 const rows=rowsOf(result);
 for(const scope of Import.SCOPES){const selected=rows.filter(row=>row.scope===scope);assert.equal(scopes[scope].records,selected.length);assert.equal(scopes[scope].digest,hash(Store.canonicalJson(Store.decode(selected))));}
 return Store.decode(rows.filter(row=>row.scope==='roster'));
}

// The old producer's duplicate IDs failed here with EDGE_RECORD_ID before any
// record cache could be persisted. This assertion first reproduced that error.
const captured=snapshot(),capturedBefore=clone(captured);
const frozen=Import.freeze(captured,binding,adapter);
assert.deepEqual(assertScopes(frozen,frozen.manifest.scopes).audit,expected(captured.state.audit));
assert.deepEqual(captured,capturedBefore);assert.equal(frozen.manifest.sourceDigest,captured.sourceDigest);
console.log('PASS captured historical request/decision pair freezes without EDGE_RECORD_ID');

let checks=1;
function check(name,run){run();checks++;console.log('PASS '+name);}
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
function refused(audit){const before=clone(audit);assert.throws(()=>Import.repairStaplerAuditIds(audit),error=>error.code==='ROSTER_AUDIT_REPAIR'&&error.status===409&&!error.message.includes('synthetic'));assert.deepEqual(audit,before);}
check('pure repair retains both events, every other field and the original rows',()=>{
 const unrelated={id:'other',operation:'other',payload:{value:4}},audit=deepFreeze([pair()[1],unrelated,pair()[0]]),before=clone(audit);
 const result=Import.repairStaplerAuditIds(audit);
 assert.equal(result.pairs,1);assert.deepEqual(result.audit,expected(audit));assert.equal(result.audit.length,audit.length);
 assert.notEqual(result.audit,audit);assert.notEqual(result.audit[0],audit[0]);assert.notEqual(result.audit[2],audit[2]);assert.equal(result.audit[1],unrelated);
 assert.deepEqual(audit,before);assert.equal(result.audit[2].extra,audit[2].extra);
 const again=Import.repairStaplerAuditIds(result.audit);assert.equal(again.pairs,0);assert.equal(again.audit,result.audit);
});
check('clean arrays preserve exact references and acquire no new IDs',()=>{
 for(const audit of [[],[{id:'clean',operation:'requestStapler'}],[{id:'old'},{id:'old-decision',operation:'decideStapler'}],[null,4,{ref:'unrelated'}]]){
  const before=clone(audit),result=Import.repairStaplerAuditIds(deepFreeze(audit));assert.equal(result.pairs,0);assert.equal(result.audit,audit);assert.deepEqual(audit,before);
 }
});
check('multiple pairs repair in place with existing matching planning references',()=>{
 const audit=[...pair('synthetic-a'),{id:'middle',operation:'unrelated'},...pair('synthetic-b').map(row=>({...row,planningRequestId:'synthetic-b'}))];
 const result=Import.repairStaplerAuditIds(deepFreeze(audit));assert.equal(result.pairs,2);assert.deepEqual(result.audit,expected(audit));
 const equalTime=pair();equalTime[1].at=equalTime[0].at;assert.equal(Import.repairStaplerAuditIds(equalTime).pairs,1);
 const offsets=pair();offsets[0].at='2026-11-04T08:00:00+08:00';offsets[1].at='2026-11-04T00:01:00Z';assert.equal(Import.repairStaplerAuditIds(offsets).pairs,1);
 const refs=pair().map(row=>({...row,ref:row.id}));assert.deepEqual(Import.repairStaplerAuditIds(refs).audit,expected(refs));
});
check('occupied suffix refuses even identical content or a fallback ref identity',()=>{
 const audit=pair();
 for(const occupied of [{id:'synthetic-request-decision'},expected(audit)[1],{ref:'synthetic-request-decision'},{id:null,ref:'synthetic-request-decision'},{id:['synthetic-request-decision']}])refused([...audit,occupied]);
 // An explicit ID wins over ref, as it does in Store.encode.
 assert.equal(Import.repairStaplerAuditIds([...audit,{id:'elsewhere',ref:'synthetic-request-decision'}]).pairs,1);
});
check('ambiguous pairs, archived rows and malformed references refuse atomically',()=>{
 const cases=[
  [...pair(),{...pair()[1]}],pair().map(row=>({...row,operation:'requestStapler'})),[pair()[0],{id:'synthetic-request',operation:'other'}],
  pair().map((row,i)=>i?{...row,date:'2026-11-05'}:row),pair().map(row=>({...row,date:'2026-02-30'})),
  pair().map((row,i)=>i?{...row,at:'2026-11-03T00:00:00Z'}:row),
  pair().map((row,i)=>i?{...row,archiveRef:{archiveId:'opaque'}}:row),
  pair().map((row,i)=>i?{...row,archiveRef:null}:row)
 ];
 for(const value of [null,4,'synthetic-other',{},[]])cases.push(pair().map((row,i)=>i?{...row,planningRequestId:value}:row));
 for(const at of [null,4,'invalid','2026-02-30T00:00:00Z','2026-11-04','2026-11-04T00:01:00','2026-11-04T24:00:00Z'])cases.push(pair().map((row,i)=>i?{...row,at}:row));
 for(const audit of cases){refused(audit);refused([...pair('synthetic-valid'),...audit]);}
 const missing=pair();missing[1].planningRequestId=undefined;assert.throws(()=>Import.repairStaplerAuditIds(missing),error=>error.code==='ROSTER_AUDIT_REPAIR');
 for(const value of [null,4,['synthetic-request'],{}]){const audit=pair();if(value!==null)audit[0].id=String(value);audit[1].id=value;audit[1].ref='synthetic-request';refused(audit);}
 const fallback=pair().map(({id,...row})=>({...row,ref:id}));refused(fallback);
 const conflict=pair();conflict[1].ref='synthetic-other';refused(conflict);
});
check('unrelated duplicate IDs remain visible to strict Store encoding',()=>{
 const unrelated=[{id:'unrelated',operation:'first'},{id:'unrelated',operation:'second'}],result=Import.repairStaplerAuditIds([...pair(),...unrelated]);
 assert.equal(result.pairs,1);assert.deepEqual(result.audit.slice(-2),unrelated);
 assert.throws(()=>Store.encode({audit:result.audit}),error=>error.code==='EDGE_RECORD_ID');
 assert.throws(()=>Import.freeze(snapshot(unrelated),binding,adapter),error=>error.code==='EDGE_RECORD_ID');
});
check('full and indexed preparation agree on projected records, positions and scope digests',()=>{
 const input=snapshot([...pair('synthetic-a'),{id:'large-unrelated',note:'中文'.repeat(90000)},...pair('synthetic-b')]),before=clone(input);
 const full=Import.prepareRecords(input,[],{ordinal:0,offset:0},adapter),planned=Import.prepareRecords(input,[],{ordinal:0,offset:0},adapter,{start:0,limit:1,plan:true});
 assert.deepEqual(planned.scopes,full.scopes);assert.deepEqual(assertScopes(full,full.scopes).audit,expected(input.state.audit));
 for(let next=0;next<planned.totalParts;next++){
  const single=Import.prepareRecordPart(input,[],{plan:planned.partPlan,next,end:planned.position,total:planned.totalParts,scopes:planned.scopes},adapter);
  assert.deepEqual(single.parts,[full.parts[next]]);assert.deepEqual(single.partMetadata,[full.partMetadata[next]]);
 }
 assert.deepEqual(input,before);
 const absent={...input,state:{flag:true}};assert.equal(Object.hasOwn(assertScopes(Import.freeze(absent,binding,adapter),Import.freeze(absent,binding,adapter).manifest.scopes),'audit'),false);
});
check('immutable archive contents and reference metadata remain opaque',()=>{
 const archived={schema:1,date,audit:pair('synthetic-archived')},bytes=JSON.stringify(archived),meta={archiveFileId:'archive-synthetic',digest:'opaque-proof',revision:7,extra:{keep:true}},input=snapshot();
 input.state.allocationAuditExports[date]=meta;
 input.state.audit.push({id:'retained-pointer',archiveRef:{kind:'audit',month:'2026-11',digest:'opaque'},operation:'other'});
 const before=clone(input),jobs=Import.objectJobs(input);
 const result=Import.freeze(input,binding,{...adapter,readArchive:(day,id)=>{assert.equal(day,date);assert.equal(id,meta.archiveFileId);return archived;}});
 assert.deepEqual(Import.objectJobs(input),jobs);assert.deepEqual(input,before);assert.equal(JSON.stringify(archived),bytes);
 const objectIndex=result.manifest.parts.findIndex(part=>part.kind==='object'),object=JSON.parse(result.parts[objectIndex]);
 const gzip=Buffer.concat(object.segments.map(id=>Buffer.from(JSON.parse(result.parts[result.manifest.parts.findIndex(part=>part.id===id)]).base64,'base64')));
 assert.equal(zlib.gunzipSync(gzip).toString(),bytes);assert.equal(object.reference.digest,hash(bytes));
 const decoded=assertScopes(result,result.manifest.scopes);assert.deepEqual(decoded.audit.at(-1),input.state.audit.at(-1));
 assert.deepEqual(decoded.allocationAuditExports[date],{digest:meta.digest,revision:meta.revision,extra:meta.extra,archiveObject:object.reference});
});
function runtimeSource(audit=pair()) {return {state:{schema:1,revision:3,audit,allocationAuditExports:{}},index:{entries:[]},files:new Map()};}
function strictImport(){return {...Import,prepareRecords(input,...args){Store.encode(input.state);return Import.prepareRecords(input,...args);}};}
function replaceWithCurrent(h){h.replaceRuntime({backendSource:require('node:fs').readFileSync('backend/RosterEdgeMigration.gs','utf8'),importModule:Import,storeModule:Store});}
function finish(h,response,request){let steps=0;while(response.preparing){assert(++steps<60);response=h.call({...request,preparation:response.preparation});assert.notEqual(response.preparationFailed,true);}return response;}
function runtimeResult(h,response,request){return {...response,parts:Array.from(response.manifest.parts,part=>h.call({...request,operation:'edgeExportPart',partId:part.id,preparation:response.preparation}).payload)};}
check('captured-before-records source resumes under new runtime without recapture or source edits',()=>{
 // Reproduce the previous strict encoding boundary without retaining a private
 // source fixture or requiring historical git objects in a shallow CI checkout.
 const source=runtimeSource(),before=clone(source.state);
 const request={operation:'edgeExportManifest',requestId:'synthetic-retained'},h=harness({source,importModule:strictImport()});
 const captured=h.call({...request,preparation:{ordinal:0,checkpoint:null}}),planned=h.call({...request,preparation:captured.preparation});
 assert.equal(planned.phase,'Snapshot checks');
 assert.equal(JSON.parse(h.files.get(planned.preparation.checkpoint.fileId).bytes).work,null,'the retained capture has no record cache yet');
 const writes=h.sourceWrites.length;
 assert.throws(()=>h.call({...request,preparation:planned.preparation}),error=>error.code==='EDGE_RECORD_ID');
 assert.equal(h.sourceWrites.length,writes,'failed legacy encoding cannot save a record cache');
 replaceWithCurrent(h);
 const complete=finish(h,planned,request),result=runtimeResult(h,complete,request);
 assert.equal(h.stats().captures,1);assert.equal(complete.sourceDigest,captured.sourceDigest);assert.deepEqual(source.state,before);
 assert.deepEqual(assertScopes(result,complete.manifest.scopes).audit,expected(source.state.audit));
 assert.deepEqual(clone(complete.manifest.scopes),Import.freeze({...snapshot(source.state.audit),sourceDigest:captured.sourceDigest,index:source.index,state:source.state},binding,adapter).manifest.scopes);
});
check('previously cached clean records resume with identical payloads and manifest',()=>{
 const request={operation:'edgeExportManifest',requestId:'synthetic-clean-cache'},source=()=>runtimeSource([{id:'clean',operation:'other',note:'unchanged'}]);
 const first=harness({source:source(),importModule:strictImport()}),initial={...request,preparation:{ordinal:0,checkpoint:null}};
 const expectedResult=runtimeResult(first,finish(first,first.call(initial),request),request);
 const resumed=harness({source:source(),importModule:strictImport()}),captured=resumed.call(initial),planned=resumed.call({...request,preparation:captured.preparation}),cached=resumed.call({...request,preparation:planned.preparation});
 assert.equal(cached.phase,'Prepare records');replaceWithCurrent(resumed);
 const actual=runtimeResult(resumed,finish(resumed,cached,request),request);
 assert.deepEqual(clone(actual.manifest),clone(expectedResult.manifest));assert.deepEqual(actual.parts,expectedResult.parts);assert.equal(resumed.stats().captures,1);
});
console.log('PASS '+checks+' duplicate audit repair checks');
