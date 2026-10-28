'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib'),{chromium}=require('playwright'),R=require('../shared/roster.js');
const pub=path.resolve(__dirname,'../roster-update/public'),from='2026-10-21',to='2026-11-20',target='2026-11-05',key='a'.repeat(64);
const dates=Array.from({length:31},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
const makeModel=room=>R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:[{name:'Alice',cells:Array.from({length:10},()=>['EL','4A',room,''])}]},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:1},recesses:[]});
const models={base:makeModel('October baseline room'),next:makeModel('November baseline room')};
const first={id:'base',name:'October baseline',from,to:'2026-10-31',priority:1},next={id:'next',name:'November baseline',from:'2026-11-01',to,priority:2};
const periods=[{period:0,start:'07:00',end:'07:30',startMinutes:420,endMinutes:450},{period:1,start:'07:30',end:'08:00',startMinutes:450,endMinutes:480}];
const day=(room='Preloaded confirmed room',revision=3)=>({date:target,baselineId:'next',source:'confirmed',sourceRevision:9,confirmedRevision:revision,publicationRevision:0,readOnly:true,periods,teachers:[{staffId:'alice',name:'Alice',timetableName:'Alice',cells:[['MA','4A',room,''],['','','','']]}],classes:['4A'],recesses:[]});
function envelope(stage,{draft=false}={}){
 const payload={schema:1,stage,from,to,baselineKey:key,...(stage==='baseline'?{registerRevision:4,entries:[first,next],models:Object.entries(models).map(([id,model])=>({id,model})),dates:dates.map(date=>({date,baselineId:date<'2026-11-01'?'base':'next'}))}:{registerRevision:4,operationsRevision:9,plans:[{date:target,name:draft?'PRIVATE DRAFT':'November suspension',baselineId:'next',revision:3,viewMode:draft?'draft':'confirmed',plan:{date:target,baselineId:'next'},confirmedRevision:3,timetableDay:day(draft?'PRIVATE DRAFT ROOM':'Preloaded confirmed room')}],datesView:{revision:9,confirmedAccess:'available',dates:[{date:target,status:'Confirmed',canViewConfirmed:true,canListConfirmed:true,mayEdit:false}]}})};
 const text=JSON.stringify(payload);return {schema:1,stage,from,to,baselineKey:key,key:(stage==='baseline'?'b':'c').repeat(64),encoding:'gzip-base64-v1',bytes:Buffer.byteLength(text),data:gzipSync(text).toString('base64')};
}
async function fixture(browser,{smc=false,holdDay=false}={}){
 const page=await browser.newPage(),calls=[],gates={baseline:[],suspended:[],day:[]},errors=[];
 const state={signedIn:true,user:{email:'alice@gsps.edu.sg',staffId:'alice',smc,admin:false,accessVerified:true},liveDay:day('Authoritative confirmed room',4)};
 const profile=()=>({revision:4,user:{...state.user},active:first,selected:first,selection:'current'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{const Native=Date;window.__clock=Native.parse('2026-10-21T02:00:00Z');window.Date=class extends Native{constructor(...args){super(...(args.length?args:[window.__clock]));}static now(){return window.__clock;}};window.google={accounts:{id:{initialize(){},renderButton(host){host.textContent='Sign in';}}}};});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='https://fixture.test')return route.fulfill({body:'',contentType:'application/javascript'});
  if(url.pathname.startsWith('/api/')){
   const op=route.request().method()==='POST'?route.request().postDataJSON()||{}:{},name=url.pathname.split('/').pop();calls.push({name,...op});
   const send=data=>route.fulfill({json:{ok:true,data}}),deny=()=>route.fulfill({status:403,json:{ok:false,error:'Access revoked'}});
   if(name==='config')return route.fulfill({json:{clientId:'fixture'}});
   if(name==='session')return state.signedIn?send({}):route.fulfill({status:401,json:{ok:false,error:'Sign in'}});
   if(name==='profile')return send(profile());
   if(name==='logout'){state.signedIn=false;return send({});}
   if(name==='operations'&&op.operation==='inboxList')return send({alertCount:0});
   if(name==='operations'&&op.operation==='timetableBatch'){gates[op.stage].push({ok:()=>send(envelope(op.stage,{draft:state.user.smc})),data:value=>send(value),deny});return;}
   if(name==='operations'&&op.operation==='timetableDay'){
    if(holdDay){gates.day.push({ok:()=>send(state.liveDay),deny});return;}
    return send(op.date===target?state.liveDay:{date:op.date,baselineId:'base',source:'baseline',sourceRevision:9,publicationRevision:0,periods,teachers:[]});
   }
   if(name==='read'){const entry=op.date<'2026-11-01'?first:next;return send({...profile(),selected:entry,active:entry,modelId:entry.id,model:models[entry.id],calendar:{available:false}});}
   return route.fulfill({json:{ok:false,error:'Unexpected '+name+' '+op.operation},status:400});
  }
  const file=path.join(pub,url.pathname==='/'?'index.html':url.pathname);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});
 });
 const gate=async(stage,index=0)=>{for(let i=0;i<100&&!gates[stage][index];i++)await page.waitForTimeout(20);assert(gates[stage][index],stage+' request '+index+' started');return gates[stage][index];};
 const ready=()=>page.waitForFunction(()=>document.querySelector('[data-timetable-preload]')?.textContent.includes('ready'));
 const openTimetable=async()=>{await page.locator('[data-page="Timetable"]').click();await page.locator('#viewDate').fill(target);await page.locator('#viewDate').dispatchEvent('change');await page.locator('#nameSearch').fill('Alice');await page.locator('#nameSearch').press('Enter');};
 const baseline=()=>page.waitForFunction(()=>document.querySelector('#timetables')?.textContent.includes('November baseline room'));
 const finish=async()=>{assert.deepEqual(errors,[],'the real page has no uncaught errors');await page.close();};
 await page.goto('https://fixture.test/');await page.locator('.function-tile').first().waitFor();await gate('baseline');
 return {page,state,calls,gates,gate,ready,openTimetable,baseline,finish};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||path.resolve(__dirname,'../../browser-runtime-v084/extracted/chromium'),args:['--no-sandbox']});
 try{
  {
   const f=await fixture(browser,{holdDay:true});await (await f.gate('baseline')).ok();await f.gate('suspended');await f.openTimetable();await f.baseline();
   assert.equal(await f.page.locator('#content').getAttribute('inert'),null);assert.equal(f.calls.filter(c=>c.name==='read').length,0,'future baseline is locally usable while suspended stage remains pending');
   console.log('PASS baseline is usable and interactive before suspended batch finishes');
   await (await f.gate('suspended')).deny();await f.page.waitForFunction(()=>document.querySelector('#content').textContent.includes('Roster access could not be verified. Refresh to verify your access.'));
   assert(!await f.page.locator('#content').innerText().then(text=>text.includes('November baseline room')),'denied background read removes displayed baseline');
   for(const pending of f.gates.day)await pending.ok();await f.page.waitForTimeout(30);
   assert(!await f.page.locator('#content').innerText().then(text=>text.includes('confirmed room')),'late foreground response cannot restore denied content');await f.finish();
   console.log('PASS background access denial removes displayed timetable and fences late foreground responses');
  }
  {
   const f=await fixture(browser);await (await f.gate('baseline')).ok();await (await f.gate('suspended')).ok();await f.ready();await f.openTimetable();
   await f.page.waitForFunction(()=>document.querySelector('#timetables')?.textContent.includes('Preloaded confirmed room'));assert.equal(f.calls.filter(c=>c.operation==='timetableDay'&&c.date===target).length,0);
   await f.page.evaluate(()=>{window.__clock+=60001;document.dispatchEvent(new Event('visibilitychange'));});
   await f.page.waitForTimeout(100);assert.equal(f.calls.filter(c=>c.operation==='timetableDay'&&c.date===target).length,0,'one-minute operational refresh does not reload timetables');assert.match(await f.page.locator('#timetableDayStatus').innerText(),/revision 3/);
   await f.page.evaluate(()=>{window.__clock=Date.parse('2026-10-21T02:20:00Z');document.dispatchEvent(new Event('visibilitychange'));});
   await (await f.gate('baseline',1)).ok();const changed=envelope('suspended'),payload=JSON.parse(require('node:zlib').gunzipSync(Buffer.from(changed.data,'base64')).toString());payload.plans[0].revision=4;payload.plans[0].confirmedRevision=4;payload.plans[0].timetableDay=f.state.liveDay;const text=JSON.stringify(payload);changed.bytes=Buffer.byteLength(text);changed.data=gzipSync(text).toString('base64');await (await f.gate('suspended',1)).data(changed);
   await f.page.waitForFunction(()=>document.querySelector('#timetables')?.textContent.includes('Authoritative confirmed room'));assert.equal(f.calls.filter(c=>c.operation==='timetableDay'&&c.date===target).length,0,'changed scheduled snapshot updates the affected day locally');await f.finish();
   console.log('PASS one-minute operational refresh preserves timetable cache; :20 catch-up installs changed day');
  }
  {
   const f=await fixture(browser);const late=await f.gate('baseline');await f.page.locator('#logout').click();await f.page.waitForFunction(()=>document.querySelector('#logout').hidden&&document.querySelector('#account').textContent==='');await late.ok();await f.page.waitForTimeout(30);
   assert.equal(f.calls.filter(c=>c.operation==='timetableBatch'&&c.stage==='suspended').length,0,'signed-out baseline response cannot trigger suspended loading');assert.equal(await f.page.locator('.function-tile').count(),0);assert.match(await f.page.locator('#content').innerText(),/Sign in to open your school timetable and relief duties/);assert(!await f.page.locator('#content').innerText().then(text=>text.includes('Alice')||text.includes('baseline room')));await f.finish();
   console.log('PASS logout cancels pending preload without reviving the previous user');
  }
  {
   const f=await fixture(browser,{smc:true});await (await f.gate('baseline')).ok();const oldSuspended=await f.gate('suspended'),oldDraft=envelope('suspended',{draft:true});
   f.state.user.smc=false;await f.page.locator('#refresh').click();await f.gate('baseline',1);await oldSuspended.data(oldDraft);await f.page.waitForTimeout(30);
   assert(!await f.page.locator('[data-timetable-preload]').innerText().then(text=>text.includes('ready')),'old privileged response cannot complete the new teacher preload');assert.equal(await f.page.locator('.function-tile[data-page="WhatsApp Inbox"]').count(),0);
   await (await f.gate('baseline',1)).ok();await (await f.gate('suspended',1)).ok();await f.ready();await f.openTimetable();await f.page.waitForFunction(()=>document.querySelector('#timetables')?.textContent.includes('Preloaded confirmed room'));
   assert(!await f.page.locator('#content').innerText().then(text=>text.includes('PRIVATE DRAFT')));assert.equal(f.calls.filter(c=>c.operation==='timetableDay'&&c.date===target).length,0,'new teacher snapshot is independently installed');await f.finish();
   console.log('PASS role downgrade rejects the pending privileged batch and installs only the teacher snapshot');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
