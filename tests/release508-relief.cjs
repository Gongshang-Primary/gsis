const assert=require('node:assert/strict'),R=require('../shared/relief'),W=require('../shared/workload'),Rules=require('../shared/teaching-rules');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const types=[['plain',{}],['hod',{Role:'HOD ICT','EO Appt Level':'HOD'}],['pt',{Role:'HOD ICT','EO Appt Level':'HOD','Employment Modifier':'4/5'}],['fajt',{'Employment Modifier':'FAJT'}],['bt',{'Employment Modifier':'BT'}],['tc',{'EO Appt Level':'TC'}],['combo',{'Employment Modifier':'BT','EO Appt Level':'TC'}],['sm',{Role:'HOD SM','EO Appt Level':'HOD'}],['acting',{Role:'HOD ICT','EO Appt Level':'HOD','Appointment Status':'Acting'}],['ut',{'Employment Modifier':'UT'}]];
 const teachers=types.map(([id,p])=>({id,name:id,active:true,profile:{Role:'Teacher',...p}}));
 return {id:'whole-week',relief:R.defaults(),loads:{1:{EL:20,Assembly:1,FTGP:2,FTT:2,PAL:2}},classes:[{ref:'class1',level:'1',shortName:'A'}],groups:[],teachers,teacherDrafts:{},offload:Rules.migrate(null),workload:{categories:{},specialists:[]},assignments:teachers.flatMap(t=>['EL','FT'].map(subject=>({id:t.id+subject,teacher:t.id,target:'1A',targetRef:'class1',subject}))),organisations:{plt:[{id:'pd',slots:teachers.map(t=>t.id)}]},duties:teachers.map(t=>({id:'d'+t.id,days:['Mon'],teachers:{Mon:t.id}}))};
}
const calc=d=>R.analyse(d,W.analyse(d,t=>Rules.calculate(t,d.offload)));
let d=fixture(),before=JSON.stringify(d),r=calc(d);assert.equal(JSON.stringify(d),before);assert.equal(r.calculationVersion,'whole-week-v6');assert.equal(r.reference.teachingPeriodTotal,200);assert.equal(r.reference.fullTimeTeacherCount,8);near(r.reference.T_avg,25);
for(const [id,of,budget,factor]of [['plain',0,84,5/7],['hod',.3,84,5/7],['pt',.3,67.2,5/7],['fajt',0,65,1],['bt',.2,84,5/7],['tc',.2,84,5/7],['combo',.36,84,5/7],['sm',.5,84,5/7],['acting',.2,84,5/7],['ut',0,84,5/7]]){
 const t=r.byTeacher[id];near(t.OF,of);near(t.weeklyBudget,budget);near(t.timetableFactor,factor);near(t.Wi,8+2.5*(20+25*of));near(t.quota,Math.floor(Math.max(0,Math.min(factor*(budget-(8+2.5*(20+25*of))),id==='ut'?0:Infinity))));assert.equal(t.FTT,5);assert.equal(t.pd,2);assert.equal(t.duties,1);
}
assert.equal(r.byTeacher.pt.quota,0);assert.ok(r.byTeacher.pt.rawQuota<0);assert.equal(r.byTeacher.fajt.quota,7);assert.equal(r.byTeacher.sm.offloadComponents.length,1);assert.equal(r.byTeacher.ut.offloadComponents[0].capPeriods,26);
assert.ok(!r.byTeacher.pt.offloadComponents.some(x=>x.label==='4/5'));
d.relief.blocks.plain=100;near(calc(d).byTeacher.plain.quota,r.byTeacher.plain.quota);
d.loads[1].PAL=2;d.assignments.push({id:'pal',teacher:'plain',target:'1A',subject:'PAL'});const pal=calc(d);near(pal.reference.T_avg,202/8);assert.ok(pal.byTeacher.hod.rawQuota<r.byTeacher.hod.rawQuota,'Another teacher changes through shared demand');
d.assignments.push({id:'duplicate-pal',teacher:'plain',target:'1A',subject:'PAL'});near(calc(d).reference.teachingPeriodTotal,202);
d=fixture();d.loads[1].EL=null;assert.ok(calc(d).rows.every(t=>t.quota===null));assert.equal(calc(d).reference.teachingPeriodTotal,null);
d=fixture();d.teachers=d.teachers.filter(t=>['pt','fajt'].includes(t.id));d.assignments=d.assignments.filter(a=>d.teachers.some(t=>t.id===a.teacher));d.organisations={};d.duties=[];assert.equal(calc(d).reference.T_avg,null);assert.equal(calc(d).reference.fullTimeTeacherCount,0);
d=fixture();d.teachers[0].profile['Employment Modifier']='FAJT, 4/5';assert.equal(calc(d).reference.T_avg,null);d.teachers[0].profile['Employment Modifier']='unknown arrangement';assert.equal(calc(d).byTeacher.plain.quota,null);
d=fixture();d.teachers.find(t=>t.id==='hod').profile={'EO Appt Level':'LT',Role:'LT','Appointment Status':'Acting'};assert.equal(calc(d).byTeacher.hod.quota,null);
d=fixture();d.relief.siuePercent=0;near(calc(d).byTeacher.hod.Wi,35.5);d.relief.fajtWeeklyPeriods=60;assert.equal(calc(d).byTeacher.fajt.weeklyBudget,60);
for(const patch of [{weeklyPeriods:0},{timetablePeriods:85},{fourFifthsFraction:1.1},{siuePercent:-1},{calculationVersion:'other'},{lunchPeriodsPerDay:2}])assert.throws(()=>R.validate(d,{...R.defaults(),...patch}));
d=fixture();delete d.relief;assert.equal(calc(d).calculationVersion,'whole-week-v6');assert.equal(calc(d).weeklyPeriods,84);assert.equal(d.relief,undefined);
// Employment storage can also contain a nonemployment allowance such as BT.
d=fixture();const bt=d.offload.tags.find(t=>t.match==='BT');bt.source='Employment Modifier';near(calc(d).byTeacher.bt.OF,.2);
const PAL=require('../shared/pal');const pd={classes:[{ref:'p1',level:'1',shortName:'A'},{ref:'p2',level:'2',shortName:'A'},{ref:'p3',level:'3',shortName:'A'}],assignments:[{id:'f1',target:'1A',subject:'FT',teacher:'one'},{id:'f2',target:'2A',subject:'FT',teacher:'two'},{id:'f3',target:'3A',subject:'FT',teacher:'three'},{id:'manual',target:'1A',subject:'PAL',teacher:'one'}]};
PAL.set(pd,PAL.defaults());assert.equal(pd.assignments.filter(a=>a.subject==='PAL').length,2);assert.ok(!pd.assignments.some(a=>a.subject==='PAL'&&a.teacher==='three'));PAL.reconcile(pd);assert.equal(pd.assignments.filter(a=>a.subject==='PAL').length,2);PAL.set(pd,{schema:1,auto:false});assert.ok(pd.assignments.some(a=>a.id==='manual'));assert.ok(!pd.assignments.some(a=>a.palManaged));
console.log('PASS 508 whole-week model: actual teaching, all employment branches, composed nonemployment OF, role replacement, acting, caps, PAL shared demand, precision, missing inputs and legacy isolation.');
