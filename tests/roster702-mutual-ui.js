'use strict';
// Real Chromium, production UI/domain, synthetic staff only. No school services or messages.
// GSIS_BROWSER_EXECUTABLE=/path/to/chromium node tests/roster702-mutual-ui.js
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const executablePath=process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.setContent('<main id="content"></main>');
  for(const file of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{
   const f=__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
   for(let i=f.day.teachers.length;i<150;i++){
    const id='synthetic-'+String(i).padStart(3,'0'),name='Teacher '+String(i).padStart(3,'0');
    f.ctx.people.push({id,name,active:true,mobile:String(80000000+i)});
    f.day.teachers.push({staffId:id,name,R:5,cells:Array.from({length:17},()=>['','','',''])});
   }
   GSISRosterOperations.apply(f.state,f.ctx,{operation:'saveAdhoc',staffId:'ext',date:f.ctx.today,periods:[2,3]});
   f.ctx.user={...f.ctx.user,smc:false,admin:false};f.profile.user=f.ctx.user;
   window.__apiCalls=[];window.__apiResults=[];window.__candidateGates=[];window.__holdCandidates=true;
   window.__opsContext={profile:f.profile,today:()=>f.ctx.today,container:document.getElementById('content'),api:async(route,p)=>{
    const call={...structuredClone(p),settled:false};__apiCalls.push(call);
    if(p.operation==='candidates'&&window.__failCandidates){window.__failCandidates=false;call.settled=true;__apiResults.push({operation:p.operation,status:503,error:'Synthetic offline'});throw Object.assign(Error('Synthetic offline'),{status:503});}
    const response=await fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();
    // Snapshot the real domain result first, then simulate a slow response in flight.
    if(p.operation==='candidates'&&__holdCandidates)await new Promise(resolve=>__candidateGates.push(resolve));
    call.settled=true;__apiResults.push({operation:p.operation,status:response.status,error:result.error});
    if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;
   }};
  });
  await page.evaluate(()=>RosterOpsUI.render('Report Absence',__opsContext));
  for(const period of [2,3])await page.locator('[data-period="'+period+'"]').click();
  await page.locator('[data-log-absence]').click();await page.locator('[data-instruction]').fill('Synthetic relief instruction.');
  await page.locator('[data-save-instructions]').click();
  await page.waitForFunction(()=>__fixture.state.absences.length===1&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__fixture.state.absences[0].instructionsNA),false);
  assert.deepEqual(await page.evaluate(()=>__fixture.state.absences[0].periods),[2,3]);
  assert.equal(await page.evaluate(()=>__apiCalls.filter(c=>c.operation==='candidates').length),0,'saved instructions leave colleague availability on demand');

  const cold=await page.evaluate(async()=>{
   const start=performance.now();document.querySelector('[data-own-arrangements]').click();const syncMs=performance.now()-start;
   const own=[...document.querySelectorAll('[data-own-period]')].map(b=>Number(b.dataset.ownPeriod));document.querySelector('[data-own-period="2"]').click();await new Promise(requestAnimationFrame);
   return {syncMs,firstFrameMs:performance.now()-start,own,rows:document.querySelectorAll('[data-colleague-name]').length,waiting:__apiCalls.filter(c=>c.operation==='candidates'&&!c.settled).length,chosen:document.querySelector('[data-own-period="2"]').getAttribute('aria-pressed'),message:document.querySelector('[data-candidate-message]').textContent};
  });
  assert.deepEqual(cold.own,[2,3]);assert.equal(cold.rows,149);assert.equal(cold.waiting,1);assert.equal(cold.chosen,'true');assert.match(cold.message,/Checking current colleague availability/);assert.ok(cold.syncMs<200,'chooser mounts before delayed authority response');
  await page.evaluate(()=>{__holdCandidates=false;__candidateGates.shift()();});await page.waitForFunction(()=>!document.querySelector('[data-refresh-mutual]').disabled);
  assert.equal(await page.locator('[data-colleague-name]').count(),150,'activated external relief is added from authoritative candidates');
  for(const id of ['bob','charlie','ext'])assert.equal(await page.locator('[data-select-colleague="'+id+'"][data-mutual-period="2"]').isVisible(),true);
  assert.match(await page.locator('[data-select-colleague="charlie"][data-mutual-period="2"]').textContent(),/Combine class/,'busy lessons remain explicit combine choices');
  const local=await page.evaluate(async()=>{
   const el=document.querySelector('dialog'),filter=el.querySelector('[data-colleague-filter]'),list=el.querySelector('[data-colleagues]'),rows=[...list.querySelectorAll('[data-colleague-name]')],filters=[],periods=[],targets=[];window.__mutualRefs={el,filter,list};
   filter.focus({preventScroll:true});
   for(const query of ['Tea','Teac','teacher','']){filter.value=query;const start=performance.now();filter.dispatchEvent(new Event('input',{bubbles:true}));filters.push(performance.now()-start);}
   const stableDOM=rows.every((r,i)=>r===list.querySelectorAll('[data-colleague-name]')[i]),focus=document.activeElement===filter;
   for(let i=0;i<8;i++){const period=i%2?3:2,start=performance.now();el.querySelector('[data-own-period="'+period+'"]').click();periods.push(performance.now()-start);const target=el.querySelector('[data-select-colleague="'+(period===2?'bob':'ext')+'"][data-mutual-period="'+period+'"]'),targetStart=performance.now();target.click();targets.push(performance.now()-targetStart);}
   filter.value='ＢｏＢ';const start=performance.now();filter.dispatchEvent(new Event('input',{bubbles:true}));filters.push(performance.now()-start);const matches=[...list.querySelectorAll('[data-colleague-name]')].filter(r=>!r.hidden).map(r=>r.querySelector('strong').textContent);
   filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));return {filters,periods,targets,matches,focus,stableDOM,candidateReads:__apiCalls.filter(c=>c.operation==='candidates').length};
  });
  assert.deepEqual(local.matches,['Bob Colleague']);assert.equal(local.focus,true);assert.equal(local.stableDOM,true,'name filtering reuses colleague rows');assert.equal(local.candidateReads,1,'all selection and filtering remains local');assert.ok(Math.max(...local.filters)<25);assert.ok(Math.max(...local.periods,...local.targets)<100);
  const filterPaint=await page.evaluate(async()=>{const filter=document.querySelector('[data-colleague-filter]'),list=document.querySelector('[data-colleagues]'),samples=[];for(const query of ['b','bo','bob','']){filter.value=query;const start=performance.now();filter.dispatchEvent(new Event('input',{bubbles:true}));const handlerMs=performance.now()-start;list.getBoundingClientRect();const throughLayoutMs=performance.now()-start;await new Promise(requestAnimationFrame);samples.push({query,handlerMs,throughLayoutMs,nextFrameMs:performance.now()-start});}return samples;});
  assert.ok(Math.max(...filterPaint.map(s=>s.throughLayoutMs))<100);

  // A fresh domain check, rather than the cached green cell, authorises each save.
  await page.evaluate(()=>{
   const f=__fixture;f.day.teachers.find(t=>t.staffId==='bob').cells[2]=['MA','3A','C2-02',''];
   window.__beforeRejectedState=JSON.stringify(f.state);document.querySelector('[data-submit-mutual]').click();
  });
  await page.waitForFunction(()=>__apiResults.some(r=>r.operation==='requestMutual')&&document.getElementById('content').getAttribute('aria-busy')==='false');
  assert.equal(await page.evaluate(()=>__apiResults.filter(r=>r.operation==='requestMutual').at(-1).status),409);
  assert.equal(await page.evaluate(()=>JSON.stringify(__fixture.state)===__beforeRejectedState),true,'server rejection creates no requests, assignments or audit writes');
  assert.equal(await page.evaluate(()=>__fixture.state.requests.length),0);
  await page.waitForFunction(()=>__apiCalls.filter(c=>c.operation==='candidates').length===2&&!document.querySelector('[data-refresh-mutual]').disabled);
  assert.equal(await page.locator('[data-remove-request="2"]').count(),1,'fresh availability retains the selection for review');assert.match(await page.locator('[data-mutual-selections]').textContent(),/No longer available/);assert.equal(await page.locator('[data-submit-mutual]').isDisabled(),true);
  await page.evaluate(()=>{__fixture.day.teachers.find(t=>t.staffId==='bob').cells[2]=['','','',''];});
  await page.locator('[data-refresh-mutual]').click();await page.waitForFunction(()=>!document.querySelector('[data-refresh-mutual]').disabled);
  assert.equal(await page.evaluate(()=>__apiCalls.filter(c=>c.operation==='candidates').length),3,'a rejected save refreshes once; each explicit refresh uses one new batch');
  assert.equal(await page.evaluate(()=>__mutualRefs.list===document.querySelector('[data-colleagues]')&&__mutualRefs.filter===document.querySelector('[data-colleague-filter]')),true,'refresh preserves dialog controls');
  await page.locator('[data-own-period="2"]').click();await page.locator('[data-select-colleague="bob"][data-mutual-period="2"]').click();
  await page.locator('[data-submit-mutual]').click();await page.waitForFunction(()=>__fixture.state.requests.length===2&&!document.querySelector('dialog'));
  const saved=await page.evaluate(()=>({requests:__fixture.state.requests.map(r=>({periods:r.periods,recipientId:r.recipientId})),
   assignments:__fixture.state.assignments.length,payload:__apiCalls.filter(c=>c.operation==='requestMutual').at(-1),absence:__fixture.state.absences[0]}));
  assert.deepEqual(saved.requests.sort((a,b)=>a.periods[0]-b.periods[0]),[{periods:[2],recipientId:'bob'},{periods:[3],recipientId:'ext'}]);assert.equal(saved.assignments,0,'requesting relief does not create an approved or published assignment');
  assert.deepEqual(saved.payload.requests.sort((a,b)=>a.recipientId.localeCompare(b.recipientId)),[{recipientId:'bob',combination:false,demandIds:[saved.absence.id+':2']},{recipientId:'ext',combination:false,demandIds:[saved.absence.id+':3']}]);
  assert.equal(saved.payload.absenceId,saved.absence.id);assert.equal(saved.payload.date,saved.absence.date);assert.equal(saved.payload.byPeriod,undefined);

  // Reopening a warm modal and changing periods reuse the current checked batch.
  await page.waitForFunction(()=>__apiCalls.filter(c=>c.operation==='candidates').every(c=>c.settled));
  // A successful request changes the revision; the next explicit open checks that new state once.
  await page.locator('[data-own-arrangements]').click();await page.waitForFunction(()=>!document.querySelector('[data-refresh-mutual]').disabled);await page.locator('[data-close-dialog]').click();
  await page.evaluate(()=>__fixture.setClock(__fixture.ctx.today+'T06:00:50+08:00'));
  const warm=await page.evaluate(async()=>{
   const reads=__apiCalls.filter(c=>c.operation==='candidates').length,start=performance.now();document.querySelector('[data-own-arrangements]').click();
   const syncMs=performance.now()-start;await new Promise(requestAnimationFrame);return {syncMs,firstFrameMs:performance.now()-start,readsBefore:reads,readsAfter:__apiCalls.filter(c=>c.operation==='candidates').length};
  });
  assert.equal(warm.readsAfter,warm.readsBefore);assert.ok(warm.syncMs<200,'warm matrix should open without another backend read');

  // Reopening must not restart the age of the original checked availability.
  const expired=await page.evaluate(()=>{
   __fixture.setClock(__fixture.ctx.today+'T06:01:01+08:00');__holdCandidates=true;
   const before=__apiCalls.filter(c=>c.operation==='candidates').length;document.querySelector('[data-own-period="2"]').click();
   return {before,after:__apiCalls.filter(c=>c.operation==='candidates').length,blocked:[...document.querySelectorAll('[data-select-colleague]')].every(b=>b.hidden||b.disabled)};
  });
  assert.equal(expired.after,expired.before+1,'a 61-second-old batch refreshes even after reopening at 50 seconds');assert.equal(expired.blocked,true);
  await page.waitForFunction(()=>__candidateGates.length===1);
  await page.evaluate(()=>{__holdCandidates=false;__candidateGates.shift()();});
  await page.waitForFunction(()=>!document.querySelector('[data-refresh-mutual]').disabled);
  assert.equal(await page.locator('[data-select-colleague="synthetic-004"][data-mutual-period="2"]').isVisible(),true);
  await page.evaluate(()=>{__failCandidates=true;document.querySelector('[data-refresh-mutual]').click();});
  await page.waitForFunction(()=>document.querySelector('[data-candidate-message]').textContent==='Synthetic offline');
  assert.equal(await page.locator('[data-select-colleague="synthetic-004"][data-mutual-period="2"]').isDisabled(),true,'failed refresh cannot revive old green eligibility');
  assert.equal(await page.locator('[data-submit-mutual]').isDisabled(),true);
  await page.locator('[data-refresh-mutual]').click();await page.waitForFunction(()=>!document.querySelector('[data-refresh-mutual]').disabled);

  // The response below was generated for Alice, but arrives after Bob takes over.
  await page.evaluate(()=>{__holdCandidates=true;document.querySelector('[data-refresh-mutual]').click();});
  await page.waitForFunction(()=>__candidateGates.length===1);
  await page.evaluate(async()=>{
   window.__detachedModal=document.querySelector('dialog');window.__detachedHTML=__detachedModal.innerHTML;
   RosterOpsUI.unmount();__fixture.ctx.user={...__fixture.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg'};__fixture.profile.user=__fixture.ctx.user;
   await RosterOpsUI.render('Report Absence',__opsContext);window.__newOwnerHTML=document.getElementById('content').innerHTML;
   __holdCandidates=false;__candidateGates.shift()();
  });
  await page.waitForFunction(()=>__apiCalls.filter(c=>c.operation==='candidates').every(c=>c.settled));
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.locator('dialog').count(),0);
  assert.equal(await page.evaluate(()=>!__detachedModal.isConnected&&__detachedModal.innerHTML===__detachedHTML),true,'late success does not mutate the detached old modal');
  assert.equal(await page.evaluate(()=>document.getElementById('content').innerHTML===__newOwnerHTML),true,'late response cannot overwrite another owner’s page');
  assert.equal(await page.locator('[data-absence-teacher] input').inputValue(),'Bob Colleague');
  assert.deepEqual(errors,[]);
  const metrics={environment:'Headless Chromium; production UI and allocation/domain modules; synthetic APIs only',teachers:150,periods:17,coldOpen:cold,warmOpen:warm,
   filterHandlerMs:local.filters,filterRendering:filterPaint,periodHandlerMs:local.periods,targetHandlerMs:local.targets,
   checks:['saved absence and instructions submitted through the real UI','cold period chooser paints before delayed availability completes','one batched candidate request for both periods','period then colleague; no further reads during local interaction','stable rows and input focus during filtering','activated external teacher without a baseline row remains selectable','correct recipient/demand request payload','fresh server rejects newly busy colleague without a state write','explicit refresh invalidates stale eligibility','reopening retains the original checked timestamp and expiry','failed refresh keeps cached eligibility blocked','late response ignored after unmount and owner change']};
  if(process.env.ROSTER_MUTUAL_REPORT)fs.writeFileSync(path.resolve(process.env.ROSTER_MUTUAL_REPORT),JSON.stringify(metrics,null,2)+'\n');
  console.log('PASS v0.7.02 mutual arrangements: '+JSON.stringify(metrics));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
