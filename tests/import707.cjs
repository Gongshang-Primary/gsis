const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip'),M=require('../shared/roster');
const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.JSZip=JSZip;
vm.runInContext(fs.readFileSync('roster-update/public/converter.js','utf8'),dom.getInternalVMContext());
const C=w.RosterConverter,days=['Monday','Tuesday','Wednesday','Thursday','Friday'],names=['José & Noor','Beta','Gamma'];
const xml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function col(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
const canonical=x=>JSON.parse(JSON.stringify(x));
function fields(teacher,even=false,variable=false){return ['Subject '+teacher+(even?' EVEN':''),'1P',teacher===0?'':'Room '+teacher,variable&&teacher===1?'':'Group '+teacher];}
function html(oddEven){const labels=oddEven?['Odd','Even']:['Week A'];return '<table><tr><td>Teacher</td>'+labels.flatMap(l=>days.map(d=>'<td colspan="3">'+l+' - '+d+'</td>')).join('')+'</tr><tr><td></td>'+Array.from({length:labels.length*15},(_,i)=>'<td>'+i%3+'</td>').join('')+'</tr>'+names.map((n,t)=>'<tr><td>'+xml(n)+'</td>'+Array.from({length:labels.length*15},(_,i)=>'<td>'+(i%15===t?[...fields(t,i>=15),'07:00 – 07:30'].map(xml).join('<br>'):'')+'</td>').join('')+'</tr>').join('')+'</table>';}
function worksheet({variable=false,even=false,combined=false,reverse=false,badFields=false,missingPeriod=false,overlap=false,formula=false}={}){
 const rows=new Map(),merges=[],total=combined?30:15;
 const set=(r,c,v)=>{if(!rows.has(r))rows.set(r,[]);rows.get(r).push('<c r="'+col(c)+r+'" t="inlineStr"><is><t>'+xml(v)+'</t></is></c>');};
 set(1,1,'Teachers Summary');set(3,1,'');
 for(let d=0;d<(combined?10:5);d++){set(3,d*3+2,(combined?(d<5?'Odd - ':'Even - '):'')+days[d%5]);merges.push(col(d*3+2)+'3:'+col(d*3+4)+'3');}
 set(4,1,'Teacher');for(let p=0;p<total;p++)if(!missingPeriod||p!==7)set(4,p+2,p%3);
 let row=5;const order=reverse?[2,1,0]:[0,1,2];
 for(const t of order){const height=variable?[1,3,5][t]:4;set(row,1,names[t]);if(height>1)merges.push('A'+row+':A'+(row+height-1+(overlap&&t===0?1:0)));
  for(let c=0;c<total;c++){let f=c%15===t?fields(t,combined?c>=15:even,variable):['','','',''];if(badFields&&t===2)f=[...f,'EXTRA'];if(height===1)set(row,c+2,f.join('\n'));else{if(height===5&&!(badFields&&t===2))f.push(c%15===t?'07:00 - 07:30':'');for(let k=0;k<height;k++)set(row+k,c+2,f[k]||'');}}
  row+=height;
 }
 let result='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+[...rows].map(([r,c])=>'<row r="'+r+'">'+c.join('')+'</row>').join('')+'</sheetData><mergeCells>'+merges.map(r=>'<mergeCell ref="'+r+'"/>').join('')+'</mergeCells></worksheet>';
 if(formula)result=result.replace('<is><t>Subject 0','<f>1+1</f><is><t>Subject 0');return result;
}
async function workbook(oddEven,options={}){const zip=new JSZip(),sheets=oddEven?[['Odd Week',worksheet(options)],['Even Week',worksheet({...options,even:true,reverse:true})]]:[['Teachers',worksheet(options)]];zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map(([n],i)=>'<sheet name="'+n+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>');sheets.forEach((s,i)=>zip.file('xl/worksheets/sheet'+(i+1)+'.xml',s[1]));return zip.generateAsync({type:'nodebuffer'});}
function check(model,oddEven,variable){assert.equal(model.layoutMode,oddEven?'odd-even':'single-week');assert.equal(model.teacherCount,3);assert.equal(model.maxPeriod,2);for(const [key,even] of oddEven?[['odd',false],['even',true]]:[['single',false]]){const week=model[key];assert.deepEqual(canonical(week.blocks.map(b=>b.name)),names);week.blocks.forEach((b,t)=>b.cells.forEach((f,c)=>assert.deepEqual(canonical(f),c===t?fields(t,even,variable):['','','',''])));}M.validate({...canonical(model),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:2}});}
(async()=>{
 for(const oddEven of [false,true]){
  check(await C.parseFile(Buffer.from(html(oddEven))),oddEven,false);
  for(const variable of [false,true]){const model=await C.parseFile(await workbook(oddEven,{variable}));check(model,oddEven,variable);assert.equal(model.sourceMode,variable?'xlsx-variable-row':'xlsx-four-row');}
 }
 const combined=await C.parseFile(await workbook(false,{combined:true,variable:true}));check(combined,true,true);
 // School-day end is a separate setting, never a truncation boundary for imports/exports.
 for(const maxPeriod of [2,13,16,20]){
  const perDay=maxPeriod+1,header='<table><tr><td>Teacher</td>'+days.map(day=>'<td colspan="'+perDay+'">'+day+'</td>').join('')+'</tr><tr><td></td>'+Array.from({length:perDay*5},(_,i)=>'<td>'+i%perDay+'</td>').join('')+'</tr>',row='<tr><td>Late Teacher</td>'+Array.from({length:perDay*5},(_,i)=>'<td>'+(i===maxPeriod?'Late duty<br>6P<br>Hall<br>Group':'')+'</td>').join('')+'</tr></table>';
  const parsed=await C.parseFile(Buffer.from(header+row));assert.equal(parsed.maxPeriod,maxPeriod);assert.deepEqual(canonical(parsed.timing),{startMinutes:420,periodMinutes:30,endOfDayMinutes:810,normalLastPeriod:maxPeriod});assert.equal(parsed.single.blocks[0].cells[maxPeriod][0],'Late duty');
  const archive=await C.makeWorkbook(parsed),again=await C.parseFile(await archive.blob.arrayBuffer());assert.equal(again.maxPeriod,maxPeriod);assert.equal(again.timing.normalLastPeriod,maxPeriod);assert.equal(again.timing.endOfDayMinutes,810);assert.equal(again.single.blocks[0].cells[maxPeriod][0],'Late duty');
 }

 // Genuine saved GSiS workbooks can be re-imported without changing the baseline.
 const model=await C.parseFile(await workbook(true)),exported=await C.makeWorkbook(model),roundtrip=await C.parseFile(await exported.blob.arrayBuffer());check(roundtrip,true,false);
 for(const [opts,pattern] of [[{variable:true,badFields:true},/ambiguous lesson rows/],[{missingPeriod:true},/period numbers/],[{overlap:true},/overlapping teacher rows/],[{formula:true},/formulas/]])await assert.rejects(C.parseFile(await workbook(false,opts)),pattern);
 async function alteredSheet(edit){const zip=await JSZip.loadAsync(await workbook(false)),path='xl/worksheets/sheet1.xml';zip.file(path,edit(await zip.file(path).async('string')));return zip.generateAsync({type:'nodebuffer'});}
 await assert.rejects(C.parseFile(await alteredSheet(s=>s.replace('<t>José &amp; Noor</t>','<t></t>'))),/missing its teacher name/);
 const merged=await C.parseFile(await alteredSheet(s=>s.replace('</mergeCells>','<mergeCell ref="B5:C5"/></mergeCells>')));assert.equal(merged.single.blocks[0].cells[1][0],'Subject 0');
 await assert.rejects(C.parseFile(await alteredSheet(s=>s.replace('</mergeCells>','<mergeCell ref="B5:B6"/></mergeCells>'))),/ambiguous merged lesson/);
 await assert.rejects(C.parseFile(Buffer.from([0xd0,0xcf,0x11,0xe0])),/older binary Excel/);
 await assert.rejects(C.parseFile(Buffer.from('not a timetable')),/No timetable table/);
 await assert.rejects(C.parseFile(Buffer.from(html(false).replace('<td>'+xml(names[0])+'</td>','<td></td>'))),/missing its teacher name/);
 await assert.rejects(C.parseFile(Buffer.from(html(false).replace(names[1],xml(names[0])))),/Duplicate/);
 await assert.rejects(C.parseFile(Buffer.from(html(false).replace('07:00 – 07:30','Extra field'))),/ambiguous lesson rows/);
 console.log('PASS v707 baseline imports: six requested format/week combinations, mixed one/three/five-row teacher blocks, combined Odd/Even, blanks/Unicode/groups, independent parity ordering, XLSX roundtrip, fail-before-save validation, dynamic last period and independent 13:30 school-day-end default without trimming later periods.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
