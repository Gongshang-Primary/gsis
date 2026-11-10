'use strict';
// Regression for Codex's P1 review of PR #109: absence reasons embedded in a VALID
// imported Stapler plan must not leak into Export Excel when reasons are hidden.
// The annotation comes from the real import (S.importLegacy with an offline relief
// absence), not from editing a tile subject by hand. Two forms are covered:
//   - a lesson period:  EL (absent — <reason>)
//   - a no-lesson period:  Absent — <reason>
// Both the download (hideAbsenceReasons:true) and the Drive file must omit the
// reason; the standalone export (reasons shown) must still show it, proving the
// scrub is conditional. Fixture shape follows tests/stapler714-import.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),S=require('../shared/roster-stapler.js'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(date='2026-10-22'){
 const periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period})),blank=()=>periods.map(()=>['','','','']);
 const teachers=['Alice','Bob','Online only'].map((name,i)=>({staffId:['a','b','c'][i],name,timetableName:name,cells:blank()}));teachers[0].cells[1]=['MA','1A','New room','New group'];teachers[1].cells[2]=['EL','1A','Room',''];teachers[2].cells[3]=['ART','1A','Room',''];
 const day={date,id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,recesses:[{level:1,period:3}],formClasses:[{id:'1a',name:'1A',level:1,traditional:true,venue:'Room'}]},plan=S.create(day);
 const payload={app:'Stapler',version:'4.3',stateType:'plan',selectedDate:date,selectedDay:'Thursday',selectedSheet:'Even Week',periodMinutes:'30',startTime:'07:00',workbookBase64:'embedded',tiles:[{id:'el',sheet:'Even Week',day:'Thursday',teacher:'Alice',sourceTeacher:'Historical author',sourcePeriod:16,assignedPeriod:1,subject:'EL',className:'1A',venue:'Room','group':'',isNew:false,location:'teacher'}],addedTeachers:[],customClasses:[],reliefAbsences:[],suspensions:[]};
 const people=teachers.map(t=>({id:t.staffId,name:t.name,active:true})).concat({id:'o',name:'Olivia',active:false});
 const workbook={even:{blocks:[{name:'Alice'},{name:'Bob'}]},odd:{blocks:[{name:'Alice'},{name:'Bob'}]}};
 return {day,plan,payload,people,options:{people,workbook}};
}
(async()=>{
 const root=process.cwd(),{plan,payload,options}=fixture();
 const relief=clone(payload);relief.stateType='relief';
 relief.reliefAbsences=[{teacher:'Alice',periods:[1,2],reason:'PRIVATE_SYNTHETIC_MEDICAL',assignments:{1:'Bob'}}];
 const imported=S.importLegacy(plan,relief,options);
 S.validate(imported);
 // The input is genuinely annotated by the import: both forms are present in the plan.
 const tiles=imported.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid');
 assert.equal(tiles.find(t=>t.teacherId==='a'&&t.period===1).subject,'EL (absent — PRIVATE_SYNTHETIC_MEDICAL)','import annotates the absent lesson');
 assert.equal(tiles.find(t=>t.teacherId==='a'&&t.period===2).subject,'Absent — PRIVATE_SYNTHETIC_MEDICAL','import annotates a no-lesson absence');
 assert.equal(tiles.find(t=>t.teacherId==='b'&&t.period===1).subject,'EL (for Alice)','cover tile is unchanged');
 const data={date:imported.date,revision:1,allocationRevision:0,exportedAt:imported.date+'T01:00:00Z',periods:imported.periods,teacherSummary:{plan:imported,addedTeachers:[],absences:[],assignments:[],demands:[],staplerStatus:'confirmed'}};
 const dom=new JSDOM('',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/excel-export.js'])w.eval(fs.readFileSync(root+'/'+file,'utf8'));
  w.fetch=()=>{throw Error('Export must not fetch source timetables');};
  const download=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{hideAbsenceReasons:true});
  const drive=w.RosterExport.dailyTeacherWorkbook(data);
  const read=async book=>{const zip=await JSZip.loadAsync(await book.blob.arrayBuffer());return {xml:await zip.file('xl/worksheets/sheet1.xml').async('string'),zip};};
  const hidden=await read(download),driveOut=await read(drive);
  assert.doesNotMatch(hidden.xml,/PRIVATE_SYNTHETIC_MEDICAL/,'download with reasons hidden must not contain the imported reason');
  assert.doesNotMatch(driveOut.xml,/PRIVATE_SYNTHETIC_MEDICAL/,'Drive file must not contain the imported reason');
  // The scrubbed forms are still shown, so the cells are not blanked.
  const doc=new JSDOM(hidden.xml,{contentType:'application/xml'}).window.document;
  const text=ref=>doc.querySelector('c[r="'+ref+'"]')?.textContent||'';
  assert.equal(text('C5'),'EL (absent)','absent lesson keeps its scrubbed label');
  assert.equal(text('D5'),'Absent','no-lesson absence keeps its scrubbed label');
  assert.equal(text('C9'),'EL (for Alice)','cover label is unchanged');
  // The standalone export (reasons shown) still carries the reason: the scrub is conditional.
  const shown=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{});
  const shownOut=await read(shown);
  assert.match(shownOut.xml,/PRIVATE_SYNTHETIC_MEDICAL/,'standalone export still shows reasons');
  console.log('PASS valid imported absence annotations stay hidden in the download and Drive file, shown in the standalone export');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
