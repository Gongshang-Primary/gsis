const assert=require('node:assert/strict'),f=require('./contacts503-fixture')();
const sheet=f.sheets.get('contacts'),row=sheet.data[2];row[3]='kp';row[10]='YH';
const read=()=>{f.run('contactReadCache_.clear();contactPrefetchedValues_.clear()');return f.post('deploySnapshot',{authorityOnly:true,palAuthority:true},'kp@gsps.edu.sg');};
assert.equal(read().data.user.palEditor,true);
row[12]='Acting';assert.equal(read().data.user.palEditor,true);
row[10]='AYH';assert.equal(read().data.user.palEditor,false);
row[10]='YH';row[15]='N';assert.equal(read().data.user.palEditor,false);
row[15]='Y';f.sheets.get('admin_users').data[3][2]='N';assert.deepEqual(read().data.user.roles,[]);
console.log('PASS 604 Contacts: signed authority uses current YH appointment, Acting included, AYH/inactive/revoked denied.');
