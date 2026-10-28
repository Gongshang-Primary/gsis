'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
(async()=>{
 const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''),dom=new JSDOM(html,{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document,$=q=>doc.querySelector(q),calls=[],gates=new Map(),errors=[];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),year=+today.slice(0,4),timing={startMinutes:420,periodMinutes:30,normalLastPeriod:2};
 const entries=Array.from({length:10},(_,i)=>({id:String(i).padStart(36,'0'),name:'Baseline '+i,from:(year-9+i)+'-01-01',to:(year-9+i)+'-12-31'})),models=new Map(entries.map((entry,i)=>[entry.id,{layoutMode:'single-week',maxPeriod:2,timing,recesses:[],single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:3,blocks:[{name:'Teacher '+i,cells:Array.from({length:15},()=>['EL',String(i+1)+'A','Room '+i,''])}]}}]));
 let email='alice@gsps.edu.sg',ctx,poll,clockOffset=0;
 const reply=data=>({ok:true,status:200,json:async()=>({ok:true,data})}),wait=async predicate=>{for(let n=0;n<200;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+$('#content').textContent);};
 const date=i=>(year-9+i)+'-02-03',entryFor=d=>entries.find(e=>e.from<=d&&e.to>=d),readCalls=()=>calls.filter(c=>c.route==='read'),downloads=()=>readCalls().filter(c=>c.full),open=name=>{if(!$('.function-tile'))$('#nav [data-page="Home"]').click();$('.function-tile[data-page="'+name+'"]').click();},gate=d=>{let release;gates.set(d,new Promise(r=>release=r));return()=>{gates.delete(d);release();};};
 w.confirm=()=>true;w.setInterval=(fn,ms)=>(ms===60000&&(poll=fn),1);w.Date.now=()=>Date.now()+clockOffset;w.HTMLElement.prototype.scrollIntoView=()=>{};w.addEventListener('error',e=>errors.push(e.error));
 vm.runInContext(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),dom.getInternalVMContext());
 w.RosterOpsUI={teacherMultiPicker:w.RosterOpsUI.teacherMultiPicker,pages:()=>[{name:'Read probe',group:'personal'}],render:async(page,value)=>{ctx=value;},unmount(){},resetPreloads(){},preload:async()=>{},isDirty:()=>false};
 w.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),input=JSON.parse(args.body||'{}'),call={route,input};calls.push(call);
  if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};if(route==='session'||route==='logout')return reply({});
  if(route==='profile')return reply({user:{email,staffId:'person',smc:true,admin:false,accessVerified:true},revision:1,entries,active:entries[9],selected:entries[9]});
  if(route==='read'){
   if(gates.has(input.date))await gates.get(input.date);
   const e=entryFor(input.date),model=models.get(e.id);call.full=!input.knownModelIds?.includes(e.id)&&input.view!=='names';
   return reply({revision:1,selected:e,active:e,selection:'current',modelId:e.id,...(input.view==='names'?{names:{teacher:[model.single.blocks[0].name],class:[model.single.blocks[0].cells[0][1]],tg:[]},timing,maxPeriod:2,layoutMode:'single-week'}:call.full?{model:JSON.parse(JSON.stringify(model))}:{modelUnchanged:true}),calendar:{available:true,schoolDay:true,parity:'odd'}});
  }
  if(input.operation==='directory')return reply({people:[{id:'person',name:'Teacher 9'}]});
  if(input.operation==='availability')return reply({complete:true,date:input.date,timetableId:entries[9].id,confirmed:true,people:[{id:'person',name:'Teacher 9',timetableName:'Teacher 9'}],periods:[{period:1,start:'07:30',end:'08:00',available:[]}]});
  throw Error('Unexpected route '+route);
 };
 try{
  for(const file of ['roster-model.js','roster-export.js','roster.js'])vm.runInContext(fs.readFileSync('roster-update/public/'+file,'utf8'),dom.getInternalVMContext());
  await wait(()=>$('.function-tile')&&downloads().length===0);await new Promise(r=>setTimeout(r,0));open('Read probe');await wait(()=>ctx);
  const a=await ctx.readDate(date(0));await ctx.readDate(date(9));const aAgain=await ctx.readDate((year-9)+'-02-04');
  assert.equal(downloads().length,2,'the complete A and B models download once each across B/A/B/A dates');assert.strictEqual(aAgain.model,a.model,'same immutable model object is shared across dated results');assert.deepEqual(aAgain.model,models.get(entries[0].id));
  const releaseC=gate(date(1)),releaseD=gate(date(2)),c=ctx.readDate(date(1)),d=ctx.readDate(date(2));releaseD();await d;
  assert.strictEqual(ctx.readDate(date(1)),c,'another model completing cannot erase a still pending date read');assert.equal(readCalls().filter(c=>c.input.date===date(1)).length,1);releaseC();await c;
  const beforeNames=readCalls().length;open('Timetable');await wait(()=>$('#nameSearch'));$('#viewDate').value=date(0);$('#viewDate').dispatchEvent(new w.Event('change'));await wait(()=>$('#nameSearch')&&!$('#status').textContent);
  assert.equal(readCalls().length,beforeNames,'warm teacher/class/TG names are indexed locally for their own model');$('#nameSearch').value='Teacher 0';$('#nameSearch').dispatchEvent(new w.Event('input'));$('#nameSearch').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));await wait(()=>$('.timetable'));
  assert.match($('#timetables').textContent,/Teacher 0/);assert.doesNotMatch($('#timetables').textContent,/Teacher 9/);assert.equal(readCalls().length,beforeNames,'warm name choice renders the cached timetable without network');
  open('Read probe');await wait(()=>ctx);clockOffset=61000;const checked=await ctx.readDate(date(0));assert.strictEqual(checked.model,a.model);assert.equal(downloads().length,4,'expiry refreshes calendar/register metadata without downloading cached full models');
  assert.equal(readCalls().at(-1).full,false);assert.equal(readCalls().filter(c=>c.input.date===date(0)).length,2,'dated context is rechecked after its 60 second lifetime');
  for(let i=3;i<9;i++)await ctx.readDate(date(i));assert(readCalls().every(c=>(c.input.knownModelIds||[]).length<=8),'memory advertises no more than eight models');const beforeEviction=downloads().length;await ctx.readDate((year)+'-02-05');assert.equal(downloads().length,beforeEviction+1,'least recently remembered model is evicted rather than retained without bound');
  const oldDate=(year-6)+'-02-04',releaseOld=gate(oldDate),oldRead=ctx.readDate(oldDate).catch(e=>e),beforeOwner=downloads().length;email='bob@gsps.edu.sg';await poll();await wait(()=>$('#account').textContent===email&&ctx.profile.user.email===email);await ctx.readDate(date(9));assert.equal(downloads().length,beforeOwner+1);assert.deepEqual(readCalls().at(-1).input.knownModelIds,[],'an owner change discards all prior staff models');releaseOld();assert.equal((await oldRead).stale,true,'a response from the former owner cannot repopulate memory');
  const beforeLogout=downloads().length,beforeProfiles=calls.filter(c=>c.route==='profile').length;$('#logout').click();await wait(()=>$('.function-tile')&&calls.filter(c=>c.route==='profile').length>beforeProfiles&&!$('#content').inert);open('Read probe');await ctx.readDate(date(9));assert.equal(downloads().length,beforeLogout+1);assert.deepEqual(readCalls().at(-1).input.knownModelIds,[],'logout discards the timetable before a later authenticated load');
  open('Check Availability');await wait(()=>$('#teacherSearch')&&!$('#teacherSearch').disabled);$('#teacherSearch').focus();$('#teacherChoices [role=option]').click();await wait(()=>$('.availability-table'));assert.equal(calls.filter(c=>c.input.operation==='availability').length,1,'local immutable timetables do not replace authoritative availability checks');
  for(let i=0;i<w.localStorage.length;i++){const key=w.localStorage.key(i);assert(!/Teacher|cells|Baseline/.test(w.localStorage.getItem(key)),'staff timetable data never enters persistent storage');}
  assert.equal(errors.length,0,errors.map(String).join('\n'));
  console.log('PASS suite memory: full timetable object reused across dates and views; pending date reads coalesce across model completions; local per-model name indexes; fresh dated metadata without full transfers; eight-model bound; owner/logout purge; availability remains server validated; no persistent staff data.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
