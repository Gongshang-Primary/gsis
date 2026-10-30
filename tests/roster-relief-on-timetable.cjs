'use strict';
const assert=require('node:assert/strict'),R=require('../shared/roster.js'),fixture=require('./roster701-fixture.cjs');
global.GSISRoster=R;global.JSZip=require('jszip');const X=require('../roster-update/public/roster-export.js');
const f=fixture(),{O,state,ctx,date}=f,names={alice:'Alice',bob:'Bob',charlie:'Charlie'},teacher={...ctx,timetableNames:names,user:{staffId:'bob',smc:false,admin:false}};
state.dailyPublicationStates[date]={date,revision:1,publishedAt:ctx.iso,teachers:[{staffId:'bob',name:'Bob',baseline:ctx.days[date].teachers[1].cells,rows:Array.from({length:6},(_,i)=>({kind:'relief',period:i+1,subject:'EL',className:'4A',venue:'Hall',groupName:'G1',absentId:'alice',absentName:'Alice'}))}]};
state.assignments.push({id:'new',staffId:'charlie',date,period:2,status:'draft',subject:'MA',className:'4A',venue:'Room',groupName:'G1',absentId:'alice',absentName:'Alice'});
const publicRelief=O.timetableRelief(state,teacher,date);assert.equal(publicRelief.rows.length,6);assert(publicRelief.rows.every(row=>row.staffId==='bob'&&!row.unpublished));assert(!JSON.stringify(publicRelief).includes('instructions'));
const admin=O.timetableRelief(state,{...ctx,timetableNames:names},date);assert.equal(admin.rows.length,1);assert.equal(admin.rows[0].unpublished,true);assert.equal(admin.rows[0].staffId,'charlie');
const periods=ctx.days[date].periods,day={date,source:'baseline',periods,teachers:ctx.days[date].teachers,classes:['4A'],relief:publicRelief};
for(const [type,name]of [['teacher','Bob'],['class','4A'],['tg','4A · G1']]){
 const pages=X.reliefPages(day,{type,names:[name],lastPeriod:8});assert.equal(pages.length,1);assert(pages[0].rows[0].cells.filter(cell=>cell.includes('Relief for Alice')).length>=6);assert.match(X.tableHtml(pages[0]),/data-relief="true"/);
}
const model={layoutMode:'odd-even',odd:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:1,blocks:[{name:'Alice',cells:Array.from({length:5},()=>['EL','4A','R',''])}]},even:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:1,blocks:[{name:'Alice',cells:Array.from({length:5},()=>['MA','4A','R',''])}]},maxPeriod:0,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:0},recesses:[]};
assert.equal(X.datedBaseline(model,date,null),null,'never guess odd/even');assert.equal(X.datedBaseline(model,date,'even').teachers[0].cells[0][0],'MA');
const unpublished={...day,relief:admin};assert.match(X.reliefPages(unpublished,{type:'teacher',names:['Charlie'],lastPeriod:8})[0].rows[0].cells[2],/Not yet published/);

const shortPeriods=[{period:0,start:'07:00',end:'07:30',startMinutes:420,endMinutes:450}],combined=fixture();
combined.state.dailyPublicationStates[date]={date,revision:1,publishedAt:ctx.iso,teachers:[{staffId:'bob',name:'Bob',cells:[['MA + EL','4B + 4A','Own + Extra','']],baseline:[['MA','4B','Own','']],rows:[{kind:'relief',period:0,subject:'EL',className:'4A',venue:'Extra',absentId:'alice',absentName:'Alice'}]}]};
const combinedRelief=O.timetableRelief(combined.state,{...teacher,timetableNames:names},date),combinedDay={date,source:'published',periods:shortPeriods,teachers:[{staffId:'bob',name:'Bob',cells:[['MA + EL','4B + 4A','Own + Extra','']]},{staffId:'alice',name:'Alice',cells:[['EL','4A','Extra','']]}],relief:combinedRelief};
const combinedTeacher=X.reliefPages(combinedDay,{type:'teacher',names:['Bob'],lastPeriod:0})[0].rows[0].cells[0];assert.match(combinedTeacher,/MA/);assert.match(combinedTeacher,/EL/);assert.deepEqual(X.reliefPages(combinedDay,{type:'class',lastPeriod:0}).map(p=>p.name),['4A','4B'],'published combination retains both classes');
combined.state.dailyPublicationStates[date].teachers[0].cells[0]=['MA + EL','4B + 4A','Extra','G1'];combined.state.dailyPublicationStates[date].teachers[0].rows[0].groupName='G1';assert.deepEqual(O.timetableRelief(combined.state,{...teacher,timetableNames:names},date).rows[0].originalLesson,['MA','4B','',''],'combined recovery preserves originally empty venue and group');
const stale=fixture(),S=require('../shared/roster-stapler.js'),savedPlan=S.create({...stale.ctx.days[date],date}),oldCells=stale.ctx.days[date].teachers[1].cells.map(c=>c.slice());oldCells[2]=['EL','4A','Old room',''];
stale.state.staplerPlans.push({date,baselineId:'baseline',revision:1,published:savedPlan,publishedRevision:1});
stale.state.dailyPublicationStates[date]={date,baselineId:'baseline',revision:1,sourceRevision:1,staplerRevision:1,publishedAt:ctx.iso,periods:savedPlan.periods,teachers:[{staffId:'bob',name:'Bob',cells:oldCells,baseline:stale.ctx.days[date].teachers[1].cells,rows:[{kind:'relief',period:2,subject:'EL',className:'4A',venue:'Old room',absentId:'alice',absentName:'Alice'}]}]};
stale.state.assignments.push({id:'replacement',staffId:'charlie',date,period:2,status:'draft',subject:'EL',className:'4A',venue:'New room',absentId:'alice',absentName:'Alice'});
const live=O.timetableDay(stale.state,{...stale.ctx,timetableNames:names},{date});assert.equal(live.teachers.find(t=>t.staffId==='bob').cells[2][0],'','SMC source excludes old published relief');
const liveCell=X.reliefPages(live,{type:'class',names:['4A'],lastPeriod:3})[0].rows[0].cells[2];assert.match(liveCell,/Charlie/);assert.doesNotMatch(liveCell,/Bob/);
stale.state.assignments=[];stale.state.absences.push({id:'absence',staffId:'alice',date,periods:[2],reliefRequired:true});const noCover=O.timetableDay(stale.state,{...stale.ctx,timetableNames:names},{date});assert.equal(noCover.teachers.find(t=>t.staffId==='alice').cells[2][0],'Absent','SMC keeps current absence after removing old relief');
const frozen=O.timetableDay(stale.state,{...stale.ctx,timetableNames:names,user:teacher.user},{date});assert.equal(frozen.relief.rows[0].staffId,'bob','ordinary user retains prior published reliever');

(async()=>{const out=await X.makeWorkbook(X.reliefPages(day,{type:'teacher',names:['Bob'],lastPeriod:8})),zip=await JSZip.loadAsync(await out.blob.arrayBuffer());assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/Relief for Alice/);console.log('PASS frozen published and saved-only relief, six duties, teacher/class/TG, parity, labels and Excel');})().catch(e=>{console.error(e);process.exitCode=1;});

