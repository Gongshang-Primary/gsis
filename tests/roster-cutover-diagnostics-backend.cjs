'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const properties=new Map(),writes=[],state={peerMail:[],inboxMessages:[],packedPlan:{encoding:'gzip',data:'stored'}},index={revision:1,entries:[]};
const scope={console,Date,rosterOperationsState_:()=>structuredClone(state),rosterIndex_:()=>structuredClone(index),rosterOperationsStoredView_:value=>value,rosterOperationsDigest_:hash,
 props_:()=>({getProperty:key=>properties.get(key)||null,getProperties:()=>Object.fromEntries(properties),setProperty:(key,value)=>{writes.push(key);properties.set(key,value);},setProperties:values=>{for(const [key,value] of Object.entries(values)){writes.push(key);properties.set(key,value);}}}),
 LockService:{getScriptLock:()=>({}),getUserLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);
const call=(input,admin=true)=>scope.rosterEdgeMigrationDispatch_({input,identity:{email:'admin@example.test'}},{user:{rosterAdmin:admin}})?.result;
const original=scope.rosterEdgeSnapshot_(),snapshot=call({operation:'edgeExport'}),stored=JSON.parse(properties.get('ROSTER_EDGE_SNAPSHOT_PARTS')||'null');
assert(stored,'capture stores per-part fingerprints');assert.equal(stored.sourceDigest,original.sourceDigest);assert.equal(snapshot.sourceDigest,original.sourceDigest,'diagnostics never enter the authoritative digest');
assert.deepEqual(Object.keys(stored.parts).sort(),['index',...Object.keys(snapshot.state)].sort());assert(Object.values(stored.parts).every(value=>/^[a-f0-9]{16}$/.test(value)));assert(Buffer.byteLength(JSON.stringify(stored))<9000);
let count=writes.length;
assert.equal(call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest}).current,true);assert.equal(writes.length,count,'unchanged drift is read-only');
state.peerMail.push({id:'mail-1'});
const drift=call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest});assert.equal(drift.current,false);assert.deepEqual(Array.from(drift.changed),['peerMail']);assert.equal(drift.sourceDigest,snapshot.sourceDigest);assert(Number.isFinite(Date.parse(drift.checkedAt)));assert.equal(writes.length,count,'changed drift is read-only');
assert.throws(()=>call({operation:'edgeFence',sourceDigest:snapshot.sourceDigest}),error=>error.status===409&&error.message.endsWith('Changed since the snapshot: peerMail.'));
assert.equal(properties.get('ROSTER_EDGE_AUTHORITY'),undefined);assert.equal(writes.length,count,'refusal changes no authority or diagnostic property');
index.revision++;state.added=[];delete state.packedPlan;
assert.deepEqual(Array.from(call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest}).changed).sort(),['added','index','packedPlan','peerMail']);
assert.throws(()=>call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest},false),error=>error.status===403);
assert.throws(()=>call({operation:'edgeDrift',sourceDigest:'invalid'}),error=>error.status===400);
properties.delete('ROSTER_EDGE_SNAPSHOT_PARTS');assert.equal(call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest}).changed,null,'older snapshots report unknown parts');
assert.throws(()=>call({operation:'edgeFence',sourceDigest:snapshot.sourceDigest}),error=>error.status===409&&error.message.includes('no longer current'));
properties.set('ROSTER_EDGE_SNAPSHOT_PARTS','null');assert.equal(call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest}).changed,null,'malformed metadata never changes the fence decision');
properties.set('ROSTER_EDGE_SNAPSHOT_PARTS',JSON.stringify({...stored,sourceDigest:'f'.repeat(64)}));assert.equal(call({operation:'edgeDrift',sourceDigest:snapshot.sourceDigest}).changed,null,'another capture never supplies misleading names');
// Import may project a captured audit pair, but a stored Admin repair still
// changes the authoritative source through audit identities, revision and receipt.
state.revision=8;state.receipts=[];state.audit=[
 {id:'synthetic-planning-pair',date:'2026-11-06',at:'2026-11-03T00:00:00Z',actor:'fixture-teacher@example.test',operation:'requestStapler'},
 {id:'synthetic-planning-pair',date:'2026-11-06',at:'2026-11-03T00:02:00Z',actor:'fixture-smc@example.test',operation:'decideStapler'}
];
const beforeRepair=call({operation:'edgeExport'}),repair=require('../shared/roster-import.js').repairStaplerAuditIds(state.audit);
assert.equal(repair.pairs,1);state.audit=repair.audit;state.revision++;
state.receipts.push({id:'synthetic-repair-request',actor:'fixture-admin@example.test',digest:hash({operation:'repairStaplerAuditIds',mode:'apply'}),at:'2026-11-04T00:00:00Z',revision:state.revision,result:{rule:'stapler-audit-decision-suffix',version:1,pairs:1,applied:true,revision:state.revision,requestId:'synthetic-repair-request'}});
count=writes.length;
const afterRepairDrift=call({operation:'edgeDrift',sourceDigest:beforeRepair.sourceDigest});
assert.equal(afterRepairDrift.current,false);assert.deepEqual(Array.from(afterRepairDrift.changed).sort(),['audit','receipts','revision']);
assert.throws(()=>call({operation:'edgeFence',sourceDigest:beforeRepair.sourceDigest}),error=>error.status===409&&error.message.includes('no longer current'));
assert.equal(writes.length,count,'stored repair cannot hide source drift or write an activation property');assert.equal(properties.get('ROSTER_EDGE_AUTHORITY'),undefined);
assert.equal(beforeRepair.state.audit[1].id,'synthetic-planning-pair','the old captured source remains unchanged');
const fresh=call({operation:'edgeExport'});assert.equal(call({operation:'edgeFence',sourceDigest:fresh.sourceDigest}).legacyWritesDisabled,true,'unchanged activation still uses the full digest');
function snapshotChecks(h,captured=h.call(h.input)){
 assert(captured.preparing,'capture remains resumable');
 const result=h.call({...h.input,preparation:captured.preparation});
 assert(result.preparing,'diagnostics leave preparation resumable');assert.equal(result.phase,'Snapshot checks');return result;
}
const packed=require('./fixtures/roster099-packed-capture.cjs')(),packedCapture=packed.call(packed.input);
assert.equal(packed.properties.has('ROSTER_EDGE_SNAPSHOT_PARTS'),false,'v2 defers diagnostic hashing to the next bounded step');
const frozen=JSON.parse([...packed.files.values()].find(file=>file.name.endsWith(' source.json')).bytes).snapshot;
packed.files.get('operations').bytes=Buffer.from(JSON.stringify({...packed.packed,revision:999}));
snapshotChecks(packed,packedCapture);
const packedParts=JSON.parse(packed.properties.get('ROSTER_EDGE_SNAPSHOT_PARTS')||'null');assert(packedParts,'v2 snapshot checks store fingerprints');assert.equal(packedParts.sourceDigest,packedCapture.sourceDigest);
assert.deepEqual(packedParts.parts,JSON.parse(JSON.stringify(packed.scope.rosterEdgeSnapshotParts_(frozen))),'deferred fingerprints describe the frozen source, even after live data changes');assert.equal(packed.stats().decodes,0,'per-part hashing keeps packed plans packed');
const large=require('./fixtures/roster099-packed-capture.cjs')(),capture=large.scope.rosterEdgeSnapshot_;
large.scope.rosterEdgeSnapshot_=()=>{const value=capture();for(let i=0;i<600;i++)value.state['diagnosticPart'+i]=i;value.sourceDigest=large.scope.rosterOperationsDigest_({schema:value.schema,state:value.state,index:value.index});return value;};
const largeResult=large.call(large.input);assert(largeResult.preparing,'oversized diagnostics never stop v2 capture');
snapshotChecks(large,largeResult);
const marker=JSON.parse(large.properties.get('ROSTER_EDGE_SNAPSHOT_PARTS'));assert.equal(marker.truncated,true);assert.equal(marker.parts,undefined);assert(marker.sourceDigest);assert(Buffer.byteLength(JSON.stringify(marker))<8500);assert.equal(large.scope.rosterEdgeChangedParts_({state:{},index:{}},marker.sourceDigest),null);
const unavailable=require('./fixtures/roster099-packed-capture.cjs')(),getProps=unavailable.scope.props_;
unavailable.scope.props_=()=>{const props=getProps();return {...props,setProperty(key,value){if(key==='ROSTER_EDGE_SNAPSHOT_PARTS')throw Error('diagnostics storage unavailable');return props.setProperty(key,value);}};};
snapshotChecks(unavailable);
const unhashable=require('./fixtures/roster099-packed-capture.cjs')();unhashable.scope.rosterEdgeSnapshotParts_=()=>{throw Error('diagnostic hash unavailable');};
snapshotChecks(unhashable);
console.log('PASS snapshot capture fingerprints, drift reads, changed part names and unchanged authority fence');
