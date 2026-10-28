const assert=require('node:assert/strict'),f=require('./deploy508-fixture.js')(),{run,ctx,stats}=f,plain=x=>JSON.parse(JSON.stringify(x));
run(`var en509=()=>index_(book_()).versions.find(x=>x.id===id),doc509=()=>document_(book_(),en509());
 var read509=exclusionFieldRead_,narrow509=0;exclusionFieldRead_=(...a)=>{const d=read509(...a);if(d){if(!fieldReadState_.get(d).partial)throw Error('Missing selective baseline');narrow509++;}return d;};
 var calc509=reliefAnalysis_,calcCount509=0;reliefAnalysis_=(...a)=>{calcCount509++;return calc509(...a);};
 var make509=edits=>({operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'509',edits,returnDelta:true,reliefResults:true,since:en509().revision,authority:c.user.roles.join('+'),auditPaged:true});
 var ex509=(teacher,level,checked,expected=!checked)=>({operation:'setExclusionCell',teacher,level,checked,expected});
 c.roleCatalogue=[{role:'Teacher',level:'',groups:[]}];var setup509=doc509();setup509.teachers=Array.from({length:159},(_,i)=>({id:'t'+(i+1),name:'Teacher '+(i+1),active:true,profile:{Role:'Teacher',Active:'Y'}}));setup509.teacherDrafts={t1:{Active:'Y'}};setup509.fieldAuthors=Object.fromEntries(Array.from({length:205},(_,i)=>['untouched:'+i,{actor:'prior@gsps.edu.sg',at:'old'}]));setup509.levelExclusions=Array.from({length:156},(_,i)=>({teacher:'t'+(i+4),levels:['2'],note:'keep '+i}));setup509.relief=GSISRelief.defaults();persist_(book_(),index_(book_()),setup509,null);var before509=doc509(),frozen509=JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))));
`);
f.cache.clear();f.reset();let out=plain(run("call('change',make509([ex509('t1','1',true),ex509('t1','2',true),ex509('t2','3',true)]))"));
assert.equal(run('calcCount509'),0);assert.equal(run('narrow509'),1);assert.equal(out.delta.reliefProjection.previousRevision,out.revision-1);assert.equal(out.delta.reliefProjection.unchanged,true);assert.equal(stats.writes.length,2);assert.ok(out.delta.changes.every(x=>['levelExclusions'].includes(JSON.parse(x.key)[0])));
run(`var after509=doc509();for(const k of ['teachers','teacherDrafts','loads','assignments','relief','membership'])if(JSON.stringify(before509[k])!==JSON.stringify(after509[k]))throw Error('Changed unrelated '+k);for(const [k,v]of Object.entries(before509.fieldAuthors))if(JSON.stringify(after509.fieldAuthors[k])!==JSON.stringify(v))throw Error('Lost author');for(const r of before509.levelExclusions)if(JSON.stringify(after509.levelExclusions.find(x=>x.teacher===r.teacher))!==JSON.stringify(r))throw Error('Lost exclusion');`);
assert.deepEqual(plain(run("doc509().levelExclusions.find(x=>x.teacher==='t1').levels")),['1','2']);
// Different-cell concurrent edits preserve both. Same-cell stale writes retain the
// established latest-save-wins notice with the actual previous author/value.
run("call('change',make509([ex509('t1','3',true)]));call('change',make509([ex509('t1','4',true)]));");
out=plain(run("call('change',make509([ex509('t1','1',false,false)]))"));assert.equal(out.conflicts.length,1);assert.equal(out.conflicts[0].overwrittenValue,true);assert.equal(out.conflicts[0].overwrittenBy,'a@gsps.edu.sg');
assert.deepEqual(plain(run("doc509().levelExclusions.find(x=>x.teacher==='t1').levels")),['2','3','4']);
// Existing inactive/removed rules remain clearable, while new exclusions fail.
run("var d=doc509();d.teachers.find(t=>t.id==='t2').active=false;d.teachers.find(t=>t.id==='t2').profile.Active='N';d.levelExclusions.push({teacher:'orphan',levels:['1'],note:'retained'});persist_(book_(),index_(book_()),d,null);");
assert.throws(()=>run("call('change',make509([ex509('t2','4',true)]))"),e=>e.status===400);
run("call('change',make509([ex509('t2','3',false),ex509('orphan','1',false)]))");assert.deepEqual(plain(run("doc509().levelExclusions.find(x=>x.teacher==='t2').levels")),[]);assert.equal(run("doc509().levelExclusions.find(x=>x.teacher==='orphan').note"),'retained');
// Version-owned profile/draft precedence is retained.
run("var d=doc509();d.teacherDrafts.t3={Active:'N'};persist_(book_(),index_(book_()),d,null)");assert.throws(()=>run("call('change',make509([ex509('t3','1',true)]))"),e=>e.status===400);
// Cold/evicted cache stays unused for exclusion-only saves. Mixed workload saves
// retain the full calculation and return a complete authoritative projection.
f.cache.clear();run("calcCount509=0;call('change',make509([ex509('t1','5',true)]))");assert.equal(run('calcCount509'),0);
out=plain(run("call('change',make509([ex509('t1','6',true),{operation:'setLoad',level:'1',subject:'EL',expected:doc509().loads['1'].EL,value:9}]))"));assert.ok(run('calcCount509')>0);assert.ok(out.delta.reliefProjection.reliefResults);
assert.deepEqual(out.delta.reliefProjection.reliefResults.teachers,plain(run("call('relief',{versionId:id}).teachers")));
// Lost acknowledgement confirms the original receipt without duplicate writes.
run("var lost509=make509([ex509('t1','6',false)])");f.reset();f.failure((stage,p,n)=>{if(stage==='after'&&n===2)throw Error('lost acknowledgement')});assert.throws(()=>run("call('change',lost509)"),/lost acknowledgement/);f.failure(null);const writes=stats.writes.length;out=plain(run("call('change',lost509)"));assert.equal(out.saved,true);assert.equal(out.duplicate,true);assert.equal(stats.writes.length,writes);
// Pending journal keeps partial writes hidden and replays to a single receipt.
run("var interrupted509=make509([ex509('t1','6',true)])");f.reset();f.failure((stage,p,n)=>{if(stage==='before'&&n===2)throw Error('interrupted')});assert.throws(()=>run("call('change',interrupted509)"),/interrupted/);f.failure(null);assert.ok(run('index_(book_()).pendingFieldCommit'));run('recoverFieldCommit()');out=plain(run("call('change',interrupted509)"));assert.equal(out.duplicate,true);assert.equal(run("doc509().audit.filter(x=>x.action==='setExclusionCell'&&x.after?.key==='exclusion:t1:6'&&x.after.value===true).length"),2); // mixed save plus recovered save
run("c.user.roles=[]");assert.throws(()=>run("call('change',lost509)"),e=>e.status===403);run("c.user.roles=['Admin','KP']");
// A legacy projection falls back safely and then reconstructs its indexes.
run("var oldIndex509=index_(book_());delete oldIndex509.versions.find(x=>x.id===id).rootReadRanges;fieldIndexWrite_(book_(),oldIndex509);var narrowBefore509=narrow509;call('change',make509([ex509('t1','6',false)]))");assert.equal(run('narrow509'),run('narrowBefore509'));assert.equal(run("doc509().teachers.length"),159);
// Oversized structural containers are reconstructed without losing siblings.
run("var d=doc509();d.teachers.push(...Array.from({length:350},(_,i)=>({id:'extra'+i,name:'Extra '+i,active:true})));d.levelExclusions.push(...Array.from({length:350},(_,i)=>({teacher:'extra'+i,levels:['2']})));persist_(book_(),index_(book_()),d,null);var count509=doc509().levelExclusions.length;call('change',make509([ex509('extra349','1',true)]))");assert.equal(run('doc509().teachers.length'),509);assert.equal(run('doc509().levelExclusions.length'),run('count509'));assert.deepEqual(plain(run("doc509().levelExclusions.find(x=>x.teacher==='extra349').levels")),['2','1']);
assert.equal(run('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))'),run('frozen509'));
// The selective read and unchanged proof also use the guarded native transport.
ctx.Sheets=undefined;run("c.user.roles=['KP'];var native509=call('change',make509([ex509('extra349','1',false)]))");assert.equal(run('native509.saved'),true);assert.equal(run('native509.delta.reliefProjection.unchanged'),true);assert.deepEqual(plain(run("doc509().levelExclusions.find(x=>x.teacher==='extra349').levels")),['2']);
console.log('PASS 509 exclusions: selective records, untouched siblings/chunked containers, cold cache bypass, mixed R, conflicts, inactive/orphan clear, draft precedence, legacy fallback, lost acknowledgement, recovery and revoked access.');
