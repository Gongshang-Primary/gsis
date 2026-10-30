'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{sample}=require('./roster716-calculations.cjs'),{workedExample}=require('./roster717-calculations.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[],requests=[];let signedIn=true,hold=null,release=null,fail=false,value=sample(),roles={admin:false,smc:false};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='roster.test'){await route.fulfill({contentType:'application/javascript',body:'window.google={accounts:{id:{initialize(){},renderButton(){}}}};'});return;}
   if(url.pathname.startsWith('/api/')){
    const input=route.request().postDataJSON?.()||{};requests.push({path:url.pathname,input});
    let data={};
    if(url.pathname==='/api/config'){await route.fulfill({json:{clientId:'test'}});return;}
    if(url.pathname==='/api/logout')signedIn=false;
    if(url.pathname==='/api/session'&&!signedIn){await route.fulfill({status:401,json:{ok:false,error:'Sign in required.'}});return;}
    if(url.pathname==='/api/profile')data={revision:1,entries:[],active:null,upcoming:null,user:{email:'plain@gsps.edu.sg',staffId:'plain',accessVerified:true,...roles}};
    if(input.operation==='read'&&input.view==='allocationLearning')data={learning:{config:{maxDailyPeriods:9},appliedRuleOrder:[],revision:1,updatedAt:null}};
    if(input.operation==='calculations'){if(hold)await hold;if(fail){await route.fulfill({status:503,json:{ok:false,error:'Calculation source unavailable.'}});return;}data=value;}
    await route.fulfill({json:{ok:true,data}});return;
   }
   const file=path.join(__dirname,'../roster-update/public',url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
   await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'image/png'});
  });
  await page.goto('https://roster.test/');await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').waitFor();
  assert.equal(await page.locator('#calculations').count(),0,'retired header control is absent');
  for(const access of [{smc:false,admin:false},{smc:true,admin:false},{smc:true,admin:true}]){roles=access;await page.locator('#refresh').click();await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').waitFor();const order=await page.locator('.function-tile').evaluateAll(tiles=>tiles.map(t=>t.dataset.page));assert.equal(order[order.indexOf('My Relief Duties')+1],'Learn about Auto Allocation');}roles={smc:false,admin:false};await page.locator('#refresh').click();
  assert.equal(requests.filter(r=>r.input.operation==='calculations').length,0,'login and Home do not load personal calculation');
  await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').click();await page.locator('.calculation-greeting').waitFor();
  assert.match(await page.locator('.calculation-greeting').textContent(),/Hi Teacher plain.*150%/);assert.match(await page.locator('.personal-calculations').textContent(),/periods per week/);
  assert.equal(await page.locator('details.calculation-detail').getAttribute('open'),null);await page.locator('.calculation-detail summary').click();assert.notEqual(await page.locator('details.calculation-detail').getAttribute('open'),null);
  assert.equal(await page.locator('.calculation-steps>li').count(),5);assert.equal(await page.locator('[data-teacher-picker],select[name=staffId]').count(),0);
  const explanation=await page.locator('.personal-calculations').textContent();assert.match(explanation,/Your offload factor is/);assert.match(explanation,/Applied SIUE: 150% \(general\)/);assert.match(explanation,/KPs do not receive an additional preference/);assert(!explanation.includes('Across Singapore'));
  value=workedExample();await page.locator('#refresh').click();await page.getByText('Your weekly workload estimate, Wi, is 83.85 periods.').waitFor();assert.match(await page.locator('.calculation-steps').textContent(),/46.11 periods/);assert.match(await page.locator('.calculation-steps').textContent(),/29.13.*84 eligible full time teachers/);assert.match(await page.locator('.calculation-greeting').textContent(),/relief quota R = 0/);
  fs.mkdirSync('verification',{recursive:true});await page.screenshot({path:'verification/717-calculations-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile has no page overflow');
  assert(await page.getByRole('heading',{name:'Learn about Auto Allocation',exact:true}).isVisible());await page.screenshot({path:'verification/717-calculations-mobile.png',fullPage:true});
  await page.locator('.breadcrumbs [data-page=Home]').click();hold=new Promise(r=>release=r);await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').click();await page.getByText('Loading your calculations…').waitFor();
  await page.locator('.breadcrumbs [data-page=Home]').click();release();hold=null;await page.waitForTimeout(50);assert.equal(await page.locator('.calculation-greeting').count(),0,'late calculation cannot overwrite Home');
  fail=true;await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').click();await page.locator('[data-calculations-retry]').waitFor();assert.match(await page.locator('[role=alert]').textContent(),/unavailable/);fail=false;await page.locator('[data-calculations-retry]').click();await page.locator('.calculation-greeting').waitFor();
  value={...value,name:'<img src=x onerror=alert(1)>',calculation:null,calculationReason:'No matching published calculation.',completion:{...value.completion,percentage:null,historyVerified:false,reason:'Relief history has not been verified.'}};
  await page.locator('#refresh').click();await page.getByText('No matching published calculation.').waitFor();assert.equal(await page.locator('.personal-calculations img').count(),0);assert.match(await page.locator('.calculation-greeting').textContent(),/Unavailable/);assert.match(await page.locator('.calculation-history').textContent(),/12 periods/);
  value={...value,reliefBasis:'daily',completion:{...value.completion,completed:7,percentage:null}};await page.locator('#refresh').click();await page.getByText('Daily roster, no R%',{exact:true}).waitFor();assert.match(await page.locator('.personal-calculations').textContent(),/Completed relief: 7 periods/);assert.doesNotMatch(await page.locator('.personal-calculations').textContent(),/Unavailable|7%|weekly W/);assert.equal(await page.locator('.personal-calculations img').count(),0);
  await page.locator('.breadcrumbs [data-page=Home]').click();hold=new Promise(r=>release=r);await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').click();await page.getByText('Loading your calculations…').waitFor();await page.locator('#logout').click();await page.waitForFunction(()=>document.getElementById('logout').hidden);release();hold=null;await page.waitForTimeout(50);assert.equal(await page.locator('.personal-calculations').count(),0,'logout removes personal content and ignores late read');assert.equal(await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS 716 Calculations browser: all-role learning tile after My Relief Duties, retired header, lazy load, actual personal figures, expandable explanation, desktop/mobile, unavailable data, escaping, retry, navigation and logout stale-read isolation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
