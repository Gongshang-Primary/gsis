'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),R=require('../shared/roster.js'),S=require('../shared/roster-stapler.js');
function setup(){
 const f=fixture();f.ctx.minute=300;f.ctx.now=Date.parse(f.date+'T05:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 f.ctx.days[f.date].id='active';f.ctx.baselineDays=f.ctx.days;
 f.ctx.timetableEntries=[{id:'active',from:'2026-01-01',to:'2026-12-31',priority:11,pruned:false},{id:'pruned',from:'2026-01-01',to:'2026-12-31',priority:12,pruned:true}];
 return f;
}
function savedPlan(f){
 const day={...structuredClone(f.ctx.days[f.date]),id:'pruned',date:f.date,formClasses:[]},plan=S.create(day,{date:f.date,venues:[]});
 f.state.staplerPlans.push({date:f.date,baselineId:'pruned',confirmed:true,revision:1,draft:plan});return plan;
}
function adapters(O){
 const scope=vm.createContext({GSISRoster:R,GSISRosterOperations:O});
 const edge=fs.readFileSync('roster-update/public/edge-roster.js','utf8');vm.runInContext(edge.slice(edge.indexOf('function reconcileOperationalState('),edge.indexOf('export async function readRosterMirrorStatus(')),scope);
 const google=fs.readFileSync('backend/RosterOperations.gs','utf8');vm.runInContext(google.slice(google.indexOf('function rosterOperationsReconcile_('),google.indexOf('function rosterOperationsReadReconcile_(')),scope);
 return [(s,c,read)=>scope.reconcileOperationalState(s,c,read),(s,c,read)=>scope.rosterOperationsReconcile_(s,c,read)];
}
function assignments(f,n=6,status='draft'){
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3],revision:0});
 f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,revision:0});
 f.state.smcAlerts=[];f.state.outbox=[];const seed=f.state.assignments[0];assert(seed);f.state.assignments=Array.from({length:n},(_,i)=>({...structuredClone(seed),id:'row-'+i,timetableId:'pruned',status}));return structuredClone(f.state.assignments);
}
test('D1 retained pruned Stapler plan: Auto-allocate then reload twice keeps assignments and confirmed content',async()=>{
 const {edgeRosterContextFromReferences}=await import('../roster-update/public/edge-roster-context.js');
 const f=setup(),plan=savedPlan(f),model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>t.cells).flat()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 const makeContext=(state=f.state)=>edgeRosterContextFromReferences({state,input:{operation:'autoAllocate',date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'single'}}},who:f.ctx.user,contacts:{user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:f.people.map(person=>({...person,adhocEligible:true})),rosterSMCIds:['alice'],rosterAdminIds:['alice']},index:{entries:f.ctx.timetableEntries},models:new Map([['active',model]]),quota:{from:'2026-01-01',to:'2026-12-31',rows:f.people.map(p=>({id:p.id,R:4})),formClasses:[],teachingGroups:[],venues:[]},referenceKey:'fixture',clock:f.ctx,env:{}});
 const ctx=makeContext();assert.equal(ctx.baselineDays[f.date].id,'active');assert.equal(ctx.days[f.date].id,'active');assert.equal(ctx.days[f.date].staplerBaselineId,'pruned');assert.equal(ctx.days[f.date].teachers[0].cells[2][0],'EL');assert.deepEqual(f.state.staplerPlans[0].draft,plan);
 f.O.apply(f.state,ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3],revision:0});f.O.apply(f.state,ctx,{operation:'autoAllocate',date:f.date,revision:0});
 assert.equal(f.state.assignments.length,2);assert(f.state.assignments.every(a=>a.timetableId==='active'));
 for(const reconcile of adapters(f.O)){
  const state=structuredClone(f.state);for(let n=0;n<2;n++){const fresh=makeContext(state);reconcile(state,fresh,true);const read=f.O.read(state,fresh,{operation:'read',view:'allocation',date:f.date});assert.equal(read.timetable.id,'active');assert.equal(read.assignments.filter(a=>a.status==='draft').length,2);}
  assert.equal(state.assignments.length,2);assert(state.assignments.every(a=>a.status==='draft'));assert.deepEqual(state.staplerPlans[0].draft,plan);
 }
});
test('publication keeps original Stapler provenance when comparison baseline is replaced or unavailable',()=>{
 const f=setup();savedPlan(f);const ctx=f.O.composeStaplerContext(f.state,f.ctx);
 f.O.apply(f.state,ctx,{operation:'publish',date:f.date,allocationRevision:0});
 const publication=f.state.dailyPublicationStates[f.date];assert.equal(publication.baselineId,'active');assert.equal(publication.staplerBaselineId,'pruned');
 for(const baselineDays of [{},{[f.date]:{...f.ctx.days[f.date],id:'replacement',teachers:[]}}]){
  const readContext={...ctx,days:baselineDays,baselineDays};
  const own=f.O.dailyTimetable(f.state,readContext,{date:f.date});assert.equal(own.unavailableReason,undefined);assert.equal(own.modified.cells[2][0],'EL');
  const schedule=f.O.timetableDay(f.state,readContext,{date:f.date});assert.equal(schedule.source,'published');assert.equal(schedule.teachers[0].cells[2][0],'EL');
 }
});
test('read mass-cancel guard preserves six mismatched rows and deduplicates its health alert',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup(),before=assignments(f);assert.equal(reconcile(f.state,f.ctx,true),true);
  assert.deepEqual(f.state.assignments,before);assert.equal(f.state.smcAlerts.length,1);assert.equal(f.state.smcAlerts[0].code,'TIMETABLE_RECONCILE_BLOCKED');assert.equal(f.state.smcAlerts[0].affectedCount,6);assert.equal(f.O.healthRead(f.state,f.ctx,{date:f.date}).alerts[0].code,'TIMETABLE_RECONCILE_BLOCKED');assert.equal(f.state.outbox.length,0);
  reconcile(f.state,f.ctx,true);assert.equal(f.state.smcAlerts.length,1);assert.deepEqual(f.state.assignments,before);
  reconcile(f.state,f.ctx,false);assert(f.state.assignments.every(a=>a.status==='cancelled'));
 }
});
test('published guard reports every affected row, stays unchanged on repeat, and saves newly affected rows',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();assignments(f,4,'published');assert.equal(reconcile(f.state,f.ctx,true),true);
  const alert=f.state.smcAlerts[0];assert.equal(alert.affectedCount,4);assert.deepEqual(alert.assignmentIds,['row-0','row-1','row-2','row-3']);
  const before=JSON.stringify(f.state);assert.equal(reconcile(f.state,f.ctx,true),false);assert.equal(JSON.stringify(f.state),before);
  f.state.assignments.push({...structuredClone(f.state.assignments[0]),id:'row-4'});
  assert.equal(reconcile(f.state,f.ctx,true),true);assert.equal(f.state.smcAlerts.length,1);assert.equal(alert.affectedCount,5);assert.deepEqual(alert.assignmentIds,['row-0','row-1','row-2','row-3','row-4']);
  const updated=JSON.stringify(f.state);assert.equal(reconcile(f.state,f.ctx,true),false);assert.equal(JSON.stringify(f.state),updated);
 }
});
function sharedPairs(f,count,published=false){
 assignments(f,1);const seed=f.state.assignments[0];f.state.assignments=[];
 for(let n=0;n<count;n++){
  const prior={...structuredClone(seed),id:'prior-'+n,sharedLessonKey:'shared-'+n,status:published?'published':'draft'},next={...structuredClone(prior),id:'replacement-'+n,status:'draft',origin:'shared-subject',protected:true,replaces:prior.id};
  f.state.assignments.push(prior,next);
 }
}
test('read guard counts shared replacement ancestry before any cancellation',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();sharedPairs(f,3);let calls=0;f.ctx.uuid=()=>{assert(++calls<30,'Reconciliation must be bounded');return 'guard-'+calls;};const before=JSON.stringify(f.state.assignments);reconcile(f.state,f.ctx,true);
  assert.equal(JSON.stringify(f.state.assignments),before);assert.equal(f.state.smcAlerts[0].affectedCount,6);
 }
});
test('a small shared replacement pair never revisits generated removal rows',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();sharedPairs(f,1);let calls=0;f.ctx.uuid=()=>{assert(++calls<30,'Reconciliation must not revisit generated tombstones');return 'new-'+calls;};
  reconcile(f.state,f.ctx,true);assert(f.state.assignments.length<=3);const before=JSON.stringify(f.state.assignments);
  reconcile(f.state,f.ctx,true);assert.equal(JSON.stringify(f.state.assignments),before);
 }
});
test('read preserves a draft replacement of published shared relief without creating a removal',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();sharedPairs(f,1,true);const before=JSON.stringify(f.state.assignments);
  assert.equal(reconcile(f.state,f.ctx,true),true);assert.equal(JSON.stringify(f.state.assignments),before);assert.equal(f.state.smcAlerts[0].affectedCount,2);
  assert.deepEqual(f.state.smcAlerts[0].assignmentIds,['prior-0','replacement-0']);assert.equal(reconcile(f.state,f.ctx,true),false);assert.equal(JSON.stringify(f.state.assignments),before);
 }
});
test('read mass-cancel guard also protects changed lesson sources under the same timetable ID',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();assignments(f);for(const row of f.state.assignments)row.timetableId='active';const before=structuredClone(f.state.assignments);
  f.ctx.days[f.date].teachers[0].cells[2][0]='MA';reconcile(f.state,f.ctx,true);
  assert.deepEqual(f.state.assignments,before);assert.equal(f.state.smcAlerts[0].affectedCount,6);
 }
});
test('read mass-cancel guard protects six deleted-absence rows before changing any of them',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();assignments(f);for(const row of f.state.assignments)row.timetableId='active';f.state.absences[0].deletedAt=f.ctx.iso;
  const before=structuredClone(f.state.assignments);reconcile(f.state,f.ctx,true);assert.deepEqual(f.state.assignments,before);assert.equal(f.state.smcAlerts[0].affectedCount,6);
 }
});
test('cancellation preflight leaves every operational field unchanged',()=>{
 const f=setup();assignments(f);const before=JSON.stringify(f.state),candidates=new Map();f.O.reconcile(f.state,{...f.ctx,reconcilePreflight:candidates});
 assert.equal(candidates.size,6);assert.equal(JSON.stringify(f.state),before);
});
test('preflight does not write protected-assignment workload warnings',()=>{
 const f=setup();assignments(f,1);const row=f.state.assignments[0];row.timetableId='active';row.origin='smc';row.protected=true;
 f.state.systemConfig.maxDailyPeriods=1;f.ctx.quotaRequested=true;
 f.ctx.days[f.date].teachers.find(t=>t.staffId===row.staffId).cells[4]=['EL','4B','C1-02',''];
 const before=JSON.stringify(f.state);f.O.reconcile(f.state,{...f.ctx,reconcilePreflight:new Map()});assert.equal(JSON.stringify(f.state),before);
});
test('read preserves published rows for timetable and absence changes; explicit mutation can cancel',()=>{
 for(const reconcile of adapters(setup().O))for(const reason of ['timetable','absence']){
  const f=setup(),before=assignments(f,1,'published');if(reason==='absence'){f.state.assignments[0].timetableId='active';f.state.absences[0].deletedAt=f.ctx.iso;before[0].timetableId='active';}
  reconcile(f.state,f.ctx,true);assert.deepEqual(f.state.assignments,before);assert.equal(f.state.smcAlerts[0].code,'TIMETABLE_RECONCILE_BLOCKED');
  reconcile(f.state,f.ctx,false);assert.equal(f.state.assignments[0].status,'cancelled');
 }
});
test('read guard permits at most five draft mismatches and leaves unrelated absence reconciliation active',()=>{
 for(const reconcile of adapters(setup().O)){
  const f=setup();assignments(f,5);reconcile(f.state,f.ctx,true);assert(f.state.assignments.every(a=>a.status==='cancelled'));
  const g=setup();assignments(g,1);g.state.assignments[0].timetableId='active';g.state.absences[0].deletedAt=g.ctx.iso;reconcile(g.state,g.ctx,true);assert.equal(g.state.assignments[0].status,'cancelled');
 }
});
test('Google day cache identity changes with resolved timetable and register edits',()=>{
 const source=fs.readFileSync('backend/RosterOperations.gs','utf8'),scope=vm.createContext({GSISRoster:R,GSISRelief:{model:'test'},rosterOperationsDigest_:v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')});
 vm.runInContext(source.slice(source.indexOf('function rosterOperationsAllocationReference_('),source.indexOf('// Cache only prepared baseline inputs.')),scope);
 const f=setup(),index={entries:structuredClone(f.ctx.timetableEntries)},args=[f.state,f.people,index,{calendarByDate:{}},{book:{getId:()=> 'book'},entry:{id:'deploy'}},f.date,[f.date]],first=scope.rosterOperationsAllocationReference_(...args);
 index.entries[0].pruned=true;index.entries[1].pruned=false;assert.notEqual(scope.rosterOperationsAllocationReference_(...args),first);
 const remapped=scope.rosterOperationsAllocationReference_(...args);index.entries[1].priority++;const changed=scope.rosterOperationsAllocationReference_(...args);assert.notEqual(changed,remapped);
 index.entries[1].to=f.date;index.entries[0].pruned=false;index.entries[0].from='2026-10-15';const nextDate='2026-10-15';assert.equal(R.active(index.entries,f.date).id,'pruned');assert.equal(R.active(index.entries,nextDate).id,'active');assert.notEqual(scope.rosterOperationsAllocationReference_(...args.slice(0,6),[nextDate]),scope.rosterOperationsAllocationReference_(...args));
});
