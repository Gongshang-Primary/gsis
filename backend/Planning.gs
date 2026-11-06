// Version-owned catalogues; only publication replaces Contacts' choices.
const MEMBERSHIP_FIELDS_=['Role Shortform','Formal Role Name','SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK','EO Appt Level'];
function membershipCatalogue_(rows){return rows.map(r=>({role:r[0],level:r[12],groups:MEMBERSHIP_FIELDS_.slice(2,12).filter((k,i)=>r[i+2]==='1'),requiredSubject:['MTL','PE','Art','Music'].includes(r[0])?r[0]:''}));}
function seedMembership_(c){return c.membership?.rows||c.roleCatalogue?.map(r=>[r.role,r.role,...MEMBERSHIP_FIELDS_.slice(2,12).map(k=>(r.groups||[]).includes(k)?'1':''),r.level||''])||[];}
function planningContext_(d,c,idx,initialise=true){
 if(!d.membership&&(c.membership||c.roleCatalogue?.length))d.membership=JSON.parse(JSON.stringify(seedMembership_(c)));
 if(!d.hrChoicesSchema||!Object.keys(d.masterOptions||{}).length){
  d.masterOptions=JSON.parse(JSON.stringify(Object.keys(d.masterOptions||{}).length?d.masterOptions:idx?.masterOptions||c.sysFields||{}));
  for(const k of Object.keys(d.hrTermsSelected||{}))if(d.hrTermsSelected[k]&&Array.isArray(d.hrTerms?.[k]))d.masterOptions[k]=d.hrTerms[k].slice();
  d.hrChoicesSchema=1;
 }
 // Fill missing legacy fields once; never replace a version's intentionally empty list.
 const fallback={...(c.sysFields||{}),...(d.hrTerms||hrTerms_({...d,masterOptions:null},c))};for(const k of Object.keys(fallback))if(!Object.prototype.hasOwnProperty.call(d.masterOptions,k))d.masterOptions[k]=fallback[k].slice();
 if(d.membership){c.roleCatalogue=membershipCatalogue_(d.membership);d.masterOptions.Role=d.membership.map(r=>r[0]);}
 c.sysFields=JSON.parse(JSON.stringify(d.masterOptions));d.hrTerms=Object.fromEntries(HR_FIELDS_.map(k=>[k,(d.masterOptions[k]||[]).slice()]));d.hrTermsSelected={};if(initialise)GSISPlanning.init(d);return d;
}
function planningValue_(d,x){if(x.operation==='setAscExportSettings')return d.ascExport||{};if(['initReporting','setReportingOfficer'].includes(x.operation))return GSISReporting.value(d,x);if(x.operation==='setFortnight')return d.fortnight?.[x.row]?.[x.field]??'';if(x.operation==='setOrganisation')return d.organisations?.[x.kind]||GSISPlanning.groups(x.kind);if(x.operation==='setDuties')return d.duties||GSISPlanning.duties();if(x.operation==='setMembership')return d.membership||[];if(x.operation==='setMasterOptions')return d.masterOptions||{};}
function isPlanningOp_(op){return ['setAscExportSettings','initReporting','setReportingOfficer','setFortnight','setOrganisation','setDuties','setMembership','setMasterOptions'].includes(op);}
function applyPlanning_(d,x,c,idx){
 auth_(c,['setMembership','setMasterOptions'].includes(x.operation)?'Admin':['initReporting','setReportingOfficer'].includes(x.operation)||x.kind==='plt'?'either':'KP');
 if(JSON.stringify(planningValue_(d,x))!==JSON.stringify(x.expected)&&JSON.stringify(planningValue_(d,x))!==JSON.stringify(x.value))error_(409,'This page changed since you loaded it. Your draft is retained; reload and review before saving.');
 try{
  if(x.operation==='initReporting'){const snapshot={staff:GSISReporting.snapshot(d,c.people),officers:{}};if(d.reporting)error_(409,'Staff list already initialized. Refresh.');if(JSON.stringify(snapshot)!==JSON.stringify(x.value))error_(409,'Staff list changed. Refresh before initialization.');d.reporting=snapshot;}
  if(x.operation==='setReportingOfficer')GSISReporting.assign(d,x.officer,x.value);
  if(x.operation==='setFortnight'){const [level,subject]=JSON.parse(x.row);if(!d.loads[level]||!(subject in d.loads[level])||!['wt','wd','ws','ft','fd','fs','remarks','enabled'].includes(x.field))error_(400,'Invalid split field');if(x.field==='enabled'){if(typeof x.value!=='boolean'||['FT','TTT','PD','Duty','Duties','FTT','FTGP','Assembly'].includes(subject)||GSISWorkload.category(d,subject)!=='Teaching')error_(400,'Choose a teaching subject and a boolean fortnight state');}else if(x.field==='remarks'){if(typeof x.value!=='string'||x.value.length>4000)error_(400,'Use up to 4000 characters');}else if(x.value!==''&&(!Number.isInteger(x.value)||x.value<0||x.value>200))error_(400,'Use a whole number of lesson blocks');d.fortnight[x.row]=d.fortnight[x.row]||{};d.fortnight[x.row][x.field]=x.value;}
  if(x.operation==='setAscExportSettings')d.ascExport=GSISAscExport.validateSettings(x.value);
  if(x.operation==='setOrganisation')d.organisations[x.kind]=GSISPlanning.checkGroups(d,x.kind,x.value);
  if(x.operation==='setDuties'){d.duties=GSISPlanning.checkDuties(d,x.value);d.dutyUpdatedAt=new Date().toISOString();}
  if(x.operation==='setMembership'){
   if(!Array.isArray(x.value)||x.value.length>300)error_(400,'Invalid membership table');const names=new Set();
   for(const row of x.value){if(!Array.isArray(row)||row.length!==13||row.some(v=>typeof v!=='string'||v.length>160)||!row[0].trim()||names.has(row[0].toLowerCase()))error_(400,'Use unique nonblank role names');names.add(row[0].toLowerCase());if(row.slice(2,12).some(v=>!['','1'].includes(v)))error_(400,'Membership flags must be checked or blank');if(row[12]&&!(c.sysFields['EO Appt Level']||[]).includes(row[12])&&!(d.membership||[]).some(old=>old[0]===row[0]&&old[12]===row[12]))error_(400,'Choose an EO level from HR Terms');}
   const mappingsChanged=JSON.stringify(membershipCatalogue_(d.membership||[]))!==JSON.stringify(membershipCatalogue_(x.value));d.membership=x.value;d.masterOptions.Role=x.value.map(r=>r[0]);c.sysFields=d.masterOptions;c.roleCatalogue=membershipCatalogue_(x.value);d.hrTerms.Role=d.masterOptions.Role.slice();if(mappingsChanged)resolveTeachers_(d,c);
  }
  if(x.operation==='setMasterOptions'){
   const fields=['Day of Birth','Month of birth','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier'];
   if(!x.value||Object.keys(x.value).length!==fields.length)error_(400,'Invalid master options');
   for(const k of fields){const values=x.value[k];if(!Array.isArray(values)||values.length>150||values.some(v=>typeof v!=='string'||!v.trim()||v.length>120)||new Set(values).size!==values.length)error_(400,'Use unique choices for '+k);if(['Day of Birth','Month of birth','Active'].includes(k)&&JSON.stringify(values)!==JSON.stringify(c.sysFields[k]))error_(400,k+' uses fixed choices');}
   if(d.membership&&JSON.stringify(x.value.Role)!==JSON.stringify(d.membership.map(r=>r[0])))error_(400,'Edit roles in Membership.');
   d.masterOptions=x.value;c.sysFields=x.value;d.hrTerms=Object.fromEntries(HR_FIELDS_.map(k=>[k,(x.value[k]||[]).slice()]));d.hrTermsSelected={};
  }
 }catch(e){if(e.status)throw e;error_(400,e.message);}
}
function syncPublishedCatalogues_(b,idx,identity,expected){
 gsisRequireBackendRole_('deploy');
 const entry=publishedEntry_(idx),revision=entry?.catalogueRevision;
 const details={versionId:entry?.id,publicationCommit:entry?.commit,revision};
 try{
  if(!entry)return {status:'failed',reason:'No published version.'};
  if(expected&&(entry.id!==expected.versionId||expected.publicationCommit&&entry.commit!==expected.publicationCommit||expected.requestId&&entry.publishRequestId!==expected.requestId))return {status:'failed',reason:'This publication has been superseded. Refresh before retrying.',code:409,...details};
  if(!Number.isInteger(revision)||!entry.commit)return {status:'failed',reason:'Publication sync identity is unavailable. Republish this version.',...details};
  const published=document_(b,entry);
  const result=contacts_(identity,false,'applyDeployCatalogues',{revision,options:published.masterOptions||null,membership:published.membership||null});
  if(result?.saved!==true||result.revision!==revision)return {status:'failed',reason:'Contacts did not confirm this catalogue revision.',...details};
  return {status:result.duplicate?'duplicate':result.unchanged?'unchanged':'updated',...details};
 }catch(e){return {status:'failed',reason:String(e.message||'Contacts sync could not be confirmed.').slice(0,300),code:e.status||503,...details};}
}
function retryContactsSync_(b,idx,identity,p,c){
 auth_(c,'Admin');
 if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'Request ID required');
 if(!p.versionId||typeof p.publicationCommit!=='string'||!p.publicationCommit)error_(400,'Version and publication identity required');
 const entry=publishedEntry_(idx);
 if(!entry||entry.id!==p.versionId||entry.commit!==p.publicationCommit)error_(409,'This publication has been superseded. Refresh before retrying.');
 if((idx.requests||[]).includes(p.requestId))error_(409,'Use a new request ID for Contacts sync.');
 return syncPublishedCatalogues_(b,idx,identity,{versionId:p.versionId,publicationCommit:p.publicationCommit});
}
