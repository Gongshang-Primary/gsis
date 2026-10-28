'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function fixture(){
 const classes=[],teachers=[],assignments=[],venues=[],groups=[],loads={};
 for(let n=1;n<=6;n++){loads[n]={EL:15,FT:2};for(const [name,shortName] of [['Alpha','A'],['Beta','B'],['Gamma','G']]){const ref=n+shortName;classes.push({ref,level:String(n),name,shortName,ability:shortName==='A'?'HA':''});teachers.push({id:'t'+ref,name:'Teacher '+ref,active:true});assignments.push({id:'as'+ref,teacher:'t'+ref,target:ref,subject:'EL',level:String(n),venue:'v'+ref});venues.push({id:'v'+ref,form:ref});groups.push({id:'g'+ref,name:'TG '+ref,subject:'EL',level:String(n),form:ref,sources:[ref],classRefs:[ref],anchorRef:ref});}}
 return {id:'v1',status:'planning',name:'Draft fixture',cceELScope:true,classNameSets:[{id:'new',name:'Names',pairs:[['Alpha','A'],['Beta','B'],['Gamma','G'],['Delta','D']]}],classes,teachers,assignments,venues,groups,loads,levelExclusions:[],teacherNotes:{},audit:[]};
}
function page(doc=fixture(),stored){
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://deploy.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),alerts=[];
 w.alert=s=>alerts.push(s);w.confirm=()=>true;w.fetch=()=>{throw Error('Unexpected network call')};w.scrollTo=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:s=>({width:s.length*7})});
 run(fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,''));w.base098g=doc;run("state={versions:[base098g]};current='v1';role='Admin+KP';token='fixture';lastEmail='one@gsps.edu.sg';tab='IP Deploy';level='3';connectLive=()=>{};snapshotCache={id:'v1',revision:3};render();");
 if(stored)for(const [k,v]of stored)w.localStorage.setItem(k,v);
 const json=s=>JSON.parse(JSON.stringify(run(s)));
 async function rename(ref,value){run('renameClass('+JSON.stringify(ref)+')');const d=w.document.querySelector('.inline-editor');assert.ok(d);d.querySelector('#renameClassName').value=value;await d.querySelector('form').onsubmit({preventDefault(){}});assert.equal(d.querySelector('#formerror')?.textContent||'','');}
 return {dom,w,run,json,alerts,rename,stored:()=>Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)]})};
}
(async()=>{
 const a=page();let b,c,d,e;
 try{
  await a.rename('3A','Beta|B');
  assert.equal(a.run("classLabel(v().classes.find(c=>c.ref==='3B'))"),'3(undefined)','Occupied name becomes an undefined row');
  assert.equal(a.run("v().assignments.find(x=>x.teacher==='t3A').target"),'3B');
  const displaced=a.run("classKey(v().classes.find(c=>c.ref==='3B'))");
  assert.notEqual(displaced,'3B');assert.equal(a.run("v().assignments.find(x=>x.teacher==='t3B').target"),displaced);
  await a.rename('3G','Beta|B');
  assert.equal(a.run("v().classes.filter(c=>c.level==='3'&&c.undefinedDraft).length"),2,'Several undefined rows coexist');
  assert.equal(new Set(a.json("v().classes.filter(c=>c.level==='3').map(c=>classKey(c))")).size,3,'Display placeholder is never identity');
  for(const n of [1,2,4,5,6])await a.rename(n+'A','Beta|B');
  assert.equal(a.run('v().classes.filter(c=>c.undefinedDraft).length'),7,'Undefined is supported at every primary level');
  for(const row of a.json('v().classes')){
   const target=a.run('classKey(v().classes.find(c=>c.ref==='+JSON.stringify(row.ref)+'))');
   assert.equal(a.json('v().assignments').find(x=>x.teacher==='t'+row.ref).target,target);
   assert.equal(a.json('v().venues').find(x=>x.id==='v'+row.ref).form,target);
   assert.equal(a.json('v().groups').find(x=>x.id==='g'+row.ref).sources[0],target);
  }
  a.run("api=()=>{throw Error('Save must be blocked')}");await a.run('pumpQueue(true)');
  assert.match(a.alerts.at(-1),/undefined|complete.*class/i);assert.equal(a.run('queueFlight'),null);
  await a.run("action('publish')");assert.match(a.alerts.at(-1),/draft|current/i);assert.equal(await a.run("loadVersionRow('other-version')"),false,'Version switching cannot bypass an unresolved draft');
  const stored=a.stored();assert.ok(stored.some(([k])=>k.startsWith('deploy.class-draft.')),'Applied rename draft is durable');
  b=page(fixture(),stored);b.run('restoreClassDraft()');
  assert.equal(b.run('v().classes.filter(c=>c.undefinedDraft).length'),7,'Reload recovers every distinct placeholder');
  assert.equal(b.run("v().assignments.find(x=>x.teacher==='t3B').target"),displaced);
  b.run("lastEmail='another@gsps.edu.sg';cellQueue=[];draftBase=null;state.versions=[base098g];restoreClassDraft()");
  assert.equal(b.run('cellQueue.length'),0,'Another actor cannot recover this draft');
  c=page(fixture(),stored);c.run("v().assignments.push({id:'later',teacher:'later-teacher',target:'3A',subject:'EL',level:'3',venue:'v3A'});restoreClassDraft()");
  assert.equal(c.run("v().assignments.find(x=>x.id==='later').target"),c.run("classKey(v().classes.find(x=>x.ref==='3A'))"),'Recovery merges the latest saved assignments by class identity');
  d=page(fixture(),stored);d.run("v().classes.find(c=>c.ref==='3A').name='Changed by colleague';restoreClassDraft()");
  assert.equal(d.run('classDraftRecoveryConflict'),true);assert.match(d.run('classRenameError()'),/undefined|Review/);assert.equal(d.run("draftBase.classes.find(c=>c.ref==='3A').name"),'Changed by colleague','Recovery retains current saved source for review');
  for(const n of [1,2,4,5,6])await a.rename(n+'B','Alpha|A');
  await a.rename('3A','Gamma|G');await a.rename('3B','Alpha|A');
  assert.equal(a.run('v().classes.filter(c=>c.undefinedDraft).length'),0);
  const wire=a.json('saveWireEdits(queuedEdits())');assert.equal(wire.length,1);assert.equal(wire[0].operation,'renameClasses');
  assert.equal(wire[0].rows.length,13);assert.ok(wire[0].rows.every(r=>!r.undefinedDraft&&!r.shortName.includes('undefined')));
  assert.equal(a.run("v().assignments.find(x=>x.teacher==='t3B').target"),'3A');assert.equal(a.run("v().assignments.find(x=>x.teacher==='t3A').target"),'3G');
  a.run("queueFlight={versionId:current,requestId:'11111111-1111-4111-8111-111111111111',issuedAt:Date.now(),edits:cellQueue.splice(0),baselineRevision:3};queueFlight.wire=saveWireEdits(queueFlight.edits);persistClassDraft()");
  e=page(fixture(),a.stored());e.run('restoreClassDraft()');assert.equal(e.run('queueFlight.requestId'),'11111111-1111-4111-8111-111111111111','An unconfirmed submitted draft recovers the original request identity');assert.equal(e.run('cellQueue.length'),0);assert.equal(e.w.document.querySelector('#content').inert,true);
  a.run('cellQueue=queueFlight.edits;queueFlight=null');
  a.run('discardDrafts()');assert.equal(a.run("v().classes.find(c=>c.ref==='3B').shortName"),'B');assert.ok(!a.stored().some(([k])=>k.startsWith('deploy.class-draft.')),'Discard clears the recovered draft');
  console.log('PASS 098g class drafts: occupied rename, multiple placeholders P1 to P6, stable linked allocations, save guard, account-scoped recovery, latest-assignment merge, completed atomic swap wire and discard.');
 }finally{a.w.close();b?.w.close();c?.w.close();d?.w.close();e?.w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
