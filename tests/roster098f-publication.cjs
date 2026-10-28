'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
function setup(){const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.notificationsConfigured=true;f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2,3]});f.ds=f.O.demand(f.ctx,f.state,f.date);return f;}
function assign(f,period,staffId){return f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.ds.find(d=>d.period===period).id],staffId});}
function publish(f,mode='none'){return f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,...(mode==='legacy'?{}:{notifyMode:mode})});}
function notify(f){return f.O.apply(f.state,f.ctx,{operation:'notifyDaily',date:f.date});}
function teacher(f,id='bob'){return {...f.ctx,user:{staffId:id,email:id+'@gsps.edu.sg',smc:false,admin:false}};}
{
 const f=setup();assign(f,2,'bob');assign(f,3,'dora');const invalid=f.state.assignments.find(a=>a.staffId==='bob');f.teachers[0].cells[2]=['','','',''];f.O.reconcile(f.state,f.ctx);assert(invalid.invalidCover);
 const result=publish(f);assert.equal(result.published,2);assert.equal(result.skippedChoiceCount,0);assert.equal(invalid.status,'published');assert(invalid.invalidCover&&invalid.reviewRequired,'saved business warnings remain for SMC review');assert(f.O.allocation().manualDecision(f.state,f.date,invalid.demandId));assert.equal(f.state.assignments.find(a=>a.staffId==='dora').status,'published');assert(f.state.publicationSnapshots.some(v=>v.assignmentId===invalid.id));assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties[0].id,invalid.id);assert.equal(f.state.outbox.filter(j=>j.kind==='stapler_timetable').length,0,'publish only sends no notification');
 console.log('PASS H publication exposes both saved choices and retains invalid-cover review without sending');
}
{
 const f=setup();assign(f,2,'bob');const first=publish(f,'all');assert.equal(first.uncoveredCount,1);assert(f.state.dailyPublicationStates[f.date].publicReliefRows.some(r=>r.period===3&&r.status==='unassigned'));notify(f);for(const j of f.state.outbox)j.status='sent';
 const a=f.state.assignments[0],originalId=a.id;f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',confirm:true,ids:[f.state.absences[0].id]});assert(a.invalidCover);assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties.length,1,'existing publication remains until explicit republish');
 const before=f.state.outbox.length,result=publish(f,'affected');assert.equal(result.skippedChoiceCount,0);assert.equal(a.id,originalId);assert.equal(a.status,'cancelled');assert(f.O.allocation().manualDecision(f.state,f.date,a.demandId));assert.equal(f.state.outbox.length,before,'explicit republish never sends');notify(f);assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties.length,0);assert.equal(f.O.dailyTimetable(f.state,teacher(f),{date:f.date}).modified.cells[2][0],'');assert.equal(f.state.publicationSnapshots.filter(v=>v.assignmentId===a.id).at(-1).kind,'cancelled');assert(f.state.outbox.slice(before).some(j=>j.recipientId==='bob'&&j.data?.dailyPublication),'republish requests current correction, not an invalid duty');
 const snapshots=f.state.publicationSnapshots.length;publish(f,'none');assert.equal(f.state.publicationSnapshots.length,snapshots,'repeated partial publication does not repeat cancellation snapshots');
 console.log('PASS H deleting the saved absence removes derived cover only on explicit publication and correction uses Notify');
}
{
 const f=setup();const result=publish(f);assert.equal(result.uncoveredCount,2);assert.equal(result.published,0);assert.equal(f.state.assignments.length,0,'Publish never allocates uncovered lessons');assert.equal(f.state.outbox.length,0);assert.equal(result.skippedChoiceCount,0);assert(f.state.dailyPublicationStates[f.date]);
 console.log('PASS F wholly uncovered lessons remain publishable with exact uncovered count');
}

{
 const f=setup();assign(f,2,'bob');publish(f,'legacy');assert(f.state.dailyPublicationStates[f.date],'legacy notification input still uses visibility-only publication');notify(f);for(const j of f.state.outbox)j.status='sent';delete f.state.dailyPublicationStates[f.date];const a=f.state.assignments[0];f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',confirm:true,ids:[f.state.absences[0].id]});const before=f.state.outbox.length;
 publish(f,'affected');assert.equal(f.state.outbox.length,before);notify(f);assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties.length,0);assert(f.state.outbox.slice(before).some(j=>j.recipientId==='bob'&&j.data?.dailyPublication),'legacy published duty gets a correction on partial publication');const bob=f.state.outbox.filter(j=>j.recipientId==='bob'&&j.data?.communicationSnapshot).at(-1).data.communicationSnapshot.teachers[0];assert(bob.rows.some(r=>r.period===2&&r.kind==='restored'),'correction describes the restored period');
 console.log('PASS H legacy published cover migrates to saved removal and explicit recipient correction');
}
{
 const f=setup();assign(f,2,'bob');publish(f,'none');const a=f.state.assignments[0];f.teachers[0].cells[2]=['','','',''];f.O.reconcile(f.state,f.ctx);publish(f,'none');assert(a.invalidCover&&!a.publicationWithheldAt,'source warning does not withhold saved cover');assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties.length,1);f.teachers[0].cells[2]=['EL','4A','C1-01',''];f.O.reconcile(f.state,f.ctx);assert(!a.invalidCover);publish(f,'none');assert(!a.publicationWithheldAt);assert.equal(f.O.read(f.state,teacher(f),{view:'duties',date:f.date}).myDuties.filter(d=>d.id===a.id).length,1);assert.equal(f.state.publicationSnapshots.filter(v=>v.assignmentId===a.id).at(-1).kind,'assigned');
 console.log('PASS H source warnings preserve visible saved choice and restore review validity after source repair');
}
{
 const f=setup();f.O.apply(f.state,f.ctx,{operation:'setNoRelief',demandIds:[f.ds[0].id]});publish(f,'none');f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',confirm:true,ids:[f.state.absences[0].id]});publish(f,'none');assert(f.state.publicationSnapshots.every(v=>typeof v.staffId==='string'&&v.staffId),'no-relief choices never generate recipientless cancellation notices');
 console.log('PASS F invalid no-relief decisions retain review without recipientless snapshots');
}
{
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.subjects=['Form','EL','MA'];for(const t of f.teachers)t.cells=f.blank();for(const t of f.teachers.slice(0,3))t.cells[2]=['Form','4A','C1-01',''];
 const pub=()=>f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none'});
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2]});f.O.reconcile(f.state,f.ctx);pub();const old=f.state.assignments[0];assert(old,'fixture requires explicitly saved initial shared cover');f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[old.demandId],staffId:'dora'});f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'dora',date:f.date,typeId:'mc',periods:[2]});f.teachers[1].cells[2]=['MA','5B','X',''];f.O.reconcile(f.state,f.ctx);pub();
 assert.equal(old.status,'cancelled','saved replacement supersedes the shared predecessor despite its business warning');assert(!old.publicationWithheldAt);assert(f.state.assignments.some(a=>a.staffId==='dora'&&a.status==='published'&&a.invalidCover));assert.deepEqual(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').cells[2],['MA','5B','X','']);assert(f.state.dailyPublicationStates[f.date].publicReliefRows.some(r=>r.period===2&&r.status==='assigned'&&r.reliefStaffId==='dora'));
 console.log('PASS H saved replacement with a business warning supersedes old shared cover without allocation');
}
{
 const f=setup();assign(f,2,'bob');publish(f,'none');f.teachers[1].cells[2]=['MA','5B','X',''];f.O.reconcile(f.state,f.ctx);publish(f,'none');const ctx={...f.ctx,user:{staffId:'alice',email:'alice@gsps.edu.sg',smc:false,admin:false}};
 assert.equal(f.O.reportView(f.state,ctx,{date:f.date}).assignments.length,1,'absent teacher report presents explicitly published saved cover');assert.equal(f.O.view(f.state,ctx,{date:f.date,view:'report'}).assignments.length,1,'general teacher projection presents explicitly published saved cover');assert(f.O.view(f.state,f.ctx,{date:f.date,view:'allocation'}).assignments.length,'SMC retains review evidence');
 assert(f.state.assignments[0].invalidCover&&f.state.assignments[0].reviewRequired);assert.equal(f.state.outbox.length,0);console.log('PASS H teacher projections show explicitly published saved cover while SMC retains business-warning evidence');
}
