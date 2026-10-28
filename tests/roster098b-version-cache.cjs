'use strict';
const assert=require('node:assert/strict'),adapter=require('./roster701-adapter.cjs');
const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]),cache=new Map();let now=h.ctx.now;
h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)});
h.scope.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})};
h.scope.Date.now=()=>now;
const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice']};
h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
h.scope.rosterOperationsClock_=ctx=>Object.assign(ctx,{today:h.date,minute:360});
const call=()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'allocationVersion',date:h.date}},c);
const first=call(),reads=h.calls.reads;assert(first.dayToken);
assert.equal(call().dayToken,first.dayToken);assert.equal(h.calls.reads,reads,'warm revision check must not load whole operational document');
now+=30001;call();assert.equal(h.calls.reads,reads+1,'expiry performs authoritative read even if cache retains old value');
h.scope.CacheService.getScriptCache=()=>{throw Error('Cache unavailable');};call();assert.equal(h.calls.reads,reads+2,'cache failure falls back');
h.scope.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})};
call();const saved=h.state();saved.dayRevisions[h.date]=123;h.setState(saved);h.scope.rosterOperationsVersionChanged_();assert.equal(call().dayRevision,123,'commit marker invalidates cached projection');
c.user.rosterSMC=false;c.user.rosterAdmin=false;const before=h.calls.reads;assert.throws(call,e=>e.status===403);assert.equal(h.calls.reads,before,'authority checked before cache or state');
c.user.rosterSMC=true;c.user.rosterAdmin=true;
const marker=properties.get('ROSTER_VERSION_HINT'),cmd={operation:'saveAbsence',staffId:'alice',date:h.date,typeId:'mc',periods:[2],revision:h.state().revision,requestId:require('node:crypto').randomUUID()};
h.loseNextResponse();assert.throws(()=>h.call(cmd),/Uncertain response/);assert.notEqual(properties.get('ROSTER_VERSION_HINT'),marker,'lost write response still invalidates revision hint');
assert.equal(h.call(cmd).replayed,true,'same command recovers committed receipt without second absence');
assert.equal(h.state().absences.length,1);
// A failed invalidation cannot reject an already saved command. Its stale
// hint is bounded even if CacheService keeps the entry past its declared TTL.
const cached=call(),failedMarkerReadCount=h.calls.reads,stale=h.state();stale.dayRevisions[h.date]=124;h.setState(stale);
h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,setProperty:()=>{throw Error('Properties unavailable');}});
assert.doesNotThrow(()=>h.scope.rosterOperationsVersionChanged_());assert.equal(call().dayRevision,cached.dayRevision);assert.equal(h.calls.reads,failedMarkerReadCount);
now+=30001;assert.equal(call().dayRevision,124);
console.log('PASS bounded version cache, expiry, unavailable cache, commit marker and fresh authority');
