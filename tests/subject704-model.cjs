const assert=require('node:assert/strict'),W=require('../shared/workload'),G=require('../shared/venue-groups'),Rules=require('../shared/teaching-rules'),Relief=require('../shared/relief');
const rates={RRP:4,SDR:2,CCE:1,LSM:2};
const d={teachers:[{id:'teacher',name:'Teacher',active:true,employment:'Full time'}],loads:{1:{FT:0,PD:2,TTT:2,Assembly:0,FTGP:0,FTT:0,...rates,EL:0,CL:0,'CCE EL':0,Art:0}},classes:[{ref:'ca',level:'1',shortName:'A'},{ref:'cb',level:'1',shortName:'B'}],venues:[],groups:Object.keys(rates).map(subject=>({id:subject,name:subject,subject,level:'1',classRefs:['ca'],levelWide:false,venue:''})),assignments:Object.keys(rates).map(subject=>({id:subject,teacher:'teacher',target:subject,subject})),workload:{categories:{},specialists:[{subject:'RRP',pool:'assignment',modifier:'',demand:'classes'}]}};
const calc=()=>W.analyse(d,t=>Rules.calculate(t,d.offload)),teaching=w=>({total:w.totals.Teaching,reference:Relief.analyse(d,w).reference.T_avg,special:w.special.RRP.indicator.average});
const before=structuredClone(d);let w=calc();
assert.equal(w.demand.total,9,'Only the four defined TGs contribute their configured periods');
assert.equal(w.demand.entries.some(e=>e.kind==='class'&&Object.hasOwn(rates,e.subject)),false);
assert.deepEqual(teaching(w),{total:9,reference:9,special:4});assert.deepEqual(d,before,'Reading subject defaults never migrates stored data');
assert.deepEqual(W.subjectTypeSubjects(d),Object.keys(d.loads[1]).filter(s=>!['FT','PD','TTT'].includes(s)));
for(const subject of Object.keys(rates)){assert.equal(W.subjectType(d,subject),'tg');assert.equal(W.isFormSubject(d,'1',subject),false);assert.equal(W.isGroupSubject(d,subject),true);}
for(const value of ['class','tg','both'])assert.equal(W.validateSubjectType(d,'RRP',value),value);
for(const value of [undefined,null,'',false,{},[],['class'],'Class','none'])assert.throws(()=>W.validateSubjectType(d,'RRP',value));
assert.throws(()=>W.validateSubjectType(d,'Unknown','both'));
for(const subject of ['FT','PD','TTT']){assert.throws(()=>W.validateSubjectType(d,subject,'both'));assert.equal(W.isGroupSubject(d,subject),false);assert.equal(W.isFormSubject(d,'1',subject),false);}
for(const subject of ['Assembly','FTGP','FTT']){assert.equal(W.subjectType(d,subject),'class');assert.equal(W.validateSubjectType(d,subject,'tg'),'tg');assert.equal(W.isGroupSubject(d,subject),false);}
for(const subject of ['CL','CCE EL']){assert.equal(W.subjectType(d,subject),'tg');assert.equal(W.validateSubjectType(d,subject,'both'),'both');}
for(const subject of ['Assembly','FTGP','FTT','CL','CCE EL'])for(const mode of ['class','tg','both']){
 const copy=structuredClone(d);copy.subjectTypes={[subject]:W.validateSubjectType(copy,subject,mode)};
 assert.equal(W.subjectType(copy,subject),mode,'Saved choice takes precedence over '+subject+' default');
 assert.equal(W.isGroupSubject(copy,subject),mode!=='class');assert.equal(W.isFormSubject(copy,'1',subject),mode!=='tg');
 assert.deepEqual(copy.assignments,d.assignments,'Placement choice retains actual assignments');
}

// Placement policy changes planned provision, not existing work or relief inputs.
d.subjectTypes={RRP:'both'};w=calc();assert.equal(w.demand.total,17);assert.equal(w.special.RRP.demand,12);assert.deepEqual(teaching(w),{total:9,reference:9,special:4});
assert.equal(W.isFormSubject(d,'1','RRP'),true);assert.equal(W.isGroupSubject(d,'RRP'),true);
d.subjectTypes.RRP='class';w=calc();assert.equal(w.demand.total,17,'An existing TG is still real provision after changing its subject type');assert.equal(W.isGroupSubject(d,'RRP'),false);assert.deepEqual(teaching(w),{total:9,reference:9,special:4});
const args={subject:'RRP',level:'1',levels:['1'],weeklyPeriods:null};
assert.throws(()=>G.workloadFields(d,args),/Class only/);
assert.throws(()=>G.workloadFields(d,args,d.groups.find(g=>g.subject==='SDR')),/Class only/);
assert.doesNotThrow(()=>G.workloadFields(d,args,d.groups.find(g=>g.subject==='RRP')),'Existing class-only TG metadata remains editable');
const legacy=d.groups.find(g=>g.subject==='RRP');G.update(d,{...args,groupId:legacy.id,name:'Retained RRP',levelWide:false,classRefs:['ca'],venue:''});assert.equal(legacy.name,'Retained RRP');assert.equal(d.assignments.length,4);
const unchanged=structuredClone(d);assert.throws(()=>G.update(d,{...args,groupId:'SDR',name:'Blocked change',levelWide:false,classRefs:['ca'],venue:'',assignments:'retain'}),/Class only/);assert.deepEqual(d,unchanged,'Rejected subject changes have no partial effects');
d.subjectTypes.RRP='tg';d.assignments.push({id:'old-class',teacher:'teacher',target:'1A',subject:'RRP'});w=calc();assert.equal(w.demand.total,13,'An actual legacy class assignment still contributes');assert.equal(w.totals.Teaching,13);assert.equal(W.isFormSubject(d,'1','RRP'),false);d.assignments.pop();

// Both permits either placement while retaining the established whole-level rule.
d.subjectTypes.RRP='both';legacy.levelWide=true;assert.equal(W.isFormSubject(d,'1','RRP'),false);assert.equal(calc().demand.total,9);
d.groups.push({id:'art',name:'Whole-level Art',subject:'Art',level:'1',levelWide:true});d.subjectTypes.Art='both';assert.equal(W.isFormSubject(d,'1','Art'),true,'Art keeps its existing class provision exception');
d.loads[1].RRP=null;assert.equal(W.isFormSubject(d,'1','RRP'),false);assert.equal(G.periods(d,legacy),null,'Subject type does not invent a numeric load');
console.log('PASS subject types: phantom demand removed, placement modes, editable subject defaults, actual workload/relief preservation, legacy assignments/TGs, atomic validation and whole-level rules');

// Auto PAL uses the same placement policy; existing PAL allocations survive.
const PAL=require('../shared/pal'),pd={pal:{auto:true,schema:1},subjectTypes:{PAL:'tg'},loads:{1:{PAL:2}},classes:[{ref:'pc',level:'1',shortName:'P'}],assignments:[{id:'ft',teacher:'teacher',target:'1P',subject:'FT'}]};
PAL.reconcile(pd,{operation:'addTeacher',subject:'FT',teacher:'teacher',target:'1P'});assert.equal(pd.assignments.length,1);
pd.pal.auto=false;PAL.set(pd,{schema:1,auto:true});assert.equal(pd.assignments.length,1);
pd.subjectTypes.PAL='class';PAL.reconcile(pd,{operation:'setPAL'});assert.equal(pd.assignments.length,2);
pd.subjectTypes.PAL='tg';PAL.reconcile(pd,{operation:'setPAL'});assert.equal(pd.assignments.length,2,'Policy changes do not remove an existing PAL allocation');
