const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {ctx}=require('./storage.cjs'),backend=s=>vm.runInContext(s,ctx),plain=x=>JSON.parse(JSON.stringify(x));
const {w,run}=require('./dom-helper.cjs')();
(async()=>{try{
 backend(`props_().setProperty('LEASES','{}');c.user.email=who.email;c.sysFields={};c.roleCatalogue=[];
  var ld=()=>document_(book_(),index_(book_()).versions.find(x=>x.id===id));var legacy=ld();
  legacy.venues=[{id:'C4-17',name:'Classroom',form:''},{id:'C4-18',name:'Classroom',form:'3P'}];
  legacy.classes=[{ref:'c3',level:'3',name:'Perseverance',shortName:'P'}];legacy.groups=[{id:'g1',name:'3CL6',subject:'CL',level:'3',venue:'C4-18'},{id:'g2',name:'3CL6 CCE',subject:'CCE',level:'3',venue:'C4-18'}];legacy.assignments=[];delete legacy.venueRegistry;delete legacy.unitGeometry;persist_(book_(),index_(book_()),legacy,null);
 `);
 for(const file of ['public/campus-map.js','shared/layout-renderer.js'])run(fs.readFileSync(file,'utf8'));
 w.drawing=fs.readFileSync('public/campus-base.svg','utf8');run("campusBase=drawing;tab='Layout';scheduleSavedNotices=()=>{}");
 const lines=id=>[...w.document.querySelector(`[data-unit="${id}"]`).querySelectorAll('text')].map(n=>n.textContent);
 const accept=async snapshot=>{w.serverSnapshot=plain(snapshot);run('acceptSnapshot(serverSnapshot)');await run('layout(el("content"))');};
 for(const action of ['bootstrap','sync'])for(const auditPaged of [true,false]){
  await accept(backend(`call('${action}',{versionId:id,auditPaged:${auditPaged},reliefResults:true})`));
  assert.deepEqual(lines('C4-17'),['MCL1','C4-17']);assert.deepEqual(lines('C4-18'),['MCL2','3P','3CL6','3CL6 CCE','C4-18']);
 }
 assert.equal(backend('ld().venues[0].shortName'),undefined,'Render does not rewrite saved venue data');
 const original=backend('JSON.stringify(ld().venues)');
 backend("var copyId=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'Legacy duplicate',requestId:Utilities.getUuid()}).versionId;var blankId=call('change',{operation:'create',sourceVersionId:id,duplicate:false,name:'Legacy blank',requestId:Utilities.getUuid()}).versionId");
 for(const version of ['copyId','blankId','id']){await accept(backend(`call('sync',{versionId:${version},auditPaged:true,reliefResults:true})`));assert.deepEqual(lines('C4-17'),['MCL1','C4-17']);assert.equal(lines('C4-18')[0],'MCL2');}
 assert.equal(backend('JSON.stringify(ld().venues)'),original);
 backend("var prevLayoutRevision=index_(book_()).versions.find(x=>x.id===id).revision;var layoutNote=call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'layout507',reliefResults:true,returnDelta:true,since:prevLayoutRevision,authority:'Admin+KP',edits:[{operation:'setTeacherNote',teacher:'t1',expected:ld().teacherNotes.t1||'',value:'Layout reload check'}]})");
 w.delta=plain(backend('layoutNote.delta'));assert.ok(!w.delta.resync);run('applyFieldDelta(delta)');await run('layout(el("content"))');assert.deepEqual(lines('C4-18'),['MCL2','3P','3CL6','3CL6 CCE','C4-18']);
 // Explicit names win. Otherwise physical geometry supplies the local default.
 backend("var override=ld();override.venues[0].shortName='Version room';override.venueRegistry={venues:[{unitNumber:'C4-18',shortName:'Registry room'}]};persist_(book_(),index_(book_()),override,null)");
 await accept(backend("call('sync',{versionId:id,auditPaged:true,reliefResults:true})"));assert.match(lines('C4-17').join(' '),/^Version room /);assert.match(lines('C4-18').join(' '),/^Registry room /);
 backend("var renamed=ld();delete renamed.venueRegistry;renamed.venues[0]={id:'NEW-17',name:'Classroom',form:''};renamed.venues[1]={id:'C4-18',name:'Classroom',form:'3P'};renamed.unitGeometry={'NEW-17':'C4-17','C4-18':'D1-07'};persist_(book_(),index_(book_()),renamed,null)");
 await accept(backend("call('sync',{versionId:id,auditPaged:true,reliefResults:true})"));assert.deepEqual(lines('NEW-17'),['MCL1','NEW-17']);assert.ok(!lines('C4-18').includes('MCL2'),'Moved code must not inherit the old physical room name');assert.ok(lines('C4-18').includes('3CL6 CCE'));
 console.log('PASS 507 Deploy layout: real bootstrap/sync into app render, ordinary/paged snapshots, missing registry, duplicate/blank/reload/switch, saved delta, explicit names, renamed geometry and all allocation labels.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
