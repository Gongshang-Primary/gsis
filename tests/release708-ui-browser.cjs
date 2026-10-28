'use strict';
// Browser proof for publication document flow, native choices, branding and hover.
// Synthetic staff only; publication is intercepted locally and no live API is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']}),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(6000);
 await page.route('**/*',route=>{const url=new URL(route.request().url()),folder=url.hostname==='roster.test'?'roster-update/public':'public',file=path.join(root,folder,url.pathname);if(/\.(png|ico|svg)$/.test(file)&&fs.existsSync(file))return route.fulfill({path:file});return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});});
 try{
  await page.goto('https://deploy.test/');
  await page.setContent(read('public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''));
  for(const f of ['public/styles.css','shared/table-viewport.css'])await page.addStyleTag({content:read(f)});
  await page.addScriptTag({content:read('public/app.js').replace(/controls\(\);startSignIn\(\);\s*$/,'')});
  await page.evaluate(()=>{
   window.alert=message=>{throw Error(message)};window.confirm=()=>true;window.fixture={writes:[]};
   state={versions:[{id:'v1',status:'active',name:'2026 current planning',classes:[],loads:{},venues:[],groups:[],teachers:[],assignments:[],levelExclusions:[],audit:[]}]};
   current='v1';role='Admin';token='fixture';connectLive=()=>{};tab='Versions';render();
   api=async()=>({fields:['Basic Name','Role','Employment Modifier','Active'],changes:Array.from({length:12},(_,i)=>({id:'teacher-'+i,expected:{'Basic Name':'Teacher '+i,Role:'Teacher','Employment Modifier':'FAJT',Active:'Y'},values:{'Basic Name':'Teacher '+i,Role:'Teacher','Employment Modifier':'FAJT',Active:'N'}}))});
   acquire=async()=>{};change=async(operation,payload)=>{fixture.writes.push({operation,payload})};
   // The real row button is the editor anchor; publication must leave that cell.
   const button=document.querySelector('[data-version-action="publish"]');button.onclick=()=>reviewTeacherPublication();button.click();
  });
  await page.addScriptTag({content:read('shared/table-viewport.js')});
  await page.waitForSelector('#content > .publication-review');
  await page.waitForFunction(()=>!document.body.classList.contains('single-table-page'));
  assert.equal(await page.locator('.publication-review iframe,.publication-review .search-select').count(),0);
  assert.equal(await page.locator('.publication-review select[data-native]').count(),12);
  assert(await page.locator('.publication-review').evaluate(el=>el.getBoundingClientRect().width>innerWidth*.9));
  assert.match(await page.locator('.publication-review').innerText(),/Publishing 2026 current planning/);
  await page.locator('.publication-review select').first().selectOption('deploy');
  for(const size of [{width:1280,height:720},{width:800,height:480}]){
   await page.setViewportSize(size);
   await page.locator('.publication-review #ok').scrollIntoViewIfNeeded();
   assert(await page.locator('.publication-review #ok').isVisible());
   assert(await page.evaluate(()=>scrollY>0),'document scroll exposes final action');
   assert.equal(await page.locator('.publication-review select').first().inputValue(),'deploy','scroll/resize retains choice');
   assert(await page.evaluate(()=>[...document.querySelectorAll('#content,.publication-review,.publication-review form')].every(el=>el.scrollHeight<=el.clientHeight+1)),'review has no independently clipped vertical container');
  }
  await page.locator('.publication-review #ok').click();
  assert.equal(await page.evaluate(()=>fixture.writes.length),0,'required unresolved choices block publication');
  for(const select of await page.locator('.publication-review select').all())await select.selectOption('contacts');
  await page.locator('.publication-review select').first().selectOption('deploy');
  await page.locator('.publication-review h3').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'verification/708-publish-review.png'),fullPage:true});
  await page.locator('.publication-review #ok').click();
  await page.waitForSelector('.publication-review',{state:'detached'});
  const writes=await page.evaluate(()=>fixture.writes);assert.equal(writes.length,1);assert.equal(writes[0].operation,'publish');assert.equal(writes[0].payload.contactApprovals.length,12);assert.equal(writes[0].payload.contactApprovals[0].values.Active,'N');assert.equal(writes[0].payload.contactApprovals[1].values.Active,'Y');
  // The single-difference case previously opened/focused the custom chooser.
  await page.evaluate(()=>{api=async()=>({fields:['Active'],changes:[{id:'one',expected:{Active:'Y'},values:{Active:'N'}}]});return reviewTeacherPublication()});
  await page.waitForSelector('.publication-review select');assert.equal(await page.locator('.publication-review .search-select').count(),0);await page.locator('.publication-review [data-cancel]').click();assert.equal(await page.evaluate(()=>fixture.writes.length),1,'cancel does not publish');
  await page.evaluate(()=>GSISTableDispose());
  await page.goto('https://roster.test/');
  await page.setContent(read('roster-update/public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''));
  await page.addStyleTag({content:read('roster-update/public/roster.css')});
  await page.evaluate(()=>{
   window.RosterOpsUI={pages:()=>[{name:'Assign Relief',icon:'relief',description:'Assign cover',smc:true}],preload:async()=>{},resetPreloads(){},unmount(){},isDirty:()=>false};
   window.fetch=async url=>({ok:true,status:200,json:async()=>String(url).endsWith('/config')?{clientId:'fixture'}:{ok:true,data:String(url).endsWith('/profile')?{revision:1,user:{email:'test@gsps.edu.sg',staffId:'t',smc:true,admin:true,accessVerified:true},entries:[]}:{} }});
  });
  await page.addScriptTag({content:read('roster-update/public/roster.js')});
  const tile=page.locator('.function-tile[data-page="Assign Relief"]');await tile.waitFor();await page.setViewportSize({width:1280,height:720});await page.mouse.move(0,0);
  assert.equal(await tile.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');await tile.hover();assert.equal(await tile.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(229, 243, 233)');await page.mouse.move(0,0);assert.equal(await tile.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');await page.keyboard.press('Tab');await tile.focus();assert(await tile.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));assert.equal(await tile.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','keyboard focus is independent of hover fill');
  const folders=['public','contacts-update/public','layout-update/public','roster-update/public','calendar-update/public'];
  for(const folder of folders){
   const html=read(folder+'/index.html');for(const file of ['favicon.ico','favicon-16.png','favicon-32.png']){assert(html.includes('/'+file+'?v='));assert(fs.readFileSync(path.join(root,folder,file)).equals(fs.readFileSync(path.join(root,'public',file))));}
  }
  assert.deepEqual(errors,[]);console.log('PASS 708 browser: full-page publication review, native choices, required validation, preserved scroll choices, unchanged publication payload, cancel, single-choice review, neutral Assign Relief hover/focus and identical five-app favicon assets.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
