'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
async function planner(hour='09:00',period=6,existing=false){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T'+hour+':00+08:00');f.state.accountingYears['2026']={verified:true};f.day.teachers[0].cells[period]=['EL','4A','C1-01',''];O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[period]});
 if(existing){const d=O.demand(f.ctx,f.state,f.ctx.today)[0];O.apply(f.state,f.ctx,{operation:'assign',date:f.ctx.today,demandIds:[d.id],staffId:'dora'});Object.assign(f.state.assignments[0],{origin:'automatic',protected:false});delete f.state.manualDecisions[f.ctx.today+'|'+d.id];}
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.getElementById('content'),status(){},api:async(route,p)=>{calls.push(structuredClone(p));if(O.READS.includes(p.operation))return O.read(f.state,f.ctx,p);const next=structuredClone(f.state),result=O.apply(next,f.ctx,p);next.revision++;f.state=next;return {...O.view(next,f.ctx,p),...result};}};
 await w.RosterOpsUI.render('Assign Relief',ctx);return {w,f,calls,query:s=>w.document.querySelector(s)};
}
async function until(check){for(let i=0;i<50;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected UI state did not settle');}
test('both manual buttons remain available morning and afternoon for unstarted lessons',async()=>{
 for(const [hour,period]of [['09:00',6],['14:00',16]]){const h=await planner(hour,period);try{for(const selector of ['[data-auto-allocate]','[data-auto-fill-blanks]'])assert.equal(h.query(selector).disabled,false);assert.doesNotMatch(h.query('.ops-allocation-hint').textContent,/06:29|previous day/);h.query('[data-auto-allocate]').click();await until(()=>h.calls.some(p=>p.operation==='autoAllocate'));assert.equal(h.calls.find(p=>p.operation==='autoAllocate').allocationMode,'reoptimise');}finally{h.w.close();}}
});
test('started-only blanks and started-only automatic drafts do not advertise available automatic work',async()=>{
 for(const existing of [false,true]){const h=await planner('09:00',3,existing);try{assert.equal(h.query('[data-auto-allocate]').disabled,true);assert.equal(h.query('[data-auto-fill-blanks]').disabled,true);assert.match(h.query('[data-auto-allocate]').title,/unstarted/);}finally{h.w.close();}}
});
test('an unstarted automatic draft can be reoptimised daytime even with no blanks',async()=>{
 const h=await planner('09:00',6,true);try{assert.equal(h.query('[data-auto-allocate]').disabled,false);assert.equal(h.query('[data-auto-fill-blanks]').disabled,true);}finally{h.w.close();}
});
