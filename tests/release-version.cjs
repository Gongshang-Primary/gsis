'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(p,'utf8');
const version=read('scripts/package-099-suite.py').match(/^VERSION = '([^']+)'/m)[1];
assert.match(version,/^0[.]9[.]9[b-z]$/,'harmonised letter release');
const spec=JSON.parse(read('release-installation-manifest.json'));
for(const folder of Object.values(spec.frontends)){
 const doc=new JSDOM(read(folder+'/index.html')).window.document;
 assert.equal(doc.querySelector('meta[name="gsis-version"]')?.content,version,folder);
 assert(doc.querySelector('[data-gsis-release]')?.textContent.includes('v'+version),folder+' header label');
 for(const el of doc.querySelectorAll('script[src],link[rel="stylesheet"]')){
  const value=el.getAttribute('src')||el.getAttribute('href');
  if(value.startsWith('http:')||value.startsWith('https:')||value.startsWith('//'))continue;
  assert.equal(new URL(value,'https://school.invalid').searchParams.get('v'),version,value);
 }
 assert.equal(read(folder+'/gsis-version.js'),read('shared/release-notice.js'),folder+' notice parity');
}
async function notice(body,headers={}){
 const dom=new JSDOM('<meta name="gsis-version" content="'+version+'"><body><main>usable</main>',{url:'https://school.invalid',runScripts:'outside-only'});
 dom.window.fetch=async()=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json',...headers}});
 dom.window.eval(read('shared/release-notice.js'));
 const response=await dom.window.fetch('/api/read');
 assert.deepEqual(await response.json(),body,'notice never consumes or changes caller response');
 await new Promise(resolve=>setTimeout(resolve,10));
 return dom.window.document;
}
(async()=>{
 require('child_process').execFileSync('python3',['tests/release-version.py'],{stdio:'inherit'});
 for(const worker of ['notification-worker/dashboard-worker.mjs','operations-worker/dashboard-worker.mjs','calendar-job-worker/dashboard-worker.mjs']){
  const module=await import(require('node:url').pathToFileURL(require('node:path').resolve(worker)));
  const response=await module.default.fetch(new Request('https://school.invalid/health'),{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,version},worker);
 }
 const doc=await notice({ok:true,backendVersion:'0.9.9c',data:{revision:4}});
 assert.equal(doc.querySelector('#gsis-version-notice')?.textContent,'This page is v0.9.9b; the server is v0.9.9c. Press Ctrl+Shift+R to refresh.');
 assert.equal(doc.querySelector('main').textContent,'usable');
 assert(!await notice({ok:true,backendVersion:version}).then(d=>d.querySelector('#gsis-version-notice')));
 assert(!await notice({version:'0.9.9c'}).then(d=>d.querySelector('#gsis-version-notice')),'business version is not a release');
 assert(!await notice({backendVersion:'<script>bad</script>'}).then(d=>d.querySelector('#gsis-version-notice')));
 console.log('PASS release label parity and nonblocking mismatch notice');
})().catch(e=>{console.error(e);process.exitCode=1});
