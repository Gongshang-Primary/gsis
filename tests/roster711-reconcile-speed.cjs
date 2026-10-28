'use strict';
const assert=require('node:assert/strict');
const A=require('../shared/roster-allocation.js'),fixture=require('./roster701-fixture.cjs');
const clone=x=>structuredClone(x);

function assign(f,dem,id,staffId){
 f.state.assignments.push({...dem,id,demandId:dem.id,staffId,absentId:dem.staffId,status:'draft',origin:'automatic',sourceKey:JSON.stringify([dem.timetableId,dem.subject,dem.className,dem.venue,dem.groupName])});
}

// A school with many committed lessons must join its immutable timetable only
// once per date. Eligibility remains identical to rebuilding every teacher.
{
 const f=fixture();f.ctx.people=[];f.ctx.days[f.date].teachers=[];
 for(let i=0;i<100;i++){
  const id='teacher'+i,cells=f.blank();
  if(i<20){cells[2]=['EL','Class'+i,'Room'+i,''];cells[3]=cells[2].slice();f.state.absences.push({id:'absent'+i,staffId:id,date:f.date,periods:[2,3],reliefRequired:true});}
  f.ctx.people.push({id,name:id,active:true});f.ctx.days[f.date].teachers.push({staffId:id,name:id,cells,R:4});
 }
 f.ctx.user.staffId='teacher0';const demands=f.O.demand(f.ctx,f.state,f.date);
 demands.forEach((dem,i)=>assign(f,dem,'assignment'+i,'teacher'+(20+i)));
 const expected=clone(f.state),oldContext=A.teacherContext,oldSource=A.teacherSource;
 let fullRows=0,rows=0,joins=0;
 try{
  A.teacherContext=(s,ctx,d)=>{fullRows+=ctx.people.length;return oldContext(s,ctx,d);};
  const fullStart=performance.now();assert.equal(f.O.reconcile(expected,f.ctx),false);const fullMs=performance.now()-fullStart;
  A.teacherSource=(...args)=>{joins++;return oldSource(...args);};
  A.teacherContext=(s,ctx,d,source)=>{rows+=source.rows.length;return oldContext(s,ctx,d,source);};
  const start=performance.now();assert.equal(f.O.reconcile(f.state,f.ctx),false);const elapsedMs=performance.now()-start;
  assert.deepEqual(f.state,expected);assert.equal(joins,1);assert.equal(rows,demands.length);assert.equal(fullRows,demands.length*100);
  console.log(JSON.stringify({check:'reconcile immutable joins',teachers:100,assignments:demands.length,dateJoins:joins,fullTeacherRows:fullRows,selectedTeacherRows:rows,fullMs:Math.round(fullMs),selectedMs:Math.round(elapsedMs)}));
 }finally{A.teacherContext=oldContext;A.teacherSource=oldSource;}
}

// Reconciliation is sequential: cancelling one automatic assignment restores
// the employment cap headroom needed to retain the next assignment.
{
 const f=fixture();f.ctx.minute=360;f.state.absences.push({id:'absence',staffId:'alice',date:f.date,periods:[2,3],reliefRequired:true});
 Object.assign(f.teachers.find(t=>t.staffId==='bob'),{periodCap:1,capConfigured:true,capVerified:true,capHeadroom:1,capWorkload:0});
 const demands=f.O.demand(f.ctx,f.state,f.date);demands.forEach((dem,i)=>assign(f,dem,'assignment'+i,'bob'));
 assert.equal(f.O.reconcile(f.state,f.ctx),true);
 assert.equal(f.state.assignments[0].status,'cancelled');assert.match(f.state.assignments[0].cancellationReason,/cap would be exceeded/i);
 assert.equal(f.state.assignments[1].status,'draft');assert.equal(f.O.reconcile(f.state,f.ctx),false,'rechecking the reconciled state is stable');
 console.log('Reconcile rebuilds balances after each invalidation and preserves remaining valid cover.');
}
