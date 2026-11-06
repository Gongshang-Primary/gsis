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

 const live=()=>timers.filter(t=>!t.cleared),go=[];ctx.go=(...args)=>go.push(args);
 Object.assign(pending,{intakeState:'pending',transportState:'needsReview',reasonCode:'BACKEND_REJECTED_409',message:'You already have an absence for P5, P6 on 2026-11-10 (Work review). SMC will review.'});
 const ordinary=ctx.api,decisions=[];ctx.api=async(route,p)=>{
  if(p.operation==='read'&&p.view==='intakeReview')return {requestId:pending.requestId,readOnly:true,checkedAt:today+'T00:00:00Z',overlapToken:'a'.repeat(64),resolutionOptions:['merge','keep','edit'],message:pending.message,requested:{periods:[6,7],typeLabel:'Work review',reasonDetail:'<img src=x onerror=alert(1)>',reliefRequired:true},teachers:[{name:'Teacher One',missingDates:[],dates:[{date:'2026-11-10',savedEntries:[{periods:[5,6],typeLabel:'Work review',reasonDetail:'Prior reason',reliefRequired:true}]}]}]};
  if(p.operation==='resolveAbsenceIntake'){decisions.push(structuredClone(p));Object.assign(pending,{accepted:true,intakeReceipt:true,receiptOnly:true,savedIds:['saved'],absenceApplied:p.resolution==='merge',intakeState:p.resolution==='merge'?'applied':'withdrawn',transportState:p.resolution==='merge'?'applied':'withdrawn',resolution:{action:p.resolution,reason:p.reason,by:profile.user.email,at:today+'T00:00:00Z'},reasonCode:p.resolution==='keep'?'SMC_KEEP_EXISTING':null});return structuredClone(pending);}
  return ordinary(route,p);
 };
 await w.RosterOpsUI.render('Absences by Date',ctx);await wait(()=>q('[data-review-intake]'));
 assert.match(q('[data-ops-intake]').textContent,/SMC review is needed/);assert(!q('[data-ops-intake]').textContent.includes('sending to the school register'));assert.match(q('[data-ops-intake]').textContent,/P5, P6/);assert.equal(live().length,0,'parked transport overrides cached pending status and stops polling');
 q('[data-review-intake]').click();await wait(()=>q('[data-resolve-overlap]'));assert.equal(q('[data-intake-review] img'),null,'reason text must be escaped');assert.match(q('[data-intake-review]').textContent,/Prior reason/);
 q('[data-edit-overlap]').click();assert.deepEqual(go,[['Manage reported absences','2026-11-10']]);assert.equal(decisions.length,0,'edit navigation must not resolve the report');
 q('[data-review-intake]').click();await wait(()=>q('[data-resolve-overlap]'));let form=q('[data-resolve-overlap]');form.elements.reason.value='Reviewed all dates';form.elements.confirm.checked=true;form.querySelector('[value="merge"]').click();await wait(()=>decisions.length===1&&q('[data-resolve-overlap]')===null);assert.equal(decisions[0].resolution,'merge');assert.equal(decisions[0].overlapToken,'a'.repeat(64));assert.equal(decisions[0].confirm,true);
 Object.assign(pending,{alreadyRecorded:true,intakeState:'applied',transportState:'applied',absenceApplied:true,reasonCode:null,resolution:null});await w.RosterOpsUI.render('Manage reported absences',ctx);await wait(()=>q('[data-ops-intake]').textContent.includes('Already recorded'));assert(!q('[data-ops-intake]').textContent.includes('sending to the school register'));
 Object.assign(pending,{alreadyRecorded:false,intakeState:'needsReview',transportState:'needsReview',absenceApplied:false});q('[data-refresh-intake]').click();await wait(()=>q('[data-review-intake]'));q('[data-review-intake]').click();await wait(()=>q('[data-resolve-overlap]'));form=q('[data-resolve-overlap]');form.elements.reason.value='Saved absence is correct';form.elements.confirm.checked=true;form.querySelector('[value="keep"]').click();await wait(()=>decisions.length===2&&q('[data-resolve-overlap]')===null);assert.equal(decisions[1].resolution,'keep');assert.match(q('[data-ops-intake]').textContent,/Existing absence kept/);
 console.log('PASS truthful parked/applied/duplicate cards, escaped overlap reasons, edit navigation and confirmed merge/keep decisions');dom.window.close();
})().catch(error=>{console.error(error);process.exit(1);});
