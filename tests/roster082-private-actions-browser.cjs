'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const origin='https://private.test',calls=[];let notice='publication-1',ack=false,stale=false;
 const cells=Array.from({length:13},()=>['','','','']),baseline=structuredClone(cells),periods=Array.from({length:12},(_,i)=>({period:i+1,start:'08:00',end:'08:30'}));
 cells[1]=['Form','3A','Room A','Cover'];cells[2]=['MTL','1A/1B','Room B','ML1'];for(const p of [4,5,6]){baseline[p]=['EL','5A','Original room','EL'];cells[p]=['EL','5A','Room C','EL PO'];}cells[8]=['CCE','5A/5B','Room D','ML2'];for(const p of [11,12])cells[p]=['MTL','5A/5B','Room D / Room E','ML2'];
 const data=()=>({date:'2026-10-21',name:'Fixture Teacher',linkExpiresAt:Date.now()+7*86400000,duties:[{id:'duty',period:1,subject:'Form',className:'3A',instructions:'Review these instructions.'}],arrangements:[],changes:[],pendingNotices:[],history:[],timetable:{daily:{name:'Fixture Teacher',date:'2026-10-21',periods,baseline:{cells:baseline},modified:{cells},mats:[]}},timetableNotice:{id:notice,status:ack?'acknowledged':'pending',snapshotIds:[],publishedInstructions:[]}});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.route(origin+'/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.pathname!=='/api/external'){const path='roster-update/public'+url.pathname;return route.fulfill(fs.existsSync(path)?{body:fs.readFileSync(path),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'}:{status:404,body:''});}
   const input=req.postDataJSON();calls.push(input);
   if(input.operation==='view')return route.fulfill({json:{ok:true,data:data()}});
   if(stale){notice='publication-2';stale=false;return route.fulfill({status:409,json:{ok:false,error:'A newer published timetable needs your review.'}});}
   ack=true;return route.fulfill({json:{ok:true,data:{acknowledged:{timetableNoticeId:input.timetableNoticeId,snapshotIds:[],acknowledgedAt:'2026-10-21T00:20:00Z'},publicationRevision:1}}});
  });
  const page=await context.newPage();await page.goto(origin+'/external.html?action=ack#fixture');await page.locator('[data-timetable-ack]').waitFor();
  assert.equal(calls.length,1,'open is a view only');assert.equal(await page.locator('[data-timetable-ack]').evaluate(e=>document.activeElement===e),true,'ack URL focuses the loaded action');
  const top=await page.locator('[data-timetable-ack]').boundingBox(),tt=await page.locator('#private-timetable').boundingBox();assert(top.y<tt.y);assert(top.y<500,'primary action fits first mobile screen');assert.match(await page.locator('#private-actions').textContent(),/Fixture Teacher/);
  for(const p of [1,2,4,5,6,8,11,12]){const actual=await page.locator('#private-timetable tbody tr').first().locator('td').nth(p-1).textContent();for(const value of cells[p].filter(Boolean))assert(actual.includes(value),'published private overlay P'+p+' retains '+value);}
  assert.equal(await page.locator('#private-timetable tbody tr').nth(1).locator('td').nth(1).textContent(),'','added suspended MTL remains distinct from empty baseline');
  await page.locator('[data-timetable-ack]').click();await page.waitForFunction(()=>document.querySelector('[data-timetable-ack-status]')?.textContent==='Acknowledged ✓');assert.equal(calls.length,2,'confirmed acknowledgement needs no second view');
  ack=false;notice='publication-2';await page.locator('#refresh').click();await page.locator('[data-timetable-ack]').waitFor();stale=true;
  await page.locator('[data-timetable-ack]').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('review'));assert.equal(await page.locator('[data-timetable-ack-status]').textContent(),'Pending acknowledgement');
  assert.equal(calls.filter(c=>c.operation==='acknowledge').length,2,'stale acknowledgement never auto-acknowledges the newer publication');
  console.log('PASS mobile first-row acknowledgement, focus-only URL, authoritative no-reload confirmation and stale-publication review');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
