const assert=require('node:assert/strict'),f=require('./deploy508-fixture.js')(),{run,ctx,stats}=f;
function setup(n){ctx.count508=n;run(`var ixAtomic508=index_(book_()),txAtomic508={commit:Utilities.getUuid(),index:{...ixAtomic508,revision:ixAtomic508.revision+1},blocks:[{sheet:'atomic508',writes:Array.from({length:count508},(_,i)=>({row:i+2,col:1,values:[['row'+i]]}))}]};var locAtomic508=fieldJournalWrite_(book_(),txAtomic508,ixAtomic508,undefined,true);`);}
setup(201);assert.ok(run('index_(book_()).pendingFieldCommit'));f.reset();let afterFirst=false;
f.failure((phase,p,n)=>{if(phase==='after'&&n===1){afterFirst=true;assert.ok(run('index_(book_()).pendingFieldCommit'));}if(phase==='before'&&n===2)throw Error('Interrupted between data batches');});
assert.throws(()=>run('fieldApplyRows_(book_(),txAtomic508)'),/between data/);assert.ok(afterFirst);assert.ok(run('index_(book_()).pendingFieldCommit'));assert.ok(stats.writes.slice(0,1).every(b=>b.every(x=>!x.range.includes('deploy_index'))));
f.failure(null);f.reset();run('fieldRecover_(book_())');assert.equal(run('index_(book_()).pendingFieldCommit'),undefined);assert.equal(run('index_(book_()).revision'),run('txAtomic508.index.revision'));assert.equal(f.sheets.get('atomic508').data[201][0],'row200');
assert.equal(stats.writes.length,3);const final=stats.writes.at(-1).at(-1);assert.match(final.range,/deploy_index/);assert.ok(stats.writes.slice(0,-1).every(b=>b.every(x=>!x.range.includes('deploy_index'))));
setup(1);f.reset();run('fieldApplyRows_(book_(),txAtomic508)');assert.equal(stats.writes.length,1);assert.equal(stats.writes[0].length,2);assert.match(stats.writes[0][1].range,/deploy_index/);
// Complete data and marker may be committed even when the API acknowledgement is lost.
setup(1);f.reset();f.failure((phase)=>{if(phase==='after')throw Error('Lost response');});assert.throws(()=>run('fieldApplyRows_(book_(),txAtomic508)'),/Lost response/);f.failure(null);assert.equal(run('index_(book_()).pendingFieldCommit'),undefined);const prior=run('index_(book_()).revision');f.reset();run('fieldRecover_(book_())');assert.equal(stats.writes.length,0);assert.equal(run('index_(book_()).revision'),prior);
// An invalid/oversized index cannot create journal or data writes.
f.reset();run('var oversized508={...txAtomic508,index:{...txAtomic508.index,tooLarge:"x".repeat(50001)}}');assert.throws(()=>run('fieldJournalWrite_(book_(),oversized508,ixAtomic508,undefined,true)'),e=>e.status===400);assert.equal(stats.writes.length,0);
// A globally held writer lock blocks another version save before mutation.
f.hold(true);assert.throws(()=>run("call('change',{operation:'create',requestId:Utilities.getUuid(),name:'Busy'})"),e=>e.status===503);f.hold(false);
console.log('PASS 508 final marker: same atomic request for a small save, last request for large saves, pending protection between batches, replay, lost acknowledgement, oversize preflight and shared writer lock.');
