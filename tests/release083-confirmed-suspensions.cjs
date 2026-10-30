'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const f=fixture(),O=f.O,today=f.date,future='2026-10-15',past='2026-10-13',draftDate='2026-10-16';
f.ctx.timetableEntries=[{id:'baseline',from:past,to:'2026-12-31',status:'active'}];
for(const date of [today,future,past,draftDate]){
 const plan=S.create({...f.ctx.days[today],date,teachers:f.ctx.days[today].teachers.filter(t=>t.staffId!=='bob')});
 f.state.staplerPlans.push({date,name:'Suspension '+date,baselineId:'baseline',revision:2,draft:S.apply(plan,{type:'edit',tileId:plan.tiles[0].id,patch:{venue:'Private draft room'}}),...(date!==draftDate?{confirmedPlan:plan,confirmedRevision:1,confirmedAt:f.ctx.iso,confirmedBy:'alice@gsps.edu.sg'}:{})});
}
const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
const list=O.read(f.state,teacher,{operation:'staplerDates'});
assert.deepEqual(list.dates.map(r=>r.date).sort(),[today,future,draftDate],'active teachers see confirmed dates and upcoming unconfirmed date metadata');
assert(list.dates.filter(r=>r.canListConfirmed).every(r=>r.canViewConfirmed&&r.status==='Confirmed'&&!r.mayEdit&&!r.mayManage));
const upcoming=list.dates.find(r=>r.date===draftDate);assert.equal(upcoming.canListUpcoming,true);assert.equal(upcoming.mayEdit,false);assert.equal(upcoming.draftRevision,0);assert.doesNotMatch(JSON.stringify(upcoming),/Suspension|Private draft room/);
for(const date of [today,future]){
 const view=O.read(f.state,teacher,{operation:'stapler',date});
 assert.equal(view.viewMode,'confirmed');assert.equal(view.canEdit,false);assert.equal(view.canConfirm,false);assert.equal(view.staplerRevision,1);
 assert.doesNotMatch(JSON.stringify(view.plan),/Private draft room/);assert.equal(view.people.length,0);assert.equal(view.plan.warnings.length,0);
}
assert.equal(O.mayViewConfirmed(f.state,{...teacher,people:f.people.map(p=>({...p,active:false}))},f.state.staplerPlans[0]),false);
assert.equal(O.mayViewConfirmed(f.state,{...teacher,user:{email:'unmapped@gsps.edu.sg'}},f.state.staplerPlans[0]),false);

{
 const h=fixture(),day=h.ctx.days[h.date],card=(id,teacher,period,subject,className)=>({id,teacher,assignedPeriod:period,subject,className,venue:'Classroom',group:'G1',sheet:'Even Week',day:'Wednesday',location:'teacher'});
 const imported=S.importLegacy(S.create({...day,date:h.date}),{app:'Stapler',version:'4.3',stateType:'relief',selectedDate:h.date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:['Alice','Bob'],tiles:[card('lesson','Alice',2,'EL','4A'),card('prose','Bob',4,'Discuss absent protagonists\nordinary teaching text','4B')],reliefAbsences:[{teacher:'Alice',periods:[0,2],reason:'Others',reasonOther:'Private medical\nPRIVATE_REASON',assignments:{2:'Bob'}}]},{people:h.people});
 h.state.staplerPlans.push({date:h.date,baselineId:'baseline',revision:1,draft:imported,confirmedPlan:imported,confirmedRevision:1,confirmedAt:h.ctx.iso});
 const before=JSON.stringify(h.state),view=O.read(h.state,{...h.ctx,user:teacher.user},{operation:'stapler',date:h.date});
 assert.doesNotMatch(JSON.stringify(view),/Private medical|PRIVATE_REASON/,'confirmed teacher response must redact offline absence reasons in every provenance copy');
 S.validate(view.plan);assert.equal(view.plan.tiles.find(t=>t.teacherId==='alice'&&t.period===2).subject,'Absent');
 assert.equal(view.plan.tiles.find(t=>t.teacherId==='bob'&&t.period===4).subject,'Discuss absent protagonists\nordinary teaching text');
 assert.match(JSON.stringify(O.read(h.state,h.ctx,{operation:'stapler',date:h.date}).plan),/PRIVATE_REASON/,'authorised planner retains its original evidence');
 assert.equal(JSON.stringify(h.state),before,'read-only redaction cannot change the stored plan');
}

const dom=new JSDOM('<main></main>',{url:'https://roster.test',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s),calls=[];
w.eval(fs.readFileSync('shared/roster-stapler.js','utf8'));w.eval(fs.readFileSync('roster-update/public/roster-stapler-ui.js','utf8'));
const ctx={container:q('main'),today:()=>today,profile:{user:teacher.user},status(){},api:async(_,p)=>{calls.push(p);assert(['staplerDates','stapler'].includes(p.operation),'browsing must only read');const result=O.read(f.state,teacher,p);return {...result,planningAllowed:false};}};
(async()=>{try{
 await w.RosterStaplerUI.render(ctx);
 const confirmed=q('[data-confirmed-suspensions]');assert(confirmed,'teacher has a dedicated confirmed suspension list');
 assert.match(confirmed.textContent,/Confirmed suspensions/);assert.match(confirmed.textContent,/Timetable from the main screen/);
 assert.equal(confirmed.querySelectorAll('[data-open-date]').length,2);assert.equal(confirmed.querySelectorAll('input,select,[data-plan-action],[data-save]').length,0);
 assert.equal(q('[data-planning-access]').open,false,'planning requests are secondary to read-only confirmed dates');
 confirmed.querySelector('[data-open-date="'+today+'"]').click();await new Promise(resolve=>setImmediate(resolve));
 assert.match(q('[data-plan-meta]').textContent,/Confirmed plan · view only · revision 1/);assert.doesNotMatch(q('.planner-grid').textContent,/Private draft room/);
 assert(q('[data-save]').hidden);assert(q('[data-confirm]').hidden);assert.equal(q('[data-tile][draggable=true]'),null);
 assert.equal(calls.filter(c=>c.operation==='stapler').length,1);
 console.log('PASS teachers list confirmed current/future suspensions, open frozen read-only snapshots, retain private drafts and see Timetable guidance.');
}finally{w.RosterStaplerUI.unmount();dom.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
