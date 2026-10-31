'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Import=require('../shared/roster-import.js'),Store=require('../shared/edge-store.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(JSON.stringify(value));
function harness(){
 let now=1000,locks=0,captures=0,uploads=0,loseName=null;const properties=new Map(),files=new Map(),pinned=[];
 const snapshot={schema:1,state:{revision:3,rows:Array.from({length:900},(_,i)=>({id:'row-'+i,date:i%2?'2026-10-29':'2026-10-30',text:'row '+i+' 中文 '.repeat(80)})),allocationAuditExports:{'2026-10-29':{archiveFileId:'audit'}},staplerPlans:[{id:'plan',draft:{title:'Original plan'}}]},index:{schema:1,revision:2,entries:[{id:'baseline',modelFile:'model'}]}};
 const model={layoutMode:'single-week',title:'Original model'},archive={schema:1,date:'2026-10-29',version:1,revision:3,audit:[{id:'original'}]};snapshot.state.allocationAuditExports['2026-10-29']={archiveFileId:'audit',archiveVersion:1,archiveRevision:3,archiveDigest:hash(JSON.stringify(archive))};
 files.set('model',{name:'model',bytes:Buffer.from(JSON.stringify(model))});files.set('audit',{name:'audit',bytes:Buffer.from(JSON.stringify(archive)),revision:'r1',revisions:{r1:Buffer.from(JSON.stringify(archive))}});
 const blob=(value,type='application/json')=>{const b=Buffer.from(value);return {getBytes:()=>[...b],getDataAsString:()=>b.toString(),getContentType:()=>type};};
 const response=(body,status=200,headers={})=>{const b=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));return {getResponseCode:()=>status,getAllHeaders:()=>headers,getContent:()=>[...b],getContentText:()=>b.toString()};};
 const scope={Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},console,GSiSRosterImport:Import,GSiSEdgeStore:Store,ROSTER_DATA:'private',GSISRoster:{validate:v=>v},GSISRosterOperations:{validateState:v=>v,date:v=>v},Utilities:{newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),base64Encode:b=>Buffer.from(b).toString('base64'),computeDigest:(_,value)=>[...crypto.createHash('sha256').update(Buffer.from(value)).digest()],DigestAlgorithm:{SHA_256:'sha256'}},props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>{assert(Buffer.byteLength(v)<9000);properties.set(k,v);},deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)}),LockService:{getScriptLock:()=>({}),getUserLock:()=>({})},deployLock_:()=>{locks++;return true;},deployUnlock_:()=>{assert(locks>0);locks--;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterFolder_:()=>({}),rosterReadFile_:id=>{assert.equal(locks,0);assert(files.has(id));return files.get(id).bytes.toString();},rosterCreateFile_:(_folder,name,b)=>{assert(locks===0||name.endsWith('source.json'),'only source snapshot upload may hold production locks');const id='output-'+(++uploads);files.set(id,{name,bytes:Buffer.from(b.getBytes())});if(loseName&&name.includes(loseName)){loseName=null;throw Error('lost upload acknowledgement');}return id;},rosterDriveJson_:r=>JSON.parse(r.getContentText()),rosterDriveRequest_:(url,options={})=>{
  const u=new URL(url),path=u.pathname.split('/'),isRevision=path.includes('revisions'),id=decodeURIComponent(isRevision?path[path.indexOf('files')+1]:path.at(-1));
  if(u.pathname.endsWith('/files')){assert.equal(locks,0);const name=/name = '([^']+)'/.exec(u.searchParams.get('q')||'')?.[1];return response({files:[...files].filter(([,f])=>!name||f.name===name).map(([id,f])=>({id,name:f.name,size:String(f.bytes.length)}))});}
  const file=files.get(id);assert(file,'missing '+id);
  if(isRevision){const revision=path.at(-1);if(options.method==='patch'){assert(locks>0,'pin during capture');assert.equal(JSON.parse(options.payload).keepForever,true);pinned.push(id+':'+revision);return response({id:revision,keepForever:true});}assert.equal(locks,0);assert(pinned.includes(id+':'+revision));return response(file.revisions[revision]);}
  if(u.searchParams.get('alt')==='media'){assert.equal(locks,0);const range=/bytes=(\d+)-(\d+)/.exec(options.headers?.Range||'');if(range){const a=+range[1],b=+range[2];return response(file.bytes.subarray(a,b+1),206,{'Content-Range':`bytes ${a}-${b}/${file.bytes.length}`});}return response(file.bytes);}
  assert(locks===0||u.searchParams.get('fields').includes('headRevisionId'));return response({id,size:String(file.bytes.length),parents:['private'],trashed:false,headRevisionId:file.revision});
 }};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);scope.rosterEdgeSnapshot_=()=>{assert.equal(locks,2);captures++;const value=copy(snapshot);return {...value,sourceDigest:hash(JSON.stringify(value))};};
 const input={operation:'edgeExportManifest',requestId:'request',preparation:{ordinal:0,checkpoint:null}};
 const call=p=>scope.rosterEdgeMigrationDispatch_({identity:{email:'admin@example.test'},input:p},{user:{rosterAdmin:true}}).result;
 function finish(start=call(input)){let r=start;for(let n=0;n<100&&r.preparing;n++)r=call({...input,preparation:r.preparation});assert(r.manifest,'preparation must reach manifest');return r;}
 return {scope,snapshot,model,archive,files,properties,pinned,input,call,finish,stats:()=>({captures,uploads,locks}),lose:name=>loseName=name,advance:()=>now+=700000};
}
{
 const h=harness(),initial=h.call(h.input);assert(initial.preparing);assert.equal(initial.step,1);assert.equal(initial.phase,'Snapshot');assert.equal(h.stats().captures,1);const before=h.stats().uploads;
 assert.deepEqual(h.call(h.input),initial,'same accepted predecessor recovers the completed checkpoint');assert.equal(h.stats().uploads,before);assert.equal(h.stats().captures,1);
 h.snapshot.state.rows[0].text='Live state changed';h.files.set('audit-new',{name:'audit-new',bytes:Buffer.from(JSON.stringify({schema:1,date:'2026-10-29',version:2,revision:4,audit:[{id:'later'}]}))});h.snapshot.state.allocationAuditExports['2026-10-29'].archiveFileId='audit-new';
 const ready=h.finish(initial),decoded=[];for(const part of ready.manifest.parts){const r=h.call({operation:'edgeExportPart',requestId:'request',partId:part.id,preparation:ready.preparation});assert.equal(hash(r.payload),part.digest);if(part.kind==='records')decoded.push(...JSON.parse(r.payload).rows.map(row=>({...row,scope:part.scope})));}
 const state=Store.decode(decoded.filter(r=>r.scope==='roster'));assert.notEqual(state.rows[0].text,'Live state changed');assert.equal(h.pinned.length,0,'capture performs no audit metadata or revision I/O');assert.equal(h.stats().captures,1);assert.equal(h.stats().locks,0);
 assert.throws(()=>h.call({...h.input,preparation:{ordinal:ready.preparation.ordinal+1,checkpoint:ready.preparation.checkpoint}}),e=>e.status===409);
}
{
 const h=harness();h.lose('source.json');assert.throws(()=>h.call(h.input),/lost upload/);const ready=h.finish();assert(ready.manifest);assert.equal(h.stats().captures,1,'unknown capture upload cannot reread live state');
}
{
 const h=harness(),first=h.call(h.input);h.lose('work');const next={...h.input,preparation:first.preparation};assert.throws(()=>h.call(next),/lost upload/);const ready=h.finish(h.call(next));assert.equal(h.stats().captures,1);assert(ready.manifest);
}
{
 const h=harness(),first=h.call(h.input),next={...h.input,preparation:first.preparation};h.lose('checkpoint 00001');assert.throws(()=>h.call(next),/lost upload/);const count=h.stats().uploads,replayed=h.call(next);assert.equal(h.stats().uploads,count,'lost checkpoint acknowledgement recovers existing output');assert(replayed.preparing);
 const abandon={operation:'edgeExportAbandon',requestId:'request',resetRequestId:'restart'};assert(h.call(abandon).abandoned);assert(h.call(abandon).abandoned);assert.equal(h.properties.has('ROSTER_EDGE_EXPORT:'+first.sessionId),false);assert(h.files.size>0,'restart retains frozen evidence');assert.throws(()=>h.call(next),e=>e.status===409);assert.throws(()=>h.call({operation:'edgeExportManifest',requestId:'request'}),e=>e.status===409,'older callers cannot revive an abandoned identity');assert.throws(()=>h.call({...abandon,resetRequestId:'different'}),e=>e.status===409);
}
{
 const h=harness(),first=h.call(h.input),work=h.call({...h.input,preparation:first.preparation}),file=[...h.files.values()].find(f=>f.name.includes('work'));
 const raw=file.bytes.toString(),headerLength=Number(raw.slice(0,8)),header=JSON.parse(raw.slice(9,9+headerLength));header.partMetadata[0].digest='b'.repeat(64);const replacement=JSON.stringify(header);assert.equal(Buffer.byteLength(replacement),headerLength);file.bytes=Buffer.from(raw.slice(0,9)+replacement+raw.slice(9+headerLength));
 assert.throws(()=>h.call({...h.input,preparation:work.preparation}),e=>e.status===503&&/header failed verification/.test(e.message));
}
// A lost final acknowledgement must not let recovered checkpoint contents
// redefine the already captured source, even with a self-consistent manifest.
{
 const h=harness();let ready=h.call(h.input),last;
 while(ready.preparing){last={...h.input,preparation:ready.preparation};ready=h.call(last);}
 const file=h.files.get(ready.preparation.checkpoint.fileId),checkpoint=JSON.parse(file.bytes.toString());
 checkpoint.sourceDigest='b'.repeat(64);checkpoint.manifest.sourceDigest=checkpoint.sourceDigest;checkpoint.manifestDigest=hash(JSON.stringify(checkpoint.manifest));file.bytes=Buffer.from(JSON.stringify(checkpoint));
 assert.throws(()=>h.call(last),e=>e.status===409&&/captured source/.test(e.message),'recovered checkpoints remain anchored to the original descriptor');
 const altered={ordinal:ready.preparation.ordinal,checkpoint:{fileId:ready.preparation.checkpoint.fileId,digest:hash(file.bytes)}};
 assert.throws(()=>h.call({operation:'edgeExportPart',requestId:'request',partId:ready.manifest.parts[0].id,preparation:altered}),e=>e.status===409&&/captured source/.test(e.message),'part reads apply the same source anchor');
}
{
 const h=harness();let ready=h.call(h.input),last;while(ready.preparing){last={...h.input,preparation:ready.preparation};ready=h.call(last);}
 const file=h.files.get(ready.preparation.checkpoint.fileId),checkpoint=JSON.parse(file.bytes.toString());checkpoint.manifest.parts[0].digest='c'.repeat(64);checkpoint.manifestDigest=hash(JSON.stringify(checkpoint.manifest));file.bytes=Buffer.from(JSON.stringify(checkpoint));
 assert.throws(()=>h.call(last),e=>e.status===409&&/manifest/.test(e.message),'a rehashed manifest cannot replace the retained part inventory');
}
{
 const h=harness(),first=h.call(h.input);h.files.get('audit').bytes=Buffer.from(JSON.stringify({schema:1,date:'2026-10-29',version:2,revision:4,audit:[]}));
 assert.throws(()=>h.finish(first),e=>e.status===503&&/digest/.test(e.message),'changed bytes under a captured digest are refused');
}
{
 const h=harness();delete h.snapshot.state.allocationAuditExports['2026-10-29'].archiveDigest;const first=h.call(h.input);h.files.get('audit').bytes=Buffer.from(JSON.stringify({schema:1,date:'2026-10-29',version:2,revision:4,audit:[]}));
 assert.throws(()=>h.finish(first),e=>e.status===503&&/version changed/.test(e.message),'legacy version metadata also rejects later evidence');
}
// An older preparing export has no v2 checkpoint. Polls must still reach its
// original recovery path until the old lease expires or its upload is found.
{
 const h=harness(),binding=h.scope.rosterEdgeExportBindingV2_({identity:{email:'admin@example.test'},input:h.input});
 h.properties.set('ROSTER_EDGE_EXPORT:'+binding.sessionId,JSON.stringify({...binding,state:'preparing',sourceDigest:'a'.repeat(64),leaseUntil:600000}));
 const first=h.call(h.input);assert(first.preparing);assert.equal(first.preparation,undefined);
 const second=h.call({...h.input,preparation:{ordinal:1,checkpoint:null}});assert(second.preparing);assert.equal(h.stats().captures,0,'legacy polling never captures replacement source');
 h.advance();h.scope.rosterEdgeExportFind_=()=>null;
 const expired=h.call({...h.input,preparation:{ordinal:2,checkpoint:null}});assert(expired.preparationFailed);assert(expired.requiresRestart);assert.equal(h.stats().locks,0);
}
console.log('PASS resumable export: frozen capture, immutable audit, immutable checkpoint replay, lost uploads, tamper refusal, retained restart and legacy polling.');
