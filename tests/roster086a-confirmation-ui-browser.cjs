'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),R=require('../shared/roster.js');
const date='2026-10-22',week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:[{name:'Alice',cells:Array.from({length:10},()=>['EL','4A','Baseline room',''])}]};
const model=R.validate({layoutMode:'single-week',single:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:1},recesses:[]});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));await page.goto('https://fixture.test/');
  for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(async date=>{
   window.review={rows:[{date,name:'EL EYE',draftRevision:2,confirmedRevision:1,confirmedSnapshotAvailable:true,status:'Confirmed',canListConfirmed:true,canViewConfirmed:true,mayEdit:true}],hold:false};
   review.ctx={container:document.querySelector('main'),today:()=>date,profile:{user:{email:'smc@school.test',staffId:'s',smc:true,admin:false}},status(){},api:async()=>{if(review.hold)await new Promise(resolve=>review.release=resolve);return {confirmedAccess:'available',dates:review.rows,sponsors:[],sponsorships:[]};}};
   await RosterStaplerUI.render(review.ctx);
  },date);
  const rows=page.locator('.planner-dates tbody tr');
  assert.match(await rows.first().innerText(),/Revision 2\s+Confirmed · revision 1/,'manager shows actual confirmation revision, not latest draft revision');
  await page.evaluate(async()=>{review.rows[0]={...review.rows[0],confirmedRevision:0,confirmedSnapshotAvailable:false,status:'Needs reconfirmation',canViewConfirmed:false,previewUnavailable:true};await RosterStaplerUI.render(review.ctx);});
  assert.match(await rows.first().innerText(),/Needs reconfirmation/);assert.doesNotMatch(await rows.first().innerText(),/Confirmed · revision 2/);
  await page.evaluate(async()=>{RosterStaplerUI.reset();review.ctx.profile.user={email:'teacher@school.test',staffId:'a',smc:false,admin:false};review.rows[0].mayEdit=false;await RosterStaplerUI.render(review.ctx);});
  const confirmed=page.locator('[data-confirmed-suspensions]');assert.match(await confirmed.innerText(),/needs reconfirmation/i);assert.match(await confirmed.innerText(),/Ask SMC/);assert.equal(await confirmed.locator('[data-open-date]').count(),0);
  await page.evaluate(()=>{RosterStaplerUI.reset();review.hold=true;review.ctx.timetablePreload={getDatesView:()=>({confirmedAccess:'available',dates:review.rows})};window.pendingRender=RosterStaplerUI.render(review.ctx);});
  assert.match(await confirmed.innerText(),/needs reconfirmation/i,'preload keeps missing-confirmation metadata');await page.evaluate(async()=>{review.hold=false;review.release();await pendingRender;});
  assert.deepEqual(errors,[]);await page.close();

  const shell=await browser.newPage(),shellErrors=[];shell.setDefaultTimeout(8000);shell.on('pageerror',error=>shellErrors.push(error.message));
  const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');await shell.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await shell.goto('https://roster.test/');
  await shell.evaluate(({date,model})=>{
   const Native=Date;window.Date=class extends Native{constructor(...args){super(...(args.length?args:[date+'T01:00:00Z']));}static now(){return Native.parse(date+'T01:00:00Z');}};
   const entry={id:'base',name:'Baseline',from:'2026-01-01',to:'2026-12-31'},profile={revision:1,user:{email:'teacher@school.test',staffId:'a',smc:false,admin:false,accessVerified:true},active:entry,selected:entry,selection:'current',entries:[entry]};
   window.review={state:'missing',calls:[]};window.RosterTimetablePreload={create:()=>({start(){},clear(){},invalidate(){},getBaseline(){return null;},getPlan(){return null;},snapshot(){return null;}})};
   window.fetch=async(url,args={})=>{const name=String(url).split('/').pop(),input=JSON.parse(args.body||'{}'),ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});review.calls.push({name,input});
    if(name==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};if(name==='session')return ok({});if(name==='profile')return ok(profile);if(name==='read')return ok({...profile,modelId:'base',model,calendar:{available:false}});
    if(input.operation==='currentDuty')return ok({date,available:true,people:[]});
    if(input.operation==='timetableDay')return ok({date,baselineId:'base',source:'baseline',sourceRevision:1,publicationRevision:0,periods:[],teachers:[],...(review.state==='missing'?{suspension:{status:'needs-reconfirmation',date,name:'<img src=x onerror=alert(1)>'}}:{})});
    throw Error('Unexpected '+name+' '+input.operation);
   };
  },{date,model});
  for(const file of ['shared/roster.js','roster-update/public/roster-export.js','roster-update/public/roster.js'])await shell.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await shell.locator('.function-tile').first().waitFor();await shell.locator('[data-page="Timetable"]').click();
  await shell.waitForFunction(()=>document.querySelector('#timetableDayStatus')?.textContent.includes('reconfirmation'));
  const notice=shell.locator('#timetableDayStatus');assert.match(await notice.innerText(),/Ask SMC/);assert.doesNotMatch(await notice.innerText(),/No confirmed or published/);assert.equal(await notice.locator('img').count(),0,'server plan names never become markup');
  assert.equal(await shell.locator('#content').evaluate(el=>el.inert),false);assert.equal(await shell.locator('#viewDate').isEnabled(),true);
  await shell.evaluate(()=>{review.state='none';});await shell.locator('#refresh').click();await shell.waitForFunction(()=>document.querySelector('#timetableDayStatus')?.textContent.includes('No confirmed or published'));
  assert.doesNotMatch(await notice.innerText(),/reconfirmation/,'new baseline result clears stale warning');assert.deepEqual(shellErrors,[]);assert.equal(await shell.evaluate(()=>review.calls.some(call=>call.name==='operations'&&!['currentDuty','timetableDay'].includes(call.input.operation))),false,'viewing never sends a mutation');
  console.log('PASS confirmation UI: actual confirmed revision, manager/teacher recovery labels, preload metadata, real Timetable source response and stale-warning clearing; no writes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
