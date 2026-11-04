'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs');
let checks=0;function test(name,fn){fn();checks++;console.log('PASS',name);}
function ready(f=fixture()){
 f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});
 f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date)[0].id],staffId:'bob'});return f;
}
function publish(f,notifyMode='all'){return f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode});}
function teacher(f,id='bob'){return {...f.ctx,user:{staffId:id,email:id+'@gsps.edu.sg',smc:false,admin:false}};}
function notice(f,id='bob'){return f.O.timetableNotice(f.state,teacher(f,id),{date:f.date});}
function acknowledge(f,id=notice(f).id,who='bob'){return f.O.apply(f.state,teacher(f,who),{operation:'acknowledge',date:f.date,timetableNoticeId:id,snapshotIds:[]});}
test('Every present-period changed teacher has pending acknowledgement; absence-only changes do not qualify',()=>{
 const f=ready();publish(f);const data=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date});
 assert.deepEqual(data.teachers.map(t=>t.staffId),['bob']);assert(data.teachers.every(t=>t.acknowledgement?.status==='pending'));
 assert.equal(notice(f,'alice'),null);assert(f.state.outbox.filter(j=>j.data.dailyPublication).every(j=>j.data.acknowledge===true));
});
test('Acknowledging the viewed timetable also acknowledges its exact duty snapshots once',()=>{
 const f=ready();publish(f);const n=notice(f);assert.equal(n.status,'pending');assert(n.snapshotIds.length);
 const saved=acknowledge(f);assert(saved.savedIds.includes(n.id));assert.equal(notice(f).status,'acknowledged');assert.equal(f.O.pendingPublications(f.state,'bob').length,0);
 const count=f.state.acknowledgements.length;acknowledge(f);assert.equal(f.state.acknowledgements.length,count);
 const row=f.O.dailyNotifyView(f.state,f.ctx,{date:f.date}).teachers.find(t=>t.staffId==='bob');assert(row.acknowledgement.acknowledgedAt);
});
test('Opening and WhatsApp read receipts do not acknowledge; unchanged resend and republish preserve acknowledgement',()=>{
 const f=ready();publish(f);const id=notice(f).id;for(const j of f.state.outbox)j.deliveryStatus='read';notice(f);assert.equal(notice(f).status,'pending');
 acknowledge(f);f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob',requestId:'resend'});publish(f,'affected');assert.equal(notice(f).id,id);assert.equal(notice(f).status,'acknowledged');
 f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===3).id],staffId:'charlie'});publish(f,'affected');assert.equal(notice(f).id,id);assert.equal(notice(f).status,'acknowledged');
});
test('Published instruction change resets only that teacher and rejects the previously viewed timetable',()=>{
 const f=ready();publish(f);acknowledge(f);const old=notice(f).id;assert.equal(notice(f,'alice'),null);
 f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'Use worksheet B.\nKeep the second page.'});publish(f,'affected');
 assert.notEqual(notice(f).id,old);assert.equal(notice(f).status,'pending');assert.equal(notice(f,'alice'),null);
 assert(notice(f).publishedInstructions.some(r=>r.conditionalInstructions.includes('Use worksheet B.\nKeep the second page.')));
 assert.throws(()=>acknowledge(f,old),e=>e.status===409);assert.throws(()=>acknowledge(f,notice(f).id,'charlie'),e=>e.status===403||e.status===409);
});
test('Cancellation and restoration can be acknowledged without any remaining relief duty',()=>{
 const f=ready();publish(f);acknowledge(f);const before=notice(f).id;
 f.O.apply(f.state,f.ctx,{operation:'deleteAbsences',ids:[f.state.absences[0].id],confirm:true});publish(f,'affected');
 const n=notice(f);assert.notEqual(n.id,before);assert.equal(n.status,'pending');assert(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').rows.some(r=>r.kind==='restored'));
 acknowledge(f);assert.equal(notice(f).status,'acknowledged');publish(f,'none');assert.equal(notice(f).id,n.id);assert.equal(notice(f).status,'acknowledged');
});
test('Legacy daily publications become pending without modifying their stored publication on reads',()=>{
 const f=ready();publish(f);for(const row of f.state.dailyPublicationStates[f.date].teachers){delete row.noticeId;delete row.noticePublishedAt;delete row.snapshotIds;delete row.publishedInstructions;}
 const before=JSON.stringify(f.state);const first=notice(f),second=notice(f);assert.equal(first.id,second.id);assert.equal(first.status,'pending');assert.equal(JSON.stringify(f.state),before);
 acknowledge(f,first.id);assert.equal(notice(f).status,'acknowledged');
});
test('Day acknowledgement does not acknowledge an unpublished newer instruction version',()=>{
 const f=ready();publish(f);const visible=notice(f);f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'New instruction not yet in daily publication'});
 const newest=f.state.publicationSnapshots.at(-1);acknowledge(f,visible.id);assert(!f.state.acknowledgements.some(a=>a.snapshotId===newest.id));
 assert(!f.state.acknowledgements.some(a=>a.snapshotId===newest.id));
});
test('Capability acknowledgement is scoped to teacher/date, atomic, idempotent and expires',()=>{
 const h=adapter(),f=ready({...h,state:h.state()});publish(f);h.setState(f.state);const n=notice(f),cap={purpose:'duties',date:f.date,staffId:'bob',expiresAt:f.ctx.now+3600000};
 const call=extra=>h.scope.rosterServiceDispatch_({input:{operation:'externalAcknowledge',capability:cap,timetableNoticeId:n.id,snapshotIds:[],...extra}});
 assert.throws(()=>call({capability:{...cap,staffId:'alice'}}),e=>e.status===403||e.status===409);assert.equal(h.calls.writes,0);
 assert(call().savedIds.includes(n.id));assert.equal(h.calls.writes,1);assert.equal(call().savedIds.length,0);assert.equal(h.calls.writes,1);
 assert.throws(()=>call({capability:{...cap,date:'2026-10-15'}}),e=>e.status===403||e.status===409);
 assert.throws(()=>call({capability:{...cap,expiresAt:f.ctx.now}}),e=>e.status===401);assert(!h.locked());
});
test('Reminder creation and preparation stay on the published instruction snapshot',()=>{
 const f=ready();publish(f);f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});const visible=notice(f),oldId=visible.snapshotIds[0];
 f.ctx.now=Date.parse(f.date+'T06:10:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=370;
 f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'NEW UNPUBLISHED INSTRUCTION'});const newId=f.state.publicationSnapshots.at(-1).id;
 f.ctx.now=Date.parse(f.date+'T07:40:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=460;f.ctx.service=true;
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);const reminders=f.state.outbox.filter(j=>j.kind==='relief_reminder');assert(reminders.length);assert(reminders.every(j=>j.data.snapshotIds.includes(oldId)&&!j.data.snapshotIds.includes(newId)));
 assert.equal(f.O.notificationCurrent(f.state,reminders[0],f.ctx.now),null);assert(!reminders[0].data.summary.includes('NEW UNPUBLISHED'));
 const stale={...structuredClone(reminders[0]),data:{...reminders[0].data,snapshotIds:[newId]}};assert.match(f.O.notificationCurrent(f.state,stale,f.ctx.now),/superseded|published/i);
 acknowledge(f);f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute++;f.O.scheduledTick(f.state,f.ctx,f.ctx.now);assert(!f.state.outbox.some(j=>j.kind==='relief_reminder'&&j.status==='queued'));assert(!f.O.pendingPublications(f.state,'bob').length);
});
test('Private read shows the exact published duties and instructions attached to its notice',()=>{
 const h=adapter(),f=ready({...h,state:h.state()});f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'PUBLISHED INSTRUCTION'});publish(f);const oldId=notice(f).id;
 f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,periods:[2],text:'HIDDEN UNTIL PUBLISHED'});h.setState(f.state);
 const cap={purpose:'duties',staffId:'bob',date:f.date,expiresAt:f.ctx.now+3600000},data=h.scope.rosterServiceDispatch_({input:{operation:'externalDuties',capability:cap}});
 assert.equal(data.timetableNotice.id,oldId);assert.equal(data.linkExpiresAt,cap.expiresAt);assert(data.timetableNotice.publishedInstructions.some(r=>r.conditionalInstructions.includes('PUBLISHED INSTRUCTION')));
 assert(!JSON.stringify(data).includes('HIDDEN UNTIL'),'unpublished instructions must not leak through history');assert(data.pendingNotices.every(v=>data.timetableNotice.snapshotIds.includes(v.id)));assert(data.duties.length);assert.equal(data.overlay.modified.cells[2][0],'EL');
 const absent=h.scope.rosterServiceDispatch_({input:{operation:'externalDuties',capability:{...cap,staffId:'alice'}}});assert(!JSON.stringify(absent).includes('HIDDEN UNTIL'));
 const mine=f.O.view(f.state,teacher(f),{view:'duties',date:f.date});assert(!JSON.stringify(mine).includes('HIDDEN UNTIL'));assert(mine.timetableNotices.some(n=>n.id===oldId&&n.timetable.date===f.date));
});
test('Legacy Stapler notifications require a stable acknowledgement including return to baseline',()=>{
 const S=require('../shared/roster-stapler.js'),f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;const original=plan.tiles[0],tileId=original.id,owner=original.teacherId;
 plan=S.apply(plan,{type:'move',tileId,teacherId:'bob',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});
 const record=f.state.staplerPlans[0];record.published=structuredClone(plan);record.publishedAt=f.ctx.iso;record.publishedRevision=1;record.confirmed=false;
 f.O.refreshStaplerNotifications(f.state,f.ctx);assert(!f.state.dailyPublicationStates[f.date]);const n=notice(f);assert(n?.id);assert.equal(n.status,'pending');
 assert(f.state.outbox.filter(j=>j.kind==='stapler_timetable').every(j=>j.data.acknowledge===true));acknowledge(f);f.O.refreshStaplerNotifications(f.state,f.ctx);assert.equal(notice(f).id,n.id);assert.equal(notice(f).status,'acknowledged');
 plan=S.apply(plan,{type:'move',tileId,teacherId:owner,period:original.period});record.published=plan;record.publishedRevision=2;f.O.refreshStaplerNotifications(f.state,f.ctx);assert.notEqual(notice(f).id,n.id);assert.equal(notice(f).status,'pending');acknowledge(f);assert.equal(notice(f).status,'acknowledged');
});
test('legacy private Stapler notice remains acknowledgeable',()=>{
 const h=adapter(),s=h.state(),S=require('../shared/roster-stapler.js');Object.assign(h.ctx,{minute:360,now:Date.parse(h.date+'T06:00:00+08:00')});h.ctx.iso=new Date(h.ctx.now).toISOString();h.ctx.baselineDays=structuredClone(h.ctx.days);
 let plan=h.O.read(s,h.ctx,{operation:'stapler',date:h.date}).plan;const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 s.staplerPlans.push({date:h.date,baselineId:'baseline',revision:1,published:plan,publishedRevision:1,publishedAt:h.ctx.iso,notifiedFingerprints:{}});h.O.refreshStaplerNotifications(s,h.ctx);h.setState(s);
 const cap={purpose:'duties',staffId:'bob',date:h.date,expiresAt:h.ctx.now+86400000},call=input=>h.scope.rosterServiceDispatch_({input:{...input,capability:cap}}),shown=call({operation:'externalDuties'});assert.equal(shown.timetableNotice.status,'pending');
 const saved=call({operation:'externalAcknowledge',timetableNoticeId:shown.timetableNotice.id,snapshotIds:[]});assert(saved.savedIds.includes(shown.timetableNotice.id));assert.equal(call({operation:'externalDuties'}).timetableNotice.status,'acknowledged');
});
console.log(checks+' full timetable acknowledgement checks passed');
