import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {RosterExport as edge,GSISExcel} from '../roster-update/public/edge-roster-output-renderers.js';
const require=createRequire(import.meta.url),JSZip=require('jszip'),{JSDOM}=require('jsdom'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 const dom=new JSDOM('',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js'])w.eval(fs.readFileSync(file,'utf8'));
  w.fetch=()=>{throw Error('Export must not fetch source timetables');};
  const f=fixture();f.ctx.minute=300;f.people.push({id:'empty',name:'Empty Active Teacher',active:true},{id:'adhoc',name:'Activated Relief',active:false});f.state.adhoc.push({id:'extra',date:f.date,staffId:'adhoc',periods:[2,3]});
  const plan=S.create({...f.ctx.days[f.date],date:f.date});f.O.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:0,plan});f.O.staplerApply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});const edited=structuredClone(plan);edited.tiles.find(t=>t.kind==='lesson').subject='UNCONFIRMED';f.O.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:1,plan:edited});
  const data=f.O.dailyExport(f.state,f.O.composeStaplerContext(f.state,f.ctx),{date:f.date,fullTeachers:true,dailyDrive:true});data.exportedAt=f.date+'T01:05:00Z';assert.equal(data.timetableSource.revision,1);
  // Scope: baseline-named teachers plus ad hoc relief teachers only. An active teacher with no baseline lesson and no relief role stays out of both files.
  assert(!data.teacherSummary.addedTeachers.some(t=>t.staffId==='empty'),'active teacher without a baseline lesson is not added');
  assert(data.teacherSummary.addedTeachers.some(t=>t.staffId==='adhoc'),'activated ad hoc relief teacher is added');
  assert.deepEqual(data.teacherSummary.plan.teachers.map(t=>t.staffId),['alice','bob','charlie','dora']);
  data.teacherSummary.absences=[{staffId:'alice',periods:[2],reason:'PRIVATE MEDICAL'}];data.teacherSummary.demands=[{id:'d',staffId:'alice',period:2,name:'Alice'}];data.teacherSummary.assignments=[{id:'a',demandId:'d',staffId:'bob',period:2,subject:'MA',className:'3A',absentName:'Alice',relieverName:'Bob',status:'draft'},{id:'b',demandId:'d2',staffId:'bob',period:2,subject:'EL',className:'3B',absentName:'Alice',relieverName:'Bob',status:'published',combination:true},{id:'c',demandId:'d3',staffId:'dora',period:3,subject:'Recess supervision',className:'3A',relieverName:'Dora',status:'completed',repurposedDuty:true}];
  // Regression (Codex review, PR #109): an imported plan annotates the absent lesson itself — the tile subject already carries the reason. The download must strip it, as the Drive file does. Only the tile subject is annotated; the source stays as the baseline recorded it.
  const annotatedTile=data.teacherSummary.plan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'&&t.teacherId==='alice'&&t.period===2);assert(annotatedTile,'alice P2 lesson tile exists');annotatedTile.subject='EL (absent — PRIVATE_SYNTHETIC_MEDICAL)';
  const before=JSON.stringify(data);
  // Baseline source for the Stapler layout, built from the fixture day exactly as the Stapler screen export receives it.
  const day=f.ctx.days[f.date],week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
  const baseline={modelId:data.teacherSummary.plan.baselineId,model:{layoutMode:'odd-even',odd:structuredClone(week),even:structuredClone(week),maxPeriod:16,teacherCount:day.teachers.length,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]}};
  assert.equal(w.RosterStaplerExport.canUseBaseline(data.teacherSummary.plan,baseline),true,'the fixture baseline matches the suspended plan');
  // Download: Stapler standalone layout (Teacher Summary + Class POV), selected date only, with absence reasons hidden.
  const download=await w.RosterStaplerExport.makeReliefWorkbook(data,baseline,{hideAbsenceReasons:true,includeClassPov:true});
  assert.equal(download.filename,'2026 Oct 14 Stapler - Teachers TTb saved 2026 Oct 14 0905h.xlsx');
  assert.deepEqual(Array.from(download.sheetNames),['Teacher Summary','Class POV']);
  const downloadZip=await JSZip.loadAsync(await download.blob.arrayBuffer()),sheet1Xml=await downloadZip.file('xl/worksheets/sheet1.xml').async('string'),sheet2Xml=await downloadZip.file('xl/worksheets/sheet2.xml').async('string'),stylesXml=await downloadZip.file('xl/styles.xml').async('string');
  const sheet1Doc=new JSDOM(sheet1Xml,{contentType:'application/xml'}).window.document,classDoc=new JSDOM(sheet2Xml,{contentType:'application/xml'}).window.document,stylesDoc=new JSDOM(stylesXml,{contentType:'application/xml'}).window.document;
  const text=(doc,ref)=>doc.querySelector('c[r="'+ref+'"]')?.textContent||'',fill=(doc,ref)=>stylesDoc.querySelector('fills').children[Number(stylesDoc.querySelector('cellXfs').children[Number(doc.querySelector('c[r="'+ref+'"]').getAttribute('s'))].getAttribute('fillId'))].querySelector('fgColor')?.getAttribute('rgb');
  // Teacher Summary: Stapler title, empty second row, weekday row, Start/End, Teacher + period numbers, teachers from row 6. Wednesday is dayIndex 2, perDay 17, so its columns start at AJ (36); P2 is AL (38), P3 is AM (39).
  assert.equal(text(sheet1Doc,'A1'),'Teacher Summary · 2026-10-14 · Current Stapler plan');
  assert.equal(text(sheet1Doc,'A2'),'');
  assert.equal(text(sheet1Doc,'AJ3'),'Wednesday');
  assert.equal(text(sheet1Doc,'A4'),'Start / End');assert.equal(text(sheet1Doc,'AJ4'),'07:00\n07:30');
  assert.equal(text(sheet1Doc,'A5'),'Teacher');assert.equal(text(sheet1Doc,'AJ5'),'0');assert.equal(text(sheet1Doc,'AK5'),'1');assert.equal(text(sheet1Doc,'AL5'),'2');
  assert.deepEqual(['A6','A10','A14','A18','A22'].map(ref=>text(sheet1Doc,ref)),['Alice','Bob','Charlie','Dora','Activated Relief']);
  assert.match(text(sheet1Doc,'AL6'),/EL \(absent\)/);assert.equal(fill(sheet1Doc,'AL6'),'FFD9D9D9');
  assert.match(text(sheet1Doc,'AL10'),/MA \(for Alice\) \+ EL \(for Alice\) \[Combined\]/);assert.equal(fill(sheet1Doc,'AL10'),'FFFFC000');
  assert.match(text(sheet1Doc,'AM18'),/Recess supervision \[Repurposed recess duty\]/);
  const downloadPane=sheet1Doc.querySelector('pane');assert.equal(downloadPane.getAttribute('xSplit'),'1');assert.equal(downloadPane.getAttribute('ySplit'),'5');assert.equal(downloadPane.getAttribute('topLeftCell'),'B6');
  // Class POV: same date, same privacy rules. The absence reason must not leak through the absence label or an imported tile subject.
  assert.match(text(classDoc,'A1'),/Class POV · 2026-10-14/);
  for(const xml of [sheet1Xml,sheet2Xml]){
   assert.doesNotMatch(xml,/Empty Active Teacher/);
   assert.doesNotMatch(xml,/\[(Draft|Published|Completed)\]|PRIVATE MEDICAL|UNCONFIRMED/i);
   assert.doesNotMatch(xml,/PRIVATE_SYNTHETIC_MEDICAL/,'reason embedded in the imported lesson tile must not leak into the download');
  }
  assert.match(sheet1Xml,/\[Combined\]/);assert.match(sheet1Xml,/\[Repurposed recess duty\]/);
  // Drive file: daily renderer, same teachers, same privacy rules.
  const drive=edge.dailyTeacherWorkbook(data,{packageFiles:GSISExcel.packageFiles});
  assert.equal(drive.filename,f.date+' Relief.xlsx');
  const page=edge.dailyTeacherPage(data);assert.equal(page.rows.filter(r=>r.teacherId).length,(data.teacherSummary.plan.teachers.length+data.teacherSummary.addedTeachers.length)*4);assert.equal(page.rows.filter(r=>r.teacherId==='adhoc').length,4);assert.equal(page.rows.filter(r=>r.teacherId==='empty').length,0);
  assert.deepEqual(new Set(page.rows.filter(r=>r.teacherId).map(r=>r.teacherId)),new Set(['alice','bob','charlie','dora','adhoc']));
  const driveZip=await JSZip.loadAsync(await drive.blob.arrayBuffer());assert.equal(Object.keys(driveZip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).length,1);const driveXml=await driveZip.file('xl/worksheets/sheet1.xml').async('string'),driveDom=new JSDOM(driveXml,{contentType:'application/xml'}),drivePane=driveDom.window.document.querySelector('pane');assert.equal(drivePane.getAttribute('xSplit'),'1');assert.equal(drivePane.getAttribute('ySplit'),'5');assert.equal(drivePane.getAttribute('topLeftCell'),'B6');assert.doesNotMatch(driveXml,/\[(Draft|Published|Completed)\]|PRIVATE MEDICAL|UNCONFIRMED/i);assert.doesNotMatch(driveXml,/PRIVATE_SYNTHETIC_MEDICAL/,'reason embedded in the imported lesson tile must not leak into the Drive file');assert.match(driveXml,/\[Combined\]/);assert.match(driveXml,/\[Repurposed recess duty\]/);assert.match(driveXml,/Confirmed Stapler rev 1/);assert.match(driveXml,/09:05/);driveDom.window.close();
  assert.equal(page.rows.find(r=>r.teacherId==='bob').colours[2],'orange');assert.equal(page.rows.find(r=>r.teacherId==='alice').colours[2],'grey');
  const local=edge.dailyTeacherPage({...data,localSnapshot:{state:'Save unconfirmed'}});assert.match(local.status,/Local snapshot.*Save unconfirmed/);
  assert.equal(JSON.stringify(data),before,'export does not mutate its input');
  console.log('PASS Stapler download: Teacher Summary + Class POV, baseline + ad hoc teachers only, frozen panes, privacy and duty tags; Drive file unchanged');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
