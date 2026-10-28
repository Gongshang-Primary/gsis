const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const app=fs.readFileSync('public/app.js','utf8');
const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main'),requests=[];
const ctx={document:dom.window.document,queueMicrotask,console,current:'a',sessionEpoch:1,tab:'Audit',token:'session',allowed:true,
 admin:()=>ctx.allowed,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 button:(text,fn,disabled)=>{const b=dom.window.document.createElement('button');b.textContent=text;b.onclick=fn;b.disabled=!!disabled;return b;},
 table:(headers,rows)=>'<table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>',
 api:(action,input)=>new Promise((resolve,reject)=>requests.push({action,input,resolve,reject})),
 render:()=>{root.replaceChildren();vm.runInContext('audit(root)',ctx)},root};
vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('let auditState=null;'),app.indexOf("document.querySelector('#version').onchange")),ctx);
const run=s=>vm.runInContext(s,ctx),tick=()=>new Promise(r=>setImmediate(r));
const event=id=>({id,at:'2026-09-28',actor:'test@gsps.edu.sg',action:'Save',row:2,epoch:'epoch'});
const page=id=>({events:[event(id)],total:2,cursor:'older'});
(async()=>{
 const first=run('loadAuditPage(true)');assert.equal(requests.length,1);
 await run('loadAuditPage(true)');assert.equal(requests.length,1,'deduplicate same-version requests');
 ctx.current='b';const second=run('loadAuditPage(true)');assert.equal(requests.length,2,'new version must load while old request is pending');
 requests[1].resolve(page('b-event'));await second;requests[0].resolve(page('a-event'));await first;
 assert.equal(run('auditState.events[0].id'),'b-event');assert.match(root.textContent,/Showing 1 of 2/);
 // Details remain lazy and a rerender while loading reuses the same request.
 assert.equal(requests.length,2);let details=root.querySelector('details');details.open=true;const detail=details.ontoggle();assert.equal(requests.length,3);
 ctx.render();details=root.querySelector('details');details.open=true;const repeated=details.ontoggle();assert.equal(requests.length,3,'same detail must not be fetched twice');
 requests[2].resolve({event:{before:'before',after:'after'}});await Promise.all([detail,repeated]);
 ctx.render();details=root.querySelector('details');details.open=true;await details.ontoggle();assert.equal(requests.length,3);assert.match(details.textContent,/after/);
 // Refresh keeps readable summaries while waiting; a failed refresh retains them.
 const refresh=run('loadAuditPage(true)');assert.match(root.textContent,/Save/);requests[3].reject(Error('Offline'));await refresh;
 assert.equal(run('auditState.events.length'),1);assert.match(root.textContent,/Offline/);
 const older=run('loadAuditPage(false)');assert.equal(requests[4].input.cursor,'older');requests[4].resolve({events:[event('older-event')],total:2,cursor:null});await older;
 assert.equal(run('auditState.events.length'),2);
 // A new authenticated session cannot reuse the previous account's audit state.
 ctx.sessionEpoch++;ctx.render();await tick();assert.equal(requests.length,6);assert.doesNotMatch(root.textContent,/test/);
 requests[5].resolve(page('new-session'));await tick();assert.equal(run('auditState.events[0].id'),'new-session');
 const reset=run('loadAuditPage(true)');ctx.allowed=false;ctx.render();requests[6].resolve(page('revoked'));await reset;
 assert.match(root.textContent,/Admin only/);assert.equal(run('auditState'),null);
 console.log('PASS Audit version switch, session isolation, stale response, request deduplication, lazy/reused details, preserved refresh rows, pagination and permission loss.');
 dom.window.close();
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1});
