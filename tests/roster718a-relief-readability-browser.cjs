'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');

// Exercise the real allocation renderer and styles, using synthetic staff only.
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join('roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture,O=GSISRosterOperations,date=f.ctx.today;
   f.setClock(date+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
   f.day.teachers.find(t=>t.staffId==='bob').cells[4]=['Higher Mother Tongue','4A','Classroom with a long venue name',''];
   f.day.teachers.find(t=>t.staffId==='charlie').cells[7]=['EL','3A','C2-02',''];
   for(const [staffId,periods]of [['alice',[2,3]],['bob',[5]],['charlie',[7]]])O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId,date,typeId:'mc',periods});
   const cover=O.demand(f.ctx,f.state,date).find(d=>d.staffId==='charlie');
   O.apply(f.state,f.ctx,{operation:'assign',date,demandIds:[cover.id],staffId:'dora',confirm:true});
   window.__context={profile:f.profile,today:()=>date,container:document.getElementById('content'),status(){},api:async(route,p)=>{const res=await fetch('/'+route,{body:JSON.stringify(p)}),body=await res.json();if(!res.ok)throw Object.assign(Error(body.error),{status:res.status});return body.data;}};
   await RosterOpsUI.render('Assign Relief',__context);
  });
  await page.locator('[data-select-absence]').first().click();
  await page.locator('[data-relief-period="2"]').click();
  const style=(selector,property)=>page.locator(selector).first().evaluate((el,p)=>getComputedStyle(el)[p],property);
  assert.equal(await style('.ops-day-head>b','fontSize'),'18px');
  assert.equal(await style('.ops-day-lesson .subject','fontSize'),'14px');
  assert.equal(await style('.ops-work-head>strong','fontSize'),'16px');
  assert.equal(await style('.ops-work-stats','fontSize'),'12px');
  assert.equal(await style('.ops-assign-button','fontSize'),'15px');
  assert.equal(await style('.ops-candidate-period:not(.target):not(.absent)','backgroundColor'),'rgb(255, 255, 255)');
  assert.equal(await style('.ops-candidate-period.target','backgroundColor'),'rgb(255, 193, 21)');
  assert.equal(await style('.ops-candidate-period.absent','backgroundColor'),'rgb(255, 241, 241)');
  assert.equal(await style('.ops-candidate-period small','backgroundColor'),'rgb(255, 181, 27)');
  const hintContrast=await page.locator('.ops-candidate-scroll>.hint').evaluate(el=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(el.closest('.ops-assign-panel')).backgroundColor);
   return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  assert(hintContrast>=4.5,'allocation explanation is readable on the dark panel');
  const calls=await page.evaluate(()=>__fixture.calls.length),search=page.locator('[data-candidate-search]');
  await search.fill('Bob');assert.equal(await page.locator('.ops-work-card:visible').count(),1);assert.equal(await search.evaluate(el=>el===document.activeElement),true);
  await search.fill('');assert.equal(await page.evaluate(()=>__fixture.calls.length),calls,'search remains local');
  const longLesson=page.locator('.ops-candidate-period[title*="Higher Mother Tongue"]').first();
  assert.match(await longLesson.getAttribute('title'),/Classroom with a long venue name/);
  if(process.env.ROSTER_SCREENSHOT_DIR){fs.mkdirSync(process.env.ROSTER_SCREENSHOT_DIR,{recursive:true});await page.locator('[data-absence-workspace]').screenshot({path:path.join(process.env.ROSTER_SCREENSHOT_DIR,'assign-relief-desktop.png')});}
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page fits a narrow viewport with local timetable scrolling');
  const assign=page.locator('.ops-work-card [data-manual-select="bob"]');
  assert((await assign.boundingBox()).height>=44,'mobile assignment action retains its touch target');
  assert.equal(await assign.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'larger Assign label fits its timetable cell');
  await search.fill('Bob');await assign.focus();await page.keyboard.press('Enter');
  assert.match(await page.locator('[data-relief-period="2"] .ops-day-decision').innerText(),/Bob/,'keyboard assignment immediately updates the local timetable');
  assert.equal(await page.evaluate(()=>GSISRosterAllocation.effectiveAssignments(__fixture.state).some(a=>a.staffId==='bob'&&a.period===2)),false,'manual assignment remains local until Save to online');
  await page.locator('[data-save-online]').click();
  await page.waitForFunction(()=>GSISRosterAllocation.effectiveAssignments(__fixture.state).some(a=>a.staffId==='bob'&&a.period===2));
  assert.equal(await page.evaluate(()=>__fixture.state.outbox.length),0,'draft assignment sends no messages');
  if(process.env.ROSTER_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ROSTER_SCREENSHOT_DIR,'assign-relief-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS Assign Relief readability: offline type scale and state palette, contrasting panel hint, long-text tooltip, local search, narrow layout, keyboard local assignment, explicit online save, no messages.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
