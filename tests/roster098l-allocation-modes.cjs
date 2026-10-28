'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function setup(){
 const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.minute=360;f.ctx.iso=new Date(f.ctx.now).toISOString();f.state.accountingYears['2026']={verified:true};f.state.systemConfig.consecutiveSubjectRules=[];f.people.find(p=>p.id==='dora').active=false;
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});A.captureWeek(f.state,f.ctx,f.date);
 f.state.importedRelief.push({id:'bob-history',staffId:'bob',date:'2026-10-07',period:2,status:'completed',origin:'imported',rCost:3});
 const d=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[d.id],staffId:'bob'});Object.assign(f.state.assignments[0],{origin:'automatic',protected:false});delete f.state.manualDecisions[f.date+'|'+d.id];
 return f;
}
const run=(f,allocationMode)=>f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,requestId:crypto.randomUUID(),...(allocationMode===undefined?{}:{allocationMode})});
test('Auto-allocate reconsiders existing automatic drafts and blanks together',()=>{
 const f=setup(),before=f.state.assignments[0],result=run(f,'reoptimise');assert(result.savedIds.length>0);assert.equal(before.status,'cancelled');assert.equal(A.effectiveAssignments(f.state).find(a=>a.period===2).staffId,'charlie');assert.equal(A.effectiveAssignments(f.state).length,2);assert.equal(f.state.publicationSnapshots.length,0);assert.equal(f.state.outbox.length,0);
});
test('Auto-fill blanks and legacy commands preserve current assignments exactly',()=>{
 for(const mode of ['fill-only',undefined]){const f=setup(),before=structuredClone(f.state.assignments[0]);run(f,mode);assert.deepEqual(f.state.assignments[0],before);assert.equal(A.effectiveAssignments(f.state).length,2);}
});
test('reoptimisation retains published, peer, protected, SMC and manual-clear decisions',()=>{
 for(const kind of ['published','mutual','protected','smc','clear']){const f=setup(),row=f.state.assignments[0];if(kind==='published')row.status='published';else if(kind==='mutual')Object.assign(row,{origin:'mutual',mutual:true,protected:true});else if(kind==='protected')row.protected=true;else if(kind==='smc')Object.assign(row,{origin:'smc',protected:true});else f.O.apply(f.state,f.ctx,{operation:'unassign',date:f.date,demandIds:[row.demandId]});const before=structuredClone(f.state.assignments);run(f,'reoptimise');assert.deepEqual(f.state.assignments.slice(0,before.length),before,kind+' decisions remain fixed');if(kind==='clear')assert(!A.effectiveAssignments(f.state).some(a=>a.period===2));}
});
test('both manual modes work outside the scheduled window and retain started assignments',()=>{
 for(const mode of ['reoptimise','fill-only']){const f=setup();f.ctx.now=Date.parse(f.date+'T08:10:00+08:00');f.ctx.minute=490;f.ctx.iso=new Date(f.ctx.now).toISOString();const before=structuredClone(f.state.assignments[0]);run(f,mode);assert.deepEqual(f.state.assignments[0],before);assert.equal(A.effectiveAssignments(f.state).at(-1).period,3,'started P2 remains fixed and P3 is filled');}
});
test('unknown modes are rejected instead of silently falling back to blanks',()=>{
 for(const mode of ['',null,true,{},'optimise']){const f=setup(),before=JSON.stringify(f.state);assert.throws(()=>run(f,mode),e=>e.status===400);assert.equal(JSON.stringify(f.state),before);}
});
test('both modes require SMC or Admin and retain annual accounting safeguards',()=>{
 for(const mode of ['fill-only','reoptimise']){const f=setup();assert.throws(()=>f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,smc:false,admin:false}},{operation:'autoAllocate',date:f.date,allocationMode:mode}),e=>e.status===403);f.state.accountingYears['2026'].verified=false;const r=run(f,mode);assert.equal(r.paused,true);}
});
test('backend run status and exact retry retain the selected mode',()=>{
 const f=setup(),h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);Object.assign(h.ctx,f.ctx);h.setState(f.state);h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k)});vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']},p={operation:'autoAllocate',date:h.date,view:'allocation',revision:h.state().revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'},call=input=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input},c);
 h.loseNextResponse();assert.throws(()=>call(p),/Uncertain response/);assert.equal(h.calls.writes,1);const status=call({operation:'allocationVersion',date:h.date,statusOnly:true});assert.equal(status.allocatorRun.allocationMode,'reoptimise');assert.equal(status.allocatorRun.requestId,p.requestId);assert.equal(call(p).replayed,true);assert.equal(h.calls.writes,1);assert.throws(()=>call({...p,allocationMode:'fill-only'}),e=>e.status===409);assert.equal(h.calls.writes,1);
});
test('a pending peer proposal reserves its lessons during reoptimisation',()=>{
 const f=setup(),d=f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===3);f.state.requests.push({id:'pending-peer',date:f.date,status:'pending',expiresAt:f.ctx.now+60000,demandIds:[d.id],periods:[3],lessons:[structuredClone(d)],recipientId:'charlie'});run(f,'reoptimise');assert(!A.effectiveAssignments(f.state).some(a=>a.period===3));
});
test('manual reoptimisation crossing the morning schedule cutoff rechecks current inputs and commits once',()=>{
 const f=setup(),h=adapter();Object.assign(h.ctx,f.ctx);h.ctx.now=Date.parse(h.date+'T06:29:59+08:00');h.ctx.minute=389;h.ctx.iso=new Date(h.ctx.now).toISOString();h.setState(f.state);const apply=h.O.apply;let first=true;h.scope.GSISRosterOperations={...h.O,apply(s,ctx,p){const result=apply(s,ctx,p);if(first){first=false;h.ctx.now+=2000;}return result;}};
 assert(h.call({operation:'autoAllocate',date:h.date,view:'allocation',revision:h.state().revision,requestId:crypto.randomUUID(),allocationMode:'reoptimise'}).run);assert.equal(h.calls.writes,1);assert.equal(A.effectiveAssignments(h.state()).find(a=>a.period===2).staffId,'charlie');
});
