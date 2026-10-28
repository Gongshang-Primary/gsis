const assert=require('node:assert/strict'),make=require('./dom-helper.cjs');
function setup(){
 const env=make(),{run,w}=env;
 run(`tab='Versions';const base=clone(v());state.versions.push({...clone(base),id:'v2',name:'Next version'},{...clone(base),id:'v3',name:'Latest version'});render();globalThis.requests=[];api=(action,input,feedback,signal)=>new Promise((resolve,reject)=>requests.push({action,input,feedback,signal,resolve,reject}));globalThis.reply=id=>({user:{email:'admin@gsps.edu.sg',roles:['Admin','KP']},versions:state.versions.map(x=>({id:x.id,name:x.name,status:x.status})),current:{...clone(base),id,name:state.versions.find(x=>x.id===id).name},revision:1});`);
 return {...env,q:s=>w.document.querySelector(s)};
}
(async()=>{
 // Accepted switches expose their destination immediately while old data is inert.
 {
  const {dom,run,q}=setup(),pending=run("loadVersionRow('v2')");
  assert.match(q('.loading-overlay[role="status"]').textContent,/Next version/);
  assert.ok(q('.loading-overlay .spinner'));
  assert.equal(q('#content').inert,true);assert.equal(q('#content').getAttribute('aria-busy'),'true');
  assert.equal(q('#nav').inert,true);assert.equal(q('#viewFilters').inert,true);assert.equal(q('#viewActions').inert,true);
  assert.equal(run('current'),'v1');assert.equal(q('#version').value,'v2');
  run("requests[0].resolve(reply('v2'))");assert.equal(await pending,true);
  assert.equal(run('current'),'v2');assert.equal(q('#version').value,'v2');assert.equal(q('.loading-overlay'),null);
  assert.notEqual(q('#content').inert,true);assert.notEqual(q('#nav').inert,true);assert.notEqual(q('#viewFilters').inert,true);assert.notEqual(q('#viewActions').inert,true);
  dom.window.close();
 }
 // Newer selection wins even if the old read completes last and ignores abort.
 {
  const {dom,run,q}=setup(),old=run("loadVersionRow('v2')"),latest=run("loadVersionRow('v3')");
  assert.equal(run('requests.length'),2);assert.equal(run('requests[0].signal.aborted'),true);
  assert.equal(q('#version').value,'v3');assert.equal(q('.loading-overlay').textContent.includes('Latest version'),true);
  run("requests[1].resolve(reply('v3'))");assert.equal(await latest,true);
  run("requests[0].resolve(reply('v2'))");assert.equal(await old,false);
  assert.equal(run('current'),'v3');assert.equal(q('#version').value,'v3');assert.equal(q('.version-load-error'),null);
  dom.window.close();
 }
 // A failed old read cannot dismiss the active loader or replace its selector.
 {
  const {dom,run,q}=setup(),old=run("loadVersionRow('v2')"),latest=run("loadVersionRow('v3')");
  run("requests[0].reject(Error('Old failed request'))");assert.equal(await old,false);
  assert.equal(q('#version').value,'v3');assert.equal(q('#content').inert,true);assert.equal(run('busy'),true);
  assert.equal(q('.version-load-error'),null);
  run("requests[1].resolve(reply('v3'))");await latest;dom.window.close();
 }
 // Failure retains current data, restores the matching selector, and offers an exact named retry.
 {
  const {dom,run,q}=setup(),pending=run("loadVersionRow('v2')");
  run("requests[0].reject(Error('Connection interrupted'))");assert.equal(await pending,false);
  assert.equal(q('#version').value,'v1');assert.equal(run('current'),'v1');assert.equal(q('.loading-overlay'),null);
  assert.notEqual(q('#content').inert,true);assert.match(q('.version-load-error').textContent,/Connection interrupted/);
  assert.match(q('.version-load-error button').textContent,/Next version/);q('.version-load-error button').click();
  assert.equal(run('requests[1].input.versionId'),'v2');assert.equal(q('.version-load-error'),null);
  run("requests[1].resolve(reply('v2'))");await new Promise(resolve=>setImmediate(resolve));
  assert.equal(q('#version').value,'v2');assert.equal(run('current'),'v2');dom.window.close();
 }
 // Draft/pending-save guards still prevent any version request or optimistic selector mismatch.
 for(const guard of ["unsavedDraft=true","cellQueue=[{operation:'draft'}]","queueFlight={}","editing='meta'","acquiring=true","busy=true","versionCreateAttempt={requestId:'pending'}","exclusionEdits.set('x',{})","versionNoteDrafts.set('v1',{value:'draft',expected:'saved'})"]){
  const {dom,run,q}=setup();run(guard);q('#version').value='v2';
  assert.equal(await run("loadVersionRow('v2')"),false,guard);assert.equal(run('requests.length'),0,guard);
  assert.equal(q('#version').value,'v1',guard);assert.equal(q('.loading-overlay'),null,guard);dom.window.close();
 }
 // Session/view changes invalidate reads even when a transport has no abort support.
 for(const change of ['sessionEpoch++','viewEpoch++']){
  const {dom,run,q}=setup(),pending=run("loadVersionRow('v2')");run(change);run("requests[0].resolve(reply('v2'))");
  assert.equal(await pending,false);assert.equal(run('current'),'v1');assert.equal(q('.loading-overlay'),null);dom.window.close();
 }
 // Aborted old transport responses must not apply API-level access/session side effects.
 for(const status of [401,403]){
  const {dom,run}=make();run('globalThis.pendingResponse=null;requestJSON=()=>new Promise(resolve=>{pendingResponse=resolve});globalThis.readController=new AbortController();');
  const pending=run("api('sync',{versionId:'v2'},false,readController.signal)");
  run(`readController.abort();pendingResponse({r:{ok:false,status:${status}},body:{ok:false,error:'Old access response'}})`);
  await assert.rejects(pending,/cancelled/);assert.equal(run('current'),'v1');assert.equal(run('token'),'test');dom.window.close();
 }
 // A mismatched successful response is a recoverable read failure, never another version's data.
 {
  const {dom,run,q}=setup(),pending=run("loadVersionRow('v2')");run("requests[0].resolve(reply('v3'))");
  assert.equal(await pending,false);assert.equal(run('current'),'v1');assert.equal(q('#version').value,'v1');
  assert.match(q('.version-load-error').textContent,/no longer available/);assert.equal(q('.loading-overlay'),null);dom.window.close();
 }
 // Background/foreground read cleanup must not unlock a still-active version overlay.
 {
  const {dom,run,q}=setup();run("var stopRefresh=beginLoading(el('content'),'Loading…')");
  const pending=run("loadVersionRow('v2')");run('stopRefresh();stopRefresh()');
  assert.equal(q('#content').inert,true);assert.equal(q('#content').getAttribute('aria-busy'),'true');
  run("requests[0].resolve(reply('v2'))");await pending;assert.notEqual(q('#content').inert,true);assert.equal(q('#content').hasAttribute('aria-busy'),false);dom.window.close();
 }
 console.log('PASS Deploy version progress, latest selection, retained drafts, error retry, stale-session protection and overlapping-loader cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
