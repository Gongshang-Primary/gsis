'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),read=fs.readFileSync;
const modules=[['GSIS_PATCH','backend/PlanningPatch.gs'],['GSIS_BACKEND_PLANNING','backend/Planning.gs'],['GSIS_FIELDSTORE','backend/FieldStore.gs'],['GSIS_ASC_EXPORT','shared/asc-export.js']];
const sources=modules.map(([marker,file])=>[marker,read(file,'utf8')]);
fs.readFileSync=function(file,...args){let text=read.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof text==='string')for(const [m,s] of sources){const re=new RegExp('/\\* '+m+'_BEGIN \\*/[\\s\\S]*?/\\* '+m+'_END \\*/');const block='/* '+m+'_BEGIN */\n'+s+'\n/* '+m+'_END */';text=re.test(text)?text.replace(re,()=>block):text+'\n'+block;}return text;};
let fixture;try{fixture=require('./release506-fixture.js');}finally{fs.readFileSync=read;}
const {ctx}=fixture,run=s=>vm.runInContext(s,ctx);
run(`props_().setProperty('LEASES','{}');var ascId=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'ASC fixture',requestId:Utilities.getUuid()}).versionId;
var ascDoc=()=>document_(book_(),index_(book_()).versions.find(x=>x.id===ascId));var ascSave=(changes,more={})=>call('change',{operation:'saveDraft',versionId:ascId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'asc',reliefResults:true,returnDelta:true,auditPaged:true,since:index_(book_()).versions.find(x=>x.id===ascId).revision,edits:[{operation:'patchPlanning',source:'setAscExportSettings',changes}],...more});
var config=GSISAscExport.defaults(ascDoc()),changes=GSISFields.diff({},config);var ascInitial=JSON.stringify(ascDoc().assignments);`);
assert.throws(()=>run(`dispatch_({action:'change',input:{operation:'saveDraft',versionId:ascId,requestId:Utilities.getUuid(),issuedAt:Date.now(),edits:[{operation:'patchPlanning',source:'setAscExportSettings',changes}]},identity:who},{...c,user:{roles:['Teacher']}})`),e=>e.status===403);
run('ascSave(changes)');assert.equal(run('ascDoc().ascExport.schema'),1);assert.equal(run('JSON.stringify(ascDoc().assignments)'),run('ascInitial'));
assert.deepEqual(JSON.parse(run("JSON.stringify(draftReadScope_([{operation:'patchPlanning',source:'setAscExportSettings'}]).roots)")),['id','name','notes','pendingUnitRename','fieldAuthors','ascExport']);
run(`var base=ascDoc().ascExport,left=JSON.parse(JSON.stringify(base)),right=JSON.parse(JSON.stringify(base));left.schoolName='School';right.fileLabel='Plan';var first=ascSave(GSISFields.diff(base,left));ascSave(GSISFields.diff(base,right));`);
assert.equal(run('ascDoc().ascExport.schoolName'),'School');assert.equal(run('ascDoc().ascExport.fileLabel'),'Plan');assert.equal(run('first.delta.reliefProjection.unchanged'),true,'Settings save does not recalculate quotas');
assert.throws(()=>run(`var stale=JSON.parse(JSON.stringify(base));stale.schoolName='Clobber';ascSave(GSISFields.diff(base,stale));`),e=>e.status===409,'Same changed setting conflicts');
run(`var exact=ascDoc().ascExport,next=JSON.parse(JSON.stringify(exact));next.installedVersion='Test 2026';var retryId=Utilities.getUuid(),retryChange=GSISFields.diff(exact,next);ascSave(retryChange,{requestId:retryId});var replay=ascSave(retryChange,{requestId:retryId});`);assert.equal(run('replay.duplicate'),true);
assert.throws(()=>run(`var unsafe=JSON.parse(JSON.stringify(ascDoc().ascExport));unsafe.periods[0].endtime='01:00';ascSave(GSISFields.diff(ascDoc().ascExport,unsafe));`),e=>e.status===400);
console.log('PASS ASC settings: role guard, field scope, unrelated settings merge, same-field conflict, unchanged quotas, exact retry, validation.');
