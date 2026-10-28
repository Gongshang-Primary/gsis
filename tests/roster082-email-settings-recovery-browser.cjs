'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),adapter=require('./roster701-adapter.cjs');
const root=path.resolve(__dirname,'..'),scripts=['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-settings-ui.js'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM});
 try{
  const context=await browser.newContext(),h=adapter(),calls=[],errors=[];h.ctx.people[0].emails=['alice@schools.gov.sg','alice@gsps.edu.sg'];let failure='',hold=null;
  await context.route('https://roster.test/**',route=>{const file=new URL(route.request().url()).pathname.slice(1);return route.fulfill(file?{contentType:'text/javascript',body:fs.readFileSync(path.join(root,file),'utf8')}:{contentType:'text/html',body:'<main id="content"></main>'+scripts.map(file=>'<script src="/'+file+'"></script>').join('')});});
  await context.exposeFunction('__testApi',async(payload,owner)=>{
   calls.push({payload:structuredClone(payload),owner});
   try{
    assert.notEqual(payload.operation,'sendDailyEmploymentReport','Recovery must never queue an email');
    if(payload.operation==='saveDailyEmploymentSettings'){
     if(failure==='auth'){failure='';throw Object.assign(Error('Sign in again.'),{status:401});}
     if(failure==='denied'){failure='';throw Object.assign(Error('Access is not currently available.'),{status:403});}
     if(failure==='before'){failure='';throw Error('The Roster save could not be confirmed. Retry the same save.');}
     if(failure==='validation'){failure='';throw Object.assign(Error('Choose email addresses recorded in Contacts.'),{status:400});}
     if(failure==='malformed'){failure='';return {ok:true,data:{}};}
     if(hold)await hold;
    }
    const data=h.call(payload,{email:owner});
    if(payload.operation==='saveDailyEmploymentSettings'&&failure==='after'){failure='';throw Error('The Roster save could not be confirmed. Retry the same save.');}
    return {ok:true,data};
   }catch(error){return {ok:false,error:error.message,status:error.status||0};}
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  async function render(target=page,owner='alice@gsps.edu.sg',reload=true){
   if(reload)await target.goto('https://roster.test/');
   await target.evaluate(async({owner,date})=>{
    window.__sent=[];
    window.__ctx={profile:{user:{email:owner,staffId:owner.split('@')[0],admin:true,smc:true}},today:()=>date,container:document.getElementById('content'),status(){},invalidateOperations(){},api:async(route,payload)=>{
     if(payload.operation==='saveDailyEmploymentSettings')window.__sent.push({payload:structuredClone(payload),stored:(()=>{try{return Object.keys(sessionStorage).map(key=>sessionStorage.getItem(key));}catch{return [];}})()});
     const result=await window.__testApi(payload,owner);if(!result.ok)throw Object.assign(Error(result.error),{status:result.status});return result.data;
    }};
    await RosterSettingsUI.render('Daily Updates',__ctx);
   },{owner,date:h.date});
  }
  async function saveSubject(subject){await page.locator('[name="subject"]').fill(subject);await page.locator('[data-report-settings] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');}
  const pendingRows=target=>target.evaluate(()=>Object.keys(sessionStorage).map(key=>({key,value:JSON.parse(sessionStorage.getItem(key))})).filter(row=>row.value?.input?.operation==='saveDailyEmploymentSettings'));
  await render();await page.locator('[data-recipient="alice"]').check();const unrelated=h.state();unrelated.revision=9;h.setState(unrelated);failure='after';await saveSubject('Recovered report subject');
  assert.equal(h.calls.writes,1);const first=calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings')[0];assert.equal(first.payload.revision,0);assert.match(first.payload.expectedSettingsToken,/^[a-f0-9]{64}$/,'Confirmed settings token must accompany the save despite unrelated global revision changes');
  let saved=await pendingRows(page);assert.equal(saved.length,1,'Unconfirmed report-settings request must survive a page reload');assert.deepEqual(saved[0].value.input,first.payload);
  assert.equal(await page.evaluate(()=>__sent[0].stored.some(raw=>JSON.parse(raw)?.input?.requestId===__sent[0].payload.requestId)),true,'Exact pending request is stored before dispatch');
  await render();assert.equal(h.calls.writes,1,'Reload must not replay a mutation automatically');assert.equal(await page.locator('[name="subject"]').inputValue(),'Recovered report subject');assert.equal(await page.locator('[data-pending-request]').count(),1);
  let release;hold=new Promise(resolve=>release=resolve);await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.body.textContent.includes('Checking saved settings'));release();hold=null;await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent.includes('saved'));
  assert.equal(h.calls.writes,1);assert.equal((await pendingRows(page)).length,0);assert.deepEqual(calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings').at(-1).payload,first.payload);
  console.log('PASS response-loss recovery survives reload, stores before dispatch, checks the exact receipt explicitly and never sends email');

  failure='before';await saveSubject('Reauthenticate safely');const uncertain=calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings').at(-1).payload;
  failure='auth';await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');assert.equal((await pendingRows(page)).length,1,'401 after uncertainty must preserve the original request');
  await render(page,'bob@gsps.edu.sg');assert.equal(await page.locator('[data-pending-request]').count(),0);assert.notEqual(await page.locator('[name="subject"]').inputValue(),'Reauthenticate safely');assert.equal((await pendingRows(page)).length,1);
  const otherTab=await context.newPage();await render(otherTab);assert.equal(await otherTab.locator('[data-pending-request]').count(),0,'A separate tab must not inherit another tab’s pending save');await otherTab.close();
  await render();failure='denied';await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');assert.equal((await pendingRows(page)).length,1,'403 cannot erase an earlier uncertain save');
  await render();await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent.includes('saved'));assert.deepEqual(calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings').at(-1),{payload:uncertain,owner:'alice@gsps.edu.sg'});assert.equal((await pendingRows(page)).length,0);
  console.log('PASS reauthentication, owner changes and separate tabs preserve recovery ownership without replaying another user’s request');

  const staleToken=calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings').at(-1).payload.expectedSettingsToken;
  const changed=h.state();changed.dailyEmploymentSettings.subject='Another editor’s online setting';changed.revision++;h.setState(changed);await saveSubject('My reviewed recipient settings');assert.match(await page.locator('[data-settings-message]').innerText(),/Another user/);assert.equal(await page.locator('[name="subject"]').inputValue(),'My reviewed recipient settings');assert.equal((await pendingRows(page)).length,0,'Definitive conflict clears the original recovery request');
  await page.locator('[data-report-settings] button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');const reviewed=calls.filter(row=>row.payload.operation==='saveDailyEmploymentSettings').at(-1).payload;assert.notEqual(reviewed.expectedSettingsToken,staleToken);assert.equal(h.state().dailyEmploymentSettings.subject,'My reviewed recipient settings');assert.equal(reviewed.settingsToken,undefined);assert.equal(Object.keys(reviewed).filter(key=>key==='expectedSettingsToken').length,1);
  console.log('PASS genuine settings conflicts retain the draft and an explicit reviewed save uses the newly loaded settings token');

  failure='validation';await saveSubject('Rejected settings');assert.equal((await pendingRows(page)).length,0,'Definitive validation rejects clear recovery');assert.equal(await page.locator('[data-pending-request]').count(),0);
  failure='malformed';await saveSubject('Unconfirmed response');assert.equal((await pendingRows(page)).length,1,'Malformed success cannot discard the exact pending request');assert.equal(await page.locator('[data-pending-request]').count(),1);assert.doesNotMatch(await page.locator('[data-settings-message]').innerText(),/^Changes saved/);await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent==='Changes saved.');assert.equal((await pendingRows(page)).length,0);
  await page.evaluate(()=>Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw Error('Storage disabled');}}));failure='before';await saveSubject('Memory-only retry');assert.match(await page.locator('#content').innerText(),/Keep this page open/i);assert.equal(await page.locator('[data-pending-request]').count(),1);await page.locator('[data-pending-request]').click();await page.waitForFunction(()=>document.querySelector('[data-settings-message]').textContent.includes('saved'));
  assert.equal(h.state().dailyEmploymentMail.length,0);assert.deepEqual(errors,[]);console.log('PASS definitive validation clears recovery and unavailable storage retains explicit memory-only retry with a warning');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
