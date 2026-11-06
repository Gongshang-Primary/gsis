'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
(async()=>{
 const f=fixture(),plan=S.create({...f.ctx.days[f.date],date:f.date});f.O.staplerApply(f.state,f.ctx,{operation:'saveStapler',date:f.date,staplerRevision:0,plan});
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.example.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,go=[];w.structuredClone=structuredClone;w.confirm=()=>true;
 for(const file of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const context={container:w.document.getElementById('content'),profile:{user:f.ctx.user},today:()=>f.date,initialDate:f.date,status(){},go:(...args)=>go.push(args),api:async(route,p)=>route==='quiet-mode'?{}:f.O.read(f.state,f.O.composeStaplerContext(f.state,f.ctx),p)};
 try{
  await w.RosterOpsUI.render('Assign Relief',context);assert.match(w.document.querySelector('[data-timetable-source]').textContent,/Baseline baseline/);assert.match(w.document.querySelector('[data-stapler-unconfirmed]').textContent,/allocation uses the baseline until you confirm/);w.document.querySelector('[data-open-stapler]').click();assert.deepEqual(go,[['Stapler',f.date]]);
  w.RosterOpsUI.resetPreloads();f.O.staplerApply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
  await w.RosterOpsUI.render('Daily Notify',context);assert.match(w.document.querySelector('[data-timetable-source]').textContent,/Timetable: Stapler plan rev 1 \(confirmed 08:00\)/);assert.equal(w.document.querySelector('[data-stapler-unconfirmed]'),null);
  console.log('PASS actual Assign Relief and Daily Notify source labels, never-confirmed banner and dated confirmation shortcut');
 }finally{w.RosterOpsUI.unmount();w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
