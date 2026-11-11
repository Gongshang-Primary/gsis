'use strict';
// Real Roster DOM and domain; only the receipt read response is substituted.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(saved={}){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[],entries=[],storage=w.localStorage;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 Object.defineProperty(w,'localStorage',{configurable:true,value:storage});
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),status:()=>{},api:async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='read'&&p.view==='intake')return {entries:structuredClone(entries),total:entries.length,hasMore:false};const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return structuredClone(result.data);}};
 const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const receipt=(id,extra={})=>({requestId:id,acceptedAt:f.ctx.iso,intakeState:'applied',absenceApplied:true,peerState:'none',instructionState:'none',transportState:'applied',savedIds:['absence-'+id],mutualRequestIds:[],command:{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,periods:[2],note:'private report payload '+id},dates:[f.ctx.today],...extra});
 const render=async(page='Manage reported absences')=>{await w.RosterOpsUI.render(page,ctx);await wait(()=>$('[data-refresh-intake]')&&!$('[data-refresh-intake]').disabled);};
 const refresh=async()=>{$('[data-refresh-intake]').click();await wait(()=>!$('[data-refresh-intake]').disabled);};
 const snapshot=()=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>w.localStorage.key(i)).filter(key=>key.startsWith('gsis-intake-dismissed-')).map(key=>[key,w.localStorage.getItem(key)]));
 return {dom,w,$,f,ctx,calls,entries,receipt,render,refresh,wait,snapshot};
}
const active=(t,id)=>Array.from(t.w.document.querySelectorAll('[data-intake-active] [data-intake-receipt]')).find(el=>el.dataset.intakeReceipt===id);
const history=(t,id)=>Array.from(t.w.document.querySelectorAll('[data-intake-history] [data-intake-receipt]')).find(el=>el.dataset.intakeReceipt===id);
(async()=>{
 let persisted;
 {
  const t=await setup();try{
   t.entries.push(t.receipt('done'),t.receipt('review',{intakeState:'needsReview'}),t.receipt('peer',{peerState:'pending',mutualRequestIds:['peer-created']}),t.receipt('notes',{instructionState:'needsReview'}),t.receipt('queued',{transportState:'queued'}));
   await t.render();assert.equal(t.$('[data-intake-attention]').textContent,'Needs attention (3)');
   for(const id of ['review','peer','queued']){assert(active(t,id));assert.equal(active(t,id).dataset.intakeState,'attention');assert.equal(active(t,id).querySelector('[data-dismiss-intake]'),null);}
   assert.equal(active(t,'notes').dataset.intakeState,'completed','retained notes are not an attention task');
   const before=JSON.stringify(t.f.state),calls=t.calls.length;
   active(t,'done').querySelector('[data-dismiss-intake]').click();assert.equal(active(t,'done'),undefined);assert(history(t,'done'));assert.equal(t.calls.length,calls,'dismissal never calls a backend mutation');assert.equal(JSON.stringify(t.f.state),before);
   persisted=t.snapshot();assert.equal(Object.keys(persisted).length,1);assert(!JSON.stringify(persisted).includes('private report payload'));assert(!JSON.stringify(persisted).includes('alice@'));assert(!JSON.stringify(persisted).includes('absence-done'));
   await t.refresh();assert.equal(active(t,'done'),undefined,'refresh preserves dismissal');
   t.$('[data-intake-history]').open=true;history(t,'done').querySelector('[data-restore-intake]').click();assert(active(t,'done'));assert.equal(history(t,'done'),undefined);assert.equal(t.$('[data-intake-attention]').textContent,'Needs attention (3)');
   t.$('[data-clear-completed-intake]').click();assert.equal(active(t,'done'),undefined);assert.equal(t.w.document.querySelectorAll('[data-intake-active] [data-intake-receipt]').length,3);
   const done=t.entries[0];done.instructionState='pending';await t.refresh();assert.notEqual(active(t,'done')?.dataset.intakeState,'attention','legacy instruction status is informational');assert.equal(active(t,'done')?.querySelector('[data-retry-intake]'),null);done.peerState='pending';await t.refresh();assert(active(t,'done'),'new pending peer work reappears');assert.equal(history(t,'done'),undefined);assert.equal(t.$('[data-intake-attention]').textContent,'Needs attention (4)');
   done.peerState='none';done.instructionState='none';await t.refresh();assert(active(t,'done'),'observed pending invalidates old dismissal even after returning to the same completion');active(t,'done').querySelector('[data-dismiss-intake]').click();done.savedIds.push('new-absence-id');await t.refresh();assert(active(t,'done'),'changed completion fingerprint reappears');
   active(t,'done').querySelector('[data-dismiss-intake]').click();t.ctx.profile={...t.ctx.profile,user:{...t.ctx.profile.user,email:'another@gsps.edu.sg',staffId:'another'}};await t.render();assert(active(t,'done'),'another signed-in user never inherits dismissal');
   const unknown=t.receipt('unknown',{peerState:'new-unrecognised-state'});t.entries.push(unknown);await t.refresh();assert.equal(active(t,'unknown').querySelector('[data-dismiss-intake]'),null,'unknown processing states fail closed');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup(persisted);try{t.entries.push(t.receipt('done'));await t.render('Report Absence');assert.equal(active(t,'done'),undefined,'a fresh browser session restores only its own persisted dismissal');assert(history(t,'done'));assert.equal(t.$('[data-ops-intake]').hidden,false,'history remains accessible after all completed receipts are hidden');}finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   Object.defineProperty(t.w,'localStorage',{get(){throw new Error('Storage denied');}});t.entries.push(t.receipt('blocked'));await t.render();active(t,'blocked').querySelector('[data-dismiss-intake]').click();assert(history(t,'blocked'));assert.match(t.$('[data-intake-storage-notice]').textContent,/only.*visit/i);await t.refresh();assert.equal(active(t,'blocked'),undefined);await t.render('Report Absence');assert.equal(active(t,'blocked'),undefined,'blocked storage retains dismissal in memory for this visit');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const storage=t.w.localStorage;Object.defineProperty(t.w,'localStorage',{value:{getItem:key=>storage.getItem(key),setItem(){throw new Error('Quota exceeded');},removeItem:key=>storage.removeItem(key)}});t.entries.push(t.receipt('quota'));await t.render();active(t,'quota').querySelector('[data-dismiss-intake]').click();await t.refresh();assert(history(t,'quota'),'readable but unwritable storage does not discard the in-memory choice');assert(t.$('[data-intake-storage-notice]'));history(t,'quota').querySelector('[data-restore-intake]').click();assert(active(t,'quota'));assert.equal(t.$('[data-intake-storage-notice]'),null,'successful restore clears the storage warning');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const hostile='"><img src=x onerror="window.leaked=true">';t.entries.push(t.receipt(hostile,{command:{operation:'saveAbsence',staffId:hostile,date:t.f.ctx.today,periods:[2],note:hostile},resolution:{at:t.f.ctx.iso,reason:hostile,actorName:hostile}}));await t.render();assert.equal(t.$('[data-ops-intake] img'),null);assert.match(t.$('[data-ops-intake]').textContent,/<img/);active(t,hostile).querySelector('[data-dismiss-intake]').click();assert(history(t,hostile));assert.equal(t.$('[data-ops-intake] img'),null);history(t,hostile).querySelector('[data-restore-intake]').click();assert(active(t,hostile));assert.equal(t.w.leaked,undefined);
   t.entries.splice(0,t.entries.length,t.receipt('smc-review',{intakeState:'needsReview',absenceApplied:false,failureCode:'ABSENCE_OVERLAP',reasonCode:'ABSENCE_REVIEW_REQUIRED'}),t.receipt('smc-peer',{peerState:'needsReview'}));await t.render('Assign Relief');assert(active(t,'smc-peer'),'review substate remains visible even when outer state is applied');assert(t.$('[data-withdraw-intake]'),'explicit audited SMC withdrawal remains available');assert.equal(t.calls.filter(c=>c.operation==='resolveAbsenceIntake').length,0);
   assert(t.$('[data-review-intake]'),'SMC can inspect a retained report against current saved entries');assert.match(active(t,'smc-review').textContent,/overlap/i);
   const api=t.ctx.api,missing='2026-11-01';t.ctx.api=async(route,p,...rest)=>{if(p.view!=='intakeReview')return api(route,p,...rest);t.calls.push(structuredClone(p));return {readOnly:true,requestId:'smc-review',checkedAt:t.f.ctx.iso,registerRevision:5,intakeState:'needsReview',absenceApplied:false,failureCode:null,reasonCode:'ABSENCE_REVIEW_REQUIRED',requested:{coverage:{kind:'fullDay'},periods:[],typeId:'mc',typeLabel:'Medical leave',reliefRequired:true},teachers:[{staffId:'alice',name:hostile,missingDates:[missing],dates:[{date:t.f.ctx.today,savedEntries:[{id:'saved',coverage:null,periods:[2],typeId:'other',typeLabel:'Other leave',reliefRequired:false}]},{date:missing,savedEntries:[]}]}]};};
   t.$('[data-review-intake]').click();await t.wait(()=>t.$('[data-intake-review]'));const reviewText=t.$('[data-intake-review]').textContent;assert.match(reviewText,/Full day/);assert.match(reviewText,/P2/);assert.match(reviewText,/Other leave/);assert.match(reviewText,/No relief/);assert.match(reviewText,/Report Absence/);assert.match(reviewText,/does not prove/i);assert.match(reviewText,/1 Nov 2026/);assert.equal(t.$('[data-dialog-body] img'),null,'review escapes names and saved labels');assert.equal(t.calls.filter(c=>c.operation==='resolveAbsenceIntake'||c.operation==='saveAbsence'||c.operation==='retryAbsenceIntake').length,0,'review never submits or withdraws an absence');
   t.$('[data-close-dialog]').click();await t.render('Report Absence');assert(t.$('[data-review-intake]'),'SMC can review a receipt on Report Absence');t.ctx.profile.user={...t.ctx.profile.user,smc:false,admin:false};await t.render('Report Absence');assert.equal(t.$('[data-review-intake]'),null,'ordinary teacher cannot inspect the school register');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   for(let i=0;i<300;i++)t.entries.push(t.receipt('bounded-'+i));await t.render();t.$('[data-clear-completed-intake]').click();const value=JSON.parse(Object.values(t.snapshot())[0]);assert(value.entries.length<=250,'dismissal storage is bounded');for(const row of value.entries)assert.deepEqual(Object.keys(row).sort(),['at','fingerprint','id']);
   const key=Object.keys(t.snapshot())[0];value.entries[0].at=t.w.Date.now()-100*86400000;const expired=value.entries[0].id;t.w.localStorage.setItem(key,JSON.stringify(value));await t.render('Report Absence');assert(active(t,expired),'expired dismissal is pruned');assert(!JSON.parse(t.w.localStorage.getItem(key)).entries.some(row=>row.id===expired));
  }finally{t.dom.window.close();}
 }
 console.log('PASS paid097 receipt DOM actions, unresolved substates, fingerprint invalidation, privacy, user isolation, refresh/history, bounded pruning, storage failure and XSS.');
})().catch(error=>{console.error(error);process.exitCode=1;});
