'use strict';
// Real browser; synthetic staff and timetable only. No production services or messages.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<main id="content"></main>');
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',f),'utf8')});
  for(const f of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  await page.evaluate(()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');for(const t of f.day.teachers)t.timetableName=t.name;
   const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
   window.__cached={modelId:'baseline',model:{layoutMode:'odd-even',odd:week,even:week},selected:{id:'baseline'},selection:'current'};
   window.__localReads=0;window.__invalidations=[];window.__saveGates=[];window.__candidateGates=[];window.__holdSave=false;window.__holdCandidates=false;
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),cachedTimetable:()=>__cached,localTimetable:async()=>{__localReads++;return __cached;},invalidateOperations:dates=>__invalidations.push(dates),api:async(route,p)=>{
    if(p.operation==='saveAbsence'&&__holdSave)await new Promise(r=>__saveGates.push(r));
    if(p.operation==='candidates'&&__holdCandidates)await new Promise(r=>__candidateGates.push(r));
    if(p.operation==='candidates'&&window.__candidateFailure){window.__candidateFailure=false;throw Error('Availability check unavailable. Retry availability.');}
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});
    if(p.view==='notificationReadiness')result.data.notifications={configured:false,readiness:{enabled:false,configured:false,checkedAt:f.ctx.iso,routes:{evening:{ready:false,status:'paused',approval:'approved'}}}};
    return result.data;
   }};
  });
  await page.evaluate(()=>RosterOpsUI.render('Report Absence',__opsContext));
  assert.equal(await page.evaluate(()=>__fixture.calls.at(-1).p.compact),true,'report opts into narrow response');
  await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();
  await page.evaluate(()=>{__holdSave=true;__holdCandidates=true;});
  const opened=await page.evaluate(()=>{const start=performance.now();document.querySelector('[data-own-arrangements]').click();return {ms:performance.now()-start,rows:document.querySelectorAll('.ops-mutual-matrix tbody tr').length};});
  assert.ok(opened.ms<200,JSON.stringify(opened));assert.equal(opened.rows,4);assert.equal(await page.locator('.ops-progress').count(),0);assert.equal(await page.evaluate(()=>__fixture.state.absences.length),0);
  assert.match(await page.locator('.ops-mutual-matrix').innerText(),/MA/,'cached full timetable fills compact colleague rows before any save response');assert.equal(await page.evaluate(()=>__localReads),0,'warm local model requires no second model fetch');
  await page.locator('[data-own-period="2"]').click();await page.locator('[data-colleague-filter]').fill('Dora');assert.equal(await page.locator('[data-submit-mutual]').isDisabled(),true);
  await page.evaluate(()=>{__holdSave=false;__saveGates.shift()();});await page.waitForFunction(()=>__candidateGates.length===1&&document.querySelector('[data-dialog-message]').textContent.includes('Saved'));
  assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);assert.equal(await page.locator('[data-colleague-filter]').inputValue(),'Dora');assert.match(await page.locator('[data-candidate-message]').innerText(),/Checking all affected/);
  await page.evaluate(()=>{__holdCandidates=false;__candidateFailure=true;__candidateGates.shift()();});await page.waitForFunction(()=>document.querySelector('[data-candidate-message]').textContent.includes('Availability check unavailable'));
  assert.match(await page.locator('[data-dialog-message]').innerText(),/Saved/);assert.equal(await page.locator('[data-submit-mutual]').isDisabled(),true);assert.equal(await page.evaluate(()=>__fixture.calls.filter(c=>c.p.operation==='saveAbsence').length),1);
  await page.locator('[data-refresh-mutual]').click();await page.waitForFunction(()=>!document.querySelector('[data-select-colleague="dora"][data-mutual-period="2"]').disabled);await page.locator('[data-close-dialog]').click();
  for(const name of ['Manage reported absences','Assign Relief']){
   await page.evaluate(name=>RosterOpsUI.render(name,__opsContext),name);const calls=await page.evaluate(()=>__fixture.calls.length);await page.evaluate(name=>RosterOpsUI.render(name,__opsContext),name);assert.equal(await page.evaluate(()=>__fixture.calls.length),calls,name+' warm entry uses fresh view without a request');
  }
  await page.evaluate(()=>RosterOpsUI.render('WhatsApp Readiness',__opsContext));assert.equal(await page.locator('.ops-notification-readiness').count(),1);assert.match(await page.locator('[data-ops-body]').innerText(),/sending is disabled/);assert.equal(await page.evaluate(()=>__fixture.calls.at(-1).p.view),'notificationReadiness');
  assert.equal(await page.evaluate(()=>RosterOpsUI.pages({user:{smc:false,admin:true}}).some(p=>p.name==='WhatsApp Readiness')),false,'Admin alone cannot see the SMC readiness page');
  await page.evaluate(()=>RosterOpsUI.render('Manage Ad-hoc relief',__opsContext));assert.equal(await page.locator('.ops-notification-readiness,.ops-notification-issues').count(),0);
  await page.evaluate(()=>{const f=__fixture;f.day.formClasses=[{id:'c1p',name:'1P',level:1,venue:'V1'},{id:'c2p',name:'2P',level:2,venue:'V2'},{id:'c1gt',name:'1Gt',level:1,venue:'V3'},{id:'c2gt',name:'2Gt',level:2,venue:'V4'}];f.day.recesses=[{level:1,period:5},{level:2,period:5}];return RosterOpsUI.render('Recess Regression',__opsContext);});
  await page.locator('[data-recess-settings] [name=baseName]').fill('   ');await page.locator('[data-recess-settings] [type=submit]').click();assert.equal(await page.locator('[data-recess-settings] [name=baseName]').evaluate(el=>el.validity.customError),true);
  await page.locator('[data-recess-settings] [name=baseName]').fill('Rain Recess');assert.equal(await page.locator('[data-recess-settings] [name=baseName]').evaluate(el=>el.validity.customError),false,'correcting the base name clears prior validation');await page.locator('[data-recess-settings] [type=submit]').click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  for(const level of [1,2])await page.locator('[data-recess-form] [name=level][value="'+level+'"]').check();assert.match(await page.locator('[data-recess-preview]').innerText(),/Rain Recess P/);assert.match(await page.locator('[data-recess-preview]').innerText(),/Rain Recess Gt/);
  await page.locator('[data-recess-form] [type=submit]').click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>__fixture.state.assignments.length),0,'activation creates only unassigned demand');
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__opsContext));assert.equal(await page.locator('[data-recess-supervision] .ops-absence-card').count(),2,'four actual classes group into two virtual rows');
  const p=page.locator('[data-recess-supervision] [data-select-absence]').filter({hasText:'Rain Recess P'});await p.click();assert.equal(await page.locator('[data-recess-demand]').count(),2,'same-period classes retain distinct selectable demands');const ids=await page.locator('[data-recess-demand]').evaluateAll(bs=>bs.map(b=>b.dataset.recessDemand));assert.notEqual(ids[0],ids[1]);
  const before=await page.evaluate(()=>__fixture.calls.length);await page.locator('[data-recess-demand]').nth(1).click();assert.equal(await page.locator('[data-recess-demand]').nth(1).getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>__fixture.calls.length),before,'virtual class switching is local');
  if(process.env.GSIS_UI_SCREENSHOT)await page.screenshot({path:process.env.GSIS_UI_SCREENSHOT,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS v706 operations UI: immediate cached own matrix, independent durable save/eligibility failure, fresh Manage/Assign reuse, strict SMC readiness, generated prefix groups and same-period class demand selection.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
