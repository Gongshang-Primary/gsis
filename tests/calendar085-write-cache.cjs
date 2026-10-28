'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function share(reader,writer){reader.sandbox.SpreadsheetApp.getActiveSpreadsheet=()=>writer.ss;reader.sandbox.Sheets=writer.sandbox.Sheets;reader.sandbox.CacheService=writer.sandbox.CacheService;}
for(const field of ['lane','tag']){
 const writer=makeHarness(),reader=makeHarness();share(reader,writer);
 const base=writer.sandbox.CacheService;let triggered=false,metadataResult;
 reader.sandbox.CacheService={getScriptCache:()=>{const cache=base.getScriptCache();return {...cache,put(key,value,ttl){
  if(!triggered&&key==='calv2:config:rc708'){
   triggered=true;
   if(field==='lane')metadataResult=writer.call('saveLane',{LaneID:'after_school',Header:'After school',Active:'No'});
   else metadataResult=writer.call('saveTag',{Tag:'Mtg',Meaning:'Meeting',Active:'No'});
  }
  return cache.put(key,value,ttl);
 }};}};
 reader.sandbox.configCached_();assert(triggered,'reader overlaps metadata writer');
 assert.equal(metadataResult?.Active,'No','metadata write succeeded before delayed reader returns');
 const before=writer.event('E1'),writes=writer.audit.nativeWrites.length;
 assert(writer.sandbox.configCached_()[field==='lane'?'lanes':'tags'].some(r=>r[field==='lane'?'LaneID':'Tag']===(field==='lane'?'after_school':'Mtg')),'delayed reader must repopulate stale display cache');
 assert.throws(()=>writer.call('saveEvent',{event:{...before,StaffTitle:'Should reject stale '+field},expectedRevision:before._revision,operationId:crypto.randomUUID()}),new RegExp(field==='lane'?'lane is not active':'tag is not active'),field+' must be verified from current metadata under the writer lock');
 assert.equal(writer.event('E1').StaffTitle,before.StaffTitle);
 assert(writer.audit.nativeWrites.slice(writes).every(call=>call.sheet==='MutationLog'),'only the rejection receipt may be written');
}
console.log('PASS Calendar 085 stale display cache cannot authorize events using disabled lanes or tags.');
