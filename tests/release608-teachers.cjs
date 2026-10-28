const assert=require('node:assert/strict'),fs=require('node:fs'),f=require('./deploy508-fixture.js')(),{run,ctx,stats}=f;
const plain=value=>JSON.parse(JSON.stringify(value));
run(`
 var profile608=name=>({'Basic Name':name,Role:'Teacher','EO Appt Level':'','Appointment Status':'','Employment Modifier':'','Subject Modifier':'',Active:'Y'});
 c.sysFields={Role:['Teacher'],'EO Appt Level':[],'Appointment Status':[],'Employment Modifier':[],'Subject Modifier':[],Active:['Y','N']};
 c.roleCatalogue=[{role:'Teacher',level:'',groups:[]}];
 c.people=c.people.map(t=>({...t,role:'Teacher',profile:profile608(t.name)}));
 var vid608=call('change',{operation:'create',duplicate:true,sourceVersionId:id,name:'Teacher lifecycle 608',requestId:Utilities.getUuid()}).versionId;
 var en608=()=>index_(book_()).versions.find(x=>x.id===vid608),doc608=()=>document_(book_(),en608()),view608=()=>call('sync',{versionId:vid608,auditPaged:true}).current;
 var save608=edits=>call('change',{operation:'saveDraft',versionId:vid608,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'608',edits,returnDelta:true,since:en608().revision,authority:c.user.roles.join('+'),auditPaged:true});
 var initial608=doc608();initial608.teachers=JSON.parse(JSON.stringify(c.people));initial608.teacherDrafts={};initial608.masterOptions=JSON.parse(JSON.stringify(c.sysFields));initial608.hrTerms=JSON.parse(JSON.stringify(c.sysFields));initial608.membership=seedMembership_(c);initial608.relief=GSISRelief.defaults();persist_(book_(),index_(book_()),initial608,null);
`);
// The save guard uses all current server rows, not the caller's displayed rows.
const initial=run('JSON.stringify(doc608())');f.reset();
assert.throws(()=>run("save608([{operation:'setTeacherField',teacher:'t2',field:'Basic Name',expected:'Two',value:'  ONE  '}])"),e=>e.status===409&&/Duplicate TTb name/.test(e.message));
assert.equal(run('JSON.stringify(doc608())'),initial);assert.equal(stats.writes.length,0,'Duplicate rejection happens before storage writes');
assert.throws(()=>run("save608([{operation:'setTeacherField',teacher:'t1',field:'Basic Name',expected:'One',value:'Shared Name'},{operation:'setTeacherField',teacher:'t2',field:'Basic Name',expected:'Two',value:'shared   name'}])"),e=>e.status===409);
assert.equal(run('JSON.stringify(doc608())'),initial,'A duplicate within one batch rolls back every edit');
run("var new608='new-'+Utilities.getUuid();save608([{operation:'upsertTeacherProfile',teacher:new608,profile:profile608('Ruzana'),expected:null}]);");
assert.throws(()=>run("save608([{operation:'upsertTeacherProfile',teacher:'new-'+Utilities.getUuid(),profile:profile608('RUZANA'),expected:null}])"),e=>e.status===409);
assert.equal(run("doc608().teachers.filter(t=>t.name==='Ruzana').length"),1,'Second editor cannot add the same timetable name');
run("save608([{operation:'setTeacherField',teacher:'t1',field:'Basic Name',expected:'One',value:'Two'},{operation:'setTeacherField',teacher:'t2',field:'Basic Name',expected:'Two',value:'One'}]);");
assert.equal(run("doc608().teachers.find(t=>t.id==='t1').name"),'Two','A final-state-unique atomic rename is allowed');

run(`
 var setup608=()=>{var d=doc608();d.teachers.find(t=>t.id==='t1').active=true;d.teachers.find(t=>t.id==='t1').profile.Active='Y';if(d.teacherDrafts.t1)d.teacherDrafts.t1.Active='Y';
  d.assignments=[{id:'ft608',teacher:'t1',target:'1P',subject:'FT',level:'1',venue:'F1-16'},{id:'pal608',teacher:'t1',target:'1P',subject:'PAL',level:'1',venue:'F1-16'},{id:'tg608',teacher:'t1',target:'tg608',subject:'EL',level:'1',venue:''},{id:'keep608',teacher:'t2',target:'1P',subject:'EL',level:'1',venue:'F1-16'}];
  d.groups=d.groups.filter(g=>g.id!=='tg608');d.groups.push({id:'tg608',name:'TG 608',level:'1',levels:['1'],form:'P1',sources:[],subject:'EL',venue:''});
  d.organisations=Object.fromEntries(Object.keys(GSISPlanning.defaults).map(k=>[k,GSISPlanning.groups(k)]));for(const [kind,rows]of Object.entries(d.organisations)){rows[0].slots[0]='t1';rows[0].slots.push('t2');}
  d.organisations.dept[1].additionalDeputies=['t1'];d.organisations.dept[2].tls=['t1'];d.organisations.comm[1].legacyLeadership=[{role:'Head',teacher:'t1'}];
  d.duties[0].teachers={'0':'t1','1':'t2'};d.reporting={staff:JSON.parse(JSON.stringify(d.teachers)),officers:{t1:'t2',t2:'t1'}};
  d.relief.blocks={t1:3,t2:1};d.teacherNotes.t1='Keep while inactive';d.levelExclusions=[{teacher:'t1',levels:['1']},{teacher:'t2',levels:['2']}];d.offload.staff={t1:{note:'t1'},t2:{note:'keep'}};d.workload={categories:{},noFTT:['t1','t2']};persist_(book_(),index_(book_()),d,null);
 };setup608();var frozenIndex608=index_(book_());frozenIndex608.active=vid608;frozenIndex608.publishNext=vid608;persist_(book_(),frozenIndex608,doc608(),null);var frozen608=JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))));
 var kept608=doc608().assignments.find(a=>a.teacher==='t2');c.user.roles=['KP'];var beforeInactive608=view608();var deactivated608=save608([{operation:'setTeacherField',teacher:'t1',field:'Active',expected:'Y',value:'N'}]);
`);
const inactive=plain(run('doc608()')),impact=plain(run("GSISPlanning.teacherImpact(doc608(),'t1')"));
assert.equal(inactive.teachers.find(t=>t.id==='t1').active,false);assert.equal(inactive.teacherDrafts.t1.Active,'N');
assert.deepEqual(impact,{assignments:[],organisations:[],nonTeachingActivities:[],duties:[],reporting:{staff:[],officers:[]},blocks:null});
assert.deepEqual(inactive.assignments,[plain(run('kept608'))]);assert.equal(inactive.duties[0].teachers['1'],'t2');
assert.equal(inactive.reporting.officers.t2,'');assert.equal(inactive.teacherNotes.t1,'Keep while inactive');
assert.equal(inactive.relief.blocks.t2,1);assert.ok(inactive.audit.some(a=>a.action==='Clear teacher deployment'));
assert.equal(run('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))'),run('frozen608'),'Frozen publication remains unchanged');
assert.equal(run("GSISFields.apply(beforeInactive608,deactivated608.delta.changes).teachers.find(t=>t.id==='t1').active"),false,'Save delta immediately updates the caller');
assert.throws(()=>run("save608([{operation:'setTeacherField',teacher:'t2',field:'Basic Name',expected:'One',value:'Two'}])"),e=>e.status===409,'Inactive rows still reserve their timetable name');
assert.throws(()=>run("save608([{operation:'removeTeacherProfile',teacher:'t1',expected:view608().teachers.find(t=>t.id==='t1'),expectedImpact:GSISPlanning.teacherImpact(view608(),'t1')}])"),e=>e.status===403,'SMC cannot delete');

run("c.user.roles=['Admin'];setup608();var deleteView608=view608();var removal608={operation:'removeTeacherProfile',teacher:'t1',expected:deleteView608.teachers.find(t=>t.id==='t1'),expectedImpact:GSISPlanning.teacherImpact(deleteView608,'t1')};var intervening608=doc608();intervening608.assignments.push({id:'later608',teacher:'t1',target:'2P',subject:'EL',level:'2',venue:''});persist_(book_(),index_(book_()),intervening608,null);");
const changed=run('JSON.stringify(doc608())');
assert.throws(()=>run('save608([removal608])'),e=>e.status===409&&/review the deletion/.test(e.message));assert.equal(run('JSON.stringify(doc608())'),changed,'Stale deletion review cannot delete newly assigned work');
run("var currentDelete608=view608();removal608={operation:'removeTeacherProfile',teacher:'t1',expected:currentDelete608.teachers.find(t=>t.id==='t1'),expectedImpact:GSISPlanning.teacherImpact(currentDelete608,'t1')};var beforeDelete608=view608();var deletion608=save608([removal608]);");
const deleted=plain(run('doc608()'));
assert.ok(!deleted.teachers.some(t=>t.id==='t1'));assert.ok(deleted.removedTeachers.t1,'Existing recovery tombstone retained');
for(const key of ['teacherNotes','teacherDrafts'])assert.equal(deleted[key].t1,undefined);
assert.equal(deleted.offload.staff.t1,undefined);assert.deepEqual(deleted.workload.noFTT,['t2']);assert.deepEqual(deleted.levelExclusions,[{teacher:'t2',levels:['2']}]);
assert.equal(run("JSON.stringify(GSISPlanning.teacherImpact(doc608(),'t1'))"),JSON.stringify(impact));
assert.deepEqual(deleted.assignments,[plain(run('kept608'))]);assert.ok(deleted.audit.some(a=>a.action==='removeTeacherProfile'));
assert.ok(run("c.people.some(t=>t.id==='t1'&&t.active)"),'Draft deletion does not mutate Contacts');
assert.equal(run('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))'),run('frozen608'));
assert.throws(()=>run("save608([{operation:'upsertTeacherProfile',teacher:'t1',profile:profile608('Two'),expected:null}])"),e=>e.status===409,'Stale profile upsert cannot resurrect a deleted record');
assert.equal(run("GSISFields.apply(beforeDelete608,deletion608.delta.changes).teachers.some(t=>t.id==='t1')"),false);
// Publishing and accepting Contacts must not revive deleted IDs, including never-published additions.
run(`
 save608([{operation:'setTeacherField',teacher:'t2',field:'Basic Name',expected:'One',value:'Two'}]);
 var addedDelete608=view608();save608([{operation:'removeTeacherProfile',teacher:new608,expected:addedDelete608.teachers.find(t=>t.id===new608),expectedImpact:GSISPlanning.teacherImpact(addedDelete608,new608)}]);
 var contactsApproval608=0;contacts_=(identity,authority,action,input)=>{if(action==='approveDeployTeachers'){contactsApproval608++;return {saved:true};}return c;};
 var keptContactProfile608=teacherProfile_(c.people.find(t=>t.id==='t1'));
 call('change',{operation:'publish',key:'meta',versionId:vid608,requestId:Utilities.getUuid(),expectedRevision:en608().revision,contactApprovals:[{id:'t1',expected:keptContactProfile608,values:keptContactProfile608}]});
`);
assert.equal(run('contactsApproval608'),1);assert.equal(run('doc608().removedTeachers.t1.contactsReviewed'),true);
assert.equal(run('teacherContactChanges_(doc608(),c).length'),0,'Explicitly keeping the Contacts record active does not repeat its deletion proposal');
assert.ok(run('doc608().removedTeachers[new608]'),'Never-published new-ID tombstone survives publication');
for(const expression of ["{operation:'upsertTeacherProfile',teacher:'t1',profile:profile608('One'),expected:null}","{operation:'upsertTeacherProfile',teacher:new608,profile:profile608('Ruzana'),expected:null}"]){assert.throws(()=>run('save608(['+expression+'])'),e=>e.status===409);}
run("call('change',{operation:'acceptContacts',key:'meta',versionId:vid608,requestId:Utilities.getUuid(),expectedRevision:en608().revision});");
assert.equal(run("doc608().teachers.some(t=>t.id==='t1'||t.id===new608)"),false,'Accept Contacts retains version deletions');
assert.equal(run("c.people.find(t=>t.id==='t1').active"),true,'Admin choice to keep Contacts active is respected');
// Use the actual frontend projection for mixed unsaved operations, including generated assignment IDs.
const appSource=fs.readFileSync(__dirname+'/../public/app.js','utf8');
ctx.projectSource608=appSource.slice(appSource.indexOf('function projectEdit(doc,input)'),appSource.indexOf('let pendingProjection='));
run(`
 var project608=(doc,input)=>{const roleCatalogue=membershipCatalogue_(doc.membership||[]),staffCatalog=new Map(c.people.map(t=>[t.id,t])),clone=x=>JSON.parse(JSON.stringify(x)),classKey=classKey_;eval(projectSource608);projectEdit(doc,input);};
 var mixed608=doc608();mixed608.pal={schema:1,auto:true};mixed608.membership.push(['YH','Year Head','','','1','','','','','','','','YH']);mixed608.masterOptions.Role.push('YH');mixed608.masterOptions['EO Appt Level']=['YH'];persist_(book_(),index_(book_()),mixed608,null);
 var newBatch608='new-'+Utilities.getUuid(),newTG608='tg-'+Utilities.getUuid(),newProfile608={...profile608('Mixed batch'),'Role':'YH'};
 var mixedEdits608=[{operation:'upsertTeacherProfile',teacher:newBatch608,profile:newProfile608,expected:null},{operation:'addTeacher',teacher:newBatch608,target:'1P',subject:'FT',localId:'draft-ft-608',expected:false},{operation:'addTG',localId:newTG608,level:'1',form:'P1',sources:[],subject:'EL',name:'Draft TG 608',venue:'',expected:null},{operation:'addTeacher',teacher:newBatch608,target:newTG608,subject:'EL',localId:'draft-tg-608',expected:false}];
 var mixedPreview608=view608();for(const edit of mixedEdits608)project608(mixedPreview608,edit);
 mixedEdits608.push({operation:'removeTeacherProfile',teacher:newBatch608,expected:mixedPreview608.teachers.find(t=>t.id===newBatch608),expectedImpact:GSISPlanning.teacherImpact(mixedPreview608,newBatch608)});
 save608(mixedEdits608);
`);
assert.equal(run('doc608().teachers.some(t=>t.id===newBatch608)'),false);
assert.equal(run('doc608().assignments.some(a=>a.teacher===newBatch608)'),false,'Pending FT, PAL and TG assignments are removed in the same batch');
assert.equal(run("doc608().removedTeachers[newBatch608].profile['EO Appt Level']"),'HOD','Frontend reviewed YH profile matches backend EO normalization');
assert.ok(run('doc608().groups.some(g=>g.id===newTG608)'),'Pending TG keeps its stable local ID and survives teacher deletion');
console.log('PASS 608 teacher lifecycle: duplicate/save race guard, batch rollback, stable-ID rename, SMC inactivation with all allocations cleared, Admin reviewed deletion, stale-review rejection, coherent deltas, audit/recovery, Contacts and frozen snapshot isolation.');
