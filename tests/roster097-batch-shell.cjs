'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib'),{chromium}=require('playwright'),R=require('../shared/roster.js');
const pub=path.resolve('roster-update/public'),from='2026-10-21',to='2026-11-20',target='2026-11-05',key='a'.repeat(64);
const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:[{name:'Alice',cells:Array.from({length:10},()=>['EL','4A','Baseline room',''])}]};
const model=R.validate({layoutMode:'single-week',single:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:1},recesses:[]});
const first={id:'base',name:'October baseline',from,to:'2026-10-31',priority:1},next={id:'next',name:'November baseline',from:'2026-11-01',to,priority:2};
const dates=Array.from({length:31},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
const periods=[{period:0,start:'07:00',end:'07:30',startMinutes:420,endMinutes:450},{period:1,start:'07:30',end:'08:00',startMinutes:450,endMinutes:480}];
const confirmed={date:target,baselineId:'next',source:'confirmed',sourceRevision:9,confirmedRevision:3,publicationRevision:0,readOnly:true,periods,teachers:[{staffId:'alice',name:'Alice',timetableName:'Alice',cells:[['MA','4A','Confirmed room',''],['','','','']]}],classes:['4A'],recesses:[]};
function payload(stage){return {schema:1,stage,from,to,baselineKey:key,...(stage==='baseline'?{registerRevision:4,entries:[first,next],models:[{id:'base',model},{id:'next',model}],dates:dates.map(date=>({date,baselineId:date<'2026-11-01'?'base':'next'}))}:{operationsRevision:9,plans:[{date:target,name:'November suspension',baselineId:'next',revision:3,viewMode:'confirmed',plan:{date:target,baselineId:'next'},confirmedRevision:3,timetableDay:confirmed}],datesView:{revision:9,confirmedAccess:'available',dates:[{date:target,status:'Confirmed',canViewConfirmed:true,canListConfirmed:true,mayEdit:false}]}})};}
const envelope=stage=>{const text=JSON.stringify(payload(stage));return {schema:1,stage,from,to,baselineKey:key,key:(stage==='baseline'?'b':'c').repeat(64),encoding:'gzip-base64-v1',bytes:Buffer.byteLength(text),data:gzipSync(text).toString('base64')};};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),calls=[],gates={},errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=Date;window.Date=class extends Native{constructor(...a){super(...(a.length?a:['2026-10-21T02:00:00Z']));}static now(){return Native.parse('2026-10-21T02:00:00Z');}};});
  const user={email:'alice@gsps.edu.sg',staffId:'alice',smc:false,admin:false,accessVerified:true},profile={revision:4,user,active:first,selected:first,selection:'current'};
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://fixture.test')return route.fulfill({body:'',contentType:'application/javascript'});
   if(url.pathname.startsWith('/api/')){
    const op=route.request().postDataJSON()||{},name=url.pathname.split('/').pop();calls.push({name,...op});
    const send=data=>route.fulfill({json:{ok:true,data}});
    if(name==='config')return route.fulfill({json:{clientId:'fixture'}});if(name==='session')return send({});if(name==='profile')return send(profile);if(name==='logout')return send({});
    if(name==='operations'&&op.operation==='timetableBatch'){assert(await page.locator('.function-tile').count()>0,'icons are rendered before preload starts');gates[op.stage]=()=>send(envelope(op.stage));return;}
    if(name==='operations'&&op.operation==='timetableDay')return send(op.date===target?confirmed:{date:op.date,baselineId:'base',source:'baseline',sourceRevision:9,publicationRevision:0,periods,teachers:[]});
    if(name==='read')return send({...profile,modelId:op.date<'2026-11-01'?'base':'next',model,calendar:{available:false}});
    return route.fulfill({json:{ok:false,error:'Unexpected '+name+' '+op.operation},status:400});
   }
   const file=path.join(pub,url.pathname==='/'?'index.html':url.pathname);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});
  });
  await page.goto('https://fixture.test/');await page.locator('.function-tile').first().waitFor();
  for(let i=0;i<80&&!gates.baseline;i++)await page.waitForTimeout(20);assert(gates.baseline,'Roster starts background baseline batch');assert.equal(gates.suspended,undefined);
  assert.equal(await page.locator('#content').getAttribute('inert'),null,'home remains interactive during preload');await gates.baseline();
  for(let i=0;i<80&&!gates.suspended;i++)await page.waitForTimeout(20);assert(gates.suspended,'suspended stage follows installed baselines');assert.deepEqual(calls.filter(c=>c.operation==='timetableBatch').map(c=>c.stage),['baseline','suspended']);
  await gates.suspended();await page.waitForFunction(()=>document.querySelector('[data-timetable-preload]')?.textContent.includes('ready'));
  await page.locator('[data-page="Timetable"]').click();await page.locator('#viewDate').fill(target);await page.locator('#viewDate').dispatchEvent('change');await page.locator('#nameSearch').fill('Alice');await page.locator('#nameSearch').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#timetables')?.textContent.includes('Confirmed room'));
  assert.match(await page.locator('#timetableDayStatus').innerText(),/Confirmed suspended timetable/);
  assert.match(await page.locator('[data-timetable-source="baseline"]').innerText(),/Baseline room/);
  assert.equal(calls.filter(c=>c.name==='read'&&(c.calendar===false||c.date===target)).length,0,'both baseline models were installed by one batch; current-day Calendar verification may still run');
  assert.equal(calls.filter(c=>c.operation==='timetableDay'&&c.date===target).length,0,'fresh staged day renders locally');
  assert.equal(await page.locator('#exportExcel').innerText(),'Export confirmed Excel');assert.deepEqual(errors,[]);
  console.log('PASS native browser: icons first, sequential gzip batches, interactive home, future baseline and confirmed day render locally.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
