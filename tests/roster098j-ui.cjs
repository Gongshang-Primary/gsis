'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{sample}=require('./roster716-calculations.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.ROSTER_TEST_CHROMIUM||chromium.executablePath()});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://roster.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css','roster-calculations.css'])await page.addStyleTag({path:path.join(root,'roster-update/public',file)});
  await page.evaluate(()=>{window.__nativeStorage=localStorage;});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.evaluate(async()=>{
   Object.defineProperty(window,'localStorage',{configurable:true,value:__nativeStorage});localStorage.clear();
   const f=__fixture,O=GSISRosterOperations;f.state.accountingYears['2026']={verified:true};
   const blank=()=>Array.from({length:17},()=>['','','','']);
   for(const [id,extra] of [['mk',{mk:'MK'}],['oso',{role:'OSO'}],['sat',{groups:['SAT']}],['sl',{appointmentLevel:'SL'}],['fajt',{employment:'FAJT'}],['seno',{role:'SENO'}]]){f.ctx.people.push({id,name:id.toUpperCase()+' fixture',active:true,...extra});if(!['fajt','seno'].includes(id))f.day.teachers.push({staffId:id,name:id.toUpperCase()+' fixture',R:4,cells:blank()});}
   O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2]});
   window.__notifyFails=1;window.__callsJ=[];
   window.__contextJ={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{
    __callsJ.push(structuredClone(p));if(p.operation==='notifyDaily'&&__notifyFails-- >0)throw Error('Synthetic notification response unavailable');
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});
    const data=value.data;if(data.allocationModel)for(const teacher of data.allocationModel.teachers)teacher.person.reliefCandidateEligible=!['mk','oso','sat','sl'].includes(teacher.id);
    if(p.operation==='publish')return {publicationAcknowledgement:true,visibilityPublished:true,date:p.date,revision:data.revision,allocationRevision:data.allocationRevision,publishedAt:f.ctx.iso,publishedRevision:data.publishedRevision||1,dayToken:data.dayToken,canPublish:true,publishAudit:{required:false,changes:[]},published:0};return data;
   }};
   await RosterOpsUI.render('Assign Relief',__contextJ);
  });
  const combined=page.getByRole('button',{name:'Let teachers see and send WhatsApp to all',exact:true});await combined.waitFor();
  assert.equal(await combined.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 115, 218)');
  assert(await page.locator('[data-save-online]').evaluate(el=>el.closest('.ops-freshness')!==null));
  assert(await page.locator('[data-save-online]').evaluate(el=>el.getBoundingClientRect().top>document.querySelector('[data-notify-mode=all]').getBoundingClientRect().bottom));
  for(const id of ['mk','oso','sat','sl'])assert.equal(await page.locator('[data-candidate-name]').filter({hasText:id.toUpperCase()+' fixture'}).count(),0);
  for(const id of ['fajt','seno'])assert(await page.locator('[data-candidate-name="'+id.toUpperCase()+' fixture"]').count()>0,'a genuine teacher stays in Unavailable without a timetable');
  await page.locator('[data-candidate-search]').fill('MK fixture');assert.equal(await page.locator('.ops-work-card:visible').count(),0);await page.locator('[data-candidate-search]').fill('');
  fs.mkdirSync('verification/098j',{recursive:true});await page.screenshot({path:'verification/098j/assign-relief-desktop.png',fullPage:true});
  await combined.click();await page.locator('[data-retry-save]').waitFor();
  assert.match(await page.locator('[data-ops-message]').innerText(),/Teachers can see.*WhatsApp is not confirmed/);
  assert(await page.locator('[data-relief-period]').count()>0,'compact acknowledgement retains the workspace');
  const first=await page.evaluate(()=>__callsJ.filter(p=>['publish','notifyDaily'].includes(p.operation)));
  assert.deepEqual(first.map(p=>p.operation),['publish','notifyDaily']);assert.equal(first[0].notifyMode,'none');assert.equal(first[0].publicationAcknowledgement,true);
  // Reopening restores the unresolved notification, and never republishes automatically.
  await page.evaluate(()=>RosterOpsUI.render('Assign Relief',__contextJ));await page.locator('[data-retry-save]').waitFor();
  await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-retry-save]')&&/Teachers can see/.test(document.querySelector('[data-ops-message]').textContent));
  const calls=await page.evaluate(()=>__callsJ.filter(p=>['publish','notifyDaily'].includes(p.operation)));
  assert.deepEqual(calls.map(p=>p.operation),['publish','notifyDaily','notifyDaily']);assert.deepEqual(calls[1],calls[2]);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('gsis-publication-flow-v1:')).length),0);
  assert.match(await page.locator('[data-ops-message]').innerText(),/Teachers can see/);assert(await page.locator('[data-relief-period]').count()>0,'notification outcomes retain the current allocation workspace');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'verification/098j/assign-relief-mobile.png',fullPage:true});
  for(const file of ['roster-calculations.js','roster-learning.js'])await page.addScriptTag({path:path.join(root,'roster-update/public',file)});
  const learning={config:{maxDailyPeriods:8,maxConsecutivePeriods:4,allocationRuleEnabled:{rotation:false},subjectFamilies:[{id:'literal',name:'<literal rules>'}]},appliedRuleOrder:[{id:'rotation',label:'Rotation order',description:'Actual saved order',enabled:false}],revision:73,updatedAt:'2026-10-28T00:00:00Z'};
  await page.evaluate(async({calculation,learning})=>{RosterOpsUI.unmount();window.__learning=learning;window.__learningContext={container:document.getElementById('content'),api:async(route,p)=>p.operation==='calculations'?calculation:{learning}};await RosterLearningUI.render(__learningContext);},{calculation:sample(),learning});
  assert.deepEqual(await page.locator('.allocation-learning-sections>li').evaluateAll(rows=>rows.map(row=>row.querySelector('h2').textContent)),['My Calculations','Business Rules','Understand an allocation log']);
  assert.match(await page.locator('[data-learning-rules]>.calculation-caption').innerText(),/Updated 28 Oct 2026, 08:00 SGT/);
  const text=await page.locator('[data-learning-prompt]').inputValue(),template=fs.readFileSync(path.join(root,'docs/v098j/ALLOCATION_EXPLANATION_PROMPT.txt'),'utf8').trimEnd();
  assert.equal(text,template.replace('currently:\n\nUsing','currently:\n\n'+JSON.stringify(learning,null,2)+'\n\nUsing'));
  assert.equal(await page.locator('.allocation-rule-settings img').count(),0);assert.equal(await page.locator('[data-copy-learning-prompt]').isEnabled(),true);
  assert.equal(await page.locator('.allocation-learning a').getAttribute('href'),'https://drive.google.com/drive/u/0/folders/1imeTP73ZowWLIAWZPP_fsh7_8SbRKqZI');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  fs.mkdirSync('verification/098j',{recursive:true});await page.screenshot({path:'verification/098j/learning-mobile.png',fullPage:true});
  await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'verification/098j/learning-desktop.png',fullPage:true});
  await page.evaluate(async()=>{__learningContext.api=async(route,p)=>{if(p.operation==='calculations')return {name:'No source',completion:{}};throw Error('Synthetic rules unavailable');};await RosterLearningUI.render(__learningContext);});
  assert.equal(await page.locator('[data-copy-learning-prompt]').isDisabled(),true);assert.equal(await page.locator('[data-learning-prompt]').inputValue(),'');
  assert.deepEqual(errors,[]);console.log('PASS J UI: lower Save row, exact blue combined action, independent modes, compact acknowledgement, durable notification-only retry, category filtering including Unavailable, FAJT/SENO retained, three learning sections, literal actual rules in exact prompt, failure-safe copy and mobile fit.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
