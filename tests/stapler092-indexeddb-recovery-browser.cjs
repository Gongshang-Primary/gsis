'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),S=require('../shared/roster-stapler');
const root=path.resolve(__dirname,'..'),date='2026-10-28',owner='admin@school.test',prefix='gsis-stapler-local-v1:'+encodeURIComponent(owner)+':'+date;
const periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period})),teachers=Array.from({length:100},(_,i)=>({staffId:'staff-'+i,name:'Teacher '+i,cells:periods.map((_,p)=>p>0&&p<11?['EL','Class '+i,'Room '+i,'']:['','','',''])})),people=teachers.map(t=>({id:t.staffId,name:t.name,active:true})),plan=S.create({date,id:'baseline',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]});
const source=fs.readFileSync(path.join(root,'roster-update/public/roster-stapler-ui.js'),'utf8').replace('window.RosterStaplerUI={','window.testUI={state:()=>current,pending:()=>pending,clearPending:()=>pending=null,mark,mutate,persistDraft};window.RosterStaplerUI={');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),calls=[],accepted=new Map();let online=structuredClone(plan),lose=true;
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><main></main>'}));
 await context.exposeFunction('backend',input=>{calls.push(structuredClone(input));if(input.operation==='saveStapler'){if(!accepted.has(input.requestId)){online=structuredClone(input.plan);accepted.set(input.requestId,true);}if(lose)return {error:'Response lost',status:503};}return {data:{date:input.date,plan:{...structuredClone(online),date:input.date},revision:2,staplerRevision:2,planningAllowed:true,canEdit:true,canConfirm:true,people,accessRequests:[],currentAbsences:{date:input.date,records:[],revision:0,checkedAt:'2026-10-24T00:00:00Z'}}};});
 async function boot(page,options={}){
  await page.goto('https://roster.test/');
  await page.addScriptTag({path:path.join(root,'shared/roster-stapler.js')});await page.addScriptTag({content:source});
  await page.evaluate(async({date,owner,options})=>{
   window.readDraftDB=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('gsis-stapler-recovery',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains('drafts')){db.close();resolve([]);return;}const tx=db.transaction('drafts','readonly'),store=tx.objectStore('drafts'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>{db.close();resolve(keys.result.map((key,i)=>({key,raw:values.result[i]})));};tx.onerror=()=>reject(tx.error);};});
   if(options.pointer)sessionStorage.setItem('gsis-stapler-local-v1:'+encodeURIComponent(owner)+':'+date+':tab',options.pointer);
   if(options.legacy)localStorage.setItem(options.legacy.key,options.legacy.raw);
   if(options.blockIDB)Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){throw new DOMException('blocked by browser','SecurityError');}}});
   const native=Storage.prototype.setItem;window.restoreLocalStorage=()=>Storage.prototype.setItem=native;
   if(options.fillLS)for(let i=0;i<200;i++){try{localStorage.setItem('fixture-full-'+i,'x'.repeat(65536));}catch(error){break;}}
   if(options.silentLS)Storage.prototype.setItem=function(key,value){if(this!==localStorage)return native.call(this,key,value);};
   if(options.blockLS)Storage.prototype.setItem=function(key,value){if(this===localStorage)throw new DOMException('origin storage quota exhausted','QuotaExceededError');return native.call(this,key,value);};
   window.ctx={initialDate:options.date||date,today:()=>date,container:document.querySelector('main'),profile:{user:{email:options.owner||owner,admin:true,smc:true}},status(){},api:async(_,input)=>{if(input.operation==='saveStapler'&&!options.blockIDB)window.durableAtSend=await readDraftDB();const result=await backend(input);if(result.error)throw Object.assign(Error(result.error),{status:result.status});return result.data;}};
   await RosterStaplerUI.render(ctx);
  },{date,owner,options});
 }
 async function edit(page,value){await page.evaluate(async value=>{const s=testUI.state(),next=structuredClone(s.plan);next.tiles.find(t=>t.kind==='lesson').venue=value;testUI.mark(s,next);await testUI.persistDraft(s);},value);}
 async function save(page){await page.evaluate(()=>testUI.mutate(testUI.state(),'saveStapler',{plan:testUI.state().plan}));}
 const first=await context.newPage();await boot(first,{fillLS:true});await edit(first,'IDB recovery');await first.evaluate(()=>Promise.all([testUI.mutate(testUI.state(),'saveStapler',{plan:testUI.state().plan}),testUI.mutate(testUI.state(),'saveStapler',{plan:testUI.state().plan})]));
 assert.equal(calls.filter(c=>c.operation==='saveStapler').length,1,'full localStorage must use durable IndexedDB before first send');
 const request=calls.find(c=>c.operation==='saveStapler'),retained=await first.evaluate(()=>({key:testUI.state().draftKey,rows:durableAtSend}));
 const raw=retained.rows.find(r=>r.key===retained.key).raw,snapshot=JSON.parse(raw);assert(raw.length>1000000,'real large plan pair exceeds 1 MB');assert.equal(snapshot.pending.input.requestId,request.requestId);assert.deepEqual(snapshot.pending.draftRefs,['plan','basePlan']);
 // A true reload retains the exact uncertain request, including both plan snapshots.
 await boot(first,{blockLS:true});assert.deepEqual(await first.evaluate(()=>testUI.pending().input),request);
 // A copied session pointer is protected by transactional compare-and-fork.
 const second=await context.newPage();await boot(second,{pointer:retained.key});assert.deepEqual(await second.evaluate(()=>testUI.pending().input),request);
 await first.evaluate(()=>testUI.persistDraft(testUI.state()));const changedRaw=(await first.evaluate(()=>readDraftDB())).find(r=>r.key===retained.key).raw;
 await second.evaluate(()=>testUI.persistDraft(testUI.state()));const secondKey=await second.evaluate(()=>testUI.state().draftKey);assert.notEqual(secondKey,retained.key);assert.equal((await second.evaluate(()=>readDraftDB())).find(r=>r.key===retained.key).raw,changedRaw,'other tab cannot overwrite the first draft');
 lose=false;await save(first);assert.equal(calls.filter(c=>c.operation==='saveStapler').at(-1).requestId,request.requestId);const after=await first.evaluate(()=>readDraftDB());assert(!after.some(r=>r.key===retained.key),'acknowledgement removes its exact own recovery record');assert(after.some(r=>r.key===secondKey),'acknowledgement preserves the other tab fork');
 // Both storage engines unavailable: no mutation dispatch, useful diagnostics, downloadable exact snapshot.
 await first.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fixture-full-')).forEach(k=>localStorage.removeItem(k)));
 const blocked=await context.newPage();await boot(blocked,{blockLS:true,blockIDB:true});await edit(blocked,'Unsaved export');const before=calls.length;await save(blocked);assert.equal(calls.length,before);assert.equal(await blocked.evaluate(()=>testUI.pending()),null);assert.equal(await blocked.evaluate(()=>testUI.state().dirty),true);assert.match(await blocked.locator('[data-stapler-message]').innerText(),/not sent/);assert.match(await blocked.locator('[data-editing-lock]').innerText(),/IndexedDB.*SecurityError.*localStorage.*QuotaExceededError/);
 const downloadEvent=blocked.waitForEvent('download');await blocked.locator('[data-export-recovery]').click();const download=await downloadEvent,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.plan.tiles.find(t=>t.kind==='lesson').venue,'Unsaved export');assert.equal(exported.owner,owner);assert.equal(exported.date,date);
 // Old drafts survive a failed migration and remain recoverable with their exact pending identity.
 const legacyKey=prefix+':legacy',legacy=JSON.stringify({...snapshot,schema:1,pending:{owner,input:request},writer:'old-browser',savedAt:Date.now()});
 const migrationFail=await context.newPage();await boot(migrationFail,{pointer:legacyKey,legacy:{key:legacyKey,raw:legacy},blockIDB:true,blockLS:true});assert.deepEqual(await migrationFail.evaluate(()=>testUI.pending().input),request);assert.equal(await migrationFail.evaluate(key=>localStorage.getItem(key),legacyKey),legacy);
 // Successful migration uses committed and re-read IDB data before removing the old copy.
 const migrated=await context.newPage();await boot(migrated,{pointer:legacyKey});assert.deepEqual(await migrated.evaluate(()=>testUI.pending().input),request);const migratedKey=await migrated.evaluate(()=>testUI.state().draftKey);assert((await migrated.evaluate(()=>readDraftDB())).some(r=>r.key===migratedKey));assert.equal(await migrated.evaluate(key=>localStorage.getItem(key),legacyKey),null);
 // A different account must never offer or restore this account's drafts.
 const other=await context.newPage();await boot(other,{owner:'other@school.test'});assert.equal(await other.evaluate(()=>testUI.pending()),null);assert.equal(await other.locator('[data-recover-draft]').count(),0);
 const otherDate=await context.newPage();await boot(otherDate,{date:'2026-10-29'});assert.equal(await otherDate.evaluate(()=>testUI.pending()),null);assert.equal(await otherDate.locator('[data-recover-draft]').count(),0);
 // A silent write failure cannot qualify as durable recovery.
 const silent=await context.newPage();await boot(silent,{blockIDB:true,silentLS:true});await edit(silent,'Silently lost');const silentBefore=calls.length;await save(silent);assert.equal(calls.length,silentBefore);assert.match(await silent.locator('[data-editing-lock]').innerText(),/read-back did not match/);
 // A readable localStorage fallback is used when IndexedDB is denied.
 const fallback=await context.newPage();await boot(fallback,{blockIDB:true});await edit(fallback,'Fallback');await save(fallback);assert.equal(await fallback.evaluate(()=>testUI.pending()),null);assert(calls.some(c=>c.operation==='saveStapler'&&c.plan.tiles.find(t=>t.kind==='lesson').venue==='Fallback'));
 const abandoned=await context.newPage();await boot(abandoned);await edit(abandoned,'Leave before send');const abandonBefore=calls.length;await abandoned.evaluate(async()=>{const s=testUI.state(),saving=testUI.mutate(s,'saveStapler',{plan:s.plan});RosterStaplerUI.unmount();await saving;await s.storageQueue;});assert.equal(calls.length,abandonBefore,'leaving during recovery persistence cannot dispatch an old-context mutation');
 console.log('PASS native IndexedDB: >1 MB snapshot, localStorage quota, exact reload/retry, atomic tab fork, owned ack cleanup, both-store no-send, JSON export, migration and account isolation');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
