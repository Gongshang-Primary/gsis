'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://roster.test/**',route=>route.fulfill({contentType:'text/html',body:'<main id="content"></main>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync('roster-update/public/'+file,'utf8')});
  await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8')});
  await page.evaluate(()=>{window.__calls=[];return RosterOpsUI.render('Daily Updates',{profile:{user:{email:'teacher@test',staffId:'teacher',smc:false,admin:false}},today:()=> '2026-10-21',container:document.getElementById('content'),status(){},api:async(route,p)=>{__calls.push(p);return {date:p.date,publishedAt:'2026-10-20T23:00:00Z',byAbsent:[{name:'Alice',lessons:[{period:2,timeStart:'08:00',timeEnd:'08:30',subject:'English',className:'3A',venue:'Room 3',status:'unassigned'}]}],byRelief:[{name:'Dora',lessons:[{period:3,timeStart:'08:30',timeEnd:'09:00',subject:'Mathematics',className:'4B',venue:'Room 4',absentTeacher:'Alice'}]}]};}});});
  assert.equal(await page.locator('[role="tab"]').count(),2);assert.equal(await page.getByText('Relief Load',{exact:true}).count(),0);assert.match(await page.locator('[role="tabpanel"]').innerText(),/Unassigned/);
  await page.getByRole('tab',{name:'Absent teachers'}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Relief teachers'}).getAttribute('aria-selected'),'true');assert.match(await page.locator('[role="tabpanel"]').innerText(),/Dora.*Absent teacher.*Alice/s);assert.equal(await page.evaluate(()=>__calls.length),1,'keyboard tab switching never rereads');await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Absent teachers'}).getAttribute('aria-selected'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'table scroll remains inside the viewport');assert((await page.getByRole('tab',{name:'Absent teachers'}).boundingBox()).height>=44);assert.deepEqual(errors,[]);console.log('PASS teacher Daily Updates mobile layout, horizontal table containment and keyboard-accessible local tabs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
