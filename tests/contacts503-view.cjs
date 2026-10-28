const assert=require('assert/strict'),crypto=require('crypto'),fixture=require('./contacts503-fixture.js');
const addition=()=>({id:'contact-'+crypto.randomUUID(),values:{'Basic Name':'New AE','Statutory Name':'Ms New AE','iCON Alias (@moe.edu.sg)':'new_ae','CES Alias (@schools.gov.sg)':'new_ae','GSPS Alias (@gsps.edu.sg)':'','Mobile No':'81234567',Role:'AE','Employment Modifier':'AE',Active:'Y'}});
const edit=()=>[{id:'staff-1',field:'Statutory Name',expected:'Person 1',value:'Changed legal name'},{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Changed name'},{id:'staff-1',field:'Mobile No',expected:'81234567',value:'87654321'}];
function readOnly(f,action,input={},actor='admin@gsps.edu.sg'){
 f.reset();const props=JSON.stringify([...f.props]),sheets=JSON.stringify([...f.sheets].map(([n,s])=>[n,s.data,s.formulas]));
 const result=f.post(action,input,actor);
 assert.equal(result.ok,true,action+': '+JSON.stringify(result));assert.equal(f.stats.flush,0,action+' must not flush');assert.equal(f.stats.nativeWrites,0,action+' must not write natively');assert.deepEqual(f.stats.writes,[],action+' must not write through the API');assert.deepEqual(f.stats.lockAttempts,[],action+' must not wait for a writer');assert.equal(JSON.stringify([...f.props]),props,action+' must not change pending properties');assert.equal(JSON.stringify([...f.sheets].map(([n,s])=>[n,s.data,s.formulas])),sheets,action+' must not mutate a source');return result.data;
}
// Old releases have no before-image. A cold ordinary school account can still
// read every unaffected contact while the legacy addition remains unconfirmed.
{
 const f=fixture(),item=addition(),key=f.seedPending({changes:[],additions:[item]});
 const contacts=f.sheets.get('contacts');contacts.data[182]=f.headers.map(k=>k==='Staff ID'?item.id:item.values[k]||'');
 f.props.delete('CONTACTS_PENDING_V2');f.setBusy(true);
 for(const actor of ['person2@gsps.edu.sg','admin@gsps.edu.sg']){
  const data=readOnly(f,'bootstrap',{},actor);assert.equal(data.people.length,181);assert.equal(data.people.some(p=>p.id===item.id),false);assert.equal(data.viewState.pending,true);assert.equal(data.viewState.source,'legacy');assert.equal(data.people.find(p=>p.id==='staff-1').mobile,'81234567');
 }
 assert.equal(readOnly(f,'data').editable,false);assert.equal(readOnly(f,'membership').editable,false);assert.equal(readOnly(f,'sysFields').editable,false);assert.equal(readOnly(f,'diy',{},'person2@gsps.edu.sg').editable,false);
 assert.equal(readOnly(f,'deploySnapshot',{readOnly:true}).people.some(p=>p.id===item.id),false);
 const authority=readOnly(f,'deploySnapshot',{authorityOnly:true});assert.deepEqual(authority.user.roles,['Admin']);
 f.setBusy(false);assert.equal(f.post('saveData',{requestId:crypto.randomUUID(),changes:edit()}).code,'CONTACTS_RECOVERY_REQUIRED');
 assert.equal(f.sheets.get('contact_save_journal').data.at(-1)[4],'Pending');assert.equal(key.requestId,f.sheets.get('contact_save_journal').data.at(-1)[0]);
}
// New saves retain the entire prior source. All selected profile fields and
// lists remain coherent even if a field write completes before Applied.
for(const gzip of [true,false]){
 const f=fixture({gzip}),before=readOnly(f,'bootstrap',{},'person1@gsps.edu.sg').people,request={requestId:crypto.randomUUID(),changes:edit(),additions:[]};
 f.setMode('partial');const failed=f.post('saveData',request);assert.equal(failed.ok,false);const journal=f.sheets.get('contact_save_journal').data.at(-1);assert.equal(journal[4],'Pending');assert.equal(JSON.parse(journal[9]).encoding,gzip?'gzip':'json');assert.notEqual(f.sheets.get('contacts').data[2][5],'Person 1','fixture actually changed the source before the failure');
 f.setBusy(true);const data=readOnly(f,'bootstrap',{},'person1@gsps.edu.sg');assert.equal(data.viewState.source,'saved');assert.deepEqual(data.people,before);
 const grid=readOnly(f,'data');assert.equal(grid.editable,false);const row=grid.rows.find(x=>x.id==='staff-1');assert.equal(row.values[grid.fields.indexOf('Basic Name')],'Person 1');assert.equal(row.values[grid.fields.indexOf('Mobile No')],'81234567');
 const own=readOnly(f,'diy',{},'person1@gsps.edu.sg');assert.equal(own.editable,false);assert.equal(own.rows[0].values[own.fields.indexOf('Statutory Name')],'Person 1');
 // Admin recovery payload can be damaged independently of the durable view.
 const original=journal[6];journal[6]='not valid JSON';assert.deepEqual(readOnly(f,'bootstrap',{},'person1@gsps.edu.sg').people,before);journal[6]=original;
 f.setBusy(false);assert.equal(f.post('saveData',request).data.saved,true);const applied=readOnly(f,'bootstrap',{},'person1@gsps.edu.sg');assert.equal(applied.people.find(x=>x.id==='staff-1').mobile,'87654321');assert.equal(applied.viewState,undefined);assert.equal(readOnly(f,'data').editable,true);assert.equal(f.post('saveReceipt',{requestId:request.requestId}).data.saved,true);
}
// Snapshot authority is never trusted: revoked Admin access takes effect on
// the very next request, while school directory viewing remains available.
{
 const f=fixture(),key=f.seedSnapshot(edit());f.sheets.get('admin_users').data[1][2]='N';f.setBusy(true);
 assert.deepEqual(readOnly(f,'bootstrap').user.roles,[]);const authority=readOnly(f,'deploySnapshot',{readOnly:true});assert.deepEqual(authority.user,{email:'admin@gsps.edu.sg',roles:[]});assert.equal(authority.people,undefined);
 assert.equal(f.post('data').status,403);assert.equal(f.post('membership').status,403);f.setBusy(false);assert.equal(f.post('recoverSave',key).status,403);
}
// Roles, options and contact values come from one old source image, including
// when no account has previously opened a browser or populated a read cache.
{
 const f=fixture(),book=f.ctx.SpreadsheetApp.openById(),options=book.insertSheet('sys_fields');options.appendRow(['Field','Value']);options.appendRow(['Employment Modifier','AE']);
 const prior=readOnly(f,'bootstrap').people;f.seedSnapshot(edit());f.sheets.get('roles').data[2][1]='Unconfirmed role';f.sheets.get('roles').data[2][10]='';options.data[1][1]='Unconfirmed option';f.setBusy(true);
 assert.deepEqual(readOnly(f,'bootstrap').people,prior);assert.equal(readOnly(f,'membership').rows.find(r=>r[0]==='AE')[1],'Allied Educator');assert.deepEqual(readOnly(f,'sysFields').lists['Employment Modifier'],['AE']);
 const deploy=readOnly(f,'deploySnapshot',{readOnly:true});assert.equal(deploy.membership.rows.find(r=>r[0]==='AE')[1],'Allied Educator');
}
// Absence is also part of a before-image. Creating an options sheet during a
// pending catalogue save must not make its unconfirmed values visible.
{
 const f=fixture();f.seedSnapshot(edit());const options=f.ctx.SpreadsheetApp.openById().insertSheet('sys_fields');options.appendRow(['Field','Value']);options.appendRow(['Employment Modifier','Unconfirmed option']);f.setBusy(true);
 assert.deepEqual(readOnly(f,'sysFields').lists['Employment Modifier'],['AE']);
}
// A legacy edit or damaged before-image hides only touched identities. An
// unrelated person's mobile and all other records remain accessible.
for(const damagedView of [false,true]){
 const f=fixture();if(damagedView){f.seedSnapshot(edit());f.sheets.get('contact_save_journal').data.at(-1)[10]='broken';}else f.seedPending(edit());
 f.sheets.get('contacts').data[2][6]='11111111';f.setBusy(true);const data=readOnly(f,'bootstrap',{},'person2@gsps.edu.sg');assert.equal(data.people.length,180);assert.equal(data.people.some(p=>p.id==='staff-1'),false);assert.equal(data.people.find(p=>p.id==='staff-2').mobile,'81234567');assert.equal(data.viewState.hiddenRecords,1);
}
// New additions stay invisible through both reserved-ID and partial-field
// interruptions; an Applied result is immediately visible even if the reply
// was lost and the pending property has not yet been cleared.
for(const mode of ['reserve','partial','lostAck']){
 const f=fixture(),item=addition(),request={requestId:crypto.randomUUID(),changes:[],additions:[item]};f.setMode(mode);assert.equal(f.post('saveData',request).ok,false);f.setBusy(true);
 const data=readOnly(f,'bootstrap',{},'person2@gsps.edu.sg');assert.equal(data.people.filter(p=>p.id===item.id).length,mode==='lostAck'?1:0);if(mode==='lostAck')assert.equal(data.viewState,undefined);else assert.equal(data.viewState.source,'saved');
}
// A corrupt legacy payload cannot identify which current fields are safe. It
// must never expose that partial source merely because no backup is usable.
for(const marker of ['valid','invalid JSON','null','["invalid"]']){
 const f=fixture();f.seedPending(edit());f.sheets.get('contact_save_journal').data.at(-1)[6]='corrupted original payload';f.sheets.get('contacts').data[2][6]='11111111';
 if(marker!=='valid')f.props.set('CONTACTS_PENDING_V2',marker);f.setBusy(true);
 const result=readOnly(f,'bootstrap',{},'person2@gsps.edu.sg');assert.equal(result.viewState.source,'unavailable');assert.deepEqual(result.people,[]);assert.equal(readOnly(f,'data').editable,false);assert.deepEqual(readOnly(f,'deploySnapshot',{readOnly:true}).people,[]);
}
// A verified earlier Applied before-image is preferred to unknown current
// fields, even when the newer pending original payload cannot be decoded.
{
 const f=fixture();f.seedSnapshot(edit());f.sheets.get('contact_save_journal').data.at(-1)[4]='Applied';f.props.set('CONTACTS_PENDING_V2','{}');
 f.sheets.get('contacts').data[2][6]='87654321';f.seedPending(edit());f.sheets.get('contact_save_journal').data.at(-1)[6]='broken';f.sheets.get('contacts').data[3][6]='11111111';f.setBusy(true);
 const result=readOnly(f,'bootstrap',{},'person2@gsps.edu.sg');assert.equal(result.viewState.source,'saved');assert.ok(result.viewState.asOf);assert.equal(result.people.length,181);assert.equal(result.people.find(p=>p.id==='staff-1').mobile,'81234567');assert.equal(result.people.find(p=>p.id==='staff-2').mobile,'81234567');
}
// A usable migration backup preserves staff fields, while unverified current
// role and option catalogues cannot alter names or disclose partial metadata.
{
 const f=fixture();f.sheets.get('backup').data=JSON.parse(JSON.stringify(f.sheets.get('contacts').data));f.seedPending(edit());f.sheets.get('contact_save_journal').data.at(-1)[6]='broken';f.sheets.get('contacts').data[2][6]='11111111';f.sheets.get('roles').data[2][1]='Unconfirmed role';f.setBusy(true);
 const result=readOnly(f,'bootstrap',{},'person2@gsps.edu.sg');assert.equal(result.viewState.source,'backup');assert.equal(result.people.length,181);assert.equal(result.people.find(p=>p.id==='staff-1').mobile,'81234567');assert.equal(result.people.find(p=>p.id==='staff-0').formalRole,'');
}
// Sustained concurrent marker changes exhaust a bounded three attempts. The
// fourth build is pinned to a verified source and refreshes current authority.
for(const historical of [false,true]){
 const f=fixture();if(historical){f.seedSnapshot(edit());f.sheets.get('contact_save_journal').data.at(-1)[4]='Applied';f.props.set('CONTACTS_PENDING_V2','{}');}
 f.sheets.get('contacts').data[2][6]='11111111';
 f.ctx.revokeNow=()=>{f.sheets.get('admin_users').data[1][2]='N';};
 f.run("var testViewMarkers=0;contactViewMarker_=function(){testViewMarkers++;if(testViewMarkers===6)revokeNow();return String(testViewMarkers)}");
 f.reset();const result=f.post('bootstrap');assert.equal(result.ok,true);assert.equal(f.run('testViewMarkers'),6);assert.deepEqual(result.data.user.roles,[],'fallback checks the newly revoked authority');assert.equal(result.data.viewState.source,historical?'saved':'unavailable');assert.equal(result.data.people.length,historical?181:0);assert.equal(result.data.people.some(p=>p.mobile==='11111111'),false);assert.equal(f.stats.flush,0);assert.equal(f.stats.nativeWrites,0);assert.deepEqual(f.stats.writes,[]);assert.deepEqual(f.stats.lockAttempts,[]);
}
// An invalid sys_fields table is rejected even when the envelope digest was
// recomputed. Shape validation is independent of checksum validation.
{
 const f=fixture();f.run("var badView=contactViewCapture_(SpreadsheetApp.openById(GSIS_SHEET));badView.tables.sys_fields=[['Field','Value'],['Role',123]];var badViewPack=contactViewPack_(badView,'snapshot-test')");
 assert.throws(()=>f.run("contactViewUnpack_(badViewPack,'snapshot-test')"),/Invalid saved source/);
}
console.log('PASS 503 Contacts viewing: cold school and Admin login during a busy writer, zero read writes/locks/flushes, coherent gzip/JSON before-images, current permissions, legacy additions/edits, corrupt payload and marker fallback, bounded concurrent reads, historical snapshot and backup recovery, invisible unconfirmed additions and Applied visibility.');
