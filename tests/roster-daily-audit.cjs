'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
const {O,state,ctx,date}=fixture();ctx.minute=0;ctx.now=Date.parse(date+'T00:00:00+08:00');ctx.iso=new Date(ctx.now).toISOString();state.accountingYears['2026']={verified:true};state.entitlements=ctx.people.map(p=>({staffId:p.id,year:'2026',week:A.monday(date),quota:4}));
state.absences=[{id:'absence',staffId:'alice',name:'Alice',date,periods:[2,3],reliefRequired:true,typeId:'mc',reason:'SECRET DIAGNOSIS',typeLabel:'PRIVATE MEDICAL'}];
const before=structuredClone(state);O.apply(state,ctx,{operation:'autoAllocate',date});
const sandbox={console,GSISRosterAllocation:A,GSISRosterOperations:O};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),sandbox);sandbox.rosterAllocationAuditAccepted_(state,before,ctx,{requestId:'test-request'});
const view=O.read(state,ctx,{operation:'exportDaily',date,fullTeachers:true,dailyDrive:true}),text=sandbox.rosterAllocationAuditText_(state,date,ctx.iso,{daily:view,final:false});
assert.match(text,/Day summary/);assert.match(text,/Rules glossary/);assert.match(text,/Why/);assert.match(text,/R% before.*after/);assert.match(text,/Other eligible teachers/);assert(!text.includes('SECRET DIAGNOSIS'));assert(!text.includes('PRIVATE MEDICAL'));assert(text.indexOf('Day summary')<text.indexOf('Automatic allocation run'));
const run=state.optimisationRuns.find(r=>r.status==='complete');assert(run?.decisionEvidence?.lessons.some(l=>l.why?.checks.free==='passed'));for(const lesson of run.decisionEvidence.lessons.filter(l=>l.disposition==='selected')){assert(Number.isFinite(lesson.why.percentBefore));assert(Number.isFinite(lesson.why.percentAfter));assert(lesson.why.percentAfter>=lesson.why.percentBefore);}
const summary=text.split('Rules glossary')[0];for(const a of A.effectiveAssignments(state))assert.equal(summary.split('Assignment '+a.id+':').length-1,1);
assert.equal(text,sandbox.rosterAllocationAuditText_(state,date,ctx.iso,{daily:view,final:false}));
const historic=structuredClone(state);for(const run of historic.optimisationRuns)for(const l of run.decisionEvidence?.lessons||[])delete l.why;assert.match(sandbox.rosterAllocationAuditText_(historic,date,ctx.iso,{daily:view}),/original checks and R% were not recorded/);
console.log('existing audit format extended: deterministic summary, glossary, captured Why, before/after fairness, historical unknowns and no absence reasons');

const manual=fixture();manual.ctx.minute=0;manual.ctx.now=Date.parse(manual.date+'T00:00:00+08:00');manual.ctx.iso=new Date(manual.ctx.now).toISOString();manual.state.accountingYears['2026']={verified:true};A.captureWeek(manual.state,manual.ctx,manual.date);
manual.O.apply(manual.state,manual.ctx,{operation:'saveAbsence',date:manual.date,staffId:'alice',typeId:'mc',periods:[2,3]});
const dem=manual.O.demand(manual.ctx,manual.state,manual.date)[0],oldManual=structuredClone(manual.state);manual.O.apply(manual.state,manual.ctx,{operation:'assign',date:manual.date,staffId:'bob',demandIds:[dem.id]});sandbox.rosterAllocationAuditAccepted_(manual.state,oldManual,manual.ctx,{requestId:'manual'});
assert(manual.state.audit.some(e=>e.decisionChanges?.some(c=>c.why?.checks.free==='passed'&&Object.hasOwn(c.why.reasonCategories,'explicit SMC choice'))));
const peer=fixture();peer.ctx.minute=0;peer.ctx.now=Date.parse(peer.date+'T00:00:00+08:00');peer.ctx.iso=new Date(peer.ctx.now).toISOString();peer.teachers[1].R=0;A.captureWeek(peer.state,peer.ctx,peer.date);peer.state.accountingYears['2026']={verified:true};
const absence=peer.O.apply(peer.state,peer.ctx,{operation:'saveAbsence',date:peer.date,staffId:'alice',typeId:'mc',periods:[2,3]});peer.O.apply(peer.state,peer.ctx,{operation:'requestMutual',date:peer.date,absenceId:absence.savedId,proposalOnly:true,requests:[{recipientId:'bob',demandIds:[absence.savedId+':2']}]});
const oldPeer=structuredClone(peer.state),peerCtx={...peer.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};peer.O.apply(peer.state,peerCtx,{operation:'respondMutual',id:peer.state.requests[0].id,decision:'approve'});sandbox.rosterAllocationAuditAccepted_(peer.state,oldPeer,peerCtx,{requestId:'peer'});
const why=peer.state.audit.find(e=>e.operation==='respondMutual').allocationWhy[0].why;assert.equal(why.checks.weeklyR,'overridden by peer approval');assert.equal(why.checks.free,'passed');assert(Object.hasOwn(why.reasonCategories,'accepted colleague choice'));assert.match(sandbox.rosterAllocationAuditText_(peer.state,peer.date,peer.ctx.iso),/accepted colleague cover/);
console.log('manual and peer approvals capture actual checks, with explicit peer quota exceptions');

const mixed=fixture();mixed.ctx.minute=360;mixed.ctx.now=Date.parse(mixed.date+'T06:00:00+08:00');mixed.ctx.iso=new Date(mixed.ctx.now).toISOString();for(const t of mixed.teachers){t.cells=mixed.blank();t.R=t.staffId==='bob'?1:0;}mixed.teachers[1].cells[3]=['Recess duty P1','','',''];A.captureWeek(mixed.state,mixed.ctx,mixed.date);mixed.state.accountingYears['2026']={verified:true};
const mixedRun=A.optimise(mixed.state,mixed.ctx,mixed.date,[{id:'duty',period:3,staffId:null,recessActivationId:'recess',level:1},{id:'ordinary',period:5,staffId:'alice',subject:'EL'}]);assert.equal(mixedRun.assignments.length,2);assert.equal(mixedRun.assignments.find(a=>a.demandId==='duty').rCost,0);assert.equal(mixedRun.decisionEvidence.lessons.find(l=>l.demandId==='ordinary').why.checks.weeklyR,'passed');assert.equal(mixedRun.decisionEvidence.lessons.find(l=>l.demandId==='ordinary').why.percentAfter,100);
console.log('zero-R repurposed duties keep their workload periods without a false quota breach in Why');

// Closing the day must not turn a subject-policy exemption into missing cover.
const closed=fixture();closed.ctx.minute=0;closed.teachers[0].cells[2]=['TL','4A','C1-01',''];
closed.O.apply(closed.state,closed.ctx,{operation:'saveAbsence',date:closed.date,staffId:'alice',typeId:'mc',periods:[2,3]});
const summaryFor=(final)=>{const daily=closed.O.read(closed.state,closed.ctx,{operation:'exportDaily',date:closed.date,fullTeachers:true,dailyDrive:true});return {daily,text:sandbox.rosterAllocationAuditText_(closed.state,closed.date,closed.ctx.iso,{daily,final}).split('Rules glossary')[0]};};
const live=summaryFor(false);assert.match(live.text,/Uncovered lessons: 1\./);assert(!live.text.includes('Uncovered: P2;'));assert(live.text.includes('Uncovered: P3;'));
closed.ctx.today='2026-10-15';closed.ctx.iso='2026-10-15T00:01:00+08:00';
const final=summaryFor(true);assert.match(final.text,/Status: FINAL/);assert.match(final.text,/Uncovered lessons: 1\./);assert(!final.text.includes('Uncovered: P2;'));assert(final.text.includes('Uncovered: P3;'));
assert.equal(final.daily.teacherSummary.demands.find(d=>d.period===2).noReliefRequired,true);
const finalPage=require('../roster-update/public/roster-export.js').dailyTeacherPage(final.daily,{final:true}),aliceRow=finalPage.rows.find(row=>row.teacherId==='alice');
assert.match(aliceRow.cells[2],/No Relief Needed/);assert(!aliceRow.cells[2].includes('UNASSIGNED'));assert.match(aliceRow.cells[3],/UNASSIGNED/);
assert.equal(closed.O.demand(closed.ctx,closed.state,closed.date).find(d=>d.period===2).noReliefRequired,undefined,'export projection does not change historical allocator demands');
console.log('FINAL keeps exempt lessons out of uncovered counts and retains genuinely uncovered lessons');
