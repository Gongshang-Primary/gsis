const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`
const hrSave=(edits,actor=who,roles=['Admin','KP'])=>dispatch_({action:'change',identity:actor,input:{operation:'saveDraft',versionId:planningId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'hr-client',edits}},{...c,user:{email:actor.email,roles}});
const status=(fn,n)=>{let e;try{fn()}catch(x){e=x}if(e?.status!==n)throw Error('Expected '+n+', got '+e?.message)};
const defs={'Role':['Teacher','Visiting Teacher'],'Appointment Status':['Permanent','Contract'],'Employment Modifier':['Part time'],'Subject Modifier':['MTL'],Active:['Y','N']};
let previous=call('sync',{versionId:planningId}).current.hrTerms;
status(()=>hrSave([{operation:'setHRTerms',field:'Role',values:['Teacher'],expected:previous.Role}],who,[]),403);
status(()=>hrSave([{operation:'setHRTerms',field:'Appointment Status',values:['Contract'],expected:previous['Appointment Status']}],who,['KP']),403);
hrSave(Object.entries(defs).map(([field,values])=>({operation:'setHRTerms',field,values,expected:previous[field]})));
const tid='new-'+Utilities.getUuid(),profile={'Basic Name':'Draft Teacher',Role:'Visiting Teacher','EO Appt Level':'Specialist','Appointment Status':'Contract','Employment Modifier':'Part time','Subject Modifier':'MTL',Active:'Y'};
hrSave([{operation:'upsertTeacherProfile',teacher:tid,profile,expected:null}]);
const loaded=call('sync',{versionId:planningId}).current;
if(loaded.teacherDrafts[tid]['EO Appt Level']!=='')throw Error('Manual EO override survived');
if(call('sync',{versionId:id}).current.teacherDrafts[tid]||c.people.some(t=>t.id===tid))throw Error('Draft escaped version');
status(()=>hrSave([{operation:'upsertTeacherProfile',teacher:tid,profile:{...profile,'Subject Modifier':'UNLISTED'},expected:profile}]),400);
status(()=>hrSave([{operation:'setHRTerms',field:'Active',values:['Maybe'],expected:['Y','N']}]),400);
status(()=>hrSave([{operation:'setHRTerms',field:'Role',values:['Teacher','teacher'],expected:defs.Role}]),400);
const overwritten=hrSave([{operation:'setHRTerms',field:'Subject Modifier',values:['Science'],expected:defs['Subject Modifier']}],{email:'b@gsps.edu.sg',subject:'b'});
const conflict=hrSave([{operation:'setHRTerms',field:'Subject Modifier',values:['Arts'],expected:defs['Subject Modifier']}]);
if(conflict.conflicts[0].overwrittenBy!=='b@gsps.edu.sg'||conflict.conflicts[0].where!=='HR Terms · Subject Modifier')throw Error('Missing conflict attribution');
// Removing a choice preserves existing records; their unchanged values remain editable.
hrSave([{operation:'upsertTeacherProfile',teacher:tid,profile:{...profile,'Basic Name':'Renamed'},expected:profile}]);
console.log('PASS HR roles, validation, manual level, version scope, removed legacy choices and latest-save conflict attribution');
`,ctx);
