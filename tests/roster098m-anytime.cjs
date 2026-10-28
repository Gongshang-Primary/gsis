'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function setup(time='09:00:00'){
 const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.minute=360;f.ctx.iso=new Date(f.ctx.now).toISOString();f.state.accountingYears['2026']={verified:true};f.state.systemConfig.consecutiveSubjectRules=[];
 for(const p of [6,7])f.teachers[0].cells[p]=['EL','4A','C1-01',''];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3,6,7]});A.captureWeek(f.state,f.ctx,f.date);
 for(const [period,staffId] of [[2,'bob'],[6,'dora']]){const d=f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===period);f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[d.id],staffId});const row=f.state.assignments.at(-1);Object.assign(row,{origin:'automatic',protected:false});delete f.state.manualDecisions[f.date+'|'+d.id];}
 f.state.importedRelief.push({id:'dora-history',staffId:'dora',date:'2026-10-07',period:2,status:'completed',origin:'imported',rCost:3});
 setClock(f,f.date,time);return f;
}
function setClock(f,date,time){f.ctx.today=date;f.ctx.now=Date.parse(date+'T'+time+'+08:00');f.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));f.ctx.iso=new Date(f.ctx.now).toISOString();}
const run=(f,mode='reoptimise',extra={})=>f.O.apply(f.state,f.ctx,{operation:'autoAllocate',allocationMode:mode,date:f.date,requestId:crypto.randomUUID(),...extra});
test('daytime Auto-allocate rebalances only future automatic slots and skips elapsed blanks',()=>{
 const f=setup(),started=structuredClone(f.state.assignments.find(a=>a.period===2)),future=f.state.assignments.find(a=>a.period===6);const r=run(f);
 assert.equal(future.status,'cancelled');assert.deepEqual(f.state.assignments.find(a=>a.id===started.id),started);assert(!A.effectiveAssignments(f.state).some(a=>a.period===3));assert.equal(A.effectiveAssignments(f.state).find(a=>a.period===6).staffId,'charlie');assert(A.effectiveAssignments(f.state).some(a=>a.period===7));assert(r.run.changed);assert.equal(f.state.publicationSnapshots.length,0);assert.equal(f.state.outbox.length,0);
});
test('daytime Auto-fill blanks retains every current assignment and legacy default',()=>{
 for(const mode of ['fill-only',undefined]){const f=setup(),before=structuredClone(f.state.assignments);run(f,mode,{allocationMode:mode});assert.deepEqual(f.state.assignments.slice(0,before.length),before);assert(!A.effectiveAssignments(f.state).some(a=>a.period===3));assert(A.effectiveAssignments(f.state).some(a=>a.period===7));}
});
test('manual controls allow afternoon and future planning before the prior-day 16:00 boundary',()=>{
 for(const mode of ['reoptimise','fill-only'])for(const [day,time]of [['2026-10-14','14:00:00'],['2026-10-13','15:59:00'],['2026-10-13','00:00:00']]){const f=setup();setClock(f,day,time);const r=run(f,mode);assert.equal(r.run.status,'complete');if(day===f.date)assert.deepEqual(A.effectiveAssignments(f.state).map(a=>a.period),[2,6]);else assert(A.effectiveAssignments(f.state).some(a=>a.period===7));}
});
test('manual controls reject past Singapore dates but allow an upcoming date at local midnight',()=>{
 for(const mode of ['reoptimise','fill-only']){const f=setup();setClock(f,'2026-10-15','00:00:00');assert.throws(()=>run(f,mode),e=>e.status===409&&/Past dates/.test(e.message));const g=setup();setClock(g,'2026-10-14','00:00:00');assert.equal(run(g,mode).run.status,'complete');}
});
test('daytime reoptimisation preserves SMC, peer, published and no-relief ownership',()=>{
 for(const kind of ['published','completed','mutual','protected','smc','clear']){const f=setup(),row=f.state.assignments.find(a=>a.period===6);if(['published','completed'].includes(kind))row.status=kind;else if(kind==='mutual')Object.assign(row,{origin:'mutual',mutual:true,protected:true});else if(kind==='protected')row.protected=true;else if(kind==='smc')Object.assign(row,{origin:'smc',protected:true});else f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[row.demandId]});const before=structuredClone(f.state.assignments);run(f);assert.deepEqual(f.state.assignments.slice(0,before.length),before,kind);}
});
test('minute advancement recomputes at commit and keeps a duty that has just started',()=>{
 const f=setup('09:59:59'),h=adapter();Object.assign(h.ctx,f.ctx);h.setState(f.state);const old=structuredClone(f.state.assignments.find(a=>a.period===6)),apply=h.O.apply;let first=true;
 h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=apply(s,ctx,p);if(first){first=false;h.ctx.now+=2000;}return result;}};
 const p={operation:'autoAllocate',date:f.date,view:'allocation',revision:f.state.revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'};const result=h.call(p);assert.equal(h.calls.writes,1);assert.deepEqual(h.state().assignments.find(a=>a.id===old.id),old);assert(A.effectiveAssignments(h.state()).some(a=>a.period===7));assert.equal(h.call(p).replayed,true);assert.equal(h.calls.writes,1);
});
test('manual reoptimisation may cross 06:30 without retaining the old manual cutoff',()=>{
 const f=setup('06:29:59'),h=adapter();Object.assign(h.ctx,f.ctx);h.setState(f.state);const apply=h.O.apply;let first=true;h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=apply(s,ctx,p);if(first){first=false;h.ctx.now+=2000;}return result;}};
 assert(h.call({operation:'autoAllocate',date:f.date,view:'allocation',revision:f.state.revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'}).run);assert.equal(h.calls.writes,1);
});
test('all-day manual availability does not expand scheduled optimisation cadence',()=>{
 const f=setup();assert.equal(A.mayOptimise(f.ctx,f.date),false);assert.equal(A.schedule(f.ctx.now).optimise,false);const r=f.O.scheduledTick(f.state,{...f.ctx,service:true},f.ctx.now);assert.equal(r.run,undefined);assert.equal(A.schedule(Date.parse(f.date+'T06:29:00+08:00')).optimise,true);
});
test('late remote commit preparation rechecks the clock before marking a tracked run committing',()=>{
 const f=setup('09:59:59'),h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);Object.assign(h.ctx,f.ctx);h.setState(f.state);h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k)});vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']},row=()=>h.scope.rosterAllocationRunRead_(f.date),old=structuredClone(f.state.assignments.find(a=>a.period===6));let prepares=0;
 h.scope.rosterVenuesBegin_=()=>{assert.equal(row().state,'running');if(prepares++===0)h.ctx.now+=2000;return null;};
 const p={operation:'autoAllocate',date:f.date,view:'allocation',revision:f.state.revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'},call=p=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:p},c);
 assert(call(p).run);assert.equal(h.calls.writes,1);assert.equal(row().state,'completed');assert.deepEqual(h.state().assignments.find(a=>a.id===old.id),old);assert.equal(call(p).replayed,true);assert.equal(h.calls.writes,1);
});
test('started automatic replacement remains visible for review when its reliever becomes absent',()=>{
 const f=setup('10:00:00'),row=f.state.assignments.find(a=>a.period===6),published={...structuredClone(row),id:'published-before-automatic',status:'published',publishedAt:f.ctx.iso};row.replaces=published.id;f.state.assignments.push(published);const absence={...structuredClone(f.state.absences[0]),id:'dora-new-absence',staffId:'dora',periods:[6]};delete absence.coverage;f.state.absences.push(absence);
 run(f);assert.equal(row.status,'draft');assert.equal(row.replaces,published.id);assert.equal(row.reviewRequired,true);assert(!f.state.assignments.some(a=>a.status==='draft'&&a.remove&&a.replaces===published.id));
});
test('tracked status write latency is rechecked before any Drive write and rearms only that unsubmitted attempt',()=>{
 const f=setup('09:59:59'),h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);Object.assign(h.ctx,f.ctx);h.setState(f.state);let injected=false;
 h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k),setProperty(k,v){properties.set(k,v);if(k.startsWith('ROSTER_ALLOCATION_RUN:')&&JSON.parse(v).state==='committing'&&!injected){injected=true;h.ctx.now+=2000;}}});vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']},old=structuredClone(f.state.assignments.find(a=>a.period===6)),p={operation:'autoAllocate',date:f.date,view:'allocation',revision:f.state.revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'},call=p=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:p},c);
 assert(call(p).run);assert(injected);assert.equal(h.calls.writes,1);assert.equal(h.scope.rosterAllocationRunRead_(f.date).state,'completed');assert.deepEqual(h.state().assignments.find(a=>a.id===old.id),old);assert.equal(call(p).replayed,true);assert.equal(h.calls.writes,1);
});
