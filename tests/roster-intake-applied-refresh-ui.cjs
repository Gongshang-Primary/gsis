'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');

async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,q=selector=>w.document.querySelector(selector),timers=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 const set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w);
 w.setTimeout=(fn,delay,...args)=>{if(delay===15000){const timer={fn,active:true};timers.push(timer);return timer;}return set(fn,delay,...args);};
 w.clearTimeout=id=>{if(timers.includes(id))id.active=false;else clear(id);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');
 f.state.absences.push({id:'existing',date:f.ctx.today,staffId:'alice',name:'Alice Teacher',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
 const entry={requestId:'11111111-1111-4111-8111-111111111111',dates:[f.ctx.today],command:{operation:'saveAbsence',date:f.ctx.today,staffId:'bob',fullDay:true},acceptedAt:f.ctx.iso,intakeState:'pending',transportState:'queued',absenceApplied:false,savedIds:[]},control={reads:0,hold:false,release:null};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{
  if(p.operation==='read'&&p.view==='intake'&&control.denyIntake)throw Object.assign(Error('Access changed'),{status:403});
  if(p.operation==='read'&&p.view==='intake')return {entries:[structuredClone(entry)],total:1,user:f.ctx.user};
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();
  if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});
  if(p.operation==='read'){control.reads++;if(control.hold)await new Promise(resolve=>control.release=resolve);}
  return result.data;
 }};
 const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out: '+w.document.body.textContent.slice(0,600));};
 const s=await w.RosterOpsUI.render('Assign Relief',ctx);await wait(()=>!s.intakeLoading&&!s.reading);
 const apply=()=>{f.state.absences.push({id:'received',date:f.ctx.today,staffId:'bob',name:'Bob Colleague',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});f.state.revision++;Object.assign(entry,{intakeState:'applied',transportState:'applied',absenceApplied:true,savedIds:['received']});};
 const check=async()=>{q('[data-refresh-intake]').click();await wait(()=>!s.intakeLoading);};
 const poll=async()=>{const timer=timers.findLast(t=>t.active);assert(timer,'deferred refresh retains an intake timer');timer.active=false;await timer.fn();};
 return {w,q,f,s,control,wait,apply,check,poll,close(){w.RosterOpsUI.unmount();w.close();}};
}

(async()=>{
 const clean=await setup();try{
  const before=clean.control.reads;clean.apply();await clean.check();await clean.wait(()=>clean.q('[data-absence-card="received"]'));
  assert.equal(clean.control.reads,before+1,'receipt progress refreshes the saved allocation view once');
  await clean.poll();assert.equal(clean.control.reads,before+1,'unchanged applied receipt does not create a refresh loop');
 }finally{clean.close();}
 const busy=await setup();try{
  busy.control.hold=true;busy.q('[data-ops-refresh]').click();await busy.wait(()=>busy.control.release);busy.apply();await busy.check();
  const before=busy.control.reads;assert.equal(busy.q('[data-absence-card="received"]'),null,'existing read remains authoritative until completion');
  busy.control.hold=false;busy.control.release();await busy.wait(()=>!busy.s.reading);await busy.poll();await busy.wait(()=>busy.q('[data-absence-card="received"]'));
  assert.equal(busy.control.reads,before+1,'progress observed during an older read is not lost');
 }finally{busy.close();}
 const local=await setup();try{
  local.q('[data-manual-select="dora"]').click();assert.match(local.q('[data-relief-period="2"] .ops-day-decision').textContent,/Dora/);
  const before=local.control.reads;local.apply();await local.check();await local.poll();
  assert.equal(local.control.reads,before,'receipt recovery cannot replace an unsaved cell draft');
  assert.match(local.q('[data-relief-period="2"] .ops-day-decision').textContent,/Dora/);assert.match(local.q('[data-draft-status]').textContent,/not saved/i);
  local.control.denyIntake=true;await local.poll();assert.equal(local.s.intakeRefreshDate,null,'revoked intake access cancels the deferred refresh');
 }finally{local.close();}
 const editing=await setup();try{
  editing.control.hold=true;editing.apply();await editing.check();await editing.wait(()=>editing.control.release);
  editing.q('[data-manual-select="dora"]').click();
  assert.match(editing.q('[data-relief-period="2"] .ops-day-decision').textContent,/Dora/,'local cell editing remains usable while receipt refresh reads');
  editing.control.hold=false;editing.control.release();await editing.wait(()=>!editing.s.reading&&!editing.s.intakeRefreshRunning);
  assert.match(editing.q('[data-relief-period="2"] .ops-day-decision').textContent,/Dora/,'a cell choice begun during the refresh survives its response');
  assert.match(editing.q('[data-draft-status]').textContent,/not saved/i);
  assert.equal(editing.f.state.assignments.length,0,'receipt refresh does not save the local cell choice');
 }finally{editing.close();}
 const dialog=await setup();try{
  dialog.q('[data-view-entry="existing"]').click();await dialog.wait(()=>dialog.q('dialog[open]'));
  const before=dialog.control.reads;dialog.apply();await dialog.check();await dialog.poll();assert.equal(dialog.control.reads,before,'an open details dialog is not replaced by receipt recovery');
  dialog.q('[data-close-dialog]').click();await dialog.poll();await dialog.wait(()=>dialog.q('[data-absence-card="received"]'));
 }finally{dialog.close();}
 console.log('PASS applied intake refreshes clean Assign Relief once, defers across an older read or dialog, and retains unsaved local cell choices');
})().catch(error=>{console.error(error);process.exitCode=1;});
