'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gzipSync}=require('node:zlib');
const filename=path.resolve(__dirname,'../roster-update/public/roster-report-cache.js');
assert.ok(fs.existsSync(filename),'Report transport must cache and decode prepared compressed timetable snapshots');
const source=fs.readFileSync(filename,'utf8');
function create(extra={}){const box={window:{},Blob,DecompressionStream,TextDecoder,Uint8Array,atob,Map,Set,JSON,Promise,...extra};vm.runInNewContext(source,box);return box.window.RosterReportCache;}
const date='2026-10-21',input={operation:'read',view:'report',compact:true,date,staffId:'alice'},scope='school|alice|teacher|access-4',key='a'.repeat(64);
function envelope(timetable={id:'base',parity:'odd',staplerRevision:2,teachers:[{staffId:'alice',cells:[['EL','4A','Room 1','']]}]},snapshotKey=key){const payload=JSON.stringify({timetable,baselineTimetable:{...timetable,staplerRevision:0}});return {date,revision:4,user:{staffId:'alice'},absences:[],timetable:null,timetableSnapshot:{schema:1,key:snapshotKey,encoding:'gzip-base64-v1',bytes:Buffer.byteLength(payload),data:gzipSync(payload).toString('base64')}};}
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const cache=create(),plain={date,revision:3,timetable:{id:'base'},absences:[]};
 assert.equal(await cache.hydrate(scope,'operations',input,plain),plain,'old backend responses remain unchanged');
 assert.equal(cache.prepare(scope,'operations',input).timetableTransport,'gzip-base64-v1');
 const packed=envelope(),first=await cache.hydrate(scope,'operations',input,packed);
 assert.equal(first.timetable.teachers[0].cells[0][0],'EL');assert.equal(first.baselineTimetable.staplerRevision,0);
 assert.equal(cache.prepare(scope,'operations',input).timetableSnapshotKey,key);
 first.timetable.teachers[0].cells[0][0]='LOCAL EDIT';
 const unchanged={...packed,revision:8,absences:[{id:'fresh'}],timetableSnapshot:{...packed.timetableSnapshot,unchanged:true}};delete unchanged.timetableSnapshot.data;
 const second=await cache.hydrate(scope,'operations',input,unchanged);
 assert.equal(second.timetable.teachers[0].cells[0][0],'EL','local edits cannot mutate the cached source');assert.equal(second.revision,8);assert.equal(second.absences[0].id,'fresh','operational records are never served from snapshot cache');
 assert.equal(cache.prepare('school|bob|teacher|access-4','operations',input).timetableSnapshotKey,undefined,'account scope cannot reuse another account snapshot');
 await assert.rejects(cache.hydrate('school|bob|teacher|access-4','operations',input,unchanged),/snapshot/i);
 assert.equal(cache.prepare('school|alice|teacher|access-5','operations',input).timetableSnapshotKey,undefined,'access revision isolates old snapshots');
 const revised=envelope({...first.timetable,staplerRevision:3},'b'.repeat(64));await cache.hydrate(scope,'operations',input,revised);assert.equal(cache.prepare(scope,'operations',input).timetableSnapshotKey,'b'.repeat(64));
 const corrupt=clone(packed);corrupt.timetableSnapshot.data='not gzip';await assert.rejects(cache.hydrate(scope,'operations',input,corrupt),/snapshot/i);
 const oversized=clone(packed);oversized.timetableSnapshot.bytes=4*1024*1024+1;await assert.rejects(cache.hydrate(scope,'operations',input,oversized),/snapshot/i);
 const wrongSize=clone(packed);wrongSize.timetableSnapshot.bytes++;await assert.rejects(cache.hydrate(scope,'operations',input,wrongSize),/snapshot/i);
 const wrongShape=envelope();wrongShape.timetableSnapshot.data=gzipSync('{}').toString('base64');wrongShape.timetableSnapshot.bytes=2;await assert.rejects(cache.hydrate(scope,'operations',input,wrongShape),/snapshot/i);
 await cache.hydrate(scope,'operations',input,packed);cache.clear([date]);assert.equal(cache.prepare(scope,'operations',input).timetableSnapshotKey,undefined,'date invalidation drops matching revision');
 await cache.hydrate(scope,'operations',input,packed);cache.clear();assert.equal(cache.prepare(scope,'operations',input).timetableSnapshotKey,undefined,'logout clears all snapshots');
 const late=cache.hydrate(scope,'operations',input,packed);cache.clear();await assert.rejects(late,e=>e.stale===true,'logout cannot be repopulated by in-flight decoding');
 const unrelated=cache.hydrate(scope,'operations',input,packed);cache.clear(['2026-10-22']);assert.equal((await unrelated).timetable.id,'base','another date invalidation does not interrupt a current read');
 const invalidated=cache.hydrate(scope,'operations',input,packed);cache.clear([date]);await assert.rejects(invalidated,e=>e.code==='TIMETABLE_SNAPSHOT'&&!e.stale,'changed-date decoding must reload current source');
 const oldBrowser=create({DecompressionStream:undefined});assert.equal(oldBrowser.prepare(scope,'operations',input),input,'unsupported browsers keep the plain contract');
 const write={operation:'saveAbsence',date};assert.equal(cache.prepare(scope,'operations',write),write,'writes never opt into compressed response or auto-retry');
 for(let i=0;i<26;i++){const d='2026-11-'+String(i+1).padStart(2,'0'),q={...input,date:d};await cache.hydrate(scope,'operations',q,{...packed,date:d,timetableSnapshot:{...packed.timetableSnapshot,key:i.toString(16).padStart(64,'0')}});}
 assert.equal(cache.prepare(scope,'operations',{...input,date:'2026-11-01'}).timetableSnapshotKey,undefined,'RAM cache has bounded entry count');
 let decoded=0;class CountedBlob extends Blob{stream(){decoded++;return super.stream();}}
 const overlap=create({Blob:CountedBlob}),large=envelope({id:'large',teachers:[{staffId:'alice',cells:[[String('x').repeat(900000)]]}]});
 await Promise.all(Array.from({length:6},(_,i)=>overlap.hydrate(scope,'operations',{...input,staffId:i%2?'alice':undefined},large)));
 assert.equal(overlap.prepare(scope,'operations',{...input,staffId:undefined}).timetableSnapshotKey,key,'overlapping selected/implicit teacher reads retain both cache aliases');
 assert.equal(decoded,1,'overlapping reads share one native decompression');
 assert.equal(overlap.prepare(scope,'operations',input).timetableSnapshotKey,key,'overlapping decodes account for one stored snapshot');
 for(let i=0;i<5;i++){const d='2026-12-0'+(i+1);await overlap.hydrate(scope,'operations',{...input,date:d},{...large,date:d,timetableSnapshot:{...large.timetableSnapshot,key:(i+1).toString(16).padStart(64,'0')}});}
 assert.equal(overlap.prepare(scope,'operations',{...input,date:'2026-12-01'}).timetableSnapshotKey,undefined,'payload-byte budget evicts oldest entries without accounting drift');
 const profile={user:{staffId:'alice'},reportData:packed};const restored=await cache.hydrate(scope,'profile',{date,view:'report'},profile);assert.equal(restored.reportData.timetable.id,'base');
 console.log('PASS compressed report transport: decode/reuse, fresh records, local isolation, account/access/date invalidation, bounded cache, corrupt payload rejection and plain fallback capability');
})().catch(e=>{console.error(e);process.exitCode=1;});
