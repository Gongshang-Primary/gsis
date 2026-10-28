'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 async function setup(own=false){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
  await page.setContent('<main id="content"></main>');for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');window.__writes=0;window.__receiptSeen=false;window.__heldRead=false;
   window.__ctx={container:document.getElementById('content'),profile:f.profile,today:()=>f.ctx.today,api:async(route,p)=>{
    if(p.operation==='saveAbsence')__writes++;
    if(p.operation==='read'&&__receiptSeen&&!__heldRead){__heldRead=true;await new Promise((resolve,reject)=>{window.__resolveRead=resolve;window.__rejectRead=()=>reject(Object.assign(Error('Synthetic optional refresh failure'),{status:503}));});}
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});
    if(p.operation==='receiptStatus')__receiptSeen=true;return value.data;
   }};await RosterOpsUI.render('Report Absence',__ctx);
  });
  await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();await page.evaluate(()=>__fixture.fail='after-save');
  if(own){await page.locator('[data-own-arrangements]').click();await page.locator('[data-colleague-filter]').waitFor();assert.equal(await page.evaluate(()=>__writes),0);await page.locator('[data-close-dialog]').click();}else await page.locator('[data-instructions-na]').click();await page.locator('[data-save-instructions]').click();await page.locator('[data-retry-save]').waitFor();await page.locator('[data-retry-save]').click();await page.waitForFunction(()=>__heldRead);
  assert.match(await page.locator('[data-dialog-message], [data-ops-message]').allTextContents().then(x=>x.join(' ')),/Saved absence confirmed/);
  assert.equal(await page.locator('[data-retry-save]').count(),0,'receipt removes uncertain save action before optional refresh');
  assert.equal(await page.locator('[data-ops-body]').evaluate(el=>el.inert),false,'optional read does not freeze the form');
  assert.equal(await page.evaluate(()=>__writes),1,'receipt retry does not resend the write');assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);
  return page;
 }
 try{
  const success=await setup();assert.equal(await success.locator('[name="typeId"]').isEnabled(),true);await success.evaluate(()=>__resolveRead());await success.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');assert.match(await success.locator('[data-ops-message]').innerText(),/Saved absence confirmed/);assert.equal(await success.locator('[data-instructions-na]').count(),1);await success.close();
  const failed=await setup();await failed.evaluate(()=>__rejectRead());await failed.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');assert.match(await failed.locator('[data-ops-message]').innerText(),/Saved absence confirmed\. Current records could not refresh/);assert.equal(await failed.locator('[data-retry-save]').count(),0);assert.equal(await failed.evaluate(()=>__writes),1);await failed.close();
  const changed=await setup();await changed.locator('[name="reliefRequired"]').selectOption('no');await changed.evaluate(()=>__resolveRead());await changed.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');assert.equal(await changed.locator('[name="reliefRequired"]').inputValue(),'no','background receipt refresh keeps new local edits');assert.match(await changed.locator('[data-absence-form]').innerText(),/Nothing is saved yet/);assert.equal(await changed.evaluate(()=>__writes),1);await changed.close();
  const own=await setup(true);assert.equal(await own.locator('dialog').count(),0,'saving never reopens the closed draft chooser');await own.evaluate(()=>__resolveRead());await own.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');await own.locator('[data-own-arrangements]').click();await own.locator('[data-own-period="2"]').waitFor();assert.equal(await own.evaluate(()=>__writes),1);await own.close();
  const switched=await setup();await switched.evaluate(async()=>{await RosterOpsUI.render('Manage reported absences',__ctx);});const before=await switched.locator('#content').innerText();await switched.evaluate(()=>__resolveRead());await switched.waitForTimeout(50);assert.equal(await switched.locator('#content').innerText(),before,'late refresh cannot draw onto another viewport');await switched.close();
  assert.deepEqual(errors,[]);console.log('PASS receipt recovery: durable confirmation before delayed read; optional read failure preserves saved state; new draft retained; Own arrangements remains independent of save recovery; stale viewport completion ignored.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
