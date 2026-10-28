const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`{
 const check=(x,m)=>{if(!x)throw Error(m)};
 c.roleCatalogue=[{role:'P',level:'SL',groups:['SL']},{role:'HOD EL',level:'HOD',groups:['SC','KP']}];
 c.people=[{id:'t1',name:'Leader',active:true,profile:{Role:'P','Basic Name':'Leader',Active:'Y'}},{id:'t2',name:'Head',active:true,profile:{Role:'HOD EL','Basic Name':'Head',Active:'Y'}}];
 const first=call('sync',{versionId:id});check(first.current.teachers.find(t=>t.id==='t1').profile['EO Appt Level']==='SL','Legacy leader classification');check(first.current.teachers.find(t=>t.id==='t2').profile['EO Appt Level']==='HOD','Legacy head classification');
 check(!deployEligible_(first.current.teachers[0]),'Leader eligible');check(deployEligible_(first.current.teachers[1]),'SC membership hides head');
 c.roleCatalogue[1].level='Jnr KP';const fresh=call('sync',{versionId:id,cacheKey:first.cacheKey});check(!fresh.unchanged,'Master mapping edit did not invalidate snapshot cache');check(fresh.current.teachers.find(t=>t.id==='t2').profile['EO Appt Level']==='Jnr KP','Master mapping not re-derived');check(GSISTeachingRules.calculate(fresh.current.teachers[1]).offloadPercent===20,'Offload ignored master level');
 const planned={teachers:[{id:'t2',name:'Planned',active:false,role:'HOD EL',profile:{Role:'HOD EL','Basic Name':'Planned',Active:'N'}}],teacherDrafts:{}};resolveTeachers_(planned,c);check(planned.teachers[0].profile['Basic Name']==='Planned'&&!planned.teachers[0].active,'Refresh changed planned fields');
 const req={action:'change',identity:who,input:{versionId:id,operation:'saveDraft',requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'eligibility',edits:[{operation:'addTeacher',teacher:'t1',target:'1P',subject:'EL',expected:[]}]}};
 let rejected=false;try{dispatch_(req,c)}catch(e){rejected=e.status===400}check(rejected,'Backend allowed a hidden nonteacher assignment');
 console.log('PASS server legacy hydration, master-aware cache, offload mapping, planned-field preservation and save-time exclusion');
}`,ctx);
