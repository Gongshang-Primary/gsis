'use strict';
// Reuse the deterministic durable adapter, not its previous test scenarios.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const O=require('../shared/roster-operations.js'),source=fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8'),box={require:createRequire(path.resolve('tests/roster096-absence-adapter.cjs')),console};
vm.runInNewContext(source.slice(0,source.indexOf('const reject='))+'\nthis.adapter=adapter;',box);
const copy=value=>JSON.parse(JSON.stringify(value)),adapter=()=>{const h=box.adapter();return {...h,state:()=>copy(h.state())};};
const smc=h=>({...h.identity('alice'),smc:true}),batch=(h,ids=['alice','bob'],extra={})=>h.command(ids[0],{staffIds:ids,view:'report',...extra});
const rejected=(fn,status,pattern)=>assert.throws(fn,e=>e.status===status&&(!pattern||pattern.test(e.message)));

{
 const h=adapter(),tomorrow='2026-10-15';h.ctx.days[tomorrow]=copy(h.ctx.days[h.date]);
 h.ctx.days[h.date].teachers.find(t=>t.staffId==='bob').cells[2]=['MA','4B','C2-01',''];
 h.ctx.days[tomorrow].teachers.find(t=>t.staffId==='bob').cells[2]=['SC','4C','C2-02',''];
 const instructionsByStaffDate={};for(const id of ['alice','bob']){instructionsByStaffDate[id]={};for(const date of [h.date,tomorrow]){const lesson=O.previewAbsence(h.ctx,{id:'preview',staffId:id,date,periods:[2],noReliefSubjects:[]})[0];instructionsByStaffDate[id][date]=lesson?{[lesson.lessonKey]:id+' '+date}:{};}}
 const p=batch(h,undefined,{from:h.date,to:tomorrow,typeId:'others',reasonDetail:'School activity',remarks:'Same details',instructionsByStaffDate}),result=h.call(p,smc(h)),state=h.state();
 assert.equal(state.absences.length,4,'one batch creates every selected teacher/date');assert.equal(result.savedIds.length,4);
 assert.equal(state.receipts.length,1);assert.equal(state.revision,1);assert.equal(h.counts().writes,1,'whole selection is one durable save');
 for(const row of state.absences){assert.deepEqual(row.periods,[2]);assert.equal(row.reasonDetail,'School activity');assert.equal(row.remarks,'Same details');assert.deepEqual(row.instructions,instructionsByStaffDate[row.staffId][row.date]);}
 assert.deepEqual(new Set(result.absences.map(a=>a.staffId)),new Set(['alice','bob']));
 assert.deepEqual(new Set(result.timetable.teachers.filter(t=>Array.isArray(t.cells)).map(t=>t.staffId)),new Set(['alice','bob']),'compact response includes every selected teacher’s lessons');
 assert.equal(h.call(p,smc(h)).replayed,true);assert.deepEqual(h.state(),state);assert.equal(h.counts().writes,1);
 rejected(()=>h.call({...p,staffIds:['alice','charlie']},smc(h)),409,/different save/);
}
{
 const h=adapter();rejected(()=>h.call(batch(h),h.identity('alice')),403);assert.equal(h.counts().writes,0);
 for(const staffIds of [[],['alice','alice'],['alice',null],Array(151).fill('alice'),'alice'])rejected(()=>h.call(batch(h,staffIds),smc(h)),400);
 rejected(()=>h.call(batch(h,['bob'],{staffId:'alice'}),smc(h)),400);
 h.ctx.people.find(p=>p.id==='bob').mobile=h.ctx.people.find(p=>p.id==='alice').mobile;
 rejected(()=>h.call(batch(h),smc(h)),400,/once|duplicate/);assert.equal(h.counts().writes,0);
}
{
 const h=adapter();h.ctx.people.find(p=>p.id==='bob').groups=['Support'];
 rejected(()=>h.call(batch(h),smc(h)),403,/category/);assert.equal(h.counts().writes,0);assert.equal(h.state().absences.length,0);
 h.ctx.people.find(p=>p.id==='bob').groups=[];h.call(h.command('bob'));
 const before=h.state();rejected(()=>h.call(batch(h),smc(h)),409,/overlaps/);assert.deepEqual(h.state(),before,'later teacher overlap leaves no partial batch');
}
{
 const h=adapter(),bad=batch(h,undefined,{instructionsByStaffDate:{alice:{[h.date]:{}},bob:{[h.date]:{'obsolete-lesson':'Wrong source'}}}});
 h.call(bad,smc(h));assert.equal(h.counts().writes,1);assert.equal(h.state().absences.length,2);assert.equal(h.state().absences.find(a=>a.staffId==='bob').instructions['obsolete-lesson'],'Wrong source');
 for(const extra of [{instructionsByDate:{}},{instructionsByStaffDate:[]},{instructionsByStaffDate:{charlie:{}}},{instructionsByStaffDate:{alice:{'2026-12-31':{}}}},{instructionsByStaffDate:{alice:[]}}])rejected(()=>h.call(batch(h,undefined,extra),smc(h)),400);
 assert.equal(h.counts().writes,1);
 const f=require('./roster701-fixture.cjs')(),before=copy(f.state.absences);O.apply(f.state,f.ctx,{...bad,date:f.date});assert.equal(f.state.absences.length,2);assert.equal(f.state.absences.find(a=>a.staffId==='bob').instructions['obsolete-lesson'],'Wrong source','shared apply retains unmatched information on the correct absent teacher');
}
{
 const h=adapter(),a=batch(h,['alice','bob']),b=batch(h,['charlie','dora']);h.beforeLock(()=>h.call(b,smc(h)));h.call(a,smc(h));
 assert.deepEqual(h.state().absences.map(a=>a.staffId),['charlie','dora','alice','bob']);assert.equal(h.state().revision,2);assert.equal(h.counts().contexts,2);assert.equal(h.counts().writes,2);
 for(const p of [a,b])assert.equal(h.call(p,smc(h)).replayed,true);assert.equal(h.counts().writes,2);
}
{
 const h=adapter(),p=batch(h);h.lose();assert.throws(()=>h.call(p,smc(h)),/Lost commit/);
 const receipt=h.call({operation:'receiptStatus',command:p},smc(h));assert.equal(receipt.accepted,true);assert.equal(receipt.savedIds.length,2);assert.equal(h.call(p,smc(h)).replayed,true);assert.equal(h.counts().writes,1);
 rejected(()=>h.call(batch(h,undefined,{id:receipt.savedIds[0],revision:1}),smc(h)),400,/one teacher|single/);
}
{
 const h=adapter(),result=h.call(h.command('alice',{instructionsByDate:{[h.date]:{},'2026-12-31':{'retained-draft':'Outside the saved range'}}}));
 assert.equal(result.savedIds.length,1);assert.deepEqual(h.state().absences[0].instructions,{},'legacy single-teacher dated drafts retain their existing selected-date semantics');
}
{
 const h=adapter(),ids=Array.from({length:150},(_,n)=>'selected'+n);for(const id of ids)h.ctx.people.push({id,name:id,active:true});
 const tomorrow='2026-10-15';h.ctx.days[tomorrow]=copy(h.ctx.days[h.date]);
 const later='2026-10-16';h.ctx.days[later]=copy(h.ctx.days[h.date]);const result=h.call(batch(h,ids,{from:h.date,to:later,fullDay:true}),smc(h));assert.equal(result.savedIds.length,450);assert.equal(h.counts().writes,1,'actual record size replaces the old300teacher-date cap');
}
{
 const h=adapter(),p=batch(h);h.beforeLock(()=>h.update(s=>{s.types.find(t=>t.id==='mc').allowedPeriods=[3];s.revision++;}));rejected(()=>h.call(p,smc(h)),400,/not permitted/);assert.equal(h.counts().writes,0);assert.equal(h.state().absences.length,0);
 h.ctx.people.find(p=>p.id==='bob').groups=['Support'];rejected(()=>h.call(batch(h),smc(h)),403);assert.equal(h.counts().writes,0);
}
{
 // A changed source manifest forces one new preparation, then validates both
 // teachers' instructions against that source before the atomic commit.
 const h=adapter();let changed=false;const old=O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],noReliefSubjects:[]})[0];
 h.scope.rosterOperationsReferenceStamp_=ctx=>{if(!changed){changed=true;h.ctx.days[h.date].teachers.find(t=>t.staffId==='alice').cells[2]=['SC','4A','C1-01',''];return 'changed-reference';}return h.scope.rosterOperationsReferenceKey_(ctx);};
 h.call(batch(h,undefined,{instructionsByStaffDate:{alice:{[h.date]:{[old.lessonKey]:'Outdated lesson'}}}}),smc(h));assert.equal(h.counts().contexts,2,'source-manifest fence still forces a fresh preparation');assert.equal(h.counts().writes,1);assert.equal(h.state().absences.length,2);assert.equal(h.state().absences.find(a=>a.staffId==='alice').instructions[old.lessonKey],'Outdated lesson');
}
{
 // Exercise the production context builder, including its compact teacher-cell
 // filter, rather than only supplying the in-memory fixture context.
 const h=adapter(),scope=h.scope;vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'06':'00';
 scope.rosterIndex_=()=>({entries:h.ctx.timetableEntries});let modelReads=0;
 const blocks=h.ctx.people.slice(0,4).map(p=>({name:p.name,cells:Array.from({length:85},()=>['EL','4A','Room',''])}));
 scope.rosterModel_=()=>{modelReads++;return {layoutMode:'single-week',maxPeriod:16,timing:{startMinutes:420,periodMinutes:30},single:{perDay:17,blocks}};};
 scope.rosterOperationsQuota_=()=>{throw Error('Report should not load quota');};
 const c={rosterPeople:h.ctx.people,user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:false},rosterSMCIds:['alice']},input={operation:'read',compact:true,view:'report',date:h.date,staffId:'bob',staffIds:['alice','bob'],calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even'}}},request={input,identity:h.identity('alice')};
 const ctx=scope.rosterOperationsContext_(request,c,h.state());assert.deepEqual(Array.from(ctx.days[h.date].teachers,t=>t.staffId),['alice','bob']);assert.equal(modelReads,1);
 const view=O.reportView(h.state(),ctx,input);assert.deepEqual(view.timetable.teachers.filter(t=>Array.isArray(t.cells)).map(t=>t.staffId),['alice','bob']);assert.deepEqual(view.baselineTimetable.teachers.filter(t=>Array.isArray(t.cells)).map(t=>t.staffId),['alice','bob']);
 rejected(()=>scope.rosterOperationsContext_(request,{...c,user:{...c.user,rosterSMC:false}},h.state()),403);assert.equal(modelReads,1,'ordinary teacher denied before loading timetable cells');
 const direct={...h.ctx,user:h.identity('alice')};rejected(()=>O.reportView(h.state(),direct,input),403);
 const suspended=h.state(),plan=require('../shared/roster-stapler.js').create({...copy(ctx.days[h.date]),date:h.date},{date:h.date});
 suspended.staplerPlans=[{date:h.date,baselineId:'baseline',revision:3,confirmed:true,confirmedRevision:3,confirmedPlan:structuredClone(plan),draft:plan}];
 scope.GSISRosterStapler=require('../shared/roster-stapler.js');const composed=scope.rosterOperationsContext_(request,c,suspended),projection=O.reportView(suspended,composed,input);
 assert.deepEqual(Array.from(composed.days[h.date].teachers,t=>t.staffId),['alice','bob'],'confirmed STAPLER compact context retains every selected teacher');
 assert.deepEqual(Array.from(projection.timetable.teachers,t=>t.staffId),['alice','bob']);assert.equal(projection.timetable.staplerRevision,3);
 // An explicit one-teacher selection is authoritative even when the optional
 // reviewed staffId is omitted. It must survive confirmed STAPLER composition.
 const singleInput={...input,staffIds:['bob']};delete singleInput.staffId;
 const singleRequest={...request,input:singleInput},singleContext=scope.rosterOperationsContext_(singleRequest,c,suspended),singleView=O.reportView(suspended,singleContext,singleInput);
 assert.deepEqual(Array.from(singleContext.days[h.date].teachers,t=>t.staffId),['bob'],'single selected teacher survives confirmed STAPLER without a separate staffId');
 assert.deepEqual(Array.from(singleView.timetable.teachers,t=>t.staffId),['bob']);assert.equal(singleView.timetable.teachers[0].cells[2][0],'EL');
 const teacherContacts={...c,user:{...c.user,rosterSMC:false}},readsBeforeDenied=modelReads;
 rejected(()=>scope.rosterOperationsContext_(singleRequest,teacherContacts,suspended),403);assert.equal(modelReads,readsBeforeDenied,'ordinary teacher cannot select one colleague without staffId');
 const selfInput={...singleInput,staffIds:['alice']},selfContext=scope.rosterOperationsContext_({...request,input:selfInput},teacherContacts,suspended);
 assert.deepEqual(Array.from(selfContext.days[h.date].teachers,t=>t.staffId),['alice'],'ordinary teacher retains their own explicit one-teacher selection');
}
console.log('PASS multiple-teacher absences: complete instructions, bounds, authority, no partial saves, reversed commits and exact receipt recovery.');

