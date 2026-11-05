'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
function setup(){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','v1']]);Object.assign(h.ctx,{minute:360,now:Date.parse(h.date+'T06:00:00+08:00')});h.ctx.iso=new Date(h.ctx.now).toISOString();
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const state=h.state();state.accountingYears['2026']={verified:true};state.systemConfig.scheduledAllocationEnabled=true;h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 const command=()=>({operation:'autoAllocate',date:h.date,allocationMode:'reoptimise',revision:h.state().revision,requestId:crypto.randomUUID(),expectedDayToken:h.scope.rosterOperationsDayToken_(h.state(),{...h.ctx,timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]},h.date)});
 return {...h,c,command,run:input=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:input||command()},c)};
}
test('unrelated collections and another date absence merge without rerunning a prepared allocation',()=>{
 const h=setup();let attempts=0;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=h.O.apply(s,ctx,p);if(p.operation==='autoAllocate'){attempts++;const live=h.state();live.revision++;live.absences.push({...structuredClone(live.absences[0]),id:'other-date',date:'2026-11-20'});live.peerMail=[{id:'mail',date:h.date,state:'pending'}];live.inboxThreads=[{id:'inbox',date:h.date,unread:1}];live.dayRevisions['2026-11-20']=5;h.setState(live);}return result;}};
 h.run();assert.equal(attempts,1);assert.equal(h.calls.writes,1);assert(h.state().absences.some(a=>a.id==='other-date'));assert.equal(h.state().peerMail[0].id,'mail');assert.equal(h.state().inboxThreads[0].unread,1);assert.equal(h.state().dayRevisions['2026-11-20'],5);
});
for(const change of ['absence','assignment'])test('same-date '+change+' change refuses the stale proposal and preserves the winner',()=>{
 const h=setup();h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=h.O.apply(s,ctx,p);if(p.operation==='autoAllocate'){const live=h.state();live.revision++;if(change==='absence')live.absences[0].remarks='Changed by another user';else live.assignments.push({...structuredClone(s.assignments[0]),id:'winner'});h.setState(live);}return result;}};
 assert.throws(()=>h.run(),e=>e.code==='DAY_CONFLICT');assert.equal(h.calls.writes,0);assert.equal(h.state().assignments.length,change==='assignment'?1:0);
});
test('scheduled Google cycle skips a preparing SMC run without any operations or Contacts read',()=>{
 const h=setup(),run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c),before=h.state(),reads=h.calls.reads;
 h.scope.rosterServiceContacts_=()=>{throw Error('Scheduled cycle must not load Contacts while SMC owns the date');};
 const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});
 assert.equal(result.code,'SKIPPED_BUSY');assert.equal(result.allocationSkipped,true);assert.equal(h.calls.reads,reads);assert.equal(h.scope.rosterAllocationRunRead_(h.date).fence,run.fence);assert.deepEqual(h.state(),before);assert.equal(h.calls.writes,0);
});
test('scheduled Google start rechecks SMC ownership under the lock',()=>{
 const h=setup(),start=h.scope.rosterScheduledAllocationStart_;let run;
 h.scope.rosterScheduledAllocationStart_=(...args)=>{run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c);return start(...args);};
 const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});assert.equal(result.code,'SKIPPED_BUSY');assert.equal(h.scope.rosterAllocationRunRead_(h.date).fence,run.fence);assert.equal(h.calls.writes,0);
});
test('D1 scheduler skips a preparing SMC run before hydrating timetable context',async()=>{
 const h=setup(),A=require('../shared/roster-allocation.js'),source=fs.readFileSync('roster-update/public/edge-roster.js','utf8'),clock={...h.ctx};let probes=0;
 const scope=vm.createContext({Date:h.scope.Date,GSISRosterAllocation:A,GSISRosterOperations:h.O,edgeRosterClock:()=>clock,fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});},serviceProbe:async()=>{probes++;return [[{collection:'edgeAllocatorRuns',record_id:'key:'+h.date,value_json:JSON.stringify({id:'manual',date:h.date,trigger:'manual',state:'running',updatedAt:h.ctx.iso})}]];},mutateEdgeRoster:()=>assert.fail('D1 scheduler must not hydrate or write while manual allocation is preparing')});
 vm.runInContext(source.slice(source.indexOf('function edgeManualAllocationBusy('),source.indexOf('\nconst auditSchemas')),scope);
 const result=await scope.runScheduledRoster({}, {scheduledTime:h.ctx.now});assert.equal(result.code,'SKIPPED_BUSY');assert.equal(probes,1);
});
test('Google report-only preparation defers when an SMC run starts before its commit',()=>{
 const h=setup();Object.assign(h.ctx,{minute:420,now:Date.parse(h.date+'T07:00:00+08:00')});h.ctx.iso=new Date(h.ctx.now).toISOString();const state=h.state();state.massPublications[h.date]={at:h.ctx.iso};h.setState(state);let run;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:h.command()},h.c);return {checked:true};}};
 const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});assert.equal(result.code,'SKIPPED_BUSY');assert.equal(h.calls.writes,0);assert.equal(h.scope.rosterAllocationRunRead_(h.date).fence,run.fence);
});
test('D1 rechecks manual ownership when it changes after the scheduler probe',async()=>{
 const h=setup(),source=fs.readFileSync('roster-update/public/edge-roster.js','utf8');let mutations=0;
 const scope=vm.createContext({Date:h.scope.Date,GSISRosterAllocation:require('../shared/roster-allocation.js'),GSISRosterOperations:h.O,edgeRosterClock:()=>h.ctx,sha256Hex:s=>crypto.createHash('sha256').update(s).digest('hex'),fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});},serviceProbe:async()=>[[{collection:'systemConfig',record_id:'key:scheduledAllocationEnabled',value_json:'true'}]],mutateEdgeRoster:async(_,command)=>{mutations++;return command.apply({edgeAllocatorRuns:{[h.date]:{id:'manual',trigger:'manual',state:'running',updatedAt:h.ctx.iso}}},h.ctx);}});
 vm.runInContext(source.slice(source.indexOf('function edgeManualAllocationBusy('),source.indexOf('\nconst auditSchemas')),scope);
 const result=await scope.runScheduledRoster({}, {scheduledTime:h.ctx.now});assert.equal(result.code,'SKIPPED_BUSY');assert.equal(mutations,1);
});
test('an imported relief correction fences period eligibility even when quota totals and day revision are unchanged',()=>{
 const h=setup(),A=require('../shared/roster-allocation.js'),state=h.state();state.systemConfig.maxDailyReliefPeriods=1;state.systemConfig.allocationRuleEnabled={...(state.systemConfig.allocationRuleEnabled||{}),dailyRelief:true};state.importedRelief.push({id:'imported',staffId:'bob',date:h.date,period:2,status:'completed',origin:'imported',rCost:1});
 const p={operation:'scheduledRoster',date:h.date},before=h.scope.rosterOperationsDependencies_(state,p,h.ctx),revision=state.dayRevisions[h.date];assert.equal(A.eligibility(A.teacherContext(state,h.ctx,h.date).get('bob'),2).autoEligible,true);
 h.O.apply(state,h.ctx,{operation:'correctRelief',date:h.date,id:'imported',staffId:'bob',actualDate:h.date,period:3,completionStatus:'completed',reason:'Correct imported period'});
 assert.equal(A.eligibility(A.teacherContext(state,h.ctx,h.date).get('bob'),2).autoEligible,false);assert.equal(state.dayRevisions[h.date],revision);assert.notEqual(h.scope.rosterOperationsDependencies_(state,p,h.ctx),before);
});
test('correction chains entering then leaving the date remain fenced',()=>{
 const h=setup(),state=h.state(),other='2026-10-13';state.importedRelief.push({id:'moved',staffId:'bob',date:other,period:2,status:'completed',origin:'imported',rCost:1});
 const correct=date=>h.O.apply(state,h.ctx,{operation:'correctRelief',date:h.date,id:'moved',staffId:'bob',actualDate:date,period:2,completionStatus:'completed',reason:'Correct date'});
 correct(h.date);const p={operation:'scheduledRoster',date:h.date},before=h.scope.rosterOperationsDependencies_(state,p,h.ctx),token=h.scope.rosterOperationsDayToken_(state,h.ctx,h.date);
 correct(other);assert.notEqual(h.scope.rosterOperationsDependencies_(state,p,h.ctx),before);assert.notEqual(h.scope.rosterOperationsDayToken_(state,h.ctx,h.date),token);
});
function freshAccounting(){
 const h=setup(),A=require('../shared/roster-allocation.js'),state=h.state();state.freshStart={effectiveDate:'2026-10-12',fairnessMode:'opening-balances'};A.initialiseFreshStartAccounting(state,h.ctx,{effectiveDate:'2026-10-12'});
 h.O.apply(state,h.ctx,{operation:'saveOpeningBalances',confirmInitial:true,reason:'Reviewed opening totals',rows:h.people.map(person=>({staffId:person.id,cumulativeQuota:20,cumulativeDone:person.id==='charlie'?1:18,asOfDate:'2026-10-12',version:0}))});h.setState(state);return {...h,A};
}
test('fresh opening corrections change the derived dependency digest and fairness without inventing rotation',()=>{
 const h=freshAccounting(),state=h.state(),command=h.command(),digest=h.scope.rosterOperationsDependencies_(state,command,h.ctx),rotation=h.A.rotation(state,'2026'),dayToken=h.scope.rosterOperationsDayToken_(state,h.ctx,h.date);
 const first=s=>h.A.ranked(s,h.ctx,h.date,2).find(row=>row.autoEligible).staffId;assert.equal(first(state),'charlie');
 h.O.apply(state,h.ctx,{operation:'saveOpeningBalances',reason:'Correct verified opening total',rows:[{staffId:'bob',cumulativeQuota:20,cumulativeDone:0,asOfDate:'2026-10-12',version:1}]});
 assert.equal(first(state),'bob');assert.notEqual(h.scope.rosterOperationsDependencies_(state,command,h.ctx),digest);assert.deepEqual(h.A.rotation(state,'2026'),rotation);assert.equal(h.scope.rosterOperationsDayToken_(state,h.ctx,h.date),dayToken,'an accounting correction does not pretend the edited day changed');
});
test('a concurrent opening correction forces one replan and saves allocation using the corrected fairness',()=>{
 const h=freshAccounting(),state=h.state(),proposals=[];state.absences[0].periods=[2];h.setState(state);
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=h.O.apply(s,ctx,p);if(p.operation==='autoAllocate'){proposals.push(Array.from(s.assignments,row=>row.staffId));if(proposals.length===1){const live=h.state();h.O.apply(live,h.ctx,{operation:'saveOpeningBalances',reason:'Correct while allocator prepares',rows:[{staffId:'bob',cumulativeQuota:20,cumulativeDone:0,asOfDate:'2026-10-12',version:1}]});live.revision++;h.setState(live);}}return result;}};
 h.run();assert.deepEqual(proposals,[['charlie'],['bob']]);assert.equal(h.calls.writes,1);assert.equal(h.state().openingBalances.find(row=>row.staffId==='bob').cumulativeDone,0);assert.deepEqual(h.state().assignments.map(row=>row.staffId),['bob'],'the stale Charlie proposal is discarded');
});
test('fresh opening audit metadata does not change planning dependencies',()=>{
 const h=freshAccounting(),state=h.state(),command=h.command(),digest=h.scope.rosterOperationsDependencies_(state,command,h.ctx);
 state.openingBalances[0].updatedAt='2026-10-14T01:00:00Z';state.openingBalances[0].updatedBy='another-admin@gsps.edu.sg';state.openingBalances[0].version++;
 assert.equal(h.scope.rosterOperationsDependencies_(state,command,h.ctx),digest);
});
test('rotation-only changes remain dependencies while opening totals are present',()=>{
 const h=freshAccounting(),state=h.state(),command=h.command();
 state.assignments.push({id:'prior-bob',staffId:'bob',date:'2026-10-09',period:2,status:'completed',rCost:1},{id:'prior-charlie',staffId:'charlie',date:'2026-10-09',period:3,status:'completed',rCost:1});
 state.rotationEvents.push({id:'rotate-bob',assignmentId:'prior-bob',staffId:'bob',year:'2026',sequence:1},{id:'rotate-charlie',assignmentId:'prior-charlie',staffId:'charlie',year:'2026',sequence:2});
 const digest=h.scope.rosterOperationsDependencies_(state,command,h.ctx),balances=[...h.A.balances(state,h.ctx,h.date)];assert.deepEqual(h.A.rotation(state,'2026'),['bob','charlie']);
 state.rotationEvents[0].sequence=3;assert.deepEqual(h.A.rotation(state,'2026'),['charlie','bob']);assert.deepEqual([...h.A.balances(state,h.ctx,h.date)],balances);assert.notEqual(h.scope.rosterOperationsDependencies_(state,command,h.ctx),digest);
});
