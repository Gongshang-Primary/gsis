'use strict';
// Real Roster UI/domain; only the remote durable-intake transport is simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),calls=[],journal=new Map(),control={};
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const receipt=entry=>({accepted:true,intakeReceipt:true,receiptOnly:true,requestId:entry.requestId,savedIds:entry.savedIds,acceptedAt:entry.acceptedAt,intakeState:entry.intakeState,absenceApplied:entry.absenceApplied,peerState:entry.peerState,mutualRequestIds:entry.mutualRequestIds,resolution:entry.resolution,transportState:entry.transportState,instructionState:entry.instructionState});
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));
  if(p.operation==='read'&&p.view==='intake')return {revision:'intake-1',entries:[...journal.values()].map(entry=>structuredClone(entry)),pendingCaptureCount:journal.size,peerReviewCount:0};
  if(['saveAbsence','requestMutual'].includes(p.operation)&&p.intake===true){
   const entry={requestId:p.requestId,command:structuredClone(p),dates:[p.date],acceptedAt:f.ctx.iso,intakeState:'pending',absenceApplied:false,savedIds:[],peerState:p.operation==='requestMutual'||p.ownArrangementsByStaffDate?'pending':'none',mutualRequestIds:[],reasonCode:''};journal.set(p.requestId,entry);
   if(control.dropResponse){control.dropResponse=false;throw Object.assign(Error('Response was lost'),{status:503});}return receipt(entry);
  }
  if(p.operation==='resolveAbsenceIntake'){const entry=journal.get(p.intakeRequestId);Object.assign(entry,{intakeState:'withdrawn',resolution:{action:'withdraw',reason:p.reason,at:f.ctx.iso,actorName:'Alice Teacher'}});if(control.dropResolution){control.dropResolution=false;throw Object.assign(Error('Resolution response lost'),{status:503});}return receipt(entry);}
  if(p.operation==='receiptStatus'&&p.command.intake===true){const entry=journal.get(p.command.requestId);return entry?receipt(entry):{accepted:false,requestId:p.command.requestId};}
  if(control.failRead&&p.operation==='read')throw Object.assign(Error('Records unavailable'),{status:503});
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return structuredClone(result.data);
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const preview=()=>{$('[data-period="2"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 return {dom,w,$,f,ctx,calls,journal,control,wait,preview};
}
async function verifyPeerRoute(){
 const {chromium}=require('playwright');

 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
  await page.route('**/*',route=>new URL(route.request().url()).pathname==='/'?route.fulfill({contentType:'text/html',body:html}):route.abort());await page.goto('https://roster.test/');
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-model.js','roster-update/public/roster-operations-ui.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
  await page.evaluate(()=>{const f=__fixture,O=GSISRosterOperations;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;const save=O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[2],reliefRequired:true});O.apply(f.state,f.ctx,{operation:'requestMutual',date:f.ctx.today,absenceId:save.savedIds[0],requests:[{recipientId:'bob',demandIds:[save.savedIds[0]+':2'],combination:false}]});f.ctx.user={...f.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false};f.profile.user=f.ctx.user;history.replaceState(null,'','/?date='+f.ctx.today+'&peerRequest='+f.state.requests[0].id+'#myReliefDuties');});
  await page.addScriptTag({content:fs.readFileSync('roster-update/public/roster.js','utf8')});await page.waitForSelector('[data-peer-request]',{timeout:5000});assert.equal(await page.locator('#content h2').innerText(),'My Relief Duties');assert.equal(await page.evaluate(()=>document.activeElement.dataset.peerRequest),await page.evaluate(()=>__fixture.state.requests[0].id));assert.equal(await page.locator('[data-approve]').count(),1);assert.equal(await page.evaluate(()=>__fixture.calls.some(c=>c.p.operation==='read'&&c.p.date==='2026-10-14')),true);assert.deepEqual(errors,[]);console.log('PASS authenticated peer request route');
 }finally{await browser.close();}
}
(async()=>{
 for(const lost of [false,true]){
  const t=await setup();try{
   const state=await t.w.RosterOpsUI.render('Report Absence',t.ctx);t.preview();t.control.dropResponse=lost;t.control.failRead=true;t.$('[data-save-instructions]').click();
   await t.wait(()=>t.calls.some(p=>p.operation==='saveAbsence')&&!state.busy);
   const command=t.calls.find(p=>p.operation==='saveAbsence');assert.equal(command.intake,true,'mission-critical absence must use the independent durable intake');
   assert.equal(t.f.state.absences.length,0,'capture receipt must not claim that downstream absence projection already happened');
   if(lost){assert(t.$('[data-retry-save]'),'uncertain submission has an exact retry');t.$('[data-retry-save]').click();await t.wait(()=>!state.busy&&!t.$('[data-retry-save]'));assert.equal(t.calls.filter(p=>p.operation==='receiptStatus').length,1);assert.deepEqual(t.calls.find(p=>p.operation==='receiptStatus').command,command);}
   const message=t.$('[data-ops-message]');assert.equal(message.dataset.state,'success');assert.match(message.textContent,/Absence report received.*do not need to submit again/);assert.doesNotMatch(message.textContent,/approved|relief confirmed/i);assert.equal(message.querySelector('[data-dismiss-feedback]'),null);assert.equal(t.calls.filter(p=>p.operation==='saveAbsence').length,1,'lost receipt lookup must not send the saved absence again');assert.equal(t.$('[data-save-absence-now]'),null,'explicit periods and normal submit are the only report path');
   await t.wait(()=>t.$('[data-ops-intake]')?.textContent.includes('Processing'));assert.doesNotMatch(t.$('[data-ops-intake]').textContent,/awaiting reply/i,'unprocessed proposals must not pretend to have reached peers');
   t.control.failRead=false;await t.w.RosterOpsUI.render('Manage reported absences',t.ctx);await t.wait(()=>t.$('[data-ops-intake]')?.textContent.includes(command.requestId));assert.match(t.$('[data-ops-intake]').textContent,/received|Processing/i,'durable reports remain discoverable after changing screens');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const O=t.w.GSISRosterOperations,saved=O.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2],reliefRequired:true}),absenceId=saved.savedIds[0];
   O.apply(t.f.state,t.f.ctx,{operation:'requestMutual',absenceId,date:t.f.ctx.today,requests:[{recipientId:'bob',demandIds:[absenceId+':2'],combination:false}]});t.f.state.revision++;
   await t.w.RosterOpsUI.render('Assign Relief',t.ctx);const cell=()=>t.$('[data-relief-period="2"]');assert.match(cell().textContent,/Peer arranged · awaiting reply/);assert.equal(cell().querySelector('.ops-peer-approved'),null);
   t.f.state.requests[0].status='superseded';t.f.state.revision++;await t.$('[data-ops-refresh]').onclick();assert.equal(cell().querySelector('.ops-peer-pending'),null);
   t.f.state.requests[0].status='pending';t.f.day.teachers.find(t=>t.staffId==='bob').R=0;O.apply(t.f.state,{...t.f.ctx,user:{...t.f.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg'}},{operation:'respondMutual',id:t.f.state.requests[0].id,decision:'approve'});t.f.state.revision++;await t.$('[data-ops-refresh]').onclick();assert.match(cell().querySelector('.ops-peer-approved')?.textContent||'',/Peer approved/);assert.equal(cell().querySelector('.ops-peer-pending'),null);assert.match(cell().querySelector('[data-peer-r-override]')?.textContent||'',/Approved by colleague above weekly R/);assert(cell().querySelector('[data-peer-r-override]').classList.contains('ops-warning'));
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const O=t.w.GSISRosterOperations,saved=O.apply(t.f.state,t.f.ctx,{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,typeId:'mc',periods:[2],reliefRequired:true});
   O.apply(t.f.state,t.f.ctx,{operation:'requestMutual',absenceId:saved.savedIds[0],date:t.f.ctx.today,requests:[{recipientId:'bob',demandIds:[saved.savedIds[0]+':2'],combination:false}]});t.f.state.revision++;
   const request=t.f.state.requests[0];t.f.ctx.user={...t.f.ctx.user,staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false};t.f.profile.user=t.f.ctx.user;
   await t.w.RosterOpsUI.render('My Relief Duties',{...t.ctx,peerRequestId:request.id});await t.wait(()=>t.w.document.activeElement.dataset.peerRequest===request.id);assert.equal(t.w.document.activeElement.dataset.peerRequest,request.id,'approval links focus only a returned request belonging to the authenticated recipient');assert(t.$('[data-approve]'));
   await t.w.RosterOpsUI.render('My Relief Duties',{...t.ctx,peerRequestId:'someone-elses-request'});assert.match(t.$('#content').textContent,/unavailable for your signed-in account/);assert.notEqual(t.w.document.activeElement.dataset.peerRequest,'someone-elses-request');
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   t.journal.set('retained-report',{requestId:'retained-report',command:{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,periods:[2],instructionsByDate:{[t.f.ctx.today]:{lesson:'<img src=x onerror="window.leaked=true">Original note'}}},dates:[t.f.ctx.today],acceptedAt:t.f.ctx.iso,intakeState:'pending',absenceApplied:false,savedIds:[],peerState:'pending',mutualRequestIds:[],transportState:'queued'});
   await t.w.RosterOpsUI.render('Manage reported absences',t.ctx);await t.wait(()=>t.$('[data-ops-intake]')?.textContent.includes('school register'));assert.doesNotMatch(t.$('[data-ops-intake]').textContent,/awaiting reply|Peer approved/i);assert.equal(t.$('[data-ops-intake] img'),null,'original note is inert text, never HTML');assert.match(t.$('[data-ops-intake]').textContent,/Original note/);
   const entry=t.journal.get('retained-report');Object.assign(entry,{transportState:'forwarded',absenceApplied:true,intakeState:'needsReview',instructionState:'needsReview',peerState:'none',reasonCode:'INSTRUCTIONS_REVIEW_REQUIRED'});t.$('[data-refresh-intake]').click();await t.wait(()=>t.$('[data-ops-intake]')?.textContent.includes('Absence saved'));assert.equal(t.$('[data-intake-attention]'),null);assert.equal(t.$('[data-retry-intake]'),null);assert.match(t.$('[data-ops-intake]').textContent,/Absence saved/,'retained information never reports the captured illness as unsaved');assert.match(t.$('[data-ops-intake]').textContent,/Original note/);
   const recovered=structuredClone(entry);t.dom.window.close();const next=await setup();try{next.journal.set(recovered.requestId,recovered);await next.w.RosterOpsUI.render('Manage reported absences',next.ctx);await next.wait(()=>next.$('[data-ops-intake]')?.textContent.includes('retained-report'));assert.match(next.$('[data-ops-intake]').textContent,/Original note/,'server intake restores original details into a new browser session');}finally{next.dom.window.close();}
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const state=await t.w.RosterOpsUI.render('Report Absence',t.ctx);t.preview();t.$('[data-save-instructions]').click();await t.wait(()=>t.journal.size===1&&!state.busy);
   const [entry]=t.journal.values(),saved=t.w.GSISRosterOperations.apply(t.f.state,t.f.ctx,entry.command);t.f.state.revision++;Object.assign(entry,{intakeState:'applied',absenceApplied:true,savedIds:saved.savedIds,peerState:'none'});t.$('[data-refresh-intake]').click();await t.wait(()=>t.$('[data-own-arrangements]'));
   t.$('[data-own-arrangements]').click();await t.wait(()=>!t.$('[data-refresh-mutual]').disabled);t.$('[data-own-period="2"]').click();t.$('[data-select-colleague="charlie"][data-mutual-period="2"]').click();t.control.dropResponse=true;t.$('[data-submit-mutual]').click();await t.wait(()=>t.$('[data-retry-save]')&&!state.busy);
   const command=t.calls.find(p=>p.operation==='requestMutual');assert.equal(command.intake,true);assert.deepEqual(command.requests[0].expectedRecipientCell,['MA','3A','C2-02','']);assert(command.requests[0].expectedLessons[saved.savedIds[0]+':2'].lessonKey,'standalone peer proposals retain the lesson the reporter actually saw');t.$('[data-retry-save]').click();await t.wait(()=>!state.busy&&!t.$('[data-retry-save]'));assert.equal(t.calls.filter(p=>p.operation==='requestMutual').length,1);assert.equal(t.f.state.requests.length,0,'receiving a proposal does not imply a colleague approval request has been created');assert.match(t.$('[data-ops-message]').textContent,/Relief proposal received/);
  }finally{t.dom.window.close();}
 }
 {
  const t=await setup();try{
   const entry={requestId:'duplicate-capture',command:{operation:'saveAbsence',staffId:'alice',date:t.f.ctx.today,periods:[2]},dates:[t.f.ctx.today],acceptedAt:t.f.ctx.iso,intakeState:'needsReview',absenceApplied:false,savedIds:[],peerState:'none',mutualRequestIds:[],reasonCode:'ABSENCE_REVIEW_REQUIRED'};t.journal.set(entry.requestId,entry);t.control.failRead=true;
   const state=await t.w.RosterOpsUI.render('Assign Relief',t.ctx);await t.wait(()=>t.$('[data-ops-intake]')?.textContent.includes('duplicate-capture'));assert(t.$('[data-withdraw-intake]'),'SMC can resolve a blocked, unapplied report without deleting its evidence');t.$('[data-withdraw-intake]').click();assert.match(t.$('[data-dialog-body]').textContent,/will not.*absence/i);const form=t.$('[data-withdraw-intake-form]');form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(t.calls.filter(p=>p.operation==='resolveAbsenceIntake').length,0,'withdrawal requires an explanation');form.elements.reason.value='Duplicate of an already saved report';t.control.dropResolution=true;form.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));await t.wait(()=>t.$('[data-retry-save]')&&!state.busy);const command=t.calls.find(p=>p.operation==='resolveAbsenceIntake');assert.equal(command.intakeRequestId,'duplicate-capture');assert.equal(command.resolution,'withdraw');assert.equal(command.reason,'Duplicate of an already saved report');t.$('[data-retry-save]').click();await t.wait(()=>!state.busy&&!t.$('[data-retry-save]'));assert.deepEqual(t.calls.filter(p=>p.operation==='resolveAbsenceIntake')[1],command,'lost resolution response retries the exact audited decision');assert.match(t.$('[data-ops-intake]').textContent,/Withdrawn by SMC/);assert.match(t.$('[data-ops-intake]').textContent,/Duplicate of an already saved report/);assert.equal(t.$('[data-withdraw-intake]'),null);assert.equal(t.f.state.absences.length,0);
  }finally{t.dom.window.close();}
 }
 await verifyPeerRoute();
 console.log('PASS durable absence receipts, exact lost-response recovery, visible unprocessed captures, and honest peer approval status.');
})().catch(error=>{console.error(error);process.exitCode=1;});
