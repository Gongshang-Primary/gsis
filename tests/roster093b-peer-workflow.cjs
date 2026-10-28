'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
function setup(){const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=360;f.people[1].emails=['bob@gsps.edu.sg','bob@schools.gov.sg'];A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};const saved=f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2,3]});f.absenceId=saved.savedIds[0];f.propose=(extra={})=>f.O.apply(f.state,f.ctx,{operation:'requestMutual',date:f.date,absenceId:f.absenceId,proposalOnly:true,requests:[{recipientId:'bob',demandIds:[f.absenceId+':2'],combination:false}],...extra});f.approve=()=>f.O.apply(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}},{operation:'respondMutual',id:f.state.requests[0].id,decision:'approve'});return f;}
test('a tentative peer proposal is captured without quota, carries both delivery channels, and never claims cover',()=>{
 const f=setup();f.teachers[1].R=null;Object.assign(f.teachers[1],{capConfigured:true,capVerified:false,capHeadroom:null,periodCap:26});f.propose();
 assert.equal(f.state.requests[0].status,'pending');assert.equal(f.state.requests[0].peerArranged,true);assert.equal(f.state.assignments.length,0);const job=f.state.outbox.find(j=>j.kind==='mutual_request');assert.deepEqual(job.data.channels,['whatsapp','email']);assert.deepEqual(job.data.recipientEmails,['bob@gsps.edu.sg','bob@schools.gov.sg']);assert(A.health(f.state,f.ctx,f.date,f.O.demand(f.ctx,f.state,f.date)).uncovered.some(d=>d.id===f.absenceId+':2'));
});
test('automatic allocation preserves pending lessons and reserves the proposed colleague for that period',()=>{
 const f=setup();f.propose();f.teachers[3].cells[2]=['MA','5A','C2',''];f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'dora',date:f.date,typeId:'mc',periods:[2]});f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
 const rows=A.effectiveAssignments(f.state);assert(!rows.some(a=>a.demandId===f.absenceId+':2'));assert(!rows.some(a=>a.staffId==='bob'&&a.period===2));assert.equal(f.state.requests[0].status,'pending');
});
test('peer acceptance ignores its own reservation but creates protected human cover after fresh checks',()=>{
 const f=setup();f.propose();f.approve();const row=A.effectiveAssignments(f.state).find(a=>a.demandId===f.absenceId+':2');assert(row);assert.equal(row.origin,'mutual');assert.equal(row.protected,true);assert.equal(row.peerArranged,true);assert.equal(row.peerApproved,true);assert.equal(f.state.requests[0].status,'approved');f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert.equal(A.effectiveAssignments(f.state).find(a=>a.demandId===row.demandId).id,row.id);
});
test('approval still rejects stale eligibility without deleting the absence or claiming accepted cover',()=>{
 const f=setup();f.propose();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'bob',date:f.date,typeId:'mc',periods:[2]});assert.throws(()=>f.approve(),e=>e.status===409);assert(f.state.absences.some(a=>a.id===f.absenceId));assert(!A.effectiveAssignments(f.state).some(a=>a.demandId===f.absenceId+':2'));
});
for(const operation of ['assign','setNoRelief','unassign','returnAutomatic'])test('SMC '+operation+' supersedes the pending proposal with a durable actor and reason audit',()=>{
 const f=setup();f.propose();const r=f.state.requests[0];f.O.apply(f.state,f.ctx,{operation,date:f.date,demandIds:[f.absenceId+':2'],staffId:'charlie'});assert.equal(r.status,'cancelled');assert.equal(r.supersededBy,'alice@gsps.edu.sg');assert.equal(r.supersededAt,f.ctx.iso);assert(r.reason);assert(f.state.audit.some(a=>a.operation==='peer-override'&&a.ids.includes(r.id)));assert.throws(()=>f.approve(),e=>e.status===409);
});
test('SMC can explicitly replace the nominated colleague with an audited assignment',()=>{
 const f=setup();f.propose();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.absenceId+':2'],staffId:'bob'});assert.equal(f.state.requests[0].status,'cancelled');assert.equal(A.effectiveAssignments(f.state).find(a=>a.demandId===f.absenceId+':2').origin,'smc');
});
test('overlapping tentative invitations cannot reserve the same colleague twice',()=>{
 const f=setup();f.propose();f.teachers[3].cells[2]=['MA','5A','C2',''];const r=f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'dora',date:f.date,typeId:'mc',periods:[2]});assert.throws(()=>f.propose({absenceId:r.savedIds[0],requests:[{recipientId:'bob',demandIds:[r.savedIds[0]+':2']}]}),e=>e.status===409);assert.equal(f.state.requests.length,1);
});
test('rejecting and expiring proposals release pending reservations',()=>{
 for(const expire of [false,true]){const f=setup();f.propose();if(expire){f.state.requests[0].expiresAt=f.ctx.now-1;f.O.reconcile(f.state,f.ctx);}else f.O.apply(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg'}},{operation:'respondMutual',id:f.state.requests[0].id,decision:'reject',reason:'Unavailable'});assert.equal(A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2).available,true);f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert(A.effectiveAssignments(f.state).some(a=>a.demandId===f.absenceId+':2'));}
});
test('combination proposals preserve the original class and require it unchanged on approval',()=>{
 const f=setup();f.teachers[1].cells[2]=['MA','5A','Lab',''];f.propose({requests:[{recipientId:'bob',demandIds:[f.absenceId+':2'],combination:true,expectedRecipientCell:['MA','5A','Lab','']}]});assert.deepEqual(f.state.requests[0].originalLesson,{subject:'MA',className:'5A',venue:'Lab',groupName:''});f.teachers[1].cells[2]=['MA','6A','Lab',''];assert.throws(()=>f.approve(),e=>e.status===409);assert.equal(f.state.requests[0].status,'pending');
});
test('proposal capture never enters quota, candidate ranking, or school-wide capacity work',()=>{
 const f=setup(),names=['teacherContext','manualRanks','manualModel','health'],originals=Object.fromEntries(names.map(name=>[name,A[name]]));try{for(const name of names)A[name]=()=>{throw new Error('Unexpected '+name);};f.propose();assert.equal(f.state.requests.length,1);}finally{Object.assign(A,originals);}
});
test('proposal source mismatch and an invalid later proposal leave no partial invitations',()=>{
 const f=setup(),dem=f.O.demand(f.ctx,f.state,f.date).find(d=>d.id===f.absenceId+':2');assert.throws(()=>f.propose({requests:[{recipientId:'bob',demandIds:[dem.id],expectedLessons:{[dem.id]:{lessonKey:dem.lessonKey,timetableId:'old-plan',parity:'even'}}}]}),e=>e.status===409);assert.equal(f.state.requests.length,0);assert.throws(()=>f.propose({requests:[{recipientId:'bob',demandIds:[dem.id]},{recipientId:'alice',demandIds:[f.absenceId+':3']}]}),e=>e.status===409);assert.equal(f.state.requests.length,0);assert(!f.state.outbox.some(j=>j.kind==='mutual_request'));f.propose({requests:[{recipientId:'bob',demandIds:[dem.id],expectedLessons:{[dem.id]:{lessonKey:dem.lessonKey,timetableId:dem.timetableId,parity:'even'}}}]});assert.equal(f.state.requests.length,1);
});
test('fresh approval and legacy requests still enforce employment caps',()=>{
 const f=setup();f.teachers[1].capConfigured=true;f.teachers[1].periodCap=26;f.teachers[1].capVerified=false;assert.throws(()=>f.propose({proposalOnly:false}),e=>e.status===409);f.propose();assert.throws(()=>f.approve(),e=>e.status===409);assert.equal(f.state.requests[0].status,'pending');assert.equal(f.state.assignments.length,0);
});
test('a pending proposal clears unpublished automatic cover and remains visibly uncovered',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert(A.effectiveAssignments(f.state).some(a=>a.demandId===f.absenceId+':2'));f.propose();assert(!A.effectiveAssignments(f.state).some(a=>a.demandId===f.absenceId+':2'));f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert(!A.effectiveAssignments(f.state).some(a=>a.demandId===f.absenceId+':2'));
});
test('SMC override of approved cover records whose approval was superseded even with verbose logs disabled',()=>{
 const f=setup();f.propose();f.approve();f.state.systemConfig.verboseLogging=false;f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.absenceId+':2'],staffId:'charlie',reason:'On-duty SMC reassigned coverage.'});const event=f.state.audit.find(a=>a.operation==='peer-override');assert.equal(event.previousStatus,'approved');assert.equal(event.previousActor,'bob@gsps.edu.sg');assert.equal(event.reason,'On-duty SMC reassigned coverage.');assert.equal(event.essential,true);assert.equal(event.auditExportSuppressed,undefined);assert.equal(A.effectiveAssignments(f.state).find(a=>a.demandId===f.absenceId+':2').staffId,'charlie');
});
test('returning approved peer cover to automatic allocation removes its active peer protection',()=>{
 const f=setup();f.propose();f.approve();f.O.apply(f.state,f.ctx,{operation:'returnAutomatic',date:f.date,demandIds:[f.absenceId+':2']});const row=A.effectiveAssignments(f.state).find(a=>a.demandId===f.absenceId+':2');assert.equal(row.origin,'automatic');assert.equal(A.protectedAssignment(row),false);assert.equal(row.peerApproved,false);assert.equal(f.state.requests[0].status,'cancelled');
});
test('a rejected SMC choice preserves the pending proposal and its reservation',()=>{
 const f=setup();f.propose();f.teachers[2].cells[2]=['MA','5A','C2',''];assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.absenceId+':2'],staffId:'charlie'}),e=>e.status===409);assert.equal(f.state.requests[0].status,'pending');assert.equal(A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),2).available,false);assert(!f.state.audit.some(a=>a.operation==='peer-override'));
});
test('the durable server receipt time permits a captured report to finish after midnight without accepting client backdating',()=>{
 const f=fixture(),captured=f.date+'T15:59:00.000Z',next='2026-10-15',ctx={...f.ctx,today:next,now:Date.parse(next+'T00:01:00+08:00'),iso:next+'T00:01:00+08:00',minute:1,reportedAt:captured,reportToday:f.date};const saved=f.O.apply(f.state,ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2],reportedAt:'2000-01-01T00:00:00Z'});assert.equal(f.state.absences.find(a=>a.id===saved.savedIds[0]).reportedAt,captured);assert.equal(ctx.today,next);const other=fixture();assert.throws(()=>other.O.apply(other.state,{...ctx,reportedAt:undefined,reportToday:undefined},{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2],reportedAt:captured}),e=>e.status===403);
});
test('trusted attendance capture saves a valid absence while unrelated broken allocations await review',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.absenceId+':2'],staffId:'bob'});f.people.splice(f.people.findIndex(p=>p.id==='bob'),1);const before=JSON.stringify(f.state.assignments),ctx={...f.ctx,attendanceOnly:true},command={operation:'saveAbsence',staffId:'dora',date:f.date,typeId:'mc',periods:[3]},oldHealth=A.health;try{A.health=()=>{throw Error('Attendance must not rebuild relief health');};const saved=f.O.apply(f.state,ctx,command);assert(f.state.absences.some(a=>a.id===saved.savedId&&a.staffId==='dora'));assert.equal(JSON.stringify(f.state.assignments),before);assert(f.state.audit.some(a=>a.operation==='saveAbsence'&&a.ids.includes(saved.savedId)&&a.essential===true));assert.throws(()=>f.O.apply(f.state,ctx,command),e=>e.status===409);assert.throws(()=>f.O.apply(f.state,ctx,{...command,staffId:'charlie',periods:[99]}),e=>e.status===400);assert.throws(()=>f.O.apply(f.state,{...ctx,user:{staffId:'charlie',email:'charlie@gsps.edu.sg'}},{...command,staffId:'alice',periods:[5]}),e=>e.status===403);}finally{A.health=oldHealth;}
});
test('browser attendanceOnly input cannot select the trusted attendance path',()=>{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.absenceId+':2'],staffId:'bob'});f.people.splice(f.people.findIndex(p=>p.id==='bob'),1);assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',attendanceOnly:true,staffId:'dora',date:f.date,typeId:'mc',periods:[3]}),e=>e.status===404);
});
console.log(count+' peer proposal, reservation, acceptance and SMC override cases passed.');
