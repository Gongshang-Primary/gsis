'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs'),R=require('../shared/roster.js'),S=require('../shared/roster-stapler.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const f=fixture(),plan=S.create({...f.ctx.days[f.date],date:f.date},{date:f.date});
 f.state.staplerPlans.push({date:f.date,baselineId:plan.baselineId,revision:1,confirmed:true,draft:plan});
 const contacts={rosterPeople:f.people.map(p=>({...p,adhocEligible:true})),user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const index={revision:2,entries:[{id:'replacement',from:'2026-01-01',to:'2026-12-31',priority:2},{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:3,pruned:true}]};
 const input={operation:'read',view:'report',compact:true,date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'even',available:true}}};
 return {...f,plan,contacts,index,input};
}
test('Google report uses saved Stapler cells without reading any baseline model',()=>{
 const f=setup(),h=adapter(),scope=h.scope;vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 Object.assign(scope,{GSISRosterStapler:S,rosterIndex_:()=>f.index,rosterModel_:()=>{assert.fail('A saved Stapler day must not read baseline cells');},rosterOperationsSubjectCatalogue_:()=>({})});
 scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'05':'00';
 const ctx=scope.rosterOperationsContext_({identity:f.ctx.user,input:f.input},f.contacts,f.state);
 assert.equal(ctx.days[f.date].id,S.planId(f.plan));assert.equal(ctx.days[f.date].teachers[0].cells[2][0],'EL');
});
test('D1 report uses saved Stapler cells with no baseline model in its model map',async()=>{
 const {edgeRosterContextFromReferences}=await import('../roster-update/public/edge-roster-context.js'),f=setup();
 const ctx=edgeRosterContextFromReferences({state:f.state,input:f.input,who:f.ctx.user,contacts:f.contacts,index:f.index,models:new Map(),quota:{rows:[]},referenceKey:'test',clock:f.ctx,env:{}});
 assert.equal(ctx.days[f.date].id,S.planId(f.plan));assert.equal(ctx.days[f.date].teachers[0].cells[2][0],'EL');
});
test('Google migration source selects the soft-pruned origin and requires Admin',()=>{
 const f=setup(),h=adapter(),scope=h.scope;vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 const original=copy(f.plan);delete original.daySnapshot;f.state.staplerPlans[0].draft=original;
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>copy(t.cells)).flat()}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:copy(week),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 Object.assign(scope,{GSISRosterStapler:S,rosterIndex_:()=>f.index,rosterModel_:entry=>{assert.equal(entry.id,'baseline');return model;},rosterOperationsSubjectCatalogue_:()=>({}),CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{}})}});
 scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'05':'00';
 const input={...f.input,operation:'previewStaplerMigration',view:'staplerMigration'},ctx=scope.rosterOperationsContext_({identity:f.ctx.user,input},f.contacts,f.state);
 const origin=ctx.staplerOriginDays[f.date];assert.equal((Array.isArray(origin)?origin[0]:origin).id,'baseline');
 assert.throws(()=>scope.rosterOperationsContext_({identity:f.ctx.user,input},{...f.contacts,user:{...f.contacts.user,rosterAdmin:false}},f.state),/Admin|administrator/i);
});
test('D1 migration source selects the soft-pruned origin',async()=>{
 const {edgeRosterContextFromReferences}=await import('../roster-update/public/edge-roster-context.js'),f=setup();delete f.plan.daySnapshot;
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>copy(t.cells)).flat()}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:copy(week),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 const ctx=edgeRosterContextFromReferences({state:f.state,input:{...f.input,operation:'previewStaplerMigration',view:'staplerMigration'},who:f.ctx.user,contacts:f.contacts,index:f.index,models:new Map([['baseline',model]]),quota:{rows:[]},referenceKey:'test',clock:f.ctx,env:{}});
 const origin=ctx.staplerOriginDays[f.date];assert.equal((Array.isArray(origin)?origin[0]:origin).id,'baseline');
});
test('Google and D1 legacy Stapler notices survive origin pruning',()=>{
 const f=setup(),O=f.O,A=require('../shared/roster-allocation.js');f.ctx.now=Date.parse(f.date+'T09:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 Object.assign(f.state.staplerPlans[0],{published:f.plan,publishedRevision:1,publishedAt:f.ctx.iso,notifiedFingerprints:{alice:'baseline'}});
 const job={id:'notice',kind:'stapler_timetable',date:f.date,recipientId:'alice',createdAt:f.ctx.iso,expiresAt:f.ctx.now+3600000,data:{templateKey:'stapler_timetable',fingerprint:'baseline'}};
 const scope=vm.createContext({GSISRoster:R,GSISRosterOperations:O,GSISRosterAllocation:A,GSISRosterStapler:S,rosterIndex_:()=>f.index});
 vm.runInContext(fs.readFileSync('shared/edge-notification-model.js','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 const fresh={rosterPeople:f.people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],timetableEntries:f.index.entries};
 for(const eligible of [scope.GSiSEdgeNotifications.eligible,scope.rosterNotificationEligible_])assert.equal(eligible(f.state,copy(job),f.ctx.now,fresh,O.notificationIndex(f.state),new Set(['stapler_timetable'])),null);
});
test('Google dispatch migration is preview-only until digest apply and receipt retries remain safe',()=>{
 const h=adapter(),plan=S.create({...h.ctx.days[h.date],date:h.date},{date:h.date});delete plan.daySnapshot;delete plan.id;
 h.ctx.staplerOriginDays={[h.date]:copy(h.ctx.days[h.date])};
 const state=h.O.initial();state.staplerPlans.push({date:h.date,baselineId:plan.baselineId,revision:1,confirmed:true,draft:plan});h.setState(state);
 const preview=h.call({operation:'previewStaplerMigration',date:h.date});assert.equal(preview.ready,true);assert.equal(h.calls.writes,0);
 const command={operation:'migrateStaplerPlans',date:h.date,view:'timetableReview',revision:0,requestId:require('node:crypto').randomUUID(),previewDigest:preview.digest};
 const applied=h.call(command);assert.equal(applied.migrated,1);assert(applied.affectedDomains.includes('suspended'));assert.deepEqual(Array.from(applied.affectedDates),[h.date]);
 assert.equal(h.call(command).replayed,true);assert.equal(h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'receiptStatus',command}},{rosterPeople:h.people,user:{rosterStaffId:'alice',rosterAdmin:true,rosterSMC:true},rosterSMCIds:['alice'],rosterAdminIds:['alice']}).accepted,true);
 assert.equal(h.call({operation:'previewStaplerMigration',date:h.date}).needed,0);
});
test('Google direct timetableDay never reads baseline cells for a saved Stapler plan',()=>{
 const f=setup(),h=adapter();Object.assign(f.state.staplerPlans[0],{confirmedPlan:f.plan,confirmedRevision:1});h.setState(f.state);Object.assign(h.scope,{GSISRosterStapler:S,rosterToday_:()=>f.date,rosterIndex_:()=>f.index,rosterModel_:()=>assert.fail('direct saved day must not load baseline')});
 const result=h.scope.rosterOperationsDispatch_({identity:f.ctx.user,input:{operation:'timetableDay',date:f.date}},f.contacts);
 assert.equal(result.baselineId,S.planId(f.plan));assert.equal(result.source,'confirmed');assert.equal(result.teachers[0].cells[2][0],'EL');
});
test('ordinary baseline venue change retains shared lesson ownership during auto-fill',()=>{
 const f=fixture();f.ctx.minute=300;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];f.ctx.subjects=['Form'];
 f.people.push({id:'ed',name:'Ed',active:true,mobile:'6591234567'});f.teachers.push({staffId:'ed',name:'Ed',cells:f.blank(),R:4});
 for(const t of f.teachers)t.cells=f.blank();for(const t of f.teachers.slice(0,3))t.cells[2]=['Form','4A','Room1',''];
 for(const staffId of ['alice','bob','charlie'])f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId,typeId:'mc',date:f.date,periods:[2]});
 f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});const A=require('../shared/roster-allocation.js'),before=copy(A.effectiveAssignments(f.state));assert.equal(before.length,1);
 f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';for(const t of f.teachers.slice(0,3))t.cells[2][2]='Room2';
 f.O.reconcile(f.state,f.ctx);assert.equal(f.O.demand(f.ctx,f.state,f.date)[0].id,before[0].demandId);
 f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert.equal(A.effectiveAssignments(f.state).length,1);assert.equal(A.effectiveAssignments(f.state)[0].id,before[0].id);
});
test('ordinary baseline swap flags newly busy reliever but keeps the surviving lesson assignment',()=>{
 const f=fixture();f.ctx.minute=300;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
 const a=f.state.assignments.find(a=>a.status==='draft'),id=a.id;f.ctx.days[f.date].id='replacement';f.ctx.timetableEntries[0].id='replacement';f.teachers.find(t=>t.staffId===a.staffId).cells[2]=['MA','5B','Room2',''];
 for(let n=0;n<10;n++)f.O.reconcileOperational(f.state,f.ctx,true);
 assert.equal(a.status,'draft');assert.equal(a.id,id);assert.equal(a.reviewRequired,true);assert.match(a.workloadReview,/timetable|Timetabled|review/i);
 assert(f.state.smcAlerts.some(row=>row.code==='TIMETABLE_ASSIGNMENT_REVIEW'));
 f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert.equal(require('../shared/roster-allocation.js').effectiveAssignments(f.state).filter(row=>row.period===2).length,1);
});
test('verified replacement baseline clears an unavailable-timetable manual review without changing cover',()=>{
 const f=fixture();f.ctx.minute=300;f.ctx.baselineDays=f.ctx.days;f.ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const d=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'bob',demandIds:[d.id]});
 const a=f.state.assignments[0],id=a.id;f.ctx.timetableEntries[0].id='replacement';f.ctx.days[f.date].verified=false;f.O.reconcile(f.state,f.ctx);assert.equal(a.invalidCover,true);
 f.ctx.days[f.date].id='replacement';f.ctx.days[f.date].verified=true;f.O.reconcile(f.state,f.ctx);assert(!a.invalidCover);assert.equal(a.reviewRequired,false);assert.equal(a.reviewReason,undefined);assert.equal(a.status,'draft');assert.equal(a.id,id);assert.equal(require('../shared/roster-allocation.js').effectiveAssignments(f.state).length,1);
 const before=JSON.stringify(f.state.assignments);f.O.reconcile(f.state,f.ctx);assert.equal(JSON.stringify(f.state.assignments),before);
});
