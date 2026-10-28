const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM||'/workspace/scratch/2c52ae6e6b97/browser-runtime-v089/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.resolve('docs/GSiS-v0.8.9-User-Manual.html'));
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('section#calendar').count(),1);
 await page.locator('#query').fill('venue assignments');
 assert(await page.locator('#deploy-settings').isVisible());
 assert(!(await page.locator('#calendar').isVisible()));
 await page.locator('#clear-search').click();assert(await page.locator('#calendar').isVisible());
 assert.equal(await page.locator('a[href="GSiS-v0.8.9-Architecture.html"]').count(),1);
 await page.screenshot({path:'docs/reviews/v089/manual-desktop.png'});
 for(const [width,height,zoom] of [[1440,1000,1],[390,844,1],[720,1000,2]]){
  await page.setViewportSize({width,height});
  const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  assert(widths.scroll<=widths.client+1,JSON.stringify({width,height,zoom,widths}));
  results.push({width,height,browserZoomEquivalent:zoom,overflow:false});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.getElementById('contents').open=false;window.scrollTo(0,0)});await page.screenshot({path:'docs/reviews/v089/manual-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.spinner').evaluate(e=>getComputedStyle(e).animationName),'none');
 const duplicateIds=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);return ids.filter((x,i)=>ids.indexOf(x)!==i)});assert.deepEqual(duplicateIds,[]);
 const broken=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(broken,[]);
 assert.deepEqual(errors,[]);
 const data={version:'0.8.9',checkedAt:new Date().toISOString(),manualBytes:fs.statSync('docs/GSiS-v0.8.9-User-Manual.html').size,checks:['no embedded architecture runtime','search hides irrelevant sections','clear search restores sections','relative architecture link','unique IDs','valid in-page links','reduced motion','no runtime errors'],viewports:results};fs.writeFileSync('docs/reviews/v089/manual-browser-check.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
