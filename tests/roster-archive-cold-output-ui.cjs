'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),test=require('node:test'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
const archiveRef={month:'2026-08',collection:'outbox',id:'old-message',digest:'a'.repeat(64)};
const settled=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
async function setup(options={}){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval(source);
 const user={staffId:'admin',email:'admin@test.invalid',admin:true,smc:true},storage={total:16000000,limit:24000000,collections:[{name:'outbox',chars:2000000,items:50}],audit:[],outbox:[]};
 const ref=options.scheduleReceipt?{...archiveRef,collection:'scheduleReceipts',id:'2026-08-15T16:00'}:archiveRef;
 let archive={months:[{month:'2026-08',count:12,characters:1234567}],lastRun:{at:'2026-10-30T14:00:00Z',moved:12,characters:1234567}},failed=false;
 const view=()=>({date:'2026-10-31',today:'2026-10-31',revision:3,user,storage,archive});
 const api=async(route,p)=>{
  calls.push(JSON.parse(JSON.stringify(p)));
  if(p.operation==='read')return view();
  if(p.operation==='archiveColdOutput'){
   if(options.failOnce&&!failed){failed=true;throw Error('Archive confirmation unavailable.');}
   if(options.unconfirmed&&!failed){failed=true;return {accepted:true};}
   storage.total=14000000;archive={...archive,lastRun:{at:'2026-10-31T04:00:00Z',moved:20,characters:2000000}};
   return {revision:4,archive};
  }
  if(p.operation==='archiveItems')return {month:p.month,items:[{id:ref.id,collection:ref.collection,date:'2026-08-15',kind:'smc_report',status:'sent',archiveRef:ref}],nextOffset:options.pages&&!p.offset?50:null};
  if(p.operation==='archivedItem'){
   if(options.itemFailure)throw Error('Archive could not be verified.');
   return {archiveRef:options.wrongDigest?{...ref,digest:'b'.repeat(64)}:ref,item:options.scheduleReceipt?{slot:'2026-08-15T16:00',complete:true}:{id:ref.id,kind:'smc_report',date:'2026-08-15',status:'sent',data:{text:'Original <private> message'},secret:'<script>bad()</script>'}};
  }
  throw Error('Unexpected operation '+p.operation);
 };
 await w.RosterOpsUI.render('Prune records',{profile:{user},today:()=>view().today,container:w.document.getElementById('content'),status(){},api});
 await settled();return {dom,w,doc:w.document,calls,api};
}
test('Storage is Admin only and opens a read-only report without prune controls',async()=>{
 const {dom,w,doc,calls}=await setup();try{
  const page=w.RosterOpsUI.pages({user:{admin:true}}).find(p=>p.name==='Prune records');
  assert.equal(page.label,'Storage');assert(!w.RosterOpsUI.pages({user:{smc:true}}).some(p=>p.name==='Prune records'));
  assert.match(doc.querySelector('h2').textContent,/Storage/);
  assert(doc.querySelector('[data-archive-now]'));
  assert.match(doc.querySelector('[data-archive-months]').textContent,/2026-08/);
  assert.match(doc.querySelector('[data-archive-last-run]').textContent,/12/);
  assert.equal(doc.querySelector('[data-prune-form]'),null);
  assert.equal(calls.some(p=>p.operation!=='read'),false);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('Archive now confirms retained records, executes once and refreshes the storage report',async()=>{
 const {dom,w,doc,calls}=await setup();try{
  doc.querySelector('[data-archive-now]').click();
  assert.equal(calls.some(p=>p.operation==='archiveColdOutput'),false);
  assert.match(doc.querySelector('dialog').textContent,/30 days/);
  assert.match(doc.querySelector('dialog').textContent,/kept|retained|remain/);
  doc.querySelector('[data-confirm-archive]').click();await settled();
  assert.equal(calls.filter(p=>p.operation==='archiveColdOutput').length,1);
  assert.match(doc.querySelector('.ops-storage').textContent,/14,000,000/);
  assert.equal(doc.querySelector('dialog'),null);
  assert.equal(calls.some(p=>p.operation==='prune'),false);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('An uncertain archive retry retains its request identity and current report',async()=>{
 const {dom,w,doc,calls}=await setup({failOnce:true});try{
  doc.querySelector('[data-archive-now]').click();doc.querySelector('[data-confirm-archive]').click();await settled();
  assert.match(doc.querySelector('.ops-storage').textContent,/16,000,000/);
  const first=calls.find(p=>p.operation==='archiveColdOutput');assert(first?.requestId);
  const retry=doc.querySelector('[data-retry-save]');assert(retry,'uncertain archive has the standard retry action');retry.click();await settled();
  const requests=calls.filter(p=>p.operation==='archiveColdOutput');assert.equal(requests.length,2);assert.equal(requests[1].requestId,first.requestId);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('Monthly records open the exact archived copy as escaped text',async()=>{
 const {dom,w,doc,calls}=await setup();try{
  doc.querySelector('[data-archive-month]').click();await settled();
  assert.match(doc.querySelector('dialog').textContent,/smc_report/);
  doc.querySelector('[data-open-archive]').click();await settled();
  assert.deepEqual(calls.find(p=>p.operation==='archivedItem').archiveRef,archiveRef);
  assert.match(doc.querySelector('[data-archived-content]').textContent,/Original <private> message/);
  assert.equal(doc.querySelector('[data-archived-content] script'),null);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('An unreadable archive stays visible with a retry action and no invented body',async()=>{
 const {dom,w,doc}=await setup({itemFailure:true});try{
  doc.querySelector('[data-archive-month]').click();await settled();doc.querySelector('[data-open-archive]').click();await settled();
  assert.match(doc.querySelector('dialog').textContent,/could not be verified/);
  assert(doc.querySelector('[data-retry-archive-item]'));
  assert.equal(doc.querySelector('[data-archived-content]'),null);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('Archive metadata pages append without repeating the first request',async()=>{
 const {dom,w,doc,calls}=await setup({pages:true});try{
  doc.querySelector('[data-archive-month]').click();await settled();
  const more=doc.querySelector('[data-more-archive]');assert.equal(more.hidden,false);more.click();await settled();
  assert.deepEqual(calls.filter(p=>p.operation==='archiveItems').map(p=>[p.offset,p.limit]),[[0,50],[50,50]]);
  assert.equal(doc.querySelectorAll('[data-open-archive]').length,2);assert.equal(more.hidden,true);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('A mismatched archived version is refused before displaying a body',async()=>{
 const {dom,w,doc}=await setup({wrongDigest:true});try{
  doc.querySelector('[data-archive-month]').click();await settled();doc.querySelector('[data-open-archive]').click();await settled();
  assert.match(doc.querySelector('dialog').textContent,/could not be verified/);
  assert.equal(doc.querySelector('[data-archived-content]'),null);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('A transport acknowledgement does not claim that archiving completed',async()=>{
 const {dom,w,doc,calls}=await setup({unconfirmed:true});try{
  doc.querySelector('[data-archive-now]').click();doc.querySelector('[data-confirm-archive]').click();await settled();
  assert(doc.querySelector('[data-retry-save]'),'retain the unconfirmed archive command');
  assert.doesNotMatch(doc.querySelector('[data-ops-message]').textContent,/Archive complete\./);
  doc.querySelector('[data-retry-save]').click();await settled();
  const commands=calls.filter(p=>p.operation==='archiveColdOutput');assert.equal(commands.length,2);assert.equal(commands[0].requestId,commands[1].requestId);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
test('A scheduled receipt without an embedded id opens through its verified archive reference',async()=>{
 const {dom,w,doc,calls}=await setup({scheduleReceipt:true});try{
  doc.querySelector('[data-archive-month]').click();await settled();doc.querySelector('[data-open-archive]').click();await settled();
  assert.equal(calls.find(p=>p.operation==='archivedItem').archiveRef.collection,'scheduleReceipts');
  assert.match(doc.querySelector('[data-archived-content]')?.textContent||'',/2026-08-15T16:00/);
 }finally{w.RosterOpsUI.unmount();dom.window.close();}
});
