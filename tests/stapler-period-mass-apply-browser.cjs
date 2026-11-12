'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright'),fixture=require('./helpers/stapler-period-fixture.cjs'),f=fixture(),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><main></main></body></html>'}));await page.goto('https://roster.test/');
  for(const name of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({path:path.join(root,'roster-update/public',name)});
  for(const name of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({path:path.join(root,name)});
  await page.evaluate(f=>{
   const clone=x=>JSON.parse(JSON.stringify(x)),v=window.f={...f,saved:clone(f.plan),revision:1,calls:[],editable:true};
   v.view=()=>({name:'Plan revision '+v.revision,date:f.day.date,today:f.day.date,plan:clone(v.saved),revision:v.revision,staplerRevision:v.revision,planningAllowed:v.editable,canEdit:v.editable,canConfirm:v.editable,confirmed:null,lock:{fence:1,mine:true,active:true,expiresAt:Date.now()+180000},people:f.people,accessRequests:[],nameBridges:[]});
   v.ctx={initialDate:f.day.date,today:()=>f.day.date,container:document.querySelector('main'),profile:{user:{admin:true,smc:true,email:'synthetic@school.test'}},status(){},api:async(_,p)=>{v.calls.push(clone(p));if(p.operation==='stapler')return v.view();if(p.operation==='saveStapler'){v.saved=clone(p.plan);v.revision++;return v.view();}throw Error(p.operation);}};
   return RosterStaplerUI.render(v.ctx);
  },f);
  assert.equal(await page.locator('[data-pane=teacher] thead [data-period-apply]').count(),3);
  assert.equal(await page.locator('[data-pane=class] tfoot [data-period-apply]').count(),3);
  const texts=()=>page.locator('[data-pane=teacher] [data-tile]').allTextContents(),before=await texts();
  await page.locator('[data-pane=teacher] [data-period-apply="2"]').click();await page.locator('dialog [name=venue]').fill('Room A');await page.locator('dialog .primary').click();assert.match(await page.locator('[data-stapler-message]').innerText(),/Applied to 1 lesson tile; 1 already matches/);await page.locator('[data-undo]').click();assert.deepEqual(await texts(),before);
  await page.locator('[data-pane=teacher] [data-period-apply="2"]').click();
  assert.equal(await page.locator('dialog [name=subject]').getAttribute('maxlength'),'500');
  await page.locator('dialog [name=venue]').fill('Assembly Hall');await page.locator('dialog [name=group]').fill('Whole school');
  await page.locator('dialog summary').click();await page.locator('dialog [name=classIds][value=a]').check();
  await page.locator('dialog .primary').click();assert.match(await page.locator('[data-stapler-message]').innerText(),/Applied to 2 lesson tiles/);
  assert.equal(await page.evaluate(()=>f.calls.filter(c=>c.operation==='saveStapler').length),0,'bulk apply stays local');
  assert.equal(await page.locator('[data-pane=teacher] [data-period="2"] [data-tile]').filter({hasText:'Assembly Hall'}).count(),2);
  await page.locator('[data-undo]').click();assert.deepEqual(await texts(),before,'one Undo restores the entire period');
  await page.locator('[data-redo]').click();await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved'));
  assert.equal(await page.locator('[data-period-apply]').count(),6,'arrows survive a server-driven redraw after Save');
  const saved=await page.evaluate(()=>f.saved);assert.equal(saved.tiles.length,f.plan.tiles.length);for(const t of saved.tiles){const old=f.plan.tiles.find(x=>x.id===t.id);if(t.kind==='lesson'&&t.period===2){assert.equal(t.venue,'Assembly Hall');assert.equal(t.group,'Whole school');assert.deepEqual(t.classIds,['a']);}else assert.deepEqual(t,old);}
  await page.locator('[data-pane=class] [data-period-apply="2"]').click();await page.locator('dialog [name=venue]').fill('Assembly Hall');await page.locator('dialog .primary').click();assert.match(await page.locator('[data-dialog-message]').innerText(),/Already matches all 2/);await page.locator('[data-dialog-close]').click();
  await page.locator('[data-pane=class] [data-period-apply="2"]').click();await page.locator('dialog summary').click();await page.locator('dialog [name=customClass]').fill('Assembly');await page.locator('dialog [data-add-custom-class]').click();await page.locator('dialog .primary').click();assert(await page.locator('[data-pane=teacher] [data-period="2"] [data-tile]').filter({hasText:'Assembly'}).count()===2);await page.locator('[data-undo]').click();await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved'));assert(!(await page.evaluate(()=>f.saved.classes)).some(c=>c.name==='Assembly'),'Undo removes the custom class along with the tile changes');
  await page.screenshot({path:'/tmp/stapler-period-mass-apply.png',fullPage:true});
  await page.evaluate(async()=>{RosterStaplerUI.unmount();f.editable=false;await RosterStaplerUI.render(f.ctx);});assert.equal(await page.locator('[data-period-apply]').count(),0,'read-only views expose no period apply control');
  assert.deepEqual(errors,[]);console.log('PASS Chromium period arrows in both views, optional fields, canonical class overwrite, counts, local-only apply, one-step Undo/Redo, custom-class Undo and read-only controls');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
