'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(4000);
  const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('https://roster.test');
  await page.evaluate(()=>{
   const NativeDate=Date;window.__clock=NativeDate.parse('2026-10-21T01:00:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[__clock]));}static now(){return __clock;}};
   window.__f={user:{email:'teacher@school.test',staffId:'teacher',smc:false,admin:false,accessVerified:true},rows:[],calls:0,hold:true,pending:[],fail:false};
   window.RosterTimetablePreload={create:()=>({start(){},clear(){},invalidate(){},isDue:()=>false,snapshot:()=>({phase:'ready'}),getBaseline:()=>({id:'base'})})};
   window.fetch=async(url,args={})=>{const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}'),ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
    if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};if(route==='session')return ok({});if(route==='profile')return ok({user:{...__f.user},revision:1,entries:[]});
    if(p.operation==='currentDuty')return ok({date:'2026-10-21',checkedAt:new Date().toISOString(),available:true,people:[]});
    if(p.operation==='read'&&p.view==='duties'){__f.calls++;const data={date:p.date,today:p.date,user:{...__f.user},myDuties:structuredClone(__f.rows)};if(__f.hold)await new Promise(resolve=>__f.pending.push(resolve));return __f.fail?{ok:false,status:503,json:async()=>({ok:false,error:'Unavailable'})}:ok(data);}
    throw Error('Unexpected route '+route+' '+p.operation);
   };
   window.RosterOpsUI={pages:()=>[{name:'My Relief Duties',icon:'relief-duties'}],unmount(){},resetPreloads(){},isDirty:()=>false,render:async(name,ctx)=>{await ctx.api('operations',{operation:'read',view:'duties',date:'2026-10-21'});ctx.container.innerHTML='<h2>'+name+'</h2>';}};
  });
  await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster.js','utf8')});await page.locator('.function-tile').first().waitFor();
  const own=page.locator('[data-home-own-relief]');await own.waitFor();assert.equal(await own.textContent(),'Checking your relief duty…');
  assert.match(await page.locator('[data-home-timetable]').textContent(),/^No suspended timetable today /);
  await page.evaluate(()=>{__f.hold=false;__f.pending.splice(0).forEach(f=>f());});await page.waitForFunction(()=>document.querySelector('[data-home-own-relief]')?.textContent==='You have no relief duty today.');
  assert.match(await page.locator('[data-current-duty]').textContent(),/^No SMC assigned to Relief Allocation today\./);
  await page.evaluate(()=>{__f.rows=[{staffId:'teacher',date:'2026-10-21',period:4,status:'published'},{staffId:'teacher',date:'2026-10-21',period:3,status:'completed'},{staffId:'teacher',date:'2026-10-21',period:4,status:'published'},{staffId:'other',date:'2026-10-21',period:9,status:'published'},{staffId:'teacher',date:'2026-10-20',period:8,status:'published'},{staffId:'teacher',date:'2026-10-21',period:2,status:'draft'},{staffId:'teacher',date:'2026-10-21',period:6,status:'published',noRelief:true}];});
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('[data-home-own-relief]')?.textContent==='Your relief duty today: P3, P4.');
  await own.locator('a').click();await page.waitForFunction(()=>document.querySelector('#content h2')?.textContent==='My Relief Duties');const before=await page.evaluate(()=>__f.calls);await page.locator('#nav [data-page="Home"]').click();await own.waitFor();assert.equal(await own.textContent(),'Your relief duty today: P3, P4.');assert.equal(await page.evaluate(()=>__f.calls),before,'returning Home reuses the already loaded own duties');
  await page.evaluate(()=>{__f.fail=true;});await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('[data-home-own-relief]')?.textContent==='Your relief duty could not be checked. Refresh to retry.');
  await page.evaluate(()=>{__f.fail=false;__f.hold=true;});await page.locator('#refresh').click();await page.waitForFunction(()=>__f.pending.length===1);await page.evaluate(()=>{__f.user={...__f.user,email:'new@school.test',staffId:'new'};__f.rows=[];});await page.locator('#refresh').click();await page.waitForFunction(()=>__f.pending.length===2);await page.evaluate(()=>__f.pending.shift()());await page.waitForTimeout(30);assert.equal(await own.textContent(),'Checking your relief duty…','old account response cannot populate the new account');await page.evaluate(()=>{__f.hold=false;__f.pending.splice(0).forEach(f=>f());});await page.waitForFunction(()=>document.querySelector('[data-home-own-relief]')?.textContent==='You have no relief duty today.');
  await browser.close();console.log('PASS Home wording, own loading/none/sorted duties/failure, existing-reader reuse and account isolation');
 }finally{if(browser.isConnected())await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
