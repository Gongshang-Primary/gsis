import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,loadEdgeRoster,edgeRosterClock,mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
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
 const people=Array.from({length:count},(_,i)=>({id:'synthetic-'+i,name:'Synthetic teacher '+i,active:true,email:'synthetic-'+i+'@gsps.edu.sg',emails:['synthetic-'+i+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
 const lesson=['EL','4A','Synthetic room',''],cells=()=>Array.from({length:85},(_,i)=>i%17===2?lesson.slice():['','','','']);
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(p=>({name:p.name,cells:cells()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
 const encoded=JSON.stringify(model),key='synthetic-baseline';
 await bucket.put(key,await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-drain/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',GSIS_SECRET:'synthetic-drain-credential-'.repeat(3),WHATSAPP_ENABLED:'false'};
 async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
 const store=await activate('roster',O.initial());
 await activate('roster-register',{revision:1,entries:[{id:key,name:'Synthetic timetable',from:today,to:'2099-12-31',priority:1,modelObject:{key,digest:sha256Hex(encoded),encoding:'gzip-json-v1'}}],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:[],rosterAdminIds:[],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'single',available:true}}});
 const noteKey=date+':2:'+JSON.stringify(lesson);
 const command=(i,scope={timetableId:key,parity:'single',staplerRevision:0})=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date,staffId:people[i].id,typeId:'mc',fullDay:true,reliefRequired:true,receiptOnly:true,instructionsByDate:{[date]:{[noteKey]:'Synthetic retained instruction '+i}},expectedInstructionScopes:{[date]:scope}});
 const who=i=>({email:people[i].email,subject:people[i].id});
 async function capture(i,scope){const cmd=command(i,scope),reply=(await edgeRosterBackend(env,'rosterOperations',cmd,who(i),crypto.randomUUID())).result;assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.data.absenceApplied,true);return cmd;}
 return {db,env,store,people,date,noteKey,command,who,capture,state:async()=>(await loadEdgeRoster(env)).state};
}

try{
 // Already-forwarded attendance is the live failure case: no transport work is due.
 const idle=await fixture(7);
 try{
  const commands=[];for(let i=0;i<7;i++)commands.push(await idle.capture(i));
  await mutateEdgeRoster(idle.env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureLegacyDrafts'},needsContext:false,apply(state,ctx){state.edgeInstructionDrafts=commands.map((command,i)=>({id:command.requestId,actor:idle.who(i).email,identity:idle.who(i),date:idle.date,command,savedIds:[state.absences[i].id],status:i%2?'pending':'needsReview',createdAt:ctx.iso}));for(const a of state.absences){a.instructions={};a.instructionNotes={};a.instructionAuthors={};}return {};}});
  assert.equal((await idle.state()).edgeInstructionDrafts.filter(d=>['pending','needsReview'].includes(d.status)).length,7);
  assert.equal((await dispatchReceivedReports(idle.env)).transport.claimed,0);
  const applied=await idle.state();
  assert.equal(applied.edgeInstructionDrafts.filter(d=>d.status==='applied').length,7,'scheduled idle drain applies all retained drafts in bounded batches');
  for(let i=0;i<7;i++)assert.equal(applied.absences.find(a=>a.staffId===idle.people[i].id).instructions[idle.noteKey],'Synthetic retained instruction '+i);
  const head=await idle.store.head();
  await dispatchReceivedReports(idle.env);await dispatchReceivedReports(idle.env);
  assert.deepEqual(await idle.state(),applied,'repeat ticks add no instructions, audit, notifications or peer messages');
  assert.equal((await idle.store.head()).revision,head.revision,'applied drafts are an idle no-op');
 }finally{idle.db.sql.close();}
 // A freshly forwarded report must drain its instruction draft on the busy path too.
 const busy=await fixture(1);
 try{
  await captureAbsenceTransport(busy.env,busy.who(0),busy.command(0));
  assert.equal((await busy.state()).absences.length,0);
  const drained=await dispatchReceivedReports(busy.env);
  assert.equal(drained.transport.forwarded,1);
  const saved=await busy.state();assert.equal((saved.edgeInstructionDrafts||[]).length,0,'new transport commits notes without deferred work');
  assert.equal(saved.absences[0].instructions[busy.noteKey],'Synthetic retained instruction 0');
 }finally{busy.db.sql.close();}
 // Obsolete source fields remain compatible but cannot gate information.
 const stale=await fixture(2);
 try{
  await stale.capture(0,{timetableId:'retired-baseline',parity:'single',staplerRevision:0});
  await stale.capture(1,{timetableId:'synthetic-baseline',parity:'odd',staplerRevision:0});
  await dispatchReceivedReports(stale.env);
  const saved=await stale.state();assert.equal(saved.absences.length,2);assert.equal((saved.edgeInstructionDrafts||[]).length,0);
  for(let i=0;i<2;i++)assert.equal(saved.absences[i].instructions[stale.noteKey],'Synthetic retained instruction '+i);
  const head=await stale.store.head();await dispatchReceivedReports(stale.env);assert.deepEqual(await stale.state(),saved);assert.equal((await stale.store.head()).revision,head.revision);
 }finally{stale.db.sql.close();}
 console.log('PASS scheduled D1 drain migrates legacy instruction statuses on an idle tick; fresh transport saves notes atomically without source fences or deferred work; replay is a no-op');
}finally{globalThis.fetch=previousFetch;}
