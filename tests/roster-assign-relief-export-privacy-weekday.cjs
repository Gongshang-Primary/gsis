'use strict';
// Regression for Codex's P1 review of PR #112: the full-week Teacher Summary must
// scrub absence reasons from EVERY retained weekday when reasons are hidden, not
// just the selected day's tiles. The converter renders all five weekdays from the
// cloned baseline model, but the tile loop only rewrites the selected day's
// columns, so a reason in a non-selected weekday's baseline cell leaked into the
// download. Wednesday (2026-10-14) is selected; only Monday's baseline cell
// carries the synthetic reason. The baseline is validated with the real
// R.validate, and the plan with S.validate, so the leak is proven on valid input.
// The Class POV, the previous day-only path and the Drive file were already clean;
// the standalone export (reasons shown) must still show the reason, proving the
// scrub is conditional. Fixture and baseline shape follow
// tests/roster-assign-relief-export-day.mjs; the reproducer shape follows Codex's
// PR #112 review.
const assert=require('node:assert/strict'),fs=require('node:fs'),S=require('../shared/roster-stapler.js'),R=require('../shared/roster.js'),{JSDOM}=require('jsdom'),JSZip=require('jszip'),fixture=require('./roster701-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const root=process.cwd(),f=fixture(),day=f.ctx.days[f.date],plan=S.create({...day,date:f.date});
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>clone(t.cells)).flat()}))};
 const model={layoutMode:'odd-even',odd:clone(week),even:clone(week),maxPeriod:16,teacherCount:day.teachers.length,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]};
 // Only Monday's baseline contains the synthetic reason (blocks[0] is Alice, cells[1] is Monday period 1).
 for(const parity of ['odd','even'])model[parity].blocks[0].cells[1]=['EL (absent — PRIVATE_OTHER_DAY)','4A','Synthetic room',''];
 const baseline={modelId:plan.baselineId,model:R.validate(model)};
 S.validate(plan);
 const data={date:f.date,revision:1,allocationRevision:0,exportedAt:f.date+'T01:00:00Z',periods:plan.periods,teacherSummary:{plan,absences:[],assignments:[],demands:[],addedTeachers:[],staplerStatus:'baseline'}};
 const dom=new JSDOM('',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/excel-export.js'])w.eval(fs.readFileSync(root+'/'+file,'utf8'));
  w.fetch=()=>{throw Error('Export must not fetch source timetables');};
  assert.equal(w.RosterStaplerExport.canUseBaseline(plan,baseline),true,'the fixture baseline matches the suspended plan');
  const before=JSON.stringify({data,baseline});
  const download=await w.RosterStaplerExport.makeReliefWorkbook(data,baseline,{hideAbsenceReasons:true,includeClassPov:true});
  const previous=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{hideAbsenceReasons:true});
  const drive=w.RosterExport.dailyTeacherWorkbook(data);
  const xml=async(book,path='xl/worksheets/sheet1.xml')=>(await JSZip.loadAsync(await book.blob.arrayBuffer())).file(path).async('string');
  const teacher=await xml(download),classes=await xml(download,'xl/worksheets/sheet2.xml'),previousXml=await xml(previous),driveXml=await xml(drive);
  assert.doesNotMatch(teacher,/PRIVATE_OTHER_DAY/,'Teacher Summary must not leak a non-selected weekday reason');
  assert.doesNotMatch(classes,/PRIVATE_OTHER_DAY/,'Class POV must not leak a non-selected weekday reason');
  assert.doesNotMatch(previousXml,/PRIVATE_OTHER_DAY/,'day-only path must not leak a non-selected weekday reason');
  assert.doesNotMatch(driveXml,/PRIVATE_OTHER_DAY/,'Drive file must not leak a non-selected weekday reason');
  // The scrubbed form is still shown in the Monday cell (Alice, row 6, Monday period 1 is C6), so the cell is not blanked.
  const doc=new JSDOM(teacher,{contentType:'application/xml'}).window.document;
  const text=ref=>doc.querySelector('c[r="'+ref+'"]')?.textContent||'';
  assert.equal(text('C6'),'EL (absent)','non-selected weekday keeps its scrubbed label');
  // Rendering must not mutate the caller's data or baseline.
  assert.equal(JSON.stringify({data,baseline}),before,'export must not mutate the input data or baseline');
  // The standalone export (reasons shown) still carries the reason: the scrub is conditional.
  const shown=await w.RosterStaplerExport.makeReliefWorkbook(data,baseline,{includeClassPov:true});
  assert.match(await xml(shown),/PRIVATE_OTHER_DAY/,'standalone export still shows reasons');
  console.log('PASS non-selected weekday absence reasons stay hidden in the full-week download, Class POV, day-only path and Drive file, shown in the standalone export');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
