const assert=require('node:assert/strict'),vm=require('node:vm');
const {ctx,sheets,props}=require('./storage.cjs'),run=source=>vm.runInContext(source,ctx);
const plain=value=>JSON.parse(JSON.stringify(value));
const stored=()=>JSON.stringify({sheets:[...sheets].map(([name,s])=>[name,s.data]),props:[...props]});
run(`
 props_().setProperty('LEASES','{}');
 var impIds=['yanyu','razilah','wen-di','fae','control'];
 c.roleCatalogue=[{role:'Teacher',level:'EO',groups:[]}];
 c.people=impIds.map(id=>({id,name:id,active:true,profile:{'Basic Name':id,Role:'Teacher','EO Appt Level':'EO','Appointment Status':'','Employment Modifier':'','Subject Modifier':'',Active:'Y'}}));
 var impVersion=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'IMP publication fixture',requestId:Utilities.getUuid()}).versionId;
 var impDoc=()=>document_(book_(),index_(book_()).versions.find(e=>e.id===impVersion));
 var impFixture=impDoc();
 Object.assign(impFixture,{
  from:'2026-10-14',to:'2026-11-20',teachers:JSON.parse(JSON.stringify(c.people)),teacherDrafts:{},removedTeachers:{},levelExclusions:[],
  loads:Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),{Assembly:1,FTGP:2,FTT:2,EL:12}])),
  classes:impIds.map((id,i)=>({ref:'class-'+id,level:'3',name:String.fromCharCode(65+i),shortName:String.fromCharCode(65+i)})),groups:[],
  assignments:impIds.flatMap((teacher,i)=>['EL','FT'].map(subject=>({id:teacher+'-'+subject,teacher,target:'3'+String.fromCharCode(65+i),subject}))),
  organisations:{plt:[{id:'plt',name:'Staff PLT',slots:impIds.slice()}]},duties:[],
  workload:{categories:{},specialists:[],nonTeachingActivities:[{id:'imp',code:'IMP',name:'Instructional Mentoring Programme',weeklyPeriods:2,teachers:impIds.slice(0,4)}]},
  offload:GSISTeachingRules.migrate(null),relief:GSISRelief.defaults(),pal:{schema:1,auto:false},
  membership:[['Teacher','','','','','','','','','','','','EO']]
 });
 persist_(book_(),index_(book_()),impFixture,null);
 var impSave=edits=>call('change',{operation:'saveDraft',versionId:impVersion,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'imp-test',edits});
 var impPublish=()=>{const lease=call('lease',{versionId:impVersion,key:'meta',clientId:'imp-test'});return call('change',{...lease,versionId:impVersion,key:'meta',clientId:'imp-test',operation:'publish',requestId:Utilities.getUuid()});};
 impPublish();
`);
const beforeRead=stored(),published=plain(run("call('relief',{})"));
assert.equal(stored(),beforeRead,'published relief read must not mutate storage');
assert.equal(published.version.id,run('impVersion'));assert.equal(published.version.published,true);
assert.equal(published.calculationVersion,'whole-week-v5');
for(const id of ['yanyu','razilah','wen-di','fae']){
 const row=published.teachers.find(t=>t.teacherId===id);
 assert.equal(row.available,true);assert.equal(row.breakdown.otherNonTeaching,2);
 assert.equal(row.breakdown.nonTeachingActivities.length,1);
 assert.equal(row.breakdown.nonTeachingActivities[0].name,'Instructional Mentoring Programme');
 assert.equal(published.admin.rows.find(t=>t.id===id).otherNonTeaching,2);
}
assert.equal(published.teachers.find(t=>t.teacherId==='control').breakdown.otherNonTeaching,0);
run("impSave([{operation:'setWorkload',expected:impDoc().workload,value:{categories:{},specialists:[],noFTT:['control']}}]);");
assert.equal(run('impDoc().workload.nonTeachingActivities[0].teachers.length'),4,'legacy workload editor must preserve activity participants');
assert.equal(run('impDoc().workload.nonTeachingActivities[0].weeklyPeriods'),2);
assert.deepEqual(plain(run("call('relief',{})")),published,'editing workload settings must not alter published snapshot');
run("var changedImp=JSON.parse(JSON.stringify(impDoc().workload));changedImp.nonTeachingActivities[0].weeklyPeriods=3;impSave([{operation:'setWorkload',expected:impDoc().workload,value:changedImp}]);");
const draft=plain(run("call('relief',{versionId:impVersion})"));
assert.equal(draft.version.published,false);
assert.equal(draft.teachers.find(t=>t.teacherId==='yanyu').breakdown.otherNonTeaching,3);
assert.equal(draft.teachers.find(t=>t.teacherId==='yanyu').breakdown.Wi,published.teachers.find(t=>t.teacherId==='yanyu').breakdown.Wi+1,'saved activities invalidate draft relief calculation');
assert.deepEqual(draft.reference,published.reference,'non-teaching edit leaves teaching reference unchanged');
assert.deepEqual(plain(run("call('relief',{})")),published,'published activity values remain frozen until ordinary republish');
run('impPublish();');
const republished=plain(run("call('relief',{})"));
assert.equal(republished.teachers.find(t=>t.teacherId==='yanyu').breakdown.otherNonTeaching,3,'normal publication updates frozen activity values');
const beforeInvalid=stored();
assert.throws(()=>run("var badImp=JSON.parse(JSON.stringify(impDoc().workload));badImp.nonTeachingActivities[0].teachers.push('missing-staff');impSave([{operation:'setWorkload',expected:impDoc().workload,value:badImp}]);"),error=>error.status===400);
assert.equal(stored(),beforeInvalid,'invalid activity save must be atomic');
for(const subject of ['IMP','imp']){
 ctx.impConflictingSubject=subject;
 run("var impSubjectLease=call('lease',{versionId:impVersion,key:'meta',clientId:'imp-test'});");
 const beforeSubject=stored(),reliefBeforeSubject=plain(run("call('relief',{versionId:impVersion})"));
 assert.throws(()=>run("call('change',{...impSubjectLease,versionId:impVersion,key:'meta',clientId:'imp-test',operation:'addSubject',subject:impConflictingSubject,requestId:Utilities.getUuid()});"),error=>error.status===400,'new subjects must not reuse an activity code in any case');
 assert.equal(stored(),beforeSubject,'subject/activity code collision must be rejected before any durable write');
 assert.deepEqual(plain(run("call('relief',{versionId:impVersion})")),reliefBeforeSubject,'rejected subject collision preserves R and activity calculation');
}
run("var impCopy=call('change',{operation:'create',sourceVersionId:impVersion,duplicate:true,name:'Independent IMP copy',requestId:Utilities.getUuid()}).versionId;var impBlank=call('change',{operation:'create',sourceVersionId:impVersion,duplicate:false,name:'Blank IMP copy',requestId:Utilities.getUuid()}).versionId;");
assert.equal(run("document_(book_(),index_(book_()).versions.find(e=>e.id===impCopy)).workload.nonTeachingActivities[0].teachers.length"),4,'duplicate keeps version-owned activity membership');
assert.equal(run("(document_(book_(),index_(book_()).versions.find(e=>e.id===impBlank)).workload?.nonTeachingActivities||[]).flatMap(a=>a.teachers).length"),0,'blank copy clears activity participation');
run("var impBeforeRemoval=call('sync',{versionId:impVersion}).current;impSave([{operation:'removeTeacherProfile',teacher:'yanyu',expected:impBeforeRemoval.teachers.find(t=>t.id==='yanyu'),expectedImpact:GSISPlanning.teacherImpact(impBeforeRemoval,'yanyu')}]);");
assert.equal(run("impDoc().workload.nonTeachingActivities[0].teachers.includes('yanyu')"),false);
assert.equal(run('impDoc().workload.nonTeachingActivities[0].teachers.length'),3);
assert.equal(run("document_(book_(),index_(book_()).versions.find(e=>e.id===impCopy)).workload.nonTeachingActivities[0].teachers.length"),4,'copies remain independent after teacher removal');
assert.deepEqual(plain(run("call('relief',{})")),republished,'teacher removal cannot mutate frozen published activities');
run("c.user.roles=['KP'];impSave([{operation:'setWorkload',expected:impDoc().workload,value:{categories:{},specialists:[]}}]);");
assert.equal(run('impDoc().workload.nonTeachingActivities[0].teachers.length'),3,'KP legacy category save preserves existing activity participants');
const beforeDenied=stored();
assert.throws(()=>run("impSave([{operation:'setWorkload',expected:impDoc().workload,value:{...impDoc().workload,nonTeachingActivities:[]}}]);"),error=>error.status===403,'only Admin may change activity participation');
assert.equal(stored(),beforeDenied,'denied activity removal must leave storage unchanged');
run("c.user.roles=['Admin','KP'];impSave([{operation:'setWorkload',expected:impDoc().workload,value:{...impDoc().workload,nonTeachingActivities:[]}}]);");
assert.equal(run('impDoc().workload.nonTeachingActivities.length'),0,'Admin may explicitly clear activities');
assert.deepEqual(plain(run("call('relief',{})")),republished,'draft activity removal does not bypass publication');
run(`
 var activityOnlyVersion=call('change',{operation:'create',sourceVersionId:impCopy,duplicate:true,name:'Activity-only teacher audit fixture',requestId:Utilities.getUuid()}).versionId;
 var activityOnlyDoc=()=>document_(book_(),index_(book_()).versions.find(e=>e.id===activityOnlyVersion));
 var activityOnlyFixture=activityOnlyDoc();
 Object.assign(activityOnlyFixture,{assignments:[],groups:[],organisations:{},duties:[],reporting:{staff:[],officers:{}},audit:[]});
 activityOnlyFixture.relief.blocks={};
 persist_(book_(),index_(book_()),activityOnlyFixture,null);
 var activityOnlyImpact=GSISPlanning.teacherImpact(activityOnlyDoc(),'yanyu');
`);
const soleImpact=plain(run('activityOnlyImpact'));
assert.deepEqual(soleImpact.assignments,[]);assert.deepEqual(soleImpact.organisations,[]);assert.deepEqual(soleImpact.duties,[]);
assert.deepEqual(soleImpact.reporting,{staff:[],officers:[]});assert.equal(soleImpact.blocks,null);
assert.equal(soleImpact.nonTeachingActivities.length,1,'fixture must have only IMP impact before deactivation');
run("call('change',{operation:'saveDraft',versionId:activityOnlyVersion,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'imp-test',edits:[{operation:'setTeacherField',teacher:'yanyu',field:'Active',expected:'Y',value:'N'}]});");
const deactivated=plain(run('activityOnlyDoc()')),clearedAudit=deactivated.audit.filter(event=>event.action==='Clear teacher deployment');
assert.equal(deactivated.teachers.find(t=>t.id==='yanyu').active,false);
assert.equal(clearedAudit.length,1,'deactivating an activity-only teacher must record the cleared allocation');
assert.equal(clearedAudit[0].before.teacher,'yanyu');
assert.equal(clearedAudit[0].before.nonTeachingActivities[0].code,'IMP');
assert.equal(clearedAudit[0].before.nonTeachingActivities[0].name,'Instructional Mentoring Programme');
assert.equal(clearedAudit[0].before.nonTeachingActivities[0].weeklyPeriods,3);
assert.deepEqual(clearedAudit[0].after,{teacher:'yanyu',inactive:true});
assert.deepEqual(deactivated.workload.nonTeachingActivities[0].teachers,['razilah','wen-di','fae'],'deactivation clears only the chosen teacher from activities');
for(const [activityCode,subject] of [['PHE','PE'],['PE','PHE'],['Sci','Science'],['Science','Sci'],['sCi','SCIENCE']]){
 ctx.aliasActivityCode=activityCode;ctx.aliasSubject=subject;
 run(`
  var aliasVersion=call('change',{operation:'create',sourceVersionId:impCopy,duplicate:true,name:'Activity alias collision fixture',requestId:Utilities.getUuid()}).versionId;
  var aliasFixture=document_(book_(),index_(book_()).versions.find(e=>e.id===aliasVersion));
  aliasFixture.workload.nonTeachingActivities[0].code=aliasActivityCode;
  GSISWorkload.validate(aliasFixture,aliasFixture.workload);
  persist_(book_(),index_(book_()),aliasFixture,null);
  var aliasLease=call('lease',{versionId:aliasVersion,key:'meta',clientId:'imp-test'});
 `);
 const beforeAlias=stored(),reliefBeforeAlias=plain(run("call('relief',{versionId:aliasVersion})"));
 assert.throws(()=>run("call('change',{...aliasLease,versionId:aliasVersion,key:'meta',clientId:'imp-test',operation:'addSubject',subject:aliasSubject,requestId:Utilities.getUuid()});"),error=>error.status===400,'subject aliases must not bypass activity code protection');
 assert.equal(stored(),beforeAlias,'alias collision must be rejected before any durable write');
 assert.deepEqual(plain(run("call('relief',{versionId:aliasVersion})")),reliefBeforeAlias,'rejected alias collision preserves valid R');
}
console.log('PASS IMP API: normal publication and frozen snapshots, additive breakdown, atomic validation and subject-code protection, cache invalidation, copy/teacher lifecycle, activity-only deactivation audit and Admin authority');
