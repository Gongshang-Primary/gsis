import assert from "node:assert/strict";
import { fixture, schoolId, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { defaults, applyEdits, mergeContacts } from "../v1/services/deploy/model.mjs";
import { choiceLists } from "../v1/services/deploy/catalogue-links.mjs";
const oldRow=['Old','Old role',...Array(10).fill(''),'Grade A',null];
const newRow=['New','New role',...Array(10).fill(''),'Grade B',null];
const base=applyEdits({...defaults()},[{operation:'setRoleMemberships',expected:[],value:[oldRow]}]);
const oldChoices=choiceLists(base), updated={...oldChoices,Role:['New'],'Appointment Status':['Acting']};
for(const edits of [
 [{operation:'setHRChoices',expected:oldChoices,value:updated},{operation:'setRoleMemberships',expected:[oldRow],value:[newRow]}],
 [{operation:'setRoleMemberships',expected:[oldRow],value:[newRow]},{operation:'setHRChoices',expected:oldChoices,value:updated}],
]){
 const result=applyEdits(base,edits);assert.deepEqual(choiceLists(result).Role,['New']);assert.deepEqual(choiceLists(result)['Appointment Status'],['Acting']);
}
const legacy=mergeContacts({...defaults(),masterOptions:{'Appointment Status':['Retained']}},{staff:[],revision:'empty',asOf:Date.now()});
assert.deepEqual(choiceLists(legacy)['Appointment Status'],['Retained']);
const emptyProjection={staff:[],revision:'p0',asOf:Date.now()};
const firstFallback=mergeContacts(defaults(),emptyProjection);
assert(!Object.hasOwn(firstFallback,'masterOptions'),'an unconfigured legacy fallback must not become a configured catalogue');
const laterFallback=mergeContacts(firstFallback,{...emptyProjection,revision:'p1',staff:[{id:'synthetic-fallback',active:true,profile:{Role:'Later role'}}]});
assert.deepEqual(choiceLists(laterFallback).Role,['Later role']);
const f=await fixture();let serial=0;
try {
 const db=await f.db('deploy');
 const {versionId}=await f.call(f.admin,'deploy','/versions/create',{operationId:'synthetic-links-native-create',name:'Synthetic choices',year:2026});
 const stored=async()=> (await loadVersion(db,schoolId,versionId)).doc;
 const lease=async()=>{const l=await f.call(f.admin,'deploy','/lease',{operationId:'synthetic-links-lease-'+(++serial),versionId,scope:'meta',clientId:'synthetic-links-native'});return{versionId,scope:'meta',clientId:'synthetic-links-native',leaseFence:l.fence};};
 const save=async edits=>{const input={...(await lease()),operationId:'synthetic-links-save-'+(++serial),edits};return {input,result:await f.call(f.admin,'deploy','/change',input)};};
 const row=['Unit Lead','Synthetic unit leader','','','1','','','','','','','','Grade A',true];
 await save([{operation:'setRoleMemberships',expected:[],value:[row]}]);
 assert.deepEqual(choiceLists(await stored()).Role,['Unit Lead']);
 let boot=await f.call(f.admin,'deploy','/bootstrap',{versionId});
 assert.deepEqual(boot.sysFields.Role,['Unit Lead']);assert.equal(boot.current.teachers.length,0);
 let initial=choiceLists(await stored()),value={...initial,'Appointment Status':['Acting','Confirmed'],'Employment Modifier':['BT'],'Subject Modifier':['Music'],'MK Modifier':['MK'],'EO Appt Level':['Grade A','Grade B']};
 const saved=await save([{operation:'setHRChoices',expected:initial,value}]);
 assert.deepEqual(await f.call(f.admin,'deploy','/change',saved.input),saved.result);
 boot=await f.call(f.admin,'deploy','/bootstrap',{versionId});assert.deepEqual(boot.sysFields['Appointment Status'],value['Appointment Status']);
 const stale=await f.request(f.admin,'deploy','/change',{method:'POST',body:{...(await lease()),operationId:'synthetic-links-stale',edits:[{operation:'setHRChoices',expected:initial,value}]}});assert.equal(stale.status,409);
 const forged=await f.request(f.admin,'deploy','/change',{method:'POST',body:{...saved.input,edits:[{operation:'setHRChoices',expected:initial,value:{...value,'Subject Modifier':[]}}]}});assert.equal(forged.status,409);
 for(const mutation of [{...value,Active:['Y']},{...value,'Subject Modifier':['duplicate','duplicate']},{...value,extra:[]}]){
  const denied=await f.request(f.admin,'deploy','/change',{method:'POST',body:{...(await lease()),operationId:'synthetic-links-invalid-'+(++serial),edits:[{operation:'setHRChoices',expected:value,value:mutation}]}});assert(denied.status>=400);
 }
 const empty={...value,'Subject Modifier':[]};await save([{operation:'setHRChoices',expected:value,value:empty}]);
 boot=await f.call(f.admin,'deploy','/bootstrap',{versionId});assert.deepEqual(boot.sysFields['Subject Modifier'],[]);
 const workbook=await f.call(f.admin,'deploy','/export',{versionId,scope:'HR Terms'});
 assert.deepEqual(workbook.sheets['HR Terms'].columns,['Field','Choices — one per line']);
 workbook.sheets['HR Terms'].rows.find(r=>r[0]==='Appointment Status')[1]='Temporary\nConfirmed';
 const preview=await f.call(f.admin,'deploy','/imports/preview',{operationId:'synthetic-links-preview',versionId,workbook});
 assert.deepEqual(choiceLists(await stored())['Appointment Status'],['Acting','Confirmed']);
 const imported=await f.call(f.admin,'deploy','/imports/apply',{...(await lease()),operationId:'synthetic-links-import',previewId:preview.previewId,digest:preview.digest});assert(imported);
 assert.deepEqual(choiceLists(await stored())['Appointment Status'],['Temporary','Confirmed']);
 const wrong=structuredClone(workbook);wrong.metadata['School ID']='other-school';
 const denied=await f.request(f.admin,'deploy','/imports/preview',{method:'POST',body:{operationId:'synthetic-links-foreign',versionId,workbook:wrong}});assert.equal(denied.status,403);
 const scenario=await seedScenario(f), staff=scenario.staff[0];
 const contactsBefore=(await f.request(f.admin,'contacts','/staff/'+staff)).body.data;
 await f.call(f.admin,'contacts','/staff/'+staff+'/update',{operationId:'synthetic-links-custom',changes:{memberships:['Custom group']},fieldRevisions:{memberships:contactsBefore.fields.memberships?.revision||0}});
 const {versionId:copy}=await f.call(f.admin,'deploy','/versions/create',{operationId:'synthetic-links-copy',name:'Copy choices',copyFrom:versionId,duplicate:true});
 const copyBoot=await f.call(f.admin,'deploy','/bootstrap',{versionId:copy});
 assert.deepEqual(copyBoot.sysFields['Appointment Status'],['Temporary','Confirmed']);
 const copyLease=await f.call(f.admin,'deploy','/lease',{operationId:'synthetic-links-copy-lease',versionId:copy,scope:'meta',clientId:'synthetic-links-copy'});
 await f.call(f.admin,'deploy','/change',{operationId:'synthetic-links-assign-role',versionId:copy,scope:'meta',clientId:'synthetic-links-copy',leaseFence:copyLease.fence,edits:[{operation:'upsertTeacherProfile',teacher:staff,profile:{Role:'Unit Lead','EO Appt Level':'Grade A','Appointment Status':'Legacy value'}}]});
 const copied=(await loadVersion(db,schoolId,copy)).doc;
 assert.equal(copied.teacherDrafts[staff].Role,'Unit Lead');
 assert.equal(copied.teacherDrafts[staff]['Appointment Status'],'Legacy value','out-of-list value is preserved');
 assert.deepEqual(copied.teachers.find(t=>t.id===staff).deploymentTags.Memberships,['Custom group','SMC']);
 assert.equal(copied.teachers.find(t=>t.id===staff).profile['EO Appt Level'],'Grade A');
 const teacherBook=await f.call(f.admin,'deploy','/export',{versionId:copy,scope:'Teachers'});
 const columns=teacherBook.sheets.Teachers.columns,bookRow=teacherBook.sheets.Teachers.rows.find(row=>row[columns.indexOf('Staff ID')]===staff);
 bookRow[columns.indexOf('Role')]='';bookRow[columns.indexOf('EO Appt Level')]=copied.teachers.find(t=>t.id===staff).profile['EO Appt Level'];
 const teacherPreview=await f.request(f.admin,'deploy','/imports/preview',{method:'POST',body:{operationId:'synthetic-links-teacher-preview',versionId:copy,workbook:teacherBook}});
 assert.equal(teacherPreview.status,200,JSON.stringify(teacherPreview.body));
 const contactsAfter=(await f.request(f.admin,'contacts','/staff/'+staff)).body.data;
 assert.equal(contactsAfter.fields.role?.value,contactsBefore.fields.role?.value,'draft role does not write Contacts');
 assert.equal(contactsAfter.fields.smc.revision,contactsBefore.fields.smc.revision,'internal links do not grant accepted authority');
 const reader=await f.seedAccount('synthetic-links-linked-reader',{staffId:staff,capabilities:[]});
 const unauthorized=await f.request(reader,'deploy','/change',{method:'POST',body:{operationId:'synthetic-links-reader-denied',versionId:copy,edits:[{operation:'setHRChoices',expected:choiceLists(copied),value:choiceLists(copied)}]}});assert.equal(unauthorized.status,403);
 const {versionId:other}=await f.call(f.admin,'deploy','/versions/create',{operationId:'synthetic-links-other',name:'Other synthetic choices',year:2027});
 const otherBoot=await f.call(f.admin,'deploy','/bootstrap',{versionId:other});assert.deepEqual(otherBoot.sysFields.Role,[]);assert.deepEqual(otherBoot.sysFields['Appointment Status'],['Confirmed']);
 assert.deepEqual(choiceLists(await stored()).Role,['Unit Lead']);
 console.log('PASS real Worker/D1 internal catalogue links: empty-school roles, save/reload, explicit clears, independent versions, canonical import, stale/changed-intent/fixed/foreign rejection');
} finally {await f.close();}
