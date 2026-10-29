'use strict';
// 0.9.9a quiet mode control: refreshes on the Assign Relief poll even when the
// allocation is unchanged, shows another user's change, and treats a passed
// expiry as off without waiting for the server.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 const polls=[],realSet=w.setTimeout.bind(w);
 w.setTimeout=(fn,delay,...args)=>{if(delay===20000||delay===60000||delay===5000){polls.push(fn);return 'poll-'+polls.length;}return realSet(fn,delay,...args);};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const f=w.__fixture,O=w.GSISRosterOperations;f.setClock(f.ctx.today+'T06:40:00+08:00');f.state.accountingYears['2026']={verified:true};
 let clock=Date.parse(f.ctx.today+'T06:40:00+08:00');w.Date.now=()=>clock;
 let quiet={active:true,actor:'other-smc@gsps.edu.sg',startedAt:clock,expiresAt:clock+35*60000};const quietReads=[];
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.getElementById('content'),status(){},api:async(route,p,method)=>{
  if(route==='quiet-mode'){quietReads.push(method||'POST');return {data:structuredClone(quiet)};}
  if(O.READS.includes(p.operation))return O.read(f.state,f.ctx,p);
  if(p.operation==='allocationVersion')return {revision:f.state.revision,dayRevision:f.state.dayRevisions?.[f.ctx.today]||0,date:f.ctx.today};
  return {};
 }};
 const button=()=>w.document.querySelector('[data-quiet-toggle]');
 const until=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>realSet(r,5));}assert.fail('UI did not settle: '+(button()?.textContent||'no button'));};
 const poll=async()=>{const fn=polls.shift();assert(fn,'an Assign Relief poll is scheduled');await fn();};
 await w.RosterOpsUI.render('Assign Relief',ctx);
 await until(()=>button()&&button().textContent==='End quiet mode');
 assert.equal(button().getAttribute('aria-pressed'),'true','another SMC\'s quiet session is shown on open');

 // Another user ends quiet mode; the allocation itself is unchanged.
 quiet={active:false,actor:'other-smc@gsps.edu.sg',startedAt:quiet.startedAt,expiresAt:null,endReason:'manual'};
 clock+=21000;const reads=quietReads.length;await poll();
 await until(()=>button().textContent==='Quiet mode');
 assert(quietReads.length>reads,'the poll re-reads quiet mode with an unchanged allocation');

 // A session that expires shows as off locally, even inside the 20 s read throttle.
 quiet={active:true,actor:'other-smc@gsps.edu.sg',startedAt:clock,expiresAt:clock+25000};
 clock+=21000;await poll();await until(()=>button().textContent==='End quiet mode');
 clock+=6000;const before=quietReads.length;await poll();
 await until(()=>button().textContent==='Quiet mode');
 assert.equal(quietReads.length,before,'local expiry needs no server read');
 console.log('PASS 0.9.9a quiet mode control refreshes on poll, shows other users\' changes and local expiry');
 dom.window.close();
})().catch(error=>{console.error(error);process.exit(1);});
