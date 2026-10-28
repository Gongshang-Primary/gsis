const {ctx,book,sheets,run,headers}=require('./contacts-data.cjs');const assert=require('assert/strict');
run(`var newId='new-'+Utilities.getUuid(),proposal={'Basic Name':'New Teacher',Role:'Teacher','EO Appt Level':'','Appointment Status':'Permanent','Employment Modifier':'','Subject Modifier':'',Active:'Y'};
var review=deployPublishReview_(book,actor,{proposals:[{id:newId,profile:proposal}]});
var approval=review.changes[0];approval.values['Mobile No']='9000 0000';approval.values['Day of Birth']='12';approval.values['Month of birth']='9';approval.values['GSPS Alias (@gsps.edu.sg)']='new.teacher';
var publishReq={identity:actor,input:{requestId:Utilities.getUuid(),versionId:'plan',approvals:[approval]}};`);
assert.throws(()=>run("deployPublishReview_(book,{email:'kp@gsps.edu.sg'},{proposals:[{id:newId,profile:proposal}]})"),e=>e.status===403);
assert.throws(()=>run("approveDeployTeachers_(book,{...publishReq,identity:{email:'kp@gsps.edu.sg'}})"),e=>e.status===403);
assert.equal(run('approveDeployTeachers_(book,publishReq).saved'),true);assert.equal(run("table_(book,'contacts').rows.find(r=>r['Staff ID']===newId)['Mobile No']"),'90000000');
assert.equal(run('approveDeployTeachers_(book,publishReq).duplicate'),true);assert.equal(run("table_(book,'contacts').rows.filter(r=>r['Staff ID']===newId).length"),1);
assert.ok(!run('JSON.stringify(deploySnapshot_(book,actor))').includes('9000 0000'));
assert.equal(run("deploySnapshot_(book,actor).people.find(t=>t.id===newId).profile['Basic Name']"),'New Teacher');
assert.equal(run("deploySnapshot_(book,actor).roleCatalogue.find(r=>r.role==='HOD').level"),'HOD');
// Stale review must not overwrite another Contacts edit.
run("var stale=deployPublishReview_(book,actor,{proposals:[{id:newId,profile:{...proposal,Active:'N'}}]}).changes[0];var liveRow=table_(book,'contacts').rows.find(r=>r['Staff ID']===newId);book.getSheetByName('contacts').getRange(liveRow._row,table_(book,'contacts').headers.indexOf('Mobile No')+1).setValue('9999 9999');");
assert.throws(()=>run("approveDeployTeachers_(book,{identity:actor,input:{requestId:Utilities.getUuid(),versionId:'plan',approvals:[stale]}})"),e=>e.status===409);
// Reject invalid DOB before any changes.
run("var bad=deployPublishReview_(book,actor,{proposals:[{id:newId,profile:{...proposal,Active:'N'}}]}).changes[0];bad.values['Day of Birth']='32';");
assert.throws(()=>run("approveDeployTeachers_(book,{identity:actor,input:{requestId:Utilities.getUuid(),versionId:'plan',approvals:[bad]}})"),e=>e.status===400);
assert.equal(run("table_(book,'contacts').rows.find(r=>r['Staff ID']===newId).Active"),'Y');
// Simulate interruption during the second new-row write, then retry same journal.
run("var partialItems=[1,2].map(n=>deployPublishReview_(book,actor,{proposals:[{id:'new-'+Utilities.getUuid(),profile:{...proposal,'Basic Name':'Partial '+n}}]}).changes[0]);partialItems.forEach((x,i)=>x.values['GSPS Alias (@gsps.edu.sg)']='partial'+i);var partialReq={identity:actor,input:{requestId:Utilities.getUuid(),versionId:'plan',approvals:partialItems}};");
const contacts=sheets.get('contacts'),original=contacts.getRange.bind(contacts);let writes=0;
contacts.getRange=(...args)=>{const r=original(...args),set=r.setValues.bind(r);r.setValues=a=>{if(++writes===2)throw Error('simulated disconnect');return set(a)};return r};
assert.throws(()=>run('approveDeployTeachers_(book,partialReq)'),/disconnect/);contacts.getRange=original;
assert.equal(run('approveDeployTeachers_(book,partialReq).saved'),true);assert.equal(run("table_(book,'contacts').rows.filter(r=>r['Basic Name'].startsWith('Partial ')).length"),2);
assert.equal(run('approveDeployTeachers_(book,partialReq).duplicate'),true);
assert.throws(()=>run("approveDeployTeachers_(book,{...partialReq,input:{...partialReq.input,versionId:'other'}})"),e=>e.status===409);
console.log('PASS Admin-only review/approval, new teacher details, privacy, stale review, validation and partial-write retry without duplicates');

// Admin-approved manual levels and custom staff roles survive later recalculations.
run("var custom=deployPublishReview_(book,actor,{proposals:[{id:newId,profile:{...proposal,Role:'Visiting Teacher','EO Appt Level':'Specialist'}}]}).changes[0];approveDeployTeachers_(book,{identity:actor,input:{requestId:Utilities.getUuid(),versionId:'plan',approvals:[custom]}});recalculateContactData_(book,{identity:actor});");
assert.equal(run("calculatedContacts_(book).rows.find(r=>r['Staff ID']===newId)['EO Appt Level']"),'');
assert.equal(run("calculatedContacts_(book).rows.find(r=>r['Staff ID']===newId).Role"),'Visiting Teacher');
assert.equal(run("access_(book).rows.length"),1,'Staff role changes do not add application access');
console.log('PASS approved custom role and manual appointment level survive recalc without granting access');
