'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs'),S=require('../shared/roster-stapler.js');
const timetableMessage='Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.';
let count=0;
function test(name,run){run();count++;console.log('PASS',name);}
function ready(f=fixture()){Object.assign(f.ctx.people.find(p=>p.id==='alice'),{adhocEligible:true,role:'HOD',groups:['SMC']});Object.assign(f.ctx,{now:Date.parse(f.date+'T06:00:00+08:00'),minute:360});f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.baselineDays=f.ctx.days;for(const c of f.teachers[0].cells)if(c[1])c[1]='GroupX';return f;}
function draftRelief(f){f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const dem=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[dem.id],staffId:'bob'});}
function publishRelief(f){return f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0});}
function notify(f){return f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date});}
function publishAndNotifyRelief(f){const before=f.state.outbox.length,result=publishRelief(f);assert.equal(f.state.outbox.length,before,'Publish never implicitly sends');notify(f);return result;}
function publishAndNotifyStapler(f){const before=f.state.outbox.length,result=publishStaplerDay(f);assert.equal(f.state.outbox.length,before,'Publish never implicitly sends');notify(f);return result;}
function draftStapler(f,d=f.date){let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:d}).plan;plan=S.apply(plan,{type:'move',tileId:plan.tiles[0].id,teacherId:'bob',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:d,plan,staplerRevision:0});return plan;}
function confirmStapler(f,d=f.date){return f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:d,staplerRevision:f.state.staplerPlans.find(p=>p.date===d).revision});}
function publishStaplerDay(f,notifyMode='affected'){return f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode});}
function service(h,operation,data={}){return h.scope.rosterServiceDispatch_({input:{operation,allowedTemplateKeys:['conditional_relief_instruction','stapler_decision','stapler_request','relief_assignment','stapler_timetable'],...data}});}

test('Daily visibility permits historical SMC correction and rejects future or structurally unverified school days',()=>{
 for(const type of ['relief','stapler'])for(const mode of ['future','past','unverified','holiday']){
  const f=ready();if(type==='relief')draftRelief(f);else{draftStapler(f);confirmStapler(f);}
  if(mode==='future')f.ctx.today='2026-10-13';if(mode==='past')f.ctx.today='2026-10-15';if(mode==='unverified')f.ctx.days[f.date].verified=false;if(mode==='holiday')f.ctx.days[f.date].schoolDay=false;
  const before=JSON.stringify(f.state);if(mode==='past'||type==='stapler'&&['unverified','holiday'].includes(mode)){const result=type==='relief'?publishRelief(f):publishStaplerDay(f);assert(result.publishedRevision>0);assert.equal(f.state.outbox.length,0);if(mode==='past')assert.throws(()=>notify(f),/current or a future day/);else assert.equal(f.state.staplerPlans[0].confirmed,true,'confirmed dated plan retains authority after baseline status changes');}else{assert.throws(()=>type==='relief'?publishRelief(f):publishStaplerDay(f),/Singapore workday|Calendar|without sending/);assert.equal(JSON.stringify(f.state),before);}
  assert.equal(f.O.read(f.state,type==='stapler'?f.O.composeStaplerContext(f.state,f.ctx):f.ctx,{operation:'read',view:'allocation',date:f.date}).canPublish,mode==='past'||type==='stapler'&&['unverified','holiday'].includes(mode));
 }
});
test('Confirm permits valid saved plans independently of historical, future or changed baseline status',()=>{
 for(const mode of ['future','past','unverified','holiday']){
  const f=ready();draftStapler(f);if(mode==='future')f.ctx.today='2026-10-13';if(mode==='past')f.ctx.today='2026-10-15';if(mode==='unverified')f.ctx.days[f.date].verified=false;if(mode==='holiday')f.ctx.days[f.date].schoolDay=false;
  confirmStapler(f);assert.equal(f.state.staplerPlans[0].confirmed,true);assert.equal(f.state.staplerPlans[0].published,undefined);assert.equal(f.state.outbox.length,0);
 }
 const malformed=ready();draftStapler(malformed);malformed.state.staplerPlans[0].draft=structuredClone(malformed.state.staplerPlans[0].draft);malformed.state.staplerPlans[0].draft.periods[2].endMinutes=malformed.state.staplerPlans[0].draft.periods[2].startMinutes;const before=JSON.stringify(malformed.state);assert.throws(()=>confirmStapler(malformed),/period|timing/i);assert.equal(JSON.stringify(malformed.state),before,'structurally invalid saved timing cannot be confirmed');
});
test('Future planning, sponsorship, save and Confirm remain available without publication',()=>{
 const f=ready(),future='2026-10-15';f.ctx.days[future]=structuredClone(f.ctx.days[f.date]);const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false}};
 f.O.apply(f.state,teacher,{operation:'requestStapler',date:future,sponsorId:'alice'});f.O.apply(f.state,f.ctx,{operation:'decideStapler',date:future,id:f.state.staplerRequests[0].id,decision:'approve'});
 const decisions=f.state.outbox.filter(j=>j.kind==='stapler_decision');assert.equal(decisions.length,2);assert(decisions.every(j=>j.data.requesterName==='Bob'));assert(decisions.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));
 const plan=f.O.read(f.state,teacher,{operation:'stapler',date:future}).plan;f.O.apply(f.state,teacher,{operation:'saveStapler',date:future,plan,staplerRevision:0});const notices=f.state.outbox.length;f.O.apply(f.state,teacher,{operation:'confirmStapler',date:future,staplerRevision:1});assert.equal(f.state.staplerPlans[0].confirmed,true);assert.equal(f.state.staplerPlans[0].published,undefined);assert.equal(f.state.outbox.length,notices);
});
test('Backend refreshes Singapore clock after slow preparation before the explicit notification commit',()=>{
 const h=ready(adapter()),f={...h,state:h.state()};draftRelief(f);h.setState(f.state);h.ctx.now=Date.parse(h.date+'T23:59:59+08:00');const original=h.scope.rosterOperationsContext_;
 h.scope.rosterOperationsContext_=req=>{assert.equal(h.locked(),false);const old=original(req);h.ctx.now+=2000;return old;};
 assert.throws(()=>h.call({operation:'notifyDaily',date:h.date,revision:f.state.revision,requestId:crypto.randomUUID()}),/current or a future day/);assert.equal(h.calls.writes,0);assert.equal(h.state().revision,f.state.revision);assert.equal(h.locked(),false);
});
test('A committed publication retries exactly once even after midnight',()=>{
 const h=ready(adapter()),f={...h,state:h.state()};draftRelief(f);h.setState(f.state);const p={operation:'publish',date:h.date,allocationRevision:f.state.dayRevisions[h.date],revision:f.state.revision,requestId:crypto.randomUUID()};
 h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain/);const before=h.state();h.ctx.now=Date.parse('2026-10-15T00:01:00+08:00');h.ctx.today='2026-10-15';assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);assert.deepEqual(h.state(),before);
});
test('Legacy early relief publications need explicit actual-day publish and recover without duplicate notices',()=>{
 const f=ready();draftRelief(f);publishRelief(f);delete f.state.dailyPublicationStates[f.date];f.O.queuePublication(f.state,f.ctx,f.state.publicationSnapshots);
 const oldJobs=f.state.outbox.slice(),early='2026-10-13T06:00:00.000Z';for(const j of oldJobs)j.createdAt=early;
 f.state.assignments.forEach(a=>a.publishedAt=early);f.state.publicationSnapshots.forEach(v=>v.publishedAt=early);
 for(const j of oldJobs){assert.match(f.O.notificationCurrent(f.state,j,f.ctx.now),/Singapore workday|without sending/);j.status='cancelled';}
 const length=f.state.outbox.length;f.O.refreshStaplerNotifications(f.state,f.ctx);assert.equal(f.state.outbox.length,length);
 publishAndNotifyRelief(f);const fresh=f.state.outbox.slice(length);assert(fresh.length);assert(fresh.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));assert(oldJobs.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)!==null));
 const after=f.state.outbox.length;publishRelief(f);assert.equal(f.state.outbox.length,after);
});
test('Expired notification claims cannot prepare after a slow Contacts read crosses midnight',()=>{
 const h=ready(adapter()),f={...h,state:h.state()};draftRelief(f);publishAndNotifyRelief(f);h.setState(f.state);const row=service(h,'claimNotifications').notifications[0];assert(row);
 const contacts=h.scope.rosterServiceContacts_;h.scope.rosterServiceContacts_=()=>{const value=contacts();h.ctx.now=Date.parse('2026-10-15T00:00:01+08:00');return value;};
 // The original claim was made at 06:00 and lasts two minutes. The current
 // clock must reject that expired claim before it can become a prepared send.
 const before=h.state(),writes=h.calls.writes;
 assert.throws(()=>service(h,'prepareNotification',{id:row.id,claimId:row.claimId}),e=>e.status===409&&/claim is stale/.test(e.message));
 assert.deepEqual(h.state(),before);assert.equal(h.calls.writes,writes);assert.equal(h.state().outbox.find(j=>j.id===row.id).preparedAt,null);
 const next=service(h,'claimNotifications');assert.equal(next.notifications.length,0);assert.equal(h.state().outbox.find(j=>j.id===row.id).status,'cancelled');
});
test('Conditional instructions bind absent identity and refresh mobile or school email at send preparation',()=>{
 const h=ready(adapter()),f={...h,state:h.state()};draftRelief(f);f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,text:'Meet the class in the hall.'});publishRelief(f);/* Retained pre-H conditional intent: transport must still bind fresh absent identity. */f.O.queueConditional(f.state,f.ctx,f.state.publicationSnapshots);const queued=f.state.outbox.find(j=>j.kind==='conditional_relief_instruction');assert.equal(queued.data.absentTeacherName,'Alice');assert.equal(queued.data.absentTeacherContact,'https://wa.me/6591234567');queued.data.absentTeacherId='charlie';queued.data.absentTeacherName='Stale';queued.data.absentTeacherContact='https://wa.me/6500000000';h.setState(f.state);
 const row=service(h,'claimNotifications',{allowedTemplateKeys:['conditional_relief_instruction']}).notifications[0];assert.equal(row.data.absentTeacherId,'alice');assert.equal(row.data.absentTeacherName,'Alice');h.people[0].name='Alice Current';h.people[0].mobile='';h.people[0].email='alice@gsps.edu.sg';
 const prepared=service(h,'prepareNotification',{id:row.id,claimId:row.claimId,allowedTemplateKeys:['conditional_relief_instruction']}).notification;assert.equal(prepared.data.absentTeacherName,'Alice Current');assert.equal(prepared.data.absentTeacherContact,'alice@gsps.edu.sg');assert.equal(prepared.recipientId,'bob');
 h.people[0].email='personal@example.com';assert.equal(service(h,'prepareNotification',{id:row.id,claimId:row.claimId,allowedTemplateKeys:['conditional_relief_instruction']}).notification,null);
 assert.equal(f.O.absentTeacherContact({mobile:'not a phone',email:'alice@gsps.edu.sg'}),'alice@gsps.edu.sg');assert.equal(f.O.absentTeacherContact({mobile:'00447912345678',email:''}),'https://wa.me/447912345678');
});
test('Both decision recipients receive the fresh requester name, and future decisions remain valid',()=>{
 const h=ready(adapter()),f={...h,state:h.state()},future='2026-10-15';f.ctx.days[future]=structuredClone(f.ctx.days[f.date]);const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false}};
 f.O.apply(f.state,teacher,{operation:'requestStapler',date:future,sponsorId:'alice'});f.O.apply(f.state,f.ctx,{operation:'decideStapler',date:future,id:f.state.staplerRequests[0].id,decision:'approve'});h.setState(f.state);h.people[1].name='Bob Current';
 const rows=service(h,'claimNotifications',{allowedTemplateKeys:['stapler_decision']}).notifications;assert.equal(rows.length,2);assert(rows.every(j=>j.data.requesterName==='Bob Current'));assert.deepEqual(Array.from(rows,j=>j.recipientId).sort(),['alice','bob']);
});
test('Timetable notice stays compact for changes, suspension and return to baseline while published detail is retained',()=>{
 const f=ready();let plan=draftStapler(f);confirmStapler(f);publishAndNotifyStapler(f);const bob=f.state.outbox.find(j=>j.kind==='stapler_timetable'&&j.recipientId==='bob');assert.equal(bob.data.summary,timetableMessage);assert.equal(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');bob.status='sent';bob.deliveryStatus='delivered';
 const tile=plan.tiles.find(t=>t.teacherId==='bob');plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'alice',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:1});confirmStapler(f);publishAndNotifyStapler(f);const restored=f.state.outbox.filter(j=>j.recipientId==='bob').at(-1);assert.equal(restored.data.summary,timetableMessage);assert.equal(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').cells[2].some(Boolean),false);
 plan=S.apply(plan,{type:'suspend',target:'teacher',targetId:'alice',fromPeriod:2,toPeriod:3,reason:'Invigilation'});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:2});confirmStapler(f);publishAndNotifyStapler(f);assert.equal(f.state.outbox.filter(j=>j.recipientId==='alice').at(-1).data.summary,timetableMessage);assert(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='alice').rows.every(r=>r.subject===''),'suspended periods are blank in the published snapshot');
});
test('Replacing legacy published cover never revives it in either ID order, including removal and no relief',()=>{
 for(const order of ['old-first','draft-first'])for(const mode of ['replace','remove','noRelief']){
  const f=ready();draftRelief(f);publishAndNotifyRelief(f);for(const j of f.state.outbox)j.status='sent';const old=f.state.assignments.find(a=>a.status==='published'),oldId=old.id,early='2026-10-13T06:00:00.000Z';old.id=order==='old-first'?'a-old':'z-old';old.publishedAt=early;
  for(const v of f.state.publicationSnapshots.filter(v=>v.assignmentId===oldId)){v.assignmentId=old.id;v.assignment.id=old.id;v.assignment.publishedAt=early;v.publishedAt=early;}for(const j of f.state.outbox)j.createdAt=early;
  f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[old.demandId],staffId:'charlie'});const replacement=f.state.assignments.find(a=>a.status==='draft');replacement.id=order==='old-first'?'z-new':'a-new';replacement.remove=mode==='remove';replacement.noRelief=mode==='noRelief';const start=f.state.outbox.length;
  publishAndNotifyRelief(f);assert.equal(old.status,'cancelled');assert.equal(old.publishedAt,early,'Original publication history is retained');assert.equal(replacement.status,mode==='remove'?'cancelled':'published');assert.equal(f.state.assignments.filter(a=>a.status==='published'&&!a.noRelief&&!a.remove).length,mode==='replace'?1:0);
  const jobs=f.state.outbox.slice(start).filter(j=>j.data?.communicationSnapshot),cancel=jobs.find(j=>j.recipientId==='bob');assert(cancel,'Old reliever receives the current cancellation');assert.equal(f.O.notificationCurrent(f.state,cancel,f.ctx.now),null);assert.equal(cancel.data.summary,timetableMessage);assert(cancel.data.communicationSnapshot.teachers[0].rows.some(r=>r.period===2&&r.kind==='restored'));assert.equal(jobs.some(j=>j.recipientId==='charlie'),mode==='replace');assert(jobs.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));
  const after=f.state.outbox.length;publishRelief(f);assert.equal(f.state.outbox.length,after);
 }
});
test('Legacy replacement publication keeps its atomic receipt after response loss',()=>{
 const h=ready(adapter()),f={...h,state:h.state()};draftRelief(f);publishRelief(f);const old=f.state.assignments.find(a=>a.status==='published');old.publishedAt='2026-10-13T06:00:00.000Z';f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[old.demandId],staffId:'charlie'});h.setState(f.state);
 const p={operation:'publish',date:h.date,allocationRevision:f.state.dayRevisions[h.date],revision:f.state.revision,requestId:crypto.randomUUID()};h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain/);const committed=h.state();assert.equal(committed.assignments.filter(a=>a.status==='published').length,1);assert.equal(h.call(p).replayed,true);assert.deepEqual(h.state(),committed);assert.equal(h.calls.writes,1);
});
test('SMC publication reminders cannot bypass actual-day publication authority',()=>{
 const f=ready();draftRelief(f);publishRelief(f);const old=f.state.assignments.find(a=>a.status==='published');old.publishedAt='2026-10-13T06:00:00.000Z';for(const v of f.state.publicationSnapshots)v.publishedAt=old.publishedAt;delete f.state.dailyPublicationStates[f.date];
 Object.assign(f.ctx,{service:true,now:Date.parse(f.date+'T07:50:00+08:00'),minute:470});f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.dutySources={[f.date]:{available:true,staffIds:['alice'],source:{versionId:'fixture'}}};f.state.smcDutyRoster=[{date:f.date,staffIds:['alice'],start:'06:00',end:'18:00'}];f.O.scheduledTick(f.state,f.ctx,f.ctx.now);
 const notice=f.state.outbox.find(j=>j.kind==='smc_alert'&&j.data.templateKey==='relief_unacknowledged');assert(notice);assert.match(f.O.notificationCurrent(f.state,notice,f.ctx.now),/Publish these duties/);
 const urgent=structuredClone(notice);urgent.data.templateKey='relief_urgent_smc';assert.match(f.O.notificationCurrent(f.state,urgent,f.ctx.now),/Publish these duties/);
 publishRelief(f);const current=f.state.publicationSnapshots.at(-1),allowed={...urgent,data:{...urgent.data,snapshotIds:[current.id]}};assert.equal(f.O.notificationCurrent(f.state,allowed,f.ctx.now),null);
 const nextDay={...allowed,date:'2026-10-15',createdAt:f.ctx.iso};assert.match(f.O.notificationCurrent(f.state,nextDay,f.ctx.now),/Singapore workday|without sending/);
});
test('A long timetable change condenses notices while preserving every published period',()=>{
 const f=ready();f.teachers[0].cells=f.blank();for(let p=1;p<=12;p++)f.teachers[0].cells[p]=['Mathematics','Group Prudence','Level 4 Classroom','Intervention Group'];let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
 for(const tile of plan.tiles.filter(t=>t.kind==='lesson'))plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:tile.period});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});confirmStapler(f);publishAndNotifyStapler(f);
 const summary=f.state.outbox.find(j=>j.recipientId==='bob'&&j.kind==='stapler_timetable').data.summary;assert.equal(summary,timetableMessage);assert.deepEqual(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').rows.map(r=>r.period),Array.from({length:12},(_,i)=>i+1));
 const modified=f.O.dailyTimetable(f.state,f.O.composeStaplerContext(f.state,{...f.ctx,user:{staffId:'bob',smc:false}}),{date:f.date}).modified.cells;assert.equal(modified.filter(c=>c[0]==='Mathematics').length,12,'Only the notification summary is condensed');
});
console.log(count+' current-workday publication and authoritative notification checks passed');
