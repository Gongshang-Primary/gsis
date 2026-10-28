// Offline browser connected to the synthetic real-backend fixture. The gateway
// identity is fixed by the test host; security is covered by the gateway suite.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'),fixture=require('../tests/contacts502-fixture.js');
(async()=>{
 fs.mkdirSync('verification',{recursive:true});const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM||'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const report={pageErrors:[],apiCalls:[],recovery:{},ordinary:{},mobile:{}};
 try{
 const f=fixture(),newId='contact-'+crypto.randomUUID(),key=f.seedPending({changes:[],additions:[{id:newId,values:{'Basic Name':'New AE','Statutory Name':'Ms New AE','iCON Alias (@moe.edu.sg)':'new_ae','CES Alias (@schools.gov.sg)':'new_ae','GSPS Alias (@gsps.edu.sg)':'','Mobile No':'81234567',Role:'AE','Employment Modifier':'AE',Active:'Y'}}]});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await context.route('https://gsis.local/**',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.pathname.startsWith('/api/')){
   report.apiCalls.push({path:u.pathname,method:req.method()});let result;
   if(u.pathname==='/api/config')result={version:'0.5.02',clientId:'fixture',configured:true};
   else if(u.pathname==='/api/session')result={ok:true,data:{user:{email:'admin@gsps.edu.sg'}}};
   else if(u.pathname==='/api/deployment')result={ok:true,data:{available:true,revision:1,subjectHeaders:['FT'],assignments:[],organisations:{dept:[],cca:[],plt:[],comm:[],events:[]}}};
   else {const action={'/api/bootstrap':'bootstrap','/api/recovery-status':'recoveryStatus','/api/recover-save':'recoverSave','/api/save-receipt':'saveReceipt','/api/data':'data','/api/save-data':'saveData'}[u.pathname];assert.ok(action,u.pathname);result=f.post(action,req.method()==='POST'?req.postDataJSON():{});}
   return route.fulfill({status:result.ok===false?result.status:200,contentType:'application/json',body:JSON.stringify(result)});
  }
  const file=path.resolve('.'+u.pathname);if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Synthetic test host'});return route.fulfill({path:file});
 });
 await page.goto('https://gsis.local/contacts-update/public/index.html');await page.getByRole('button',{name:'Complete this saved change',exact:true}).waitFor();
 assert.equal(report.apiCalls.filter(c=>c.path==='/api/bootstrap').length,1,'structured recovery fence must not repeat bootstrap');
 const contained=await page.locator('.login-card').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth});assert.equal(contained,true,'mobile recovery must stay inside the page');report.mobile.recoveryContained=contained;await page.screenshot({path:'verification/502-recovery-before.png',fullPage:true});
 f.setMode('lostAck');await page.getByRole('button',{name:'Complete this saved change',exact:true}).click();await page.waitForSelector('#app:not(.hidden)');await page.locator('[data-column-filter="name"]').fill('New AE');await page.waitForFunction(()=>document.querySelector('#contactRows').textContent.includes('New AE (AE)'));
 assert.equal(report.apiCalls.filter(c=>c.path==='/api/recover-save').length,1);assert.equal(await page.locator('#contactRows tr').count(),1);assert.equal(await page.locator('#contactRows a[href^="https://wa.me/"]').getAttribute('href'),'https://wa.me/6581234567');assert.equal(await page.locator('#contactHead .sort').allTextContents().then(a=>a.map(t=>t.replace(/[↕▲▼]/g,'').trim())).then(a=>JSON.stringify(a)),JSON.stringify(['TTb Name','Mobile','FT']));
 report.recovery={originalIdRetained:f.sheets.get('contact_save_journal').data.at(-1)[0]===key.requestId,lateConfirmation:true,replays:report.apiCalls.filter(c=>c.path==='/api/recover-save').length-1,uniqueNewRecord:f.sheets.get('contacts').data.filter(r=>r[17]===newId).length};report.mobile={...report.mobile,defaults:['TTb Name','Mobile','FT'],font:await page.locator('#contactRows td').first().evaluate(e=>getComputedStyle(e).fontSize)};assert.equal(report.mobile.font,'13px');await page.screenshot({path:'verification/502-recovered-mobile.png',fullPage:true});
 await page.setViewportSize({width:1366,height:800});await page.locator('[data-page="data"]').click();await page.waitForFunction(()=>document.querySelector('#dataStatus').textContent.startsWith('Ready'));
 const mobile=page.locator(`[data-person="${newId}"][aria-label="Mobile No"]`);await mobile.fill('87654321');f.setMode('lostAck');const before=report.apiCalls.filter(c=>c.path==='/api/save-data').length;await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dataStatus').textContent==='Saved');assert.equal((await mobile.inputValue()).replace(/\s/g,''),'87654321');assert.equal(await mobile.getAttribute('readonly'),null);
 assert.equal(report.apiCalls.filter(c=>c.path==='/api/save-data').length-before,1);await page.locator('[data-page="contacts"]').click();assert.equal(await page.locator('#contactRows a[href^="https://wa.me/"]').getAttribute('href'),'https://wa.me/6587654321');report.ordinary={lateConfirmation:true,editableAfterSave:true,directoryUpdated:true,saveWrites:1};await page.screenshot({path:'verification/502-confirmed-desktop.png',fullPage:true});
 assert.deepEqual(report.pageErrors,[]);assert.equal(f.getHeld(),false);fs.writeFileSync('verification/502-browser.json',JSON.stringify(report,null,2));console.log('PASS 502 Chromium: one recovery fence read, real synthetic backend, original new-contact recovery after lost reply, no duplicate/replay, mobile defaults/font/WhatsApp, editable confirmed Admin save and updated directory.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
