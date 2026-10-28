'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']}),results={};
 const historicalComparison=process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1';
 if(!historicalComparison)console.log('HISTORICAL COMPARISON NOT RUN: Git HEAD; current 150-teacher/2100-row refresh, identity and focus assertions remain active. Set GSIS_RUN_HISTORICAL_BENCHMARKS=1 to compare.');
 try{for(const mode of historicalComparison?['baseline','patched']:['patched']){
  const page=await browser.newPage({viewport:{width:1366,height:900}});await page.route('https://roster.test/**',r=>r.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  const path='roster-update/public/roster-operations-ui.js';await page.addScriptTag({content:mode==='baseline'?cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}):fs.readFileSync(path,'utf8')});
  results[mode]=await page.evaluate(async()=>{
   const date='2026-10-22',teachers=Array.from({length:150},(_,i)=>({staffId:'t'+i,name:'Teacher '+i,changed:true,notification:{state:'queued'},acknowledgement:{id:'n'+i,status:'pending'},rows:Array.from({length:14},(_,p)=>({period:p+1,subject:'EL',className:'4A',venue:'C1',kind:'relief',absentId:'a'+i%20,absentName:'Absent '+i%20}))}));
   let data={date,today:date,revision:1,publishedRevision:1,publishedAt:'2026-10-22T00:00:00Z',canPublish:true,canNotify:true,teachers},calls=0;await RosterOpsUI.render('Daily Notify',{profile:{user:{email:'smc@test',staffId:'smc',smc:true,admin:true}},today:()=>date,container:document.querySelector('#content'),api:async()=>{calls++;return structuredClone(data);},status(){}});
   const search=document.querySelector('[data-notify-search]'),card=document.querySelector('[data-notify-teacher=t1]').closest('article'),table=card.querySelector('table');search.value='Teacher';search.dispatchEvent(new Event('input'));search.focus();search.setSelectionRange(3,3);const elapsed=[];
   for(let i=0;i<5;i++){data.revision++;data.teachers[1].notification.state=i%2?'queued':'delivered';const start=performance.now();document.querySelector('[data-ops-refresh]').click();await new Promise(r=>setTimeout(r,0));elapsed.push(performance.now()-start);}
   const result={teachers:150,periodRows:2100,refreshes:5,calls,medianRefreshMs:Number(elapsed.sort((a,b)=>a-b)[2].toFixed(2)),sameSearch:search===document.querySelector('[data-notify-search]'),sameCard:card===document.querySelector('[data-notify-teacher=t1]').closest('article'),sameTable:table===document.querySelector('[data-notify-teacher=t1]').closest('article').querySelector('table'),focused:document.activeElement===search,caret:search.selectionStart};RosterOpsUI.unmount();return result;
  });await page.close();
 }assert.equal(results.patched.calls,6);assert.equal(results.patched.sameSearch,true);assert.equal(results.patched.sameCard,true);assert.equal(results.patched.sameTable,true);assert.equal(results.patched.focused,true);assert.equal(results.patched.caret,3);console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
