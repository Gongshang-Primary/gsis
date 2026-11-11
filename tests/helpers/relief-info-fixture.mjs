import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,loadEdgeRoster,edgeRosterClock,mutateEdgeRoster} from '../../roster-update/public/edge-roster.js';
import {sha256Hex} from '../../roster-update/public/edge-deploy-sha256.js';
const database=createRequire(import.meta.url)('./chunked-import-db.cjs');
export async function fixture(count=4,{lessonPeriods=[2],date:requestedDate}={}){
 const db=database(),objects=new Map(),bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const value=objects.get(key);return value?{body:new Blob([value]).stream(),text:async()=>new TextDecoder().decode(value)}:null;}};
 const today=edgeRosterClock().today;
 let date=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
 if(requestedDate)date=requestedDate;
 while([0,6].includes(new Date(date).getUTCDay()))date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
 const people=Array.from({length:count},(_,i)=>({id:'synthetic-'+i,name:'Synthetic teacher '+i,active:true,adhocEligible:true,mobile:String(6500000000+i),email:'synthetic-'+i+'@gsps.edu.sg',emails:['synthetic-'+i+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
 const lesson=['EL','4A','Synthetic room',''],cells=()=>Array.from({length:85},(_,i)=>lessonPeriods.includes(i%17)?lesson.slice():['','','','']);
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(p=>({name:p.name,cells:people.indexOf(p)<2?cells():Array.from({length:85},()=>['','','',''])}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
 const encoded=JSON.stringify(model),key='synthetic-baseline';
 await bucket.put(key,await new Response(new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-drain/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',GSIS_SECRET:'synthetic-drain-credential-'.repeat(3),WHATSAPP_ENABLED:'true'};
 async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
 const initial=O.initial();initial.systemConfig.allowAdvancePublishing=true;const store=await activate('roster',initial);
 await activate('roster-register',{revision:1,entries:[{id:key,name:'Synthetic timetable',from:today,to:'2099-12-31',priority:1,modelObject:{key,digest:sha256Hex(encoded),encoding:'gzip-json-v1'}}],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:[people[count-1].id],rosterAdminIds:[people[count-1].id],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'single',available:true}}});
 const noteKey=date+':2:'+JSON.stringify(lesson);
 const command=(i,scope={timetableId:key,parity:'single',staplerRevision:0})=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date,staffId:people[i].id,typeId:'mc',fullDay:true,reliefRequired:true,receiptOnly:true,instructionsByDate:{[date]:{[noteKey]:'Synthetic retained instruction '+i}},expectedInstructionScopes:{[date]:scope}});
 const who=i=>({email:people[i].email,subject:people[i].id});
 async function capture(i,scope){const cmd=command(i,scope),reply=(await edgeRosterBackend(env,'rosterOperations',cmd,who(i),crypto.randomUUID())).result;assert.equal(reply.ok,true,JSON.stringify(reply));assert.equal(reply.data.absenceApplied,true);return cmd;}
 return {db,env,store,people,date,noteKey,command,who,capture,activate,state:async()=>(await loadEdgeRoster(env)).state};
}

export async function publishDuties(f,absenceIds,{recipient=2}={}){
 return mutateEdgeRoster(f.env,{actor:f.who(f.people.length-1).email,who:f.who(f.people.length-1),requestId:crypto.randomUUID(),command:{operation:'fixturePublish'},contextInput:()=>({operation:'read',view:'entry',date:f.date}),apply(state,ctx){
  for(const id of absenceIds){const absence=state.absences.find(a=>a.id===id);for(const lesson of O.previewAbsence(ctx,absence))state.assignments.push({...lesson,id:crypto.randomUUID(),demandId:lesson.id,absenceId:id,absentId:absence.staffId,absentName:absence.name,staffId:f.people[recipient].id,relieverName:f.people[recipient].name,status:'draft',origin:'smc',protected:true,rCost:1,version:1});}
  return O.apply(state,ctx,{operation:'publish',date:f.date,allocationRevision:state.dayRevisions[f.date]||0});
 }});
}
