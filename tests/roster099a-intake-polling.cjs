'use strict';
// 0.9.9a: the all-dates review list on Manage school-wide absences loads,
// renders, polls pending reports every 60 s (15 s on other pages) and stops
// when the page is left.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
 // Controllable clock for the review-list timers only; other timers run normally.
 const timers=[],realSet=w.setTimeout.bind(w);
 w.setTimeout=(fn,delay,...args)=>{if(delay===15000||delay===60000){timers.push({fn,delay,cleared:false});return 'intake-'+(timers.length-1);}return realSet(fn,delay,...args);};
 const realClear=w.clearTimeout.bind(w);w.clearTimeout=id=>{if(typeof id==='string'&&id.startsWith('intake-'))timers[Number(id.slice(7))].cleared=true;else realClear(id);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const today='2026-10-29',q=s=>w.document.querySelector(s),wait=async p=>{for(let i=0;i<300;i++){if(p())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent.slice(0,400));};
 const profile={user:{email:'smc@gsps.edu.sg',staffId:'smc',smc:true,admin:false,accessVerified:true}};
 const pending={requestId:'11111111-1111-4111-8111-111111111111',intakeState:'pending',absenceApplied:false,dates:['2026-11-10'],command:{operation:'saveAbsence',staffId:'t1',date:'2026-11-10',fullDay:true,typeId:'mc'},acceptedAt:today+'T06:00:00+08:00'};
 const intakeReads=[];
 const view=(from,to)=>({revision:1,date:from,from,to,today,user:profile.user,people:[{id:'t1',name:'Teacher One'}],types:[{id:'mc',label:'Medical'}],absences:[],ownAbsences:[]});
 const ctx={profile,today:()=>today,container:q('#content'),status:()=>{},api:async(route,p)=>{
  if(p.operation==='read'&&p.view==='intake'){intakeReads.push(structuredClone(p));return {entries:[structuredClone(pending)],total:1,hasMore:false,user:profile.user};}
  if(p.operation==='read')return view(p.from||p.date||today,p.to||p.date||today);
  return {};
 }};
 const live=()=>timers.filter(t=>!t.cleared);
 await w.RosterOpsUI.render('Absences by Date',ctx);
 await wait(()=>intakeReads.length===1&&q('[data-ops-intake]')&&!q('[data-ops-intake]').hidden);
 assert.deepEqual(intakeReads[0],{operation:'read',view:'intake'},'one undated intake read loads every unresolved report');
 assert.match(q('[data-ops-intake]').textContent,/Reports to resolve · all dates/,'the all-dates review list renders');
 assert.match(q('[data-ops-intake]').textContent,/Teacher One/,'the pending report is listed');
 assert.equal(live().at(-1)?.delay,60000,'a pending report schedules the next check after 60 s on the school-wide page');
 assert.equal(intakeReads.length,1,'no further request before the 60 s timer fires');
 const first=live().at(-1);first.fn();await wait(()=>intakeReads.length===2&&live().some(t=>t!==first));
 assert.equal(live().at(-1).delay,60000,'the next check is again 60 s away');

 // Other pages keep the 15 s cadence.
 await w.RosterOpsUI.render('Manage reported absences',ctx);
 await wait(()=>intakeReads.some(p=>p.scope==='mine'));
 await wait(()=>live().some(t=>t.delay===15000));
 // Leaving the page cancels further work: an old school-wide timer sends nothing.
 const schoolWide=()=>intakeReads.filter(p=>!p.scope).length,before=schoolWide();
 const stale=timers.filter(t=>t.delay===60000).at(-1);stale.fn();await new Promise(r=>setTimeout(r,50));
 assert.equal(schoolWide(),before,'a timer from the left page sends no school-wide request');
 console.log('PASS 0.9.9a school-wide review list renders, polls every 60 s, other pages 15 s, stops after leaving');
 dom.window.close();
})().catch(error=>{console.error(error);process.exit(1);});
