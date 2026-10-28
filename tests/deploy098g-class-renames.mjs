import assert from 'node:assert/strict';
import {createDeployDomain} from '../public/edge-deploy-domain.js';
import {sha256Bytes} from '../public/edge-deploy-sha256.js';
const identity={email:'admin@gsps.edu.sg',subject:'class-rename-test'},context={user:{email:identity.email,roles:['Admin','KP']},people:[{id:'ta',name:'Teacher A',active:true},{id:'tb',name:'Teacher B',active:true},{id:'tc',name:'Teacher C',active:true}],sysFields:{},roleCatalogue:[]};
const state={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}};
const domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){throw Error('Unexpected integration');}}),send=(action,input)=>domain.dispatch({action,input,identity},structuredClone(context));
const created=send('change',{operation:'create',name:'Rename batch fixture',requestId:crypto.randomUUID()}),versionId=created.versionId;
const doc=()=>domain.readDocument(state.index.versions.find(c=>c.id===versionId)),save=(edits,requestId=crypto.randomUUID())=>send('change',{operation:'saveDraft',versionId,issuedAt:Date.now(),clientId:'class-renames',requestId,edits});
const meta=c=>({level:c.level,name:c.name,shortName:c.shortName});
const initial=doc(),classes=initial.classes.filter(c=>c.level==='3').slice(0,3);assert.equal(classes.length,3);
save(classes.map((c,i)=>({operation:'addTeacher',targetRef:c.ref,target:c.level+c.shortName,subject:'EL',teacher:['ta','tb','tc'][i],expected:false})));
const before=doc(),rows=classes.map((c,i)=>({ref:c.ref,level:c.level,name:before.classNameSets.flatMap(s=>s.pairs).find(p=>p[1]===classes[(i+1)%3].shortName)[0],shortName:classes[(i+1)%3].shortName,expected:meta(c)})),edit={operation:'renameClasses',rows,expected:classes.map(c=>({ref:c.ref,...meta(c)}))};
const requestId=crypto.randomUUID(),result=save([edit],requestId);assert.equal(result.saved,true);
const after=doc();
for(let i=0;i<3;i++){
 const c=after.classes.find(c=>c.ref===classes[i].ref),target=classes[(i+1)%3].level+classes[(i+1)%3].shortName;
 assert.equal(c.level+c.shortName,target);assert.equal(after.assignments.find(a=>a.teacher===['ta','tb','tc'][i]).target,target,'Atomic cycle follows stable class row');
 for(const venue of before.venues.filter(v=>v.form===classes[i].level+classes[i].shortName))assert.equal(after.venues.find(v=>v.id===venue.id).form,target);
}
assert.equal(save([edit],requestId).duplicate,true,'Same request returns its receipt');
const unchanged=JSON.stringify(doc());assert.throws(()=>save([edit]),e=>e.status===409,'Changed class metadata cannot be overwritten from a stale draft');assert.equal(JSON.stringify(doc()),unchanged);
const current=doc(),r=current.classes.find(c=>c.ref===classes[0].ref);
assert.throws(()=>save([{operation:'renameClasses',rows:[{ref:r.ref,level:r.level,name:'(undefined)',shortName:'__undefined_'+r.ref,undefinedDraft:true,expected:meta(r)}]}]),e=>e.status===400,'Undefined rows cannot be stored through the API');
assert.throws(()=>save([{operation:'renameClasses',rows:[{ref:r.ref,level:'6',name:r.name,shortName:r.shortName,expected:meta(r)}]}]),e=>e.status===400,'Rename cannot silently move class level');
assert.throws(()=>save([{operation:'renameClasses',rows:null}]),e=>e.status===400,'Malformed boundary input is rejected');
assert.equal(JSON.stringify(doc()),unchanged);
console.log('PASS 098g atomic class renames: three-class cycle, teachers and room links by stable ref, receipt idempotency, stale and undefined rejection, level guard and no partial writes.');
