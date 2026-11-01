import assert from 'node:assert/strict';
import fs from 'node:fs';
const label=JSON.parse(fs.readFileSync('package.json')).gsisBuildLabel;
const env={LORD_BACKEND_URL:'https://script.google.com/macros/s/synthetic/exec',LORD_PROXY_SECRET:'s'.repeat(40)};
let failures=0;
for(const app of ['lord','overlord','starlord']){
 try{
  const records=new Map();globalThis.caches={default:{async match(key){return records.get(key.url)?.clone();},async put(key,response){records.set(key.url,response.clone());}}};
  let reads=0;globalThis.fetch=async()=>{reads++;return Response.json({ok:true,gsisBuildLabel:'0.9.9e',generatedAt:'synthetic',data:{groups:[]},bookings:[]});};
  const source=fs.readFileSync('lord-suite/Source/'+app+'/_worker.js','utf8')+(app==='starlord'?'':'\nexport {proxyReference};');
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const load=()=>app==='starlord'?module.default.fetch(new Request('https://school.test/api/board?date=2026-11-02'),env):module.proxyReference(env);
  let result=await load();assert.equal(result.headers.get('X-GSiS-Build-Label'),'0.9.9e','live observed build survives '+app+' direct Response');
  assert.equal(result.headers.get('X-GSiS-Worker-Build-Label'),label);assert.equal((await result.json()).gsisBuildLabel,'0.9.9e');
  for(const [key,response]of records){const headers=new Headers(response.headers);headers.set('X-GSiS-Worker-Build-Label','0.9.9d');records.set(key,new Response(await response.text(),{headers}));}
  result=await load();assert.equal(reads,1,'fresh cached read makes no extra backend metadata call');assert.equal(result.headers.get('X-GSiS-Build-Label'),'0.9.9e');
  assert.equal(result.headers.get('X-GSiS-Worker-Build-Label'),label,'cached old Worker header cannot impersonate the executing gateway');
  assert.equal((await result.json()).gsisBuildLabel,'0.9.9e','sanitized cached envelope retains actual label');
  if(app!=='starlord'){
   for(const [key,response]of records){const headers=new Headers(response.headers);headers.set(app==='lord'?'X-LORD-Fetched-At':'X-OVERLORD-Fetched-At',String(Date.now()-120000));records.set(key,new Response(await response.text(),{headers}));}
   globalThis.fetch=async()=>{throw Error('synthetic outage');};result=await load();assert.equal(result.headers.get('X-GSiS-Build-Label'),'0.9.9e','stale fallback retains observed cached build');
  }
  console.log('PASS',app,'live/fresh/stale metadata without extra upstream reads');
 }catch(error){failures++;console.error('FAIL',app,error.message);}
}
assert.equal(failures,0,failures+' cached gateway metadata checks failed');
