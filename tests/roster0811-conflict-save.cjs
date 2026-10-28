'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
 const requests=[],q=s=>w.document.querySelector(s),wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 let readGate;
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{requests.push(structuredClone(p));if(p.operation==='read'&&readGate)await readGate;const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status,code:response.status===409?'CELL_CONFLICT':undefined});if(value.data.cellStates)value.data.cellProvenance=O.cellProvenance(f.state,f.ctx,f.ctx.today,Object.keys(value.data.cellStates));return value.data;}};
 const batches=()=>requests.filter(p=>p.operation==='reliefBatch');
 try{
  await w.RosterOpsUI.render('Assign Relief',ctx);q('[data-manual-select="dora"]').click();const id=O.demand(f.ctx,f.state,f.ctx.today)[0].id;
  const online=staffId=>{const user=f.ctx.user;f.ctx.user={...user,staffId:'bob',email:'bob@gsps.edu.sg'};O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[id],staffId,confirm:true});f.ctx.user=user;f.state.revision++;};online('bob');
  q('[data-save-online]').click();await wait(()=>q('[data-resolve-batch]'));
  let releaseRead;readGate=new Promise(resolve=>releaseRead=resolve);const reads=requests.filter(p=>p.operation==='read').length;q('[data-resolve-batch]').click();q('[data-resolve-batch]').click();assert.equal(requests.filter(p=>p.operation==='read').length-reads,1,'overlapping comparison clicks share one current read');readGate=null;releaseRead();await wait(()=>q('[data-keep-mine]'));
  assert(q('[data-save-retained]'),'comparison offers explicit Save these choices');assert.equal(q('[data-save-retained]').disabled,true);
  q('[data-keep-mine]').click();assert.equal(q('[data-save-retained]').disabled,false);assert.equal(batches().length,1,'choosing values never saves automatically');
  q('[data-save-retained]').click();await wait(()=>q('[data-draft-status]').textContent.startsWith('Saved to online'));assert.equal(batches().length,2);assert.equal(batches()[1].baseCells[id].staffId,'bob');assert.equal(w.GSISRosterAllocation.effectiveAssignments(f.state).find(a=>a.demandId===id).staffId,'dora');
  q('[data-clear-assignment]').click();online('bob');online('dora');q('[data-save-online]').click();await wait(()=>q('[data-resolve-batch]'));q('[data-resolve-batch]').click();await wait(()=>q('[data-keep-mine]'));assert.match(q('dialog').textContent,/Bob Colleague|bob@gsps.edu.sg/,'ABA conflict identifies the current editor even when visible allocation returns to original');assert.equal(q('[data-save-retained]').disabled,true,'ABA token change requires an explicit choice');q('[data-keep-mine]').click();online('bob');q('[data-save-retained]').click();await wait(()=>q('[data-resolve-batch]'));
  assert.match(q('[data-draft-status]').textContent,/Not saved/,'a newer same-cell edit remains a conflict');assert.equal(w.GSISRosterAllocation.effectiveAssignments(f.state).find(a=>a.demandId===id).staffId,'bob');
  q('[data-resolve-batch]').click();await wait(()=>q('[data-keep-online]'));const before=batches().length;q('[data-keep-online]').click();q('[data-save-retained]').click();await wait(()=>q('[data-draft-status]').textContent.startsWith('Saved to online'));assert.equal(batches().length,before+1,'keeping latest records an explicit audited choice');assert.equal(batches().at(-1).cellResolutions[id].choice,'keepOnline');
  assert.equal(requests.some(p=>['publish','notifyDaily'].includes(p.operation)),false);
  console.log('PASS explicit compare-and-save, retained row tokens, renewed conflicts, online-only choice and no implicit publication.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
