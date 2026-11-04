/* Exercises the production shell with delayed reads, baseline replacement and logout. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/index.html','utf8'),{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q),calls=[],errors=[];
 const timing={startMinutes:420,periodMinutes:30,normalLastPeriod:2},people=[{id:'alice',name:'Alice Teacher',timetableName:'Alice Teacher'},{id:'bob',name:'Bob Colleague',timetableName:'Bob Colleague'}];
 let baseline='first',owner='alice@gsps.edu.sg',smc=true,authenticated=true,login,context,weekIndexes=0,failNames=false,clock=Date.parse('2026-10-14T06:00:00+08:00'),parity='odd';
 let releaseDirectory,gateDirectory=true;const initialDirectory=new Promise(resolve=>releaseDirectory=resolve);
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 const directoryPeople=date=>date==='2026-10-18'?[...people,{id:'external',name:'External Relief'}]:people;
 const entry=()=>({id:baseline,name:'School '+baseline,from:'2020-01-01',to:'2099-12-31'}),metadata=()=>({revision:1,active:entry(),selected:entry(),selection:'current',modelId:baseline,timing,maxPeriod:2,layoutMode:'single-week'});
 // Keep this shell/cache fixture's full models on demand. The Home status uses
 // a separate verified batch projection, with no model or extra API read.
 w.RosterTimetablePreload={create:()=>({start(){},clear(){},invalidate(){},isDue:()=>false,snapshot:()=>({phase:'ready'}),getBaseline:()=>({entry:entry()}),getPlan:()=>null,getTimetableStatus:()=>null})};
 const model=()=>({layoutMode:'single-week',maxPeriod:2,timing,recesses:[],single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,blocks:people.map(p=>({name:p.name,cells:Array.from({length:15},()=>['EL',baseline==='first'?'1A':'2B','C1-01',''])}))}});
 const gates=[];function gate(){let release;gates.push(new Promise(r=>release=r));return release;}
 const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})}),unauthorised=()=>({ok:false,status:401,json:async()=>({ok:false,error:'Sign in required'})});
 w.confirm=()=>true;w.setInterval=()=>1;w.HTMLElement.prototype.scrollIntoView=()=>{};w.addEventListener('error',e=>errors.push(e.error));
 w.google={accounts:{id:{initialize:config=>login=config.callback,renderButton:()=>{}}}};
 vm.runInContext(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),dom.getInternalVMContext());
 w.RosterOpsUI={teacherMultiPicker:w.RosterOpsUI.teacherMultiPicker,pages:()=>[['Report Absence','personal'],['Manage reported absences','personal'],['Assign Relief','main',true],['My Relief Duties','main']].map(([name,group,onlySMC])=>({name,group,smc:!!onlySMC,icon:'absence-report',description:name})),unmount(){},resetPreloads(){},preload:async()=>{},isDirty:()=>false,render:async(name,ctx)=>{context=ctx;ctx.container.innerHTML='<h2>'+name+'</h2>';}};
 w.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),input=JSON.parse(args.body||'{}');calls.push({route,input});
  if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};
  if(route==='logout'){authenticated=false;return reply({});}
  if(route==='session'){if(args.method==='POST')authenticated=true;return authenticated?reply({}):unauthorised();}
  if(route==='profile')return reply({user:{email:owner,staffId:'alice',smc,admin:false,accessVerified:true},...metadata(),entries:smc?[entry()]:undefined});
  if(route==='read'){
   const state=metadata(),full=model();
   if(input.view==='names'){if(failNames)throw Error('Names must come from memory');return reply({...state,names:{teacher:people.map(p=>p.name),class:[baseline==='first'?'1A':'2B'],tg:[]}});}
   if(gates.length)await gates.shift();
   return reply({...state,...(input.knownModelIds?.includes(state.modelId)?{modelUnchanged:true}:{model:full}),calendar:{available:true,schoolDay:true,parity}});
  }
  if(route==='operations'&&input.operation==='directory'){if(gateDirectory){await initialDirectory;gateDirectory=false;}return reply({people:directoryPeople(input.date)});}
  if(route==='operations'&&input.operation==='availability'){
   if(gates.length)await gates.shift();
   const currentPeople=directoryPeople(input.date);return reply({complete:true,date:input.date,timetableId:baseline,confirmed:true,people:currentPeople,periods:[{period:1,start:'07:30',end:'08:00',available:currentPeople}]});
  }
  throw Error('Unexpected route '+route);
 };
 const run=file=>vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const wait=async fn=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timeout: '+$('#content').textContent+' / '+$('#status').textContent);};
 const open=name=>{if(!$('.function-tile'))$('#nav [data-page=Home]').click();$('.function-tile[data-page="'+name+'"]').click();};
 const fullCalls=()=>calls.filter(c=>c.route==='read'&&c.input.view!=='names');
 const choose=(selector,text)=>{const input=$(selector);input.value=text;input.dispatchEvent(new w.Event('input'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));};
 try{
  run('roster-update/public/roster-model.js');const weeks=w.GSISRoster.weeks;w.GSISRoster.weeks=(...args)=>(weekIndexes++,weeks(...args));run('roster-update/public/roster-export.js');
  const warm=gate();run('roster-update/public/roster.js');await wait(()=>$('.function-tile')&&fullCalls().length===0&&!$('#content').inert);
  assert.equal(calls.filter(c=>c.input.operation==='directory').length,0,'Home does not duplicate cached timetable names with a directory read');assert.equal(calls.filter(c=>c.input.operation==='availability').length,0);
  assert.deepEqual([...doc.querySelectorAll('.priority-functions .function-tile')].map(el=>el.dataset.page),['Report Absence','Manage reported absences','Assign Relief','Stapler','WhatsApp Inbox']);assert.equal(doc.querySelectorAll('.function-divider').length,1);assert.equal($('#nav').parentElement,$('#status').parentElement);
  open('Timetable');await wait(()=>fullCalls().length===1);assert.equal($('#nameSearch'),null,'cold names wait for the one on-demand model fetch');assert.equal(fullCalls().length,1);warm();await wait(()=>$('#nameSearch'));assert.equal($('.timetable'),null,'background loading must not choose a teacher');assert.equal($('#nameSearch').value,'');
  const available=gate();open('Check Availability');await wait(()=>$('#teacherSearch')&&!$('#teacherSearch').disabled);assert.equal(calls.filter(c=>c.input.operation==='directory').length,0);assert.equal(calls.filter(c=>c.input.operation==='availability').length,1,'one complete overlay starts independently of selected names');
  choose('#teacherSearch','Alice');await wait(()=>$('.teacher-chip'));assert.equal($('#teacherSearch').disabled,false,'name picker remains usable during result computation');assert.match($('#timetables').textContent,/Baseline preview only/);
  choose('#teacherSearch','Bob');await wait(()=>doc.querySelectorAll('.teacher-chip').length===2);assert.equal(calls.filter(c=>c.input.operation==='availability').length,1,'selection shares the pending complete snapshot');available();await wait(()=>$('#timetables').textContent.includes('All selected teachers are free'));await new Promise(r=>setTimeout(r,10));
  $('#viewDate').value='2026-10-18';$('#viewDate').onchange({target:$('#viewDate')});await wait(()=>$('#teacherChoices').textContent.includes('External'));choose('#teacherSearch','External');await wait(()=>$('.teacher-chip[data-staff=external]'));assert.equal(calls.filter(c=>c.input.operation==='availability').at(-1).input.date,'2026-10-18','complete snapshot is scoped to the selected date, including activated external teachers');
  $('#viewDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new w.Date());$('#viewDate').onchange({target:$('#viewDate')});await wait(()=>$('#teacherSearch')&&!$('#teacherSearch').disabled);
  const indexMark=weekIndexes;failNames=true;
  const namesBefore=calls.filter(c=>c.input.view==='names').length;open('Timetable');await wait(()=>$('#nameSearch'));assert.equal($('.timetable'),null);assert.equal(calls.filter(c=>c.input.view==='names').length,namesBefore,'warmed baseline supplies names without network');choose('#nameSearch','Alice');assert.match($('#timetables').textContent,/1A/);assert.equal(fullCalls().length,1);
  $('[data-timetable=class]').click();choose('#nameSearch','1A');assert.ok($('.timetable'));assert.equal(weekIndexes,indexMark,'switching projections retains cached model identity');
  open('Report Absence');await wait(()=>context);const date='2026-10-16',same=await context.readDate(date),sameAgain=await context.readDate(date);assert.equal(same.model,sameAgain.model);assert.deepEqual(fullCalls().at(-1).input.knownModelIds,['first']);assert.equal(weekIndexes,indexMark);
  clock+=60001;parity='even';const beforeCalendar=fullCalls().length,[fresh,concurrent]=await Promise.all([context.readDate(date),context.readDate(date)]);assert.equal(fullCalls().length,beforeCalendar+1,'dated Calendar context refreshes once for concurrent readers after one minute');assert.equal(fresh,concurrent);assert.equal(fresh.calendar.parity,'even');assert.equal(fresh.model,same.model,'Calendar refresh retains the canonical immutable baseline');assert.deepEqual(fullCalls().at(-1).input.knownModelIds,['first']);await context.readDate(date);assert.equal(fullCalls().length,beforeCalendar+1,'repeated renderers share the fresh dated context');assert.equal(weekIndexes,indexMark,'Calendar changes do not rebuild timetable indexes');
  baseline='second';const profilesBefore=calls.filter(c=>c.route==='profile').length,readsBeforeRefresh=fullCalls().length;$('#nav [data-page=Home]').click();$('#refresh').click();await wait(()=>calls.filter(c=>c.route==='profile').length===profilesBefore+1&&!$('#content').inert);assert.equal($('[data-home-timetable]').textContent,'No suspended timetable today Wed, 14 Oct 2026');assert.equal(fullCalls().length,readsBeforeRefresh,'Home metadata refresh does not fetch another full baseline');open('Timetable');await wait(()=>$('#nameSearch'));choose('#nameSearch','Alice');await wait(()=>$('#timetables').textContent.includes('2B'));assert.equal(weekIndexes,indexMark+1,'new baseline replaces the index');
  open('Report Absence');const newModel=(await context.readDate('2026-10-17')).model;assert.notEqual(newModel,same.model);assert.deepEqual(fullCalls().at(-1).input.knownModelIds,['first','second'],'immutable baselines remain available when switching validity dates');
  $('#logout').click();await wait(()=>$('#nav').hidden&&login);assert.equal($('.timetable'),null);owner='bob@gsps.edu.sg';smc=false;const beforeLogin=fullCalls().length;await login({credential:'test'});await wait(()=>context.profile.user.email===owner);assert.equal(w.location.hash,'#reportAbsence','the own-absence route survives sign-in');await context.readDate('2026-10-17');assert.ok(fullCalls().length>beforeLogin);assert.deepEqual(fullCalls().at(-1).input.knownModelIds,[],'logout discards the prior session baseline');$('#nav [data-page=Home]').click();await wait(()=>$('.function-tile'));assert.equal($('.smc-functions'),null);assert.equal(doc.querySelectorAll('.function-divider').length,1);assert.equal(errors.length,0,errors.map(String).join('\n'));
  console.log('PASS 0.7.02 shell: exact primary row, one divider, shared status/breadcrumb row, no unused Home warmup, independent names, single baseline/index reuse, replacement and logout.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
