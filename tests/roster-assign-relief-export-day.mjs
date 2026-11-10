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
  // Download: Stapler relief workbook, selected date only, with absence reasons hidden.
  const download=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{hideAbsenceReasons:true});
  assert.equal(download.filename,'2026 Oct 14 Relief current saved - Teachers TTb saved 2026 Oct 14 0905h.xlsx');
  assert.deepEqual(Array.from(download.sheetNames),['Teacher Summary']);
  const downloadZip=await JSZip.loadAsync(await download.blob.arrayBuffer()),downloadXml=await downloadZip.file('xl/worksheets/sheet1.xml').async('string'),downloadStyles=await downloadZip.file('xl/styles.xml').async('string'),downloadDoc=new JSDOM(downloadXml,{contentType:'application/xml'}).window.document,downloadStylesDoc=new JSDOM(downloadStyles,{contentType:'application/xml'}).window.document;
  const text=(doc,ref)=>doc.querySelector('c[r="'+ref+'"]')?.textContent||'',fill=(doc,ref)=>downloadStylesDoc.querySelector('fills').children[Number(downloadStylesDoc.querySelector('cellXfs').children[Number(doc.querySelector('c[r="'+ref+'"]').getAttribute('s'))].getAttribute('fillId'))].querySelector('fgColor')?.getAttribute('rgb');
  assert.match(text(downloadDoc,'A1'),/All teachers.*Current saved plan and allocations.*Confirmed suspended timetable, not yet published/);
  assert.match(text(downloadDoc,'A2'),/Selected date only.*Revision \d+; allocation \d+/);
  assert.deepEqual(['A5','A9','A13','A17','A21'].map(ref=>text(downloadDoc,ref)),['Alice','Bob','Charlie','Dora','Activated Relief']);
  assert.doesNotMatch(downloadXml,/Empty Active Teacher/);
  assert.doesNotMatch(downloadXml,/\[(Draft|Published|Completed)\]|PRIVATE MEDICAL|UNCONFIRMED/i);
  assert.doesNotMatch(downloadXml,/PRIVATE_SYNTHETIC_MEDICAL/,'reason embedded in the imported lesson tile must not leak into the download');
  assert.match(downloadXml,/\[Combined\]/);assert.match(downloadXml,/\[Repurposed recess duty\]/);
  assert.match(text(downloadDoc,'D5'),/EL \(absent\)/);assert.equal(fill(downloadDoc,'D5'),'FFD9D9D9');
  assert.match(text(downloadDoc,'D9'),/MA \(for Alice\) \+ EL \(for Alice\) \[Combined\]/);assert.equal(fill(downloadDoc,'D9'),'FFFFC000');
  assert.match(text(downloadDoc,'E17'),/Recess supervision \[Repurposed recess duty\]/);
  const downloadPane=downloadDoc.querySelector('pane');assert.equal(downloadPane.getAttribute('xSplit'),'1');assert.equal(downloadPane.getAttribute('ySplit'),'4');assert.equal(downloadPane.getAttribute('topLeftCell'),'B5');
  // Drive file: daily renderer, same teachers, same privacy rules.
  const drive=edge.dailyTeacherWorkbook(data,{packageFiles:GSISExcel.packageFiles});
  assert.equal(drive.filename,f.date+' Relief.xlsx');
  const page=edge.dailyTeacherPage(data);assert.equal(page.rows.filter(r=>r.teacherId).length,(data.teacherSummary.plan.teachers.length+data.teacherSummary.addedTeachers.length)*4);assert.equal(page.rows.filter(r=>r.teacherId==='adhoc').length,4);assert.equal(page.rows.filter(r=>r.teacherId==='empty').length,0);
  assert.deepEqual(new Set(page.rows.filter(r=>r.teacherId).map(r=>r.teacherId)),new Set(['alice','bob','charlie','dora','adhoc']));
  const driveZip=await JSZip.loadAsync(await drive.blob.arrayBuffer());assert.equal(Object.keys(driveZip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).length,1);const driveXml=await driveZip.file('xl/worksheets/sheet1.xml').async('string'),driveDom=new JSDOM(driveXml,{contentType:'application/xml'}),drivePane=driveDom.window.document.querySelector('pane');assert.equal(drivePane.getAttribute('xSplit'),'1');assert.equal(drivePane.getAttribute('ySplit'),'5');assert.equal(drivePane.getAttribute('topLeftCell'),'B6');assert.doesNotMatch(driveXml,/\[(Draft|Published|Completed)\]|PRIVATE MEDICAL|UNCONFIRMED/i);assert.doesNotMatch(driveXml,/PRIVATE_SYNTHETIC_MEDICAL/,'reason embedded in the imported lesson tile must not leak into the Drive file');assert.match(driveXml,/\[Combined\]/);assert.match(driveXml,/\[Repurposed recess duty\]/);assert.match(driveXml,/Confirmed Stapler rev 1/);assert.match(driveXml,/09:05/);driveDom.window.close();
  assert.equal(page.rows.find(r=>r.teacherId==='bob').colours[2],'orange');assert.equal(page.rows.find(r=>r.teacherId==='alice').colours[2],'grey');
  const local=edge.dailyTeacherPage({...data,localSnapshot:{state:'Save unconfirmed'}});assert.match(local.status,/Local snapshot.*Save unconfirmed/);
  assert.equal(JSON.stringify(data),before,'export does not mutate its input');
  console.log('PASS selected-day workbook: baseline + ad hoc teachers only, Stapler download and Drive file list the same teachers, frozen panes, privacy and duty tags');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
