'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[];
 async function setup(shell=false){
  const page=await browser.newPage({viewport:{width:1300,height:950}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  const html=shell?fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''):'<main id="content"></main>';
  await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  for(const file of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async shell=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');window.__tomorrow='2026-10-15';f.ctx.days[__tomorrow]=structuredClone(f.day);f.state.systemConfig.allowAdvancePublishing=true;f.state.accountingYears['2026']={verified:true};
   for(const date of [f.ctx.today,__tomorrow]){
    f.state.absences.push({id:'a-'+date,date,staffId:'alice',name:'Alice Teacher',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});
    // H Daily Notify captures current saved arrangements, independent of publication.
    const demandId=GSISRosterOperations.demand(f.ctx,f.state,date)[0].id;GSISRosterOperations.apply(f.state,f.ctx,{operation:'assign',date,demandIds:[demandId],staffId:'bob',confirm:true});
    const periods=structuredClone(f.day.periods),baseline=structuredClone(f.day.teachers.find(t=>t.staffId==='bob').cells),cells=structuredClone(baseline),time=periods.find(p=>p.period===2);cells[2]=['EL','4A','C1-01',''];
    const fingerprint=JSON.stringify([cells,periods.map(p=>[p.period,p.start,p.end]),[['published-bob-'+date,2,'alice',time.start,time.end,'EL','4A','C1-01','','','',[]]]]);
    f.state.dailyPublicationStates[date]={date,revision:3,baselineId:'baseline',publishedAt:f.ctx.iso,periods,teachers:[{staffId:'bob',name:'Bob Colleague',changed:true,updated:true,cells,baseline,fingerprint,noticeId:'notice-bob-'+date,noticePublishedAt:f.ctx.iso,snapshotIds:[],publishedInstructions:[],rows:[{period:2,timeStart:time.start,timeEnd:time.end,kind:'relief',subject:'EL',className:'4A',venue:'C1-01',absentId:'alice',absentName:'Alice Teacher'}]}]};
   }
   // Ownership/retry scenarios require at least one unstarted duty on today.
   // M permits manual allocation after 06:30, while elapsed duties remain protected.
   f.setClock(f.ctx.today+'T07:30:00+08:00');window.__requests=[];window.__uncertain=true;
   window.__ctx={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{
    __requests.push(structuredClone(p));f.ctx.days[p.date]??=structuredClone(f.day);
    if(p.operation==='notifyDaily'&&window.__notifyFail)throw Object.assign(Error('Synthetic lost notification confirmation'),{status:503});
    if(p.operation==='receiptStatus')return {accepted:false,requestId:p.command.requestId};
    if(p.operation==='reliefBatch'&&window.__batchFail)throw Object.assign(Error('Synthetic lost batch confirmation'),{status:503});
    if(p.operation==='reliefBatch'){const data=GSISRosterOperations.read(f.state,f.ctx,{...p,operation:'read'});return {...data,revision:p.revision+1,acceptedRevision:p.revision+1,dayToken:'token:'+p.date};}
    if(p.operation==='saveAbsence'&&window.__absenceFail)throw Object.assign(Error('Synthetic lost absence confirmation'),{status:503});
    if(p.operation==='autoAllocate'){
     if(window.__hold)await new Promise(resolve=>window.__release=resolve);
     if(__uncertain)throw Object.assign(Error('Synthetic lost confirmation'),{status:503});
    }
    if(p.operation==='publish'&&window.__publishError)throw Object.assign(Error(__publishError.message),{status:409,code:__publishError.code});
    const input={...p,operation:p.operation==='notifyDaily'?'dailyNotify':['autoAllocate','publish'].includes(p.operation)?'read':p.operation};
    const data=GSISRosterOperations.read(f.state,f.ctx,input);return {...data,dayToken:'token:'+p.date,accountingVerified:true,...(p.operation==='autoAllocate'?{savedIds:[]}:{}),...(p.operation==='notifyDaily'?{notificationsQueued:1}:{})};
   }};
   window.__render=(name,date)=>RosterOpsUI.render(name,{...__ctx,initialDate:date});
   if(!shell)await __render('Assign Relief',__tomorrow);
   else{const original=fetch;window.fetch=async(url,args={})=>{const route=String(url).split('/').pop();if(route!=='operations')return original(url,args);try{const p=JSON.parse(args.body||'{}'),data=p.operation==='inboxList'?{alertCount:0}:await __ctx.api(route,p);return {ok:true,status:200,json:async()=>({ok:true,data})};}catch(e){return {ok:false,status:e.status||503,json:async()=>({ok:false,error:e.message,code:e.code})};}};}
  },shell);
  if(shell){await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster.js','utf8')});await page.locator('.function-tile[data-page="Assign Relief"]').waitFor();}
  return page;
 }
 try{
  const elapsed=await setup();await elapsed.evaluate(async()=>{__fixture.setClock(__fixture.ctx.today+'T16:00:00+08:00');await __render('Assign Relief',__fixture.ctx.today);});assert.equal(await elapsed.locator('[data-auto-allocate]').isDisabled(),true,'manual availability never enables allocation when every duty has started');assert.equal(await elapsed.evaluate(()=>__requests.filter(p=>p.operation==='autoAllocate').length),0);await elapsed.close();
  const page=await setup();await page.locator('[data-auto-allocate]').click();await page.locator('[data-retry-save]').waitFor();
  const command=await page.evaluate(()=>__requests.find(p=>p.operation==='autoAllocate'));
  await page.evaluate(()=>__render('Daily Notify',__fixture.ctx.today));
  assert.equal(await page.locator('[data-notify-teacher="bob"]').isEnabled(),true,'tomorrow uncertain allocation must not disable today Notify');
  await page.locator('[data-notify-teacher="bob"]').click();await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Notifications queued'));
  const notice=await page.evaluate(()=>__requests.find(p=>p.operation==='notifyDaily'));assert.equal(notice.date,'2026-10-14');assert.equal(notice.expectedPublicationRevision,3);assert.equal(command.expectedDayToken,'token:2026-10-15');
  await page.evaluate(()=>__render('Assign Relief',__tomorrow));assert.equal(await page.locator('[data-auto-allocate]').isDisabled(),true,'same-day unresolved mutation remains protected');await page.evaluate(()=>__uncertain=false);await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-retry-save]'));
  assert.deepEqual(await page.evaluate(()=>__requests.filter(p=>p.operation==='autoAllocate')), [command,command],'retry retains original date, token and request ID');await page.close();

  const held=await setup();await held.evaluate(()=>{__hold=true;__uncertain=false;});await held.locator('[data-auto-allocate]').click();await held.waitForFunction(()=>typeof __release==='function');
  assert.equal(await held.locator('dialog.ops-progress').count(),0,'dated allocation must leave date navigation usable');
  await held.locator('[data-ops-date]').fill('2026-10-14');await held.locator('[data-ops-date]').dispatchEvent('change');await held.waitForFunction(()=>__requests.some(p=>p.operation==='read'&&p.date==='2026-10-14'));
  await held.evaluate(()=>__render('Daily Notify',__fixture.ctx.today));assert.equal(await held.locator('[data-notify-teacher="bob"]').isEnabled(),true);await held.evaluate(()=>__release());await held.waitForTimeout(50);
  assert.equal(await held.locator('[data-ops-date]').inputValue(),'2026-10-14');assert.equal(await held.locator('[data-notify-teacher="bob"]').isEnabled(),true,'late tomorrow response must not replace today or retain its busy state');await held.close();

  const batch=await setup();await batch.evaluate(async()=>{__fixture.setClock(__fixture.ctx.today+'T06:00:00+08:00');__batchFail=true;await __render('Assign Relief',__fixture.ctx.today);});
  await batch.locator('[data-manual-select="dora"]').first().click();await batch.locator('[data-save-online]').click();await batch.locator('[data-retry-batch]').waitFor();
  await batch.locator('[data-ops-date]').fill('2026-10-15');await batch.locator('[data-ops-date]').dispatchEvent('change');await batch.waitForFunction(()=>document.querySelector('[data-ops-date]').value==='2026-10-15'&&!document.querySelector('[data-ops-body]').inert);assert.equal(await batch.locator('[data-auto-allocate]').isEnabled(),true);await batch.locator('[data-ops-date]').fill('2026-10-14');await batch.locator('[data-ops-date]').dispatchEvent('change');await batch.locator('[data-retry-batch]').waitFor();assert.equal(await batch.locator('[data-auto-allocate]').count(),1,'date return restores the original draft view without flushing it');
  assert.equal(await batch.evaluate(()=>RosterOpsUI.flushPending()),true,'refresh/logout retain the unresolved local draft without saving');
  assert.equal(await batch.evaluate(()=>RosterOpsUI.flushPending({page:'Daily Notify'})),true,'notification navigation preserves unresolved draft instead of waiting');
  assert.equal(await batch.evaluate(()=>RosterOpsUI.flushPending({page:'Assign Relief',date:__tomorrow})),true,'another allocation date is independent');
  await batch.evaluate(()=>__render('Daily Notify',__fixture.ctx.today));assert.equal(await batch.locator('[data-notify-teacher="bob"]').isEnabled(),true);await batch.locator('[data-notify-teacher="bob"]').click();await batch.waitForFunction(()=>__requests.some(p=>p.operation==='notifyDaily'));assert.equal(await batch.evaluate(()=>__requests.filter(p=>p.operation==='reliefBatch').length),1,'Notify never flushes unpublished drafts');await batch.close();

  const sameDay=await setup();await sameDay.evaluate(()=>__render('Assign Relief',__fixture.ctx.today));await sameDay.locator('[data-auto-allocate]').click();await sameDay.locator('[data-retry-save]').waitFor();await sameDay.evaluate(()=>__render('Daily Notify',__fixture.ctx.today));await sameDay.locator('[data-notify-teacher="bob"]').click();await sameDay.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Notifications queued'));assert.equal(await sameDay.locator('[data-ops-refresh]').isEnabled(),true,'published snapshot refresh is independent of draft allocation confirmation');await sameDay.close();

  const retries=await setup();await retries.evaluate(()=>__render('Assign Relief',__fixture.ctx.today));await retries.locator('[data-auto-allocate]').click();await retries.locator('[data-retry-save]').waitFor();await retries.evaluate(async()=>{__notifyFail=true;await __render('Daily Notify',__fixture.ctx.today);});await retries.locator('[data-notify-teacher="bob"]').click();await retries.locator('[data-retry-save]').waitFor();const pendingNotice=await retries.evaluate(()=>__requests.find(p=>p.operation==='notifyDaily'));await retries.evaluate(()=>{__notifyFail=false;__uncertain=false;});await retries.locator('[data-retry-save]').click();await retries.waitForTimeout(50);const retryOps=await retries.evaluate(()=>__requests.filter(p=>['autoAllocate','notifyDaily'].includes(p.operation)));assert.deepEqual(retryOps.at(-1),pendingNotice,'Daily Notify Retry must retry its displayed pending notice, not an older same-date draft allocation');await retries.close();

  const absence=await setup();await absence.evaluate(async()=>{__absenceFail=true;await __render('Report Absence',__fixture.ctx.today);});
  await absence.locator('[name=to]').fill('2026-10-15');await absence.locator('[name=to]').dispatchEvent('change');await absence.locator('[data-period="3"]').click();await absence.locator('[data-log-absence]').click();await absence.locator('[data-instructions-na]').click();await absence.locator('[data-save-instructions]').click();await absence.locator('[data-retry-save]').waitFor();
  await absence.evaluate(()=>__render('Assign Relief',__tomorrow));assert.equal(await absence.locator('[data-auto-allocate]').isDisabled(),true,'multi-date absence protects every touched date');await absence.locator('[data-retry-save]').waitFor();await absence.evaluate(()=>__absenceFail=false);await absence.locator('[data-retry-save]').click();await absence.waitForFunction(()=>!document.querySelector('[data-auto-allocate]').disabled);assert.equal(await absence.locator('[data-ops-body]').evaluate(el=>el.inert),false,'multi-date retry releases the view that initiated retry');await absence.close();

  const failure=await setup();await failure.evaluate(async()=>{__uncertain=false;__publishError={message:'A draft period has started. Record actual relief using the audited correction process before publishing.',code:'PERIOD_STARTED'};await __render('Assign Relief',__fixture.ctx.today);});
  await failure.locator('[data-publish-relief][data-notify-mode="none"]').click();await failure.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('draft period has started'));
  assert.equal(await failure.locator('[data-ops-message]').textContent().then(t=>t.includes('The allocation changed')),false);assert.equal(await failure.locator('.ops-revision-summary').count(),0);await failure.close();
  const shell=await setup(true);await shell.evaluate(()=>{__fixture.setClock(__fixture.ctx.today+'T06:00:00+08:00');__batchFail=true;});
  await shell.locator('.function-tile[data-page="Assign Relief"]').click();await shell.locator('[data-manual-select="dora"]').first().click();await shell.locator('[data-save-online]').click();await shell.locator('[data-retry-batch]').waitFor();
  await shell.locator('#nav [data-page="Home"]').click();await shell.locator('.function-tile[data-page="Daily Notify"]').click();await shell.locator('[data-notify-teacher="bob"]').click();await shell.waitForFunction(()=>__requests.some(p=>p.operation==='notifyDaily'));
  assert.equal(await shell.evaluate(()=>__requests.filter(p=>p.operation==='reliefBatch').length),1,'real shell navigation must retain, not flush, the unresolved draft');
  assert.equal(await shell.locator('[data-retry-batch]').count(),0,'published view must not show a dead draft retry');await shell.locator('[data-open-relief-draft]').click();await shell.locator('[data-retry-batch]').waitFor();assert.equal(await shell.locator('[data-auto-allocate]').count(),1,'returning to the retained draft restores its full allocation view');await shell.evaluate(()=>__batchFail=false);await shell.locator('[data-retry-batch]').click();await shell.waitForFunction(()=>!document.querySelector('[data-retry-batch]'));const retriedBatch=await shell.evaluate(()=>__requests.filter(p=>p.operation==='reliefBatch'));assert.equal(retriedBatch.length,2);assert.deepEqual(retriedBatch[1],retriedBatch[0],'visible recovery action keeps the exact original batch for retry');await shell.close();
  // Keep this error-propagation case on today's date; after-2pm routing has its own regression coverage.
  const conflicts=await setup(true);await conflicts.evaluate(()=>{__fixture.setClock(__fixture.ctx.today+'T13:00:00+08:00');__uncertain=false;__publishError={message:'The relief records for this date changed. Review them before publishing.',code:'DAY_CONFLICT'};});await conflicts.locator('.function-tile[data-page="Assign Relief"]').click();await conflicts.locator('[data-publish-relief][data-notify-mode="none"]').click();await conflicts.locator('.ops-revision-summary').waitFor();assert.match(await conflicts.locator('[data-ops-message]').textContent(),/relief records for this date changed/,'typed conflict code survives the shell API wrapper');
  await conflicts.evaluate(()=>__publishError={message:'A draft period has started. Use the audited correction process.',code:'PERIOD_STARTED'});await conflicts.locator('[data-publish-relief][data-notify-mode="none"]').click();await conflicts.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('draft period has started'));assert.equal(await conflicts.locator('.ops-revision-summary').count(),0,'other publish rejections retain the real reason without an allocation diff');await conflicts.close();
  assert.deepEqual(errors,[]);console.log('PASS day-scoped pending ownership, exact retry, operation tokens, live date navigation and honest publish conflicts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
