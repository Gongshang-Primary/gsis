const fs=require('fs'),vm=require('vm');
const fixture=fs.readFileSync(__dirname+'/storage.cjs','utf8');
const checks=`
const cell=(teacher,level,checked,expected,extra={})=>call('change',{operation:'setExclusionCell',versionId:id,teacher,level,checked,expected,requestId:Utilities.getUuid(),...extra});
const one=cell('t1','1',true,false);if(!one.saved||!call('sync',{versionId:id,full:true}).current.levelExclusions.some(r=>r.teacher==='t1'&&r.levels.includes('1')))throw Error('Cell not saved');
cell('t1','2',true,false);cell('t2','1',true,false);
let doc=call('sync',{versionId:id}).current;if(doc.levelExclusions.length!==2||doc.levelExclusions.find(r=>r.teacher==='t1').levels.length!==2)throw Error('Other cells overwritten');
cell('t1','1',false,true);doc=call('sync',{versionId:id}).current;if(doc.levelExclusions.find(r=>r.teacher==='t1').levels.join()!=='2')throw Error('Uncheck removed other levels');
const count=doc.audit.length;const duplicate={operation:'setExclusionCell',versionId:id,teacher:'t2',level:'2',checked:true,expected:false,requestId:Utilities.getUuid()};call('change',duplicate);if(!call('change',duplicate).duplicate)throw Error('Duplicate not detected');if(call('sync',{versionId:id}).current.audit.length!==count+1)throw Error('Duplicate audit write');
let conflict=false;try{cell('t1','2',false,false)}catch(e){conflict=e.status===409}if(!conflict)throw Error('Stale checkbox overwrote concurrent change');
for(const input of [{level:'99'},{checked:'yes'},{requestId:'bad'}]){let invalid=false;try{cell('t1','3',true,false,input)}catch(e){invalid=e.status===400}if(!invalid)throw Error('Malformed cell accepted')}
const teacherOnly={...c,user:{roles:[]}};let denied=false;try{dispatch_({action:'change',input:{...duplicate,requestId:Utilities.getUuid()},identity:who},teacherOnly)}catch(e){denied=e.status===403}if(!denied)throw Error('Ordinary teacher changed rule');
const beforeAssignments=JSON.stringify(call('sync',{versionId:id}).current.assignments);cell('t1','3',true,false);if(JSON.stringify(call('sync',{versionId:id}).current.assignments)!==beforeAssignments)throw Error('Advisory checkbox changed assignments');
const after=call('sync',{versionId:id}).current;if(!after.audit.some(a=>a.action==='setExclusionCell'&&a.after.teacher==='t1'&&a.after.level==='3'))throw Error('Scoped audit missing');
const planRules=call('sync',{versionId:planningId}).current.levelExclusions;if(planRules.length!==1||planRules[0].levels.join()!=='1')throw Error('Other version changed');
console.log('PASS checkbox atomic saves without lease, concurrent levels/teachers preserved, uncheck, stale conflict, idempotency, validation, role guard, audit, advisory-only behavior, version isolation');
`;
vm.runInNewContext(fixture.replace('`,ctx);','`,ctx);\nvm.runInContext('+JSON.stringify(checks)+',ctx);'),{require,__dirname,console},{filename:__filename});
