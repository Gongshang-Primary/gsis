/* Real browser proof for the shared immutable timetable and complete dated availability cache. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),pub=path.join(root,'roster-update/public'),browser=await chromium.launch({executablePath:process.env.GSIS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(7000);await page.route('**/*',r=>r.abort());
 try{
  await page.setContent('<base href="https://roster.test/">'+fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''));
  await page.addStyleTag({content:fs.readFileSync(path.join(pub,'roster.css'),'utf8')});
  for(const file of ['shared/roster.js','roster-update/public/roster-export.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.addScriptTag({content:`
   const NativeDate=Date;let clock=NativeDate.parse('2026-10-14T00:00:00Z');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
   const store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)}});
   const entry={id:'model-a',name:'A timetable',from:'2026-01-01',to:'2026-12-31'},timing={startMinutes:420,periodMinutes:30,normalLastPeriod:2},names=['Alice Teacher','Bob Colleague','Ghost Label','Alex Duplicate'];
   const week=busy=>({days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,blocks:names.map((name,i)=>({name,cells:Array.from({length:15},(_,p)=>i===0&&p%3===busy?['EL','4A','C1','']:['','','',''])}))});
   const model={layoutMode:'odd-even',maxPeriod:2,timing,recesses:[],odd:week(0),even:week(1)};
   const profile={user:{email:'alice@gsps.edu.sg',staffId:'alice',smc:true,admin:true,accessVerified:true},revision:1,active:entry,selected:entry,entries:[entry],selection:'current'};
   const people=[{id:'alice',name:'Alice Teacher',timetableName:'Alice Teacher',active:true},{id:'bob',name:'Bob Colleague',timetableName:'Bob Colleague',active:true},{id:'alex1',name:'Alex One',timetableName:'Alex Duplicate',active:true},{id:'alex2',name:'Alex Two',timetableName:'Alex Duplicate',active:true},{id:'external',name:'External Support',timetableName:null,external:true}];
   const f=window.__cacheFixture={calls:[],profile,model,pending:[],tick:ms=>clock+=ms,release(){const pending=this.pending.splice(0);pending.forEach(r=>r());}};
   window.RosterOpsUI={teacherMultiPicker:RosterOpsUI.teacherMultiPicker,pages:()=>[],unmount(){},resetPreloads(){},isDirty:()=>false,preload(ctx){f.cache=ctx;return Promise.resolve();}};
   RosterExport.makeWorkbook=async pages=>{f.excelPages=pages;return {blob:new Blob(['fixture'])};};window.RosterConverter={makeWorkbook:async model=>{f.savedModel=model;return {blob:new Blob(['fixture'])};}};window.confirm=()=>true;window.print=()=>{f.printed=(f.printed||0)+1;};
   window.fetch=async(url,args={})=>{const route=String(url).split('/').pop(),input=JSON.parse(args.body||'{}'),denied=f.denied;f.calls.push({route,input});let data={};
    if(route==='config')return {json:async()=>({clientId:'fixture'})};
    if(route==='profile')data=structuredClone(f.profile);
    if(route==='read'){data={...structuredClone(f.profile),modelId:f.profile.selected.id,model:structuredClone(f.model)};if(f.delayModel)await new Promise(resolve=>f.pending.push(resolve));}
    if(route==='operations'&&input.operation==='inboxList')return {ok:true,status:200,json:async()=>({ok:true,data:{alertCount:0,threads:[]}})};
    if(route==='operations'){if(input.operation!=='availability')throw Error('Unexpected operation '+input.operation);data={complete:input.complete===true,date:input.date,revision:1,allocationRevision:1,timetableId:f.profile.selected.id,parity:input.date==='2026-10-15'?'odd':'even',confirmed:true,people:structuredClone(people),periods:Array.from({length:3},(_,period)=>({period,start:'07:00',end:'07:30',available:people.filter(p=>p.id!=='alice'||period!==1).map(p=>({id:p.id,name:p.name}))}))};await new Promise(resolve=>f.pending.push(resolve));}
    if(denied&&route==='operations')return {ok:false,status:403,json:async()=>({ok:false,error:'Permission denied.'})};return {ok:true,status:200,json:async()=>({ok:true,data})};};
  `});
  await page.addScriptTag({content:fs.readFileSync(path.join(pub,'roster.js'),'utf8')});
  await page.waitForFunction(()=>__cacheFixture.cache?.cachedTimetable('2026-10-14')?.model);
  // The Home inbox badge has its own request; cache assertions still count every other request.
  const calls=()=>page.evaluate(()=>__cacheFixture.calls.filter(x=>x.input.operation!=='inboxList').length),availabilityCalls=()=>page.evaluate(()=>__cacheFixture.calls.filter(x=>x.route==='operations'&&x.input.operation==='availability').length);
  assert.equal(await page.evaluate(()=>__cacheFixture.calls.filter(x=>x.input.operation==='inboxList').length),1,'Home loads one separate inbox badge');
  await page.locator('[data-page="Check Availability"]').click();await page.waitForFunction(()=>!document.querySelector('#teacherSearch').disabled);
  assert.equal(await availabilityCalls(),1);assert.equal(await page.evaluate(()=>__cacheFixture.calls.some(x=>x.input.operation==='directory')),false);
  await page.locator('#teacherSearch').fill('Alice');await page.locator('#teacherSearch').press('Enter');
  assert.match(await page.locator('#timetables').innerText(),/Baseline preview only/);assert.match(await page.locator('#timetables').innerText(),/Odd week/);assert.match(await page.locator('#timetables').innerText(),/Even week/);
  await page.locator('#teacherSearch').fill('Ghost');await page.locator('#teacherSearch').press('Enter');assert.equal(await page.locator('.teacher-chip').count(),2);assert.equal(await availabilityCalls(),1,'selections coalesce with pending snapshot');
  await page.evaluate(()=>__cacheFixture.release());await page.waitForSelector('.teacher-chip[data-staff="alice"]');
  assert.match(await page.locator('#timetables').innerText(),/Baseline preview only/,'unmatched baseline selection is not a live identity');
  await page.locator('.teacher-chip').filter({hasText:'Ghost'}).click();assert.match(await page.locator('#timetables').innerText(),/All selected teachers are free/);
  const readyCount=await calls();await page.locator('#teacherSearch').fill('Bob');await page.locator('#teacherSearch').press('ArrowDown');await page.locator('#teacherSearch').press('Enter');await page.waitForSelector('.teacher-chip[data-staff="bob"]');assert.equal(await calls(),readyCount,'fresh complete overlay serves subsets locally');
  await page.locator('#teacherSearch').fill('External');await page.locator('#teacherSearch').press('Enter');await page.waitForSelector('.teacher-chip[data-staff="external"]');assert.equal(await calls(),readyCount,'external staff preserved from operational snapshot');
  await page.locator('#teacherSearch').fill('Alex Duplicate');await page.locator('#teacherSearch').press('Enter');assert.match(await page.locator('#timetables').innerText(),/Baseline preview only/,'ambiguous mapping cannot confirm availability');
  await page.locator('.teacher-chip').filter({hasText:'Alex Duplicate'}).click();
  await page.evaluate(()=>__cacheFixture.tick(61000));await page.locator('.teacher-chip[data-staff="bob"]').click();assert.match(await page.locator('#timetables').innerText(),/Baseline preview only/);assert.equal(await page.locator('.availability-table').count(),2,'expired parity does not guess odd/even');assert.equal(await availabilityCalls(),1,'expired selection stays local');await page.locator('#retryAvailability').click();assert.equal(await availabilityCalls(),2);
  await page.evaluate(()=>__cacheFixture.release());await page.waitForFunction(()=>document.querySelector('#timetables').textContent.includes('All selected teachers are free'));
  await page.locator('#viewDate').fill('2026-10-15');await page.locator('#viewDate').dispatchEvent('change');assert.equal(await page.locator('#teacherSearch').isEnabled(),true);assert.match(await page.locator('#timetables').innerText(),/Baseline preview only/);assert.equal(await availabilityCalls(),3);await page.evaluate(()=>__cacheFixture.release());await page.waitForFunction(()=>!document.querySelector('#timetables').textContent.includes('Checking current'));
  await page.locator('#nav [data-page="Home"]').click();await page.locator('[data-page="Timetable"]').click();await page.waitForSelector('#nameSearch');const beforeDisplay=await calls();await page.locator('#nameSearch').fill('Alice');await page.locator('#nameSearch').press('Enter');assert.equal(await page.locator('.timetable').count(),2);
  await page.locator('[data-display-field="venue"]').uncheck();await page.locator('#lastPeriod').selectOption('1');await page.evaluate(()=>__cacheFixture.tick(61000));
  // Exports yield one animation frame so progress can paint. Wait for the observable result, not a click handler's synchronous timing.
  await page.locator('#print').click();await page.waitForFunction(()=>__cacheFixture.printed===1&&document.querySelector('#content').getAttribute('aria-busy')==='false');
  await page.locator('[data-timetable="export"]').click();await page.locator('#allTeachers').click();await page.waitForFunction(()=>__cacheFixture.printed===2&&document.querySelector('#content').getAttribute('aria-busy')==='false');
  assert.equal(await calls(),beforeDisplay,'cached display and baseline exports do not fetch Calendar or operations');
  await page.locator('#exportFormat').selectOption('excel');await page.locator('#allTeachers').click();await page.waitForFunction(()=>__cacheFixture.excelPages?.length>0&&document.querySelector('#content').getAttribute('aria-busy')==='false');assert.equal(await calls(),beforeDisplay);
  await page.locator('#nav [data-page=Home]').click();await page.locator('[data-page="Baseline Timetable"]').click();await page.locator('[data-action=excel]').click();await page.waitForFunction(()=>__cacheFixture.savedModel?.layoutMode==='odd-even'&&document.querySelector('#content').getAttribute('aria-busy')==='false');assert.equal(await calls(),beforeDisplay,'saved baseline workbook export reuses cached immutable model');
  await page.evaluate(async()=>{const f=__cacheFixture;f.profile.entries.push({id:'model-b',name:'Next',from:'2027-01-01',to:'2027-12-31'});f.delayModel=true;});
  // A future-date miss is coalesced through the public shared cache helper.
  await page.evaluate(()=>{__cacheFixture.probes=[__cacheFixture.cache.localTimetable('2027-01-05'),__cacheFixture.cache.localTimetable('2027-01-05')];});assert.equal(await page.evaluate(()=>__cacheFixture.calls.filter(c=>c.route==='read'&&c.input.date==='2027-01-05').length),1);await page.evaluate(()=>{__cacheFixture.release();__cacheFixture.delayModel=false;});
  // In-flight snapshot from the old account must not repopulate a refreshed session.
  await page.locator('#nav [data-page="Home"]').click();await page.locator('[data-page="Check Availability"]').click();await page.waitForFunction(()=>__cacheFixture.pending.length>0);
  await page.evaluate(()=>{const f=__cacheFixture;f.profile.user={...f.profile.user,email:'new@gsps.edu.sg',staffId:'new'};f.profile.selected=f.profile.active=f.profile.entries[0]={id:'model-new',name:'New source',from:'2026-01-01',to:'2026-12-31'};f.profile.entries=[f.profile.selected];f.model={...f.model,odd:{...f.model.odd,blocks:[{name:'New Account Teacher',cells:Array.from({length:15},()=>['','','',''])}]},even:{...f.model.even,blocks:[{name:'New Account Teacher',cells:Array.from({length:15},()=>['','','',''])}]}};});
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#account').textContent==='new@gsps.edu.sg');await page.evaluate(()=>__cacheFixture.release());await page.waitForFunction(()=>document.querySelector('#teacherChoices')?.textContent.includes('New Account Teacher'));
  assert.equal(await page.locator('.teacher-chip').count(),0,'account change clears selections');assert.equal(await page.locator('#teacherChoices').textContent().then(s=>s.includes('Ghost Label')),false,'old model cannot return after session changes');
  await page.evaluate(()=>{__cacheFixture.denied=true;__cacheFixture.tick(61000);});await page.locator('#teacherSearch').fill('New Account');await page.locator('#teacherSearch').press('Enter');await page.locator('#retryAvailability').click();await page.evaluate(()=>__cacheFixture.release());await page.waitForFunction(()=>document.querySelector('#timetables').textContent.includes('Permission denied'));assert.equal(await page.locator('.teacher-chip').count(),0);assert.equal(await page.locator('.availability-table').count(),0);assert.equal(await page.evaluate(()=>__cacheFixture.cache.cachedTimetable('2026-10-14')),null,'denied reads discard models');
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS Chromium: warm names before backend, coalesced complete overlay, local selections and baseline exports, unmapped/ambiguous identity, external staff, expiry/parity/date/account isolation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
