'use strict';
// Exercise the real shell, page registry and planner navigation with local API fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const order=['Report Absence','Manage reported absences','Assign Relief','Daily Notify','Absences by Date','Manage Ad-hoc relief','Stapler','WhatsApp Inbox','Check Availability','Timetable','Daily Updates','Statistics','Baseline Timetable','My Relief Duties','Learn about Auto Allocation','Recess Regression','SMC Duty Roster','Custom Notifications','Manage Absence Type','System Config','Prune records'];
const title='Suspended Timetable Advance PLannER',pub=path.resolve('roster-update/public');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE?{executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const html=fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
  await page.route('**/*',route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!name)return route.fulfill({contentType:'text/html',body:html});if(name==='logo.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(pub,name))});return /^icons\/[\w-]+\.svg$/.test(name)?route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync(path.join(pub,name))}):route.abort();});
  await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync(path.join(pub,file),'utf8')});
  await page.evaluate(()=>{
   window.__homeRole={smc:true,admin:true};window.__datesFail=false;window.__homeCalls=[];
   window.fetch=async(url,options={})=>{
    const route=String(url).split('/').pop(),input=JSON.parse(options.body||'{}');__homeCalls.push({route,input});
    const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
    if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};
    if(route==='session')return reply({});
    if(route==='profile')return reply({user:{email:'teacher@school.test',staffId:'teacher',accessVerified:true,...__homeRole},revision:1,active:null,selected:null,entries:[]});
    if(route==='operations'&&input.operation==='inboxList')return reply({alertCount:0});
    if(route==='operations'&&input.operation==='read')return reply({date:input.date,revision:1,people:[],own:[],demands:[],settings:{absenceTypes:[]},timetable:null});
    if(route==='operations'&&input.operation==='staplerDates'){
     if(__datesFail)return {ok:false,status:503,json:async()=>({ok:false,error:'Temporary date read failure.'})};
     return reply({dates:[],sponsors:[],sponsorships:[]});
    }
    throw Error('Unexpected fixture request '+route+' '+input.operation);
   };
  });
  for(const file of ['roster-model.js','roster-operations-ui.js','roster-stapler-ui.js','roster.js'])await page.addScriptTag({content:fs.readFileSync(path.join(pub,file),'utf8')});
  await page.waitForSelector('.function-tile');
  const pages=selector=>page.locator(selector+' .function-tile').evaluateAll(elements=>elements.map(element=>element.dataset.page));
  const checkGroups=async expected=>{
   assert.deepEqual(await pages('.home'),expected);
   assert.equal(expected[expected.indexOf('My Relief Duties')+1],'Learn about Auto Allocation');assert.equal(await page.locator('.function-tile[data-page="Learn about Auto Allocation"]').count(),1);assert.equal(await page.locator('#calculations').count(),0,'retired header entry stays absent');
   assert.deepEqual(await pages('.priority-functions'),expected.filter(name=>order.indexOf(name)<8));
   assert.deepEqual(await pages('.function-divider + .function-grid'),expected.filter(name=>order.indexOf(name)>=8));
   assert.equal(await page.locator('.function-divider').count(),1);
   assert.equal(await page.locator('[data-page="Stapler"] .function-title').innerText(),'Stapler');
   assert.equal(await page.locator('[data-page="Stapler"] .function-description').innerText(),title);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  };
  await checkGroups(order);
  const desktop=await page.locator('.priority-functions .function-tile').evaluateAll(elements=>elements.map(element=>({x:element.offsetLeft,y:element.offsetTop})));
  assert.equal(new Set(desktop.map(box=>box.x)).size,4,'four columns on desktop');
  assert.equal(new Set(desktop.map(box=>box.y)).size,2,'eight primary functions form two desktop rows');
  fs.mkdirSync('verification',{recursive:true});await page.screenshot({path:'verification/716-home-desktop.png',fullPage:true});
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});await checkGroups(order);
   assert.equal(await page.locator('.priority-functions').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),2);
   assert.equal(await page.locator('.function-tile').evaluateAll(elements=>elements.every(element=>element.offsetHeight>=44&&element.offsetWidth>=44)),true);
  }
  await page.screenshot({path:'verification/716-home-mobile.png',fullPage:true});
  // The long display name keeps the existing route key, keyboard action and breadcrumb.
  await page.evaluate(()=>{__datesFail=true;});await page.locator('.function-tile[data-page="Stapler"]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-stapler-message]')?.textContent.includes('Temporary date read failure.'));
  assert.equal(await page.locator('#content h2').innerText(),title);assert.equal(await page.locator('#nav [aria-current="page"]').innerText(),'Stapler');
  await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{__datesFail=false;});await page.locator('[data-refresh-dates]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]')?.textContent==='Dates checked just now.');
  assert.match(await page.locator('.empty-state').innerText(),/No suspension dates/);
  await page.locator('#nav [data-page="Home"]').click();
  for(const role of [{smc:true,admin:false},{smc:false,admin:true},{smc:false,admin:false}]){
   await page.evaluate(role=>{__homeRole=role;document.getElementById('refresh').click();},role);
   const expected=role.admin?order:role.smc?order.filter(name=>!['Manage Absence Type','Prune records'].includes(name)):order.filter(name=>['Report Absence','Manage reported absences','Stapler','Check Availability','Timetable','Daily Updates','My Relief Duties','Learn about Auto Allocation'].includes(name));
   await page.waitForFunction(count=>document.querySelectorAll('.function-tile').length===count&&!document.getElementById('content').inert,expected.length);await checkGroups(expected);
   assert.equal(await page.locator('.function-tile[data-page="System Config"]').count(),role.smc||role.admin?1:0);
  }
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>__homeCalls.some(call=>/^(save|confirm|publish|send)/i.test(call.input.operation||''))),false);
  console.log('PASS 716 Home browser: 21-icon order, 8-icon divider, Admin/SMC/teacher filtering, four-column desktop/two-column mobile, short Home title with expanded description, full planner heading, stable route, keyboard navigation and failed date-read recovery.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
