'use strict';
// Actual browser download from an unsaved Stapler plan, with synthetic baselines only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{JSDOM}=require('jsdom'),JSZip=require('../roster-update/public/jszip.min.js');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'gsis-stapler-export-'));
async function workbook(file){
 const zip=await JSZip.loadAsync(fs.readFileSync(file)),documents=[];
 const xml=async name=>{const dom=new JSDOM(await zip.file(name).async('string'),{contentType:'application/xml'});documents.push(dom);return dom.window.document;};
 const book=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels'),styles=await xml('xl/styles.xml');
 const targets=new Map([...rels.querySelectorAll('Relationship')].map(r=>[r.getAttribute('Id'),r.getAttribute('Target')])),sheets={};
 for(const sheet of book.querySelectorAll('sheet'))sheets[sheet.getAttribute('name')]=await xml(path.posix.normalize('xl/'+targets.get(sheet.getAttribute('r:id'))));
 const text=cell=>cell?.querySelector('is')?.textContent||cell?.querySelector('v')?.textContent||'',cell=(sheet,address)=>sheet.querySelector('c[r="'+address+'"]');
 const fill=(sheet,address)=>{const c=cell(sheet,address),xf=styles.querySelectorAll('cellXfs > xf')[Number(c?.getAttribute('s')||0)],fill=styles.querySelectorAll('fills > fill')[Number(xf?.getAttribute('fillId')||0)];return fill?.querySelector('fgColor')?.getAttribute('rgb')||null;};
 return {sheets,text,cell,fill,close:()=>documents.forEach(dom=>dom.window.close())};
}
const activeTile=(page,id)=>page.locator('[data-scroll="teacher"] [data-tile="'+id+'"]');
const ready=page=>page.waitForFunction(()=>document.getElementById('content').getAttribute('aria-busy')==='false');
async function download(page,file){const event=page.waitForEvent('download');await page.locator('[data-export-excel]').click();const result=await event;if(file)await result.saveAs(file);await ready(page);assert.equal(await result.failure(),null);return result.suggestedFilename();}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true}),errors=[],downloads=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><p id="status"></p><main id="content"></main></body></html>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['roster-update/public/jszip.min.js','shared/roster.js','roster-update/public/roster-export.js','roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-stapler-export.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
   const names=['Alice Timetable','Bob Timetable','Hidden Timetable'],blank=()=>Array.from({length:15},()=>['','','','']),week=odd=>{
    const blocks=names.map(name=>({name,cells:blank()}));
    for(let day=0;day<5;day++)blocks[0].cells[day*3]=[(odd?'Odd ':'')+(day===1?'EL':'Day '+day),'1A','Room A','Group A'];
    blocks[1].cells[14]=[odd?'Odd Music':'Music','2A','Music Room',''];blocks[2].cells[5]=[odd?'Odd SCI':'SCI','2A','Lab','Group B'];
    return {days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,maxPeriod:2,blocks};
   };
   const date='2026-10-20',model={layoutMode:'odd-even',odd:week(true),even:week(false),teacherCount:3,maxPeriod:2,timing:{startMinutes:450,periodMinutes:30,normalLastPeriod:2,endOfDayMinutes:540},recesses:[]};
   const selected={id:'baseline-even',name:'Active baseline',from:'2026-01-01',to:'2026-12-31'},baseline={modelId:selected.id,model,selected,active:selected};
   const original=GSISRosterStapler.create({date,modelId:selected.id,parity:'even',endOfDayMinutes:540,periods:Array.from({length:3},(_,period)=>({period,startMinutes:450+period*30,endMinutes:480+period*30})),teachers:model.even.blocks.map((b,i)=>({staffId:['alice','bob','hidden'][i],name:['Alice Teacher','Bob Teacher','Hidden Teacher'][i],timetableName:b.name,cells:b.cells.slice(3,6)})),formClasses:[{id:'c1a',name:'1A',level:1,venue:'Room A'},{id:'c2a',name:'2A',level:2,venue:'Lab'}],recesses:[]});
   const f=window.__exportFixture={date,baseline,original,baselineJSON:JSON.stringify(baseline),originalJSON:JSON.stringify(original),calls:[],exportedPlans:[],readonly:false,cacheMode:'match'};
   const make=RosterStaplerExport.makeWorkbook;RosterStaplerExport.makeWorkbook=async(...args)=>{if(f.failWorkbook)throw Error('Synthetic workbook creation failed.');f.exportedPlans.push(structuredClone(args[0]));return make(...args);};
   f.response=()=>({date,revision:1,staplerRevision:1,plan:structuredClone(f.readonlyPlan||original),canEdit:!f.readonly,canConfirm:!f.readonly,eventName:'Science Day',people:[],accessRequests:[]});
   f.ctx={initialDate:date,today:()=> '2026-10-19',container:document.getElementById('content'),profile:{user:{email:'planner@example.test',staffId:'alice',smc:true,admin:true}},status:text=>document.getElementById('status').textContent=text,invalidateOperations(){},cachedTimetable:()=>f.cacheMode==='match'?baseline:f.cacheMode==='wrong'?{...baseline,modelId:'different-baseline'}:null,localTimetable:async day=>{f.calls.push({route:'localTimetable',date:day});return baseline;},api:async(route,p)=>{
    f.calls.push({route,...structuredClone(p)});
    if(route==='operations'&&p.operation==='stapler')return f.response();
    if(route==='read'){if(f.holdRead)await new Promise(resolve=>f.releaseRead=resolve);if(f.failRead)throw Error('Synthetic baseline lookup failed.');return baseline;}
    throw Error('Unexpected write or read: '+route+' '+p.operation);
   }};
   await RosterStaplerUI.render(f.ctx);
  });
  assert.equal(await page.locator('[data-personal]').count(),0);assert.equal(await page.locator('[data-export-excel]').innerText(),'Export Excel');
  await activeTile(page,'baseline:alice:0').click();await page.locator('[data-scroll="teacher"] [data-row="bob"][data-period="1"]').click();
  assert.equal(await activeTile(page,'baseline:alice:0').evaluate(el=>el.closest('[data-row]').dataset.row),'bob');
  await page.locator('[data-filter="teacher"]').fill('Alice');await page.locator('[data-filter="class"]').fill('1A');
  const state=await page.evaluate(()=>({dirty:RosterStaplerUI.isDirty(),meta:document.querySelector('[data-plan-meta]').textContent,undo:document.querySelector('[data-undo]').disabled,redo:document.querySelector('[data-redo]').disabled}));assert.equal(state.dirty,true);
  const file=path.join(output,'Stapler_Teachers_TTb_Even_2026_10_20.xlsx'),filename=await download(page,file);
  assert.match(filename,/^2026 Oct 20 Science Day - Teachers TTb saved \d{4} [A-Za-z]{3} \d{2} \d{4}h\.xlsx$/);
  assert.deepEqual(await page.evaluate(()=>({dirty:RosterStaplerUI.isDirty(),meta:document.querySelector('[data-plan-meta]').textContent,undo:document.querySelector('[data-undo]').disabled,redo:document.querySelector('[data-redo]').disabled})),state,'export preserves dirty state and the Undo/Redo stack');
  assert.match(await page.locator('[data-stapler-message]').innerText(),/2026-10-20.*unsaved changes/s);
  assert.equal(await page.evaluate(()=>JSON.stringify(__exportFixture.baseline)===__exportFixture.baselineJSON),true,'cached original baseline remains immutable');
  assert.equal(await page.evaluate(()=>JSON.stringify(__exportFixture.original)===__exportFixture.originalJSON),true,'saved plan stays unchanged');
  assert.equal(await page.evaluate(()=>__exportFixture.calls.filter(c=>c.route==='read'||c.route==='localTimetable').length),0,'warm baseline export stays local');

  const book=await workbook(file),baseline=await page.evaluate(()=>__exportFixture.baseline.model);
  try{
   assert.deepEqual(Object.keys(book.sheets),['Teacher Summary','Class POV']);
   for(const [key,label] of [['even','Teacher Summary']]){
    const sheet=book.sheets[label],rows=new Map([...sheet.querySelectorAll('c')].filter(c=>/^A\d+$/.test(c.getAttribute('r'))).map(c=>[book.text(c),Number(c.getAttribute('r').slice(1))]));
    for(const block of baseline[key].blocks){assert.ok(rows.has(block.name),'all original teachers exported, including hidden rows');
     for(let day=0;day<5;day++)for(let p=0;p<3;p++)for(let field=0;field<4;field++){
      let expected=block.cells[day*3+p][field];if(key==='even'&&day===1&&block.name==='Alice Timetable'&&p===0)expected='';if(key==='even'&&day===1&&block.name==='Bob Timetable'&&p===1)expected=['EL','1A','Room A','Group A'][field];
      const address=String.fromCharCode(66+day*3+p)+(rows.get(block.name)+field);assert.equal(book.text(book.cell(sheet,address)),expected,label+' '+block.name+' '+address);
     }
    }
    if(key==='even')for(let offset=0;offset<4;offset++){assert.equal(book.fill(sheet,'E'+(rows.get('Alice Timetable')+offset)),'FFD9D9D9');assert.equal(book.fill(sheet,'F'+(rows.get('Bob Timetable')+offset)),'FFDFF3DF');}
   }
  }finally{book.close();}
  fs.writeFileSync(path.join(output,'export-metadata.json'),JSON.stringify({suggestedFilename:filename,downloadedFile:file,bytes:fs.statSync(file).size,selectedDate:'2026-10-20',parity:'even'},null,2)+'\n');

  await page.locator('[data-filter="teacher"]').fill('');await page.locator('[data-undo]').click();assert.equal(await activeTile(page,'baseline:alice:0').evaluate(el=>el.closest('[data-row]').dataset.row),'alice');
  await page.locator('[data-redo]').click();assert.equal(await activeTile(page,'baseline:alice:0').evaluate(el=>el.closest('[data-row]').dataset.row),'bob');

  // Read-only plans still export; a missing memory entry loads the same dated baseline.
  await page.evaluate(()=>{const f=__exportFixture;f.readonlyPlan=f.exportedPlans[0];f.readonly=true;f.cacheMode='missing';RosterStaplerUI.unmount();return RosterStaplerUI.render(f.ctx);});
  assert.equal(await page.locator('[data-save]').isDisabled(),true);assert.equal(await page.locator('[data-export-excel]').isEnabled(),true);await download(page);
  assert.equal(await page.evaluate(()=>__exportFixture.calls.filter(c=>c.route==='localTimetable').at(-1).date),'2026-10-20');

  await page.evaluate(()=>{__exportFixture.cacheMode='wrong';__exportFixture.failRead=true;});const selectedDayFile=path.join(output,'Stapler_Selected_Date_Without_Source.xlsx');await download(page,selectedDayFile);
  const selectedDay=await workbook(selectedDayFile);try{assert.deepEqual(Object.keys(selectedDay.sheets),['Teacher Summary','Class POV'],'missing original source exports the authoritative selected date');assert.match(selectedDay.sheets['Teacher Summary'].documentElement.textContent,/Selected date only/);assert.match(selectedDay.sheets['Class POV'].documentElement.textContent,/EL/);}finally{selectedDay.close();}
  await page.evaluate(()=>__exportFixture.failRead=false);await download(page);
  const beforeFailure=downloads.length;await page.evaluate(()=>{__exportFixture.cacheMode='match';__exportFixture.failWorkbook=true;});await page.locator('[data-export-excel]').click();await ready(page);assert.match(await page.locator('[data-stapler-message]').innerText(),/Synthetic workbook creation failed.*Export Excel to retry/s);assert.equal(downloads.length,beforeFailure);await page.evaluate(()=>__exportFixture.failWorkbook=false);await download(page);
  assert.deepEqual(await page.evaluate(()=>__exportFixture.calls.filter(c=>c.route==='read').map(c=>({id:c.id,date:c.date,calendar:c.calendar}))),Array.from({length:2},()=>({id:'baseline-even',date:'2026-10-20',calendar:false})));

  // A stale async export cannot download after the planner has unmounted.
  const beforeUnmount=downloads.length;await page.evaluate(()=>{const f=__exportFixture;f.cacheMode='wrong';f.holdRead=true;f.pendingExport=document.querySelector('[data-export-excel]').onclick();});
  await page.waitForFunction(()=>!!__exportFixture.releaseRead);
  await page.evaluate(async()=>{const f=__exportFixture;RosterStaplerUI.unmount();f.holdRead=false;f.releaseRead();await f.pendingExport;});
  assert.equal(downloads.length,beforeUnmount);
  assert.equal(await page.evaluate(()=>__exportFixture.calls.some(c=>c.route==='operations'&&c.operation!=='stapler')),false,'export never saves, confirms, publishes or notifies');
  assert.equal(await page.evaluate(()=>JSON.stringify(__exportFixture.baseline)===__exportFixture.baselineJSON),true);
  assert.deepEqual(errors,[]);
  console.log('PASS Stapler Excel Chromium download: unsaved current plan, two-tab teacher summary and class POV despite filters, selected Tuesday/even plan, grey/green fills, baseline immutable, dirty/Undo unchanged, readonly/local lookup, source-free selected-date fallback, workbook retry, unmount cancellation; '+file);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
