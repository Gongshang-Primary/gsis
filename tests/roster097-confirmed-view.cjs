'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js'),R=require('../shared/roster.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){
 const f=fixture(),date=f.date,base=f.ctx.days[date],original=S.create({...base,date});
 const tile=original.tiles.find(t=>t.teacherId==='alice'&&t.period===2);
 const confirmed=S.apply(original,{type:'edit',tileId:tile.id,patch:{venue:'Confirmed room'}});
 const record={date,baselineId:base.id,revision:2,confirmed:true,confirmedRevision:2,confirmedPlan:clone(confirmed),confirmedAt:f.ctx.iso,draft:clone(confirmed)};
 f.state.staplerPlans.push(record);
 const ctx={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false},days:{[date]:{id:base.id,periods:base.periods,teachers:[]}}};
 return {...f,base,original,tile,confirmed,record,ctx,read:()=>f.O.timetableDay(f.state,ctx,{date})};
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('Current confirmed timetable is visible without Calendar and listed for ordinary teachers',()=>{
 const f=setup(),before=JSON.stringify(f.state),out=f.read();assert.equal(out.source,'confirmed');assert.equal(out.confirmedRevision,2);assert.equal(out.staplerRevision,2);assert.equal(out.publicationRevision,0);assert.equal(out.readOnly,true);assert.equal(out.teachers.find(t=>t.staffId==='alice').cells[2][2],'Confirmed room');assert.equal(out.calendar.verified,false);
 assert.equal(f.O.staplerDatesView(f.state,f.ctx).dates[0].canViewConfirmed,true);assert.equal(JSON.stringify(f.state),before,'reading neither publishes nor queues notifications');assert.doesNotMatch(JSON.stringify(out),/mobile|quota|"R"|instructions|reportedBy|confirmedBy/);
});
test('New confirmation takes precedence over an older publication and never overlaid old relief',()=>{
 const f=setup();f.record.published=clone(f.original);f.record.publishedRevision=1;
 f.state.dailyPublicationStates[f.date]={date:f.date,baselineId:f.base.id,sourceRevision:9,revision:1,staplerRevision:1,periods:clone(f.base.periods),teachers:[{staffId:'alice',name:'Alice',cells:f.blank()}]};
 assert.equal(f.read().source,'confirmed');assert.equal(f.read().teachers.find(t=>t.staffId==='alice').cells[2][2],'Confirmed room');
});
test('Equal or newer publication keeps actual published relief deltas',()=>{
 for(const publishedRevision of [2,3]){const f=setup();f.record.published=clone(f.confirmed);f.record.publishedRevision=publishedRevision;const cells=f.blank();cells[1]=['MA','5B','Published relief room',''];f.state.dailyPublicationStates[f.date]={date:f.date,baselineId:f.base.id,sourceRevision:9,revision:4,staplerRevision:publishedRevision,periods:clone(f.base.periods),teachers:[{staffId:'bob',name:'Bob',cells}]};const out=f.read();assert.equal(out.source,'published');assert.equal(out.publicationRevision,4);assert.equal(out.teachers.find(t=>t.staffId==='bob').cells[1][2],'Published relief room');}
});
test('Later unconfirmed edits cannot leak through timetable browse or confirmed projection',()=>{
 const f=setup();f.record.draft=S.apply(f.confirmed,{type:'edit',tileId:f.tile.id,patch:{venue:'PRIVATE DRAFT'}});f.record.revision=3;const out=f.read();assert.equal(out.confirmedRevision,2);assert.doesNotMatch(JSON.stringify(out),/PRIVATE DRAFT/);assert.equal(out.teachers.find(t=>t.staffId==='alice').cells[2][2],'Confirmed room');
 assert.equal(typeof f.O.confirmedStaplerProjection,'function');const safe=f.O.confirmedStaplerProjection(f.record.confirmedPlan);safe.tiles[0].venue='LOCAL EDIT';assert.notEqual(f.record.confirmedPlan.tiles[0].venue,'LOCAL EDIT');
});
test('Unconfirmed drafts and ambiguous legacy confirmation do not grant teacher access',()=>{
 const f=setup();delete f.record.confirmedPlan;delete f.record.confirmedRevision;f.record.updatedAt='2026-10-14T01:00:00Z';assert.equal(f.read().source,'baseline');assert.equal(f.O.staplerDatesView(f.state,f.ctx).dates[0].canViewConfirmed,false);
});
test('Past confirmed plans stay private while past published timetables remain available',()=>{
 const f=setup();f.ctx.today='2026-10-15';assert.equal(f.read().source,'baseline');f.record.published=clone(f.original);f.record.publishedRevision=1;assert.equal(f.read().source,'published');
});
test('Future confirmed plans do not require a verified Calendar request',()=>{
 const f=setup();f.ctx.today='2026-10-13';f.ctx.days[f.date].verified=false;f.ctx.days[f.date].schoolDay=false;assert.equal(f.read().source,'confirmed');
});
test('Missing or ineligible staff identity cannot obtain unpublished confirmation',()=>{
 for(const change of [f=>delete f.ctx.user,f=>f.ctx.user.staffId='unknown',f=>f.ctx.people.find(p=>p.id==='bob').active=false,f=>f.ctx.people.find(p=>p.id==='bob').role='OSO']){const f=setup();change(f);assert.equal(f.read().source,'baseline');}
});
test('Verified SMC and Admin can view current confirmation without eligible teacher identity',()=>{
 for(const role of ['smc','admin']){const f=setup();f.ctx.user={staffId:null,email:'manager@gsps.edu.sg',smc:false,admin:false,[role]:true};f.record.published=clone(f.original);f.record.publishedRevision=1;assert.equal(f.read().source,'confirmed');f.ctx.today='2026-10-15';assert.equal(f.read().source,'published','privileged access must not expose historical unpublished confirmation');}
});
test('Confirmed cells redact imported absence reasons and retain immutable stored evidence',()=>{
 const f=setup();for(const tile of [f.record.confirmedPlan.tiles[0],f.record.confirmedPlan.baseline.tiles[0]]){tile.subject='Absent — PRIVATE_REASON';if(tile.source)tile.source.subject=tile.subject;}const before=JSON.stringify(f.record.confirmedPlan),out=f.read();assert.doesNotMatch(JSON.stringify(out),/PRIVATE_REASON/);assert.equal(out.teachers.find(t=>t.staffId==='alice').cells[2][0],'Absent');assert.equal(JSON.stringify(f.record.confirmedPlan),before);
});
test('Confirmed identity and timing remain independent of current comparison',()=>{
 const f=setup(),before=f.read();f.ctx.days[f.date].id='replacement';assert.deepEqual(f.read(),before);f.ctx.days[f.date].id=f.base.id;f.ctx.days[f.date].periods=f.base.periods.map(p=>({...p,startMinutes:p.startMinutes+1}));assert.deepEqual(f.read(),before);
});
test('Timetable backend uses actual Singapore today, verified staff and no quota or Calendar lookup',()=>{
 const f=setup(),code=fs.readFileSync('backend/RosterOperations.gs','utf8'),start=code.indexOf('function rosterTimetableDay_('),end=code.indexOf('\n// Optimistic daily commands',start);let readCtx;
 const model={maxPeriod:16,timing:{startMinutes:420,periodMinutes:30}};
 const box={GSISRosterOperations:{...f.O,timetableDay:(s,ctx,p)=>{readCtx=ctx;return f.O.timetableDay(s,ctx,p);}},GSISRoster:R,rosterOperationsAuthority_:()=>({staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}),rosterToday_:()=> '2026-10-15',rosterIndex_:()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]}),rosterModel_:()=>model,rosterOperationsPhase_:(_,fn)=>fn(),rosterOperationsState_:()=>f.state};vm.createContext(box);vm.runInContext(code.slice(start,end),box);
 const out=box.rosterTimetableDay_({identity:{email:'bob@gsps.edu.sg'},input:{date:f.date,today:f.date,calendarByDate:{[f.date]:{schoolDay:true}}}},{rosterPeople:f.people});assert.equal(readCtx.today,'2026-10-15');assert.equal(readCtx.user.staffId,'bob');assert.equal(out.source,'baseline');assert.equal(readCtx.people.find(p=>p.id==='bob').active,true);
});
console.log(passed+' confirmed timetable view checks passed');
