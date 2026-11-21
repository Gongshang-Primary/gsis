'use strict';
// Real Chromium/IndexedDB, synthetic data and local assets only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),JSZip=require('jszip');
const files=['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-baseline-cache.js','roster-update/public/jszip.min.js','roster-update/public/converter.js','roster-update/public/roster-export.js','roster-update/public/excel-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/roster-operations-ui.js'];
const owner=JSON.stringify(['alice@gsps.edu.sg','alice',true,true]),date='2026-10-14',snapshot='local-export-view:'+date;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext();await context.route('https://local-export.test/**',route=>{const path=new URL(route.request().url()).pathname.slice(1);return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':'text/html',body:path?fs.readFileSync(path,'utf8'):'<!doctype html><main id="content"></main>'+files.map(file=>'<script src="'+file+'"></script>').join('')});});
  const page=await context.newPage();
  async function setup({failure=0,otherOwner=false,otherDate=false}={}){
   await page.goto('https://local-export.test');await page.evaluate(({failure,otherOwner,otherDate})=>{
    const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'local-absence',date:f.ctx.today,staffId:'alice',name:'Alice Teacher',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
    if(otherOwner){f.ctx.user={...f.ctx.user,email:'another@test.invalid',staffId:'bob'};f.profile.user=f.ctx.user;}
    window.apiCalls=0;window.baselineCalls=0;window.exports=[];window.exportBlobs=new Map();
    URL.createObjectURL=blob=>{const id='blob:local-'+exportBlobs.size;exportBlobs.set(id,blob);return id;};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){exports.push({filename:this.download,blob:exportBlobs.get(this.href)});};
    window.ctx={profile:f.profile,today:()=>otherDate?'2026-10-15':f.ctx.today,initialDate:otherDate?'2026-10-15':f.ctx.today,container:document.getElementById('content'),status(){},localTimetable:async()=>{baselineCalls++;return null;},api:async(route,p)=>{
     apiCalls++;if(p.operation==='read'&&p.view==='intake')return {entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0};
     if(failure)throw Object.assign(Error(failure===403?'Access denied':'Synthetic offline'),{status:failure});
     const response=await fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value.data;
    }};
    window.rendering=RosterOpsUI.render('Assign Relief',ctx);
   },{failure,otherOwner,otherDate});await page.evaluate(()=>rendering);
  }
  await setup();await page.waitForSelector('[data-relief-period="2"]');
  await page.waitForFunction(async({owner,snapshot})=>!!await RosterBaselineCache.getSnapshot(owner,snapshot),{owner,snapshot});
  await page.evaluate(()=>RosterOpsUI.invalidateDates(['2026-10-14']));
  await page.waitForFunction(async owner=>!await RosterBaselineCache.getSnapshot(owner,'allocation-view:'+JSON.stringify(['roster-update/public/roster-operations-ui.js',1,'2026-10-14'])),owner);
  assert(await page.evaluate(async({owner,snapshot})=>!!await RosterBaselineCache.getSnapshot(owner,snapshot),{owner,snapshot}),'authority invalidation retains the complete local export');
  await setup({failure:503});await page.waitForSelector('[data-relief-period="2"]');await page.waitForFunction(()=>document.querySelector('[data-ops-message]').textContent.includes('Offline local copy'));
  assert(await page.locator('[data-auto-allocate]').isDisabled(),'unverified local cache cannot auto-allocate');assert(await page.locator('[data-save-online]').isDisabled(),'unverified local cache cannot save');
  await page.waitForTimeout(20);const counts=await page.evaluate(()=>({api:apiCalls,baseline:baselineCalls}));
  for(const selector of ['[data-daily-excel]','[data-relief-excel]','[data-class-excel]']){
   const count=await page.evaluate(()=>exports.length);await page.locator(selector).click();await page.waitForFunction(count=>exports.length===count+1,count);
  }
  assert.deepEqual(await page.evaluate(()=>({api:apiCalls,baseline:baselineCalls})),counts,'all three exports use local data without fetching');
  const downloads=await page.evaluate(async()=>Promise.all(exports.map(async row=>({filename:row.filename,bytes:Array.from(new Uint8Array(await row.blob.arrayBuffer()))}))));
  assert.equal(downloads.length,3);for(const [i,row] of downloads.entries()){
   assert.match(row.filename,/\.xlsx$/);const zip=await JSZip.loadAsync(Uint8Array.from(row.bytes)),xml=(await Promise.all(Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map(name=>zip.file(name).async('string')))).join('\n');
   assert.match(xml,/Local snapshot/);assert.match(xml,/Cached local copy/);assert.match(xml,/Alice Teacher/);if(i===0)assert.match(xml,/Dora Free/,'complete teacher export retains teachers without assignments');
  }
  await setup({failure:503,otherOwner:true});assert.equal(await page.locator('[data-relief-period]').count(),0,'another signed-in owner cannot restore the saved view');
  await setup({failure:503,otherDate:true});assert.equal(await page.locator('[data-relief-period]').count(),0,'another selected date cannot restore the saved view');
  await setup({failure:403});assert.equal(await page.locator('[data-relief-period]').count(),0,'denied access does not fall back to the saved view');
  await page.waitForFunction(async({owner,snapshot})=>!await RosterBaselineCache.getSnapshot(owner,snapshot),{owner,snapshot});
  await setup({failure:503});assert.equal(await page.locator('[data-relief-period]').count(),0,'revoked view was removed from persistent export storage');
  console.log('PASS Chromium local export cache: real IndexedDB persistence, dated authority invalidation, offline restore, all three local XLSX downloads, unverified write gates, owner/date isolation and denied-access clearing');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
