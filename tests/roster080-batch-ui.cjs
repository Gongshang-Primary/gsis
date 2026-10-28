'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
 const requests=[],q=selector=>w.document.querySelector(selector),wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{requests.push(structuredClone(p));const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value.data;}};
 const batches=()=>requests.filter(p=>p.operation==='reliefBatch');
 try{
  await w.RosterOpsUI.render('Assign Relief',ctx);q('[data-manual-select="dora"]').click();const id=O.demand(f.ctx,f.state,f.ctx.today)[0].id;
  O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[id],staffId:'bob',confirm:true});f.state.revision++;
  q('[data-save-online]').click();await wait(()=>q('[data-resolve-batch]'));assert.match(q('[data-draft-status]').textContent,/Not saved/);assert.equal(await w.RosterOpsUI.flushPending(),true,'navigation retains conflicts without a save barrier');
  q('[data-resolve-batch]').click();await wait(()=>q('[data-keep-mine]'));assert.match(q('dialog').textContent,/Originally loaded.*Your change.*Current online/s);assert.match(q('dialog tbody').textContent,/Unassigned.*Dora.*Bob/s);assert.equal(q('[data-apply-retained]').disabled,true,'a genuine conflict needs a value choice');
  q('[data-keep-mine]').click();q('[data-apply-retained]').click();assert.equal(batches().length,1,'resolving is local until explicit Save to online');q('[data-save-online]').click();await wait(()=>q('[data-draft-status]').textContent.startsWith('Saved to online'));assert.equal(batches()[1].baseCells[id].staffId,'bob');assert.equal(w.GSISRosterAllocation.effectiveAssignments(f.state).find(a=>a.demandId===id).staffId,'dora');
  q('[data-clear-assignment]').click();O.apply(f.state,f.ctx,{operation:'setNoRelief',date:f.ctx.today,demandIds:[id],noRelief:true,confirm:true});f.state.revision++;q('[data-save-online]').click();await wait(()=>q('[data-resolve-batch]'));q('[data-resolve-batch]').click();await wait(()=>q('[data-keep-online]'));q('[data-keep-online]').click();q('[data-apply-retained]').click();assert.match(q('[data-relief-period="2"] .ops-day-decision').textContent,/No Relief/);assert.equal(batches().length,3,'Keep online does not issue another mutation');
  // The service transaction limit is visible: one click confirms at most 100 commands.
  for(let i=0;i<101;i++)q('[data-no-relief]').click();assert.equal(batches().length,3,'continuous clicking cannot trigger an automatic save');q('[data-save-online]').click();await wait(()=>batches().length===4&&q('[data-draft-status]').textContent.includes('not saved'));assert.equal(batches()[3].commands.length,100);assert.match(q('[data-draft-status]').textContent,/local change.*not saved/,'remaining commands are never described as saved');q('[data-save-online]').click();await wait(()=>q('[data-draft-status]').textContent.startsWith('Saved to online'));assert.equal(batches()[4].commands.length,1);
  console.log('PASS v0.8.2 cell conflict comparison, Keep mine / Keep online, explicit resolution save and truthful 100-command partial confirmation');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
