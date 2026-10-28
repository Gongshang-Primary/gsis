'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.resubmission=true;f.ctx.reportedAt=f.ctx.iso;
 const save=(periods,extra={})=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,periods,typeId:'mc',...extra});
 const advance=()=>{f.ctx.now+=1000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.reportedAt=f.ctx.iso;};return {...f,save,advance};}
{
 const f=setup(),first=f.save([2,3]),before=copy(f.state.absences);f.advance();const next=f.save([2,3]);assert.deepEqual(next.savedIds,first.savedIds);assert.equal(f.state.absences.length,1);assert.deepEqual(f.state.absences[0].periods,[2,3]);
 const key=f.state.absences[0].lessonSnapshot[0].lessonKey;f.advance();f.save([2,3],{instructionsByDate:{[f.date]:{[key]:'Workbook 2–3'}}});assert.equal(f.state.absences[0].instructions[key],'Workbook 2–3');
 f.advance();f.save([2,3],{instructionsByDate:{[f.date]:{[key]:''}}});assert.equal(f.state.absences[0].instructions[key],'Workbook 2–3');
 f.advance();f.save([2,3],{instructionsByDate:{[f.date]:{[key]:'Workbook 4–5'}}});assert.equal(f.state.absences[0].instructions[key],'Workbook 4–5');
}
for(const periods of [[2,3,4],[3,4]]){const f=setup();const id=f.save([2,3]).savedIds[0];f.advance();f.save(periods);assert.equal(f.state.absences.length,1);assert.equal(f.state.absences[0].id,id);assert.deepEqual(f.state.absences[0].periods,[2,3,4]);}
{
 const f=setup();f.save([2,3,4]);f.state.absences[0].updatedBy='bob@gsps.edu.sg';const before=copy(f.state);f.advance();assert.throws(()=>f.save([2,3]),e=>e.code==='ABSENCE_SHORTER_CONFIRMATION');assert.deepEqual(f.state.absences,before.absences);
 f.ctx.resubmissionChoice='keep';f.save([2,3]);assert.deepEqual(f.state.absences[0].periods,[2,3,4]);
 f.ctx.resubmissionChoice='replace';f.save([2,3]);assert.deepEqual(f.state.absences[0].periods,[2,3]);
}
{
 const f=setup();f.save([2,3]);const old=f.ctx.reportedAt;f.advance();const type=f.state.types.find(t=>t.id!=='mc'&&t.allowSelectAll&&!t.todayOnly&&t.afterMinutes==null&&t.minStartMinutes==null&&!t.requiresDetail&&!t.allowedPeriods);assert(type);f.save([2,3],{typeId:type.id});assert.equal(f.state.absences[0].typeId,type.id);f.ctx.reportedAt=old;f.save([2,3]);assert.equal(f.state.absences[0].typeId,type.id,'late old report cannot restore older type');
}
{
 const f=setup();f.save([2,3]);const key=f.state.absences[0].lessonSnapshot[0].lessonKey;f.advance();f.save([2,3],{instructionsByDate:{[f.date]:{[key]:'New'}}});const latest=f.state.absences[0].instructions[key];f.ctx.reportedAt=new Date(f.ctx.now-5000).toISOString();f.save([2,3],{instructionsByDate:{[f.date]:{[key]:'Old'}}});assert.equal(f.state.absences[0].instructions[key],latest);
 f.advance();f.ctx.user={...f.ctx.user,email:'bob@gsps.edu.sg',staffId:'bob'};assert.throws(()=>f.save([2,3],{instructionsByDate:{[f.date]:{[key]:'Different author'}}}),e=>e.code==='ABSENCE_INSTRUCTIONS_CONFLICT');
}
{
 const f=setup();const a=f.save([2]).savedIds[0],b=f.save([4]).savedIds[0];f.advance();const r=f.save([2,3,4]);assert.equal(f.state.absences.filter(a=>!a.deletedAt).length,3);assert(r.savedIds.includes(a)&&r.savedIds.includes(b));assert.deepEqual(f.state.absences.flatMap(a=>a.periods).sort(),[2,3,4]);
}
console.log('PASS 098d receipt resubmission merging, instructions, chronology, multiple saved rows and shorter choice');
{
 const f=setup();f.save([2,4,6]);f.advance();f.ctx.resubmissionChoice='replace';f.save([2,4]);assert.deepEqual(f.state.absences[0].periods,[2,4],'shortening a sparse set removes only the omitted period');
}
{
 const f=setup();f.save([2,3]);const accepted=f.ctx.reportedAt;f.advance();const type=f.state.types.find(t=>t.id!=='mc'&&t.allowSelectAll&&!t.todayOnly&&t.afterMinutes==null&&t.minStartMinutes==null&&!t.requiresDetail&&!t.allowedPeriods);
 f.O.apply(f.state,{...f.ctx,resubmission:false,reportedAt:undefined},{operation:'saveAbsence',id:f.state.absences[0].id,staffId:'alice',date:f.date,periods:[2,3],typeId:type.id});
 f.ctx.reportedAt=accepted;f.save([2,3]);assert.equal(f.state.absences[0].typeId,type.id,'delayed report cannot overwrite later manual edit');
}
{
 const f=setup();f.save([2,4]);f.save([6]);f.advance();const type=f.state.types.find(t=>t.id!=='mc'&&t.allowSelectAll&&!t.todayOnly&&t.afterMinutes==null&&t.minStartMinutes==null&&!t.requiresDetail&&!t.allowedPeriods);f.save([2,3,4,5,6],{typeId:type.id});assert.deepEqual(f.state.absences.flatMap(a=>a.periods).sort(),[2,3,4,5,6]);
}
{
 const f=setup();f.save([2,3]);const a=f.state.absences[0],key=a.lessonSnapshot[0].lessonKey;f.advance();const at=f.ctx.iso;
 const first=f.O.mergeSubmittedInstructions(a,{a:'First'},{...f.ctx,reportedAt:at,iso:new Date(f.ctx.now+10000).toISOString()});Object.assign(a,first,{instructionsUpdatedBy:f.ctx.user.email,instructionsUpdatedAt:new Date(f.ctx.now+10000).toISOString()});
 const second=f.O.mergeSubmittedInstructions(a,{b:'Second'},{...f.ctx,reportedAt:new Date(f.ctx.now+1000).toISOString(),iso:new Date(f.ctx.now+20000).toISOString()});assert.equal(second.instructions.b,'Second','unrelated note processing timestamp must not suppress new key');
 f.O.apply(f.state,{...f.ctx,resubmission:false,reportedAt:undefined},{operation:'saveAbsence',id:a.id,date:f.date,staffId:'alice',periods:[2,3],typeId:'mc',instructionsByDate:{[f.date]:{[key]:'Human note'}}});f.advance();f.O.apply(f.state,{...f.ctx,resubmission:false,reportedAt:undefined},{operation:'saveAbsence',id:a.id,date:f.date,staffId:'alice',periods:[2,3],typeId:'mc',instructionsByDate:{[f.date]:{[key]:''}}});
 const merged=f.O.mergeSubmittedInstructions(a,{[key]:'Delayed note'},{...f.ctx,reportedAt:at});assert.equal(merged.instructions[key]||'','','explicit clear survives delayed input');
}
{
 const f=setup();f.save([2,3]);const accepted=f.ctx.reportedAt;f.advance();f.O.apply(f.state,{...f.ctx,resubmission:false},{operation:'deleteAbsences',ids:[f.state.absences[0].id],confirm:true,date:f.date});f.ctx.reportedAt=accepted;
 assert.throws(()=>f.save([2,3]),error=>error.code==='ABSENCE_COVERAGE_REVIEW','a delayed report must not silently recreate a later deleted absence');assert.equal(f.state.absences.filter(a=>!a.deletedAt).length,0);
}
