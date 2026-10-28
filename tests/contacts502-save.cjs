const assert=require('assert/strict'),crypto=require('crypto'),fixture=require('./contacts502-fixture.js');
const addition=()=>({id:'contact-'+crypto.randomUUID(),values:{'Basic Name':'New AE','Statutory Name':'Ms New AE','iCON Alias (@moe.edu.sg)':'new_ae','CES Alias (@schools.gov.sg)':'new_ae','GSPS Alias (@gsps.edu.sg)':'','Mobile No':'81234567',Role:'AE','Employment Modifier':'AE',Active:'Y'}});
{
 const f=fixture();f.reset();const data=f.post('data');assert.equal(data.data.editable,true);assert.equal(data.data.rows[0].formalRole,'Allied Educator');assert.deepEqual(data.data.rows[0].groups,['Support']);assert.equal(f.stats.flush,0);assert.equal(f.stats.reads.length,1);assert.equal(data.data.timing.phases.dataReadBatch.calls,1);
 f.sheets.get('admin_users').data[1][2]='N';assert.equal(f.post('data').status,403,'data load checks the fresh batched access record');
}
// Same shape as the reported interruption: addition only, blank school alias,
// legacy Appointment Level headers and two formula-bearing template rows.
{
 const f=fixture(),item=addition(),key=f.seedPending({changes:[],additions:[item]});f.reset();
 const review=f.post('recoveryStatus');assert.equal(review.data.pending[0].recoverable,true);assert.equal(f.stats.flush,0);assert.ok(!f.stats.reads.flat().some(r=>r.startsWith("'contacts'!")),'addition-only review needs no full Contacts read');
 f.reset();const result=f.post('recoverSave',key,'other-admin@gsps.edu.sg');assert.equal(result.data.saved,true);assert.equal(f.stats.flush,0);assert.equal(f.stats.nativeWrites,0);assert.equal(result.data.timing.phases.saveReadBatch.calls,1);assert.equal(f.stats.writes.length,1,'audit, Staff ID, fields and Applied share one commit');
 const rows=f.sheets.get('contacts').data.filter(r=>r[17]===item.id);assert.equal(rows.length,1);assert.equal(rows[0][0],'New AE (AE)');assert.equal(rows[0][11],'');assert.equal(rows[0][15],'Y');assert.equal(f.sheets.get('contacts').formulas[182][0],'');assert.equal(f.sheets.get('contacts').formulas[182][11],'');assert.equal(f.sheets.get('contacts').formulas[181][0],'=LEGACY()','only the edited row loses its legacy derived formulas');
 assert.equal(f.sheets.get('contacts').data[1][6],'8123 4567','unrelated phone formatting retained');assert.deepEqual(f.sheets.get('backup').data,[['Protected'],['Original history']]);assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[1],'admin@gsps.edu.sg');assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[7],'other-admin@gsps.edu.sg');assert.deepEqual(JSON.parse(f.props.get('CONTACTS_PENDING_V2')),{});
 f.reset();assert.equal(f.post('recoverSave',key).data.duplicate,true);assert.equal(f.stats.writes.length,0);
}
// Lost acknowledgement after the Applied batch is resolved by an independent
// receipt, even while another transaction remains unresolved.
{
 const f=fixture(),item=addition(),request={requestId:crypto.randomUUID(),changes:[],additions:[item]};f.setMode('lostAck');const lost=f.post('saveData',request);assert.equal(lost.ok,false);assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[4],'Applied');
 f.props.set('CONTACTS_PENDING_V2',JSON.stringify({contact_save_journal:{id:crypto.randomUUID(),actor:'someone@gsps.edu.sg',row:50}}));f.reset();assert.equal(f.post('bootstrap').ok,true,'viewing remains available during unrelated pending recovery');assert.equal(f.post('saveReceipt',{requestId:request.requestId}).data.saved,true);assert.equal(f.stats.writes.length,0);assert.equal(f.stats.flush,0);
}
// An interruption after the reserved ID or after a dirty span resumes the same
// physical record and original journal entry without duplicate Contacts rows.
for(const mode of ['reserve','partial']){
 const f=fixture(),item=addition(),request={requestId:crypto.randomUUID(),changes:[],additions:[item]};f.setMode(mode);assert.equal(f.post('saveData',request).ok,false);const j=f.sheets.get('contact_save_journal').data.at(-1);assert.equal(j[4],'Pending');assert.equal(f.post('saveData',request).data.saved,true);assert.equal(f.sheets.get('contacts').data.filter(r=>r[17]===item.id).length,1);assert.equal(f.sheets.get('contact_save_journal').data.length,2);assert.equal(f.getHeld(),false);
}
// Fresh Admin authorization, short busy-writer response and intact journal on
// conflicting changes or a damaged original payload.
{
 const f=fixture(),key=f.seedPending([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Changed'}]);
 f.setBusy(true);assert.equal(f.post('saveReceipt',key).data.writing,true);assert.equal(f.post('recoverSave',key).code,'CONTACTS_BUSY');f.setBusy(false);
 assert.equal(f.post('saveReceipt',key,'kp@gsps.edu.sg').status,403);assert.equal(f.post('saveReceipt',{...key,digest:'bad'},'other-admin@gsps.edu.sg').status,409);
 f.sheets.get('admin_users').data[2][2]='N';assert.equal(f.post('saveReceipt',key,'other-admin@gsps.edu.sg').status,403);f.sheets.get('admin_users').data[2][2]='Y';
 f.sheets.get('contacts').data[2][5]='Someone else changed this';assert.equal(f.post('recoverSave',key).status,409);assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[4],'Pending');
 f.sheets.get('contact_save_journal').data.at(-1)[6]='[]';assert.equal(f.post('saveReceipt',key).status,409);assert.equal(f.post('recoverSave',key).status,409);assert.equal(f.post('saveData',{requestId:key.requestId,changes:[{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Changed'}]}).status,409);
 assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[4],'Pending');assert.equal(f.getHeld(),false);
}
// Multiple additions beyond the available template rows grow safely and reserve
// different IDs in a single batch rather than flushing one row at a time.
{
 const f=fixture(),items=Array.from({length:3},(_,i)=>{const a=addition();a.values['Basic Name']+=' '+i;a.values['iCON Alias (@moe.edu.sg)']+=i;a.values['CES Alias (@schools.gov.sg)']+=i;return a;});const r=f.post('saveData',{requestId:crypto.randomUUID(),changes:[],additions:items});assert.equal(r.data.saved,true);assert.equal(new Set(f.sheets.get('contacts').data.slice(182).filter(x=>x[17]).map(x=>x[17])).size,3);assert.equal(f.stats.flush,1,'one expansion flush only');
}
// Old DIY journals omit the Google subject. A current Admin can complete the
// intact, restricted original Staff ID payload without rebinding another account.
{
 const f=fixture();const bindings=f.ctx.SpreadsheetApp.openById().insertSheet('contact_identity_bindings');bindings.appendRow(['Subject','Staff ID','Original email']);bindings.appendRow(['original-subject','staff-1','person1@gsps.edu.sg']);
 f.ctx.seedPayload=[{id:'staff-1',field:'Mobile No',expected:'81234567',value:'87654321'}];f.run("var diyRequest=Utilities.getUuid();saveJournal_(SpreadsheetApp.openById(GSIS_SHEET),diyRequest,'person1@gsps.edu.sg','diy',seedPayload).begin()");
 const journal=f.sheets.get('contact_save_journal').data.at(-1),key={requestId:journal[0],digest:journal[3]},before=JSON.stringify(bindings.data);assert.equal(f.post('recoverSave',key).data.saved,true);assert.equal(f.sheets.get('contacts').data[2][6],'87654321');assert.equal(JSON.stringify(bindings.data),before);assert.equal(journal[1],'person1@gsps.edu.sg');assert.equal(journal[4],'Applied');
}
// Editor helper respects the same payload and permission checks; API preparation
// is read-only and remains usable while a request is pending.
{
 const f=fixture(),key=f.seedPending({changes:[],additions:[addition()]});f.reset();assert.equal(f.run('prepareContactsPerformance502().pending'),1);assert.equal(f.stats.writes.length,0);assert.equal(f.run('recoverContactsSave502().saved'),true);assert.equal(f.run('recoverContactsSave502().unchanged'),true);assert.equal(f.stats.flush,0);
 f.sheets.get('admin_users').data[1][2]='N';assert.throws(()=>f.run('recoverContactsSave502()'),e=>e.status===403);assert.equal(f.post('saveReceipt',key).data.saved,true,'original editor may still confirm a receipt after access revocation');
}
console.log('PASS 502 Contacts: reported addition shape, zero routine API flushes, one source batch, atomic completion ordering, lost acknowledgement, reserved-ID and partial replay, receipts during pending recovery, fresh Admin access, conflicts, payload integrity, multiple additions and editor recovery.');
