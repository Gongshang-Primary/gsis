'use strict';
const assert=require('node:assert/strict'),make=require('./dom-helper.cjs');

const teacherIds=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const groupId='33333333-3333-4333-8333-333333333333',classRef='44444444-4444-4444-8444-444444444444';
function documentFixture(){return {
 id:'v1',status:'planning',name:'Synthetic review',
 classes:[{ref:classRef,level:'1',name:'Perseverance',shortName:'P'}],
 groups:[{id:groupId,name:'Chinese group 1',subject:'CL',level:'1',levelWide:true}],
 teachers:teacherIds.map((id,i)=>({id,name:'Synthetic Teacher '+(i+1),active:true})),
 assignments:[],venues:[],loads:{'1':{EL:15,CL:12,PAL:2,CCE:2}},levelExclusions:[],audit:[]
};}
async function review(doc,edits,{submitted=false}={}){
 const app=make(),{w,run}=app;w.syntheticDocument=doc;w.syntheticEdits=edits;
 run(`state={versions:[clone(window.syntheticDocument)]};current='v1';tab='IP Deploy';render=()=>{};draftBase=clone(v());cellQueue=clone(window.syntheticEdits);queueError='Save unconfirmed';api=async()=>({current:clone(window.syntheticDocument)});`);
 if(submitted)run(`queueFlight={versionId:current,requestId:'original-synthetic-request',issuedAt:1,edits:cellQueue,wire:saveWireEdits(cellQueue),running:false};cellQueue=[];`);
 const before=run('JSON.stringify(queuedEdits())');await run('resolveQueue()');
 assert.equal(run('JSON.stringify(queuedEdits())'),before,'Opening review cannot change the saved proposal');
 return {...app,sections:[...w.document.querySelectorAll('[data-review-content] > section')]};
}
(async()=>{
 {
  const doc=documentFixture(),edits=[];
  for(const [subject,target,targetRef] of [['CL',groupId,null],['CCE','1P',classRef],['PAL','1P',classRef]])for(const teacher of teacherIds){
   doc.assignments.push({id:'synthetic-'+subject+'-'+teacher,teacher,target,subject});
   edits.push({operation:'removeTeacher',teacher,target,subject,expected:true,...(targetRef?{targetRef}:{})});
  }
  const app=await review(doc,edits,{submitted:true});try{
   assert.equal(app.sections.length,6);
   for(let i=0;i<edits.length;i++){
    const section=app.sections[i],edit=edits[i],teacher=doc.teachers.find(t=>t.id===edit.teacher).name,target=edit.target===groupId?'Chinese group 1':'1P';
    assert.equal(section.querySelector('h3').textContent,'Remove '+teacher+' from '+target+' · '+edit.subject);
    assert.equal(section.querySelector('pre').textContent,'Saved: Assigned\nDraft: Not assigned');
    assert(!section.textContent.includes(edit.teacher));assert(!section.textContent.includes(groupId));assert(!section.textContent.includes(classRef));
   }
   assert.equal(app.run('queueFlight.requestId'),'original-synthetic-request');
   assert.equal(app.run('queueKey(queueFlight.edits[0])'),'assignment:'+groupId+':CL:'+teacherIds[0],'Internal deduplication key is unchanged');
  }finally{app.w.close();}
 }
 {
  const doc=documentFixture();doc.groups[0].name='Group <b>literal</b>';doc.teachers[0].name='Teacher <img src=x onerror=alert(1)>';
  const app=await review(doc,[{operation:'addTeacher',localId:'synthetic-new',target:groupId,subject:'CL',teacher:teacherIds[0],expected:false}]);try{
   const section=app.sections[0];assert.equal(section.querySelector('h3').textContent,'Assign '+doc.teachers[0].name+' to '+doc.groups[0].name+' · CL');
   assert.equal(section.querySelector('pre').textContent,'Saved: Not assigned\nDraft: Assigned');
   assert.equal(section.querySelectorAll('img,b,script').length,0,'Reference labels remain escaped text');
  }finally{app.w.close();}
 }
 {
  const doc=documentFixture();doc.teachers=[];doc.groups=[];
  doc.assignments=[{id:'orphaned-synthetic',teacher:teacherIds[0],target:groupId,subject:'CL'}];
  const app=await review(doc,[{operation:'removeTeacher',target:groupId,subject:'CL',teacher:teacherIds[0],expected:true}]);try{
   assert.equal(app.sections[0].querySelector('h3').textContent,'Remove Unavailable teacher from Unavailable class or teaching group · CL');
   assert(!app.sections[0].textContent.includes(teacherIds[0]));assert(!app.sections[0].textContent.includes(groupId));
   assert.equal(app.sections[0].querySelector('pre').textContent,'Saved: Assigned\nDraft: Not assigned');
  }finally{app.w.close();}
 }
 {
  const doc=documentFixture(),newGroup='55555555-5555-4555-8555-555555555555';
  const edits=[{operation:'addTG',localId:newGroup,name:'New draft Chinese group',subject:'CL',level:'1',classRefs:[],levelWide:true,venue:'',expected:null},{operation:'addTeacher',localId:'synthetic-new',target:newGroup,subject:'CL',teacher:teacherIds[0],expected:false}];
  const app=await review(doc,edits);try{
   assert.equal(app.sections[1].querySelector('h3').textContent,'Assign Synthetic Teacher 1 to New draft Chinese group · CL','A preceding group creation supplies its readable draft name');
   assert.equal(app.sections[1].querySelector('pre').textContent,'Saved: Not assigned\nDraft: Assigned');
   assert.equal(app.run('queuedEdits()[1].target'),newGroup,'Display naming does not rewrite group identity');
  }finally{app.w.close();}
 }
 {
  const app=await review(documentFixture(),[{operation:'setLoad',level:'1',subject:'EL',expected:15,value:14}]);try{
   assert.equal(app.sections[0].querySelector('h3').textContent,'load:1:EL');
   assert.equal(app.sections[0].querySelector('pre').textContent,'Saved: 15\nDraft: 14','Unrelated operations retain their detailed values');
  }finally{app.w.close();}
 }
 console.log('PASS Deploy save review: six readable removals, additions, escaped labels, missing references, draft groups, retained proposal identities and unrelated details.');
})().catch(error=>{console.error(error);process.exitCode=1});
