'use strict';
// Inspect the generated OOXML for blank/additional teachers and identical week baselines.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const JSZip=require('../roster-update/public/jszip.min.js'),root=path.resolve(__dirname,'..');
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const dom=new JSDOM('',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window;
 w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  const date='2026-10-20',days=['Monday','Tuesday','Wednesday','Thursday','Friday'],blank=()=>Array.from({length:15},()=>['','','','']);
  const alice=blank();for(let day=0;day<5;day++)alice[day*3]=['Subject '+day,' 1A / 1B ','Room <A>','Group & A'];
  const week={days,perDay:3,maxPeriod:2,blocks:[{name:'Alice Timetable',cells:alice},{name:'Blank Teacher',cells:blank()}]};
  const model={layoutMode:'odd-even',odd:clone(week),even:clone(week),teacherCount:2,maxPeriod:2,timing:{startMinutes:450,periodMinutes:30,normalLastPeriod:2,endOfDayMinutes:540},recesses:[]},baseline={modelId:'exact-baseline',model};
  const S=w.GSISRosterStapler,original=S.create({date,modelId:baseline.modelId,parity:'even',endOfDayMinutes:540,periods:Array.from({length:3},(_,period)=>({period,startMinutes:450+period*30,endMinutes:480+period*30})),teachers:week.blocks.map((b,i)=>({staffId:['alice','blank'][i],name:b.name,timetableName:b.name,cells:b.cells.slice(3,6)})),formClasses:[{id:'a',name:'1A',level:1},{id:'b',name:'1B',level:1}],recesses:[]});
  let plan=S.apply(original,{type:'move',tileId:'baseline:alice:0',teacherId:'blank',period:0});
  plan=S.apply(plan,{type:'addTeacher',teacher:{staffId:'extra',name:'Extra Teacher',timetableName:'Extra Teacher'}});
  const longVenue='A very long venue with <markup> & other literal text '.repeat(6)+'\nSecond line';
  plan=S.apply(plan,{type:'addTile',tile:{teacherId:'extra',classIds:['a'],period:1,subject:'=SUM(1,2)',venue:longVenue,group:'Literal\nsecond line'}});
  plan=S.apply(plan,{type:'addTile',tile:{teacherId:'blank',classIds:[],period:2,subject:'=HYPERLINK("https://example.test","text")'}});
  plan=S.apply(plan,{type:'suspend',target:'teacher',targetId:'alice',fromPeriod:0,toPeriod:0,reason:'Training'});
  const planBefore=JSON.stringify(plan),baselineBefore=JSON.stringify(baseline),book=await w.RosterStaplerExport.makeWorkbook(plan,baseline,{eventName:'Event / <name>',now:'2026-10-19T16:01:00Z'});
  assert.equal(JSON.stringify(plan),planBefore);assert.equal(JSON.stringify(baseline),baselineBefore);
  assert.deepEqual(Array.from(book.sheetNames),['Odd Week','Even Week'],'identical source weeks remain separate');
  assert.equal(book.filename,'2026 Oct 20 Event name - Teachers TTb saved 2026 Oct 20 0001h.xlsx');
  const zip=await JSZip.loadAsync(await book.blob.arrayBuffer()),parse=async file=>new w.DOMParser().parseFromString(await zip.file(file).async('string'),'application/xml');
  const odd=await parse('xl/worksheets/sheet1.xml'),even=await parse('xl/worksheets/sheet2.xml'),styles=await parse('xl/styles.xml');
  const cell=(sheet,address)=>sheet.querySelector('c[r="'+address+'"]'),text=(sheet,address)=>cell(sheet,address)?.querySelector('is')?.textContent||'';
  const style=(sheet,address)=>styles.querySelectorAll('cellXfs > xf')[Number(cell(sheet,address).getAttribute('s'))];
  const fill=(sheet,address)=>styles.querySelectorAll('fills > fill')[Number(style(sheet,address).getAttribute('fillId'))].querySelector('fgColor')?.getAttribute('rgb');
  for(const [sheet,key] of [[odd,'odd'],[even,'even']]){
   assert.equal(sheet.querySelector('parsererror'),null);assert.equal(sheet.querySelectorAll('f').length,0,'lesson text never creates workbook formulas');
   assert.equal(text(sheet,'A10'),'Blank Teacher');assert.equal(text(sheet,'A14'),'Extra Teacher');
   for(let teacher=0;teacher<2;teacher++)for(let day=0;day<5;day++)for(let p=0;p<3;p++)for(let field=0;field<4;field++){
    if(key==='even'&&day===1)continue;
    const address=String.fromCharCode(66+day*3+p)+(6+teacher*4+field);
    assert.equal(text(sheet,address),model[key].blocks[teacher].cells[day*3+p][field],key+' unchanged '+address);
   }
   for(let day=0;day<5;day++)for(let p=0;p<3;p++)for(let field=0;field<4;field++)if(key==='odd'||day!==1)assert.equal(text(sheet,String.fromCharCode(66+day*3+p)+(14+field)),'','new teacher has no invented lessons on other days');
  }
  for(let field=0;field<4;field++){
   assert.equal(text(even,'E'+(10+field)),alice[3][field],'unchanged fields retain raw baseline spelling');
   assert.equal(fill(even,'E'+(6+field)),'FFDDEBF7','teacher suspension blue overrides vacated grey');
   assert.equal(fill(even,'E'+(10+field)),'FFDFF3DF','moved original lesson is green');
   assert.equal(fill(even,'F'+(14+field)),'FFFFDCE3','new teacher lesson is pink');
   assert.equal(style(even,'F'+(14+field)).querySelector('alignment').getAttribute('wrapText'),'1');
  }
  assert.equal(text(even,'F14'),'=SUM(1,2)');assert.equal(text(even,'G10'),'=HYPERLINK("https://example.test","text")');
  assert.equal(cell(even,'F14').getAttribute('t'),'inlineStr');assert.equal(text(even,'F16'),longVenue);assert.equal(text(even,'F17'),'Literal\nsecond line');
  assert.ok(Number(even.querySelector('row[r="16"]').getAttribute('ht'))>14.25,'long selected-day values receive extra row height');
  await assert.rejects(()=>w.RosterStaplerExport.makeWorkbook(plan,{...baseline,modelId:'wrong'}),/exact baseline/);
  // Imported IDs do not make equivalent baseline lessons pink in either export.
  const payload={app:'Stapler',version:'4.3',stateType:'plan',selectedDate:date,selectedDay:'Tuesday',selectedSheet:'Even Week',startTime:'07:30',periodMinutes:30,tiles:original.baseline.tiles.map(t=>({id:t.id,sheet:'Even Week',day:'Tuesday',teacher:original.teachers.find(v=>v.staffId===t.teacherId).name,assignedPeriod:t.period,location:'teacher',subject:t.subject,className:t.classIds.map(id=>original.classes.find(c=>c.id===id).name).join(','),venue:t.venue,group:t.group}))};
  const imported=S.importLegacy(original,payload),importedTile=imported.tiles.find(t=>t.kind==='lesson'&&t.location==='grid');assert.equal(importedTile.baselineId,null);assert.equal(S.tileState(imported,importedTile),'original');
  const importedWithExtra=S.apply(imported,{type:'addTile',tile:{teacherId:'blank',classIds:['a'],period:1,subject:'Extra lesson',venue:'Room'}}),summary={date,revision:1,allocationRevision:1,exportedAt:'2026-10-20T00:00:00Z',teacherSummary:{plan:importedWithExtra,absences:[],assignments:[],demands:[]}};
  for(const [kind,output,sheetPath,unchanged,extra] of [['teacher',await w.RosterStaplerExport.makeWorkbook(importedWithExtra,baseline),'xl/worksheets/sheet2.xml','E6','F10'],['class',await w.RosterStaplerExport.makeClassWorkbook(summary),'xl/worksheets/sheet1.xml','B5','C5']]){
   const archive=await JSZip.loadAsync(await output.blob.arrayBuffer()),read=async name=>new w.DOMParser().parseFromString(await archive.file(name).async('string'),'application/xml'),sheet=await read(sheetPath),styles=await read('xl/styles.xml'),fillId=ref=>Number(styles.querySelectorAll('cellXfs > xf')[Number(sheet.querySelector('c[r="'+ref+'"]').getAttribute('s'))].getAttribute('fillId'));
   assert.equal(fillId(unchanged),0,kind+' export leaves an equivalent imported lesson clear');assert.equal(styles.querySelectorAll('fills > fill')[fillId(extra)].querySelector('fgColor').getAttribute('rgb'),'FFFFDCE3',kind+' export keeps a genuine extra lesson pink');
  }
  console.log('PASS Stapler Excel OOXML: identical weeks, blank and appended teachers, untouched days, exact source fields, pink/green/blue fills, literal formulas, multiline wrapping, Singapore filename and immutable inputs.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
