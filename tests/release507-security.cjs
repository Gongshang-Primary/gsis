const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {ctx,sheets,props}=require('./storage.cjs'),run=s=>vm.runInContext(s,ctx),plain=x=>JSON.parse(JSON.stringify(x));
const stored=()=>JSON.stringify({sheets:[...sheets].map(([n,s])=>[n,s.data]),props:[...props]});
run(`props_().setProperty('LEASES','{}');c.user.email=who.email;
 var securityDoc=()=>document_(book_(),index_(book_()).versions.find(x=>x.id===id));
 var sd=securityDoc();sd.relief={schema:1,mode:'expected',periodsPerDay:13,daysPerWeek:5,lunchPeriodsPerDay:1.234,siuePercent:123.456,blocks:{t1:2.25}};
 var secretConflict={fieldKey:'relief',where:'Relief settings',overwrittenBy:who.email,overwrittenValue:sd.relief,replacementValue:sd.relief};
 sd.audit.push({id:'secret-audit',action:'Conflicts resolved — latest server save wins',at:new Date().toISOString(),actor:who.email,after:[secretConflict]});
 var secretReceiptId=Utilities.getUuid();fieldPendingReceipt_.set(sd,{id:secretReceiptId,actor:who.email,digest:'secret',conflicts:[secretConflict]});persist_(book_(),index_(book_()),sd,null);
 var adminSnap=call('sync',{versionId:id,reliefResults:true,auditPaged:true});
`);
const admin=plain(run('adminSnap'));assert.equal(admin.current.reliefAdmin.settings.weeklyPeriods,84);assert.equal(admin.current.relief.schema,1);assert.equal(admin.current.reliefAdmin.settings.siuePercent,123.456);
assert.ok(admin.current.reliefAdmin.formula);assert.equal(run('securityDoc().relief.schema'),1,'Read does not migrate storage');
function noPrivate(value){const str=JSON.stringify(value);for(const secret of ['1.234','lunchPeriodsPerDay','retained fraction','overwrittenValue','replacementValue'])assert.ok(!str.includes(secret),'Non-Admin leak: '+secret);}
run("c.user.roles=['KP']");
for(const action of ['bootstrap','sync'])for(const auditPaged of [true,false]){
 const snap=plain(run(`call('${action}',{versionId:id,reliefResults:true,auditPaged:${auditPaged}})`));
 noPrivate(snap);assert.ok(!('relief' in snap.current)&&!('reliefAdmin' in snap.current)&&!('audit' in snap.current));
 assert.deepEqual(snap.current.reliefResults,admin.current.reliefResults);assert.equal(snap.current.conflictNotices[0].where,'Relief rules');
}
const api=plain(run("call('relief',{versionId:id})"));noPrivate(api);assert.equal(api.schemaVersion,3);assert.ok(!('admin' in api));assert.deepEqual(api.teachers,admin.current.reliefResults.teachers);
noPrivate(plain(run("call('receipt',{versionId:id,requestId:secretReceiptId})")));
for(const input of ['{}',"{detailId:'secret-audit'}"])assert.throws(()=>run(`call('auditPage',{versionId:id,...${input}})`),e=>e.status===403);
run(`var ruleEdit={operation:'setReliefSettings',expected:securityDoc().relief,value:{...GSISRelief.defaults(),weeklyPeriods:70,siuePercent:125,blocks:{t1:2.25}}};
 var saveRequest={operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'507',reliefResults:true,returnDelta:true,since:index_(book_()).versions.find(x=>x.id===id).revision,authority:'Admin+KP',edits:[ruleEdit]};`);
for(const expression of ["call('change',saveRequest)","call('change',{...saveRequest,edits:[{operation:'setTeacherNote',teacher:'t1',expected:'',value:'must not save'},ruleEdit]})","saveDraft_(book_(),index_(book_()),securityDoc(),saveRequest,c,{identity:who})"]){const before=stored();assert.throws(()=>run(expression),e=>e.status===403);assert.equal(stored(),before,'Rejected rule writes cannot partially save');}
run("c.user.roles=['Admin','KP'];var saved507=call('change',saveRequest)");assert.equal(run('saved507.saved'),true);assert.ok(run('saved507.delta.reliefProjection'));assert.equal(run('securityDoc().relief.weeklyPeriods'),70);assert.equal(run('securityDoc().relief.blocks.t1'),2.25);
assert.equal(run("call('change',saveRequest).duplicate"),true);
run("c.user.roles=['KP']");assert.throws(()=>run("call('change',saveRequest)"),e=>e.status===403,'Revoked Admin may not replay a rule write');
const delta=plain(run("call('delta',{versionId:id,since:saveRequest.since,authority:'KP',auditPaged:false})"));noPrivate(delta);assert.ok(delta.changes.every(x=>!('old' in x)));assert.ok(!delta.changes.some(x=>JSON.parse(x.key)[0]==='relief'));
assert.ok(run("call('delta',{versionId:id,since:saveRequest.since,authority:'KP',reliefResults:true}).reliefProjection"));
assert.equal(run("call('delta',{versionId:id,since:saveRequest.since,authority:'Admin+KP',reliefResults:true}).resync"),true);
const reloaded=plain(run("call('sync',{versionId:id,reliefResults:true,auditPaged:true})"));noPrivate(reloaded);assert.equal(reloaded.current.reliefResults.teachers[0].R,run("call('relief',{versionId:id}).teachers[0].R"));
// An unrelated note save retains the narrow delta path and computed rows.
run(`var noteBaseline=call('sync',{versionId:id,reliefResults:true,auditPaged:true});var noteSaved=call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'507-note',returnDelta:true,reliefResults:true,since:index_(book_()).versions.find(x=>x.id===id).revision,authority:'KP',edits:[{operation:'setTeacherNote',teacher:'t1',expected:securityDoc().teacherNotes.t1||'',value:'ordinary note'}]});`);
assert.ok(!run('noteSaved.delta.resync'));noPrivate(plain(run('noteSaved')));
const projected=plain(run('GSISFields.apply(noteBaseline.current,noteSaved.delta.changes)'));assert.deepEqual(projected.reliefResults,reloaded.current.reliefResults);
run("c.user.roles=['Admin'];var changed=call('sync',{versionId:id,reliefResults:true,auditPaged:true});var duplicated=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'507 private rules copy',requestId:Utilities.getUuid()}).versionId");
assert.equal(run('changed.current.reliefAdmin.settings.weeklyPeriods'),70);assert.equal(run("document_(book_(),index_(book_()).versions.find(x=>x.id===duplicated)).relief.blocks.t1"),2.25);
run("c.user.roles=[]");for(const action of ['sync','relief','delta'])assert.throws(()=>run(`call('${action}',{versionId:id})`),e=>e.status===403);
// Legacy UI catalogue hydration must not alter version-owned R.
run(`c.user.roles=['Admin','KP'];var legacyCheck=securityDoc();Object.assign(legacyCheck,{teachers:[{id:'only',name:'Only',active:true,role:'Teacher'}],classes:[],groups:[],assignments:[],loads:{},organisations:{},duties:[],relief:({schema:2,mode:'actual',weeklyPeriods:60,daysPerWeek:5,lunchPeriodsPerDay:2,siuePercent:150,blocks:{}})});delete legacyCheck.membership;delete legacyCheck.offload;persist_(book_(),index_(book_()),legacyCheck,null);c.roleCatalogue=[{role:'Teacher',level:'SL',groups:['SL']}];c.sysFields={};c.legacyOffload={schema:2,roleOverrideSchema:1,tags:[{id:'live-only',source:'Role',match:'Teacher',percent:99}],staff:{}};`);
const legacyR=plain(run("call('relief',{versionId:id}).teachers"));assert.equal(legacyR[0].R,60);
for(const auditPaged of [true,false])assert.deepEqual(plain(run(`call('sync',{versionId:id,auditPaged:${auditPaged},reliefResults:true}).current.reliefResults.teachers`)),legacyR);
// A concurrent index change cannot produce a mixed-version API response.
run('var stableIndex507=index_(book_()),indexFunction507=index_;index_=()=>({...stableIndex507,revision:stableIndex507.revision+1})');
try{assert.throws(()=>run("reliefExport_(book_(),stableIndex507,c,{versionId:id})"),e=>e.status===503);}finally{run('index_=indexFunction507');}
const bundle=fs.readFileSync('public/app.js','utf8');assert.ok(!bundle.includes('var GSISRelief=')&&!bundle.includes('weekly budget − weekly lunch'));
console.log('PASS 507 security: ordinary/paged snapshots, API, audit, receipts, conflict notices, deltas, mixed saves, retries, current roles, weekly rule migration, saved results and narrow unrelated updates.');
