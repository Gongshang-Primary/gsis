'use strict';
// Real mobile Chromium + production UI/domain. Synthetic school data and equal 200 ms API delay.
// Compare local browser response, not production Apps Script/Drive latency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),prior=f=>execFileSync('git',['show','v0.8.3:'+f],{cwd:root,encoding:'utf8'}),delayMs=200;
// Current contracts run without historical Git objects. An explicit benchmark
// request still loads the authentic baseline and fails if it is unavailable.
const historicalComparison=process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1',comparisonModes=historicalComparison?[true,false]:[false],currentVersion=require('../package.json').gsisRelease;
if(!historicalComparison)console.log('HISTORICAL COMPARISON NOT RUN: v0.8.3; set GSIS_RUN_HISTORICAL_BENCHMARKS=1 with the original Git objects. Current assertions remain active.');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM,args:['--no-sandbox']}),errors=[],measurements=[];
 async function setup(before=false){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="content"></main></body></html>'}));await page.goto('https://roster.test');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:(before?prior:read)('roster-update/public/'+file)});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])await page.addScriptTag({content:read(file)});
  await page.addScriptTag({content:(before?prior:read)('roster-update/public/roster-operations-ui.js')});
  await page.evaluate(async delay=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');const plan=GSISRosterOperations.read(f.state,f.ctx,{operation:'stapler',date:f.ctx.today}).plan;GSISRosterOperations.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.ctx.today,staplerRevision:0,plan});GSISRosterOperations.staplerApply(f.state,f.ctx,{operation:'confirmStapler',date:f.ctx.today,staplerRevision:1});f.day.staplerRevision=1;f.ctx.user.smc=false;f.ctx.user.admin=false;window.__calls=[];window.__control={};
   const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
   window.__ctx={profile:f.profile,today:()=>f.ctx.today,container:document.querySelector('#content'),status:()=>{},cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),api:async(route,p)=>{
    __calls.push(structuredClone(p));await new Promise(r=>setTimeout(r,delay));
    if(p.operation==='candidates'&&__control.holdCandidates)await new Promise(r=>__control.releaseCandidates=r);
    if(p.operation==='read'&&__control.holdRead)await new Promise(r=>{(__control.reads??=[]).push(r);});
    if(['saveAbsence','saveInstructions'].includes(p.operation)&&__control.holdSave)await new Promise(r=>__control.releaseSave=r);
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});const data=result.data;
    if(data.timetable&&p.operation!=='candidates')data.timetable={...data.timetable,teachers:data.timetable.teachers.filter(t=>t.staffId===f.ctx.user.staffId)};
    return data;
   }};
   window.__state=await RosterOpsUI.render('Report Absence',__ctx);
  },delayMs);
  return page;
 }
 const idle=p=>p.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');
 const preview=async p=>{await p.locator('[data-period="2"]').click();await p.locator('[data-log-absence]').click();};
 try{
  for(let run=1;run<=3;run++)for(const before of comparisonModes){
   const page=await setup(before);await preview(page);
   await page.evaluate(()=>{
    __measure={started:performance.now()};const observer=new MutationObserver(()=>{if(!__measure.feedbackAt&&document.querySelector('dialog[open]'))__measure.feedbackAt=performance.now();if(!__measure.chooserAt&&document.querySelector('[data-colleague-filter]'))__measure.chooserAt=performance.now();});observer.observe(document.body,{childList:true,subtree:true});document.querySelector('[data-own-arrangements]').click();
   });
   await page.locator('[data-colleague-filter]').waitFor();await idle(page);await page.locator('[data-own-period="2"]').click();await page.waitForTimeout(delayMs+70);
   const result=await page.evaluate(()=>({...__measure,colleagueVisible:!!document.querySelector('[data-select-colleague="dora"][data-mutual-period="2"]'),domNodes:document.querySelector('dialog').querySelectorAll('*').length,writes:__calls.filter(p=>p.operation==='saveAbsence').length,peerWrites:__calls.filter(p=>p.operation==='requestMutual').length}));
   measurements.push({run,version:before?'0.8.3':currentVersion,feedbackMs:Math.round(result.feedbackAt-result.started),chooserMs:Math.round(result.chooserAt-result.started),colleagueVisible:result.colleagueVisible,dialogNodes:result.domNodes});
   assert.equal(result.writes,before?1:0);assert.equal(result.peerWrites,0);assert.equal(result.colleagueVisible,!before,'v083 loses ordinary candidates under compact suspended data; v084 shows them');
   await page.close();
  }
  const page=await setup();await preview(page);await page.locator('[data-instruction]').fill('Keep the worksheet instructions.');await page.locator('[data-own-arrangements]').click();await page.locator('[data-colleague-filter]').waitFor();await idle(page);await page.locator('[data-own-period="2"]').click();await page.locator('[data-select-colleague="dora"]').waitFor();
  // A native modal traps keyboard focus; controls fit and remain reachable with a reduced mobile viewport.
  assert.equal(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'chooser has no horizontal overflow');
  for(const selector of ['[data-own-period="2"]','[data-select-colleague="dora"]','[data-close-dialog]']){const box=await page.locator(selector).boundingBox();assert(box.height>=44,selector+' touch target');}
  await page.locator('[data-colleague-filter]').fill('Dora');await page.setViewportSize({width:390,height:430});await page.locator('[data-select-colleague="dora"]').click();await page.locator('[data-submit-mutual]').scrollIntoViewIfNeeded();
  const submit=await page.locator('[data-submit-mutual]').boundingBox();assert(submit.y>=0&&submit.y+submit.height<=430,'submit remains reachable with mobile keyboard-size viewport');
  assert.equal(await page.locator('[data-submit-mutual]').isEnabled(),true);assert.equal(await page.evaluate(()=>__calls.some(p=>p.operation==='requestMutual')),false,'no peer request until explicit submit');
  await page.screenshot({path:'/tmp/v084-own-arrangements-mobile.png',fullPage:true});
  await page.locator('[data-submit-mutual]').click();assert.equal(await page.evaluate(()=>__fixture.state.requests.length),0);await page.locator('[data-save-instructions]').click();await idle(page);assert.equal(await page.evaluate(()=>__calls.filter(p=>p.operation==='requestMutual').length),0);assert.equal(await page.evaluate(()=>__fixture.state.requests.length),1);await page.close();
  // Closing during a slow availability check cannot reopen the chooser or create an absence.
  const closing=await setup();await preview(closing);await closing.evaluate(()=>__control.holdCandidates=true);await closing.locator('[data-own-arrangements]').click();await closing.locator('[data-colleague-filter]').waitFor();await closing.locator('[data-close-dialog]').click();await closing.waitForFunction(()=>typeof __control.releaseCandidates==='function');await closing.evaluate(()=>__control.releaseCandidates());await idle(closing);assert.equal(await closing.locator('dialog').count(),0);assert.equal(await closing.evaluate(()=>__fixture.state.absences.length),0);await closing.close();
  // A date fetch can finish while typing; selected periods, reason text and focus survive.
  const dates=await setup();await dates.locator('[name=typeId]').selectOption('others');await dates.evaluate(()=>__control.holdRead=true);await dates.locator('[name=from]').fill('2026-10-15');await dates.locator('[name=from]').dispatchEvent('change');await dates.locator('[data-period="2"]').click();await dates.locator('[name=reasonDetail]').fill('Course while checking date');await dates.waitForFunction(()=>__control.reads?.length);await dates.evaluate(()=>{__control.holdRead=false;__control.reads.splice(0).forEach(r=>r());});await idle(dates);assert.equal(await dates.locator('[name=reasonDetail]').inputValue(),'Course while checking date');assert.equal(await dates.locator('[name=reasonDetail]').evaluate(el=>document.activeElement===el),true);assert.equal(await dates.locator('[data-period="2"]').getAttribute('aria-pressed'),'true');await dates.close();
  assert.deepEqual(errors,[]);
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)],summary=(historicalComparison?['0.8.3',currentVersion]:[currentVersion]).map(version=>{const rows=measurements.filter(r=>r.version===version);return {version,medianFeedbackMs:median(rows.map(r=>r.feedbackMs)),medianChooserMs:median(rows.map(r=>r.chooserMs)),colleagueVisible:rows[0].colleagueVisible,dialogNodes:rows[0].dialogNodes};});
  fs.writeFileSync('/tmp/v084-absence-browser.json',JSON.stringify({historicalComparison,syntheticApiDelayMs:delayMs,viewport:{width:390,height:844},summary,measurements},null,2)+'\n');console.log('PASS mobile absence: compact suspended candidates, explicit submit, pending cancellation, input focus retention, 44px controls, reduced viewport and no overflow.');console.log(JSON.stringify(summary));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
