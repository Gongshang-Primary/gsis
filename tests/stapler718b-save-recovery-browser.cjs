const {toWorkerModuleURL}=require('./helpers/worker-module.cjs');
'use strict';
// Real browser shell and Stapler UI; each operation uses the disk-backed, fresh
// Apps Script VM. Transport rejection is injected at the gateway response edge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');globalThis.crypto??=webcrypto;
const {chromium}=require('playwright'),{harness}=require('./stapler715-persistence.cjs');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const supplied=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null;
(async()=>{
 const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(read('roster-update/public/_worker.js')).toString('base64')));
 async function rejectedGateway(input,browserSession){
  const origin='https://roster.test',secret='synthetic-stapler-recovery-secret-0123456789',issued=Date.now(),session=await gateway.sign({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'synthetic-browser',issued,expires:issued+60000},secret+'|gsis-browser-session-v1|'+origin);
  const cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
  const oldFetch=globalThis.fetch,oldError=console.error;let called=false;
  try{
   console.error=()=>{};globalThis.fetch=async()=>{called=true;return Response.json({ok:false,status:401,error:'Invalid signature',diagnosticId:'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',backendVersion:'0.7.018b',failureStage:'bridge-signature'});};
   const response=await gateway.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:browserSession?'':cookie},body:JSON.stringify(input)}),{BRIDGE_SECRET:secret,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-stapler-recovery/exec'});
   assert.equal(called,!browserSession,'only an authenticated browser request can reach the backend');
   return {status:response.status,result:await response.json()};
  }finally{globalThis.fetch=oldFetch;console.error=oldError;}
 }
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 let store;const errors=[],requests=[];let nextFailure='',savedCommand;
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const html=read('roster-update/public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
  let fixture;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')){
    const name=url.pathname.slice(5),input=JSON.parse(route.request().postData()||'{}');requests.push({name,input:clone(input)});
    let result={ok:true,data:{}},status=200;
    if(name==='config')result={clientId:'synthetic-client'};
    else if(name==='profile')result.data={user:{email:'admin@gsps.edu.sg',staffId:fixture.people[0].id,smc:true,admin:true,accessVerified:true},revision:1,entries:[],active:null,selected:null,upcoming:null};
    else if(name==='operations'&&input.operation==='inboxList')result.data={alertCount:0,threads:[]};
    else if(name==='operations'){
     if(nextFailure&&input.operation==='saveStapler'){
      const browserSession=nextFailure==='session';nextFailure='';({status,result}=await rejectedGateway(input,browserSession));
     }else{
      const checked=store.call(input);result=checked.result;status=result.ok?200:result.status||503;
      if(input.operation==='saveStapler'&&result.ok)savedCommand=clone(input);
     }
    }
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
   }
   return route.fulfill({contentType:'text/html',body:html});
  });
  await page.goto('https://roster.test/');
  for(const name of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/jszip.min.js','roster-update/public/converter.js'])await page.addScriptTag({content:read(name)});
  fixture=await page.evaluate(async input=>{
   const date=input?.selectedDate||'2026-10-21',periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period,start:String(Math.floor((420+30*period)/60)).padStart(2,'0')+':'+String((420+30*period)%60).padStart(2,'0'),end:String(Math.floor((450+30*period)/60)).padStart(2,'0')+':'+String((450+30*period)%60).padStart(2,'0')}));
   const workbook=input?.workbookBase64?await RosterConverter.parseFile(Uint8Array.from(atob(input.workbookBase64),c=>c.charCodeAt(0))):null;
   const week=workbook&&(workbook.single||workbook[input.selectedSheet.split(' ')[0].toLowerCase()]);
   const names=week?week.blocks.map(row=>row.name):['Alice','Bob','Online only'];
   const teachers=names.map((name,i)=>({staffId:'staff-'+i,name,timetableName:name,cells:periods.map(()=>['','','',''])}));
   teachers.at(-1).cells[16]=['PD','','Staff room',''];
   const people=teachers.map(row=>({id:row.staffId,name:row.name,active:true}));
   for(const name of input?.addedTeachers||[])if(!people.some(p=>p.name===name))people.push({id:'external-'+people.length,name,active:false});
   const day={date,id:'synthetic-online-baseline',parity:'even',schoolDay:true,verified:true,periods,teachers,formClasses:[],recesses:[]};
   const payload=input||{app:'Stapler',version:'4.3',stateType:'relief',selectedDate:date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:['Alice','Bob'],tiles:[{id:'a',teacher:'Alice',subject:'SCI',className:'Exam',venue:'Hall',group:'',assignedPeriod:1,sheet:'Even Week',day:'Wednesday',location:'teacher'},{id:'b',teacher:'Bob',subject:'MA',className:'Other exam',venue:'Room',group:'',assignedPeriod:2,sheet:'Even Week',day:'Wednesday',location:'teacher'}],reliefAbsences:[]};
   const expected=GSISRosterStapler.importLegacy(GSISRosterStapler.create(day),payload,{people,...(workbook?{workbook}:{})});
   const NativeDate=Date,now=NativeDate.parse(date+'T06:00:00+08:00');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
   window.confirm=()=>true;
   return {day,people,payload,expected};
  },supplied);
  store=harness(fixture.day,fixture.people);
  for(const name of ['roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js','roster-update/public/roster.js'])await page.addScriptTag({content:read(name)});
  await page.locator('[data-page="Stapler"]').click();await page.locator('[data-date-entry] button.primary').click();
  await page.waitForFunction(()=>document.querySelector('[data-save]')&&!document.querySelector('[data-save]').disabled);
  await page.locator('[data-legacy-file]').setInputFiles({name:'offline-relief.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.payload))});
  await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Offline JSON imported'));
  nextFailure='bridge';await page.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-plan-meta]')?.textContent.includes('Save outcome unconfirmed'));
  assert.equal(await page.locator('#account').innerText(),'admin@gsps.edu.sg','upstream authentication failure must not sign the browser out');
  assert.equal(await page.locator('#retryLoad').count(),0,'Save rejection must not replace the editor with the generic login error');
  assert.equal(await page.evaluate(()=>RosterStaplerUI.isDirty()),true);assert.equal(store.writes(),0);
  assert.match(await page.locator('[data-stapler-message]').innerText(),/aaaaaaaa-1111/);
  assert.equal(await page.locator('[data-confirm]').isDisabled(),true,'uncertain Save blocks a second command');
  const firstSave=clone(requests.find(r=>r.input.operation==='saveStapler').input);
  assert(firstSave.planPatch,'Save carries the imported changes');assert.equal(firstSave.plan,undefined);assert.equal(firstSave.basePlan,undefined);
  const submittedPlan=await page.evaluate(({day,patch})=>GSISRosterOperations.applyStaplerPlanPatch(GSISRosterStapler.create(day),patch),{day:fixture.day,patch:firstSave.planPatch});
  const importedExpected=clone(fixture.expected);importedExpected.revision=firstSave.planPatch.revision+1;
  assert.deepEqual(submittedPlan,importedExpected,'applying the surgical import to its original baseline preserves all cells and blank replacements');
  store.loseResponse();await page.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-save]')?.textContent.startsWith('Retry pending')&&document.querySelector('#content').getAttribute('aria-busy')==='false');
  assert.equal(store.writes(),1,'the retry committed even though its response was lost');
  assert.equal(await page.evaluate(()=>RosterStaplerUI.isDirty()),true);assert.equal(await page.locator('[data-confirm]').isDisabled(),true);
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-plan-meta]')?.textContent.startsWith('Draft saved'));
  const retries=requests.filter(r=>r.input.operation==='saveStapler');assert.equal(retries.length,3);for(const retry of retries.slice(1))assert.deepEqual(retry.input,retries[0].input,'retry must resend the same command and request ID');assert.equal(store.writes(),1,'durable receipt prevents a second write after lost response');
  await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('[data-plan-meta]')?.textContent.startsWith('Confirmed'));
  assert.equal(store.writes(),2);assert.equal(store.state().staplerPlans[0].confirmed,true);
  const reopen=async()=>{await page.locator('[data-back-dates]').click();await page.locator('[data-open-date="'+fixture.day.date+'"]').click();await page.locator('[data-save]').waitFor();};
  await reopen();
  const retained=store.call({operation:'stapler',date:fixture.day.date,leaseSessionId:savedCommand.leaseSessionId}).result;
  assert.equal(retained.ok,true,JSON.stringify(retained));const expected=clone(submittedPlan);expected.status='confirmed';assert.deepEqual(retained.data.plan,expected,'fresh backend runtime restores the complete confirmed import and submitted plan revision');
  await page.waitForFunction(()=>document.querySelector('[data-save]')&&!document.querySelector('[data-save]').disabled);
  const tile=fixture.expected.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'),editSelector='[data-edit-tile="'+tile.id+'"]';
  await page.locator(editSelector).first().click();await page.locator('dialog [name=venue]').fill('Edited after reopen 中文');await page.locator('dialog button.primary').click();
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]')?.textContent.includes('Changes saved'));
  await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]')?.textContent.includes('Plan confirmed'));
  await reopen();const edited=store.call({operation:'stapler',date:fixture.day.date,leaseSessionId:savedCommand.leaseSessionId}).result;
  assert.equal(edited.ok,true,JSON.stringify(edited));assert.equal(edited.data.plan.tiles.find(t=>t.id===tile.id).venue,'Edited after reopen 中文');assert.equal(edited.data.confirmed.revision,2);
  const counts={decompressions:0,quota:0,models:0};
  const dates=store.call({operation:'staplerDates'},{actualContext:true,inspect:scope=>{
   scope.Utilities.formatDate=(date,zone,format)=>{const iso=new Date(date.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?iso.slice(0,10):format==='HH'?iso.slice(11,13):iso.slice(14,16);};
   scope.rosterIndex_=()=>({entries:[{id:fixture.day.id,from:'2026-01-01',to:'2026-12-31',priority:1}]});
   scope.Utilities.ungzip=()=>{counts.decompressions++;throw Error('Date list must not load full plans');};scope.rosterOperationsQuota_=()=>{counts.quota++;throw Error('Date list must not calculate quota');};scope.rosterModel_=()=>{counts.models++;throw Error('Date list must not load baseline cells');};
  }}).result;
  assert.equal(dates.ok,true,JSON.stringify(dates));assert.deepEqual(counts,{decompressions:0,quota:0,models:0});assert.equal(dates.data.dates[0].draftRevision,2);
  // A genuine session rejection blocks protected actions while preserving the
  // working plan and its same-ID recovery receipt for explicit sign-in/recovery.
  await page.waitForFunction(()=>document.querySelector('[data-save]')&&!document.querySelector('[data-save]').disabled);
  await page.locator(editSelector).first().click();await page.locator('dialog [name=venue]').fill('Unsaved session-expiry check');await page.locator('dialog button.primary').click();
  const beforeExpiryWrites=store.writes();await page.evaluate(()=>window.__expiryWorkspace=document.querySelector('[data-stapler-app]'));
  nextFailure='session';await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-save]')?.disabled&&document.querySelector('#content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__expiryWorkspace===document.querySelector('[data-stapler-app]')),true,'session rejection retains the recovery workspace');
  assert.equal(await page.locator('#account').innerText(),'admin@gsps.edu.sg','recovery stays associated with its original owner');assert.equal(await page.locator('#retryLoad').count(),0);
  assert.match(await page.locator('[data-stapler-message]').innerText(),/sign in|access/i);assert.equal(await page.evaluate(()=>RosterStaplerUI.isDirty()),true);
  for(const selector of ['[data-save]','[data-confirm]','[data-undo]','[data-redo]','[data-import]'])assert.equal(await page.locator(selector).isDisabled(),true,'expired session blocks '+selector);
  assert.equal(await page.locator('#systemHealthLink').isVisible(),false);assert.equal(await page.locator('[data-export-recovery]').isEnabled(),true);
  const writesAfterRejection=requests.filter(r=>r.input.operation==='saveStapler').length;
  await page.locator('[data-save]').evaluate(el=>el.click());await page.locator('[data-confirm]').evaluate(el=>el.click());
  assert.equal(requests.filter(r=>r.input.operation==='saveStapler').length,writesAfterRejection);assert.equal(store.writes(),beforeExpiryWrites,'session rejection and blocked actions cannot commit');
  const downloading=page.waitForEvent('download');await page.locator('[data-export-recovery]').click();const download=await downloading,recovery=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(recovery.plan.tiles.find(t=>t.id===tile.id).venue,'Unsaved session-expiry check','recovery contains the complete unsaved edit');
  assert.deepEqual(recovery.pending.input,requests.filter(r=>r.input.operation==='saveStapler').at(-1).input,'recovery retains the exact rejected save and request identity');assert.deepEqual(errors,[]);
  console.log('PASS actual Roster shell, Worker and Stapler: upstream authentication failure preserves imported draft, lost-response receipt replay, exact Save retry, Confirm, fresh reload, reopen/edit/Save/Confirm, metadata-only dates, genuine session401 action blocking and complete recovery export. '+(supplied?'Supplied Offline JSON checked.':'Synthetic fixture checked.'));
 }finally{store?.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
