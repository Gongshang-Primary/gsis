const assert=require('assert/strict'),vm=require('vm'),{ctx}=require('./release506-fixture.js');
const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
run(`props_().setProperty('LEASES','{}');var entry506=()=>index_(book_()).versions.find(x=>x.id===id),doc506=()=>document_(book_(),entry506()),save506=edits=>call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'506',edits,returnDelta:true,since:entry506().revision,auditPaged:true});var before506=doc506();`);
for(const [op,expected]of [['setClassAbility',['classes']],['setExclusionCell',['levelExclusions','teachers','loads']],['setTeacherNote',['teacherNotes','teachers']]]){
 const roots=json(`draftReadScope_([{operation:${JSON.stringify(op)}}]).roots`);for(const key of expected)assert.ok(roots.includes(key));assert.ok(!roots.includes('assignments'),op+' excludes unrelated IP assignments');
}
run(`var cl506=before506.classes[0];var ability506=save506([{operation:'setClassAbility',ref:cl506.ref,expected:cl506.ability||'',value:'HA'}]);var after506=doc506();`);
assert.equal(run('after506.classes[0].ability'),'HA');for(const key of ['teachers','assignments','groups','venues','organisations','offload','relief'])assert.deepEqual(json(`after506.${key}??null`),json(`before506.${key}??null`),'ability must preserve '+key);
assert.ok(json('ability506.delta.changes').every(x=>!['teachers','assignments','groups','venues'].includes(JSON.parse(x.key)[0])));
run(`var note506=save506([{operation:'setTeacherNote',teacher:'t1',expected:'',value:'Compact scoped note'}]);var ex506=save506([{operation:'setExclusionCell',teacher:'t2',level:'1',expected:false,checked:true}]);`);
assert.deepEqual(json('doc506().assignments'),json('before506.assignments'));assert.equal(run('doc506().teacherNotes.t1'),'Compact scoped note');assert.equal(run("doc506().levelExclusions.find(x=>x.teacher==='t2').levels.includes('1')"),true);
// Class rename still updates all cross references. Destructive changes keep all dependencies.
run(`var renameBase506=doc506(),renameClass506=renameBase506.classes.find(x=>classKey_(x)==='1P'),pair506=renameBase506.classNameSets.flatMap(s=>s.pairs).find(([name,short])=>!renameBase506.classes.some(c=>c.level==='1'&&c.shortName===short));var renamed506=save506([{operation:'updateClass',ref:renameClass506.ref,level:'1',name:pair506[0],shortName:pair506[1],expected:{level:'1',name:renameClass506.name,shortName:renameClass506.shortName}}]);`);
assert.equal(run("doc506().classes.find(c=>c.ref===renameClass506.ref).shortName"),run('pair506[1]'));assert.equal(run("doc506().assignments.some(a=>a.target==='1P')"),false);assert.equal(run("doc506().assignments.filter(a=>a.target==='1'+pair506[1]).length"),2);
assert.throws(()=>run(`save506([{operation:'deleteClass',ref:renameClass506.ref,expected:{}}])`),e=>e.status===409);
// Inactivation now clears that teacher's allocations in the same scoped save.
run(`var beforeInactive506=doc506();save506([{operation:'setTeacherField',teacher:'t1',field:'Active',expected:'Y',value:'N'}]);`);
assert.equal(run("doc506().teachers.find(t=>t.id==='t1').active"),false);
assert.equal(run("doc506().assignments.some(a=>a.teacher==='t1')"),false);
assert.deepEqual(json('doc506().assignments'),json("beforeInactive506.assignments.filter(a=>a.teacher!=='t1')"));
// Imported inactive colleagues may retain historical terms while reactivating.
run(`c.people.push({id:'former506',name:'Former Teacher',active:false,profile:{'Basic Name':'Former Teacher',Role:'Retired Role','EO Appt Level':'','Appointment Status':'','Employment Modifier':'Retired modifier','Subject Modifier':'',Active:'N'}});var returnedProfile506={...c.people.find(t=>t.id==='former506').profile,Active:'Y'};var returned506=save506([{operation:'upsertTeacherProfile',teacher:'former506',profile:returnedProfile506,expected:null}]);`);
assert.equal(run("doc506().teachers.find(t=>t.id==='former506').active"),true);assert.equal(run("doc506().teachers.find(t=>t.id==='former506').profile.Role"),'Retired Role');
assert.throws(()=>run(`save506([{operation:'setTeacherField',teacher:'former506',field:'Role',value:'Invented new role',expected:'Retired Role'}])`),e=>e.status===400&&/HR Terms/.test(e.message));
// Legacy projections without root ranges retain complete fallback reads and data.
run(`var legacy506=index_(book_());delete legacy506.versions.find(x=>x.id===id).rootReadRanges;delete legacy506.versions.find(x=>x.id===id).rootViewRanges;fieldIndexWrite_(book_(),legacy506);var legacyBefore506=doc506();save506([{operation:'setTeacherNote',teacher:'t1',expected:'Compact scoped note',value:'Legacy scoped note'}]);`);
assert.deepEqual(json('doc506().assignments'),json('legacyBefore506.assignments'));assert.deepEqual(json('doc506().groups'),json('legacyBefore506.groups'));
console.log('PASS 506 scoped Classes/HR saves, unrelated roots, class references, assignment guards, historical Contacts terms and legacy projection fallback');
// The scoped path must preserve the full loader's legacy/profile precedence
// without normalizing unrelated teachers merely because one name is edited.
run(`var partial506=doc506();partial506.teachers.push({id:'partial506',name:'Original Name',role:'Teacher',employment:'4/5',active:false,profile:{'Basic Name':'Original Name',Active:'Y'}});partial506.membership=[['Teacher','Teacher','','','','','','','','','','','']];partial506.masterOptions.Role=['Teacher'];partial506.masterOptions['Employment Modifier']=[];partial506.hrTerms.Role=['Teacher'];partial506.hrTerms['Employment Modifier']=[];persist_(book_(),index_(book_()),partial506,null);c.people.push({id:'partial506',name:'Original Name',role:'Teacher',active:true,profile:{'Basic Name':'Original Name',Role:'Teacher','Employment Modifier':'4/5',Active:'Y'}});c.roleCatalogue=[{role:'Teacher',level:'',groups:[]}];var partialBefore506=doc506();save506([{operation:'setTeacherField',teacher:'partial506',field:'Basic Name',expected:'Original Name',value:'Renamed Teacher'}]);`);
assert.equal(run("doc506().teachers.find(t=>t.id==='partial506').profile.Role"),'Teacher');
assert.equal(run("doc506().teachers.find(t=>t.id==='partial506').profile['Employment Modifier']"),'4/5');
assert.equal(run("doc506().teachers.find(t=>t.id==='partial506').profile.Active"),'Y');
assert.deepEqual(json("doc506().teachers.filter(t=>t.id!=='partial506')"),json("partialBefore506.teachers.filter(t=>t.id!=='partial506')"));
run(`var exclusionLegacy506=doc506();exclusionLegacy506.teachers.find(t=>t.id==='partial506').active=false;persist_(book_(),index_(book_()),exclusionLegacy506,null);save506([{operation:'setExclusionCell',teacher:'partial506',level:'1',expected:false,checked:true}]);`);
assert.equal(run("doc506().levelExclusions.find(x=>x.teacher==='partial506').levels.includes('1')"),true);
console.log('PASS 506 partial legacy teacher profile: name edit retains role/employment/active state; exclusion uses authoritative profile precedence; other teacher rows untouched');
