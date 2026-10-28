'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(2000);page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');await page.route('**/*',r=>{const p='roster-update/public/'+new URL(r.request().url()).pathname.slice(1);return fs.existsSync(p)&&fs.statSync(p).isFile()?r.fulfill({path:p}):r.fulfill({contentType:'text/html',body:html});});await page.goto('https://roster.test');
  await page.addStyleTag({content:fs.readFileSync('roster-update/public/roster.css','utf8')});
  await page.evaluate(()=>{
   const NativeDate=Date;window.__clock=NativeDate.parse('2026-10-22T20:57:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[__clock]));}static now(){return __clock;}};
   const nativeInterval=setInterval;window.setInterval=(fn,ms)=>{if(ms===60000)window.__poll=fn;return nativeInterval(fn,ms);};
   window.__f={phase:'empty',plan:null,calls:[],base:{id:'base',name:'Baseline',from:'2026-10-01',to:'2026-11-30'}};
   window.RosterTimetablePreload={create:opts=>{window.__cacheStatus=opts.onStatus;return {start(){},clear(){},invalidate(){},isDue:()=>false,snapshot:()=>({phase:__f.phase}),getBaseline:()=>({entry:__f.base}),getPlan:()=>__f.plan};}};
   window.fetch=async(url,args={})=>{const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}');__f.calls.push({route,p});const ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};if(route==='session')return ok({});if(route==='profile')return ok({user:{email:'teacher@school.test',staffId:'teacher',smc:false,admin:false,accessVerified:true},revision:1,active:__f.base});if(p.operation==='currentDuty')return ok({date:'2026-10-23',available:true,people:[]});throw Error('Unexpected API '+route);};
  });
  await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster.js','utf8')});await page.locator('.function-tile').first().waitFor();
  const line=page.locator('[data-home-timetable]');assert.match(await line.textContent(),/Checking today/,'never label baseline before suspensions resolve');
  assert.equal(await line.evaluate(el=>{const h=document.querySelector('#content h2');return el.parentElement===h.parentElement&&el.getBoundingClientRect().left>=h.getBoundingClientRect().right;}),true,'status to the right of heading');assert.equal(await line.evaluate(el=>getComputedStyle(el).fontSize),'14px','status text formatting preserved');
  const calls=await page.evaluate(()=>__f.calls.length);
  await page.evaluate(()=>{__f.phase='ready';__cacheStatus({phase:'ready',to:'2026-11-22'});});assert.equal(await line.textContent(),'Normal timetable today Fri, 23 Oct 2026');
  for(const source of ['confirmed','published']){await page.evaluate(source=>{__f.plan={baselineId:'base',timetableDay:{source}};__cacheStatus({phase:'ready',to:'2026-11-22'});},source);assert.equal(await line.textContent(),'Suspended timetable in effect today Fri, 23 Oct 2026');}
  await page.screenshot({path:'/tmp/roster089b-home-suspended-mobile.png',fullPage:true});await page.setViewportSize({width:1366,height:900});assert.equal(await line.evaluate(el=>el.getBoundingClientRect().left>=document.querySelector('#content h2').getBoundingClientRect().right),true,'desktop status stays beside heading');await page.screenshot({path:'/tmp/roster089b-home-suspended-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{__f.plan={baselineId:'base',viewMode:'draft',timetableDay:null};__cacheStatus({phase:'ready',to:'2026-11-22'});});assert.match(await line.textContent(),/^Normal timetable/,'draft does not mean suspension in force');
  await page.evaluate(()=>{__f.plan={baselineId:'old',timetableDay:{source:'confirmed'}};__cacheStatus({phase:'ready',to:'2026-11-22'});});assert.equal(await line.textContent(),'Suspended timetable in effect today Fri, 23 Oct 2026','confirmed suspension remains active when its comparison baseline is replaced');
  await page.evaluate(()=>{__f.phase='empty';__cacheStatus({phase:'failed'});});assert.match(await line.textContent(),/could not be verified/);assert.equal(await page.evaluate(()=>__f.calls.length),calls,'status uses existing batch, no extra requests');
  await page.evaluate(()=>{__clock+=86400000;__poll();});assert.match(await line.textContent(),/Sat, 24 Oct 2026/,'Singapore day rollover');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/roster089a-home-mobile.png',fullPage:true});console.log('PASS home timetable: beside heading, normal/confirmed/published/draft, pending/error, retained confirmation across comparison-source replacement, Singapore rollover and no extra network.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
