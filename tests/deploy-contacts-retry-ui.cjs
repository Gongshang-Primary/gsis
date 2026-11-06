'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://deploy.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.structuredClone=structuredClone;w.scrollTo=()=>{};w.alert=()=>{};
  const app=fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,'');
  w.eval(app+`\nstate={versions:[{id:'v1',name:'Plan',notes:'Saved note',loads:{},classes:[],teachers:[],groups:[],assignments:[],audit:[]}]};current='v1';role='Admin+KP';token='test';lastEmail='admin@gsps.edu.sg';tab='Versions';
  refresh=async()=>versions(el('content'));render=()=>versions(el('content'));connectionText=()=>'';
  window.requests=[];api=(action,input)=>new Promise((resolve,reject)=>requests.push({action,input,resolve,reject}));
  window.fixture={publish:async()=>{editing={expectedRevision:1,key:'meta',versionId:'v1'};return change('publish')},render:()=>versions(el('content')),retry:()=>retryContactsSync(),retryState:()=>contactsSyncRetry,setRole:value=>role=value,expire:()=>{sessionEpoch++;token='';contactsSyncRetry=null;el('status').textContent='Session expired'},clearNote:()=>{const d=versionNoteDrafts.get('v1');d.value=d.expected;},setRetry:()=>{contactsSyncRetry={versionId:'v1',publicationCommit:'commit-1',requestId:'retry-1',layoutHandoff:{status:'pending',message:'Layout pending'}};busy=false;}};versions(el('content'));`);
  const q=s=>w.document.querySelector(s),until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI condition timed out');};
  const result=status=>({saved:true,versionId:'v1',requestId:'publish-1',contactsSync:{status,publicationCommit:'commit-1',reason:status==='failed'?'Contacts busy':undefined},layoutHandoff:{status:'pending',message:'Layout pending'}});
  const publishing=w.fixture.publish();w.requests.shift().resolve(result('failed'));await publishing;
  assert.match(q('#status').textContent,/Published; Contacts not updated: Contacts busy; Layout pending/);
  let retry=q('[data-version-action="retryContacts"]');assert.equal(retry.hidden,false);
  const note=q('[data-note-input]');note.value='Keep my note';note.dispatchEvent(new w.Event('input',{bubbles:true}));retry.click();assert.equal(w.requests.length,0,'unsaved note blocks retry');assert.equal(note.value,'Keep my note');w.fixture.clearNote();
  retry.click();assert.equal(w.requests.length,1);const first=w.requests.shift();assert.equal(first.input.publicationCommit,'commit-1');first.resolve({saved:true,versionId:'v1'});await until(()=>q('#status').textContent.includes('sync not confirmed'));assert(w.fixture.retryState(),'missing outcome stays retryable');
  const wrong=w.fixture.retry(),mismatch=w.requests.shift();mismatch.resolve({...result('updated'),versionId:'different'});await wrong;assert.match(q('#status').textContent,/Contacts not updated/);assert(w.fixture.retryState());
  const again=w.fixture.retry(),second=w.requests.shift();assert.equal(second.input.requestId,first.input.requestId,'retry retains its request ID');second.resolve(result('updated'));await again;
  assert.match(q('#status').textContent,/Published; Contacts updated; Layout pending/);assert.equal(q('[data-version-action="retryContacts"]').hidden,true);
  w.fixture.setRetry();w.fixture.setRole('KP');w.fixture.render();assert.equal(q('[data-version-action="retryContacts"]').hidden,true);await w.fixture.retry();assert.equal(w.requests.length,0,'KP cannot invoke Admin retry');
  w.fixture.setRole('Admin');w.fixture.render();const stale=w.fixture.retry(),late=w.requests.shift();w.fixture.expire();late.resolve(result('updated'));await stale;assert.equal(q('#status').textContent,'Session expired');assert.equal(w.fixture.retryState(),null);
  console.log('PASS Deploy publish partial result, retry click, missing outcome, stable identity, Layout status, note guard, Admin gating and stale-session reply.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
