'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function fixture({readOnly=false,empty=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const file of ['shared/roster-stapler.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const date='2026-10-26',day={date,id:'baseline',verified:true,schoolDay:true,parity:'even',periods:[{period:0,startMinutes:420,endMinutes:450}],teachers:[{staffId:'alice',name:'Alice',cells:[['EL','4A','Room','']]}],formClasses:[]};
 // Match the server's restricted UI projection: role details stay on the server,
 // while its computed importEligible flag controls which staff can be selected.
 const people=[{id:'alice',name:'Alice',active:true,importEligible:true},{id:'mk',name:'Kindergarten (MK)',active:true,importEligible:false},...(empty?[]:[
  {id:'olivia',name:'Olivia (SENO)',active:true,importEligible:true},{id:'sl',name:'School Leader',active:true,importEligible:true},
  {id:'oso',name:'Operations (OSO)',active:true,importEligible:true},{id:'support',name:'Support Staff',active:false,importEligible:true},
  {id:'relief',name:'External (SRE)',active:false,importEligible:true}
 ])];
 let saved,revision=0;const calls=[],q=s=>doc.querySelector(s),all=s=>[...doc.querySelectorAll(s)];
 const view=()=>({date,plan:saved||w.GSISRosterStapler.create(day),revision,staplerRevision:revision,planningAllowed:!readOnly,canEdit:!readOnly,canConfirm:!readOnly,viewMode:readOnly?'confirmed':'planner',canViewConfirmed:readOnly,people:JSON.parse(JSON.stringify(people)),nameBridges:[],accessRequests:[],venues:[]});
 const ctx={container:q('main'),initialDate:date,today:()=>date,profile:{user:{admin:!readOnly,smc:!readOnly,email:'planner@school.test'}},status(){},api:async(_,p)=>{calls.push(JSON.parse(JSON.stringify(p)));if(p.operation==='stapler')return view();if(p.operation==='saveStapler'){saved=JSON.parse(JSON.stringify(p.plan));revision++;return view();}throw Error(p.operation);}};
 const flush=()=>new Promise(r=>setImmediate(r)),search=value=>{const input=q('dialog [data-teacher-search]');input.value=value;input.dispatchEvent(new w.Event('input'));return input;};
 return {w,doc,q,all,calls,ctx,flush,search,saved:()=>saved,submit:()=>q('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),close:()=>{w.RosterStaplerUI.unmount();dom.window.close();}};
}
(async()=>{
 const f=fixture();try{
  await f.w.RosterStaplerUI.render(f.ctx);f.q('[data-add-teacher]').click();
  assert(f.q('dialog [data-teacher-search]'),'Add teacher provides a partial-text search field');
  const names=()=>f.all('dialog [role=option]').map(n=>n.textContent);
  f.search('');assert.deepEqual(names(),['External (SRE)','Olivia (SENO)','Operations (OSO)','School Leader','Support Staff'],'all eligible active and inactive Contacts are offered, excluding MK and teachers already in the plan');
  f.search('LiV');assert.deepEqual(names(),['Olivia (SENO)'],'case-insensitive name substring matches');
  f.search('sEnO');assert.deepEqual(names(),['Olivia (SENO)'],'partial role suffix can be searched');
  f.search('not-a-person');assert.deepEqual(names(),[]);assert.match(f.q('dialog [role=listbox]').textContent,/No matching teacher/);f.submit();assert(f.q('dialog'),'an unmatched search cannot add a teacher');
  f.search('Olivia (SENO)');f.submit();assert(f.q('dialog'),'typing a name without choosing a result cannot add staff');
  f.q('dialog [role=option]').click();assert.equal(f.q('dialog [data-teacher-select]').value,'olivia');
  f.search('School');f.submit();assert(f.q('dialog'),'editing the query invalidates a previous selection');assert(!f.q('[data-scroll=teacher]').textContent.includes('Olivia (SENO)'),'stale selected ID cannot be submitted');
  const input=f.search('seno');input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));f.submit();
  assert.equal(f.q('dialog'),null);assert(f.q('[data-scroll=teacher]').textContent.includes('Olivia (SENO)'));assert(f.w.RosterStaplerUI.isDirty());assert.deepEqual(f.calls.map(p=>p.operation),['stapler'],'adding a teacher changes only the local draft');
  f.q('[data-add-teacher]').click();f.search('oliv');assert.deepEqual(names(),[],'the same person cannot be added twice');f.q('[data-dialog-close]').click();
  for(const name of ['School Leader','Operations (OSO)','Support Staff','External (SRE)']){f.q('[data-add-teacher]').click();f.search(name);f.q('dialog [role=option]').click();f.submit();}
  f.q('[data-save]').click();await f.flush();assert.deepEqual(f.saved().teachers.map(t=>t.staffId),['alice','olivia','sl','oso','support','relief'],'Save to online includes every selected canonical staff ID');
  f.w.RosterStaplerUI.unmount();await f.w.RosterStaplerUI.render(f.ctx);assert(f.q('[data-scroll=teacher]').textContent.includes('Olivia (SENO)'),'saved addition survives reopening');
  assert.equal(f.calls.filter(p=>p.operation==='saveStapler').length,1);assert(!f.calls.some(p=>/confirm|publish|contactCreate/i.test(p.operation)),'adding existing staff does not confirm, publish or create a new contact');
 }finally{f.close();}
 const empty=fixture({empty:true});try{await empty.w.RosterStaplerUI.render(empty.ctx);empty.q('[data-add-teacher]').click();assert(empty.q('dialog [data-teacher-search]').disabled);assert(empty.q('dialog button[type=submit]').disabled);assert.match(empty.q('dialog').textContent,/No other eligible Contacts staff/);}finally{empty.close();}
 const readOnly=fixture({readOnly:true});try{await readOnly.w.RosterStaplerUI.render(readOnly.ctx);const button=readOnly.q('[data-add-teacher]');assert(!button||button.disabled||button.hidden,'read-only plans cannot add teachers');button?.click();assert.equal(readOnly.q('dialog'),null);}finally{readOnly.close();}
 console.log('PASS STAPLER Add teacher: all eligible staff, MK/duplicate exclusion, partial search, explicit choice, stale-choice protection, local edit, save/reopen and read-only guard.');
})().catch(error=>{console.error(error);process.exitCode=1;});
