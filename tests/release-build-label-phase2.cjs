'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(p,'utf8'),label=require('../package.json').gsisBuildLabel;
const source=read('shared/release-notice.js');
const folders=Object.values(require('../release-installation-manifest.json').frontends);
for(const folder of folders){
 const doc=new JSDOM(read(folder+'/index.html')).window.document;
 assert.equal(doc.querySelector('meta[name="gsis-build-label"]')?.content,label,folder);
 assert(doc.querySelector('script[src*="gsis-version.js"]'),folder+' notice script');
 assert.equal(read(folder+'/gsis-version.js'),source);
}
for(const file of ['backend/Code.gs','Contacts_Code.gs','calendar-backend/Code.gs','venues-backend/Code.gs','lord-suite/Source/backend/Code.gs']){
 const code=read(file),block=code.match(/\/\* GSIS_BUILD_LABEL_BEGIN \*\/([\s\S]*?)\/\* GSIS_BUILD_LABEL_END \*\//);
 assert(block,file+' stamped backend');
 const scope=vm.createContext({});
 vm.runInContext(block[1],scope);
 const result=vm.runInContext('gsisBuildLabelPayload_({ok:true,data:{revision:8}})',scope);
 assert.equal(result.buildLabel,label);assert.equal(result.data.revision,8);
 assert(code.includes('gsisBuildLabelPayload_('),file);
}
async function notice(body,url='/api/read',headers={}){
 const dom=new JSDOM('<meta name="gsis-build-label" content="0.9.9b"><body><main>usable</main>',{url:'https://school.invalid',runScripts:'outside-only'});
 let clones=0;dom.window.fetch=async()=>{const response=new Response(JSON.stringify(body),{headers:{'content-type':'application/json',...headers}}),clone=response.clone.bind(response);response.clone=()=>{clones++;return clone();};return response;};
 dom.window.eval(source);const response=await dom.window.fetch(url);
 assert.deepEqual(await response.json(),body);
 await new Promise(resolve=>setTimeout(resolve,10));
 if(headers['X-GSiS-Build-Label'])assert.equal(clones,0,'build header avoids a second JSON parse');
 return dom;
}

function controlledNotice(){
 const dom=new JSDOM('<meta name="gsis-build-label" content="0.9.9b"><body><main>usable</main>',{url:'https://school.invalid',runScripts:'outside-only'}),pending=[];
 dom.window.fetch=input=>new Promise(resolve=>pending.push({input,resolve}));
 dom.window.eval(source);
 const respond=(index,body)=>pending[index].resolve(new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}}));
 return {dom,pending,respond};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function checkNoticeOrdering(){
 const c=controlledNotice();
 const first=c.dom.window.fetch('/api/roster'),second=c.dom.window.fetch('/api/roster');
 c.respond(1,{ok:true,buildLabel:'0.9.9b'});await second;await tick();
 c.respond(0,{ok:true,buildLabel:'0.9.9c'});await first;await tick();
 assert(!c.dom.window.document.querySelector('#gsis-version-notice'),'older mismatch response cannot override the newer matching response');
 const third=c.dom.window.fetch('/api/roster');c.respond(2,{ok:true,buildLabel:'0.9.9c'});await third;await tick();
 const other=c.dom.window.fetch('/api/contacts');c.respond(3,{ok:true,buildLabel:'0.9.9b'});await other;await tick();
 assert(c.dom.window.document.querySelector('#gsis-version-notice'),'matching Contacts cannot clear a Roster mismatch');
 const fourth=c.dom.window.fetch('/api/roster');c.respond(4,{ok:true,buildLabel:'0.9.9b'});await fourth;await tick();
 assert(!c.dom.window.document.querySelector('#gsis-version-notice'),'matching response from the same endpoint clears its mismatch');
 const beforeBody=controlledNotice();beforeBody.dom.window.document.body.remove();
 const read=beforeBody.dom.window.fetch('/api/roster');beforeBody.respond(0,{ok:true,buildLabel:'0.9.9c'});await read;await tick();
 const body=beforeBody.dom.window.document.createElement('body');beforeBody.dom.window.document.documentElement.append(body);
 beforeBody.dom.window.document.dispatchEvent(new beforeBody.dom.window.Event('DOMContentLoaded'));await tick();
 assert(beforeBody.dom.window.document.querySelector('#gsis-version-notice'),'early mismatch survives until document.body exists');
}

(async()=>{
 await checkNoticeOrdering();
 require('child_process').execFileSync('python3',['tests/release-build-label-phase2.py'],{stdio:'inherit'});
 for(const worker of ['notification-worker/dashboard-worker.mjs','operations-worker/dashboard-worker.mjs','calendar-job-worker/dashboard-worker.mjs']){
  const mod=await import(pathToFileURL(path.resolve(worker))),r=await mod.default.fetch(new Request('https://worker.invalid/health'),{});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,version:label});
 }
 let d=await notice({ok:true,buildLabel:'0.9.9c',data:{revision:4}});
 assert.equal(d.window.document.querySelector('#gsis-version-notice')?.textContent,'This page is v0.9.9b; the server is v0.9.9c. Press Ctrl+Shift+R to refresh.');
 assert.equal(d.window.document.querySelector('main').textContent,'usable');
 for(const body of [{ok:true,buildLabel:'0.9.9b'},{ok:true,backendVersion:'0.9.9c'},{ok:true,buildLabel:'<script>bad</script>'},{ok:true}]){
  d=await notice(body);assert(!d.window.document.querySelector('#gsis-version-notice'));
 }
 d=await notice({ok:true,buildLabel:'0.9.9c'},'https://external.invalid/api/read');assert(!d.window.document.querySelector('#gsis-version-notice'));
 d=await notice({ok:true},'/api/read',{'X-GSiS-Build-Label':'0.9.9c'});assert(d.window.document.querySelector('#gsis-version-notice'));
 console.log('PASS separate build labels, safe Worker health and nonblocking mismatch notice');
})().catch(e=>{console.error(e);process.exitCode=1});
