'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const path='roster-update/public/roster-operations-ui.js',sources={...(process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1'?{baseline:cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'})}:{}),patched:fs.readFileSync(path,'utf8')},results={};
  if(!sources.baseline)console.log('HISTORICAL COMPARISON NOT RUN: Git HEAD; current 150-teacher/2100-period tab-switch assertions remain active. Set GSIS_RUN_HISTORICAL_BENCHMARKS=1 to compare.');
  for(const [name,source]of Object.entries(sources)){
   const page=await browser.newPage();await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');await page.addScriptTag({content:source});
   results[name]=await page.evaluate(async()=>{
    let calls=0;const date='2026-10-20',teachers=Array.from({length:150},(_,i)=>({staffId:'t'+i,name:'Teacher '+i,changed:true,rows:Array.from({length:14},(_,p)=>({period:p+1,subject:'EL',className:'4A',venue:'C1',kind:'relief',absentId:'a'+i%20,absentName:'Absent '+i%20}))}));
    const data={date,today:date,revision:1,allocationRevision:1,publishedRevision:1,canPublish:true,publishedAt:'2026-10-20T00:00:00Z',teachers};
    await RosterOpsUI.render('Daily Notify',{profile:{revision:1,user:{email:'test@example.invalid',staffId:'t1',smc:true,admin:true}},today:()=>date,initialDate:date,api:async()=>{calls++;return data;}});
    const relief=document.querySelector('[data-notify-tab=relief]'),absent=document.querySelector('[data-notify-tab=absent]');absent.click();relief.click();const original=document.querySelector('[data-notify-teacher=t1]');
    const before=calls,times=[];for(let i=0;i<12;i++){const start=performance.now();absent.click();relief.click();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
    const result={teachers:150,changedPeriods:2100,tabSwitchPairs:12,medianPairMs:Number(times[6].toFixed(2)),extraRequests:calls-before,reusedCard:document.querySelector('[data-notify-teacher=t1]')===original};RosterOpsUI.unmount();return result;
   });assert.equal(results[name].extraRequests,0);await page.close();
  }
  assert.equal(results.patched.reusedCard,true);console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
