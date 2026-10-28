'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();let html=fs.readFileSync('calendar-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  html=html.replace('</head>','<style>'+fs.readFileSync('calendar-update/public/styles.css','utf8')+'</style></head>');await page.route('https://calendar.test/**',route=>route.fulfill(route.request().url().endsWith('/gsps-calendar-logo.png')?{contentType:'image/png',body:fs.readFileSync('calendar-update/public/gsps-calendar-logo.png')}:{contentType:'text/html',body:html}));await page.goto('https://calendar.test/');
  const app=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/, 'window.testHeaderMeasure=trackCalendarHeaderHeight;window.testActivatePage=activatePage;window.testBirthdayAccess=(isAdmin)=>{state.data={actor:{isAdmin},years:[],events:[],pendingRemovals:[]};state.year=2026;renderDirtyPill();};})();');await page.addScriptTag({content:app});await page.evaluate(()=>window.testHeaderMeasure());
  await page.evaluate(()=>{document.querySelector('#loginView').classList.add('hidden');document.querySelector('#appView').classList.remove('hidden');for(const b of document.querySelectorAll('.topbar button,.topbar select,#pullBirthdaysBtn,#birthdayActions'))b.classList.remove('hidden');document.querySelector('#identity').textContent='School Calendar Administrator';document.querySelector('#yearSelect').innerHTML='<option>2026 · Current year</option>';document.querySelector('#dirtyPill').classList.remove('hidden');document.querySelector('#dirtyPill').textContent='Staff: 12 awaiting sync · Parent: 3 awaiting sync';document.querySelector('.topbar-brand-logo').style.width='21px';});
  assert.equal(await page.locator('#page-people #birthdayActions').count(),1);
  for(const isAdmin of [true,false]){
   await page.evaluate(isAdmin=>window.testBirthdayAccess(isAdmin),isAdmin);
   for(const tab of ['people','weekly','events','stats','parent','yearSetup','columns','glossary','formatting','urls']){
    await page.evaluate(tab=>window.testActivatePage(tab),tab);
    assert.equal(await page.locator('#pullBirthdaysBtn').isVisible(),isAdmin&&tab==='people',`Birthday visibility for admin=${isAdmin}, page=${tab}`);
   }
  }
  await page.evaluate(()=>{window.testBirthdayAccess(true);window.testActivatePage('people');});
  for(const width of [390,660,800,1024,1440])for(const bounded of [false,true]){
   await page.setViewportSize({width,height:900});await page.evaluate(bounded=>{document.documentElement.classList.toggle('calendar-layout',bounded);document.body.classList.toggle('calendar-layout',bounded);},bounded);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const result=await page.evaluate(()=>{const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {screen:innerWidth,body:document.documentElement.scrollWidth,bar:document.querySelector('.topbar').scrollWidth,clipped:[...document.querySelectorAll('.topbar .sync-button')].filter(el=>el.scrollHeight>el.clientHeight).map(el=>el.id),birthday:rect('#pullBirthdaysBtn'),header:rect('.topbar'),nav:rect('#nav')};});
   assert.deepEqual(result.clipped,[],'All publishing button labels must fit their button');assert(result.body<=width,JSON.stringify({width,bounded,...result}));assert(result.birthday.left>=0&&result.birthday.right<=width,'Birthday action remains visible');assert(result.birthday.height>=32,'Birthday action keeps usable touch height');assert(result.nav.top>=result.header.bottom,'Header and nav cannot overlap');
   if(!bounded){await page.evaluate(()=>{document.querySelector('main').style.minHeight='1800px';window.scrollTo(0,200);});const sticky=await page.evaluate(()=>({headerBottom:document.querySelector('.topbar').getBoundingClientRect().bottom,navTop:document.querySelector('#nav').getBoundingClientRect().top}));assert(sticky.navTop>=sticky.headerBottom,'Sticky nav must follow wrapped header after scrolling');await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('main').style.minHeight='';});}
   if(bounded&&process.env.GSIS_CAPTURE_UI){fs.mkdirSync('verification/0810-ui',{recursive:true});await page.screenshot({path:`verification/0810-ui/calendar-birthday-${width}.png`});}
  }
  console.log('PASS Calendar birthday responsive action: 390/660/800/1024/1440px, People & Roles only, Admin access preserved, full Admin toolbar, dirty status, normal and bounded calendar layouts without document overflow or header overlap');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
