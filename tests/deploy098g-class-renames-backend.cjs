'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),{ctx}=require('./release506-fixture.js'),run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
run(`props_().setProperty('LEASES','{}');var en098g=()=>index_(book_()).versions.find(x=>x.id===id),doc098g=()=>document_(book_(),en098g()),save098g=(edits,requestId=Utilities.getUuid())=>call('change',{operation:'saveDraft',versionId:id,requestId,issuedAt:Date.now(),clientId:'098g',edits});var original098g=doc098g(),classes098g=original098g.classes.filter(c=>c.level==='3').slice(0,3);save098g(classes098g.map((c,i)=>({operation:'addTeacher',targetRef:c.ref,target:classKey_(c),subject:'EL',teacher:i===1?'t2':'t1',expected:false})));var before098g=doc098g(),rows098g=classes098g.map((c,i)=>({ref:c.ref,level:c.level,name:before098g.classNameSets.flatMap(s=>s.pairs).find(p=>p[1]===classes098g[(i+1)%3].shortName)[0],shortName:classes098g[(i+1)%3].shortName,expected:{level:c.level,name:c.name,shortName:c.shortName}})),batch098g={operation:'renameClasses',rows:rows098g,expected:rows098g.map(r=>({ref:r.ref,...r.expected}))};save098g([batch098g]);var after098g=doc098g();`);
const before=json('before098g'),after=json('after098g'),classes=json('classes098g');
for(let i=0;i<3;i++){
 const old=classes[i].level+classes[i].shortName,next=classes[(i+1)%3].level+classes[(i+1)%3].shortName;
 for(const assignment of before.assignments.filter(a=>a.target===old))assert.equal(after.assignments.find(a=>a.id===assignment.id).target,next);
 for(const venue of before.venues.filter(v=>v.form===old))assert.equal(after.venues.find(v=>v.id===venue.id).form,next);
 assert.equal(after.classes.find(c=>c.ref===classes[i].ref).shortName,classes[(i+1)%3].shortName);
}
const unchanged=JSON.stringify(after);assert.throws(()=>run('save098g([batch098g])'),e=>e.status===409);assert.equal(JSON.stringify(json('doc098g()')),unchanged);
run(`var fresh098g=rows098g.map(r=>{var c=doc098g().classes.find(c=>c.ref===r.ref);return {...r,expected:{level:c.level,name:c.name,shortName:c.shortName}}});`);
assert.throws(()=>run("save098g([{operation:'renameClasses',rows:fresh098g.map((r,i)=>i===1?{...r,name:fresh098g[0].name,shortName:fresh098g[0].shortName}:r)}])"),e=>e.status===400);assert.equal(JSON.stringify(json('doc098g()')),unchanged);
assert.throws(()=>run("save098g([{operation:'renameClasses',rows:[{...fresh098g[0],name:'(undefined)',shortName:'__undefined_test',undefinedDraft:true}]}])"),e=>e.status===400);assert.equal(JSON.stringify(json('doc098g()')),unchanged);
assert.ok(after.audit.some(a=>a.action==='renameClasses'));
console.log('PASS 098g canonical backend class cycle: surgical saved batch preserves class references, teachers and venues; stale/duplicate/undefined rejection leaves source unchanged; audit retained.');
