'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('../shared/relief');
function fixture(subject='PE'){
 const teachers=[{id:'pe',name:'Specialist',active:true,profile:{'Subject Modifier':subject}},{id:'other',name:'Teacher (PE)',active:true}];
 const doc={teachers,relief:{...R.defaults(),siuePercent:200},offload:{tags:[]}};
 const workload={totals:{Teaching:36},rows:teachers.map((teacher,i)=>({teacher,active:true,rules:{eligible:true,matched:[{id:'offload',name:'Role',percent:25}]},Teaching:i?21:15,FTT:7,pd:4,duties:5,otherNonTeaching:0}))};
 return {doc,workload,read:()=>R.analyse(doc,workload)};
}
test('specialist SIUE inherits by default and reads old stored settings',()=>{
 assert.deepEqual(R.defaults().siuePercentBySpecialism,{PE:null,Art:null,Music:null});
 const f=fixture(),before=f.read();f.doc.relief.siuePercentBySpecialism={PE:null,Art:null,Music:null};
 assert.deepEqual(f.read().byTeacher,before.byTeacher);assert.equal(before.byTeacher.pe.quota,6);
 delete f.doc.relief.siuePercentBySpecialism;f.doc.relief.calculationVersion='whole-week-v6';
 assert.equal(f.read().settingsError,'');assert.equal(f.read().byTeacher.pe.quota,6);
});
test('PE 0 applies to the whole teaching and offload term without changing other staff',()=>{
 const f=fixture('PE, MTL'),before=f.read();f.doc.relief.siuePercentBySpecialism={PE:0,Art:null,Music:null};const after=f.read();
 assert.equal(after.settingsError,'');assert.equal(after.byTeacher.pe.Wi,35.5);assert.equal(after.byTeacher.pe.quota,34);
 assert.equal(before.byTeacher.pe.Wi-after.byTeacher.pe.Wi,(15+4.5)*2);
 assert.equal(after.byTeacher.pe.siuePercentApplied,0);assert.equal(after.byTeacher.pe.siueSpecialism,'PE');
 assert.deepEqual(after.byTeacher.other,before.byTeacher.other,'display name cannot supply a specialism');
});
test('multiple modifiers choose the lowest effective SIUE; legacy subject remains supported',()=>{
 const f=fixture('Music; PE');f.doc.relief.siuePercentBySpecialism={PE:75,Art:null,Music:0};
 assert.equal(f.read().byTeacher.pe.siuePercentApplied,0);assert.equal(f.read().byTeacher.pe.siueSpecialism,'Music');
 delete f.doc.teachers[0].profile;f.doc.teachers[0].subject='Art';f.doc.relief.siuePercentBySpecialism.Art=10;
 assert.equal(f.read().byTeacher.pe.siuePercentApplied,10);assert.equal(f.read().byTeacher.pe.siueSpecialism,'Art');
});
test('invalid specialist SIUE and stale clients are refused without dropping fields',()=>{
 const f=fixture();for(const value of [-1,'0',Infinity,NaN])assert.throws(()=>R.validate(f.doc,{...R.defaults(),siuePercentBySpecialism:{PE:value,Art:null,Music:null}}),/SIUE/);
 assert.throws(()=>R.validate(f.doc,{...R.defaults(),siuePercentBySpecialism:{PE:0,Science:0}}),/SIUE/);
 assert.throws(()=>R.validate(f.doc,{...R.defaults(),calculationVersion:'whole-week-v6'}),/Refresh older clients/);
});

test('My Calculations receives the actual specialist percentage',()=>{
 const {harness}=require('./roster716-calculations.cjs'),h=harness();
 h.doc.teachers[0].profile['Subject Modifier']='PE';h.doc.relief.siuePercentBySpecialism={PE:0,Art:null,Music:null};
 const out=h.read();assert.equal(out.calculation.breakdown.siuePercentApplied,0);assert.equal(out.calculation.breakdown.siueSpecialism,'PE');
 h.scope.hash_=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const quota=h.scope.reliefRosterQuota_(h.scope.book_(),h.idx,h.en);assert.equal(quota.rows.find(row=>row.id==='plain').teachingWeight,1);
});
