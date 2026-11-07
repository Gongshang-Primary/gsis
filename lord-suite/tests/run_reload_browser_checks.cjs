/* Real browser acceptance against local app assets and mocked APIs only. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'reload_browser_results.json');
const results=[],servers=new Set();let browser;
const evidence=()=>({release:'1.7',checkedAt:new Date().toISOString(),sourceSha256:require('./source_fingerprints.cjs')(),scope:'Local assets with fictional data and mocked APIs. No real grants, provider sends or deployment.'});
const date=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Singapore'});
const periods=[{code:'1',start:'08:00',end:'08:30',active:true,index:0}];
function reference(updated=false){return {teachers:['Test Staff'],classes:['5A'],subjects:['SCI'],periods,trolleys:[1,2,3].map(n=>({name:'A'+n,group:'Cart A',deviceType:'iPad',defaultQuantity:14})),bookingResources:[{resource:'Cart A',deviceType:'iPad',capacity:42},...(updated?[{resource:'Cart B',deviceType:'iPad',capacity:42}]:[])]};}
function dashboard(updated){return {date:date(),resources:reference(updated).bookingResources,periods,bookings:[],movements:[],metrics:{},telegram:{},graceMinutes:30};}
function board(){return {ok:true,date:date(),bookings:[{bookingId:'TEST-1',resource:'Cart A',deviceType:'iPad',teacherStatutoryName:'Test Staff',classOrActivity:'5A',subject:'SCI',requestedQuantity:42,startTime:'09:00',endTime:'10:00',epochStart:Date.now()+3600000,epochEnd:Date.now()+7200000,movementState:'BOOKED'}]};}
function serve(app){const dir=path.join(root,'Source',app);return http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(dir,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(dir+path.sep))return res.writeHead(403).end();try{const extension=path.extname(file),type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.jpg':'image/jpeg'}[extension]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});}
function pass(name){results.push({name,ok:true});}
(async()=>{
 try{browser=await require('playwright').chromium.launch({...(process.env.LORD_TEST_CHROMIUM?{executablePath:process.env.LORD_TEST_CHROMIUM}:{}),headless:true});}catch(error){const report={...evidence(),status:'blocked',passed:0,failed:0,reason:error.code==='MODULE_NOT_FOUND'?'Playwright is unavailable in this environment.':'Chromium executable is unavailable in this environment.',detail:String(error.message).split('\n')[0]};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,reason:report.reason}));return;}
 for(const app of ['lord','overlord','starlord'].filter(app=>!process.env.LORD_TEST_APP||app===process.env.LORD_TEST_APP)){
  const server=serve(app);servers.add(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const page=await browser.newPage({viewport:{width:1366,height:768},timezoneId:'Asia/Singapore'}),errors=[];let updated=false,granted=false,refreshes=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());let payload={ok:true},body={};try{body=req.postDataJSON()||{};}catch{}
   const action=String(body.action||url.searchParams.get('action')||'').toLowerCase();
   if(url.pathname==='/api/auth/session')payload={ok:true,authenticated:true,session:{ttbName:'Test Staff',email:'test@gsps.edu.sg',isAdmin:true}};
   if(url.pathname==='/api/reference')payload={ok:true,data:reference(updated),date:url.searchParams.get('date'),daySchedule:[]};
   if(url.pathname==='/api/dashboard')payload={ok:true,data:dashboard(updated),reference:reference(updated)};
   if(url.pathname==='/api/board')payload=board();
   if(url.pathname==='/api/transaction'){
    payload={ok:true,bookings:[]};
    if(action==='adminsettings')payload={ok:true,data:{admins:granted?[{name:'Sample Colleague',email:'colleague@gsps.edu.sg',active:true,whatsappOptIn:true,mobile:'6590000000'}]:[],contacts:[{name:'Sample Colleague',email:'colleague@gsps.edu.sg',mobile:'6590000000'}],whatsapp:{ready:false,status:'Awaiting sender configuration'}}};
    if(action==='admingrant'){assert.equal(body.targetEmail,'colleague@gsps.edu.sg');assert.equal(body.whatsappOptIn,undefined);granted=true;}
    if(action==='complianceincidents')payload={ok:true,data:{collection:2,return:1,total:3,affectedBookings:2,period:{label:'Since last REIGN close'}}};
    if(action==='suiterefresh'){updated=true;refreshes++;payload={ok:true,reference:reference(true),propagationSeconds:120};}
   }
   await route.fulfill({json:payload});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  if(app==='overlord'){
   await page.locator('#systemSettingsBtn:not([disabled])').waitFor();
   await page.evaluate(()=>{data.maintenanceWarning={state:'history',summary:'Earlier background failure recorded; no current fault was confirmed.',failures:[{task:'Email notification',at:'2026-10-25T08:30:00Z',detail:'A previous attempt failed. Check the retained execution record.'}],counts:{pendingTasks:4},action:'Confirm the earlier outcome with the Apps Script maintainer before acknowledging this historical notice.'};renderMaintenanceWarning();});
   for(const width of [1366,390,320]){
    await page.setViewportSize({width,height:844});
    for(const open of [false,true]){
     await page.locator('#maintenanceStatus details').evaluate((el,value)=>el.open=value,open);
     const layout=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {notice:r('#maintenanceStatus').bottom,metrics:r('.metric-grid').top,metricsEnd:r('.metric-grid').bottom,incidents:r('.compliance-strip').top,incidentsEnd:r('.compliance-strip').bottom,workspace:r('.workspace-grid').top,overflow:document.documentElement.scrollWidth>innerWidth+1};});
     assert(layout.notice<=layout.metrics+1,'notice overlaps cards at '+width);assert(layout.metricsEnd<=layout.incidents+1,'cards overlap incident summary');assert(layout.incidentsEnd<=layout.workspace+1,'incident summary overlaps workspace');assert(!layout.overflow,'dashboard overflow '+width);
    }
   }
   pass('OVERLORD historical warning expands in flow at laptop and narrow mobile widths without overlap');
   if(process.env.LORD_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.LORD_TEST_SCREENSHOTS,'overlord-dashboard-mobile.png'),fullPage:true});
   await page.setViewportSize({width:1366,height:768});
   await page.locator('#systemSettingsBtn').click();await page.locator('#adminCandidate').waitFor();
   assert(await page.locator('#systemSettingsModal').evaluate(el=>el.open));assert.equal(await page.evaluate(()=>document.activeElement.id),'closeSettings');
   for(const width of [1366,390,320]){
    await page.setViewportSize({width,height:844});
    const layout=await page.locator('.settings-card').evaluate(el=>({scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,heading:el.querySelector('.editor-heading').getBoundingClientRect().top}));
    assert(layout.scrollWidth<=layout.clientWidth+1,'settings horizontal overflow '+width);assert(layout.heading>=0,'settings close control clipped '+width);
    await page.locator('#reloadDataBtn').scrollIntoViewIfNeeded();assert(await page.locator('#reloadDataBtn').isVisible());
   }
   await page.setViewportSize({width:1366,height:768});
   assert.equal(await page.locator('#adminWhatsAppConsent').count(),0);assert.equal(await page.locator('#grantAdminBtn').textContent(),'Grant admin access');assert(!(await page.locator('#settingsBody').textContent()).includes('column F'));
   pass('OVERLORD compact settings remain reachable and fit laptop and mobile widths');
   if(process.env.LORD_TEST_SCREENSHOTS)await page.screenshot({path:path.join(process.env.LORD_TEST_SCREENSHOTS,'overlord-settings-desktop.png'),fullPage:true});
   assert(await page.locator('#grantAdminBtn').isDisabled());await page.locator('#adminCandidate').selectOption('colleague@gsps.edu.sg');assert(await page.locator('#grantAdminBtn').isEnabled());
   assert.equal(await page.locator('#adminWhatsAppConsent').count(),0);await page.locator('#grantAdminBtn').click();await page.waitForFunction(()=>document.querySelector('#adminSettingsStatus').textContent.includes('Access saved'));
   assert(granted);pass('OVERLORD grants access after contact selection without obsolete personal consent');
   await page.locator('#reloadDataBtn').click();await page.waitForFunction(()=>document.querySelector('#suiteRefreshStatus').textContent.includes('Shared lists reloaded'));assert.equal(refreshes,1);pass('Only OVERLORD settings invokes the shared refresh command');
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await page.evaluate(()=>document.activeElement.id),'systemSettingsBtn');pass('OVERLORD native dialog closes safely and restores focus');
  }else{
   assert.equal(await page.locator('#reloadDataBtn').count(),0);pass(app.toUpperCase()+' has no end-user forced Sheets control');
  }
  if(app==='lord'){
   await page.locator('#bookBtn').waitFor();
   await page.evaluate(()=>{state.mode='loan';state.loan.cartGroup='Cart A';state.loan.trolleys=[1,2,3].map(n=>({name:'A'+n,quantity:14,photoData:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',fileName:'example.gif'}));renderLoanTrolleys();});
   assert.equal(await page.locator('.trolley-card').count(),3);
   assert.equal(await page.locator('details[data-trolley-phase="loan"]').count(),0,'collection trolleys render open, with no accordion');
   assert(await page.evaluate(()=>[...document.querySelectorAll('.trolley-card .trolley-quantity')].every(el=>el.offsetParent!==null)),'every trolley quantity field is visible at once');
   await page.locator('#loan-quantity-1').fill('13');assert.equal(await page.locator('#loan-quantity-1').inputValue(),'13');assert(await page.evaluate(()=>state.loan.trolleys.every(t=>Boolean(t.photoData))));pass('Three trolley cards render open together and preserve quantities and photo state');
   await page.locator('#loanComments').fill('Keep this draft');await page.locator('#backBtn').focus();
   await page.evaluate(()=>{globalThis.dialogResult=undefined;confirmLORD('Cancel this sample booking?','Cancel booking','Keep booking').then(value=>globalThis.dialogResult=value);});
   assert(await page.locator('[data-safe-focus]').evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');await page.waitForFunction(()=>globalThis.dialogResult===false);assert.equal(await page.locator('#loanComments').inputValue(),'Keep this draft');assert.equal(await page.evaluate(()=>document.activeElement.id),'backBtn');pass('LORD safe default, Escape and focus restoration retain draft fields');
  }
  if(app==='starlord')await page.locator('.tile').first().waitFor();
  for(const width of app==='starlord'?[1366]:[1366,390,320]){await page.setViewportSize({width,height:844});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),app+' page overflow at '+width);pass(app.toUpperCase()+' fits '+width+'px viewport');}
  assert.deepEqual(errors,[]);pass(app.toUpperCase()+' has no browser runtime errors');await page.close();await new Promise(resolve=>server.close(resolve));servers.delete(server);
 }
 await browser.close();fs.writeFileSync(out,JSON.stringify({...evidence(),status:'passed',passed:results.length,failed:0,total:results.length,tests:results},null,2)+'\n');console.log(JSON.stringify({status:'passed',passed:results.length}));
})().catch(async error=>{for(const server of servers)server.close();if(browser)await browser.close();fs.writeFileSync(out,JSON.stringify({...evidence(),status:'failed',passed:results.length,failed:1,error:error.stack,tests:results},null,2)+'\n');console.error(error.stack);process.exitCode=1;});
