'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js');
let count=0;const test=(name,run)=>{run();count++;console.log('PASS',name);};
const groups=[{id:'cl',name:'Chinese group',subject:'CL',level:4},{id:'ml',name:'Malay group',subject:'ML',level:4},{id:'tl',name:'Tamil group',subject:'TL',level:4}];
const categories={MTL:'Teaching',HMTL:'Teaching',FMTL:'Teaching',CL:'Teaching',HCL:'Teaching',FCL:'Teaching',ML:'Teaching',TL:'Teaching',CCE:'Teaching'};
function setup(){const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();Object.assign(f.ctx.days[f.date],{teachingGroups:groups,subjectCategories:categories});f.ctx.teachingGroups=groups;f.ctx.subjects=['MTL','CL','ML','TL','Form','PAL'];for(const t of f.teachers){t.cells=f.blank();t.R=t.staffId==='alice'?0:4;}A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};return f;}
const lesson=(subject,groupName,groupIds)=>({subject,groupName,groupIds});
test('MTL teaching profiles distinguish canonical TG subjects and combine language tiers',()=>{
 assert.deepEqual(A.teachingProfile([['MTL','','','Chinese group'],['HCL','','',''],['FCL','','','']],[],groups,categories).subjects,['family:chinese']);
 assert.deepEqual(A.teachingProfile([['MTL','','','Malay group']],[],groups,categories).subjects,['family:malay']);
});
test('Stable TG IDs survive labels; ambiguous labels and CCE never guess a language',()=>{
 const config=fixture().state.systemConfig;
 assert.equal(A.lessonSubject(lesson('MTL','old name',['tl']),groups,config).familyId,'tamil');
 assert.equal(A.lessonSubject(lesson('MTL','tl'),groups,config).familyId,'tamil');
 assert.equal(A.lessonSubject(lesson('MTL','Tamil group'),[...groups,{id:'other',name:'Tamil group',subject:'CL'}],config).familyId,null);
 assert.equal(A.lessonSubject(lesson('MTL','4TL'),groups,config).familyId,null);
 assert.equal(A.lessonSubject(lesson('CCE','Tamil group'),groups,config).subject,'cce');
 assert.equal(A.lessonSubject(lesson('CCE','Tamil group'),groups,config).reliefRequired,true);
 assert.equal(A.lessonSubject(lesson('MTL','Tamil group',['missing']),groups,config).familyId,null);
});
test('Generic MTL uses exact higher and foundation TG subjects without reclassifying CCE',()=>{
 const catalogue=[...groups,{id:'hcl',name:'Higher Chinese TG',subject:'HCL'},{id:'ftl',name:'Foundation Tamil TG',subject:'FTL'}],config=fixture().state.systemConfig;
 assert.equal(A.lessonSubject(lesson('MTL','Higher Chinese TG'),catalogue,config).familyId,'chinese');
 assert.equal(A.lessonSubject(lesson('MTL','Foundation Tamil TG'),catalogue,config).reliefRequired,false);
 assert.equal(A.lessonSubject(lesson('CCE','Foundation Tamil TG'),catalogue,config).familyId,null);
 assert.equal(A.lessonSubject(lesson('CCE','Foundation Tamil TG'),catalogue,config).reliefRequired,true);
 assert.equal(A.lessonSubject(lesson('HMTL','Foundation Tamil TG'),catalogue,config).familyId,null);
 assert.equal(A.lessonSubject(lesson('FMTL','Higher Chinese TG'),catalogue,config).familyId,null);
});
test('TG overrides and configurable families supersede inherited defaults precisely',()=>{
 const config=fixture().state.systemConfig;assert.equal(A.lessonSubject(lesson('TL',''),groups,config).reliefRequired,false);
 config.teachingGroupOverrides=[{groupId:'tl',reliefRequired:true}];assert.equal(A.lessonSubject(lesson('MTL','Tamil group'),groups,config).reliefRequired,true);
 assert.equal(A.lessonSubject(lesson('TL',''),groups,config).reliefRequired,false);
 config.subjectFamilies.push({id:'science',name:'Science',subjects:['SCI','BIO'],reliefRequired:true});assert.equal(A.lessonSubject(lesson('BIO',''),groups,config).key,'family:science');
});
test('Tamil demand remains manually coverable but does not consume automatic cover or uncovered count',()=>{
 const f=setup();f.teachers[0].cells[3]=['MTL','','','Tamil group'];f.teachers[0].cells[4]=['EL','4A','',''];f.state.absences.push({id:'absence',staffId:'alice',name:'Alice',date:f.date,periods:[3,4],reliefRequired:true});
 const ds=f.O.demand(f.ctx,f.state,f.date);assert.equal(ds.find(d=>d.period===3).noReliefRequired,true);assert.equal(ds.length,2);
 const proposal=A.optimise(f.state,f.ctx,f.date,ds);assert.equal(proposal.assignments.length,1);assert.equal(proposal.assignments[0].period,4);assert.deepEqual(A.health(f.state,f.ctx,f.date,ds).uncovered.map(d=>d.period),[4]);
 assert.equal(f.O.dailyExport(f.state,f.ctx,{date:f.date}).rows[0].cells[3].text,'No Relief Required');
 const result=f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,staffId:'bob',demandIds:['absence:3']});assert(A.effectiveAssignments(f.state).some(a=>a.id===result.savedId&&!a.noRelief));
 assert.equal(A.optimise(f.state,f.ctx,f.date,ds).fixedCoverage,1);
});
test('Tamil teachers stay eligible to cover other subjects while same-language teachers are preferred',()=>{
 const f=setup();f.teachers[1].cells[0]=['MTL','','','Tamil group'];f.teachers[2].cells[0]=['MTL','','','Malay group'];f.teachers[3].cells[0]=['MTL','','','Chinese group'];
 const preferences=['subjectMatch','levelMatch','annualUtilisation','alternatives','weeklyRemaining','rotation'];
 const ds=[{id:'chinese',staffId:'alice',period:4,subject:'MTL',groupName:'Chinese group'}];assert.equal(A.optimise(f.state,f.ctx,f.date,ds,{preferences}).assignments[0].staffId,'dora');
 f.teachers[2].cells[4]=['PD','','',''];f.teachers[3].cells[4]=['PD','','',''];assert.equal(A.optimise(f.state,f.ctx,f.date,[{id:'english',staffId:'alice',period:4,subject:'EL'}]).assignments[0].staffId,'bob');
});
test('Previously computed profiles are rescored with the current family and TG overrides',()=>{
 const f=setup();f.teachers[1].teachingProfile=A.teachingProfile([['MTL','','','Tamil group']],[],groups,categories,f.state.systemConfig);f.teachers[2].R=0;f.state.entitlements.find(r=>r.staffId==='charlie').quota=0;f.teachers[3].teachingProfile=A.teachingProfile([['MTL','','','Chinese group']],[],groups,categories,f.state.systemConfig);
 f.state.systemConfig.teachingGroupOverrides=[{groupId:'tl',familyId:'chinese',reliefRequired:true},{groupId:'cl',familyId:'malay'}];
 const result=A.optimise(f.state,f.ctx,f.date,[{id:'cllesson',staffId:'alice',period:4,subject:'HCL'}],{preferences:['subjectMatch','levelMatch','annualUtilisation','alternatives','weeklyRemaining','rotation']});assert.equal(result.assignments[0].staffId,'bob');
});
test('Saved family/TG settings survive a new runtime and legacy saves; only Admin may change them',()=>{
 const f=setup();f.state.systemConfig.teachingGroupOverrides=[{groupId:'tl',reliefRequired:true}];f.state.systemConfig.subjectFamilies[0].name='Chinese language';const old=structuredClone(f.state.systemConfig);delete old.subjectFamilies;delete old.teachingGroupOverrides;
 f.O.apply(f.state,f.ctx,{operation:'saveSystemConfig',...old});assert.equal(f.state.systemConfig.subjectFamilies[0].name,'Chinese language');assert.deepEqual(f.state.systemConfig.teachingGroupOverrides,[{groupId:'tl',reliefRequired:true}]);
 const saved=JSON.stringify(f.state.systemConfig);f.O.validateState(JSON.parse(JSON.stringify(f.state)));assert.equal(JSON.stringify(f.state.systemConfig),saved);
 assert.throws(()=>f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,admin:false}},{operation:'saveSystemConfig',...f.state.systemConfig}),/Admin/);
 const read=f.O.systemConfigView(f.state,{...f.ctx,user:{...f.ctx.user,admin:false}});assert.equal(read.canEdit,false);assert.equal(read.teachingGroups.find(g=>g.id==='tl').subject,'TL');
 assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'saveSystemConfig',...f.state.systemConfig,subjectFamilies:[...f.state.systemConfig.subjectFamilies,{id:'duplicate',name:'Duplicate',subjects:['CL'],reliefRequired:true}]}),/one family|duplicate/i);
});
console.log(count+' subject-family policy checks passed');
