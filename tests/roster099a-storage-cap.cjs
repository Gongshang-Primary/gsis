'use strict';
// 0.9.9a: the Roster operations save ceiling is an Admin Script Property
// (16M default, raise to at most 24M), and prune preview reports storage per
// collection without changing anything.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./roster701-fixture.cjs');
const test=(name,run)=>{run();console.log('PASS',name);};
test('save ceiling comes from ROSTER_OPERATIONS_MAX_CHARS within 16M to 24M',()=>{
 const src=fs.readFileSync('backend/RosterOperations.gs','utf8'),fn=src.match(/function rosterOperationsMaxChars_\(\)\{[^\n]*\}/)[0];
 for(const [value,want] of [[null,16000000],['20000000',20000000],['24000000',24000000],['30000000',16000000],['1000',16000000],['abc',16000000],['20000000.5',16000000]]){
  const ctx={props_:()=>({getProperty:key=>key==='ROSTER_OPERATIONS_MAX_CHARS'?value:null})};vm.createContext(ctx);vm.runInContext(fn,ctx);
  assert.equal(vm.runInContext('rosterOperationsMaxChars_()',ctx),want,String(value));
 }
 assert.match(src,/data\.length>rosterOperationsMaxChars_\(\)/,'the commit guard uses the setting');
});
test('prune preview reports storage and removes nothing',()=>{
 const f=fixture();f.ctx.user={...f.ctx.user,admin:true};f.ctx.storageMaxChars=20000000;
 const before=JSON.stringify(f.state),past='2026-01-01';
 const result=f.O.read(f.state,f.ctx,{operation:'prunePreview',from:past,to:past});
 assert.equal(JSON.stringify(f.state),before,'preview changes nothing');
 assert.equal(result.storage.limit,20000000);
 assert(result.storage.total>0&&Array.isArray(result.storage.collections));
 const sum=result.storage.collections.reduce((n,c)=>n+c.chars,0);assert.equal(sum,result.storage.total);
 assert(result.storage.collections.every((c,i,a)=>i===0||a[i-1].chars>=c.chars),'largest first');
});
test('storage report measures the stored compressed form and never inflates history',()=>{
 const zlib=require('node:zlib'),crypto=require('node:crypto'),S=require('../shared/roster-stapler.js');
 const blob=v=>{const d=Buffer.from(v);return {getBytes:()=>[...d],getDataAsString:()=>d.toString('utf8')};};let decodes=0;
 const scope={GSISRosterStapler:S,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>{decodes++;return blob(zlib.gunzipSync(Buffer.from(b.getBytes())));},base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')]},error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
 vm.createContext(scope);for(const f of ['RosterOperations','RosterAuditExport'])vm.runInContext(fs.readFileSync('backend/'+f+'.gs','utf8'),scope);
 const plan=date=>S.create({date,id:'baseline',verified:true,schoolDay:true,parity:'even',periods:Array.from({length:24},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),teachers:Array.from({length:100},(_,i)=>({staffId:'staff'+i,name:'Teacher '+i,timetableName:'Teacher '+i,cells:Array.from({length:24},()=>['English','4P','D1-01',''])})),formClasses:[],recesses:[]});
 const f=fixture();f.ctx.user={...f.ctx.user,admin:true};f.ctx.storageMaxChars=20000000;
 for(let d=1;d<=8;d++){const p=plan('2026-09-0'+d);f.state.staplerPlans.push({date:p.date,baselineId:p.baselineId,revision:1,publishedRevision:1,draft:p,published:p});}
 f.state.optimisationRuns=[...(f.state.optimisationRuns||[]),{id:'run-1',date:'2026-09-01',decisionEvidence:{version:1,rows:Array.from({length:2000},(_,i)=>({staffId:'staff'+(i%100),score:i}))}}];
 const saved=JSON.stringify(scope.rosterAllocationAuditPack_(scope.rosterOperationsPackPlans_(f.state,false)));
 const lazy=scope.rosterAllocationAuditUnpack_(scope.rosterOperationsUnpackPlans_(JSON.parse(saved)));
 const plain=f.O.read(lazy,f.ctx,{operation:'prunePreview',from:'2026-01-01',to:'2026-01-01'}).storage.total;
 assert(plain>saved.length*5,'without the host view the expanded size is far larger (the bug)');
 decodes=0;const report=f.O.read(scope.rosterAllocationAuditUnpack_(scope.rosterOperationsUnpackPlans_(JSON.parse(saved))),{...f.ctx,storageView:scope.rosterOperationsStoredView_},{operation:'prunePreview',from:'2026-01-01',to:'2026-01-01'}).storage;
 assert.equal(decodes,0,'measuring never decompresses history');
 assert(Math.abs(report.total-saved.length)<saved.length*0.02,`report ${report.total} matches saved ${saved.length}`);
 assert.equal(report.collections.reduce((n,c)=>n+c.chars,0),report.total);
 Object.assign(scope,{GSISRosterOperations:f.O,props_:()=>({getProperty:key=>key==='ROSTER_OPERATIONS_MAX_CHARS'?'20000000':null}),rosterIndex_:()=>assert.fail('storage reads do not need the timetable index')});
 scope.Utilities.formatDate=(_,zone,format)=>{assert.equal(zone,'Asia/Singapore');return format==='yyyy-MM-dd'?f.date:format==='HH'?'08':'00';};
 const contacts={user:{rosterAdmin:true,rosterSMC:true,rosterStaffId:'alice'},rosterPeople:f.people,rosterSMCIds:['alice']};
 for(const input of [{operation:'prunePreview',from:'2026-01-01',to:'2026-01-01'},{operation:'read',view:'prune'}]){
  const state=scope.rosterAllocationAuditUnpack_(scope.rosterOperationsUnpackPlans_(JSON.parse(saved))),context=scope.rosterOperationsContext_({input,identity:{email:'alice@gsps.edu.sg'}},contacts,state);
  assert.equal(context.storageView,scope.rosterOperationsStoredView_,'the real '+input.operation+' context supplies the stored view');
  assert.equal(context.storageMaxChars,20000000,'the real '+input.operation+' context supplies the configured capacity');
  decodes=0;const actual=f.O.read(state,context,input).storage;
  assert.equal(decodes,0,'the real '+input.operation+' context measures without decompressing history');
  assert(Math.abs(actual.total-saved.length)<saved.length*0.02,'the real '+input.operation+' context measures the saved form');
 }
});
