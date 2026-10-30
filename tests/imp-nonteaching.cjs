const assert=require('node:assert/strict');
const W=require('../shared/workload'),R=require('../shared/relief'),T=require('../shared/teaching-rules');
const P=require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../shared/planning.js'),'utf8')+';GSISPlanning');
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} != ${expected}`);
const ids=['yanyu','razilah','wen-di','fae'],all=[...ids,'control'];
const activity=()=>({id:'imp',code:'IMP',name:'Instructional Mentoring Programme',weeklyPeriods:2,teachers:ids.slice()});
function fixture(){return {
 teachers:all.map(id=>({id,name:id,active:true,profile:{Role:'Teacher','EO Appt Level':'EO'}})),
 classes:all.map((id,i)=>({ref:'class-'+id,level:'3',shortName:String.fromCharCode(65+i)})),groups:[],
 loads:Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),{Assembly:1,FTGP:2,FTT:2,EL:12}])),
 assignments:all.flatMap((teacher,i)=>['EL','FT'].map(subject=>({id:teacher+'-'+subject,teacher,target:'3'+String.fromCharCode(65+i),subject}))),
 organisations:{plt:[{id:'plt',name:'Staff PLT',slots:all.slice()}]},
 duties:[{id:'arrival',name:'Arrival',days:['Mon','Tue'],teachers:{Mon:'yanyu',Tue:'yanyu'}}],
 workload:{categories:{},specialists:[]},offload:T.migrate(null),relief:R.defaults()
};}
function analyse(d){const w=W.analyse(d,t=>T.calculate(t,d.offload));return {w,r:R.analyse(d,w)};}
const d=fixture(),before=analyse(d);d.workload.nonTeachingActivities=[activity()];
const raw=JSON.stringify(d),after=analyse(d);
assert.equal(JSON.stringify(d),raw,'calculations must not mutate version-owned activity records');
assert.equal(after.r.calculationVersion,'whole-week-v6');
assert.equal(after.w.totals.Teaching,before.w.totals.Teaching);
assert.deepEqual(after.r.reference,before.r.reference,'IMP must not change teaching demand, T_avg, or its population');
assert.equal(after.w.demand.total-before.w.demand.total,8,'four participants add eight weekly man-periods of provision');
assert.equal(after.w.demand.complete,true,'a classless activity is valid planned provision');
assert.ok(!after.w.issues.some(x=>/Missing class|outside planned provision/i.test(x)));
for(const id of ids){
 const a=after.r.byTeacher[id],b=before.r.byTeacher[id],row=after.w.rows.find(x=>x.teacher.id===id);
 near(a.Wi,b.Wi+2,id+' Wi');near(a.rawQuota,b.rawQuota-2*a.timetableFactor,id+' raw R');
 assert.equal(a.quota,Math.floor(Math.max(0,a.rawQuota)));
 assert.equal(a.actualTeaching,b.actualTeaching);assert.equal(a.siuePeriods,b.siuePeriods);assert.equal(a.offloadAllowance,b.offloadAllowance);
 assert.equal(a.otherNonTeaching,2);assert.equal(row.otherNonTeaching,2);
 assert.equal(row['Non-teaching']-before.w.rows.find(x=>x.teacher.id===id)['Non-teaching'],2);
 assert.equal(row.nonTeachingActual-before.w.rows.find(x=>x.teacher.id===id).nonTeachingActual,2);
 assert.equal(a.nonTeachingActivities.length,1);assert.equal(a.nonTeachingActivities[0].name,'Instructional Mentoring Programme');
 const entries=after.w.ledger.filter(e=>e.teacher===id&&e.subject==='IMP');
 assert.equal(entries.length,1);assert.equal(entries[0].category,'Non-teaching');assert.equal(entries[0].periods,2);
}
assert.equal(after.r.byTeacher.control.Wi,before.r.byTeacher.control.Wi,'nonparticipant unchanged');
assert.equal(after.r.byTeacher.yanyu.pd,2,'IMP is separate from PLT PD');
assert.equal(after.r.byTeacher.yanyu.duties,2,'IMP is separate from duties');
for(const legacy of ['whole-week-v1','whole-week-v2','whole-week-v3']){
 const old=clone(d);old.relief.calculationVersion=legacy;const result=analyse(old).r;
 assert.equal(result.calculationVersion,'whole-week-v6');assert.equal(result.byTeacher.yanyu.Wi,after.r.byTeacher.yanyu.Wi);
 assert.equal(old.relief.calculationVersion,legacy,'read compatibility must not rewrite saved settings');
}
const empty=fixture();empty.workload.nonTeachingActivities=[];
assert.deepEqual(analyse(empty),before,'explicit empty activity list preserves legacy calculation');
const generic=clone(d);generic.loads['3'].Mentoring=3;generic.workload.categories.Mentoring='Non-teaching';
generic.assignments.push({id:'generic',teacher:'yanyu',target:'3A',subject:'Mentoring'});
const g=analyse(generic).r.byTeacher.yanyu;
assert.equal(g.otherNonTeaching,5,'existing non-teaching assignments and named activities both count once');
near(g.Wi,after.r.byTeacher.yanyu.Wi+3,'generic non-teaching Wi');
assert.equal(g.actualTeaching,after.r.byTeacher.yanyu.actualTeaching);assert.equal(g.siuePeriods,after.r.byTeacher.yanyu.siuePeriods);
const badValues=[
 {...activity(),id:''},
 {...activity(),teachers:['yanyu','yanyu']},
 {...activity(),teachers:['yanyu','missing-staff']},
 ...['constructor','__proto__','toString','CONSTRUCTOR'].map(code=>({...activity(),code})),
 ...[NaN,Infinity,-1,'2',null].map(weeklyPeriods=>({...activity(),weeklyPeriods}))
];
for(const bad of badValues){
 const invalid=fixture();invalid.workload.nonTeachingActivities=[bad];
 assert.throws(()=>W.validate(invalid,invalid.workload),'invalid activity must be rejected on save');
 const result=analyse(invalid).r.byTeacher.yanyu;
 assert.equal(result.quota,null,'malformed saved activity must not silently produce an apparently complete R');
 assert.match(result.reason,/incomplete|activity|activities|workload/i);
}
const duplicate=clone(d);duplicate.workload.nonTeachingActivities.push(activity());
assert.throws(()=>W.validate(duplicate,duplicate.workload),'duplicate activity IDs must not inflate workload');
assert.equal(analyse(duplicate).r.byTeacher.yanyu.quota,null);
for(const [code,subject] of [['PHE','PE'],['PE','PHE'],['Sci','Science'],['Science','Sci'],['sCi','SCIENCE']]){
 const alias=fixture();alias.loads['3'][subject]=2;alias.workload.nonTeachingActivities=[{...activity(),code}];
 assert.throws(()=>W.validate(alias,alias.workload),'subject aliases cannot also be activity codes');
}
const aliasDuplicates=fixture();aliasDuplicates.workload.nonTeachingActivities=[{...activity(),code:'PE'},{...activity(),id:'second',code:'PHE'}];
assert.throws(()=>W.validate(aliasDuplicates,aliasDuplicates.workload),'activity aliases share one unique code identity');
const saved=W.validate(d,d.workload);assert.deepEqual(saved.nonTeachingActivities,[activity()]);
const removed=clone(d);P.clearTeacher(removed,'yanyu',true);
assert.ok(!removed.workload.nonTeachingActivities.some(a=>a.teachers.includes('yanyu')),'teacher removal clears activity participation');
assert.ok(removed.workload.nonTeachingActivities.some(a=>a.teachers.includes('razilah')),'removing one teacher preserves other participants');
console.log('PASS IMP: four participants add two weekly periods to Wi once, preserve Ti/T_avg/SIUE, classless provision, generic non-teaching, invalid records fail closed, legacy settings and teacher removal');
