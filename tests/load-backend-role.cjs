'use strict';
// Isolated VM fixtures use the production ownership guard with an explicit synthetic project.
// This does not replace gsisRequireBackendRole_ or infer a role from a tested request.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const moduleSource=fs.readFileSync(path.join(__dirname,'../backend/BackendRole.gs'),'utf8');
const installed=new WeakMap();
function loadBackendRole(scope,role,options={}){
 assert.ok(['roster','deploy'].includes(role),'Choose the backend role explicitly in this fixture');
 if(!vm.isContext(scope))vm.createContext(scope);
 const current=vm.runInContext("typeof GSIS_BACKEND_KIND==='undefined'?null:GSIS_BACKEND_KIND",scope);
 if(current===null)vm.runInContext('const GSIS_BACKEND_KIND='+JSON.stringify(role)+';',scope);
 else assert.equal(current,role,'The fixture role must match the compiled backend artifact');
 if(!installed.has(scope)){
  const scriptId=options.scriptId||'synthetic-'+role+'-project',properties=new Map([['ROSTER_OWNER_SCRIPT_ID',options.ownerScriptId??scriptId],['ROSTER_WRITER_ENABLED',options.writerEnabled===false?'false':'true']]);
  const service=scope.PropertiesService||{},script=scope.ScriptApp||{};
  scope.ScriptApp={...script,getScriptId:()=>scriptId};
  scope.PropertiesService={...service,getScriptProperties(){const original=service.getScriptProperties?.()||{};return new Proxy(original,{get(target,key){if(key==='getProperty')return name=>properties.has(name)?properties.get(name):target.getProperty?.call(target,name)??null;if(key==='setProperty')return (name,value)=>{if(properties.has(name)){properties.set(name,String(value));return this;}return target.setProperty?.call(target,name,value);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});}};
  installed.set(scope,{properties,scriptId});
 }
 vm.runInContext(moduleSource,scope);
 assert.equal(scope.gsisBackendKind_(),role,'The real guard recognizes the chosen synthetic project role');
 return installed.get(scope);
}
// Full Code.gs tests explicitly derive the other fixed build variant before evaluation.
loadBackendRole.sourceForRole=(source,role)=>{assert.ok(['roster','deploy'].includes(role));assert.match(source,/const GSIS_BACKEND_KIND='(?:deploy|roster)';/);return source.replace(/const GSIS_BACKEND_KIND='(?:deploy|roster)';/,'const GSIS_BACKEND_KIND='+JSON.stringify(role)+';');};
module.exports=loadBackendRole;
