/* PAL receives additions from FT edits; existing allocations remain independent. */
var GSISPAL=(function(){
 'use strict';
 const defaults=()=>({schema:1,auto:true});
 const key=c=>String(c.level)+(String(c.shortName).startsWith(String(c.level))?String(c.shortName).slice(String(c.level).length):c.shortName);
 function reconcile(d,edit){
  if(!d.pal?.auto||!edit||!Array.isArray(d.classes)||!Array.isArray(d.assignments))return d;
  if(edit.operation!=='setPAL'&&(edit.operation!=='addTeacher'||edit.subject!=='FT'))return d;
  const workload=typeof GSISWorkload!=='undefined'?GSISWorkload:require('./workload.js');
  if(workload.subjectType(d,'PAL')==='tg')return d;
  for(const ft of d.assignments.filter(a=>a.subject==='FT')){
   const c=d.classes.find(c=>ft.targetRef?c.ref===ft.targetRef:key(c)===ft.target);
   if(!c||!['1','2'].includes(String(c.level)))continue;
   if(edit.operation!=='setPAL'&&(ft.teacher!==edit.teacher||(edit.targetRef?c.ref!==edit.targetRef:key(c)!==edit.target)))continue;
   if(d.assignments.some(a=>a.subject==='PAL'&&a.teacher===ft.teacher&&(a.targetRef?a.targetRef===c.ref:a.target===key(c))))continue;
   d.assignments.push({...ft,id:'pal-'+ft.id,subject:'PAL',target:key(c),targetRef:c.ref});
  }
  return d;
 }
 function set(d,value){
  if(!value||value.schema!==1||typeof value.auto!=='boolean'||Object.keys(value).some(k=>!['schema','auto'].includes(k)))throw Error('Choose Manual or Auto PAL.');
  const enable=value.auto&&!d.pal?.auto;
  for(const a of d.assignments||[])if(a.palManaged)delete a.palManaged;
  d.pal={schema:1,auto:value.auto};return enable?reconcile(d,{operation:'setPAL'}):d;
 }
 function canEdit(d,user){const roles=user?.roles||[];return roles.includes('Admin')||roles.includes('KP')&&(d.pal?.auto===false||user.palEditor===true);}
 return {defaults,reconcile,set,canEdit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISPAL;
