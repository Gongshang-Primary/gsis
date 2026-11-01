'use strict';
/* Exercise the production serializer and downloaded browser file, not a hand-written transport contract. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),acorn=require('acorn'),{JSDOM}=require('jsdom');
const {fixture}=require('./helpers/timetable-preparation-source.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(root+'/backend/Code.gs','utf8'),productionVersion=JSON.parse(fs.readFileSync(root+'/package.json','utf8')).gsisComponentVersions.rosterBackend;
function sourceFunction(name){const node=acorn.parse(source,{ecmaVersion:2020}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(node,'Missing production function '+name);return source.slice(node.start,node.end);}
function browserExport(options={}){
 const f=fixture({at:'2026-10-28T02:17:35.892Z'}),rawResults=[],wireResults=[],blobs=[],calls=[],logs=[];
 // The extracted production serializer uses its actual generated build constant.
 const buildConstant=acorn.parse(source,{ecmaVersion:2020}).body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(item=>item.id.name==='GSIS_BUILD_LABEL'));
 assert(buildConstant,'Missing production build constant');vm.runInContext(source.slice(buildConstant.start,buildConstant.end),f.scope);
 assert.equal(vm.runInContext('GSIS_BUILD_LABEL',f.scope),require('../package.json').gsisBuildLabel);
 // Preserve a domain value called "timing" inside the hashed native bytes.
 f.models.fileA.single.blocks[0].cells[0][0]='timing';
 Object.assign(f.scope,{deployTrace_:{backendVersion:productionVersion,diagnosticBuild:productionVersion+'-roster-diag1',requestId:'11111111-2222-3333-4444-555555555555',started:Date.now(),phases:{source:8},contacts:[{timing:{backendVersion:'contacts-test'}}],action:'rosterOperations'},deployResponseIO_:()=>({reads:3}),rosterStage_:()=>{},rosterDiagnostic_:()=>{},console:{info:value=>logs.push(JSON.parse(value))},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({setMimeType(){return this;},getContent:()=>value})}});
 vm.runInContext(sourceFunction('out_'),f.scope);
 const dom=new JSDOM(fs.readFileSync(root+'/roster-update/public/timetable-preparation.html','utf8'),{url:'https://roster.school.example/timetable-preparation.html',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:crypto.webcrypto});Object.assign(w,{TextEncoder,TextDecoder,AbortController,Blob,Response,fetch:async(url,request)=>{
  assert.equal(url,'/api/operations');assert.equal(request.credentials,'same-origin');assert.equal(request.cache,'no-store');const input=JSON.parse(request.body);calls.push(input);
  const {operation,...fields}=input,data=f.call(operation,fields);rawResults.push(JSON.parse(JSON.stringify(data)));
  const serialized=options.withoutTiming?JSON.stringify({ok:true,data}):f.scope.out_({ok:true,data}).getContent();wireResults.push(JSON.parse(serialized));return new Response(serialized,{headers:{'Content-Type':'application/json'}});
 }});
 w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:private-snapshot';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.eval(fs.readFileSync(root+'/roster-update/public/timetable-preparation.js','utf8'));
 return {dom,w,rawResults,wireResults,blobs,calls,logs};
}
async function downloaded(f){f.w.document.getElementById('download-snapshot').click();for(let i=0;i<200&&f.w.document.getElementById('download-snapshot').disabled;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.blobs.length,1,f.w.document.getElementById('export-status').textContent);return JSON.parse(await f.blobs[0].text());}
test('native handler → actual diagnostic serializer → downloaded browser bundle passes unchanged Worker validators',async()=>{
 const f=browserExport();try{
  const bundle=await downloaded(f),domain=await import('../timetable-prep-worker/domain.mjs');
  assert.equal(f.wireResults.length,4);assert(f.wireResults.every(result=>result.data.timing?.contacts?.[0].timing.backendVersion==='contacts-test'&&result.data.timing.backendVersion===productionVersion),'The test must traverse the real diagnostic-wrapped transport');assert.equal(f.logs.length,4);assert.equal(bundle.manifest.release,'0.9.8o','P production diagnostics must not break the existing O preparation protocol');
  await domain.manifest(bundle.manifest);for(const part of bundle.parts)await domain.part(part);domain.sourceCheck(bundle.sourceCheck,bundle.manifest);
  assert.deepEqual([bundle.manifest,...bundle.parts,bundle.sourceCheck],f.rawResults,'Removing transport diagnostics must preserve every native field and canonical byte');
  assert(bundle.parts[0].data.includes('timing'),'Domain content containing timing must remain intact');assert.equal(f.w.localStorage.length,0);assert(!JSON.stringify(bundle).includes('contacts-test'));
 }finally{f.dom.window.close();}
});
test('transport without diagnostics keeps the identical export contract',async()=>{
 const f=browserExport({withoutTiming:true});try{const bundle=await downloaded(f),domain=await import('../timetable-prep-worker/domain.mjs');await domain.manifest(bundle.manifest);for(const part of bundle.parts)await domain.part(part);domain.sourceCheck(bundle.sourceCheck,bundle.manifest);assert.deepEqual([bundle.manifest,...bundle.parts,bundle.sourceCheck],f.rawResults);}finally{f.dom.window.close();}
});
test('Worker still refuses diagnostic or unknown keys in uploaded files',async()=>{
 const f=browserExport({withoutTiming:true});try{
  const bundle=await downloaded(f),domain=await import('../timetable-prep-worker/domain.mjs');
  for(const extra of [{timing:{}},{privateDetails:'unsupported'}]){
   await assert.rejects(domain.manifest({...bundle.manifest,...extra}),error=>error.code==='UNSUPPORTED_SCHEMA');
   await assert.rejects(domain.part({...bundle.parts[0],...extra}),error=>error.code==='UNSUPPORTED_SCHEMA');
   assert.throws(()=>domain.sourceCheck({...bundle.sourceCheck,...extra},bundle.manifest),error=>error.code==='UNSUPPORTED_SCHEMA');
  }
 }finally{f.dom.window.close();}
});
test('request diagnostics and editor checks derive one build label from the actual backend version',()=>{
 const ctx=vm.createContext({GSIS_DEPLOY_VERSION:'synthetic-next-release',console:{log(){}},Logger:{log(){}},CacheService:{getScriptCache:()=>({get:()=>null})}});require('./load-backend-role.cjs')(ctx,'roster');
 vm.runInContext(fs.readFileSync(root+'/backend/Roster.gs','utf8'),ctx);
 assert.equal(typeof ctx.rosterDiagnosticBuild_,'function','The build label must have one canonical source');assert.equal(ctx.rosterDiagnosticBuild_(),'synthetic-next-release-roster-diag1');
 assert.equal(ctx.showRosterDiagnostics().diagnosticBuild,'synthetic-next-release-roster-diag1');assert.match(sourceFunction('doPost'),/diagnosticBuild:rosterDiagnosticBuild_\(\)/);
});
