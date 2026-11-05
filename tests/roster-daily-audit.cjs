'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./roster701-fixture.cjs'),legacyText=require('./helpers/roster-pre82-audit.cjs'),A=require('../shared/roster-allocation.js');
const {O,state,ctx,date}=fixture();ctx.minute=0;ctx.now=Date.parse(date+'T00:00:00+08:00');ctx.iso=new Date(ctx.now).toISOString();state.accountingYears['2026']={verified:true};state.entitlements=ctx.people.map(p=>({staffId:p.id,year:'2026',week:A.monday(date),quota:4}));
state.absences=[{id:'absence',staffId:'alice',name:'Alice',date,periods:[2,3],reliefRequired:true,typeId:'mc',reason:'SECRET DIAGNOSIS',typeLabel:'PRIVATE MEDICAL'}];
const before=structuredClone(state);O.apply(state,ctx,{operation:'autoAllocate',date});
const sandbox={console,GSISRosterAllocation:A,GSISRosterOperations:O};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),sandbox);sandbox.rosterAllocationAuditAccepted_(state,before,ctx,{requestId:'test-request'});
const view=O.read(state,ctx,{operation:'exportDaily',date,fullTeachers:true,dailyDrive:true}),text=sandbox.rosterAllocationAuditText_(state,date,ctx.iso,{daily:view,final:false});
assert.deepEqual(Buffer.from(text),Buffer.from(legacyText(state,date,ctx.iso)),'Google TXT matches the pre-#82 renderer byte for byte');
assert.doesNotMatch(text,/Day summary|Rules glossary|Why:|Why \(/);assert(!text.includes('SECRET DIAGNOSIS'));assert(!text.includes('PRIVATE MEDICAL'));
assert(state.optimisationRuns.some(r=>r.decisionEvidence?.lessons.some(l=>l.disposition==='selected')));
assert(!JSON.stringify(state).includes('"why":'));assert(!JSON.stringify(state).includes('"allocationWhy":'));
assert.equal(text,sandbox.rosterAllocationAuditText_(state,date,ctx.iso,{daily:view,final:true}),'FINAL does not change the audit TXT format');
const historic=structuredClone(state);historic.audit.push({id:'old-peer',date,at:ctx.iso,operation:'respondMutual',auditExportCaptured:true,allocationWhy:[{lesson:{period:2},after:{name:'OLD WHY MUST BE IGNORED'},why:{basis:'OLD WHY MUST BE IGNORED'}}]});
for(const run of historic.optimisationRuns)for(const lesson of run.decisionEvidence?.lessons||[])lesson.why={basis:'OLD WHY MUST BE IGNORED'};
const historicBefore=JSON.stringify(historic),historicText=sandbox.rosterAllocationAuditText_(historic,date,ctx.iso);
assert.deepEqual(Buffer.from(historicText),Buffer.from(legacyText(historic,date,ctx.iso)));assert(!historicText.includes('OLD WHY MUST BE IGNORED'));assert.equal(JSON.stringify(historic),historicBefore);
(async()=>{
 const edge=await import('../roster-update/public/edge-roster-output-renderers.js');
 for(const value of [state,historic])assert.deepEqual(Buffer.from(edge.rosterAllocationAuditText_(value,date,ctx.iso)),Buffer.from(legacyText(value,date,ctx.iso)),'D1 TXT matches the pre-#82 renderer byte for byte');
 console.log('Google and D1 preserve exact pre-#82 TXT bytes and ignore retained Why fields');
})().catch(error=>{console.error(error);process.exitCode=1;});

const manual=fixture();manual.ctx.minute=0;manual.ctx.now=Date.parse(manual.date+'T00:00:00+08:00');manual.ctx.iso=new Date(manual.ctx.now).toISOString();manual.state.accountingYears['2026']={verified:true};A.captureWeek(manual.state,manual.ctx,manual.date);
manual.O.apply(manual.state,manual.ctx,{operation:'saveAbsence',date:manual.date,staffId:'alice',typeId:'mc',periods:[2,3]});
const dem=manual.O.demand(manual.ctx,manual.state,manual.date)[0],oldManual=structuredClone(manual.state);manual.O.apply(manual.state,manual.ctx,{operation:'assign',date:manual.date,staffId:'bob',demandIds:[dem.id]});sandbox.rosterAllocationAuditAccepted_(manual.state,oldManual,manual.ctx,{requestId:'manual'});
assert(manual.state.audit.some(e=>e.decisionChanges?.some(c=>c.after?.staffId==='bob')));assert(!JSON.stringify(manual.state).includes('"why":'));
const peer=fixture();peer.ctx.minute=0;peer.ctx.now=Date.parse(peer.date+'T00:00:00+08:00');peer.ctx.iso=new Date(peer.ctx.now).toISOString();peer.teachers[1].R=0;A.captureWeek(peer.state,peer.ctx,peer.date);peer.state.accountingYears['2026']={verified:true};
const absence=peer.O.apply(peer.state,peer.ctx,{operation:'saveAbsence',date:peer.date,staffId:'alice',typeId:'mc',periods:[2,3]});peer.O.apply(peer.state,peer.ctx,{operation:'requestMutual',date:peer.date,absenceId:absence.savedId,proposalOnly:true,requests:[{recipientId:'bob',demandIds:[absence.savedId+':2']}]});
const oldPeer=structuredClone(peer.state),peerCtx={...peer.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};peer.O.apply(peer.state,peerCtx,{operation:'respondMutual',id:peer.state.requests[0].id,decision:'approve'});sandbox.rosterAllocationAuditAccepted_(peer.state,oldPeer,peerCtx,{requestId:'peer'});
assert(peer.state.assignments.some(a=>a.staffId==='bob'&&a.origin==='mutual'));assert(!JSON.stringify(peer.state).includes('"allocationWhy":'));assert(!JSON.stringify(peer.state).includes('"why":'));
console.log('manual and peer approvals preserve decision facts without Why capture');

const mixed=fixture();mixed.ctx.minute=360;mixed.ctx.now=Date.parse(mixed.date+'T06:00:00+08:00');mixed.ctx.iso=new Date(mixed.ctx.now).toISOString();for(const t of mixed.teachers){t.cells=mixed.blank();t.R=t.staffId==='bob'?1:0;}mixed.teachers[1].cells[3]=['Recess duty P1','','',''];A.captureWeek(mixed.state,mixed.ctx,mixed.date);mixed.state.accountingYears['2026']={verified:true};
const mixedRun=A.optimise(mixed.state,mixed.ctx,mixed.date,[{id:'duty',period:3,staffId:null,recessActivationId:'recess',level:1},{id:'ordinary',period:5,staffId:'alice',subject:'EL'}]);assert.equal(mixedRun.assignments.length,2);assert.equal(mixedRun.assignments.find(a=>a.demandId==='duty').rCost,0);assert(mixedRun.decisionEvidence.lessons.some(l=>l.demandId==='ordinary'&&l.disposition==='selected'));assert(!JSON.stringify(mixedRun).includes('"why":'));
console.log('zero-R repurposed duties retain both accepted workload periods');

// Closing the day must not turn a subject-policy exemption into missing cover.
const closed=fixture();closed.ctx.minute=0;closed.teachers[0].cells[2]=['TL','4A','C1-01',''];
closed.O.apply(closed.state,closed.ctx,{operation:'saveAbsence',date:closed.date,staffId:'alice',typeId:'mc',periods:[2,3]});
const summaryFor=()=>{const daily=closed.O.read(closed.state,closed.ctx,{operation:'exportDaily',date:closed.date,fullTeachers:true,dailyDrive:true});return {daily};};
const live=summaryFor(false);assert.equal(live.daily.teacherSummary.demands.find(d=>d.period===2).noReliefRequired,true);
closed.ctx.today='2026-10-15';closed.ctx.iso='2026-10-15T00:01:00+08:00';
const final=summaryFor(true);
assert.equal(final.daily.teacherSummary.demands.find(d=>d.period===2).noReliefRequired,true);
const finalPage=require('../roster-update/public/roster-export.js').dailyTeacherPage(final.daily,{final:true}),aliceRow=finalPage.rows.find(row=>row.teacherId==='alice');
assert.match(aliceRow.cells[2],/No Relief Needed/);assert(!aliceRow.cells[2].includes('UNASSIGNED'));assert.match(aliceRow.cells[3],/UNASSIGNED/);
assert.equal(closed.O.demand(closed.ctx,closed.state,closed.date).find(d=>d.period===2).noReliefRequired,undefined,'export projection does not change historical allocator demands');
console.log('FINAL keeps exempt lessons out of uncovered counts and retains genuinely uncovered lessons');
