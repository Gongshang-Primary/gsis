'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),baselineDir=process.argv[2],delay={read:120,lease:600};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  async function prepare(source){
   const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="content"></main></body></html>'}));await page.goto('https://roster.test/');
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const file of ['roster.css','roster-operations.css','roster-stapler.css'])await page.addStyleTag({path:path.join(root,'roster-update/public',file)});
   await page.addScriptTag({path:path.join(root,'shared/roster-stapler.js')});await page.addScriptTag({content:source});
   await page.evaluate(delay=>{
    const date='2026-10-22',periods=Array.from({length:13},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),teachers=Array.from({length:104},(_,i)=>({staffId:'t'+i,name:'Teacher '+String(i).padStart(3,'0'),cells:periods.map((_,p)=>(i+p)%2?['EL','','Room '+(i%35),'']:['','','',''])})),day={date,id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,formClasses:Array.from({length:35},(_,i)=>({id:'class'+i,name:'Class '+i,traditional:false}))};
    const f=window.loadingFixture={date,original:GSISRosterStapler.create(day),calls:[],failSave:false,measurements:[],revision:1,confirmed:null,writes:0,peer:false};
    f.view=()=>({date,plan:structuredClone(f.savedPlan||f.original),revision:f.revision,staplerRevision:f.revision,confirmed:f.confirmed,planningAllowed:true,canEdit:false,canConfirm:false,lock:{fence:1,mine:false,active:f.peer,ownerName:f.peer?'Another planner':''},people:teachers.map(t=>({id:t.staffId,name:t.name,active:true})),accessRequests:[],nameBridges:[]});
    f.ctx={initialDate:date,today:()=>date,container:document.querySelector('main'),profile:{user:{admin:true,smc:true,email:'admin@school.test'}},status(){},api:async(_,p)=>{
     f.calls.push(structuredClone(p));if(p.operation==='stapler'){await new Promise(r=>setTimeout(r,delay.read));return f.view();}
     if(p.operation==='acquireStaplerLock'){await new Promise(r=>setTimeout(r,delay.lease));return {lock:{fence:2,mine:true,active:true,expiresAt:Date.now()+180000}};}
     if(p.operation==='saveStapler'){if(f.failSave)throw Object.assign(Error('Request too large'),{status:400});f.savedPlan=structuredClone(p.plan);f.revision++;f.writes++;return f.view();}
     if(p.operation==='confirmStapler'){f.confirmed={revision:f.revision};f.writes++;return f.view();}throw Error(p.operation);
    }};
    f.measure=async()=>{RosterStaplerUI.unmount();document.querySelector('main').innerHTML='';const start=performance.now();let painted,scheduled=false;const observer=new MutationObserver(()=>{if(!scheduled&&document.querySelector('.planner-grid')){scheduled=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{painted=performance.now()-start;}));}});observer.observe(document.querySelector('main'),{childList:true,subtree:true});await RosterStaplerUI.render(f.ctx);const editable=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));observer.disconnect();const row={firstPaintMs:painted,editableMs:editable};f.measurements.push(row);return row;};
   },delay);
   return {page,errors};
  }
  const source=fs.readFileSync(path.join(root,'roster-update/public/roster-stapler-ui.js'),'utf8'),current=await prepare(source),runs=[];
  for(let i=0;i<3;i++)runs.push(await current.page.evaluate(()=>loadingFixture.measure()));
  const median=rows=>Object.fromEntries(['firstPaintMs','editableMs'].map(key=>[key,Number(rows.map(r=>r[key]).sort((a,b)=>a-b)[1].toFixed(1))]));
  const report={scope:'Local headless Chromium with synthetic API delays, not live school latency',fixture:{teachers:104,classes:35,tiles:676,readDelayMs:delay.read,legacyLeaseDelayMs:delay.lease},after:{runs,median:median(runs)}};
  if(baselineDir){const before=await prepare(fs.readFileSync(path.join(baselineDir,'roster-stapler-ui.js'),'utf8')),rows=[];for(let i=0;i<3;i++)rows.push(await before.page.evaluate(()=>loadingFixture.measure()));report.before={runs:rows,median:median(rows)};assert(report.after.median.editableMs<report.before.median.editableMs-200,'editing no longer waits for the legacy lease round trip');assert.deepEqual(before.errors,[]);await before.page.close();}
  // Opening and refreshing are reads; another active planner does not take away local editing.
  assert.deepEqual(await current.page.evaluate(()=>loadingFixture.calls.map(p=>p.operation)),['stapler','stapler','stapler']);
  await current.page.evaluate(async()=>{loadingFixture.peer=true;RosterStaplerUI.unmount();await RosterStaplerUI.render(loadingFixture.ctx);loadingFixture.failSave=true;});
  assert.equal(await current.page.locator('[data-save]').isEnabled(),true);assert.equal(await current.page.locator('[data-import]').isEnabled(),true);
  assert.match(await current.page.locator('[data-editing-lock]').innerText(),/Other planners can work at the same time/);
  const readsBeforeImport=await current.page.evaluate(()=>loadingFixture.calls.length);
  // Rejected Save must never look like an online save, even when the import itself worked.
  const payload={app:'Stapler',version:'4.3',stateType:'relief',selectedDate:'2026-10-22',selectedDay:'Thursday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,tiles:[{id:'offline',sheet:'Even Week',day:'Thursday',teacher:'Teacher 000',sourceTeacher:'Teacher 000',sourcePeriod:1,assignedPeriod:1,subject:'IMPORTED-SCI',className:'',venue:'Hall',group:'',location:'teacher'}]};
  await current.page.locator('[data-legacy-file]').setInputFiles({name:'offline-plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});await current.page.waitForFunction(()=>RosterStaplerUI.isDirty());assert.match(await current.page.locator('[data-plan-meta]').innerText(),/Unsaved changes/);
  assert.equal(await current.page.evaluate(()=>loadingFixture.calls.length),readsBeforeImport,'import stays local');
  assert.equal(await current.page.locator('[data-confirm]').isDisabled(),true);await current.page.evaluate(()=>document.querySelector('[data-confirm]').onclick());
  assert.equal(await current.page.evaluate(()=>loadingFixture.calls.length),readsBeforeImport,'Confirm cannot implicitly save even when its handler is invoked directly');
  await current.page.locator('[data-save]').click();await current.page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Request too large'));
  assert.equal(await current.page.evaluate(()=>RosterStaplerUI.isDirty()),true);assert.match(await current.page.locator('[data-plan-meta]').innerText(),/Unsaved changes/);assert.match(await current.page.locator('[data-scroll="teacher"]').innerText(),/IMPORTED-SCI/);assert.doesNotMatch(await current.page.locator('[data-stapler-message]').innerText(),/Draft saved|Changes saved/);
  await current.page.evaluate(()=>RosterStaplerUI.unmount());await current.page.addScriptTag({content:source});await current.page.evaluate(()=>RosterStaplerUI.render(loadingFixture.ctx));
  assert.equal(await current.page.evaluate(()=>RosterStaplerUI.isDirty()),true);assert.match(await current.page.locator('[data-scroll="teacher"]').innerText(),/IMPORTED-SCI/);
  assert.match(await current.page.locator('[data-plan-meta]').innerText(),/Unsaved changes/);assert.equal(await current.page.evaluate(()=>loadingFixture.writes),0,'reopening the retained draft makes no write');
  await current.page.evaluate(()=>{loadingFixture.failSave=false;});await current.page.locator('[data-save]').click();await current.page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved'));
  assert.equal(await current.page.evaluate(()=>RosterStaplerUI.isDirty()),false);assert.equal(await current.page.evaluate(()=>loadingFixture.writes),1);assert.equal(await current.page.locator('[data-confirm]').isEnabled(),true);
  assert.equal(await current.page.evaluate(()=>loadingFixture.calls.filter(p=>p.operation==='confirmStapler').length),0,'Save is distinct from Confirm');
  await current.page.locator('[data-confirm]').click();await current.page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Plan confirmed'));
  assert.equal(await current.page.evaluate(()=>loadingFixture.writes),2);assert.equal(await current.page.evaluate(()=>loadingFixture.calls.filter(p=>p.operation==='saveStapler').length),2,'only explicit Save clicks upload the plan');
  assert.equal(await current.page.evaluate(()=>loadingFixture.calls.filter(p=>p.operation==='confirmStapler').length),1);assert.equal(await current.page.evaluate(()=>loadingFixture.calls.some(p=>/StaplerLock$/.test(p.operation))),false);assert.deepEqual(current.errors,[]);
  report.checks=['editable after the initial read without an acquisition write','another planner does not block local edits','import and Confirm guard never implicitly save','rejected Save retains imported tiles and unsaved marker','rejected Save shows server error without success message','fresh UI runtime restores durable unsaved import without online writes','explicit Save succeeds before distinct Confirm'];
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});await current.page.screenshot({path:path.join(root,'verification/715-stapler-loading-desktop.png'),fullPage:false});fs.writeFileSync(path.join(root,'verification/715-stapler-loading-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log('PASS Chromium Stapler concurrent local editing, durable failed Save recovery, explicit Save then Confirm and measured loading');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
