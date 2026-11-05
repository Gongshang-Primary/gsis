'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function setup(time='06:00:59'){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','initial']]);
 const at=time=>{h.ctx.now=Date.parse(h.date+'T'+time+'+08:00');h.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));h.ctx.iso=new Date(h.ctx.now).toISOString();};at(time);
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});
 vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const state=h.state();state.accountingYears['2026']={verified:true};state.systemConfig.scheduledAllocationEnabled=true;
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 return {...h,at,c,manual:(operation='autoAllocate')=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation,allocationMode:'reoptimise',date:h.date,requestId:crypto.randomUUID(),revision:h.state().revision}},c),row:()=>h.scope.rosterAllocationRunRead_(h.date)};
}
function delayApply(h,ms){let calls=0;h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=h.O.apply(s,ctx,p);calls++;h.ctx.now+=ms;return result;}};return ()=>calls;}
test('Google Auto-allocate commits across a harmless minute boundary on its first preparation',()=>{const h=setup(),calls=delayApply(h,2000);const result=h.manual();assert.equal(result.run.coverage,2);assert.equal(calls(),1);assert.equal(h.calls.writes,1);});
test('Google final write fence also permits a harmless minute boundary',()=>{const h=setup();h.scope.rosterVenuesBegin_=()=>{h.ctx.now+=2000;return null;};h.manual();assert.equal(h.calls.writes,1);});
test('a period start recomputes once; a second start returns the specific conflict without saving',()=>{const h=setup('07:59:59'),calls=delayApply(h,1800001);assert.throws(()=>h.manual(),e=>e.code==='PLANNING_CLOCK_CHANGED'&&e.reasonCode==='PERIOD_STARTED'&&/A period started while planning; re-run/.test(e.message));assert.equal(calls(),2);assert.equal(h.calls.writes,0);});
test('a first period start recomputes against current eligibility then commits',()=>{const h=setup('07:59:59');let calls=0;h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){calls++;const result=h.O.apply(s,ctx,p);if(calls===1)h.at('08:00:01');return result;}};const result=h.manual();assert.equal(calls,2);assert.equal(result.run.coverage,1);assert.equal(h.state().assignments.length,1);assert.equal(h.state().assignments[0].period,3);});
test('shared clock uses composed day periods, rejects midnight and stays strict on partial times',()=>{
 const h=setup(),ctx=h.ctx,from=A.prepareClock(ctx,h.state(),{operation:'autoAllocate',date:h.date});
 assert.equal(A.preparedClockConflict(from,{...ctx,minute:361,now:ctx.now+2000}),null);
 assert.equal(A.preparedClockConflict(from,{...ctx,today:'2026-10-15',minute:0}).reasonCode,'SCHOOL_DATE_CHANGED');
 ctx.days[h.date].periods[0].startMinutes=361;ctx.baselineDays={[h.date]:{periods:[{startMinutes:900}]}};
 assert.equal(A.preparedClockConflict(A.prepareClock(ctx,h.state(),{}),{...ctx,minute:361,now:ctx.now+2000}).reasonCode,'PERIOD_STARTED');
 delete ctx.days[h.date].periods[0].startMinutes;
 assert.equal(A.preparedClockConflict(A.prepareClock(ctx,h.state(),{}),{...ctx,minute:361,now:ctx.now+2000}).reasonCode,'PERIOD_DATA_MISSING');
 ctx.days={};assert.equal(A.preparedClockConflict(A.prepareClock(ctx,h.state(),{}),{...ctx,minute:361}).reasonCode,'PERIOD_DATA_MISSING');
});
test('relevant peer expiry is checked even within one minute',()=>{const h=setup('06:00:10'),s=h.state();s.requests.push({date:h.date,status:'pending',expiresAt:h.ctx.now+1000});const clock=A.prepareClock(h.ctx,s,{});assert.equal(A.preparedClockConflict(clock,{...h.ctx,now:h.ctx.now+1001}).reasonCode,'PLANNING_CUTOFF_PASSED');});
test('scheduled Google preparation commits across a harmless minute and records duration',()=>{const h=setup('06:00:00');h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){const result=h.O.scheduledTick(s,ctx,stamp);h.ctx.now+=61000;return result;}};const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});assert.equal(result.run.status,'complete');assert.equal(h.calls.writes,1);assert.equal(h.row().preparationMs,61000);assert.match(h.row().log.map(x=>x.message).join('\n'),/Preparation.*61/);});
test('Google run records total preparation time including one recomputation',()=>{const h=setup('07:59:59');let calls=0;h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=h.O.apply(s,ctx,p);h.ctx.now+=calls++?2000:2000;h.ctx.minute=Math.floor((h.ctx.now-Date.parse(h.date+'T00:00:00+08:00'))/60000);return result;}};h.manual();assert.equal(h.row().preparationMs,4000);assert.equal(h.row().preparationAttempts,2);});

// Run the actual D1 mutation coordinator. Only storage and trusted reference I/O
// are replaced; both the shared rule and the final beforeWrite callback execute.
function edge(time='06:00:59'){
 const f=setup(time);let state=f.state(),writes=0,delay=0;
 const scope=vm.createContext({Date:f.scope.Date,GSISRosterAllocation:A,crypto,TextEncoder,textEncoder:new TextEncoder(),clone:structuredClone,canonicalCommand:x=>x,validRequest(){},GSiSEdgeStore:{digest:async()=> 'digest'},guardPendingAttendance:async()=>{},storedAuditState:x=>x,pack:async(_,s)=>s,
  loadEdgeRoster:async()=>({state:structuredClone(state),rawState:structuredClone(state),revision:writes,store:{receipt:async()=>null,commit:async input=>{f.ctx.now+=delay;if(input.beforeWrite)input.beforeWrite();state=structuredClone(input.after);writes++;}}}),
  buildEdgeRosterContext:async()=>({...f.ctx,days:structuredClone(f.ctx.days)}),edgeRosterClock:()=>{const now=f.ctx.now,sg=new Date(now+28800000);return {now,today:sg.toISOString().slice(0,10),minute:sg.getUTCHours()*60+sg.getUTCMinutes(),iso:new Date(now).toISOString()};},fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});}});
 const source=fs.readFileSync('roster-update/public/edge-roster.js','utf8');vm.runInContext(source.slice(source.indexOf('export async function mutateEdgeRoster('),source.indexOf('\nfunction publicEntry')).replace('export ',''),scope);
 return {...f,scope,writes:()=>writes,state:()=>state,writeDelay:ms=>{delay=ms;},run:apply=>scope.mutateEdgeRoster({}, {actor:'test',requestId:crypto.randomUUID(),command:{operation:'autoAllocate',date:f.date},apply})};
}
test('D1 harmless minute boundary commits once and final-write guard remains semantic',async()=>{const h=edge();h.writeDelay(2000);let attempts=0;await h.run(()=>{attempts++;return {saved:true};});assert.equal(attempts,1);assert.equal(h.writes(),1);});
test('D1 clock conflicts recompute only once, return the same Google reason and do not save',async()=>{const h=edge('07:59:59');let attempts=0;await assert.rejects(h.run(()=>{attempts++;h.ctx.now+=1800001;return {}; }),e=>e.code==='PLANNING_CLOCK_CHANGED'&&e.reasonCode==='PERIOD_STARTED');assert.equal(attempts,2);assert.equal(h.writes(),0);});
test('D1 missing period data retains strict minute fencing',async()=>{const h=edge();h.ctx.days={};let attempts=0;await assert.rejects(h.run(()=>{attempts++;h.ctx.now+=60000;return {}; }),e=>e.code==='PLANNING_CLOCK_CHANGED'&&e.reasonCode==='PERIOD_DATA_MISSING');assert.equal(attempts,2);assert.equal(h.writes(),0);});
test('failed Google context preparation records duration and a run-log entry',()=>{const h=setup();h.scope.rosterOperationsContext_=()=>{h.ctx.now+=46000;throw Error('Context unavailable');};assert.throws(()=>h.manual(),/Context unavailable/);assert.equal(h.row().state,'failed');assert.equal(h.row().preparationMs,46000);assert.match(h.row().log.map(r=>r.message).join('\n'),/Preparation.*46/);});
test('D1 context failures carry measured preparation duration without writes',async()=>{const h=edge();h.scope.buildEdgeRosterContext=async()=>{h.ctx.now+=46000;throw Error('Context unavailable');};await assert.rejects(h.run(()=>({})),e=>e.message==='Context unavailable'&&e.preparationMs===46000);assert.equal(h.writes(),0);});
test('D1 scheduled tick becomes stale only after the 120 second boundary',async()=>{
 for(const delay of [120000,120001]){const h=edge('06:00:00'),stamp=h.ctx.now;let error;try{await h.scope.mutateEdgeRoster({}, {actor:'roster-service',requestId:crypto.randomUUID(),command:{operation:'scheduledRoster',date:h.date,scheduledTime:stamp},apply(){h.ctx.now+=delay;return {};}});}catch(e){error=e;}
 if(delay===120000)assert.equal(h.writes(),1);else{assert.equal(h.writes(),0);assert.equal(error.code,'ROSTER_STALE_TICK');}}
});

test('compact publication recomputes a replacement when its period starts before writing',()=>{
 const h=setup('07:59:59'),state=h.state();
 const demand=h.O.demand(h.ctx,state,h.date)[0];
 h.O.apply(state,h.ctx,{operation:'assign',date:h.date,demandIds:[demand.id],staffId:'bob'});
 h.O.publishDay(state,h.ctx,{operation:'publish',date:h.date,allocationRevision:state.dayRevisions[h.date]||0,notifyMode:'none'});
 const original=state.assignments.find(a=>a.staffId==='bob');
 state.assignments.push({...structuredClone(original),id:'replacement-test',status:'draft',staffId:'charlie',relieverName:'Charlie',replaces:original.id});
 h.setState(state);let attempts=0,venuePreparations=0;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){if(p.operation==='publish')attempts++;return h.O.apply(s,ctx,p);}};
 h.scope.rosterVenuesBegin_=()=>{if(venuePreparations++===0)h.at('08:00:01');return null;};
 h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'publish',compact:true,date:h.date,revision:state.revision,allocationRevision:state.dayRevisions[h.date]||0,requestId:crypto.randomUUID(),notifyMode:'none'}},h.c);
 const saved=h.state(),prior=saved.assignments.find(a=>a.id===original.id),replacement=saved.assignments.find(a=>a.id==='replacement-test');
 assert.equal(attempts,2);assert.equal(h.calls.writes,1);
 assert.equal(prior.status,'cancelled');assert.equal(prior.actualReviewRequired,true);assert.equal(prior.actualStatusBeforeReplacement,'published');
 assert.equal(replacement.status,'published');assert.equal(replacement.accountingPending,true);
});
test('ordinary absence save permits a harmless minute and retries a final-write period start once',()=>{
 for(const [start,end,expectedAttempts] of [['06:00:59','06:01:01',1],['07:59:59','08:00:01',2]]){
  const h=setup(start);let attempts=0,venues=0;
  h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){attempts++;return h.O.apply(s,ctx,p);}};
  h.scope.rosterVenuesBegin_=()=>{if(venues++===0)h.at(end);return null;};
  h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'saveAbsence',date:h.date,staffId:'bob',typeId:'mc',periods:[3],revision:h.state().revision,requestId:crypto.randomUUID()}},h.c);
  assert.equal(attempts,expectedAttempts);assert.equal(h.calls.writes,1);assert(h.state().absences.some(a=>a.staffId==='bob'));
 }
});
test('Google health preparation projection requires current SMC or Admin and omits private run fields',()=>{
 const h=setup();delayApply(h,61000);h.manual();
 h.scope.rosterAbsenceIntakeVisible_=()=>({entries:[]});
 const read=c=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'read',view:'intake',includeAllocationPreparation:true}},c);
 const status=read(h.c).allocationPreparation;assert.equal(status.runs[0].preparationMs,61000);assert.equal(status.runs[0].authority,'google');assert.equal(status.runs[0].actor,undefined);assert.equal(status.runs[0].log,undefined);
 h.scope.rosterOperationsAuthority_=()=>({staffId:'alice',smc:false,admin:false});assert.equal(read(h.c).allocationPreparation,undefined);
});
test('failed D1 allocation settles only its own running status with duration and keeps saved draft intact',async()=>{
 const h=edge(),date=h.date,id='run-id';let state=h.state();state.edgeAllocatorRuns={[date]:{id,state:'running',log:[]}};
 const source=fs.readFileSync('roster-update/public/edge-roster.js','utf8');vm.runInContext(source.slice(source.indexOf('async function recordEdgeAllocationFailure('),source.indexOf('async function allocateWithRun(')),h.scope);
 const error=Object.assign(Error('A period started while planning; re-run.'),{code:'PLANNING_CLOCK_CHANGED',preparationMs:61000,preparationAttempts:2});
 await h.scope.recordEdgeAllocationFailure({},date,id,'failure-receipt',error);
 assert.equal(h.state().edgeAllocatorRuns[date].state,'failed');assert.equal(h.state().edgeAllocatorRuns[date].preparationMs,61000);assert.equal(h.state().assignments.length,0);assert.match(h.state().edgeAllocatorRuns[date].log.at(-1).message,/A period started/);
 state=h.state();state.edgeAllocatorRuns[date]={id:'new-run',state:'running',log:[]};await h.scope.recordEdgeAllocationFailure({},date,id,'old-failure-receipt',error);assert.equal(h.state().edgeAllocatorRuns[date].state,'running');assert.equal(h.state().edgeAllocatorRuns[date].preparationMs,undefined);
});

test('Google and D1 midnight preparation conflicts leave assignments uncommitted',async()=>{
 const google=setup('23:59:59');let contexts=0;const original=google.scope.rosterOperationsContext_;
 google.scope.rosterOperationsContext_=(...args)=>{contexts++;return original(...args);};delayApply(google,2000);
 assert.throws(()=>google.manual(),e=>e.code==='PLANNING_CLOCK_CHANGED'&&e.reasonCode==='SCHOOL_DATE_CHANGED');assert.equal(contexts,2);assert.equal(google.calls.writes,0);
 const d1=edge('23:59:59');let edgeContexts=0;const build=d1.scope.buildEdgeRosterContext;d1.scope.buildEdgeRosterContext=(...args)=>{edgeContexts++;return build(...args);};
 await assert.rejects(d1.run(()=>{d1.ctx.now+=2000;return {};}),e=>e.code==='PLANNING_CLOCK_CHANGED'&&e.reasonCode==='SCHOOL_DATE_CHANGED');assert.equal(edgeContexts,2);assert.equal(d1.writes(),0);
});
test('scheduled Google and D1 use the same period-boundary rule with one retry',async()=>{
 const google=setup('07:59:59'),state=google.state();state.massPublications[google.date]={at:google.ctx.iso};google.setState(state);
 let attempts=0;google.scope.GSISRosterOperations={...google.O,scheduledTick(){attempts++;google.ctx.now+=2000;return {checked:true};}};
 google.scope.rosterScheduledDispatch_({input:{scheduledTime:google.ctx.now}});assert.equal(attempts,2);assert.equal(google.calls.writes,1);
 const d1=edge('07:59:59');let edgeAttempts=0;await d1.scope.mutateEdgeRoster({}, {actor:'roster-service',requestId:crypto.randomUUID(),command:{operation:'scheduledRoster',date:d1.date,scheduledTime:d1.ctx.now},apply(){edgeAttempts++;d1.ctx.now+=2000;return {};}});assert.equal(edgeAttempts,2);assert.equal(d1.writes(),1);
});
test('scheduled morning cutoff and published-duty completion are relevant; manual 06:30 is harmless',()=>{
 const h=setup('06:29:59'),state=h.state(),after={...h.ctx,now:h.ctx.now+2000,minute:390};
 assert.equal(A.preparedClockConflict(A.prepareClock(h.ctx,state,{operation:'scheduledRoster',date:h.date}),after).reasonCode,'PLANNING_CUTOFF_PASSED');
 assert.equal(A.preparedClockConflict(A.prepareClock(h.ctx,state,{operation:'autoAllocate',date:h.date}),after),null);
 h.at('08:29:59');state.assignments.push({date:h.date,status:'published',period:2});
 assert.equal(A.preparedClockConflict(A.prepareClock(h.ctx,state,{}),{...h.ctx,now:h.ctx.now+2000,minute:510}).reasonCode,'PLANNING_CUTOFF_PASSED');
});
test('shorter intake preserves a period that ends before the final write',()=>{
 const h=setup('06:00:00'),state=h.state();
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'bob',typeId:'mc',periods:[15,16]});h.setState(state);h.at('15:29:59');let attempts=0;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){attempts++;return h.O.apply(s,ctx,p);}};
 h.scope.rosterVenuesBegin_=()=>{h.at('15:30:01');return null;};
 h.scope.rosterOperationsDispatch_({identity:h.ctx.user,intakeProjection:true,intakeAcceptedAt:h.ctx.iso,intakeSequence:2,input:{operation:'saveAbsence',date:h.date,staffId:'bob',typeId:'mc',periods:[15],revision:h.state().revision,requestId:crypto.randomUUID()}},h.c);
 const absence=h.state().absences.find(a=>a.staffId==='bob');assert.equal(attempts,2);assert.equal(h.calls.writes,1);assert.deepEqual(Array.from(A.absencePeriods(absence,h.ctx.days[h.date])),[15,16]);
});
test('D1 report-only scheduled ticks preserve previous allocation timing',async()=>{
 const h=edge(),old={id:'old',date:h.date,state:'completed',preparationMs:61000,preparationAttempts:2,log:[]};h.state().edgeAllocatorRuns={[h.date]:structuredClone(old)};
 await h.scope.mutateEdgeRoster({}, {actor:'roster-service',requestId:crypto.randomUUID(),command:{operation:'scheduledRoster',date:h.date,scheduledTime:h.ctx.now},apply(){h.ctx.now+=1000;return {allocationSkipped:true,allocatorRun:null};}});
 assert.deepEqual(h.state().edgeAllocatorRuns[h.date],old);
});
test('exhausted D1 storage retries retain preparation timing on the returned failure',async()=>{
 const h=edge(),load=h.scope.loadEdgeRoster;h.scope.loadEdgeRoster=async(...args)=>{const loaded=await load(...args);loaded.store.commit=async()=>{throw Object.assign(Error('Storage conflict'),{status:409,code:'EDGE_CONFLICT'});};return loaded;};
 await assert.rejects(h.run(()=>{h.ctx.now+=1000;return {};}),error=>error.code==='ROSTER_COMMIT_BUSY'&&error.preparationMs===5000&&error.preparationAttempts===5);assert.equal(h.writes(),0);
});

test('D1 successful current allocation keeps its preparation time on the run and response',async()=>{
 const h=edge();h.state().edgeAllocatorRuns={[h.date]:{id:'current-run',date:h.date,state:'running',log:[]}};
 const result=await h.run(state=>{h.ctx.now+=61000;const run=state.edgeAllocatorRuns[h.date];run.state='completed';return {allocatorRun:run};});
 assert.equal(result.allocatorRun.preparationMs,61000);assert.equal(h.state().edgeAllocatorRuns[h.date].preparationMs,61000);assert.match(h.state().edgeAllocatorRuns[h.date].log.at(-1).message,/61.0 s/);
});
test('missing end times stay strict when absence coverage uses period completion',()=>{
 const h=setup();delete h.ctx.days[h.date].periods[0].endMinutes;
 const prepared=A.prepareClock(h.ctx,h.state(),{operation:'saveAbsence'});
 assert.equal(A.preparedClockConflict(prepared,{...h.ctx,minute:h.ctx.minute+1,now:h.ctx.now+2000}).reasonCode,'PERIOD_DATA_MISSING');
});
