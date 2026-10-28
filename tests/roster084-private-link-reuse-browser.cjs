'use strict';
// Exercise the shipped page. Only the external school API is replaced by fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const root='roster-update/public/',origin='https://private.test',link=origin+'/external.html';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const calls=[],errors=[],acknowledged=new Set();let denied=0,holdNext=false,releaseHeld;
 async function context({blocked=true,legacy=false}={}){
  const ctx=await browser.newContext();
  await ctx.addInitScript(({blocked,legacy})=>{
   if(blocked)Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage unavailable','SecurityError');}});
   else if(legacy&&location.origin==='https://private.test')sessionStorage.setItem('gsis-private-relief-link','fixture-a');
  },{blocked,legacy});
  ctx.on('page',page=>{page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));});
  await ctx.route(origin+'/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   assert.equal(url.hash,'','capability must not enter any HTTP URL');
   assert.equal(request.headers().referer,undefined,'private page sends no referrer');
   if(url.pathname!=='/api/external'){
    const name=url.pathname.slice(1);
    return route.fulfill(['external.html','external.js','external.css'].includes(name)?{contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(root+name)}:{status:404,body:''});
   }
   const token=request.headers().authorization?.slice(7),input=request.postDataJSON();
   assert.ok(['fixture-a','fixture-b'].includes(token),'every API call uses the selected link');
   calls.push({token,...input});
   if(holdNext&&token==='fixture-a'&&input.operation==='view'){
    holdNext=false;await new Promise(resolve=>{releaseHeld=resolve;});
   }
   if(denied)return route.fulfill({status:denied,json:{ok:false,error:denied===401?'This private link has expired. Ask SMC for a new link.':'This operation is not allowed.'}});
   if(input.operation==='acknowledge'){
    assert.equal(input.timetableNoticeId,token+'-notice');assert.deepEqual(input.snapshotIds,[]);acknowledged.add(token);
   }
   const data={date:'2026-10-21',linkExpiresAt:1792684799000,duties:[{id:token+'-duty',period:3,subject:token==='fixture-a'?'Teacher A lesson':'Teacher B lesson',className:'4A',venue:'Room 1',instructions:'Review the published instructions.'}],arrangements:[],changes:[],pendingNotices:[],history:[],request:null,timetableNotice:{id:token+'-notice',status:acknowledged.has(token)?'acknowledged':'pending',snapshotIds:[],publishedInstructions:[]}};
   await route.fulfill({json:{ok:true,data}}).catch(error=>{if(!/closed|disposed|canceled|cancelled/i.test(error.message))throw error;});
  });
  return ctx;
 }
 async function shows(page,teacher){await page.waitForFunction(text=>document.getElementById('duty-list').textContent.includes(text),'Teacher '+teacher+' lesson');}
 try{
  const first=await context(),page=await first.newPage();
  await page.goto(link+'#fixture-a');await shows(page,'A');
  assert.equal(new URL(page.url()).hash,'#fixture-a','opening must preserve a reusable address even when storage is blocked');
  await page.reload();await shows(page,'A');
  const second=await context(),reopened=await second.newPage();
  await reopened.goto(page.url());await shows(reopened,'A');
  assert.equal(calls.filter(c=>c.operation==='acknowledge').length,0,'opening and refreshing never acknowledge');
  await reopened.locator('[data-timetable-ack]').click();
  await reopened.waitForFunction(()=>document.querySelector('[data-timetable-ack-status]')?.textContent==='Acknowledged ✓');
  await reopened.reload();await shows(reopened,'A');
  const afterAck=await first.newPage();await afterAck.goto(reopened.url());await shows(afterAck,'A');
  assert.equal(await afterAck.locator('[data-timetable-ack-status]').textContent(),'Acknowledged ✓');
  assert.equal(calls.filter(c=>c.operation==='acknowledge').length,1,'reopening after acknowledgement never duplicates the acknowledgement');

  denied=401;await afterAck.locator('#refresh').click();
  await afterAck.waitForFunction(()=>document.getElementById('status').textContent.includes('expired'));
  assert.equal(await afterAck.locator('#duties').isVisible(),false);assert.equal(await afterAck.locator('#private-notices').count(),0);
  const beforeRetry=calls.length;await afterAck.locator('#refresh').click();await afterAck.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.equal(calls.length,beforeRetry+1,'retry checks server validity instead of consuming the token locally');
  assert.equal(await afterAck.locator('#duty-list').textContent(),'','expired links never reveal the old record');
  denied=0;await afterAck.locator('#refresh').click();await shows(afterAck,'A');
  denied=403;await afterAck.locator('#refresh').click();await afterAck.waitForFunction(()=>document.getElementById('status').textContent.includes('not allowed'));
  denied=0;await afterAck.locator('#refresh').click();await shows(afterAck,'A');

  // A hash-only navigation must discard A's document, including an in-flight A response.
  holdNext=true;await page.evaluate(()=>{window.__oldDocument=true;document.getElementById('refresh').click();});
  await new Promise((resolve,reject)=>{const limit=setTimeout(()=>{clearInterval(timer);reject(Error('A request was not held'));},4000);const timer=setInterval(()=>{if(releaseHeld){clearInterval(timer);clearTimeout(limit);resolve();}},10);});
  await page.evaluate(()=>{location.hash='fixture-b';});await shows(page,'B');
  assert.equal(await page.evaluate(()=>window.__oldDocument),undefined,'different links receive a fresh document');
  releaseHeld();await page.locator('#refresh').click();await shows(page,'B');
  assert.doesNotMatch(await page.locator('main').textContent(),/Teacher A lesson/);
  await page.locator('[data-timetable-ack]').click();await page.waitForFunction(()=>document.querySelector('[data-timetable-ack-status]')?.textContent==='Acknowledged ✓');
  assert.deepEqual(calls.filter(c=>c.operation==='acknowledge').map(c=>[c.token,c.timetableNoticeId]),[['fixture-a','fixture-a-notice'],['fixture-b','fixture-b-notice']]);

  const legacy=await context({blocked:false,legacy:true}),oldTab=await legacy.newPage();
  await oldTab.goto(link);await shows(oldTab,'A');assert.equal(oldTab.url(),link+'#fixture-a','a previously stripped tab recovers its reusable address');
  const missing=await (await context()).newPage();await missing.goto(link);await missing.waitForFunction(()=>document.getElementById('status').textContent.includes('missing'));
  assert.equal(await missing.locator('#duties').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS reusable private links: blocked storage, refresh, new context, acknowledgement, expiry, retry, teacher navigation and legacy recovery');
 }finally{releaseHeld?.();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
