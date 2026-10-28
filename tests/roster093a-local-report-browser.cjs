'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage();page.setDefaultTimeout(4000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{
  const f=__fixture;f.ctx.user.smc=false;f.ctx.user.admin=false;f.profile.reportForm={schema:1,revision:0,today:f.ctx.today,minute:480,people:f.ctx.people,types:f.state.types,noReliefSubjects:['PAL']};window.reads=[];window.localReads=[];
  window.projection=date=>({date,sourceKey:'baseline|'+date+'|even|0',reportVerifiedUntil:Date.now()+60000,periods:f.day.periods,timetable:structuredClone(f.day)});
  window.__ctx={profile:f.profile,quickAbsence:true,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},reportTimetable:async date=>{localReads.push(date);return projection(date);},api:async(route,p)=>{if(p.operation==='read')await new Promise(resolve=>reads.push({p,resolve}));const r=await fetch('/'+route,{body:JSON.stringify(p)}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v.data;}};window.ready=RosterOpsUI.render('Report Absence',__ctx);
 });
 await page.locator('[data-period="2"]').waitFor();assert.equal(await page.locator('[data-log-absence]').isEnabled(),true,'verified local day allows instruction planning during held report read');
 await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();await page.locator('[data-instruction]').first().fill('Keep this instruction');
 await page.evaluate(()=>{const input=document.querySelector('[name=from]');input.value='2026-10-15';input.dispatchEvent(new Event('change'));});
 await page.waitForFunction(()=>reads.some(r=>r.p.date==='2026-10-15'));await page.waitForFunction(()=>document.querySelector('[data-log-absence]').disabled===false);
 assert.equal(await page.locator('[name=from]').inputValue(),'2026-10-15');assert.equal(await page.locator('[data-period="2"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-log-absence]').click();assert.match(await page.locator('[data-instructions-area]').textContent(),/4A/,'tomorrow cached lessons rendered before remote reply');
 assert.equal(await page.evaluate(()=>__fixture.calls.some(c=>c.p.operation==='saveAbsence')),false,'planning remains local');
 await page.evaluate(()=>reads.find(r=>r.p.date==='2026-10-14').resolve());await page.waitForTimeout(20);assert.equal(await page.locator('[name=from]').inputValue(),'2026-10-15');assert.match(await page.locator('[data-instructions-area]').textContent(),/4A/);
 // An unchanged source callback must not replace the live input or caret.
 const input=page.locator('[data-instruction]').first();await input.fill('Tomorrow draft');await input.evaluate(el=>{window.sameInput=el;el.setSelectionRange(3,3);});await page.evaluate(()=>RosterOpsUI.referencesChanged());await page.waitForTimeout(20);assert.equal(await input.evaluate(el=>el===window.sameInput&&el.selectionStart===3),true);
 await page.locator('[data-save-instructions]').click();await page.waitForFunction(()=>__fixture.state.absences.length===1);const saved=await page.evaluate(()=>__fixture.state.absences[0]);assert.equal(saved.date,'2026-10-15');assert.equal(Object.values(saved.instructions)[0],'Tomorrow draft','changing dates filters prior source scopes and submits current text');
 assert.deepEqual(errors,[]);console.log('PASS cached dated instruction grid before held report, date races, unchanged-source DOM/focus retention and zero writes during planning.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
