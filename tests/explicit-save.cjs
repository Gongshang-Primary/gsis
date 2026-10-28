const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`{
function check(x,m){if(!x)throw Error(m)}
const vid=call('change',{operation:'create',name:'Explicit saves',requestId:Utilities.getUuid()}).versionId;
const doc=()=>call('sync',{versionId:vid}).current;
const save=(edits,email='one@gsps.edu.sg',extra={})=>call('change',{operation:'saveDraft',versionId:vid,clientId:email,requestId:Utilities.getUuid(),issuedAt:Date.now(),edits,...extra},{email,subject:email});
const base=doc().loads['1'].EL;
const first=save([{operation:'setLoad',level:'1',subject:'EL',expected:base,value:9}]);
const requestId=Utilities.getUuid(),edits=[{operation:'setLoad',level:'1',subject:'EL',expected:base,value:10}];
const second=save(edits,'two@gsps.edu.sg',{requestId});
check(doc().loads['1'].EL===10,'Latest server save wins');
check(second.conflicts.length===1&&second.conflicts[0].overwrittenBy==='one@gsps.edu.sg'&&second.conflicts[0].overwrittenValue===9&&second.conflicts[0].replacementValue===10,'Full overwritten user and values receipt');
const revision=index_(book_()).revision;
check(save(edits,'two@gsps.edu.sg',{requestId}).duplicate,'Retry returns receipt');check(index_(book_()).revision===revision,'Retry has no extra commit');
let mismatch=false;try{save([{...edits[0],value:11}],'two@gsps.edu.sg',{requestId})}catch(e){mismatch=e.status===409}check(mismatch,'Request ID cannot change payload');
save([{operation:'setLoad',level:'1',subject:'Math',expected:doc().loads['1'].Math,value:8}]);check(doc().loads['1'].EL===10,'Unrelated field preserved');
save([{operation:'addTeacher',target:'1P',subject:'EL',teacher:'t1',expected:false}]);save([{operation:'addTeacher',target:'1P',subject:'EL',teacher:'t2',expected:false}],'two@gsps.edu.sg');check(doc().assignments.filter(a=>a.target==='1P'&&a.subject==='EL').length===2,'Independent teacher additions merge');
save([{operation:'addTeacher',target:'1P',subject:'FT',teacher:'t1',expected:false}]);let unique=false;try{save([{operation:'addTeacher',target:'1T',subject:'FT',teacher:'t1',expected:false}])}catch(e){unique=e.status===409}check(unique,'Global FT uniqueness retained');
const before=doc().loads['2'].EL;let atomic=false;try{save([{operation:'setLoad',level:'2',subject:'EL',value:7,expected:before},{operation:'setLoad',level:'2',subject:'Math',value:999,expected:8}])}catch(e){atomic=e.status===400}check(atomic&&doc().loads['2'].EL===before,'Validation failure leaves all fields unchanged');
const cl=doc().classes.find(c=>c.level==='1'&&c.shortName==='T');save([{operation:'updateClass',ref:cl.ref,level:'1',name:'Gratitude',shortName:'Gt',expected:{level:'1',name:cl.name,shortName:'T'}}]);check(doc().classes.some(c=>c.ref===cl.ref&&c.shortName==='Gt'),'Class edit retains version-local identity');check(doc().venues.some(v=>v.form==='1Gt'),'Class rename updates linked venue');
console.log('PASS explicit saves: last-commit-wins receipts, idempotent retry, unrelated fields, independent teacher additions, FT invariant, atomic validation, class references');
}`,ctx);
