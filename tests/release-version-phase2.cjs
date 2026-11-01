'use strict';
// Missing/incorrect envelope metadata, forged gateway labels, or a blocking notice
// must fail independently of the unchanged 0.9.9 protocol/version checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const {JSDOM}=require('jsdom'),label=require('../package.json').gsisBuildLabel;
const read=file=>fs.readFileSync(file,'utf8');
let failures=0;
function check(name,run){try{run();console.log('PASS',name);}catch(error){failures++;console.error('FAIL',name,error.message);}}
function functions(file,names,extra={}){
 const source=read(file),nodes=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}).body;
 const declarations=nodes.filter(node=>node.type==='FunctionDeclaration'&&names.includes(node.id.name)||node.type==='VariableDeclaration'&&node.declarations.some(item=>names.includes(item.id.name)));
 const stamp=source.match(/(?:const|var) GSIS_BUILD_LABEL\s*=\s*['"]([^'"]+)['"]/);
 const scope={Response,Headers,Date,console:{info(){}},GSIS_BUILD_LABEL:stamp?.[1],deployTrace_:null,contactTrace_:null,contactRequestEpoch_:null,rosterStage_(){},ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},...extra};
 vm.createContext(scope);vm.runInContext(declarations.map(node=>source.slice(node.start,node.end)).join('\n'),scope);return scope;
}
for(const [file,name] of [['backend/Code.gs','out_'],['Contacts_Code.gs','reply_'],['calendar-backend/Code.gs','jsonOutput_'],['venues-backend/Code.gs','venuesJson_'],['lord-suite/Source/backend/Code.gs','jsonResponse_'],['lord-suite/Source/backend/Code.gs','referenceJsonResponse_']])check(file+' '+name+' stamps success and failure',()=>{
 const scope=functions(file,[name]);
 for(const payload of [{ok:true,data:{version:'0.9.9',saved:true,requestId:'retained-id'}},{ok:false,status:409,code:'CONFLICT',error:'Retain this proposal.'}]){
  const result=JSON.parse(scope[name](structuredClone(payload)).text);
  assert.equal(result.gsisBuildLabel,label,'JSON envelope identifies the executing backend');
  const {gsisBuildLabel,...original}=result;assert.deepEqual(original,payload,'metadata preserves all original result/error fields');
 }
});
for(const folder of Object.values(require('../release-installation-manifest.json').frontends))check(folder+' gateway retains observed backend label',()=>{
 const scope=functions(folder+'/_worker.js',['json','gsisBuildHeaders','gsisBuildMetadata']);
 for(const payload of [{ok:true,gsisBuildLabel:'0.9.9e',data:{version:'0.9.9',saved:true}},{ok:false,gsisBuildLabel:'0.9.9e',code:'SAVE_UNKNOWN'}]){
  const response=scope.json(payload,payload.ok?200:503);
  assert.equal(response.headers.get('X-GSiS-Build-Label'),'0.9.9e','upstream label must survive a newer gateway');
  assert.equal(response.headers.get('X-GSiS-Worker-Build-Label'),label,'gateway identifies itself separately');
 }
 for(const gsisBuildLabel of [undefined,'<img src=x onerror=alert(1)>','0.9.9e\r\nInjected: true'])assert.equal(scope.json({ok:true,...(gsisBuildLabel===undefined?{}:{gsisBuildLabel})}).headers.get('X-GSiS-Build-Label'),null,'unknown/invalid backend is never replaced by the gateway build');
});
function page(pageLabel='0.9.9f'){
 const dom=new JSDOM('<!doctype html><head><meta name="gsis-build-label" content="'+pageLabel+'"></head><body><button id="save">Save</button><main>Draft retained</main></body>',{url:'https://school.test',runScripts:'outside-only'});
 const file='shared/version-notice.js';assert.ok(fs.existsSync(file),'shared notice helper exists');dom.window.eval(read(file));return dom;
}
check('notice compares bounded metadata, leaves saves and body untouched',()=>{
 const dom=page(),w=dom.window;let saved=0;w.document.getElementById('save').onclick=()=>saved++;
 const response={headers:new Headers({'X-GSiS-Build-Label':'0.9.9g'}),json(){assert.fail('metadata must not parse payload');},clone(){assert.fail('metadata must not clone payload');}};
 assert.equal(w.GSISversionNotice(response),response);
 const notice=w.document.getElementById('gsis-version-notice');assert.ok(notice);
 assert.equal(notice.textContent,'This page is v0.9.9f; the server is v0.9.9g. Press Ctrl+Shift+R to refresh.');
 assert.equal(notice.getAttribute('role'),'status');assert.equal(notice.getAttribute('aria-live'),'polite');assert.equal(w.document.body.firstElementChild,notice);
 w.document.getElementById('save').click();assert.equal(saved,1);assert.equal(w.document.querySelector('main').textContent,'Draft retained');
 w.GSISversionNotice({headers:new Headers()});assert.equal(w.document.getElementById('gsis-version-notice'),notice,'unknown metadata cannot clear a known mismatch');
 w.GSISversionNotice({headers:new Headers({'X-GSiS-Build-Label':'0.9.9f'})});assert.equal(w.document.getElementById('gsis-version-notice'),null,'equal build clears the notice');dom.window.close();
});
check('missing/malformed metadata and notice DOM failures never block requests',()=>{
 const dom=page(),w=dom.window;
 for(const value of ['', '0.9.9f<script>alert(1)</script>', 'v0.9.9g', 'x'.repeat(100), '1'.repeat(90)+'.9.9g']){
  const response={headers:new Headers(value?{'X-GSiS-Build-Label':value}:{})};assert.equal(w.GSISversionNotice(response),response);assert.equal(w.document.getElementById('gsis-version-notice'),null);
 }
 const response={headers:new Headers({'X-GSiS-Build-Label':'0.9.9g'})};w.document.createElement=()=>{throw Error('DOM unavailable');};assert.equal(w.GSISversionNotice(response),response);dom.window.close();
});
check('Layout public sanitization retains actual backend label',()=>{
 const scope=functions('layout-update/public/_worker.js',['publicObject','publicPick','publicCounts','publicPublication','publicSnapshot','gsisBuildMetadata'],{PUBLIC_FIELDS:['repository','schemaVersion','modelVersion','layoutYear','layoutRevision','cursor','venues','classes','groups']});
 const data={repository:'layout-current',schemaVersion:2,modelVersion:'1.1.0',layoutYear:2026,layoutRevision:'rev1',cursor:'rev1',venues:[],classes:[],groups:[]};
 assert.equal(scope.publicSnapshot({ok:true,gsisBuildLabel:'0.9.9e',data},2026).gsisBuildLabel,'0.9.9e');
 assert.equal(scope.publicSnapshot({ok:true,data},2026).gsisBuildLabel,undefined);
});
check('Roster sanitized backend failures retain observed build',()=>{
 const scope=functions('roster-update/public/_worker.js',['json','gsisBuildHeaders','gsisBuildMetadata','rosterBackendFailure','rosterFailure'],{safeHealthError:()=>({backendVersion:'0.9.9'}),console:{error(){}}});
 const response=scope.rosterFailure('rosterOperations','synthetic-id',{operation:'read',gsisBuildLabel:'0.9.9e',code:'BACKEND_ERROR',error:'private raw data'});
 assert.equal(response.headers.get('X-GSiS-Build-Label'),'0.9.9e');
});
assert.equal(failures,0,failures+' build metadata/notice checks failed');
