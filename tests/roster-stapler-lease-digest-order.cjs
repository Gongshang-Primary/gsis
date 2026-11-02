'use strict';
// 1 Nov 2026 cutover: activation refused twice with "Changed since the snapshot: edgeStaplerLeases"
// although lease writes are fenced. getProperties() order is not stable, so the digest must not depend on it.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const leases={'ROSTER_STAPLER_LEASE:2026-11-05':'{"fence":3}','ROSTER_STAPLER_LEASE:2026-11-02':'{"fence":4,"owner":"a@example.test","until":1}','ROSTER_STAPLER_LEASE:2026-10-30':'{"fence":5}','ROSTER_STAPLER_LEASE:2026-11-04':'{"fence":1}','OTHER':'x'};
let order=Object.keys(leases);
const scope={console,Date,rosterOperationsState_:()=>({peerMail:[]}),rosterIndex_:()=>({revision:1,entries:[]}),rosterOperationsStoredView_:value=>value,rosterOperationsDigest_:hash,
 props_:()=>({getProperty:()=>null,getProperties:()=>Object.fromEntries(order.map(key=>[key,leases[key]])),setProperty(){},setProperties(){}}),error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);
const first=scope.rosterEdgeSnapshot_();
for(const shuffled of [order.slice().reverse(),[order[2],order[0],order[4],order[3],order[1]],[order[1],order[3],order[0],order[4],order[2]]]){
 order=shuffled;const next=scope.rosterEdgeSnapshot_();
 assert.equal(next.sourceDigest,first.sourceDigest,'property order never changes the source digest');
 assert.equal(scope.rosterEdgeSnapshotParts_(next).edgeStaplerLeases,scope.rosterEdgeSnapshotParts_(first).edgeStaplerLeases,'property order never changes the lease part fingerprint');
}
assert.deepEqual(Object.keys(first.state.edgeStaplerLeases),['2026-10-30','2026-11-02','2026-11-04','2026-11-05']);
leases['ROSTER_STAPLER_LEASE:2026-11-04']='{"fence":2}';
assert.notEqual(scope.rosterEdgeSnapshot_().sourceDigest,first.sourceDigest,'a real lease change still changes the digest');
console.log('PASS stapler lease snapshot is independent of property order; real lease changes still detected');
// The read-only drift check must work while the cutover freeze is on (seen live 1 Nov 22:24).
const rosterSource=fs.readFileSync('backend/Roster.gs','utf8'),guard=rosterSource.slice(rosterSource.indexOf('function rosterDispatch_('));
assert.match(guard.slice(0,guard.indexOf('rosterEdgeAssertLegacyWrite_()')),/'edgeDrift'/,'edgeDrift is exempt from the legacy-write freeze guard');
console.log('PASS edgeDrift is exempt from the freeze guard');
// Owner ruling 2 Nov: activation tolerates a change in short-lived editor leases only.
{
 const props=new Map([['ROSTER_STAPLER_LEASE:2026-11-05','{"fence":3}']]),state={peerMail:[]};
 const s={console,Date,rosterOperationsState_:()=>structuredClone(state),rosterIndex_:()=>({revision:1,entries:[]}),rosterOperationsStoredView_:value=>value,rosterOperationsDigest_:hash,rosterCutoverStatus_:()=>({active:true}),
  props_:()=>({getProperty:key=>props.get(key)||null,getProperties:()=>Object.fromEntries(props),setProperty:(k,v)=>props.set(k,v),setProperties:values=>{for(const [k,v] of Object.entries(values))props.set(k,v);}}),
  LockService:{getScriptLock:()=>({}),getUserLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
 vm.createContext(s);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),s);
 const call=input=>s.rosterEdgeMigrationDispatch_({input,identity:{email:'admin@example.test'}},{user:{rosterAdmin:true}})?.result;
 const captured=call({operation:'edgeExport'}).sourceDigest;
 props.set('ROSTER_STAPLER_LEASE:2026-11-05','{"fence":4}');
 state.peerMail.push({id:'x'});
 assert.throws(()=>call({operation:'edgeFence',sourceDigest:captured}),e=>e.status===409&&/edgeStaplerLeases, peerMail|peerMail/.test(e.message),'lease plus a real change is refused');
 assert.equal(props.get('ROSTER_EDGE_AUTHORITY'),undefined);
 state.peerMail=[];
 const ok=call({operation:'edgeFence',sourceDigest:captured});
 assert.equal(ok.legacyWritesDisabled,true);assert.equal(ok.sourceDigest,captured,'proof returns the imported digest');assert.deepEqual(Array.from(ok.toleratedParts),['edgeStaplerLeases']);
 assert.equal(props.get('ROSTER_EDGE_AUTHORITY'),'d1');assert.equal(props.get('ROSTER_EDGE_SOURCE_DIGEST'),captured);assert.deepEqual(JSON.parse(props.get('ROSTER_EDGE_FENCE_TOLERATED')).parts,['edgeStaplerLeases']);
 props.delete('ROSTER_EDGE_AUTHORITY');props.delete('ROSTER_EDGE_SNAPSHOT_PARTS');
 assert.throws(()=>call({operation:'edgeFence',sourceDigest:captured}),e=>e.status===409,'without stored part fingerprints the full digest decides');
 console.log('PASS activation tolerates editor-lease-only drift and refuses any other change');
}
