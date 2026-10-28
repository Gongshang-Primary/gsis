const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`{
function check(x,m){if(!x)throw Error(m)}
const other=call('change',{operation:'create',name:'Different venue',requestId:Utilities.getUuid()}).versionId;
const lease=call('lease',{versionId:other,key:'meta',clientId:'version-test'});
call('change',{...lease,versionId:other,key:'meta',clientId:'version-test',operation:'moveClass',form:'1P',venue:'',requestId:Utilities.getUuid()});
const plan=call('landmarkSearch',{query:'1P',versionId:other,activeOnly:false}),active=call('landmarkSearch',{query:'1P'});
check(plan.deploymentVersionId===other&&plan.results.find(r=>r.targetId==='1P').unitNumbers.length===0,'Private search uses selected planning version');check(active.deploymentVersionId===id&&active.results.find(r=>r.targetId==='1P').unitNumbers.length===1,'Default search stays active');
check(call('landmarkSearch',{query:'F1-16',versionId:other}).results.some(r=>r.kind==='unit'),'Unit search included');
const lookup=call('landmarkUnit',{versionId:other,unitNumber:'F1-16',activeOnly:false});check(!lookup.allocations.some(a=>a.label==='1P'),'Unit lookup uses same selected version');
let denied=false;try{dispatch_({action:'landmarkSearch',input:{versionId:other,query:'1P'},identity:who},{user:{roles:[]}})}catch(e){denied=e.status===403}check(denied,'Planning search denied to ordinary user');
check(publicCampus_().deploymentVersionId===id,'Public projection stays active only');
console.log('PASS selected-version class/unit search, allocation consistency, planning privacy and active-only public campus');
}`,ctx);
