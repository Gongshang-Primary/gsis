const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/index.html','utf8'),{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 let entry=null,model=null,revision=0,fail=true,profileFail=true,smc=true,staffId=null,calendar=null,saves=[],parseCalls=0,workbookCalls=0;
 const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})}),unavailable=()=>({ok:false,status:503,json:async()=>({ok:false,error:'Roster is temporarily unavailable.',diagnosticId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'})});
 // Pin the school-day scenario; running this test on a real weekend must not change it.
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-14T06:00:00+08:00']));}static now(){return NativeDate.parse('2026-10-14T06:00:00+08:00');}};
 w.TextDecoder=TextDecoder;w.JSZip=JSZip;w.Blob=Blob;w.confirm=()=>true;
 w.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}');
  if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};if(route==='session')return reply({});
  if(route==='profile'){if(profileFail){profileFail=false;return unavailable();}return reply({user:{email:'test@gsps.edu.sg',staffId,smc,admin:smc,accessVerified:true},revision,active:entry,selected:entry,selection:entry?'current':null,model,calendar,entries:entry?[entry]:[]});}
  if(route==='read')return reply({revision,active:entry,model,calendar});
  if(route==='operations'&&p.operation==='inboxList'){assert.equal(p.filter,'open');assert.equal(p.limit,1);return reply({alertCount:0});}
  if(route==='operations'){assert.equal(p.operation,'availability');assert.equal(p.complete,true);return reply({date:p.date,complete:true,timetableId:entry?.id,confirmed:!calendar||calendar.available&&calendar.schoolDay!==false,warning:calendar?.schoolDay===false?'No-school day':calendar?.available===false?'Calendar unavailable':'',people:[{id:'alpha',name:'Alpha',timetableName:'Alpha'},{id:'beta',name:'Beta',timetableName:'Beta'}],periods:Array.from({length:14},(_,period)=>({period,start:'07:00',end:'07:30',available:period?[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'}]:[]}))});}
  if(route==='upload'){saves.push(p);if(fail){fail=false;return unavailable();}model=p.model;entry={id:'one',name:p.name,from:p.from,to:p.to,teacherCount:model.teacherCount,layoutMode:model.layoutMode};revision++;return reply({revision,active:entry,selected:entry,entries:[entry],selection:'current',savedId:entry.id});}
  throw Error(route);
 };
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+doc.querySelector('#status').textContent);};
 const clickTab=name=>{if(name==='Home'){doc.querySelector('#nav [data-page=Home]')?.click();return;}if(!doc.querySelector('.function-tile'))doc.querySelector('#nav [data-page=Home]').click();doc.querySelector('.function-tile[data-page="'+name+'"]').click();};
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 function fixture(names=['Alpha','Beta']){return '<table><tr><td>Teacher</td>'+days.map(d=>'<td colspan="14">Week A - '+d+'</td>').join('')+'</tr><tr><td></td>'+Array.from({length:70},(_,i)=>'<td>'+i%14+'</td>').join('')+'</tr>'+names.map(name=>'<tr><td>'+name+'</td>'+Array.from({length:70},(_,i)=>'<td>'+(i%14===0?'Duty<br><br><br><br>7:00 am - 7:30 am':'')+'</td>').join('')+'</tr>').join('')+'</table>';}
 function choose(form,source){const file=typeof source==='string'?{name:'Teachers Summary.xls',size:source.length,arrayBuffer:async()=>new TextEncoder().encode(source).buffer}:source;Object.defineProperty(form.elements.source,'files',{configurable:true,value:[file]});return form.elements.source.onchange();}
 try{
  run(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));
  w.RosterOpsUI={teacherMultiPicker:w.RosterOpsUI.teacherMultiPicker,pages:()=>[],unmount(){},resetPreloads(){},preload:async()=>{},isDirty:()=>false};
  for(const file of ['converter.js','roster-model.js','roster-export.js','roster.js'])run(fs.readFileSync('roster-update/public/'+file,'utf8'));
  const parse=w.RosterConverter.parseFile,workbook=w.RosterConverter.makeWorkbook;
  w.RosterConverter.parseFile=(...a)=>{parseCalls++;return parse(...a);};w.RosterConverter.makeWorkbook=(...a)=>{workbookCalls++;return workbook(...a);};
  await wait(()=>doc.querySelector('#retryLoad'));assert.equal(doc.querySelectorAll('[data-page]').length,0);assert.match(doc.querySelector('.recovery').textContent,/Reference: aaaaaaaa/);assert.doesNotMatch(doc.querySelector('.recovery').textContent,/No active timetable/);
  doc.querySelector('#retryLoad').click();await wait(()=>doc.querySelector('.function-tile[data-page="Baseline Timetable"]'));
  assert.deepEqual([...doc.querySelectorAll('.function-title')].map(e=>e.textContent),['Stapler','WhatsApp Inbox','Check Availability','Timetable','Daily Updates','Statistics','Baseline Timetable','Learn about Auto Allocation','SMC Duty Roster','System Config']);
  for(const icon of doc.querySelectorAll('.function-tile img')){assert.equal(icon.alt,'');assert.ok(fs.existsSync('roster-update/public/'+icon.getAttribute('src')));}
  doc.querySelector('.function-tile[data-page="Baseline Timetable"]').click();await wait(()=>doc.querySelector('#uploadForm'));
  assert.equal(doc.querySelector('#uploadForm').hidden,true);doc.querySelector('[data-baseline=upload]').click();
  let form=doc.querySelector('#uploadForm');assert.equal(form.elements.start.value,'07:00');assert.equal(form.elements.minutes.value,'30');assert.equal(form.elements.end.value,'13:30');assert.equal(form.elements.last,undefined,'imported last period is not manually editable');
  // JSDOM cannot assign a native FileList, so exercise metadata validation in the real save handler.
  form.reportValidity=()=>true;
  await choose(form,fixture(['Alpha','Alpha']));assert.match(doc.querySelector('#importStatus').textContent,/Duplicate or invalid teacher names/);assert.equal(doc.querySelector('#saveUpload').disabled,true);assert.equal(saves.length,0);
  let finishFirst;const first=choose(form,{name:'slow.xls',size:100,arrayBuffer:()=>new Promise(r=>{finishFirst=r;})});
  await new Promise(r=>setTimeout(r,30));assert.equal(doc.querySelector('#content').inert,true);finishFirst(new TextEncoder().encode(fixture(['Old teacher'])).buffer);await first;await choose(form,fixture());
  assert.match(doc.querySelector('#importPreview').textContent,/Single week/);assert.match(doc.querySelector('#previewTimetable').textContent,/Duty/);assert.doesNotMatch(doc.querySelector('#previewTeacher').textContent,/Old teacher/);assert.equal(saves.length,0);
  assert.match(doc.querySelector('#importPreview').textContent,/P0 to P13/);assert.equal(doc.querySelector('#importLastPeriod').textContent,'P13');assert.match(doc.querySelector('#importPreview').textContent,/14:00/);assert.match(doc.querySelector('#importPreview').textContent,/Five card fields/);
  form.elements.minutes.value='120';form.elements.minutes.oninput();assert.equal(doc.querySelector('#saveUpload').disabled,true);
  form.elements.minutes.value='30';form.elements.minutes.oninput();assert.equal(doc.querySelector('#saveUpload').disabled,false);
  form.elements.name.value='Test online';form.elements.to.value='2099-12-31';form.elements.to.oninput();assert.match(doc.querySelector('#activationNotice').textContent,/active timetable immediately/);
  const parsedBeforeSave=parseCalls;await form.onsubmit({preventDefault(){},target:form});
  assert.equal(saves.length,1);assert.equal(saves[0].model.timing.normalLastPeriod,13,'all source periods survive independent school end time');assert.equal(saves[0].model.timing.endOfDayMinutes,810);assert.equal(doc.querySelector('#retrySave').hidden,false);assert.equal(doc.querySelector('#uploadFields').disabled,true);
  await form.onsubmit({preventDefault(){},target:form});assert.equal(saves.length,1,'An unconfirmed save must not be replaced with a new request');
  doc.querySelector('#retrySave').click();await wait(()=>revision===1&&doc.querySelector('#savedTimetables [data-baseline-feedback]')?.textContent==='Saved online.');
  assert.deepEqual(saves[0],saves[1]);assert.equal(parseCalls,parsedBeforeSave);assert.equal(workbookCalls,1);assert.ok(Buffer.from(saves[1].workbook,'base64').subarray(0,2).equals(Buffer.from('PK')));
  const archive=await JSZip.loadAsync(Buffer.from(saves[1].workbook,'base64'));assert.match(await archive.file('xl/workbook.xml').async('string'),/name="Teachers"/);
  clickTab('Timetable');await wait(()=>doc.querySelector('#nameSearch'));assert.equal(doc.querySelector('.timetable'),null);doc.querySelector('#nameSearch').onfocus();doc.querySelector('#nameSearch').onkeydown({key:'Enter',preventDefault(){}});await wait(()=>doc.querySelector('.timetable'));assert.match(doc.querySelector('.timetable').textContent,/07:00/);
  const search=doc.querySelector('#nameSearch');search.value='et';search.oninput();assert.equal(doc.querySelectorAll('#nameOptions [role=option]').length,1);assert.equal(doc.querySelector('#nameOptions [role=option]').textContent,'Beta');
  clickTab('Check Availability');await wait(()=>doc.querySelector('#teacherChoices [role=option]'));
  for(const input of [...doc.querySelectorAll('#teacherChoices [role=option]')]){const id=input.dataset.staff;doc.querySelector('#teacherChoices [data-staff="'+id+'"]').click();}await wait(()=>doc.querySelectorAll('.common-free').length===13);assert.match(doc.querySelector('#timetables').textContent,/P1/);assert.doesNotMatch(doc.querySelector('#timetables').textContent,/P0 /);
  calendar={available:true,schoolDay:false,reason:'School holiday',term:'4',schoolWeek:2,parity:'even'};model={...model,layoutMode:'odd-even',odd:model.single,even:model.single};entry={...entry,id:'two'};revision++;
  doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('#timetables')?.textContent.includes('No-school day'));assert.equal(doc.querySelector('.common-free'),null,'unconfirmed baseline never marks current availability as free');assert.match(doc.querySelector('#timetables').textContent,/Baseline preview only/);
  calendar={available:false,message:'Calendar unavailable'};doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('#timetables')?.textContent.includes('Calendar unavailable'));assert.equal(doc.querySelector('.common-free'),null,'unconfirmed baseline never marks current availability as free');assert.match(doc.querySelector('#timetables').textContent,/Baseline preview only/);
  clickTab('Home');await wait(()=>doc.querySelector('.function-tile'));smc=false;doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('.function-tile[data-page="Timetable"]')&&!doc.querySelector('.function-tile[data-page="Baseline Timetable"]'));
  assert.deepEqual([...doc.querySelectorAll('.function-title')].map(e=>e.textContent),['Stapler','Check Availability','Timetable','Learn about Auto Allocation']);assert.doesNotMatch(doc.querySelector('#nav').textContent,/Baseline/);assert.equal(doc.querySelector('#uploadForm'),null);
  // Teacher Daily Updates belongs to the operations module, not the privileged
  // employment-report route. Load the real module for a mapped teacher menu.
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])run(fs.readFileSync(file,'utf8'));
  staffId='alpha';doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('.function-tile[data-page="Daily Updates"]'));
  const teacherOrder=[...doc.querySelectorAll('.function-tile')].map(tile=>tile.dataset.page);assert.equal(teacherOrder[teacherOrder.indexOf('My Relief Duties')+1],'Learn about Auto Allocation');assert.equal(doc.querySelectorAll('.function-tile[data-page="Learn about Auto Allocation"]').length,1);assert.equal(doc.querySelector('#calculations'),null,'retired header entry stays absent');
  assert.equal(doc.querySelectorAll('.function-tile[data-page="Daily Updates"]').length,1);assert.equal(doc.querySelector('.function-tile[data-page="System Config"]'),null);assert.equal(doc.querySelector('.function-tile[data-page="Assign Relief"]'),null);assert.doesNotMatch(doc.querySelector('#content').textContent,/Relief Load/);
  console.log('PASS Roster DOM: recoverable profile error, role-based icon home, preview/stale-file protection, real conversion, timing validation, identical save retry, timetable search and verified operational availability');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
