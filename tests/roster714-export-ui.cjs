'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,downloads=[],objects=new Map(),errors=[];
 w.JSZip=JSZip;w.Blob=Blob;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.addEventListener('error',event=>errors.push(event.error));
 w.URL.createObjectURL=blob=>{const url='blob:export-'+objects.size;objects.set(url,blob);return url;};w.URL.revokeObjectURL=url=>objects.delete(url);
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({filename:this.download,blob:objects.get(this.href)});};
 const wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Export did not finish: '+w.document.body.textContent);};
 try{
  for(const file of ['shared/roster-allocation.js','shared/roster-stapler.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/converter.js','roster-update/public/roster-export.js','roster-update/public/excel-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
  const f=w.__fixture,day=f.day;f.setClock(f.ctx.today+'T06:00:00+08:00');
  f.state.absences.push({id:'absent',staffId:'alice',name:'Alice Teacher',date:f.ctx.today,typeLabel:'MC',typeId:'mc',periods:[2],reliefRequired:true,instructions:{},instructionsNA:true});
  const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
  const baseline={modelId:'baseline',model:{layoutMode:'odd-even',odd:structuredClone(week),even:structuredClone(week),maxPeriod:16,teacherCount:4,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12,endOfDayMinutes:810},recesses:[]}};
  const calls=[],ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.querySelector('#content'),status(){},localTimetable:async()=>baseline,api:async(route,p)=>{
   calls.push(structuredClone(p));const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Error(result.error);if(p.operation==='read'&&p.view==='allocation')result.data.exportContext=w.GSISRosterOperations.dailyExport(f.state,f.ctx,{date:p.date,fullTeachers:true,dailyDrive:true});return result.data;
  }};
  await w.RosterOpsUI.render('Assign Relief',ctx);
  await new Promise(r=>setTimeout(r,0));
  const initialCalls=calls.length;let networkBlocked=true;const originalApi=ctx.api;ctx.api=async(...args)=>{if(networkBlocked)throw Error('Offline');return originalApi(...args);};
  w.document.querySelector('[data-manual-select="dora"]').click();
  const full=w.document.querySelector('[data-daily-excel]'),relief=w.document.querySelector('[data-relief-excel]');
  assert.equal(full.textContent,'Export Excel');assert.equal(relief.textContent,'Export relief excel');assert.equal(full.parentElement,relief.parentElement);
  full.click();await wait(()=>downloads.length===1);assert.equal(full.disabled,false);assert.equal(full.textContent,'Export Excel');assert.equal(calls.length,initialCalls,'full export makes no network call');
  relief.click();await wait(()=>downloads.length===2);assert.equal(relief.disabled,false);assert.equal(calls.length,initialCalls,'relief export makes no network call');
  w.document.querySelector('[data-class-excel]').click();await wait(()=>downloads.length===3);assert.equal(calls.length,initialCalls,'class export makes no network call');
  const fullZip=await JSZip.loadAsync(await downloads[0].blob.arrayBuffer()),fullXml=await fullZip.file('xl/worksheets/sheet1.xml').async('string'),fullClassXml=await fullZip.file('xl/worksheets/sheet2.xml').async('string'),reliefZip=await JSZip.loadAsync(await downloads[1].blob.arrayBuffer()),reliefXml=await reliefZip.file('xl/worksheets/sheet1.xml').async('string');
  for(const name of ['Alice Teacher','Bob Colleague','Charlie Busy','Dora Free'])assert(fullXml.includes(name),name+' included with no filter');
  assert.match(fullXml,/Dora Free/);assert.match(fullXml,/Current Stapler plan/);assert.match(fullClassXml,/Local snapshot/);assert.match(fullClassXml,/not saved/);assert.doesNotMatch(reliefXml,/Bob Colleague|Charlie Busy/);assert.match(reliefXml,/Alice Teacher/);assert.match(reliefXml,/Dora Free/);assert.match(reliefXml,/not saved/);
  assert.equal(downloads[0].filename,'2026 Oct 14 Stapler - Teachers TTb saved 2026 Oct 14 0600h.xlsx');assert.equal(Object.keys(fullZip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).length,2);assert.equal(downloads[1].filename,'GSiS Relief 2026-10-14.xlsx');assert.deepEqual(errors,[]);
  const classZip=await JSZip.loadAsync(await downloads[2].blob.arrayBuffer()),classXml=await classZip.file('xl/worksheets/sheet1.xml').async('string');
  for(const xml of [fullXml,reliefXml,classXml])assert(!xml.includes('Assigned by'),'Excel exports carry relief-for only, not the assigner (owner, 30 Oct)');
  w.RosterOpsUI.unmount();networkBlocked=false;const actor=f.ctx.user.email,O=w.GSISRosterOperations;
  O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:['absent:2'],staffId:'dora'});
  O.apply(f.state,{...f.ctx,user:{...f.ctx.user,email:'publisher@test.invalid'}},{operation:'publish',date:f.ctx.today,allocationRevision:f.state.dayRevisions[f.ctx.today],notifyMode:'none'});
  f.ctx.user={staffId:'dora',email:'dora@test.invalid',smc:false,admin:false};f.profile.user=f.ctx.user;w.RosterOpsUI.resetPreloads();
  await w.RosterOpsUI.render('My Relief Duties',ctx);
  const table=w.document.querySelector('[data-duty-today] table');assert([...table.querySelectorAll('th')].some(th=>th.textContent==='Assigned By'));
  {const shown=table.querySelector('tbody tr').children[3].textContent;assert(shown&&!shown.includes('@'),'the assigner shows as a name, not an email: '+shown);}assert.deepEqual(errors,[]);
  console.log('PASS v0.8.2 all three offline exports create real XLSX from the unsaved local projection with snapshot labels and no network calls.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

