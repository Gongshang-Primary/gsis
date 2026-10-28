'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});
 let latest=O.view(f.state,f.ctx,{view:'allocation',date:f.ctx.today});latest.people.push({id:'carol',name:'Carol'});const [first,second]=latest.demands,copy=v=>structuredClone(v),empty={staffId:null,noRelief:false,combination:false,manual:false,cleared:false},decision=id=>({...empty,staffId:id,manual:true});latest.cellStates={[first.id]:empty,[second.id]:empty};const calls=[],q=s=>w.document.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,15));
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{calls.push(copy(p));if(p.operation==='read')return copy(latest);if(p.operation==='reliefBatch')throw Object.assign(Error('Another SMC changed a lesson'),{status:409,code:'CELL_CONFLICT',conflicts:[{demandId:first.id,base:empty,current:decision('bob'),local:decision('dora')}]});throw Error('Unexpected operation');}};
 try{
  await w.RosterOpsUI.render('Assign Relief',ctx);q('[data-manual-select="dora"]').click();q('[data-relief-period="3"]').click();q('[data-manual-select="dora"]').click();q('[data-save-online]').click();await tick();
  // Another SMC changes both the original conflict and an originally non-conflicting cell before Compare opens.
  latest=copy(latest);latest.cellStates[first.id]=decision('carol');latest.cellStates[second.id]=decision('bob');latest.revision++;
  q('[data-resolve-batch]').click();await tick();const rows=[...w.document.querySelectorAll('[data-conflict-cell]')];assert.equal(rows.length,2,'refresh discovers new genuine conflicts beyond those in the earlier error');assert.match(rows[0].cells[3].textContent,/Carol/,'Current online comes from the fresh comparison read, not the stale failed-save error');
  for(const button of w.document.querySelectorAll('[data-keep-mine]'))button.click();q('[data-apply-retained]').click();assert.equal(calls.filter(p=>p.operation==='reliefBatch').length,1,'comparison keeps changes local');q('[data-save-online]').click();await tick();const saved=calls.filter(p=>p.operation==='reliefBatch').at(-1);assert.equal(saved.baseCells[first.id].staffId,'carol');assert.equal(saved.baseCells[second.id].staffId,'bob');console.log('PASS fresh three-way comparison discovers later conflicts and never silently rebases unseen online changes');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
