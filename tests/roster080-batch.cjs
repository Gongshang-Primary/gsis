'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
function ready(){const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();f.state.absences.push({id:'absence',date:f.date,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});return f;}
function batch(f,commands){return {operation:'reliefBatch',date:f.date,revision:f.state.revision,commands,expectedTimetableId:'baseline',expectedStaplerRevision:0,expectedParity:'even',expectedDemandSources:Object.fromEntries(f.O.demand(f.ctx,f.state,f.date).map(d=>[d.id,f.O.cellSourceKey(d)]))};}
{
 const f=ready(),p=batch(f,[{operation:'assign',demandIds:['absence:2'],staffId:'bob'},{operation:'assign',demandIds:['absence:3'],staffId:'dora'}]);f.O.apply(f.state,f.ctx,p);assert.equal(A.effectiveAssignments(f.state).length,2,'one ordered batch must apply both assignments');assert.equal(f.state.outbox.length,0);
}
{
 const f=ready(),before=JSON.stringify(f.state),p=batch(f,[{operation:'assign',demandIds:['absence:2'],staffId:'bob'},{operation:'assign',demandIds:['missing'],staffId:'dora'}]);assert.throws(()=>f.O.apply(f.state,f.ctx,p));assert.equal(JSON.stringify(f.state),before,'rejected batch must not partially mutate its input');
}
{
 const f=ready();for(const changes of [{expectedTimetableId:'old'},{expectedParity:'odd'},{expectedStaplerRevision:9},{revision:1},{commands:[{operation:'publish'}]}])assert.throws(()=>f.O.apply(f.state,f.ctx,{...batch(f,[{operation:'unassign',demandIds:['absence:2']}]),...changes}));assert.equal(f.state.assignments.length,0);
}
{
 const f=ready();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:['absence:2'],staffId:'bob'});const published=f.state.assignments[0];published.status='published';published.publishedAt=f.ctx.iso;
 f.O.apply(f.state,f.ctx,batch(f,[{operation:'unassign',demandIds:['absence:2']}]));assert.equal(f.state.assignments.find(a=>a.id===published.id).status,'published','draft clear retains published cover until release');assert.equal(A.effectiveAssignments(f.state).length,0);assert.equal(f.state.outbox.length,0);
 f.O.apply(f.state,f.ctx,batch(f,[{operation:'setNoRelief',demandIds:['absence:2'],noRelief:true,confirm:true}]));assert.equal(A.effectiveAssignments(f.state).filter(a=>a.noRelief).length,1);assert.equal(f.state.assignments.find(a=>a.id===published.id).status,'published');assert.equal(f.state.outbox.length,0);
}
{
 const f=ready(),future='2026-10-15';f.ctx.days[future]=structuredClone(f.ctx.days[f.date]);assert.equal(f.O.systemConfigView(f.state,f.ctx).config.allowAdvancePublishing,false);
 assert.throws(()=>f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,admin:false}},{operation:'saveSystemConfig',...f.state.systemConfig,allowAdvancePublishing:true}),e=>e.status===403);
 f.O.apply(f.state,f.ctx,{operation:'saveSystemConfig',...f.state.systemConfig,allowAdvancePublishing:true});assert.equal(f.state.systemConfig.allowAdvancePublishing,true);assert.equal(f.O.view(f.state,f.ctx,{date:future}).canPublish,true);
 f.O.apply(f.state,f.ctx,{operation:'publish',date:future,allocationRevision:0,notifyMode:'all'});
 f.O.apply(f.state,f.ctx,{operation:'publish',date:future,allocationRevision:0,notifyMode:'none'});assert(f.state.dailyPublicationStates[future]);assert.equal(f.state.outbox.length,0);
 f.O.apply(f.state,f.ctx,{operation:'saveSystemConfig',...f.state.systemConfig,allowAdvancePublishing:false});assert.equal(f.O.view(f.state,f.ctx,{date:future}).canPublish,false);assert(f.state.dailyPublicationStates[future]);
}

for(const command of [{operation:'unassign'},{operation:'setNoRelief',noRelief:true,confirm:true},{operation:'assign',staffId:'dora'}]){
 const f=ready();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:['absence:2'],staffId:'bob'});const original=f.state.assignments[0];original.status='published';original.publishedAt=f.ctx.iso;
 f.O.apply(f.state,f.ctx,batch(f,[{...command,demandIds:['absence:2']}]));assert.equal(f.state.assignments.find(a=>a.id===original.id).status,'published');assert.equal(f.state.outbox.length,0);
 f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none',auditReason:'Reviewed change'});assert.equal(f.state.assignments.find(a=>a.id===original.id).status,'cancelled');assert.equal(f.state.outbox.length,0);
 const effective=A.effectiveAssignments(f.state);assert.equal(effective.length,command.operation==='unassign'?0:1);if(effective.length)assert.equal(effective[0].status,'published');
}
{
 const f=ready();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:['absence:2'],staffId:'bob'});f.state.assignments[0].status='completed';const originalId=f.state.assignments[0].id;Object.assign(f.ctx,{minute:540,now:Date.parse(f.date+'T09:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.apply(f.state,f.ctx,batch(f,[{operation:'unassign',demandIds:['absence:2']}]));assert.equal(f.state.assignments.find(a=>a.id===originalId).status,'completed','manual clear retains prior actual history until publication');assert.equal(A.effectiveAssignments(f.state).length,0);assert.equal(A.manualDecision(f.state,f.date,'absence:2').kind,'empty');f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});assert(A.accounted(f.state).some(a=>a.id===originalId&&a.status==='completed'&&a.actualReviewRequired),'allocation publication preserves the recorded actual outcome for separate review');assert.equal(f.state.reliefCorrections.length,0);
}

for(const separate of [false,true]){
 const f=ready();f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:['absence:2'],staffId:'bob'});f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});
 const published=f.state.assignments.find(a=>a.staffId==='bob'&&a.status==='published'),released=JSON.stringify(f.state.dailyPublicationStates[f.date]),commands=[{operation:'setNoRelief',demandIds:['absence:2'],noRelief:true,confirm:true},{operation:'setNoRelief',demandIds:['absence:2'],noRelief:false}];
 if(separate)for(const command of commands)f.O.apply(f.state,f.ctx,batch(f,[command]));else f.O.apply(f.state,f.ctx,batch(f,commands));
 assert.equal(A.effectiveAssignments(f.state).length,0,'Restore unassigned must not revive replaced published cover');assert.equal(f.state.assignments.find(a=>a.id===published.id).status,'published');assert.equal(JSON.stringify(f.state.dailyPublicationStates[f.date]),released,'released snapshot stays until republish');
 f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none',auditReason:'Restored unassigned'});assert.equal(f.state.assignments.find(a=>a.id===published.id).status,'cancelled');assert.equal(A.effectiveAssignments(f.state).length,0);assert.equal(f.state.outbox.length,0);
}
console.log('PASS relief atomic batch and advance-publication domain checks');
