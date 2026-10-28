'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const source=fs.readFileSync('roster-update/public/roster-baseline-cache.js','utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.route('https://cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Decoded cache</title>'}));await page.goto('https://cache.test');await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   window.generation=(key,subject)=>({schema:1,role:false,checkedAt:Date.now(),checkedDay:'2026-10-22',baseline:{sourceKey:'base-'+key,bytes:100,payload:{schema:1,stage:'baseline',from:'2026-10-22',to:'2026-11-21',modelKeys:{base:key},models:[{id:'base',contentKey:key,model:{subject}}],entries:[],dates:[]}},suspended:{sourceKey:'susp-'+key,bytes:20,payload:{schema:1,stage:'suspended',plans:[],planKeys:{},datesView:{dates:[]}}}});
   window.readRaw=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('gsis-roster-baselines',3);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['meta','contents'],'readonly'),out={};for(const name of ['meta','contents']){const q=tx.objectStore(name).getAll();q.onsuccess=()=>out[name]=q.result;}tx.oncomplete=()=>{db.close();resolve(out);};tx.onerror=()=>reject(tx.error);};});
  });
  assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('a',generation('one','English'))),true);
  let raw=await page.evaluate(()=>readRaw());assert.equal(raw.contents.length,1);assert.equal(raw.contents[0].value.subject,'English');assert(!raw.contents[0].value.data,'decoded objects are stored, not compressed envelopes');
  const first=await page.evaluate(()=>RosterBaselineCache.getGeneration('a'));assert.equal(first.baseline.payload.models[0].model.subject,'English');assert.deepEqual(first.suspended.payload.plans,[]);
  const interrupted=await page.evaluate(async()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='meta'&&value.id==='generation')throw Error('Simulated interrupted promotion');return original.call(this,value,...rest);};try{return await RosterBaselineCache.commitGeneration('a',generation('two','Mathematics'));}finally{IDBObjectStore.prototype.put=original;}});assert.equal(interrupted,false);
  assert.equal((await page.evaluate(()=>RosterBaselineCache.getGeneration('a'))).baseline.payload.models[0].model.subject,'English');raw=await page.evaluate(()=>readRaw());assert.equal(raw.contents.length,1,'failed promotion rolls back its content writes');
  console.log('PASS real IndexedDB atomic generation and interrupted promotion rollback');
  assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('a',generation('two','Mathematics'))),true);raw=await page.evaluate(()=>readRaw());assert.equal(raw.contents.length,2);assert.equal(raw.meta.find(r=>r.id==='previous-generation').value.baseline.refs[0].contentKey,'one');
  const result=await page.evaluate(async()=>{let contentPuts=0;const checkedAt=Date.now()+1000,original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='contents')contentPuts++;return original.call(this,value,...rest);};try{await RosterBaselineCache.commitGeneration('a',generation('two','Mathematics'));await RosterBaselineCache.markChecked('a',checkedAt);return {contentPuts,checkedAt,info:await RosterBaselineCache.getGenerationInfo('a')};}finally{IDBObjectStore.prototype.put=original;}});assert.equal(result.contentPuts,0);assert.equal(result.info.checkedAt,result.checkedAt);
  console.log('PASS unchanged content never rewrites payloads; check time updates metadata only');
  await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('gsis-roster-baselines',3);r.onsuccess=()=>{const db=r.result,tx=db.transaction('contents','readwrite'),store=tx.objectStore('contents'),q=store.get(['a','baseline:two']);q.onsuccess=()=>store.put({...q.result,value:null});tx.oncomplete=()=>{db.close();resolve();};};}));
  assert.equal(await page.evaluate(()=>RosterBaselineCache.getGeneration('a')),null);assert.equal(await page.evaluate(()=>RosterBaselineCache.commitGeneration('a',generation('two','Mathematics'))),true);assert.equal((await page.evaluate(()=>RosterBaselineCache.getGeneration('a')))?.baseline.payload.models[0].model.subject,'Mathematics');
  console.log('PASS corrupt immutable content is removed and a same-key online retry heals it');

  await page.reload();await page.addScriptTag({content:source});assert.equal((await page.evaluate(()=>RosterBaselineCache.getGeneration('a'))).baseline.payload.models[0].model.subject,'Mathematics');assert.equal(await page.evaluate(()=>RosterBaselineCache.getGeneration('b')),null);await page.evaluate(()=>RosterBaselineCache.retainOwner('b'));assert.equal(await page.evaluate(()=>RosterBaselineCache.getGeneration('a')),null);
  console.log('PASS reload restores decoded content and changed owner removes old content');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
