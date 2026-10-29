'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function setup(time='06:00:00'){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','initial']]);
 const at=time=>{h.ctx.now=Date.parse(h.date+'T'+time+'+08:00');h.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));h.ctx.iso=new Date(h.ctx.now).toISOString();};at(time);
 h.ctx.dutySources={[h.date]:{available:true,staffIds:['alice'],source:{versionId:'fixture'}}};
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 let locks=0,contexts=0;const lock=h.scope.deployLock_,context=h.scope.rosterOperationsContext_;
 h.scope.deployLock_=(...args)=>{locks++;return lock(...args);};h.scope.rosterOperationsContext_=(...args)=>{contexts++;assert(!h.locked(),'preparation must stay outside writer lock');return context(...args);};
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const state=h.state();state.systemConfig.scheduledAllocationEnabled=true;state.accountingYears['2026']={verified:true};h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 return {...h,at,properties,c,counts:()=>({locks,contexts,reads:h.calls.reads,writes:h.calls.writes}),tick:()=>h.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}}),row:()=>h.scope.rosterAllocationRunRead_(h.date),manual:()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'autoAllocate',allocationMode:'reoptimise',date:h.date,requestId:crypto.randomUUID(),revision:h.state().revision}},c)};
}
test('minute receipts remain distinct while allocation retries keep the last actual scheduled slot',()=>{
 const s=t=>A.schedule(Date.parse('2026-10-14T'+t+':00+08:00'));
 assert.equal(s('06:01').allocationKey,s('06:00').key);assert.notEqual(s('06:01').key,s('06:00').key);assert.equal(s('06:14').allocationKey,s('06:00').key);assert.equal(s('06:15').allocationKey,s('06:15').key);assert.equal(s('05:44').allocationKey,s('05:30').key);assert.equal(s('06:30').allocationKey,null);assert.equal(s('16:29').allocationKey,s('16:00').key);assert.equal(s('16:00').date,'2026-10-15');assert.equal(s('06:01').optimise,false);
});
test('successful slot skips later minutes before any operational read, intake gate or writer lock',()=>{
 const h=setup();assert.equal(h.tick().run.status,'complete');const before=h.counts();h.scope.rosterAbsenceIntakeGate_=()=>{throw Error('completed slot must not enter intake');};
 for(let n=1;n<10;n++){h.at('06:'+String(n).padStart(2,'0')+':00');assert.equal(h.tick().allocationSkipped,true);}
 assert.deepEqual(h.counts(),before);assert.equal(h.state().optimisationRuns.length,1);
});
test('ten minute ticks after hard terminations consume two durable attempts then show a stopped state',()=>{
 const h=setup(),settle=h.scope.rosterAllocationRunLocked_;let attempts=0,terminated=false;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;terminated=true;throw Error('Simulated hard termination');}};
 // The process cannot run its catch/finally settlement after Apps Script kills it.
 h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Execution has terminated');return settle(fn);};
 let last;
 for(let n=0;n<10;n++){h.at('06:'+String(n).padStart(2,'0')+':00');terminated=false;try{last=h.tick();}catch(e){assert.match(e.message,/hard termination|already running/);}}
 assert.equal(attempts,2);assert.equal(h.row().state,'failed');assert.match(h.row().log.at(-1).message,/Auto-allocation stopped.*2 attempts/);assert.equal(last.allocationStopped,true);
 const before=h.counts();h.at('06:10:00');h.tick();assert.deepEqual(h.counts(),before);assert.equal(h.calls.writes,0);
});
test('attempt is durable before the first operations read, including a hard termination in that read',()=>{
 const h=setup(),read=h.scope.rosterReadFile_,settle=h.scope.rosterAllocationRunLocked_;let terminated=false;
 h.scope.rosterReadFile_=()=>{assert.equal(h.row().attempts,1);terminated=true;throw Error('Read timed out');};h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Execution terminated');return settle(fn);};
 assert.throws(()=>h.tick(),/Relief records could not be read/);assert(h.row(),'first attempt must exist before the initial Google read');assert.equal(h.row().attempts,1);assert.equal(h.row().state,'running');h.scope.rosterReadFile_=read;
});
test('budget exhaustion saves the due SMC summary, preserves the draft and stops after the second attempt',()=>{
 const h=setup('05:30:00');h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=(...args)=>{const ctx=context(...args);h.ctx.now+=76000;return ctx;};
 const first=h.tick();assert.equal(first.allocationTimedOut,true);assert.equal(h.state().assignments.length,0);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);assert.equal(h.row().attempts,1);
 h.at('05:32:00');assert.equal(h.tick().allocationTimedOut,true);assert.equal(h.row().attempts,2);assert.match(h.row().log.at(-1).message,/Auto-allocation stopped/);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);
 h.scope.rosterOperationsContext_=context;h.at('05:34:00');const before=h.counts();assert.equal(h.tick().allocationStopped,true);assert.deepEqual(h.counts(),before);assert.equal(h.manual().run.status,'complete');assert.equal(h.row().trigger,'manual');
});
test('accepted but unacknowledged allocation is recovered by its receipt before retry',()=>{
 const h=setup(),props=h.scope.props_;h.scope.props_=()=>({...props(),setProperty(key,value){if(key.startsWith('ROSTER_ALLOCATION_')&&/"state":"completed"/.test(value))throw Error('Status storage unavailable');return props().setProperty(key,value);}});
 h.loseNextResponse();assert.throws(()=>h.tick(),/Uncertain response/);assert.equal(h.state().assignments.length,2);assert.equal(h.calls.writes,1);
 h.scope.props_=props;h.at('06:03:00');h.tick();assert.equal(h.row().state,'completed');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,1);assert.equal(h.state().optimisationRuns.length,1);
});
test('an unknown save remains uncertain when receipt recovery cannot read Google',()=>{
 const h=setup(),drive=h.scope.rosterDriveRequest_,read=h.scope.rosterReadFile_;h.scope.rosterDriveRequest_=()=>{throw Error('Drive response unknown');};
 assert.throws(()=>h.tick(),/Drive response unknown/);assert.equal(h.row().state,'uncertain');h.scope.rosterReadFile_=()=>{throw Error('Google read unavailable');};h.at('06:03:00');assert.throws(()=>h.tick(),/Relief records could not be read/);assert.equal(h.row().state,'uncertain');assert.equal(h.row().attempts,1);
 h.scope.rosterReadFile_=read;h.scope.rosterDriveRequest_=drive;h.at('06:04:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,2);assert.equal(h.calls.writes,1);
});
test('a later scheduled slot still allocates after an earlier slot stops',()=>{
 const h=setup(),tick=h.O.scheduledTick;let attempts=0;h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){attempts++;throw Error('Calculation unavailable');}};
 assert.throws(()=>h.tick(),/Calculation unavailable/);h.at('06:01:00');assert.throws(()=>h.tick(),/Calculation unavailable/);h.at('06:02:00');assert.equal(h.tick().allocationStopped,true);assert.equal(attempts,2);
 h.scope.GSISRosterOperations={...h.O,scheduledTick:tick};h.at('06:15:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,1);
});
test('an expired first attempt is fenced before its successor and cannot submit a late draft',()=>{
 const h=setup(),slot=A.schedule(h.ctx.now),old=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key,tickKey:slot.key});
 h.at('06:03:00');const next=h.tick();assert(next.run,'expired slot must receive its bounded second attempt');assert.equal(next.run.status,'complete');assert.notEqual(h.row().fence,old.fence);assert.throws(()=>h.scope.rosterAllocationRunBeforeCommit_(old),e=>e.code==='ALLOCATION_ABANDONED');assert.equal(h.calls.writes,1);
});
test('changed configuration invalidates a cheap skip and keeps a newly due summary',()=>{
 const h=setup();h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);h.tick();
 const latest=h.state();latest.systemConfig.smcSummaryTimes.morning.push('06:01');h.setState(latest);h.scope.rosterOperationsVersionChanged_();const before=h.counts();h.at('06:01:00');h.tick();assert(h.counts().reads>before.reads);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,2);assert.equal(h.state().optimisationRuns.length,1);
});
test('deadline checkpoints reach the flow search and discard an unfinished proposal',()=>{
 const h=setup(),state=h.state(),before=JSON.stringify(state);let flowChecks=0;
 assert.throws(()=>A.optimise(state,h.ctx,h.date,h.O.demand(h.ctx,state,h.date),{checkBudget(){if(new Error().stack.includes('at flow ')){flowChecks++;if(flowChecks===3)throw Object.assign(Error('Budget reached'),{code:'ALLOCATION_BUDGET'});}}}),e=>e.code==='ALLOCATION_BUDGET');
 assert.equal(flowChecks,3);assert.equal(JSON.stringify(state),before);
});
test('manual status replacement cannot reopen a completed scheduled slot',()=>{
 const h=setup();h.tick();h.manual();assert.equal(h.row().trigger,'manual');h.at('06:01:00');const before=h.counts();assert.equal(h.tick().allocationSkipped,true);assert.equal(h.counts().locks,before.locks);assert.equal(h.counts().contexts,before.contexts);assert.equal(h.state().optimisationRuns.length,2);assert.equal(h.row().trigger,'manual');h.at('06:02:00');const after=h.counts();h.tick();assert.deepEqual(h.counts(),after);
});
test('the second hard-killed attempt is reconciled after cutoff without running the allocator again',()=>{
 const h=setup('06:15:00'),lock=h.scope.rosterAllocationRunLocked_;let terminated=false,attempts=0;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;terminated=true;throw Error('Hard stop');}};h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Terminated');return lock(fn);};
 assert.throws(()=>h.tick(),/Hard stop/);terminated=false;h.at('06:28:00');assert.throws(()=>h.tick(),/Hard stop/);terminated=false;h.at('06:31:00');h.tick();assert.equal(attempts,2);assert.equal(h.row().state,'failed');assert.match(h.row().log.at(-1).message,/Auto-allocation stopped.*2 attempts/);
});
test('late source preparation cannot submit a draft after the reserved save deadline',()=>{
 const h=setup();h.scope.rosterVenuesBegin_=()=>{h.ctx.now+=111000;return null;};assert.throws(()=>h.tick(),e=>e.code==='ALLOCATION_BUDGET');assert.equal(h.calls.writes,0);assert.equal(h.state().assignments.length,0);assert.equal(h.row().state,'failed');
});
test('an invalidation failure cannot leave a successful publication hidden behind an idle hint',()=>{
 const h=setup(),props=h.scope.props_;h.tick();const state=h.state();state.massPublications[h.date]={at:h.ctx.iso};
 h.scope.props_=()=>({...props(),setProperty(key,value){if(key==='ROSTER_VERSION_HINT')throw Error('Version unavailable');return props().setProperty(key,value);}});
 h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterOperationsCommit_(state));h.at('06:01:00');const before=h.counts();h.tick();assert(h.counts().reads>before.reads,'publication must invalidate a previously idle hint even if the version update fails');
});
test('all 32 distinct dated slots fit in one small ledger and old terminal dates are bounded',()=>{
 const h=setup(),day='2026-10-14',start=Date.parse('2026-10-13T16:00:00+08:00'),end=Date.parse(day+'T06:30:00+08:00');let count=0;
 for(let stamp=start;stamp<end;stamp+=60000){const slot=A.schedule(stamp);if(!slot.optimise)continue;h.ctx.now=stamp;const run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:stamp}},h.c,{trigger:'scheduled',date:day,scheduleKey:slot.key});h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterAllocationRunWrite_({...run,state:'completed'},'Fixture durable completion'));count++;}
 assert.equal(count,32);const raw=h.properties.get('ROSTER_ALLOCATION_SLOTS:'+day);assert(raw.length<7500);assert.equal(Object.keys(JSON.parse(raw).slots).length,32);
 for(let n=0;n<20;n++){const date=new Date(Date.UTC(2026,8,n+1)).toISOString().slice(0,10);h.properties.set('ROSTER_ALLOCATION_SLOTS:'+date,JSON.stringify({...JSON.parse(raw),date}));h.properties.set('ROSTER_ALLOCATION_RUN:'+date,JSON.stringify({...h.row(),date,state:'completed'}));}
 h.at('06:29:00');const slot=A.schedule(h.ctx.now+86400000);h.ctx.now+=86400000;h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:slot.date,scheduleKey:slot.key});assert([...h.properties.keys()].filter(k=>k.startsWith('ROSTER_ALLOCATION_SLOTS:')).length<=2);assert([...h.properties.keys()].filter(k=>k.startsWith('ROSTER_ALLOCATION_RUN:')).length<=2);
});
test('duplicate delivery of a failed minute does not consume its next allocation attempt',()=>{
 const h=setup(),tick=h.O.scheduledTick;let attempts=0;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;throw Error('Calculation unavailable');}};
 assert.throws(()=>h.tick(),/Calculation unavailable/);h.scope.GSISRosterOperations={...h.O,scheduledTick:tick};h.tick();assert.equal(h.row().attempts,1);assert.equal(h.state().assignments.length,0);
 h.at('06:01:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,2);assert.equal(attempts,1);
});
test('manual takeover settles an expired scheduled ledger only after resolving its durable receipt',()=>{
 for(const outcome of ['absent','accepted','cancelled']){
  const h=setup(),slot=A.schedule(h.ctx.now),run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key});
  if(outcome!=='absent'){const state=h.state();state.scheduleReceipts[slot.key]=outcome==='accepted'?{at:h.ctx.iso,optimise:true,allocationStatus:'complete'}:{at:h.ctx.iso,cancelled:true};h.setState(state);}
  h.at('06:03:00');h.manual();assert.equal(h.row().trigger,'manual');h.at('06:31:00');h.tick();const ledger=JSON.parse(h.properties.get('ROSTER_ALLOCATION_SLOTS:'+h.date));assert.equal(ledger.slots[slot.key.slice(11)].state,outcome==='accepted'?'completed':'stopped');assert.throws(()=>h.scope.rosterAllocationRunBeforeCommit_(run),e=>e.code==='ALLOCATION_ABANDONED');
 }
 const h=setup(),slot=A.schedule(h.ctx.now);h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key});h.at('06:03:00');h.scope.rosterReadFile_=()=>{throw Error('Receipt read unavailable');};assert.throws(()=>h.manual(),/Relief records could not be read/);assert.equal(h.row().trigger,'scheduled');assert.equal(JSON.parse(h.properties.get('ROSTER_ALLOCATION_SLOTS:'+h.date)).slots[slot.key.slice(11)].state,'running');
});
