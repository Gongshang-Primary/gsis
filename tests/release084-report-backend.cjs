'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const O=require('../shared/roster-operations.js'),fixture=require('./roster701-fixture.cjs');
const cache=new Map();let gzipCalls=0;
const blob=(value)=>({getBytes:()=>[...Buffer.from(value)],getDataAsString:()=>Buffer.from(value).toString('utf8')});
const scope=vm.createContext({GSISRosterOperations:O,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],newBlob:blob,gzip:b=>{gzipCalls++;return blob(zlib.gzipSync(Buffer.from(b.getBytes())));},base64Encode:v=>Buffer.from(v).toString('base64')},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})}});
require('./load-backend-role.cjs')(scope,'roster');
vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
assert.equal(typeof scope.rosterOperationsReportTransport_,'function','backend must prepare compressed report snapshots');
const f=fixture();f.ctx.user.smc=false;f.ctx.user.admin=false;
for(let n=0;n<100;n++)f.ctx.days[f.date].teachers.push({staffId:'teacher'+n,name:'Teacher '+n,cells:f.blank(),R:4});
const p={operation:'read',view:'report',compact:true,date:f.date,timetableTransport:'gzip-base64-v1'},plain=O.reportView(f.state,f.ctx,p),first=scope.rosterOperationsReportTransport_(plain,p,f.ctx);
assert.equal(first.timetable,null);assert.equal(first.baselineTimetable,null);assert.equal(first.timetableSnapshot.encoding,'gzip-base64-v1');assert.match(first.timetableSnapshot.key,/^[a-f0-9]{64}$/);
const json=zlib.gunzipSync(Buffer.from(first.timetableSnapshot.data,'base64'));assert.equal(json.length,first.timetableSnapshot.bytes);assert.deepEqual(JSON.parse(json),{timetable:plain.timetable,baselineTimetable:plain.baselineTimetable});
const repeated=scope.rosterOperationsReportTransport_({...plain,revision:12},p,f.ctx);assert.equal(gzipCalls,1,'unchanged prepared snapshot is compressed once');assert.equal(repeated.revision,12,'live records remain fresh');
const warm=scope.rosterOperationsReportTransport_(plain,{...p,timetableSnapshotKey:first.timetableSnapshot.key},f.ctx);assert.equal(warm.timetableSnapshot.unchanged,true);assert.equal(warm.timetableSnapshot.data,undefined);assert.equal(gzipCalls,1);
const renamed=JSON.parse(JSON.stringify(plain));renamed.timetable.teachers[0].name='New name';assert.notEqual(scope.rosterOperationsReportTransport_(renamed,p,f.ctx).timetableSnapshot.key,first.timetableSnapshot.key);
const suspended=JSON.parse(JSON.stringify(plain));suspended.timetable.staplerRevision=2;suspended.timetable.teachers[0].cells[2]=['PAL','4B','Hall',''];assert.notEqual(scope.rosterOperationsReportTransport_(suspended,p,f.ctx).timetableSnapshot.key,first.timetableSnapshot.key);
assert.notEqual(scope.rosterOperationsReportTransport_(plain,p,{...f.ctx,user:{...f.ctx.user,email:'other@gsps.edu.sg'}}).timetableSnapshot.key,first.timetableSnapshot.key,'snapshot key is scoped to verified identity');
assert.equal(scope.rosterOperationsReportTransport_(plain,{...p,timetableTransport:undefined},f.ctx),plain);assert.equal(scope.rosterOperationsReportTransport_(plain,{...p,operation:'saveAbsence'},f.ctx),plain,'never compress or retry writes');
const bytes=x=>Buffer.byteLength(JSON.stringify(x));console.log(JSON.stringify({case:'104-teacher prepared report',plainBytes:bytes(plain),compressedBytes:bytes(first),warmBytes:bytes(warm),unchangedCompressionCalls:1}));
console.log('PASS v0.8.4 real gzip report transport, prepared reuse, identity/source changes, legacy and mutation compatibility.');
// Use the real suspended-day composition: retain each selected teacher's
// baseline and effective cells without exposing unselected colleagues' cells.
{
 const S=require('../shared/roster-stapler.js'),f=fixture();f.ctx.minute=360;f.ctx.baselineDays=f.ctx.days;f.teachers[0].cells[2][1]='GroupX';f.teachers[0].cells[3][1]='GroupX';for(const t of f.teachers)Object.assign(t,{rawR:4,timetableFactor:1,teachingWeight:1,offloadFactor:0,fullTimeTeacherCount:4});
 let plan=S.create({...f.ctx.days[f.date],date:f.date});plan=S.apply(plan,{type:'move',tileId:plan.tiles[0].id,teacherId:'bob',period:2});O.apply(f.state,f.ctx,{operation:'saveStapler',plan,staplerRevision:0});O.apply(f.state,f.ctx,{operation:'confirmStapler',staplerRevision:1});
 const context=O.composeStaplerContext(f.state,f.ctx),report=O.reportView(f.state,context,p),encoded=scope.rosterOperationsReportTransport_(report,p,context),decoded=JSON.parse(zlib.gunzipSync(Buffer.from(encoded.timetableSnapshot.data,'base64')));
 assert.equal(decoded.baselineTimetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'EL');assert.equal(decoded.timetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'');assert.equal(decoded.timetable.teachers.find(t=>t.staffId==='bob').cells,undefined,'single-teacher compact response excludes colleague cells');assert.equal(decoded.timetable.staplerRevision,1);
 const selected={...p,staffId:'alice',staffIds:['alice','bob']},multiReport=O.reportView(f.state,context,selected),multiEncoded=scope.rosterOperationsReportTransport_(multiReport,selected,context),multi=JSON.parse(zlib.gunzipSync(Buffer.from(multiEncoded.timetableSnapshot.data,'base64')));
 assert.notEqual(multiEncoded.timetableSnapshot.key,encoded.timetableSnapshot.key,'an authorized expanded selection gets its own content key');assert.equal(multi.timetable.teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');assert.equal(multi.baselineTimetable.teachers.find(t=>t.staffId==='bob').cells[2][0],'');assert.equal(multi.timetable.teachers.find(t=>t.staffId==='dora').cells,undefined);assert.equal(multi.timetable.staplerRevision,1);
 console.log('PASS v0.8.4 compressed snapshot preserves selected baseline/suspended cells and includes colleagues only in an authorized explicit selection.');
}
