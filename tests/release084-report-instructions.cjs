'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){const f=fixture();f.ctx.minute=360;f.teachers[0].cells[3]=['MA','4A','C1-01',''];f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});const report=f.O.reportView(f.state,f.ctx,{date:f.date}),a=report.absences[0],keys=report.demands.map(d=>d.lessonKey);assert.equal(typeof a.instructionScope,'string','report must expose an instruction dependency scope');return {...f,a,keys,command:(key,value,base='')=>({operation:'saveInstructions',date:f.date,absenceIds:[a.id],expectedInstructionScopes:{[a.id]:a.instructionScope},expectedTimetableId:report.timetable.id,expectedStaplerRevision:report.timetable.staplerRevision,expectedParity:report.timetable.parity,instructionChanges:[{absenceId:a.id,base:{[key]:base},values:{[key]:value},baseInstructionsNA:false,instructionsNA:false}]})};}
{
 const f=setup(),[first,second]=f.keys;f.O.apply(f.state,f.ctx,f.command(first,'Read chapter one'));f.O.apply(f.state,f.ctx,f.command(second,'Practise sums'));assert.deepEqual(f.state.absences[0].instructions,{[first]:'Read chapter one',[second]:'Practise sums'});f.O.apply(f.state,f.ctx,f.command(first,'Conflicting edit'));assert.equal(f.state.absences[0].instructions[first],'Conflicting edit');assert(f.state.absences[0].instructionNotes[first].history.some(row=>row.text==='Read chapter one'),'prior text remains in note history');f.O.apply(f.state,f.ctx,f.command(first,'Read chapter one'));assert.equal(f.state.absences[0].instructions[second],'Practise sums');
 f.state.absences[0].instructionsNA=true;f.O.apply(f.state,f.ctx,f.command(second,'Updated sums','Practise sums'));assert.equal(f.state.absences[0].instructionsNA,true,'unchanged checkbox must not erase concurrent change');
 const p=f.command(second,'Updated sums','Updated sums');p.instructionChanges[0]={absenceId:f.a.id,base:{},values:{},baseInstructionsNA:true,instructionsNA:false};f.O.apply(f.state,f.ctx,p);assert.equal(f.state.absences[0].instructionsNA,false);
}
for(const mutate of [f=>{f.teachers[0].cells[2]=['SCI','4B','Lab',''];},f=>{f.state.absences[0].periods=[3];},f=>{f.ctx.days[f.date].staplerRevision=2;},f=>{f.ctx.days[f.date].parity='odd';}]){const f=setup(),p=f.command(f.keys[0],'Keep my draft');mutate(f);f.O.apply(f.state,f.ctx,p);assert.equal(f.state.absences[0].instructions[f.keys[0]],'Keep my draft');assert(f.O.instructionNotesView(f.state.absences[0],f.ctx).some(note=>note.text==='Keep my draft'),'source/coverage changes retain information instead of blocking it');}
{
 const f=setup(),p=f.command(f.keys[0],'Owner only');f.ctx.user={staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false};assert.throws(()=>f.O.apply(f.state,f.ctx,p),e=>e.status===403);
}
{
 const f=setup(),p=f.command(f.keys[0],'Valid');p.instructionChanges.push({...p.instructionChanges[0],absenceId:'missing'});const before=clone(f.state);assert.throws(()=>f.O.apply(f.state,f.ctx,p));assert.deepEqual(f.state,before,'multi-record validation completes before applying any patch');
}
console.log('PASS v0.8.4 instruction patches: separate cells merge, same-cell history, tolerant source/coverage matching, owner denial, atomic batch rejection, NA three-way merge.');
