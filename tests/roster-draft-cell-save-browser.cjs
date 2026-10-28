'use strict';
// Production UI/domain with held acknowledgements and a lost receipt. No live backend writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),delayMs=600;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  async function setup(source=path.join(root,'roster-update/public/roster-operations-ui.js')){
   const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
   await page.route('https://roster.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
   for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
   for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(source,'utf8')});
   await page.evaluate(()=>{
    const f=__fixture,O=GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');
    O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2,3]});
    window.__requests=[];window.__responses=[];window.__replyReceipts=new Map();window.__holdMs=0;
    window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{
     __requests.push(structuredClone(p));
if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};
     if(p.operation==='receiptStatus')return {requestId:p.command.requestId,accepted:__replyReceipts.has(p.command.requestId)};
     if(p.operation==='read'){if(window.__failRead){const status=typeof __failRead==='number'?__failRead:503;__failRead=false;throw Object.assign(Error('Read unavailable'),{status});}if(window.__holdRead&&p.view==='allocation'&&p.date===f.ctx.today)await new Promise(resolve=>window.__releaseRead=resolve);return O.read(f.state,f.ctx,p);}
     if(window.__holdUntilReleased)await new Promise(resolve=>window.__releaseHeldSave=resolve);
     if(__holdMs)await new Promise(resolve=>setTimeout(resolve,__holdMs));
     if(window.__failBefore){const status=__failBefore;__failBefore=null;throw Object.assign(Error('Denied by current server authority'),{status});}
     if(__replyReceipts.has(p.requestId))return structuredClone(__replyReceipts.get(p.requestId));
     if(p.revision!==f.state.revision)throw Object.assign(Error('Allocation changed'),{status:409});
     const patch=['setNoRelief','unassign'].includes(p.operation)&&!!p.expectedTimetableId,refreshRequired=patch&&f.state.assignments.some(a=>p.demandIds.includes(a.demandId)&&a.status==='draft'&&!a.noRelief),next=structuredClone(f.state),ctx={...f.ctx,cellMutation:patch},result=O.apply(next,ctx,p);next.revision++;f.state=next;
     let reply={...(patch?O.allocationCellView(next,ctx,p):O.view(next,ctx,p)),...result,...(refreshRequired?{refreshRequired:true}:{})};
     __replyReceipts.set(p.requestId,structuredClone(reply));__responses.push(structuredClone(reply));
     if(window.__wrongSource){reply={...reply,date:'2026-10-15'};__wrongSource=false;}
     if(window.__loseReceipt){__loseReceipt=false;throw Object.assign(Error('Save confirmation unavailable'),{status:503});}
     return reply;
    }};
   });
   await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));return {page,errors};
  }
  async function measure(source){
   const {page,errors}=await setup(source);await page.evaluate(delay=>{__holdMs=delay;window.__started=performance.now();document.querySelector('[data-no-relief]').click();document.querySelector('[data-save-online]')?.click();},delayMs);
   const pending=await page.evaluate(()=>({bodyBlocked:document.querySelector('[data-ops-body]').inert,modal:!!document.querySelector('.ops-progress'),pendingMs:performance.now()-__started,saysSaved:/Saved\./.test(document.querySelector('[data-ops-message]').textContent)}));
   await page.waitForFunction(()=>document.querySelector('[data-draft-status]')?document.querySelector('[data-draft-status]').textContent.startsWith('Saved to online'):document.getElementById('content').getAttribute('aria-busy')==='false');
   const confirmedMs=await page.evaluate(()=>performance.now()-__started);assert.equal(pending.saysSaved,false);assert.deepEqual(errors,[]);await page.close();return {...pending,confirmedMs:Math.round(confirmedMs)};
  }
  const baseline=process.env.ROSTER_CELL_BEFORE_UI;if(baseline)console.log('Before held '+delayMs+' ms response:',JSON.stringify(await measure(baseline)));
  const after=await measure();assert.equal(after.bodyBlocked,false);assert.equal(after.modal,false);console.log('After held '+delayMs+' ms response:',JSON.stringify(after));
  const saved=p=>p.waitForFunction(()=>document.querySelector('[data-draft-status]')?.textContent.startsWith('Saved to online'));
  const {page,errors}=await setup();
  const before=await page.evaluate(()=>({checked:document.querySelector('[data-ops-checked]').textContent,reads:__requests.filter(p=>p.operation==='read').length}));
  await page.evaluate(()=>{__holdUntilReleased=true;__fixture.setClock(__fixture.ctx.today+'T06:02:00+08:00');document.querySelector('[data-no-relief]').click();document.querySelector('[data-save-online]')?.click();});
  assert.equal(await page.locator('[data-ops-body]').evaluate(el=>el.inert),false);assert.equal(await page.locator('.ops-progress').count(),0);
  assert.equal(await page.locator('[data-relief-period="2"][aria-busy="true"] [data-draft-cell]').innerText(),'Saving…');
  assert.match(await page.locator('[data-relief-period="2"] .ops-day-decision').innerText(),/No Relief/,'local choice appears immediately without claiming a saved receipt');
  assert.equal(await page.locator('[data-no-relief]').isEnabled(),true);assert.equal(await page.locator('[data-ops-date]').isEnabled(),true);
  await page.locator('[data-candidate-search]').fill('Dora');await page.locator('[data-relief-period="3"]').click();
  assert.equal(await page.locator('[data-no-relief]').isEnabled(),true);await page.locator('[data-assign-mode="combine"]').click();await page.locator('[data-assign-mode="relief"]').click();assert(await page.locator('[data-manual-select]:enabled').count()>0);
  assert.equal(await page.locator('[data-relief-period="2"] [data-draft-cell]').count(),1,'pending marker stays with its demand while browsing');
  await page.waitForFunction(()=>!!window.__releaseHeldSave);await page.evaluate(()=>{__holdUntilReleased=false;__releaseHeldSave();});await saved(page);
  assert.equal(await page.locator('[data-relief-period="3"]').getAttribute('aria-pressed'),'true');assert.notEqual(await page.locator('[data-ops-checked]').innerText(),before.checked,'acknowledged full view updates freshness');
  assert.equal(await page.evaluate(()=>__requests.filter(p=>p.operation==='read').length),before.reads,'batch response supplies refreshed candidate data without a separate read');assert.equal(await page.locator('[data-draft-cell]').count(),0);assert.match(await page.locator('.ops-health-heading').innerText(),/1 uncovered/);
  const firstSave=await page.evaluate(()=>__requests.find(p=>p.operation==='reliefBatch'));assert.equal(firstSave.expectedTimetableId,'baseline');assert.equal(firstSave.expectedStaplerRevision,0);assert.equal(firstSave.expectedParity,'even');assert.equal(firstSave.commands[0].operation,'setNoRelief');assert(firstSave.expectedDemandSources[firstSave.commands[0].demandIds[0]]);
  // Lost response keeps the optimistic choice unconfirmed and exact retry has no second effect.
  await page.evaluate(()=>{__loseReceipt=true;});await page.locator('[data-no-relief]').click();await page.locator('[data-save-online]').click();await page.locator('[data-retry-batch]').waitFor();
  const committed=await page.evaluate(()=>({revision:__fixture.state.revision,assignments:JSON.stringify(__fixture.state.assignments)}));assert.match(await page.locator('[data-draft-status]').innerText(),/unconfirmed/i);assert.match(await page.locator('[data-relief-period="3"] .ops-day-decision').innerText(),/No Relief/);
  await page.locator('[data-publish-relief]').first().click();assert.equal(await page.evaluate(()=>__requests.some(p=>p.operation==='publish')),false,'Publish must resolve an unconfirmed draft first');
  await page.locator('[data-retry-batch]').click();await saved(page);assert.deepEqual(await page.evaluate(()=>({revision:__fixture.state.revision,assignments:JSON.stringify(__fixture.state.assignments)})),committed);
  const saves=await page.evaluate(()=>__requests.filter(p=>p.operation==='reliefBatch'));assert.deepEqual(saves.at(-1),saves.at(-2));
  // A full response for a different day is not an acknowledgement for the local batch.
  await page.evaluate(()=>{__wrongSource=true;});await page.locator('[data-no-relief]').click();await page.locator('[data-save-online]').click();await page.locator('[data-retry-batch]').waitFor();assert.match(await page.locator('[data-draft-status]').innerText(),/unconfirmed/i);await page.locator('[data-retry-batch]').click();await saved(page);assert.match(await page.locator('[data-relief-period="3"] .ops-day-decision').innerText(),/Unassigned/);
  // Definite denial retains local choices for explicit review; it never changes persisted data.
  const deniedRevision=await page.evaluate(()=>__fixture.state.revision);await page.evaluate(()=>{__failBefore=403;});await page.locator('[data-no-relief]').click();await page.locator('[data-save-online]').click();await page.locator('[data-resolve-batch]').waitFor();assert.equal(await page.evaluate(()=>__fixture.state.revision),deniedRevision);assert.match(await page.locator('[data-draft-status]').innerText(),/Denied/);assert.match(await page.locator('[data-relief-period="3"] .ops-day-decision').innerText(),/No Relief/);
  await page.locator('[data-resolve-batch]').click();await page.locator('[data-keep-online]').click();await page.locator('[data-apply-retained]').click();await saved(page);assert.match(await page.locator('[data-relief-period="3"] .ops-day-decision').innerText(),/Unassigned/);assert.equal(await page.evaluate(()=>__requests.some(p=>['publish','notifyDaily'].includes(p.operation))),false);assert.deepEqual(errors,[]);await page.close();
  // Navigation retains unsaved edits and never waits for an in-flight explicit save.
  for(const started of [false,true]){
   const navigation=await setup(),p=navigation.page;await p.evaluate(started=>{__holdMs=300;document.querySelector('[data-no-relief]').click();if(started)document.querySelector('[data-save-online]').click();},started);if(started)await p.waitForFunction(()=>__requests.some(p=>p.operation==='reliefBatch'));
   await p.evaluate(()=>RosterOpsUI.render('Manage reported absences',__opsContext));assert.match(await p.locator('h2').innerText(),/Manage my absences/);assert.equal(await p.locator('[data-no-relief]').count(),0);assert.equal(await p.evaluate(()=>__fixture.state.assignments.filter(a=>a.status==='draft'&&a.noRelief).length),0,'navigation does not flush or wait for confirmation');if(started)await p.waitForFunction(()=>__fixture.state.assignments.some(a=>a.status==='draft'&&a.noRelief));else assert.equal(await p.evaluate(()=>__requests.filter(p=>p.operation==='reliefBatch').length),0);
   await p.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));assert.match(await p.locator('[data-relief-period="2"] .ops-day-decision').innerText(),/No Relief/);assert.equal(await p.locator('[data-retry-batch]').count(),0);assert.deepEqual(navigation.errors,[]);await p.close();
  }
  // Full acknowledged allocation views refresh candidate budgets after real-cover clear or No relief.
  for(const control of ['data-clear-assignment','data-no-relief']){
   const draft=await setup(),p=draft.page;await p.evaluate(async()=>{const f=__fixture,O=GSISRosterOperations,d=O.demand(f.ctx,f.state,f.ctx.today).find(d=>d.period===2);O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[d.id],staffId:'dora'});RosterOpsUI.resetPreloads();await RosterOpsUI.render('Assign Relief',__opsContext);__holdMs=300;});
   await p.locator('['+control+']').click();await p.locator('[data-save-online]').click();await p.locator('[data-relief-period="3"]').click();await p.locator('[data-candidate-search]').fill('Dora');assert.equal(await p.locator('.ops-progress').count(),0);await saved(p);assert.equal(await p.locator('[data-relief-period="3"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[data-candidate-search]').inputValue(),'Dora');assert.match(await p.locator('.ops-work-card[data-candidate-name="Dora Free"] .ops-work-stats').innerText(),/R left 4/);assert.deepEqual(draft.errors,[]);await p.close();
  }
  // A later failed/revoked read cannot invent a rollback of an acknowledged save.
  const refresh=await setup(),rp=refresh.page;await rp.locator('[data-no-relief]').click();await rp.locator('[data-save-online]').click();await saved(rp);await rp.evaluate(()=>{__failRead=true;});await rp.locator('[data-ops-refresh]').click();await rp.waitForFunction(()=>document.querySelector('[data-ops-checked]').textContent.includes('Verification failed'));assert.match(await rp.locator('[data-relief-period="2"] .ops-day-decision').innerText(),/No Relief/);assert.equal(await rp.locator('[data-auto-allocate]').isDisabled(),true,'failed current-authority check gates new outgoing commands without rolling back the acknowledged save');
  await rp.evaluate(()=>{__failRead=403;});await rp.locator('[data-ops-refresh]').click();await rp.locator('[data-reload]').waitFor();assert.equal(await rp.locator('[data-relief-period]').count(),0);await rp.locator('[data-reload]').click();await rp.locator('[data-relief-period="2"]').waitFor();assert.deepEqual(refresh.errors,[]);await rp.close();
  console.log('PASS cell batch browser: immediate editable choices, truthful acknowledgement timing/status, exact retry, wrong-day response, denial/review, navigation, refreshed budgets and read failure/revocation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
