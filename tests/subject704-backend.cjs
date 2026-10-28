const assert=require('node:assert/strict'),fs=require('node:fs');
// Exercise canonical modules through the real dispatcher before and after bundle sync.
const read=fs.readFileSync,modules=[['GSIS_WORKLOAD','shared/workload.js'],['GSIS_VENUE_GROUPS','shared/venue-groups.js'],['GSIS_FIELDSTORE','backend/FieldStore.gs'],['GSIS_RELIEF_BACKEND','backend/Relief.gs'],['GSIS_PAL','shared/pal.js']].map(([marker,path])=>[marker,read(path,'utf8')]);
fs.readFileSync=function(file,...args){let text=read.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof text==='string')for(const [marker,source]of modules)text=text.replace(new RegExp('/\\* '+marker+'_BEGIN \\*/[\\s\\S]*?/\\* '+marker+'_END \\*/'),()=> '/* '+marker+'_BEGIN */\n'+source+'\n/* '+marker+'_END */');return text;};
let fixture;try{fixture=require('./deploy508-fixture.js')();}finally{fs.readFileSync=read;}
const {run,sheets,props}=fixture,plain=x=>JSON.parse(JSON.stringify(x)),stored=()=>JSON.stringify({sheets:[...sheets].map(([n,s])=>[n,s.data]),props:[...props]});
run(`var subjectEntry704=()=>index_(book_()).versions.find(x=>x.id===id),subjectDoc704=()=>document_(book_(),subjectEntry704());
var subjectRequest704=edits=>({operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'subject704',edits,returnDelta:true,since:subjectEntry704().revision,authority:c.user.roles.join('+')});
var subjectSave704=edits=>call('change',subjectRequest704(edits));var subjectBefore704=subjectDoc704();`);
assert.equal(run('subjectDoc704().subjectTypes'),undefined,'Default policy must not write version data');
for(const subject of ['RRP','SDR','CCE','LSM'])assert.equal(run(`GSISWorkload.subjectType(subjectDoc704(),'${subject}')`),'tg');
const roots=plain(run("draftReadScope_([{operation:'setSubjectType'}]).roots"));assert.ok(roots.includes('loads')&&roots.includes('subjectTypes'));for(const root of ['assignments','groups','teachers','venues'])assert.ok(!roots.includes(root),'Subject Type save excludes '+root);
run(`var subjectSavedRequest704=subjectRequest704([{operation:'setSubjectType',subject:'EL',expected:null,value:'tg'},{operation:'setSubjectType',subject:'RRP',expected:null,value:'class'}]);var subjectSaved704=call('change',subjectSavedRequest704);var subjectAfter704=subjectDoc704();`);
assert.equal(run('subjectSaved704.saved'),true);assert.deepEqual(plain(run('subjectAfter704.subjectTypes')),{EL:'tg',RRP:'class'});
for(const root of ['assignments','groups','teachers','venues','loads','organisations'])assert.deepEqual(plain(run(`subjectAfter704.${root}`)),plain(run(`subjectBefore704.${root}`)),'Policy save preserves '+root);
assert.ok(run("subjectAfter704.audit.some(a=>a.action==='setSubjectType'&&a.after.key==='subject-type:EL')"));
assert.ok(run("subjectSaved704.delta.changes.some(x=>JSON.parse(x.key)[0]==='subjectTypes')"));
assert.equal(run("reliefAffectingDelta_([{key:JSON.stringify(['subjectTypes','EL'])}])"),true);
assert.deepEqual(plain(run('reliefSource_(subjectAfter704).subjectTypes')),{EL:'tg',RRP:'class'});
assert.match(run('reliefCacheKey_(book_(),subjectEntry704())'),/^relief086-total-cap:/);
assert.equal(run('call(\'change\',subjectSavedRequest704).duplicate'),true,'Confirmed retry retains exact receipt');
assert.throws(()=>run("call('change',{...subjectSavedRequest704,edits:[{operation:'setSubjectType',subject:'EL',expected:null,value:'class'}]})"),e=>e.status===409,'Same receipt cannot alter payload');
// A stale or invalid later edit rolls back the complete batch, including its earlier edit.
for(const edits of ["[{operation:'setSubjectType',subject:'SDR',expected:null,value:'both'},{operation:'setSubjectType',subject:'EL',expected:null,value:'class'}]","[{operation:'setSubjectType',subject:'SDR',expected:null,value:'both'},{operation:'setSubjectType',subject:'Missing subject',expected:null,value:'tg'}]","[{operation:'setSubjectType',subject:'RRP',expected:'class',value:'neither'}]"]){const before=stored();assert.throws(()=>run('subjectSave704('+edits+')'),e=>[400,409].includes(e.status));assert.equal(stored(),before,'Rejected batch must not write any rows');}
run("c.user.roles=['KP']");for(const expression of ["call('change',subjectSavedRequest704)","subjectSave704([{operation:'setTeacherNote',teacher:'t1',expected:'',value:'must not save'},{operation:'setSubjectType',subject:'EL',expected:'tg',value:'class'}])","saveDraft_(book_(),index_(book_()),subjectDoc704(),subjectSavedRequest704,c,{identity:who})"]){const before=stored();assert.throws(()=>run(expression),e=>e.status===403);assert.equal(stored(),before,'Non-Admin policy write must not mutate data');}
// New allocations must obey policy even when a client bypasses the UI.
assert.throws(()=>run("subjectSave704([{operation:'addTeacher',target:'1P',subject:'EL',teacher:'t1',expected:false}])"),e=>e.status===400&&/Subject Type/.test(e.message));
for(const args of ["{name:'Blocked RRP TG',subject:'RRP',level:'1',form:'P1',venue:'',sources:[]}","{name:'Blocked modern RRP TG',subject:'RRP',level:'1',levels:['1'],classRefs:[],weeklyPeriods:2}"])assert.throws(()=>run("apply_(subjectDoc704(),{operation:'addTG',key:'meta',..."+args+"},c,index_(book_()))"),e=>e.status===400&&/Class only/.test(e.message));
// Existing forbidden assignments remain real workload and can still be removed.
assert.ok(run("subjectDoc704().assignments.some(a=>a.target==='1P'&&a.subject==='EL'&&a.teacher==='t2')"));
run("subjectSave704([{operation:'removeTeacher',target:'1P',subject:'EL',teacher:'t2',expected:true}])");assert.equal(run("subjectDoc704().assignments.some(a=>a.target==='1P'&&a.subject==='EL')"),false);
run("c.user.roles=['Admin','KP'];var legacySubject704=subjectDoc704();legacySubject704.groups.push({id:'legacy-rrp704',name:'Existing RRP',subject:'RRP',level:'1',form:'P1',venue:'',sources:[],weeklyPeriods:2});legacySubject704.assignments.push({id:'legacy-rrp-assignment704',target:'legacy-rrp704',subject:'RRP',teacher:'t1',level:'1',venue:''});persist_(book_(),index_(book_()),legacySubject704,null);");
assert.throws(()=>run("subjectSave704([{operation:'addTeacher',target:'legacy-rrp704',subject:'RRP',teacher:'t2',expected:false}])"),e=>e.status===400&&/Class only/.test(e.message));
run("var legacyUpdate704={operation:'updateTG',groupId:'legacy-rrp704',name:'Existing RRP revised',subject:'RRP',level:'1',levels:['1'],classRefs:[],weeklyPeriods:2,levelWide:true,venue:'',assignments:'keep'};legacyUpdate704.expected=GSISVenueGroups.state(subjectDoc704(),legacyUpdate704);subjectSave704([legacyUpdate704]);");
assert.equal(run("subjectDoc704().groups.find(g=>g.id==='legacy-rrp704').name"),'Existing RRP revised');assert.ok(run("subjectDoc704().assignments.some(a=>a.id==='legacy-rrp-assignment704')"));
run("subjectSave704([{operation:'removeTeacher',target:'legacy-rrp704',subject:'RRP',teacher:'t1',expected:true}])");
assert.equal(run("subjectDoc704().assignments.some(a=>a.id==='legacy-rrp-assignment704')"),false);
// Reviewed legacy conversion must obey the destination policy before changing any rows.
run(`var legacyConvert704=subjectDoc704();legacyConvert704.loads['1']['Pull/Sci']=4;legacyConvert704.loads['1'].Science=4;legacyConvert704.groups.push({id:'convert-tg704',name:'Legacy Science',subject:'Pull/Sci',level:'1',form:'P1',venue:'',sources:[]});legacyConvert704.assignments.push({id:'convert-class704',target:'1P',subject:'Pull/Sci',teacher:'t1',level:'1',venue:''});`);
for(const mode of ['class','tg']){run(`legacyConvert704.subjectTypes.Science='${mode}'`);const before=run('JSON.stringify(legacyConvert704)');assert.throws(()=>run("apply_(legacyConvert704,{operation:'convertLegacySubject',subject:'Pull/Sci',targetSubject:'Science',key:'meta'},c,index_(book_()))"),e=>e.status===409&&/Subject Type/.test(e.message));assert.equal(run('JSON.stringify(legacyConvert704)'),before,'Rejected conversion retains legacy groups, assignments and rates');}
run("legacyConvert704.subjectTypes.Science='both';apply_(legacyConvert704,{operation:'convertLegacySubject',subject:'Pull/Sci',targetSubject:'Science',key:'meta'},c,index_(book_()))");
assert.equal(run("legacyConvert704.groups.find(g=>g.id==='convert-tg704').subject"),'Science');assert.equal(run("legacyConvert704.assignments.find(a=>a.id==='convert-class704').subject"),'Science');
// Copies own their policy snapshot; later source changes do not leak across versions.
run("var subjectCopy704=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'Subject Type copy',requestId:Utilities.getUuid()}).versionId;var subjectPlanning704=call('change',{operation:'create',sourceVersionId:id,duplicate:false,name:'Subject Type planning',requestId:Utilities.getUuid()}).versionId;subjectSave704([{operation:'setSubjectType',subject:'EL',expected:'tg',value:'both'}]);");
for(const name of ['subjectCopy704','subjectPlanning704'])assert.equal(run(`document_(book_(),index_(book_()).versions.find(x=>x.id===${name})).subjectTypes.EL`),'tg');
assert.equal(run('subjectDoc704().subjectTypes.EL'),'both');
// The final requested policy governs new work regardless of the request order.
for(const policyFirst of [false,true])for(const operation of ['addTeacher','addTG']){
 run(`var mixedPolicy704={operation:'setSubjectType',subject:'EL',expected:'both',value:'${operation==='addTeacher'?'tg':'class'}'},mixedWork704=${operation==='addTeacher'?"{operation:'addTeacher',target:'1P',subject:'EL',teacher:'t1',expected:false}":"{operation:'addTG',localId:'mixed-tg704',name:'Mixed policy TG',subject:'EL',level:'1',form:'P1',venue:'',sources:[],expected:null}"};var mixedRequest704=subjectRequest704(${policyFirst?'[mixedPolicy704,mixedWork704]':'[mixedWork704,mixedPolicy704]'}),mixedText704=JSON.stringify(mixedRequest704.edits);`);
 const before=stored();assert.throws(()=>run("call('change',mixedRequest704)"),e=>e.status===400);assert.equal(stored(),before,'Final policy rejects the complete allocation batch in either order');assert.equal(run('JSON.stringify(mixedRequest704.edits)'),run('mixedText704'),'Execution must not mutate the caller payload');
}
for(const policyFirst of [false,true]){
 run(`var allowedPolicy704={operation:'setSubjectType',subject:'EL',expected:'both',value:'class'},allowedWork704={operation:'addTeacher',target:'1P',subject:'EL',teacher:'t1',expected:false},allowedRequest704=subjectRequest704(${policyFirst?'[allowedPolicy704,allowedWork704]':'[allowedWork704,allowedPolicy704]'}),allowedText704=JSON.stringify(allowedRequest704.edits);call('change',allowedRequest704);`);
 assert.ok(run("subjectDoc704().assignments.some(a=>a.target==='1P'&&a.subject==='EL'&&a.teacher==='t1')"));assert.equal(run('JSON.stringify(allowedRequest704.edits)'),run('allowedText704'));assert.equal(run("call('change',allowedRequest704).duplicate"),true,'Retry fingerprints original order');
 run("subjectSave704([{operation:'removeTeacher',target:'1P',subject:'EL',teacher:'t1',expected:true},{operation:'setSubjectType',subject:'EL',expected:'class',value:'both'}])");
}
// Auto PAL must see the stored policy even when it is the sole changed setting.
assert.ok(plain(run("draftReadScope_([{operation:'setPAL'}]).roots")).includes('subjectTypes'));
for(const policyFirst of [false,true]){
 run("subjectSave704([{operation:'setPAL',expected:subjectDoc704().pal,value:{schema:1,auto:false}},{operation:'setSubjectType',subject:'PAL',expected:subjectDoc704().subjectTypes?.PAL??null,value:'both'}])");
 run(`var autoPolicy704={operation:'setSubjectType',subject:'PAL',expected:'both',value:'tg'},autoChange704={operation:'setPAL',expected:subjectDoc704().pal,value:{schema:1,auto:true}};subjectSave704(${policyFirst?'[autoPolicy704,autoChange704]':'[autoChange704,autoPolicy704]'});`);
 assert.equal(run("subjectDoc704().assignments.filter(a=>a.subject==='PAL').length"),0,'Auto PAL creates no class assignments against final TG only policy');
 run("subjectSave704([{operation:'setPAL',expected:subjectDoc704().pal,value:{schema:1,auto:false}}]);subjectSave704([{operation:'setPAL',expected:subjectDoc704().pal,value:{schema:1,auto:true}}])");
 assert.equal(run("subjectDoc704().assignments.filter(a=>a.subject==='PAL').length"),0,'Narrow Auto PAL save reads the stored policy');
 run("subjectSave704([{operation:'setSubjectType',subject:'PAL',expected:'tg',value:'both'}])");
 run(`var ftPolicy704={operation:'setSubjectType',subject:'PAL',expected:'both',value:'tg'},ftChange704={operation:'addTeacher',target:'1T',subject:'FT',teacher:'t2',expected:false};subjectSave704(${policyFirst?'[ftPolicy704,ftChange704]':'[ftChange704,ftPolicy704]'});`);
 assert.ok(run("subjectDoc704().assignments.some(a=>a.target==='1T'&&a.subject==='FT'&&a.teacher==='t2')"));assert.equal(run("subjectDoc704().assignments.filter(a=>a.subject==='PAL').length"),0,'FT save cannot generate PAL against final TG only policy');
 run("subjectSave704([{operation:'removeTeacher',target:'1T',subject:'FT',teacher:'t2',expected:true}])");
}
console.log('PASS 704 Subject Type backend: Admin-only per-subject atomic batches, raw expected values, conflicts and invalid batches leave rows untouched, exact receipt retry, current authority, scoped roots, delta/relief invalidation, new-allocation enforcement, retained legacy assignments and TG edits, independent version copies.');
