'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/index.html','utf8'),{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q);
 const calls=[],gates=[],errors=[];let smc=true,email='alice@gsps.edu.sg',poll,failRead=false,noTimetable=false;
 const entry={id:'baseline',name:'School timetable',from:'2026-01-01',to:'2099-12-31'},timing={startMinutes:420,periodMinutes:30,normalLastPeriod:2};
 const model={layoutMode:'single-week',maxPeriod:2,timing,recesses:[],single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,blocks:['Alice Teacher','Bob Colleague'].map((name,n)=>({name,cells:Array.from({length:15},(_,i)=>i%3===1?['EL',n?'2B':'1A','Room '+n,'']:['','','',''])}))}};
 const metadata=()=>({revision:1,active:entry,selected:entry,selection:'current',modelId:entry.id,names:{teacher:['Alice Teacher','Bob Colleague'],class:['1A','2B'],tg:[]},timing,maxPeriod:2,layoutMode:'single-week'});
 const profile=()=>({user:{email,staffId:'alice',smc,admin:false,accessVerified:true},revision:1,active:noTimetable?null:entry,selected:noTimetable?null:entry,selection:noTimetable?null:'current',entries:smc?(noTimetable?[]:[entry]):undefined});
 const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
 w.confirm=()=>true;w.setInterval=fn=>(poll=fn,1);w.HTMLElement.prototype.scrollIntoView=()=>{};w.addEventListener('error',e=>errors.push(e.error));
 w.print=()=>w.dispatchEvent(new w.Event('afterprint'));
 w.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),input=JSON.parse(args.body||'{}');calls.push({route,input});
  if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};if(route==='session')return reply({});if(route==='profile')return reply(profile());
  if(route==='read'){
   if(noTimetable)return reply({revision:1,selected:null,active:null,selection:null,modelId:null,model:null});
   if(input.view==='names')return reply(noTimetable?{selected:null,active:null,names:{teacher:[],class:[],tg:[]},timing:null,maxPeriod:null}:metadata());
   if(gates.length)await gates.shift();
   if(failRead){failRead=false;throw Error('Lost connection');}
   return reply({...metadata(),names:undefined,model,calendar:{available:true,schoolDay:true,term:1,schoolWeek:1,parity:'odd'}});
  }
  if(route==='operations'&&input.operation==='read'&&input.view==='reportForm')return reply({schema:1,date:input.date,today:input.date,minute:480,revision:1,user:profile().user,people:[],types:[],timetablePeople:[],nameBridges:[],noReliefSubjects:[],checkedAt:new w.Date().toISOString()});
  if(route==='operations'&&input.operation==='read')return reply({date:input.date,revision:1,people:[],own:[],demands:[],settings:{absenceTypes:[]},timetable:null});
  if(route==='operations'&&input.operation==='inboxList')return reply({alertCount:0});
  if(route==='operations'&&input.operation==='directory')return reply({people:[{id:'alice',name:'Alice Teacher'},{id:'bob',name:'Bob Colleague'}]});
  if(route==='operations'&&input.operation==='availability')return reply({complete:true,date:input.date,timetableId:entry.id,confirmed:true,people:[{id:'alice',name:'Alice Teacher',timetableName:'Alice Teacher'},{id:'bob',name:'Bob Colleague',timetableName:'Bob Colleague'}],periods:[{period:1,start:'07:30',end:'08:00',available:['alice','bob'].map(id=>({id,name:id==='alice'?'Alice Teacher':'Bob Colleague'}))}]});
  throw Error('Unexpected route: '+route);
 };
 const run=s=>vm.runInContext(s,dom.getInternalVMContext()),wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+$('#content').textContent+' / '+$('#status').textContent);};
 const count=route=>calls.filter(c=>c.route===route).length,full=()=>calls.filter(c=>c.route==='read'&&c.input.view!=='names').length;
 const open=name=>{if(!$('.function-tile'))$('#nav [data-page=Home]').click();$('.function-tile[data-page="'+name+'"]').click();};
 function choose(name){const input=$('#nameSearch');input.value=name;input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
 function gate(){let release,reject;gates.push(new Promise((r,j)=>{release=r;reject=j;}));release.reject=()=>reject(Error('Old read failed'));return release;}
 try{
  const release=gate();
  for(const file of ['roster-model.js','roster-export.js','roster-operations-ui.js','roster.js'])run(fs.readFileSync('roster-update/public/'+file,'utf8'));
  await wait(()=>$('.function-tile'));
  assert.equal(calls.find(c=>c.route==='profile').input.preload,undefined,'profile must not wait for the timetable model');assert.equal(calls.filter(c=>c.route==='operations'&&c.input.operation==='read'&&c.input.view==='reportForm').length,1,'Home warms lightweight form metadata once');assert(calls.filter(c=>c.route==='operations').every(c=>c.input.operation==='inboxList'||c.input.operation==='read'&&['reportForm','report'].includes(c.input.view)),'Home only checks its badge and authorised absence preloads');assert.deepEqual(calls.find(c=>c.input.operation==='inboxList').input,{operation:'inboxList',filter:'open',limit:1});assert.equal(calls.filter(c=>c.input.operation==='directory').length,0);assert.equal(count('read'),0,'home defers the baseline until its first view');
  assert.equal($('.function-tile').dataset.page,'Report Absence');assert.equal($('.function-grid').getAttribute('aria-label'),'Primary Roster functions');assert.equal(doc.querySelectorAll('.function-divider').length,1);assert.equal($('#nav').textContent,'Home');assert.equal($('#nav').getAttribute('aria-label'),'Breadcrumb');assert.equal($('#navToggle').hidden,true);
  open('Timetable');assert.equal($('#nameSearch'),null,'cold timetable waits for its requested model');release();await wait(()=>$('#nameSearch'));
  assert.equal($('#nameSearch').value,'');assert.equal($('.timetable'),null);assert.equal(full(),1);assert.equal($('#print').disabled,true);assert.equal($('#nav').textContent,'HomeTimetableTeacher timetables');
  choose('Bob');assert.equal(full(),1,'selection joins the background model request');await wait(()=>$('.timetable'));assert.equal($('#nameSearch').value,'Bob Colleague');assert.match($('#timetables h3').textContent,/Bob Colleague/);assert.equal($('#print').disabled,false);
  $('[data-timetable=class]').click();assert.equal($('.timetable'),null);choose('2B');assert.match($('#timetables h3').textContent,/Class: 2B/);assert.equal(full(),1,'view changes reuse immutable model');
  $('#nav [data-page=Home]').click();open('Timetable');await wait(()=>$('#nameSearch'));assert.equal($('#nameSearch').value,'');assert.equal($('.timetable'),null);assert.equal(full(),1,'reopening stays blank with a cached model');
  const beforeRefresh=full();$('#refresh').click();await wait(()=>$('#nameSearch')&&!$('#content').inert);choose('Alice');await wait(()=>$('.timetable'));assert.equal(full(),beforeRefresh,'refresh metadata retains the immutable model');$('#nav [data-page=Home]').click();assert.ok($('.function-tile'));assert.equal($('.timetable'),null);
  open('Timetable');await wait(()=>$('#nameSearch'));entry.id='baseline-second';const failedWarm=gate();failRead=true;const beforeWarm=full();$('#refresh').click();await wait(()=>full()===beforeWarm+1);assert.equal($('#nameSearch'),null,'a changed baseline joins its startup read before displaying names');failedWarm();await wait(()=>$('#status').classList.contains('error')&&!$('#content').inert);assert.equal($('.timetable'),null,'failed baseline never displays the old source');$('#refresh').click();await wait(()=>$('#nameSearch')&&!$('#content').inert);choose('Alice');await wait(()=>$('.timetable'));
  const prior=full();$('#viewDate').value='2026-10-10';$('#viewDate').onchange({target:$('#viewDate')});await wait(()=>$('#nameSearch'));choose('Alice');await wait(()=>$('.timetable'));$('#viewDate').value='2026-10-11';$('#viewDate').onchange({target:$('#viewDate')});await wait(()=>$('#nameSearch'));choose('Alice');await wait(()=>$('.timetable'));assert.equal(full(),prior,'dates in the same immutable baseline render locally');
  open('Timetable');await wait(()=>$('#nameSearch'));noTimetable=true;$('#refresh').click();await wait(()=>$('#content h3')?.textContent==='No current or upcoming timetable for this date'&&!$('#content').inert);assert.equal($('#lastPeriod'),null);noTimetable=false;const readsBefore=count('read');open('Check Availability');await wait(()=>$('#teacherSearch')&&!$('#teacherSearch').disabled);assert.equal(count('read'),readsBefore+1,'missing date source is checked once after the no-timetable profile');
  const search=$('#teacherSearch');search.focus();const list=$('#teacherChoices');assert.equal(list.hidden,false);
  // Label mousedown must not blur and hide options before native checkbox activation.
  const label=$('#teacherChoice0'),down=new w.MouseEvent('mousedown',{bubbles:true,cancelable:true});label.dispatchEvent(down);if(!down.defaultPrevented)search.dispatchEvent(new w.FocusEvent('blur',{relatedTarget:null}));assert.equal(list.hidden,false);
  label.click();await wait(()=>$('#teacherChips [data-staff=alice]')&&$('#timetables').textContent.includes('All selected teachers are free'));assert.match($('#timetables').textContent,/All selected teachers are free/);
  search.value='bOb';search.dispatchEvent(new w.Event('input'));search.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));await wait(()=>$('#teacherChips [data-staff=bob]'));assert.equal(doc.querySelectorAll('.teacher-chip').length,2);
  assert.equal(calls.filter(c=>c.input.operation==='availability').length,1,'complete snapshot is reused for both teacher selections');assert.equal(calls.find(c=>c.input.operation==='availability').input.complete,true);
  $('#teacherChips [data-staff=alice]').click();await wait(()=>doc.querySelectorAll('.teacher-chip').length===1);
  smc=false;$('#refresh').click();await wait(()=>$('#teacherSearch')&&!$('#content').inert);$('#nav [data-page=Home]').click();assert.deepEqual([...doc.querySelectorAll('.priority-functions .function-tile')].map(b=>b.dataset.page),['Report Absence','Manage reported absences','Stapler']);assert.equal($('.function-tile[data-page="WhatsApp Inbox"]'),null);assert.equal($('.function-tile[data-page="Assign Relief"]'),null);
  email='bob@gsps.edu.sg';$('#refresh').click();await wait(()=>$('#account').textContent===email);assert.deepEqual([...doc.querySelectorAll('.priority-functions .function-tile')].map(b=>b.dataset.page),['Report Absence','Manage reported absences','Stapler']);assert.equal($('.function-tile[data-page="WhatsApp Inbox"]'),null);assert.equal(errors.length,0,errors.map(String).join('\n'));
  console.log('PASS Roster speed UI: breadcrumbs, SMC priority, metadata-only blank timetable, explicit name loading, cached projections, stale/retry guards, direct availability and mouse/keyboard multi-select.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
