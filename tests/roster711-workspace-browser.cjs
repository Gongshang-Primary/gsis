'use strict';
// Production browser handlers with synthetic staff and held responses; no live messages.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
  for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-duty-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
  await page.evaluate(()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
   window.__requests=[];window.__gates=[];
   const notify=()=>({date:f.ctx.today,today:f.ctx.today,revision:f.state.revision,allocationRevision:0,canPublish:true,publishedAt:f.ctx.iso,publishedRevision:2,pendingDraft:true,teachers:[{staffId:'bob',name:'Bob Colleague',rows:[{period:2,subject:'EL',className:'4A',venue:'C1-01',absentId:'alice',absentName:'Alice Teacher',assignedBy:'SMC',kind:'relief'},{period:3,subject:'MA',className:'4B',venue:'C1-02',kind:'stapler',assignedBy:'SMC'}]},{staffId:'alice',name:'Alice Teacher',rows:[{period:2,subject:'',className:'',venue:'',kind:'absence',assignedBy:'SMC'}]}]});
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{
    __requests.push(structuredClone(p));if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};if(p.operation==='dailyNotify'||p.view==='dailyNotify')return notify();
    if(p.operation==='publish'&&window.__capturePublish)return {...GSISRosterOperations.view(f.state,f.ctx,{...p,view:'allocation'}),canPublish:true};
    if(p.operation==='candidates'&&window.__holdCandidates)await new Promise(resolve=>__gates.push(resolve));
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};
  });
  // Both SMC and Admin see Daily Notify; normal teachers cannot enter it.
  assert.equal(await page.evaluate(()=>RosterOpsUI.pages({user:{admin:true,smc:false}}).some(p=>p.name==='Daily Notify')),true);
  assert.equal(await page.evaluate(()=>RosterOpsUI.pages({user:{admin:false,smc:false}}).some(p=>p.name==='Daily Notify')),false);
  await page.evaluate(()=>RosterOpsUI.render('Daily Notify',__opsContext));
  assert.deepEqual(await page.locator('.ops-notify-actions button').allTextContents(),['Let teachers see','Send WhatsApp to all affected']);
  assert.equal(await page.locator('.ops-notify-card').count(),1);
  if(process.env.ROSTER_NOTIFY_SCREENSHOT)await page.screenshot({path:process.env.ROSTER_NOTIFY_SCREENSHOT,fullPage:true});
  await page.locator('[data-notify-search]').fill('Ｂｏｂ');assert.equal(await page.locator('.ops-notify-card:visible').count(),1);
  await page.locator('[data-notify-teacher="bob"]').click();await page.waitForFunction(()=>__requests.some(p=>p.operation==='notifyDaily'));
  assert.equal(await page.evaluate(()=>__requests.find(p=>p.operation==='notifyDaily').staffId),'bob');
  await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
  await page.locator('[data-notify-search]').fill('');await page.locator('[data-notify-tab="absent"]').click();
  assert.equal(await page.locator('.ops-notify-card').count(),1);assert.match(await page.locator('.ops-notify-card').textContent(),/Alice Teacher.*Bob Colleague/s);
  const sentBeforePublish=await page.evaluate(()=>__requests.filter(p=>p.operation==='notifyDaily').length);await page.locator('[data-notify-mode="none"]').click();await page.waitForFunction(()=>__requests.some(p=>p.operation==='publish'&&p.notifyMode==='none'));await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>__requests.filter(p=>p.operation==='notifyDaily').length),sentBeforePublish,'visibility does not implicitly send');
  await page.locator('[data-notify-all]').click();await page.waitForFunction(()=>__requests.some(p=>p.operation==='notifyDaily'&&!p.staffId));
  // Assign Relief keeps both publication actions and the two distinct workbook exports.
  await page.evaluate(()=>{__capturePublish=true;return RosterOpsUI.render('Assign Relief',__opsContext);});
  assert.deepEqual(await page.locator('.ops-day-actions button').allTextContents(),['Let teachers see and send WhatsApp to all','Send WhatsApp to all affected','Let teachers see','Export Excel','Export relief excel']);
  assert.equal(await page.locator('[data-save-online]').count(),1,'Save appears once');assert.equal(await page.locator('.ops-day-actions [data-save-online]').count(),0);assert.equal(await page.locator('[data-save-online]').innerText(),'Save to online');assert.equal(await page.locator('[data-save-online]').evaluate(el=>el.closest('.ops-freshness').previousElementSibling.matches('.page-heading')),true,'Save is in the following tools row');assert.equal(await page.locator('.ops-day-actions [data-publish-relief][data-notify-mode=all].primary').count(),1);assert.equal(await page.locator('.ops-day-actions [data-notify-all]').count(),1);assert.equal(await page.locator('.ops-day-actions [data-publish-relief][data-notify-mode=none]').count(),1);
  if(process.env.ROSTER_ASSIGN_SCREENSHOT)await page.screenshot({path:process.env.ROSTER_ASSIGN_SCREENSHOT,fullPage:true});
  assert.equal(await page.locator('[data-history-tools],.ops-health-disclosure').count(),0);
  assert.equal(await page.locator('text=Teacher acknowledgements').count(),0);
  await page.locator('[data-notify-mode="none"]').click();await page.waitForFunction(()=>__requests.some(p=>p.operation==='publish'&&p.notifyMode==='none'));
  await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
  // A revisited, fresh date uses its cached allocation data without another allocation read.
  await page.locator('[data-ops-date]').fill('2026-10-15');await page.locator('[data-ops-date]').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
  const before=await page.evaluate(()=>__requests.filter(p=>p.operation==='read'&&p.view!=='intake').length);
  await page.locator('[data-ops-date]').fill('2026-10-14');await page.locator('[data-ops-date]').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>__requests.filter(p=>p.operation==='read'&&p.view!=='intake').length),before);
  // After bottom submission, own arrangements can submit ONE period while the advisory read is pending.
  await page.evaluate(()=>{__opsContext.initialDate=__fixture.ctx.today;RosterOpsUI.resetPreloads();return RosterOpsUI.render('Report Absence',__opsContext);});
  for(const period of [2,3])await page.locator('[data-period="'+period+'"]').click();
  await page.locator('[data-log-absence]').click();await page.locator('[data-instruction]').fill('Read the worksheet.');
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),0);await page.evaluate(()=>{__holdCandidates=true;});await page.locator('[data-save-instructions]').click();await page.waitForFunction(()=>__fixture.state.absences.length===1&&document.querySelector('#content').getAttribute('aria-busy')==='false');await page.locator('[data-own-arrangements]').click();
  await page.waitForFunction(()=>__gates.length>0&&!document.querySelector('[data-candidate-message]').textContent.includes('Saving absence'));
  await page.locator('[data-own-period="2"]').click();await page.locator('[data-select-colleague="bob"][data-mutual-period="2"]').click();
  assert.match(await page.locator('[data-select-colleague="bob"][data-mutual-period="2"]').textContent(),/Selected.*Provide cover/);assert.match(await page.locator('[data-own-period="2"]').textContent(),/EL.*4A/s);assert.match(await page.locator('[data-mutual-selections]').textContent(),/P2.*Bob Colleague.*Relief/);
  assert.equal(await page.locator('[data-submit-mutual]').isEnabled(),true);
  await page.locator('[data-submit-mutual]').click();await page.waitForFunction(()=>__fixture.state.requests.length===1&&!document.querySelector('.ops-dialog'));
  assert.deepEqual(await page.evaluate(()=>__fixture.state.requests.map(r=>r.periods)),[[2]]);
  assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),0,'own arrangement requires colleague acceptance');
  await page.evaluate(()=>{__holdCandidates=false;for(const done of __gates.splice(0))done();});
  // Duty editor exposes inclusive dates and saves the new contract.
  await page.evaluate(async()=>{RosterOpsUI.unmount();__opsContext.api=async(route,p)=>{__requests.push(structuredClone(p));return {date:p.date,revision:1,available:true,people:[{id:'alice',name:'Alice Teacher'}],duty:{staffIds:p.staffIds||['alice'],startDate:p.startDate||p.date,endDate:p.endDate||p.date}};};await RosterDutyUI.render(__opsContext);});
  await page.locator('[data-duty-new]').click();await page.locator('[name=name]').fill('Week duty');await page.locator('[name=staffIds]').check();
  assert.equal(await page.locator('input[type="time"]').count(),0);
  await page.locator('[name="endDate"]').fill('2026-10-16');await page.locator('[data-duty-form]').dispatchEvent('submit');
  await page.waitForFunction(()=>__requests.some(p=>p.operation==='setDutySMC'));
  assert.deepEqual(await page.evaluate(()=>{const p=__requests.find(p=>p.operation==='setDutySMC');return [p.startDate,p.endDate];}),['2026-10-14','2026-10-16']);
  assert.deepEqual(errors,[]);console.log('PASS 711 workspace browser: toolbar, independent notification/publication and summaries, date cache, single-period own arrangements during pending check, inclusive duty dates.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
