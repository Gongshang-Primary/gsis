'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function noWhy(state){
 for(const event of state.audit){assert.equal(Object.hasOwn(event,'allocationWhy'),false);for(const change of event.decisionChanges||[])assert.equal(Object.hasOwn(change,'why'),false);}
 for(const run of state.optimisationRuns)for(const lesson of run.decisionEvidence?.lessons||[])assert.equal(Object.hasOwn(lesson,'why'),false);
}
function setup(){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','initial']]);
 Object.assign(h.ctx,{now:Date.parse(h.date+'T06:00:00+08:00'),minute:360,iso:new Date(Date.parse(h.date+'T06:00:00+08:00')).toISOString()});
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});
 vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),h.scope);
 h.scope.GSISRosterAllocation=new Proxy(A,{get(target,key){assert.notEqual(key,'captureDecisionWhy','a save must not call Why reporting');return target[key];}});
 const state=h.state();state.accountingYears['2026']={verified:true};state.systemConfig.scheduledAllocationEnabled=true;
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 return {...h,c,save:p=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{date:h.date,revision:h.state().revision,requestId:crypto.randomUUID(),...p}},c)};
}
test('Why capture is no longer an allocator API',()=>assert.equal(A.captureDecisionWhy,undefined));
for(const operation of ['autoAllocate','optimise','assign','publish','saveAbsence','intake','scheduled'])test('Google '+operation+' commits without Why work or fields',()=>{
 const h=setup(),p={operation};
 if(operation==='assign')Object.assign(p,{staffId:'bob',demandIds:[h.O.demand(h.ctx,h.state(),h.date)[0].id]});
 if(operation==='publish'){const s=h.state();h.O.apply(s,h.ctx,{operation:'autoAllocate',date:h.date});h.setState(s);Object.assign(p,{compact:true,notifyMode:'none',allocationRevision:s.dayRevisions[h.date]||0});}
 if(operation==='saveAbsence')Object.assign(p,{staffId:'bob',typeId:'mc',periods:[3]});
 if(operation==='scheduled')h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}});
 else if(operation==='intake')h.scope.rosterOperationsDispatch_({identity:h.ctx.user,intakeProjection:true,intakeAcceptedAt:h.ctx.iso,intakeSequence:1,input:{operation:'saveAbsence',date:h.date,staffId:'bob',typeId:'mc',periods:[3],revision:h.state().revision,requestId:crypto.randomUUID()}},h.c);
 else h.save(p);
 assert.equal(h.calls.writes,1);noWhy(h.state());
 if(['autoAllocate','optimise','assign','publish','scheduled'].includes(operation))assert(h.state().assignments.some(a=>a.staffId),'allocation facts still commit');
});

// Actual D1 save coordinator and domain operations; only trusted context and
// storage I/O are supplied by the fixture, as in the clock-boundary tests.
for(const operation of ['autoAllocate','optimise','assign','saveAbsence'])test('D1 '+operation+' commits without added audit work or Why fields',async()=>{
 const h=setup();let state=h.state(),writes=0;
 const scope=vm.createContext({Date:h.scope.Date,GSISRosterAllocation:A,crypto,TextEncoder,textEncoder:new TextEncoder(),clone:structuredClone,canonicalCommand:x=>x,validRequest(){},GSiSEdgeStore:{digest:async()=> 'digest'},guardPendingAttendance:async()=>{},storedAuditState:x=>x,pack:async(_,s)=>s,
  rosterAllocationAuditAccepted_(){assert.fail('D1 saves must not run the extra #82 audit hook');},
  loadEdgeRoster:async()=>({state:structuredClone(state),rawState:structuredClone(state),revision:writes,store:{receipt:async()=>null,commit:async input=>{input.beforeWrite();state=structuredClone(input.after);writes++;}}}),
  buildEdgeRosterContext:async()=>({...h.ctx,days:structuredClone(h.ctx.days)}),edgeRosterClock:()=>({...h.ctx}),fail:(status,code,message)=>{throw Object.assign(Error(message),{status,code});}});
 const source=fs.readFileSync('roster-update/public/edge-roster.js','utf8');vm.runInContext(source.slice(source.indexOf('export async function mutateEdgeRoster('),source.indexOf('\nfunction publicEntry')).replace('export ',''),scope);
 const command={operation,date:h.date};
 if(operation==='assign')Object.assign(command,{staffId:'bob',demandIds:[h.O.demand(h.ctx,state,h.date)[0].id]});
 if(operation==='saveAbsence')Object.assign(command,{staffId:'bob',typeId:'mc',periods:[3]});
 await scope.mutateEdgeRoster({}, {actor:h.ctx.user.email,requestId:crypto.randomUUID(),command,apply:(s,ctx)=>h.O.apply(s,ctx,command)});
 assert.equal(writes,1);noWhy(state);
 if(operation==='saveAbsence')assert(state.absences.some(a=>a.staffId==='bob'));
 else assert(state.assignments.some(a=>a.staffId),'allocation facts still commit');
});
