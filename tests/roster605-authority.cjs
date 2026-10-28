const assert=require('node:assert/strict'),f=require('./contacts503-fixture')();
const row=f.sheets.get('contacts').data[2];row[3]='kp';row[10]='SH';
const roles=f.sheets.get('roles'),header=roles.data[0];roles.data.push(header.map(k=>k==='Role Shortform'?'SH':k==='SMC'?'1':''));
const read=()=>{f.run('contactReadCache_.clear();contactPrefetchedValues_.clear()');const r=f.post('deploySnapshot',{authorityOnly:true,rosterAuthority:true},'kp@gsps.edu.sg');assert.equal(r.ok,true,JSON.stringify(r));return r.data.user;};
assert.equal(read().rosterSMC,true);row[10]='Acting SH';assert.equal(read().rosterSMC,true);row[10]='Teacher';assert.equal(read().rosterSMC,false);row[10]='SH';row[15]='N';assert.equal(read().rosterSMC,false);row[15]='Y';row[3]='someoneelse';assert.equal(read().rosterSMC,false);
f.run('contactReadCache_.clear();contactPrefetchedValues_.clear()');assert.equal(f.post('deploySnapshot',{authorityOnly:true,rosterAuthority:true},'admin@gsps.edu.sg').data.user.rosterSMC,false);
console.log('PASS signed Roster authority: active SMC and Acting SH, teacher/inactive/mismatched alias/Admin-only denied');
