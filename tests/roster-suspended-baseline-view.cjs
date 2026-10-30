'use strict';
const assert=require('node:assert/strict'),R=require('../shared/roster.js');
global.GSISRoster=R;global.JSZip=require('jszip');
const X=require('../roster-update/public/roster-export.js'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const f=fixture(),base=f.ctx.days[f.date],plan=S.create({...base,date:f.date}),before=JSON.stringify(plan),original=f.O.timetableBaseline(plan,f.date);
assert.equal(JSON.stringify(plan),before);assert.equal(original.teachers.find(t=>t.staffId==='alice').cells[2][0],'EL');
plan.baseline.recessDefaults=[{level:4,startMinutes:570,endMinutes:600}];assert(f.O.timetableBaseline(plan,f.date).recesses.some(r=>r.className==='4A'&&r.periods.includes(5)),'usual baseline retains configured recess');
const periods=base.periods.slice(0,4),teachers=[{staffId:'alice',name:'Alice',cells:[['','','',''],['','','',''],['MA','4A','New room','G1'],['EL','4A','Old room','G1']]}],baseline={date:f.date,periods,teachers:[{staffId:'alice',name:'Alice',cells:[['','','',''],['','','',''],['EL','4A','Old room','G1'],['EL','4A','Old room','G1']]}]};
const day={date:f.date,source:'published',periods,teachers,baseline,classes:['4A']};
for(const type of ['teacher','class','tg']){
 const pages=X.comparisonPages(day,{type,lastPeriod:3});assert.equal(pages.length,1);assert.equal(pages[0].rows.length,2);assert.equal(pages[0].rows[1].day,'Usual baseline');assert.equal(pages[0].rows[0].changed[2],true);assert.equal(pages[0].rows[0].changed[3],false);assert.match(X.tableHtml(pages[0]),/data-timetable-changed="true"/);
}
const shifted=structuredClone(day);shifted.baseline.periods[2].startMinutes++;assert.match(X.comparisonPages(shifted,{type:'teacher',lastPeriod:3})[0].rows[1].cells[2],/unavailable/);
const ordinary={...day};delete ordinary.baseline;assert.equal(X.comparisonPages(ordinary,{type:'teacher',lastPeriod:3})[0].rows.length,1);
(async()=>{const pages=X.comparisonPages(day,{type:'teacher',lastPeriod:3}),out=await X.makeWorkbook(pages),zip=await JSZip.loadAsync(await out.blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');assert.match(xml,/Usual baseline/);assert.match(xml,/Published \(suspended\)/);assert.match(xml,/s="8"/);console.log('PASS aligned baseline across teacher, class, TG, changed timing, screen and Excel');})().catch(e=>{console.error(e);process.exitCode=1;});

