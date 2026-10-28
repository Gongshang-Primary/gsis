'use strict';
// Reuse the real browser fixture without running its separate scenario.
const helper=require('node:fs').readFileSync(__dirname+'/deploy098g-class-drafts.cjs','utf8').split('(async()=>{')[0];
eval(helper+`(async()=>{
 const pages=[];
 try{
  const a=page();pages.push(a);await a.rename('1A','Delta|D');a.run("stageClass(null,'3','Delta','D')");
  const added=a.run("v().classes.find(c=>c.level==='3'&&c.shortName==='D').ref");await a.rename(added,'Alpha|A');
  assert.equal(a.run('v().classes.find(c=>c.ref==='+JSON.stringify(added)+').shortName'),'A','New class receives its final chosen name locally');
  await a.rename('3A','Delta|D');assert.equal(a.run('classRenameError()'),'');
  const b=page();pages.push(b);await b.rename('1A','Delta|D');b.run("queueCell({operation:'upsertClassNameSet',set:{...v().classNameSets[0],pairs:[...v().classNameSets[0].pairs,['Epsilon','E']]},expected:clone(v().classNameSets[0])})");await b.rename('2A','Epsilon|E');
  const c=page();pages.push(c);c.run("stageClass(null,'1','Delta','D');queueCell({operation:'addTeacher',target:'1D',subject:'EL',teacher:'t2A',expected:false})");const earlier=c.run("v().classes.find(c=>c.level==='1'&&c.shortName==='D').ref");await c.rename('1A','Delta|D');await c.rename(earlier,'Alpha|A');
  assert.equal(c.run('classRenameError()'),'','A newly added class can take a name freed by the existing-class rename');
  const deletion=fixture();deletion.assignments=deletion.assignments.filter(x=>x.target!=='1A');deletion.groups=deletion.groups.filter(x=>x.anchorRef!=='1A');const e=page(deletion);pages.push(e);await e.rename('1A','Delta|D');e.run("deleteClassVisible(v().classes.find(c=>c.ref==='1A'),false)");assert.equal(e.run("v().classes.some(c=>c.ref==='1A')"),false,'Existing renamed empty classes can still be deleted in the same save');
  const {createDeployDomain}=await import('../public/edge-deploy-domain.js'),{sha256Bytes}=await import('../public/edge-deploy-sha256.js');
  for(const p of pages){
   const wire=p.json('saveWireEdits(queuedEdits())'),source=p.json('draftBase'),entry={id:'v1',name:'Fixture',store:'d1',commit:'fixture',revision:3},identity={email:'one@gsps.edu.sg',subject:'fixture'},context={user:{...identity,roles:['Admin','KP']},people:source.teachers,sysFields:{},roleCatalogue:[]},state={index:{versions:[entry],active:null,published:null,publicationSchema:1,revision:3,requests:[]},drafts:Object.fromEntries(Object.entries(p.json('GSISFields.flat(draftBase)')).map(([k,v])=>['v1|'+k,v])),publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}};
   const domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){return context}});
   const result=domain.dispatch({action:'change',input:{operation:'saveDraft',versionId:'v1',issuedAt:Date.now(),clientId:'dependencies',requestId:crypto.randomUUID(),edits:wire},identity},context);
   assert.equal(result.saved,true,'Browser mixed draft saves through the real Worker domain');
   const saved=domain.readDocument(state.index.versions.find(e=>e.id==='v1'));
   assert.deepEqual(saved.classes.map(c=>[c.ref,c.level,c.name,c.shortName]),p.json('v().classes.map(c=>[c.ref,c.level,c.name,c.shortName])'));
   for(const assignment of p.json('v().assignments')){const row=assignment.pending?saved.assignments.find(x=>x.teacher===assignment.teacher&&x.target===assignment.target&&x.subject===assignment.subject):saved.assignments.find(x=>x.id===assignment.id);assert.equal(row?.target,assignment.target);}
  }
  const d=page();pages.push(d);d.w.HTMLDialogElement.prototype.showModal=function(){this.open=true};d.w.HTMLDialogElement.prototype.close=function(){this.open=false;this.onclose?.()};await d.rename('1A','Delta|D');d.w.reviewSource=d.json('draftBase');d.w.reviewSource.classes.find(c=>c.ref==='1A').name='Saved colleague name';d.w.reviewApi=()=>Promise.resolve({current:d.w.reviewSource});d.run('api=reviewApi');await d.run('resolveQueue()');
  assert.equal(d.w.document.querySelector('dialog #ok').textContent,'Use reviewed draft names','Live 409 review detects changed expected metadata without reload');
  await d.w.document.querySelector('dialog #ok').onclick();
  assert.equal(d.run('cellQueue.find(x=>x.operation===\"renameClasses\").rows.find(r=>r.ref===\"1A\").expected.name'),'Saved colleague name');
  console.log('PASS 098g mixed class dependencies: new-class rename, name-set dependency, name freed by rename, real Worker save parity and live stale-review rebase.');
 }finally{for(const p of pages)p.w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});`);
