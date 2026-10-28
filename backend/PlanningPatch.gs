function planningPatchTarget_(d,x){return x.source==='setAscExportSettings'?(d.ascExport||{}):x.source==='setOrganisation'?d.organisations[x.kind]:x.source==='setDuties'?d.duties:x.source==='setMembership'?d.membership:x.source==='setMasterOptions'?d.masterOptions:null;}
function planningPatchValue_(d,x){const f=GSISFields.flat(planningPatchTarget_(d,x));return x.changes.map(z=>({key:z.key,value:f[z.key]??null}));}
function applyPlanningPatch_(d,x,c,idx){
 if(!['setAscExportSettings','setOrganisation','setDuties','setMembership','setMasterOptions'].includes(x.source)||!Array.isArray(x.changes)||!x.changes.length||x.changes.length>3000)error_(400,'Invalid field patch');
 const target=planningPatchTarget_(d,x),flat=GSISFields.flat(target);for(const z of x.changes){if(typeof z.key!=='string'||!Array.isArray(JSON.parse(z.key))||z.value!==null&&(typeof z.value!=='string'||z.value.length>45000))error_(400,'Invalid changed field');if((flat[z.key]??null)!==z.old&&(flat[z.key]??null)!==z.value)error_(409,'This field changed since you loaded it. Review your draft before saving.');}
 let value;try{value=GSISFields.apply(target,x.changes);}catch(e){error_(400,'Incomplete field patch');}applyPlanning_(d,{operation:x.source,kind:x.kind,expected:target,value},c,idx);
}
