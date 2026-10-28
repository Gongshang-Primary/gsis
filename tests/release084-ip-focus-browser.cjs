'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const read=p=>process.env.GSIS_IP_FOCUS_BASELINE==='true'&&['public/app.js','public/ip-cell-anchor.js'].includes(p)?require('node:child_process').execFileSync('git',['show','v0.8.3:'+p],{encoding:'utf8'}):fs.readFileSync(p,'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('https://deploy.test/');
  await page.setContent(read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''));
  for(const p of ['public/styles.css','shared/table-viewport.css'])await page.addStyleTag({content:read(p)});
  await page.addScriptTag({content:read('public/ip-cell-anchor.js')});
  await page.addScriptTag({content:read('public/app.js').replace(/controls\(\);startSignIn\(\);\s*$/,'')});
  await page.evaluate(()=>{
   window.alert=m=>{throw Error(m)};window.confirm=()=>true;
   const classes=Array.from({length:40},(_,i)=>({ref:'class'+i,level:'1',name:'Class '+i,shortName:'C'+i}));
   state={versions:[{id:'v1',status:'active',name:'Fixture',cceELScope:true,classes,loads:{'1':{TTT:2,Assembly:1,FTGP:2,FTT:2,EL:15,CL:12,ML:12,TL:12}},venues:classes.map((c,i)=>({id:'Room'+i,form:'1C'+i})),groups:[],teachers:[{id:'t',name:'Test Teacher',active:true}],assignments:classes.map((c,i)=>({id:'assignment'+i,subject:'EL',target:'1C'+i,teacher:'t'})),levelExclusions:[],audit:[]}]};
   current='v1';role='Admin+KP';token='fixture';connectLive=()=>{};tab='IP Deploy';render();
  });
  await page.addScriptTag({content:read('shared/table-viewport.js')});
  await page.waitForFunction(()=>document.querySelector('#content .scroll')?.classList.contains('table-window'));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>{let n=0;const tick=()=>++n===16?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}));
  const remove=page.locator('[data-row="1C30"] [data-remove]');await remove.scrollIntoViewIfNeeded();await remove.focus();
  const before=await page.locator('#content .scroll').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));assert(before.top>100,'fixture reaches a lower table row');
  await page.keyboard.press('Enter');await settle();
  const after=await page.evaluate(()=>({top:document.querySelector('#content .scroll').scrollTop,left:document.querySelector('#content .scroll').scrollLeft,row:document.activeElement.closest('tr')?.dataset.row}));
  assert(Math.abs(after.top-before.top)<90,'removing an assignment retains the edited row near its original viewport position');assert.equal(after.row,'1C30');
  const add=page.locator('[data-target="1C30"][data-sub="EL"]');await add.click();await page.locator('.search-select[open] .select-choices button').first().click();await settle();
  assert.equal(await page.evaluate(()=>document.activeElement.closest('tr')?.dataset.row),'1C30','teacher selection returns to the same logical cell');assert(await page.locator('#content .scroll').evaluate(el=>el.scrollTop)>100);
  // A background/full refresh preserves table scroll without stealing toolbar focus.
  await page.locator('#refresh').evaluate(el=>{el.hidden=false;el.focus({preventScroll:true});});
  const saved=await page.locator('#content .scroll').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));
  await page.evaluate(()=>render());await settle();assert.equal(await page.locator('#content .scroll').evaluate(el=>el.scrollTop),saved.top);assert.equal(await page.evaluate(()=>document.activeElement.id),'refresh');
  // User input cancels deferred restoration; changing tabs never restores the prior cell.
  await page.evaluate(()=>render());await page.waitForFunction(()=>{const el=document.querySelector('#content .scroll');return el.scrollHeight>el.clientHeight;});await page.evaluate(()=>{document.dispatchEvent(new WheelEvent('wheel'));document.querySelector('#content .scroll').scrollTop=90;});await settle();assert.equal(await page.locator('#content .scroll').evaluate(el=>el.scrollTop),90);
  await page.evaluate(()=>{render();tab='Versions';render();});await settle();assert.equal(await page.locator('#content').getAttribute('data-view'),'Versions');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{tab='IP Deploy';render();});await settle();const mobile=page.locator('[data-row="1C29"] [data-remove]');await mobile.scrollIntoViewIfNeeded();await mobile.focus();const mobileTop=await page.locator('#content .scroll').evaluate(el=>el.scrollTop);await page.keyboard.press('Enter');await settle();assert.equal(await page.evaluate(()=>document.activeElement.closest('tr')?.dataset.row),'1C29');assert(Math.abs((await page.locator('#content .scroll').evaluate(el=>el.scrollTop))-mobileTop)<90,'mobile lower row stays in place');
  assert.deepEqual(errors,[]);console.log('PASS IP Deploy edits preserve lower-row scroll/focus; refresh retains toolbar focus; user scrolling and navigation cancel restoration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
