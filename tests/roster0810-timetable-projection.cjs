'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const file='tests/roster089-cache.cjs',source=fs.readFileSync(file,'utf8'),box={require:createRequire(path.resolve(file)),console,Buffer,Blob,DecompressionStream,TextEncoder,TextDecoder,Uint8Array,atob,setTimeout};vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+'\nthis.fixture={harness,envelope,day0};',box);
(async()=>{
 const {harness,envelope,day0}=box.fixture,h=harness({reply:(p,from)=>envelope(p.stage,from,value=>p.stage==='baseline'?value:{...value,plans:[{date:from,baselineId:'base',revision:2,confirmedRevision:1,viewMode:'draft',plan:{date:from,baselineId:'base',teachers:[],tiles:Array.from({length:4000},(_,i)=>({id:'tile'+i,period:i%17,subject:'EL',venue:'Classroom',group:'3A'}))},timetableDay:{date:from,baselineId:'base',source:'confirmed',periods:[{period:1}],teachers:[{staffId:'a',cells:[['EL','3A','','']]}]}}]})});
 h.setDrafts(true);await h.cache.start();assert.equal(typeof h.cache.getTimetableStatus,'function','Timetable can read its projection without cloning a planner');
 const status=h.cache.getTimetableStatus(day0);assert.equal(status.timetableDay.source,'confirmed');assert.equal(status.allocationRevision,1,'allocation source uses the confirmed revision while newer edits remain drafts');assert.equal(status.plan,undefined);assert(Object.isFrozen(status));assert(Object.isFrozen(status.timetableDay.teachers));assert.equal(h.cache.getTimetableStatus(day0),status,'same immutable projection object is reused');
 const measure=fn=>{const times=[];for(let n=0;n<30;n++){const start=performance.now();for(let i=0;i<20;i++)fn();times.push((performance.now()-start)/20);}times.sort((a,b)=>a-b);return {p50Ms:+times[15].toFixed(4),p95Ms:+times[28].toFixed(4)};};
 console.log(JSON.stringify({scenario:'Node fixture, 4000 imported tiles; per lookup CPU only',beforePlannerClone:measure(()=>h.cache.getPlan(day0)),afterProjectionReference:measure(()=>h.cache.getTimetableStatus(day0)),networkRequests:h.calls.length}));
 assert.equal(h.calls.length,2);h.cache.invalidate([day0]);assert.equal(h.cache.getTimetableStatus(day0),null);h.setWho('other');assert.equal(h.cache.getTimetableStatus(day0),null);
 console.log('PASS timetable projection is immutable, scope fenced, invalidated by date, and performs no additional reads.');
})().catch(e=>{console.error(e);process.exitCode=1;});

