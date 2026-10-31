'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {harness,decode}=require('./roster097-batch-backend.cjs');
const copy=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function prepared(){
 const h=harness();
 // The direct commit cases start with an existing single-file Google document.
 // Real state reads also attach its storage metadata before a later write.
 h.scope.rosterReadFile_=id=>{assert.equal(id,'operations');return '{"schema":1,"revision":0}';};
 let unpacks=0;h.scope.rosterOperationsState_=()=>h.state;h.scope.rosterOperationsPhase_=(_,fn)=>fn();h.scope.Utilities.base64Decode=x=>[...Buffer.from(x,'base64')];h.scope.Utilities.ungzip=b=>{unpacks++;return h.scope.Utilities.newBlob(zlib.gunzipSync(Buffer.from(b.getBytes())));};
 const periodsKey=h.scope.rosterOperationsPlanDigest_(JSON.stringify(h.scope.rosterTimetableBatchPeriods_(h.model)));for(const entry of h.index.entries)entry.preparedTimings={modelFile:entry.modelFile,key:periodsKey};
 let packs=0;const gzip=h.scope.Utilities.gzip;h.scope.Utilities.gzip=b=>{packs++;return gzip(b)};
 return {...h,packs:()=>packs,unpacks:()=>unpacks,save(){const packed=h.scope.rosterOperationsPackPlans_(h.state);Object.assign(h.state,copy(packed));Object.assign(h.state,h.scope.rosterOperationsUnpackPlans_(h.state));h.scope.rosterTimetableBatchCommitEnd_(h.scope.rosterTimetableBatchCommitBegin_(h.state));return packed;}};
}
function parts(e){
 assert.equal(e.encoding,'gzip-parts-v1');assert.equal(hash(e.data),e.key);const wire=JSON.parse(e.data),out=wire.payload;
 const inflate=key=>{const part=wire.parts[key],raw=zlib.gunzipSync(Buffer.from(part.data,'base64'));assert.equal(raw.length,part.bytes);assert.equal(hash(raw),key);return JSON.parse(raw)};
 if(e.stage==='baseline')out.models=out.models.map(row=>({...row,model:inflate(row.partKey)}));else out.plans=out.plans.map(row=>({...inflate(row.partKey),...row}));
 for(const row of e.stage==='baseline'?out.models:out.plans){delete row.partKey;if(row.timetableDay?.source==='confirmed'&&row.timetableSourceRevision!==undefined)row.timetableDay.sourceRevision=row.timetableSourceRevision;delete row.timetableSourceRevision;}
 return out;
}
{
 const h=prepared();h.record(h.today,{confirmed:true,confirmedSubject:'Absent — medical procedure'});const packed=h.save();
 assert(packed.staplerPlans[0].timetablePackage,'save must durably prepare safe timetable pieces');
 const packageBefore=JSON.stringify(packed.staplerPlans[0].timetablePackage),count=h.packs();h.state.revision++;h.state.outbox.push({id:'mail',status:'sent'});const same=h.save();
 assert.equal(JSON.stringify(same.staplerPlans[0].timetablePackage),packageBefore);assert.equal(h.packs(),count,'unrelated writes do not inflate or recompress prepared plans');
 const base=h.call({stage:'baseline'}),unpacked=h.unpacks();h.contacts.user.rosterSMC=false;const teacher=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}));
 assert.equal(h.packs(),count+1,'only the legacy baseline envelope was compressed');assert(!JSON.stringify(teacher).includes('medical procedure'));assert(!JSON.stringify(teacher).includes('Unconfirmed lesson'));
 assert.equal(h.unpacks(),unpacked,'ready reads do not decompress primary plans');assert(teacher.plans[0].plan.tiles.some(t=>t.subject==='Absent'));assert.equal(teacher.plans[0].viewMode,'confirmed');
 h.contacts.user.rosterSMC=true;const manager=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}));assert(manager.plans[0].plan.tiles.some(t=>t.subject==='Unconfirmed lesson'));
 const legacy=decode(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-base64-v1'}));assert.deepEqual(manager.plans,legacy.plans);assert.equal(manager.plans[0].timetableDay.sourceRevision,manager.plans[0].confirmedRevision,'prepared confirmed identity uses the plan revision, not unrelated operations writes');
}
console.log('PASS prepared parts are committed with source, reused without compression, role scoped and legacy equivalent');
module.exports={prepared,parts};
{
 const h=prepared(),savedIndex=h.scope.rosterIndex_,savedPublic=h.scope.rosterPublic_,savedToday=h.scope.rosterToday_;
 h.scope.gsisBackendKind_=()=> 'deploy';vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),h.scope);h.scope.rosterIndex_=savedIndex;h.scope.rosterPublic_=savedPublic;h.scope.rosterToday_=savedToday;
 const content=h.scope.rosterModelFile_(h.model),source=JSON.parse(content);assert(source.timetablePackage);assert.deepEqual(require('../shared/roster.js').validate(source),h.model,'old readers still accept the model');
 let reads=0;h.scope.rosterReadFile_=()=>{reads++;return content;};const before=h.packs(),base=parts(h.call({stage:'baseline',encoding:'gzip-parts-v1'}));assert.equal(h.packs(),before);assert.equal(reads,2);assert.deepEqual(base.models[0].model,h.model);
 h.index.entries[0].name='Renamed baseline';const renamed=parts(h.call({stage:'baseline',encoding:'gzip-parts-v1'}));assert.equal(renamed.entries[0].name,'Renamed baseline');assert.equal(h.packs(),before,'metadata changes reuse immutable prepared bytes');
 console.log(JSON.stringify({scenario:'prepared baseline fixture',plainModelBytes:Buffer.byteLength(JSON.stringify(h.model)),immutableFileBytes:Buffer.byteLength(content),compressedModelBytes:Buffer.from(source.timetablePackage.data,'base64').length,coldModelFileReads:reads,coldReadGzipOperations:h.packs()-before}));
 source.single=undefined;source.odd.blocks[0].cells[0][0]='Changed primary';h.scope.rosterReadFile_=()=>JSON.stringify(source);const changed=h.scope.rosterModelPart_({id:'fresh-primary',modelFile:'changed-primary'});assert.equal(JSON.parse(zlib.gunzipSync(Buffer.from(changed.data,'base64'))).odd.blocks[0].cells[0][0],'Changed primary','stale prepared copy cannot replace changed primary model');
 const damaged=JSON.parse(content);damaged.timetablePackage.data='broken';h.scope.rosterReadFile_=()=>JSON.stringify(damaged);const recovered=h.scope.rosterModelPart_({id:'fresh-compressed',modelFile:'changed-compressed'});assert.equal(JSON.parse(zlib.gunzipSync(Buffer.from(recovered.data,'base64'))).odd.blocks[0].cells[0][0],h.model.odd.blocks[0].cells[0][0]);
 console.log('PASS baseline source and compressed checksums reject stale or corrupt prepared bytes before forwarding');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});let durable='',failure='';h.scope.gsisRequireBackendRole_=()=>{};h.scope.props_().setProperty('ROSTER_OPERATIONS_FILE','operations');
 h.scope.rosterDriveRequest_=(_,options)=>{if(failure==='before')throw Error('write failed');durable=options.payload;if(failure==='after')throw Error('acknowledgement lost');};
 h.scope.rosterOperationsCommit_(h.state);assert(JSON.parse(durable).staplerPlans[0].timetablePackage);
 const oldSource=h.scope.rosterTimetableBatchMarker_().source,oldDurable=durable;h.state.staplerPlans[0].revision++;h.state.staplerPlans[0].name='Newly saved';failure='before';assert.throws(()=>h.scope.rosterOperationsCommit_(h.state),/write failed/);assert.equal(durable,oldDurable);assert.equal(h.scope.rosterTimetableBatchMarker_(),null,'failed primary write cannot mark ready');
 failure='after';assert.throws(()=>h.scope.rosterOperationsCommit_(h.state),/acknowledgement lost/);assert.equal(JSON.parse(durable).staplerPlans[0].name,'Newly saved');assert.equal(h.scope.rosterTimetableBatchMarker_(),null,'uncertain primary write cannot mark ready');
 failure='';h.scope.rosterOperationsCommit_(h.state);assert.notEqual(h.scope.rosterTimetableBatchMarker_().source,oldSource);assert(JSON.parse(durable).staplerPlans[0].timetablePackage);
 console.log('PASS prepared rows share the primary durable write and pending markers survive before/after-write faults');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});h.save();const base=h.call({stage:'baseline'}),first=h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}),keys=parts(first).planKeys;
 h.state.staplerPlans[0].name='Updated';h.state.staplerPlans[0].revision++;h.save();const delta=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,knownPlanKeys:keys,encoding:'gzip-parts-v1'}));assert.equal(delta.plans.length,1);assert.equal(delta.plans[0].name,'Updated');
 h.state.staplerPlans=[];h.save();const removed=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,knownPlanKeys:delta.planKeys,encoding:'gzip-parts-v1'}));assert.deepEqual(removed.removedDates,[h.today]);assert.equal(removed.plans.length,0);
 console.log('PASS changed and deleted prepared dates preserve the existing delta contract');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});h.save();const base=h.call({stage:'baseline'}),prior=h.state.staplerPlans[0].timetablePackage;
 h.state.staplerPlans[0].revision++;h.state.staplerPlans[0].name='New source';const pack=h.scope.rosterTimetablePart_;h.scope.rosterTimetablePart_=()=>{throw Error('compression unavailable');};const saved=h.save();assert.equal(saved.staplerPlans[0].timetablePackage,undefined,'a failed preparation removes obsolete derived content');
 h.scope.rosterTimetablePart_=pack;const value=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}));assert.equal(value.plans[0].name,'New source');assert.notEqual(value.planKeys[h.today],prior.draft.key);
 console.log('PASS preparation failure retains authoritative save and falls back without serving the prior package');
}
{
 const h=prepared();const row=h.record(h.today,{confirmed:true});row.confirmedPlan=row.draft;row.confirmedRevision=row.revision;row.published=row.draft;row.publishedRevision=row.revision;h.save();
 const base=h.call({stage:'baseline'}),before=h.packs();parts(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}));assert.equal(h.packs(),before,'chained stored aliases resolve to the same prepared source');
 const original=h.scope.rosterPlanPacked_.get(h.state.staplerPlans[0].draft);original.data='broken';
 assert.throws(()=>h.call({stage:'suspended',baselineKey:base.baselineKey,knownPlanKeys:{},encoding:'gzip-parts-v1'}),e=>e.status===503,'prepared copies cannot conceal changed primary packed bytes');
 console.log('PASS shared stored aliases reuse prepared bytes and primary corruption invalidates them');
}
{
 for(const field of ['revision','date','baselineId']){const h=prepared();h.record(h.today,{confirmed:true});h.save();const primary=h.scope.rosterPlanPacked_.get(h.state.staplerPlans[0].draft);primary.validation[field]=field==='revision'?99:'invalid';const base=h.call({stage:'baseline'});assert.throws(()=>h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'}),e=>e.status===503);}
 const h=prepared(),row=h.record(h.today,{confirmed:true});for(const plan of [row.draft,row.confirmedPlan]){for(const list of [plan.periods,plan.baseline.periods])for(const p of list){p.startMinutes++;p.endMinutes++;p.start=String(Math.floor(p.startMinutes/60)).padStart(2,'0')+':'+String(p.startMinutes%60).padStart(2,'0');p.end=String(Math.floor(p.endMinutes/60)).padStart(2,'0')+':'+String(p.endMinutes%60).padStart(2,'0');}}
 for(const entry of h.index.entries)delete entry.preparedTimings;h.save();const base=h.call({stage:'baseline'}),actual=parts(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'})),legacy=decode(h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-base64-v1'}));assert.deepEqual(actual.plans,legacy.plans);assert.equal(actual.plans[0].timetableDay.periods[0].startMinutes,h.model.timing.startMinutes+1,'confirmed own timings survive a different comparison source');
 console.log('PASS stored proof corruption rejects and confirmed own timings remain independent of comparison');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});const packed=h.save();delete packed.staplerPlans[0].timetablePackage;Object.assign(h.state,h.scope.rosterOperationsUnpackPlans_(copy(packed)));const before=h.packs();assert.equal(h.save().staplerPlans[0].timetablePackage,undefined);assert.equal(h.packs(),before,'untouched legacy plans are not migrated by unrelated saves');
 h.state.staplerPlans[0].revision++;h.state.staplerPlans[0].name='Renamed legacy';assert(h.save().staplerPlans[0].timetablePackage,'a relevant legacy metadata save prepares its new package');
 console.log('PASS legacy records prepare on relevant edits but leave unrelated writes unchanged');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});const normal=h.scope.rosterOperationsPackPlans_(h.state),primary=copy(normal);for(const row of primary.staplerPlans)delete row.timetablePackage;h.state.padding='x'.repeat(12000000-JSON.stringify(primary).length-50);
 let committed;h.scope.gsisRequireBackendRole_=()=>{};h.scope.props_().setProperty('ROSTER_OPERATIONS_FILE','operations');h.scope.rosterDriveRequest_=(_,options)=>{committed=JSON.parse(options.payload);assert(options.payload.length<=12000000);};h.scope.rosterOperationsCommit_(h.state);assert(committed.staplerPlans[0].draft);assert.equal(committed.staplerPlans[0].timetablePackage,undefined);assert(h.scope.rosterTimetableBatchMarker_());
 console.log('PASS optional prepared bytes cannot exhaust the authoritative document save limit');
}
{
 const h=prepared();h.record(h.today,{confirmed:true});h.save();const base=h.call({stage:'baseline'});h.contacts.user.rosterSMC=false;const first=h.call({stage:'suspended',baselineKey:base.baselineKey,encoding:'gzip-parts-v1'});h.contacts.rosterPeople[0].active=false;const denied=h.call({stage:'suspended',baselineKey:base.baselineKey,knownSourceKey:first.sourceKey,encoding:'gzip-parts-v1'});assert.equal(parts(denied).plans.length,0);assert.deepEqual(JSON.parse(denied.data).parts,{});
 h.contacts.user.rosterSMC=true;h.scope.rosterOperationsState_=()=>{const changed={...h.state,staplerPlans:h.state.staplerPlans.map(row=>({...row,revision:row.revision+1}))};h.scope.rosterTimetableBatchCommitBegin_(changed);return h.state;};assert.throws(()=>h.call({stage:'suspended',baselineKey:base.baselineKey,knownPlanKeys:{},encoding:'gzip-parts-v1'}),e=>e.code==='TIMETABLE_BATCH_CHANGED');
 console.log('PASS prepared responses obey fresh revocation and reject a writer racing their projection');
}
(async()=>{
 const h=prepared();h.record(h.today,{confirmed:true});h.save();h.contacts.user.rosterSMC=false;const modelPart=h.scope.rosterTimetablePart_(h.model);h.scope.rosterModelPart_=()=>modelPart;
 const box={window:{},Blob,DecompressionStream,TextDecoder,TextEncoder,Uint8Array,atob,setTimeout,crypto:crypto.webcrypto,GSISRoster:require('../shared/roster.js')};vm.runInNewContext(fs.readFileSync('roster-update/public/roster-timetable-preload.js','utf8'),box);
 const calls=[],cache=box.window.RosterTimetablePreload.create({api:async(_,p)=>{calls.push(p);return h.call(p);},scope:()=> 'school|alice|teacher',today:()=>h.today});
 const before=h.packs();assert.equal((await cache.start()).phase,'ready');assert.equal(calls[0].encoding,'gzip-parts-v1');assert.equal(h.packs(),before,'fresh client consumes ready bytes without recompression');assert.equal(h.modelReads.length,0,'new baseline timing proofs avoid full model reads during suspended preload');assert.equal(cache.getPlan(h.today).viewMode,'confirmed');assert(cache.getBaseline(h.to));
 console.log('PASS browser hydrates the actual prepared baseline and suspended wire contract');
 for(const fault of ['checksum','missing','oversize']){
  const seen=[],broken=box.window.RosterTimetablePreload.create({api:async(_,p)=>{seen.push(p.encoding);const value=h.call(p);if(p.encoding==='gzip-parts-v1'&&p.stage==='suspended'){const wire=JSON.parse(value.data),key=Object.keys(wire.parts)[0];if(fault==='checksum')wire.parts[key].data=wire.parts[key].data.slice(0,-4)+'AAAA';if(fault==='missing')delete wire.parts[key];if(fault==='oversize')wire.parts[key].bytes=64*1024*1024;value.data=JSON.stringify(wire);value.key=hash(value.data);}return value;},scope:()=> 'school|alice|teacher',today:()=>h.today});
  assert.equal((await broken.start()).phase,'ready');assert(seen.includes('json-v1'),'corrupt derived content uses one complete authoritative plain fallback');assert.equal(broken.getPlan(h.today).viewMode,'confirmed');
 }
 console.log('PASS browser rejects corrupt, missing and oversized pieces before installing and recovers through the legacy reader');
 const negotiated=[],legacy=box.window.RosterTimetablePreload.create({api:async(_,p)=>{negotiated.push(p.encoding);if(p.encoding==='gzip-parts-v1')throw Object.assign(Error('Unsupported encoding'),{status:400});const value=h.call(p);return p.encoding==='gzip-base64-v1'?{...value,data:'broken'}:value;},scope:()=> 'school|alice|teacher',today:()=>h.today});assert.equal((await legacy.start()).phase,'ready');assert.deepEqual(negotiated,['gzip-parts-v1','gzip-base64-v1','json-v1','gzip-parts-v1','gzip-base64-v1','json-v1']);
 console.log('PASS older backend negotiation retains the gzip-to-plain transport recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
