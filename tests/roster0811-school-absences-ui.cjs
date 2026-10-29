'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const today='2026-10-14',tomorrow='2026-10-15',past='2026-10-13',requests=[],confirmations=[],q=selector=>w.document.querySelector(selector),wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 let rows=[{id:'past',date:past,name:'Past teacher'},...Array.from({length:36},(_,i)=>({id:'a'+i,date:i<18?today:tomorrow,name:'Teacher '+i}))].map(a=>({...a,staffId:a.id,typeId:'mc',typeLabel:'Medical',periods:[1],reliefRequired:true,reportedAt:today+'T07:00:00+08:00',absenceToken:'token-'+a.id})),approved=false,loseReceipt=false,holdReads=false;const held=[];
 const receipts=new Map(),profile={user:{email:'smc@gsps.edu.sg',staffId:'smc',smc:true,admin:false}},view=(from,to)=>({revision:1,date:from,from,to,today,user:profile.user,people:[],types:[{id:'mc',label:'Medical'}],absences:rows.filter(a=>a.date>=from&&a.date<=to),ownAbsences:[]});
 w.confirm=message=>{confirmations.push(message);return approved;};
 const ctx={profile,today:()=>today,container:q('#content'),api:async(route,p)=>{/* 0.9.9a: the all-dates review list is a separate intake read. */if(p.view!=='intake')requests.push(structuredClone(p));if(p.operation==='read'){const data=view(p.from||p.date,p.to||p.date);if(holdReads&&p.view!=='intake')await new Promise(resolve=>held.push(resolve));return data;}if(p.operation==='deleteAbsences'){if(receipts.has(p.requestId))return receipts.get(p.requestId);rows=rows.filter(a=>!p.ids.includes(a.id));const result={...view(p.viewFrom,p.viewTo),savedIds:p.ids,affectedDates:p.dates};receipts.set(p.requestId,result);if(loseReceipt){loseReceipt=false;throw Object.assign(Error('Confirmation lost'),{status:503});}return result;}throw Error('Unexpected '+p.operation);}};
 const submitRange=async(from,to)=>{q('[data-absence-from]').value=from;q('[data-absence-to]').value=to;q('[data-absence-range]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!q('#content').getAttribute('aria-busy')||q('#content').getAttribute('aria-busy')==='false');};
 try{
  const state=await w.RosterOpsUI.render('Absences by Date',ctx);
  assert(q('[data-absence-from]'),'school-wide page has an inclusive start/end range');assert.equal(q('[data-absence-from]').value,today);assert.equal(q('[data-absence-to]').value,tomorrow);
  assert.deepEqual(requests.map(p=>[p.operation,p.view,p.from,p.to]),[['read','schoolAbsences',today,tomorrow]],'one range read serves both dates');assert.match(q('[data-table-count]').textContent,/36 entries/);assert.equal(w.document.querySelectorAll('[data-select-entry]').length,36);
  q('[data-select-matching]').click();assert.equal(q('[data-selected-count]').textContent,'36 selected');q('[data-delete-selected]').click();assert.equal(requests.length,1,'cancelled confirmation sends no deletion');
  await submitRange(past,tomorrow);await wait(()=>q('[data-table-count]').textContent.includes('37 entries'));assert.equal(q('[data-selected-count]').textContent,'0 selected');assert.equal(q('[data-select-entry="past"]').disabled,true);
  q('[data-select-matching]').click();assert.equal(q('[data-selected-count]').textContent,'36 selected','past entries remain read only');
  const before=requests.length;await submitRange(tomorrow,past);assert.equal(requests.length,before,'invalid range never reaches server');assert.match(q('[data-absence-range-error]').textContent,/end date/i);
  await submitRange(today,tomorrow);await wait(()=>q('[data-table-count]').textContent.includes('36 entries'));q('[data-select-matching]').click();approved=true;loseReceipt=true;q('[data-delete-selected]').click();await wait(()=>q('[data-retry-save]'));
  const first=requests.find(p=>p.operation==='deleteAbsences');assert.equal(first.ids.length,36);assert.equal(first.expectedAbsenceTokens.a35,'token-a35');assert.deepEqual([...first.dates].sort(),[today,tomorrow]);assert.equal(first.viewFrom,today);assert.equal(first.viewTo,tomorrow);assert.equal(first.from,undefined,'view range never becomes an absence mutation range');
  q('[data-retry-save]').click();await wait(()=>q('[data-table-count]')?.textContent==='0 entries');assert.deepEqual(requests.filter(p=>p.operation==='deleteAbsences')[1],first,'uncertain deletion retries the exact IDs, tokens and request ID');assert.equal(q('[data-absence-to]').value,tomorrow);
  holdReads=true;q('[data-absence-to]').value='2026-10-16';q('[data-absence-range]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>held.length===1);
  holdReads=false;await submitRange(today,tomorrow);held.shift()();await new Promise(r=>setTimeout(r,10));assert.equal(state.data.to,tomorrow,'late response from a different end date cannot replace the selected range');
  console.log('PASS school-wide inclusive range, one lean read, all-page bulk selection, past protection, invalid range, confirmation and exact delete retry.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
