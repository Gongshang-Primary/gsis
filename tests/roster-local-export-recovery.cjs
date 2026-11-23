'use strict';
// Real browser exporter and local allocation data; no school/provider services.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
async function runCase(mode){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,downloads=[],objects=new Map(),errors=[];
 w.JSZip=JSZip;w.Blob=Blob;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};w.addEventListener('error',event=>errors.push(event.error));
 w.URL.createObjectURL=blob=>{const id='blob:local-export-'+objects.size;objects.set(id,blob);return id;};w.URL.revokeObjectURL=id=>objects.delete(id);w.HTMLAnchorElement.prototype.click=function(){downloads.push({filename:this.download,blob:objects.get(this.href)});};
 const query=s=>w.document.querySelector(s),wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await pause();}throw Error(mode+': export did not finish: '+w.document.body.textContent);};
 try{
  for(const file of ['shared/roster-allocation.js','shared/roster-stapler.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/converter.js','roster-update/public/roster-export.js','roster-update/public/excel-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
  const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'absent',staffId:'alice',name:'Alice Teacher',date:f.ctx.today,typeLabel:'PRIVATE_SYNTHETIC_REASON',typeId:'mc',periods:[2],reliefRequired:true,instructions:{},instructionsNA:true});
  const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
  const baseline={modelId:'baseline',model:{layoutMode:'odd-even',odd:structuredClone(week),even:structuredClone(week),maxPeriod:16,teacherCount:4,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]}};
  let offline=false,networkCalls=0,baselineCalls=0;
  const ctx={profile:f.profile,today:()=>f.ctx.today,container:query('#content'),status(){},localTimetable:async()=>{baselineCalls++;assert(!offline,'An export click must not request the timetable');return mode==='no-baseline'?null:baseline;},api:async(route,p)=>{
   networkCalls++;assert(!offline,'An export click must not request online records');const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Error(result.error);
   if(p.operation==='read'&&p.view==='allocation'){
    if(mode!=='missing-context'&&mode!=='incomplete')result.data.exportContext=w.GSISRosterOperations.dailyExport(f.state,f.ctx,{date:p.date,fullTeachers:true,dailyDrive:true});
    if(mode==='stale-revision')result.data.revision=result.data.exportContext.revision+1;
    if(mode==='mismatched-plan'){result.data.exportContext.teacherSummary.plan.baselineId='foreign-baseline';for(const tile of result.data.exportContext.teacherSummary.plan.tiles||[])if(tile.kind==='lesson')tile.subject='OLD_PLAN_SENTINEL';}
    if(mode==='stale-absence'){result.data.absences=[];result.data.ownAbsences=[];result.data.demands=[];result.data.allocationModel.assignments=[];}
   }
   return result.data;
  }};
  const session=await w.RosterOpsUI.render('Assign Relief',ctx);await pause();await pause();
  if(mode==='incomplete'){
   session.exportBaseline=null;delete session.data.timetable.teachers.find(t=>t.staffId==='bob').cells;delete session.data.allocationModel.teachers.find(t=>t.id==='bob').t.cells;
  }else if(mode!=='stale-absence'){query('[data-manual-select="dora"]').click();await pause();}
  offline=true;const priorNetwork=networkCalls,priorBaseline=baselineCalls;
  for(const selector of ['[data-daily-excel]','[data-relief-excel]','[data-class-excel]']){
   const before=downloads.length;query(selector).click();
   if(mode==='incomplete'){await pause();assert.equal(downloads.length,before,'Incomplete local teacher data must not produce a workbook');}
   else await wait(()=>downloads.length===before+1);
   assert.equal(networkCalls,priorNetwork,'Export cannot make an API request');assert.equal(baselineCalls,priorBaseline,'Export cannot fetch an optional comparison baseline');
  }
  if(mode!=='incomplete'){
   assert.equal(downloads.length,3);const books=[];
   for(const file of downloads){assert.match(file.filename,/\.xlsx$/);const zip=await JSZip.loadAsync(await file.blob.arrayBuffer());books.push((await Promise.all(Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map(name=>zip.file(name).async('string')))).join('\n'));}
   for(const text of books){assert.match(text,/Local snapshot/);assert.doesNotMatch(text,/PRIVATE_SYNTHETIC_REASON|OLD_PLAN_SENTINEL/);if(mode!=='stale-absence'){assert.match(text,/Dora Free/,'Unsaved local assignment must be included');assert.match(text,/not saved/);}else assert.doesNotMatch(text,/>UNASSIGNED<|\(absent/i,'Removed absences must not survive from the older export context');}
   if(mode==='stale-absence')assert.doesNotMatch(books[1],/Alice Teacher/,'Removed absence row must not remain in the relief-only workbook');
   for(const name of ['Alice Teacher','Bob Colleague','Charlie Busy','Dora Free'])assert(books[0].includes(name),'Teacher export must retain every baseline teacher: '+name);
   assert.equal(f.state.assignments.length,0,'Local export must not submit the unsaved assignment');
  }else assert.match(query('[data-ops-message]').textContent,/unavailable|incomplete|not loaded|missing/i);
  assert.deepEqual(errors,[]);console.log('PASS local export '+mode+': all three actions stay local and preserve completeness/privacy');
 }finally{w.RosterOpsUI.unmount();w.close();}
}
(async()=>{for(const mode of ['missing-context','stale-revision','no-baseline','incomplete','stale-absence','mismatched-plan'])await runCase(mode);})().catch(error=>{console.error(error);process.exitCode=1;});
