const {ctx}=require('./storage.cjs'),vm=require('vm');vm.runInContext(`
function check(x,m){if(!x)throw Error(m)}
const found=call('landmarkSearch',{query:'1P'});check(found.deploymentVersionId===id,'Search active only');check(found.results.find(r=>r.targetId==='1P').unitNumbers[0]==='F1-16','Class to venue');
const unit=call('landmarkUnit',{versionId:id,unitNumber:'F1-16',activeOnly:true});check(unit.schemaVersion===2&&unit.allocations.some(a=>a.label==='1P'),'Unit live allocations');check(unit.venue.capacity===null,'Unknown capacity is null');
const pump=call('landmarkUnit',{versionId:id,unitNumber:'D1-06C'});check(pump.venue.name==='Pump Room','Pump Room correction');
let privatePlan=false;try{dispatch_({action:'landmarkUnit',input:{versionId:planningId,unitNumber:'F1-16'},identity:who},{user:{roles:[]}})}catch(e){privatePlan=e.status===403}check(privatePlan,'Planning access');
let changed=false;try{call('landmarkUnit',{versionId:planningId,activeOnly:true,unitNumber:'F1-16'})}catch(e){changed=e.status===409}check(changed,'Active change mismatch rejected');
const d=freshLandmark=call('sync',{versionId:id}).current;d.groups.push({id:'bad',name:'Ambiguous',venue:'D1-06B'});let amb=false;try{landmarkAllocations_(d,'D1-06C')}catch(e){amb=e.status===409}check(amb,'Ambiguous legacy allocation not guessed');
console.log('PASS Landmark active class search, per-unit schema, planning privacy, active-version race, capacities, Pump/EAS ambiguity');
`,ctx);
