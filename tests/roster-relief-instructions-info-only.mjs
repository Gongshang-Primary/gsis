import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,publishDuties} from './helpers/relief-info-fixture.mjs';
import {edgeRosterBackend,mutateEdgeRoster,edgeRosterService} from '../roster-update/public/edge-roster.js';
import {GSISRosterOperations as O,GSISRosterStapler as S} from '../roster-update/public/edge-roster-domain.js';
import {captureAbsenceTransport} from '../shared/roster-absence-transport.js';
import {dispatchReceivedReports,templateMessage} from '../roster-update/public/_worker.js';
const priorFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('No live Google/provider request is permitted');
try{
 const f=await fixture();
 try{
  const before=await f.store.head(),cmd=f.command(0,{timetableId:'retired',parity:'odd',staplerRevision:0});
  cmd.instructionsByDate[f.date][f.noteKey]='  Exact original note\nincluding whitespace.  ';
  const reply=(await edgeRosterBackend(f.env,'rosterOperations',cmd,f.who(0),crypto.randomUUID())).result;
  assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.data.absenceApplied,true);
  assert.equal(reply.data.intakeState,'applied','instructions must never hold a landed absence pending');
  assert.equal((await f.store.head()).revision,before.revision+1,'attendance and notes share one mutation');
  const state=await f.state(),a=state.absences.find(a=>a.id===reply.data.savedIds[0]);
  const descriptor=O.instructionNotesView(a,{},[{lessonKey:f.noteKey,period:2,className:'4A'}])[0];assert.equal(descriptor.match,'lesson');assert.equal(O.instructionNotesView(a,{},[{lessonKey:'new-venue',period:2,className:'4A'}])[0].match,'period+class');assert.equal(O.instructionNotesView(a,{},[{lessonKey:'new-class',period:2,className:'5B'}])[0].match,'period');
  assert.equal(a.instructions[f.noteKey],cmd.instructionsByDate[f.date][f.noteKey]);
  assert.equal(a.instructionAuthors[f.noteKey].actor,f.who(0).email);
  assert.equal((state.edgeInstructionDrafts||[]).length,0,'new reports create no deferred instruction work');
  await mutateEdgeRoster(f.env,{actor:f.who(3).email,who:f.who(3),requestId:crypto.randomUUID(),command:{operation:'fixturePublish'},contextInput:()=>({operation:'read',view:'entry',date:f.date}),apply(current,ctx){
   const absence=current.absences.find(row=>row.id===a.id),lesson=O.previewAbsence(ctx,absence)[0];
   current.assignments.push({...lesson,id:crypto.randomUUID(),demandId:lesson.id,absenceId:absence.id,absentId:absence.staffId,absentName:absence.name,staffId:f.people[2].id,relieverName:f.people[2].name,status:'draft',origin:'smc',protected:true,rCost:1,version:1});
   return O.apply(current,ctx,{operation:'publish',date:f.date,allocationRevision:current.dayRevisions[f.date]||0});
  }});
  const published=await f.state(),messages=published.outbox.filter(j=>j.kind==='conditional_relief_instruction');
  assert.equal(messages.length,1,'an intake note reaches the existing approved WhatsApp instruction path on publish');
  assert.equal(O.notificationCurrent(published,messages[0],Date.now()),null,'future published personal notes are eligible for the existing dispatcher, not silently cancelled as day-only notices');
  assert.equal(messages[0].recipientId,f.people[2].id);assert.equal(messages[0].data.instruction,cmd.instructionsByDate[f.date][f.noteKey]);
  const contract=JSON.parse(readFileSync('notification-worker/template-contracts.json','utf8')).templates.conditional_relief_instruction,config={contactsUrl:'https://contacts.example.test/',templates:{conditional_relief_instruction:{...contract,enabled:true}}};
  const payload=await templateMessage({...messages[0],claimId:'synthetic-claim'},f.env,config);assert.equal(payload.template.name,'gsis_relief_instruction_v1');assert.equal(payload.to,f.people[2].mobile);assert.equal(payload.template.components[0].parameters[contract.fields.indexOf('conditional_instruction')].text,'Exact original note; including whitespace.','approved-template rendering keeps all submitted words');

  const api=async(p,who=f.who(0))=>{const r=(await edgeRosterBackend(f.env,'rosterOperations',p,who,crypto.randomUUID())).result;assert.equal(r.ok,true,JSON.stringify(r));return r.data;};
  const duty=(await api({operation:'read',view:'duties',date:f.date},f.who(2))).myDuties[0];assert.equal(duty.instructions,cmd.instructionsByDate[f.date][f.noteKey]);
  const stateBefore=await f.state(),beforeAllocation=stateBefore.assignments.map(({instructions,instructionsUpdatedAt,...row})=>row),beforeDays=structuredClone(stateBefore.dayRevisions);
  await api({operation:'saveInstructions',requestId:crypto.randomUUID(),absenceId:a.id,date:f.date,instructions:{[f.noteKey]:'Updated after publish'},expectedInstructionScopes:{[a.id]:'obsolete'},expectedTimetableId:'obsolete',expectedParity:'odd',expectedStaplerRevision:999});
  const updated=await f.state();assert.equal(updated.outbox.filter(j=>j.kind==='conditional_relief_instruction').length,2,'a changed note queues exactly one update');
  const instructionJobs=updated.outbox.filter(j=>j.kind==='conditional_relief_instruction');assert.equal(O.notificationCurrent(updated,instructionJobs.at(-1),Date.now()),null);assert(O.notificationCurrent(updated,instructionJobs[0],Date.now()),'superseded queued text cannot send again');
  assert.deepEqual(updated.assignments.map(({instructions,instructionsUpdatedAt,...row})=>row),beforeAllocation,'note edits change no allocation fields or ownership');assert.deepEqual(updated.dayRevisions,beforeDays,'notes do not advance allocation revision');
  assert.equal((await api({operation:'read',view:'duties',date:f.date},f.who(2))).myDuties[0].instructions,'Updated after publish');
  const snapshot=updated.publicationSnapshots.at(-1);await api({operation:'acknowledge',requestId:crypto.randomUUID(),date:f.date,snapshotIds:[snapshot.id]},f.who(2));
  assert.equal((await api({operation:'read',view:'duties',date:f.date},f.who(2))).myDuties[0].instructions,'Updated after publish','acknowledgement never hides note details');
  await api({operation:'saveInstructions',requestId:crypto.randomUUID(),absenceId:a.id,date:f.date,instructions:{[f.noteKey]:'Updated after publish'}});
  assert.equal((await f.state()).outbox.filter(j=>j.kind==='conditional_relief_instruction').length,2,'saving unchanged text sends no duplicate');
  assert.equal(O.assignmentInstructions(updated,{...duty,absenceId:a.id,absentId:'another-teacher'},{}),'','a mismatched absent teacher cannot receive this note');
  assert.equal(O.assignmentInstructions(updated,{...duty,date:'2099-01-01'},{}),'','a note is scoped to its absence day');


 }finally{f.db.sql.close();}
 const changed=await fixture();
 try{
  const cmd=await changed.capture(0,{timetableId:'old',parity:'odd',staplerRevision:0}),id=(await changed.state()).absences[0].id;
  await mutateEdgeRoster(changed.env,{actor:changed.who(3).email,who:changed.who(3),requestId:crypto.randomUUID(),command:{operation:'fixtureConfirm'},contextInput:()=>({operation:'read',view:'entry',date:changed.date}),apply(state,ctx){
   let plan=S.create({...ctx.days[changed.date],date:changed.date},{date:changed.date,venues:[]});const dayName=new Date(changed.date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'});plan=S.importLegacy(plan,{app:'Stapler',version:'4.3',stateType:'plan',selectedDate:changed.date,selectedDay:dayName,selectedSheet:'Single',startTime:'07:00',periodMinutes:30,addedTeachers:[changed.people[0].name],tiles:[{id:'synthetic-import',teacher:changed.people[0].name,assignedPeriod:2,subject:'MA',className:'5B',venue:'Changed room',group:'',sheet:'Single',day:dayName,location:'teacher'}],reliefAbsences:[]},{people:ctx.people});
   O.staplerApply(state,ctx,{operation:'saveStapler',date:changed.date,staplerRevision:0,plan});O.staplerApply(state,ctx,{operation:'confirmStapler',date:changed.date,staplerRevision:1});
   const current=O.composeStaplerContext(state,ctx),a=state.absences.find(a=>a.id===id),notes=O.instructionNotesView(a,current);assert.equal(notes[0].match,'period');assert.equal(notes[0].text,'Synthetic retained instruction 0');assert.notEqual(current.days[changed.date].id,'synthetic-baseline');
   const lesson=O.previewAbsence(current,a)[0];assert.equal(O.assignmentInstructions(state,lesson,current),'Synthetic retained instruction 0');return {};
  }});
  const state=await changed.state();assert.equal(state.edgeAbsenceReceipts.find(r=>r.id===cmd.requestId).savedIds[0],id);assert.equal((state.edgeInstructionDrafts||[]).length,0);
 }finally{changed.db.sql.close();}
 const general=await fixture(4,{lessonPeriods:[2,3]});
 try{
  const cmd=general.command(0),oldKey=general.date+':6:'+JSON.stringify(['MA','1H','Former room','']);cmd.instructionsByDate={[general.date]:{[oldKey]:'General retained information'}};
  const r=(await edgeRosterBackend(general.env,'rosterOperations',cmd,general.who(0),crypto.randomUUID())).result;assert.equal(r.ok,true);const id=r.data.savedIds[0];await publishDuties(general,[id]);
  const state=await general.state(),messages=state.outbox.filter(j=>j.kind==='conditional_relief_instruction');assert.equal(messages.length,1,'one general-note message per covering duty block, not per period');assert.equal(messages[0].data.snapshotIds.length,2);assert.match(messages[0].data.instruction,/Note from Synthetic teacher 0 \(original lesson: P6 1H MA\)/);
  for(const duty of state.assignments){assert.match(duty.instructions,/General retained information/);assert.equal(duty.instructions.match(/Note from/g).length,1);}
  const other=general.command(1);other.instructionsByDate={[general.date]:{[general.noteKey]:'Different absent teacher note'}};const another=(await edgeRosterBackend(general.env,'rosterOperations',other,general.who(1),crypto.randomUUID())).result;assert.equal(another.ok,true,JSON.stringify(another));assert.equal(O.assignmentInstructions(await general.state(),{...state.assignments[0],absenceId:another.data.savedIds[0],absentId:general.people[1].id},{}),'Different absent teacher note');assert(!state.assignments.some(a=>a.instructions.includes('Different absent teacher note')));const shared=O.assignmentInstructions(await general.state(),{...state.assignments[0],absenceIds:[id,another.data.savedIds[0]],absentIds:[general.people[0].id,general.people[1].id]},{});assert.match(shared,/General retained information/);assert.match(shared,/Different absent teacher note/);const update=(await edgeRosterBackend(general.env,'rosterOperations',{operation:'saveInstructions',requestId:crypto.randomUUID(),date:general.date,absenceId:id,instructions:{[oldKey]:'Updated general note'}},general.who(0),crypto.randomUUID())).result;assert.equal(update.ok,true,JSON.stringify(update));const jobs=(await general.state()).outbox.filter(j=>j.kind==='conditional_relief_instruction');assert.equal(jobs.length,2,'a multi-period general duty queues one changed-note update');assert.equal(jobs.at(-1).data.snapshotIds.length,2);assert.equal(jobs.at(-1).data.absentTeacherId,general.people[0].id);
 }finally{general.db.sql.close();}
 const malformed=await fixture();
 try{
  const cmd=malformed.command(0),key=malformed.date+':2:{invalid-json';cmd.instructionsByDate={[malformed.date]:{[key]:'Keep text even when original-lesson parsing throws'}};
  const r=(await edgeRosterBackend(malformed.env,'rosterOperations',cmd,malformed.who(0),crypto.randomUUID())).result;assert.equal(r.ok,true);assert.equal(r.data.intakeState,'applied');const state=await malformed.state();assert.equal(state.absences[0].instructions[key],cmd.instructionsByDate[malformed.date][key]);assert.equal(O.instructionNotesView(state.absences[0],{},[])[0].match,'general');
 }finally{malformed.db.sql.close();}
 const migration=await fixture(6);
 try{
  const commands=[];for(let i=0;i<3;i++)commands.push(await migration.capture(i,{timetableId:'retired',parity:'odd',staplerRevision:0}));
  await mutateEdgeRoster(migration.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureLegacyDrafts'},needsContext:false,apply(state,ctx){
   state.edgeInstructionDrafts=commands.map((command,i)=>({id:command.requestId,actor:migration.who(i).email,identity:migration.who(i),date:migration.date,command:structuredClone(command),savedIds:[state.absences[i].id],status:i%2?'pending':'needsReview',reasonCode:'INSTRUCTION_SOURCE_CHANGED',createdAt:ctx.iso}));
   state.absences[1].date=new Date(Date.parse(ctx.today)-86400000).toISOString().slice(0,10);state.absences[2].deletedAt=ctx.iso;
   state.edgeInstructionDrafts[0].command.instructionsByDate[migration.date][migration.noteKey]='Older retained note';
   return {};
  }});
  const before=await migration.state();await edgeRosterService(migration.env,{operation:'processEdgePeerProposals'});const after=await migration.state();
  assert.equal(after.edgeInstructionDrafts.length,before.edgeInstructionDrafts.length,'migration deletes no draft rows');assert.equal(after.absences.length,before.absences.length,'migration deletes no absence rows');
  assert.equal(after.edgeInstructionDrafts[0].status,'applied');assert.equal(after.edgeInstructionDrafts[1].status,'withdrawn');assert.equal(after.edgeInstructionDrafts[2].status,'withdrawn');
  for(const job of after.edgeInstructionDrafts)assert(job.resolutionReason);
  assert.equal(after.absences[0].instructions[migration.noteKey],'Synthetic retained instruction 0','migration preserves newer saved notes');assert(Object.values(after.absences[0].instructions).includes('Older retained note'),'conflicting retained text stays as another original note');
  assert.deepEqual(after.absences[1],before.absences[1]);assert.deepEqual(after.absences[2],before.absences[2]);
  const head=await migration.store.head();await edgeRosterService(migration.env,{operation:'processEdgePeerProposals'});assert.deepEqual(await migration.state(),after,'migration replay changes nothing');assert.equal((await migration.store.head()).revision,head.revision);
  const receipt=(await edgeRosterBackend(migration.env,'rosterOperations',{operation:'read',view:'intake'},migration.who(5),crypto.randomUUID())).result;assert.equal(receipt.ok,true);assert(receipt.data.entries.every(e=>!['pending','needsReview'].includes(e.intakeState)),'old instruction statuses never block an intake');
 }finally{migration.db.sql.close();}
 const recovery=await fixture();
 try{
  const first=recovery.command(0);await captureAbsenceTransport(recovery.env,recovery.who(0),first);await dispatchReceivedReports(recovery.env);
  let state=await recovery.state();assert.equal(state.absences.length,1);assert.equal(state.absences[0].instructions[recovery.noteKey],'Synthetic retained instruction 0');assert.equal((state.edgeInstructionDrafts||[]).length,0);
  const repeat=recovery.command(0);repeat.instructionsByDate[recovery.date][recovery.noteKey]='Changed note on duplicate attendance';await captureAbsenceTransport(recovery.env,recovery.who(0),repeat);await dispatchReceivedReports(recovery.env);
  state=await recovery.state();assert.equal(state.absences.length,1,'duplicate recovery never creates duplicate attendance');assert.equal(state.absences[0].instructions[recovery.noteKey],'Changed note on duplicate attendance');assert.equal((state.edgeInstructionDrafts||[]).length,0);
 }finally{recovery.db.sql.close();}
 console.log('PASS atomic info-only intake, recovery, tolerant/general matching, confirmed Stapler, duty details/acknowledgement, WhatsApp deduplication, allocation isolation and idempotent retained-draft migration');
}finally{globalThis.fetch=priorFetch;}
