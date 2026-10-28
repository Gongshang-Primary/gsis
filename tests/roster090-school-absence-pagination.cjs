'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const today='2026-10-14',tomorrow='2026-10-15',past='2026-10-13',requests=[],q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)];
 let rows=[{id:'past',date:past,name:'Past teacher'},...Array.from({length:251},(_,i)=>({id:'a'+i,date:i<130?today:tomorrow,name:'Teacher '+String(i).padStart(3,'0')}))].map(a=>({...a,staffId:a.id,typeId:'mc',typeLabel:'Medical',periods:[1],reliefRequired:true,reportedAt:today+'T07:00:00+08:00',absenceToken:'token-'+a.id}));
 const profile={user:{email:'smc@gsps.edu.sg',staffId:'smc',smc:true,admin:false}},view=(from,to)=>({revision:1,date:from,from,to,today,user:profile.user,people:[],types:[{id:'mc',label:'Medical'}],absences:rows.filter(a=>a.date>=from&&a.date<=to),ownAbsences:[]});
 const ctx={profile,today:()=>today,container:q('#content'),api:async(route,p)=>{requests.push(structuredClone(p));if(p.operation==='read')return view(p.from||p.date,p.to||p.date);if(p.operation==='deleteAbsences'){rows=rows.filter(a=>!p.ids.includes(a.id));return {...view(p.viewFrom,p.viewTo),savedIds:p.ids,affectedDates:p.dates};}throw Error('Unexpected '+p.operation);}};
 const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const chooseSize=size=>{const input=q('[data-table-page-size]');input.value=String(size);input.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const ids=()=>all('[data-select-entry]').map(el=>el.dataset.selectEntry),search=text=>{q('[data-table-search]').value=text;q('[data-table-search]').dispatchEvent(new w.Event('input',{bubbles:true}));};
 const range=async(from,to)=>{q('[data-absence-from]').value=from;q('[data-absence-to]').value=to;q('[data-absence-range]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>q('#content').getAttribute('aria-busy')==='false');};
 try{
  await w.RosterOpsUI.render('Absences by Date',ctx);
  assert(q('[data-table-page-size]'),'school-wide absence table offers page size');
  assert.deepEqual(all('[data-table-page-size] option').map(el=>Number(el.value)),[50,100,150,200]);
  assert.equal(q('[data-table-page-size]').value,'50');assert.equal(ids().length,50);assert.equal(requests.length,1);assert.match(q('[data-table-count]').textContent,/Showing 1 to 50 of 251 entries/);
  for(const size of [50,100,150,200]){
   chooseSize(size);const seen=[];let page=0;
   do{assert.equal(ids().length,Math.min(size,251-page*size));seen.push(...ids());page++;if(q('[data-table-next]').disabled)break;q('[data-table-next]').click();}while(page<10);
   assert.equal(seen.length,251);assert.equal(new Set(seen).size,251);assert.equal(q('[data-table-next]').disabled,true);
   assert.equal(q('[data-table-page]').textContent.trim(),page+' / '+page);q('[data-table-prev]').click();assert.equal(q('[data-table-page]').textContent.trim(),(page-1)+' / '+page);
  }
  assert.equal(requests.length,1,'page size and navigation reuse the complete range read');
  search('Teacher 1');q('[data-sort="name"]').click();q('[data-sort="name"]').click();chooseSize(50);assert.equal(ids()[0],'a199');assert.equal(ids().length,50);assert.equal(q('[data-table-search]').value,'Teacher 1');assert.equal(q('[data-sort="name"]').closest('th').getAttribute('aria-sort'),'descending');
  q('[data-select-matching]').click();assert.equal(q('[data-selected-count]').textContent,'100 selected');q('[data-table-next]').click();chooseSize(100);assert.equal(ids()[0],'a199');assert.equal(ids().length,100);assert.equal(q('[data-table-page]').textContent.trim(),'1 / 1');assert.equal(q('[data-selected-count]').textContent,'100 selected','changing page size keeps all matching selections');
  search('');assert.equal(q('[data-selected-count]').textContent,'0 selected','existing search-change selection reset is retained');
  chooseSize(200);await range(past,tomorrow);assert.equal(q('[data-table-page-size]').value,'200');assert.equal(ids().length,200);assert.match(q('[data-table-count]').textContent,/252 entries/);
  q('[data-sort="date"]').click();assert.equal(q('[data-select-entry="past"]').disabled,true);q('[data-select-matching]').click();assert.equal(q('[data-selected-count]').textContent,'251 selected','past rows remain excluded across every page');
  chooseSize(50);q('[data-table-next]').click();q('[data-delete-selected]').click();await wait(()=>requests.some(p=>p.operation==='deleteAbsences')&&q('[data-table-count]').textContent.includes('1 entries'));
  const deletion=requests.find(p=>p.operation==='deleteAbsences');assert.equal(deletion.ids.length,251);assert.equal(new Set(deletion.ids).size,251);assert(!deletion.ids.includes('past'));assert.equal(deletion.expectedAbsenceTokens.a250,'token-a250');assert.deepEqual([...deletion.dates].sort(),[today,tomorrow]);assert.equal(deletion.viewFrom,past);assert.equal(deletion.viewTo,tomorrow);assert.equal(q('[data-table-page]').textContent.trim(),'1 / 1','deletion clamps page after rows shrink');assert.equal(q('[data-table-page-size]').value,'50');
  await range(today,today);assert.equal(q('[data-table-count]').textContent,'0 entries');assert.equal(q('[data-table-page-size]').value,'50');assert.equal(q('[data-table-prev]').disabled,true);assert.equal(q('[data-table-next]').disabled,true);
  assert.equal(requests.filter(p=>p.operation==='read').length,3,'only date-range changes make additional reads');
  rows=Array.from({length:20},(_,i)=>({id:'own'+i,date:today,staffId:'smc',name:'Duty SMC',typeId:'mc',typeLabel:'Medical',periods:[1],reliefRequired:true,reportedAt:today+'T07:00:00+08:00'}));
  await w.RosterOpsUI.render('Manage reported absences',ctx);assert.equal(q('[data-table-page-size]'),null,'other tables keep their existing controls');assert.equal(ids().length,15,'personal absence table keeps its existing page size');
  console.log('PASS school-wide absence pagination: 50/100/150/200, complete 251-row paging, retained sort/filter/selection, range reset, past protection and all-page deletion.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
