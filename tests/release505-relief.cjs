const assert=require('node:assert/strict');
const Relief=require('../shared/relief'),Workload=require('../shared/workload'),Rules=require('../shared/teaching-rules');
const clone=x=>JSON.parse(JSON.stringify(x));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function fixture(){
 return {id:'version-a',loads:Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),{Assembly:1,FTGP:2,FTT:2,EL:level===1?12:28}])),classes:[{ref:'c1',level:'1',shortName:'A'},{ref:'c2',level:'2',shortName:'A'}],groups:[],teachers:[{id:'hod',name:'Illustrative HOD',active:true,profile:{Role:'HOD ICT','EO Appt Level':'HOD'}},{id:'sm',name:'Illustrative HOD SM',active:true,profile:{Role:'HOD SM','EO Appt Level':'HOD'}},{id:'inactive',name:'Inactive teacher',active:false},{id:'vp',name:'School leader',active:true,profile:{Role:'VP','EO Appt Level':'SL'}}],assignments:[{teacher:'hod',target:'1A',subject:'EL'},{teacher:'hod',target:'1A',subject:'FT'},{teacher:'sm',target:'2A',subject:'EL'},{teacher:'sm',target:'2A',subject:'FT'}],organisations:{plt:[{id:'plt',name:'PLT',slots:['hod','sm']}]},duties:[{id:'duty',days:[0,1],teachers:{0:'hod',1:'sm'}}],workload:{categories:{},specialists:[]},offload:Rules.migrate(null)};
}
const analyse=doc=>Relief.analyse(doc,Workload.analyse(doc,t=>Rules.calculate(t,doc.offload)));
const freeze=(x,seen=new Set())=>{if(x&&typeof x==='object'&&!seen.has(x)){seen.add(x);Object.values(x).forEach(v=>freeze(v,seen));Object.freeze(x);}return x;};

// Historical legacy assertions were replaced by the universal PDF behavior in v0.6.00.
const first=Relief.defaults(),second=Relief.defaults();first.blocks.hod=5;assert.deepEqual(second.blocks,{});
let doc=fixture(),result=analyse(doc);assert.equal(doc.relief,undefined);assert.equal(result.weeklyPeriods,84);assert.equal(result.weeklyLunch,0);near(result.reference.T_avg,20);near(result.byTeacher.hod.quota,22);assert.equal(result.byTeacher.sm.quota,0);assert.equal(result.byTeacher.inactive.quota,null);assert.equal(result.byTeacher.vp.quota,null);
for(const schema of [1,2]){
 doc=fixture();doc.relief={schema,mode:'expected',daysPerWeek:5,lunchPeriodsPerDay:2,siuePercent:150,blocks:{hod:2.25},...(schema===1?{periodsPerDay:13}:{weeklyPeriods:65})};
 const before=clone(doc);result=analyse(doc);assert.deepEqual(doc,before);assert.equal(result.settings.schema,3);assert.equal(result.settings.mode,'actual');assert.equal(result.weeklyPeriods,84);assert.equal(result.weeklyLunch,0);near(result.byTeacher.hod.quota,22);assert.equal(result.byTeacher.hod.comparison,null);near(result.byTeacher.hod.remaining,22);assert.throws(()=>Relief.validate(doc,doc.relief));
 doc.relief.siuePercent=125;near(analyse(doc).byTeacher.hod.Wi,48.5);doc.relief.siuePercent=NaN;assert.equal(analyse(doc).byTeacher.hod.quota,null);
}
doc=fixture();doc.relief={...Relief.defaults(),calculationVersion:'whole-week-v1',mode:'expected',weeklyPeriods:90};const before=clone(doc);result=analyse(doc);assert.deepEqual(doc,before);assert.equal(result.weeklyPeriods,90);assert.equal(result.settings.mode,'actual');assert.equal(result.byTeacher.hod.comparison,null);
doc=fixture();doc.relief=Relief.defaults();doc.workload.noFTT=['hod'];assert.equal(analyse(doc).byTeacher.hod.FTT,5);doc.relief.blocks.hod=99;assert.equal(analyse(doc).byTeacher.hod.remaining,22);near(analyse(doc).byTeacher.hod.quota,22);
for(const [key,value] of [['weeklyPeriods',NaN],['weeklyPeriods',0],['weeklyPeriods',Infinity],['siuePercent',-1],['siuePercent','150'],['mode','expected'],['schema',2],['extra',1],['periodsPerDay',13]])assert.throws(()=>Relief.validate(doc,{...Relief.defaults(),[key]:value}));
for(const blocks of [{hod:NaN},{hod:Infinity},{hod:-1},{missing:2},[]])assert.throws(()=>Relief.validate(doc,{...Relief.defaults(),blocks}));
const validated=Relief.validate(doc,doc.relief);validated.blocks.hod=1;assert.equal(doc.relief.blocks.hod,99);
doc=fixture();delete doc.loads[2].EL;assert.equal(analyse(doc).byTeacher.hod.quota,null,'Missing school demand makes T_avg unavailable');
doc=fixture();doc.workload.specialists=[{subject:'Art',pool:'assignment',modifier:'Art',demand:'classes'}];for(const loads of Object.values(doc.loads))loads.Art=2;doc.assignments.push({teacher:'hod',target:'1A',subject:'Art'});result=analyse(doc);assert.equal(result.byTeacher.hod.teachingUsed,14);assert.equal(result.byTeacher.hod.comparison,null);
const workload=Workload.analyse(doc,t=>Rules.calculate(t,doc.offload)),frozen=JSON.stringify({doc,workload});freeze(doc);freeze(workload);Relief.analyse(doc,workload);assert.equal(JSON.stringify({doc,workload}),frozen);
console.log('PASS universal relief compatibility: frozen legacy/v1 input, one model, no Expected R, actual teaching, zero floor, unavailable demand, settings and external Blocks.');
