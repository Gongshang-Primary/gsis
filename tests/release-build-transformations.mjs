// Exercise the actual gateway routes/functions that rebuild envelopes or caches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
let failures=0,sequence=0;
async function check(name,run){try{await run();console.log('PASS',name);}catch(error){failures++;console.error('FAIL',name,error.message);}}
async function worker(file,exports=''){
 const source=fs.readFileSync(file,'utf8')+'\n// isolated transformation '+sequence+++'\n'+(exports?'export {'+exports+'};':'');
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function cache(){const entries=new Map();globalThis.caches={default:{async match(key){return entries.get(key.url)?.clone();},async put(key,value){entries.set(key.url,value.clone());}}};return entries;}
const lordEnv={LORD_BACKEND_URL:'https://script.google.com/macros/s/synthetic/exec',LORD_PROXY_SECRET:'s'.repeat(40),LORD_SESSION_SECRET:'k'.repeat(40)};
await check('Layout unchanged cursor response retains newly observed backend build',async()=>{
 const module=await worker('layout-update/public/_worker.js'),env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec',BRIDGE_SECRET:'b'.repeat(40)};
 let reads=0,build='0.9.9f';
 globalThis.fetch=async()=>{reads++;return Response.json({ok:true,gsisBuildLabel:build,data:{repository:'layout-current',schemaVersion:2,modelVersion:'1.1.0',layoutYear:2026,layoutRevision:'rev1',cursor:'rev1',venues:[],classes:[],groups:[]}});};
 cache();let result=await module.default.fetch(new Request('https://school.test/api/public/campus?year=2026'),env);
 assert.equal(result.headers.get('X-GSiS-Build-Label'),'0.9.9f');
 build='0.9.9g';cache();result=await module.default.fetch(new Request('https://school.test/api/public/campus?year=2026&since=rev1'),env);
 assert.equal(result.headers.get('X-GSiS-Build-Label'),'0.9.9g');const body=await result.json();assert.equal(body.data.unchanged,true);assert.equal(body.data.cursor,'rev1');assert.equal(reads,2);
});
await check('Calendar definite rejection keeps bounded metadata and original save outcome',async()=>{
 const module=await worker('calendar-update/public/_worker.js','proxyAppsScript');let reads=0;
 for(const build of ['0.9.9g',undefined,'9'.repeat(40)+'.9.9g','<script>']){
  globalThis.fetch=async()=>{reads++;return Response.json({ok:false,gsisBuildLabel:build,status:409,error:'Synthetic conflict',code:'CONFLICT',definite:true,current:{revision:7}});};
  const result=await module.proxyAppsScript({CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic/exec',CALENDAR_PROXY_SECRET:'s'.repeat(40)},{email:'synthetic@gsps.edu.sg'},'saveEvent',{operationId:'synthetic'});
  assert.equal(result.status,409);assert.equal(result.headers.get('X-GSiS-Build-Label'),build==='0.9.9g'?build:null);
  const body=await result.json();assert.equal(body.definite,true);assert.equal(body.code,'CONFLICT');assert.deepEqual(body.current,{revision:7});assert.equal(body.error,'Synthetic conflict');
 }
 assert.equal(reads,4,'one upstream execution per rejected operation');
});
await check('OVERLORD dashboard cache seed preserves bounded observed reference build',async()=>{
 const module=await worker('lord-suite/Source/overlord/_worker.js','proxyTransaction,proxyReference');
 for(const build of ['0.9.9g',undefined,'<script>']){
  cache();let reads=0;globalThis.fetch=async()=>{reads++;return Response.json({ok:true,gsisBuildLabel:build,cacheReloaded:true,reference:{groups:[]}});};
  await module.proxyTransaction(new Request('https://school.test/api/transaction?action=dashboard&forceRefresh=1'),{email:'synthetic@gsps.edu.sg',sub:'synthetic',isAdmin:true},lordEnv);
  const result=await module.proxyReference(lordEnv);assert.equal(result.headers.get('X-GSiS-Build-Label'),build==='0.9.9g'?build:null);
  const body=await result.json();assert.deepEqual(body.data,{groups:[]});assert.equal(body.gsisBuildLabel,build==='0.9.9g'?build:undefined);assert.equal(reads,1,'cached reference needs no metadata probe');
 }
});
for(const app of ['lord','overlord'])await check(app+' rejected reference retains observed build through outer error handler',async()=>{
 const module=await worker('lord-suite/Source/'+app+'/_worker.js','makeSessionCookie');
 const cookie=(await module.makeSessionCookie({email:'synthetic@gsps.edu.sg',sub:'synthetic',isAdmin:true,identityType:'GSPS'},lordEnv)).split(';')[0];
 for(const status of [200,503])for(const build of ['0.9.9g',undefined,'<script>']){
  cache();let reads=0;globalThis.fetch=async()=>{reads++;return Response.json({ok:false,gsisBuildLabel:build,error:'Synthetic reference rejection'},{status});};
  const result=await module.default.fetch(new Request('https://school.test/api/reference',{headers:{Cookie:cookie}}),lordEnv);
  assert.equal(result.headers.get('X-GSiS-Build-Label'),build==='0.9.9g'?build:null);const body=await result.json();assert.equal(body.ok,false);assert.equal(body.error,'Synthetic reference rejection');assert.equal(reads,1);
 }
});
assert.equal(failures,0,failures+' metadata transformation checks failed');
