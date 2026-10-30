'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(value){
 const files=new Map([['single',JSON.stringify(value)]]),names=new Map([['single','Roster operations.json']]),properties=new Map([['ROSTER_OPERATIONS_FILE','single']]),writes=[],trashed=new Set(),reads=[],hashes=[],serialised=[];let sequence=0,fail='',locked=false;
 const scope=vm.createContext({JSON:{parse:JSON.parse,stringify:value=>{serialised.push(value);return JSON.stringify(value);}},ROSTER_DATA:'folder',GSISRosterOperations:{initial:()=>({schema:1,revision:0}),validateState:s=>s},props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)}),Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>{hashes.push(v);return [...crypto.createHash('sha256').update(v).digest()];},newBlob:v=>({text:v}),getUuid:()=>crypto.randomUUID()},gsisRequireBackendRole_:()=>{},rosterEdgeAssertLegacyWrite_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!locked);locked=true;return true;},deployUnlock_:()=>{locked=false;},rosterOperationsAuthority_:c=>c.user,rosterFindFile_:()=>null,rosterReadFile_:id=>{reads.push(id);if(trashed.has(id)||!files.has(id))throw Error('missing file');return files.get(id);},rosterCreateFile_:(folder,name,blob)=>{const id='file'+(++sequence);files.set(id,blob.text);names.set(id,name);writes.push({kind:'create',id,name});return id;},rosterDriveJson_:r=>JSON.parse(r.getContentText()),rosterDriveRequest_:(url,options,operation)=>{
  const id=/files\/([^?]+)/.exec(url)?.[1];if(operation==='operations-folder'){const newId='folder'+(++sequence);return {getContentText:()=>JSON.stringify({id:newId})};}
  if(fail===operation){fail='';throw Error('simulated '+operation);}
  writes.push({kind:operation,id});if(options.contentType?.startsWith('application/json')&&operation==='operations-metadata'){const m=JSON.parse(options.payload);if(m.trashed)trashed.add(id);if(m.name)names.set(id,m.name);}else files.set(id,options.payload);
  return {getContentText:()=>JSON.stringify({id})};
 }});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);scope.rosterOperationsAuthority_=c=>c.user;scope.rosterOperationsVersionChanged_=()=>{};
 return {scope,files,names,properties,writes,trashed,reads,hashes,serialised,fail:op=>fail=op,read:()=>scope.rosterOperationsRaw_(),call:(operation,token,revision,requestId=crypto.randomUUID(),admin=true)=>scope.rosterOperationsStorageDispatch_({identity:{email:'admin@example.test'},input:{operation,storageToken:token,revision,requestId}},{user:{admin,email:'admin@example.test'}})};
}
function state(){return {schema:1,revision:7,settings:{keep:true},audit:[{date:'2026-11-02',id:'later',note:'x'},{date:'2026-10-01',id:'earlier',note:'y'}],byDate:{'2026-11-02':{x:1},'2026-10-01':{x:2}},outbox:[{id:'undated',status:'uncertain',claimId:'keep'}],empty:[]};}
const test=(name,fn)=>{fn();console.log('PASS',name);};
test('single layout retains exact state and exposes conversion token',()=>{const s=state(),h=fixture(s),got=h.read();assert.equal(got.text,JSON.stringify(s));assert.equal(got.manifest,null);const report=h.call('storageReport');assert.equal(report.layout,'single');assert.match(report.storageToken,/^[a-f0-9]{64}$/);});
test('30M characters round-trip, with bounded half-month pages and retained source',()=>{
 const s=state();s.audit=Array.from({length:300},(_,i)=>({date:'2026-10-'+(i%2?'20':'01'),id:'event'+i,note:'x'.repeat(100000)}));const original=JSON.stringify(s),h=fixture(s),report=h.call('storageReport');assert(original.length>30000000);
 const result=h.call('splitOperations',report.storageToken,s.revision);assert.equal(result.layout,'split');assert.equal(h.files.get('single'),original);assert.match(h.names.get('single'),/^Roster operations \(before split \d{4}-\d{2}-\d{2}\)\.json$/);
 const raw=h.read();assert.equal(raw.text,original);assert.deepEqual(JSON.parse(raw.text),s);assert(raw.manifest.parts.every(p=>p.chars<=8000000));assert(raw.manifest.parts.some(p=>p.key.startsWith('2026-10-01')));assert(raw.manifest.parts.some(p=>p.key.startsWith('2026-10-16')));
 assert.throws(()=>h.call('joinOperations',result.storageToken,s.revision),e=>e.status===409&&e.message.includes(String(original.length)));assert.equal(h.read().text,original);
});
test('changed day rewrites only its month plus the manifest; old parts retire after commit',()=>{const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,s.revision);const before=h.read().manifest;h.writes.length=0;s.audit[1].note='changed';s.revision++;
 h.scope.rosterOperationsWriteRaw_(JSON.stringify(s));const after=h.read().manifest;assert.equal(after.revision,s.revision);assert.equal(h.read().text,JSON.stringify(s));assert.equal(h.writes.filter(w=>w.kind==='create').length,1);assert.equal(h.writes.filter(w=>w.kind==='operations-manifest').length,1);assert(h.writes.find(w=>w.kind==='create').name.startsWith('2026-10'));
 for(const p of before.parts){const next=after.parts.find(q=>q.key===p.key);if(p.key==='2026-10')assert(h.trashed.has(p.fileId));else assert.equal(next.fileId,p.fileId);}
});
test('a crash before manifest commit preserves the entire previous state',()=>{const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,s.revision);const original=h.read().text,ids=h.read().manifest.parts.map(p=>p.fileId);s.audit[0].note='new';s.revision++;h.fail('operations-manifest');assert.throws(()=>h.scope.rosterOperationsWriteRaw_(JSON.stringify(s)),/simulated/);assert.equal(h.read().text,original);assert(ids.every(id=>!h.trashed.has(id)));});
test('conversion needs current admin authority, exact revision and storage token',()=>{const h=fixture(state()),r=h.call('storageReport');assert.throws(()=>h.call('splitOperations',r.storageToken,r.revision,undefined,false),e=>e.status===403);assert.throws(()=>h.call('splitOperations','bad',r.revision),e=>e.status===409);assert.throws(()=>h.call('splitOperations',r.storageToken,r.revision+1),e=>e.status===409);assert.equal(h.properties.get('ROSTER_OPERATIONS_FILE'),'single');assert.equal(h.writes.length,0);});
test('split retry is idempotent and join round-trips without deleting backups',()=>{const s=state(),h=fixture(s),r=h.call('storageReport'),id=crypto.randomUUID(),split=h.call('splitOperations',r.storageToken,r.revision,id),count=h.writes.length;const replay=h.call('splitOperations',r.storageToken,r.revision,id);assert.equal(replay.layout,'split');assert.equal(h.writes.length,count);const joined=h.call('joinOperations',split.storageToken,r.revision);assert.equal(joined.layout,'single');assert.equal(h.read().text,JSON.stringify(s));assert.equal(h.files.get('single'),JSON.stringify(s));assert(!h.trashed.has('single'));});
test('corrupted parts cannot become a valid state',()=>{const h=fixture(state()),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);const p=h.read().manifest.parts[0];h.files.set(p.fileId,h.files.get(p.fileId)+' ');assert.throws(()=>h.read(),e=>e.status===503);});
test('split state reader preserves the same validated API and revision',()=>{const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);assert.equal(JSON.stringify(h.scope.rosterOperationsState_(true)),JSON.stringify(s));});

test('lost pointer response replays the verified conversion and the final fence follows part writes',()=>{const h=fixture(state()),report=h.call('storageReport'),requestId=crypto.randomUUID();const props=h.scope.props_,original=props();let lost=true;h.scope.props_=()=>({...original,setProperty:(key,value)=>{original.setProperty(key,value);if(key==='ROSTER_OPERATIONS_FILE'&&value!=='single'&&lost){lost=false;throw Error('lost pointer response');}}});assert.throws(()=>h.call('splitOperations',report.storageToken,report.revision,requestId),/lost pointer/);const saved=h.call('splitOperations',report.storageToken,report.revision,requestId);assert.equal(saved.replayed,true);h.writes.length=0;const next=state();next.audit[0].note='changed';next.revision++;h.scope.rosterOperationsWriteRaw_(JSON.stringify(next),()=>h.writes.push({kind:'source-fence'}));const fence=h.writes.findIndex(w=>w.kind==='source-fence'),manifest=h.writes.findIndex(w=>w.kind==='operations-manifest');assert(fence>h.writes.findIndex(w=>w.kind==='create'));assert.equal(manifest,fence+1);});

test('an oversized single record is rejected with the retained-intake capacity code before Drive writes',()=>{const s=state();s.audit=[{date:'2026-10-01',note:'x'.repeat(17000000)}];const h=fixture(s),r=h.call('storageReport');assert.throws(()=>h.call('splitOperations',r.storageToken,r.revision),e=>e.status===507&&e.code==='ROSTER_STORAGE_CAPACITY');assert.equal(h.writes.length,0);assert.equal(h.read().text,JSON.stringify(s));});

test('routine state read verifies parts without serialising or hashing the whole state',()=>{
 const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);
 h.hashes.length=0;h.serialised.length=0;h.reads.length=0;
 const result=h.scope.rosterOperationsState_(true);assert.equal(result.revision,s.revision);
 assert(!h.hashes.includes(JSON.stringify(s)),'routine read hashed the whole state');
 assert(!h.serialised.some(value=>value?.schema===1&&value?.revision===s.revision&&value?.audit),'routine read serialised the whole state');
 const count=h.reads.length;assert.equal(h.scope.rosterOperationsManifestRevision_(),s.revision);assert.equal(h.reads.length,count,'version key read the same manifest twice');
});
test('storage report records bounded read timings and conversion keeps whole-state verification',()=>{
 const s=state(),h=fixture(s),r=h.call('storageReport'),split=h.call('splitOperations',r.storageToken,r.revision);
 for(const key of ['manifestReadMs','partsReadMs','assembleMs','serialiseMs','totalMs'])assert(Number.isFinite(split.timings[key])&&split.timings[key]>=0,key);
 const raw=h.read();assert.equal(raw.text,JSON.stringify(s));
 const bad={...raw.manifest,digest:'0'.repeat(64)};bad.integrityDigest=h.scope.rosterOperationsManifestDigest_(bad);assert.throws(()=>h.scope.rosterOperationsAssemble_(bad,true),e=>e.status===503);
 const active=h.properties.get('ROSTER_OPERATIONS_FILE');h.files.set(active,JSON.stringify(bad));const current=h.call('storageReport');
 assert.throws(()=>h.call('joinOperations',current.storageToken,current.revision),e=>e.status===503);
 assert.equal(h.properties.get('ROSTER_OPERATIONS_FILE'),active);
});

test('manifest metadata stays bound to verified part contents and old manifests get full verification',()=>{
 const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);
 const raw=h.read(),id=raw.id,original=JSON.stringify(raw.manifest);
 for(const change of [
  m=>{m.revision++;},
  m=>{const a=m.fields.find(v=>v[0]==='audit'),b=m.fields.find(v=>v[0]==='empty');[a[0],b[0]]=[b[0],a[0]];},
  m=>{m.parts[0].key='changed';}
 ]){
  const m=JSON.parse(original);change(m);h.files.set(id,JSON.stringify(m));assert.throws(()=>h.scope.rosterOperationsRaw_(false),e=>e.status===503);
 }
 const legacy=JSON.parse(original);delete legacy.integrityDigest;h.files.set(id,JSON.stringify(legacy));h.hashes.length=0;
 assert.equal(h.scope.rosterOperationsRaw_(false).text,JSON.stringify(s));assert(h.hashes.includes(JSON.stringify(s)));
 legacy.digest='0'.repeat(64);h.files.set(id,JSON.stringify(legacy));assert.throws(()=>h.scope.rosterOperationsRaw_(false),e=>e.status===503);
});

test('storage preview retains the same persisted text before mutable state projections',()=>{
 const s=state(),h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);
 const current=h.scope.rosterOperationsState_(true,true),raw=h.scope.rosterOperationsStorageSnapshot_;
 current.audit.push({date:'2026-10-02',id:'unsaved'});const report=h.scope.rosterOperationsStorageReport_(raw);
 assert.equal(raw.text,JSON.stringify(s));assert.equal(report.total,JSON.stringify(s).length);assert.equal(report.revision,s.revision);
});

test('synthetic 16M storage benchmark keeps routine reads bounded to manifest and parts',()=>{
 const s=state();s.audit=Array.from({length:160},(_,i)=>({at:'2026-'+String(1+i%10).padStart(2,'0')+'-01T00:00:00Z',id:'audit'+i,note:'x'.repeat(100000)}));
 const h=fixture(s),r=h.call('storageReport');h.call('splitOperations',r.storageToken,r.revision);
 h.reads.length=0;h.hashes.length=0;h.serialised.length=0;const started=Date.now();h.scope.rosterOperationsState_(true);
 const raw=h.scope.rosterOperationsStorageSnapshot_,elapsedMs=Date.now()-started;
 assert.equal(h.reads.length,1+raw.manifest.parts.length);assert.equal(h.scope.rosterOperationsManifestRevision_(),s.revision);assert.equal(h.reads.length,1+raw.manifest.parts.length);
 assert(!h.hashes.includes(JSON.stringify(s)));
 console.log('SPLIT_STORAGE_BENCHMARK '+JSON.stringify({environment:'Node synthetic in-memory Drive; not live Apps Script',chars:JSON.stringify(s).length,parts:raw.manifest.parts.length,reads:h.reads.length,elapsedMs,timings:raw.timings}));
});
