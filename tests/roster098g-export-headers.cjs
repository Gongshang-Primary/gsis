'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM('',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['shared/roster.js','roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js'])w.eval(fs.readFileSync(file,'utf8'));
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday'],blank=()=>Array.from({length:15},()=>['','','','']),alice=blank();alice[3]=['EL','1A','Room A',''];
  const week={days,perDay:3,maxPeriod:2,blocks:[{name:'Alice',cells:alice},{name:'Bob',cells:blank()}]},model={layoutMode:'single-week',single:week,teacherCount:2,maxPeriod:2,timing:{startMinutes:432,periodMinutes:25,normalLastPeriod:2,endOfDayMinutes:507},recesses:[]},baseline={modelId:'baseline-G',model};
  const periods=Array.from({length:3},(_,period)=>({period,startMinutes:432+period*25,endMinutes:457+period*25})),S=w.GSISRosterStapler;
  let plan=S.create({date:'2026-10-20',modelId:baseline.modelId,parity:'single',endOfDayMinutes:507,periods,teachers:week.blocks.map((t,i)=>({staffId:['alice','bob'][i],name:t.name,timetableName:t.name,cells:t.cells.slice(3,6)})),formClasses:[{id:'1a',name:'1A',level:1},{id:'1b',name:'1B',level:1}],recesses:[]});
  plan=S.apply(plan,{type:'move',tileId:'baseline:alice:0',teacherId:'bob',period:1});
  const before=JSON.stringify({plan,baseline}),book=await w.RosterStaplerExport.makeWorkbook(plan,baseline,{includeClassPov:true,eventName:'G draft',now:'2026-10-20T00:00:00Z'});
  const printPage=w.RosterExport.pages(model,{type:'teacher',names:['Alice'],lastPeriod:2})[0],printed=new w.DOMParser().parseFromString(w.RosterExport.tableHtml(printPage),'text/html'),timeHeading=printed.querySelector('thead .period-time-row');
  assert.ok(timeHeading,'PDF and print repeat a separate timing row before the period row');assert.equal(timeHeading.children[1].textContent,'07:1207:37');assert.equal(timeHeading.nextElementSibling.children[1].textContent,'P0');
  assert.deepEqual(Array.from(book.sheetNames),['Teacher Summary','Class POV'],'Stapler exports two requested views, not week tabs');
  const zip=await JSZip.loadAsync(await book.blob.arrayBuffer()),parse=async p=>new w.DOMParser().parseFromString(await zip.file(p).async('string'),'application/xml'),teacher=await parse('xl/worksheets/sheet1.xml'),classes=await parse('xl/worksheets/sheet2.xml'),styles=await parse('xl/styles.xml'),workbook=await parse('xl/workbook.xml');
  const text=(doc,ref)=>doc.querySelector('c[r="'+ref+'"]')?.textContent||'';
  assert.equal(text(teacher,'E4'),'07:12\n07:37');assert.equal(text(teacher,'E5'),'0');assert.equal(text(teacher,'F10'),'EL','moved lesson remains on Bob row');
  assert.equal(text(classes,'B3'),'07:12\n07:37');assert.equal(text(classes,'B4'),'P0');assert.equal(text(classes,'A5'),'1A');assert.match(text(classes,'C5'),/Bob\nEL\nRoom A/);
  assert.equal(teacher.querySelector('pane').getAttribute('ySplit'),'5');assert.equal(teacher.querySelector('pane').getAttribute('topLeftCell'),'B6');
  assert.equal(classes.querySelector('pane').getAttribute('ySplit'),'4');assert.equal(classes.querySelector('pane').getAttribute('topLeftCell'),'B5');
  assert.deepEqual([...workbook.querySelectorAll('definedName[name="_xlnm.Print_Titles"]')].map(n=>n.textContent),["'Teacher Summary'!$1:$5","'Class POV'!$1:$4"]);
  const fonts=styles.querySelector('fonts').children.length,fills=styles.querySelector('fills').children.length,borders=styles.querySelector('borders').children.length,xfs=[...styles.querySelector('cellXfs').children];
  for(const sheet of [teacher,classes])for(const cell of sheet.querySelectorAll('c'))assert.ok(Number(cell.getAttribute('s')||0)<xfs.length,'combined workbook cell style reference is valid');
  for(const xf of xfs){assert.ok(Number(xf.getAttribute('fontId')||0)<fonts);assert.ok(Number(xf.getAttribute('fillId')||0)<fills);assert.ok(Number(xf.getAttribute('borderId')||0)<borders);}
  assert.equal(JSON.stringify({plan,baseline}),before,'export never changes draft or baseline');
  for(const type of ['teacher','class','tg']){
   let pages=w.RosterExport.pages(model,{type,lastPeriod:2});if(type==='tg')pages=[{name:'TG',title:'TG',subtitle:'',columns:['Day','P0','P1','P2'],periods,rows:[{day:'Tuesday',cells:['literal','','']}]}];
   const output=await w.RosterExport.makeWorkbook(pages),archive=await JSZip.loadAsync(await output.blob.arrayBuffer()),sheet=new w.DOMParser().parseFromString(await archive.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');
   assert.equal(text(sheet,'B3'),'07:12\n07:37',type+' uses the source timetable time');assert.equal(text(sheet,'B4'),'P0');assert.equal(sheet.querySelector('pane').getAttribute('ySplit'),'4');
  }
  const relief={date:plan.date,periods,rows:[{name:'Alice',cells:periods.map(()=>({text:'UNASSIGNED',status:'unassigned'}))}],legend:'',allocationRevision:1,exportedAt:'now'},output=await w.RosterExport.makeWorkbook([w.RosterExport.dailyRelief(relief)]),archive=await JSZip.loadAsync(await output.blob.arrayBuffer()),sheet=new w.DOMParser().parseFromString(await archive.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');
  assert.equal(text(sheet,'B3'),'07:12\n07:37');assert.equal(text(sheet,'B4'),'P0');assert.equal(text(sheet,'A5'),'Alice');
  const missing=await w.RosterExport.makeWorkbook([{name:'Missing',title:'Missing',subtitle:'',columns:['Day','P0'],periods:[{period:0}],rows:[]}]),missingZip=await JSZip.loadAsync(await missing.blob.arrayBuffer());assert.match(await missingZip.file('xl/worksheets/sheet1.xml').async('string'),/Time unavailable/);
  const list=await w.RosterExport.makeWorkbook([{name:'Reports',title:'Reports',subtitle:'',columns:['Name','Date'],rows:[{day:'Alice',cells:['2026-10-20']}]}]),listZip=await JSZip.loadAsync(await list.blob.arrayBuffer()),listSheet=new w.DOMParser().parseFromString(await listZip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');assert.equal(text(listSheet,'A3'),'Name');assert.equal(text(listSheet,'A4'),'Alice');assert.equal(listSheet.querySelector('pane').getAttribute('ySplit'),'3','non-period lists keep their layout');
  console.log('PASS G exports: two Stapler tabs, shared valid styles, source timing directly before period headers, frozen and repeated headings, every period-grid family, visible missing time and immutable inputs.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
