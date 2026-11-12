'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
function setup({enabled=true,duty=true}={}){const f=fixture();f.ctx.lseNoticeEnabled=enabled;f.ctx.smcIds=['alice'];f.ctx.dutySources={[f.date]:{available:true,staffIds:['alice']}};f.state.smcDutyRoster=duty?[{date:f.date,staffIds:['alice']}]:[];f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=360;f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:0,notifyMode:'none'});f.ctx.now=Date.parse(f.date+'T11:16:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=676;return f;}
const save=(f,extra={})=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'charlie',typeId:'lse',periods:[10,11],...extra});
const notices=f=>f.state.outbox.filter(j=>j.kind==='lse_notice');
{
 const f=setup(),r=save(f);assert.equal(notices(f).length,1);const j=notices(f)[0];assert.equal(j.recipientId,'alice');assert.equal(j.data.absentTeacherName,'Charlie');assert.equal(j.date,f.date);assert.equal(j.data.templateKey,'lse_notice');assert(!f.state.outbox.some(j=>j.data.emergencyAbsence||j.data.templateKey==='absence_update'));
 const again=f.O.apply(f.state,{...f.ctx,resubmission:true},{operation:'saveAbsence',date:f.date,staffId:'charlie',typeId:'lse',periods:[10,11]});assert(again.resubmission);assert.equal(notices(f).length,1);
 save(f,{id:r.savedId,remarks:'Edited'});assert.equal(notices(f).length,1);f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',ids:[r.savedId],confirm:true});assert.equal(notices(f).length,1);save(f);assert.equal(notices(f).length,1,'new report after cancellation cannot repeat the staff/date notice');
}
{
 const f=setup();save(f,{staffIds:['charlie','dora'],staffId:undefined});assert.equal(notices(f).length,2);assert.deepEqual(notices(f).map(j=>j.data.absentTeacherName).sort(),['Charlie','Dora']);
}
for(const options of [{enabled:false},{duty:false}]){const f=setup(options);save(f);assert.equal(notices(f).length,0);const view=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date});assert.equal(view.lseNotices.length,1);assert.match(view.lseNotices[0].reason,options.duty===false?/No duty SMC/:/disabled/);}
{
 const f=setup();save(f,{typeId:'mc'});assert.equal(notices(f).length,0);assert(f.state.outbox.some(j=>j.data.emergencyAbsence),'non-LSE emergency policy is unchanged');
}
console.log('PASS LSE first-save routing, multi-teacher, disabled/no-duty records, deduplication, edit/cancel and urgent exclusion');
module.exports={setup,save,notices};
{
 const adapter=require('./roster701-adapter.cjs'),h=adapter(),f=setup();Object.assign(h.ctx,f.ctx);h.setState(f.state);
 const input={operation:'saveAbsence',requestId:'00000000-0000-4000-8000-000000000123',revision:h.state().revision,date:h.date,staffId:'charlie',typeId:'lse',periods:[10,11]};h.call(input);
 const state=h.state(),job=state.outbox.find(j=>j.kind==='lse_notice');assert(job,'Google adapter queues the same notice');h.ctx.now=Date.parse(h.date+'T23:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 const call=p=>h.scope.rosterServiceDispatch_({input:p});const claimed=call({operation:'claimNotifications',allowedTemplateKeys:['lse_notice']}).notifications;assert.equal(claimed.length,1,'Google sender also bypasses quiet hours with durable proof');assert(call({operation:'prepareNotification',id:claimed[0].id,claimId:claimed[0].claimId,allowedTemplateKeys:['lse_notice']}).notification);assert.equal(h.call(input).replayed,true);
}
{
 const h=require('./roster093b-absence-pipeline.cjs')(),f=setup();Object.assign(h.ctx,f.ctx);h.setState(f.state);const context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=req=>({...context(req),lseNoticeEnabled:req.input.lseNoticeEnabled===true});
 const job=h.make({staffId:'charlie',typeId:'lse',periods:[10,11]}),input={operation:'processAbsenceIntake',requestId:job.requestId,claimId:job.claimId,calendarByDate:{},notificationsReady:true,lseNoticeEnabled:true};
 assert.equal(h.scope.rosterAbsenceIntakeProcess_({input}).absenceApplied,true);assert.equal(h.state().outbox.filter(j=>j.kind==='lse_notice').length,1,'legacy intake pipeline forwards the trusted template activation');
}
