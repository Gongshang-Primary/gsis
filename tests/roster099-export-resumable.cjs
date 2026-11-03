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
 const scope={rosterOperationsDigest_:value=>hash(JSON.stringify(value)),Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},console,GSiSRosterImport:Import,GSiSEdgeStore:Store,ROSTER_DATA:'private',GSISRoster:{validate:v=>v},GSISRosterOperations:{validateState:v=>v,date:v=>v},Utilities:{newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),base64Decode:b=>[...Buffer.from(b,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),computeDigest:(_,value)=>[...crypto.createHash('sha256').update(Buffer.from(value)).digest()],DigestAlgorithm:{SHA_256:'sha256'}},props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>{assert(Buffer.byteLength(v)<9000);properties.set(k,v);},deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)}),LockService:{getScriptLock:()=>({}),getUserLock:()=>({})},deployLock_:()=>{locks++;return true;},deployUnlock_:()=>{assert(locks>0);locks--;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterFolder_:()=>({}),rosterFindFile_:(_folder,name)=>name==='Roster import files'?'import-folder':null,rosterReadFile_:id=>{assert.equal(locks,0);assert(files.has(id));return files.get(id).bytes.toString();},rosterCreateFile_:(folder,name,b)=>{assert.equal(locks,0,'all import uploads release both production locks');assert.equal(folder,'import-folder','new import files use the dedicated child folder');const id='output-'+(++uploads);files.set(id,{name,parents:[folder],bytes:Buffer.from(b.getBytes())});if(loseName&&name.includes(loseName)){loseName=null;throw Error('lost upload acknowledgement');}return id;},rosterDriveJson_:r=>JSON.parse(r.getContentText()),rosterDriveRequest_:(url,options={})=>{
  const u=new URL(url),path=u.pathname.split('/'),isRevision=path.includes('revisions'),id=decodeURIComponent(isRevision?path[path.indexOf('files')+1]:path.at(-1));
  if(u.pathname.endsWith('/files')){assert.equal(locks,0);const name=/name = '([^']+)'/.exec(u.searchParams.get('q')||'')?.[1];return response({files:[...files].filter(([,f])=>!name||f.name===name).map(([id,f])=>({id,name:f.name,size:String(f.bytes.length)}))});}
  const file=files.get(id);assert(file,'missing '+id);
  if(isRevision){const revision=path.at(-1);if(options.method==='patch'){assert(locks>0,'pin during capture');assert.equal(JSON.parse(options.payload).keepForever,true);pinned.push(id+':'+revision);return response({id:revision,keepForever:true});}assert.equal(locks,0);assert(pinned.includes(id+':'+revision));return response(file.revisions[revision]);}
  if(u.searchParams.get('alt')==='media'){assert.equal(locks,0);const range=/bytes=(\d+)-(\d+)/.exec(options.headers?.Range||'');if(range){const a=+range[1],b=+range[2];return response(file.bytes.subarray(a,b+1),206,{'Content-Range':`bytes ${a}-${b}/${file.bytes.length}`});}return response(file.bytes);}
  assert(locks===0||u.searchParams.get('fields').includes('headRevisionId'));return response({id,size:String(file.bytes.length),parents:file.parents||['private'],trashed:false,headRevisionId:file.revision});
 }};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);scope.rosterEdgeSnapshot_=()=>{assert.equal(locks,2);captures++;const value=copy(snapshot);return {...value,sourceDigest:hash(JSON.stringify(value))};};
 const input={operation:'edgeExportManifest',requestId:'request',preparation:{ordinal:0,checkpoint:null}};
 const call=p=>scope.rosterEdgeMigrationDispatch_({identity:{email:'admin@example.test'},input:p},{user:{rosterAdmin:true}}).result;
 function finish(start=call(input)){let r=start;for(let n=0;n<100&&r.preparing;n++)r=call({...input,preparation:r.preparation});assert(r.manifest,'preparation must reach manifest');return r;}
 return {scope,snapshot,model,archive,files,properties,pinned,input,call,finish,stats:()=>({captures,uploads,locks}),lose:name=>loseName=name,advance:(ms=700000)=>now+=ms,clock:()=>now};
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
 const h=harness();h.lose('source.json');assert.throws(()=>h.call(h.input),/lost upload/);h.advance();
 const read=h.scope.rosterEdgeExportPrivateText_;let failRead=true;
 h.scope.rosterEdgeExportPrivateText_=(ref,...args)=>{
  if(failRead&&h.files.get(ref.fileId)?.name.endsWith('source.json')){failRead=false;throw Object.assign(Error('temporary Drive read failure'),{status:503});}
  return read(ref,...args);
 };
 assert.throws(()=>h.call(h.input),error=>error.status===503&&/temporary Drive/.test(error.message));
 const descriptor=JSON.parse([...h.properties.entries()].find(([key])=>key.startsWith('ROSTER_EDGE_EXPORT:'))[1]);
 assert.equal(descriptor.state,'capturing','an unreadable candidate does not prove the frozen source is missing');
 assert(h.finish().manifest,'the next poll recovers the same uploaded source');assert.equal(h.stats().captures,1);assert.equal(h.stats().locks,0);
}
{
 const h=harness(),first=h.call(h.input),checked=h.call({...h.input,preparation:first.preparation});h.lose('work');const next={...h.input,preparation:checked.preparation};assert.throws(()=>h.call(next),/lost upload/);const ready=h.finish(h.call(next));assert.equal(h.stats().captures,1);assert(ready.manifest);
}
{
 const h=harness(),first=h.call(h.input),next={...h.input,preparation:first.preparation};h.lose('checkpoint 00001');assert.throws(()=>h.call(next),/lost upload/);const count=h.stats().uploads,replayed=h.call(next);assert.equal(h.stats().uploads,count,'lost checkpoint acknowledgement recovers existing output');assert(replayed.preparing);
 const abandon={operation:'edgeExportAbandon',requestId:'request',resetRequestId:'restart'};assert(h.call(abandon).abandoned);assert(h.call(abandon).abandoned);assert.equal(h.properties.has('ROSTER_EDGE_EXPORT:'+first.sessionId),false);assert(h.files.size>0,'restart retains frozen evidence');assert.throws(()=>h.call(next),e=>e.status===409);assert.throws(()=>h.call({operation:'edgeExportManifest',requestId:'request'}),e=>e.status===409,'older callers cannot revive an abandoned identity');assert.throws(()=>h.call({...abandon,resetRequestId:'different'}),e=>e.status===409);
}
{
 const h=harness(),first=h.call(h.input),checked=h.call({...h.input,preparation:first.preparation}),work=h.call({...h.input,preparation:checked.preparation}),file=[...h.files.values()].find(f=>f.name.includes('work'));
 const raw=file.bytes.toString(),headerLength=Number(raw.slice(0,8));file.bytes=Buffer.from(raw.slice(0,9+headerLength)+'!'+raw.slice(10+headerLength));
 assert.throws(()=>h.call({...h.input,preparation:work.preparation}),e=>e.status===503&&/part failed its digest/.test(e.message),'the checkpoint-authenticated header still rejects altered payload bytes');
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
// After the step lease expires, a capture with no uploaded source cannot be
// resumed from live data. Expose a terminal restart instead of endless retries.
for(const afterHash of [false,true]){
 const h=harness(),binding=h.scope.rosterEdgeExportBindingV2_({identity:{email:'admin@example.test'},input:h.input});
 const descriptor={schema:2,...binding,state:'capturing',createdAt:1,sourceName:'missing-source.json',...(afterHash?{sourceHash:'a'.repeat(64),sourceBytes:10}:{})};
 h.properties.set('ROSTER_EDGE_EXPORT:'+binding.sessionId,JSON.stringify(descriptor));
 const failed=h.call(h.input);assert(failed.preparationFailed);assert(failed.requiresRestart);assert.equal(h.stats().captures,0);assert.equal(h.stats().uploads,0);
 assert.equal(JSON.parse(h.properties.get('ROSTER_EDGE_EXPORT:'+binding.sessionId)).state,'failed');assert(h.call(h.input).requiresRestart);
}
console.log('PASS resumable export: frozen capture, immutable audit, immutable checkpoint replay, lost uploads, tamper refusal, retained restart and legacy polling.');
// A missing import subfolder is created outside the live writer locks, then
// every newly-created source/checkpoint/part inherits that private folder.
{
 const h=harness(),drive=h.scope.rosterDriveRequest_;let createdFolder=0;
 h.scope.rosterFindFile_=()=>null;
 h.scope.rosterDriveRequest_=(url,options={})=>{
  if(options.method==='post'){
   assert.equal(h.stats().locks,0);const metadata=JSON.parse(options.payload);
   assert.deepEqual(metadata,{name:'Roster import files',mimeType:'application/vnd.google-apps.folder',parents:['private']});createdFolder++;
   return {getContentText:()=>JSON.stringify({id:'import-folder'})};
  }
  return drive(url,options);
 };
 const first=h.call(h.input);assert.equal(createdFolder,1);assert(first.preparing);
 assert([...h.files.values()].filter(file=>file.name.startsWith('Roster import ')).every(file=>file.parents?.[0]==='import-folder'));
}
// Live saves may proceed during upload; those changes cannot enter the pinned
// JSON, even before the initial source upload acknowledgement reaches us.
{
 const h=harness(),upload=h.scope.rosterCreateFile_,original=h.snapshot.state.rows[0].text;
 h.scope.rosterCreateFile_=(folder,name,blob)=>{if(name.endsWith('source.json'))h.snapshot.state.rows[0].text='concurrent save during upload';return upload(folder,name,blob);};
 const first=h.call(h.input),source=[...h.files.values()].find(file=>file.name.endsWith('source.json'));
 assert.equal(JSON.parse(source.bytes).snapshot.state.rows[0].text,original);assert.equal(h.stats().locks,0);assert(h.finish(first).manifest);
}
// Existing root-folder checkpoints stay readable; unrelated private files do
// not become selectable merely because their bytes have a matching digest.
{
 const h=harness(),first=h.call(h.input);
 for(const file of h.files.values())if(file.name.startsWith('Roster import '))file.parents=['private'];
 assert(h.finish(first).manifest);
 h.files.set('outside',{name:'outside',parents:['unrelated-folder'],bytes:Buffer.from('{}')});
 assert.throws(()=>h.scope.rosterEdgeExportPrivateText_({fileId:'outside',digest:hash('{}')}),error=>error.status===503);
}
console.log('PASS unlocked source upload, private import subfolder, pinned in-memory source and legacy root-folder compatibility.');

// Restart can now run while an unlocked source upload is in flight. A late
// upload keeps its evidence but must not recreate the abandoned descriptor.
{
 const h=harness(),upload=h.scope.rosterCreateFile_;let sessionId;
 h.scope.rosterCreateFile_=(folder,name,blob)=>{if(name.endsWith('source.json')){sessionId=JSON.parse(blob.getDataAsString()).sessionId;assert(h.call({operation:'edgeExportAbandon',requestId:'request',resetRequestId:'during-upload'}).abandoned);}return upload(folder,name,blob);};
 assert.throws(()=>h.call(h.input),error=>error.status===409&&/abandoned/.test(error.message));
 assert.equal(h.properties.has('ROSTER_EDGE_EXPORT:'+sessionId),false);assert(h.properties.has('ROSTER_EDGE_EXPORT_ABANDONED:'+sessionId));
 assert([...h.files.values()].some(file=>file.name.endsWith('source.json')),'late source upload remains retained evidence');
}

// Charge deterministic Drive transfer costs to the fake clock. This checks
// bounded work under a 20 ms/KiB + 250 ms/call latency model, not live latency.
{
 const h=harness();h.model.payload=crypto.randomBytes(600000).toString('base64');h.files.get('model').bytes=Buffer.from(JSON.stringify(h.model));h.snapshot.state.rows=[];h.snapshot.state.history=[{id:'wide',text:'中文'.repeat(150000)}];h.snapshot.state.staplerPlans=[];h.snapshot.state.allocationAuditExports={};
 let objectPreparations=0,recordPreparations=0,sourceReads=0;h.scope.GSiSRosterImport={...Import,prepareObject(...args){objectPreparations++;return Import.prepareObject(...args);},prepareRecords(...args){recordPreparations++;return Import.prepareRecords(...args);}};
 const create=h.scope.rosterCreateFile_,read=h.scope.rosterReadFile_,request=h.scope.rosterDriveRequest_;
 const charge=bytes=>h.advance(250+Math.ceil(bytes/1024)*20);
 h.scope.rosterCreateFile_=(folder,name,blob)=>{charge(blob.getBytes().length);return create(folder,name,blob);};
 h.scope.rosterReadFile_=id=>{if(h.files.get(id)?.name.endsWith('source.json'))sourceReads++;const raw=read(id);charge(Buffer.byteLength(raw));return raw;};
 h.scope.rosterDriveRequest_=(...args)=>{const response=request(...args);charge(response.getContent().length);return response;};
 let current=h.call(h.input),steps=0;
 while(current.preparing){const start=h.clock();current=h.call({...h.input,preparation:current.preparation});if(current.phase==='Freeze parts'){assert(h.clock()-start<25000,'one freeze step stays below 25 s in the recorded latency model');assert(current.stepSize.bytes<=262157);steps++;}}
 assert(steps>=4,'the oversized record must span several bounded steps');
 const parts=current.manifest.parts;assert(parts.every(part=>part.bytes<=262157));
 const caches=[...h.files.values()].filter(file=>file.name.includes(' work '));assert.equal(caches.length,2,'one immutable cache per object or records job');
 for(const file of caches){const raw=file.bytes.toString(),length=Number(raw.slice(0,8)),header=JSON.parse(raw.slice(9,9+length));assert.equal(header.encoding,'gzip-base64-parts-v1');assert.equal(header.chunks.length,header.partMetadata.length);assert(header.chunks.every(chunk=>chunk.bytes<=355000),'cached payloads have individually bounded compressed ranges');}
 assert.equal(objectPreparations,1,'later object parts reuse their cached plan');assert.equal(recordPreparations,1,'later record parts reuse their cached plan');assert.equal(sourceReads,2,'only snapshot checks and the initial record job read the source');
}
{
 const h=harness(),initial=h.call(h.input),checked=h.call({...h.input,preparation:initial.preparation}),work=h.call({...h.input,preparation:checked.preparation}),request={...h.input,preparation:work.preparation};
 h.lose(' part-');assert.throws(()=>h.call(request),/lost upload/);
 const before=[...h.files.entries()].filter(([,file])=>file.name.includes(' part-'));
 const recovered=h.call(request),names=[...h.files.values()].filter(file=>file.name.includes(' part-')).map(file=>file.name);
 assert.equal(names.length,2,'the retry adopts the first part, then may finish the second part in the bounded batch');assert(before.every(([id,file])=>h.files.get(id)===file),'the unacknowledged part file is retained');assert.equal(new Set(names).size,names.length,'retry never duplicates a part file');
 const checkpoint=h.call({operation:'edgeExportCheckpoint',requestId:'request',preparation:request.preparation});
 assert(checkpoint.completed);assert.equal(checkpoint.preparation.checkpoint.digest,recovered.preparation.checkpoint.digest);
}
console.log('PASS bounded freeze-step latency model, split metadata and duplicate-free lost part/checkpoint recovery');
