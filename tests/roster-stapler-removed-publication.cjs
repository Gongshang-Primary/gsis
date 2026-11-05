'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const clone=structuredClone;
function ready(publish=true){
 const f=fixture();f.ctx.now=Date.parse(f.date+'T05:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=300;f.ctx.notificationsConfigured=true;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];f.ctx.baselineDays=f.ctx.days;
 for(const t of f.teachers)t.R=100;for(const id of ['charlie','dora'])f.people.find(p=>p.id===id).active=false;
 for(let p=2;p<8;p++)f.teachers[0].cells[p]=['EL','4A','Room '+p,''];f.state.accountingYears['2026']={verified:true};
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3,4,5,6,7],revision:0});f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,revision:0});
 assert.equal(f.state.assignments.filter(a=>a.status==='draft'&&a.staffId==='bob').length,6);
 if(publish)f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,notifyMode:'none',allocationRevision:f.state.dayRevisions[f.date]});f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});
 f.job=f.state.outbox.find(j=>j.kind==='stapler_timetable'&&j.recipientId==='bob');assert(f.job);f.cap={purpose:'duties',staffId:'bob',date:f.date,communicationId:f.job.id,expiresAt:f.ctx.now+86400000};f.recipient={...f.ctx,user:{staffId:'bob',email:'bob@example.test'}};return f;
}
function remove(f,periods){f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';for(const p of periods)f.teachers[0].cells[p]=['','','',''];f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute++;}
const row=f=>f.state.dailyPublicationStates[f.date]?.teachers.find(t=>t.staffId==='bob');
const duties=f=>f.O.resolveDutiesCapability(f.state,f.cap,f.ctx.now).projection;

test('small actual published removal withdraws only missing duties from publication, notices and private links',()=>{
 const f=ready(),before=clone(row(f)),others=clone(f.state.dailyPublicationStates[f.date].teachers.filter(t=>t.staffId!=='bob')),captured=clone(f.job.data.communicationSnapshot),count=f.state.outbox.length;
 remove(f,[2,3]);assert.equal(f.O.reconcileOperational(f.state,f.ctx,true),true);
 assert.deepEqual(row(f).rows.filter(r=>r.kind==='relief').map(r=>r.period),[4,5,6,7]);assert.deepEqual(row(f).cells.slice(4),before.cells.slice(4));assert.deepEqual(f.state.dailyPublicationStates[f.date].teachers.filter(t=>t.staffId!=='bob'),others);
 assert.deepEqual(f.O.dailyTimetable(f.state,f.recipient,{date:f.date}).modified.cells[2],['','','','']);assert.deepEqual(duties(f).duties.map(r=>r.period),[4,5,6,7]);
 assert.equal(f.job.status,'cancelled');assert.match(f.O.notificationCurrent(f.state,f.job,f.ctx.now),/removed|superseded/i);assert.deepEqual(f.job.data.communicationSnapshot,captured,'captured communication evidence stays immutable');assert.equal(f.state.outbox.length,count,'reconcile does not send a new message');
 assert.equal(f.state.publicationSnapshots.filter(v=>v.kind==='cancelled').length,2);assert.equal([...f.O.latestPublications(f.state).values()].filter(v=>v.kind!=='cancelled').length,4);assert.deepEqual(f.O.teacherDailyUpdate(f.state,f.ctx,{date:f.date}).byRelief[0].lessons.map(r=>r.period),[4,5,6,7]);
 const after=JSON.stringify(f.state);assert.equal(f.O.reconcileOperational(f.state,f.ctx,true),false);assert.equal(JSON.stringify(f.state),after,'repeat read is byte-stable');
});

test('sent capability withdrawal preserves acknowledged history but requires review of current cancellation',()=>{
 const f=ready();f.job.status='sent';f.job.completedAt=f.ctx.iso;const shown=duties(f),oldNotice=shown.timetableNotice.id;f.O.acknowledgeDutiesCapability(f.state,f.recipient,f.cap,{timetableNoticeId:oldNotice,snapshotIds:shown.timetableNotice.snapshotIds});const acks=clone(f.state.acknowledgements),job=clone(f.job);
 remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);const current=duties(f);
 assert.deepEqual(current.duties.map(r=>r.period),[4,5,6,7]);assert.equal(current.updatedSinceMessage,true);assert.notEqual(current.timetableNotice.id,oldNotice);assert.equal(current.timetableNotice.status,'pending');assert.deepEqual(f.state.acknowledgements,acks);assert.deepEqual(f.job,job,'sent provider evidence is unchanged');
 assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,f.recipient,f.cap,{timetableNoticeId:oldNotice,snapshotIds:[]}),e=>e.status===409);
 f.O.acknowledgeDutiesCapability(f.state,f.recipient,f.cap,{timetableNoticeId:current.timetableNotice.id,snapshotIds:current.timetableNotice.snapshotIds});assert.equal(duties(f).timetableNotice.status,'acknowledged');
});

test('withdrawal never republishes an unrelated unsent draft or replaces newer authorized communication details',()=>{
 const f=ready(),saved=clone(row(f));f.state.assignments.find(a=>a.period===4).instructions='Explicit communicated instructions';f.ctx.now+=30000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});const newer=f.state.outbox.filter(j=>j.kind==='stapler_timetable').at(-1);assert.notEqual(newer.id,f.job.id);
 f.state.assignments.find(a=>a.period===5).instructions='UNSENT DRAFT';f.state.absences[0].instructions={unrelated:'UNSENT INSTRUCTION'};
 remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);
 assert.deepEqual(row(f).cells[4],saved.cells[4]);assert.deepEqual(row(f).cells[5],saved.cells[5]);const current=duties(f);assert.equal(current.duties.find(r=>r.period===4).instructions,'Explicit communicated instructions');assert.equal(current.duties.find(r=>r.period===5).instructions,'');assert(!JSON.stringify(current).includes('UNSENT'));assert.notEqual(current.timetableNotice.id,row(f).noticeId,'different remaining authorized content cannot share acknowledgement identity');
 assert.deepEqual(current.duties.map(r=>r.period),[4,5,6,7]);assert.equal(newer.status,'cancelled');
});

test('large published removal guard changes no assignment publication communication or acknowledgement',()=>{
 const f=ready(),before=JSON.stringify([f.state.assignments,f.state.dailyPublicationStates,f.state.publicationSnapshots,f.state.outbox,f.state.acknowledgements]);remove(f,[2,3,4]);f.O.reconcileOperational(f.state,f.ctx,true);assert.equal(JSON.stringify([f.state.assignments,f.state.dailyPublicationStates,f.state.publicationSnapshots,f.state.outbox,f.state.acknowledgements]),before);assert(f.state.smcAlerts.some(a=>a.code==='TIMETABLE_RECONCILE_BLOCKED'));
});

test('legacy published cancellation still writes cancellation snapshots and excludes released duties',()=>{
 const f=ready();delete f.state.dailyPublicationStates[f.date];f.state.outbox=[];remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);assert.deepEqual([...f.O.latestPublications(f.state).values()].filter(v=>v.kind!=='cancelled').map(v=>v.period),[4,5,6,7]);assert.equal(f.state.publicationSnapshots.filter(v=>v.kind==='cancelled').length,2);assert(f.state.outbox.filter(j=>j.kind==='relief_publication').every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));assert.deepEqual(f.O.dailyTimetable(f.state,f.recipient,{date:f.date}).modified.cells[2],['','','','']);
});

test('Google and D1 eligibility reject a stale captured notice after targeted withdrawal',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=ready(),scope=vm.createContext({GSISRosterOperations:f.O,GSISRosterAllocation:require('../shared/roster-allocation.js'),GSISRoster:require('../shared/roster.js'),GSISRosterStapler:require('../shared/roster-stapler.js')});
 vm.runInContext(fs.readFileSync('shared/edge-notification-model.js','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);
 for(const eligible of [scope.GSiSEdgeNotifications.eligible,scope.rosterNotificationEligible_])assert.match(eligible(f.state,clone(f.job),f.ctx.now,{rosterPeople:f.people},f.O.notificationIndex(f.state),new Set(['stapler_timetable'])),/removed|superseded/i);
});

test('legacy recipient communication is withdrawn without a modern daily publication',()=>{
 const f=ready();delete f.state.dailyPublicationStates[f.date];const captured=clone(f.job.data.communicationSnapshot);remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);
 assert.deepEqual(duties(f).duties.map(r=>r.period),[4,5,6,7]);assert.deepEqual(f.job.data.communicationSnapshot,captured);assert.equal(f.job.status,'cancelled');assert.equal(f.state.dailyPublicationStates[f.date],undefined);
});

test('an explicitly communicated draft duty is withdrawn without publishing other drafts',()=>{
 const f=ready(false);remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);
 assert.deepEqual(duties(f).duties.map(r=>r.period),[4,5,6,7]);assert.equal(f.job.status,'cancelled');assert(f.state.assignments.filter(a=>a.period>=4).every(a=>a.status==='draft'));assert.equal(f.state.dailyPublicationStates[f.date],undefined);
});

test('withdrawal leaves in-flight uncertain and delivered provider evidence intact while rejecting stale content',()=>{
 for(const status of ['sending','uncertain','delivered']){const f=ready();if(status==='delivered')f.job.deliveryStatus=status;else f.job.status=status;const before=clone(f.job);remove(f,[2,3]);f.O.reconcileOperational(f.state,f.ctx,true);assert.deepEqual(f.job,before,status);assert.match(f.O.notificationCurrent(f.state,f.job,f.ctx.now),/removed|superseded/i);assert.deepEqual(duties(f).duties.map(r=>r.period),[4,5,6,7]);}
});

for(const removedStaffId of ['alice','charlie'])test('same-period withdrawal rebuilds captured duties after removing '+removedStaffId,()=>{
 const f=fixture();f.ctx.now=Date.parse(f.date+'T05:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=300;f.ctx.notificationsConfigured=true;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];f.teachers.find(t=>t.staffId==='charlie').cells[2]=['SC','5B','Science room','Science group'];
 for(const staffId of ['alice','charlie']){f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId,typeId:'mc',periods:[2]});const absence=f.state.absences.find(a=>a.staffId===staffId),lesson=f.O.previewAbsence(f.ctx,absence)[0];f.O.apply(f.state,f.ctx,{operation:'saveInstructions',date:f.date,absenceId:absence.id,instructions:{[lesson.lessonKey]:staffId+' captured instructions'}});}
 const ds=f.O.demand(f.ctx,f.state,f.date);f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'bob',demandIds:[ds.find(d=>d.staffId==='alice').id]});f.O.apply(f.state,f.ctx,{operation:'combine',date:f.date,staffId:'bob',demandIds:[ds.find(d=>d.staffId==='charlie').id]});
 for(const [staffId,className] of [['alice','4A'],['charlie','5B']])f.state.customInstructions.push({id:'rule-'+staffId,version:1,enabled:true,classNames:[className],text:staffId+' captured conditional'});
 f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});f.job=f.state.outbox.find(j=>j.kind==='stapler_timetable');f.cap={purpose:'duties',staffId:'bob',date:f.date,communicationId:f.job.id,expiresAt:f.ctx.now+86400000};
 const survivor=f.state.assignments.find(a=>a.absentId!==removedStaffId),before=clone(survivor),expected=[survivor.subject,survivor.className,survivor.venue,survivor.groupName||''];f.teachers.find(t=>t.staffId===removedStaffId).cells[2]=['','','',''];f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.reconcileOperational(f.state,f.ctx,true);
 assert.equal(survivor.status,'published');assert.equal(survivor.combination,before.combination);assert.deepEqual(row(f).cells[2],expected);assert.equal(row(f).rows.filter(r=>r.kind==='relief').length,1);
 for(const detail of [row(f).rows.find(r=>r.kind==='relief'),duties(f).duties[0]]){assert.equal(detail.subject,survivor.subject);assert.equal(detail.className,survivor.className);assert.equal(detail.venue,survivor.venue);assert.equal(detail.absentId,survivor.absentId);assert.equal(detail.absentName,survivor.absentName);assert.equal(detail.instructions,survivor.instructions);assert.equal(!!detail.combination,!!survivor.combination);}
 assert.deepEqual(row(f).publishedInstructions.map(r=>r.instructions),[survivor.instructions]);assert.deepEqual(duties(f).timetableNotice.publishedInstructions.map(r=>r.instructions),[survivor.instructions]);assert(!JSON.stringify(duties(f).duties).includes(removedStaffId+' captured instructions'));assert.deepEqual(duties(f).timetableNotice.publishedInstructions[0].conditionalInstructions,[survivor.absentId+' captured conditional']);
});

test('sequential out-of-order withdrawals require a new acknowledgement for the complete cancellation set',()=>{
 const f=ready();remove(f,[3]);f.O.reconcileOperational(f.state,f.ctx,true);const first=duties(f);f.O.acknowledgeDutiesCapability(f.state,f.recipient,f.cap,{timetableNoticeId:first.timetableNotice.id,snapshotIds:first.timetableNotice.snapshotIds});assert.equal(duties(f).timetableNotice.status,'acknowledged');const acknowledged=clone(f.state.acknowledgements);
 remove(f,[2]);f.ctx.days[f.date].id='replacement2';f.ctx.timetableEntries[0].id='replacement2';f.O.reconcileOperational(f.state,f.ctx,true);const next=duties(f);assert.deepEqual(next.duties.map(r=>r.period),[4,5,6,7]);assert.notEqual(next.timetableNotice.id,first.timetableNotice.id);assert.equal(next.timetableNotice.status,'pending');assert.deepEqual(f.state.acknowledgements,acknowledged);assert.throws(()=>f.O.acknowledgeDutiesCapability(f.state,f.recipient,f.cap,{timetableNoticeId:first.timetableNotice.id,snapshotIds:[]}),e=>e.status===409);
});

test('legacy grouped notice retains surviving duty and updates its summary after one removal',()=>{
 const f=ready();delete f.state.dailyPublicationStates[f.date];f.state.outbox=[];f.O.queuePublication(f.state,f.ctx,[...f.O.latestPublications(f.state).values()].filter(v=>[2,3].includes(v.period)));const grouped=f.state.outbox.find(j=>j.kind==='relief_publication');assert.equal(f.O.notificationCurrent(f.state,grouped,f.ctx.now),null);
 remove(f,[2]);f.O.reconcileOperational(f.state,f.ctx,true);assert.equal(grouped.status,'queued');assert.equal(f.O.notificationCurrent(f.state,grouped,f.ctx.now),null);assert.deepEqual(grouped.data.snapshotIds.map(id=>f.state.publicationSnapshots.find(v=>v.id===id).period),[3]);assert.match(grouped.data.summary,/P3/);assert.doesNotMatch(grouped.data.summary,/P2/);assert(f.state.outbox.some(j=>j!==grouped&&j.kind==='relief_publication'&&j.data.snapshotIds.some(id=>f.state.publicationSnapshots.find(v=>v.id===id)?.kind==='cancelled')));
});

for(const legacy of [true,false])test((legacy?'old':'new')+' communicated draft combination retains captured baseline and surviving same-class duty',()=>{
 const f=fixture();f.ctx.now=Date.parse(f.date+'T05:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=300;f.ctx.notificationsConfigured=true;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];
 for(const [id,cell] of [['bob',['MA','3P','RoomB','']],['alice',['EL','3P','RoomA','']],['charlie',['SC','5B','RoomC','']]])f.teachers.find(t=>t.staffId===id).cells[2]=cell;
 for(const staffId of ['alice','charlie'])f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId,typeId:'mc',periods:[2]});
 for(const staffId of ['alice','charlie'])f.O.apply(f.state,f.ctx,{operation:'combine',date:f.date,staffId:'bob',demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.staffId===staffId).id]});
 const survivor=f.state.assignments.find(a=>a.absentId==='alice');assert.equal(survivor.combination,true);assert.equal(survivor.sameClass,true);f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});assert.equal(f.state.publicationSnapshots.length,0);assert.equal(f.state.dailyPublicationStates[f.date],undefined);
 f.job=f.state.outbox.find(j=>j.kind==='stapler_timetable');f.cap={purpose:'duties',staffId:'bob',date:f.date,communicationId:f.job.id,expiresAt:f.ctx.now+86400000};const captured=f.job.data.communicationSnapshot.teachers[0];assert.equal(captured.cells[2][0],'MA + EL + SC');
 if(legacy)delete captured.capturedDuties;else {assert(captured.capturedDuties.some(d=>d.assignmentId===survivor.id&&d.combination&&d.sameClass));assert(captured.capturedDuties.every(d=>Object.keys(d).every(k=>['assignmentId','combination','sameClass','absentName','absentIds','absenceIds','members','assignedBy'].includes(k))));assert(f.O.dailyNotifyView(f.state,f.ctx,{date:f.date}).teachers.every(t=>!Object.hasOwn(t,'capturedDuties')),'capture metadata stays outside the public notification projection');}
 const original=clone(f.job.data.communicationSnapshot);f.teachers.find(t=>t.staffId==='charlie').cells[2]=['','','',''];f.teachers.find(t=>t.staffId==='bob').cells[2]=['UNRELATED LIVE DRAFT','9Z','Unsaved room',''];f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.reconcileOperational(f.state,f.ctx,true);
 const current=duties(f);assert.deepEqual(current.overlay.modified.cells[2],['MA + EL','3P + 3P','RoomB + RoomA','']);assert.equal(current.duties.length,1);assert.equal(current.duties[0].subject,'EL');assert.equal(current.duties[0].absentId,'alice');assert.equal(current.duties[0].combination,true);assert.equal(current.duties[0].sameClass,true);assert(!JSON.stringify(current).includes('UNRELATED'));assert.deepEqual(f.job.data.communicationSnapshot,original);assert.equal(f.state.dailyPublicationStates[f.date],undefined);
});

test('same-period withdrawal respects captured duty order across UUID permutations and every removed role',()=>{
 const permutations=[['alice','charlie','dora'],['alice','dora','charlie'],['charlie','alice','dora'],['charlie','dora','alice'],['dora','alice','charlie'],['dora','charlie','alice']];
 for(const legacy of [true,false])for(const order of permutations)for(const removed of ['alice','charlie','dora']){
  const label=JSON.stringify({legacy,order,removed}),f=fixture();f.ctx.now=Date.parse(f.date+'T05:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=300;f.ctx.notificationsConfigured=true;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];
  for(const [id,cell] of [['alice',['EL','4A','RoomA','']],['charlie',['MA','4A','RoomC','']],['dora',['SC','5B','RoomD','']]]){f.teachers.find(t=>t.staffId===id).cells[2]=cell;f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:id,typeId:'mc',periods:[2]});}
  for(const [id,operation] of [['alice','assign'],['charlie','combine'],['dora','combine']])f.O.apply(f.state,f.ctx,{operation,date:f.date,staffId:'bob',demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.staffId===id).id]});
  // Assignment IDs are opaque. Their lexical order must not control cell composition.
  order.forEach((id,i)=>{f.state.assignments.find(a=>a.absentId===id).id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');});
  f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});f.job=f.state.outbox.find(j=>j.kind==='stapler_timetable');f.cap={purpose:'duties',staffId:'bob',date:f.date,communicationId:f.job.id,expiresAt:f.ctx.now+86400000};const captured=f.job.data.communicationSnapshot.teachers[0];if(legacy)delete captured.capturedDuties;const original=clone(f.job.data.communicationSnapshot);
  f.teachers.find(t=>t.staffId===removed).cells[2]=['','','',''];f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.reconcileOperational(f.state,f.ctx,true);
  const kept=['alice','charlie','dora'].filter(id=>id!==removed),current=duties(f),expected=Array.from({length:4},(_,i)=>kept.map(id=>({alice:['EL','4A','RoomA',''],charlie:['MA','4A','RoomC',''],dora:['SC','5B','RoomD','']})[id][i]).filter(Boolean).join(' + '));
  assert.deepEqual(current.overlay.modified.cells[2],expected,label);assert.deepEqual(current.duties.map(r=>r.absentId).sort(),kept.slice().sort(),label);for(const detail of current.duties){assert.equal(detail.combination,detail.absentId!=='alice',label);assert.equal(detail.sameClass,detail.absentId==='charlie',label);}assert.deepEqual(f.job.data.communicationSnapshot,original,label);
 }
});

for(const sent of [false,true])for(const replacement of ['same-recipient-published','other-recipient-published','other-recipient-draft','no-relief-draft'])test('removed lesson withdraws '+(sent?'sent':'queued')+' captured aliases after '+replacement,()=>{
 const published=replacement.endsWith('published'),f=ready(published),original=f.state.assignments.find(a=>a.period===2);if(sent){f.job.status='sent';f.job.completedAt=f.ctx.iso;}const evidence=clone(f.job);f.ctx.now+=30000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.people.find(p=>p.id==='charlie').active=true;
 f.O.apply(f.state,f.ctx,{operation:replacement==='no-relief-draft'?'setNoRelief':'assign',date:f.date,staffId:replacement==='same-recipient-published'?'bob':'charlie',demandIds:[original.demandId],reviewed:true});
 if(published)f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,notifyMode:'none',allocationRevision:f.state.dayRevisions[f.date]});
 const prior=clone(f.job.data.communicationSnapshot),other=clone(row(f)?.cells?.[3]||f.job.data.communicationSnapshot.teachers[0].cells[3]);remove(f,[2]);f.O.reconcileOperational(f.state,f.ctx,true);
 assert.equal(f.job.status,sent?'sent':'cancelled',replacement);if(sent)assert.deepEqual(f.job,evidence);assert.match(f.O.notificationCurrent(f.state,f.job,f.ctx.now),/removed|superseded/i);assert(!f.O.communicationProjection(f.state,f.cap).duties.some(d=>d.period===2),replacement);assert(!duties(f).duties.some(d=>d.period===2),replacement);assert.deepEqual(f.job.data.communicationSnapshot,prior);assert.deepEqual(duties(f).overlay.modified.cells[3],other);
 if(published){assert(!row(f).rows.some(r=>r.period===2&&r.kind==='relief'));assert(![...f.O.latestPublications(f.state).values()].some(v=>v.period===2&&v.kind!=='cancelled'));}
});

test('unrelated replacement lesson does not withdraw old authorized capture content',()=>{
 const f=ready(),original=f.state.assignments.find(a=>a.period===2);f.people.find(p=>p.id==='charlie').active=true;f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'charlie',demandIds:[original.demandId],reviewed:true});const replacement=f.state.assignments.find(a=>a.period===2&&a.status==='draft');replacement.className='5B';f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,notifyMode:'none',allocationRevision:f.state.dayRevisions[f.date]});
 const before=clone(f.O.communicationProjection(f.state,f.cap));f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.reconcileOperational(f.state,f.ctx,true);assert.equal(replacement.status,'cancelled');assert.deepEqual(f.O.communicationProjection(f.state,f.cap),before);assert.equal(f.job.status,'queued');assert.equal(f.O.notificationCurrent(f.state,f.job,f.ctx.now),null);
});

test('a legitimate reinstated lesson and newly captured notice outlive old withdrawal evidence',()=>{
 const f=ready();remove(f,[2]);f.O.reconcileOperational(f.state,f.ctx,true);assert(!duties(f).duties.some(d=>d.period===2));f.ctx.now+=60000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.teachers[0].cells[2]=['EL','4A','Room 2',''];f.ctx.days[f.date].id='reinstated';f.ctx.timetableEntries[0].id='reinstated';
 const demand=f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===2);f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'bob',demandIds:[demand.id],reviewed:true});f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,notifyMode:'none',allocationRevision:f.state.dayRevisions[f.date]});f.O.notifyDaily(f.state,f.ctx,{date:f.date,staffId:'bob'});const current=f.state.outbox.filter(j=>j.kind==='stapler_timetable'&&j.recipientId==='bob').at(-1);assert.notEqual(current.id,f.job.id);assert.equal(f.O.notificationCurrent(f.state,current,f.ctx.now),null);assert(duties(f).duties.some(d=>d.period===2));assert(row(f).rows.some(r=>r.period===2&&r.kind==='relief'));assert.equal(f.job.status,'cancelled');
});
