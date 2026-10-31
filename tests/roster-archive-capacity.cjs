'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const O=require('../shared/roster-operations.js');

test('production-sized cold output shrinks in bounded batches without changing school records',()=>{
 const now=Date.parse('2026-10-31T20:00:00+08:00'),at='2026-08-10T12:00:00+08:00',date='2026-08-10';
 const text=length=>'Period 3: complete the assigned work and refer to the saved instructions. '.repeat(Math.ceil(length/72)).slice(0,length);
 const state=O.initial();
 state.outbox=Array.from({length:500},(_,i)=>({id:'notice-'+i,kind:'stapler_timetable',recipientId:'staff-'+i%150,date,status:'sent',createdAt:at,completedAt:at,deliveryStatus:'delivered',deliveryAt:at,data:{templateKey:'stapler_timetable',summary:text(11000),communicationSnapshot:{date,revision:i,teachers:[{staffId:'staff-'+i%150,name:'Teacher '+i%150,rows:[{period:3,kind:'relief',instructions:text(900)}]}]}}}));
 state.receipts=Array.from({length:500},(_,i)=>({id:'request-'+i,actor:'staff'+i%150+'@example.test',digest:'digest-'+i,at,revision:i,result:{savedIds:['absence-'+i],changes:[{date,staffId:'staff-'+i%150,instructions:text(8000)}]}}));
 state.optimisationRuns=Array.from({length:100},(_,i)=>({id:'run-'+i,date,at,key:'run-key-'+i,status:'complete',auditExportCaptured:true,coverage:30,uncovered:0,decisionEvidence:{version:1,inputs:{date,baselineId:'baseline-2026'},lessons:Array.from({length:25},(_,p)=>({period:p%12+1,className:'3 Respect',subject:'MA',selectedStaffId:'staff-'+p,selectionExplanation:text(900)}))}}));
 state.audit=Array.from({length:300},(_,i)=>({id:'audit-'+i,date,at,operation:'workload-review',actor:'roster-service',detail:text(5000)}));
 state.scheduleReceipts=Object.fromEntries(Array.from({length:1200},(_,i)=>[date+':'+i,{at,optimise:true,allocationStatus:'complete'}]));
 state.absences=Array.from({length:700},(_,i)=>({id:'absence-'+i,date,staffId:'staff-'+i%150,typeId:'mc',periods:[1,2,3],instructions:{'period-1':text(1000)}}));
 state.assignments=Array.from({length:1000},(_,i)=>({id:'assignment-'+i,date,staffId:'staff-'+i%150,demandId:'absence-'+i%700+':3',period:3,status:'completed',origin:'smc',instructions:text(1000)}));
 state.entitlements=[{staffId:'staff-1',year:2026,quota:10}];state.acknowledgements=[{id:'ack-1',at,staffId:'staff-1'}];state.importedRelief=[{id:'import-1',date,staffId:'staff-1',period:3}];state.reliefCorrections=[{id:'correction-1',date,assignmentId:'assignment-1',actualPeriods:1}];state.rotationEvents=[{id:'rotation-1',date,staffId:'staff-1'}];state.staplerPlans=[{date,baselineId:'baseline-2026',draft:{schema:1,date,teachers:[],note:text(10000)}}];state.staplerArchives=[{id:'stapler-archive',date,draft:{schema:1,date,teachers:[],note:text(10000)}}];state.dailyPublicationStates={[date]:{date,revision:3,teachers:[{staffId:'staff-1',cells:[['MA','3 Respect','','']]}]}};
 state.outbox.push({id:'pending',kind:'smc_alert',recipientId:'staff-1',date,status:'queued',createdAt:at,data:{summary:text(1000)}},{id:'uncertain',kind:'smc_alert',recipientId:'staff-1',date,status:'uncertain',createdAt:at,preparedAt:at,data:{summary:text(1000)}});
 const target=16000000,initialSize=JSON.stringify(state).length;
 if(initialSize<target){const extra=Math.ceil((target-initialSize)/state.assignments.length);for(const row of state.assignments)row.instructions+=text(extra);}
 const before=JSON.stringify(state).length;
 assert(before>=16000000&&before<17000000,'fixture remains approximately 16 million characters');
 const protectedKeys=['absences','assignments','acknowledgements','entitlements','importedRelief','reliefCorrections','rotationEvents','staplerPlans','staplerArchives','dailyPublicationStates','systemConfig'];
 const protectedJson=Object.fromEntries(protectedKeys.map(key=>[key,JSON.stringify(state[key])]));
 const source=new Map();for(const collection of O.COLD_COLLECTIONS){const rows=collection==='scheduleReceipts'?Object.entries(state[collection]):state[collection].map(row=>[row.id,row]);for(const [id,row]of rows)source.set(collection+':'+id,JSON.stringify(row));}
 const archived=new Map();let current=state,batches=0;
 for(;;){
  const selected=O.archiveColdSelection(current,{today:'2026-10-31',now,maxCharacters:2000000});if(!selected.items.length)break;
  assert(selected.characters<=2000000);assert.equal(selected.characters,selected.items.reduce((sum,row)=>sum+row.json.length,0));assert(++batches<=20,'bounded progress');
  for(const item of selected.items){const key=item.collection+':'+item.id;assert(!archived.has(key),'each identity moves once');assert.equal(item.json,source.get(key));archived.set(key,item.json);}
  current=O.archiveApplySelection(current,selected);
  for(const key of protectedKeys)assert.equal(JSON.stringify(current[key]),protectedJson[key],key+' remains byte-identical');
 }
 for(const collection of O.COLD_COLLECTIONS)if(collection!=='scheduleReceipts')for(const row of current[collection])if(row.archiveRef){const ref=row.archiveRef,key=ref.collection+':'+ref.id;assert.equal(archived.get(key),source.get(key),'every retained stub resolves the exact original JSON');}
 assert.equal(Object.keys(current.scheduleReceipts).length,0);for(const id of ['pending','uncertain'])assert.equal(JSON.stringify(current.outbox.find(row=>row.id===id)),source.get('outbox:'+id));
 const after=JSON.stringify(current).length;assert(after<before/3,'cold bodies leave the main file');assert.equal(archived.size,2600);
 console.log(JSON.stringify({fixture:'synthetic',beforeCharacters:before,afterCharacters:after,batches,archivedItems:archived.size,maximumBatchCharacters:2000000}));
});
