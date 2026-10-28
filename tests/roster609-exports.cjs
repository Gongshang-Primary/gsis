const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip'),M=require('../shared/roster');
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
function fixture(){
 const perDay=18,block=name=>({name,cells:Array.from({length:5*perDay},()=>['','','',''])});
 const blocks=['Alpha','Beta','Gamma','Delta','=SUM(1,2)'].map(block);
 blocks[0].cells[0]=['EL','1A','Room A','Whole class'];blocks[1].cells[0]=blocks[0].cells[0].slice();
 blocks[0].cells[3]=['MTL','1A','Room C','Chinese'];blocks[1].cells[3]=['MTL','1A','Room M','Malay'];
 blocks[2].cells[4]=['PE','1A; 1B,\nP6 Hope','Field','Mixed group'];
 blocks[2].cells[8]=['Science','P6 Hope','Lab','All'];
 blocks[3].cells[1]=['PAL','1A/1B','Hall','Group A/B'];
 blocks[3].cells[2]=['Music','P1-A','Studio','All'];blocks[3].cells[5]=['Art','Pri 2 Care','Studio','All'];
 blocks[4].cells[17]=['=HYPERLINK("https://example.invalid")','6Z','<Hall> & room','+Group'];
 const odd={days,blocks,perDay,maxPeriod:17},even=JSON.parse(JSON.stringify(odd));even.blocks[0].cells[0][0]='Math';
 return M.validate({layoutMode:'odd-even',sourceMode:'test',odd,even,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[{level:1,period:3},{level:2,period:4},{level:3,period:5},{level:4,period:6},{level:5,period:7},{level:6,period:8}]});
}
function parseXml(source){const doc=new JSDOM(source,{contentType:'application/xml'}).window.document;assert.equal(doc.querySelector('parsererror'),null);return doc;}
const cellTexts=doc=>Array.from(doc.querySelectorAll('sheetData row')).map(row=>Array.from(row.querySelectorAll('c')).map(c=>Array.from(c.querySelectorAll('t'),t=>t.textContent).join('')));
(async()=>{
 const ctx={JSZip,GSISRoster:M,Intl,WeakMap,Map,Set,Array,String,Number,Error};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../roster-update/public/roster-export.js'),'utf8'),ctx);const E=ctx.RosterExport,model=fixture(),before=JSON.stringify(model);
 const classNames=Array.from(E.names(model,'class'));
 assert.deepEqual(classNames,['1A','1A/1B','1B','6Z','P1-A','P6 Hope','Pri 2 Care']);
 const teacher=E.pages(model,{type:'teacher',names:['Alpha'],lastPeriod:5,timetableName:'Baseline <2027>',dateLabel:'2027-01-04'});
 assert.equal(teacher.length,2);assert.equal(teacher[0].rows.length,5);assert.equal(teacher[0].columns.length,7);assert.equal(teacher[0].periods[0].start,'07:00');assert.equal(teacher[0].periods[5].end,'10:00');
 assert.match(teacher[0].rows[0].cells[0],/^EL\n1A\nRoom A\nWhole class$/);
 assert.doesNotMatch(teacher[0].rows.flatMap(r=>r.cells).join(''),/Recess/);assert.match(teacher[1].rows[0].cells[0],/^Math/);
 const classes=E.pages(model,{type:'class',names:['1A','P6 Hope'],lastPeriod:8,timetableName:'Baseline <2027>',dateLabel:'2027-01-04'});
 assert.equal(classes.length,4);assert.equal(classes[0].rows[0].cells[0].split('\n\n').length,1,'identical cards combine their teacher names');assert.match(classes[0].rows[0].cells[0],/Alpha, Beta/);
 const collision=classes[0].rows[0].cells[3];assert.match(collision,/Recess \(P1\)/);assert.match(collision,/Chinese/);assert.match(collision,/Malay/);assert.doesNotMatch(collision,/Alpha|Beta/,'TG lesson teachers are hidden by default');assert.match(E.pages(model,{type:'class',names:['1A'],lastPeriod:8,fields:{tgTeachers:true}})[0].rows[0].cells[3],/Alpha/);
 assert.match(classes[2].rows[0].cells[8],/Recess \(P6\)\n\nScience/);assert.match(classes[2].rows[0].cells[4],/Classes: 1A; 1B,\nP6 Hope/,'combined source class label is retained');
 assert.match(E.pages(model,{type:'class',names:['P1-A'],lastPeriod:8})[0].rows[1].cells[3],/Recess \(P1\)/);
 assert.match(E.pages(model,{type:'class',names:['Pri 2 Care'],lastPeriod:8})[0].rows[1].cells[4],/Recess \(P2\)/);
 assert.equal(E.pages(model,{lastPeriod:100})[0].lastPeriod,17,'cutoff clamps without changing full model');
 assert.throws(()=>E.pages(model,{lastPeriod:-1}),/last period/);assert.throws(()=>E.pages(model,{names:['Unknown']}),/Select names/);assert.throws(()=>E.names(model,'venue'),/teacher or class/);
 const legacy=JSON.parse(JSON.stringify(model));delete legacy.recesses;assert.doesNotMatch(E.pages(legacy,{type:'class',names:['1A']})[0].rows.flatMap(r=>r.cells).join(''),/Recess/,'old imports do not silently acquire recesses');
 const pages=[...teacher,...classes,...E.pages(model,{type:'teacher',names:['=SUM(1,2)'],lastPeriod:17})];
 const exported=await E.makeWorkbook(pages),zip=await JSZip.loadAsync(await exported.blob.arrayBuffer()),book=parseXml(await zip.file('xl/workbook.xml').async('string'));
 assert.equal(book.querySelectorAll('sheet').length,pages.length);assert.equal(book.querySelectorAll('definedName').length,pages.length*2);assert.equal(exported.blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 for(let i=0;i<pages.length;i++){
  const page=pages[i],doc=parseXml(await zip.file('xl/worksheets/sheet'+(i+1)+'.xml').async('string')),data=cellTexts(doc),html=new JSDOM(E.tableHtml(page)).window.document;
  assert.deepEqual(data.slice(0,4),[[page.title],[page.subtitle],['Time',...Array.from(page.periods,p=>p.start+'\n'+p.end)],[page.columns[0],...Array.from(page.periods,p=>'P'+p.period)]]);
  assert.equal(doc.querySelector('pane').getAttribute('ySplit'),'4');assert.equal(doc.querySelector('pane').getAttribute('topLeftCell'),'B5');
  assert.equal(html.querySelector('thead .timetable-print-title th').getAttribute('colspan'),String(page.columns.length));assert.equal(html.querySelector('thead .timetable-print-title th small').textContent,page.subtitle);
  assert.equal(book.querySelectorAll('definedName[name="_xlnm.Print_Titles"]')[i].textContent.endsWith('!$1:$4'),true);
  assert.equal(doc.querySelector('f'),null,'all source values are inline text, never formulas');
  assert.equal(doc.querySelector('pageSetup').getAttribute('orientation'),'landscape');assert.equal(doc.querySelector('pageSetup').getAttribute('fitToWidth'),'1');assert.equal(doc.querySelector('pageSetup').getAttribute('fitToHeight'),'0');
  assert.equal(doc.querySelector('dimension').getAttribute('ref').split(':')[1].match(/\d+$/)[0],'9');
  page.rows.forEach((row,r)=>{
   assert.deepEqual(data[r+4],[row.day,...row.cells]);
   const tr=html.querySelectorAll('tbody tr')[r];assert.equal(tr.querySelector('th').textContent,row.day);assert.deepEqual(Array.from(tr.querySelectorAll('td'),td=>td.textContent),Array.from(row.cells),'screen/PDF and Excel use identical content, order and cutoff');
  });
 }
 assert.match((await zip.file('xl/worksheets/sheet7.xml').async('string')),/HYPERLINK/);assert.match((await zip.file('xl/worksheets/sheet7.xml').async('string')),/&lt;Hall&gt; &amp; room/);
 const unsafe=['Name: Same / [Case] long collision start A','Name? Same \\ [Case] long collision start B',"'Name * bad'",'name: same / [case] long collision start A'];
 const special=await E.makeWorkbook(unsafe.map(name=>({...teacher[0],name,title:name}))),safe=Array.from(special.sheetNames);
 assert.equal(new Set(safe.map(n=>n.toLowerCase())).size,safe.length);assert.ok(safe.every(n=>n.length<=31&&!/[\[\]:*?/\\]/.test(n)&&!/^'|'$/.test(n)));
 await assert.rejects(()=>E.makeWorkbook([]),/no timetables/);
 assert.equal(JSON.stringify(model),before,'view and export never truncate or modify the saved model');
 // Optional real files for visual review; the normal test leaves no repository artifacts.
 if(process.env.ROSTER_EXPORT_ARTIFACT_DIR){const target=process.env.ROSTER_EXPORT_ARTIFACT_DIR;fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'roster609-layout.xlsx'),Buffer.from(await exported.blob.arrayBuffer()));fs.writeFileSync(path.join(target,'roster609-pages.json'),JSON.stringify(pages,null,2));fs.writeFileSync(path.join(target,'roster609-layout.html'),'<!doctype html><meta charset="utf-8"><style>'+fs.readFileSync(path.join(__dirname,'../roster-update/public/roster.css'),'utf8')+'</style>'+pages.map(p=>'<section class="week-sheet"><h3>'+p.title.replace(/</g,'&lt;')+'</h3><p>'+p.subtitle.replace(/</g,'&lt;')+'</p>'+E.tableHtml(p)+'</section>').join(''));}
 console.log('PASS Roster 609 exports: teacher/class projection, co-teaching, parallel groups, recess collisions, exact class tokens, immutable cutoffs, PDF/Excel cell parity, safe XLSX text and sheet names.');
})().catch(e=>{console.error(e);process.exitCode=1});
