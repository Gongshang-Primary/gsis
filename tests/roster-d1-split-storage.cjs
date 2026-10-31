'use strict';
// A backup must round-trip native JSON exactly and commit its manifest last.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function fixture(){
 const files=new Map(),events=[],properties=new Map();let next=0,failName='';
 const scope=vm.createContext({console,Date,Map,Set,WeakMap,ROSTER_DATA:'data',GSISRosterOperations:{initial:()=>({schema:1,revision:0}),validateState:value=>value},gsisRequireBackendRole_:()=>{},rosterStage_:()=>{},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()],newBlob:text=>({getDataAsString:()=>text}),getUuid:()=>crypto.randomUUID()},
  props_:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)}),
  rosterReadFile_:id=>{if(!files.has(id)||files.get(id).trashed)throw Object.assign(Error('missing file'),{status:404});return files.get(id).text;},
  rosterFindFile_:(folder,name)=>[...files].find(([,file])=>file.folder===folder&&file.name===name&&!file.trashed)?.[0]||null,
  rosterCreateFile_:(folder,name,blob)=>{events.push({type:'create',name});if(name===failName)throw Error('injected upload failure');const id='file-'+ ++next;files.set(id,{folder,name,text:blob.getDataAsString()});return id;},
  rosterDriveRequest_:(url,options)=>{const id=/\/files\/([^?]+)/.exec(url)?.[1];assert(id&&files.has(id));if(url.includes('/upload/')){files.get(id).text=options.payload;events.push({type:'write',id});}else{const data=JSON.parse(options.payload);Object.assign(files.get(id),data);events.push({type:'trash',id});}return {};},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});}
 });
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 vm.runInContext(fs.readFileSync('backend/RosterNativeStorage.gs','utf8'),scope);
 const roster=fs.readFileSync('backend/Roster.gs','utf8');vm.runInContext(roster.slice(roster.indexOf('function rosterIndex_(){'),roster.indexOf('function rosterPublic_(')),scope);
 return {scope,files,events,properties,fail:name=>failName=name,read:id=>scope.rosterSplitReadDocument_(id,true).value,
  write:(value,previousId)=>{const prepared=scope.rosterSplitPrepareDocument_(value,{folderId:'backup',previousId,name:'manifest.json'});return {prepared,id:prepared.commit()};}};
}
{
 const h=fixture(),value={schema:1,revision:7,settings:{retained:true},audit:[],map:{},receipts:[{id:'receipt',result:{saved:true}}]};
 for(let n=0;n<40;n++){const date='2026-'+(n<20?'09':'10')+'-'+String(n%20+1).padStart(2,'0');value.audit.unshift({id:'event-'+n,date,text:'x'.repeat(750000)});value.map[date]={n};}
 const expected=JSON.stringify(value);assert(expected.length>30000000);const {id,prepared}=h.write(value);
 assert(prepared.manifest.parts.every(p=>p.chars<=8000000));assert(prepared.manifest.parts.some(p=>/^2026-09-/.test(p.key)));
 assert.equal(JSON.stringify(h.read(id)),expected);assert.equal(h.events.at(-1).name,'manifest.json');
}
{
 const h=fixture(),value={before:'one',revision:1,records:[{id:'a',date:'2026-10-02'},{id:'b',date:'2026-09-02'},{id:'c',date:'2026-10-02'},{id:'u'}],map:{'2026-10-02':{value:1},u:{value:2},'2026-09-02':{value:3}},empty:[],nil:null};
 const {id}=h.write(value);assert.equal(JSON.stringify(h.read(id)),JSON.stringify(value));
 const noRevision={schema:1,cooldownUntil:0,outbox:[],leases:{},peerMail:[]};assert.equal(JSON.stringify(h.read(h.write(noRevision).id)),JSON.stringify(noRevision));
}
{
 const h=fixture(),first={schema:1,revision:1,audit:[{date:'2026-09-01',text:'old'},{date:'2026-10-01',text:'old'}]},saved=h.write(first),oldParts=saved.prepared.manifest.parts;
 h.events.length=0;const second=structuredClone(first);second.revision++;second.audit[1].text='new';const updated=h.write(second,saved.id);
 assert.deepEqual(h.events.filter(e=>e.type==='create').map(e=>e.name),['2026-10.json','manifest.json']);
 assert.equal(updated.prepared.manifest.parts.find(p=>p.key==='core').fileId,oldParts.find(p=>p.key==='core').fileId);
 assert.equal(JSON.stringify(h.read(saved.id)),JSON.stringify(first),'old manifest remains complete before cleanup');assert.equal(JSON.stringify(h.read(updated.id)),JSON.stringify(second));
}
{
 const h=fixture(),first={revision:1,audit:[{date:'2026-10-01',text:'old'}]},saved=h.write(first),next={revision:2,audit:[{date:'2026-10-01',text:'new'}]};
 h.fail('manifest.json');assert.throws(()=>h.write(next,saved.id),/injected/);assert.equal(JSON.stringify(h.read(saved.id)),JSON.stringify(first));assert(!h.events.some(e=>e.type==='trash'));
 h.fail('');const prepared=h.scope.rosterSplitPrepareDocument_(next,{folderId:'backup',previousId:saved.id});assert.throws(()=>prepared.commit(()=>{throw Error('final fence');}),/final fence/);assert.equal(JSON.stringify(h.read(saved.id)),JSON.stringify(first));
}
{
 const h=fixture(),large={revision:1,payload:'x'.repeat(8000001)},largeSaved=h.write(large);assert.equal(largeSaved.prepared.manifest.encoding,'json-fragments-v1');assert.equal(JSON.stringify(h.read(largeSaved.id)),JSON.stringify(large));assert(largeSaved.prepared.manifest.parts.every(part=>part.chars<=8000000));
 const nested={single:{blocks:Array.from({length:18},(_,i)=>({name:'Teacher '+i,cells:['x'.repeat(500000)]}))},layoutMode:'single-week'},nestedSaved=h.write(nested);assert.equal(nestedSaved.prepared.manifest.encoding,'json-fragments-v1');assert.equal(JSON.stringify(h.read(nestedSaved.id)),JSON.stringify(nested));
 const fragment=nestedSaved.prepared.manifest.parts[0],original=h.files.get(fragment.fileId).text;h.files.get(fragment.fileId).text=original.replace('Teacher 0','Teacher X');assert.throws(()=>h.read(nestedSaved.id),e=>e.status===503);h.files.get(fragment.fileId).text=original;
 const altered=JSON.parse(h.files.get(nestedSaved.id).text);delete altered.encoding;h.files.get(nestedSaved.id).text=JSON.stringify(altered);assert.throws(()=>h.read(nestedSaved.id),e=>e.status===503,'the fragment encoding is bound to manifest integrity');
 const value={revision:2,rows:Array.from({length:24},(_,n)=>({id:n,text:'x'.repeat(500000)}))},saved=h.write(value);assert(saved.prepared.manifest.parts.length>1);assert.equal(JSON.stringify(h.read(saved.id)),JSON.stringify(value),'undated core entries paginate');
 const part=saved.prepared.manifest.parts[0];h.files.get(part.fileId).text+=' ';assert.throws(()=>h.read(saved.id),e=>e.status===503);
}
{
 const h=fixture(),value={schema:1,revision:1,outbox:[],audit:[],receipts:[]};h.files.set('single',{folder:'data',name:'Roster operations.json',text:JSON.stringify(value)});h.properties.set('ROSTER_OPERATIONS_FILE','single');
 let state=h.scope.rosterOperationsState_(true);state.revision++;h.scope.rosterOperationsCommit_(state);
 assert.equal(h.properties.get('ROSTER_OPERATIONS_FILE'),'single');assert.equal(JSON.parse(h.files.get('single').text).format,undefined,'normal writes never turn live Google storage into split files');
 const split=h.write(state);h.properties.set('ROSTER_OPERATIONS_FILE',split.id);state=h.scope.rosterOperationsState_(true);state.revision++;state.audit.push({date:'2026-10-01',text:'new'});h.scope.rosterOperationsCommit_(state);
 const current=h.properties.get('ROSTER_OPERATIONS_FILE');assert.notEqual(current,split.id);assert.equal(JSON.stringify(h.read(current)),JSON.stringify(state));assert.equal(JSON.parse(h.files.get('single').text).revision,2,'old single source remains untouched');
 const index={schema:1,revision:1,entries:[],receipts:[]},register=h.write(index);h.properties.set('ROSTER_INDEX_FILE',register.id);
 const loaded=h.scope.rosterIndex_();loaded.revision++;loaded.entries.push({id:'model'});h.scope.rosterCommit_(loaded);
 assert.equal(JSON.stringify(h.scope.rosterIndex_()),JSON.stringify(loaded));assert.notEqual(h.properties.get('ROSTER_INDEX_FILE'),register.id);
}
{
 const h=fixture(),state={schema:1,revision:3,outbox:[{id:'queue',date:'2026-10-01',status:'queued'}],audit:[],receipts:[],smcAlerts:[]},saved=h.write(state);h.properties.set('ROSTER_OPERATIONS_FILE',saved.id);
 Object.assign(h.scope,{LockService:{getScriptLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},Session:{getEffectiveUser:()=>({getEmail:()=> 'admin@example.test'})}});
 vm.runInContext(fs.readFileSync('backend/RosterNotificationMaintenance.gs','utf8'),h.scope);
 const result=h.scope.gsisNotificationMaintenance_(true),id=h.properties.get('ROSTER_OPERATIONS_FILE');
 assert.equal(result.cleared.cancelled,1);assert.equal(h.read(id).outbox[0].status,'cancelled');assert.equal(JSON.parse(h.files.get(id).text).format,'gsis-roster-operations-split-v1');assert.equal(h.read(saved.id).outbox[0].status,'queued');
}
console.log('PASS D1 split storage: 30M exact round-trip, native shapes, bounded core/months, changed-part reuse, manifest-last failure and corruption refusal');
