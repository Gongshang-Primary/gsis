const {ctx,book}=require('./storage.cjs'),vm=require('vm');
const source=book.insertSheet('Venues');source.getDataRange=()=>({getValues:()=>source.data.map(r=>[...r]),getFormulas:()=>source.data.map(r=>r.map(()=>''))});
ctx.source=source;
vm.runInContext(`
{
function check(x,m){if(!x)throw Error(m)}
const baseline=call('sync',{versionId:id}).current;
source.data=[['Unit number','Venue name','Short name','Block','Level','Capacity','Capacity basis','Notes'],...landmarkRegistry_(baseline).venues.map(v=>[v.unitNumber,v.name,'',v.block,v.level,'','PRIVATE BASIS','PRIVATE VENUE NOTE'])];
props_().setProperty('LANDMARK_SHEET_ID','register');baseline.venueRegistry=readLandmarkRegistry_();baseline.teacherNotes={t1:'PRIVATE PLANNER NOTE'};baseline.groups.push({id:'tgtest',name:'P1 LSP test',subject:'LSP',level:'1',form:'P1',venue:'F1-16',sources:[]});const publishIndex=index_(book_());publishIndex.publishNext=baseline.id;persist_(book_(),publishIndex,baseline,null);
const publicDoc=publicCampus_();check(publicDoc.venues.some(v=>v.unitNumber==='F1-16'&&v.allocations.some(a=>a.targetId==='tgtest')&&v.allocations.some(a=>a.targetId==='1P')),'Public homeroom and TG');
const serialized=JSON.stringify(publicDoc);for(const word of ['PRIVATE','teachers','teacherNotes','workloads','audit','assignments','capacityBasis','planning'])check(!serialized.includes(word),'Public leak: '+word);
let denied=false;try{renameCampusUnit_({input:{},identity:who},{user:{roles:[]}})}catch(e){denied=e.status===403}check(denied,'Unauthorised unit change');let retired=false;try{renameCampusUnit_({input:{},identity:who},c)}catch(e){retired=e.status===410}check(retired,'Legacy auto-publish unit rename must be retired');
const old=JSON.stringify(publicCampus_());const lease=call('lease',{versionId:id,key:'meta',clientId:'draft'});call('change',{...lease,versionId:id,key:'meta',clientId:'draft',requestId:Utilities.getUuid(),operation:'moveClass',form:'1P',venue:'F1-15'});check(JSON.stringify(publicCampus_())===old,'Draft venue edit leaked');
console.log('PASS public whitelist, active-only projection, retired automatic unit edits and published snapshot isolation');
}
`,ctx);
