'use strict';
// Regression: the old single-row rename rejected names occupied by another class.
// The browser must stage both collisions, then save one complete atomic rename.
const helper=require('node:fs').readFileSync(__dirname+'/deploy098g-class-drafts.cjs','utf8').split('(async()=>{')[0]
 .replace("fs.readFileSync('public/app.js','utf8')","fs.readFileSync(process.env.DEPLOY_CLASS_RENAME_APP||'public/app.js','utf8')");
eval(helper+`(async()=>{
 const source=fixture();source.classNameSets.push({id:'cross',name:'Alternative names',pairs:[['Beta','G'],['Delta','D']]});
 const p=page(source);
 try{
  const before=p.json('v()');
  for(const n of [1,2,3,4,5,6])await p.rename(n+'A','Beta|G');
  assert.equal(p.run('v().classes.filter(c=>c.undefinedDraft).length'),12,'Full-name and short-name collisions displace both stable rows at every level');
  p.run("api=()=>{throw Error('An unfinished class rename must not be sent')}");
  await p.run('pumpQueue(true)');assert.match(p.alerts.at(-1),/undefined|complete.*class/i);
  assert.equal(p.run('queueFlight'),null,'Incomplete class rows stay in the local draft');
  for(const n of [1,2,3,4,5,6]){await p.rename(n+'B','Alpha|A');await p.rename(n+'G','Delta|D');}
  assert.equal(p.run('classRenameError()'),'');
  const wire=p.json('saveWireEdits(queuedEdits())');
  assert.equal(wire.length,1);assert.equal(wire[0].operation,'renameClasses');assert.equal(wire[0].rows.length,18);
  assert.ok(wire[0].rows.every(row=>!row.undefinedDraft&&!row.shortName.startsWith('__undefined_')));
  const expected=p.json('v()'),check=saved=>{
   assert.deepEqual(saved.classes.map(c=>[c.ref,c.level,c.name,c.shortName]),expected.classes.map(c=>[c.ref,c.level,c.name,c.shortName]));
   for(const old of before.assignments){const row=saved.assignments.find(a=>a.id===old.id),ref=before.classes.find(c=>c.level+c.shortName===old.target).ref,next=expected.classes.find(c=>c.ref===ref);assert.equal(row.target,next.level+next.shortName);assert.equal(row.teacher,old.teacher);}
   for(const old of before.venues){const ref=before.classes.find(c=>c.level+c.shortName===old.form).ref,next=expected.classes.find(c=>c.ref===ref);assert.equal(saved.venues.find(v=>v.id===old.id).form,next.level+next.shortName);}
   for(const old of before.groups){const next=expected.classes.find(c=>c.ref===old.classRefs[0]),row=saved.groups.find(g=>g.id===old.id);assert.deepEqual(row.classRefs,old.classRefs);assert.equal(row.sources[0],next.level+next.shortName);}
  };
  const {ctx}=require('./release506-fixture.js');ctx.renameSource098l=structuredClone(before);ctx.renameWire098l=wire[0];
  vm.runInContext('renameClasses_(renameSource098l,renameWire098l)',ctx);check(JSON.parse(JSON.stringify(ctx.renameSource098l)));
  const {createDeployDomain}=await import('../public/edge-deploy-domain.js'),{sha256Bytes}=await import('../public/edge-deploy-sha256.js'),entry={id:'v1',name:'Fixture',store:'d1',commit:'fixture',revision:3},identity={email:'one@gsps.edu.sg',subject:'fixture'},context={user:{...identity,roles:['Admin','KP']},people:before.teachers,sysFields:{},roleCatalogue:[]},state={index:{versions:[entry],active:null,published:null,publicationSchema:1,revision:3,requests:[]},drafts:Object.fromEntries(Object.entries(p.json('GSISFields.flat(draftBase)')).map(([k,v])=>['v1|'+k,v])),publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}};
  const domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){return context}}),input={operation:'saveDraft',versionId:'v1',issuedAt:Date.now(),clientId:'098l-class-rename',requestId:crypto.randomUUID(),edits:wire},send=()=>domain.dispatch({action:'change',input,identity},context);
  assert.equal(send().saved,true);check(domain.readDocument(state.index.versions.find(e=>e.id==='v1')));assert.equal(send().duplicate,true,'Retry uses the same durable receipt');
  const stable=JSON.stringify(domain.readDocument(state.index.versions.find(e=>e.id==='v1')));
  assert.throws(()=>domain.dispatch({action:'change',input:{...input,requestId:crypto.randomUUID()},identity},context),e=>e.status===409,'A stale rename cannot overwrite saved class metadata');
  assert.equal(JSON.stringify(domain.readDocument(state.index.versions.find(e=>e.id==='v1'))),stable);
  console.log('PASS 098l Deploy rename regression: full-name plus short-name collisions P1 to P6, local incomplete-save guard, 18-row atomic final save, canonical backend/Worker parity, teacher/venue/TG identity, receipt retry and stale rejection.');
 }finally{p.w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});`);
