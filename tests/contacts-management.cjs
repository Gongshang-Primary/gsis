const {ctx,book,sheets,run,Sheet,headers}=require('./contacts-data.cjs'),assert=require('assert/strict');
sheets.get('admin_users').data.push(['kp@gsps.edu.sg','KP','Y','','kp']);
run("var kp={email:'kp@gsps.edu.sg',subject:'kp'},ordinary={email:'staff@gsps.edu.sg',subject:'staff'},actor={email:'a@gsps.edu.sg',subject:'a'}");
for(const kind of ['sysFields','membership']){
 assert.equal(run(`adminTable_(book,kp,'${kind}').editable`),false);
 assert.throws(()=>run(`adminTable_(book,ordinary,'${kind}')`),e=>e.status===403);
 assert.throws(()=>run(`saveAdminTable_(book,{identity:kp,input:{kind:'${kind}'}})`),e=>e.status===410);
}
assert.equal(run("sysFields_(book)['Offload Tags']"),undefined);
assert.throws(()=>run("adminTable_(book,actor,'offload')"),e=>e.status===410);
assert.throws(()=>run("saveAdminTable_(book,{identity:actor,input:{kind:'membership'}})"),e=>e.status===410);
// Bind the authenticated subject before an allowed GSPS alias change.
sheets.get('contacts').data[1][headers.indexOf('GSPS Alias (@gsps.edu.sg)')]='staff';
assert.equal(run("adminTable_(book,ordinary,'diy').rows[0].id"),'s1');
run("var ownreq={identity:ordinary,input:{requestId:Utilities.getUuid(),changes:[{id:'s1',field:'GSPS Alias (@gsps.edu.sg)',expected:'staff',value:'renamed'}]}}");
assert.throws(()=>run('saveContactData_(book,ownreq,true)'),e=>e.status===400||e.status===403);
run("ownreq.input.changes=[{id:'s1',field:'Mobile No',expected:'',value:'9123 4567'}];ownreq.input.requestId=Utilities.getUuid()");assert.equal(run('saveContactData_(book,ownreq,true).saved'),true);assert.equal(run("table_(book,'contacts').rows[0]['Mobile No']"),'91234567');
assert.equal(run("adminTable_(book,ordinary,'diy').rows[0].id"),'s1');
assert.throws(()=>run("adminTable_(book,{email:'renamed@gsps.edu.sg',subject:'intruder'},'diy')"),e=>e.status===403);
assert.throws(()=>run("saveContactData_(book,{identity:ordinary,input:{requestId:Utilities.getUuid(),changes:[{id:'s1',field:'Role',expected:'HOD',value:'Teacher'}]}},true)"),e=>e.status===400||e.status===403);
assert.throws(()=>run("validateContactCell_('GSPS Alias (@gsps.edu.sg)','staff@moe.edu.sg',{},'')"),e=>e.status===400);
sheets.set('legacy',new Sheet([['Result'],[3]]));sheets.get('legacy').formulas=[[],['=1+2']];
run('recalculateContactData_(book,{identity:actor})');assert.equal(sheets.get('legacy').data[1][0],3);assert.equal(sheets.get('legacy').formulas[1][0],'=1+2');
console.log('PASS new Contacts page permissions, master validation, retired catalogue writes, immutable retry, own-record identity binding and formula snapshot migration');
