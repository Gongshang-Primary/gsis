'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
const warning='Approved by colleague above weekly R';
function setup(R=0,periods=[2]){
 const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute=360;
 f.teachers[1].R=R;A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};
 const saved=f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[2,3]});
 f.ids=periods.map(p=>saved.savedId+':'+p);
 f.O.apply(f.state,f.ctx,{operation:'requestMutual',date:f.date,absenceId:saved.savedId,proposalOnly:true,requests:[{recipientId:'bob',demandIds:f.ids}]});
 f.approve=()=>f.O.apply(f.state,{...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}},{operation:'respondMutual',id:f.state.requests[0].id,decision:'approve'});
 return f;
}
for(const R of [0,null]){
 const f=setup(R);f.state.systemConfig.verboseLogging=false;f.approve();
 const row=A.effectiveAssignments(f.state).find(a=>a.staffId==='bob');
 assert.equal(f.state.requests[0].status,'approved');assert.equal(row.peerROverride,true);assert(row.overrideWarnings.includes(warning));assert.equal(row.rCost,1);
 assert(A.accounted(f.state).some(a=>a.id===row.id),'peer relief still counts in R');
 assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').weeklyUsed,1);
 const audit=f.state.audit.find(a=>a.operation==='peer-quota-override');assert(audit&&audit.warnings.includes(warning));assert.equal(audit.essential,true);assert.equal(audit.auditExportSuppressed,undefined);
 assert(f.O.view(f.state,f.ctx,{view:'allocation',date:f.date}).allocationModel.assignments.some(a=>a.id===row.id&&a.peerROverride));
 console.log('PASS approval and accounting at R='+R);
}
{
 const f=setup(1,[2,3]);f.approve();assert(A.effectiveAssignments(f.state).every(a=>a.peerROverride),'later period crossing the quota flags the whole approved request');
}
{
 const f=setup(4);f.approve();assert(!A.effectiveAssignments(f.state)[0].peerROverride);assert(!f.state.audit.some(a=>a.operation==='peer-quota-override'));
}
for(const [name,change] of [
 ['timetable clash',f=>{f.teachers[1].cells[2]=['MA','5A','Room',''];}],
 ['absence',f=>{f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'bob',date:f.date,typeId:'mc',periods:[2]});}],
 ['inactive staff',f=>{f.people[1].active=false;}],
 ['employment cap',f=>{Object.assign(f.teachers[1],{capConfigured:true,capVerified:false,periodCap:26});}],
 ['restricted period',f=>{f.people[1].employment='FAJT';f.state.systemConfig.employmentPeriodRestrictions=[{employment:'FAJT',periods:[2]}];}],
 ['six consecutive periods',f=>{for(const p of [0,1,3,4,5])f.teachers[1].cells[p]=['MA','5A','Room',''];}]
]){
 const f=setup();change(f);assert.throws(f.approve,undefined,name+' must remain blocked');assert.equal(f.state.requests[0].status,'pending');assert(!A.effectiveAssignments(f.state).some(a=>a.staffId==='bob'));console.log('PASS refuses '+name);
}
{
 const f=setup();const before=A.eligibility(A.teacherContext(f.state,f.ctx,f.date).get('bob'),3);
 assert.equal(before.Rviolation,true);assert.equal(before.autoEligible,false);
 f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,peerApproval:true});assert(!A.effectiveAssignments(f.state).some(a=>a.staffId==='bob'),'client input cannot give automatic allocation the peer exception');
}
console.log('PASS weekly R exception is limited to recipient approval');
