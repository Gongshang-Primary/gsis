'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),zlib=require('node:zlib');
const {harness}=require('./roster097-batch-backend.cjs');
(async()=>{
 const h=harness();h.scope.rosterOperationsPhase_=(_,fn)=>fn();h.scope.Utilities.base64Decode=v=>[...Buffer.from(v,'base64')];h.scope.Utilities.ungzip=b=>h.scope.Utilities.newBlob(zlib.gunzipSync(Buffer.from(b.getBytes())));h.record(h.today,{confirmed:true});
 Object.assign(h.state,h.scope.rosterOperationsUnpackPlans_(JSON.parse(JSON.stringify(h.scope.rosterOperationsPackPlans_(h.state)))));h.scope.rosterOperationsState_=()=>h.state;h.contacts.user.rosterSMC=false;
 const part=h.scope.rosterTimetablePart_(h.model);h.scope.rosterModelPart_=()=>part;h.scope.rosterTimetableBatchCommitEnd_(h.scope.rosterTimetableBatchCommitBegin_(h.state));
 let gzip=0;const compress=h.scope.Utilities.gzip;h.scope.Utilities.gzip=b=>{gzip++;return compress(b);};const calls=[];
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||path.resolve(__dirname,'../../browser-runtime-v084/extracted/chromium'),args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fixture.test/**',route=>{if(new URL(route.request().url()).pathname==='/batch'){const p=route.request().postDataJSON();calls.push(p);return route.fulfill({json:h.call(p)});}return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Prepared timetable transport</title>'});});
  await page.goto('https://fixture.test/');await page.addScriptTag({content:fs.readFileSync('shared/roster.js','utf8')});await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster-timetable-preload.js','utf8')});
  const result=await page.evaluate(async today=>{const cache=RosterTimetablePreload.create({api:async(_,p)=>(await fetch('/batch',{method:'POST',body:JSON.stringify(p)})).json(),scope:()=> 'school|alice|teacher',today:()=>today});const status=await cache.start();return {status,baseline:cache.getBaseline(today)?.model.teacherCount,mode:cache.getPlan(today)?.viewMode,hasDraft:JSON.stringify(cache.getPlan(today)).includes('Unconfirmed lesson')};},h.today);
  assert.equal(result.status.phase,'ready');assert.equal(result.baseline,h.model.teacherCount);assert.equal(result.mode,'confirmed');assert.equal(result.hasDraft,false);assert(calls.every(p=>p.encoding==='gzip-parts-v1'));assert.equal(gzip,0);assert.deepEqual(errors,[]);
  console.log('PASS Chromium native decompression and SHA verification hydrate prepared source pieces without a backend repack');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
