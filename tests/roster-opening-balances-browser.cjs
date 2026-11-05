'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],commands=[];let fresh=true,roles={admin:true,smc:true},revision=3;
  const rows=[{staffId:'a',name:'Alice Tan',role:'Teacher',department:'English',cumulativeQuota:10,cumulativeDone:2,asOfDate:'2026-11-05',version:1},{staffId:'b',name:'Bob Lim',role:'Teacher',department:'Math',cumulativeQuota:4,cumulativeDone:5,asOfDate:'2026-11-05',version:1}],coverage={since:'2026-11-05',archiveUrl:'/archive.html'};
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='roster.test'){await route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){}}}};'});return;}
   if(url.pathname.startsWith('/api/')){const p=route.request().postDataJSON?.()||{};let data={};if(url.pathname==='/api/config'){await route.fulfill({json:{clientId:'test'}});return;}
    if(url.pathname==='/api/profile')data={revision,entries:[],active:null,upcoming:null,user:{email:'fixture@school.test',staffId:'a',accessVerified:true,...roles},...(fresh?{historyCoverage:coverage}:{})};
    if(p.operation==='openingBalances')data={revision,rows,canEdit:roles.admin,confirmed:true,historyCoverage:coverage};
    if(p.operation==='saveOpeningBalances'){commands.push(p);for(const change of p.rows)Object.assign(rows.find(row=>row.staffId===change.staffId),change,{version:2});revision++;data={revision,requestId:p.requestId,rows,canEdit:true,confirmed:true,historyCoverage:coverage};}
    await route.fulfill({json:{ok:true,data}});return;
   }
   const filename=path.join(__dirname,'../roster-update/public',url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));if(!fs.existsSync(filename)){await route.fulfill({status:404,body:''});return;}await route.fulfill({body:fs.readFileSync(filename),contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':filename.endsWith('.svg')?'image/svg+xml':'image/png'});
  });
  await page.goto('https://roster.test/');await page.locator('.function-tile[data-page="Opening balances"]').click();await page.locator('[data-opening-row]').first().waitFor();assert.match(await page.locator('#nav').innerText(),/Admin.*Opening balances/s);
  const quota=page.locator('[data-opening-row="a"] [data-opening-value="cumulativeQuota"]');await quota.focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.openingValue),'cumulativeDone');await quota.fill('-1');assert.equal(await quota.getAttribute('aria-invalid'),'true');assert(await page.locator('[data-opening-save]').isDisabled());await quota.fill('10');
  await page.locator('[data-opening-sort="name"]').click();await page.locator('[data-opening-sort="name"]').click();assert.match(await page.locator('[data-opening-row]').first().innerText(),/Bob/);await page.locator('[data-opening-sort="cumulativeQuota"]').click();assert.match(await page.locator('[data-opening-row]').first().innerText(),/Bob/);
  await page.locator('[data-opening-row="a"] [data-opening-value="cumulativeDone"]').fill('3');await page.locator('[data-opening-reason]').fill('Reviewed correction');await page.locator('[data-opening-save]').click();await page.waitForFunction(()=>document.querySelector('[data-opening-status]').textContent.includes('Receipt:'));assert.equal(commands.length,1);assert.equal(commands[0].rows.length,1);assert.equal(commands[0].rows[0].staffId,'a');assert(!Object.hasOwn(commands[0],'confirmInitial'));
  roles={admin:false,smc:true};await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('.ops-opening .access-label')?.textContent.includes('Read-only'));assert.equal(await page.locator('[data-opening-value]').count(),0);assert.equal(await page.locator('[data-opening-save]').count(),0);
  roles={admin:false,smc:false};await page.locator('#refresh').click();await page.locator('.function-tile[data-page="Report Absence"]').waitFor();assert.equal(await page.locator('.function-tile[data-page="Opening balances"]').count(),0);
  fresh=false;roles={admin:true,smc:true};await page.locator('#refresh').click();await page.locator('.function-tile[data-page="System Config"]').waitFor();assert.equal(await page.locator('.function-tile[data-page="Opening balances"]').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS Chromium Opening balances: fresh Admin navigation, cell Tab/validation, sort, changed-row receipt, SMC read-only, teacher and legacy menu hiding');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
