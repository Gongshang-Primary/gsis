const fs=require('fs'),assert=require('assert/strict'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM,headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://accounts.google.com/**',r=>r.abort());
 await page.route('https://gsis.local/**',r=>{const path=new URL(r.request().url()).pathname;return r.fulfill({path:'.'+path});});
 await page.goto('https://gsis.local/public/index.html');
 await page.evaluate(`state={versions:[{id:'qa603',name:'Synthetic Ledger preview',classes:[{ref:'c1',level:'1',shortName:'P'}],loads:Object.fromEntries([1,2,3,4,5,6].map(l=>[l,{Assembly:1,FTGP:2,FTT:2,EL:20}])),venues:[],groups:[],teachers:Array.from({length:35},(_,i)=>({id:'t'+i,name:'Teacher '+String(i+1).padStart(2,'0'),active:true,employment:i===0?'FAJT':i===1?'4/5':i===2?'RT':''})),assignments:Array.from({length:35},(_,i)=>({teacher:'t'+i,target:'1P',subject:'EL'})),audit:[]}]};current='qa603';role='Admin';token='qa';connectLive=()=>{};tab='Ledger';controls();render();`);
 await page.locator('.ledger-formula math').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>{const table=document.querySelector('.workload-ledger'),rows=[...table.tBodies[0].rows];return {tableTop:table.getBoundingClientRect().top,rowHeight:rows[0].getBoundingClientRect().height,visibleRows:rows.filter(r=>r.getBoundingClientRect().bottom<=innerHeight).length,formulaHeight:document.querySelector('.ledger-formula').getBoundingClientRect().height,internalScroll:[...document.querySelectorAll('#content *')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2).map(e=>e.className)}});
 assert.ok(metrics.visibleRows>=10,JSON.stringify(metrics));assert.ok(metrics.rowHeight<=32,JSON.stringify(metrics));assert.equal(await page.locator('.katex-error').count(),0);
 await page.getByRole('searchbox',{name:'Filter workload table text'}).fill('teacher 01');assert.equal(await page.locator('tr[data-load-status]:visible').count(),1);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.screenshot({path:'verification/603-ledger.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync('verification/603-browser.json',JSON.stringify(metrics,null,2));console.log(metrics);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
