const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`
function expectStatus(fn,status){let error;try{fn()}catch(e){error=e}if(error?.status!==status)throw Error('Expected '+status+', got '+error?.message)}
c.roleCatalogue=[{role:'Teacher',level:'EO',groups:[]}];c.people=c.people.map(t=>({...t,profile:{'Basic Name':t.name,Role:'Teacher','EO Appt Level':'EO','Appointment Status':'','Employment Modifier':'','Subject Modifier':'',Active:'Y'}}));
const temp=model_(JSON.parse(JSON.stringify(call('sync',{versionId:planningId}).current)));temp.teachers=JSON.parse(JSON.stringify(c.people));temp.hrTerms=null;temp.hrTerms=hrTerms_(temp,c);
const plainKP={...c,user:{roles:['KP']}},plainAdmin={...c,user:{roles:['Admin']}};
expectStatus(()=>approveTeacherPublish_(temp,{},plainKP,who),403);approveTeacherPublish_(temp,{},plainAdmin,who);apply_(temp,{operation:'publish',key:'meta'},plainAdmin,{active:id});
const nid='new-'+Utilities.getUuid(),profile={'Basic Name':'New Teacher',Role:'Teacher','EO Appt Level':'EO','Appointment Status':'','Employment Modifier':'','Subject Modifier':'',Active:'Y'};
saveTeacherProfile_(temp,{teacher:nid,profile},plainKP,who);
if(temp.teacherDrafts[nid]['EO Appt Level']!=='EO')throw Error('Derived level missing');
expectStatus(()=>approveTeacherPublish_(temp,{},plainKP,who),403);
expectStatus(()=>approveTeacherPublish_(temp,{},plainAdmin,who),409);
let writes=0;contacts_=(identity,authority,action,input)=>{if(action==='approveDeployTeachers'){writes++;for(const a of input.approvals){const teacher=temp.teachers.find(t=>t.id===a.id);const pos=c.people.findIndex(t=>t.id===a.id);if(pos<0)c.people.push(JSON.parse(JSON.stringify(teacher)));else c.people[pos]=JSON.parse(JSON.stringify(teacher));}return {saved:true}}return {...c,user:{roles:['Admin']}}};
const approvals=[{id:nid,values:{...temp.teacherDrafts[nid]},expected:null}];
const extra={id:'external',name:'New Teacher',active:true};c.people.push(extra);
expectStatus(()=>approveTeacherPublish_(temp,{contactApprovals:approvals},plainAdmin,who),409);if(writes)throw Error('Wrote before pool validation');c.people.pop();
const approvedContactSnapshot=approveTeacherPublish_(temp,{requestId:Utilities.getUuid(),contactApprovals:approvals},plainAdmin,who);apply_(temp,{operation:'publish',key:'meta'},approvedContactSnapshot,{active:id});
if(writes!==1||Object.keys(temp.teacherDrafts).length)throw Error('Publication not finalized');
// Reactivation requires Admin and remains version scoped until approval.
c.people.push({id:'inactive',name:'Returning Teacher',active:false,profile:{...profile,'Basic Name':'Returning Teacher',Active:'N'}});
saveTeacherProfile_(temp,{teacher:'inactive',profile:{...profile,'Basic Name':'Returning Teacher',Active:'Y'}},c,who);
expectStatus(()=>approveTeacherPublish_(temp,{},plainKP,who),403);if(c.people.find(t=>t.id==='inactive').active)throw Error('Draft wrote Contacts');
// Admin can refresh unrelated Contacts changes without discarding teacher proposals.
c.people.push({id:'new-external',name:'Another Teacher',active:true});apply_(temp,{operation:'acceptContacts',key:'meta'},plainAdmin,{active:id});if(!temp.teacherDrafts.inactive||!temp.teachers.find(t=>t.id==='new-external'))throw Error('Snapshot merge lost changes');
// Save a version-specific new teacher via the real manual draft endpoint.
for(const version of [planningId]){call('change',{operation:'saveDraft',versionId:version,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'terms',edits:[{operation:'setHRTerms',field:'Role',values:['Teacher'],expected:[]}]});}
const p2={...profile,'Basic Name':'Draft Only'},id2='new-'+Utilities.getUuid();
const response=dispatch_({action:'change',identity:who,input:{operation:'saveDraft',versionId:planningId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'teacher-edit',edits:[{operation:'upsertTeacherProfile',teacher:id2,profile:p2,expected:null}]}},plainKP);
if(!call('sync',{versionId:planningId}).current.teacherDrafts[id2])throw Error('Teacher draft missing');if(call('sync',{versionId:id}).current.teacherDrafts[id2])throw Error('Teacher leaked to active version');if(c.people.some(t=>t.id===id2))throw Error('Draft was added to Contacts');
console.log('PASS KP unchanged publication, Admin changed publication, pool preflight before write, reactivation, preserved draft merge and version-scoped teacher saves');
`,ctx);
vm.runInContext(`
// Full lease/change route, including a response failure after Contacts commit.
const publishPlan=call('change',{operation:'create',name:'Publication recovery',requestId:Utilities.getUuid()}).versionId;
call('change',{operation:'saveDraft',versionId:publishPlan,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'terms',edits:[{operation:'setHRTerms',field:'Role',values:['Teacher'],expected:[]}]});
const recoveryId='new-'+Utilities.getUuid(),recoveryProfile={...profile,'Basic Name':'Recovery Teacher'};
call('change',{operation:'saveDraft',versionId:publishPlan,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'publisher',edits:[{operation:'upsertTeacherProfile',teacher:recoveryId,profile:recoveryProfile,expected:null}]});
const toPublish=call('sync',{versionId:publishPlan}).current,priorActive=index_(book_()).active;
let approvalCalls=0,failAfterContacts=true;
contacts_=(identity,authority,action,input)=>{if(action==='approveDeployTeachers'){approvalCalls++;for(const a of input.approvals){if(!c.people.some(t=>t.id===a.id))c.people.push(JSON.parse(JSON.stringify(toPublish.teachers.find(t=>t.id===a.id))))}if(failAfterContacts){failAfterContacts=false;error_(503,'Simulated disconnect after Contacts commit')}return {saved:true}}return {...c,user:{roles:['Admin']}}};
const publishLease=call('lease',{versionId:publishPlan,key:'meta',clientId:'publisher'}),publishInput={...publishLease,key:'meta',clientId:'publisher',versionId:publishPlan,operation:'publish',requestId:Utilities.getUuid(),contactApprovals:[{id:recoveryId,expected:null,values:toPublish.teacherDrafts[recoveryId]}]};
expectStatus(()=>dispatch_({action:'change',identity:who,input:publishInput},{...c,user:{roles:['Admin']}}),503);
if(index_(book_()).active!==priorActive)throw Error('Failed publication changed active version');
const published=dispatch_({action:'change',identity:who,input:publishInput},{...c,user:{roles:['Admin']}});
if(!published.saved||index_(book_()).active!==publishPlan)throw Error('Admin-only retry did not publish');
if(c.people.filter(t=>t.id===recoveryId).length!==1)throw Error('Retry duplicated teacher');
const duplicate=dispatch_({action:'change',identity:who,input:publishInput},{...c,user:{roles:['Admin']}});if(!duplicate.duplicate)throw Error('Published retry not idempotent');
console.log('PASS full publication endpoint: Contacts-first failure preserves active deployment; Admin-only retry completes once');
`,ctx);
