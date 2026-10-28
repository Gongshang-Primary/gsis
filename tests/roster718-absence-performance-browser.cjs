'use strict';
// Real shipped shell/UI/domain with synthetic school data and an explicit 80 ms API delay.
// These measurements compare browser work and round trips, not production Apps Script latency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),prior=f=>execFileSync('git',['show','v0.7.17:'+f],{cwd:root,encoding:'utf8'}),delayMs=80;
// Current contracts run without historical Git objects. An explicit benchmark
// request still loads the authentic baseline and fails if it is unavailable.
const historicalComparison=process.env.GSIS_RUN_HISTORICAL_BENCHMARKS==='1',comparisonModes=historicalComparison?[true,false]:[false],currentVersion=require('../package.json').gsisRelease;
if(!historicalComparison)console.log('HISTORICAL COMPARISON NOT RUN: v0.7.17; set GSIS_RUN_HISTORICAL_BENCHMARKS=1 with the original Git objects. Current assertions remain active.');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']}),errors=[],measurements=[];
 async function setup({before=false,signed=true,landing='reportAbsence',bootstrapMode='ready'}={}){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const html=read('roster-update/public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://roster.test/'+(landing?'#'+landing:''));
  for(const f of ['roster.css','roster-operations.css'])await page.addStyleTag({content:(before?prior:read)('roster-update/public/'+f)});
  for(const f of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-export.js'])await page.addScriptTag({content:read(f)});
  await page.addScriptTag({content:(before?prior:read)('roster-update/public/roster-operations-ui.js')});
  await page.evaluate(({signed,bootstrapMode,delayMs})=>{
   const f=__fixture;f.setClock('2026-10-14T06:00:00+08:00');f.ctx.user.smc=false;f.ctx.user.admin=false;
   const original=fetch;window.__signed=signed;window.__network=[];window.__holdReads=false;window.__heldReads=[];window.__readFailure=false;window.__saveFailure=false;
   window.__bootstrapMode=bootstrapMode;window.__poll=null;window.setInterval=(fn,ms)=>(ms===60000&&(window.__poll=fn),1);
   window.google={accounts:{id:{initialize:x=>window.__signIn=x.callback,renderButton:el=>el.textContent='Sign in'}}};
   window.fetch=async(url,args={})=>{
    const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}'),item={route,p,started:performance.now()};__network.push(item);
    await new Promise(resolve=>setTimeout(resolve,delayMs));
    const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})}),fail=(status,error)=>({ok:false,status,json:async()=>({ok:false,error})});
    let response;
    if(route==='session'){if(args.method==='POST')__signed=true;response=__signed?reply({}):fail(401,'Sign in required');}
    else if(route==='profile'){
     const profile=structuredClone(f.profile);
     if(p.view==='reportForm'&&__bootstrapMode==='ready'){response=reply({user:profile.user,version:'0.9.3a',reportForm:GSISRosterOperations.reportFormView(f.state,f.ctx,p)});item.finished=performance.now();return response;}
     if(['report','reportForm'].includes(p.view)&&__bootstrapMode!=='omit'){
      if(__bootstrapMode==='error')profile.reportError={status:503,error:'Absence records could not load. Retry loading.',diagnosticId:'12345678-1234-1234-1234-123456789012'};else profile.reportData=__bootstrapMode==='invalid'?{date:p.date}:GSISRosterOperations.read(f.state,f.ctx,{operation:'read',date:p.date,view:'report',compact:true});
     }
     response=reply(profile);
    }else if(route==='operations'&&p.operation==='receiptStatus'){
     if(window.__receiptFailure){response=fail(503,'Receipt unavailable');}
     else{const saved=f.receipts.get(p.command.requestId);response=reply({accepted:!!saved,requestId:p.command.requestId,savedIds:saved?.savedIds,revision:f.state.revision,acceptedAt:f.ctx.iso});}
    }else if(route==='operations'&&p.operation==='read'&&p.view==='intake'){response=reply({entries:[],total:0,hasMore:false,pendingCaptureCount:0,peerReviewCount:0});
    }else if(route==='operations'&&p.operation==='read'&&p.view==='reportForm'){response=__bootstrapMode==='ready'?reply(GSISRosterOperations.reportFormView(f.state,f.ctx,p)):reply({date:p.date});
    }else if(route==='operations'&&p.operation==='read'){
     if(__holdReads)await new Promise(resolve=>__heldReads.push(resolve));
     if(__readFailure){__readFailure=false;response=fail(503,'Read unavailable');}else response=await original(url,args);
    }else if(route==='operations'&&p.operation==='saveAbsence'&&__saveFailure){__saveFailure=false;response=fail(503,'Save did not reach service');}
    else response=await original(url,args);
    item.finished=performance.now();return response;
   };
   window.__startedAt=performance.now();
  },{signed,bootstrapMode,delayMs});
  await page.addScriptTag({content:(before?prior:read)('roster-update/public/roster.js')});
  if(!signed){await page.waitForFunction(()=>typeof __signIn==='function');await page.evaluate(()=>{__startedAt=performance.now();__signIn({credential:'synthetic-token'});});}
  return page;
 }
 const ready=page=>page.waitForFunction(()=>document.querySelector('[data-absence-form]')&&document.getElementById('content').getAttribute('aria-busy')==='false'&&!document.querySelector('.ops-progress')&&!document.querySelector('[data-log-absence]')?.disabled);
 const idle=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false'&&!document.querySelector('.ops-progress'));
 const reviewAbsence=async page=>{await page.locator('[data-log-absence]').click();};
 const reads=page=>page.evaluate(()=>__network.filter(c=>c.route==='operations'&&c.p.operation==='read'&&!['reportForm','intake'].includes(c.p.view)).length);
 try{
  for(let run=1;run<=3;run++)for(const before of comparisonModes)for(const signed of [false,true]){
   const page=await setup({before,signed});await ready(page);
   const usableMs=await page.evaluate(()=>performance.now()-__startedAt),beforeSave=await page.evaluate(()=>__network.length);
   if(!before){await page.locator('[data-select-periods]').click();await reviewAbsence(page);}
   await page.evaluate(()=>__saveStarted=performance.now());await page.locator(before?'[data-report-instructions-na]':'[data-instructions-na]').click();if(!before)await page.locator('[data-save-instructions]').click();await idle(page);
   assert.equal(await page.evaluate(()=>__fixture.state.absences.length),1);
   const row=await page.evaluate(()=>({submitMs:performance.now()-__saveStarted,calls:__network.map(c=>c.route+(c.p.operation?':'+c.p.operation:''))}));
   measurements.push({run,version:before?'0.7.17':currentVersion,session:signed?'returning':'new sign-in',usableMs:Math.round(usableMs),submitMs:Math.round(row.submitMs),requestsBeforeSave:beforeSave,calls:row.calls});
   if(!before){assert.equal(await reads(page),1,'lightweight profile opens the form; one separate timetable read verifies dated instructions');assert.equal(row.calls.filter(c=>c==='operations:saveAbsence').length,1);}
   await page.close();
  }
  // The older backend remains usable when combined report data is absent or invalid.
  for(const bootstrapMode of ['omit','invalid']){const page=await setup({bootstrapMode});await ready(page);assert.equal(await reads(page),1);await page.close();}
  const failedBootstrap=await setup({bootstrapMode:'error'});await failedBootstrap.locator('[data-reload]').waitFor();assert.equal(await reads(failedBootstrap),0,'bootstrap error does not immediately repeat the slow request');assert.equal(await failedBootstrap.locator('#account').innerText(),'alice@gsps.edu.sg');assert.match(await failedBootstrap.locator('[data-ops-message]').innerText(),/Absence records could not load.*12345678/s);await failedBootstrap.evaluate(()=>{__fixture.setClock('2026-10-14T06:02:00+08:00');return __poll();});assert.equal(await reads(failedBootstrap),0,'failed bootstrap waits for explicit retry');await failedBootstrap.locator('[data-reload]').click();await ready(failedBootstrap);assert.equal(await reads(failedBootstrap),1);await failedBootstrap.close();
  // Home warms missing dated context automatically; intent signals still coalesce.
  for(const before of comparisonModes){
   const page=await setup({before,landing:''});await page.locator('[data-page="Report Absence"]').waitFor();await page.waitForTimeout(delayMs+25);
   const initial=await reads(page);assert.equal(initial,1,'Home automatically starts one report warm before pointer intent');
   await page.evaluate(()=>{const tile=document.querySelector('[data-page="Report Absence"]');for(const kind of ['pointerenter','focus','pointerdown'])tile.dispatchEvent(new Event(kind));tile.click();});
   await ready(page);assert.equal(await reads(page),1);await page.close();
  }
  // Rapid date changes share identical in-flight reads and keep only the latest date.
  const dateCounts=[];
  for(const before of comparisonModes){
   const page=await setup({before});await ready(page);const initial=await reads(page);
   if(before)await page.locator('.ops-report-more>summary').click();
   await page.evaluate(()=>{__holdReads=true;__dateStarted=performance.now();for(const date of ['2026-10-15','2026-10-16','2026-10-15']){const input=document.querySelector('[name=from]');input.value=date;input.dispatchEvent(new Event('change',{bubbles:true}));}});
   await page.waitForFunction(n=>__heldReads.length===n,before?3:1);await page.evaluate(()=>{__holdReads=false;__heldReads.splice(0).forEach(resolve=>resolve());});await ready(page);
   assert.equal(await page.locator('[name=from]').inputValue(),'2026-10-15');
   dateCounts.push({version:before?'0.7.17':currentVersion,requests:(await reads(page))-initial,ms:Math.round(await page.evaluate(()=>performance.now()-__dateStarted))});await page.close();
  }
  assert.deepEqual(dateCounts.map(x=>x.requests),historicalComparison?[3,1]:[1],'local preview settles rapid date changes before fetching the final date once');
  const page=await setup();await ready(page);
  // Frequent tab visibility events must not repeat the same fresh authority read.
  let profiles=await page.evaluate(()=>__network.filter(c=>c.route==='profile').length);
  await page.evaluate(async()=>{await __poll();await __poll();await __poll();});assert.equal(await page.evaluate(()=>__network.filter(c=>c.route==='profile').length),profiles);
  await page.locator('[name=typeId]').selectOption('others');await page.locator('[name=reasonDetail]').fill('Retain this course');await page.locator('[data-period="2"]').click();
  await page.evaluate(()=>{__fixture.setClock('2026-10-14T06:02:00+08:00');return __poll();});assert.equal(await page.evaluate(()=>__network.filter(c=>c.route==='profile').length),profiles,'dirty form blocks background refresh');assert.equal(await page.locator('[name=reasonDetail]').inputValue(),'Retain this course');
  // Successful save with lost acknowledgement is confirmed without a second mutation.
  await reviewAbsence(page);await page.evaluate(()=>__fixture.fail='after-save');await page.locator('[data-instructions-na]').click();await page.locator('[data-save-instructions]').click();await page.locator('[data-retry-save]').waitFor();
  const command=await page.evaluate(()=>__network.find(c=>c.p.operation==='saveAbsence').p);
  await page.evaluate(()=>__receiptFailure=true);await page.locator('[data-retry-save]').click();await idle(page);assert.equal(await page.locator('[data-retry-save]').count(),1,'failed receipt lookup preserves pending command');
  await page.evaluate(()=>{__receiptFailure=false;__readFailure=true;});await page.locator('[data-retry-save]').click();await idle(page);
  assert.match(await page.locator('[data-ops-message]').innerText(),/Saved absence confirmed.*could not refresh/);assert.equal(await page.locator('[data-retry-save]').count(),0);assert.equal(await page.evaluate(()=>__network.filter(c=>c.p.operation==='saveAbsence').length),1);assert.equal(await page.locator('[data-log-absence]').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>__network.filter(c=>c.p.operation==='receiptStatus').map(c=>c.p.command)),[command,command]);
  await page.close();
  // No receipt means resend exactly the original command, once.
  const unsaved=await setup();await ready(unsaved);await unsaved.locator('[data-period="2"]').click();await reviewAbsence(unsaved);await unsaved.evaluate(()=>__saveFailure=true);await unsaved.locator('[data-instructions-na]').click();await unsaved.locator('[data-save-instructions]').click();await unsaved.locator('[data-retry-save]').waitFor();await unsaved.locator('[data-retry-save]').click();await idle(unsaved);
  const commands=await unsaved.evaluate(()=>__network.filter(c=>c.p.operation==='saveAbsence').map(c=>c.p));assert.equal(commands.length,2);assert.deepEqual(commands[1],commands[0]);assert.equal(await unsaved.evaluate(()=>__fixture.state.absences.length),1);await unsaved.close();
  // Date rollover rechecks authority and changes an untouched report to today's date.
  const rollover=await setup();await ready(rollover);await rollover.evaluate(()=>{const f=__fixture;f.setClock('2026-10-14T16:00:01Z');f.ctx.today='2026-10-15';f.ctx.days[f.ctx.today]=structuredClone(f.day);return __poll();});await ready(rollover);assert.equal(await rollover.locator('[name=from]').inputValue(),'2026-10-15');await rollover.close();
  assert.deepEqual(errors,[]);
  const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)],summary=(historicalComparison?['0.7.17',currentVersion]:[currentVersion]).flatMap(version=>['new sign-in','returning'].map(session=>{const rows=measurements.filter(r=>r.version===version&&r.session===session);return {version,session,medianUsableMs:median(rows.map(r=>r.usableMs)),medianSubmitMs:median(rows.map(r=>r.submitMs)),requestsBeforeSave:rows[0].requestsBeforeSave};}));
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/718-absence-performance.json'),JSON.stringify({historicalComparison,syntheticApiDelayMs:delayMs,summary,dateChanges:dateCounts,measurements},null,2)+'\n');
  console.log('PASS report bootstrap, fallback, intent reads, date deduplication, dirty state, receipt retry and Singapore rollover.');console.log(JSON.stringify({summary,dateCounts}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
