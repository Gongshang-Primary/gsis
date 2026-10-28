'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/roster.js','utf8'),deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
(async()=>{
 let foreground=0,requests=0;const gates=[];
 const box={sessionEpoch:1,apiReadGeneration:0,apiReads:new Map(),preloadSchedule:0,preloadCheckedAt:0,timetableDays:new Map(),timetablePreload:{invalidate(){}},today:()=>'',timedRead:async fn=>{foreground++;try{return await fn();}finally{foreground--; }},requestApi:async()=>{requests++;const gate=deferred();gates.push(gate);return gate.promise;}};
 vm.runInNewContext(source.slice(source.indexOf(' function api('),source.indexOf(' async function requestApi(')),box);
 const background=box.api('operations',{operation:'read',view:'allocation'},'POST',undefined,{background:true});assert.equal(foreground,0,'background allocation verification does not keep foreground Loading counter visible');
 const explicit=box.api('operations',{operation:'read',view:'allocation'});assert.equal(foreground,1,'a foreground consumer sharing the same request gets a loading counter');assert.equal(requests,1);gates[0].resolve({date:'2026-10-14'});await Promise.all([background,explicit]);assert.equal(foreground,0);
 const preload=box.api('operations',{operation:'timetableBatch'},'POST',undefined,{background:true}),needed=box.api('profile');assert.equal(foreground,1);gates[2].resolve({user:{}});await needed;assert.equal(foreground,0,'background preload does not extend completed foreground timing');gates[1].resolve({});await preload;
 console.log('PASS v0.9.3 foreground loading excludes background work and upgrades shared foreground reads');
})().catch(error=>{console.error(error);process.exitCode=1;});
