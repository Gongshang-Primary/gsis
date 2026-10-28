'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  for(const mode of ['smc','ordinary']){
   const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<main id="content"></main>');
   for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
   for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
   await page.evaluate(async mode=>{
    const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.ctx.people.find(p=>p.id==='alice').mk='MK';f.ctx.people.find(p=>p.id==='bob').role='AM';f.ctx.people.find(p=>p.id==='charlie').groups=['Support'];
    if(mode==='ordinary'){f.ctx.user.smc=false;f.ctx.user.admin=false;}
    const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
    window.__mount=async name=>RosterOpsUI.render(name,{profile:f.profile,today:()=>f.ctx.today,cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),container:document.getElementById('content'),api:async(route,p)=>{
     const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});
     return p.operation==='saveAbsence'&&p.view==='report'?{...GSISRosterOperations.reportView(f.state,f.ctx,p),savedId:result.data.savedId,savedIds:result.data.savedIds}:result.data;
    }});
    await __mount('Report Absence');
   },mode);
   if(mode==='smc'){
    assert.equal(await page.locator('[data-teacher-search]').inputValue(),'','excluded logged-in SMC is not preselected');await page.locator('[data-teacher-search]').focus();
    const choices=await page.locator('[role="option"]').allTextContents();assert(!choices.includes('Alice Example'));assert(!choices.includes('Charlie Busy'));assert(choices.includes('Bob Colleague'),'AM without Support classification remains selectable');
    await page.locator('[role="option"]',{hasText:'Bob Colleague'}).click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();assert.equal(await page.evaluate(()=>__fixture.state.absences.length),0);await page.locator('[data-instructions-na]').click();await page.locator('[data-save-instructions]').click();
    await page.waitForFunction(()=>__fixture.state.absences.length===1);assert.equal(await page.evaluate(()=>__fixture.state.absences[0].staffId),'bob');assert.equal(await page.locator('[data-log-absence]').isVisible(),true,'compact save projection retains report controls');
   }else{
    assert.match(await page.locator('#content').innerText(),/staff category is not included/);assert.equal(await page.locator('[data-absence-form]').count(),0);
    await page.evaluate(()=>__mount('Manage reported absences'));assert.equal(await page.locator('[data-absence-form]').count(),0);assert.doesNotMatch(await page.locator('#content').innerText(),/staff category is not included/,'prior history remains accessible');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS Report Absence category choices, excluded self-report, compact save response and legacy management access at 390px.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
