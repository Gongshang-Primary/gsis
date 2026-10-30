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
