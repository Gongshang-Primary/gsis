'use strict';
const assert=require('node:assert/strict');
const fixture=require('./roster701-fixture.cjs');
const A=require('../shared/roster-allocation.js');
const S=require('../shared/roster-stapler.js');
const timetableMessage='Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.';
let passed=0;
const test=(name,run)=>{run();passed++;console.log('PASS',name);};
const ready=()=>{const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();return f;};
const seedPairs=[['Yasmin','Yasmin (Art)'],['Tseh Chyn','Tseh Chyn (PE)'],['Fae Deng (BT) (MTL)','Fae (BT) (MTL)'],['Nisha','Nisha (Art)'],['Hazmi','Hazmi (Art)'],['Ahyoung (UT)','Ahyoung (UT) (Art)'],['Fadzriel (UT)','Fadzriel (UT) (PE)']];

test('Seven confirmed aliases link timetable names to stable Contacts IDs, once',()=>{
 const {O,state}=fixture(),people=seedPairs.map(([,name],i)=>({id:'teacher-'+i,name,active:true}));
 const blocks=seedPairs.map(([name])=>({name})),matches=O.matchTimetableNames(state,people,blocks);
 assert.deepEqual(matches.map(r=>[r.index,r.person.id]),people.map((p,i)=>[i,p.id]));
 assert.equal(state.nameBridges.length,7);O.matchTimetableNames(state,people,blocks);assert.equal(state.nameBridges.length,7);
 assert.deepEqual(blocks.map(b=>b.name),seedPairs.map(([name])=>name));
 assert.deepEqual(people.map(p=>p.name),seedPairs.map(([,name])=>name));
});

test('Name bridge cannot resolve ambiguous identities or duplicate a teacher in a timetable',()=>{
 const {O,state}=fixture();state.nameBridgesSeeded=true;
 const people=[{id:'one',name:'Yasmin (Art)'},{id:'two',name:'Yasmin'},{id:'three',name:'Yasmin (BT)'}];
 state.nameBridges=[{timetableName:'Yasmin',staffId:'one'}];
 assert.equal(O.matchTimetableNames(state,people,[{name:'Yasmin'}]).length,0,'ambiguous direct identity remains unresolved');
 assert.equal(O.matchTimetableNames(state,people.slice(0,2),[{name:'Yasmin'}])[0].person.id,'two','unique normal match wins');
 assert.equal(O.matchTimetableNames(state,people.slice(0,1),[{name:'Yasmin'},{name:'Yasmin (Art)'}]).length,0,'alias and direct name cannot create duplicate teacher availability');
 state.nameBridges=[{timetableName:'Unknown',staffId:'missing'}];
 assert.equal(O.matchTimetableNames(state,people,[{name:'Unknown'}]).length,0);
 state.nameBridges=[{timetableName:'Unknown',staffId:'one'},{timetableName:'Unknown',staffId:'two'}];
 assert.equal(O.matchTimetableNames(state,people,[{name:'Unknown'}]).length,0,'conflicting alias links remain unresolved');
});

test('Name bridge maintenance is Admin-only and preserves an intentional deletion',()=>{
 const {O,state,ctx}=fixture();ctx.people.push({id:'yasmin',name:'Yasmin (Art)',active:true});ctx.timetableNames=['Alice External','Alice','Yasmin'];
 const teacher={...ctx,user:{...ctx.user,admin:false,smc:false}};
 assert.throws(()=>O.apply(state,teacher,{operation:'saveNameBridge',timetableName:'Alice External',staffId:'alice'}),e=>e.status===403);
 O.apply(state,ctx,{operation:'saveNameBridge',timetableName:'Alice External',staffId:'alice'});
 assert.equal(O.matchTimetableNames(state,ctx.people,[{name:'Alice External'}])[0].person.id,'alice');
 assert.throws(()=>O.apply(state,ctx,{operation:'saveNameBridge',timetableName:'Alice',staffId:'bob'}),e=>e.status===409);
 O.apply(state,ctx,{operation:'deleteNameBridge',timetableName:'Yasmin'});
 assert.equal(O.matchTimetableNames(state,ctx.people,[{name:'Yasmin'}]).length,0,'migration does not recreate a deleted bridge');
});

test('Empty history starts at zero and permits automatic allocation using Deploy R',()=>{
 const f=ready();f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});
 const result=f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
 assert.equal(result.paused,undefined);assert.equal(result.savedIds.length,1);assert.equal(f.state.accountingYears['2026'].verified,true);
 assert.equal(f.state.accountingYears['2026'].mode,'zero-start');
 assert.equal(A.annual(f.state,f.ctx,'alice').completed,0);assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').R,4);
 assert.equal(f.state.outbox.length,0);assert.equal(f.state.publicationSnapshots.length,0);
});

test('Existing historical relief and entitlement are preserved, and broken records are rejected',()=>{
 const f=ready();f.state.importedRelief.push({id:'history',date:'2026-10-05',staffId:'bob',status:'completed',rCost:3,origin:'imported'});
 f.state.entitlements.push({id:'week',staffId:'bob',year:'2026',week:'2026-10-05',quota:8});
 const before=structuredClone(f.state);assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),false);assert.deepEqual(f.state,before);
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,3);assert.equal(A.annual(f.state,f.ctx,'bob').entitlement,8);
 assert.throws(()=>f.O.apply({...f.state,assignments:null},f.ctx,{operation:'autoAllocate',date:f.date}),e=>e.status===503);
});

test('Pruning removes affected annual counts, corrected records and complete weeks, retaining other history',()=>{
 const f=ready();f.state.accountingYears['2026']={verified:true};
 f.state.importedRelief.push({id:'old',date:'2026-10-05',staffId:'bob',period:1,status:'completed',rCost:3,origin:'imported'},{id:'keep',date:'2026-10-12',staffId:'bob',period:2,status:'completed',rCost:1,origin:'imported'});
 f.state.assignments.push({id:'corrected',date:'2026-10-12',staffId:'bob',period:4,status:'completed',rCost:1});
 f.state.reliefCorrections.push({assignmentId:'corrected',sequence:1,actual:{staffId:'bob',date:'2026-10-06',period:3,completionStatus:'completed'}});
 f.state.entitlements.push({id:'old-week',staffId:'bob',year:'2026',week:'2026-10-05',quota:8},{id:'keep-week',staffId:'bob',year:'2026',week:'2026-10-12',quota:4});
 f.state.rotationEvents.push({id:'old-turn',sequence:1,year:'2026',assignmentId:'corrected',staffId:'bob'});
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,5);
 f.O.apply(f.state,f.ctx,{operation:'prune',from:'2026-10-05',to:'2026-10-09',confirm:true});
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,1);assert.equal(A.annual(f.state,f.ctx,'bob').entitlement,4);
 assert.deepEqual(f.state.importedRelief.map(r=>r.id),['keep']);assert.equal(f.state.reliefCorrections.length,0);assert.equal(f.state.rotationEvents.length,0);
 f.O.apply(f.state,f.ctx,{operation:'prune',from:'2026-10-12',to:'2026-10-13',confirm:true});
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,0);assert.equal(A.annual(f.state,f.ctx,'bob').committed,0);
});

test('Sponsor lists admit active SMC teachers and reject SL, AM, OM, SAT and support staff at save',()=>{
 const f=fixture();f.people.forEach(p=>Object.assign(p,{role:'Teacher',adhocEligible:true}));
 const excluded=['SL','AM','OM','SAT'].map(role=>({id:role.toLowerCase(),name:role,role,active:true,adhocEligible:true}));
 excluded.push({id:'support',name:'Support',role:'ICT Associate',groups:['Support'],active:true,adhocEligible:true},{id:'inactive',name:'Inactive',role:'Teacher',active:false,adhocEligible:true});f.people.push(...excluded);f.ctx.smcIds=['alice','charlie',...excluded.map(p=>p.id)];
 const view=f.O.read(f.state,f.ctx,{operation:'staplerDates'});assert.deepEqual(view.sponsors.map(p=>p.id),['alice','charlie']);
 const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
 for(const p of [...excluded,f.people.find(p=>p.id==='dora')])assert.throws(()=>f.O.apply(f.state,teacher,{operation:'requestStapler',date:f.date,sponsorId:p.id}),e=>e.status===400);
 const valid=f.O.apply(f.state,teacher,{operation:'requestStapler',date:f.date,sponsorId:'charlie'});assert.equal(valid.savedIds.length,1);
});

test('Duty roster filters excluded roles and stores an inclusive date range without time fields',()=>{
 const f=fixture();Object.assign(f.people[0],{role:'HOD'});
 const excluded=['SL','AM','OM'].map(role=>({id:role.toLowerCase(),name:role,role,active:true}));f.people.push(...excluded);f.ctx.smcIds=['alice',...excluded.map(p=>p.id)];
 f.ctx.dutySources={[f.date]:{available:true,staffIds:f.ctx.smcIds,source:{kind:'Contacts'}}};
 assert.deepEqual(f.O.read(f.state,f.ctx,{operation:'dutyRoster',date:f.date}).people.map(p=>p.id),['alice']);
 for(const p of excluded)assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'setDutySMC',date:f.date,staffIds:[p.id],startDate:f.date,endDate:'2026-10-16'}),e=>e.status===400);
 f.O.apply(f.state,f.ctx,{operation:'setDutySMC',date:f.date,staffIds:['alice'],startDate:f.date,endDate:'2026-10-16'});
 assert.deepEqual(f.state.smcDutyRoster.map(r=>r.date),['2026-10-14','2026-10-15','2026-10-16']);
 assert(f.state.smcDutyRoster.every(r=>r.startDate===f.date&&r.endDate==='2026-10-16'&&!('start'in r)&&!('end'in r)));
 const row=f.state.smcDutyRoster[0];assert(f.O.dutyWindow(row,'2026-10-16'));assert(!f.O.dutyWindow(row,'2026-10-17'));
});

test('Confirm supports a future date, subsequent saves retain the confirmation, and neither step sends',()=>{
 const f=ready(),future='2026-10-15';f.ctx.days[future]=structuredClone(f.ctx.days[f.date]);f.ctx.baselineDays=f.ctx.days;
 let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:future}).plan;
 const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);
 plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:future,plan,staplerRevision:0});
 f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:future,staplerRevision:1});
 assert.equal(f.state.staplerPlans[0].confirmed,true);assert.equal(f.state.staplerPlans[0].published,undefined);
 let effective=f.O.composeStaplerContext(f.state,f.ctx);assert.equal(effective.days[future].teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');
 plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'charlie',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:future,plan,staplerRevision:1});
 effective=f.O.composeStaplerContext(f.state,f.ctx);assert.equal(effective.days[future].staplerRevision,1);
 assert.equal(effective.days[future].teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');assert.equal(effective.days[future].teachers.find(t=>t.staffId==='charlie').cells[2].some(Boolean),false);
 f.O.refreshStaplerNotifications(f.state,f.ctx);assert.equal(f.state.outbox.length,0);assert.equal(f.state.publicationSnapshots.length,0);
 assert.equal(f.O.read(f.state,f.ctx,{operation:'stapler',date:future}).canConfirm,true);
});

test('Confirm reservations do not turn an empty annual history into an Admin-verification blocker',()=>{
 const f=ready();f.ctx.baselineDays=f.ctx.days;let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
 const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
 const effective=f.O.composeStaplerContext(f.state,f.ctx);f.O.apply(f.state,effective,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[3]});
 const result=f.O.apply(f.state,effective,{operation:'autoAllocate',date:f.date});assert.notEqual(result.paused,true);assert.equal(result.savedIds.length,1);
});

test('Resetting a draft after baseline replacement retains confirmed quota reservations',()=>{
 const f=ready();f.ctx.baselineDays=f.ctx.days;let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
 const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
 assert.equal(A.accounted(f.state).filter(r=>r.origin==='stapler').length,1);
 f.ctx.days[f.date].id='replacement';
 f.O.apply(f.state,f.ctx,{operation:'resetStapler',date:f.date,staplerRevision:1});
 assert.equal(A.accounted(f.state).filter(r=>r.origin==='stapler').length,1);assert.equal(f.state.staplerArchives.length,1);assert.equal(f.state.staplerPlans[0].baselineId,'replacement');
});

test('Normal teachers can read daily reports without receiving recipient or settings details',()=>{
 const f=fixture();f.state.dailyEmploymentSettings={subject:'Private config',time:'08:00',recipients:[{staffId:'alice',emails:['alice@gsps.edu.sg']}]};
 const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',admin:false,smc:false}};
 const result=f.O.read(f.state,teacher,{operation:'dailyEmployment',date:f.date});assert.equal(result.settings,null);assert.deepEqual(result.recipientPeople,[]);assert.deepEqual(result.people,[]);
 assert.throws(()=>f.O.apply(f.state,teacher,{operation:'saveDailyEmploymentSettings'}),e=>e.status===403);
});

test('Publish freezes teacher visibility; explicit Notify captures confirmed Stapler edits independently',()=>{
 const f=ready();f.ctx.baselineDays=f.ctx.days;let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
 const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
 const teacherCtx=id=>({...f.O.composeStaplerContext(f.state,f.ctx),user:{staffId:id,email:id+'@gsps.edu.sg',smc:false,admin:false}});
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('bob'),{date:f.date}).modified.cells[2].some(Boolean),false,'Confirm does not expose unpublicised teaching changes');
 const result=f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none',requestId:'publish-first'});
 assert.equal(result.notificationsQueued,0);assert.equal(f.state.outbox.length,0);assert.equal(f.state.dailyEmploymentMail.length,0);
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('bob'),{date:f.date}).modified.cells[2][0],'EL');
 const published=structuredClone(f.state.dailyPublicationStates[f.date]);
 f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-published'});
 assert.deepEqual(f.state.outbox.map(j=>j.recipientId).sort(),['alice','bob']);
 const oldBob=f.state.outbox.find(j=>j.recipientId==='bob'),originalSnapshot=JSON.stringify(oldBob.data.communicationSnapshot);
 Object.assign(oldBob,{status:'sent',messageId:'wamid.bob-original',completedAt:f.ctx.iso});
 const legacyBob=structuredClone(oldBob);delete legacyBob.data.communicationSnapshot; // Legacy jobs still track the current public version.
 plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'charlie',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:1});
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('bob'),{date:f.date}).modified.cells[2][0],'EL');
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('charlie'),{date:f.date}).modified.cells[2].some(Boolean),false);
 assert.equal(f.O.read(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'dailyNotify',date:f.date}).timetableSource.pendingDraft,true);
 const beforeConfirm=f.state.outbox.length;f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-unconfirmed'});assert.equal(f.state.outbox.length,beforeConfirm,'pending drafts cannot become communication snapshots');
 f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:2});
 const start=f.state.outbox.length;
 f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-saved-draft'});
 const notices=f.state.outbox.slice(start);assert.deepEqual(notices.map(j=>j.recipientId).sort(),['bob','charlie']);
 assert.deepEqual(f.state.dailyPublicationStates[f.date],published,'Explicit communication never publishes saved edits');
 assert.equal(notices.find(j=>j.recipientId==='bob').data.summary,timetableMessage);
 assert(notices.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));
 assert.equal(JSON.stringify(oldBob.data.communicationSnapshot),originalSnapshot,'Accepted communication detail remains immutable');
 const projection=(job,id)=>f.O.communicationProjection(f.state,{purpose:'duties',date:f.date,staffId:id,communicationId:job.id});
 assert.equal(projection(oldBob,'bob').overlay.modified.cells[2][0],'EL');
 assert.equal(projection(notices.find(j=>j.recipientId==='bob'),'bob').overlay.modified.cells[2][0],'');
 assert.equal(projection(notices.find(j=>j.recipientId==='charlie'),'charlie').overlay.modified.cells[2][0],'EL');
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('bob'),{date:f.date}).modified.cells[2][0],'EL');
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('charlie'),{date:f.date}).modified.cells[2].some(Boolean),false);
 const current=f.state.outbox.length;f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'affected',requestId:'publish-update'});assert.equal(f.state.outbox.length,current,'Publish never sends even with legacy notifyMode');
 assert.equal(f.O.dailyTimetable(f.state,teacherCtx('charlie'),{date:f.date}).modified.cells[2][0],'EL');
 assert.match(f.O.notificationCurrent(f.state,legacyBob,f.ctx.now),/superseded/);assert(notices.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));
 const notifyCurrent=f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-current'});assert.equal(f.state.outbox.length,current);assert.equal(notifyCurrent.notificationsQueued,3);assert.equal(notifyCurrent.notificationOutcome.reused,3,'reuse Alice, Bob correction, and Charlie current notices without duplicates');
});

for(const mode of ['all','none'])test('Explicit Notify after legacy publish mode '+mode+' corrects previously notified restorations',()=>{
 const f=ready();f.ctx.baselineDays=f.ctx.days;let plan=f.O.read(f.state,f.ctx,{operation:'stapler',date:f.date}).plan;
 const tile=plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2);plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'bob',period:2});
 f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:0});f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:1});
 const publish=notifyMode=>f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode,requestId:'publish-'+f.state.staplerPlans[0].revision+'-'+notifyMode});
 publish('all');assert.equal(f.state.outbox.length,0,'Publish never sends implicitly');f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-original'});assert.deepEqual(f.state.outbox.map(j=>j.recipientId).sort(),['alice','bob']);
 for(const job of f.state.outbox)Object.assign(job,{status:'sent',messageId:'wamid.original-'+job.recipientId,completedAt:f.ctx.iso});
 plan=S.apply(plan,{type:'move',tileId:tile.id,teacherId:'alice',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',date:f.date,plan,staplerRevision:1});
 f.O.apply(f.state,f.ctx,{operation:'confirmStapler',date:f.date,staplerRevision:2});
 const start=f.state.outbox.length;publish(mode);const restored=f.state.dailyPublicationStates[f.date].teachers;
 assert.equal(restored.length,2);assert(restored.every(t=>!t.changed&&t.updated));
 assert.equal(f.state.outbox.length,start,'Every Publish mode changes visibility without sending');f.O.apply(f.state,f.O.composeStaplerContext(f.state,f.ctx),{operation:'notifyDaily',date:f.date,requestId:'notify-restored'});
 const notices=f.state.outbox.slice(start);assert.deepEqual(notices.map(j=>j.recipientId).sort(),['alice','bob']);
 assert(notices.every(j=>j.data.summary===timetableMessage));assert(notices.every(j=>f.O.notificationCurrent(f.state,j,f.ctx.now)===null));
 const after=f.state.outbox.length;publish('affected');assert.equal(f.state.outbox.length,after,'unchanged update must not queue another restoration notice');
});

test('Duty range edits reject overlaps and preserve unrelated ranges',()=>{
 const f=fixture();f.ctx.smcIds=['alice','bob'];
 for(const d of ['2026-10-14','2026-10-19','2026-10-20'])f.ctx.dutySources={...f.ctx.dutySources,[d]:{available:true,staffIds:f.ctx.smcIds,source:{kind:'Contacts'}}};
 const save=(date,startDate,endDate,staffId='alice')=>f.O.apply(f.state,f.ctx,{operation:'setDutySMC',date,startDate,endDate,staffIds:[staffId]});
 save(f.date,f.date,'2026-10-16');save(f.date,f.date,'2026-10-15');
 assert.deepEqual(f.state.smcDutyRoster.map(r=>r.date).sort(),['2026-10-14','2026-10-15']);
 save(f.date,f.date,'2026-10-18');
 assert.throws(()=>save('2026-10-19','2026-10-17','2026-10-17','bob'),/overlap/);
 save(f.date,f.date,'2026-10-16');
 save('2026-10-19','2026-10-17','2026-10-17','bob');
 save('2026-10-20','2026-10-20','2026-10-21','bob');
 const independent=structuredClone(f.state.smcDutyRoster.filter(r=>r.staffIds[0]==='bob'));
 save(f.date,'2026-10-15','2026-10-16');
 assert.deepEqual(f.state.smcDutyRoster.map(r=>r.date).sort(),['2026-10-15','2026-10-16','2026-10-17','2026-10-20','2026-10-21']);
 assert.deepEqual(f.state.smcDutyRoster.filter(r=>r.staffIds[0]==='bob'),independent);
 assert.equal(new Set(f.state.smcDutyRoster.filter(r=>r.staffIds[0]==='alice').map(r=>r.rangeId)).size,1);
});

test('Existing duty ranges without IDs can be shortened without erasing overwritten dates',()=>{
 const f=fixture();f.ctx.smcIds=['alice','bob'];f.ctx.dutySources={[f.date]:{available:true,staffIds:f.ctx.smcIds,source:{kind:'Contacts'}}};
 f.state.smcDutyRoster=['2026-10-14','2026-10-15','2026-10-16','2026-10-17'].map(date=>({date,startDate:f.date,endDate:'2026-10-17',staffIds:['alice'],updatedAt:'original',updatedBy:'admin',source:{kind:'Contacts'}}));
 Object.assign(f.state.smcDutyRoster.at(-1),{staffIds:['bob'],updatedAt:'independent'});
 f.O.apply(f.state,f.ctx,{operation:'setDutySMC',date:f.date,startDate:f.date,endDate:'2026-10-15',staffIds:['alice']});
 assert.deepEqual(f.state.smcDutyRoster.map(r=>r.date),['2026-10-14','2026-10-15','2026-10-17']);
 assert.equal(f.state.smcDutyRoster.at(-1).staffIds[0],'bob');
});

test('Prune preview exposes entitlement-only history and uses the same full-week boundary as pruning',()=>{
 const f=ready();f.state.entitlements=[{id:'past',staffId:'bob',year:'2026',week:'2026-10-05',quota:8}];
 const partial=f.O.read(f.state,f.ctx,{operation:'prunePreview',from:'2026-10-05',to:'2026-10-08'});assert.equal(partial.count,0);
 const p={from:'2026-10-05',to:'2026-10-09'},preview=f.O.read(f.state,f.ctx,{operation:'prunePreview',...p});assert.equal(preview.counts.entitlements,1);assert.equal(preview.count,1);
 f.O.apply(f.state,f.ctx,{operation:'prune',...p,confirm:true});assert.equal(f.state.entitlements.length,0);
});

test('Prune preview counts corrected relief and linked history even when its original date is outside the range',()=>{
 const f=ready();f.state.assignments.push({id:'corrected',date:'2026-10-12',staffId:'bob',period:4,status:'completed',rCost:1});
 f.state.reliefCorrections.push({assignmentId:'corrected',sequence:1,actual:{staffId:'bob',date:'2026-10-06',period:3,completionStatus:'completed'}});
 f.state.rotationEvents.push({id:'turn',assignmentId:'corrected',date:'2026-10-12'});f.state.publicationSnapshots.push({id:'publication',assignmentId:'corrected',date:'2026-10-12'});f.state.acknowledgements.push({snapshotId:'publication',staffId:'bob'});
 const p={from:'2026-10-05',to:'2026-10-09'},preview=f.O.read(f.state,f.ctx,{operation:'prunePreview',...p});
 for(const key of ['assignments','reliefCorrections','rotationEvents','publicationSnapshots','acknowledgements'])assert.equal(preview.counts[key],1,key);
 assert.equal(preview.count,5);f.O.apply(f.state,f.ctx,{operation:'prune',...p,confirm:true});
 for(const key of ['assignments','reliefCorrections','rotationEvents','publicationSnapshots','acknowledgements'])assert.equal(f.state[key].length,0,key);
});

console.log(passed+' v0.7.11 backend checks passed');

