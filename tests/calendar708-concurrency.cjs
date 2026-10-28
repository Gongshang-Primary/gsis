'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function share(reader,writer){reader.sandbox.SpreadsheetApp.getActiveSpreadsheet=()=>writer.ss;reader.sandbox.Sheets=writer.sandbox.Sheets;reader.sandbox.CacheService=writer.sandbox.CacheService;}
function revoke(writer,alias){return writer.call('saveUser',{UserAlias:alias,DisplayName:'Revoked '+alias,IsAdmin:'No',IsParentPublisher:'No',Active:'No'});}
{
 const writer=makeHarness(),reader=makeHarness();share(reader,writer);
 const base=writer.sandbox.CacheService;let triggered=false;
 reader.sandbox.CacheService={getScriptCache:()=>{const cache=base.getScriptCache();return {...cache,put:(key,value,ttl)=>{
  if(!triggered&&key==='calv2:users:rc19'){triggered=true;revoke(writer,'publisher');}
  return cache.put(key,value,ttl);
 }};}};
 // A real two-execution race: reader captures old rows, writer commits and
 // invalidates cache, then the delayed reader puts the old display catalogue.
 assert.equal(reader.sandbox.userRowsCached_().find(r=>r.UserAlias==='publisher').IsParentPublisher,'Yes');
 assert.equal(writer.sandbox.userRowsCached_().find(r=>r.UserAlias==='publisher').IsParentPublisher,'Yes','The test must leave a stale shared display cache');
 const writes=writer.audit.nativeWrites.length;
 assert.throws(()=>writer.call('saveParentSide',{eventId:'E1',expectedRevision:writer.event('E1')._revision,ParentEnabled:'Yes',ParentTitle:'Must not save',operationId:crypto.randomUUID()},'publisher'),error=>error.status===403&&error.definite===true);
 assert.equal(writer.audit.nativeWrites.length,writes,'Revoked permission must cause zero mutation/journal writes');
 assert.equal(writer.call('bootstrap',{year:2026},'publisher').actor.isParentPublisher,false,'Bootstrap authority is also fresh');
}
for(const entry of [
 {alias:'admin',action:'saveTag',payload:h=>({Tag:'Mtg',Meaning:'Must not save',Active:'Yes'})},
 {alias:'publisher',action:'saveParentSide',payload:h=>({eventId:'E1',expectedRevision:h.event('E1')._revision,ParentEnabled:'Yes',ParentTitle:'Must not save',operationId:crypto.randomUUID()})},
 {alias:'admin',action:'syncYearBatch',payload:()=>({syncRunId:'test-run'})}
]){
 const writer=makeHarness(),reader=makeHarness();share(reader,writer);
 const base=writer.sandbox.LockService;let revoked=false,acquired=0,released=0;
 reader.sandbox.LockService={getScriptLock:()=>{const native=base.getScriptLock();return {tryLock(ms){
  if(!revoked){revoked=true;revoke(writer,entry.alias);}
  const result=native.tryLock(ms);if(result)acquired++;return result;
 },releaseLock(){released++;native.releaseLock();}};}};
 const beforeTag=writer.sheets.get('Tags').values[1][1],beforeEvent=writer.event('E1').ParentTitle;
 assert.throws(()=>reader.call(entry.action,entry.payload(reader),entry.alias),error=>error.status===403&&error.definite===true,entry.action+' must recheck role after waiting for the lock');
 assert(revoked);assert.equal(acquired,1);assert.equal(released,1,'Rejected authority must release the acquired lock');
 assert.equal(writer.audit.nativeWrites.length,2,'Only the separate revocation record and its audit commit');assert(writer.audit.nativeWrites.every(row=>['Users','AuditLog'].includes(row.sheet)));
 assert.equal(writer.sheets.get('Tags').values[1][1],beforeTag);assert.equal(writer.event('E1').ParentTitle,beforeEvent);
 assert.equal(reader.sandbox.calendarRequestAuthority_,null,'Request authority must not leak to a later execution');
}
{
 const h=makeHarness(),event=h.event('E1'),p={eventId:'E1',expectedRevision:event._revision,ParentEnabled:'Yes',ParentTitle:'Committed earlier',operationId:crypto.randomUUID()};
 h.call('saveParentSide',p,'publisher');revoke(h,'publisher');const writes=h.audit.nativeWrites.length;
 assert.throws(()=>h.call('saveParentSide',p,'publisher'),e=>e.status===403);
 assert.throws(()=>h.call('eventMutationStatus',{action:'saveParentSide',payload:p},'publisher'),e=>e.status===403);
 assert.equal(h.audit.nativeWrites.length,writes,'Revoked identity cannot replay or inspect the privileged receipt');
}
{
 const h=makeHarness();let locks=0;h.sandbox.LockService={getScriptLock:()=>{locks++;throw Error('View must not acquire a lock');}};
 h.call('bootstrap',{year:2026});const cold=h.audit.nativeReads.length;h.call('bootstrap',{year:2026});const warm=h.audit.nativeReads.length-cold;
 assert(cold>0);assert(warm>0&&warm<=cold);assert.equal(h.audit.apiReads.length,0);assert.equal(locks,0);
 console.log('PASS Calendar 708: stale shared role cache rejected; role revocation while waiting blocked for metadata, parent event, maintenance; receipt permissions retained; locks released; bootstrap native cold/warm reads, zero API reads and zero locks');
}
