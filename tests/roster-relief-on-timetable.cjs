'use strict';
const assert=require('node:assert/strict'),R=require('../shared/roster.js'),fixture=require('./roster701-fixture.cjs');
global.GSISRoster=R;global.JSZip=require('jszip');const X=require('../roster-update/public/roster-export.js');
const f=fixture(),{O,state,ctx,date}=f,names={alice:'Alice',bob:'Bob',charlie:'Charlie'},teacher={...ctx,timetableNames:names,user:{staffId:'bob',smc:false,admin:false}};
state.dailyPublicationStates[date]={date,revision:1,publishedAt:ctx.iso,teachers:[{staffId:'bob',name:'Bob',baseline:ctx.days[date].teachers[1].cells,rows:Array.from({length:6},(_,i)=>({kind:'relief',period:i+1,subject:'EL',className:'4A',venue:'Hall',groupName:'G1',absentId:'alice',absentName:'Alice'}))}]};
state.assignments.push({id:'new',staffId:'charlie',date,period:2,status:'draft',subject:'MA',className:'4A',venue:'Room',groupName:'G1',absentId:'alice',absentName:'Alice'});
const publicRelief=O.timetableRelief(state,teacher,date);assert.equal(publicRelief.rows.length,6);assert(publicRelief.rows.every(row=>row.staffId==='bob'&&!row.unpublished));assert(!JSON.stringify(publicRelief).includes('instructions'));
const admin=O.timetableRelief(state,{...ctx,timetableNames:names},date);assert.equal(admin.rows.length,1);assert.equal(admin.rows[0].unpublished,true);assert.equal(admin.rows[0].staffId,'charlie');
const periods=ctx.days[date].periods,day={date,source:'baseline',periods,teachers:ctx.days[date].teachers,classes:['4A'],relief:publicRelief};
for(const [type,name]of [['teacher','Bob'],['class','4A'],['tg','P4 · G1']]){
 const pages=X.reliefPages(day,{type,names:[name],lastPeriod:8});assert.equal(pages.length,1);assert(pages[0].rows[0].cells.filter(cell=>cell.includes('Relief for Alice')).length>=6);assert.match(X.tableHtml(pages[0]),/data-relief="true"/);
}
const model={layoutMode:'odd-even',odd:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:1,blocks:[{name:'Alice',cells:Array.from({length:5},()=>['EL','4A','R',''])}]},even:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:1,blocks:[{name:'Alice',cells:Array.from({length:5},()=>['MA','4A','R',''])}]},maxPeriod:0,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:0},recesses:[]};
assert.equal(X.datedBaseline(model,date,null),null,'never guess odd/even');assert.equal(X.datedBaseline(model,date,'even').teachers[0].cells[0][0],'MA');
const unpublished={...day,relief:admin};assert.match(X.reliefPages(unpublished,{type:'teacher',names:['Charlie'],lastPeriod:8})[0].rows[0].cells[2],/Not yet published/);
(async()=>{const out=await X.makeWorkbook(X.reliefPages(day,{type:'teacher',names:['Bob'],lastPeriod:8})),zip=await JSZip.loadAsync(await out.blob.arrayBuffer());assert.match(await zip.file('xl/worksheets/sheet1.xml').async('string'),/Relief for Alice/);console.log('PASS frozen published and saved-only relief, six duties, teacher/class/TG, parity, labels and Excel');})().catch(e=>{console.error(e);process.exitCode=1;});
