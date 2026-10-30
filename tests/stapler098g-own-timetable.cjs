'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js'),R=require('../shared/roster.js');
const f=fixture(),today=f.date,date='2026-10-22',teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];
const plan=S.create({...f.ctx.days[today],date});
f.state.staplerPlans.push({date,name:'Confirmed suspension',baselineId:'baseline',revision:1,draft:plan,confirmedPlan:plan,confirmedRevision:1,confirmedAt:f.ctx.iso},{date:'2026-10-23',name:'PRIVATE DRAFT',baselineId:'baseline',revision:1,draft:plan});
const list=f.O.read(f.state,teacher,{operation:'staplerDates'});
assert.deepEqual(list.dates.map(r=>r.date),['2026-10-23',date],'Teacher date list includes upcoming draft metadata');
assert.equal(list.dates.find(r=>r.date===date).mayEdit,false);assert.equal(list.dates.find(r=>r.date===date).canViewConfirmed,true);assert.equal(list.dates[0].canListUpcoming,true);assert.doesNotMatch(JSON.stringify(list),/PRIVATE DRAFT/);
const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:['Alice','Bob'].map((name,i)=>({name,cells:Array.from({length:10},()=>[i?'MA':'EL',i?'4B':'4A','Baseline room',''])}))};
const model=R.validate({layoutMode:'single-week',single:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:1},recesses:[]});
const day={date,baselineId:'baseline',source:'confirmed',sourceRevision:1,confirmedRevision:1,periods:[{period:0,startMinutes:420,endMinutes:450},{period:1,startMinutes:450,endMinutes:480}],teachers:[{staffId:'alice',name:'Alice',cells:[['EL','4A','ALICE_ROOM',''],['EL','4A','ALICE_ROOM','']]},{staffId:'bob',name:'Bob',cells:[['MA','4B','BOB_SUSPENDED_ROOM',''],['MA','4B','BOB_SUSPENDED_ROOM','']]}],classes:['4A','4B']};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  for(const bridged of [false,true]){
  const ownName=bridged?'Bobby Timetable':'Bob',scenarioModel=structuredClone(model),scenarioDay=structuredClone(day);
  scenarioModel.single.blocks[1].name=ownName;
  if(bridged){scenarioDay.teachers[1].name='Bob Contact';scenarioDay.teachers[1].timetableName=ownName;}
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://roster.test/');
  await page.evaluate(({today,date,model,day,list})=>{
   const Native=Date;window.Date=class extends Native{constructor(...args){super(...(args.length?args:[today+'T01:00:00Z']));}static now(){return Native.parse(today+'T01:00:00Z');}};
   const entry={id:'baseline',name:'Baseline',from:'2026-01-01',to:'2026-12-31'},profile={revision:1,user:{email:'bob@gsps.edu.sg',staffId:'bob',smc:false,admin:false,accessVerified:true},active:entry,selected:entry,selection:'current',entries:[entry]};
   window.review={calls:[]};
   window.fetch=async(url,args={})=>{const name=String(url).split('/').pop(),input=JSON.parse(args.body||'{}'),ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});review.calls.push({name,input});
    if(name==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};if(name==='session')return ok({});if(name==='profile')return ok(profile);if(name==='read')return ok({...profile,modelId:'baseline',model,calendar:{available:false}});
    if(input.operation==='currentDuty')return ok({date:today,available:true,people:[]});
    if(input.operation==='staplerDates')return ok(list);
    if(input.operation==='timetableDay'){if(input.date!==date)throw Error('Shortcut ignored its selected date');return ok(day);}
    throw Error('Unexpected '+name+' '+input.operation);
   };
  },{today,date,model:scenarioModel,day:scenarioDay,list});
  for(const file of ['shared/roster.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-ui.js','roster-update/public/roster.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.locator('[data-page="Stapler"]').click();await page.locator('[data-confirmed-suspensions]').waitFor();
  assert.equal(await page.locator('[data-confirmed-suspensions] tbody tr').count(),1);
  const link=page.locator('[data-own-suspended-date="'+date+'"]');
  assert.equal(await link.count(),1,'Each confirmed teacher date has a direct own timetable shortcut');
  assert.equal(await link.innerText(),'My suspended timetable');
  assert.equal(await page.locator('[data-save],[data-confirm],[data-plan-action]').count(),0,'Date browsing offers no edit controls');
  await link.click();await page.waitForFunction(()=>document.querySelector('#timetableDayStatus')?.textContent.includes('Confirmed suspended timetable'));
  assert.equal(await page.locator('#nameSearch').inputValue(),ownName,bridged?'Name Bridge selects the timetable identity, not a different Contacts display name':'Shortcut selects the signed-in teacher');
  assert.equal(await page.locator('#viewDate').inputValue(),date,'Shortcut selects the clicked confirmed date');
  assert.match(await page.locator('[data-timetable-source="confirmed"]').innerText(),/BOB_SUSPENDED_ROOM/);
  assert.doesNotMatch(await page.locator('[data-timetable-source="confirmed"]').innerText(),/ALICE_ROOM/,'Shortcut never chooses the first teacher or another staff member');
  assert.match(await page.locator('[data-timetable-source="baseline"]').innerText(),/Baseline room/,'Own recurring timetable stays visible for comparison');
  const calls=await page.evaluate(()=>review.calls.filter(c=>c.name==='operations').map(c=>c.input));
  assert(calls.some(c=>c.operation==='timetableDay'&&c.date===date));
  assert(calls.every(c=>['currentDuty','staplerDates','timetableDay'].includes(c.operation)),'Opening the shortcut sends only existing read operations');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS G teacher Stapler'+(bridged?' with Name Bridge':'')+': confirmed dates only, no edit controls, date-specific own timetable shortcut, signed-in staff selection, baseline comparison and read-only API flow.');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
