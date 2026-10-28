'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),{ctx}=require('./release506-fixture.js');
const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
run(`props_().setProperty('LEASES','{}');var row088=()=>index_(book_()).versions.find(x=>x.id===id),doc088=()=>document_(book_(),row088()),save088=edits=>call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'088',edits,returnDelta:true,since:row088().revision,auditPaged:true});var seed088=doc088(),original088=seed088.classes.find(x=>classKey_(x)==='1P');original088.name='Original Class';seed088.classNameSets[0].pairs.push([original088.name,original088.shortName]);persist_(book_(),index_(book_()),seed088,null);var base088=doc088(),cl088=base088.classes.find(x=>classKey_(x)==='1P'),expected088={level:cl088.level,name:cl088.name,shortName:cl088.shortName},pair088=base088.classNameSets.flatMap(s=>s.pairs).find(([name,short])=>!base088.classes.some(c=>c.level==='1'&&(c.shortName.toLowerCase()===short.toLowerCase()||c.name.toLowerCase()===name.toLowerCase())));`);
// Simulate a concurrent metadata rename: the stale user's row must not overwrite it.
run(`save088([{operation:'updateClass',ref:cl088.ref,level:'1',name:pair088[0],shortName:pair088[1],expected:expected088}]);var renamed088=doc088();`);
assert.throws(()=>run(`save088([{operation:'updateClass',renameOnly:true,ref:cl088.ref,level:'1',name:cl088.name,shortName:cl088.shortName,expected:expected088}])`),e=>e.status===409,'Stale class rename must be rejected');
assert.deepEqual(json('doc088().classes'),json('renamed088.classes'));
// Revert with the latest expected metadata; concurrent assignment changes remain intact.
run(`var current088=doc088().classes.find(c=>c.ref===cl088.ref),priorAssignments088=doc088().assignments;save088([{operation:'updateClass',renameOnly:true,ref:cl088.ref,level:'1',name:cl088.name,shortName:cl088.shortName,expected:{level:current088.level,name:current088.name,shortName:current088.shortName}}]);var restored088=doc088();`);
assert.deepEqual(json('restored088.assignments'),json('base088.assignments'));
assert.deepEqual(json('restored088.venues'),json('base088.venues'));
assert.deepEqual(json('restored088.groups'),json('base088.groups'));
assert.equal(run('restored088.classes.findIndex(c=>c.ref===cl088.ref)'),run('base088.classes.findIndex(c=>c.ref===cl088.ref)'));
assert.ok(json('restored088.audit').some(a=>a.action==='updateClass'||a.operation==='updateClass'),'Class rename is auditable');
// A colleague adds a deployment after the renaming user took their snapshot.
run(`var beforeConcurrent088=doc088(),currentClass088=beforeConcurrent088.classes.find(c=>c.ref===cl088.ref),concurrentSubject088='EL';save088([{operation:'addTeacher',target:'1P',targetRef:cl088.ref,subject:concurrentSubject088,teacher:'t1',expected:false}]);var afterConcurrent088=doc088();save088([{operation:'updateClass',renameOnly:true,ref:cl088.ref,level:'1',name:pair088[0],shortName:pair088[1],expected:expected088}]);var afterMerge088=doc088();`);
assert.deepEqual(json("afterMerge088.assignments.map(a=>({...a,target:a.target==='1'+pair088[1]?'1P':a.target}))"),json('afterConcurrent088.assignments'),'Fresh assignment added by colleague survives rename');
assert.deepEqual(json('afterMerge088.loads'),json('afterConcurrent088.loads'),'Period rates are unchanged');

assert.throws(()=>run(`save088([{operation:'updateClass',renameOnly:true,ref:cl088.ref,level:'2',name:pair088[0],shortName:pair088[1],expected:{level:'1',name:pair088[0],shortName:pair088[1]}}])`),e=>e.status===400,'Rename cannot silently move a row to another level');
console.log('PASS 088 class rename: stale rename rejected; stable row identity, allocations, venue and group references preserved; level move rejected.');
