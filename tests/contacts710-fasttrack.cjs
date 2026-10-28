const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),fixture=require('./contacts503-fixture');
const uid=()=>crypto.randomUUID(),fresh=(f,p)=>f.post('rosterContactCreate',{name:'New relief teacher',mobile:'91234567',requestId:uid(),...p});
function setRow(f,index,values){const s=f.sheets.get('contacts'),h=s.data[0];for(const [k,v] of Object.entries(values))s.data[index][h.indexOf(k)]=v;}
{
 const f=fixture(),before=JSON.stringify(f.sheets.get('contacts').data);
 for(const mobile of ['', '12345678', '999', '+65abcdef12'])assert.equal(fresh(f,{mobile}).status,400);
 assert.equal(JSON.stringify(f.sheets.get('contacts').data),before,'Required mobile checks do not write');
 const p={name:'Visiting Teacher',mobile:'+65 9123-4567',modifier:'Morning cover',requestId:uid()},out=fresh(f,p);
 assert.equal(out.data.saved,true);assert.equal(out.data.person.name,'Visiting Teacher (Morning cover)');assert.equal(out.data.person.employment,'Morning cover');assert.equal(out.data.person.active,false);assert.equal(out.data.person.adhocEligible,true);
 const row=f.sheets.get('contacts').data.find(r=>r[17]===out.data.person.id);assert.equal(row[13],'Morning cover');assert.equal(row[14],'','Custom modifier is not hidden in Subject Modifier');
 f.reset();assert.equal(fresh(f,p).data.duplicate,true);assert.equal(f.stats.writes.length,0);
 assert.equal(fresh(f,{...p,requestId:uid(),name:'Different teacher',modifier:'Different'}).data.blocked,true,'Custom suffix cannot bypass mobile duplicate');
 assert.equal(fresh(f,{...p,requestId:uid(),name:'  visiting   TEACHER  ',mobile:'92345678'}).data.blocked,true,'Canonical full TTb name blocks duplication');
 const second=fresh(f,{name:'Other visitor',mobile:'93456789'});assert.equal(second.data.person.name,'Other visitor (SRE)');
 const conflict=fresh(f,{name:'Visiting Teacher',modifier:'Morning cover',mobile:'93456789'}).data;assert.equal(conflict.blocked,true);assert.equal(conflict.conflict,true);assert.equal(conflict.duplicates.length,2);
}
{
 const f=fixture();setRow(f,2,{'Basic Name':'Inactive relief','Employment Modifier':'FAJT','Mobile No':'+65 9234 5678',Active:'N','CES Alias (@schools.gov.sg)':'same','GSPS Alias (@gsps.edu.sg)':'same'});
 const found=fresh(f,{name:'Another person',mobile:'92345678'}).data;assert.equal(found.duplicates[0].active,false);assert.equal(found.duplicates[0].employment,'FAJT');assert.equal(found.duplicates[0].adhocEligible,true);
 const internal=f.post('deploySnapshot',{rosterDirectory:true,rosterAuthority:true,authorityOnly:true}).data.rosterPeople.find(p=>p.id==='staff-1');assert.deepEqual(internal.emails,['same@schools.gov.sg','same@gsps.edu.sg']);
 for(const role of ['SL','OSO','Support','SAT','MK']){setRow(f,2,{Role:role});assert.equal(f.post('deploySnapshot',{rosterDirectory:true,rosterAuthority:true,authorityOnly:true}).data.rosterPeople.find(p=>p.id==='staff-1').adhocEligible,false,role);}
}
{
 const source="PropertiesService.getScriptProperties().setProperty('CONTACTS_SHEET_ID','blank_contacts_sheet_710');\n"+fs.readFileSync('Contacts_Code.gs','utf8'),f=fixture({source});
 f.props.set('ADMIN_EMAIL','admin@gsps.edu.sg');assert.throws(()=>f.run('setupBlankContacts()'),/empty spreadsheet/,'Never reset an existing workbook');
 f.sheets.clear();const result=f.run('setupBlankContacts()');assert.equal(result.ready,true);assert.equal(result.spreadsheet,'blank_contacts_sheet_710');
 assert.deepEqual([...f.sheets.keys()],['contacts','roles','admin_users','sys_fields','offload']);assert.equal(f.sheets.get('contacts').data.length,2);assert.equal(f.sheets.get('admin_users').data[1][0],'admin@gsps.edu.sg');
 f.reset();assert.equal(f.run('setupBlankContacts()').ready,true);assert.equal(f.stats.nativeWrites,0,'Completed setup is read-only on retry');
 f.props.set('ADMIN_EMAIL','someone@other.example');assert.throws(()=>f.run('setupBlankContacts()'),/ADMIN_EMAIL/);
}
{
 const f=fixture();f.props.set('CONTACTS_SHEET_ID','blank_contacts_retry_710');f.props.set('ADMIN_EMAIL','admin@gsps.edu.sg');f.sheets.clear();
 const book=f.ctx.SpreadsheetApp.openById('fixture'),insert=book.insertSheet;book.insertSheet=name=>{if(name==='admin_users')throw Error('Interrupted setup');return insert(name);};
 assert.throws(()=>f.run('setupBlankContacts()'),/Interrupted setup/);const staff=f.sheets.get('contacts').data[1][17];book.insertSheet=insert;
 assert.equal(f.run('setupBlankContacts()').ready,true);assert.equal(f.sheets.get('contacts').data[1][17],staff,'A setup retry preserves the first identity');
}
console.log('PASS 710 Contacts: required mobile, provisional modifier, canonical name/mobile conflicts, stable exact retry, authoritative eligibility/emails, guarded blank setup.');
