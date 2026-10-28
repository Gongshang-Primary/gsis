const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {worker,browser,base,storage,response,deferred,read,fresh,staff}=require('./frontend_harness.cjs');
const results=[];
const plain=x=>JSON.parse(JSON.stringify(x));
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
const tick=()=>new Promise(setImmediate);

function draftFixture(){
  const h={records:new Map(),local:storage(),failWrites:false,failReads:false,blocked:false};
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(store,mode){
    const tx={error:null};
    function op(kind,value,key){
      const req={};
      queueMicrotask(()=>{
        if((mode==='readwrite'&&h.failWrites)||(mode==='readonly'&&h.failReads)){
          tx.error=new Error('Injected quota or database failure');if(tx.onabort)tx.onabort();return;
        }
        if(kind==='put')h.records.set(key,structuredClone(value));
        if(kind==='delete')h.records.delete(key);
        req.result=kind==='get'?structuredClone(h.records.get(key)):key;
        if(req.onsuccess)req.onsuccess();queueMicrotask(()=>{if(tx.oncomplete)tx.oncomplete();});
      });
      return req;
    }
    tx.objectStore=()=>({put:(v,k)=>op('put',v,k),get:k=>op('get',null,k),delete:k=>op('delete',null,k)});
    return tx;
  }};
  h.ctx=vm.createContext({...base(),structuredClone,localStorage:h.local,indexedDB:{open(){const req={result:db};queueMicrotask(()=>{if(h.blocked){req.onblocked();return;}req.onsuccess();});return req;}}});
  vm.runInContext(read('lord/assets/drafts.js'),h.ctx);h.store=h.ctx.LordDraftStore;
  return h;
}

(async()=>{
 await test('LORD starts with all constants initialized and reaches authenticated landing',async()=>{
   const calls=[];const h=browser('lord',{start:true,fetch:async url=>{calls.push(url);return response(url==='/api/auth/session'?{ok:true,authenticated:true,session:staff}:{ok:true,data:fresh});}});
   await h.ctx.started;assert(calls.includes('/api/auth/session'));assert(calls.includes('/api/reference'));assert.match(h.nodes.main.innerHTML,/Book Devices/);assert.doesNotMatch(h.nodes.main.innerHTML,/could not start|before initialization/);
 });
 await test('Local precheck matches overlap, buffer, free period and reversed ranges',()=>{
   const h=browser('lord');const analyse=h.ctx.LordBookingRules.analyse;
   const context={date:'2026-10-09',periods:['1','2','3','4'].map(code=>({code})),bookings:[{resource:'A',startPeriod:'1',endPeriod:'1',status:'BOOKED',teacher:'Staff'}]};
   for(const [start,end,type] of [['1','1','OVERLAP'],['2','2','BUFFER'],['3','3',''],['4','3','']])assert.equal(analyse({resource:'A',startPeriod:start,endPeriod:end},context).conflictType,type);
 });
 await test('Local precheck prioritizes overlap over buffer and ignores cancelled/other-date rows',()=>{
   const h=browser('lord'),c={date:'2026-10-09',periods:['1','2','3'].map(code=>({code})),bookings:[{resource:'A',startPeriod:'1',endPeriod:'1'},{resource:'A',startPeriod:'2',endPeriod:'2'}]};
   assert.equal(h.ctx.LordBookingRules.analyse({resource:'A',startPeriod:'2',endPeriod:'2'},c).conflictType,'OVERLAP');
   c.bookings[0].status='CANCELLED';c.bookings[1].date='2026-10-10';assert.equal(h.ctx.LordBookingRules.analyse({resource:'A',startPeriod:'2',endPeriod:'2'},c).available,true);
 });
 await test('Selecting a cart performs no availability backend request',async()=>{
   const h=browser('lord'),s=h.api.state;let requests=0;h.ctx.fetch=async()=>{requests++;throw Error('unexpected backend call');};
   s.reference={periods:[{code:'1'},{code:'2'},{code:'3'}]};s.booking.date='2026-10-09';s.booking.scheduleKey=s.booking.date;
   const one={resource:'A',startPeriod:'1',endPeriod:'1'},two={resource:'A',startPeriod:'2',endPeriod:'2'};s.booking.selections=[one,two];
   await h.ctx.checkSelectionAvailability(one);assert.equal(one.conflictType,'BUFFER');assert.equal(two.conflictType,'BUFFER');assert.equal(requests,0);
   s.booking.selections.pop();h.ctx.refreshSelectionConflicts();assert.equal(one.conflictType,'');
 });
 await test('Booking form submits all carts in one batch action',async()=>{
   const h=browser('lord'),s=h.api.state;const resources=['A','B','C'].map(resource=>({resource,deviceType:'Tablet',capacity:14}));
   s.reference={bookingResources:resources,periods:[{code:'1'}]};s.identity.classOrActivity='5A';s.identity.subject='SCI';s.identity.teacher='Staff';
   s.booking.date='2026-10-09';s.booking.scheduleKey=s.booking.date;s.booking.selections=resources.map(r=>({resource:r.resource,startPeriod:'1',endPeriod:'1',quantity:14}));
   let requests=0,body;h.ctx.renderSubmitting=()=>{};h.ctx.clearDraft=async()=>{};h.ctx.renderMultiBookingSuccess=()=>{};
   h.ctx.postTransaction=async payload=>{requests++;body=payload;return {bookings:payload.bookings};};
   await h.ctx.submitBooking();assert.equal(requests,1);assert.equal(body.action,'bookingCreateBatch');assert.equal(body.bookings.length,3);
 });
 await test('Pending write identity survives reload and changes when payload or owner changes',async()=>{
   const h=browser('lord');h.api.state.auth.session=staff;const a={action:'bookingCreateBatch',date:'2026-10-09',bookings:[{resource:'A',requestedQuantity:14}]};
   const first=await h.ctx.stableClientRequestId(a),second=await h.ctx.stableClientRequestId({...a,clientRequestId:'new-random'});assert.equal(first.id,second.id);
   const changed=await h.ctx.stableClientRequestId({...a,bookings:[{resource:'A',requestedQuantity:13}],clientRequestId:undefined});assert.notEqual(first.key,changed.key);
   h.api.state.auth.session={...staff,email:'other@gsps.edu.sg',sub:'other'};const other=await h.ctx.stableClientRequestId({...a,clientRequestId:undefined});assert.notEqual(first.key,other.key);
 });
 await test('Pending identity canonicalizes field ordering and excludes explicit request ID',async()=>{
   const h=browser('lord');const a=await h.ctx.pendingRequestStorageKey({action:'return',sessionId:'S',quantity:3,clientRequestId:'a'});
   const b=await h.ctx.pendingRequestStorageKey({quantity:3,sessionId:'S',clientRequestId:'b',action:'return'});assert.equal(a,b);
 });
 await test('Batch request and its ID are saved before the network write starts',async()=>{
   const h=browser('lord');h.api.state.auth.session=staff;const order=[];
   h.ctx.LordDraftStore={save:async draft=>{order.push('save');assert(draft.booking.pendingBatch.clientRequestId);return {saved:true,photosSaved:true};}};
   h.ctx.fetch=async(url,init)=>{order.push('send');assert.equal(JSON.parse(init.body).clientRequestId,h.api.state.booking.pendingBatch.clientRequestId);return response({ok:true,result:{bookings:[]}});};
   await h.ctx.postTransaction({action:'bookingCreateBatch',bookings:[{resource:'A'}]});assert.deepEqual(order,['save','send']);
 });
 await test('Unconfirmed batch retries its exact snapshot despite a newer schedule conflict',async()=>{
   const h=browser('lord'),s=h.api.state,original={action:'bookingCreateBatch',clientRequestId:'same-id',date:'2026-10-09',bookings:[{resource:'A',startPeriod:'1'}]};
   s.booking.pendingBatch=original;s.booking.selections=[{resource:'different',conflictType:'OVERLAP'}];
   h.ctx.refreshSelectionConflicts=()=>{throw Error('must not precheck a retry');};h.ctx.renderSubmitting=()=>{};h.ctx.clearDraft=async()=>{};h.ctx.renderMultiBookingSuccess=()=>{};
   let sent;h.ctx.postTransaction=async payload=>{sent=payload;return {bookings:payload.bookings};};
   await h.ctx.retryPendingBookingBatch();assert.equal(sent,original);assert.equal(s.booking.pendingBatch,null);
 });
 await test('Unknown booking result retains pending details; definitive rejection clears them',async()=>{
   for(const code of ['UNKNOWN_OUTCOME','SUBMISSION_REJECTED']){
     const h=browser('lord'),pending={action:'bookingCreateBatch',bookings:[{resource:'A'}]};h.api.state.booking.pendingBatch=pending;
     h.ctx.renderSubmitting=()=>{};h.ctx.persistDraft=async()=>true;h.ctx.renderErrorRetry=()=>{};
     h.ctx.postTransaction=async()=>{throw Object.assign(Error('test'),{code});};await h.ctx.retryPendingBookingBatch();
     assert.equal(h.api.state.booking.pendingBatch,code==='UNKNOWN_OUTCOME'?pending:null);assert.equal(h.api.state.busy,false);
   }
 });
 await test('Resuming an unconfirmed booking shows a review without sending automatically',()=>{
   const h=browser('lord');h.api.state.restoredMode='booking';h.api.state.booking.pendingBatch={bookings:[]};let reviews=0;
   h.ctx.showPendingBookingBatch=()=>reviews++;h.ctx.postTransaction=()=>{throw Error('unexpected automatic write');};h.ctx.resumeDraft();assert.equal(reviews,1);
 });
 await test('Malformed and explicitly uncertain submission replies keep the request ID',async()=>{
   for(const mode of ['malformed','uncertain']){const h=browser('lord');h.api.state.auth.session=staff;h.ctx.persistDraft=async()=>true;
     h.ctx.fetch=async()=>mode==='malformed'?new Response('<html>error</html>'):response({ok:false,error:'uncertain',code:'UNKNOWN_OUTCOME',retryable:true});
     const payload={action:'bookingCreateBatch',bookings:[]};await assert.rejects(h.ctx.postTransaction(payload),e=>e.code==='UNKNOWN_OUTCOME');
     assert.equal((await h.ctx.stableClientRequestId(payload)).id,payload.clientRequestId);
   }
 });
 await test('A late schedule response cannot replace the newly selected date',async()=>{
   const h=browser('lord'),first=deferred(),second=deferred();let calls=0;h.ctx.lordFetch=()=>++calls===1?first.promise:second.promise;
   h.api.state.booking.date='2026-10-09';const a=h.ctx.loadBookingDaySchedule();h.api.state.booking.date='2026-10-10';const b=h.ctx.loadBookingDaySchedule();
   second.resolve(response({ok:true,bookings:[{bookingId:'new'}]}));await b;first.resolve(response({ok:true,bookings:[{bookingId:'old'}]}));await a;
   assert.equal(h.api.state.booking.scheduleKey,'2026-10-10');assert.equal(h.api.state.booking.daySchedule[0].bookingId,'new');assert.equal(h.api.state.booking.scheduleLoading,false);
 });
 await test('Unexpected draft storage exception is visible and does not escape',async()=>{
   const h=browser('lord');h.api.state.auth.session=staff;h.ctx.LordDraftStore={save:()=>{throw Error('clone failed');}};
   assert.equal(await h.ctx.persistDraft(),false);assert.match(h.nodes.draftStatus.textContent,/could not be saved/);
 });
 await test('Session expiry saves the draft and reaches sign-in without undefined function',async()=>{
   const h=browser('lord');let saved=0,signin=0;h.ctx.persistDraft=()=>{saved++;};h.ctx.renderGoogleSignIn=()=>{signin++;};
   assert.equal(h.ctx.handleAuthExpiry({code:'AUTH_EXPIRED'}),true);assert.equal(saved,1);assert.equal(signin,1);assert.equal(h.api.state.auth.session,null);
 });
 await test('Signing in as a different user clears the previous in-memory photos',async()=>{
   const h=browser('lord');h.api.state.formOwner='GSPS:old';h.api.state.auth.session=staff;h.api.state.loan.stylusPhotoData='old-private-photo';
   h.ctx.lordFetch=async()=>response({ok:true,data:fresh});await h.ctx.loadAuthenticatedReference();assert.equal(h.api.state.loan.stylusPhotoData,'');assert.equal(h.api.state.identity.teacher,staff.ttbName);
 });
 await test('LORD browser GET has at most one retry; POST has no automatic retry',async()=>{
   const h=browser('lord');h.ctx.sleepMs=async()=>{};let count=0;h.ctx.fetch=async()=>{count++;return response({ok:false});};
   h.ctx.fetch=async()=>{count++;return new Response('{}',{status:503});};await h.ctx.lordFetch('/api/test');assert.equal(count,2);
   count=0;await h.ctx.lordFetch('/api/test',{method:'POST'});assert.equal(count,1);
   h.document.hidden=true;count=0;await h.ctx.lordFetch('/api/test');assert.equal(count,1);
 });
 await test('LORD Worker catches asynchronous submission failures without exposing upstream URLs',async()=>{
   const h=worker('lord',()=>{throw Error('private upstream URL');},staff);
   const out=await h.ctx.worker.fetch(new Request('https://test.invalid/api/transaction',{method:'POST',body:JSON.stringify({action:'bookingCreateBatch'})}),{});
   assert.equal(out.status,502);const body=await out.json();assert.equal(body.retryable,true);assert(!JSON.stringify(body).includes('private upstream'));
 });
 await test('OVERLORD Worker makes one upstream attempt for reads and writes',async()=>{
   for(const method of ['GET','POST']){let calls=0;const h=worker('overlord',()=>{calls++;return new Response('bad',{status:503});},staff);
     const req=new Request('https://test.invalid/api/transaction?action=dashboard',{method,...(method==='POST'?{body:JSON.stringify({action:'bookingCreate',clientRequestId:'x'})}:{})});
     const out=await h.ctx.worker.fetch(req,{ASSETS:{fetch:()=>response({})}});assert.equal(out.status,502);assert.equal(calls,1);
   }
 });
 await test('LORD reference Worker makes one attempt before using last-good cache',async()=>{const h=worker('lord',()=>new Response('temporary error',{status:503}),staff);const out=await h.call('/api/reference');assert.equal(out.ok,false);assert.equal(h.requests.length,1);});
 await test('OVERLORD refresh is single-flight and hidden tabs make no dashboard calls',async()=>{
   const h=browser('overlord'),d=deferred();let calls=0;h.nodes.dateInput.value='2026-10-09';h.ctx.apiJsonV1=()=>{calls++;return d.promise;};
   const first=h.api.refresh(),second=h.api.refresh();assert.equal(calls,1);d.resolve({ok:true,data:{}});await Promise.all([first,second]);h.document.hidden=true;await h.api.refresh();assert.equal(calls,1);
 });
 await test('Date changes queue one fresh dashboard read and discard old-date results',async()=>{
   const h=browser('overlord'),old=deferred(),next=deferred();let calls=0;h.nodes.dateInput.value='2026-10-09';h.ctx.apiJsonV1=()=>++calls===1?old.promise:next.promise;
   const active=h.api.refresh();h.nodes.dateInput.value='2026-10-10';h.api.refresh();h.api.refresh();assert.equal(calls,1);old.resolve({ok:true,data:{old:true}});await tick();assert.equal(calls,2);assert.equal(h.api.snapshot().data,null);
   next.resolve({ok:true,data:{new:true}});await active;assert.equal(h.api.snapshot().data.new,true);
 });
 await test('After-write refresh waits for an active read then retrieves the committed state',async()=>{
   const h=browser('overlord'),old=deferred(),next=deferred();let calls=0;h.nodes.dateInput.value='2026-10-09';h.ctx.apiJsonV1=()=>++calls===1?old.promise:next.promise;
   h.api.refresh();const after=h.api.refresh({afterWrite:true});old.resolve({ok:true,data:{old:true}});await tick();assert.equal(calls,2);next.resolve({ok:true,data:{committed:true}});await after;assert.equal(h.api.snapshot().data.committed,true);
 });
 await test('STARLORD hidden tab does not poll or force a request',async()=>{const h=browser('starlord');h.document.hidden=true;let calls=0;h.ctx.fetch=()=>{calls++;};await h.api.loadBoard();await h.api.loadBoard(true);assert.equal(calls,0);});
 await test('STARLORD caches validated final JSON and labels cache hits',async()=>{
   const h=worker('starlord',()=>response({ok:true,bookings:[],date:'2026-10-09'}));const a=await h.call('/api/board?date=2026-10-09');assert.equal(a.headers.get('X-LORD-Cache'),'MISS');
   const b=await h.call('/api/board?date=2026-10-09');assert.equal(b.headers.get('X-LORD-Cache'),'HIT');assert.equal(h.requests.length,1);assert.equal(h.requests[0].init.redirect,'follow');
   assert(![...h.cache.keys()].some(k=>k.includes('proxySecret')));
 });
 await test('STARLORD rejects forced reads without disturbing a warm cache',async()=>{
   const h=worker('starlord',()=>response({ok:true,bookings:[{bookingId:'cached'}]}));
   await h.call('/api/board?date=2026-10-09');const forced=await h.call('/api/board?date=2026-10-09&forceRefresh=1');assert.equal(forced.status,403);
   assert.equal((await (await h.call('/api/board?date=2026-10-09')).json()).bookings[0].bookingId,'cached');assert.equal(h.requests.length,1);
 });
 await test('Rejected STARLORD forced read does not interrupt an ordinary poll',async()=>{
   const gate=deferred(),h=worker('starlord',()=>gate.promise);const pending=h.call('/api/board?date=2026-10-09');await tick();
   assert.equal((await h.call('/api/board?date=2026-10-09&forceRefresh=1')).status,403);gate.resolve(response({ok:true,bookings:[]}));assert.equal((await pending).status,200);assert.equal(h.requests.length,1);
 });
 await test('STARLORD never caches malformed JSON or unsuccessful payloads',async()=>{for(const payload of [null,{ok:false,error:'bad'},{ok:true}]){const h=worker('starlord',()=>response(payload));assert.equal((await h.call('/api/board?date=2026-10-09')).status,502);assert.equal(h.cache.size,0);}});
 await test('STARLORD cache failure still returns valid live data',async()=>{const h=worker('starlord',()=>response({ok:true,bookings:[]}));h.ctx.caches.default.put=async()=>{throw Error('cache unavailable');};assert.equal((await h.call('/api/board?date=2026-10-09')).status,200);});
 await test('Relief session cannot call batch booking through the LORD Worker',async()=>{const h=worker('lord',()=>{throw Error('should not reach backend');},{...staff,isAdmin:false,identityType:'RELIEF'});const res=await h.ctx.worker.fetch(new Request('https://test.invalid/api/transaction',{method:'POST',body:JSON.stringify({action:'bookingCreateBatch',bookings:[]})}),{});assert.equal(res.status,403);assert.equal(h.requests.length,0);});

 await test('Six-megabyte draft photo goes to IndexedDB; localStorage stays small',async()=>{
   const h=draftFixture(),photo='data:image/jpeg;base64,'+'A'.repeat(6*1024*1024);const saved=await h.store.save({mode:'loan',loan:{trolleys:[{photoData:photo}]}},'owner');assert.equal(saved.photosSaved,true);
   const restored=await h.store.load('owner','Staff');assert.equal(restored.loan.trolleys[0].photoData,photo);assert(h.local.getItem('lord_draft_meta_v1_4').length<1000);
 });
 await test('Accessory photos also stay out of localStorage',async()=>{const h=draftFixture();await h.store.save({loan:{stylusPhotoData:'private1',headphonePhotoData:'private2'},return:{trolleys:[{photoData:'private3'}]}},'owner');assert(!h.local.getItem('lord_draft_meta_v1_4').includes('private'));assert.equal((await h.store.load('owner')).loan.stylusPhotoData,'private1');});
 await test('Drafts never restore for a different authenticated owner',async()=>{const h=draftFixture();await h.store.save({mode:'loan',loan:{photoData:'private'}},'owner-A');assert.equal(await h.store.load('owner-B','Other'),null);});
 await test('Draft save copies state before awaiting its transaction',async()=>{const h=draftFixture(),snapshot={loan:{photoData:'original'}};const saved=h.store.save(snapshot,'owner');snapshot.loan.photoData='changed';await saved;assert.equal((await h.store.load('owner')).loan.photoData,'original');});
 await test('Clear waits behind pending saves and removes the completed draft',async()=>{const h=draftFixture();const save=h.store.save({loan:{photoData:'original'}},'owner');const clear=h.store.clear();await Promise.all([save,clear]);assert.equal(await h.store.load('owner'),null);});
 await test('Quota failure returns explicit photo-backup failure and restores only current metadata',async()=>{
   const h=draftFixture();await h.store.save({identity:{subject:'OLD'},loan:{photoData:'old-photo'}},'owner');h.failWrites=true;
   const saved=await h.store.save({identity:{subject:'NEW'},loan:{photoData:'new-photo'}},'owner');assert.equal(saved.saved,true);assert.equal(saved.photosSaved,false);
   const restored=await h.store.load('owner');assert.equal(restored.identity.subject,'NEW');assert.equal(restored.loan.photoData,'');assert.equal(restored.photosOmitted,true);
 });
 await test('Failed IndexedDB clear cannot resurrect an old draft past its tombstone',async()=>{const h=draftFixture();await h.store.save({loan:{photoData:'private'}},'owner');h.failWrites=true;assert.equal(await h.store.clear(),false);assert.equal(await h.store.load('owner'),null);});
 await test('Draft restore enforces the existing 24-hour expiry',async()=>{const h=draftFixture();await h.store.save({loan:{photoData:'old'}},'owner');h.records.get('current').savedAt=Date.now()-25*3600000;h.local.removeItem('lord_draft_meta_v1_4');assert.equal(await h.store.load('owner'),null);});
 await test('Legacy localStorage draft migrates only when the teacher matches',async()=>{const h=draftFixture();h.local.setItem('lord_mvp_draft_v1',JSON.stringify({savedAt:Date.now(),identity:{teacher:'Staff'},loan:{photoData:'legacy'}}));assert.equal(await h.store.load('other','Other'),null);const draft=await h.store.load('owner','Staff');assert.equal(draft.loan.photoData,'legacy');assert.equal(h.local.getItem('lord_mvp_draft_v1'),null);assert.equal(h.records.get('current').owner,'owner');});
 await test('Blocked IndexedDB produces a recoverable failure without throwing from save',async()=>{const h=draftFixture();h.blocked=true;const out=await h.store.save({loan:{photoData:'photo'}},'owner');assert.equal(out.photosSaved,false);assert.equal(out.saved,true);assert.match(out.error,/Close other LORD tabs/);});

 const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,total:results.length,
   sourceSha256:require('./source_fingerprints.cjs')(),
   environment:'Node VM, simulated DOM, Workers Cache API and IndexedDB service boundaries. Not a rendered browser test.',results};
 fs.writeFileSync(path.join(__dirname,'frontend_14_results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total},null,2));
 results.filter(r=>!r.ok).forEach(r=>console.error(r.name+'\n'+r.error));process.exitCode=report.failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
