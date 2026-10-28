'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const code=fs.readFileSync('roster-update/public/roster.js','utf8');
const html='<!doctype html><title>Roster fixture</title>'+['account','navToggle','calculations','refresh','logout','status','nav','signin','content'].map(id=>'<div id="'+id+'"></div>').join('');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  async function fixture({smc=true,signedIn=true,date='2026-10-22'}={}){
   const page=await browser.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://route.test/**',route=>{
    const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.fulfill({contentType:'text/html',body:html});
    const name=url.pathname.slice(5),input=route.request().method()==='POST'?route.request().postDataJSON():{};calls.push({name,...input});
    const ok=data=>route.fulfill({json:{ok:true,data}});
    if(name==='config')return route.fulfill({json:{clientId:'fixture'}});
    if(name==='session'){if(route.request().method()==='POST'){signedIn=true;return ok({});}return signedIn?ok({}):route.fulfill({status:401,json:{ok:false,error:'Sign in'}});}
    if(name==='profile')return ok({revision:1,user:{email:'alice@gsps.edu.sg',staffId:'alice',accessVerified:true,smc,admin:false}});
    if(input.operation==='inboxList')return ok({alertCount:0});
    if(input.operation==='currentDuty')return ok({available:true,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()),checkedAt:new Date().toISOString(),people:[]});
    return ok({});
   });
   await page.goto('https://route.test/?date='+date+'#dailyNotify');
   await page.evaluate(()=>{
    window.__views=[];
    window.RosterOpsUI={pages:()=>[{name:'Daily Notify',icon:'daily',description:'Daily notifications',smc:true}],unmount(){},resetPreloads(){},isDirty:()=>false,render:async(name,ctx)=>{window.__views.push({name,date:ctx.initialDate});ctx.container.innerHTML='<h2>'+name+'</h2>';}};
    window.RosterStatisticsUI={unmount(){},render:async ctx=>{window.__stats={smc:ctx.profile.user.smc,api:typeof ctx.api};ctx.container.innerHTML='<h2>Statistics</h2>';}};
    window.google={accounts:{id:{initialize(o){window.__signIn=o.callback;},renderButton(host){host.textContent='Sign in';}}}};
   });
   await page.addScriptTag({content:code});
   return {page,calls,errors};
  }
  const smc=await fixture();await smc.page.waitForFunction(()=>__views.length===1);assert.deepEqual(await smc.page.evaluate(()=>__views),[{name:'Daily Notify',date:'2026-10-22'}]);assert(!smc.calls.some(c=>c.name==='operations'&&!['currentDuty','inboxList'].includes(c.operation)),'opening the link has no mutation side effect');assert.deepEqual(smc.errors,[]);await smc.page.close();
  console.log('PASS dated Daily Notify link opens the selected day after verified SMC authentication');
  const teacher=await fixture({smc:false});await teacher.page.locator('.function-tile').first().waitFor();assert.deepEqual(await teacher.page.evaluate(()=>__views),[]);assert.equal(await teacher.page.locator('[data-page="Statistics"]').count(),0);assert.equal(await teacher.page.locator('[data-page="Daily Notify"]').count(),0);assert.deepEqual(teacher.errors,[]);await teacher.page.close();
  console.log('PASS teacher role cannot open the SMC link or Statistics');
  const invalid=await fixture({date:'2026-02-30'});await invalid.page.locator('.function-tile').first().waitFor();assert.deepEqual(await invalid.page.evaluate(()=>__views),[]);await invalid.page.locator('[data-page="Statistics"]').click();assert.deepEqual(await invalid.page.evaluate(()=>__stats),{smc:true,api:'function'});assert.deepEqual(invalid.errors,[]);await invalid.page.close();
  console.log('PASS invalid date is ignored and the Statistics route uses its actual module contract');
  const signin=await fixture({signedIn:false});await signin.page.waitForFunction(()=>typeof __signIn==='function');assert.match(await signin.page.locator('#content').innerText(),/Sign in to open/);await signin.page.evaluate(()=>__signIn({credential:'fixture'}));await signin.page.waitForFunction(()=>__views.length===1);assert.equal(await signin.page.evaluate(()=>__views[0].date),'2026-10-22');assert.deepEqual(signin.errors,[]);await signin.page.close();
  console.log('PASS dated link survives the Google sign-in flow');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
