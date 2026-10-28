'use strict';
// Exercise the actual browser cache handshake with the production report
// projection and backend compressed transport; every request reaches the server.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),fixture=require('./roster701-fixture.cjs');
const browser=vm.createContext({window:{},Blob,DecompressionStream,TextDecoder,Uint8Array,atob,Map,Set,JSON,Promise});vm.runInContext(fs.readFileSync('roster-update/public/roster-report-cache.js','utf8'),browser);
const blob=value=>({getBytes:()=>Buffer.from(value)}),backend=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],newBlob:blob,gzip:b=>blob(zlib.gzipSync(b.getBytes())),base64Encode:b=>Buffer.from(b).toString('base64')}});vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),backend);
const {O,state,ctx,date}=fixture(),cache=browser.window.RosterReportCache,scope='school|smc|verified-authority',single={operation:'read',compact:true,view:'report',date,staffId:'alice'},multi={...single,staffIds:['alice','bob']};let requests=0;
async function read(input){requests++;const wire=cache.prepare(scope,'operations',input),view=O.reportView(state,ctx,wire),response=backend.rosterOperationsReportTransport_(view,wire,ctx);return {wire,response,data:await cache.hydrate(scope,'operations',input,response)};}
(async()=>{
 const first=await read(single);assert.deepEqual(Array.from(first.data.timetable.teachers.filter(t=>Array.isArray(t.cells)),t=>t.staffId),['alice']);
 const expanded=await read(multi);assert.notEqual(expanded.response.timetableSnapshot.key,first.response.timetableSnapshot.key);assert.notEqual(expanded.response.timetableSnapshot.unchanged,true);
 assert.deepEqual(Array.from(expanded.data.timetable.teachers.filter(t=>Array.isArray(t.cells)),t=>t.staffId),['alice','bob'],'adding a teacher while keeping focus cannot restore the cached single-teacher projection');
 const repeated=await read(multi);assert.equal(repeated.response.timetableSnapshot.unchanged,true);assert.deepEqual(Array.from(repeated.data.timetable.teachers.filter(t=>Array.isArray(t.cells)),t=>t.staffId),['alice','bob']);
 const contracted=await read(single);assert.deepEqual(Array.from(contracted.data.timetable.teachers.filter(t=>Array.isArray(t.cells)),t=>t.staffId),['alice']);assert.equal(requests,4,'snapshot reuse never removes authoritative reads');
 console.log('PASS report selection cache: actual backend digest expands and contracts teacher cells safely with unchanged focus, repeated selection reuses bytes only after a fresh server check.');
})().catch(error=>{console.error(error);process.exitCode=1;});
