'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.route('https://cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Selective cache persistence</title>'}));await page.goto('https://cache.test');await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster-baseline-cache.js','utf8')});
  await page.evaluate(()=>{
   window.makeGeneration=(key,at=100)=>({schema:1,role:false,checkedAt:at,checkedDay:'2026-10-23',baseline:{sourceKey:'baseline-one',payload:{from:'2026-10-23',modelKeys:{base:'model-one'},models:[{id:'base',model:{subject:'English'}}]}},suspended:{sourceKey:'suspended-'+key,payload:{planKeys:{'2026-10-23':'plan-'+key},plans:[{date:'2026-10-23',revision:key}]}}});
   window.raw=()=>new Promise(resolve=>{const req=indexedDB.open('gsis-roster-baselines',3);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['meta','contents'],'readonly'),rows={};for(const name of ['meta','contents']){const r=tx.objectStore(name).getAll();r.onsuccess=()=>rows[name]=r.result;}tx.oncomplete=()=>{db.close();resolve(rows);};};});
  });
  assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('a',makeGeneration('one'))),true);
  const selective=await page.evaluate(async()=>{
   const next=makeGeneration('two',200),old=await RosterBaselineCache.getGenerationInfo('a'),stringify=JSON.stringify,put=IDBObjectStore.prototype.put;let baselineSerializations=0,contentPuts=0;
   JSON.stringify=function(value,...args){if(value===next.baseline.payload.models[0].model)baselineSerializations++;return stringify.call(this,value,...args);};
   IDBObjectStore.prototype.put=function(...args){if(this.name==='contents')contentPuts++;return put.apply(this,args);};
   try{return {result:await RosterBaselineCache.commitGeneration('a',next,old),baselineSerializations,contentPuts};}finally{JSON.stringify=stringify;IDBObjectStore.prototype.put=put;}
  });
  assert.equal(selective.result,true);assert.equal(selective.baselineSerializations,0,'one changed plan must not serialize the unchanged timetable');assert.equal(selective.contentPuts,1);
  console.log('PASS one changed plan serializes and writes only its new content');
  const unchanged=await page.evaluate(async()=>{
   const before=(await raw()).meta.find(r=>r.id==='previous-generation'),stamp=await RosterBaselineCache.getGenerationInfo('a');await RosterBaselineCache.commitGeneration('a',makeGeneration('two',300),stamp);
   return {before,after:(await raw()).meta.find(r=>r.id==='previous-generation')};
  });assert.deepEqual(unchanged.after,unchanged.before,'an unchanged generation must preserve the rollback predecessor');
  const stale=await page.evaluate(async()=>{
   const predecessor=await RosterBaselineCache.getGenerationInfo('a');await RosterBaselineCache.commitGeneration('a',makeGeneration('three',400),predecessor);
   const rejected=await RosterBaselineCache.commitGeneration('a',makeGeneration('four',500),predecessor);await RosterBaselineCache.markChecked('a',600,predecessor);
   const current=await RosterBaselineCache.getGenerationInfo('a');await RosterBaselineCache.markChecked('a',250,current);return {rejected,current,after:await RosterBaselineCache.getGenerationInfo('a'),rows:await raw()};
  });assert.equal(stale.rejected,false);assert.equal(stale.current.suspendedSourceKey,'suspended-three');assert.equal(stale.current.checkedAt,400);assert.equal(stale.after.checkedAt,400);assert(!stale.rows.contents.some(r=>r.id==='suspended:plan-four'),'rejected promotion must not leave content behind');
  console.log('PASS stale promotions and checks cannot overwrite newer tags or regress timestamps');
  assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('a',makeGeneration('five',700),null)),false);
  assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('b',makeGeneration('five',700),null)),true);
  assert.equal((await page.evaluate(()=>RosterBaselineCache.getGenerationInfo('a'))).suspendedSourceKey,'suspended-three');
  console.log('PASS compare-and-swap creation remains isolated by account');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
