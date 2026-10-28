'use strict';
// Actual UI/CSS with deferred source checks; the persistent adapter is covered by
// roster-draft-baseline-cache-browser.cjs using the shipped application and IDB.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const read=file=>fs.readFileSync(file,'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 async function setup(){
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:read('roster-update/public/'+file)});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:read(file)});
  await page.evaluate(async()=>{
   const f=__fixture;window.__control={cache:new Map(),warms:[],reads:[],calls:[],holdRead:false};
   window.__ctx={quickAbsence:true,profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),cachedTimetable:date=>__control.cache.get(date),localTimetable:(date,force,cacheOnly)=>new Promise((resolve,reject)=>__control.warms.push({date,force,cacheOnly,resolve,reject})),api:async(route,p)=>{
    if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};
    __control.calls.push({route,p});if(__control.holdRead&&p.operation==='read')await new Promise((resolve,reject)=>__control.reads.push({p,resolve,reject}));
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});const data=result.data;
    if(data.timetable){delete data.allocationModel;for(const t of data.timetable.teachers){t.timetableName=t.name;if(![p.staffId||'alice',...(p.staffIds||[])].includes(t.staffId))delete t.cells;}}
    return data;
   }};window.__session=await RosterOpsUI.render('Report Absence',__ctx);
  });return page;
 }
 async function add(page,id='bob'){await page.locator('[data-teacher-search]').fill(id);await page.locator('[role=listbox] [data-staff="'+id+'"]').click();}
 async function cached(page,id='baseline'){await page.evaluate(id=>{const f=__fixture,week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};__control.cache.set(f.ctx.today,{modelId:id,model:{even:week,odd:week}});__control.warms.shift()?.resolve(__control.cache.get(f.ctx.today));},id);}
 const idle=page=>page.waitForFunction(()=>!__session.reading&&!__session.timetableLoading&&!__session.previewPending);
 try{
  let page=await setup();
  // Layout is the real quick-report surface seen by teachers.
  for(const width of [1920,1280,1024,768]){await page.setViewportSize({width,height:900});const boxes=await page.evaluate(()=>['[data-absence-teacher]','[name=from]','[name=to]'].map(sel=>{const r=document.querySelector(sel).closest('label,[data-absence-teacher]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));assert.equal(boxes[0].y,boxes[1].y,'desktop picker and dates share a row at '+width);assert.equal(boxes[1].y,boxes[2].y);assert(boxes[0].right<=boxes[1].x&&boxes[1].right<=boxes[2].x);}
  for(const width of [390,360,320]){await page.setViewportSize({width,height:844});const boxes=await page.evaluate(()=>['[data-absence-teacher]','[name=from]','[name=to]'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));assert(boxes[0].y<boxes[1].y);assert.equal(boxes[1].y,boxes[2].y);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  if(process.env.ROSTER_REPORT_SCREENSHOTS){await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.ROSTER_REPORT_SCREENSHOTS+'/report-phone.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:process.env.ROSTER_REPORT_SCREENSHOTS+'/report-desktop.png',fullPage:true});}
  await page.setViewportSize({width:1280,height:900});await page.locator('[data-period="2"]').click();await add(page);
  assert.equal(await page.locator('[role=listbox]').isHidden(),true,'selection closes before any local or network promise resolves');assert.equal(await page.locator('[data-teacher-search]').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.teacher-chip').count(),2);
  await page.waitForFunction(()=>__control.warms.length===1);assert.equal(await page.evaluate(()=>__control.warms[0].cacheOnly),true);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);
  await page.locator('[name=to]').fill('2026-10-15');await page.locator('[name=to]').dispatchEvent('change');await page.locator('[data-period="3"]').click();await cached(page);await idle(page);
  assert.equal(await page.evaluate(()=>__control.calls.filter(c=>c.p.operation==='read').length),1,'matching local copy avoids a second report read');assert.equal(await page.locator('[name=to]').inputValue(),'2026-10-15');for(const p of [2,3])assert.equal(await page.locator('[data-period="'+p+'"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-log-absence]').isEnabled(),true);
  await page.locator('[data-teacher-search]').click();assert.equal(await page.locator('[role=listbox]').isVisible(),true,'clicking the still-focused search reopens choices');await page.locator('[data-teacher-search]').press('Escape');
  // Removing still works; search/keyboard can immediately add the next teacher.
  await page.locator('.teacher-chip[data-staff=bob]').click();assert.equal(await page.locator('.teacher-chip').count(),1);assert.equal(await page.locator('[role=listbox]').isHidden(),true);await page.locator('[data-teacher-search]').fill('char');await page.locator('[data-teacher-search]').press('Enter');await idle(page);assert.equal(await page.locator('.teacher-chip[data-staff=charlie]').count(),1);assert.equal(await page.locator('[role=listbox]').isHidden(),true);await page.close();

  // Cache miss/source mismatch falls back to a compact fresh report, keeping drafts.
  page=await setup();await page.evaluate(()=>__control.holdRead=true);await add(page);await page.waitForFunction(()=>__control.warms.length===1);await cached(page,'wrong-baseline');await page.waitForFunction(()=>__control.reads.length===1);
  assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);assert.equal(await page.locator('[role=listbox]').isHidden(),true);await page.locator('[name=typeId]').selectOption('others');await page.locator('[name=reasonDetail]').fill('Keep this reason');await page.locator('[data-period="2"]').click();await page.evaluate(()=>__control.reads.shift().resolve());await idle(page);assert.equal(await page.locator('[name=reasonDetail]').inputValue(),'Keep this reason');assert.equal(await page.locator('[data-period="2"]').getAttribute('aria-pressed'),'true');await page.close();

  page=await setup();await add(page);await page.waitForFunction(()=>__control.warms.length===1);await page.locator('.teacher-chip[data-staff=bob]').click();await page.locator('.teacher-chip[data-staff=alice]').click();await cached(page);await idle(page);assert.equal(await page.locator('.teacher-chip').count(),0);assert.equal(await page.locator('[data-teacher-search]').evaluate(el=>el.validity.valid),false,'empty selection stays invalid after an old restore');assert.equal(await page.evaluate(()=>__control.calls.filter(c=>c.p.operation==='read').length),1);await page.close();

  // A refresh redraw must not reopen a closed picker when restoring its focus.
  page=await setup();await page.evaluate(()=>{__control.holdRead=true;__session.checkedAt-=61000;});await add(page);await page.waitForFunction(()=>__control.reads.length===1);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);await page.evaluate(()=>__control.reads.shift().resolve());await idle(page);assert.equal(await page.locator('[data-teacher-search]').evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('[role=listbox]').isHidden(),true);await page.close();

  // Source invalidation while disk restore is pending must require fresh records.
  page=await setup();await page.evaluate(()=>__control.holdRead=true);await add(page);await page.waitForFunction(()=>__control.warms.length===1);await page.evaluate(()=>RosterOpsUI.invalidateDates([__fixture.ctx.today]));await cached(page);await page.waitForFunction(()=>__control.reads.length===1);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);await page.evaluate(()=>__control.reads.shift().resolve());await idle(page);await page.close();
  for(const diskFirst of [false,true]){
   page=await setup();await page.evaluate(()=>__control.holdRead=true);await add(page);await page.waitForFunction(()=>__control.warms.length===1);await page.evaluate(()=>RosterOpsUI.invalidateDates([__fixture.ctx.today]));
   if(diskFirst){await cached(page);await page.waitForFunction(()=>__control.reads.length===1);}
   await page.locator('.teacher-chip[data-staff=bob]').click();await page.waitForFunction(()=>__control.reads.length>=1);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true,'deselection cannot cancel an invalidated source check');assert.equal(await page.locator('[data-save-absence-now]').count(),0,'reporting retains the explicit period review and final submit path');assert.equal(await page.evaluate(()=>__session.checkedAt),0);
   if(!diskFirst)await cached(page);await page.evaluate(()=>__control.reads.forEach(r=>r.resolve()));await idle(page);assert.equal(await page.locator('[data-log-absence]').isEnabled(),true);await page.close();
  }
  page=await setup();await add(page);await page.waitForFunction(()=>__control.warms.length===1);await cached(page);await idle(page);await page.evaluate(()=>{__control.holdRead=true;RosterOpsUI.invalidateDates([__fixture.ctx.today]);});assert.equal(await page.locator('[data-log-absence]').isDisabled(),true,'invalidation after restore also fences existing cells');assert.match(await page.locator('[data-report-timetable-status]').innerText(),/details changed/);await page.locator('.teacher-chip[data-staff=bob]').click();await page.waitForFunction(()=>__control.reads.length===1);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);await page.evaluate(()=>__control.reads.shift().resolve());await idle(page);await page.close();
  page=await setup();await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();await page.locator('[data-instruction="0"]').fill('Keep my lesson instructions');await page.evaluate(()=>RosterOpsUI.invalidateDates([__fixture.ctx.today]));assert.equal(await page.locator('[data-save-instructions]').isDisabled(),true);assert.equal(await page.locator('[data-instructions-na]').isDisabled(),true);await page.evaluate(()=>document.querySelector('[data-save-instructions]').onclick());assert.equal(await page.evaluate(()=>__control.calls.filter(c=>c.p.operation==='saveAbsence').length),0,'final submit cannot bypass invalidated authority');await page.locator('[data-retry-report-timetable]').click();await idle(page);assert.equal(await page.locator('[data-instruction="0"]').inputValue(),'Keep my lesson instructions');assert.equal(await page.locator('[data-save-instructions]').isEnabled(),true);await page.close();

  // No old date/account callback can modify a later screen or enable its controls.
  page=await setup();await page.evaluate(()=>__control.holdRead=true);await add(page);await page.waitForFunction(()=>__control.warms.length===1);await page.locator('[name=from]').fill('2026-10-15');await page.locator('[name=from]').dispatchEvent('change');await cached(page);assert.equal(await page.locator('[name=from]').inputValue(),'2026-10-15');assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);await page.evaluate(()=>{RosterOpsUI.unmount();document.getElementById('content').innerHTML='<h2>Different account</h2>';__control.reads.forEach(r=>r.resolve());});await page.waitForTimeout(30);assert.equal(await page.locator('#content').textContent(),'Different account');await page.close();
  assert.deepEqual(errors,[]);console.log('PASS report picker: desktop row, phone wrap, immediate close, local restore, fresh source gates, retained edits and stale-date/account fencing.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
