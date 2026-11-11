import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,loadEdgeRoster,edgeRosterClock,mutateEdgeRoster,buildEdgeRosterContext} from '../roster-update/public/edge-roster.js';
import {dispatchReceivedReports} from '../roster-update/public/_worker.js';
import {captureAbsenceTransport} from '../shared/roster-absence-transport.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const database=createRequire(import.meta.url)('./helpers/chunked-import-db.cjs');
const previousFetch=globalThis.fetch;
globalThis.fetch=()=>assert.fail('This local D1 drain must not call Google or a provider');

async function fixture(count){
 const db=database(),objects=new Map(),bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const value=objects.get(key);return value?{body:new Blob([value]).stream(),text:async()=>new TextDecoder().decode(value)}:null;}};
 const today=edgeRosterClock().today;
 let date=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
 while([0,6].includes(new Date(date).getUTCDay()))date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
 const people=Array.from({length:count},(_,i)=>({id:'synthetic-'+i,name:'Synthetic teacher '+i,active:true,adhocEligible:true,email:'synthetic-'+i+'@gsps.edu.sg',emails:['synthetic-'+i+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
 const lesson=['EL','4A','Synthetic room',''],cells=()=>Array.from({length:85},(_,i)=>i%17===2?lesson.slice():['','','','']);
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(p=>({name:p.name,cells:p.id==='synthetic-'+(count-1)?Array.from({length:85},()=>['','','','']):cells()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
 const encoded=JSON.stringify(model),key='synthetic-baseline';
 await bucket.put(key,await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-drain/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',GSIS_SECRET:'synthetic-drain-credential-'.repeat(3),WHATSAPP_ENABLED:'false'};
 async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
 const store=await activate('roster',O.initial());
 await activate('roster-register',{revision:1,entries:[{id:key,name:'Synthetic timetable',from:today,to:'2099-12-31',priority:1,modelObject:{key,digest:sha256Hex(encoded),encoding:'gzip-json-v1'}}],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:[people[count-1].id],rosterAdminIds:[],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'single',available:true}}});
 const noteKey=date+':2:'+JSON.stringify(lesson);
 const command=(i,scope={timetableId:key,parity:'single',staplerRevision:0})=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date,staffId:people[i].id,typeId:'mc',fullDay:true,reliefRequired:true,receiptOnly:true,instructionsByDate:{[date]:{[noteKey]:'Synthetic retained instruction '+i}},expectedInstructionScopes:{[date]:scope}});
 const who=i=>({email:people[i].email,subject:people[i].id});
 async function capture(i,scope,notes){const cmd=command(i,scope);if(notes)cmd.instructionsByDate={[date]:notes};const reply=(await edgeRosterBackend(env,'rosterOperations',cmd,who(i),crypto.randomUUID())).result;assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.data.absenceApplied,true);assert.equal(reply.data.instructionState,'pending');return cmd;}
 return {db,env,store,people,date,noteKey,command,who,capture,state:async()=>(await loadEdgeRoster(env)).state};
}

try{
 const f=await fixture(3);
 try{
  const oldNoteKey=f.date+':2:'+JSON.stringify(['EL','Former class','Former room','']);
  const cmd=await f.capture(0,{timetableId:'retired-baseline',parity:'odd',staplerRevision:0},{[oldNoteKey]:'Synthetic retained instruction 0'});
  await f.capture(1,{timetableId:'retired-baseline',parity:'single',staplerRevision:0});
  await dispatchReceivedReports(f.env);
  const initial=await f.state(),draft=initial.edgeInstructionDrafts.find(d=>d.id===cmd.requestId),absence=initial.absences.find(a=>a.id===draft.savedIds[0]);
  assert.equal(draft.status,'needsReview');
  const call=async(p,who=f.who(2))=>(await edgeRosterBackend(f.env,'rosterOperations',p,who,crypto.randomUUID())).result;
  const read={operation:'read',view:'entry',date:f.date,id:absence.id,instructionDraftId:cmd.requestId};
  const editor=await call(read);assert.equal(editor.ok,true,JSON.stringify(editor));
  assert(editor.data.instructionEdit,'fresh entry binds the explicit SMC correction');
  const denied=await call(read,f.who(0));assert.equal(denied.ok,false,'ordinary reporter cannot authorize a new instruction scope');
  const record=editor.data.absences.find(a=>a.id===absence.id);
  const edit={operation:'saveAbsence',requestId:crypto.randomUUID(),intake:true,id:absence.id,date:f.date,staffId:absence.staffId,typeId:'mc',periods:[2],reliefRequired:true,expectedAbsenceToken:record.absenceToken,instructionDraftId:cmd.requestId,expectedInstructionEditToken:editor.data.instructionEdit.token};
  // Seed an existing published duty through the real domain snapshot API. The
  // correction and scheduled processor must update the recipient's real view.
  await mutateEdgeRoster(f.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixturePublication'},needsContext:false,async apply(state){
   const ctx=await buildEdgeRosterContext(f.env,state,{operation:'read',view:'entry',date:f.date},f.who(2)),lesson=O.previewAbsence(ctx,state.absences.find(a=>a.id===absence.id))[0];
   const assignment={...lesson,id:crypto.randomUUID(),demandId:lesson.id,absenceId:absence.id,absentId:absence.staffId,absentName:absence.name,staffId:f.people[2].id,relieverName:f.people[2].name,status:'published',origin:'manual',protected:true,rCost:1,version:1,publishedAt:ctx.iso,instructions:''};
   state.assignments.push(assignment);O.publicationSnapshot(state,ctx,assignment);return {};
  }});
  const deniedWrite=await call(edit,f.who(0));assert.equal(deniedWrite.ok,false);
  const textEdit=await call({...edit,requestId:crypto.randomUUID(),instructionsByDate:{[f.date]:{[f.noteKey]:'Replacement text'}}});assert.equal(textEdit.ok,false);
  const outside=await call({...edit,requestId:crypto.randomUUID(),periods:[3]});assert.equal(outside.ok,false,'cannot silently drop an instructed period');
  assert.deepEqual((await f.state()).absences.find(a=>a.id===absence.id),absence,'failed reconciliation rolls back the absence edit');
  const edited=await call(edit);assert.equal(edited.ok,true,JSON.stringify(edited));
  assert.equal((await f.state()).edgeInstructionDrafts.find(d=>d.id===cmd.requestId).status,'pending');
  await dispatchReceivedReports(f.env);
  const applied=await f.state(),done=applied.edgeInstructionDrafts.find(d=>d.id===cmd.requestId);
  assert.equal(done.status,'applied');assert.deepEqual(done.command,cmd,'immutable original instruction submission is retained');
  assert.equal(applied.absences.find(a=>a.id===absence.id).instructions[f.noteKey],'Synthetic retained instruction 0');
  const duties=await call({operation:'read',view:'duties',date:f.date});assert.equal(duties.ok,true,JSON.stringify(duties));
  assert.equal(duties.data.myDuties.find(a=>a.absenceId===absence.id)?.instructions,'Synthetic retained instruction 0','receiving teacher sees original text in My Relief Duties');
  assert(applied.publicationSnapshots.some(v=>v.kind==='instructions'&&v.instructions==='Synthetic retained instruction 0'),'published duty gets an instruction update');
  assert.equal(applied.edgeInstructionDrafts.find(d=>d.id!==cmd.requestId).status,'needsReview','unedited item retains its scope fence');
  assert.equal((await call(edit)).data.replayed,true,'exact edit retry does not re-arm the applied draft');
  const stable=await f.state();await dispatchReceivedReports(f.env);assert.deepEqual(await f.state(),stable);
 }finally{f.db.sql.close();}
 const missing=await fixture(2);
 try{
  const cmd=await missing.capture(0,{timetableId:'retired',parity:'single',staplerRevision:0});await dispatchReceivedReports(missing.env);
  const state=await missing.state(),id=state.edgeInstructionDrafts[0].savedIds[0],call=async p=>(await edgeRosterBackend(missing.env,'rosterOperations',p,missing.who(1),crypto.randomUUID())).result;
  const read={operation:'read',view:'entry',date:missing.date,instructionDraftId:cmd.requestId,id},editor=await call(read);assert.equal(editor.ok,true);
  await mutateEdgeRoster(missing.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureDelete'},needsContext:false,apply(current,ctx){current.absences.find(a=>a.id===id).deletedAt=ctx.iso;return {};}});
  const before=await missing.state(),gone=await call(read);assert.equal(gone.ok,false);assert.match(JSON.stringify(gone),/Report Absence \/ Manage reported absences/);
  const write=await call({operation:'saveAbsence',requestId:crypto.randomUUID(),id,date:missing.date,staffId:missing.people[0].id,typeId:'mc',periods:[2],reliefRequired:true,instructionDraftId:cmd.requestId,expectedInstructionEditToken:editor.data.instructionEdit.token,expectedAbsenceToken:editor.data.absences.find(a=>a.id===id).absenceToken});
  assert.equal(write.ok,false);assert.match(JSON.stringify(write),/Report Absence \/ Manage reported absences/);assert.deepEqual(await missing.state(),before,'a deleted absence is never resurrected');
 }finally{missing.db.sql.close();}
 const stale=await fixture(2);
 try{
  const cmd=await stale.capture(0,{timetableId:'retired',parity:'single',staplerRevision:0});await dispatchReceivedReports(stale.env);
  const id=(await stale.state()).absences[0].id,call=async p=>(await edgeRosterBackend(stale.env,'rosterOperations',p,stale.who(1),crypto.randomUUID())).result;
  const editor=await call({operation:'read',view:'entry',date:stale.date,instructionDraftId:cmd.requestId,id});
  await mutateEdgeRoster(stale.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureConcurrentEdit'},needsContext:false,apply(state){state.absences[0].reliefRequired=false;return {};}});
  const before=await stale.state(),result=await call({operation:'saveAbsence',requestId:crypto.randomUUID(),id,date:stale.date,staffId:stale.people[0].id,typeId:'mc',periods:[2],reliefRequired:true,instructionDraftId:cmd.requestId,expectedInstructionEditToken:editor.data.instructionEdit.token});
  assert.equal(result.ok,false);assert.match(JSON.stringify(result),/INSTRUCTION_EDIT_CHANGED/);assert.deepEqual(await stale.state(),before,'stale editor cannot authorize a new scope');
 }finally{stale.db.sql.close();}
 const batch=await fixture(3);
 try{
  const cmd=batch.command(0,{timetableId:'retired',parity:'single',staplerRevision:0});delete cmd.staffId;delete cmd.instructionsByDate;
  cmd.staffIds=batch.people.slice(0,2).map(p=>p.id);cmd.instructionsByStaffDate=Object.fromEntries(cmd.staffIds.map((id,i)=>[id,{[batch.date]:{[batch.noteKey]:'Original batch note '+i}}]));
  const call=async p=>(await edgeRosterBackend(batch.env,'rosterOperations',p,batch.who(2),crypto.randomUUID())).result;
  assert.equal((await call(cmd)).ok,true);await dispatchReceivedReports(batch.env);
  const choices=await call({operation:'read',view:'entry',date:batch.date,instructionDraftId:cmd.requestId});assert.equal(choices.data.instructionEdit.choices.length,2,'multi-absence report requires an explicit selection');
  for(let i=0;i<2;i++){
   const choice=choices.data.instructionEdit.choices[i],editor=await call({operation:'read',view:'entry',date:batch.date,id:choice.id,instructionDraftId:cmd.requestId});assert.equal(editor.ok,true);
   const result=await call({operation:'saveAbsence',requestId:crypto.randomUUID(),intake:true,id:choice.id,date:batch.date,staffId:choice.staffId,typeId:'mc',periods:[2],reliefRequired:true,instructionDraftId:cmd.requestId,expectedInstructionEditToken:editor.data.instructionEdit.token});assert.equal(result.ok,true,JSON.stringify(result));
   await dispatchReceivedReports(batch.env);
   const state=await batch.state();assert.equal(state.edgeInstructionDrafts[0].status,i===0?'needsReview':'applied','one selected correction never authorizes other items in the same report');
   if(i===0)assert.equal(state.edgeInstructionDrafts[0].reasonCode,'INSTRUCTION_SOURCE_CHANGED');
  }
  const applied=await batch.state();for(let i=0;i<2;i++)assert.equal(applied.absences.find(a=>a.staffId===cmd.staffIds[i]).instructions[batch.noteKey],'Original batch note '+i);
  assert.deepEqual(applied.edgeInstructionDrafts[0].command,cmd);
 }finally{batch.db.sql.close();}
 const intervening=await fixture(2);
 try{
  const cmd=await intervening.capture(0,{timetableId:'retired',parity:'single',staplerRevision:0});await dispatchReceivedReports(intervening.env);
  const id=(await intervening.state()).absences[0].id,call=async p=>(await edgeRosterBackend(intervening.env,'rosterOperations',p,intervening.who(1),crypto.randomUUID())).result;
  const editor=await call({operation:'read',view:'entry',date:intervening.date,id,instructionDraftId:cmd.requestId});
  assert.equal((await call({operation:'saveAbsence',requestId:crypto.randomUUID(),id,date:intervening.date,staffId:intervening.people[0].id,typeId:'mc',periods:[2],reliefRequired:true,instructionDraftId:cmd.requestId,expectedInstructionEditToken:editor.data.instructionEdit.token})).ok,true);
  await mutateEdgeRoster(intervening.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureLaterEdit'},needsContext:false,apply(state){state.absences[0].reliefRequired=false;return {};}});
  await dispatchReceivedReports(intervening.env);const state=await intervening.state();assert.equal(state.edgeInstructionDrafts[0].status,'needsReview');assert.equal(state.edgeInstructionDrafts[0].reasonCode,'ABSENCE_CHANGED');assert.deepEqual(state.absences[0].instructions,{},'later changes invalidate the per-item reconciliation before application');
 }finally{intervening.db.sql.close();}
 const ui=await fixture(2);
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{
  const cmd=await ui.capture(0,{timetableId:'retired',parity:'single',staplerRevision:0});await dispatchReceivedReports(ui.env);
  const w=dom.window,q=selector=>w.document.querySelector(selector),calls=[];w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','roster-update/public/roster-operations-ui.js'])w.eval(readFileSync(file,'utf8'));
  const who=ui.who(1),profile={user:{email:who.email,staffId:ui.people[1].id,smc:true,admin:false,accessVerified:true}};
  const wait=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('UI wait timed out: '+w.document.body.textContent.slice(-1500));};
  const ctx={profile,today:()=>edgeRosterClock().today,container:q('#content'),status:()=>{},api:async(route,p)=>{
   calls.push(structuredClone(p));const reply=(await edgeRosterBackend(ui.env,'rosterOperations',p,who,crypto.randomUUID())).result;
   if(!reply.ok)throw Object.assign(Error(reply.error||reply.message),{status:reply.status,code:reply.code});return reply.data;
  }};
  await w.RosterOpsUI.render('Absences by Date',ctx);await wait(()=>q('[data-edit-intake-absence]'));
  assert(q('[data-retry-intake]'),'Edit absence appears beside Retry processing');
  assert.match(q('[data-ops-intake]').textContent,/Synthetic retained instruction 0/);
  q('[data-edit-intake-absence]').click();await wait(()=>q('[data-edit-form]'));
  assert.equal(q('[data-edit-instructions]'),null,'this flow never edits the submitted instruction text');
  assert.match(q('[data-dialog-body]').textContent,/original submitted text is unchanged/);
  q('[data-edit-clear-periods]').click();q('[data-edit-periods] [data-period="2"]').click();
  q('[data-edit-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>calls.some(p=>p.operation==='saveAbsence')&&!q('[data-edit-form]'));
  const save=calls.find(p=>p.operation==='saveAbsence');assert.equal(save.instructionDraftId,cmd.requestId);assert(save.expectedInstructionEditToken);assert.deepEqual(save.periods,[2]);assert.equal(save.instructionsByDate,undefined);
  await dispatchReceivedReports(ui.env);await wait(()=>q('[data-refresh-intake]')&&!q('[data-refresh-intake]').disabled);q('[data-refresh-intake]').click();await wait(()=>!q('[data-edit-intake-absence]'));
  assert.equal((await ui.state()).edgeInstructionDrafts[0].status,'applied');
  assert.equal((await ui.state()).absences[0].instructions[ui.noteKey],'Synthetic retained instruction 0');
  // The same receipt action must explain deletion instead of opening an empty editor.
  await mutateEdgeRoster(ui.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureDeletedReview'},needsContext:false,apply(state,ctx){state.absences[0].deletedAt=ctx.iso;Object.assign(state.edgeInstructionDrafts[0],{status:'needsReview',reasonCode:'ABSENCE_CHANGED'});return {};}});
  await w.RosterOpsUI.render('Absences by Date',ctx);await wait(()=>q('[data-edit-intake-absence]'));q('[data-edit-intake-absence]').click();
  await wait(()=>q('[data-dialog-body]')?.textContent.includes('Report Absence / Manage reported absences'));
  assert.equal(q('[data-edit-form]'),null,'deleted entry never gets a save form');
 }finally{dom.window.close();ui.db.sql.close();}
 console.log('PASS explicit SMC absence edit reconciles only its retained instruction draft; immutable text, authorization, scope and replay checks');
}finally{globalThis.fetch=previousFetch;}
