'use strict';
// Runs the shipped page with real browser storage and synthetic API responses.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const pub=path.resolve(__dirname,'../roster-update/public'),date='2026-10-14';
const entry=id=>({id,name:'School baseline '+id,from:'2026-01-01',to:'2026-12-31',priority:1,teacherCount:150});
function model(first='Alice Cached'){
 const names=[first,'Bob Cached',...Array.from({length:148},(_,i)=>'Teacher '+String(i+3).padStart(3,'0'))];
 const week=offset=>({days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:names.map((name,i)=>({name,cells:Array.from({length:85},(_,p)=>(p+i+offset)%4===0?['EL','4A','C1-01','Group A']:['','','',''])}))});
 return {layoutMode:'odd-even',maxPeriod:16,teacherCount:names.length,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12,endOfDayMinutes:810},recesses:[],odd:week(0),even:week(1)};
}
function fixture(){
 const current=entry('baseline-a');
 return {calls:[],model:model(),profile:{user:{email:'alice@example.test',staffId:'alice',smc:true,admin:true,accessVerified:true},revision:1,active:current,selected:current,entries:[current],selection:'current'}};
}
const cacheContextStub=`window.RosterOpsUI={pages:()=>[{name:'Report Absence',icon:'absence-report'}],unmount(){},resetPreloads(){},isDirty:()=>false,preload(ctx){window.__cacheContext=ctx;return Promise.resolve();}};`;
async function harness(browser,f,blockedStorage=false){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];
 await context.addInitScript(({blockedStorage})=>{
  const RealDate=Date,clock=RealDate.parse('2026-10-14T00:00:00Z');
  window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
  window.google={accounts:{id:{initialize(){},renderButton(target){target.textContent='Synthetic sign-in';}}}};
  if(blockedStorage)Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Synthetic storage blocked','SecurityError');}});
 },{blockedStorage});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://roster.test')return route.abort();
  if(url.pathname.startsWith('/api/')){
   const name=url.pathname.slice(5),input=route.request().postDataJSON()||{};
   f.calls.push({name,input});let data={};
   if(name==='config')return route.fulfill({json:{clientId:'synthetic-browser-test'}});
   if(name==='operations'&&input.operation==='timetableBatch')return route.fulfill({status:503,json:{ok:false,error:'Background preload unavailable in this baseline-cache fixture.'}});
   if(name==='logout')f.signedOut=true;
   if(name==='session'&&f.signedOut)return route.fulfill({status:401,json:{ok:false,error:'Sign in again.'}});
   if(name==='profile'){
    if(f.holdProfile)await new Promise(resolve=>f.releaseProfile=resolve);
    data=structuredClone(f.profile);
   }else if(name==='read'){
    const current=f.profile.selected;
    data={...structuredClone(f.profile),modelId:current.id,...(input.knownModelIds?.includes(current.id)?{modelUnchanged:true}:{model:structuredClone(f.model)}),...(input.calendar===false?{}:{calendar:{available:true,date:input.date,schoolDay:true,parity:'odd',term:4,schoolWeek:1}})};
   }else if(name==='operations'&&input.operation==='read'&&input.view==='reportForm'){
    data={schema:1,date,today:date,minute:480,revision:f.profile.revision,user:f.profile.user,people:[{id:f.profile.user.staffId,name:'Alice Cached',active:true,absenceEligible:true}],types:[],timetablePeople:[{id:f.profile.user.staffId,name:'Alice Cached'}],nameBridges:[],noReliefSubjects:[],checkedAt:date+'T00:00:00Z'};
   }else if(name==='operations'&&input.operation==='timetableDay'){
    data={date:input.date,baselineId:f.profile.selected.id,source:'baseline',sourceRevision:f.profile.revision,publicationRevision:0,calendar:{status:'not-requested',verified:false},periods:[],teachers:[]};
   }else if(name==='operations'&&input.operation==='read'&&input.view==='duties'){
    data={date:input.date,today:date,user:f.profile.user,myDuties:[]};
   }else if(name==='operations'&&input.operation==='currentDuty'){
    data={date,status:'verified',teachers:[],checkedAt:new Date().toISOString()};
   }else if(name==='operations'&&input.operation==='acknowledgementStatus'){
    data={date,revision:0,notice:null};
   }else if(name==='operations'&&input.operation==='inboxList'){
    data={threads:[],nextCursor:null,people:[],alertCount:2,now:Date.now()};
   }else if(!['session','logout'].includes(name))throw Error('Unexpected API route: '+name+':'+input.operation);
   return route.fulfill({json:{ok:true,data}});
  }
  if(url.pathname==='/roster-operations-ui.js')return route.fulfill({contentType:'text/javascript',body:cacheContextStub});
  if(url.pathname==='/roster-baseline-cache.js'&&f.holdCacheGet)return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(pub,'roster-baseline-cache.js'),'utf8')+`;{const get=RosterBaselineCache.get;let held=false;RosterBaselineCache.get=async(...args)=>{const value=await get(...args);if(!held){held=true;window.__heldCacheValue=value;await new Promise(resolve=>window.__releaseCacheGet=resolve);}return value;};}`});
  const file=path.resolve(pub,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(pub+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing fixture asset'});
  return route.fulfill({path:file});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 return {context,page,errors};
}
const readCount=f=>f.calls.filter(c=>c.name==='read'&&c.input.calendar===false).length;
const calendarCount=f=>f.calls.filter(c=>c.name==='read'&&c.input.calendar!==false).length;
async function prepare(page,cacheOnly=false){
 await page.locator('[data-page="Report Absence"]').waitFor();
 await page.evaluate(({date,cacheOnly})=>{document.querySelector('[data-page="Report Absence"]').dispatchEvent(new Event('pointerenter'));window.__localRestore=__cacheContext.localTimetable(date,false,cacheOnly);}, {date,cacheOnly});
}
async function ready(page,name,cacheOnly=false){
 await prepare(page,cacheOnly);
 await page.waitForFunction(({date,name})=>window.__cacheContext?.cachedTimetable(date)?.model?.odd?.blocks[0]?.name===name,{date,name});
 await page.waitForFunction(()=>document.querySelector('#refresh')?.disabled===false);
}
async function showTeacher(page,name){
 await page.locator('[data-page="Timetable"]').click();
 await page.locator('#nameSearch').fill(name);await page.locator('#nameSearch').press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('.timetable').length===2);
 assert.match(await page.locator('#timetables').innerText(),/EL/);
 await page.waitForFunction(()=>document.querySelector('#timetableDayStatus')?.textContent.includes('No confirmed or published suspended timetable')&&document.querySelector('#timetableCalendar')?.textContent.includes('Term 4'));
}
async function persisted(page,name){
 // Wait for the actual IndexedDB transaction, so reload does not race a pending write.
 await page.waitForFunction(async name=>{
  for(const database of await indexedDB.databases()){
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(database.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   try{
    for(const store of db.objectStoreNames){
     const rows=await new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
     if(JSON.stringify(rows).includes(name))return true;
    }
   }finally{db.close();}
  }
  return false;
 },name);
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const f=fixture(),{context,page,errors}=await harness(browser,f);
  await page.goto('https://roster.test/');await prepare(page,true);assert.equal(await page.evaluate(()=>__localRestore),null,'cache-only miss does not start an online model read');assert.equal(readCount(f),0);await ready(page,'Alice Cached');
  assert.equal(readCount(f),1,'first requested view downloads one shared baseline');
  await page.locator('.function-tile [data-inbox-alert]').waitFor({state:'visible'});
  assert.match(await page.locator('.function-tile [data-inbox-alert]').innerText(),/2 new conversations/);
  await page.evaluate(()=>{location.hash='whatsappInbox';});
  await page.locator('[data-inbox-search]').waitFor();
  assert.equal(await page.locator('#content h2').innerText(),'WhatsApp Inbox','alert link opens the authorized inbox');
  await page.waitForFunction(()=>location.hash==='');
  await page.locator('#nav [data-page="Home"]').click();
  await showTeacher(page,'Alice Cached');await persisted(page,'Alice Cached');
  const coldBytes=Buffer.byteLength(JSON.stringify(f.model));

  // Existing browser data is not shown until the server verifies the current account.
  f.calls=[];f.holdProfile=true;
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Loading'));
  for(let attempts=0;!f.releaseProfile&&attempts<500;attempts++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(typeof f.releaseProfile,'function','profile request reaches the held authorization check');
  assert.equal(await page.locator('#content').innerText().then(s=>s.includes('Alice Cached')),false);
  assert.equal(await page.evaluate(()=>!!window.__cacheContext),false);
  f.holdProfile=false;f.releaseProfile();delete f.releaseProfile;
  await ready(page,'Alice Cached',true);
  assert.equal(f.calls.filter(c=>c.name==='profile').length,1,'each reload rechecks authority');
  assert.equal(readCount(f),0,'first requested view after verified warm reload uses IndexedDB');

  const start=Date.now();await showTeacher(page,'Alice Cached');
  await page.locator('#viewDate').fill('2026-10-15');await page.locator('#viewDate').dispatchEvent('change');
  await page.locator('#nameSearch').fill('Bob Cached');await page.locator('#nameSearch').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.timetable').length===2);
  await page.locator('[data-timetable="class"]').click();await page.locator('#nameSearch').fill('4A');await page.locator('#nameSearch').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.timetable').length===2);
  await page.waitForFunction(()=>document.querySelector('#timetableCalendar')?.textContent.includes('Term 4'));
  assert.equal(readCount(f),0,'date, teacher search, class projection and display use the local baseline');
  assert.equal(calendarCount(f),2,'ordinary dates check Calendar separately without downloading another baseline');
  assert.equal(f.calls.filter(c=>c.name==='operations'&&c.input.operation==='timetableDay').length,2,'each selected date checks its public timetable source');
  const localFlowMs=Date.now()-start;
  await page.evaluate(date=>__cacheContext.localTimetable(date,true),date);
  assert.equal(readCount(f),1,'explicit refresh still revalidates online');

  // Editing timetable metadata does not replace its immutable model.
  f.profile.revision++;f.calls=[];await page.reload();await ready(page,'Alice Cached');
  assert.equal(readCount(f),0,'metadata revision retains the same model');

  const owner=user=>JSON.stringify([user.email.toLowerCase(),user.staffId,user.smc,user.admin]);
  await page.evaluate(owner=>RosterBaselineCache.put(owner,'baseline-a',{layoutMode:'odd-even',odd:{broken:true}}),owner(f.profile.user));
  f.calls=[];await page.reload();await ready(page,'Alice Cached');
  assert.equal(readCount(f),1,'corrupt persistent model is replaced from the server');
  await persisted(page,'Alice Cached');

  // A force call joining an unfinished disk restore must still check the server.
  f.holdCacheGet=true;f.calls=[];await page.reload();await prepare(page);
  await page.waitForFunction(()=>window.__releaseCacheGet&&window.__cacheContext);
  assert.equal(await page.evaluate(()=>__heldCacheValue.odd.blocks[0].name),'Alice Cached');
  await page.evaluate(date=>{window.__forcedCacheRead=__cacheContext.localTimetable(date,true);__releaseCacheGet();},date);
  await page.evaluate(()=>__forcedCacheRead);await ready(page,'Alice Cached');
  assert.equal(readCount(f),1,'forced join upgrades the existing restore to one online read');
  f.holdCacheGet=false;

  // A trusted register can advance while this account's disk read is pending.
  f.holdCacheGet=true;f.calls=[];await page.reload();await prepare(page,true);await page.waitForFunction(()=>window.__releaseCacheGet);
  await page.evaluate(()=>{const next={...__cacheContext.profile.selected,id:'newer-baseline'};Object.assign(__cacheContext.profile,{selected:next,active:next,entries:[next]});window.__restoreOutcome=__localRestore.then(()=>({accepted:true}),error=>({stale:error.stale}));__releaseCacheGet();});
  assert.deepEqual(await page.evaluate(()=>__restoreOutcome),{stale:true});assert.equal(await page.evaluate(date=>__cacheContext.cachedTimetable(date),date),null,'late disk copy cannot replace the newly selected baseline');assert.equal(readCount(f),0,'cache-only stale restore never falls through to an online read');f.holdCacheGet=false;

  // Different verified account cannot reuse another account's baseline with the same id.
  f.profile.user={...f.profile.user,email:'other@example.test',staffId:'other'};f.model=model('Other Account Teacher');f.calls=[];
  await page.reload();await prepare(page,true);assert.equal(await page.evaluate(()=>__localRestore),null,'cache-only restore cannot reuse another account');assert.equal(readCount(f),0);await ready(page,'Other Account Teacher');
  assert.equal(readCount(f),1,'new account downloads its own authorized model');
  await persisted(page,'Other Account Teacher');

  // A newly selected baseline never renders the old saved version.
  f.profile.selected=f.profile.active=entry('baseline-b');f.profile.entries=[f.profile.selected];f.model=model('Updated Baseline Teacher');f.calls=[];
  await page.reload();await ready(page,'Updated Baseline Teacher');
  assert.equal(readCount(f),1,'new baseline id invalidates the old selection');
  await persisted(page,'Updated Baseline Teacher');

  // A changed authorization scope also requires a fresh model read.
  f.profile.user={...f.profile.user,smc:false,admin:false};f.model=model('Teacher Scope Model');f.calls=[];
  await page.reload();await ready(page,'Teacher Scope Model');
  assert.equal(readCount(f),1,'role change cannot reuse the previous scope');
  assert.equal(await page.locator('[data-page="WhatsApp Inbox"]').count(),0,'normal teachers have no Inbox navigation');
  assert.equal(f.calls.some(c=>c.input.operation==='inboxList'),false,'normal teachers do not fetch duty alert counts');
  await persisted(page,'Teacher Scope Model');

  f.profile.user.accessVerified=false;f.calls=[];await page.reload();
  await page.waitForSelector('#retryLoad');
  assert.match(await page.locator('#content').innerText(),/access could not be verified/i);
  assert.equal(await page.locator('#account').innerText(),'');assert.equal(readCount(f),0);
  assert.equal(await page.locator('.timetable').count(),0,'unverified profile cannot display persisted data');

  f.profile.user.accessVerified=true;await page.reload();await ready(page,'Teacher Scope Model');
  await page.locator('#logout').click();await page.waitForFunction(()=>document.querySelector('#signin')?.textContent==='Synthetic sign-in');
  await page.waitForFunction(async owner=>(await RosterBaselineCache.get(owner,'baseline-b'))===null,owner(f.profile.user));
  assert.equal(await page.locator('#account').innerText(),'');
  assert.equal(await page.locator('.timetable').count(),0,'signout clears the displayed timetable and its persistent copy');
  assert.deepEqual(errors,[]);await context.close();

  // Browsers that reject persistent storage still load from the normal online endpoint.
  const fallback=fixture(),blocked=await harness(browser,fallback,true);
  await blocked.page.goto('https://roster.test/');await ready(blocked.page,'Alice Cached');
  assert.equal(readCount(fallback),1);await showTeacher(blocked.page,'Alice Cached');
  await blocked.page.reload();await ready(blocked.page,'Alice Cached');
  assert.equal(readCount(fallback),2,'blocked storage falls back to one online load per navigation');
  assert.deepEqual(blocked.errors,[]);await blocked.context.close();
  console.log('PASS persistent baseline Chromium: 150 teachers, odd/even '+coldBytes+' model bytes; cold reads 1, verified warm reads 0; local date/name/class flow '+localFlowMs+' ms; metadata reuse, forced refresh and pending-disk join, corrupt-cache replacement, account/model/role isolation, unverified denial, signout deletion, blocked-storage fallback.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
