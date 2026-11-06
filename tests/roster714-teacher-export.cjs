'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
const fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js'),clone=v=>JSON.parse(JSON.stringify(v));
(async()=>{
 const dom=new JSDOM('',{url:'https://roster.test',runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const file of ['roster-update/public/converter.js','shared/roster-stapler.js','roster-update/public/roster-stapler-export.js','roster-update/public/roster-export.js'])w.eval(fs.readFileSync(file,'utf8'));
  const f=fixture(),{O,state,ctx,date}=f,day=ctx.days[date];day.periods=day.periods.slice(0,5);day.endOfDayMinutes=570;
  for(const t of day.teachers){t.cells=t.cells.slice(0,5);t.timetableName=t.name+' Timetable';}
  day.teachers[0].cells[4]=['SCI','4A','Science Room','G1'];day.teachers[2].cells[1]=['MA','3A','Room C',''];
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday'],week={days,perDay:5,maxPeriod:4,blocks:day.teachers.map(t=>({name:t.timetableName,cells:Array.from({length:5},()=>clone(t.cells)).flat()}))};
  week.blocks.push({name:'Unmatched source teacher',cells:Array.from({length:25},()=>['','','',''])});
  const baseline={modelId:'baseline',model:{layoutMode:'odd-even',odd:clone(week),even:clone(week),maxPeriod:4,teacherCount:5,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:4,endOfDayMinutes:570},recesses:[]}};
  let plan=S.create({...day,date});plan=S.apply(plan,{type:'move',tileId:'baseline:charlie:1',teacherId:'charlie',period:4});
  plan=S.apply(plan,{type:'addTile',tile:{teacherId:'dora',classIds:[],period:0,subject:'Extra task',venue:'A very long venue with <markup> & literal text '.repeat(4)+'\nSecond line',group:'G'}});
  plan=S.apply(plan,{type:'suspend',target:'teacher',targetId:'charlie',fromPeriod:0,toPeriod:0,reason:'Training'});
  state.staplerPlans.push({date,baselineId:'baseline',draft:plan,confirmed:true,confirmedRevision:3,confirmedPlan:structuredClone(plan),revision:3,publishedRevision:2});
  state.absences.push({id:'absence-a',date,staffId:'alice',name:'Alice',typeId:'mc',typeLabel:'MC',periods:[1,2,3,4],reliefRequired:true,instructions:{},instructionsNA:true});
  ctx.people.push({id:'external',name:'External Teacher',active:false,employment:'SRE'},{id:'unused-external',name:'Unused External',active:false,employment:'SRE'});
  state.adhoc.push({id:'adhoc1',date,staffId:'external',periods:[0,1,2,3,4]},{id:'adhoc2',date,staffId:'unused-external',periods:[0,1,2,3,4]});
  const composed=O.composeStaplerContext(state,ctx),demands=O.demand(composed,state,date),byPeriod=new Map(demands.map(d=>[d.period,d]));
  for(const [p,staffId,status] of [[2,'bob','draft'],[3,'external','published']]){const d=byPeriod.get(p);state.assignments.push({...d,id:'assignment-'+p,date,demandId:d.id,staffId,absentId:'alice',absentName:'Alice',status,relieverName:ctx.people.find(t=>t.id===staffId).name,instructions:'SENTINEL_PRIVATE_INSTRUCTIONS',customInstructions:'SENTINEL_CUSTOM'});}
  state.assignments[0].subject='=HYPERLINK("https://example.test","text")';
  state.assignments.push({id:'no-relief',demandId:byPeriod.get(4).id,date,period:4,staffId:null,status:'draft',noRelief:true});
  const before=JSON.stringify({state,baseline}),data=O.dailyExport(state,composed,{date,fullTeachers:true}),book=await w.RosterStaplerExport.makeReliefWorkbook(data,baseline);
  assert.equal(JSON.stringify({state,baseline}),before,'export does not save, publish or mutate source');
  assert.equal(data.teacherSummary.plan.status,'draft');assert.equal(data.teacherSummary.staplerStatus,'confirmed');assert.equal(data.teacherSummary.assignments[0].instructions,undefined);
  const zip=await JSZip.loadAsync(await book.blob.arrayBuffer()),parse=async file=>new w.DOMParser().parseFromString(await zip.file(file).async('string'),'application/xml');
  const odd=await parse('xl/worksheets/sheet1.xml'),even=await parse('xl/worksheets/sheet2.xml'),styles=await parse('xl/styles.xml');
  const cell=(sheet,ref)=>sheet.querySelector('c[r="'+ref+'"]'),text=(sheet,ref)=>cell(sheet,ref)?.querySelector('is')?.textContent||'';
  const fill=(sheet,ref)=>styles.querySelectorAll('fills > fill')[Number(styles.querySelectorAll('cellXfs > xf')[Number(cell(sheet,ref).getAttribute('s'))].getAttribute('fillId'))].querySelector('fgColor')?.getAttribute('rgb');
  assert.deepEqual(Array.from(book.sheetNames),['Odd Week','Even Week']);
  for(const sheet of [odd,even]){
   assert.equal(sheet.querySelector('parsererror'),null);assert.equal(sheet.querySelectorAll('f').length,0);
   assert.deepEqual([...sheet.querySelectorAll('c')].filter(c=>/^A(?:[6-9]|[12]\d|3[0-3])$/.test(c.getAttribute('r'))&&c.querySelector('is')).map(c=>c.querySelector('is').textContent),['Alice Timetable','Bob Timetable','Charlie Timetable','Dora Timetable','Unmatched source teacher','External Teacher','Unused External']);
   assert.equal(sheet.querySelectorAll('row').length,33,'four rows for every teacher, including blank and unused external teachers');
  }
  assert.match(text(even,'A1'),/Current saved.*Confirmed.*not yet published/);assert.doesNotMatch(text(even,'A2'),/\[DRAFT\]/);
  assert.equal(text(even,'M6'),'Absent — MC');assert.equal(text(even,'N6'),'EL (absent — MC)');assert.equal(text(even,'P6'),'SCI (absent — MC) [No Relief Needed]');
  assert.equal(text(even,'N10'),'=HYPERLINK("https://example.test","text") (for Alice)');assert.equal(text(even,'O26'),'EL (for Alice)');
  for(let offset=0;offset<4;offset++){assert.equal(fill(even,'N'+(6+offset)),'FFD9D9D9');assert.equal(fill(even,'N'+(10+offset)),'FFFFC000');assert.equal(fill(even,'O'+(26+offset)),'FFFFC000');assert.equal(fill(even,'M'+(14+offset)),'FFD9D9D9');assert.equal(fill(even,'P'+(14+offset)),'FFDFF3DF');assert.equal(fill(even,'L'+(18+offset)),'FFFFDCE3');assert.equal(fill(even,'L'+(14+offset)),'FFDDEBF7');}
  assert.ok(Number(even.querySelector('row[r="20"]').getAttribute('ht'))>14.25);
  const column=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  for(const [sheet,parity] of [[odd,'odd'],[even,'even']])for(let teacher=0;teacher<5;teacher++)for(let d=0;d<5;d++)for(let p=0;p<5;p++)for(let field=0;field<4;field++)if(parity==='odd'||d!==2)assert.equal(text(sheet,column(2+d*5+p)+(6+teacher*4+field)),baseline.model[parity].blocks[teacher].cells[d*5+p][field]);
  for(const part of Object.values(zip.files))if(!part.dir)assert.doesNotMatch(await part.async('string'),/SENTINEL_/);
  assert.match(await zip.file('xl/_rels/workbook.xml.rels').async('string'),/relationships\/styles/);
  const reliefOnly=O.dailyExport(state,composed,{date});assert.equal(reliefOnly.teacherSummary,undefined);const arrangements=await w.RosterExport.makeWorkbook([w.RosterExport.dailyRelief(reliefOnly)]),arrangementZip=await JSZip.loadAsync(await arrangements.blob.arrayBuffer()),arrangementXml=await arrangementZip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(arrangementXml,/No Relief Needed/);assert.doesNotMatch(arrangementXml,/Unused External|Unmatched source teacher/);
  const uncovered=clone(data);uncovered.teacherSummary.assignments=uncovered.teacherSummary.assignments.filter(a=>a.period!==2);const uncoveredBook=await w.RosterStaplerExport.makeReliefWorkbook(uncovered,baseline),uncoveredZip=await JSZip.loadAsync(await uncoveredBook.blob.arrayBuffer());assert.match(await uncoveredZip.file('xl/worksheets/sheet2.xml').async('string'),/EL \(absent — MC\) \[UNASSIGNED\]/);
  const clash=clone(data);clash.teacherSummary.assignments[1].period=2;clash.teacherSummary.assignments[1].staffId='bob';await assert.rejects(()=>w.RosterStaplerExport.makeReliefWorkbook(clash,baseline),/Relief clashes/);
  const combined=clone(data);combined.teacherSummary.assignments.push({...combined.teacherSummary.assignments[1],id:'combined',demandId:'combined-demand',staffId:'bob',period:2,combination:true});const comboBook=await w.RosterStaplerExport.makeReliefWorkbook(combined,baseline),comboZip=await JSZip.loadAsync(await comboBook.blob.arrayBuffer());assert.match(await comboZip.file('xl/worksheets/sheet2.xml').async('string'),/ \+ EL \(for Alice\) \[Combined\]/);
  // Replacing an optional comparison never changes the dated saved timetable.
  const newDay=clone(day);newDay.id='new-baseline';newDay.teachers[2].cells[1][0]='Current baseline MA';
  const newContext=O.composeStaplerContext(state,{...ctx,days:{[date]:newDay}}),newBaseline=clone(baseline);newBaseline.modelId='new-baseline';
  const currentData=O.dailyExport(state,newContext,{date,fullTeachers:true});assert.equal(currentData.teacherSummary.plan.baselineId,'baseline');assert.equal(currentData.teacherSummary.staplerStatus,'confirmed');assert(currentData.rows.some(row=>row.id.startsWith('stapler:')));
  assert.deepEqual(currentData.teacherSummary.plan.tiles,data.teacherSummary.plan.tiles);assert.deepEqual(currentData.periods,data.periods);
  const comparison=w.RosterStaplerExport.canUseBaseline(currentData.teacherSummary.plan,newBaseline)?newBaseline:null;
  assert.equal(comparison,null,'an incompatible comparison selects the independent dated export');
  const currentBook=await w.RosterStaplerExport.makeReliefWorkbook(currentData,comparison),currentZip=await JSZip.loadAsync(await currentBook.blob.arrayBuffer());
  const currentXml=await currentZip.file('xl/worksheets/sheet1.xml').async('string');assert.match(currentXml,/Extra task/);assert.match(currentXml,/Confirmed/);assert.doesNotMatch(currentXml,/Current baseline MA|SENTINEL_/);
  const currentRelief=O.dailyExport(state,newContext,{date});assert(currentRelief.rows.some(row=>row.id.startsWith('stapler:')));assert.equal(state.staplerPlans[0].baselineId,'baseline','export preserves the saved plan source provenance');
  fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/714-all-teachers-synthetic.xlsx',Buffer.from(await book.blob.arrayBuffer()));fs.writeFileSync('verification/714-relief-only-synthetic.xlsx',Buffer.from(await arrangements.blob.arrayBuffer()));
  console.log('PASS 714 teacher export: API to workbook, all 7 teacher blocks, absence and relief colours, draft/published labels, blank and external teachers, unchanged other days/weeks, literal formula text, no private instructions, preserved arrangements export, uncovered lessons, clash rejection and confirmed Stapler retained across comparison baseline replacement.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

