const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`{
 function check(x,m){if(!x)throw Error(m)}
 const vid=call('change',{operation:'create',name:'Name sets',requestId:Utilities.getUuid()}).versionId;
 const doc=()=>call('sync',{versionId:vid}).current;
 const save=(edits,email='one@gsps.edu.sg',extra={})=>call('change',{operation:'saveDraft',versionId:vid,clientId:email,requestId:Utilities.getUuid(),issuedAt:Date.now(),edits,...extra},{email,subject:email});
 const defaults=doc().classNameSets;
 check(defaults[0].id==='new','New set first');
 check(JSON.stringify(defaults[0].pairs)==='[["Graciousness","Gc"],["Gratitude","Gt"],["Prudence","P"],["Respect","Rp"],["Resilience","Rs"],["Integrity","I"],["Diligence","D"],["Empathy","E"],["Kindness","K"]]','Exact nine new mappings');
 const custom={id:'future',name:'Future',pairs:[['Unity','U']]},ref=Utilities.getUuid();
 save([{operation:'upsertClassNameSet',set:custom,expected:null},{operation:'addClass',ref,level:'1',name:'Unity',shortName:'U',expected:null}]);
 check(doc().classes.find(c=>c.ref===ref).shortName==='U','Custom set and class save atomically');
 const copied=call('change',{operation:'create',name:'Isolated sets',requestId:Utilities.getUuid()}).versionId;
 // The active version is the source for new planning versions. Check defaults and independent saves.
 check(call('sync',{versionId:copied}).current.classNameSets[0].id==='new','New version has default catalog');
 const revision=index_(book_()).revision;
 let rejected=false;try{save([{operation:'upsertClassNameSet',set:{...custom,pairs:[['Union','U'],['Unity','u']]},expected:custom}])}catch(e){rejected=e.status===400}check(rejected&&index_(book_()).revision===revision,'Duplicate codes rejected without commit');
 rejected=false;try{save([{operation:'upsertClassNameSet',set:{...custom,pairs:[['1-Unity','U']]},expected:custom}])}catch(e){rejected=e.status===400}check(rejected,'Level prefix rejected');
 const first={...custom,pairs:[['Unity','Un']]};save([{operation:'upsertClassNameSet',set:first,expected:custom}]);
 check(doc().classes.find(c=>c.ref===ref).shortName==='U','Catalog edit does not silently rename existing class');
 save([{operation:'upsertClassNameSet',set:{id:'separate',name:'Separate',pairs:[['Wisdom','W']]},expected:null}]);
 const second={...custom,pairs:[['Unity','Ut']]};const result=save([{operation:'upsertClassNameSet',set:second,expected:custom}],'two@gsps.edu.sg');
 check(result.conflicts.length===1&&result.conflicts[0].overwrittenBy==='one@gsps.edu.sg'&&result.conflicts[0].where.includes('Future'),'Stale set overwrite records user and set');
 check(doc().classNameSets.find(s=>s.id==='separate'),'Concurrent unrelated set retained');
 check(result.conflicts[0].overwrittenValue.pairs[0][1]==='Un'&&result.conflicts[0].replacementValue.pairs[0][1]==='Ut','Conflict reports values');
 const existing=doc().classes.find(c=>c.ref===ref);save([{operation:'updateClass',ref,level:'2',name:'Unity',shortName:'U',expected:{level:'1',name:'Unity',shortName:'U'}}]);check(doc().classes.find(c=>c.ref===ref).level==='2','Retired pair can retain its name on level change');
 save([{operation:'deleteClassNameSet',setId:'future',expected:second}]);check(!doc().classNameSets.some(s=>s.id==='future')&&doc().classes.some(c=>c.ref===ref),'Removing set preserves existing class');
 const ordinary={user:{roles:['Teacher']}};rejected=false;try{apply_(model_(JSON.parse(JSON.stringify(doc()))),{operation:'upsertClassNameSet',key:'meta',set:custom},ordinary,{active:vid})}catch(e){rejected=e.status===403}check(rejected,'Teacher cannot change sets');
 const isolated=JSON.parse(JSON.stringify(doc()));isolated.classNameSets=[defaults[0]];rejected=false;try{apply_(isolated,{operation:'deleteClassNameSet',key:'meta',setId:'new'},c,{active:vid})}catch(e){rejected=e.status===400}check(rejected,'Last set retained');
 check(!call('sync',{versionId:copied}).current.classNameSets.some(s=>s.id==='future'||s.id==='separate'),'Version isolation');
 console.log('PASS version-scoped custom name sets, exact defaults, atomic custom selection, validation, preserved classes, conflict authors/values, isolation and role guards');
}`,ctx);
