'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=fs.readFileSync,modules=[['GSIS_FIELDSTORE','backend/FieldStore.gs'],['GSIS_RELIEF_BACKEND','backend/Relief.gs'],['GSIS_DEPLOY_EDGE','backend/DeployEdge.gs']].map(([marker,file])=>[marker,read(file,'utf8')]);
fs.readFileSync=function(file,...args){let value=read.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof value==='string')for(const [marker,source]of modules)value=value.replace(new RegExp('/\\* '+marker+'_BEGIN \\*/[\\s\\S]*?/\\* '+marker+'_END \\*/'),()=> '/* '+marker+'_BEGIN */\n'+source+'\n/* '+marker+'_END */');return value;};
let f;try{f=require('./storage.cjs');}finally{fs.readFileSync=read;}
const {ctx,sheets}=f,run=text=>vm.runInContext(text,ctx),json=text=>JSON.parse(JSON.stringify(run(text)));
f.book.getId=()=> 'synthetic-deploy-book';
let now=Date.parse('2026-11-01T07:00:00Z');const NativeDate=Date;ctx.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
run("var qidx=index_(book_()),qdoc=document_(book_(),qidx.versions.find(en=>en.id===id));qdoc.from='2026-01-01';qdoc.to='2026-12-31';qidx.publishNext=id;persist_(book_(),qidx,qdoc,null);");
const first=json('publishedEntry_(index_(book_()))');
assert(sheets.has('deploy_quota_publications'),'publication journals a durable quota intent');
const initialRows=JSON.stringify(sheets.get('deploy_quota_publications').data),wire={service:'gsis-roster-quota-v1',input:{operation:'quotaSnapshot',manifest:true,date:'2026-11-02',asOf:'2026-11-01T08:00:00Z'}};
ctx.qwire=wire;const manifest=json('deployEdgeAdapter_(qwire)');
assert.equal(manifest.schema,'gsis-roster-quota-source-v1');assert.equal(manifest.expectedSource.commit,first.commit);assert.equal(manifest.expectedSource.publishedAt,'2026-11-01T07:00:00.000Z');
run("var draftQuotaIndex=index_(book_()),draftQuotaDoc=document_(book_(),draftQuotaIndex.versions.find(en=>en.id===id));draftQuotaDoc.name='Draft only';persist_(book_(),draftQuotaIndex,draftQuotaDoc,null);");
assert.equal(JSON.stringify(sheets.get('deploy_quota_publications').data),initialRows,'draft saves enqueue no quota intent');
assert.equal(json('deployEdgeAdapter_(qwire)').expectedSource.commit,first.commit,'draft revision never reaches the source manifest');
now=Date.parse('2026-11-01T09:00:00Z');run("var qidx2=index_(book_()),qdoc2=document_(book_(),qidx2.versions.find(en=>en.id===id));qidx2.publishNext=id;persist_(book_(),qidx2,qdoc2,null);");
const second=json('publishedEntry_(index_(book_()))');assert.notEqual(first.commit,second.commit);
assert.equal(json('deployEdgeAdapter_(qwire)').expectedSource.commit,first.commit,'Sunday cutoff still selects the earlier immutable publication');
ctx.qbody={service:'gsis-roster-quota-v1',input:{operation:'quotaSnapshot',versionId:first.id,revision:first.revision,commit:first.commit}};
const body=json('deployEdgeAdapter_(qbody)');assert.equal(body.versionId,first.id);assert.equal(body.source.commit,first.commit);assert.equal(body.source.revision,first.revision);assert.equal(body.source.publishedAt,'2026-11-01T07:00:00.000Z');assert.equal(typeof body.source.calculationVersion,'string');assert(Array.isArray(body.rows));
assert.equal(JSON.stringify(json('deployEdgeAdapter_(qbody)')),JSON.stringify(body),'same immutable source retries retain their quota');
ctx.qbody.input.revision++;assert.throws(()=>run('deployEdgeAdapter_(qbody)'),e=>e.status===409,'stale/mismatched publication proof is rejected');ctx.qbody.input.revision--;
ctx.qbody.service='other';assert.throws(()=>run('deployEdgeAdapter_(qbody)'),e=>e.status===403,'unrelated service cannot use the producer');ctx.qbody.service='gsis-roster-quota-v1';
const frozenRows=sheets.get('deploy_quota_publications').data;assert(frozenRows.length>=4,'same-version republication retains earlier intent rows');
assert.equal(JSON.stringify(frozenRows.slice(0,JSON.parse(initialRows).length)),initialRows,'new publications never replace old intents');
const before=JSON.stringify([...sheets].map(([name,s])=>[name,s.data]));run('deployEdgeAdapter_(qbody)');assert.equal(JSON.stringify([...sheets].map(([name,s])=>[name,s.data])),before,'source reads are read-only');
const rowsBefore=structuredClone(frozenRows);run("var uncommittedQuota={...reliefQuotaPublications_(book_(),index_(book_())).find(en=>en.commit===qbody.input.commit),commit:'uncommitted-quota',publishedAt:'2026-11-01T07:59:00.000Z'};var uncommittedRows=reliefQuotaPublicationRows_(uncommittedQuota,index_(book_()).revision+1);book_().getSheetByName('deploy_quota_publications').getRange(book_().getSheetByName('deploy_quota_publications').getLastRow()+1,1,uncommittedRows.length,4).setValues(uncommittedRows);");
assert.equal(json('deployEdgeAdapter_(qwire)').expectedSource.commit,first.commit,'intent rows ahead of the committed index cannot be published');sheets.get('deploy_quota_publications').data=rowsBefore;
run('var qIndexRead=index_,qIndexReads=0;index_=function(b){var value=qIndexRead(b);if(++qIndexReads===2)value.revision++;return value;};');try{assert.throws(()=>run('deployEdgeAdapter_(qwire)'),e=>e.status===503,'manifest rechecks the publication marker after history reads');}finally{run('index_=qIndexRead;');}
ctx.qinvalid={service:'gsis-roster-quota-v1',input:{operation:'quotaSnapshot',manifest:true,date:'2026-13-01'}};assert.throws(()=>run('deployEdgeAdapter_(qinvalid)'),e=>e.status===400,'invalid dates do not become an internal error');
run('var qLegacyIndex=index_;index_=function(b){var value=qLegacyIndex(b);delete value.publicationSchema;return value;};');try{assert.throws(()=>run('deployEdgeAdapter_(qwire)'),e=>e.status===503,'a mutable legacy active version is not a published quota source');}finally{run('index_=qLegacyIndex;');}
// Run the actual D1 transaction adapter in a request-local closure with the same
// canonical calculation functions. No generated output or remote service is used.
ctx.qruntime={state:{index:{versions:[],revision:0,requests:[],publicationSchema:1,published:null},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},identity:{email:'test@example.test'},sha256:value=>[...require('node:crypto').createHash('sha256').update(value).digest()],calculations:new Map(),integration(){throw Error('Publication must not call a network service');}};
ctx.crypto=require('node:crypto').webcrypto;const runtime=read('public/edge-deploy-runtime.js','utf8');ctx.qmodel=vm.runInContext('(function(runtime){'+runtime+'\nreturn {persist:fieldPersist_,source:edgeQuotaSource_};})(qruntime)',ctx);
run("var qd1doc=document_(book_(),reliefQuotaPublications_(book_(),index_(book_())).find(en=>en.commit===qbody.input.commit));qruntime.state.index.publishNext=qd1doc.id;qmodel.persist(qruntime.state,qruntime.state.index,qd1doc,'d1-publish-one');");
const edgeFirst=json('qruntime.state.index.published'),edgeManifest=json("qmodel.source({manifest:true,date:'2026-11-02',asOf:'2026-11-01T10:00:00Z'})");assert.equal(edgeManifest.expectedSource.commit,edgeFirst.commit);assert.equal(json('qruntime.state.index.quotaPublications').length,1,'D1 publication and intent share one state commit');
ctx.qedgeInput={versionId:edgeFirst.id,revision:edgeFirst.revision,commit:edgeFirst.commit};const edgeBody=json('qmodel.source(qedgeInput)');assert.deepEqual(edgeBody.rows,body.rows,'Google and D1 use the same immutable relief calculation');assert.equal(edgeBody.source.weeklyCheckpoint,true);assert.equal(edgeBody.source.publishedAt,edgeFirst.publishedAt);
run("qd1doc.name='Unpublished D1 edit';qmodel.persist(qruntime.state,qruntime.state.index,qd1doc,'d1-draft');");assert.equal(json('qruntime.state.index.quotaPublications').length,1,'D1 draft creates no intent');assert.deepEqual(json('qmodel.source(qedgeInput)'),edgeBody,'D1 draft cannot change the source body');
console.log('PASS quota publication: journalled immutable intents, draft isolation, Sunday cutoff, original publication time, exact revision checks, replay and read-only service.');
