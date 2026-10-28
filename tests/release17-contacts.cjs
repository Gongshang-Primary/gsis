const {ctx,book,sheets,run,Sheet,headers}=require('./contacts-data.cjs'),assert=require('assert/strict');
const staff=sheets.get('contacts');staff.data[1][headers.indexOf('GSPS Alias (@gsps.edu.sg)')]='a';
// Restriction applies even to an Admin using DIY, and is enforced by server, not just disabled controls.
const diy=run("adminTable_(book,actor,'diy')");assert.deepEqual(Array.from(diy.fields).filter((_,i)=>!diy.rows[0].computed[i]),['Statutory Name','Mobile No']);
for(const field of ['Role','Basic Name','EXT','GSPS Alias (@gsps.edu.sg)'])assert.throws(()=>run(`saveContactData_(book,{identity:actor,input:{requestId:Utilities.getUuid(),changes:[{id:'s1',field:${JSON.stringify(field)},expected:'',value:'anything'}]}},true)`),e=>e.status===400||e.status===403,field);
run(`saveContactData_(book,{identity:actor,input:{requestId:Utilities.getUuid(),changes:[{id:'s1',field:'Mobile No',expected:'',value:'9123 4567'}]}},true)`);assert.equal(run("calculatedContacts_(book).rows[0]['Mobile No']"),'91234567');
// Truth table is authoritative even when role title suggests another level.
sheets.set('roles',new Sheet([['Role Shortform','Formal Role Name','SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK','EO Appt Level','Required Subject Modifier'],['HOD','Head','','1','','1','','','','','','','Jnr KP','Music'],['P','Principal','1','','','','','','','','','','SL','']]));
assert.equal(run("calculatedContacts_(book).rows[0]['EO Appt Level']"),'Jnr KP');assert.equal(run("calculatedContacts_(book).rows[0]['Subject Modifier']"),'MTL','Removing membership subject rules must preserve existing subject modifiers');
assert.equal(run("deploySnapshot_(book,actor).roleCatalogue.find(r=>r.role==='P').level"),'SL');
const member=run("adminTable_(book,actor,'membership')");assert.ok(!member.fields.includes('Required Subject Modifier'));assert.ok(member.lists['EO Appt Level'].includes('TC'));
run(`var m=adminTable_(book,actor,'membership');applyDeployCatalogues_(book,{identity:actor,input:{revision:1,membership:m.rows}})`);
assert.ok(!run("table_(book,'roles').headers").includes('Required Subject Modifier'),'Obsolete backend column must be cleared');
// Admin extends the shared option list through Deploy's signed projection.
run(`var options=sysFields_(book);options['EO Appt Level'].push('Visiting Lead');var m=adminTable_(book,actor,'membership');m.rows[0][12]='Visiting Lead';applyDeployCatalogues_(book,{identity:actor,input:{revision:2,options,membership:m.rows}});`);
assert.equal(run("calculatedContacts_(book).rows[0]['EO Appt Level']"),'Visiting Lead');
console.log('PASS own-name/mobile DIY, authoritative published mapping, subject preservation and Deploy-owned choices');
