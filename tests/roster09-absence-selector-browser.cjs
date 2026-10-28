'use strict';
// Synthetic staff and the real operations model; no live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 const idle=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
 const writes=page=>page.evaluate(()=>__fixture.calls.filter(c=>!GSISRosterOperations.READS.includes(c.p.operation)&&c.p.operation!=='receiptStatus'));
 async function setup(mode){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:read('roster-update/public/'+file)});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:read(file)});
  await page.addScriptTag({content:fs.readFileSync(process.env.ROSTER_ABSENCE_BEFORE_UI||path.join(root,'roster-update/public/roster-operations-ui.js'),'utf8')});
  await page.evaluate(async mode=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');window.__baseline=structuredClone(f.day);f.ctx.days['2026-10-15']=structuredClone(f.day);
   if(mode==='missing')Object.assign(f.day,{id:null,periods:[],teachers:[],schoolDay:false});
   if(mode==='nonSchool')Object.assign(f.day,{schoolDay:false,teachers:[]});
   f.ctx.user.smc=false;f.ctx.user.admin=false;
   await RosterOpsUI.render('Report Absence',{profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}});
  },mode);return page;
 }
 try{
  // Missing baseline → authoritative future grid: preserve the entered clock interval.
  const page=await setup('missing');assert.equal(await page.locator('[data-period]').count(),0,'no invented period timings');
  await page.locator('[name=coverageKind]').selectOption('timeRange');await page.locator('[name=absenceStart]').fill('07:55');await page.locator('[name=absenceEnd]').fill('08:30');
  await page.locator('[name=from]').fill('2026-10-15');await page.locator('[name=from]').dispatchEvent('change');await idle(page);
  assert.equal(await page.locator('[data-period]').count(),17,'available date-specific periods replace fallback');
  assert.equal(await page.locator('[data-period="1"] small').innerText(),'07:30\n08:00');
  assert.deepEqual(await page.locator('[data-period][aria-pressed=true]').evaluateAll(es=>es.map(e=>Number(e.dataset.period))),[1,2]);
  assert.equal(await page.locator('[data-log-absence]').innerText(),"I'm not available during the above selected periods");
  await page.locator('[data-log-absence]').click();assert.deepEqual(await writes(page),[],'period review stays local');
  assert.equal(await page.locator('[data-save-instructions]').innerText(),'Submit absence');await page.locator('[data-save-instructions]').click();await idle(page);
  assert.deepEqual(await page.evaluate(()=>__fixture.state.absences[0].coverage),{kind:'timeRange',startMinutes:475,endMinutes:510},'hydration does not expand an explicit clock interval to full periods');await page.close();
  // Refreshing an unresolved draft restores cards; an explicit edit replaces default coverage.
  const refresh=await setup('missing');await refresh.evaluate(()=>Object.assign(__fixture.day,__baseline));await refresh.locator('[data-ops-refresh]').click();await idle(refresh);
  assert.equal(await refresh.locator('[data-period]').count(),17);await refresh.locator('[data-clear-periods]').click();await refresh.locator('[data-period="2"]').click();await refresh.locator('[data-log-absence]').click();assert.deepEqual(await writes(refresh),[]);await refresh.locator('[data-save-instructions]').click();await idle(refresh);
  assert.deepEqual(await refresh.evaluate(()=>__fixture.state.absences[0].periods),[2]);assert.equal(await refresh.evaluate(()=>__fixture.state.absences[0].coverage),undefined);await refresh.close();
  // Known timings remain selectable on a non-school date; no teaching cells are fabricated.
  const nonSchool=await setup('nonSchool');assert.equal(await nonSchool.locator('[data-period]').count(),17);await nonSchool.locator('[data-period="2"]').click();await nonSchool.locator('[data-log-absence]').click();assert.deepEqual(await writes(nonSchool),[]);await nonSchool.locator('[data-save-instructions]').click();await idle(nonSchool);assert.deepEqual(await nonSchool.evaluate(()=>__fixture.state.absences[0].periods),[2]);await nonSchool.close();
  // Partial, multiple dates and No relief retain their independent meanings.
  const multi=await setup('known');await multi.locator('[name=reliefRequired]').selectOption('no');await multi.locator('[name=to]').fill('2026-10-15');await multi.locator('[name=to]').dispatchEvent('change');await multi.locator('[data-period="2"]').click();await multi.locator('[data-log-absence]').click();assert.deepEqual(await writes(multi),[]);await multi.locator('[data-instructions-na]').click();await multi.locator('[data-save-instructions]').click();await idle(multi);
  assert.equal((await writes(multi)).length,1,'approved no-instructions shortcut remains one atomic save');assert.deepEqual(await multi.evaluate(()=>__fixture.state.absences.map(a=>({date:a.date,periods:a.periods,reliefRequired:a.reliefRequired,instructionsNA:a.instructionsNA}))),[{date:'2026-10-14',periods:[2],reliefRequired:false,instructionsNA:true},{date:'2026-10-15',periods:[2],reliefRequired:false,instructionsNA:true}]);await multi.close();
  assert.deepEqual(errors,[]);console.log('PASS Report Absence: real period/time cards, future hydration, clock intent, refresh recovery, non-school timings, local review and atomic multi-day No relief.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
