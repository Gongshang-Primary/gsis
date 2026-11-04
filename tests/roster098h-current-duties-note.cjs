'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const note='Duties changed since this message. The current timetable is shown below.';
const projection=()=>({date:'2026-11-06',name:'Recipient',duties:[{period:2,subject:'EL',className:'4A',instructions:'Current instructions'}],arrangements:[],changes:[],history:[],pendingNotices:[],timetableNotice:{id:'current-notice',status:'pending',snapshotIds:[]},linkExpiresAt:Date.parse('2026-11-10T00:00:00Z')});
async function harness(browser,data){
 const page=await browser.newPage();let view=data,status=200;
 await page.route('https://private.test/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/external'){
   assert.equal(request.headers().authorization,'Bearer fixture-token');assert.equal(url.hash,'');
   const input=request.postDataJSON();
   if(input.operation==='view')return route.fulfill({status,json:status===200?{ok:true,data:view}:{ok:false,error:status===403?'Access revoked.':'Link expired.'}});
   return route.fulfill({json:{ok:true,data:{acknowledged:{timetableNoticeId:input.timetableNoticeId,snapshotIds:[],acknowledgedAt:'2026-11-06T00:00:00Z'}}}});
  }
  const path='roster-update/public'+url.pathname;if(!fs.existsSync(path))return route.fulfill({status:404,body:''});
  let content=fs.readFileSync(path,'utf8');if(path.endsWith('/external.js'))content=content.replace(/\/\* GSIS_ROSTER_TIMETABLE_VIEW_BEGIN \*\/[\s\S]*?\/\* GSIS_ROSTER_TIMETABLE_VIEW_END \*\//,fs.readFileSync('shared/roster-timetable-view.js','utf8'));
  return route.fulfill({body:content,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://private.test/external.html#fixture-token');await page.locator('[data-timetable-ack]').waitFor();
 return {page,setView:value=>{view=value;},deny:code=>{status=code;}};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM,args:['--no-sandbox']});
 try{
  for(const updatedSinceMessage of [undefined,false,'true']){const h=await harness(browser,{...projection(),updatedSinceMessage});assert.equal(await h.page.getByText(note,{exact:true}).count(),0,'ordinary, equivalent and non-boolean flags show no changed-duties note');assert.match(await h.page.locator('h1').innerText(),/published timetable/);await h.page.close();}
  const h=await harness(browser,{...projection(),updatedSinceMessage:true});assert.equal(await h.page.locator('#private-actions').getByText(note,{exact:true}).count(),1);assert.match(await h.page.locator('#duty-list').innerText(),/Current instructions/);await h.page.locator('[data-timetable-ack]').click();await h.page.locator('[data-timetable-ack-confirmed]').waitFor();assert.equal(await h.page.getByText(note,{exact:true}).count(),1,'acknowledgement keeps the current-duty context');h.setView(projection());await h.page.locator('#refresh').click();await h.page.locator('[data-timetable-ack]').waitFor();assert.equal(await h.page.getByText(note,{exact:true}).count(),0,'a refreshed unflagged view removes the old note');assert.equal(new URL(h.page.url()).hash,'#fixture-token');await h.page.close();
  for(const status of [401,403]){const h=await harness(browser,{...projection(),updatedSinceMessage:true});assert.equal(await h.page.getByText(note,{exact:true}).count(),1);h.deny(status);await h.page.locator('#refresh').click();await h.page.waitForFunction(()=>document.getElementById('status').className==='error');assert.equal(await h.page.getByText(note,{exact:true}).count(),0,'expiry or revocation clears the changed-duties context');assert.equal(await h.page.locator('#private-actions').innerText(),'');assert(await h.page.locator('#duties').isHidden());assert.equal(await h.page.evaluate(()=>sessionStorage.getItem('gsis-private-relief-link')),null);await h.page.close();}
  console.log('PASS private current-duty note: explicit changed flag only, unchanged labels and acknowledgement, refresh removal, expiry/revocation clearance');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
