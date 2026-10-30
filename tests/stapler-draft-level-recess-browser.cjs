'use strict';
// Production Stapler UI/model, real Chromium and synthetic save/reload only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),prefix=process.env.STAPLER_RECESS_SCREENSHOT||path.join(require('node:os').tmpdir(),'gsis-stapler-recess-'+process.pid),capture=prefix!=='0';
const p1=page=>page.locator('[data-scroll="class"] [data-recess-group]').filter({hasText:'P1 Recess'});
const classCell=(page,id,period)=>page.locator('[data-scroll="class"] [data-target="class"][data-row="'+id+'"][data-period="'+period+'"]');
const teacherTile=(page,id)=>page.locator('[data-scroll="teacher"] [data-tile="'+id+'"]');
const pitTile=(page,id)=>page.locator('[data-pit-cards] [data-tile="'+id+'"]');
async function anchor(group){return group.evaluate(el=>{const td=el.closest('td');return {period:Number(td.dataset.period),rowspan:td.rowSpan,colspan:td.colSpan};});}
async function snapshot(page){return page.evaluate(()=>({
 tiles:[...document.querySelectorAll('[data-scroll="teacher"] [data-tile],[data-pit-cards] [data-tile]')].map(el=>({id:el.dataset.tile,row:el.closest('[data-row]')?.dataset.row||null,period:el.closest('[data-period]')?.dataset.period||null,pit:!!el.closest('[data-pit-cards]')})).sort((a,b)=>a.id.localeCompare(b.id)),
 recess:[...document.querySelectorAll('[data-scroll="class"] [data-recess-group]')].map(el=>{const td=el.closest('td');return {label:el.textContent,period:td.dataset.period,rowspan:td.rowSpan,colspan:td.colSpan};})
 }));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><p id="status"></p><main id="content"></main></body></html>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
   const date='2026-10-19',blank=()=>Array.from({length:8},()=>['','','','']),shared=blank(),maths=blank(),science=blank();
   shared[4]=['EL','1A, 1B','Combined room','Shared group'];maths[5]=['MA','1A','Room 1A',''];science[5]=['SCI','1B','Room 1B',''];science[3]=['PE','2A','Hall',''];
   const original=GSISRosterStapler.create({date,modelId:'baseline',endOfDayMinutes:570,periods:Array.from({length:8},(_,period)=>({period,startMinutes:450+15*period,endMinutes:465+15*period})),teachers:[{staffId:'shared',name:'Shared Teacher',cells:shared},{staffId:'maths',name:'Maths Teacher',cells:maths},{staffId:'science',name:'Science Teacher',cells:science}],formClasses:[{id:'c1a',name:'1A',level:1,venue:'Room 1A'},{id:'c1b',name:'1B',level:1,venue:'Room 1B'},{id:'c2a',name:'2A',level:2,venue:'Room 2A'}],recesses:[{level:1,startMinutes:480,endMinutes:510},{level:2,startMinutes:450,endMinutes:480}]});
   const f=window.__levelFixture={original,saved:null,revision:1,calls:[],readonly:false};
   f.response=()=>({date,revision:f.revision,staplerRevision:f.saved?.revision||0,plan:structuredClone(f.saved||original),canEdit:!f.readonly,canConfirm:!f.readonly,people:original.teachers.map(t=>({id:t.staffId,name:t.name,active:true})),accessRequests:[]});
   f.ctx={initialDate:date,today:()=>date,container:document.getElementById('content'),profile:{user:{email:'planner@example.test',staffId:'shared',smc:true,admin:true}},status:text=>document.getElementById('status').textContent=text,invalidateOperations(){},api:async(route,p)=>{
    f.calls.push(structuredClone(p));if(p.operation==='stapler')return f.response();
    if(p.operation==='saveStapler'){if(f.readonly)throw Error('Read only');GSISRosterStapler.validate(p.plan,{previous:f.saved||original,baseline:original.baseline});f.saved=structuredClone(p.plan);f.revision++;return f.response();}
    throw Error('Unexpected operation: '+p.operation);
   }};
   await RosterStaplerUI.render(f.ctx);
  });
  assert.equal(await p1(page).count(),1,'the aligned P1 cohort is one block');
  assert.equal(await page.locator('[data-scroll="class"] [data-recess-group]').filter({hasText:'P2 Recess'}).count(),1);
  assert.deepEqual(await anchor(p1(page)),{period:2,rowspan:2,colspan:2},'one block spans both class rows and both 15-minute periods');
  assert.match(await p1(page).innerText(),/Canteen/);assert.match(await p1(page).innerText(),/all 2 classes/i);assert.match(await p1(page).innerText(),/08:00.*08:30/s);
  const original=await snapshot(page),initialCalls=await page.evaluate(()=>__levelFixture.calls.length);

  // Dropping on the second half of the current merged cell targets its second period.
  const currentCell=classCell(page,'c1a',2),box=await currentCell.boundingBox();
  await p1(page).dragTo(currentCell,{sourcePosition:{x:10,y:10},targetPosition:{x:box.width*.75,y:20}});
  assert.deepEqual(await anchor(p1(page)),{period:3,rowspan:2,colspan:2});
  assert.equal(await teacherTile(page,'baseline:shared:4').evaluate(el=>Number(el.closest('[data-period]').dataset.period)),2);
  await page.locator('[data-undo]').click();assert.deepEqual(await snapshot(page),original);
  assert.equal(await page.locator('[data-undo]').isDisabled(),true);
  await p1(page).focus();await page.keyboard.press('ArrowRight');
  assert.deepEqual(await anchor(p1(page)),{period:3,rowspan:2,colspan:2});
  assert.equal(await p1(page).evaluate(el=>document.activeElement===el),true,'keyboard movement retains focus on the moved block');
  await page.keyboard.press('ArrowLeft');assert.deepEqual(await anchor(p1(page)),{period:2,rowspan:2,colspan:2});
  assert.equal(await p1(page).evaluate(el=>document.activeElement===el),true);assert.deepEqual(await snapshot(page),original);
  await page.locator('[data-undo]').click();await page.locator('[data-undo]').click();
  assert.deepEqual(await snapshot(page),original);assert.equal(await page.locator('[data-undo]').isDisabled(),true);

  await p1(page).dragTo(classCell(page,'c1a',4));
  assert.deepEqual(await anchor(p1(page)),{period:4,rowspan:2,colspan:2});
  assert.equal(await teacherTile(page,'baseline:shared:4').evaluate(el=>Number(el.closest('[data-period]').dataset.period)),2,'the shared lesson swaps once into the first freed slot');
  assert.equal(await teacherTile(page,'baseline:maths:5').evaluate(el=>Number(el.closest('[data-period]').dataset.period)),3);
  assert.equal(await teacherTile(page,'baseline:science:3').evaluate(el=>Number(el.closest('[data-period]').dataset.period)),3,'the other class booking remains in place');
  assert.equal(await pitTile(page,'baseline:science:5').count(),1,'the conflicting displaced lesson goes to Card Pit once');
  assert.equal(await teacherTile(page,'baseline:science:5').count(),0);
  assert.match(await page.locator('[data-stapler-message]').innerText(),/Science Teacher/);assert.match(await page.locator('[data-stapler-message]').innerText(),/Card Pit/);
  assert.equal(await page.evaluate(()=>__levelFixture.calls.length),initialCalls,'cohort movement remains local until Save');
  const moved=await snapshot(page);
  await page.locator('[data-undo]').click();assert.deepEqual(await snapshot(page),original,'one Undo restores the entire cohort, lessons and Pit');
  assert.equal(await page.locator('[data-undo]').isDisabled(),true);
  await page.locator('[data-redo]').click();assert.deepEqual(await snapshot(page),moved,'one Redo reapplies the entire cohort movement');

  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-stapler-message]').textContent.includes('Draft saved'));
  const saved=await page.evaluate(()=>__levelFixture.saved),tile=id=>saved.tiles.find(t=>t.id===id);
  assert.deepEqual(saved.tiles.filter(t=>t.kind==='recess'&&t.classIds.some(id=>['c1a','c1b'].includes(id))).map(t=>t.period),[4,4]);
  assert.equal(tile('recess:c2a').period,0);assert.equal(tile('baseline:science:5').location,'pit');assert.equal(tile('baseline:science:5').period,null);
  assert.deepEqual(tile('baseline:science:3'),await page.evaluate(()=>__levelFixture.original.tiles.find(t=>t.id==='baseline:science:3')));
  assert.equal(saved.tiles.filter(t=>t.id==='baseline:shared:4').length,1);assert.deepEqual(tile('baseline:shared:4').classIds,['c1a','c1b']);
  await page.evaluate(()=>{RosterStaplerUI.unmount();return RosterStaplerUI.render(__levelFixture.ctx);});assert.deepEqual(await snapshot(page),moved,'saved plan reopens with the same coherent cohort');

  // Filtering changes the view only; the block still moves every class named in its scope.
  await page.locator('[data-filter="class"]').fill('1A');assert.match(await p1(page).innerText(),/all 2 classes/i);
  await p1(page).dragTo(classCell(page,'c1a',2));
  await page.locator('[data-filter="class"]').fill('');assert.equal(await p1(page).count(),1);
  assert.deepEqual(await anchor(p1(page)),{period:2,rowspan:2,colspan:2},'hidden 1B moves with visible 1A');
  await page.locator('[data-undo]').click();assert.deepEqual(await snapshot(page),moved);

  // Screenshots retain normal controls and both projections; the layout scrolls within the planner.
  await page.evaluate(()=>{RosterStaplerUI.unmount();return RosterStaplerUI.render(__levelFixture.ctx);});
  await page.locator('[data-plan-warnings] summary').click();
  if(capture)await page.screenshot({path:prefix+'-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="teacher"]').click();
  await p1(page).evaluate(el=>{const sc=el.closest('[data-scroll]'),name=sc.querySelector('.planner-name'),cell=el.closest('td');sc.scrollLeft+=cell.getBoundingClientRect().left-sc.getBoundingClientRect().left-name.getBoundingClientRect().width;sc.dispatchEvent(new Event('scroll'));});
  if(capture)await page.screenshot({path:prefix+'-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile overflow remains inside the timetable');
  await page.setViewportSize({width:1440,height:1100});

  await page.evaluate(()=>{RosterStaplerUI.unmount();__levelFixture.readonly=true;return RosterStaplerUI.render(__levelFixture.ctx);});
  const readOnly=await snapshot(page),beforeReadOnly=await page.evaluate(()=>__levelFixture.calls.length);
  assert.equal(await p1(page).getAttribute('draggable'),'false');assert.equal(await page.locator('[data-save]').isDisabled(),true);
  await p1(page).click();await classCell(page,'c1a',2).click();
  assert.deepEqual(await snapshot(page),readOnly);assert.equal(await page.evaluate(()=>RosterStaplerUI.isDirty()),false);
  assert.equal(await page.evaluate(()=>__levelFixture.calls.length),beforeReadOnly,'read-only interaction cannot mutate or save');
  assert.equal(await page.evaluate(()=>__levelFixture.calls.filter(p=>p.operation==='saveStapler').length),1);
  assert.deepEqual(errors,[]);
  console.log('PASS Stapler level recess Chromium: merged cohort and multi-slot block, native short-slot drag, keyboard focus, shared lesson swap, named conflict to Pit, other booking retained, atomic Undo/Redo, save/reload, filtered full cohort, readonly guard, desktop/mobile layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
