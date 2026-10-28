/* Local browser/worker acceptance with fictional reference data. No remote writes. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {worker,response,staff}=require('./frontend_harness.cjs');
const root=path.resolve(__dirname,'..'),servers=[];
const periods=[{code:'1',start:'08:00',end:'08:30',active:true},{code:'2',start:'08:30',end:'09:00',active:true}];
function reference(key='A') {return {
  teachers:['Test Staff','Other Staff'],classes:['1P','1Q'],subjects:['Science'],periods,
  trolleys:[{name:'A1',group:'Cart A',deviceType:'Tablet',defaultQuantity:14}],
  bookingResources:[{resource:'Cart A',deviceType:'Tablet',capacity:14}],
  referenceSource:{enabled:true,key,status:'healthy',lastCheckedAt:'2026-10-24T02:00:00Z',updatedAt:'2026-10-24T01:00:00Z',publication:{id:'published-fixture',name:'Term 4 Timetable',revision:7,from:'2026-10-01',to:'2026-10-31'}},
  referenceCatalog:{teachers:[{id:'t1',name:'Test Staff'},{id:'t2',name:'Other Staff'}],classes:[{id:'c1',name:key==='A'?'1P':'2R'},{id:'c2',name:key==='A'?'1Q':'1P'}],teachingGroups:[{id:'g1',name:'1P'}],activities:[{id:'a1',name:'1P'}],subjects:[{id:'s1',name:'Science'}]}
};}
function serve(app){const dir=path.join(root,'Source',app),server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(dir,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(dir+path.sep))return res.writeHead(403).end();try{res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});servers.push(server);return server;}
async function choose(page,id,key){await page.locator('#'+id).fill('');await page.locator('#'+id+'Choices [data-reference-choice="'+key+'"]').tap();}
let browser;
(async()=>{
  assert.equal(fs.readFileSync(path.join(root,'Source/lord/assets/reference.js'),'utf8'),fs.readFileSync(path.join(root,'Source/overlord/assets/reference.js'),'utf8'));
  for(const app of ['lord','overlord']){
    const w=worker(app,async()=>response({ok:true,data:reference()}),staff);
    await w.call('/api/reference');await w.call('/api/reference');assert.equal(w.requests.length,1);
    await w.call('/api/reference?latest=1');assert.equal(w.requests.length,2);
    assert.equal(w.requests[1].url.searchParams.get('action'),'reference');
    assert.equal(w.requests[1].url.searchParams.has('forceRefresh'),false,'local generation check must not request source sync');
  }
  browser=await require('playwright').chromium.launch({headless:true,...(process.env.LORD_TEST_CHROMIUM?{executablePath:process.env.LORD_TEST_CHROMIUM}:{})});
  for(const app of ['lord','overlord']){
    const server=serve(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Singapore'}),errors=[],writes=[];let key='A',latestReads=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.dismiss());
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),body=req.postDataJSON()||{},action=String(body.action||url.searchParams.get('action')||'').toLowerCase();let payload={ok:true};
      if(url.pathname==='/api/auth/session')payload={ok:true,authenticated:true,session:{ttbName:'Test Staff',email:'test@gsps.edu.sg',sub:'test-sub',isAdmin:app!=='lord'}};
      if(url.pathname==='/api/auth/identity'){await new Promise(resolve=>setTimeout(resolve,250));payload={ok:true,session:{ttbName:'Test Staff',email:'test@gsps.edu.sg',sub:'test-sub',isAdmin:true}};}
      if(url.pathname==='/api/reference'){if(url.searchParams.get('latest')==='1')latestReads++;payload={ok:true,data:reference(key)};}
      if(url.pathname==='/api/dashboard')payload={ok:true,data:{date:'2026-10-24',resources:reference().bookingResources,periods,bookings:[],movements:[],metrics:{},telegram:{}}};
      if(url.pathname==='/api/transaction'){
        if(action==='bookingdayschedule')payload={ok:true,bookings:[]};
        if(action==='bookingcreatebatch'||action==='bookingcreate'||action==='bookingupdate'){
          writes.push(body);
          payload=body.referenceKey!==key?{ok:false,code:'GSIS_REFERENCE_CHANGED',retryable:false,error:'Shared lists changed. Reload choices and review before saving.'}:{ok:true,result:{bookings:[],bookingId:'fixture-booking'}};
        }
      }
      await route.fulfill({json:payload});
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    if(app==='lord'){
      await page.locator('#bookBtn').click();await page.locator('#classOrActivity').waitFor();
      assert.equal(latestReads,1,'one local generation check per new form');
      await page.locator('#classOrActivity').fill('My temporary activity');
      await page.locator('#bookingForTtbName').waitFor();
      assert.equal(await page.locator('#classOrActivity').inputValue(),'My temporary activity','role recovery keeps typed choices');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'classOrActivity','role recovery retains text focus');
      assert.equal(await page.locator('#classOrActivityChoices [role=option]').count(),4);
      await choose(page,'classOrActivity','class:c1');await page.locator('#subject').fill('Science');await page.locator('#subject').press('ArrowDown');await page.locator('#subject').press('Enter');
      await page.locator('#bookingForTtbName').selectOption('teacher:t2');
      await page.evaluate(()=>{state.booking.scheduleKey=state.booking.date;state.booking.daySchedule=[];state.booking.selections=[{resource:'Cart A',quantity:14,startPeriod:'1',endPeriod:'2',headphones:false,styluses:false}];renderBooking();});
      key='B';await page.evaluate(ref=>{state.reference=ref;renderBooking();},reference('B'));
      assert.equal(await page.locator('#classOrActivity').inputValue(),'1P','ordinary redraw must retain opened form generation');
      await page.locator('#confirmBookingBtn').click();await page.locator('#retryBtn').waitFor();
      assert.equal(writes.length,1);assert.equal(writes[0].referenceKey,'A');assert.deepEqual(writes[0].classRef,{kind:'class',id:'c1'});assert.equal(writes[0].subjectId,'s1');assert.equal(writes[0].teacherStaffId,'t2');
      await page.locator('#retryBtn').click();await page.locator('#classOrActivity').waitFor();
      assert.equal(await page.locator('#classOrActivity').inputValue(),'2R','explicit refresh keeps stable ID, not reused old label');
      await choose(page,'classOrActivity','teachingGroup:g1');
      await page.locator('#confirmBookingBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));
      assert.equal(writes[1].referenceKey,'B');assert.deepEqual(writes[1].classRef,{kind:'teachingGroup',id:'g1'});assert.notEqual(writes[1].clientRequestId,writes[0].clientRequestId,'definitive stale rejection permits newly reviewed command');
      await page.locator('#doneBtn').click();await page.locator('#bookBtn').click();await page.locator('#classOrActivity').waitFor();
      await page.locator('#classOrActivity').fill('1P');
      assert.equal(await page.locator('#classOrActivity').getAttribute('maxlength'),'160');
      await page.locator('#subject').fill('Interdisciplinary workshop');
      assert.equal(await page.locator('#subject').getAttribute('maxlength'),'120');
      await page.evaluate(()=>{state.booking.scheduleKey=state.booking.date;state.booking.daySchedule=[];state.booking.selections=[{resource:'Cart A',quantity:14,startPeriod:'1',endPeriod:'2'}];renderBooking();});
      assert.deepEqual((await page.evaluate(()=>bookingReferencePayload())).classRef,{kind:'customActivity',name:'1P'},'custom text matching a current class must not infer or replace its identity');
      await page.locator('#classOrActivity').fill('1Q');
      await page.evaluate(()=>renderBooking());assert.equal(await page.locator('#classOrActivity').inputValue(),'1Q');assert.equal(await page.locator('#subject').inputValue(),'Interdisciplinary workshop');
      await page.evaluate(()=>persistDraft());await page.reload();await page.getByRole('button',{name:'Resume saved form'}).click();await page.locator('#classOrActivity').waitFor();assert.equal(await page.locator('#classOrActivity').getAttribute('data-reference-value'),'customActivity:');assert.equal(await page.locator('#classOrActivity').inputValue(),'1Q');assert.equal(await page.locator('#subject').inputValue(),'Interdisciplinary workshop');
      await page.locator('#confirmBookingBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));
      assert.deepEqual(writes.at(-1).classRef,{kind:'customActivity',name:'1Q'});assert.deepEqual(writes.at(-1).subjectRef,{kind:'customPurpose',name:'Interdisciplinary workshop'});assert(!writes.at(-1).subjectId);assert.equal(writes.at(-1).referenceKey,'B');
      key='A';
      await page.evaluate(async ref=>{state.mode='booking';state.reference=ref;await refreshBookingChoices();applyBookingForEdit({bookingId:'edit-fixture',teacher:'Test Staff',classOrActivity:'Historic Class',subject:'Historic Subject',date:state.booking.date,resource:'Cart A',deviceType:'Tablet',requestedQuantity:14,startPeriod:'1',endPeriod:'2'},{bookingId:'edit-fixture'});state.booking.selections=[{resource:'Cart A',quantity:14,startPeriod:'1',endPeriod:'2'}];renderBookingEdit();},reference('A'));
      assert((await page.locator('.shared-reference-status').textContent()).includes('Term 4 Timetable · revision 7'));
      await choose(page,'classOrActivity','class:c1');await choose(page,'subject','subject:s1');
      key='B';await page.locator('#confirmBookingBtn').click();await page.locator('#retryBtn').waitFor();
      assert.equal(writes.at(-1).referenceKey,'A');
      await page.locator('#retryBtn').click();await page.locator('#classOrActivity').waitFor();
      assert.equal(await page.locator('#classOrActivity').inputValue(),'2R');
      await page.locator('#confirmBookingBtn').click();await page.waitForFunction(()=>document.querySelector('.notice.success'));
      assert.equal(writes.at(-1).referenceKey,'B');assert.equal(writes.at(-1).classOrActivity,'2R');assert.deepEqual(writes.at(-1).classRef,{kind:'class',id:'c1'});

    }else{
      await page.waitForFunction(()=>typeof overlordSession!=='undefined'&&overlordSession);
      await page.evaluate(()=>openCreateBooking('Cart A','1'));await page.locator('#newClass').waitFor();
      assert.equal(latestReads,1);
      await choose(page,'newClass','activity:a1');await choose(page,'newSubject','subject:s1');await page.locator('#newTeacher').selectOption('teacher:t2');await page.locator('#newReason').fill('Fixture reason');
      key='B';await page.locator('#createBooking').click();await page.getByRole('button',{name:'Reload shared choices'}).waitFor();
      assert.equal(writes[0].referenceKey,'A');assert.deepEqual(writes[0].classRef,{kind:'activity',id:'a1'});
      await page.getByRole('button',{name:'Reload shared choices'}).click();await page.waitForFunction(()=>document.querySelector('.shared-reference-status').textContent.includes('Review your choices'));
      assert.equal(await page.locator('#newReason').inputValue(),'Fixture reason');assert.equal(await page.locator('#newClass').getAttribute('data-reference-value'),'activity:a1');
      await page.locator('#createBooking').click();await page.waitForFunction(()=>!document.querySelector('#editorModal'));
      assert.equal(writes[1].referenceKey,'B');assert.equal(writes[1].teacherStaffId,'t2');
      const historical={bookingId:'history',teacher:'Old Staff Label',classOrActivity:'Old Class Label',subject:'Old Subject Label',date:'2026-10-24',resource:'Cart A',deviceType:'Tablet',requestedQuantity:14,startPeriod:'1',endPeriod:'2'};
      await page.evaluate(({b,ref})=>renderEditor(b,'',ref),{b:historical,ref:reference('B')});
      assert.equal(await page.locator('#edClass').inputValue(),'Old Class Label');
      await page.locator('#edReason').fill('Preserve labels');await page.locator('#saveBooking').click();await page.waitForFunction(()=>!document.querySelector('#editorModal'));
      const saved=writes.at(-1);assert.equal(saved.classOrActivity,'Old Class Label');assert.equal(saved.teacher,'Old Staff Label');assert.equal(saved.subject,'Old Subject Label');assert(!saved.classRef&&!saved.teacherStaffId&&!saved.subjectId);
      await page.evaluate(()=>openCreateBooking('Cart A','1'));await page.locator('#newClass').waitFor();
      await page.locator('#newClass').fill('Art club');await page.locator('#newSubject').fill('Project work');await page.locator('#newReason').fill('Custom activity fixture');
      key='A';await page.locator('#createBooking').click();await page.getByRole('button',{name:'Reload shared choices'}).click();await page.waitForFunction(()=>document.querySelector('.shared-reference-status').textContent.includes('Review your choices'));
      assert.equal(await page.locator('#newClass').inputValue(),'Art club');assert.equal(await page.locator('#newSubject').inputValue(),'Project work');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'custom controls fit mobile form');
      await page.locator('#createBooking').click();await page.waitForFunction(()=>!document.querySelector('#editorModal'));
      assert.deepEqual(writes.at(-1).classRef,{kind:'customActivity',name:'Art club'});assert.deepEqual(writes.at(-1).subjectRef,{kind:'customPurpose',name:'Project work'});assert.equal(writes.at(-1).referenceKey,'A');

    }
    assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.close();
  }
  console.log(JSON.stringify({status:'passed',workerLocalGenerationChecks:2,browserApps:2,coverage:['namespaced selectors','pinned open generation','stale reject and explicit refresh','stable ID after class label reuse','TG and local activity payloads','historical labels retained','staff ID payload','mobile viewport','explicit custom activity and purpose','custom drafts survive redraw and refresh','known label cannot become implicit ID']}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();for(const server of servers)await new Promise(resolve=>server.close(resolve));});
