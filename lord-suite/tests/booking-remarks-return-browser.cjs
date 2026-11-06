/* User interaction regressions with fictional local responses. No remote writes. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../Source/lord');
const reference={teachers:['Test Staff'],classes:['1A'],subjects:['Science'],trolleys:[],
  periods:[{code:'1',start:'08:00',end:'08:30'},{code:'2',start:'08:30',end:'09:00'}],
  bookingResources:[{resource:'Cart A',deviceType:'Tablet',capacity:14}]};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();try{res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,...(process.env.LORD_TEST_CHROMIUM?{executablePath:process.env.LORD_TEST_CHROMIUM}:{})});
  const page=await browser.newPage({viewport:{width:1366,height:768},timezoneId:'Asia/Singapore'}),errors=[],writes=[];
  let savedBooking=null,bundledSchedule=true,scheduleReads=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.postDataJSON()||{},action=String(body.action||url.searchParams.get('action')||'').toLowerCase();let payload={ok:true};
    if(url.pathname==='/api/auth/session')payload={ok:true,authenticated:true,session:{ttbName:'Test Staff',email:'test@gsps.edu.sg',sub:'test-sub',isAdmin:false}};
    if(url.pathname==='/api/reference')payload={ok:true,data:reference,...(bundledSchedule&&url.searchParams.has('date')?{date:url.searchParams.get('date'),daySchedule:[]}: {})};
    if(action==='bookingdayschedule'){scheduleReads++;payload={ok:true,bookings:[]};}
    if(action==='bookingcreatebatch'){
      writes.push(body);savedBooking={...body,...body.bookings[0],bookingId:'fixture-booking',teacher:'Test Staff',status:'BOOKED'};
      payload={ok:true,result:{bookings:[savedBooking]}};
    }
    if(action==='bookingget')payload={ok:true,booking:savedBooking};
    if(action==='return'){writes.push(body);payload={ok:true,result:{sessionId:body.sessionId,status:body.issue?'RETURNED WITH ISSUE':'RETURNED',returnDeviceTotal:14}};}
    await route.fulfill({json:payload});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.locator('#bookBtn').click();
  await page.locator('#classOrActivity').fill('1A');await page.locator('#subject').fill('Science');
  assert.equal(scheduleReads,0,'combined booking open avoids a second backend round trip');
  await page.evaluate(()=>{state.booking.scheduleKey=state.booking.date;state.booking.daySchedule=[];state.booking.selections=[{resource:'Cart A',quantity:14,startPeriod:'1',endPeriod:'2'}];renderBooking();});
  const remarks=page.locator('.selection-remarks');
  await remarks.click();await remarks.pressSequentially('Please leave the trolley outside');
  assert.equal(await remarks.inputValue(),'Please leave the trolley outside','Space must be typed in the Remarks input');
  assert.equal(await remarks.evaluate(el=>document.activeElement===el),true,'typing keeps focus');
  await remarks.press('Home');await remarks.press('ArrowRight');await remarks.press('Space');await remarks.press('Space');
  assert.equal(await remarks.inputValue(),'P  lease leave the trolley outside','repeated inserted spaces survive');
  assert.deepEqual(await remarks.evaluate(el=>[el.selectionStart,el.selectionEnd]),[3,3]);
  await remarks.press('Backspace');await remarks.press('Backspace');
  assert.equal(await remarks.inputValue(),'Please leave the trolley outside');
  await remarks.press('Enter');assert.equal(await remarks.evaluate(el=>document.activeElement===el),true,'input Enter must not select or rebuild its card');
  const card=page.locator('.multi-booking-item');await card.focus();await card.press('Space');
  assert.equal(await card.evaluate(el=>document.activeElement===el&&el.classList.contains('selection-focused')),true,'keyboard selection retains card focus');
  await remarks.focus();
  await remarks.fill('Please leave  the trolley outside');
  await remarks.evaluate(el=>el.setSelectionRange(7,12));
  await page.evaluate(()=>renderBooking());
  assert.equal(await remarks.inputValue(),'Please leave  the trolley outside','ordinary form redraw retains draft text');
  assert.equal(await remarks.evaluate(el=>document.activeElement===el),true,'ordinary redraw retains Remarks focus');
  assert.deepEqual(await remarks.evaluate(el=>[el.selectionStart,el.selectionEnd]),[7,12],'ordinary redraw retains cursor selection');
  await page.reload();await page.getByRole('button',{name:'Resume saved form'}).click();
  assert.equal(await remarks.inputValue(),'Please leave  the trolley outside','saved draft retains spaces');
  await page.locator('#confirmBookingBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));
  assert.equal(savedBooking.remarks,'Please leave  the trolley outside','submit payload retains spaces');
  await page.evaluate(()=>openOwnedBooking('fixture-booking'));
  assert((await page.locator('.session-meta').textContent()).includes('Please leave  the trolley outside'),'reopened booking retains submitted text');
  bundledSchedule=false;
  await page.evaluate(()=>{state.booking.scheduleKey='';state.booking.scheduleLoading=false;state.booking.selections=[];renderLanding();});
  const priorScheduleReads=scheduleReads;await page.locator('#bookBtn').click();
  await page.waitForFunction(()=>state.booking.scheduleKey===state.booking.date&&!state.booking.scheduleLoading);
  assert.equal(scheduleReads,priorScheduleReads+1,'older backend retains the separate schedule fallback');
  const setupReturn=()=>page.evaluate(()=>{
    state.busy=false;state.return={...state.return,selectionMode:'carried',teacher:'Test Staff',issue:false,issueNotes:'',comments:'',
      selectedSession:{sessionId:'return-fixture',classOrActivity:'1A',subject:'Science',loanTrolleyCount:1,loanDeviceTotal:14,loanTeacher:'Test Staff',stylusQuantity:0,headphoneQuantity:0},
      trolleys:[{name:'A1',trolleyRecordId:'trolley-fixture',loanQuantity:14,quantity:14,photoData:'data:image/png;base64,fixture',fileName:'fixture.png'}]};renderReturnForm();
  });
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:390,height:844},{width:360,height:800}]){
    await page.setViewportSize(viewport);await setupReturn();
    const buttons=page.locator('.return-actions > button');assert.equal(await buttons.count(),3);
    const rects=await buttons.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,text:el.innerText,bg:getComputedStyle(el).backgroundColor,font:getComputedStyle(el).fontSize,scroll:el.scrollWidth,client:el.clientWidth};}));
    assert.deepEqual(rects.map(r=>r.text.replace(/\s+/g,' ').trim()),['Back','Return devices with issues','Return devices without issues']);
    assert(rects.every(r=>Math.abs(r.top-rects[0].top)<1),'return actions share one row');
    assert(rects.every(r=>Math.abs(r.width-rects[0].width)<1),'return actions each occupy one third');
    assert(rects.every(r=>r.height>=44&&r.scroll<=r.client+1),'touch targets fit their labels');
    const labelLines=await buttons.locator('span').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),font:getComputedStyle(el).font})));assert(labelLines.every(el=>el.height<=el.line+1),'each return label occupies exactly two lines at '+viewport.width+'px: '+JSON.stringify({rects,labelLines}));
    assert(rects[0].left<rects[1].left&&rects[1].left<rects[2].left);
    assert.equal(rects[1].bg,'rgb(166, 60, 60)');assert.equal(rects[2].bg,'rgb(31, 122, 77)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if(viewport.width===360&&process.env.LORD_RETURN_SCREENSHOT)await page.locator('.return-actions').screenshot({path:process.env.LORD_RETURN_SCREENSHOT});
  }
  await page.locator('#returnIssueBtn').click();assert.equal(writes.filter(w=>w.action==='return').length,0,'issue choice opens details before sending');
  assert.equal(await page.locator('#returnIssueNotes').evaluate(el=>document.activeElement===el),true);
  await page.locator('#returnIssueNotes').fill('One device is damaged');await page.locator('#returnIssueBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));
  assert.equal(writes.at(-1).issue,true);assert.equal(writes.at(-1).issueNotes,'One device is damaged');
  await setupReturn();await page.locator('#submitReturnBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));assert.equal(writes.at(-1).issue,false);
  assert.equal(writes.at(-1).trolleys[0].correctTrolleyDeclaration,true,'clean return still sends the correct-trolley declaration');
  assert.equal(writes.at(-1).trolleys[0].sameOrientationDeclaration,true,'clean return still sends the same-orientation declaration');
  assert.equal(await page.locator('.return-trolley-selected').count(),0,'no per-trolley selection checkbox');
  assert.equal(await page.locator('details[data-trolley-phase="return"]').count(),0,'return trolleys render open, with no accordion');
  await setupReturn();await page.locator('.return-quantity').fill('13');const count=writes.length;await page.locator('#submitReturnBtn').click();assert.equal(writes.length,count,'green action cannot bypass quantity discrepancy');assert.equal(await page.locator('#returnIssueNotes').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',coverage:['space keyboard entry and cursor','repeated spaces','draft redraw and reload','save and reopen','three equal return actions at four viewport sizes','explicit issue/clean submissions','mismatch cannot become clean return']}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
