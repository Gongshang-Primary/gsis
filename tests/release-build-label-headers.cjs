'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const folders=Object.values(require('../release-installation-manifest.json').frontends);
(async()=>{
for(const folder of folders){
 const source=fs.readFileSync(folder+'/_worker.js','utf8');
 const fn=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='json');
 assert(fn,folder+' JSON response helper');
 const scope=vm.createContext({Response,Headers});
 vm.runInContext(source.slice(fn.start,fn.end),scope);
 for(const [payload,expected] of [[{ok:true,buildLabel:'0.9.9b'},'0.9.9b'],[{ok:true,buildLabel:'0.9.9c'},'0.9.9c'],[{ok:true,backendVersion:'0.9.9c'},null],[{ok:true,buildLabel:'bad\r\nheader'},null],[{ok:true},null]]){
  scope.payload=payload;const response=vm.runInContext('json(payload)',scope);
  assert.equal(response.headers.get('X-GSiS-Build-Label'),expected,folder);
  assert.deepEqual(await response.json(),payload);
 }
}
console.log('PASS frontend headers expose only actual backend build labels');
})().catch(error=>{console.error(error);process.exitCode=1;});
