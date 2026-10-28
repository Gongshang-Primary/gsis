const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('backend/Code.gs','utf8'),start=code.indexOf('var deployTrace_=null;'),end=code.indexOf('// Inclusive phase measurements;',start);assert.ok(start>=0&&end>start);
let now=1000;const ctx=vm.createContext({Date:{now:()=>now},SpreadsheetApp:{flush(){now+=4;}}});vm.runInContext(code.slice(start,end),ctx);const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
run('deployTrace_={phases:{}}');let releases=0;ctx.lock={tryLock(budget){assert.equal(budget,8000);now+=12;return true},releaseLock(){releases++;now+=3}};
assert.equal(run('deployLock_(lock,8000)'),true);now+=30;run('deployUnlock_(lock)');assert.equal(releases,1);assert.deepEqual(json('deployTrace_.phases'),{lockWait:{ms:12,calls:1},lockHold:{ms:33,calls:1}});assert.equal(run('deployHeldLocks_.has(lock)'),false);
// A reused lock records a new hold, not time since the first acquisition.
assert.equal(run('deployLock_(lock,8000)'),true);now+=7;run('deployUnlock_(lock)');assert.deepEqual(json('deployTrace_.phases.lockHold'),{ms:43,calls:2});
ctx.denied={tryLock(){now+=8;return false},releaseLock(){throw Error('A denied lock must not be released')}};assert.equal(run('deployLock_(denied,8000)'),false);assert.equal(run('deployHeldLocks_.has(denied)'),false);assert.deepEqual(json('deployTrace_.phases.lockHold'),{ms:43,calls:2});
ctx.failed={tryLock(){now+=5;throw Error('Lock service failed')},releaseLock(){}};assert.throws(()=>run('deployLock_(failed,8000)'),/Lock service failed/);assert.equal(run('deployHeldLocks_.has(failed)'),false);
ctx.badRelease={tryLock(){return true},releaseLock(){now+=2;throw Error('Release failed')}};assert.equal(run('deployLock_(badRelease,8000)'),true);now+=11;assert.throws(()=>run('deployUnlock_(badRelease)'),/Release failed/);assert.equal(run('deployHeldLocks_.has(badRelease)'),false);assert.deepEqual(json('deployTrace_.phases.lockHold'),{ms:56,calls:3});
run('deployTrace_=null');assert.equal(run('deployLock_(lock,8000)'),true);run('deployUnlock_(lock)');assert.equal(run('deployHeldLocks_.has(lock)'),false);
// Exercise actual dispatcher finally paths, including a rejected settings save.
const storage=require('./storage.cjs'),actual=storage.ctx,exec=s=>vm.runInContext(s,actual);exec('deployTrace_={phases:{}};props_().setProperty("LEASES","{}");');
exec("call('lease',{versionId:id,key:'meta',clientId:'timing505'})");assert.equal(exec('deployTrace_.phases.lockHold.calls'),1);
exec("call('lease',{versionId:id,key:'meta',clientId:'timing505',release:true})");assert.equal(exec('deployTrace_.phases.lockHold.calls'),2);
assert.throws(()=>exec("call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'timing505',edits:[{operation:'setReliefSettings',expected:document_(book_(),index_(book_()).versions.find(x=>x.id===id)).relief||null,value:{...GSISRelief.defaults(),blocks:{'missing-teacher':1}}}]})"),e=>e.status===400);assert.equal(exec('deployTrace_.phases.lockHold.calls'),3);
// Every canonical Deploy lock release uses the timed wrapper; the Contacts
// project has its own trace and is deliberately outside this assertion.
for(const file of ['backend/FieldStore.gs','backend/LayoutRepository.gs','backend/NoticeAcknowledgement.gs'])assert.equal(fs.readFileSync(file,'utf8').includes('.releaseLock('),false,file+' bypasses lockHold timing');
// The bundled Roster source recovery owns an independent ScriptLock and has
// no Deploy timing trace. Exclude that explicit module, while still proving
// that its only direct release belongs to the recovery finally path.
const rosterSourceBlock=/\/\* GSIS_VENUES_ROSTER_SOURCE_BEGIN \*\/([\s\S]*?)\/\* GSIS_VENUES_ROSTER_SOURCE_END \*\//;
const rosterSource=code.match(rosterSourceBlock);assert.ok(rosterSource,'the Roster source module has an explicit scope');
assert.equal((rosterSource[1].match(/\.releaseLock\(/g)||[]).length,1,'Roster source has only its independent recovery release');
assert.match(rosterSource[1],/function recoverRosterVenuesSource\(\)\{[\s\S]*?const lock=LockService\.getScriptLock\(\);if\(!lock\.tryLock\(8000\)\)[\s\S]*?finally\{lock\.releaseLock\(\);\}/,'Roster recovery acquires and finally releases its own bounded ScriptLock');
const plannerCode=code.replace(/\/\* GSIS_ROSTER_AUDIT_EXPORT_BEGIN \*\/[\s\S]*?\/\* GSIS_ROSTER_AUDIT_EXPORT_END \*\//,'').replace(rosterSourceBlock,'');assert.equal((plannerCode.match(/\.releaseLock\(/g)||[]).length,1,'planner ScriptLock releases use deployUnlock_');const audit=fs.readFileSync('backend/RosterAuditExport.gs','utf8');assert.match(audit,/exportLock=LockService\.getUserLock\(\)/);assert.match(audit,/finally\{if\(exportHeld\)exportLock\.releaseLock\(\);\}/,'the shared export UserLock is released on errors and is not released twice after watermark handoff');
console.log('PASS 505 timing: wait separated from hold, release included, repeat/failed locks, error cleanup and actual dispatcher success/failure finally paths');
