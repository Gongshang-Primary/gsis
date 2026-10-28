'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/roster.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function proofReuse(){
 const stored=new Map(),requests=[],writes=[],proof={payload:'opaque verified Calendar window',signature:'a'.repeat(64)};
 const box={sessionEpoch:1,sequence:0,AbortController,setTimeout,clearTimeout,cacheOwner:()=> 'verified-account-role',reportCacheScope:()=>'',window:{RosterBaselineCache:{getSnapshot:async(owner,id)=>stored.get(owner+'|'+id)||null,putSnapshot:async(owner,id,value)=>{writes.push(id);stored.set(owner+'|'+id,value);},removeSnapshot:async(owner,id)=>stored.delete(owner+'|'+id)},RosterReportCache:{prepare:(_,route,p)=>p,hydrate:async(_,route,p,data)=>data}},document:{querySelector:()=>({getAttribute:()=>'/roster.js?v=0.9.3a'})},fetch:async(url,options)=>{requests.push({url,p:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({ok:true,data:{date:'2026-10-14',calendarCache:proof}})};}};
 vm.runInNewContext(source.slice(source.indexOf(' const calendarProofs='),source.indexOf(' function errorText(')),box);
 await box.requestApi('operations',{operation:'read',view:'report',compact:true,date:'2026-10-14'});
 await box.requestApi('operations',{operation:'read',view:'report',compact:true,date:'2026-10-15'});
 assert.deepEqual(requests.at(-1).p.calendarCache,proof,'tomorrow report reuses the proof received before snapshot hydration');
 assert.equal(writes.length,1,'unchanged proof does not rewrite even the small Calendar snapshot');
 await box.requestApi('operations',{operation:'read',view:'entry',compact:true,date:'2026-10-15'});
 assert.deepEqual(requests.at(-1).p.calendarCache,proof);
 for(const [route,p] of [['profile',{view:'reportForm'}],['operations',{operation:'read',view:'reportForm'}],['operations',{operation:'saveAbsence',date:'2026-10-15'}]]){await box.requestApi(route,p);assert.equal(requests.at(-1).p.calendarCache,undefined,'form metadata and mutations never use Calendar proof');}
}
async function diskBeforeNetwork(){
 const network=deferred(),entry={id:'base'},cached={modelId:'base',model:{valid:true}},models=new Map(),calls=[];
 const box={Promise,Map,Date,timetablePreload:null,window:{RosterBaselineCache:{get:async()=>cached.model}},reads:new Map([['2026-10-15',{promise:network.promise}]]),modelReads:new Map(),models,cacheGeneration:1,sessionEpoch:1,cacheOwner:()=> 'verified-role',selectedTimetable:()=>({entry}),cachedTimetable:()=>models.has('base')?cached:null,GSISRoster:{validate:x=>x},rememberModel:r=>models.set(r.modelId,r.model),api:async(...x)=>{calls.push(x);throw Error('No new network read expected');}};
 vm.runInNewContext(source.slice(source.indexOf(' function localTimetable('),source.indexOf(' function invalidateOperations(')),box);
 const result=await Promise.race([box.localTimetable('2026-10-15'),new Promise(resolve=>setTimeout(()=>resolve('waiting'),30))]);
 assert.notEqual(result,'waiting','a pending dated network check must not hide an already available IndexedDB baseline');assert.equal(result,cached);assert.equal(calls.length,0);
 network.resolve(cached);
 models.clear();box.window.RosterBaselineCache.get=async()=>null;box.timetablePreload={restore:async()=>models.set('base',cached.model)};box.reads=new Map([['2026-10-16',{promise:new Promise(()=>{})}]]);
 const fromGeneration=await Promise.race([box.localTimetable('2026-10-16'),new Promise(resolve=>setTimeout(()=>resolve('waiting'),30))]);assert.notEqual(fromGeneration,'waiting','decoded generation restores before joining held Calendar read');assert.equal(fromGeneration,cached);
}
(async()=>{await proofReuse();await diskBeforeNetwork();console.log('PASS v0.9.3a client: report Calendar proof reuse, form/mutation boundary and local baseline before held network');})().catch(e=>{console.error(e);process.exitCode=1;});
