// v710 regression: local search, reused import model and surgical save completion.
// Exercises the shipped whole Roster page with synthetic uploads and a mocked API.
// NODE_PATH=<Playwright modules> ROSTER_TEST_CHROMIUM=<Chromium path> node tests/import708-browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),F=require('./import708-fixture.cjs');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'roster-update/public');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],...((process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE)?{executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'')}):r.abort());
 try{
  await page.goto('https://roster.test/');
  for(const f of ['roster.css','roster-baseline.css'])await page.addStyleTag({content:fs.readFileSync(path.join(pub,f),'utf8')});
  for(const file of ['roster-update/public/jszip.min.js','shared/roster.js','roster-update/public/converter.js','roster-update/public/roster-export.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{
   const entry={id:'existing',name:'Current baseline',from:'2026-01-01',to:'2027-12-31',teacherCount:1,priority:1},week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,maxPeriod:2,blocks:[{name:'Current Teacher',cells:Array.from({length:15},()=>['','','',''])}]};
   const model={layoutMode:'single-week',single:week,maxPeriod:2,teacherCount:1,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:2,endOfDayMinutes:810},recesses:[]};
   const profile={user:{email:'reviewer@example.test',staffId:'reviewer',smc:true,admin:true,accessVerified:true},revision:1,active:entry,selected:entry,entries:[entry],selection:'current'};
   const fixture=window.__importFixture={profile,model,calls:[],uploads:[],fail:true};window.confirm=()=>true;
   const store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)}});
   window.fetch=async(url,args={})=>{
    const route=String(url).split('/').pop(),input=JSON.parse(args.body||'{}');fixture.calls.push({route,input});let data={};
    if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};
    if(route==='profile')data=structuredClone(profile);
    if(route==='read')data={...structuredClone(profile),modelId:'existing',model:structuredClone(model)};
    if(route==='upload'){
     fixture.uploads.push(input);if(fixture.holdUpload)await new Promise(r=>fixture.releaseUpload=r);
     if(fixture.fail)return {ok:false,status:503,json:async()=>({ok:false,error:'Synthetic save unavailable. Retry the same save.'})};
     fixture.saved=input;profile.revision=2;profile.entries=[entry,{id:'new',...input,teacherCount:input.model.teacherCount}];data={...structuredClone(profile),savedId:'new'};
    }
    if(route==='update'){profile.revision++;const row=profile.entries.find(x=>x.id===input.id);row.pruned=input.operation==='prune';data={...structuredClone(profile),savedId:input.id};}
    return {ok:true,status:200,json:async()=>({ok:true,data})};
   };
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(pub,'roster.js'),'utf8')});
  await page.evaluate(()=>{const parse=RosterConverter.parseFile,resolve=RosterConverter.resolveClashes;__importFixture.parses=0;__importFixture.resolves=0;RosterConverter.parseFile=(...a)=>{__importFixture.parses++;return parse(...a);};RosterConverter.resolveClashes=(...a)=>{__importFixture.resolves++;return resolve(...a);};});
  await page.locator('[data-page="Baseline Timetable"]').click();await page.locator('[data-baseline="upload"]').click();
  const upload={name:'Synthetic Teachers.xls',mimeType:'application/vnd.ms-excel',buffer:Buffer.from(F.html({teachers:4}))};
  await page.locator('#source').setInputFiles(upload);await page.waitForSelector('.import-clash');
  if(process.env.ROSTER_TEST_SCREENSHOT){await page.locator('#importClashes').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:process.env.ROSTER_TEST_SCREENSHOT});}
  assert.equal(await page.locator('.import-clash').count(),4);assert.equal(await page.locator('[data-clash]:checked').count(),0);
  assert.match(await page.locator('#importClashes').innerText(),/Resolve the lesson clash in EduPage/);assert.match(await page.locator('#importClashes').innerText(),/Odd week.*Tuesday.*P11/);assert.match(await page.locator('#importClashes').innerText(),/Even week.*Tuesday.*P12/);
  assert.equal(await page.locator('#saveUpload').isDisabled(),true);assert.equal(await page.locator('#previewTimetable').count(),0,'unresolved timetable is never shown as a safe blank schedule');
  await page.locator('[name="name"]').fill('Reviewed baseline');await page.locator('[name="to"]').fill('2027-12-31');
  await page.evaluate(()=>document.getElementById('uploadForm').dispatchEvent(new Event('submit',{cancelable:true})));
  await page.waitForFunction(()=>!document.getElementById('content').inert);assert.equal(await page.evaluate(()=>__importFixture.uploads.length),0,'submit guard also blocks unresolved clashes');
  // Keyboard selection is local and scoped to exactly one slot.
  const calls=await page.evaluate(()=>__importFixture.calls.length);
  await page.locator('.import-clash').nth(0).locator('[data-clash][value="1"]').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-clash]:checked').count(),1);assert.match(await page.locator('#importClashStatus').innerText(),/3 of 4/);assert.equal(await page.locator('#saveUpload').isDisabled(),true);
  await page.locator('[name="start"]').fill('07:30');assert.equal(await page.locator('[data-clash]:checked').count(),1);assert.match(await page.locator('.import-clash').first().innerText(),/13:00 to 13:30/);
  await page.locator('#cancelImport').click();assert.equal(await page.locator('#importClashes').isVisible(),false);assert.equal(await page.locator('#saveUpload').isDisabled(),true);
  assert.equal(await page.evaluate(()=>__importFixture.profile.active.id),'existing');assert.equal(await page.evaluate(()=>__importFixture.uploads.length),0);
  await page.locator('#source').setInputFiles(upload);await page.waitForSelector('.import-clash');assert.equal(await page.locator('[data-clash]:checked').count(),0,'new import has no recycled choices');
  for(let i=0;i<4;i++)await page.locator('.import-clash').nth(i).locator('[data-clash][value="'+(i%2)+'"]').check();
  assert.equal(await page.evaluate(()=>__importFixture.calls.length),calls,'all review selections/cancel/parse remain local');
  assert.equal(await page.locator('#saveUpload').isDisabled(),false);assert.match(await page.locator('#importClashStatus').innerText(),/All 4/);
  await page.locator('#previewDetails > summary').click();await page.locator('#previewTeacherPicker summary').click();await page.locator('#previewTeacherSearch').fill('Teacher 1');await page.locator('#previewTeacherOptions button').first().click();assert.equal(await page.locator('.timetable').count(),2);
  const selected=await page.locator('#previewTeacher').inputValue(),beforeSearch=await page.evaluate(()=>({calls:__importFixture.calls.length,resolves:__importFixture.resolves}));
  await page.locator('#previewTeacherPicker summary').click();await page.locator('#previewTeacherSearch').fill('tEaChEr 2');assert.equal(await page.locator('#previewTeacherOptions button').count(),1);assert.equal(await page.locator('#previewTeacher').inputValue(),selected,'search leaves current preview unchanged');
  await page.locator('#previewTeacherSearch').fill('not a person');assert.equal(await page.locator('#previewTeacherOptions button').count(),0);assert.match(await page.locator('#previewTeacherCount').innerText(),/No teachers match/);assert.equal(await page.locator('#previewTeacher').inputValue(),selected);
  await page.locator('#previewTeacherSearch').fill('');assert.equal(await page.locator('#previewTeacherOptions button').count(),4);await page.locator('#previewTeacherSearch').fill('teacher 2');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#previewTeacher').inputValue(),'Teacher 2');assert.deepEqual(await page.evaluate(()=>({calls:__importFixture.calls.length,resolves:__importFixture.resolves})),beforeSearch,'local search does not call API or revalidate full timetable');
  const beforeSave=await page.evaluate(()=>({calls:__importFixture.calls.length,resolves:__importFixture.resolves,parses:__importFixture.parses}));
  await page.evaluate(()=>__importFixture.holdUpload=true);await page.locator('#saveUpload').click();await page.waitForFunction(()=>!!__importFixture.releaseUpload);assert.equal(await page.locator('#baselineBusy').isVisible(),true);assert.equal(await page.locator('#status').innerText(),'');
  const overlay=await page.locator('#baselineBusy').boundingBox();assert.equal(overlay.y,0);assert.equal(overlay.height,800);const rotation=await page.locator('.baseline-spinner').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(120);assert.notEqual(await page.locator('.baseline-spinner').evaluate(el=>getComputedStyle(el).transform),rotation,'spinner rotates rather than fades');
  await page.evaluate(()=>document.getElementById('uploadForm').dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(await page.evaluate(()=>__importFixture.uploads.length),1,'pending action cannot double submit');await page.evaluate(()=>{__importFixture.holdUpload=false;__importFixture.releaseUpload();});
  await page.waitForSelector('#retrySave').catch(async e=>{throw Error(e.message+' STATUS: '+await page.locator('#status').innerText());});assert.equal(await page.evaluate(()=>__importFixture.uploads.length),1);assert.equal(await page.locator('#baselineBusy').count(),0);
  assert.equal(await page.evaluate(()=>__importFixture.profile.active.id),'existing','failed save does not replace active baseline');
  await page.evaluate(()=>__importFixture.fail=false);await page.locator('#retrySave').click();await page.waitForSelector('#savedTimetables');
  assert.equal(await page.evaluate(()=>__importFixture.calls.length),beforeSave.calls+2,'two save attempts only; no profile/read refresh after confirmation');assert.equal(await page.evaluate(()=>__importFixture.resolves),beforeSave.resolves,'saving reuses the reviewed model');assert.equal(await page.evaluate(()=>__importFixture.parses),beforeSave.parses,'save does not parse original workbook again');
  const beforePrune=await page.evaluate(()=>__importFixture.calls.length);await page.locator('tr[data-id=new] [data-action=prune]').click();await page.waitForFunction(()=>!document.getElementById('baselineBusy'));assert.equal(await page.evaluate(()=>__importFixture.calls.length),beforePrune+1,'prune makes one mutation call and no subsequent profile/model read');assert.equal(await page.locator('tr[data-id=new]').isVisible(),false);await page.locator('#showPruned').check();assert.equal(await page.locator('tr[data-id=new]').isVisible(),true);assert.match(await page.locator('#savedTimetables [data-baseline-feedback]').innerText(),/Saved online/);
  const result=await page.evaluate(async()=>{
   const f=__importFixture,saved=f.saved,archive=await RosterConverter.parseFile(Uint8Array.from(atob(saved.workbook),c=>c.charCodeAt(0)));
   return {uploads:f.uploads,model:saved.model,archive};
  });
  assert.equal(result.uploads.length,2);assert.deepEqual(result.uploads[0],result.uploads[1],'retry preserves exact request, revision and workbook');assert.equal(result.model.importClashes,undefined);
  for(const key of ['odd','even']){assert.equal(result.model[key].blocks[1].cells[28][0],'Activity A');assert.equal(result.model[key].blocks[1].cells[29][0],'Activity B');}
  assert.equal(result.archive.importClashes,undefined);assert.deepEqual(result.archive.odd.blocks.map(b=>b.cells),result.model.odd.blocks.map(b=>b.cells));assert.deepEqual(result.archive.even.blocks.map(b=>b.cells),result.model.even.blocks.map(b=>b.cells));
  assert.deepEqual(errors,[]);console.log('PASS v710 Chromium baseline: local mixed-case search, keyboard/no-results retention; rotating viewport overlay; duplicate blocking and failed draft recovery; exact retry; save parses/resolves unchanged; one prune API call with zero profile/model refresh.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
