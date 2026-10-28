'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const name of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(name,'utf8'));
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});
 const calls=[],q=selector=>w.document.querySelector(selector),sleep=ms=>new Promise(r=>setTimeout(r,ms));let release,hold=false;
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='reliefBatch'&&hold)await new Promise(r=>release=r);const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value.data;}};
 const writes=()=>calls.filter(p=>p.operation==='reliefBatch');
 try{
  await w.RosterOpsUI.render('Assign Relief',ctx);q('[data-manual-select="dora"]').click();await sleep(380);
  assert.equal(writes().length,0,'assigning never starts an automatic save');
  assert.match(q('[data-draft-status]').textContent,/local|not saved/i);assert(q('[data-save-online]'));assert.equal(w.RosterOpsUI.needsLeaveWarning(),false,'durably retained local changes need no leave warning');
  await w.RosterOpsUI.flushPending();assert.equal(writes().length,0,'navigation never flushes local edits');
  q('[data-ops-refresh]').click();await sleep(30);assert.equal(writes().length,0,'refresh retains local edits without saving');assert.match(q('[data-relief-period="2"] .ops-day-decision').textContent,/Dora/);
  q('[data-publish-relief][data-notify-mode="none"]').click();await sleep(0);assert(!calls.some(p=>p.operation==='publish'),'publication never flushes local edits');
  hold=true;q('[data-save-online]').click();await sleep(0);assert.equal(writes().length,1);assert(writes()[0].baseCells,'save includes original cell decisions');
  q('[data-relief-period="2"]').click();q('[data-clear-assignment]').click();assert.equal(q('[data-relief-period="2"] .ops-day-decision').textContent,'Unassigned');hold=false;release();await sleep(50);
  assert.equal(writes().length,1,'edits made during upload remain local');assert.equal(q('[data-relief-period="2"] .ops-day-decision').textContent,'Unassigned');assert.match(q('[data-draft-status]').textContent,/local|not saved/i);
  q('[data-save-online]').click();await sleep(40);assert.equal(writes().length,2);assert.match(q('[data-draft-status]').textContent,/Saved to online/);
  q('[data-manual-select="dora"]').click();f.fail='after-save';q('[data-save-online]').click();await sleep(30);assert.match(q('[data-draft-status]').textContent,/unconfirmed/i);const lost=structuredClone(writes().at(-1));
  w.RosterOpsUI.unmount();w.eval(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));await w.RosterOpsUI.render('Assign Relief',ctx);assert.match(q('[data-draft-status]').textContent,/unconfirmed|recovered/i);q('[data-retry-batch]').click();await sleep(40);assert.deepEqual(writes().at(-1),lost,'recovered uncertain save retries the immutable request');assert(calls.some(p=>p.operation==='receiptStatus'),'uncertain retry checks receipt');
  q('[data-relief-period="2"]').click();q('[data-clear-assignment]').click();const saved=JSON.parse(w.localStorage.getItem('roster-relief-draft:alice@gsps.edu.sg|'+f.ctx.today+':'+w.sessionStorage.getItem('roster-relief-active:alice@gsps.edu.sg|'+f.ctx.today)));assert(saved.base&&saved.base.allocationModel,'draft persists complete baseline context');
  w.RosterOpsUI.unmount();w.eval(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));await w.RosterOpsUI.render('Assign Relief',ctx);assert.equal(q('[data-relief-period="2"] .ops-day-decision').textContent,'Unassigned');assert.equal(writes().length,4,'recovery does not trigger save');
  console.log('PASS v0.8.2 explicit local save, no navigation/refresh/publication autosave, in-flight edits and persistent exact receipt retry');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
