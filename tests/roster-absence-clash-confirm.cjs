'use strict';
(async()=>{const {previewAbsenceClash,applyAbsenceClash}=await import('../roster-update/public/edge-absence-clash.js');
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
function setup(){const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.command=periods=>({operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods,reliefRequired:true});f.save=periods=>f.O.apply(f.state,f.ctx,f.command(periods));f.preview=p=>previewAbsenceClash(f.state,f.ctx,p);return f;}
const f=setup();const first=f.save([2]);let p=f.command([3]),preview=f.preview(p);assert.equal(preview.overlaps.length,0);applyAbsenceClash(f.state,f.ctx,{...p,absenceClashToken:preview.token,confirmAbsenceReplacement:false});assert.equal(f.state.absences.filter(a=>!a.deletedAt).length,2,'disjoint report has its own row');
p={...f.command([2,3]),requestId:'new-report'};preview=f.preview(p);assert.equal(preview.overlaps.length,2);const before=JSON.stringify(f.state);assert.throws(()=>applyAbsenceClash(f.state,f.ctx,{...p,absenceClashToken:preview.token,confirmAbsenceReplacement:false}),/Confirm replacement/);assert.equal(JSON.stringify(f.state),before);
const result=applyAbsenceClash(f.state,f.ctx,{...p,absenceClashToken:preview.token,confirmAbsenceReplacement:true});assert.equal(result.replacedIds.length,2);assert.equal(f.state.absences.filter(a=>!a.deletedAt).length,1);assert(f.state.absences.find(a=>a.id===first.savedId).deletedAt);assert(f.state.absences.filter(a=>a.deletedAt).every(a=>a.replacedByRequestId==='new-report'));assert(f.state.audit.some(a=>a.operation==='replaceAbsence'));
const g=setup();g.save([2]);p=g.command([2,3]);preview=g.preview(p);g.state.absences[0].reasonDetail='Changed after preview';const changed=JSON.stringify(g.state);assert.throws(()=>applyAbsenceClash(g.state,g.ctx,{...p,absenceClashToken:preview.token,confirmAbsenceReplacement:true}),/saved absence changed/);assert.equal(JSON.stringify(g.state),changed);
const invalid={...p,typeId:'not-a-type'},validPreview=g.preview(invalid),snapshot=JSON.stringify(g.state);assert.throws(()=>applyAbsenceClash(g.state,g.ctx,{...invalid,absenceClashToken:validPreview.token,confirmAbsenceReplacement:true}));assert.equal(JSON.stringify(g.state),snapshot,'failed new input never deletes old absence');
assert.throws(()=>previewAbsenceClash(g.state,{...g.ctx,user:{staffId:'bob',email:'bob@test.example'}},{...p,operation:'read',view:'absenceClash'}),/SMC/);
// Preserve completed work and unrelated duties; retire only future cover for the replaced row.
const h=setup();h.ctx.attendanceOnly=true;const old=h.save([2,3]).savedId;h.save([6]);
h.state.absences.find(a=>a.id===old).instructions={history:'Original note'};
h.state.assignments.push(
 {id:'completed',absenceId:old,date:h.date,period:2,status:'completed',demandId:'old-2',origin:'smc',version:1,protected:true},
 {id:'future',absenceId:old,date:h.date,period:3,status:'draft',demandId:'old-3'},
 {id:'unrelated',absenceId:'another',date:h.date,period:5,status:'published',demandId:'another-5',origin:'smc',version:1,protected:true}
);
h.ctx.minute=490;h.ctx.now=Date.parse(h.date+'T08:10:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
const historyCommand=h.command([3]),historyPreview=h.preview(historyCommand),unrelated=JSON.stringify(h.state.assignments.find(a=>a.id==='unrelated')),completed=JSON.stringify(h.state.assignments.find(a=>a.id==='completed'));
applyAbsenceClash(h.state,h.ctx,{...historyCommand,absenceClashToken:historyPreview.token,confirmAbsenceReplacement:true});
assert.equal(JSON.stringify(h.state.assignments.find(a=>a.id==='completed')),completed);
assert.equal(JSON.stringify(h.state.assignments.find(a=>a.id==='unrelated')),unrelated);
assert.equal(h.state.assignments.find(a=>a.id==='future').status,'cancelled');
assert.equal(h.state.absences.find(a=>a.id===old).instructions.history,'Original note');
assert(h.state.absences.some(a=>!a.deletedAt&&a.periods.includes(6)));
// Delayed delivery uses the server-recorded capture date, just like the domain
// save. The date changing overnight is not a new backdated user submission.
const delayed=setup(),delayedCommand=delayed.command([2]),delayedPreview=delayed.preview(delayedCommand),capturedAt=delayed.ctx.iso;
delayed.ctx.now+=86400000;delayed.ctx.iso=new Date(delayed.ctx.now).toISOString();delayed.ctx.today=new Date(delayed.ctx.now+28800000).toISOString().slice(0,10);delayed.ctx.attendanceOnly=true;
assert.throws(()=>delayed.preview(delayedCommand),/Past absence/,'new backdated submissions remain blocked');
for(const reportedAt of ['invalid',new Date(delayed.ctx.now+86400000).toISOString()])assert.throws(()=>previewAbsenceClash(delayed.state,{...delayed.ctx,reportedAt},delayedCommand),/Past absence/);
delayed.ctx.reportedAt=capturedAt;
applyAbsenceClash(delayed.state,delayed.ctx,{...delayedCommand,absenceClashToken:delayedPreview.token,confirmAbsenceReplacement:false});
assert.equal(delayed.state.absences.length,1);assert.equal(delayed.state.absences[0].reportedAt,capturedAt);
console.log('PASS disjoint reports, overlap confirmation, atomic replacement/history, stale consent, invalid input rollback and caller privacy');

})().catch(error=>{console.error(error);process.exitCode=1;});
