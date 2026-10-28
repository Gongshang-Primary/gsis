const assert=require('node:assert/strict'),fixture=require('./contacts503-fixture');
function setup(){
 const f=fixture(),person=f.sheets.get('contacts').data[2],roles=f.sheets.get('roles');
 person[3]='kp';person[10]='SH';
 roles.data.push(roles.data[0].map(k=>k==='Role Shortform'?'SH':k==='SMC'?'1':''));
 return f;
}
function read(f,actor='kp@gsps.edu.sg'){
 f.reset();const result=f.post('deploySnapshot',{authorityOnly:true,rosterAuthority:true},actor);
 assert.equal(f.stats.writes.length,0);assert.equal(f.stats.nativeWrites,0);assert.equal(f.stats.flush,0);assert.equal(f.stats.lockAttempts.length,0);
 return result;
}
// The same signed request without the prefetch reproduces the old three reads.
const baseline=setup();baseline.run('contactPrefetchDirectory_=function(){};contactPrefetchRosterDirectory_=function(){}');
const before=read(baseline);assert.equal(before.ok,true);assert.equal(before.data.timing.io.apiReads,3);
const f=setup(),after=read(f);assert.equal(after.ok,true);assert.deepEqual(after.data.user,before.data.user);
assert.equal(after.data.user.rosterSMC,true);assert.equal(after.data.timing.io.apiReads,1);
assert.equal(after.data.timing.io.readRanges,3);assert.ok(after.data.timing.io.readCells<=before.data.timing.io.readCells,'Whole-sheet Values reads trim empty trailing cells');
assert.deepEqual(f.stats.reads.flat().map(r=>r.split('!')[0]).sort(),baseline.stats.reads.flat().map(r=>r.split('!')[0]).sort());
// A later request re-reads both staff membership and application authority.
f.sheets.get('contacts').data[2][10]='Teacher';
assert.equal(read(f).data.user.rosterSMC,false);
assert.deepEqual(read(f,'admin@gsps.edu.sg').data.user.roles,['Admin']);
f.sheets.get('admin_users').data[1][2]='N';
assert.deepEqual(read(f,'admin@gsps.edu.sg').data.user.roles,[]);
// Batching must not accept a before-image as current Roster authority.
f.sheets.get('contacts').data[2][10]='SH';
f.seedSnapshot([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Changed name'}]);
const pending=read(f);assert.equal(pending.ok,false);assert.equal(pending.status,503);
assert.match(pending.error,/Contacts changes are pending/);
console.log('PASS Roster authority batching: 3 to 1 Sheets reads, same tables and authority, immediate role revocation, pending-save rejection, no writes or locks.');
