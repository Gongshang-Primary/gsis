const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
// Test the canonical module before release embedding, using the real dispatcher fixture.
const originalRead=fs.readFileSync,canonical=originalRead('backend/FieldStore.gs','utf8');
fs.readFileSync=function(file,...args){let result=originalRead.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof result==='string'){
 result=result.replace(/\/\* GSIS_FIELDSTORE_BEGIN \*\/[\s\S]*?\/\* GSIS_FIELDSTORE_END \*\//,()=> '/* GSIS_FIELDSTORE_BEGIN */\n'+canonical+'\n/* GSIS_FIELDSTORE_END */');
 if(!result.includes('var GSISRelief')&&!result.includes('const GSISRelief'))result=originalRead('shared/relief.js','utf8')+'\n'+result;
 }return result;};
let fixture;try{fixture=require('./storage.cjs');}finally{fs.readFileSync=originalRead;}
const {ctx,book,sheets}=fixture,run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
const snapshot=()=>JSON.stringify([...sheets].map(([name,s])=>[name,s.data,s.max]));
const warning=[];ctx.console={...console,warn:s=>warning.push(JSON.parse(s))};
run("var base505=index_(book_()),before505=document_(book_(),base505.versions.find(x=>x.id===id));");
function padded(value,size){const result={...value,padding:''};result.padding='x'.repeat(size-JSON.stringify(result).length);assert.equal(JSON.stringify(result).length,size);return result;}
const base=json('base505');ctx.tooBig=padded(base,45001);ctx.nearLimit=padded(base,44980);ctx.safeLarge=padded(base,35000);
for(const [final,pending]of [['tooBig','base505'],['base505','tooBig'],['nearLimit','nearLimit']]){
 const before=snapshot();assert.throws(()=>run(`fieldJournalWrite_(book_(),{commit:'blocked',index:${final},blocks:[{sheet:'must_not_exist',writes:[{row:2,col:1,values:[['no']]}]}]},${pending})`),e=>e.status===400&&/index is too large/.test(e.message));assert.equal(snapshot(),before,'oversized final/pending index cannot mutate any sheet');
}
const before=snapshot();assert.throws(()=>run("fieldApplyRows_(book_(),{index:tooBig,blocks:[{sheet:'must_not_exist',writes:[{row:2,col:1,values:[['no']]}]}]})"),e=>e.status===400);assert.equal(snapshot(),before,'apply guard runs before any structural or value writes');
assert.equal(run('fieldIndexText_(safeLarge).length'),35000);assert.ok(warning.some(x=>x.characters===35000&&x.limit===45000));assert.ok(warning.every(x=>!Object.values(x).some(v=>typeof v==='string'&&v.includes('padding'))),'warning contains size metadata only');
// Recover a durable older journal above the new safety margin. A new write of
// the same index is refused, but replay may finish up to the platform cell cap.
ctx.legacyLarge=padded(base,46000);run("var legacyTx505={commit:'legacy-505',index:legacyLarge,blocks:[{sheet:'legacy505',writes:[{row:2,col:1,values:[['recovered']]}]}]};var legacyText505=JSON.stringify(legacyTx505),legacyRows505=[];for(var offset505=0;offset505<legacyText505.length;offset505+=30000)legacyRows505.push([legacyTx505.commit,legacyRows505.length,legacyText505.slice(offset505,offset505+30000)]);var legacyJournal505=fieldJournal_(book_()),legacyAt505=legacyJournal505.getLastRow()+1;legacyJournal505.getRange(legacyAt505,1,legacyRows505.length,3).setValues(legacyRows505);fieldIndexWrite_(book_(),{...base505,pendingFieldCommit:{row:legacyAt505,parts:legacyRows505.length,commit:legacyTx505.commit}});");
assert.throws(()=>run('fieldIndexWrite_(book_(),legacyLarge)'),e=>e.status===400);run('fieldRecover_(book_())');assert.equal(sheets.get('legacy505').data[1][0],'recovered');assert.equal(run('index_(book_()).pendingFieldCommit'),undefined);assert.equal(run('index_(book_()).padding.length'),ctx.legacyLarge.padding.length);run('fieldIndexWrite_(book_(),base505)');
// A near-limit ordinary save fails before journal rows, receipts, canonical
// field values or the visible index change.
ctx.largeExisting=padded(base,44980);run('fieldIndexWrite_(book_(),largeExisting)');const failedBefore=snapshot();assert.throws(()=>run("call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'505',edits:[{operation:'setLoad',level:'1',subject:'EL',expected:before505.loads['1'].EL,value:14}]})"),e=>e.status===400);assert.equal(snapshot(),failedBefore);run('fieldIndexWrite_(book_(),base505)');
// Relief settings have only their own data and teacher IDs as dependencies.
const roots=json("draftReadScope_([{operation:'setReliefSettings'}]).roots");assert.ok(roots.includes('relief')&&roots.includes('teachers'));assert.equal(roots.includes('assignments'),false);assert.equal(roots.includes('loads'),false);
// The guarded path keeps small edits scoped and preserves every unrelated root.
run("props_().setProperty('LEASES','{}');var save505=call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'505',edits:[{operation:'setLoad',level:'1',subject:'EL',expected:before505.loads['1'].EL,value:14}]});var after505=document_(book_(),index_(book_()).versions.find(x=>x.id===id));");assert.equal(run('save505.saved'),true);
for(const key of ['teachers','assignments','groups','venues','organisations','offload'])assert.deepEqual(json(`after505[${JSON.stringify(key)}]`),json(`before505[${JSON.stringify(key)}]`));
console.log('PASS 505 storage: exact pending/final size preflight, size-only warnings, unchanged sheets on rejection, legacy durable recovery, scoped relief dependencies, unrelated roots preserved');
