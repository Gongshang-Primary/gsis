'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
  for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
  await page.evaluate(()=>{
   const f=__fixture,O=GSISRosterOperations,S=GSISRosterStapler;f.setClock(f.ctx.today+'T06:00:00+08:00');
   let plan=S.create({...f.day,date:f.ctx.today});plan=S.apply(plan,{type:'move',tileId:'baseline:alice:4',period:5});f.state.staplerPlans.push({date:f.ctx.today,baselineId:'baseline',draft:plan,confirmed:true,revision:1});
   f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice <img src=x onerror="window.__xss=true">',typeId:'mc',typeLabel:'MC <script>bad()</script>',periods:[2,3,5],reliefRequired:true,instructions:{},instructionsNA:true});
   const ds=O.demand(O.composeStaplerContext(f.state,f.ctx),f.state,f.ctx.today);
   for(const period of [2,3]){const d=ds.find(d=>d.period===period);f.state.assignments.push({...d,id:'cover-'+period,demandId:d.id,staffId:period===2?'bob':null,relieverName:'Bob Colleague',absentId:'alice',absentName:'Alice Teacher',noRelief:period===3,status:'draft'});}
   window.__requests=[];window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),status(){},api:async(route,p)=>{__requests.push(structuredClone(p));if(O.READS.includes(p.operation)){const ctx=O.composeStaplerContext(f.state,f.ctx),data=O.read(f.state,ctx,p);if(p.operation==='read'&&p.view==='allocation')data.exportContext=O.dailyExport(f.state,ctx,{date:p.date,fullTeachers:true});return data;}const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}};
   return RosterOpsUI.render('Assign Relief',__opsContext);
  });
  assert.deepEqual(await page.locator('.ops-freshness button').allTextContents(),['Save to online','Export Class POV','Absent Teachers','Relief Load','Refresh records']);
  assert.deepEqual(await page.locator('.ops-day-actions button').allTextContents(),['Quiet mode','Let teachers see and send WhatsApp to all','Send WhatsApp to all affected','Let teachers see','Export Excel','Export relief excel']);
  assert.equal(await page.locator('[data-save-online]').count(),1,'Save appears once');assert.equal(await page.locator('.ops-day-actions [data-save-online]').count(),0);assert.equal(await page.locator('[data-save-online]').evaluate(el=>el.closest('.ops-freshness').previousElementSibling.matches('.page-heading')&&el.getBoundingClientRect().top>document.querySelector('[data-notify-mode=all]').getBoundingClientRect().bottom),true,'Save follows the publication row');assert.equal(await page.locator('.ops-day-actions [data-publish-relief][data-notify-mode=all].primary').count(),1);assert.equal(await page.locator('.ops-day-actions [data-notify-all]').count(),1);assert.equal(await page.locator('.ops-day-actions [data-publish-relief][data-notify-mode=none]').count(),1);
  for(const control of await page.locator('.ops-day-actions button,.ops-freshness button').evaluateAll(bs=>bs.map(b=>({combined:b.dataset.notifyMode==='all',height:b.getBoundingClientRect().height,fits:b.scrollHeight<=b.clientHeight})))){if(control.combined){assert(control.height>=40,'the full combined label can wrap above the compact minimum');assert(control.fits,'the exact combined label is not clipped');}else assert.equal(control.height,40,'other desktop controls retain their compact height');}
  if(process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT)await page.screenshot({path:process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT.replace('.png','-desktop.png')});
  const before=await page.evaluate(()=>__requests.length);
  await page.getByRole('button',{name:'Absent Teachers',exact:true}).click();
  const absent=page.locator('dialog tbody tr');assert.equal(await absent.count(),1);
  assert.deepEqual(await absent.locator('td').allTextContents(),['MC <script>bad()</script>','P2–P3, P5','3','1','1','1']);
  assert.equal(await page.locator('dialog img,dialog script').count(),0);assert.equal(await page.evaluate(()=>!!window.__xss),false);
  if(process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT)await page.screenshot({path:process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT.replace('.png','-summary.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.getByRole('button',{name:'Absent Teachers',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Relief Load',exact:true}).click();
  assert.deepEqual(await page.locator('dialog tbody tr td').allTextContents(),['1','P2','Alice <img src=x onerror="window.__xss=true">']);assert.match(await page.locator('dialog').textContent(),/Current local allocations/);
  await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.evaluate(()=>__requests.length),before,'summary buttons reuse loaded data without another backend call');
  // The class export requests one current saved snapshot and never downloads the weekly baseline.
  await page.evaluate(()=>{window.__bookData=null;window.RosterStaplerExport={makeClassWorkbook:async data=>{window.__bookData=data;return {blob:new Blob(['test']),filename:'Class POV.xlsx'};}};HTMLAnchorElement.prototype.click=function(){window.__download=this.download;};__opsContext.localTimetable=()=>{throw Error('Class POV must not fetch baseline');};});
  await page.getByRole('button',{name:'Export Class POV',exact:true}).click();await page.waitForFunction(()=>__download==='Class POV.xlsx');
  assert.equal(await page.evaluate(()=>__bookData.teacherSummary.plan.tiles.find(t=>t.id==='baseline:alice:4').period),5);
  assert.equal(await page.evaluate(()=>__requests.filter(p=>p.operation==='exportDaily').length),0,'export uses cached local context');
  // The summaries remain useful for a date with no assignments.
  await page.evaluate(()=>{__fixture.state.assignments=[];});await page.getByRole('button',{name:'Refresh records',exact:true}).click();await page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
  await page.getByRole('button',{name:'Relief Load',exact:true}).click();assert.match(await page.locator('dialog').textContent(),/No relief periods assigned/);await page.keyboard.press('Escape');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   for(const h of await page.locator('.ops-day-actions button,.ops-freshness button').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().height)))assert(h>=44,'touch action rows have at least 44px controls');
   const overflow=await page.locator('.ops-freshness,.ops-day-actions').evaluateAll(els=>els.some(el=>el.getBoundingClientRect().right>innerWidth));assert.equal(overflow,false,'toolbar stays inside phone viewport');
   await page.getByRole('button',{name:'Absent Teachers',exact:true}).click();assert.equal(await page.locator('dialog').evaluate(el=>el.getBoundingClientRect().width<=innerWidth),true);await page.keyboard.press('Escape');
  }
  if(process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT)await page.screenshot({path:process.env.ROSTER_RELIEF_TOOLS_SCREENSHOT});
  assert.deepEqual(errors,[]);console.log('v0.7.19 relief tools browser: saved suspended summaries, empty data, export route, escaping, keyboard focus and desktop/mobile toolbar passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
