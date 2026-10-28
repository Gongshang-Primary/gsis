'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const source=fs.readFileSync('roster-update/public/roster-baseline-cache.js','utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage();await page.route('https://cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Cache fixture</title>'}));await page.goto('https://cache.test/');
  // Exercise the existing v1 database upgrade; no user's saved model is lost.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('gsis-roster-baselines',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('models',{keyPath:['owner','id']});s.createIndex('owner','owner');s.put({owner:'teacher',id:'legacy',model:{name:'legacy'}});};r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);}));
  await page.addScriptTag({content:source});
  assert.deepEqual(await page.evaluate(()=>RosterBaselineCache.get('teacher','legacy')),{name:'legacy'});
  await page.evaluate(async()=>{await RosterBaselineCache.putSnapshot('smc','baseline',{encoding:'gzip-base64-v1',data:'packed baseline'});await RosterBaselineCache.putSnapshot('smc','suspended',{encoding:'gzip-base64-v1',data:'packed draft'});await RosterBaselineCache.put('smc','model',{name:'model'});});
  await page.reload();await page.addScriptTag({content:source});assert.equal(await page.evaluate(async()=>(await RosterBaselineCache.getSnapshot('smc','suspended')).data),'packed draft');
  assert.equal(await page.evaluate(()=>RosterBaselineCache.getSnapshot('teacher','suspended')),null);
  console.log('PASS IndexedDB v1 upgrade, reload persistence and account/role isolation');
  await page.evaluate(()=>RosterBaselineCache.retainOwner('teacher'));
  assert.equal(await page.evaluate(()=>RosterBaselineCache.getSnapshot('smc','suspended')),null);assert.equal(await page.evaluate(()=>RosterBaselineCache.get('smc','model')),null);
  console.log('PASS changed account/role purges old models and draft snapshots');
  await page.evaluate(async()=>{for(let i=0;i<6;i++){await RosterBaselineCache.putSnapshot('teacher','stage'+i,{data:'data '+i});await new Promise(r=>setTimeout(r,2));}});
  const count=await page.evaluate(async()=>{let n=0;for(let i=0;i<6;i++)if(await RosterBaselineCache.getSnapshot('teacher','stage'+i))n++;return n;});assert.equal(count,4);
  await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+3*86400000;});assert.equal(await page.evaluate(()=>RosterBaselineCache.getSnapshot('teacher','stage5')),null);
  await page.evaluate(()=>RosterBaselineCache.removeOwner('teacher'));assert.equal(await page.evaluate(()=>RosterBaselineCache.get('teacher','legacy')),null);
  console.log('PASS snapshot retention cap, expiry and sign-out removal');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
