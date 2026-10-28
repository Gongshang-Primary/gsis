const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`
function check(x,message){if(!x)throw Error(message)}
const version=call('change',{operation:'create',name:'Batch test',requestId:Utilities.getUuid()}).versionId;
const freshDoc=()=>call('sync',{versionId:version}).current;
const edits=[];for(let level=1;level<=5;level++)for(const subject of ['EL','Math','Assembly','FTT'])edits.push({operation:'setLoad',level:String(level),subject,expected:freshDoc().loads[String(level)][subject],value:7.5});
const requests=edits.map((edit,i)=>({operation:'batchCells',versionId:version,clientId:'browser-'+i,requestId:Utilities.getUuid(),edits:[edit]}));
requests.forEach((p,i)=>call('change',p,{email:'editor'+i+'@gsps.edu.sg',subject:'editor'+i}));
check(edits.every(e=>freshDoc().loads[e.level][e.subject]===7.5),'20 stale-baseline independent cells must survive');
const rev=index_(book_()).revision;call('change',requests[0],{email:'editor0@gsps.edu.sg',subject:'editor0'});check(index_(book_()).revision===rev,'Retry must not append a second commit');
let conflict=false;try{call('change',{...requests[0],requestId:Utilities.getUuid(),edits:[{...edits[0],value:8}]})}catch(e){conflict=e.status===409}check(conflict,'Same-cell stale baseline rejected');
const before=freshDoc().loads['6'].EL;let atomic=false;try{call('change',{operation:'batchCells',versionId:version,clientId:'test',requestId:Utilities.getUuid(),edits:[{operation:'setLoad',level:'6',subject:'EL',expected:before,value:9}, {...edits[0],expected:-1,value:10}]})}catch(e){atomic=e.status===409}check(atomic&&freshDoc().loads['6'].EL===before,'Conflicting batch must write nothing');
const add={operation:'addTeacher',subject:'FT',target:'1P',teacher:'t1',expected:[]};call('change',{operation:'batchCells',versionId:version,requestId:Utilities.getUuid(),clientId:'f1',edits:[add]});
let double=false;try{call('change',{operation:'batchCells',versionId:version,requestId:Utilities.getUuid(),clientId:'f2',edits:[{...add,target:'1T'}]})}catch(e){double=e.status===409}check(double,'FT uniqueness across cells');
console.log('PASS 20 simulated editors on independent cells, duplicate receipts, same-cell conflict, all-or-none batch, global FT uniqueness');
`,ctx);
