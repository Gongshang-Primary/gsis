'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/roster.js','utf8'),stored=new Map(),requests=[],proof={payload:'opaque signed Calendar payload',signature:'a'.repeat(64)};
function client(){
 const box={sessionEpoch:1,sequence:0,AbortController,setTimeout,clearTimeout,cacheOwner:()=> 'verified-account-role',reportCacheScope:()=>'',window:{RosterBaselineCache:{getSnapshot:async(owner,id)=>stored.get(owner+'|'+id)||null,putSnapshot:async(owner,id,value)=>stored.set(owner+'|'+id,value),removeSnapshot:async(owner,id)=>stored.delete(owner+'|'+id)}},document:{querySelector:()=>({getAttribute:()=>'/roster.js?v=0.9.3'})},fetch:async(url,options)=>{requests.push({url,p:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({ok:true,data:{date:'2026-10-14',calendarCache:proof}})};}};
 const start=source.indexOf(' const calendarProofs=');assert(start>=0,'Calendar proof persistence helper is present');vm.runInNewContext(source.slice(start,source.indexOf(' function errorText(')),box);return box;
}
(async()=>{
 let app=client();await app.requestApi('operations',{operation:'read',view:'allocation',date:'2026-10-14'});assert.equal(requests.at(-1).p.calendarCache,undefined);await app.requestApi('operations',{operation:'allocationVersion',date:'2026-10-14'});assert.deepEqual(requests.at(-1).p.calendarCache,proof);
 app=client();await app.requestApi('operations',{operation:'nextSchoolDay'});assert.deepEqual(requests.at(-1).p.calendarCache,proof,'reload restores only the opaque proof for this verified account');await app.requestApi('operations',{operation:'autoAllocate',date:'2026-10-14'});assert.equal(requests.at(-1).p.calendarCache,undefined,'commands never use local Calendar as authority');await app.requestApi('operations',{operation:'allocationVersion',date:'2026-10-14',statusOnly:true});assert.equal(requests.at(-1).p.calendarCache,undefined);
 app.cacheOwner=()=>'';await app.requestApi('operations',{operation:'nextSchoolDay'});assert.equal(requests.at(-1).p.calendarCache,undefined,'unverified session cannot reuse the proof');
 console.log('PASS v0.9.3 account-scoped Calendar proof reload and readonly request boundaries');
})().catch(error=>{console.error(error);process.exitCode=1;});
