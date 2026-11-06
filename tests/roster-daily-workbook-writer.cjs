'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),drive=require('./helpers/roster-daily-drive.cjs');
const c={window:{},module:{exports:{}},console,Blob,TextEncoder};vm.createContext(c);
vm.runInContext(fs.readFileSync('roster-update/public/roster-export.js','utf8'),c);const renderer=c.module.exports;
vm.runInContext(fs.readFileSync('roster-update/public/excel-export.js','utf8'),c);
(async()=>{
 const date='2026-10-14',periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period}));
 const teachers=Array.from({length:150},(_,i)=>({staffId:'t'+i,name:'Teacher '+i,timetableName:'Teacher '+i}));
 const plan={date,periods,teachers,classes:[{id:'c',name:'3 Respect'}],tiles:teachers.flatMap(t=>periods.map(p=>({kind:'lesson',location:'grid',teacherId:t.staffId,period:p.period,subject:'Math',classIds:['c'],venue:'Classroom',group:'Whole class'})))};
 const page=renderer.dailyTeacherPage({date,periods,teacherSummary:{plan,absences:[],demands:[],assignments:[]},revision:1,exportedAt:date+'T01:00:00Z'},{final:false});
 const parts=renderer.workbookFiles([page]).files;
 async function write(files){const bytes=Buffer.from(await c.window.GSISExcel.packageFiles(files).arrayBuffer()),f=drive();return {f,bytes,run:()=>f.call(f.payload(bytes,{kind:'excel'}))};}
 const normal=await write(parts);assert(normal.bytes.length>900000);assert.equal(normal.run().verified,true);
 // Namespaces and relationship metadata are not displayed in a workbook cell.
 const metadata={...parts,'custom/schema.xml':'<schema xmlns="https://example.test/schema#type"/>'};
 assert.equal((await write(metadata)).run().verified,true);
 for(const text of ['https://roster.gsps.edu.sg/external.html#PRIVATE','https://school.test/view?token=PRIVATE','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature']){
  const files={...parts,'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="inlineStr"><is><t>'+text.replaceAll('&','&amp;')+'</t></is></c></row></sheetData></worksheet>'};
  const bad=await write(files);assert.throws(bad.run,/private/i);assert(!bad.f.calls.some(c=>c.url.includes('/upload/')));
 }
 const split={...parts,'xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>https://school.test/pri</t></r><r><t>vate.html&#35;PRIVATE</t></r></si></sst>'};
 assert.throws((await write(split)).run,/private/i);
 console.log('150-teacher, 17-period renderer workbook passes real writer; metadata excluded, cell/shared-string capabilities refused');
})().catch(e=>{console.error(e);process.exitCode=1;});
