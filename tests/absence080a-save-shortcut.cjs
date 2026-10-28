'use strict';
// Real UI/domain, synthetic transport. Catch accidental preview writes, duplicate final submissions and changed retry intent.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[];
 async function setup(){
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.setContent('<main id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:read('roster-update/public/'+name)});
  for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:read(name)});
  await page.evaluate(async()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');window.__requests=[];
   await RosterOpsUI.render('Report Absence',{profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{
    __requests.push(structuredClone(p));
    if(p.operation==='saveAbsence'&&window.__denySave){__denySave=false;throw Object.assign(Error('Synthetic validation rejection'),{status:400});}
    if(p.operation==='saveAbsence'&&window.__holdSave)await new Promise(resolve=>window.__releaseSave=resolve);
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }});
  });
  await page.locator('[data-period="2"]').click();await page.locator('[data-log-absence]').click();
  return page;
 }
 const idle=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
 const writes=page=>page.evaluate(()=>__requests.filter(p=>!GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus'));
 try{
  for(const activation of ['mouse','touch','Enter','Space','double click']){
   const page=await setup(),na=page.locator('[data-instructions-na]');
   assert.deepEqual(await writes(page),[],'period review remains local');
   if(activation==='mouse'||activation==='double click')await na.click();else if(activation==='touch')await na.tap();else{await na.focus();await page.keyboard.press(activation);}
   assert.deepEqual(await writes(page),[],activation+' stages no-instructions without writing');assert.equal(await na.getAttribute('aria-pressed'),'true');
   await page.evaluate(()=>__holdSave=true);const submit=page.locator('[data-save-instructions]');
   if(activation==='mouse')await submit.click();else if(activation==='touch')await submit.tap();else if(activation==='double click')await submit.dblclick();else{await submit.focus();await page.keyboard.press(activation);}
   const sent=await writes(page);assert.equal(sent.length,1,activation+' final submit must send once');assert.equal(sent[0].operation,'saveAbsence');assert.equal(sent[0].instructionsNA,true);assert.equal(sent[0].reliefRequired,true);assert.deepEqual(sent[0].periods,[2]);
   // Pending controls cannot change the saved intent, even through a dispatched second event.
   await na.dispatchEvent('click');assert.deepEqual(await writes(page),sent);assert.equal(await na.getAttribute('aria-pressed'),'true');
   await page.evaluate(()=>{__holdSave=false;__releaseSave();});await idle(page);
   assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);assert.equal(await page.evaluate(()=>__fixture.state.absences[0].instructionsNA),true);
   assert.equal(await page.locator('[data-instructions-area]').isVisible(),true);await page.close();
  }
  // Existing text is kept; a definite denial can retry through the normal bottom action.
  const denied=await setup();await denied.locator('[data-instruction]').fill('Keep this worksheet URL.');await denied.evaluate(()=>__denySave=true);
  await denied.locator('[data-instructions-na]').click();await denied.locator('[data-save-instructions]').click();await idle(denied);assert.match(await denied.locator('[data-ops-message]').innerText(),/Synthetic validation rejection/);assert.equal(await denied.evaluate(()=>__fixture.state.absences.length),0);
  assert.equal(await denied.locator('[data-instruction]').inputValue(),'Keep this worksheet URL.');await denied.locator('[data-save-instructions]').click();await idle(denied);
  const attempts=await writes(denied);assert.equal(attempts.length,2);assert.equal(attempts[1].instructionsNA,true);assert.match(JSON.stringify(attempts[1].instructionsByDate),/Keep this worksheet URL/);
  // Existing reports use saveInstructions, never create a second absence. Toggle-off still permits editing.
  await denied.locator('[data-instructions-na]').click();await idle(denied);assert.equal((await writes(denied)).at(-1).operation,'saveInstructions');assert.equal(await denied.evaluate(()=>__fixture.state.absences.length),1);assert.equal(await denied.evaluate(()=>__fixture.state.absences[0].instructionsNA),false);assert.equal(await denied.locator('[data-instruction]').evaluate(el=>el.readOnly),false);await denied.close();
  // Lost acknowledgement uses the immutable receipt path, with no duplicate write on confirmation.
  const uncertain=await setup();await uncertain.evaluate(()=>__fixture.fail='after-save');await uncertain.locator('[data-instructions-na]').click();await uncertain.locator('[data-save-instructions]').click();await uncertain.locator('[data-retry-save]').waitFor();
  const sent=(await writes(uncertain))[0];assert.equal(sent.instructionsNA,true);await uncertain.locator('[data-retry-save]').click();await idle(uncertain);
  assert.equal((await writes(uncertain)).length,1);assert.equal(await uncertain.evaluate(()=>__fixture.state.absences.length),1);assert.deepEqual(await uncertain.evaluate(()=>__requests.find(p=>p.operation==='receiptStatus').command),sent);await uncertain.close();
  assert.deepEqual(errors,[]);console.log('PASS deferred no-instructions choice and final save: mouse, touch, Enter, Space, duplicate protection, preserved text, definite denial, existing edits and exact receipt recovery.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
