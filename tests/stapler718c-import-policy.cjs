'use strict';
// Suspended plans skip workload calculation during editing. Revision K retains
// allocation R/cap gates; imports retain structural validation and provenance.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../shared/roster-stapler.js'),O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const periods=Array.from({length:6},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period}));
 const teachers=['Unknown cap','Exceeded cap','Online only'].map((name,i)=>({staffId:'staff-'+i,name,timetableName:name,R:9,originalR:9,periodCap:i===1?2:10,capConfigured:true,capVerified:i===1,capWorkload:i===1?2:null,capHeadroom:i===1?0:null,cells:periods.map(()=>['','','',''])}));
 teachers.forEach((t,i)=>{t.cells[1]=['EL','Baseline '+i,'Room',''];});
 const day={date:'2026-10-21',id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]},people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));
 const payload={app:'Stapler',version:'4.3',stateType:'relief',selectedDate:day.date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:teachers.slice(0,2).map(t=>t.name),reliefAbsences:[],tiles:teachers.slice(0,2).flatMap((t,i)=>[1,2].map(p=>({id:i+':'+p,teacher:t.name,assignedPeriod:p,subject:'EL',className:'Exam '+i,venue:'Hall',group:'',sheet:'Even Week',day:'Wednesday',location:'teacher'})))};
 const now=Date.parse(day.date+'T06:00:00+08:00'),ctx={today:day.date,now,iso:new Date(now).toISOString(),minute:360,days:{[day.date]:day},baselineDays:{[day.date]:day},people,user:{email:'admin@gsps.edu.sg',staffId:people[0].id,smc:true,admin:true},uuid:crypto.randomUUID,timetableEntries:[{id:day.id,from:day.date,to:day.date}]};
 return {day,ctx,payload,plan:S.importLegacy(S.create(day),payload,{people}),state:O.initial()};
}
function apply(f,operation,fields={}){return O.staplerApply(f.state,f.ctx,{date:f.day.date,staplerRevision:f.state.staplerPlans[0]?.revision||0,operation,...fields});}
function confirmed(){const f=fixture();apply(f,'saveStapler',{plan:f.plan});apply(f,'confirmStapler');return f;}
function warning(f,id){return f.state.staplerPlans[0].workloadWarnings.find(w=>w.staffId===id);}
function card(plan,id='staff-0'){return plan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'&&t.offlineSource&&t.teacherId===id);}
function accepted(f,plan){apply(f,'saveStapler',{plan});assert.deepEqual(f.state.staplerPlans[0].workloadWarnings,[]);S.validate(f.state.staplerPlans[0].draft);}
function assertRejected(f,plan,pattern){const before=JSON.stringify(f.state);assert.throws(()=>apply(f,'saveStapler',{plan}),error=>error.status===409&&pattern.test(error.message));assert.equal(JSON.stringify(f.state),before,'rejected edit leaves the saved plan and warnings intact');}

{
 const f=confirmed(),row=f.state.staplerPlans[0];
 assert.deepEqual(row.workloadWarnings,[],'suspended plans do not retain obsolete workload warnings');
 apply(f,'saveStapler',{plan:row.draft});assert.equal(warning(f,'staff-1'),undefined,'unchanged imports remain free of obsolete workload warnings');
 const first=card(row.draft),edited=S.apply(S.apply(row.draft,{type:'edit',tileId:first.id,patch:{subject:'SCI',venue:'Changed room',classIds:[]},customClasses:['Changed class']}),{type:'move',tileId:first.id,period:4});
 apply(f,'saveStapler',{plan:edited});assert(row.confirmed);assert.equal(warning(f,'staff-0'),undefined);
 assert.deepEqual(row.draft.tiles.find(t=>t.id===first.id).offlineSource,first.offlineSource,'routine edits preserve immutable import provenance');
 const view=O.staplerView(f.state,f.ctx,{date:f.day.date});view.workloadWarnings.push({name:'Client edit'});assert.deepEqual(row.workloadWarnings,[],'view warning field is detached from saved state');
 const effective=O.composeStaplerContext(f.state,f.ctx),teachers=A.teacherContext(f.state,effective,f.day.date);
 for(const id of ['staff-0','staff-1']){const t=teachers.get(id),eligibility=A.eligibility(t,5);assert.equal(eligibility.capViolation,true);assert.equal(eligibility.available,false);assert.equal(eligibility.autoEligible,false);assert.equal(t.workloadIgnored,true);}
 assert.deepEqual(effective.days[f.day.date].teachers.find(t=>t.staffId==='staff-2').cells,f.day.teachers[2].cells,'teacher absent from Offline JSON retains the online baseline');
 for(const field of ['absences','assignments','importedRelief','outbox'])assert.equal(f.state[field].length,0,'same-owner import does not fabricate '+field);
}

// Manual additions, replacements and transfers skip workload calculation while editing.
// Ordinary baseline dates still enforce the same underlying cap observations.
for(const id of ['staff-0','staff-1'])for(const kind of ['addition','replacement','transfer','replacement-transfer','pit-placement']){
 const f=confirmed(),plan=f.state.staplerPlans[0].draft,old=card(plan,id),from=card(plan,id==='staff-0'?'staff-1':'staff-0');let edited;
 if(kind==='addition')edited=S.apply(plan,{type:'addTile',tile:{teacherId:id,period:4,subject:'EL',classIds:[]}});
 if(kind==='replacement')edited=S.apply(S.apply(plan,{type:'pit',tileId:old.id}),{type:'addTile',tile:{teacherId:id,period:old.period,subject:'EL',classIds:[]}});
 if(kind==='transfer')edited=S.apply(plan,{type:'move',tileId:from.id,teacherId:id,period:4});
 if(kind==='replacement-transfer')edited=S.apply(S.apply(plan,{type:'pit',tileId:old.id}),{type:'move',tileId:from.id,teacherId:id,period:old.period});
 if(kind==='pit-placement'){const pitOnly=S.apply(plan,{type:'addTile',tile:{teacherId:id,subject:'EL',classIds:[]}});apply(f,'saveStapler',{plan:pitOnly});assert.equal(warning(f,id),undefined,'unplaced manual cards add no obsolete warnings');const added=pitOnly.tiles.find(t=>!plan.tiles.some(old=>old.id===t.id));edited=S.apply(f.state.staplerPlans[0].draft,{type:'move',tileId:added.id,period:4});}
 accepted(f,edited);assert.equal(A.eligibility(A.teacherContext(f.state,f.ctx,f.day.date).get(id),5).capViolation,true,'ordinary baseline context still enforces the unknown or exceeded cap');
}

{
 const f=confirmed();let plan=f.state.staplerPlans[0].draft;
 for(const tile of plan.tiles.filter(t=>t.location==='grid'&&t.teacherId==='staff-0'))plan=S.apply(plan,{type:'pit',tileId:tile.id});
 apply(f,'saveStapler',{plan});assert.equal(warning(f,'staff-0'),undefined,'removing imported lessons does not require known workload');
 assert.deepEqual(S.effectiveDay(f.state.staplerPlans[0].draft,f.day).teachers[0].cells,f.day.periods.map(()=>['','','','']));
 const deleted=confirmed(),classId=card(deleted.state.staplerPlans[0].draft).classIds[0];apply(deleted,'saveStapler',{plan:S.apply(deleted.state.staplerPlans[0].draft,{type:'deleteClass',classId})});assert.equal(warning(deleted,'staff-0'),undefined);assert(!deleted.state.staplerPlans[0].draft.classes.some(c=>c.id===classId),'class removal remains durable');
}

{
 const f=confirmed(),plan=f.state.staplerPlans[0].draft,online=plan.tiles.find(t=>t.location==='grid'&&t.teacherId==='staff-2');
 accepted(f,S.apply(plan,{type:'edit',tileId:online.id,patch:{venue:'Changed room'}}));
 const bad=clone(plan);card(bad).offlineSource.subject='Forged';assertRejected(f,bad,/Original offline source details/);
 const manual=fixture(),base=S.create(manual.day),tile=base.tiles.find(t=>t.teacherId==='staff-0');
 const flagged=S.apply(base,{type:'edit',tileId:tile.id,patch:{venue:'Manual change'}});flagged.importSource={mode:'final-day'};flagged.workloadWarnings=[];
 let contextCalls=0;const original=A.teacherContext;A.teacherContext=(...args)=>{contextCalls++;return original(...args);};
 try{apply(manual,'saveStapler',{plan:flagged});}finally{A.teacherContext=original;}
 assert.equal(contextCalls,0,'ordinary draft save does not add allocation-context work');assert.deepEqual(manual.state.staplerPlans[0].workloadWarnings,[]);
 apply(manual,'confirmStapler');assert.equal(manual.state.staplerPlans[0].confirmed,true,'manual suspended plans can be confirmed without workload calculation');assert.equal(O.composeStaplerContext(manual.state,manual.ctx).days[manual.day.date].workloadIgnored,true);
}

// An import for someone else must not tighten the pre-existing policy for
// unchanged workload on an online-only teacher's baseline or accepted cards.
for(const existingManual of [false,true]){
 const f=fixture(),online=f.day.teachers[2];Object.assign(online,{periodCap:20,capWorkload:21,capVerified:true,capHeadroom:0});
 let plan=S.create(f.day);
 if(existingManual){
  const old=plan.tiles.find(t=>t.teacherId===online.staffId);plan=S.apply(S.apply(plan,{type:'pit',tileId:old.id}),{type:'addTile',tile:{teacherId:online.staffId,period:1,subject:'EL',classIds:[]}});
  apply(f,'saveStapler',{plan});apply(f,'confirmStapler');plan=f.state.staplerPlans[0].draft;
 }
 plan=S.importLegacy(plan,f.payload,{people:f.ctx.people});apply(f,'saveStapler',{plan});if(!existingManual)apply(f,'confirmStapler');
 const tile=f.state.staplerPlans[0].draft.tiles.find(t=>t.teacherId===online.staffId&&t.location==='grid');
 apply(f,'saveStapler',{plan:S.apply(f.state.staplerPlans[0].draft,{type:'edit',tileId:tile.id,patch:{venue:'Metadata only'}})});
 assert(f.state.staplerPlans[0].confirmed);assert.equal(warning(f,online.staffId),undefined,'unrelated accepted workload does not acquire imported warning policy');
}

for(const capWorkload of [NaN,Infinity]){
 const f=fixture();Object.assign(f.day.teachers[0],{periodCap:null,capWorkload,capVerified:true});
 apply(f,'saveStapler',{plan:f.plan});apply(f,'confirmStapler');assert.equal(warning(f,'staff-0'),undefined,'invalid workload observations do not create suspended-date workload warnings');
}

{
 const f=confirmed();for(const teacher of f.day.teachers)Object.assign(teacher,{periodCap:20,capWorkload:2,capVerified:true,capHeadroom:18});
 apply(f,'saveStapler',{plan:f.state.staplerPlans[0].draft});assert.deepEqual(f.state.staplerPlans[0].workloadWarnings,[],'verified compliant caps clear warnings');
 const reset=confirmed();reset.day.id='replacement-baseline';reset.ctx.timetableEntries[0].id=reset.day.id;apply(reset,'resetStapler');
 assert.deepEqual(O.staplerView(reset.state,reset.ctx,{date:reset.day.date}).workloadWarnings,[],'baseline reset does not carry old import warnings');
 assert.equal(reset.state.staplerPlans[0].confirmed,undefined);assert.equal(reset.state.staplerPlans[0].draft.importSource,undefined);
}

console.log('PASS suspended import policy: no obsolete workload warnings, manual/transfer editing, suspended and baseline cap enforcement, immutable provenance, nonimport fast path and reset.');
